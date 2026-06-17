# Plan — Capacité d'effacement / anonymisation RGPD (Art. 17) + redaction du journal d'audit

> Statut : **plan / spec à valider** (2026-06-16). Aucune migration appliquée. Rédigé suite à l'audit RGPD/AIPD : c'est l'écart de conformité le plus impactant.

## 1. Problème (vérifié sur la base live)

1. **Aucune fonction d'effacement/anonymisation n'existe.** Recherche `pg_proc` (eras|purge|anonymi|gdpr|forget|redact) ⇒ seules `api.purge_expired_staging_batches` / `purge_staging_batch` (lots d'import CSV, pas de PII).
2. **Le journal d'audit re-conserve toute PII supprimée.** `audit.log_row_changes()` (SECURITY DEFINER, `schema_unified.sql:3692`) insère `before_data = to_jsonb(OLD)` et `after_data = to_jsonb(NEW)` — **la ligne entière, PII incluse** — dans `audit.audit_log`, sur chaque UPDATE/DELETE de **toutes** les tables `public` (sauf `ref_code_%` / `audit_log_%`, via `attach_missing_triggers()` `:3742`). `changed_by` = e-mail JWT.
3. **Rétention audit = 12 mois** (`audit.drop_old_partitions(12)` `:3637`, appelée par `maintain_partitions()` cron). Donc une donnée « effacée » par un simple DELETE reste **récupérable jusqu'à 12 mois** dans `audit.audit_log`. Déjà constaté live (1 DELETE `crm_interaction` conserve `subject`+`body`+`actor_id`).
4. **`object_version` n'est jamais purgé** et est lui-même audité (`trg_audit_object_version` `:3819`).

⇒ Un effacement « satisfait » aujourd'hui laisse la PII intégrale dans `audit.audit_log` (≤ 12 mois) et dans `object_version` (indéfiniment). **Non conforme à l'Art. 17.**

## 2. Objectif

Fournir une **opération d'effacement contrôlée, traçable et complète** pour une personne concernée (acteur, contact, utilisateur, déclarant, auteur d'avis), couvrant : (a) les lignes vivantes, (b) le journal d'audit `audit.audit_log`, (c) le versioning `object_version`, (d) les fichiers média (bucket). Plus un **registre des demandes** (Art. 12 §3 + Art. 30).

## 2bis. Périmètre & proportionnalité (cadrage PO, 2026-06-16)

Bertel est un **référentiel touristique** : ~99 % des données stockées sont **publiques / publiables** (fiches d'établissements, descriptions, horaires, tarifs, coordonnées professionnelles, médias de promotion) et concernent majoritairement des **personnes morales**. Ce volume **n'est pas la cible** de l'effacement : c'est de la donnée métier publiée. L'outil doit rester **proportionné** — manuel, ciblé, à la demande — et viser uniquement les **données personnelles**, surtout non-publiques (interactions d'équipe + contacts privés, déjà protégés par RLS).

