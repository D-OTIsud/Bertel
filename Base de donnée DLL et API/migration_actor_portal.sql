-- ═══════════════════════════════════════════════════════════════════════════════════════
-- 18a — Portail acteur : persona, portée, soumissions vérifiées, validation D9.
-- Spec : docs/superpowers/specs/2026-09-01-portail-acteur-design.md
-- ⚠ Le créneau « 18a » est PROVISOIRE : re-grep docs/SQL_ROLLOUT_RUNBOOK.md ET
-- ci_fresh_apply.sql au moment du packaging (Task 9) — un chantier concurrent peut
-- avoir occupé le créneau (précédent : 17m renuméroté).
--
-- CE QUE FAIT CETTE MIGRATION (sections numérotées, une par task du plan) :
--  1. Persona `actor` (CHECK app_user_profile.role) + helpers is_actor_persona /
--     current_user_actor_id / current_user_portal_object_ids + branchement de la portée
--     dans current_user_extended_object_ids (bras 1b fermé, liens expirés exclus,
--     pont e-mail ignoré pour cette persona). can_read_extended délègue déjà à la
--     fonction ensembliste : UNE seule fonction à brancher, l'équivalence tient seule.
--  2. D7 — is_object_owner ferme l'écriture canonique aux personas acteur.
--  3. DDL — fiche_submission, pending_change.submission_id, org_actor_module_visibility,
--     kind 'fiche_submission_reviewed' (CHECK + index outbox élargis).
--  4. Vérificateurs + visibilité (list_object_verifier_ids, get/set visibility).
--  5. submit_actor_fiche (transactionnel : soumission + N pending_change + tâche
--     multi-assignée + notifications kind crm_task_assigned réutilisé).
--  6. Lectures acteur (list_my_portal_fiches, list_my_submissions, get_my_actor_profile).
--  7. D9 — approve_pending_change(p_applied_manually) ferme le trou « manual_apply
--     jamais approuvable » ; approve/reject_fiche_submission ; list_pending_changes
--     enrichi (submission_id, note, acteur, manual_apply).
--  8. Résolution (trigger), notification acteur, outbox élargie, list_crm_tasks émet
--     extra, RGPD (délie le compte portail).
--
-- Idempotente. NON foldée dans schema_unified.sql (pattern 17i/17m).
-- NOTIFY pgrst requis (fonctions api.* nouvelles/modifiées) — fait en fin de fichier.
-- Dépend de : rls_policies.sql, migration_permission_write_paths.sql,
--   migration_moderation_rpcs.sql, migration_crm_task_multi_assignee_notifications.sql,
--   migration_crm_task_email_documents.sql, migration_role_permission_matrix.sql (17i :
--   org_role_permission), migration_actor_links_editor.sql.
-- Couverte par tests/test_actor_portal.sql.
-- ═══════════════════════════════════════════════════════════════════════════════════════

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Persona `actor` + portée portail.
-- ─────────────────────────────────────────────────────────────────────────────

-- 1.1 Le CHECK gagne la valeur 'actor'. On préserve l'arm IS NULL (profil sans rôle =
-- session bricolée côté front, mais des lignes NULL existent légitimement en base).
ALTER TABLE public.app_user_profile DROP CONSTRAINT IF EXISTS app_user_profile_role_check;
ALTER TABLE public.app_user_profile ADD CONSTRAINT app_user_profile_role_check
  CHECK (role IS NULL OR role IN ('owner', 'super_admin', 'tourism_agent', 'actor'));

-- 1.2 La persona. COALESCE(…, FALSE) : auth.uid() est NULL hors HTTP (psql, pooler) —
-- sans lui la sonde rendrait NULL et chaque consommateur `IF NOT …` deviendrait
-- FAIL-OPEN (doctrine §204, même motif que user_can_assign_crm).
CREATE OR REPLACE FUNCTION api.is_actor_persona()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, api, auth, pg_temp
AS $$
  SELECT COALESCE(
    (SELECT p.role = 'actor' FROM app_user_profile p WHERE p.id = (SELECT auth.uid())),
    FALSE);
$$;

-- 1.3 Le lien explicite compte↔acteur (D8) : app_user_profile.actor_id, colonne dormante
-- depuis sa migration d'origine, devient LA source de vérité du portail. Le pont e-mail
-- (api.user_actor_ids) reste intact pour les personas non-acteur.
CREATE OR REPLACE FUNCTION api.current_user_actor_id()
RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, api, auth, pg_temp
AS $$
  SELECT p.actor_id FROM app_user_profile p WHERE p.id = (SELECT auth.uid());
$$;

