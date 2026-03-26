-- =============================================================================
-- ⚠️  CE FICHIER NE DOIT PAS ÊTRE EXÉCUTÉ DIRECTEMENT
-- =============================================================================
-- Il contenait les deux blocs de réconciliation (parents + commentaires) en un
-- seul fichier, ce qui rendait impossible le respect de l'ordre d'exécution
-- obligatoire entre la promotion des parents et la réconciliation des commentaires.
--
-- Utilise les fichiers séparés à la place :
--
--   Étape 1 : \i crm_lot1_02a_reconcile_parents.sql
--   Étape 2 : \i crm_lot1_03a_promote_parents.sql
--   Étape 3 : \i crm_lot1_02b_reconcile_comments.sql
--   Étape 4 : \i crm_lot1_03b_promote_comments.sql
-- =============================================================================

DO $$
BEGIN
    RAISE EXCEPTION
        'Ne pas exécuter crm_lot1_02_reconcile.sql directement. '
        'Utilise crm_lot1_02a_reconcile_parents.sql et crm_lot1_02b_reconcile_comments.sql '
        'dans l''ordre documenté dans lot1_crm_import_plan.md §10.';
END
$$;
