-- migration_actor_channel_visibility.sql
-- Manifeste 17e — lot de corrections 2026-08-28, chantier 1 sous-lot 1b (arbitrage PO Q1 : OUI,
-- avec défaut PRIVÉ).
--
-- CE N'ÉTAIT PAS UNE GARDE TROP STRICTE, C'ÉTAIT UNE FONCTIONNALITÉ ABSENTE AUX TROIS ÉTAGES.
-- Marquer un canal d'acteur comme privé était impossible pour TOUT LE MONDE, superuser compris :
-- `actor_channel` n'a NI colonne `is_public` NI `visibility`, `api.save_actor_channel` n'accepte
-- que 5 clés (`id`, `actor_id`, `kind_code`, `value`, `is_primary`), et le répéteur de canaux du
-- CRM n'a aucun contrôle. La garde d'autorisation, elle, acceptait déjà l'Éditeur
-- (`api.user_can_write_crm_actor` = `write_crm_notes` OU rang admin) — elle n'est pas touchée.
--
-- ═══ SÉMANTIQUE, ARRÊTÉE AVANT D'ÉCRIRE LA MIGRATION ═══════════════════════════════════════
-- `is_public` ne gate QUE les surfaces de DIFFUSION (public / partenaires). Les surfaces CRM et
-- d'ÉDITION continuent d'émettre TOUS les canaux aux membres autorisés — le drapeau y est
-- affiché, jamais filtré.
--
-- C'est ce qui rend `DEFAULT false` sans effet visible le jour du déploiement : les 1 370 canaux
-- existants deviennent « non diffusables », mais aucun agent ne perd quoi que ce soit à l'écran.
-- Sans cette sémantique, la migration aurait vidé les fiches de tous les agents d'un coup.
--
-- MESURE PRÉALABLE (production, 2026-08-28), qui fonde l'arbitrage :
--   * 1 370 canaux d'acteur : 689 e-mails, 674 mobiles, 7 fixes ;
--   * **4 seulement** appartiennent à un acteur dont le lien objet est `visibility = 'public'` —
--     l'exposition potentielle en diffusion est donc marginale ;
--   * pour comparaison, `contact_channel` (coordonnées d'ÉTABLISSEMENT) : 1 889 publics / 3
--     privés, avec un `DEFAULT TRUE`. **Le défaut inverse ici est délibéré** : un canal d'acteur
--     est une coordonnée de PERSONNE. On demande explicitement sa diffusion, on ne l'obtient
--     jamais par omission.
--
-- ═══ ÉTAT ACTUEL, DIT SANS FARD ════════════════════════════════════════════════════════════
-- **AUCUNE voie de lecture ne FILTRE encore sur ce drapeau, et c'est normal** : depuis §213,
-- aucune surface ne diffuse de coordonnées d'acteur à un anonyme (les trois voies qui fuyaient
-- ont été fermées). Le drapeau est donc une DÉCLARATION saisissable dès maintenant, honorée par
-- la première surface de diffusion qui verra le jour — laquelle devra le composer **DANS** le
-- bras autorisé, jamais s'y substituer (invariant §49 : un drapeau de ligne est un filtre
-- SUPPLÉMENTAIRE, jamais une garde autonome). Le prétendre gardien aujourd'hui serait faux.
--
-- **`api.export_actor_contacts` (§208) n'est PAS filtré non plus, délibérément** : c'est un
-- export journalisé, borné au périmètre publisher (§211), et le filtrer changerait un contrat
-- déjà arbitré — et casserait « Copier les e-mails » (§211). Si le PO veut l'y soumettre, c'est
-- une décision à part, pas un effet de bord de cette migration.
--
-- CE QUE FAIT CETTE MIGRATION
--   (A) la colonne, `NOT NULL DEFAULT FALSE` ;
--   (B) `api.save_actor_channel` accepte la clé `is_public`, **gardée par `p_payload ? 'is_public'`**
--       comme ses voisines : le RPC est appelé champ par champ, et un enregistrement partiel ne
--       doit pas écraser la visibilité (piège documenté en tête de cette fonction, §66) ;
--   (C) `api.list_actor_crm` ÉMET `is_public` dans sa clé `channels` — sans quoi la colonne
--       serait MORTE : remplir une colonne qu'aucune voie de lecture n'émet n'affiche rien, et
--       personne ne s'en aperçoit (classe §16q/§209).
--
-- Idempotent (`ADD COLUMN IF NOT EXISTS` + `CREATE OR REPLACE`). Signatures inchangées ⇒ **pas**
-- de `NOTIFY pgrst`. Après 8z (`migration_crm_module.sql`).