-- 1.4 La portée portail : les fiches où MON acteur (actor_id explicite, jamais l'e-mail)
-- tient un lien NON expiré, hors objets ORG (l'éditeur ne les supporte pas).
-- `visibility` du lien n'entre PAS dans le prédicat : elle gouverne la DIFFUSION du
-- lien, pas les droits (doctrine is_public).
CREATE OR REPLACE FUNCTION api.current_user_portal_object_ids()
RETURNS SETOF text
LANGUAGE sql STABLE SECURITY DEFINER
-- §208/R2.1 : pg_temp EXPLICITEMENT EN DERNIER (cette feuille décide de la lecture).
SET search_path = pg_catalog, public, api, auth, pg_temp
AS $$
  -- DISTINCT (ajout Task 6, constat de revue Task 1) : actor_object_role n'a PAS de contrainte
  -- d'unicité par (actor_id, object_id) — sa PK inclut role_id. Un acteur qui tient DEUX rôles
  -- valides sur LA MÊME fiche (ex. operator + sales_manager) fait sortir cet object_id EN
  -- DOUBLE. Resté sans effet tant que les consommateurs étaient insensibles au doublon (`IN
  -- (…)`, `EXISTS`) — mais list_my_portal_fiches (§6) JOINT directement dessus : sans ce
  -- DISTINCT, le prestataire verrait sa fiche affichée DEUX FOIS sur l'accueil du portail.
  -- Correction à la SOURCE plutôt que côté §6 : ferme le trou pour tout futur consommateur
  -- direct, pas seulement celui-ci. Reproduit et prouvé au test, bloc G (fixture dédiée : un
  -- second rôle valide posé sur l'objet déjà lié du bloc B).
  SELECT DISTINCT aor.object_id
  FROM actor_object_role aor
  JOIN object o ON o.id = aor.object_id
  WHERE aor.actor_id = api.current_user_actor_id()
    AND (aor.valid_from IS NULL OR aor.valid_from <= CURRENT_DATE)
    AND (aor.valid_to   IS NULL OR aor.valid_to   >= CURRENT_DATE)
    AND o.object_type <> 'ORG';
$$;
REVOKE EXECUTE ON FUNCTION api.current_user_portal_object_ids() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION api.current_user_portal_object_ids() TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION api.is_actor_persona()        FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION api.is_actor_persona()        TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION api.current_user_actor_id()   FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION api.current_user_actor_id()   TO authenticated, service_role;

-- 1.5 Branchement de tête dans la fonction ensembliste. Pour la persona acteur, la
-- portée étendue EST la portée portail — le pont e-mail (bras 1a/1b) est ignoré :
-- il accorderait les fiches d'un homonyme d'e-mail et TOUTES les fiches de l'ORG.
-- api.can_read_extended délègue déjà à cette fonction (« one source of truth », voir
-- son en-tête dans rls_policies.sql) : le branchement se propage seul aux ~40 policies
-- de lecture. Les 5 bras historiques sont recopiés BYTE-À-BYTE depuis rls_policies.sql
-- (L149-180) — ne pas les « améliorer » ici.
CREATE OR REPLACE FUNCTION api.current_user_extended_object_ids()
RETURNS SETOF text
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public, api, auth, pg_temp
AS $$
BEGIN
  IF api.is_actor_persona() THEN
    RETURN QUERY SELECT * FROM api.current_user_portal_object_ids();
    RETURN;
  END IF;
  RETURN QUERY
  -- Chemin 1a : un acteur du user a un rôle directement sur l'objet
  SELECT aor.object_id FROM actor_object_role aor
  WHERE aor.actor_id IN (SELECT api.user_actor_ids())
  UNION
  -- Chemin 1b : un acteur du user a un rôle sur l'ORG publicatrice de l'objet
  SELECT ool.object_id FROM object_org_link ool
  WHERE ool.org_object_id IN (
    SELECT aor.object_id FROM actor_object_role aor
    WHERE aor.actor_id IN (SELECT api.user_actor_ids())
  )
  UNION
  -- Chemin 2A : l'objet EST l'ORG du user (membership actif)
  SELECT uom.org_object_id FROM user_org_membership uom
  WHERE uom.user_id = auth.uid() AND uom.is_active = TRUE
  UNION
  -- Chemin 2B : objet rattaché à l'ORG du user (tous rôles, publiés ou non)
  SELECT ool.object_id FROM user_org_membership uom
  JOIN object_org_link ool ON ool.org_object_id = uom.org_object_id
  WHERE uom.user_id = auth.uid() AND uom.is_active = TRUE
  UNION
  -- Chemin 2C : périmètre externe publié (org_config.access_scope = 'all_published')
  SELECT o.id FROM object o
  WHERE o.status = 'published'
    AND EXISTS (
      SELECT 1 FROM user_org_membership uom
      JOIN org_config oc ON oc.org_object_id = uom.org_object_id
      WHERE uom.user_id = auth.uid() AND uom.is_active = TRUE
        AND oc.access_scope = 'all_published'
    );
END;
$$;
REVOKE EXECUTE ON FUNCTION api.current_user_extended_object_ids() FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION api.current_user_extended_object_ids() TO anon, authenticated, service_role;

COMMENT ON FUNCTION api.is_actor_persona() IS
  '18a portail acteur — TRUE si le profil courant est role=actor. Fail-closed (§204).';
COMMENT ON FUNCTION api.current_user_actor_id() IS
  '18a portail acteur — actor_id EXPLICITE du compte (app_user_profile.actor_id, posé à l''invitation). Jamais le pont e-mail.';
COMMENT ON FUNCTION api.current_user_portal_object_ids() IS
  '18a portail acteur — fiches du portail : liens actor_object_role NON expirés de MON actor_id, hors ORG.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. D7 — l'écriture canonique se ferme aux personas acteur.
--    Avant : e-mail correspondant (pont api.user_actor_ids) + actor_object_role.is_primary=TRUE
--    ⇒ écriture canonique COMPLÈTE (objet + 23 tables enfant + tous les save_object_*), sans
--    ORG, sans rôle, sans permission. Contradictoire avec D2 (« retenu jusqu'à validation »).
--    Le bras service_role/superuser est inchangé ; les équipes internes qui empruntent le
--    chemin owner historique (non-acteurs) le gardent — seule la persona acteur en est
--    exclue. Corps recopié depuis le corps VIF (md5(prosrc)=c1cc3ac8996cf9cdf0f5dd0adb7ae53c,
--    re-vérifié juste avant cette écriture, identique à l'archive Task 0 — l'écart avec
--    rls_policies.sql, sa source déclarative, est purement cosmétique : un saut de ligne
--    après « SELECT 1 »), seul le `AND NOT api.is_actor_persona()` est ajouté.
--    Durcissement (hors brief, doctrine §208/R2.1 — cette fonction LIT actor_object_role) :
--    `pg_temp` ajouté en fin de search_path, absent du corps vif. C'est un ajout défensif
--    qui ne change aucun comportement (aucune table temporaire nommée `actor_object_role`,
--    `app_user_profile` etc. n'existe dans ce contexte) — pas une régression.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION api.is_object_owner(p_object_id text)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, api, auth, pg_temp
AS $$
  SELECT (
    EXISTS (
      SELECT 1
      FROM actor_object_role aor
      WHERE aor.actor_id IN (SELECT * FROM api.user_actor_ids())
        AND aor.object_id = p_object_id
        AND aor.is_primary = TRUE
    )
    -- D7 (18a) : une persona acteur ne tient JAMAIS l'écriture canonique par son lien.
    AND NOT api.is_actor_persona()
  )
  OR auth.role() IN ('service_role','admin')
  OR api.is_platform_superuser();
$$;
COMMENT ON FUNCTION api.is_object_owner(p_object_id text) IS
  '18a/D7 — owner historique (lien primaire via pont e-mail) FERMÉ aux personas actor ; intact pour le reste.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. DDL — soumissions, visibilité par module, nouvelle espèce de notification.
-- ─────────────────────────────────────────────────────────────────────────────

-- 3.1 fiche_submission : UNE ligne par « Soumettre » (D6). Regroupe les N pending_change
-- d'un même geste, porte le message de l'acteur, le statut agrégé et la tâche liée.
CREATE TABLE IF NOT EXISTS public.fiche_submission (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  object_id     text NOT NULL REFERENCES public.object(id) ON DELETE CASCADE,
  actor_id      uuid REFERENCES public.actor(id) ON DELETE SET NULL,
  submitted_by  uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  note          text,
  status        text NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending', 'approved', 'rejected', 'partial')),
  task_id       uuid REFERENCES public.crm_task(id) ON DELETE SET NULL,
  submitted_at  timestamptz NOT NULL DEFAULT now(),
  resolved_at   timestamptz
);
CREATE INDEX IF NOT EXISTS idx_fiche_submission_object ON public.fiche_submission (object_id, status);
CREATE INDEX IF NOT EXISTS idx_fiche_submission_actor  ON public.fiche_submission (submitted_by, submitted_at DESC);
-- Anti-spam structurel (D6) : UNE seule soumission ouverte par fiche. Le RPC de soumission
-- (section 5) rend un message propre ; cet index est la garde de dernier ressort (course).
CREATE UNIQUE INDEX IF NOT EXISTS uq_fiche_submission_open
  ON public.fiche_submission (object_id) WHERE status = 'pending';

-- 3.2 Rattachement des changements à leur soumission. SET NULL : la résolution d'une
-- soumission ne doit jamais empêcher la purge d'une ligne pending_change isolée.
ALTER TABLE public.pending_change ADD COLUMN IF NOT EXISTS submission_id uuid
  REFERENCES public.fiche_submission(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_pending_change_submission
  ON public.pending_change (submission_id) WHERE submission_id IS NOT NULL;

-- 3.3 Masquage org × type × MODULE (D4/D5). Absence de ligne = visible (défaut ouvert) ;
-- le PLANCHER DUR (modules jamais montrés aux acteurs) est codé dans les fonctions,
-- pas dans cette table — il n'est PAS paramétrable.
CREATE TABLE IF NOT EXISTS public.org_actor_module_visibility (
  org_object_id text NOT NULL REFERENCES public.object(id) ON DELETE CASCADE,
  object_type   text NOT NULL,
  module_id     text NOT NULL,
  is_visible    boolean NOT NULL DEFAULT TRUE,
  updated_by    uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (org_object_id, object_type, module_id)
);

-- 3.4 RLS : fiche_submission et la matrice suivent le régime pending_change/crm_* —
-- service_role/admin uniquement, tout accès via RPC DEFINER.
ALTER TABLE public.fiche_submission            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.org_actor_module_visibility ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS admin_fiche_submission ON public.fiche_submission;
CREATE POLICY admin_fiche_submission ON public.fiche_submission FOR ALL
  USING ((SELECT auth.role()) = ANY (ARRAY['service_role','admin']));
DROP POLICY IF EXISTS admin_org_actor_module_visibility ON public.org_actor_module_visibility;
CREATE POLICY admin_org_actor_module_visibility ON public.org_actor_module_visibility FOR ALL
  USING ((SELECT auth.role()) = ANY (ARRAY['service_role','admin']));

REVOKE ALL ON TABLE public.fiche_submission            FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.org_actor_module_visibility FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.fiche_submission            TO service_role;
GRANT ALL ON TABLE public.org_actor_module_visibility TO service_role;

-- 3.5 Nouvelle espèce de notification : le retour à l'ACTEUR quand sa soumission est
-- résolue. Côté éditeurs on RÉUTILISE 'crm_task_assigned' (la tâche EST assignée) —
-- zéro nouvelle espèce dans ce sens.
ALTER TABLE public.app_notification DROP CONSTRAINT IF EXISTS chk_app_notification_kind;
ALTER TABLE public.app_notification ADD CONSTRAINT chk_app_notification_kind
  CHECK (kind IN ('crm_task_assigned', 'fiche_submission_reviewed'));

-- 3.6 L'index outbox suit le CHECK — les 3 pièces (CHECK, index, claim/ack section 8)
-- s'élargissent ENSEMBLE, sinon la file fuit (invariant spec §6).
DROP INDEX IF EXISTS public.idx_app_notification_unmailed;
CREATE INDEX IF NOT EXISTS idx_app_notification_unmailed
  ON public.app_notification (created_at)
  WHERE email_sent_at IS NULL
    AND kind IN ('crm_task_assigned', 'fiche_submission_reviewed')
    AND email_attempts < 5;

COMMENT ON TABLE public.fiche_submission IS
  '18a — un « Soumettre » du portail acteur : groupe N pending_change, porte le message, le statut agrégé et la tâche de vérification.';
COMMENT ON TABLE public.org_actor_module_visibility IS
  '18a — masquage org × type × module de l''éditeur portail. Absence de ligne = visible. Le plancher dur est dans les fonctions.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Vérificateurs (D3) + visibilité des modules (D4/D5).
-- ─────────────────────────────────────────────────────────────────────────────

-- 4.1 Le plancher dur : modules JAMAIS montrés/acceptés côté acteur, quelle que soit la
-- config. §18 Juridique (legal), §19 Suivi prestataire (provider-follow-up = notes
-- privées), §21 Publication (publication), §22 Identifiants externes (sync-identifiers),
-- plus les modules READONLY de l'éditeur (distribution, provider). Ajout 2026-09-02 :
-- relationships (son writer auto save_object_relations réécrit object_org_link ET
-- actor_object_role — le périmètre même de l'acteur), places (save_object_places
-- supprime les médias des sous-lieux absents du payload), media (aucun chemin
-- d'upload ni d'application pour un acteur, D11). Fonction plutôt que table : non
-- paramétrable PAR CONSTRUCTION.
CREATE OR REPLACE FUNCTION api.actor_portal_floor_modules()
RETURNS text[]
LANGUAGE sql IMMUTABLE
AS $$
  SELECT ARRAY['legal','provider-follow-up','publication','sync-identifiers','distribution','provider',
               'relationships','places','media'];
$$;

-- 4.2 Les vérificateurs d'une fiche (D3) : membres ACTIFS d'une ORG publisher de l'objet
-- tenant validate_changes — par la matrice de rôle (17i) OU par grant individuel.
-- REPLI (corrigé en revue Task 4, ruling contrôleur) : superutilisateurs plateforme
-- actifs (app_user_profile.role IN ('owner','super_admin')) — JAMAIS les rangs admin
-- de l'ORG. Fait vérifié en base : api.user_has_permission() (donc
-- api.user_can_moderate_object, donc le bouton Approuver) n'a que DEUX chemins —
-- grant individuel (user_permission) et rôle métier (user_org_business_role ×
-- org_role_permission, §227) — et ignore TOTALEMENT user_org_admin_role. Un rang
-- admin sans validate_changes échouerait donc user_can_moderate_object en 42501 :
-- la tâche assignée serait injouable et la fiche resterait bloquée à vie
-- (uq_fiche_submission_open n'autorise qu'une soumission ouverte à la fois) — pire
-- qu'une liste vide, car muet. Un superuser plateforme, lui, satisfait
-- user_can_moderate_object ET is_object_owner INCONDITIONNELLEMENT (leur bras
-- is_platform_superuser(), commun aux deux) : le prérequis « tout vérificateur a
-- aussi l'écriture canonique » tient toujours. Peut rendre VIDE si aucun
-- superuser n'existe (la soumission n'échoue pas pour ça — spec §7, tâche part
-- non assignée, assignee_count=0 signalé au client).
CREATE OR REPLACE FUNCTION api.list_object_verifier_ids(p_object_id text)
RETURNS SETOF uuid
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, api, auth, pg_temp
AS $$
BEGIN
  RETURN QUERY
  WITH pub_orgs AS (
    SELECT ool.org_object_id
    FROM object_org_link ool
    JOIN ref_org_role r ON r.id = ool.role_id AND r.code = 'publisher'
    WHERE ool.object_id = p_object_id
  ), perm AS (
    SELECT id FROM ref_permission WHERE code = 'validate_changes' AND is_active LIMIT 1
  ), members AS (
    SELECT uom.id AS membership_id, uom.user_id, uom.org_object_id
    FROM user_org_membership uom
    JOIN pub_orgs p ON p.org_object_id = uom.org_object_id
    WHERE uom.is_active
  )
  SELECT DISTINCT m.user_id FROM members m
  JOIN user_org_business_role ubr ON ubr.membership_id = m.membership_id AND ubr.is_active
  JOIN org_role_permission orp
    ON orp.org_object_id = m.org_object_id
   AND orp.role_id = ubr.role_id AND orp.is_active
  JOIN perm ON perm.id = orp.permission_id
  UNION
  SELECT DISTINCT m.user_id FROM members m
  JOIN user_permission up ON up.user_id = m.user_id AND up.is_active
  JOIN perm ON perm.id = up.permission_id;

  IF NOT FOUND THEN
    -- Repli : superutilisateurs plateforme actifs (PAS les rangs admin de l'ORG —
    -- cf. commentaire ci-dessus). Même prédicat que api.is_platform_superuser() sur
    -- son bras app_user_profile : garantit que CHAQUE id rendu ici satisfait
    -- api.user_can_moderate_object (invariant prouvé au test, bloc E).
    RETURN QUERY
    SELECT p.id
    FROM app_user_profile p
    WHERE p.role IN ('owner', 'super_admin');
  END IF;
END;
$$;

-- 4.3 Lecture de la matrice pour /settings (org + type explicites). Membres actifs de
-- l'ORG uniquement (même périmètre que la policy SELECT d'org_role_permission).
CREATE OR REPLACE FUNCTION api.get_actor_section_visibility(p_org_object_id text, p_object_type text)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, api, auth, pg_temp
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM user_org_membership uom
    WHERE uom.user_id = (SELECT auth.uid()) AND uom.org_object_id = p_org_object_id AND uom.is_active
  ) AND NOT api.is_platform_superuser() THEN
    RAISE EXCEPTION 'Réservé aux membres de l''organisation' USING ERRCODE = '42501';
  END IF;
  RETURN jsonb_build_object(
    'floor_modules', to_jsonb(api.actor_portal_floor_modules()),
    'masked_modules', COALESCE((
      SELECT jsonb_agg(v.module_id ORDER BY v.module_id)
      FROM org_actor_module_visibility v
      WHERE v.org_object_id = p_org_object_id AND v.object_type = p_object_type
        AND v.is_visible = FALSE), '[]'::jsonb));
END;
$$;

-- 4.4 Variante portail : résout l'ORG publisher (primaire d'abord) et le type depuis la
-- fiche. Autorisée : persona acteur pour une fiche de SA portée, membres de l'ORG,
-- superuser. C'est elle que consomme l'éditeur en mode portail (front ET section 5).
CREATE OR REPLACE FUNCTION api.get_portal_section_visibility(p_object_id text)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, api, auth, pg_temp
AS $$
DECLARE
  v_org  text;
  v_type text;
BEGIN
  IF NOT (
    (api.is_actor_persona()
      AND p_object_id IN (SELECT api.current_user_portal_object_ids()))
    OR api.is_platform_superuser()
    OR EXISTS (
      SELECT 1 FROM object_org_link ool
      JOIN user_org_membership uom ON uom.org_object_id = ool.org_object_id AND uom.is_active
      WHERE ool.object_id = p_object_id AND uom.user_id = (SELECT auth.uid()))
  ) THEN
    RAISE EXCEPTION 'Fiche hors de votre périmètre' USING ERRCODE = '42501';
  END IF;

  SELECT o.object_type INTO v_type FROM object o WHERE o.id = p_object_id;
  SELECT ool.org_object_id INTO v_org
  FROM object_org_link ool
  JOIN ref_org_role r ON r.id = ool.role_id AND r.code = 'publisher'
  WHERE ool.object_id = p_object_id
  ORDER BY ool.is_primary DESC NULLS LAST, ool.org_object_id
  LIMIT 1;

  RETURN jsonb_build_object(
    'floor_modules', to_jsonb(api.actor_portal_floor_modules()),
    'masked_modules', COALESCE((
      SELECT jsonb_agg(v.module_id ORDER BY v.module_id)
      FROM org_actor_module_visibility v
      WHERE v.org_object_id = v_org AND v.object_type = v_type
        AND v.is_visible = FALSE), '[]'::jsonb));
END;
$$;

-- 4.5 Écriture de la matrice : rang admin ≥ 30 sur l'ORG (même seuil que
-- rpc_set_role_permission). Refuse le plancher dur — même pour le RE-rendre visible :
-- une ligne « legal visible » en base serait un mensonge, la fonction l'ignorerait.
CREATE OR REPLACE FUNCTION api.rpc_set_actor_section_visibility(
  p_org_object_id text, p_object_type text, p_module_id text, p_visible boolean)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = public, api, auth, pg_temp
