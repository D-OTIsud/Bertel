# Plan d'application des correctifs API — Bertel 3.0

**Date** : 2026-06-30 · **Source** : `2026-06-30-api-db-coverage-audit.md`
**Contrainte n°1 du PO** : *ne casser aucun accès nécessaire au front.*

> Ce plan est **fondé sur des preuves de reconnaissance**, pas sur des suppositions : inventaire exhaustif des appels du front (RPC, lectures `ref_*`, Storage), chasse adversariale aux accès **indirects**, et vérifications live (dont une bascule de vue testée en transaction + `ROLLBACK`). Chaque correctif liste : **objectif · changement exact · garde-fou front (ce qui ne doit PAS casser + comment on le vérifie) · rollback · vérification · effort·risque.**

---

## 0. Garde-fous front transverses (la liste à NE JAMAIS casser)

Tout correctif ci-dessous est conçu pour préserver ces accès, prouvés utilisés par le front :

| Catégorie | À préserver | Preuve |
|---|---|---|
| **14 RPC anon** | `list_object_resources_filtered_page`, `list_object_markers`, `get_object_resource`, `get_object_with_deep_data`, `get_dashboard_filter_options`, `get_public_branding`, `get_app_branding` (7 lectures publiques) + `current_user_can_edit_objects`, `user_can_create_object`, `current_user_active_org`, `current_user_admin_rank`, `current_user_admin_role_code`, `current_user_org_id`, `can_write_object_private_notes` (7 sondes bootstrap) | recon rpcInv (96 noms front, `missed_rpcs=[]`) |
| **Helpers d'autorisation anon** | `user_can_*`, `can_read_*`, `current_user_*_ids`, `i18n_pick`, `strip_markdown`… doivent rester **EXECUTE pour anon** — gotcha P0.3 : un SELECT direct PostgREST échoue `permission denied for function` si le rôle lecteur ne peut pas évaluer le prédicat de la policy | CLAUDE.md §P0.3/§38 |
| **22 catalogues `ref_*` anon-SELECT** | `ref_code`, `ref_code_domain_registry`, `ref_classification_value/scheme`, `ref_language`, `ref_amenity`, `ref_tag`, `ref_capacity_metric/applicability`, `ref_sustainability_action(_category)`, `ref_contact_role`, `ref_org_role`, `ref_actor_role`, `ref_legal_type`, `ref_iti_assoc_role`, `ref_facet_applicability`, `ref_commune`, `ref_document` (+ `ref_org_business_role`/`ref_org_admin_role`/`ref_permission` en authentifié) | recon tableInv |
| **~15 facettes écrites en PostgREST direct** (authentifié as-caller, gated `canonical_*`) | `object_room_type(+_amenity/_media/_bed)`, `object_meeting_room(+meeting_room_equipment)`, `object_cuisine_type`, `object_menu(+item/_media/_dietary_tag/_allergen/_cuisine_type)`, `object_act`, `object_fma(+_occurrence)`, `object_classification`, `object_stay_policy`, `object_iti(+_practice)`, `object_taxonomy`, `object_place(+_description)` | recon tableInv |
| **7 `save_*` de re-dispatch modération** | `save_object_commercial`, `save_object_openings`, `save_object_workspace_sustainability`, `save_object_workspace_tags`, `save_object_relations`, `save_object_itinerary_nested`, `save_object_places` — doivent rester **EXECUTE pour authenticated** (le modérateur ré-invoque le writer whitelisté serveur dans `approve_pending_change`) | recon dyn |
| **`get_active_ai_provider_secret`** | doit rester **service-role only** (REVOKE anon ET authenticated — **déjà le cas en live, vérifié**) | recon rpcInv + live |

**Principe directeur (issu de la conception R1)** : *un prestataire externe ne parlera JAMAIS à PostgREST en direct.* Toute ouverture tierce passe par une nouvelle surface **`/api/public/*`** (Next.js, service-role, allowlist de RPC en dur). Conséquence : l'**anon** ne sert qu'au **front**, ce qui rend le durcissement des grants anon plus simple et plus sûr (cf. Q1).

---

## Phase 0 — Bloquants sécurité (applicables immédiatement, risque front nul à faible)