\set ON_ERROR_STOP on
BEGIN;

-- =====================================================
-- (A) La colonne
-- =====================================================
ALTER TABLE public.actor_channel
  ADD COLUMN IF NOT EXISTS is_public boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.actor_channel.is_public IS
  'Visibilité du canal (chantier 2026-08-28, manifeste 17e) : ne gate QUE les surfaces de DIFFUSION (false = interne, défaut, PII ; true = diffusable). Les surfaces CRM et d''édition émettent toujours le canal aux membres autorisés — le périmètre est déjà gardé par api.can_read_actor_contacts (§208), avec lequel ce drapeau COMPOSE sans jamais s''y substituer (§49). Défaut PRIVÉ, à l''inverse de contact_channel.is_public (DEFAULT TRUE) : celui-ci porte une coordonnée d''établissement, celui-là une coordonnée de personne.';

COMMIT;

-- =====================================================
-- (B) api.save_actor_channel accepte la cle `is_public`.
--     Corps DERIVE de migration_crm_module.sql (8z), dont le prosrc VIF a ete verifie
--     md5-IDENTIQUE avant patch (54 lignes normalisees de part et d autre, discipline §213),
--     puis diffe hunk par hunk pour ne porter QUE ce patch.
-- =====================================================
BEGIN;

CREATE OR REPLACE FUNCTION api.save_actor_channel(p_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = public, api, auth
AS $$
DECLARE
  v_id uuid := NULLIF(p_payload->>'id','')::uuid;
  v_actor_id uuid := NULLIF(p_payload->>'actor_id','')::uuid;
  v_existing_actor uuid;
  v_kind_id uuid;
  v_value text := NULLIF(btrim(COALESCE(p_payload->>'value','')),'');
BEGIN
  IF NULLIF(p_payload->>'kind_code','') IS NOT NULL THEN
    SELECT id INTO v_kind_id FROM ref_code_contact_kind
    WHERE code = p_payload->>'kind_code' AND is_active;
    IF v_kind_id IS NULL THEN
      RAISE EXCEPTION 'kind_code inconnu: %', p_payload->>'kind_code' USING ERRCODE = '22023';
    END IF;
  END IF;

  IF v_id IS NOT NULL THEN
    SELECT actor_id INTO v_existing_actor FROM actor_channel WHERE id = v_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'actor_channel inconnu: %', v_id USING ERRCODE = 'P0002';
    END IF;
    IF NOT api.user_can_write_crm_actor(v_existing_actor) THEN
      RAISE EXCEPTION 'Écriture CRM non autorisée' USING ERRCODE = '42501';
    END IF;
    -- value (NOT NULL) et kind_id (NOT NULL) : clé présente + vide = erreur explicite.
    IF p_payload ? 'value' AND v_value IS NULL THEN
      RAISE EXCEPTION 'value requis' USING ERRCODE = '22023';
    END IF;
    IF p_payload ? 'kind_code' AND v_kind_id IS NULL THEN
      RAISE EXCEPTION 'kind_code requis' USING ERRCODE = '22023';
    END IF;
    UPDATE actor_channel SET
      value      = CASE WHEN p_payload ? 'value' THEN v_value ELSE value END,
      kind_id    = CASE WHEN p_payload ? 'kind_code' THEN v_kind_id ELSE kind_id END,
      is_primary = CASE WHEN p_payload ? 'is_primary' THEN COALESCE((p_payload->>'is_primary')::boolean, FALSE) ELSE is_primary END,
      -- 17e — gardé par `p_payload ? 'is_public'` comme ses voisins : un enregistrement partiel
      -- ne doit pas écraser la visibilité avec NULL (le RPC est appelé champ par champ).
      is_public  = CASE WHEN p_payload ? 'is_public'  THEN COALESCE((p_payload->>'is_public')::boolean, FALSE) ELSE is_public END,
      updated_at = NOW()
    WHERE id = v_id;
    RETURN jsonb_build_object('id', v_id);
  END IF;

  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION 'actor_id requis' USING ERRCODE = '22023';
  END IF;
  IF v_kind_id IS NULL THEN
    RAISE EXCEPTION 'kind_code requis' USING ERRCODE = '22023';
  END IF;
  IF v_value IS NULL THEN
    RAISE EXCEPTION 'value requis' USING ERRCODE = '22023';
  END IF;
  IF NOT api.user_can_write_crm_actor(v_actor_id) THEN
    RAISE EXCEPTION 'Écriture CRM non autorisée' USING ERRCODE = '42501';
  END IF;

  v_id := gen_random_uuid();
  INSERT INTO actor_channel (id, actor_id, kind_id, value, is_primary, is_public)
  VALUES (v_id, v_actor_id, v_kind_id, v_value,
          COALESCE((p_payload->>'is_primary')::boolean, FALSE),
          -- 17e — défaut PRIVÉ, à l'inverse de `contact_channel` (donnée d'ÉTABLISSEMENT, défaut
          -- public) : un canal d'acteur est une coordonnée de PERSONNE. Le client doit demander
          -- explicitement la diffusion, jamais l'obtenir par omission.
          COALESCE((p_payload->>'is_public')::boolean, FALSE));
  RETURN jsonb_build_object('id', v_id);