AS $$
BEGIN
  IF p_module_id = ANY (api.actor_portal_floor_modules()) THEN
    RAISE EXCEPTION 'Le module % appartient au plancher non paramétrable', p_module_id
      USING ERRCODE = '22023';
  END IF;
  IF NOT (api.is_platform_superuser() OR EXISTS (
    SELECT 1 FROM user_org_membership uom
    JOIN user_org_admin_role uar ON uar.membership_id = uom.id AND uar.is_active
    JOIN ref_org_admin_role rar ON rar.id = uar.role_id AND rar.rank >= 30
    WHERE uom.user_id = (SELECT auth.uid())
      AND uom.org_object_id = p_org_object_id AND uom.is_active
  )) THEN
    RAISE EXCEPTION 'Réservé aux administrateurs d''organisation (rang >= 30)'
      USING ERRCODE = '42501';
  END IF;

  INSERT INTO org_actor_module_visibility (org_object_id, object_type, module_id, is_visible, updated_by)
  VALUES (p_org_object_id, p_object_type, p_module_id, p_visible, (SELECT auth.uid()))
  ON CONFLICT (org_object_id, object_type, module_id)
  DO UPDATE SET is_visible = EXCLUDED.is_visible, updated_by = EXCLUDED.updated_by, updated_at = now();

  RETURN jsonb_build_object('org_object_id', p_org_object_id, 'object_type', p_object_type,
                            'module_id', p_module_id, 'is_visible', p_visible);
