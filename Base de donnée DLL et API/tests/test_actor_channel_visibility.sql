-- test_actor_channel_visibility.sql
-- Prouve migration_actor_channel_visibility.sql (manifeste 17e, chantier 2026-08-28 n°1
-- sous-lot 1b) :
--   (A) COLONNE — `actor_channel.is_public` existe, est `NOT NULL`, et son défaut est **FALSE**.
--       Le défaut est asserté explicitement : c'est l'INVERSE de `contact_channel.is_public`
--       (DEFAULT TRUE), et l'inverser par mégarde rendrait diffusables 1 370 coordonnées de
--       personnes. Le test compare d'ailleurs les DEUX tables, pour que l'asymétrie soit un
--       fait vérifié et non une intention écrite dans un commentaire.
--   (B) ÉCRITURE — un Éditeur (permission `write_crm_notes` seule, ni admin ni superuser : le
--       persona le MOINS privilégié qui doit passer, §214) crée un canal PRIVÉ par défaut, puis
--       bascule sa visibilité. La garde d'autorisation n'est pas touchée par ce chantier ; on
--       vérifie qu'elle laisse toujours passer.
--   (C) ENREGISTREMENT PARTIEL — un `save_actor_channel` qui ne porte PAS la clé `is_public`
--       (le RPC est appelé champ par champ) ne doit PAS écraser la visibilité. C'est le piège
--       « clé absente = NULL » documenté en tête de cette fonction : sans la garde
--       `p_payload ? 'is_public'`, corriger un numéro de téléphone repasserait le canal public.
--   (D) VOIE DE LECTURE — `api.list_actor_crm` ÉMET la clé `is_public`. Sans elle la colonne
--       serait MORTE : remplir une colonne qu'aucun consommateur n'émet n'affiche rien, et
--       personne ne s'en aperçoit (classe §16q/§209). C'est CE bloc qui rougit si la voie de
--       lecture est oubliée.
--   (E) NON-RÉGRESSION — le drapeau ne FILTRE rien sur les surfaces CRM : un canal privé reste
--       rendu à un membre autorisé. C'est la sémantique arrêtée avant la migration, et c'est ce
--       qui rend `DEFAULT false` sans effet visible le jour du déploiement.
--
-- Run AFTER the full manifest. Auto-contenu + transactionnel (ROLLBACK ; rien ne persiste).
-- Plage de fixtures dédiée 12xx.
\set ON_ERROR_STOP on
BEGIN;
DO $$
DECLARE
  v_org    text := 'ORGRUN9999991201';
  v_obj    text := 'HOTRUN9999991211';
  v_user   uuid := '00000000-0000-4000-a000-000000001201';
  v_actor  uuid := '00000000-0000-4000-a000-000000001221';
  v_pub_role   uuid;
  v_actor_role uuid;
  v_perm_id    uuid;
  v_email_kind uuid;
  v_chan       uuid;
  v_is_public  boolean;
  v_payload    jsonb;
  v_channels   jsonb;
