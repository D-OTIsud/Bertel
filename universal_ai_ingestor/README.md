# Universal AI Data Ingestor (Deterministic Dependency-First)

Application FastAPI + Streamlit pour ingestion omnicanale, mapping IA structuré, transformation Pandas en masse, déduplication (exact + fuzzy), et commit vers `public` sur Supabase.

Le flux inclut maintenant un **Discovery Agent** pre-ingest: profilage des feuilles, inférence de mapping, hypothèses de relations inter-feuilles et gate de revue stricte.

## Invariant de commit (obligatoire)

- Le LLM mappe les champs et détecte les entités candidates, mais **ne décide jamais** de l'ordre d'ecriture SQL.
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
- `core/` : moteur ETL, mapping IA (LangGraph), pipeline média URL->bucket, schémas Pydantic, client Supabase
- `sql/staging_ingestor.sql` : schéma/tables staging pour imports

## Prérequis

1. Copier `.env.example` vers `.env` et renseigner les variables.
2. Créer le bucket Supabase Storage `raw_imports` (ou ajuster `RAW_IMPORT_BUCKET`).
3. Exécuter la migration SQL:

```sql
\i sql/staging_ingestor.sql
```

4. Vérifier la migration et la sécurité:

```sql
\i sql/preflight_migration_checks.sql
\i sql/security_audit_checks.sql
```

## Run local (Docker Compose)

```bash
docker compose up --build
```

- API: `http://localhost:8000`
- UI: `http://localhost:8501`

## API

### POST `/api/v1/ingest`

- Auth: `Authorization: Bearer <API_BEARER_TOKEN>`
- Entrées:
  - query param obligatoire: `organization_object_id=<ORG_ID>`
  - query param optionnel: `organization_name=<Nom Organisation>`
  - `multipart/form-data` avec `upload_file` (CSV/JSON/XML/XLSX), ou
  - body brut JSON/XML/CSV
