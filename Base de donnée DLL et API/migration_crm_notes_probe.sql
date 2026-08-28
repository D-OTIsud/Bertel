-- migration_crm_notes_probe.sql
-- Manifeste 17c — lot de corrections 2026-08-28, chantier 1 sous-lot 1d.
--
-- SYMPTÔME : un administrateur d'ORG voit tout le module CRM en « Lecture seule » alors que le
-- serveur accepterait ses écritures. Mesuré : 2 comptes de production dans ce cas.
--
-- CAUSE : la sonde CLIENT `userCanWriteCrmNotes` (`src/services/crm.ts`) ne testait que
-- `api.user_has_permission('write_crm_notes')`, alors que la garde SERVEUR
-- `api.user_can_write_crm_actor` / `api.user_can_write_crm` accepte
-- `write_crm_notes` **OU** `api.current_user_admin_rank() IS NOT NULL` **OU** superuser.
-- Le front était donc PLUS STRICT que le serveur — c'est l'inverse d'une fuite, mais c'est la
-- même divergence front/serveur que §214, et elle se paie en travail impossible à faire.
--
-- CORRECTIF : une fonction unique qui EST la source de vérité, appelée par le front. Reproduire
-- la chaîne de `OR` côté TypeScript aurait recréé la divergence au premier changement de règle.
--
-- ⚠️ DEUX GARDES §204, toutes deux obligatoires sur une fonction DEFINER neuve :
--   1. `REVOKE ALL … FROM PUBLIC` — PostgreSQL accorde `EXECUTE` à `PUBLIC` par DÉFAUT, et un
--      `GRANT` ciblé ne le retire pas.
--   2. `COALESCE(…, FALSE)` — la chaîne de `OR` passe par `auth.*()`, qui rend **NULL hors
--      contexte HTTP** (psql, pooler, `service_role`), y compris en superuser. Sans le COALESCE
--      la fonction serait à TROIS valeurs, et un consommateur en position booléenne
--      (`if (!canWrite)`) verrait sa garde devenir fail-OPEN.
--
-- Pas de `NOTIFY pgrst` ? SI : fonction exposée NEUVE ⇒ rechargement du cache de schéma requis.
-- Idempotent (`CREATE OR REPLACE`). Après `rls_policies.sql` (is_platform_superuser,
-- user_has_permission, current_user_admin_rank) et après 8z (`migration_crm_module.sql`, dont
-- elle reproduit la garde).

\set ON_ERROR_STOP on
BEGIN;

CREATE OR REPLACE FUNCTION api.current_user_can_write_crm_notes()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, api, auth
AS $$
  -- MÊMES ingrédients que api.user_can_write_crm_actor, moins l'arme « périmètre » : la sonde
  -- répond « cet utilisateur peut-il écrire des notes CRM en général ? », pas « sur CET acteur ».
  -- Le périmètre reste évalué par acteur/objet dans les RPC d'écriture — cette sonde ne sert
  -- qu'à décider si l'interface se présente en lecture seule.
  SELECT COALESCE(
    api.is_platform_superuser()
    OR api.user_has_permission('write_crm_notes')
    OR api.current_user_admin_rank() IS NOT NULL,
    FALSE);
$$;

COMMENT ON FUNCTION api.current_user_can_write_crm_notes() IS
  'Sonde d''interface : l''utilisateur courant peut-il écrire des notes CRM ? Reproduit la garde de api.user_can_write_crm_actor (write_crm_notes OU rang admin d''ORG OU superuser) SANS son arme de périmètre. Source de vérité UNIQUE — le front ne doit jamais re-transcrire cette chaîne de OR. Chantier 2026-08-28, manifeste 17c.';

REVOKE ALL ON FUNCTION api.current_user_can_write_crm_notes() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION api.current_user_can_write_crm_notes() TO authenticated, service_role;

-- Garde d'application : un REVOKE qui n'a pas pris ne rend qu'un WARNING, qu'`ON_ERROR_STOP` ne
-- rattrape pas (cas d'un ré-apply par un rôle non propriétaire). On échoue fort.
DO $$
BEGIN
  IF has_function_privilege('anon', 'api.current_user_can_write_crm_notes()', 'EXECUTE') THEN
    RAISE EXCEPTION 'migration_crm_notes_probe: anon ne doit PAS pouvoir executer la sonde CRM.';
  END IF;
  IF NOT has_function_privilege('authenticated', 'api.current_user_can_write_crm_notes()', 'EXECUTE') THEN
    RAISE EXCEPTION 'migration_crm_notes_probe: authenticated doit pouvoir executer la sonde CRM.';
  END IF;
END $$;

COMMIT;

NOTIFY pgrst, 'reload schema';
