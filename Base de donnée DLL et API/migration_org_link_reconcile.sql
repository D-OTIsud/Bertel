-- migration_org_link_reconcile.sql
-- §214 - api.save_object_relations : les branches `org_links` ET `actors` deviennent des
--        RECONCILES NON DESTRUCTIFS.
--
-- L'INVARIANT EN UNE PHRASE : **une fonction d'ecriture ne doit jamais supprimer la ligne qui
-- participe au predicat qui l'autorise.** L'autorisation d'entree
-- (internal.workspace_assert_can_write_object) ne protege pas : la RLS est re-evaluee PAR LIGNE
-- ECRITE, donc APRES la destruction.
--
-- LE DEFAUT VIF (reproduit en production le 2026-08-26, sur le compte d'un editeur reel).
--   La branche `org_links` faisait `DELETE FROM object_org_link WHERE object_id = …` puis
--   re-inserait tout. Or pour un EDITEUR - ni superuser, ni proprietaire - le droit d'ecrire EST
--   ce lien :
--     api.user_can_write_canonical = user_has_permission('edit_canonical_when_publisher')
--                                    AND EXISTS(object_org_link publisher -> api.current_user_org_id())
--   Apres le DELETE, cet EXISTS est faux des l'instruction SUIVANTE. Le WITH CHECK de la policy
--   canonical_ins_object_org_link (8o) refuse donc la re-insertion :
--     42501  new row violates row-level security policy for table "object_org_link"
--   La transaction entiere est annulee.
--
-- LE JUMEAU, REFERME DANS LA MEME PASSE (demande PO du 2026-08-26).
--   La branche `actors` avait EXACTEMENT la meme forme, et actor_object_role porte lui aussi un
--   droit d'ecrire : api.is_object_owner est vrai pour qui detient sur la fiche un lien acteur
--   PRIMAIRE dont l'e-mail est le sien (api.user_actor_ids). Un appelant dont ce serait l'UNIQUE
--   titre subissait le meme 42501. Mesure sur la base vive le 2026-08-26 : 0 utilisateur dans ce
--   cas - le defaut etait donc un piege de MAINTENANCE, pas une fuite vive. Il est ferme ici pour
--   que la classe entiere disparaisse, pas parce qu'il blessait quelqu'un.
--
-- POURQUOI CELA SE VOYAIT COMME « impossible de rattacher un prestataire ».
--   §15 (relations), §17 (rattachements ORG) et §19 (prestataires) sont UN SEUL module front,
--   `relationships` : tout enregistrement de l'un appelle ce RPC avec la clef `org_links`
--   (buildRelationshipsRpcPayload l'emet des que le chargeur a pu lire les liens - le cas nominal).
--   L'utilisateur touchait les prestataires ; c'est le lien ORG qui cassait ; le front mappait le
--   42501 sur « Cette action n'est pas autorisee avec vos droits actuels » (mapMutationError),
--   affiche sous le libelle du module, « Liens vers fiches ».
--   Un administrateur ne le voyait jamais : il passe par api.is_object_owner ->
--   is_platform_superuser, qui ne lit pas object_org_link. D'ou le rapport initial - « moi je peux,
--   eux non ». Ce defaut est structurellement INVISIBLE au compte le plus privilegie.
--
-- LA FORME DU RECONCILE - 4 etapes, et l'ordre a une raison a chaque fois :
--   1. resoudre le payload SANS ecrire (une reference invalide ne doit rien avoir touche) ;
--   2. retirer le drapeau principal devenu obsolete AVANT d'en poser un nouveau - sinon l'unique
--      partiel (uq_object_primary_org : un principal par fiche ; uq_actor_object_role_primary : un
--      principal par (fiche, role)) refuserait l'etat transitoire. Ce serait une regression
--      INTRODUITE par le correctif, que le delete-all n'avait pas ;
--   3. INSERT … ON CONFLICT DO UPDATE du jeu cible - la ligne qui autorise l'appel n'est jamais
--      supprimee ;
--   4. supprimer EN DERNIER ce que le payload n'a pas repris (un retrait/detachement deliberé
--      reste donc possible).
--
-- CE QUE CE FICHIER NE CHANGE PAS.
--   La fonction reste SECURITY INVOKER : le modele de securite est INCHANGE, la RLS gate toujours
--   chaque ligne ecrite, et l'autorisation d'entree reste internal.workspace_assert_can_write_object.
--   Aucune policy n'est touchee. Les branches `object_relations` et `incoming_relations` sont
--   reprises A L'IDENTIQUE du corps vif au 2026-08-26 (prosrc md5
--   ada466d11941fa7017558a9f63d8513b, byte-identique a la copie 8r - diff §213 fait AVANT toute
--   ecriture).
--
-- LE REPORT DE NOTE §208/T13b EST PRESERVE, ET SIMPLIFIE.
--   Il existait pour compenser le delete-all : un appelant qui echoue api.can_read_actor_contacts
--   charge `note: null` (redaction T13) et l'aurait donc EFFACEE en enregistrant. L'ancien corps
--   prenait un instantane AVANT le DELETE pour la reinjecter. Sans DELETE, « reporter » se reduit a
--   NE PAS ECRIRE la colonne : la ligne conservee garde sa note en base. Meme garantie, un mecanisme
--   de moins. La sonde reste evaluee UNE seule fois, avec son COALESCE(..., FALSE) (§204) - forme
--   assertee par tests/test_actor_link_note_carryover.sql (16u-test2), qui doit rester VERT.
--
-- EFFET DE BORD SOUHAITABLE : une ligne inchangee n'est plus supprimee puis recreee. Elle garde son
--   `created_at`, et audit.log_row_changes cesse d'enregistrer un DELETE + un INSERT a chaque
--   enregistrement du module.
--
-- LIMITE ASSUMEE (pre-existante, non introduite ici) : un appelant qui retire DELIBEREMENT le lien
--   qui porte son propre droit (son ORG publisher, ou son propre drapeau primaire) se verrouille -
--   l'appel echoue en 42501 a l'etape 2 ou 4. C'est honnete et bruyant, et c'est le « last-publisher
--   self-lock-out » deja inscrit au registre des differes ; le reconcile ne l'aggrave pas.
--
-- PREREQUISITES: object_workspace_safe_write_rpcs.sql (7), migration_actor_links_editor.sql (8r),
--   migration_permission_write_paths.sql (8b), migration_write_policy_percommand.sql (8o),
--   migration_actor_contacts_org_gate.sql (16u - la branche `actors` appelle
--   api.can_read_actor_contacts, resolue a l'EXECUTION). Manifest step 16v.
-- IDEMPOTENT: CREATE OR REPLACE FUNCTION.
-- REVERSIBLE: re-appliquer migration_actor_links_editor.sql (8r), qui reinstalle le corps delete-all
--   - et REOUVRE le defaut. Ne le faire que pour un diagnostic, jamais comme etat cible.
-- ⚠ BODY SYNC: ce corps est replie a l'identique dans object_workspace_safe_write_rpcs.sql (7) et
--   dans migration_actor_links_editor.sql (8r). Editer les TROIS ou fresh != live.
BEGIN;

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
    -- §208/T13b + §214 - ANTI-CLOBBER de `note`, ET anti-destruction du droit d'ecrire.
    -- (a) api.get_object_resource REDACTE actor_object_role.note (NULL) pour tout appelant qui
    --     echoue api.can_read_actor_contacts (§208/T13). Prendre `note` du payload DETRUIRAIT donc
    --     la note de chaque lien acteur pour un tel appelant : il charge NULL, il enregistre, la
    --     note disparait - sans erreur, sans signal, et sans qu'il ait jamais vu le champ. Ce n'est
    --     pas une saisie ignoree, c'est une PERTE DE DONNEE. Le correctif vit ICI, dans le writer
    --     PARTAGE : une garde cote appelant n'en couvrirait qu'un (le RPC est aussi re-dispatche
    --     par la moderation, 8u).
    -- (b) §214 - cette branche etait, comme `org_links`, un delete-all + re-insert. Or
    --     actor_object_role PORTE lui aussi un droit d'ecrire : api.is_object_owner est vrai pour
    --     qui detient sur la fiche un lien acteur PRIMAIRE dont l'e-mail est le sien
    --     (api.user_actor_ids). Un appelant dont ce serait l'UNIQUE titre voyait donc son propre
    --     droit disparaitre avec le DELETE, puis le WITH CHECK de canonical_ins_actor_object_role
    --     refuser la re-insertion : 42501, exactement le defaut referme sur `org_links`.
    --     Le reconcile ci-dessous supprime les DEUX problemes d'un coup - et rend (a) plus simple :
    --     une ligne conservee n'est plus detruite puis recreee, donc « reporter » la note se reduit
    --     a NE PAS ECRIRE la colonne. Plus d'instantane pre-DELETE a tenir.
    -- Sonde evaluee UNE SEULE FOIS - p_object_id est constant pour tout l'appel et la garde est
    -- SECURITY DEFINER donc NON inlinable : la mettre par ligne rejouerait
    -- current_user_crm_object_ids a chaque lien (§35/§204). Elle est en outre PARESSEUSE : corps
    -- d'un IF plpgsql, donc ni planifiee ni executee quand le payload ne porte pas `actors`.
    -- COALESCE(..., FALSE) : une sonde a trois valeurs en position booleenne est fail-OPEN sans lui
    -- (§204), et « ouvert » signifierait ici « ecrire le NULL du payload », c.-a-d. effacer.
    v_actor_notes_writable := COALESCE(api.can_read_actor_contacts(p_object_id), FALSE);

    -- 1. Resolution + validation SANS ecrire (une reference invalide ne doit rien avoir touche).
    v_targets := '[]'::jsonb;
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
      -- Doublon (acteur, role) : c'est la PK moins object_id (constant). L'ancien corps levait 23505
      -- au re-INSERT ; on leve le MEME code explicitement plutot que de laisser l'ON CONFLICT rendre
      -- 21000, illisible - et surtout jamais d'absorption silencieuse (§212).
      IF EXISTS (SELECT 1 FROM jsonb_array_elements(v_targets) AS t(value)
                  WHERE (t.value->>'actor_id')::uuid = internal.workspace_uuid(v_row->>'actor_id')
                    AND (t.value->>'role_id')::uuid = v_id) THEN
        RAISE EXCEPTION 'Duplicate actor link in payload (actor %, role %)',
          v_row->>'actor_id', v_id USING ERRCODE = '23505';
      END IF;
      v_targets := v_targets || jsonb_build_array(jsonb_build_object(
        'actor_id',   internal.workspace_uuid(v_row->>'actor_id'),
        'role_id',    v_id,
        'is_primary', COALESCE(NULLIF(v_row->>'is_primary', '')::boolean, false),
        'valid_from', NULLIF(v_row->>'valid_from', ''),
        'valid_to',   NULLIF(v_row->>'valid_to', ''),
        'visibility', COALESCE(NULLIF(v_row->>'visibility', ''), 'public'),
        'note',       NULLIF(v_row->>'note', '')
      ));
    END LOOP;

    -- 2. Demarquer AVANT de marquer : uq_actor_object_role_primary est un UNIQUE partiel sur
    --    (object_id, role_id) WHERE is_primary - un seul principal PAR ROLE. Sans cette etape,
    --    deplacer le principal d'un acteur a l'autre heurterait l'etat transitoire.
    UPDATE public.actor_object_role aor
       SET is_primary = FALSE
     WHERE aor.object_id = p_object_id
       AND aor.is_primary
       AND NOT EXISTS (
             SELECT 1 FROM jsonb_array_elements(v_targets) AS t(value)
              WHERE (t.value->>'actor_id')::uuid = aor.actor_id
                AND (t.value->>'role_id')::uuid = aor.role_id
                AND (t.value->>'is_primary')::boolean);

    -- 3. UPSERT du jeu cible. La ligne qui porte eventuellement le droit d'ecrire de l'appelant
    --    (lien primaire a son e-mail) est MISE A JOUR, jamais supprimee.
    --    `note` : le payload ne fait autorite que si l'appelant l'a reellement LU. Sinon on laisse
    --    la valeur EN BASE telle quelle (c'est le « report » de T13b, desormais structurel - il n'y
    --    a plus de suppression a compenser). Sur un lien NOUVEAU pour un appelant restreint, la
    --    colonne reste NULL : consequence assumee et inchangee, l'editeur desactive le champ quand
    --    `contacts_restricted` est vrai (voir le rapport T13b).
    INSERT INTO public.actor_object_role (actor_id, object_id, role_id, is_primary, valid_from, valid_to, visibility, note)
    SELECT (t.value->>'actor_id')::uuid,
           p_object_id,
           (t.value->>'role_id')::uuid,
           (t.value->>'is_primary')::boolean,
           (t.value->>'valid_from')::date,
           (t.value->>'valid_to')::date,
           t.value->>'visibility',
           CASE WHEN v_actor_notes_writable THEN t.value->>'note' END
      FROM jsonb_array_elements(v_targets) AS t(value)
    ON CONFLICT (actor_id, object_id, role_id) DO UPDATE
       SET is_primary = EXCLUDED.is_primary,
           valid_from = EXCLUDED.valid_from,
           valid_to   = EXCLUDED.valid_to,
           visibility = EXCLUDED.visibility,
           note       = CASE WHEN v_actor_notes_writable THEN EXCLUDED.note
                             ELSE public.actor_object_role.note END;
    GET DIAGNOSTICS v_inserted = ROW_COUNT;

    -- 4. Supprimer EN DERNIER ce que le payload n'a pas repris (un detachement reste possible).
    DELETE FROM public.actor_object_role aor
     WHERE aor.object_id = p_object_id
       AND NOT EXISTS (
             SELECT 1 FROM jsonb_array_elements(v_targets) AS t(value)
              WHERE (t.value->>'actor_id')::uuid = aor.actor_id
                AND (t.value->>'role_id')::uuid = aor.role_id);
    GET DIAGNOSTICS v_deleted = ROW_COUNT;
    v_counts := v_counts || jsonb_build_object('actor_object_role_deleted', v_deleted, 'actor_object_role_inserted', v_inserted);
  END IF;

  RETURN internal.workspace_result(true, v_counts, v_skipped, v_warnings);
END;
$$;

REVOKE ALL ON FUNCTION api.save_object_relations(text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION api.save_object_relations(text, jsonb) TO authenticated, service_role;

-- NOTIFY dans la transaction : delivre au COMMIT, donc jamais emis par une passe --validate.
NOTIFY pgrst, 'reload schema';

COMMIT;