END;
$$;

-- =====================================================
-- (C) api.list_actor_crm EMET `is_public` dans sa cle `channels`.
--     Sans cette voie de lecture la colonne serait MORTE : remplir une colonne qu aucun
--     consommateur n emet n affiche RIEN, et personne ne s en apercoit (classe §16q/§209).
--     Meme derivation, meme verification md5 avant patch (98 lignes de part et d autre).
-- =====================================================
CREATE OR REPLACE FUNCTION api.list_actor_crm(p_actor_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, api, auth
AS $$
DECLARE
  v_scope text[];
  v_actor jsonb;
  v_objects jsonb;
  v_channels jsonb;
  v_interactions jsonb;
  v_topics jsonb;
BEGIN
  IF p_actor_id IS NULL OR NOT api.user_can_read_crm_actor(p_actor_id) THEN
    RAISE EXCEPTION 'CRM non autorisé pour cet acteur' USING ERRCODE = '42501';
  END IF;
  IF NOT api.is_platform_superuser() THEN
    v_scope := ARRAY(SELECT api.current_user_crm_object_ids());
  END IF;

  SELECT jsonb_build_object('id', a.id, 'display_name', a.display_name,
                            'first_name', a.first_name, 'last_name', a.last_name,
                            -- gender = civilité (demande PO 2026-06-14) : prefill du sélecteur
                            -- de civilité dans le modal d'édition.
                            'gender', a.gender,
                            'photo_url', a.photo_url)
  INTO v_actor
  FROM actor a WHERE a.id = p_actor_id;
  IF v_actor IS NULL THEN
    -- Superuser sur un uuid inexistant (l'arme périmètre a déjà refusé les autres).
    RAISE EXCEPTION 'actor inconnu: %', p_actor_id USING ERRCODE = 'P0002';
  END IF;

  SELECT COALESCE(jsonb_agg(item), '[]'::jsonb) INTO v_objects
  FROM (
    SELECT jsonb_build_object(
      'object_id', ar.object_id, 'object_name', o.name, 'object_type', o.object_type,
      'role_code', r.code, 'role_name', r.name, 'is_primary', ar.is_primary
    ) AS item
    FROM actor_object_role ar
    JOIN object o ON o.id = ar.object_id
    JOIN ref_actor_role r ON r.id = ar.role_id
    WHERE ar.actor_id = p_actor_id
      AND (v_scope IS NULL OR ar.object_id = ANY(v_scope))
    ORDER BY ar.is_primary DESC NULLS LAST, o.name
  ) qo;

  -- Canaux de contact de l'acteur (rectif PO 2026-06-11) : la lecture est couverte par le
  -- gate acteur déjà passé (user_can_read_crm_actor) — PII réservée au périmètre publisher.
  SELECT COALESCE(jsonb_agg(item), '[]'::jsonb) INTO v_channels
  FROM (
    SELECT jsonb_build_object(
      'id', ch.id, 'kind_code', k.code, 'kind_name', k.name,
      'value', ch.value, 'is_primary', ch.is_primary,
      -- 17e — visibilité du canal. ÉMISE, jamais filtrée ici : cette voie sert le CRM et
      -- l'édition, dont le périmètre est déjà gardé (api.can_read_actor_contacts, §208). Le
      -- drapeau ne gate que les futures surfaces de DIFFUSION, et il devra alors composer
      -- DANS le bras autorisé, jamais s'y substituer (invariant §49).
      'is_public', ch.is_public
    ) AS item
    FROM actor_channel ch
    JOIN ref_code_contact_kind k ON k.id = ch.kind_id
    WHERE ch.actor_id = p_actor_id
    ORDER BY ch.is_primary DESC NULLS LAST, k.code
  ) qc;

  -- §66 : RACINES uniquement + 'replies' imbriquées (occurred_at ASC) + interlocutor_email +
  -- resolved_at (mêmes ajouts additifs que list_object_crm / list_crm_timeline).
  SELECT COALESCE(jsonb_agg(item), '[]'::jsonb) INTO v_interactions
  FROM (
    SELECT jsonb_build_object(
      'id', ci.id, 'interaction_type', ci.interaction_type, 'direction', ci.direction,
      'status', ci.status, 'subject', ci.subject, 'body', ci.body,
      'occurred_at', ci.occurred_at, 'created_at', ci.created_at, 'resolved_at', ci.resolved_at,
      'object_id', ci.object_id, 'object_name', o.name, -- contexte (NULLs si générale)
      'topic_code', t.code, 'topic_name', t.name,
      'sentiment_code', s.code, 'sentiment_name', s.name,
      'owner_name', p.display_name, 'source', ci.source,
      'interlocutor_email', ci.extra->>'interlocuteur_email',
      'replies', COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
          'id', r.id, 'interaction_type', r.interaction_type, 'body', r.body,
          'occurred_at', r.occurred_at, 'created_at', r.created_at,
          'sentiment_code', rs.code, 'sentiment_name', rs.name,
          'owner_name', rp.display_name, 'interlocutor_email', r.extra->>'interlocuteur_email',
          'source', r.source
        ) ORDER BY r.occurred_at ASC NULLS LAST, r.id ASC)
        FROM crm_interaction r
        LEFT JOIN ref_code_crm_sentiment rs ON rs.id = r.request_sentiment_id
        LEFT JOIN app_user_profile rp ON rp.id = r.owner
        WHERE r.parent_interaction_id = ci.id
      ), '[]'::jsonb)
    ) AS item
    FROM crm_interaction ci
    LEFT JOIN object o ON o.id = ci.object_id
    LEFT JOIN ref_code_demand_topic t ON t.id = ci.demand_topic_id
    LEFT JOIN ref_code_crm_sentiment s ON s.id = ci.request_sentiment_id
    LEFT JOIN app_user_profile p ON p.id = ci.owner
    WHERE ci.actor_id = p_actor_id
      AND ci.parent_interaction_id IS NULL
      AND (v_scope IS NULL OR ci.object_id IS NULL OR ci.object_id = ANY(v_scope))
    ORDER BY ci.occurred_at DESC NULLS LAST, ci.id DESC
  ) qi;

  SELECT COALESCE(jsonb_agg(item), '[]'::jsonb) INTO v_topics
  FROM (
    SELECT jsonb_build_object('code', g.code, 'name', g.name, 'count', g.n) AS item
    FROM (
      SELECT t.code, t.name, count(*) AS n
      FROM crm_interaction ci
      JOIN ref_code_demand_topic t ON t.id = ci.demand_topic_id
      WHERE ci.actor_id = p_actor_id
        AND (v_scope IS NULL OR ci.object_id IS NULL OR ci.object_id = ANY(v_scope))
      GROUP BY t.code, t.name
    ) g
    ORDER BY g.n DESC
  ) qg;

  RETURN jsonb_build_object('actor', v_actor, 'objects', v_objects, 'channels', v_channels,
                            'interactions', v_interactions, 'topics', v_topics);
END;
$$;

COMMIT;
