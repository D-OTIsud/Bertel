# Audit API ↔ Base de données — Bertel 3.0

**Date** : 2026-06-30 · **Périmètre** : couverture de la base par l'API, qualité de structuration, aptitude à l'intégration par un prestataire externe.
**Méthode** : boucle de réflexion à 6 passes lecture-seule en parallèle (inventaire, drift de schéma, interopérabilité tierce, couverture des catalogues & écritures, transport/auth, advisors sécurité) + **vérification adversariale directe sur la base live** (Supabase MCP) pour lever tout doute. Findings triangulés (≥2 passes indépendantes pour les points durs).

> Cet audit est une **revue** : aucun code ni schéma n'a été modifié. Tous les findings sont sourcés (fichier:ligne ou fait live vérifié). Sévérités : CRITICAL / HIGH / MEDIUM / LOW.

---

## 1. Verdict exécutif (réponses aux 3 questions du PO)

### Q1 — « Est-ce que tout est bientôt structuré ? »
**OUI, la couverture DB → API est essentiellement complète et le socle SQL est sain.**
- **§101/§103 : 60/60** tables object-attachées authorables sont émises par un RPC consommateur — **0 gap** (`db-graph-out/SURFACE_COVERAGE.md`, vérifié cohérent).
- **0 CRITICAL** : aucune fonction ne référence une colonne/table inexistante ; **toutes les classes de bugs runtime historiques sont vérifiées encore corrigées** dans la source (`uuid_generate_v4()` en search_path restreint §29, `ANY((SELECT arr))` 42883 §98, `COALESCE(jsonb_agg,'[]'::json)` 42846 §59, agrégats imbriqués 42803 §56). `site_object_id` absent partout (invariant respecté).
- **Architecture d'autorisation saine** : `SECURITY DEFINER` authorize-once (§36), RLS defense-in-depth sur 100 % des tables `public`, 9/9 routes Next.js privilégiées fail-closed « as-caller », `internal` non exposé, **0 trou RLS structurel** (advisors : 0 `rls_disabled_in_public`, 0 `policy_exists_rls_disabled`, 0 `function_search_path_mutable`).

### Q2 — « Y a-t-il des améliorations à faire ? »
**OUI, mais ce sont surtout de la documentation, de la propreté de surface, et quelques durcissements — pas des défauts de correction.**
- Drift **documentaire** (enum `p_types` 14 valeurs documentées vs **19** réelles ; README abrégé ; Guide auto-déclaré « non-canonical »).
- Surface `api` **diluée** : ~32 fonctions trigger + ~33 prédicats booléens d'autorisation + helpers vivent dans le schéma public-facing `api`, mélangés aux vrais RPC de lecture/écriture. 6 variantes quasi-identiques de listing. Incohérence d'enveloppe (`info` vs `meta`), de type de retour (`json` ×36 / `jsonb` ×89), de nommage (`get_*_batch` au lieu de `list_*`, écritures `set_/add_/update_` hors familles `rpc_/save_`).
- Hygiène de grants : l'allowlist `REVOKE` recommandée n'a jamais tourné → **182 fonctions `api` exécutables par anon**.

### Q3 — « L'API est-elle assez bien structurée pour qu'un prestataire externe mappe notre API à sa base ? »
**PARTIELLEMENT. Un tiers PEUT mapper le modèle — mais PAS en autonomie aujourd'hui.** Les fondations sont là (ressource normalisée et complète, IDs stables, raccroche de clés tierces via `external_id`/`origin`, géo standard GPX/KML/GeoJSON, sync delta keyset). Il **manque la couche « contrat publié »** qu'un intégrateur attend :
1. **aucun endpoint catalogue** pour les référentiels (le mapping de codes est artisanal) — *lacune n°1, confirmée par 2 passes indépendantes* ;
2. **aucun versionnage ni politique de dépréciation** (le SQL EST le contrat → rupture silencieuse possible) — *risque structurel le plus élevé* ;
3. **aucun OpenAPI/JSON Schema** publiable ;
4. **aucun format pivot** (JSON-LD/schema.org/DATAtourisme/APIDAE) — le crosswalk est 100 % à la charge du tiers.
+ **3 verrous de sécurité d'ouverture** (pas de modèle partenaire/quota, pas de rate-limit/CORS au bord, 2 vues qui fuitent des brouillons).