BEGIN
  -- ---------- (A) La colonne, et l'asymétrie assumée avec contact_channel ----------
  ASSERT EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_schema='public' AND table_name='actor_channel' AND column_name='is_public'),
         'A1 : actor_channel.is_public est absente (migration 17e non appliquee)';
  ASSERT (SELECT is_nullable FROM information_schema.columns
           WHERE table_schema='public' AND table_name='actor_channel' AND column_name='is_public') = 'NO',
         'A2 : is_public doit etre NOT NULL (un troisieme etat « inconnu » n a aucun sens ici)';
  ASSERT (SELECT column_default FROM information_schema.columns
           WHERE table_schema='public' AND table_name='actor_channel' AND column_name='is_public') = 'false',
         'A3 : le defaut doit etre FALSE — une coordonnee de PERSONNE ne se diffuse pas par omission';
  ASSERT (SELECT column_default FROM information_schema.columns
           WHERE table_schema='public' AND table_name='contact_channel' AND column_name='is_public') = 'true',
         'A4 : contact_channel garde son defaut TRUE — l asymetrie entre coordonnee d ETABLISSEMENT '
         'et coordonnee de PERSONNE est deliberee, et doit rester un fait verifie';

  -- ---------- Fixture (superuser, RLS bypass) ----------
  SELECT id INTO v_pub_role FROM ref_org_role WHERE code='publisher' LIMIT 1;
  IF v_pub_role IS NULL THEN RAISE EXCEPTION 'fixture: ref_org_role[publisher] manquant'; END IF;
  SELECT id INTO v_actor_role FROM ref_actor_role WHERE code='operator' LIMIT 1;
  IF v_actor_role IS NULL THEN
    v_actor_role := gen_random_uuid();
    INSERT INTO ref_actor_role (id, code, name) VALUES (v_actor_role,'operator','Exploitant');
  END IF;
  SELECT id INTO v_perm_id FROM ref_permission WHERE code='write_crm_notes' AND is_active LIMIT 1;
  IF v_perm_id IS NULL THEN RAISE EXCEPTION 'fixture: ref_permission[write_crm_notes] manquant'; END IF;
  SELECT id INTO v_email_kind FROM ref_code_contact_kind WHERE code='email' AND is_active LIMIT 1;
  IF v_email_kind IS NULL THEN RAISE EXCEPTION 'fixture: ref_code_contact_kind[email] manquant'; END IF;

  INSERT INTO auth.users (id, email) VALUES (v_user,'actor_chan_vis@test.local') ON CONFLICT (id) DO NOTHING;
  INSERT INTO app_user_profile (id, role) VALUES (v_user,'tourism_agent')
    ON CONFLICT (id) DO UPDATE SET role = EXCLUDED.role;
  INSERT INTO object (id, object_type, name, status) VALUES
    (v_org,'ORG','ORG visibilite canal','published'),
    (v_obj,'HOT','Hotel visibilite canal','draft')
    ON CONFLICT (id) DO NOTHING;
  INSERT INTO object_org_link (object_id, org_object_id, role_id) VALUES (v_obj,v_org,v_pub_role)
    ON CONFLICT DO NOTHING;
  INSERT INTO actor (id, display_name) VALUES (v_actor,'Exploitant visibilite canal') ON CONFLICT (id) DO NOTHING;
  INSERT INTO actor_object_role (actor_id, object_id, role_id, is_primary)
    VALUES (v_actor,v_obj,v_actor_role,TRUE) ON CONFLICT DO NOTHING;
  INSERT INTO user_org_membership (user_id, org_object_id, is_active) VALUES (v_user,v_org,TRUE)
    ON CONFLICT DO NOTHING;
  -- Persona le MOINS privilégié qui doit passer : la permission seule, ni rôle admin ni superuser.
  INSERT INTO user_permission (user_id, permission_id, is_active) VALUES (v_user,v_perm_id,TRUE)
    ON CONFLICT DO NOTHING;

  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_user, 'role','authenticated')::text, true);
  SET LOCAL ROLE authenticated;

    ASSERT api.user_can_write_crm_actor(v_actor),
           'prealable : l Editeur doit pouvoir ecrire sur cet acteur — sinon tout le bloc B passe a vide';

    -- ---------- (B) Création : PRIVÉ par défaut, puis bascule ----------
    v_chan := (api.save_actor_channel(jsonb_build_object(
      'actor_id', v_actor, 'kind_code', 'email', 'value', 'prive@visibilite.test'))->>'id')::uuid;

  RESET ROLE;
  PERFORM set_config('request.jwt.claims', NULL, true);

  SELECT is_public INTO v_is_public FROM actor_channel WHERE id = v_chan;
  ASSERT v_is_public = FALSE,
         'B1 : un canal cree sans preciser la visibilite doit naitre PRIVE';

  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_user, 'role','authenticated')::text, true);
  SET LOCAL ROLE authenticated;
    PERFORM api.save_actor_channel(jsonb_build_object('id', v_chan, 'is_public', true));
  RESET ROLE;
  PERFORM set_config('request.jwt.claims', NULL, true);

  SELECT is_public INTO v_is_public FROM actor_channel WHERE id = v_chan;
  ASSERT v_is_public = TRUE,
         'B2 : un Editeur (write_crm_notes seule) doit pouvoir rendre un canal diffusable';

  -- ---------- (C) Enregistrement PARTIEL : la visibilité survit ----------
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_user, 'role','authenticated')::text, true);
  SET LOCAL ROLE authenticated;
    -- Payload SANS la clé `is_public` — exactement ce qu'envoie une correction de valeur seule.
    PERFORM api.save_actor_channel(jsonb_build_object('id', v_chan, 'value', 'corrige@visibilite.test'));
  RESET ROLE;
  PERFORM set_config('request.jwt.claims', NULL, true);

  SELECT is_public INTO v_is_public FROM actor_channel WHERE id = v_chan;
  ASSERT v_is_public = TRUE,
         'C1 : un enregistrement PARTIEL ne doit PAS ecraser la visibilite — sans la garde '
         '`p_payload ? ''is_public''`, corriger une adresse repasserait le canal en prive';
  ASSERT (SELECT value FROM actor_channel WHERE id = v_chan) = 'corrige@visibilite.test',
         'C2 : la correction de valeur doit tout de meme avoir eu lieu (garde non vacante)';

  -- ---------- (D) + (E) La voie de lecture émet le drapeau, et ne filtre pas ----------
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_user, 'role','authenticated')::text, true);
  SET LOCAL ROLE authenticated;
    -- Repasser le canal en privé : le bloc E doit prouver qu'il reste RENDU malgré tout.
    PERFORM api.save_actor_channel(jsonb_build_object('id', v_chan, 'is_public', false));
    v_payload := api.list_actor_crm(v_actor);
  RESET ROLE;
  PERFORM set_config('request.jwt.claims', NULL, true);

  v_channels := v_payload -> 'channels';
  ASSERT jsonb_typeof(v_channels) = 'array',
         'D0 : list_actor_crm doit rendre un tableau `channels`';
  ASSERT EXISTS (SELECT 1 FROM jsonb_array_elements(v_channels) c
                  WHERE (c->>'id')::uuid = v_chan AND c ? 'is_public'),
         'D1 : la cle `is_public` doit etre EMISE par list_actor_crm — sans voie de lecture la '
         'colonne est MORTE : on la remplit et rien ne s affiche (classe §16q/§209)';
  ASSERT (SELECT (c->>'is_public')::boolean FROM jsonb_array_elements(v_channels) c
           WHERE (c->>'id')::uuid = v_chan) = FALSE,
         'D2 : la valeur emise doit refleter l etat reel du canal';
  ASSERT EXISTS (SELECT 1 FROM jsonb_array_elements(v_channels) c WHERE (c->>'id')::uuid = v_chan),
         'E1 : un canal PRIVE reste RENDU au membre autorise — le drapeau ne gate que les surfaces '
         'de DIFFUSION ; s il filtrait ici, le deploiement viderait les fiches de tous les agents';

  RAISE NOTICE 'actor channel visibility assertions passed (A colonne NOT NULL defaut FALSE + asymetrie assumee avec contact_channel / B creation privee puis bascule par un Editeur / C enregistrement partiel sans ecrasement / D la voie de lecture EMET le drapeau / E elle ne le FILTRE pas).';
END$$;
ROLLBACK;
