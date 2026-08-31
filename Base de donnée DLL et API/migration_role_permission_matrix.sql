-- migration_role_permission_matrix.sql
-- Manifeste 17i — le rôle métier CONFÈRE les droits, réglables par ORG (§227).
-- Plan : docs/plans/2026-08-31-permissions-par-role-metier-plan.md
--
-- CE QUE FAIT CETTE MIGRATION
--   Elle fait passer l'octroi de droits de TROIS couches à DEUX :
--     + AJOUT   `org_role_permission` (ORG × rôle métier × permission) et un chemin « rôle »
--               dans `api.user_has_permission()`.
--     - RETRAIT du chemin `org_permission`, qui accordait à TOUS les membres d'une ORG sans
--               regarder leur rôle.
--     = GARDE   `user_permission` — désormais lu comme ce qu'il est : des EXCEPTIONS.
--
-- ═══ L'INCIDENT QUE CETTE MIGRATION FERME (2026-08-31) ═══
--
--   Le rôle métier n'était qu'une ÉTIQUETTE : l'architecture SP-2 (§24) pose que « le rôle
--   métier ne confère aucun droit implicite », et le préréglage n'était qu'une constante
--   TypeScript qu'un bouton appliquait à la main, une fois. Rien ne garantissait qu'un
--   « Lecteur » ne pût pas écrire.
--
--   Le 31/08 à 11:54, douze appels à `rpc_grant_org_permission` (les cases « Permissions par
--   défaut de l'organisation », logées dans le tiroir d'un MEMBRE nommé) ont accordé les 12
--   permissions du catalogue à l'ORG entière. `api.user_has_permission()` acceptant le chemin
--   ORG, les trois Lecteurs de l'ORG — 0 droit individuel, aucun rôle admin, non superusers —
--   ont gagné l'écriture CRM, la publication, l'édition des horaires/tarifs/galerie et la
--   conformité juridique. Le compteur de l'écran /team affichait « 12 permissions » pour tout
--   le monde : il ne mentait pas, il constatait.
--
--   La couche fautive n'est pas le clic : c'est une couche d'octroi AVEUGLE AU RÔLE. Tant
--   qu'elle existe, un seul geste peut re-donner l'écriture à toute une équipe. On la retire.
--
-- ═══ POURQUOI UNE SEULE FONCTION SUFFIT ═══
--
--   `api.user_has_permission()` est le point de passage UNIQUE : treize fonctions en dépendent
--   (`user_can_write_crm`, `user_can_publish_object`, `user_can_write_canonical`,
--   `user_can_create_object`, `user_can_moderate_object`, `user_can_manage_object_legal`,
--   `user_can_attach_object_document`, `user_can_write_enrichment`, `user_can_write_crm_actor`,
--   `current_user_can_edit_objects`, `current_user_can_write_crm_notes`, `list_pending_changes`,
--   `save_crm_actor`) et AUCUNE policy RLS ne l'appelle directement (vérifié le 31/08 :
--   0 policy contenant « user_has_permission »). Changer cette fonction propage partout ; il n'y
--   a ni policy ni fonction consommatrice à retoucher.
--
-- ═══ GARDE PRÉ-VOL — À EXÉCUTER AVANT D'APPLIQUER ═══
--
--   Retirer le chemin ORG coupe l'accès de quiconque ne tenait un droit QUE par lui. Cette
--   migration REFUSE de s'appliquer si `org_permission` porte encore une ligne active (voir le
--   bloc DO ci-dessous) : chaque ligne doit d'abord être reportée dans la matrice de rôle ou en
--   droit individuel. Au 2026-08-31 après remédiation : 0 ligne active, la voie est libre.
--
-- Idempotent. NON foldé dans schema_unified.sql.

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- 0. Garde pré-vol : aucun droit vivant ne doit dépendre du chemin qu'on retire.
-- ─────────────────────────────────────────────────────────────────────────────
DO $guard$
DECLARE
  v_actifs integer;
BEGIN
  SELECT count(*) INTO v_actifs FROM public.org_permission WHERE is_active;
  IF v_actifs > 0 THEN
    RAISE EXCEPTION
      'STOP: % octroi(s) ORG encore actif(s). Le chemin ORG est retiré par cette migration : '
      'reportez d''abord ces droits dans org_role_permission (matrice de rôle) ou en '
      'user_permission (exception individuelle), sinon des membres perdront l''accès sans préavis.',
      v_actifs;
  END IF;