### R3 — Vues coverage `SECURITY DEFINER` → `security_invoker` *(fuite anon de brouillons)*
- **Objectif** : fermer la fuite — anon lit aujourd'hui 11 ids `draft` via `v_object_classification_coverage` / `v_object_classification_or_equivalent_scheme`.
- **Changement exact** (live + source) :
  ```sql
  ALTER VIEW public.v_object_classification_coverage SET (security_invoker = true);
  ALTER VIEW public.v_object_classification_or_equivalent_scheme SET (security_invoker = true);
  ```
  + **éditer la source** `migration_sustainability_v5.sql` (les 2 `CREATE … VIEW` lignes ~87/~107) pour les créer `WITH (security_invoker = true)` — sinon une ré-application (`CREATE OR REPLACE VIEW` ne conserve pas `reloptions`) **rouvre la fuite**. Ajouter une migration forward `migration_coverage_views_security_invoker.sql` au **runbook** (`docs/SQL_ROLLOUT_RUNBOOK.md`) pour les bases live existantes.
- **Garde-fou front** : **0 consommateur** (front : 0 `.from('v_…')` ; SQL : 0 RPC/vue dépendante ; seul usage doc = PMV-001 **POST-MVP non construit**). Vérifié empiriquement (transaction + `ROLLBACK`) : sous INVOKER, anon = 9 published / 0 draft, authentifié garde ses brouillons via l'arme `extended` héritée de la RLS sous-jacente. **Aucun gate §38 manuel nécessaire** (redondant).
- **Rollback** : `ALTER VIEW … SET (security_invoker = false);` (réversible immédiat).
- **Vérification** : en tant qu'anon, `SELECT count(*) FILTER (WHERE …status='draft')` via les 2 vues = 0 ; advisors `security_definer_view` disparaissent.
- **Effort·Risque** : **Quick · Nul** (mais discipline anti-dérive obligatoire : live **ET** source **ET** runbook).

### Q2 — Retrait du listing des buckets `media` / `documents`
- **Objectif** : empêcher l'énumération de tous les fichiers (dont médias d'objets non-publiés + certificats juridiques) par un appelant `.list()`.
- **Changement exact** (live + source) :
  ```sql
  DROP POLICY IF EXISTS "media_public_read"     ON storage.objects;
  DROP POLICY IF EXISTS "documents_public_read" ON storage.objects;
  ```
  + éditer `media_bucket.sql` (retirer le `CREATE POLICY "media_public_read"`) et `documents_bucket.sql` (idem). Conserver les policies RESTRICTIVE `*_no_anon_write` + `*_service_role_write`.
- **Garde-fou front** : les buckets sont **`public=true`** → `getPublicUrl()` sert les fichiers via le CDN **sans RLS** ; la policy SELECT ne servait QU'au `.list()`. Recon : **`.list()` = 0 occurrence** dans tout `src` ; le front n'utilise qu'`upload`/`getPublicUrl`/`remove` (le `remove` reconstruit le chemin depuis l'URL journalisée, jamais par listing). → affichage images/docs et sweep de suppression **intacts**.
- **Rollback** : recréer les 2 policies (`CREATE POLICY … FOR SELECT USING (bucket_id = '…')`).
- **Vérification** : en anon, `getPublicUrl` d'un fichier connu = OK ; `storage.from('media').list()` = refusé/vide ; advisors `public_bucket_allows_listing` disparaissent.
- **Effort·Risque** : **Quick · Nul.**
- **Différé (hors Q2, impact front réel)** : passer `documents` en **bucket privé + URLs signées** (les certificats juridiques ne devraient pas être servis en URL publique devinable). Nécessite de remplacer `getPublicUrl` par `createSignedUrl` dans `/api/document/upload` + à la lecture → sa propre passe.

### Q1a — Resserrage anon ciblé (denylist ops/admin) *(sous-ensemble SÛR du REVOKE)*
- **Objectif** : retirer d'`anon` les fonctions d'**exploitation/maintenance** exposées par grant trop large (le README recommande une allowlist ; on commence par le sous-ensemble sans risque).
- **Changement exact** : `REVOKE EXECUTE … FROM anon` (et `authenticated` si superuser-gated) sur les fonctions ops/staging/cron, p.ex. :
  `public.create_object_version_monthly_partition`, `api.capture_metric_snapshots`, `api.refresh_open_status`, `api.refresh_object_filter_caches`, `api.refresh_ref_code_taxonomy_closure`, `api.refresh_object_taxonomy_cache_for_domain`, `api.disable_cache_triggers`, `api.enable_cache_triggers`, `api.commit_staging_to_public`, `api.assert_staging_batch_integrity`, `api.resolve_staging_dependencies`, `api.run_staging_dedup`, `api.purge_staging_batch`, `api.purge_expired_staging_batches`, `api.rollback_staging_batch_compensate`, `api.retry_failed_media_downloads`, `api.watchdog_mark_stale_batches`, `api.get_ingestor_metrics`, `api.get_ingestor_scheduler_health`, `api.facet_applicability_violations`.