> **Nuance (à garder honnête vis-à-vis de la CNIL) :** « public » ≠ « hors Art. 17 ». Une donnée **personnelle publiée** reste effaçable sur demande (l'Art. 17 §2 vise spécifiquement les données rendues publiques). Le tableau ci-dessous classe donc par *probabilité d'effacement*, pas par exclusion.

| Tier | Données | Statut | Effacement |
|---|---|---|---|
| **A — Personnel non-public** (cible principale) | `crm_interaction` (+ `extra` JSONB), `crm_task`, `object_private_description`, `incident_report` (déclarant), `actor_channel`/`contact_channel` **non publics**, `app_user_profile`, identité + portrait d'acteur, `actor_consent` | Interne, **déjà RLS** | **Oui** — anonymisation/effacement ciblé |
| **B — Personnel publié** (sur demande, Art. 17 §2) | auteurs d'avis (`object_review`), données légales d'**entrepreneurs individuels** (`object_legal` SIRET/raison sociale = personne physique), contact « public » qui s'avère personnel, média publié montrant une personne | Publié mais personnel | **Sur demande** — cas plus rares |
| **Hors périmètre** | Référentiel public d'établissements : `object`, descriptions, horaires, tarifs, classifications, coordonnées pro de **personnes morales** | Donnée métier publiée | **Non** — pas une donnée personnelle |

⇒ Le gros volume public reste intact. La fonction ne « balaie » jamais le référentiel : elle agit **par sujet identifié**, sur les tables Tier A (+ Tier B sur demande).

## 3. Décisions à trancher (PO / DPO) — bloquantes

| # | Décision | Recommandation par défaut |
|---|---|---|
| D1 | **Anonymiser** la ligne vivante (tombstone, FK préservées) vs **hard-delete** (cascade) | **Anonymiser** par défaut (préserve l'intégrité référentielle `actor_object_role`, `crm_interaction.actor_id`…), hard-delete en option explicite |
| D2 | **Rédiger** (vider les champs PII) le journal d'audit vs **le conserver** au titre de l'Art. 17 §3 (obligation légale / constatation de droits) | **Rédiger** les `before_data`/`after_data` pour la personne concernée + conserver une trace non-PII de l'événement |
| D3 | Politique de rétention de `object_version` (aujourd'hui : jamais purgé) | Borner (ex. 24 mois) **et** rédiger les versions du sujet lors d'un effacement |
| D4 | Qui peut déclencher l'effacement | superuser + référent RGPD (permission dédiée `gdpr_erase`) |

## 4. Conception proposée

Tout en **SECURITY DEFINER**, `search_path` restreint, **`gen_random_uuid()`** (pas `uuid_generate_v4()` — invariant CLAUDE.md), gardé par une autorisation explicite (jamais `is_object_owner` brut).

### 4.1 Registre des sujets PII (source unique)
Table de référence `gdpr_pii_field(table_name, pk_col, subject_kind, pii_cols text[], tier char)` recensant **où vit la PII** (issu de l'audit) — limité aux Tiers A et B du §2bis (le référentiel public hors-périmètre n'y figure pas) :
- **Tier A** : `crm_interaction` (+ `extra` JSONB : `interlocuteur_email`, `humeur_raw`), `crm_task`, `object_private_description`, `incident_report`, `actor`, `actor_channel`, `actor_consent`, `contact_channel` (non-public), `app_user_profile`, `media` (portraits acteur).
- **Tier B** : `object_review`, `object_legal` (entrepreneurs individuels).
> Évite de coder en dur la liste dans la fonction (même principe que `ref_facet_registry`). Le `tier` permet de traiter Tier A par défaut et Tier B sur demande explicite.

### 4.2 RPC principal
```
api.rpc_gdpr_erase_subject(
  p_subject_kind text,        -- 'actor' | 'contact' | 'user' | 'incident_declarant' | 'review_author'
  p_subject_id   text,        -- clé du sujet
  p_mode         text,        -- 'anonymize' (défaut) | 'delete'
  p_reason       text,        -- motif / référence de la demande
  p_also_audit   boolean DEFAULT true,
  p_also_version boolean DEFAULT true
) RETURNS jsonb   -- rapport: lignes touchées par table, partitions audit rédigées, fichiers média supprimés
```
Étapes : (1) autorise (gate) ; (2) résout les lignes du sujet via le registre 4.1 ; (3) anonymise/supprime les lignes vivantes ; (4) si `p_also_audit` → `audit.redact_subject(...)` ; (5) si `p_also_version` → redaction `object_version` ; (6) renvoie/journalise un `gdpr_erasure_log`.

### 4.3 Redaction du journal d'audit
```
audit.redact_subject(p_table text, p_pk jsonb, p_pii_cols text[]) RETURNS int
```
`UPDATE audit.audit_log SET before_data = before_data - p_pii_cols, after_data = after_data - p_pii_cols WHERE table_name = p_table AND row_pk = p_pk` (sur toutes les partitions ; `audit_log_%` n'a **pas** de trigger d'audit → pas de re-log). Conserve l'**événement** (qui/quand/op) mais retire la **PII**.

### 4.4 Suppression des fichiers média
Les portraits/médias sont dans le **bucket Storage** (`media.url` = string sans FK). La suppression du fichier **ne peut pas** se faire en SQL pur → étape applicative : la route serveur (service-role) supprime l'objet Storage pour chaque `url` du sujet. À router via le pipeline média existant (invariant single-writer).

### 4.5 Registre des demandes (Art. 12 §3 / Art. 30)
`gdpr_erasure_request(id, subject_kind, subject_id, requested_at, requested_by, status, decided_at, decided_by, outcome, note)` + `gdpr_erasure_log` (résultat machine de chaque exécution). Lecture réservée référent/superuser.

## 5. Portée / hors-portée
- **Inclus** : effacement Art. 17 + redaction audit/version + média.
- **Hors-portée (passes séparées)** : purge de rétention automatique Art. 5.1.e (cron d'anonymisation comptes inactifs / CRM), MFA & en-têtes de sécurité, strip métadonnées vidéo, GC des orphelins média. (Tous tracés dans l'AIPD §7.1 #11–#14.)

## 6. Vérification (avant de déclarer fait)
1. Seeder un sujet de test (actor + channels + 1 crm_interaction + 1 média).
2. Exécuter le RPC en mode `anonymize` puis `delete`.
3. Vérifier : ligne vivante anonymisée/supprimée ; `audit.audit_log` (toutes partitions) sans la PII du sujet ; `object_version` rédigé ; fichier Storage supprimé ; `gdpr_erasure_log` écrit.
4. Personas RLS : un non-autorisé reçoit 403 ; `anon` ne peut pas exécuter.
5. Re-lecture (`get_*`) : plus aucune PII du sujet.

## 7. Livrables & ordre (à l'implémentation)
1. `migration_gdpr_erasure.sql` (registre PII + RPC + redaction + tables demandes/log) — **idempotent, réversible**.
2. `tests/test_gdpr_erasure.sql` (cas 6.x).
3. Route serveur de suppression Storage (média) + branchement.
4. Manifest + `SQL_ROLLOUT_RUNBOOK.md` (ordre d'apply) + note d'invariant CLAUDE.md.
5. Mise à jour AIPD §7.1 #11 (statut « livré ») + procédures DPO §2/§8.

## 8. État d'implémentation (2026-06-16)

Décisions **D1–D4 actées** (anonymiser par défaut · rédiger l'audit · rédiger `object_version` via le même mécanisme · superuser plateforme).

**Backend SQL — écrit + VÉRIFIÉ (apply transactionnel + ROLLBACK sur le live le 2026-06-16, zéro persistance ; les 3 objets n'existent PAS sur le live après coup) :**
- `Base de donnée DLL et API/migration_gdpr_erasure.sql` — `gdpr_erasure_log` + `audit.redact_subject()` + `api.rpc_gdpr_erase_subject()` (6 kinds, anonymize/delete, gated, retourne les URLs Storage à supprimer).
- `Base de donnée DLL et API/tests/test_gdpr_erasure.sql` — test transactionnel (acteur : identité anonymisée, canaux supprimés, CRM délié, **audit rédigé**, log écrit) → **PASS**.
- `docs/SQL_ROLLOUT_RUNBOOK.md` 14j.

**Frontend — écrit + testé (tsc 0, jest 3/3) :**
- `src/app/api/rgpd/erase/route.ts` — autorise le caller, appelle le RPC AS THE CALLER (garde superuser), puis **service-role** : (1) supprime les fichiers Storage retournés, (2) pour `kind='user'`+`delete` supprime le compte `auth.users` (Admin API).
- `src/services/rgpd.ts` (+ `rgpd.test.ts`) · `src/views/RgpdErasurePage.tsx` · `src/app/(main)/rgpd/page.tsx` · entrée nav `/rgpd` (Sidebar, owner/super_admin).

**Backend SQL — APPLIQUÉ AU LIVE le 2026-06-16** (MCP migration `gdpr_erasure` ; `NOTIFY pgrst` fait ; post-apply vérifié : 3 objets présents, RLS active, advisor = seulement le `security_definer` attendu sur le RPC). La migration reste dans le fichier source + runbook 14j (fresh==live).

**Folded dans le schéma canonique** (2026-06-16) : table + fonctions dans `schema_unified.sql` (après `attach_missing_triggers()` ⇒ log non audité = live), policy dans `rls_policies.sql` ⇒ fresh==live (parse-check live `FOLD OK`).

**Restant (décision PO) :** déployer le frontend (`/rgpd` + route) ; committer le tout.

> **Migration appliquée au live.** Frontend prêt, en attente de déploiement + commit.
