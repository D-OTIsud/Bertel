# Universal AI Data Ingestor (Deterministic Dependency-First)

Application FastAPI + Streamlit pour ingestion omnicanale, mapping IA structure, transformation Pandas en masse, deduplication (exact + fuzzy), et commit vers `public` sur Supabase.

Le flux inclut maintenant un **Discovery Agent** pre-ingest: profilage des feuilles, inference de mapping, hypotheses de relations inter-feuilles et gate de revue stricte.

## Invariant de commit (obligatoire)

- Le LLM mappe les champs et detecte les entites candidates, mais **ne decide jamais** de l'ordre d'ecriture SQL.
- Le systeme **n'insere jamais** un enregistrement dependant si ses dependances n'existent pas en `public`.
- L'ordre de commit est fixe et deterministe, y compris sur base vide:
  1. referentiels autorises (`ref_*`)
  2. organisations (`object` type `ORG`)
  3. objets metier (`object`)
  4. sous-objets dependants (`object_location`, `contact_channel`, ...)
  5. relations et enrichissements finaux (`object_org_link`, classifications, amenites, moyens de paiement)
- Toute creation non autorisee par politique est bloquee ou envoyee en revue humaine.

## Structure

- `api/main.py` : endpoint ingest + orchestration asynchrone (`202 Accepted`)
- `ui/app.py` : upload manuel et validation des lignes staging
- `core/` : moteur ETL, mapping IA (LangGraph), pipeline media URL->bucket, schemas Pydantic, client Supabase
- `sql/staging_ingestor.sql` : schema/tables staging pour imports
- `sql/staging_v2_tables.sql` : tables staging additionnelles
- `sql/staging_v3_tables.sql` : miroir exhaustif des tables manquantes du schema unifie pour le mapping manuel

## Prerequis

1. Copier `.env.example` vers `.env` et renseigner les variables.
2. Creer le bucket Supabase Storage `raw_imports` (ou ajuster `RAW_IMPORT_BUCKET`).
3. Executer la migration SQL:

```sql
\i sql/staging_ingestor.sql
\i sql/staging_v2_tables.sql
\i sql/staging_v3_tables.sql
```
4. Verifier la migration et la securite:

```sql
\i sql/preflight_migration_checks.sql
\i sql/security_audit_checks.sql
```

5. Exposer le schema `staging` dans Supabase Data API (obligatoire pour l'UI Streamlit):
   - Supabase Dashboard -> `Project Settings` -> `API` -> `Exposed schemas`
   - Ajouter `staging` (exemple: `public, graphql_public, staging`)
   - Sauvegarder puis relancer/redeployer l'application

   Si `staging` n'est pas expose, l'UI echoue avec:
   - `PGRST106`
   - `Invalid schema: staging`
   - `Only the following schemas are exposed: public, graphql_public`

6. (Optionnel mais recommande) S'assurer que `service_role` a les droits SQL sur `staging`:

```sql
GRANT USAGE ON SCHEMA staging TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA staging TO service_role;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA staging TO service_role;

ALTER DEFAULT PRIVILEGES IN SCHEMA staging
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO service_role;

ALTER DEFAULT PRIVILEGES IN SCHEMA staging
GRANT USAGE, SELECT ON SEQUENCES TO service_role;
```

## Run (Docker Compose)

```bash
docker compose up -d --build
```

Le `docker-compose.yml` est maintenant configure pour un usage prod simple:
- `vector-db` n'expose aucun port sur l'hote
- `api` et `ui` redemarrent automatiquement avec `restart: unless-stopped`
- `APP_ENV=production` est force pour activer la validation stricte des secrets au demarrage
- `api` et `ui` sont bindes sur `127.0.0.1` par defaut
- la base pgvector est interne au reseau Docker et l'API utilise directement `postgresql://postgres:postgres@vector-db:5432/bertel_vectors`
- un service `vector-prewarm` precharge les embeddings semantiques du schema cible avant que l'API ne serve les premieres requetes

Tu peux exposer explicitement l'API ou l'UI en changeant `API_BIND_IP`, `UI_BIND_IP`, `API_PORT` et `UI_PORT` si tu ne passes pas par un reverse proxy.

## Connexion et authentification

Configuration runtime:
- Variables dans `.env`, chargees par `docker-compose.yml`
- Sur Coolify: variables dans l'UI Coolify (section Environment Variables), puis redeploy

Variables minimales a renseigner:
- `API_BASE_URL`: URL de l'API vue par l'UI (ex: `http://api:8000` en reseau Docker interne)
- `API_BEARER_TOKEN`: token unique pour toutes les requetes API (`Authorization: Bearer ...`)
- `SUPABASE_URL`: URL projet Supabase (`https://<project-ref>.supabase.co`)
- `SUPABASE_SERVICE_KEY`: cle serveur Supabase (service role / secret backend selon compatibilite client)

Variables avancees utiles pour le mapping IA:
- `MIN_CONFIDENCE_THRESHOLD`: seuil sous lequel la confiance globale du workbook passe en `mapping_review_required`
- `MIN_SHEET_CONFIDENCE_THRESHOLD`: seuil minimum par feuille; une seule feuille fragile suffit a declencher la revue humaine
- `API_BIND_IP` / `UI_BIND_IP` / `API_PORT` / `UI_PORT`: utiles si tu veux ajuster les bindings reseau

## Ordre d'utilisation UI (workflow recommande)

1. `Upload`: envoyer le fichier avec `organization_object_id` obligatoire.
   - Le mode "Select from database" permet de rechercher et selectionner une organisation existante (`object_type='ORG'`) sans connaitre l'ID exact.
   - Le mode "Enter manually" reste disponible si vous n'avez pas d'acces DB depuis l'UI.
   - Le `batch_id` accepte est automatiquement conserve comme contexte actif.
2. `Discovery Review`: fetch du contrat et approbation mapping.
   - Vous pouvez selectionner le batch depuis la liste des batches recents (ou saisir manuellement).
   - Les lignes de mapping sont maintenant editables inline (target table/column/transform) avec decision par ligne (`approve`/`reject`) sans passer par un formulaire separe.
3. `Batches`: dedup -> resolve dependencies -> run ETL -> commit approved.
   - Meme batch context reutilise automatiquement, avec liste des batches recents.
4. `Staging Review`: controle manuel des lignes bloquees / medias en revue.
   - Option de filtrage direct sur le batch context actif.

Important:
- Tant que le mapping est `review_required`, `Run ETL` et `Commit` retournent `409 Conflict` (comportement attendu).

## API

### POST `/api/v1/ingest`

- Auth: `Authorization: Bearer <API_BEARER_TOKEN>`
- Entrees:
  - query param obligatoire: `organization_object_id=<ORG_ID>`
  - query param optionnel: `organization_name=<Nom Organisation>`
  - `multipart/form-data` avec `upload_file` (CSV/JSON/XML/XLSX), ou
  - body brut JSON/XML/CSV
- Limite taille payload: `INGEST_MAX_BYTES` (retour `413` si depassee)
- Reponse: `202` logique (endpoint retourne payload d'acceptation + traitement async)
- Comportement strict gate:
  - genere un contrat discovery/mapping
  - met le batch en `mapping_review_required` ou `mapping_approved`
  - l'ETL ne demarre pas tant que le mapping n'est pas approuve