- **Garde-fou front** : **pré-vol obligatoire** — n'inclure un nom QUE s'il est (a) actuellement anon-exec ET (b) **absent des 96 RPC appelés par le front** (liste recon). Aucune de ces fonctions n'est dans les 96 (le front appelle dashboard/CRM/éditeur, pas l'ops). Requête de génération sûre :
  ```sql
  -- candidats = anon-exec + motif ops, à recouper avec la liste front
  SELECT n.nspname, p.proname
  FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname IN ('api','public')
    AND has_function_privilege('anon', p.oid, 'EXECUTE')
    AND p.proname ~ '^(capture_|refresh_|purge_|rollback_|run_staging|resolve_staging|assert_staging|watchdog_|retry_failed|disable_cache|enable_cache|commit_staging|get_ingestor|create_object_version_monthly)';
  ```
- **Rollback** : `GRANT EXECUTE … TO anon;` par nom.
- **Vérification** : ces fonctions ne sont plus anon-exec ; le front (Explorer public + bootstrap) fonctionne ; advisors anon DEFINER en baisse.
- **Effort·Risque** : **Quick · Faible** (denylist bornée, recoupée à la liste front).

### Q3 — Activer la protection « mot de passe compromis »
- **Objectif** : durcissement Auth avant comptes tiers réels (advisor `auth_leaked_password_protection`).
- **Changement** : toggle dashboard Supabase Auth (HaveIBeenPwned). Aucun code.
- **Garde-fou front · Rollback · Risque** : aucun impact front ; toggle réversible ; **Quick · Nul**.

### B1 — Corriger le drift documentaire enum + doc
- **Objectif** : un intégrateur (et le front) doit voir les **19** `object_type` réels.
- **Changement** : dans le Guide (`…Guide d'utilisation…:255`) corriger `p_types` → ajouter `PSV, RVA, ACT, SPU, PRD` (ou remplacer l'énumération par un renvoi à `schema_unified.sql`) ; compléter le README (§Fonctions : CRM/modération/dashboard/création/suppression) ; **fold `PRD`** dans `schema_unified.sql` (aujourd'hui seul `migration_object_type_prd.sql` le porte).
- **Garde-fou front · Risque** : doc only ; **Quick · Nul**.

---

## Phase 1 — Contrat tiers autonome (chantiers ; tout confiné à `/api/public/*` + nouvelles tables `internal.partner_*`)

> Ces chantiers **n'altèrent aucune RPC ni table existante** : nouveau préfixe d'URL + nouvelles tables. Risque front = nul, sauf R2 (CORS/headers, voir piège).

### R1 — Modèle partenaire (auth + traçabilité + révocation + quota)
- **Approche recommandée** : **passerelle clé-API** au niveau route Next. Clé opaque `bk_live_<random>` (jamais le JWT/anon key), header `Authorization: Bearer bk_…`. Route `/api/public/*` : hash SHA-256 → lookup `internal.partner_api_key(id, partner_id, key_hash, key_prefix, scopes[], quota_daily, rate_per_min, is_active, revoked_at, expires_at, last_used_at)` → si actif, appel **service-role** restreint à une **allowlist de RPC de lecture publique en dur dans la route** (celles qui filtrent déjà `status='published'`) → journalisation append-only `internal.partner_api_call`. Révocation = `is_active=false` (immédiat). Quota = `partner_quota_counter(partner_id, day, count)`.
- **Alternative** : comptes Supabase Auth « partenaire » + claim RLS. *Non en 1er* (TTL JWT = révocation non instantanée, impose OAuth au tiers). À retenir si un tiers doit un jour **écrire**.
- **Garde-fou front** : **Nul** (préfixe `/api/public/*` + tables `internal.partner_*` neufs ; aucune RPC existante touchée). **Piège** : ne JAMAIS donner l'anon key au tiers ni élargir un grant anon.
- **Effort·Risque** : **Chantier · Nul.**