END
$guard$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. La matrice : ORG × rôle métier × permission.
--
--    Portée PAR ORG (arbitrage PO 2026-08-31) : `ref_org_business_role` est une référence
--    partagée, mais chaque organisation décide de ce que SES Éditeurs peuvent faire. Une
--    matrice globale aurait fait qu'un réglage dans une ORG change l'accès dans une autre.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.org_role_permission (
  id            uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_object_id text NOT NULL REFERENCES public.object(id) ON DELETE CASCADE,
  role_id       uuid NOT NULL REFERENCES public.ref_org_business_role(id) ON DELETE CASCADE,
  permission_id uuid NOT NULL REFERENCES public.ref_permission(id) ON DELETE CASCADE,
  is_active     boolean NOT NULL DEFAULT TRUE,
  granted_by    uuid REFERENCES auth.users(id),
  granted_at    timestamptz NOT NULL DEFAULT NOW(),
  created_at    timestamptz NOT NULL DEFAULT NOW(),
  updated_at    timestamptz NOT NULL DEFAULT NOW(),
  CONSTRAINT org_role_permission_uniq UNIQUE (org_object_id, role_id, permission_id)
);

COMMENT ON TABLE public.org_role_permission IS
  'Droits CONFÉRÉS par un rôle métier, réglés par ORG (§227). Remplace org_permission, qui '
  'accordait à tous les membres sans regarder leur rôle.';

-- Index de la jointure chaude : `user_has_permission` la traverse à chaque garde d'écriture.
CREATE INDEX IF NOT EXISTS idx_org_role_permission_lookup
  ON public.org_role_permission (org_object_id, role_id, permission_id)
  WHERE is_active;

ALTER TABLE public.org_role_permission ENABLE ROW LEVEL SECURITY;

-- Lecture : un membre actif voit la matrice de SON ORG (l'écran /team en a besoin pour dire
-- d'où vient chaque droit). `(SELECT auth.uid())` et non `auth.uid()` — forme initplan,
-- conforme au balayage `migration_rls_initplan_sweep`.
DROP POLICY IF EXISTS org_role_permission_read ON public.org_role_permission;
CREATE POLICY org_role_permission_read ON public.org_role_permission
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.user_org_membership uom
    WHERE uom.user_id       = (SELECT auth.uid())
      AND uom.org_object_id = org_role_permission.org_object_id
      AND uom.is_active
  ));

-- Aucune policy INSERT/UPDATE/DELETE : l'écriture passe EXCLUSIVEMENT par
-- `api.rpc_set_role_permission` (SECURITY DEFINER, rang ≥ 30). Une policy d'écriture ici
-- ouvrirait une seconde voie que le contrôle de rang ne garderait pas.

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Seed : le préréglage SP-2 documenté, pour chaque ORG existante.
--
--    Source : bertel-tourism-ui/src/features/team/permission-presets.ts — c'est la convention
--    de rôle déjà écrite ; on la MATÉRIALISE au lieu de la laisser en constante applicative.
--    `viewer` n'apparaît pas : aucun droit, et c'est le fait qu'on veut rendre vrai.
--    ON CONFLICT DO NOTHING — un rejeu ne réactive pas un droit qu'un admin a retiré à la main.
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO public.org_role_permission (org_object_id, role_id, permission_id)
SELECT o.id, r.id, p.id
FROM public.object o
CROSS JOIN (VALUES
  ('contributor','create_object'),
  ('contributor','edit_canonical_when_publisher'),
  ('contributor','edit_org_enrichment'),
  ('contributor','edit_hours'),
  ('contributor','edit_pricing'),
  ('contributor','edit_gallery'),
  ('contributor','attach_documents'),
  ('editor','create_object'),
  ('editor','edit_canonical_when_publisher'),
  ('editor','edit_org_enrichment'),
  ('editor','edit_hours'),
  ('editor','edit_pricing'),
  ('editor','edit_gallery'),
  ('editor','attach_documents'),
  ('editor','publish_object'),
  ('editor','validate_changes'),
  ('editor','manage_team_messages'),
  ('editor','manage_legal_compliance'),
  -- §214 : « un éditeur doit pouvoir écrire du CRM » (arbitrage PO 2026-08-26). Sans cette
  -- ligne, `api.user_can_write_crm` rend FALSE et toute écriture CRM échoue en 42501.
  ('editor','write_crm_notes')
) AS seed(role_code, perm_code)
JOIN public.ref_org_business_role r ON r.code = seed.role_code
JOIN public.ref_permission        p ON p.code = seed.perm_code AND p.is_active
WHERE o.object_type = 'ORG'
ON CONFLICT ON CONSTRAINT org_role_permission_uniq DO NOTHING;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2bis. Semer AUSSI les ORG créées plus tard.
--
--    Le seed ci-dessus ne couvre que les ORG existant au moment de la migration. Sans ce
--    trigger, une ORG créée demain naîtrait avec une matrice VIDE : ses Éditeurs auraient
--    l'étiquette et zéro droit, et l'écran d'onboarding — qui n'accorde plus de permission
--    individuelle depuis §227 — ne le rattraperait pas. La panne serait muette et différée.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.seed_org_role_permission()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.org_role_permission (org_object_id, role_id, permission_id)
  SELECT NEW.id, r.id, p.id
  FROM (VALUES
    ('contributor','create_object'),
    ('contributor','edit_canonical_when_publisher'),
    ('contributor','edit_org_enrichment'),
    ('contributor','edit_hours'),
    ('contributor','edit_pricing'),
    ('contributor','edit_gallery'),
    ('contributor','attach_documents'),
    ('editor','create_object'),
    ('editor','edit_canonical_when_publisher'),
    ('editor','edit_org_enrichment'),
    ('editor','edit_hours'),
    ('editor','edit_pricing'),
    ('editor','edit_gallery'),
    ('editor','attach_documents'),
    ('editor','publish_object'),
    ('editor','validate_changes'),
    ('editor','manage_team_messages'),
    ('editor','manage_legal_compliance'),
    ('editor','write_crm_notes')
  ) AS seed(role_code, perm_code)
  JOIN public.ref_org_business_role r ON r.code = seed.role_code
  JOIN public.ref_permission        p ON p.code = seed.perm_code AND p.is_active
  ON CONFLICT ON CONSTRAINT org_role_permission_uniq DO NOTHING;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_seed_org_role_permission ON public.object;