END;
$$;

REVOKE ALL ON FUNCTION api.actor_portal_floor_modules()                                   FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION api.list_object_verifier_ids(text)                                 FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION api.get_actor_section_visibility(text, text)                       FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION api.get_portal_section_visibility(text)                            FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION api.rpc_set_actor_section_visibility(text, text, text, boolean)    FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION api.actor_portal_floor_modules()                                TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION api.list_object_verifier_ids(text)                              TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION api.get_actor_section_visibility(text, text)                    TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION api.get_portal_section_visibility(text)                         TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION api.rpc_set_actor_section_visibility(text, text, text, boolean) TO authenticated, service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. submit_actor_fiche — LE geste « Soumettre pour vérification » (D2/D3/D6).
--    Transactionnel : soumission + N pending_change + tâche multi-assignée +
--    notifications. La tâche est insérée DIRECTEMENT (précédent : trigger incident) —
--    api.save_crm_task est inutilisable par un acteur et ses gates ne doivent pas
--    s'élargir. L'appel api.notify_task_assignees passe en DEFINER→DEFINER (les
--    EXECUTE se vérifient contre le propriétaire, pas l'appelant).
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION api.submit_actor_fiche(
  p_object_id text,
  p_changes   jsonb,
  p_note      text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = public, api, auth, pg_temp
AS $$
DECLARE
  v_uid       uuid := auth.uid();
  v_actor     uuid;
  v_masked    text[];
  v_floor     text[] := api.actor_portal_floor_modules();
  -- CORRECTION CONTRÔLEUR (revue task-5) : le brief listait HUIT writers (avec
  -- save_object_rooms). Le prosrc VIF de api.approve_pending_change (§120) —
  -- re-vérifié en base juste avant cette écriture, md5(prosrc)=3cf2a45631df18e22e0b4c5cd81d9e2e,
  -- IDENTIQUE à l'archive .superpowers/sdd/2026-09-01-portail-acteur/live/approve_pending_change.LIVE.sql —
  -- n'en porte que SEPT : SANS save_object_rooms. Cette liste DOIT rester un
  -- SOUS-ENSEMBLE (ici : identique) de celle d'approve_pending_change, JAMAIS un
  -- sur-ensemble : si submit_actor_fiche acceptait un writer qu'approve_pending_change
  -- refuse, ce changement entrerait en base à la soumission puis ne pourrait plus
  -- JAMAIS être approuvé (22023 côté approve) — et comme uq_fiche_submission_open
  -- n'autorise qu'UNE vérification ouverte par fiche, celle-ci resterait bloquée
  -- POUR TOUJOURS (aucun mécanisme ne libère le verrou sans résolution). N'AJOUTE
  -- JAMAIS une entrée ici sans l'avoir d'abord ajoutée, vérifiée et déployée côté
  -- approve_pending_change — et sans mettre à jour l'assertion miroir de
  -- tests/test_actor_portal.sql (bloc D2, « épinglé save_object_rooms ») qui
  -- proteste explicitement contre cette divergence.
  v_allowed   text[] := ARRAY[
    'save_object_commercial','save_object_workspace_sustainability','save_object_workspace_tags',
    'save_object_itinerary_nested','save_object_openings','save_object_places',
    'save_object_relations'];
  v_change    jsonb;
  v_section   text;
  v_rpc       text;
  v_action    text;
  v_count     int := 0;
  v_sub_id    uuid;
  v_task_id   uuid;
  v_name      text;
  v_sections  text[] := ARRAY[]::text[];
  v_assignees uuid[];
BEGIN
  IF v_uid IS NULL OR NOT api.is_actor_persona() THEN
    RAISE EXCEPTION 'Réservé aux comptes du portail acteur' USING ERRCODE = '42501';
  END IF;
  IF p_object_id IS NULL OR p_object_id NOT IN (SELECT api.current_user_portal_object_ids()) THEN
    RAISE EXCEPTION 'Fiche hors de votre périmètre' USING ERRCODE = '42501';
  END IF;
  IF p_changes IS NULL OR jsonb_typeof(p_changes) <> 'array'
     OR jsonb_array_length(p_changes) = 0 OR jsonb_array_length(p_changes) > 40 THEN
    RAISE EXCEPTION 'p_changes doit être un tableau de 1 à 40 changements' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (SELECT 1 FROM fiche_submission fs
              WHERE fs.object_id = p_object_id AND fs.status = 'pending') THEN
    -- PT409 (PostgREST ⇒ HTTP 409, SQLSTATE exposé dans error.code) et PAS 23505 : le front
    -- traduit 23505 en « Cette valeur existe déjà (doublon). » (db-error-message.ts) et
    -- mapDatabaseError applique le SQLSTATE AVANT le message — le prestataire lirait « doublon ».
    RAISE EXCEPTION USING ERRCODE = 'PT409',
      MESSAGE = 'Une vérification est déjà en cours pour cette fiche';
  END IF;

  v_actor := api.current_user_actor_id();
  v_masked := ARRAY(SELECT jsonb_array_elements_text(
    api.get_portal_section_visibility(p_object_id)->'masked_modules'));

  -- Validation de CHAQUE enveloppe avant la moindre écriture.
  FOR v_change IN SELECT * FROM jsonb_array_elements(p_changes) LOOP
    v_section := v_change->'metadata'->>'section';
    v_rpc     := v_change->'metadata'->>'rpc';
    v_action  := v_change->>'action';
    IF v_section IS NULL OR btrim(v_section) = '' THEN
      RAISE EXCEPTION 'metadata.section requis sur chaque changement' USING ERRCODE = '22023';
    END IF;
    IF v_section = ANY (v_floor) THEN
      RAISE EXCEPTION 'La section « % » n''est pas ouverte aux acteurs', v_section USING ERRCODE = '22023';
    END IF;
    IF v_section = ANY (v_masked) THEN
      RAISE EXCEPTION 'La section « % » est masquée par votre organisation', v_section USING ERRCODE = '22023';
    END IF;
    IF v_rpc IS NOT NULL AND NOT (v_rpc = ANY (v_allowed)) THEN
      RAISE EXCEPTION 'Writer non autorisé: %', v_rpc USING ERRCODE = '22023';
    END IF;
    IF COALESCE(v_action, '') NOT IN ('insert','update','delete') THEN
      RAISE EXCEPTION 'action invalide: %', v_action USING ERRCODE = '22023';
    END IF;
    IF v_change->'payload' IS NULL OR (v_change->>'target_table') IS NULL
       OR btrim(v_change->>'target_table') = '' THEN
      RAISE EXCEPTION 'payload et target_table requis' USING ERRCODE = '22023';
    END IF;
    v_sections := array_append(v_sections, v_change->'metadata'->>'field');
  END LOOP;

  -- La soumission. Le pré-check EXISTS plus haut n'est qu'un check-then-act : il rend
  -- le cas courant lisible sans lever d'exception coûteuse, mais entre lui et CET
  -- INSERT, rien ne l'empêche d'être doublé (double-clic avant que le bouton se
  -- désactive côté front, deux onglets) — les deux appels peuvent lire EXISTS=FALSE
  -- et arriver ici ensemble ; uq_fiche_submission_open (index unique partiel)
  -- départage alors les deux à l'ÉCRITURE, pas au pré-check. Sans ce blindage, le
  -- perdant de la course remonterait un 23505 NU — exactement le message
  -- « doublon » (db-error-message.ts) que le pré-check ci-dessus prétend déjà
  -- fermer, et le piège nommé par le PO pour ce chantier. Le code d'erreur est la
  -- SEULE chose que voit le prestataire : on rattrape donc ICI, à l'écriture réelle,
  -- avec le MÊME message et le MÊME SQLSTATE que le pré-check — le front n'a
  -- jamais qu'un seul cas PT409 à traiter. Motif identique à 4 précédents du dépôt
  -- (SELECT optimiste + écriture blindée) : api.create_tag et
  -- api.create_membership_campaign (api_views_functions.sql), et leur miroir dans
  -- migration_tags_create_and_order.sql.
  BEGIN
    INSERT INTO fiche_submission (object_id, actor_id, submitted_by, note)
    VALUES (p_object_id, v_actor, v_uid, NULLIF(btrim(COALESCE(p_note, '')), ''))
    RETURNING id INTO v_sub_id;
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION USING ERRCODE = 'PT409',
      MESSAGE = 'Une vérification est déjà en cours pour cette fiche';
  END;

  -- Les changements (mêmes colonnes que submit_pending_change + submission_id ;
  -- le trigger after-insert flippe object.is_editing).
  FOR v_change IN SELECT * FROM jsonb_array_elements(p_changes) LOOP
    INSERT INTO pending_change (object_id, target_table, target_pk, action, payload,
                                submitted_by, status, metadata, submission_id)
    VALUES (p_object_id, v_change->>'target_table', v_change->>'target_pk',
            v_change->>'action', v_change->'payload', v_uid, 'pending',
            v_change->'metadata', v_sub_id);
    v_count := v_count + 1;
  END LOOP;

  -- La tâche de vérification, typée par extra (crm_task n'a pas de colonne kind).
  SELECT o.name INTO v_name FROM object o WHERE o.id = p_object_id;
  v_task_id := gen_random_uuid();
  INSERT INTO crm_task (id, object_id, actor_id, title, description, status, priority, created_by, extra)
  VALUES (v_task_id, p_object_id, v_actor,
          'Vérifier la fiche « ' || COALESCE(v_name, p_object_id) || ' »',
          COALESCE('Message du prestataire : ' || NULLIF(btrim(COALESCE(p_note, '')), '') || E'\n', '')
            -- array_to_string (forme à 2 arguments) ignore silencieusement les NULL : si
            -- tous les metadata.field valent NULL, la liste serait vide et la phrase
            -- finirait tronquée (« Sections modifiées : » suivi de rien) — l'office lit
            -- cette description, un repli lisible vaut mieux qu'une phrase coupée.
            || 'Sections modifiées : ' || COALESCE(NULLIF(array_to_string(v_sections, ', '), ''), '(non précisées)'),
          'todo', 'medium', v_uid,
          jsonb_build_object('kind', 'fiche_verification', 'submission_id', v_sub_id));
  UPDATE fiche_submission SET task_id = v_task_id WHERE id = v_sub_id;

  -- Assignation multi (D3) + notifications (kind crm_task_assigned réutilisé — l'outbox
  -- e-mail existante part sans aucun nouveau rail).
  v_assignees := ARRAY(SELECT api.list_object_verifier_ids(p_object_id));
  IF COALESCE(array_length(v_assignees, 1), 0) > 0 THEN
    INSERT INTO crm_task_assignee (task_id, user_id, assigned_by)
    SELECT v_task_id, u.u, v_uid FROM unnest(v_assignees) AS u(u)
    ON CONFLICT (task_id, user_id) DO NOTHING;
    -- owner de compat = plus petit uuid (même règle que save_crm_task, migration_crm_task_
    -- multi_assignee_notifications.sql L378). PAS min(u.u) : uuid n'a pas d'agrégat MIN/MAX
    -- sur cette version de Postgres (constaté à l'exécution : « function min(uuid) does not
    -- exist ») — uuid n'a qu'un opclass btree (ORDER BY fonctionne), pas d'agrégat dédié.
    UPDATE crm_task SET owner = (SELECT u.u FROM unnest(v_assignees) u(u) ORDER BY u.u LIMIT 1)
      WHERE id = v_task_id;
    PERFORM api.notify_task_assignees(v_task_id, v_assignees, v_uid);
  END IF;

  RETURN jsonb_build_object(
    'submission_id', v_sub_id, 'task_id', v_task_id,
    'change_count', v_count,
    'assignee_count', COALESCE(array_length(v_assignees, 1), 0));
END;
$$;
REVOKE ALL ON FUNCTION api.submit_actor_fiche(text, jsonb, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION api.submit_actor_fiche(text, jsonb, text) TO authenticated, service_role;
COMMENT ON FUNCTION api.submit_actor_fiche(text, jsonb, text) IS
  '18a — « Soumettre pour vérification » du portail : soumission + N pending_change + tâche multi-assignée + notifications, en UNE transaction. Whitelist writers = SEPT entrées, identique à approve_pending_change (§120) — jamais un sur-ensemble, sous peine de fiche bloquée à vie.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. Lectures côté acteur. Auto-scopées : jamais de paramètre « pour qui » —
--    le destinataire est TOUJOURS auth.uid() (doctrine notifications).
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION api.list_my_portal_fiches()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, api, auth, pg_temp
AS $$
BEGIN
  IF NOT api.is_actor_persona() THEN
    RAISE EXCEPTION 'Réservé aux comptes du portail acteur' USING ERRCODE = '42501';
  END IF;
  RETURN COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
      'id', o.id, 'name', o.name, 'object_type', o.object_type,
      'status', o.status, 'updated_at', o.updated_at,
      'open_submission', (
        SELECT jsonb_build_object('id', fs.id, 'submitted_at', fs.submitted_at)
        FROM fiche_submission fs
        WHERE fs.object_id = o.id AND fs.status = 'pending'
        ORDER BY fs.submitted_at DESC LIMIT 1),
      'last_resolved', (
        SELECT jsonb_build_object('status', fs.status, 'resolved_at', fs.resolved_at)
        FROM fiche_submission fs
        WHERE fs.object_id = o.id AND fs.status <> 'pending'
        ORDER BY fs.resolved_at DESC NULLS LAST LIMIT 1),
      -- D11 : les coordonnées PUBLIQUES de l'office publisher, pour les deux replis du
      -- portail (« envoyez vos photos » et « signaler une erreur » quand c'est la seule
      -- saisie). Canaux is_public uniquement (jamais un canal interne), primaire d'abord.
      -- Un `mailto:` échoue en silence sur un téléphone sans application de courrier :
      -- le téléphone n'est pas décoratif, il est le second chemin.
      'office_email', (
        SELECT cc.value
        FROM object_org_link ool
        JOIN ref_org_role r ON r.id = ool.role_id AND r.code = 'publisher'
        JOIN contact_channel cc ON cc.object_id = ool.org_object_id
        JOIN ref_code_contact_kind ck ON ck.id = cc.kind_id AND ck.code = 'email'
        WHERE ool.object_id = o.id AND COALESCE(cc.is_public, TRUE) AND cc.value <> ''
        ORDER BY ool.is_primary DESC NULLS LAST, cc.is_primary DESC NULLS LAST, cc.position NULLS LAST
        LIMIT 1),
      'office_phone', (
        SELECT cc.value
        FROM object_org_link ool
        JOIN ref_org_role r ON r.id = ool.role_id AND r.code = 'publisher'
        JOIN contact_channel cc ON cc.object_id = ool.org_object_id
        JOIN ref_code_contact_kind ck ON ck.id = cc.kind_id AND ck.code IN ('phone', 'mobile')
        WHERE ool.object_id = o.id AND COALESCE(cc.is_public, TRUE) AND cc.value <> ''
        -- Même ordre que l'e-mail, puis 'phone' avant 'mobile' (un fixe d'office est le
        -- numéro affiché ; le mobile n'est qu'un repli).
        ORDER BY ool.is_primary DESC NULLS LAST, cc.is_primary DESC NULLS LAST,
                 (ck.code = 'phone') DESC, cc.position NULLS LAST
        LIMIT 1)
    ) ORDER BY o.name)
    FROM object o
    WHERE o.id IN (SELECT api.current_user_portal_object_ids())
  ), '[]'::jsonb);
