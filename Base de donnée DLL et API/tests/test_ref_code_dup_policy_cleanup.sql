-- test_ref_code_dup_policy_cleanup.sql
-- Proves migration_ref_code_dup_policy_cleanup.sql (16f, §146): the 6 ref_code partitions carry
-- The house pair remains exact for application roles. The reviewed additional
-- projection reader applies only to the non-login thesaurus publisher role.
-- Run AFTER the full manifest. Self-contained + transactional (ROLLBACK; nothing persists).
\set ON_ERROR_STOP on
BEGIN;
DO $$
DECLARE v_tbl TEXT;
BEGIN
  FOREACH v_tbl IN ARRAY ARRAY['ref_code_payment_method','ref_code_environment_tag','ref_code_view_type',
                               'ref_code_membership_tier','ref_code_membership_campaign','ref_code_incident_category']
  LOOP
    ASSERT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename=v_tbl
                   AND policyname='pub_ref_code_read' AND cmd='SELECT'),
           format('house read policy missing on %s', v_tbl);
    ASSERT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename=v_tbl
                   AND policyname='admin_ref_code_write' AND cmd='ALL'),
           format('house write policy missing on %s', v_tbl);
    ASSERT (SELECT count(*) FROM pg_policies WHERE schemaname='public' AND tablename=v_tbl AND policyname<>'thesaurus_projection_read') = 2,
           format('%s must carry EXACTLY the house pair apart from the reviewed publisher reader (found %s policies)', v_tbl,
                  (SELECT count(*) FROM pg_policies WHERE schemaname='public' AND tablename=v_tbl));
    ASSERT NOT EXISTS (SELECT 1 FROM pg_policy p
      WHERE p.polrelid=format('public.%I',v_tbl)::regclass AND p.polname='thesaurus_projection_read'
        AND (p.polcmd<>'r' OR p.polroles<>ARRAY[(SELECT oid FROM pg_roles WHERE rolname='bertel_thesaurus_publisher')]
          OR p.polwithcheck IS NOT NULL OR pg_get_expr(p.polqual,p.polrelid) IS DISTINCT FROM
            $guard$(CURRENT_USER = 'bertel_thesaurus_publisher'::name)$guard$)),
      format('additional publisher policy changed its role, command or predicate on %s',v_tbl);
  END LOOP;

  ASSERT NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND policyname IN (
      'Lecture publique des moyens de paiement','Écriture admin des moyens de paiement',
      'Lecture publique des tags d''environnement','Écriture admin des tags d''environnement',
      'Lecture publique des types de vue','Écriture admin des types de vue',
      'pub_membership_tier_read','admin_membership_tier_write',
      'pub_membership_campaign_read','admin_membership_campaign_write',
      'pub_incident_category_read','admin_incident_category_write')
  ), 'a legacy duplicate ref_code policy still exists somewhere';

  ASSERT NOT (SELECT rolcanlogin OR rolbypassrls OR rolsuper FROM pg_roles WHERE rolname='bertel_thesaurus_publisher'),
    'publisher policy must not apply to a login, superuser or RLS-bypass role';
  RAISE NOTICE 'ref_code duplicate-policy cleanup assertions passed (exact house pair plus isolated publisher reader).';
END$$;
ROLLBACK;