CREATE TRIGGER trg_seed_org_role_permission
  AFTER INSERT ON public.object
  FOR EACH ROW WHEN (NEW.object_type = 'ORG')
  EXECUTE FUNCTION public.seed_org_role_permission();

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Le cœur : deux chemins, plus trois.
--
--    Chemin ORG SUPPRIMÉ. Ce n'est pas un nettoyage cosmétique — c'est la correction : tant
--    que ce chemin existe, un octroi aveugle au rôle peut re-donner l'écriture à une équipe
--    entière en un clic.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION api.user_has_permission(p_permission_code text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'api', 'auth'
AS $function$
  WITH perm AS (
    SELECT id
    FROM ref_permission
    WHERE code = p_permission_code
      AND is_active = TRUE
    LIMIT 1
  )
  SELECT
    -- Chemin 1 : droit accordé INDIVIDUELLEMENT — une exception, assumée comme telle.
    EXISTS (
      SELECT 1
      FROM user_permission up
      JOIN perm p ON p.id = up.permission_id
      WHERE up.user_id   = (SELECT auth.uid())
        AND up.is_active = TRUE
    )
    OR
    -- Chemin 2 : droit CONFÉRÉ par le rôle métier du membre, dans SON ORG (§227).
    -- La jointure sur `ubr.role_id = orp.role_id` est ce qui distingue cette couche de celle
    -- qu'elle remplace : l'ancienne accordait à tout membre de l'ORG, celle-ci n'accorde qu'aux
    -- membres qui portent le rôle visé.
    EXISTS (
      SELECT 1
      FROM org_role_permission orp
      JOIN perm p ON p.id = orp.permission_id
      JOIN user_org_membership     uom ON uom.org_object_id = orp.org_object_id
      JOIN user_org_business_role  ubr ON ubr.membership_id = uom.id
      WHERE uom.user_id   = (SELECT auth.uid())
        AND uom.is_active = TRUE
        AND ubr.is_active = TRUE
        AND ubr.role_id   = orp.role_id
        AND orp.is_active = TRUE
    );
$function$;

COMMENT ON FUNCTION api.user_has_permission(text) IS
  'Droits effectifs : exception individuelle OU rôle métier de l''ORG (§227). Le chemin '
  'org_permission a été retiré le 2026-08-31 — il accordait sans regarder le rôle.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Écriture de la matrice — rang ≥ 30, comme toute écriture de permission.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION api.rpc_set_role_permission(
  p_org_object_id   text,
  p_role_code       text,
  p_permission_code text,
  p_granted         boolean
)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'api', 'auth'
AS $function$
DECLARE
  v_caller_id     uuid := auth.uid();
  v_caller_rank   integer;
  v_role_id       uuid;
  v_permission_id uuid;