END;
$$;

-- p_object_id (révision 2026-09-02) : SANS filtre, un acteur multi-fiches peut voir la
-- soumission ouverte de CETTE fiche sortir de la page (plafond 100, toutes fiches) ⇒
-- rubriques « en vérification » muettes sans erreur. Le portail passe toujours l'id.
CREATE OR REPLACE FUNCTION api.list_my_submissions(p_limit int DEFAULT 20, p_object_id text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, api, auth, pg_temp
AS $$
DECLARE
  v_limit int := LEAST(GREATEST(COALESCE(p_limit, 20), 1), 100);
BEGIN
  IF NOT api.is_actor_persona() THEN
    RAISE EXCEPTION 'Réservé aux comptes du portail acteur' USING ERRCODE = '42501';
  END IF;
  RETURN COALESCE((
    SELECT jsonb_agg(sub ORDER BY sub->>'submitted_at' DESC)
    FROM (
      SELECT jsonb_build_object(
        'id', fs.id, 'object_id', fs.object_id, 'object_name', o.name,
        'note', fs.note, 'status', fs.status,
        'submitted_at', fs.submitted_at, 'resolved_at', fs.resolved_at,
        'changes', COALESCE((
          SELECT jsonb_agg(jsonb_build_object(
            'id', pc.id,
            -- Le module id (clé stable, ancre l'état de la rubrique côté portail) ET le
            -- libellé lisible (D12 : field est la projection en clair de l'enveloppe).
            'section', pc.metadata->>'section',
            'field', pc.metadata->>'field',
            'status', pc.status,
            'review_note', pc.review_note,
            -- Libellé joint à la lecture, jamais stocké (RGPD).
            'reviewer_label', CASE WHEN pc.reviewed_by IS NULL THEN NULL
              ELSE COALESCE(rp.display_name, 'Utilisateur ' || left(pc.reviewed_by::text, 8)) END
          ) ORDER BY pc.submitted_at, pc.id)
          FROM pending_change pc
          LEFT JOIN app_user_profile rp ON rp.id = pc.reviewed_by
          WHERE pc.submission_id = fs.id), '[]'::jsonb)
      ) AS sub
      FROM fiche_submission fs
      LEFT JOIN object o ON o.id = fs.object_id
      WHERE fs.submitted_by = (SELECT auth.uid())
        AND (p_object_id IS NULL OR fs.object_id = p_object_id)
      ORDER BY fs.submitted_at DESC
      LIMIT v_limit
    ) t
  ), '[]'::jsonb);
END;
$$;

CREATE OR REPLACE FUNCTION api.get_my_actor_profile()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, api, auth, pg_temp
AS $$
DECLARE
  v_actor uuid := api.current_user_actor_id();
BEGIN
  IF NOT api.is_actor_persona() OR v_actor IS NULL THEN
    RAISE EXCEPTION 'Réservé aux comptes du portail acteur' USING ERRCODE = '42501';
  END IF;
  -- Scopé STRICTEMENT à current_user_actor_id() : ce RPC n'ajoute PAS une 5e formulation
  -- au périmètre PII de can_read_actor_contacts (invariant spec §6) — il ne lit qu'UN
  -- acteur, LE MIEN, jamais un paramètre.
  RETURN (
    SELECT jsonb_build_object(
      'id', a.id, 'display_name', a.display_name, 'photo_url', a.photo_url,
      'channels', COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
          'kind', ck.code, 'value', ac.value, 'is_primary', ac.is_primary)
          ORDER BY ck.code, ac.position NULLS LAST)
        FROM actor_channel ac
        JOIN ref_code_contact_kind ck ON ck.id = ac.kind_id
        WHERE ac.actor_id = a.id), '[]'::jsonb))
    FROM actor a WHERE a.id = v_actor);
