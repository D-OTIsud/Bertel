-- migration_ref_code_dup_policy_cleanup.sql
-- Drop the 6 duplicate legacy policy pairs on ref_code partitions (2026-07-02). Manifest 16f. Decision log §146.
--
-- SYMPTOM (DB structure audit 2026-07-02, P1b; advisor `multiple_permissive_policies` worst-case
--   24 combos/table): six ref_code partitions carry BOTH the house pair
--   (`pub_ref_code_read` SELECT / `admin_ref_code_write` ALL — applied to every ref_code partition
--   by the rls_policies.sql loop) AND a dedicated legacy pair doing the same job:
--     ref_code_payment_method   — "Lecture publique des moyens de paiement" / "Écriture admin des moyens de paiement"
--     ref_code_environment_tag  — "Lecture publique des tags d'environnement" / "Écriture admin des tags d'environnement"
--     ref_code_view_type        — "Lecture publique des types de vue" / "Écriture admin des types de vue"
--     ref_code_membership_tier      — pub_membership_tier_read / admin_membership_tier_write
--     ref_code_membership_campaign  — pub_membership_campaign_read / admin_membership_campaign_write
--     ref_code_incident_category    — pub_incident_category_read / admin_incident_category_write
-- FIX: drop the legacy pairs; the house pair fully covers them. Their CREATEs are removed from
--   rls_policies.sql in the same change (fresh no longer builds the duplication).
-- SEMANTICS NOTE: the 3 French-named legacy WRITE arms also carried `api.is_platform_superuser()`.
--   Dropping them removes DIRECT-PostgREST superuser writes on those 3 partitions — aligning them
--   with the other ~60 ref_code partitions where the sanctioned superuser write path is the §119
--   DEFINER RPC family (migration_ref_code_admin_rpcs.sql, gated is_platform_superuser). The CRM
--   trio pairs were exact duplicates (zero semantic change).
-- IDEMPOTENT: DROP POLICY IF EXISTS. REVERSIBLE: re-create from git history (rls_policies.sql).

BEGIN;

DROP POLICY IF EXISTS "Lecture publique des moyens de paiement"   ON ref_code_payment_method;
DROP POLICY IF EXISTS "Écriture admin des moyens de paiement"     ON ref_code_payment_method;

DROP POLICY IF EXISTS "Lecture publique des tags d'environnement" ON ref_code_environment_tag;
DROP POLICY IF EXISTS "Écriture admin des tags d'environnement"   ON ref_code_environment_tag;

DROP POLICY IF EXISTS "Lecture publique des types de vue"         ON ref_code_view_type;
DROP POLICY IF EXISTS "Écriture admin des types de vue"           ON ref_code_view_type;

DROP POLICY IF EXISTS "pub_membership_tier_read"        ON ref_code_membership_tier;
DROP POLICY IF EXISTS "admin_membership_tier_write"     ON ref_code_membership_tier;

DROP POLICY IF EXISTS "pub_membership_campaign_read"    ON ref_code_membership_campaign;
DROP POLICY IF EXISTS "admin_membership_campaign_write" ON ref_code_membership_campaign;

DROP POLICY IF EXISTS "pub_incident_category_read"      ON ref_code_incident_category;
DROP POLICY IF EXISTS "admin_incident_category_write"   ON ref_code_incident_category;

-- Fail loudly if the house pair is somehow missing on any of the six (would mean the partition
-- lost its only read/write gate — never expected: the rls_policies loop covers every partition).
DO $$
DECLARE v_tbl TEXT;
BEGIN
  FOREACH v_tbl IN ARRAY ARRAY['ref_code_payment_method','ref_code_environment_tag','ref_code_view_type',
                               'ref_code_membership_tier','ref_code_membership_campaign','ref_code_incident_category']
  LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename=v_tbl
                   AND policyname='pub_ref_code_read' AND cmd='SELECT')
    OR NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename=v_tbl
                   AND policyname='admin_ref_code_write' AND cmd='ALL') THEN
      RAISE EXCEPTION 'house pair missing on % — aborting legacy-pair cleanup', v_tbl;
    END IF;
  END LOOP;
END $$;

COMMIT;

-- No `NOTIFY pgrst`: RLS policy changes do not affect the PostgREST schema cache.