BEGIN
  -- 1. L'ORG cible doit être une ORG (mêmes garde et message que les RPC de permission).
  IF NOT EXISTS (
    SELECT 1 FROM object WHERE id = p_org_object_id AND object_type = 'ORG'
  ) THEN
    RAISE EXCEPTION 'INVALID_ORG: p_org_object_id doit référencer un objet de type ORG (valeur reçue : %)', p_org_object_id;
  END IF;

  -- 2. Résolution du rôle métier.
  SELECT id INTO v_role_id FROM ref_org_business_role WHERE code = p_role_code;
  IF v_role_id IS NULL THEN
    RAISE EXCEPTION 'NOT_FOUND: rôle métier inconnu : %', p_role_code;
  END IF;

  -- 3. Résolution de la permission (active seulement — on n'accorde pas un code retiré).
  SELECT id INTO v_permission_id
  FROM ref_permission WHERE code = p_permission_code AND is_active = TRUE;
  IF v_permission_id IS NULL THEN
    RAISE EXCEPTION 'NOT_FOUND: code permission inconnu ou inactif : %', p_permission_code;
  END IF;

  -- 4. Autorisation appelant.
  IF NOT api.is_platform_superuser() THEN
    SELECT r.rank INTO v_caller_rank
    FROM user_org_membership uom
    JOIN user_org_admin_role uar ON uar.membership_id = uom.id AND uar.is_active = TRUE
    JOIN ref_org_admin_role  r   ON r.id = uar.role_id
    WHERE uom.user_id       = v_caller_id
      AND uom.org_object_id = p_org_object_id
      AND uom.is_active     = TRUE;

    IF v_caller_rank IS NULL THEN
      RAISE EXCEPTION 'FORBIDDEN: vous n''avez pas de rôle d''administration dans cette ORG';
    END IF;
    IF v_caller_rank < 30 THEN
      RAISE EXCEPTION 'INSUFFICIENT_RANK: rang minimum requis 30 (org_admin) pour régler les permissions d''un rôle métier';
    END IF;
  END IF;

  -- 5. Bascule.
  --    Pas d'anti-self ici, contrairement aux RPC individuelles : la matrice porte sur un RÔLE,
  --    pas sur une personne. Un org_admin qui règle « Éditeur » se règle éventuellement
  --    lui-même — l'interdire rendrait la matrice inutilisable dans une ORG à un seul admin.
  IF p_granted THEN
    INSERT INTO org_role_permission (org_object_id, role_id, permission_id, is_active, granted_by, granted_at, created_at, updated_at)
    VALUES (p_org_object_id, v_role_id, v_permission_id, TRUE, v_caller_id, NOW(), NOW(), NOW())
    ON CONFLICT ON CONSTRAINT org_role_permission_uniq DO UPDATE
      SET is_active  = TRUE,
          granted_by = EXCLUDED.granted_by,
          granted_at = EXCLUDED.granted_at,
          updated_at = NOW();
  ELSE
    UPDATE org_role_permission
       SET is_active = FALSE, updated_at = NOW()
     WHERE org_object_id = p_org_object_id
       AND role_id       = v_role_id
       AND permission_id = v_permission_id
       AND is_active     = TRUE;
  END IF;
END;
$function$;

-- Lecture de la matrice pour l'écran /team. SECURITY DEFINER + prédicat d'appartenance :
-- la fonction ne rend la matrice qu'à un membre actif de l'ORG demandée.
CREATE OR REPLACE FUNCTION api.rpc_list_role_permissions(p_org_object_id text)
 RETURNS TABLE(role_code text, permission_code text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'api', 'auth'
AS $function$
  SELECT r.code::text, p.code::text
  FROM org_role_permission orp
  JOIN ref_org_business_role r ON r.id = orp.role_id
  JOIN ref_permission        p ON p.id = orp.permission_id
  WHERE orp.org_object_id = p_org_object_id
    AND orp.is_active
    AND EXISTS (
      SELECT 1 FROM user_org_membership uom
      WHERE uom.user_id       = auth.uid()
        AND uom.org_object_id = p_org_object_id
        AND uom.is_active
    );
$function$;

REVOKE ALL ON FUNCTION api.rpc_set_role_permission(text, text, text, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION api.rpc_list_role_permissions(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION api.rpc_set_role_permission(text, text, text, boolean) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION api.rpc_list_role_permissions(text) TO authenticated, service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4bis. Le roster de /team doit dire d'où vient chaque droit.
--
--    `rpc_list_org_members` émettait `inherited_permission_codes` depuis `org_permission`. La
--    laisser en l'état après le retrait du chemin ORG produirait exactement le défaut que ce
--    chantier corrige, à l'envers : l'écran afficherait « hérité de l'ORG » depuis une table
--    morte, et n'afficherait PAS les droits que le rôle confère réellement — un Éditeur à 12
--    droits se lirait « 0 permission ». Un compteur faux dans le sens rassurant est pire que
--    pas de compteur.
--
--    La colonne est RENOMMÉE (`inherited_` → `role_`) parce que la donnée change de nature :
--    elle n'est plus la même pour tous les membres, elle dépend du rôle de CHACUN — d'où la
--    corrélation sur `ubr.role_id` dans le sous-select. Garder l'ancien nom laisserait croire
--    à un héritage d'ORG et le front continuerait de l'afficher comme tel.
--
--    DROP puis CREATE : `CREATE OR REPLACE` ne peut pas changer le nom d'une colonne de sortie.
-- ─────────────────────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS api.rpc_list_org_members(text);

CREATE FUNCTION api.rpc_list_org_members(p_org_object_id text)
 RETURNS TABLE(
   membership_id uuid, user_id uuid, email text, display_name text, is_active boolean,
   business_role_code text, admin_role_code text, permission_codes text[],
   last_seen_at timestamptz, role_permission_codes text[], is_platform_superuser boolean)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'api', 'auth'
AS $function$
BEGIN
  IF NOT (
    api.is_platform_superuser()
    OR EXISTS (
      SELECT 1 FROM user_org_membership m
      JOIN user_org_admin_role uar ON uar.membership_id = m.id AND uar.is_active = TRUE
      WHERE m.user_id = auth.uid() AND m.is_active = TRUE AND m.org_object_id = p_org_object_id
    )
  ) THEN
    RAISE EXCEPTION 'INSUFFICIENT_RANK: an active admin role in this org is required to list its members'
      USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    m.id, m.user_id, u.email::text, p.display_name, m.is_active,
    br.code::text, ar.code::text,
    -- Exceptions INDIVIDUELLES — ce que pilotent les cases du tiroir d'un membre.
    COALESCE((
      SELECT array_agg(rp.code::text ORDER BY rp.code)
      FROM user_permission up JOIN ref_permission rp ON rp.id = up.permission_id
      WHERE up.user_id = m.user_id AND up.is_active = TRUE
    ), ARRAY[]::text[]),
    -- Dernière activité : last_sign_in_at ne suffit pas (une session survit sans nouveau
    -- sign-in), le signal de présence est le refresh du jeton. GREATEST ignore les NULL.
    GREATEST(
      u.last_sign_in_at,
      (SELECT max(s.updated_at) FROM auth.sessions s WHERE s.user_id = m.user_id)
    ),
    -- Droits CONFÉRÉS par le rôle de CE membre (§227). Corrélé sur ubr.role_id : deux membres
    -- de la même ORG mais de rôles différents ne reçoivent pas le même tableau.
    -- Un membre sans rôle métier actif rend ARRAY[] — et c'est exact, il n'a aucun droit conféré.
    COALESCE((
      SELECT array_agg(rp2.code::text ORDER BY rp2.code)
      FROM org_role_permission orp
      JOIN ref_permission rp2 ON rp2.id = orp.permission_id
      WHERE orp.org_object_id = m.org_object_id
        AND orp.role_id       = ubr.role_id
        AND orp.is_active     = TRUE
    ), ARRAY[]::text[]),
    -- Superuser plateforme. Même source que api.is_platform_superuser() côté profil ; le bras
    -- auth.role() de cette fonction décrit la SESSION, pas le compte listé.
    COALESCE(p.role IN ('owner', 'super_admin'), FALSE)
  FROM user_org_membership m
  LEFT JOIN auth.users u                ON u.id = m.user_id
  LEFT JOIN app_user_profile p          ON p.id = m.user_id
  LEFT JOIN user_org_business_role ubr  ON ubr.membership_id = m.id AND ubr.is_active = TRUE
  LEFT JOIN ref_org_business_role br    ON br.id = ubr.role_id
  LEFT JOIN user_org_admin_role uar2    ON uar2.membership_id = m.id AND uar2.is_active = TRUE
  LEFT JOIN ref_org_admin_role ar       ON ar.id = uar2.role_id
  WHERE m.org_object_id = p_org_object_id AND m.is_active = TRUE
  ORDER BY p.display_name NULLS LAST, u.email;
END;
$function$;

REVOKE ALL ON FUNCTION api.rpc_list_org_members(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION api.rpc_list_org_members(text) TO authenticated, service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Fermer l'ancienne voie.
--
--    Retirer le chemin de lecture sans retirer les RPC d'écriture laisserait deux boutons qui
--    écrivent dans une table que plus personne ne lit : le pire des deux mondes — l'admin croit
--    accorder un droit, rien ne se produit, et aucune erreur ne le dit.
--    La TABLE `org_permission` est conservée (traçabilité de l'incident du 31/08 ; sa
--    suppression est un geste séparé, après une période d'observation).
-- ─────────────────────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS api.rpc_grant_org_permission(text, text);
DROP FUNCTION IF EXISTS api.rpc_revoke_org_permission(text, text);

COMMENT ON TABLE public.org_permission IS
  'HORS SERVICE depuis le 2026-08-31 (§227) : plus lue par api.user_has_permission, plus '
  'écrite par aucune RPC. Conservée pour la traçabilité de l''incident du 31/08. '
  'Remplacée par org_role_permission.';

COMMIT;

-- ═══════════════════════════════════════════════════════════════════════════
-- VÉRIFICATIONS POST-APPLICATION (à jouer à la main, hors transaction)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- V1. Le seed a pris, par ORG : contributor = 7, editor = 12, viewer absent.
--
--   SELECT o.name, r.code AS role, count(*) AS n
--   FROM org_role_permission orp
--   JOIN ref_org_business_role r ON r.id = orp.role_id
--   JOIN object o ON o.id = orp.org_object_id
--   WHERE orp.is_active GROUP BY 1,2 ORDER BY 1,2;
--
-- V2. SABOTAGE — la garde doit BOUGER dans les deux sens.
--     Une garde qu'on n'a pas sabotée n'est pas une garde : si la jointure de rôle est morte,
--     `user_has_permission` rend FALSE en permanence et un test « le Lecteur ne peut pas »
--     passerait quand même.
--
--   -- (a) attendu FALSE — un Lecteur n'a pas write_crm_notes
--   SET LOCAL role authenticated;
--   SET LOCAL request.jwt.claims TO '{"sub":"<uuid-d-un-lecteur>","role":"authenticated"}';
--   SELECT api.user_has_permission('write_crm_notes');
--
--   -- (b) on accorde au RÔLE viewer, attendu TRUE
--   SELECT api.rpc_set_role_permission('<ORG>','viewer','write_crm_notes',true);   -- en admin
--   SELECT api.user_has_permission('write_crm_notes');                             -- en lecteur
--
--   -- (c) on retire, attendu FALSE de nouveau — ET ON RETIRE VRAIMENT
--   SELECT api.rpc_set_role_permission('<ORG>','viewer','write_crm_notes',false);
--   SELECT api.user_has_permission('write_crm_notes');
--
--   Si (a) et (b) rendent la même valeur, la jointure de rôle ne mord pas : STOP.
--
-- V3. Les treize consommateurs sont intacts (ils héritent, on n'en retouche aucun).
--
--   SELECT n.nspname||'.'||p.proname
--   FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
--   WHERE p.prokind='f' AND n.nspname IN ('api','public')
--     AND pg_get_functiondef(p.oid) ILIKE '%user_has_permission%'
--     AND p.proname <> 'user_has_permission'
--   ORDER BY 1;
--
--   Attendu 13 lignes : current_user_can_edit_objects, current_user_can_write_crm_notes,
--   list_pending_changes, save_crm_actor, user_can_attach_object_document,
--   user_can_create_object, user_can_manage_object_legal, user_can_moderate_object,
--   user_can_publish_object, user_can_write_canonical, user_can_write_crm,
--   user_can_write_crm_actor, user_can_write_enrichment.
--
-- V4. Les anciennes RPC d'ORG ont disparu (aucun bouton mort côté front).
--
--   SELECT proname FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
--   WHERE n.nspname='api' AND proname LIKE '%org_permission%';
--
--   Attendu : 0 ligne.