### R2 — Rate-limit + CORS + headers de sécurité
- **Approche recommandée** : 3 couches. (1) `next.config.ts → headers()` statiques (HSTS, `X-Content-Type-Options: nosniff`, `Referrer-Policy`, `Permissions-Policy`, `X-Frame-Options`). (2) **`middleware.ts` neuf**, matcher **strict `['/api/public/:path*']`**, CORS dynamique + préflight OPTIONS. (3) Rate-limit dans la route nodejs via `internal.partner_rate_check` (DEFINER, fenêtre glissante `partner_rate_bucket`, retourne `allowed`+`retry_after`) → 429 + `Retry-After`. Remplace le `Map` in-memory de `menu/extract` (ne survit pas au multi-instance Coolify).
- **Alternative** : Redis/Upstash. *Non en 1er* (pas de Redis dans le stack ; YAGNI).
- **Garde-fou front** : **SEUL chantier pouvant casser un accès.** Pièges : (a) matcher CORS qui déborderait sur `/api/media/upload` ou `/api/menu/extract` (casse cookies/credentials) → matcher strict `/api/public/*` testé ; (b) CSP trop stricte casserait Mapbox/MapLibre/tuiles/images Supabase/realtime wss → livrer les **headers non-CSP d'abord**, CSP en passe séparée avec `connect-src` incluant Supabase + wss ; vérifier `X-Frame-Options` vs un éventuel aperçu iframe éditeur légitime. **Le front interne n'est PAS rate-limité** (matcher ne couvre que `/api/public/*`).
- **Effort·Risque** : **Moyen · Modéré** (le seul à surveiller).

