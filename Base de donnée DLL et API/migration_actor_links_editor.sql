-- migration_actor_links_editor.sql
-- §48 — Editor write path for actor_object_role (operator/guide links) + actor search RPC.
-- (a) Converges actor_object_role writes to the §47 per-command canonical family and retires the
--     legacy admin FOR ALL (canonical SUBSUMES admin/superuser via is_object_owner — see 8o's
--     predicate note). Rewrites the read policy in the §38/§39 form (set-based extended scope,
--     wrapped auth fns, actor-self arm preserved). NO published-read arm is added — the
--     "read under-exposure" item stays deferred.
-- (b) api.save_object_relations gains a real `actors` branch (delete-all + re-insert; role by id or
--     ref_actor_role.code; visibility mirror of the table CHECK; ≤1 primary per role enforced by
--     uq_actor_object_role_primary). actor_channel / actor_consent stay OUT of the contract.
--     §95: the actor-existence pre-check is NO LONGER an EXISTS over public.actor (which, under this
--     INVOKER fn, was RLS-filtered by ext_actor_read and hid not-yet-linked actors → "Unknown actor_id"
--     for non-admin editors). Existence is now FK-enforced (actor_object_role.actor_id → actor(id));
--     authorization stays workspace_assert_can_write_object (object-write). So ANY object editor can
--     associate ANY existing actor — not just the superadmin.
--     §208/T13b: `note` is CARRIED OVER from the pre-delete rows (key = (actor_id, role_id)) whenever
--     api.can_read_actor_contacts is false for the caller — otherwise the T13 redaction (note→NULL in
--     api.get_object_resource) would turn this delete-all + re-insert branch into a silent DESTRUCTION
--     of every actor-link note on the record. Authorization is UNCHANGED: only the VALUE written for
--     ONE column changes, never who may write. CI guard: tests/test_actor_link_note_carryover.sql.
-- (c) api.search_actors(p_query): SECURITY DEFINER picker, gated on api.current_user_can_edit_objects()
--     so read-only members cannot enumerate actor PII. §95: scope is the FULL actor directory for any
--     editor (was admin/superuser → all, else self ∪ extended) — the save path no longer RLS-filters
--     existence, so the picker need not be restricted to the caller's own/extended actors. LIKE
--     wildcards escaped ('%'/'_'/'\') so '%%' cannot bypass the min-2-char guard; LIMIT 20.
--     Advisor will flag the DEFINER — expected (§36 precedent).
--     ⚠ CORRECTIF POST-MISE EN PRODUCTION §208/§211/§213 (audit du 2026-08-09) — la colonne `email`
--     est désormais GATÉE PAR ACTEUR. Elle ne l'était pas : §95b (2026-06-17) l'a ajoutée pour enrichir
--     la carte du sélecteur, à une époque où la seule garde discutée était « éditeur vs lecteur ».
--     L'arbitrage PO de §208 — « coordonnées d'acteur complètes RÉSERVÉES aux membres de l'ORG
--     éditrice » — est POSTÉRIEUR, et ce DEFINER l'ignorait : mesuré en production, un éditeur d'une
--     ORG sans aucune fiche publisher recevait 18 e-mails sur 20 lignes rendues (681 acteurs porteurs
--     d'e-mail sur 696). Même classe que la fuite refermée par §213 sur get_objects_with_deep_data.
--     Forme retenue, et pourquoi : la garde §208 `api.can_read_actor_contacts(p_object_id)` prend un
--     OBJET, or le sélecteur n'a AUCUN contexte objet. Le transposé fidèle est donc « l'appelant
--     peut-il voir les coordonnées de cet acteur via AU MOINS UNE de ses fiches ? » = superuser
--     plateforme (MÊME lecture que la garde : `app_user_profile.role IN ('owner','super_admin')`)
--     OU ∃ un `actor_object_role` reliant l'acteur à une fiche de `api.current_user_crm_object_ids()`
--     (le périmètre publisher, celui de §211/D4 — PAS `readable_object_ids` : lire une fiche publiée
--     d'une autre ORG ne donne aucun droit sur l'e-mail de son exploitant).
--     La LIGNE n'est jamais masquée et l'appel ne lève jamais : hors périmètre, `email` vaut NULL.
--     C'est délibéré — §95 (arbitrage PO) autorise tout éditeur à chercher tout le répertoire par NOM
--     pour rattacher un prestataire ; on ne referme que la coordonnée, pas l'annuaire. Masquer la
--     ligne casserait le rattachement ; lever une exception ferait du sélecteur un oracle d'existence.
-- PREREQUISITES: rls_policies.sql (step 6 — also defines api.current_user_can_edit_objects),
--   object_workspace_safe_write_rpcs.sql (step 7 — helpers + save_object_relations baseline),
--   migration_permission_write_paths.sql (8b — user_can_write_object_canonical).
--   Manifest step 8r.
-- ⚠ DÉPENDANCE DIFFÉRÉE, IDENTIQUE À CELLE DÉJÀ DOCUMENTÉE POUR 16u (voir le bloc ⚠ du § 3) :
--   `api.search_actors` appelle désormais `api.current_user_crm_object_ids()`, créée par
--   migration_crm_module.sql (créneau 8z, donc APRÈS ce fichier). C'est sans danger sur une base
--   fraîche : plpgsql ne résout ses références qu'à l'EXÉCUTION (vérifié par une sonde en
--   BEGIN/ROLLBACK le 2026-08-09 — un CREATE FUNCTION plpgsql citant une fonction inexistante
--   RÉUSSIT), et rien n'appelle le sélecteur entre 8r et 8z. Sur une base VIVE en revanche, ne
--   ré-appliquer ce fichier qu'une fois 8z passée, sinon le premier appel du sélecteur lève 42883.
-- IDEMPOTENT: DROP POLICY IF EXISTS + CREATE POLICY; CREATE OR REPLACE FUNCTION.
-- REVERSIBLE: re-create ext_actor_object_role_read / admin_actor_object_role_write from
--   rls_policies.sql (Actor system tables block); re-apply step 7's
--   save_object_relations; DROP FUNCTION api.search_actors(text).
-- ⚠ RE-APPLY CAVEAT: rls_policies.sql still creates admin_actor_object_role_write (FOR ALL) and
--   step 7 still ships the actors-skip RPC body — after re-applying either to a live DB, re-run THIS file.
BEGIN;

-- == 1. actor_object_role: §47 per-command canonical write family ==
DROP POLICY IF EXISTS "admin_actor_object_role_write" ON actor_object_role;
DROP POLICY IF EXISTS "canonical_ins_actor_object_role" ON actor_object_role;
CREATE POLICY "canonical_ins_actor_object_role" ON actor_object_role FOR INSERT WITH CHECK (api.user_can_write_object_canonical(object_id));
DROP POLICY IF EXISTS "canonical_upd_actor_object_role" ON actor_object_role;
CREATE POLICY "canonical_upd_actor_object_role" ON actor_object_role FOR UPDATE USING (api.user_can_write_object_canonical(object_id)) WITH CHECK (api.user_can_write_object_canonical(object_id));
DROP POLICY IF EXISTS "canonical_del_actor_object_role" ON actor_object_role;
CREATE POLICY "canonical_del_actor_object_role" ON actor_object_role FOR DELETE USING (api.user_can_write_object_canonical(object_id));

-- == 2. read policy: same semantics (admin OR self OR extended), §39-wrapped + §38 set form ==
DROP POLICY IF EXISTS "ext_actor_object_role_read" ON actor_object_role;
CREATE POLICY "ext_actor_object_role_read" ON actor_object_role FOR SELECT USING (
  (select auth.role()) IN ('service_role', 'admin')
  -- NOTE: the actor-self arm is INERT today (actor.id is uuid_generate_v4(), never an auth uid; the
  -- email bridge is api.user_actor_ids()) — preserved verbatim from the legacy policy for behavior
  -- parity. See decision log §48.
  OR actor_id = (select auth.uid())
  OR object_id IN (SELECT api.current_user_extended_object_ids())
);

-- == 3. save_object_relations: real `actors` branch (replaces the skip) ==
-- Body identical to object_workspace_safe_write_rpcs.sql (fold there too — fresh == live).
-- ⚠ DEPENDENCY (§208/T13b): the `actors` branch calls api.can_read_actor_contacts(text), created by
--   migration_actor_contacts_org_gate.sql (manifest 16u). The reference is resolved at RUNTIME, not at
--   CREATE time (plpgsql validates syntax only), so a fresh apply in manifest order is fine — nothing
--   between 8r and 16u calls this RPC. On a LIVE database, apply 16u BEFORE (or in the same pass as)
--   any re-apply of this file or of step 7, or the actors branch raises 42883 at the first save.
CREATE OR REPLACE FUNCTION api.save_object_relations(p_object_id text, p_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, api, internal
AS $$
DECLARE
  v_counts jsonb := '{}'::jsonb;
  v_warnings text[] := ARRAY[]::text[];
  v_skipped text[] := ARRAY[]::text[];
  v_row jsonb;
  v_id uuid;
  v_deleted integer;
  v_inserted integer;
  -- §214 - jeu cible resolu du reconcile `org_links` (voir cette branche).
  v_targets jsonb;
  -- §208/T13b — anti-clobber de actor_object_role.note (voir la branche `actors`).
  v_actor_notes_writable boolean;
  v_actor_notes_before   jsonb := '{}'::jsonb;
BEGIN
  PERFORM internal.workspace_assert_can_write_object(p_object_id);
  p_payload := COALESCE(p_payload, '{}'::jsonb);

  IF p_payload ? 'object_relations' THEN
    DELETE FROM public.object_relation WHERE source_object_id = p_object_id;
    GET DIAGNOSTICS v_deleted = ROW_COUNT;
    v_inserted := 0;
    FOR v_row IN SELECT value FROM jsonb_array_elements(internal.workspace_jsonb_array(p_payload->'object_relations')) AS t(value) LOOP
      IF COALESCE(NULLIF(v_row->>'source_object_id', ''), p_object_id) <> p_object_id THEN
        RAISE EXCEPTION 'object_relations source_object_id must match p_object_id' USING ERRCODE = '22023';
      END IF;
      IF v_row->>'target_object_id' = p_object_id THEN
        RAISE EXCEPTION 'object_relation cannot target itself' USING ERRCODE = '23514';
      END IF;
      IF NOT EXISTS (SELECT 1 FROM public.object WHERE id = v_row->>'target_object_id') THEN
        RAISE EXCEPTION 'Unknown target_object_id: %', v_row->>'target_object_id' USING ERRCODE = '23503';
      END IF;
      v_id := internal.workspace_uuid(v_row->>'relation_type_id');
      IF v_id IS NULL THEN
        SELECT id INTO v_id FROM public.ref_object_relation_type WHERE lower(code) = lower(v_row->>'relation_type_code');
      END IF;
      IF v_id IS NULL THEN
        RAISE EXCEPTION 'Unknown relation_type reference: %', v_row USING ERRCODE = '23503';
      END IF;
      INSERT INTO public.object_relation (id, source_object_id, target_object_id, relation_type_id, distance_m, note, position)
      VALUES (
        COALESCE(internal.workspace_uuid(v_row->>'id'), gen_random_uuid()),
        p_object_id,
        v_row->>'target_object_id',
        v_id,
        NULLIF(v_row->>'distance_m', '')::numeric,
        NULLIF(v_row->>'note', ''),
        COALESCE(NULLIF(v_row->>'position', '')::integer, v_inserted)
      );
      v_inserted := v_inserted + 1;
    END LOOP;
    v_counts := v_counts || jsonb_build_object('object_relation_deleted', v_deleted, 'object_relation_inserted', v_inserted);
  END IF;

  IF p_payload ? 'org_links' THEN
    IF (
      SELECT count(*)
      FROM jsonb_array_elements(internal.workspace_jsonb_array(p_payload->'org_links')) AS t(value)
      WHERE COALESCE(NULLIF(value->>'is_primary', '')::boolean, false)
    ) > 1 THEN
      RAISE EXCEPTION 'Only one primary organization link is allowed per object' USING ERRCODE = '23505';
    END IF;

    -- §214 - RECONCILE NON DESTRUCTIF. Ne JAMAIS revenir a un delete-all + re-insert ici :
    -- object_org_link PORTE le droit d'ecrire de l'appelant (api.user_can_write_canonical =
    -- edit_canonical_when_publisher AND EXISTS(lien publisher -> mon ORG)). Un DELETE global rend
    -- cet EXISTS faux des l'instruction SUIVANTE, et le WITH CHECK de canonical_ins_object_org_link
    -- refuse alors la re-insertion : 42501 pour TOUT editeur, et invisible pour un superuser (qui
    -- passe par api.is_object_owner, lequel ne lit pas cette table). Reproduit en production le
    -- 2026-08-26 ; le symptome utilisateur etait « je ne peux pas rattacher un prestataire », car
    -- §15/§17/§19 partagent le module `relationships` et donc CET appel. Garde permanente :
    -- tests/test_org_link_reconcile_editor.sql.
    -- L'ordre des 4 etapes est impose :
    --   1. resoudre le payload SANS ecrire (une reference invalide ne doit rien avoir touche) ;
    --   2. retirer le drapeau principal devenu obsolete AVANT d'en poser un nouveau - sinon
    --      l'unique partiel uq_object_primary_org (un seul principal par fiche) refuserait l'etat
    --      transitoire, une regression que le delete-all n'avait pas ;
    --   3. UPSERT du jeu cible - la ligne qui autorise l'appel n'est jamais supprimee ;
    --   4. supprimer EN DERNIER ce que le payload n'a pas repris.
    v_targets := '[]'::jsonb;
    FOR v_row IN SELECT value FROM jsonb_array_elements(internal.workspace_jsonb_array(p_payload->'org_links')) AS t(value) LOOP
      IF NOT EXISTS (SELECT 1 FROM public.object WHERE id = v_row->>'org_object_id') THEN
        RAISE EXCEPTION 'Unknown org_object_id: %', v_row->>'org_object_id' USING ERRCODE = '23503';
      END IF;
      v_id := internal.workspace_uuid(v_row->>'role_id');
      IF v_id IS NULL THEN
        SELECT id INTO v_id FROM public.ref_org_role WHERE lower(code) = lower(v_row->>'role_code');
      END IF;
      IF v_id IS NULL THEN
        RAISE EXCEPTION 'Unknown org role reference: %', v_row USING ERRCODE = '23503';
      END IF;
      -- Doublon (org, role) dans le payload : l'ancien corps levait 23505 sur la PK. On leve le
      -- MEME code, explicitement. Laisser faire l'ON CONFLICT rendrait 21000 (« cannot affect row
      -- a second time »), illisible ; l'absorber en silence serait un piege d'ecriture (§212).
      IF EXISTS (SELECT 1 FROM jsonb_array_elements(v_targets) AS t(value)
                  WHERE t.value->>'org_object_id' = v_row->>'org_object_id'
                    AND (t.value->>'role_id')::uuid = v_id) THEN
        RAISE EXCEPTION 'Duplicate organization link in payload (org %, role %)',
          v_row->>'org_object_id', v_id USING ERRCODE = '23505';
      END IF;
      v_targets := v_targets || jsonb_build_array(jsonb_build_object(
        'org_object_id', v_row->>'org_object_id',
        'role_id',       v_id,
        'is_primary',    COALESCE(NULLIF(v_row->>'is_primary', '')::boolean, false),
        'note',          NULLIF(v_row->>'note', '')
      ));
    END LOOP;

    UPDATE public.object_org_link ool
       SET is_primary = FALSE
     WHERE ool.object_id = p_object_id
       AND ool.is_primary
       AND NOT EXISTS (
             SELECT 1 FROM jsonb_array_elements(v_targets) AS t(value)
              WHERE t.value->>'org_object_id' = ool.org_object_id
                AND (t.value->>'role_id')::uuid = ool.role_id
                AND (t.value->>'is_primary')::boolean);

    INSERT INTO public.object_org_link (object_id, org_object_id, role_id, is_primary, note)
    SELECT p_object_id,
           t.value->>'org_object_id',
           (t.value->>'role_id')::uuid,
           (t.value->>'is_primary')::boolean,
           t.value->>'note'
      FROM jsonb_array_elements(v_targets) AS t(value)
    ON CONFLICT (object_id, org_object_id, role_id) DO UPDATE
       SET is_primary = EXCLUDED.is_primary,
           note       = EXCLUDED.note;
    GET DIAGNOSTICS v_inserted = ROW_COUNT;

    DELETE FROM public.object_org_link ool
     WHERE ool.object_id = p_object_id
       AND NOT EXISTS (
             SELECT 1 FROM jsonb_array_elements(v_targets) AS t(value)
              WHERE t.value->>'org_object_id' = ool.org_object_id
                AND (t.value->>'role_id')::uuid = ool.role_id);
    GET DIAGNOSTICS v_deleted = ROW_COUNT;
    -- Semantique des compteurs (aucun consommateur front - verifie par grep) : `_inserted` = lignes
    -- du jeu cible persistees (insert OU update), `_deleted` = liens REELLEMENT retires. Avant §214
    -- ils valaient « tout supprime / tout reinsere » a chaque enregistrement.
    v_counts := v_counts || jsonb_build_object('object_org_link_deleted', v_deleted, 'object_org_link_inserted', v_inserted);
  END IF;

  IF p_payload ? 'incoming_relations' THEN
    v_skipped := array_append(v_skipped, 'incoming_relations');
    v_warnings := array_append(v_warnings, 'Incoming relations are read-only here because their source object owns the write.');
  END IF;
  -- §48/§95: actor links (actor_object_role only — actor_channel/actor_consent stay out of contract).
  IF p_payload ? 'actors' THEN
    -- §208/T13b — ANTI-CLOBBER de `note`. api.get_object_resource REDACTE actor_object_role.note
    -- (NULL) pour tout appelant qui échoue api.can_read_actor_contacts (§208/T13). Cette branche
    -- étant delete-all + re-insert, prendre `note` du payload DÉTRUIRAIT la note de CHAQUE lien
    -- acteur de la fiche pour un tel appelant : il charge NULL, il enregistre, la note disparaît —
    -- sans erreur, sans signal, et sans qu'il ait jamais vu le champ. Ce n'est pas une saisie
    -- ignorée, c'est une PERTE DE DONNÉE. Le correctif vit ICI, dans le writer PARTAGÉ : une garde
    -- côté appelant n'en couvrirait qu'un (le RPC est aussi re-dispatché par la modération, 8u).
    -- Sonde évaluée UNE SEULE FOIS — p_object_id est constant pour tout l'appel et la garde est
    -- SECURITY DEFINER donc NON inlinable : la mettre par ligne rejouerait current_user_crm_object_ids
    -- à chaque lien (§35/§204). Elle est en outre PARESSEUSE : corps d'un IF plpgsql, donc ni planifiée
    -- ni exécutée quand le payload ne porte pas `actors`.
    -- COALESCE(…, FALSE) : une sonde à trois valeurs en position booléenne est fail-OPEN sans lui
    -- (§204), et « ouvert » signifierait ici « écrire le NULL du payload », c.-à-d. effacer.
    v_actor_notes_writable := COALESCE(api.can_read_actor_contacts(p_object_id), FALSE);
    IF NOT v_actor_notes_writable THEN
      -- INSTANTANÉ PRIS AVANT LE DELETE (après, il n'y a plus rien à reporter).
      -- Clé = (actor_id, role_id) : c'est la PK (actor_id, object_id, role_id) moins object_id,
      -- constant sur tout l'appel — donc unique par ligne, jamais de collision d'agrégat.
      SELECT COALESCE(jsonb_object_agg(aor.actor_id::text || '|' || aor.role_id::text, to_jsonb(aor.note)), '{}'::jsonb)
        INTO v_actor_notes_before
        FROM public.actor_object_role aor
       WHERE aor.object_id = p_object_id;
    END IF;
    DELETE FROM public.actor_object_role WHERE object_id = p_object_id;
    GET DIAGNOSTICS v_deleted = ROW_COUNT;
    v_inserted := 0;
    FOR v_row IN SELECT value FROM jsonb_array_elements(internal.workspace_jsonb_array(p_payload->'actors')) AS t(value) LOOP
      -- §95: existence is enforced by actor_object_role.actor_id -> actor(id) FK (RLS-independent).
      -- Do NOT add an EXISTS over public.actor here: this fn is SECURITY INVOKER, so that probe is
      -- filtered by ext_actor_read and would HIDE actors the caller cannot READ (e.g. a not-yet-linked
      -- prestataire), failing the save for any non-admin editor even though they may WRITE the object.
      -- Authorization is workspace_assert_can_write_object (object-write); api.search_actors bounds the
      -- offered set. A truly unknown actor_id surfaces as the FK violation (23503).
      IF internal.workspace_uuid(v_row->>'actor_id') IS NULL THEN
        RAISE EXCEPTION 'Invalid or missing actor_id: %', COALESCE(v_row->>'actor_id', '(null)') USING ERRCODE = '22023';
      END IF;
      v_id := internal.workspace_uuid(v_row->>'role_id');
      IF v_id IS NULL THEN
        SELECT ref.id INTO v_id FROM public.ref_actor_role ref WHERE lower(ref.code) = lower(v_row->>'role_code');
      END IF;
      IF v_id IS NULL THEN
        RAISE EXCEPTION 'Unknown actor role reference: %', v_row USING ERRCODE = '23503';
      END IF;
      IF COALESCE(NULLIF(v_row->>'visibility', ''), 'public') NOT IN ('public', 'private', 'partners') THEN
        RAISE EXCEPTION 'Invalid actor link visibility: %', v_row->>'visibility' USING ERRCODE = '22023';
      END IF;
      -- ≤1 primary per (object, role) is enforced by uq_actor_object_role_primary (unique partial index).
      INSERT INTO public.actor_object_role (actor_id, object_id, role_id, is_primary, valid_from, valid_to, visibility, note)
      VALUES (
        internal.workspace_uuid(v_row->>'actor_id'),
        p_object_id,
        v_id,
        COALESCE(NULLIF(v_row->>'is_primary', '')::boolean, false),
        NULLIF(v_row->>'valid_from', '')::date,
        NULLIF(v_row->>'valid_to', '')::date,
        COALESCE(NULLIF(v_row->>'visibility', ''), 'public'),
        -- §208/T13b : le payload ne fait autorité sur `note` que si l'appelant l'a réellement LU.
        -- Sinon on REPORTE l'existant, tel quel (pas de NULLIF : on préserve, on ne normalise pas).
        -- Clé absente = lien NOUVEAU pour cet appelant ⇒ NULL. Conséquence assumée et connue : une
        -- note SAISIE par un appelant restreint sur un lien neuf n'est pas écrite — l'éditeur doit
        -- désactiver le champ quand `contacts_restricted` est vrai (voir le rapport T13b).
        CASE
          WHEN v_actor_notes_writable THEN NULLIF(v_row->>'note', '')
          ELSE v_actor_notes_before ->> (internal.workspace_uuid(v_row->>'actor_id')::text || '|' || v_id::text)
        END
      );
      v_inserted := v_inserted + 1;
    END LOOP;
    v_counts := v_counts || jsonb_build_object('actor_object_role_deleted', v_deleted, 'actor_object_role_inserted', v_inserted);
  END IF;

  RETURN internal.workspace_result(true, v_counts, v_skipped, v_warnings);
END;
$$;

-- == 4. picker RPC ==
-- §95b: RETURNS gender + primary email (actor_channel kind 'email') for the rich picker card.
-- DROP+CREATE (not CREATE OR REPLACE) because the return-table signature changed (re-apply safe).
DROP FUNCTION IF EXISTS api.search_actors(text);
CREATE FUNCTION api.search_actors(p_query text)
RETURNS TABLE(id uuid, display_name text, first_name text, last_name text, gender text, email text)
LANGUAGE plpgsql STABLE SECURITY DEFINER
-- `pg_temp` EXPLICITEMENT EN DERNIER (invariant §208/R2.1) : sans lui, PostgreSQL cherche le schéma
-- temporaire EN PREMIER pour les RELATIONS, et n'importe quel `authenticated` peut alors masquer
-- `app_user_profile` ou `actor_object_role` — c.-à-d. la table qui décide de l'autorisation
-- ci-dessous. Toutes les relations sont en outre schéma-qualifiées : ceinture ET bretelles.
SET search_path = public, api, pg_temp
AS $fn$
DECLARE
  v_pattern text;
  -- Verdict d'autorisation de la COLONNE `email`, calculé UNE SEULE FOIS par appel (voir plus bas).
  v_is_superuser  boolean;
  v_scoped_actors uuid[] := ARRAY[]::uuid[];
BEGIN
  -- Editors only: read-only ORG members must not enumerate actor PII through this DEFINER.
  -- COALESCE OBLIGATOIRE (§204) : `api.current_user_can_edit_objects()` est à TROIS valeurs — sa
  -- chaîne de OR passe par `auth.role()`, NULL hors contexte HTTP. Sans le COALESCE, `NOT NULL`
  -- vaut NULL, la branche n'est pas prise, et cette garde devient FAIL-OPEN. Reproduit en
  -- production le 2026-08-09, session sans claim : `SELECT count(*), count(email) FROM
  -- api.search_actors('ma')` rendait 20 lignes / 18 e-mails SANS lever 42501. Portée réelle
  -- bornée (anon est REVOKE, et tout JWT PostgREST pose `role`), mais l'invariant est documenté
  -- et n'a aucune raison d'être laissé ouvert dans la fonction même qu'on durcit.
  IF NOT COALESCE(api.current_user_can_edit_objects(), FALSE) THEN
    RAISE EXCEPTION 'Actor search requires editor rights' USING ERRCODE = '42501';
  END IF;
  IF p_query IS NULL OR length(btrim(p_query)) < 2 THEN
    RETURN;
  END IF;
  -- Escape LIKE wildcards: '%%' must not enumerate the whole table past the length guard.
  v_pattern := '%' || replace(replace(replace(public.immutable_unaccent(lower(btrim(p_query))), '\', '\\'), '%', '\%'), '_', '\_') || '%';

  -- ------------------------------------------------------------------
  -- Périmètre des COORDONNÉES (correctif post-prod §208/§211/§213)
  -- ------------------------------------------------------------------
  -- Bras 1 — superuser plateforme. On relit `app_user_profile` EXACTEMENT comme
  -- `api.can_read_actor_contacts` (rôle IN ('owner','super_admin')), et NON via
  -- `api.is_platform_superuser()` qui ajoute le bras `auth.role() IN ('service_role','admin')` :
  -- §208 a arbitré qu'une CLÉ DE SERVICE N'EST PAS UNE PERSONNE et ne lit pas de PII d'acteur.
  -- Passer par is_platform_superuser rouvrirait cette porte-là, en douce, par une autre fonction.
  -- EXISTS ne rend jamais NULL ⇒ pas de piège à trois valeurs ici (§204) ; hors contexte HTTP
  -- `auth.uid()` est NULL, aucune ligne ne matche, et le verdict tombe naturellement à FALSE.
  v_is_superuser := EXISTS (
    SELECT 1 FROM public.app_user_profile p
     WHERE p.id = (SELECT auth.uid())
       AND p.role IN ('owner', 'super_admin'));

  -- Bras 2 — « cet acteur est-il rattaché à AU MOINS UNE de mes fiches ? ». C'est le transposé de
  -- la garde §208 (qui, elle, prend un objet) au sélecteur, qui n'a aucun contexte objet.
  --
  -- ⚠ ÉCART ASSUMÉ, À NE PAS DÉCOUVRIR EN AUDIT. Ce bras accepte N'IMPORTE QUEL
  -- `actor_object_role` : ni filtre `visibility`, ni `valid_from`/`valid_to`, ni refus de
  -- consentement. Il est donc FIDÈLE à `api.can_read_actor_contacts` (qui n'a aucun des trois)
  -- mais PAS à `api.list_selection_emails`, qui applique les trois. L'écart est délibéré :
  -- afficher une carte UNITAIRE à un éditeur qui va rattacher ce prestataire n'est pas la même
  -- opération qu'EXTRAIRE des coordonnées EN LOT pour écrire à tout le monde (invariant §211).
  -- Mesuré au 2026-08-09 : l'écart est VACANT EN DONNÉES (778 liens, 0 `private`, 0 `valid_to`
  -- échu, 0 refus de consentement) — c'est un piège de maintenance, pas une fuite vive.
  -- Cette fonction devient la QUATRIÈME formulation du périmètre « qui voit les coordonnées d'un
  -- acteur » : voir le COMMENT de `api.can_read_actor_contacts`, qui les recense. Les quatre
  -- évoluent ensemble.
  -- PERFORMANCE (§35/§204) : `api.current_user_crm_object_ids()` est SECURITY DEFINER, donc NON
  -- inlinable — l'appeler par ligne rejouerait la jointure membership×org_link à chaque acteur.
  -- On la joue UNE fois et on réduit tout de suite à l'ensemble des ACTEURS autorisés, gardé en
  -- tableau : le prédicat par ligne devient une simple appartenance à un tableau, sans sous-plan.
  -- Mesuré en production le 2026-08-09, persona à 846 fiches publisher : la SRF seule = 2,34 ms,
  -- l'agrégat complet = 3,31 ms, et le coût total du sélecteur passe de 1,30 à 4,06 ms par appel.
  -- Le surcoût EST la SRF : aucune forme moins chère n'existe sans transcrire son prédicat, ce que
  -- §208 a explicitement payé pour ne plus faire (« prédicat transcrit trois fois »).
  -- PARESSE : le bloc est le corps d'un IF plpgsql placé APRÈS la garde des 2 caractères — une
  -- frappe courte, et un superuser, ne le planifient ni ne l'exécutent (§204).
  IF NOT v_is_superuser THEN
    SELECT COALESCE(array_agg(DISTINCT aor.actor_id), ARRAY[]::uuid[])
      INTO v_scoped_actors
      FROM public.actor_object_role aor
     WHERE aor.object_id IN (SELECT api.current_user_crm_object_ids());
  END IF;

  -- §95: ANY editor (current_user_can_edit_objects gate above) may search the FULL actor directory to
  -- associate a prestataire — NOT only admin/superuser. The save path (api.save_object_relations) no
  -- longer RLS-filters actor existence (FK-enforced), so the picker is not restricted to the caller's
  -- own/extended actors. Bounded by editor rights + min-2-char + LIKE-escape + LIMIT 20.
  -- (Privacy tradeoff per PO request 2026-06-17 — editors can name-search all actors. See decision log §95.)
  -- §95b: DEFINER bypasses actor_channel RLS, so the email subquery resolves for any editor.
  -- ⚠ Ce contrat de LIGNE est INCHANGÉ : le rattachement d'un prestataire en dépend. Seule la
  -- COLONNE `email` est gatée, et par une VALEUR NULL — jamais par une ligne retirée (qui casserait
  -- le rattachement) ni par une exception (qui ferait du sélecteur un oracle d'existence).
  RETURN QUERY
  SELECT a.id, a.display_name, a.first_name, a.last_name, a.gender,
    -- CASE, jamais un `AND` dans le WHERE de la sous-requête : PostgreSQL court-circuite CASE
    -- (§197), donc la lecture d'`actor_channel` n'est même pas évaluée hors périmètre. La branche
    -- absente rend NULL implicitement — c'est le contrat voulu, pas un oubli d'ELSE.
    CASE WHEN v_is_superuser OR a.id = ANY (v_scoped_actors) THEN
      (SELECT ac.value
         FROM public.actor_channel ac
         JOIN public.ref_code_contact_kind k ON k.id = ac.kind_id
        WHERE ac.actor_id = a.id AND lower(k.code) = 'email'
        -- NULLS LAST : `actor_channel.is_primary` est NULLABLE et `DESC` place les NULL EN PREMIER
        -- (invariant §211) — sans lui, un drapeau non renseigné passe devant le canal explicitement
        -- principal. Sans effet sur les 681 lignes actuelles (toutes is_primary=TRUE), mais aligne
        -- le sélecteur sur `api.export_actor_contacts`, qui choisit déjà de cette façon.
        ORDER BY ac.is_primary DESC NULLS LAST, ac.position NULLS LAST, ac.created_at
        LIMIT 1)
    END AS email
  FROM public.actor a
  WHERE (a.display_name_normalized LIKE v_pattern
      OR a.last_name_normalized    LIKE v_pattern
      OR a.first_name_normalized   LIKE v_pattern)
  ORDER BY a.display_name
  LIMIT 20;
END;
$fn$;
REVOKE ALL ON FUNCTION api.search_actors(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION api.search_actors(text) TO authenticated, service_role;

COMMIT;