- Réponse: `202` logique (endpoint retourne payload d'acceptation + traitement async)
- Comportement strict gate:
  - génère un contrat discovery/mapping
  - met le batch en `mapping_review_required` ou `mapping_approved`
  - l'ETL ne démarre pas tant que le mapping n'est pas approuvé

### POST `/api/v1/ingest/discover`

Alias explicite de l’endpoint d’ingestion discovery-first.
Les mêmes paramètres d'organisation (`organization_object_id`, `organization_name`) sont requis.

### GET `/api/v1/ingest/{batch_id}/discovery`

Retourne le dernier contrat discovery: champs proposés, cibles inférées, hypothèses de relation et statut global.

### POST `/api/v1/ingest/{batch_id}/mapping/approve`

Approuve le contrat (ou les propositions) et passe le lot en `mapping_approved`.

### POST `/api/v1/ingest/{batch_id}/mapping/reject`

Rejette une proposition de mapping (champ/relation), maintient le lot en revue manuelle.

### POST `/api/v1/ingest/{batch_id}/run-etl`

Déclenche l’ETL uniquement si le contrat de mapping est approuvé.

### GET `/api/v1/ingest/{batch_id}`

Retourne l'état du batch (`received`, `profiling`, `mapping`, `transforming`, `staging_loaded`, `failed`).
Inclut aussi `sheet_progress` (compteurs par feuille pour les imports Excel multi-feuilles).

### POST `/api/v1/ingest/{batch_id}/deduplicate`

Lance le moteur de déduplication:
- exact match: `object_external_id`, email, téléphone
- fuzzy match: `pg_trgm` (`similarity`) + `PostGIS` (`ST_DWithin`)

### POST `/api/v1/ingest/{batch_id}/commit`

Applique les lignes `is_approved = true` vers le schéma `public` via `api.commit_staging_to_public`.
Guardrails actifs:
- re-commit interdit (`409` si batch déjà commité/immutable)
- ledger de commit enregistré pour rollback compensatoire
- médias `ready_for_commit` committés de façon idempotente

### POST `/api/v1/ingest/{batch_id}/resolve-dependencies`

Execute la phase explicite de resolution des dependances du lot (`staging.resolve_batch_dependencies`) et retourne un rapport (`resolved`, `requires_review`, `blocked`).

### GET `/api/v1/ingest/{batch_id}/integrity`

Execute les assertions SQL d'integrite du lot (dependances manquantes + orphelins staging).

### POST `/api/v1/ingest/{batch_id}/purge`

Purge un lot en etat terminal (`committed`, `failed_permanent`) ou force si `force=true`.

### POST `/api/v1/ingest/{batch_id}/media/process`

Traite les URLs média staging:
- download HTTPS sécurisé (allowlist optionnelle, taille max, timeout)
- upload dans bucket final (`MEDIA_BUCKET`)
- score IA/gouvernance semi-auto (`auto_ready`, `review_required`, `blocked_low_confidence`)

### POST `/api/v1/ingest/{batch_id}/media/{import_media_id}/review`

Validation humaine d’un media (`approve=true/false`) avec traçabilité reviewer.

### POST `/api/v1/ingest/{batch_id}/rollback`

Rollback compensatoire piloté par ledger (`api.rollback_staging_batch_compensate`).

### GET `/api/v1/metrics`

Retourne les metriques operationnelles agregees:
- batches par statut
- evenements/erreurs 24h
- medias par statut + backlog review + echec download
- backlog ambiguite relations implicites
- compteurs de gouvernance IA

### GET `/api/v1/ops/cron-health`

Expose la santé scheduler (`pg_cron` disponible, nombre de jobs, dernier run).

### POST `/api/v1/ops/media/retry-failed`

Réarme les médias `download_failed` vers `pending_download` pour reprise.

### POST `/api/v1/ops/watchdog/stale-batches`

Watchdog ops: marque les lots ETL bloqués trop longtemps en `failed_permanent`.

### POST (SQL RPC) `api.purge_expired_staging_batches`

Purge en lot les batches terminaux expires (`retention_until < now()`), sans utiliser `force=true`.

## Notes

- Le commit implémente une trajectoire robuste minimale (insert/update objet + localisation principale + external_id).
- Organisation obligatoire a l'ingestion: chaque batch doit fournir `organization_object_id`.
- Priorité d'affectation organisation: `source_org_object_id`/`org_name` présent dans la ligne import > organisation sélectionnée au démarrage du batch.
- Gate strict: dedup/resolve/media/commit refusent (`409`) tant que le mapping contract n'est pas `approved`.
- Le registre en memoire est un cache local; la source durable de verite est `staging.import_batches` + `staging.import_events`.
- La logique de creation auto est pilotee par `staging.import_creation_policy`.
- Les retries ETL sont bornes (config via `ETL_MAX_ATTEMPTS`, `ETL_RETRY_BACKOFF_SECONDS`).
- Les batches en echec terminal passent en `failed_permanent` (dead-letter).
- Les conflits idempotence sont stricts: même clé + hash différent => `409`.
- La purge de retention est manuelle par defaut (`sql/scheduled_purge_job.sql`) et peut etre planifiee via scheduler.
- Les colonnes multi-valeurs sont interpretees avec separateurs `|`, `,` et `;` (plus JSON list).

## Exploitation

- Runbook go-live: `docs/GO_LIVE_RUNBOOK.md`
- Dry-run checklist: `docs/DRY_RUN_CHECKLIST.md`
- Monitoring: `docs/MONITORING_ALERTS.md`
- Rollback runbook: `docs/ROLLBACK_RUNBOOK.md`
- Seuils Go/No-Go: `docs/GO_NO_GO_THRESHOLDS.md`
- Sign-off: `docs/CUTOVER_SIGNOFF_TEMPLATE.md`
- Benchmark script: `scripts/benchmark_ingestor.py`
- Preflight script: `scripts/preflight_check.py`
- Dry-run script: `scripts/dry_run_ingestor.py`