### Q1b — Allowlist anon complète (avec R1)
- **Objectif** : une fois les tiers passés par la gateway service-role, l'anon ne sert plus QUE le front → `REVOKE EXECUTE … FROM anon ON SCHEMA api`, puis `GRANT` ciblé = **14 RPC anon + helpers d'autorisation requis par la RLS** (cf. garde-fous transverses).
- **Garde-fou front** : avant d'appliquer, **cartographier l'ensemble des helpers que la RLS/les vues INVOKER invoquent et qu'anon doit pouvoir exécuter** (scan `pg_policies` + corps de vues → fonctions référencées) et les inclure dans le re-grant (gotcha P0.3). Tant que ce mapping n'est pas figé, **rester sur Q1a**.
- **Effort·Risque** : **Moyen · Faible** *(à condition de faire Q1a + R1 d'abord ; sinon Élevé)*.

### I1 — Endpoint catalogue référentiel
- **Approche** : `api.list_reference_bundle(p_domains text[], p_lang text DEFAULT 'fr')` → JSONB `{ <domain>: [{code,name,icon_url,parent_code,domain}] }` (brique `api.list_catalog(p_domain,p_lang)`), `name = api.i18n_pick(name_i18n,p_lang,'fr')`, `is_active`/`valid_*` filtrés, **whitelist explicite de domaines** (pas de dump du registry → ne pas fuiter un vocabulaire RBAC/admin). `STABLE`, `SET search_path = api, public, extensions`, `GRANT … TO anon, authenticated`.
- **Garde-fou front·Risque** : nouvelle RPC + grant, **Moyen · Nul**.

### I2 — Versionnage du contrat
- **Approche** : `meta.contract_version` (semver) dans chaque réponse `/api/public/*` + header `X-Bertel-Api-Version` ; **pas de suffixe `_v1` sur les RPC** (drift SQL proscrit). Stabilité = additif-only dans une majeure ; dépréciation = headers `Deprecation`/`Sunset` + `meta.deprecations[]` ; rupture = `/api/public/v2/*`.
- **Garde-fou front·Risque** : confiné à `/api/public/*`, **Quick · Nul**.

### I3 — OpenAPI 3.1 + JSON Schema
- **Approche** : générer la spec depuis `tools/db-graph` (signatures déjà extraites), **restreinte à l'allowlist publique**, décrivant `/api/public/*` (pas les chemins PostgREST bruts) ; artefact statique servi par l'app docs nginx (zéro runtime). *Pas* l'OpenAPI natif PostgREST (2.0, fuite toute la surface interne).
- **Garde-fou front·Risque** : artefact hors-ligne, **Moyen · Nul** (dépend de l'allowlist R1 figée).

### C-4 — Tombstone (suppression dans le delta)
- **Approche** : `api.list_deleted_objects_since(p_since)` → `[{object_id, deleted_at, type}]` depuis le journal immuable `object_deletion_log` (§108) — **jamais le `report`** (RGPD) ; gateway `GET /api/public/objects/changes?since=T` → `{upserts, tombstones[], cursor}`. Couvrir l'**unpublish** (published→draft/archived = tombstone logique) via `object_version` ou re-sync documenté (arbitrage).
- **Garde-fou front·Risque** : `object_deletion_log` lu par personne au front, **Moyen · Nul**.

### C-5 — i18n multi-langue (`i18n:"all"`)
- **Approche** : option `p_options.i18n='all'` projetant les colonnes `*_i18n` déjà en ligne (pas de N appels). **Interaction Markdown §106/§112** : émettre le **plat par langue** par défaut (`strip_markdown` par langue — contrat tiers = texte propre) ; **jamais de `*_i18n` brut non-strippé** sur une voie tierce publique. FR reste fallback.
- **Garde-fou front** : **opt-in** ; le défaut (`lang_prefs` résolu) inchangé **byte-à-byte** ; ne pas toucher les legs éditeur `canonical_description`/`org_description` (clés distinctes). **Moyen · Faible.**

---

## Phase 2 — Interopérabilité sectorielle

### I4 — Sortie JSON-LD / schema.org *(décision PO requise)*
- **Approche** : option `p_options.format='jsonld'` sur `get_object_resource`, crosswalk `object_type → classe` piloté par **table `ref_jsonld_crosswalk`** (pas de hardcode), émis en clé **séparée** `meta.jsonld`. Mapping schema.org : HEB/HOT/HLO/RVA/HPA→`LodgingBusiness`, RES→`Restaurant`, ACT/ASC/VIS/PNA/PCU→`TouristAttraction`, ITI→`TouristTrip`, FMA→`Event`, ORG→`Organization`.
- **Garde-fou front** : `format` **opt-in**, JSON-LD en clé séparée (jamais muter les clés existantes), **test byte-équivalent** (garde §103). En cas de doute, alternative endpoint dédié `/api/public/objects/{id}/jsonld` (élimine tout risque, mais duplique le crosswalk hors DB).
- **🚩 Point bloquant PO** : cible d'interopérabilité — **DATAtourisme** (RDF national → crosswalk `PlaceOfInterest`/`Accommodation`/`FoodEstablishment`), **APIDAE/Tourinsoft** (JSON régional → `format:'apidae'` dédié, pas du JSON-LD), ou **schema.org** (SEO, défaut recommandé). *Livrer schema.org d'abord ; un 2e profil = un seed de plus dans la table crosswalk.*
- **Effort·Risque** : **Chantier (multi-profils) / Moyen (schema.org seul) · Faible.**

---

## 3. Séquencement recommandé

```
Phase 0 (sûr, immédiat)         R3 · Q2 · Q1a · Q3 · B1           [Quick, risque nul/faible]
        │
Phase 1 (contrat tiers)         I1 → I2 → R1 → R2 → C-4 → C-5 → I3 → Q1b
        │                       (R2 = seul risque modéré ; Q1b après R1+mapping helpers)
        │
Phase 2 (interop sectorielle)   I4   ← décision PO sur la cible standard
```

**Dépendances** : I2/I3 dépendent de la gateway R1 (préfixe + allowlist figés) ; R2 dépend de R1 (middleware) ; Q1b dépend de R1 (tiers hors-anon) + du mapping des helpers RLS ; I4 dépend d'une décision PO.

**Règle de discipline déploiement (transverse)** : chaque correctif SQL s'applique **en live ET en source ET au runbook** (`docs/SQL_ROLLOUT_RUNBOOK.md`). Le gate fresh-apply ne détecte ni une fuite de confidentialité (R3) ni un grant (Q1) — la parité fresh==live est manuelle ici.

---

## 4. Ce qui est déjà fait

- ✅ **Config bucket `media`** corrigée (vidéos mp4/webm/mov + 100 Mo) — commit `e64a835`, live appliqué, source `media_bucket.sql` alignée. *(N'était pas un fix d'audit mais le même périmètre Storage.)*