**Conclusion** : la maison est solide et bien rangée à l'intérieur ; ce qui manque, c'est la **façade contractuelle** pour le monde extérieur.

---

## 2. Forces confirmées (à ne pas régresser)

| # | Force | Preuve |
|---|-------|--------|
| F1 | Couverture object-attachée complète | 60/60 §101/§103, 0 gap (`SURFACE_COVERAGE.md`) |
| F2 | SQL propre, 0 RPC cassé | Passe drift : 0 CRITICAL ; classes 42883/42846/42803/§29 toutes encore corrigées |
| F3 | Autorisation authorize-once + RLS defense-in-depth | §36 ; 0 trou RLS (advisors) ; `internal` non exposé, anon sans USAGE dessus |
| F4 | Routes privilégiées exemplaires | 9/9 fail-closed « as-caller » (la service key ne sert qu'au post-autorisation) — modèle `objects/delete`, `rgpd/erase` |
| F5 | Modèle de ressource riche & stable | IDs `[TYPE3][REGION3][BASE36]` immuables ; blocs normalisés ; raccroche `external_id`/`origin.source_object_id` |
| F6 | Géo & sync interopérables | GPX 1.1 / KML / GeoJSON + bbox EPSG:4326 ; pagination keyset `since_fast` à curseur opaque |

---

## 3. Axe A — Couverture API ↔ DB

**Verdict : quasi-complète sur tout le périmètre produit actif.**

| Domaine | Lecture API | Écriture API | Gap |
|---|---|---|---|
| Objet + 60 facettes | ✅ `get_object_resource` + cards/compact | ✅ RPC workspace **+ PostgREST direct gaté RLS** | §101/§103 OK ; écriture directe sous-documentée (A2) |
| Référentiels `ref_*` (80) | ✅ embarqué résolu + ✅ PostgREST direct `USING(true)` (80/80 anon-lisibles, **vérifié live**) | ✅ admin (`rpc_*_ref_code`) | **Pas de RPC de découverte autonome** (A1) |
| CRM, Modération, RBAC, Import/staging, Suppression/RGPD, AI/branding | ✅ | ✅ | — (couverts complets) |
| Audit-log / versions | ✅ `get_object_versions` | trigger | délibérément interne |
| **Publication** | ✅ export+lecture | ❌ pas de create/curation | **A3 (MEDIUM)** |
| **Promotion** | ✅ `validate_promotion_code` | ❌ pas de création | A4 (LOW-MEDIUM) |
| **incident_report / demandes, audits (audit_session…)** | ❌ | trigger/interne | modules différés (LOW) |

- **A1 — MEDIUM — Pas d'endpoint catalogue de référentiels.** Les 80 tables `ref_*`/`ref_code_*` sont accessibles (résolues dans la ressource objet + lecture directe PostgREST `USING(true)`, **80/80 anon-lisibles vérifié live**), donc **aucune donnée manquante** — mais la seule voie « liste » est la lecture de table brute, qui couple le client au schéma physique et n'offre pas de résolution i18n en mode liste. *Recoupé par l'axe C (I1).*
- **A2 — MEDIUM — Écriture objet par PostgREST direct sous-documentée.** ~15 tables de facettes (rooms/meeting/menus/act/fma/cuisine/classification/stay/taxonomy) s'écrivent en direct depuis `object-workspace.ts`, bien au-delà des §40/§41 documentés. Pas un trou (RLS per-commande + `trg_assert_facet_applicable` gardent), mais incohérence doc/contrat et absence de validation métier serveur centralisée sur ces tables.
- **A3 — MEDIUM — Publication non pilotable par API** (lecture/export seulement ; pas de create/curation/transition). Probablement géré hors-app ; à exposer si la curation print devient un flux produit.
- **0 write-trap silencieux résiduel** (sweeps §29–§48 complets, vérifié au journal).

---

## 4. Axe B — Qualité de structuration

**Verdict : solide au fond, à ranger en surface. Aucun défaut de correction ; des incohérences de propreté et de la doc périmée.**

### B1 — Drift documentaire (le seul drift réel)
- **HIGH — Enum `p_types` incomplet dans la doc.** Le Guide (`:255`) liste **14** types ; l'enum `object_type` réel en a **19** (vérifié live) — **manquent `PSV`, `RVA`, `ACT`, `SPU`, `PRD`**. Un intégrateur se fiant au Guide rejetterait à tort des types valides (ACT/FMA/PRD sont peuplés ou en import).
- **HIGH (atténué) — README runbook abrégé** : omet ~30 migrations vs `docs/SQL_ROLLOUT_RUNBOOK.md`. **Pas un drift fresh≠live réel** (le runbook canonique est complet et couvre PRD=8x/SPU=8u/CRM=8z) — mais le README peut égarer un opérateur qui ne suit pas le renvoi `:123`.
- **MEDIUM — README inventaire de fonctions partiel** (CRM/modération/dashboard/création/suppression absents) ; **Guide « non-canonical »** mais seul porteur de l'énumération enum périmée.
- **MEDIUM — `PRD` non foldé dans `schema_unified.sql`** (seul `migration_object_type_prd.sql` le porte) ; couvert par le runbook (8x), donc candidat de nettoyage, pas un défaut actif.

### B2 — Propreté de surface (MEDIUM/LOW)
- **Schéma `api` dilué** : sur 275 fonctions `api` (live), **~32 sont des fonctions trigger** et **~33 des prédicats booléens d'autorisation** (`is_*`/`can_*`/`user_can_*`) — du plombier interne logé dans le schéma public-facing, qui dilue le contrat et gonfle la surface anon. *Idéalement, triggers/helpers → `internal`.*
- **6 variantes quasi-identiques de listing** : `list_object_resources_{page,since_fast,filtered_page,filtered_since_fast}` × {typé, `_text`}. Le suffixe `_text` (contournement des tableaux d'enum PostgREST) n'existe que pour 2 des 6 → asymétrie déroutante pour un tiers.
- **Doublons table-vs-json** dans le domaine légal : `get_expiring_legal_records`/`_api`, `get_pending_document_requests`/`_api`, et 4 lectures légales recouvrantes (`get_object_legal_records`/`_data`/`_compliance`/`check_…`).
- **`build_opening_period_json`** : 2 surcharges live (4-arg vs 5-arg) → overload PostgREST ambigu.
- **Incohérences de convention** : retour `json` (×36) vs `jsonb` (×89) ; enveloppe `{info,...}` (Guide) vs **`meta`** (live sur `list_object_resources_page`, avec `schema_version:'3.0'`) ; nommage (`get_*_batch`/`get_filtered_object_ids` = collections mais préfixe `get_*` au lieu de `list_*` ; écritures `set_/add_/update_/link_` hors familles `rpc_/save_`).
- **Diversité d'enveloppes de retour** assumée mais réelle : `internal.workspace_result` `{success,changed_counts,…}` pour les `save_*` ; scalaire JSON pour cards/dashboard/CRM ; `TABLE(...)` pour legal/versions/pending/org_members ; scalaires nus pour create/publish/grant. Le domaine légal mélange les 3.

---

## 5. Axe C — Aptitude à l'intégration tierce (cœur de la question prestataire)

**Verdict : À améliorer — socle sémantique compatible, mais zéro couche contractuelle publiée.**

| # | Critère | Verdict | Action | Effort |
|---|---------|---------|--------|--------|
| C-1 | IDs stables + raccroche clés tierces | **Bon** | Documenter la grammaire ID + exposer `external_ids` dans le delta `since_fast` | Quick win |
| C-2 | Cohérence du contrat | **Bon** | Aligner `info`/`meta` ; doc « champ→nullable→type→sémantique » | Quick win |
| **C-3** | **Référentiels découvrables** | **Lacune** | **Endpoints catalogue `api.list_catalog(domain)` / `list_amenities()` …** (I1) | **Chantier** |
| C-4 | Pagination & sync delta | **Bon** | Signal de suppression/tombstone (statut sortant + `deleted_at` ou `list_deleted_since`) | Moyen |
| C-5 | i18n | À améliorer | Option `p_options.i18n:'all'` (maps `*_i18n` publics) + flag fallback FR silencieux | Moyen |
| C-6 | Géo & formats | **Bon** | Documenter ordre bbox `[minLon,minLat,maxLon,maxLat]` / EPSG:4326 | Quick win |
| **C-7** | **Versionnage & rupture** | **Lacune** | **Contrat versionné (`_v1` ou `meta.contract_version` garanti) + politique de dépréciation** (I2) | **Chantier** |
| **C-8** | **Documentation contractuelle** | À améliorer | **OpenAPI 3.1 + JSON Schema des payloads RPC** ; page « API publique » canonique (sous-ensemble figé) | **Chantier** |
| **C-9** | **Standards tourisme FR/EU** | À améliorer | **Sortie `format=jsonld` (profil schema.org)** + crosswalk `object_type`→DATAtourisme/APIDAE | **Chantier** |

**Détail des 4 verrous (Chantiers) :**
- **I1 (C-3) — Pas d'endpoint catalogue.** Pour mapper « wifi → son code interne », le tiers doit découvrir la liste des `domain` (non documentée hors HTML généré) et taper des tables `public` hétérogènes. Un `api.list_catalog(p_domain)` renvoyant `{code,name,icon_url,parent_code,domain}` transforme « exposé » en « intégrable en autonomie ». *Recoupé par l'axe A (A1).*
- **I2 (C-7) — Pas de versionnage.** Aucun `/v1`, pas de politique de dépréciation ; les docs se déclarent « non-canonical » et renvoient au SQL → **un `CREATE OR REPLACE FUNCTION` peut changer la forme d'un payload sans préavis** (ce dépôt l'a déjà fait : `info`→`meta`, ajout `*_md`, `duration_hours`→`duration_min`). Risque de rupture silencieuse pour tout consommateur tiers.
- **I3 (C-8) — Pas d'OpenAPI/JSON Schema.** PostgREST auto-expose un OpenAPI pour les *tables*, pas pour la forme des RPC `RETURNS json`. Aucun `*.yaml`/JSON Schema dans `docs/`. Le db-graph contient déjà la matière (retours, params, tables) pour le générer.
- **I4 (C-9) — Pas de format pivot.** Le modèle se mappe presque 1:1 sur **schema.org** (`LodgingBusiness`/`Restaurant`/`TouristAttraction`/`TouristTrip`, `address`, `geo`, `openingHoursSpecification`, `aggregateRating` via `object_review`) et conceptuellement sur **DATAtourisme** (ontologie nationale RDF/JSON-LD), **APIDAE**, **Tourinsoft** — mais **aucune sortie JSON-LD/RDF** n'existe (`@context`/`@type`/`@id` absents). Le crosswalk est 100 % à la charge du tiers. Une option `format=jsonld` profil schema.org est le multiplicateur d'interopérabilité le plus rentable.

> **Note de cadrage** : si l'OTI vise un standard précis (DATAtourisme est le standard national open-data ; APIDAE/Tourinsoft sont les SIT régionaux), la priorité de I4 et le format pivot se précisent. À trancher avec le PO avant de chiffrer I4.

---

## 6. Sécurité d'ouverture de l'API à un tiers

**Verdict : aucun trou structurel, mais 3 bloquants au bord + des sur-grants à révoquer avant d'ouvrir.** (advisors : 185 notices, dont **181 = bruit DEFINER §36 attendu** ; les 4 actions réelles ci-dessous.)

| # | Sévérité | Risque | Action |
|---|----------|--------|--------|
| **R1** | **HIGH** | **Pas de modèle partenaire** (auth `anon` indifférenciée) → ni traçabilité, ni révocation, ni scope, ni quota par tiers | Comptes Auth « partenaire » dédiés (JWT par partenaire, scope RLS par claim) **ou** passerelle API-key au proxy |
| **R2** | **HIGH** | **Aucun rate-limiting / CORS / headers de sécurité** au bord (seul limiteur = in-memory mono-route `menu/extract`) → scraping massif des `list_object_resources_*` anon, brute-force uploads (« upload-route spam hole ») | Limiteur partagé (Redis/`pg`) + headers (`next.config.ts`/proxy) + CORS allowlist |
| **R3** | **HIGH** (en contexte ouvert) | **2 vues `SECURITY DEFINER` anon-SELECT** (`v_object_classification_coverage`, `v_object_classification_or_equivalent_scheme`) fuitent des **ids d'objets `draft`** (connu 2026-06-14, **toujours live**) | `SECURITY INVOKER` ou gate §38 sur les deux vues |
| **Q1** | MEDIUM | **Allowlist `REVOKE` jamais appliquée** → 182 fonctions `api` anon-exécutables (+ `public.create_object_version_monthly_partition` anon-RPC-callable, `add_/update_legal_record` anon-exposées) | `REVOKE EXECUTE … FROM anon, authenticated` puis re-grant ciblé (~10 RPC publics) → 182 → ~10 |
| **Q2** | MEDIUM | **2 buckets Storage** (`media`, `documents`) autorisent le **listing** de tous les fichiers (dont médias d'objets non-publiés et **certificats/justificatifs juridiques** sous `documents/`) | Restreindre la policy SELECT à l'accès-par-clé (pas de listing) |
| Q3 | LOW | Protection « leaked password » (HaveIBeenPwned) désactivée | Toggle dashboard Auth |

> `app_ai_provider_config` (RLS sans policy) = **deny-all sûr** (pas de fuite ; la clé IA est en Vault, lue via `get_active_ai_provider_secret` verrouillée service_role — **vérifié live**). À révoquer par hygiène (couvert par Q1), non bloquant.

---

## 7. Backlog priorisé

**Séquencement recommandé pour « ouvrir l'API à un prestataire externe » :**

### Étape 0 — Bloquants sécurité (avant toute ouverture)
| ID | Sév. | Action | Effort |
|----|------|--------|--------|
| R3 | HIGH | Corriger les 2 vues `SECURITY DEFINER` (INVOKER ou gate §38) | Faible |
| Q2 | MEDIUM | Retirer le listing des buckets `media`/`documents` | Faible |
| Q1 | MEDIUM | Appliquer l'allowlist `REVOKE`+re-grant | Faible-Moyen |
| R2 | HIGH | Rate-limit partagé + CORS + headers de sécurité au bord | Moyen |
| R1 | HIGH | Modèle partenaire (comptes Auth dédiés + scope RLS) | Chantier |

### Étape 1 — Contrat tiers autonome
| ID | Sév. | Action | Effort |
|----|------|--------|--------|
| I1/A1 | MEDIUM | Endpoints catalogue `api.list_catalog(domain)` & co. | Chantier |
| I2 | HIGH (risque) | Contrat versionné + politique de dépréciation + page « API publique » figée | Chantier |
| I3 | MEDIUM | OpenAPI 3.1 + JSON Schema des payloads | Chantier |
| C-4 | MEDIUM | Signal de suppression (tombstone) dans le delta | Moyen |
| C-5 | MEDIUM | Option i18n multi-langue + flag fallback | Moyen |

### Étape 2 — Interopérabilité sectorielle & propreté
| ID | Sév. | Action | Effort |
|----|------|--------|--------|
| I4/C-9 | MEDIUM | Sortie `format=jsonld` (schema.org) + crosswalk DATAtourisme/APIDAE | Chantier (à cadrer PO) |
| B1 | HIGH (doc) | Corriger l'enum `p_types` (14→19) ; rafraîchir README/Guide ; fold `PRD` | Quick win |
| B2 | MEDIUM | Déplacer triggers/helpers `api`→`internal` ; rationaliser les 6 variantes de listing ; aligner `info`/`meta`, `json`/`jsonb`, nommage | Moyen |
| C-1/C-2/C-6 | LOW | Quick wins doc : grammaire ID, bbox/EPSG, `external_ids` en delta, table champ→nullable | Quick win |
| A3/A4 | MEDIUM/LOW | Exposer publication/promotion en écriture **si** flux produit | Sur besoin |

---

## 8. Conclusion

**Le doute est levé sur le fond** : la base est intégralement couverte par l'API pour le périmètre produit actif (60/60), le SQL est propre (0 CRITICAL, tous les bugs runtime historiques restent corrigés), et l'architecture d'autorisation est saine et cohérente. **Bertel 3.0 est bien structuré pour ses consommateurs internes.**

**Pour un prestataire externe**, l'API est **exposable mais pas encore « intégrable en autonomie »** : il manque la façade contractuelle (catalogue de référentiels, versionnage, OpenAPI, format pivot) et le bord sécurité tiers (modèle partenaire, rate-limit/CORS, correction des 2 fuites de brouillons). Aucun de ces points n'est un défaut de fond — ce sont des **ajouts de couche**, séquençables sans toucher au modèle. Les **3 quick-wins sécurité (R3, Q1, Q2)** et le **quick-win doc enum (B1)** lèvent les ambiguïtés immédiates à faible coût ; le reste relève de chantiers à prioriser avec le PO selon la cible d'ouverture.
