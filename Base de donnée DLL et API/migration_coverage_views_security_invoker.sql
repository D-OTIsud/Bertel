-- migration_coverage_views_security_invoker.sql
-- Audit API 2026-06-30 — correctif R3 (fuite anon d'ids d'objets `draft`).
--
-- Les 2 vues de couverture durabilité étaient SECURITY DEFINER (défaut Postgres,
-- reloptions vides) : exécutées avec les droits du propriétaire, elles bypassaient
-- la RLS et exposaient à `anon` (PostgREST direct) des ids d'objets `draft`
-- (advisor `security_definer_view`). Avec security_invoker=true, la vue s'exécute
-- avec les droits de l'appelant ⇒ la RLS de object / object_sustainability_action /
-- object_classification s'applique ⇒ anon ne voit plus que le `published`.
--
-- Vérifié en rôle anon (2026-06-30) : coverage draft 11→0, published 81 conservés.
-- Pour une base NEUVE, l'option est déjà portée par les CREATE de
-- migration_sustainability_v5.sql ; ce fichier ne sert qu'aux bases LIVE existantes.
-- Idempotent : safe à ré-appliquer.

BEGIN;

ALTER VIEW public.v_object_classification_coverage           SET (security_invoker = true);
ALTER VIEW public.v_object_classification_or_equivalent_scheme SET (security_invoker = true);

COMMIT;