END;
$$;

REVOKE ALL ON FUNCTION api.list_my_portal_fiches()      FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION api.list_my_submissions(int, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION api.get_my_actor_profile()       FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION api.list_my_portal_fiches()   TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION api.list_my_submissions(int, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION api.get_my_actor_profile()    TO authenticated, service_role;
COMMENT ON FUNCTION api.list_my_portal_fiches() IS
  '18a — accueil du portail : les fiches de la portée acteur, avec la soumission ouverte (le cas échéant), la dernière résolue, et les canaux PUBLICS de l''office publisher (office_email/office_phone, D11) — jamais un canal interne.';
COMMENT ON FUNCTION api.list_my_submissions(int, text) IS
  '18a — historique des soumissions de l''acteur COURANT (auto-scopé, jamais de paramètre destinataire). p_object_id filtre STRICTEMENT (révision 2026-09-02) — sans lui un acteur multi-fiches verrait la soumission ouverte d''UNE fiche apparaître sous une AUTRE. section = metadata.section (le module id stable), field = le libellé lisible (D12).';
COMMENT ON FUNCTION api.get_my_actor_profile() IS
  '18a — profil de LA persona acteur courante (current_user_actor_id()), lecture seule v1. Ne constitue PAS une 5e formulation du périmètre PII can_read_actor_contacts : il ne lit jamais qu''UN acteur, le sien.';

COMMIT;
