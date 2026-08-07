-- migration_selection_emails.sql
-- §211 — Export de la liste d'e-mails d'une sélection (Explorer ou liste enregistrée).
--
-- Rend des lignes BRUTES : le dédoublonnage et le formatage vivent côté client,
-- de sorte que changer le séparateur dans la modale ne coûte aucun aller-retour.
--
-- Spec : docs/superpowers/specs/2026-08-07-copier-emails-selection-design.md
-- Idempotent (CREATE OR REPLACE).

CREATE OR REPLACE FUNCTION api.list_selection_emails(
  p_object_ids text[] DEFAULT NULL,
  p_list_id    uuid   DEFAULT NULL
) RETURNS json
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public, api, internal, auth AS $$
DECLARE
  v_list      object_list;
  v_ids       text[];          -- ids DÉDOUBLONNÉS, dans l'ordre de la sélection
  v_requested int;
  v_res       json;
BEGIN
  -- NOTE D'IMPLÉMENTATION — pas de TABLE TEMPORAIRE ici, volontairement :
  -- `CREATE TEMP TABLE … ON COMMIT DROP` dans une fonction `STABLE` échoue au
  -- SECOND appel de la même transaction (« relation already exists ») et casse en
  -- transaction read-only. L'ordre est porté par un tableau + `WITH ORDINALITY`.
  -- ---------- 1. Garde éditeur, FAIL-CLOSED ----------
  -- COALESCE obligatoire : la fonction est à TROIS valeurs et rend NULL hors
  -- contexte HTTP. Sans lui, `IF NOT NULL` ne prend pas la branche et la garde
  -- devient fail-OPEN.
  IF NOT COALESCE(api.current_user_can_edit_objects(), FALSE) THEN
    RAISE SQLSTATE '42501' USING MESSAGE = 'FORBIDDEN_EMAIL_EXPORT';
  END IF;

  -- ---------- 2. Ensemble demandé ----------
  IF (p_object_ids IS NULL) = (p_list_id IS NULL) THEN
    RAISE SQLSTATE 'PT400' USING MESSAGE = 'INVALID_ARGUMENT';
  END IF;

  IF p_object_ids IS NOT NULL THEN
    -- Plafond vérifié AVANT unnest : un immense tableau de doublons ne doit pas
    -- être déplié pour être ensuite réduit.
    IF cardinality(p_object_ids) > 2000 THEN
      RAISE SQLSTATE 'PT413' USING MESSAGE = 'TOO_MANY_OBJECTS';
    END IF;
    -- Doublon ⇒ on garde la PREMIÈRE ordinalité, puis on ordonne par elle :
    -- c'est cet ordre-là, et lui seul, qui est le contrat de sortie.
    SELECT array_agg(d.id ORDER BY d.ord) INTO v_ids
    FROM (
      SELECT DISTINCT ON (u.id) u.id, u.ord
      FROM unnest(p_object_ids) WITH ORDINALITY AS u(id, ord)
      WHERE u.id IS NOT NULL AND btrim(u.id) <> ''
      ORDER BY u.id, u.ord
    ) d;
  ELSE
    -- Charger la ligne AVANT d'autoriser : api.user_can_read_list rend FALSE sur
    -- une liste supprimée (⇒ 42501 au lieu de PT404) et TRUE pour un superuser
    -- sur un UUID inexistant (⇒ ligne NULL). L'ordre inverse ment dans les deux
    -- sens. Compromis assumé : révèle l'existence d'une liste à qui ne peut pas
    -- la lire — acceptable, les ids sont des UUID v4 non énumérables.
    SELECT * INTO v_list FROM public.object_list WHERE id = p_list_id;
    IF NOT FOUND THEN
      RAISE SQLSTATE 'PT404' USING MESSAGE = 'LIST_NOT_FOUND';
    END IF;
    IF NOT COALESCE(api.user_can_read_list(p_list_id), FALSE) THEN
      RAISE SQLSTATE '42501' USING MESSAGE = 'FORBIDDEN';
    END IF;

    IF v_list.kind = 'static' THEN
      -- LIMIT posé DANS la lecture : une liste statique n'a pas de plafond de
      -- composition, rien ne garantit qu'elle tienne en mémoire avant comptage.
      -- Départage sur object_id : `position` n'est pas unique par liste, et sans
      -- second critère l'ordre — donc la « première occurrence » du
      -- dédoublonnage client — dépendrait du plan choisi par PostgreSQL.
      SELECT array_agg(t.object_id ORDER BY t.position, t.object_id) INTO v_ids
      FROM (
        SELECT i.object_id, i.position
        FROM public.object_list_item i
        WHERE i.list_id = p_list_id
        ORDER BY i.position, i.object_id
        LIMIT 2001
      ) t;
    ELSE
      -- 2001 = 2000+1 : distingue « exactement 2000 » de « plus de 2000 ».
      -- published-only, fidèle à la sémantique du module Listes (get_list).
      SELECT array_agg(r.object_id ORDER BY r.ord) INTO v_ids
      FROM internal.resolve_list_object_ids(v_list.filters, TRUE, 2001)
        WITH ORDINALITY AS r(object_id, ord);
    END IF;

    IF COALESCE(cardinality(v_ids), 0) > 2000 THEN
      RAISE SQLSTATE 'PT413' USING MESSAGE = 'TOO_MANY_OBJECTS';
    END IF;
  END IF;

  v_ids       := COALESCE(v_ids, ARRAY[]::text[]);
  v_requested := cardinality(v_ids);

  -- ---------- 3. Périmètre + statut, AVANT toute lecture de contact ----------
  -- Périmètre = les fiches dont MON ORG est publisher (le périmètre du CRM, qui
  -- manipule les mêmes données de contact). `readable` ne conviendrait PAS :
  -- lire une fiche publiée d'une autre ORG ne donne pas droit à l'adresse
  -- personnelle de son gérant. La fonction est exécutable par PostgREST : on ne
  -- fait jamais confiance à la liste d'ids reçue.
  -- ---------- 4. Cascade + 5. Retour ----------
  WITH eligible AS (
    SELECT s.object_id, s.ord::int AS ord, o.name
    FROM unnest(v_ids) WITH ORDINALITY AS s(object_id, ord)
    JOIN public.object o ON o.id = s.object_id
    WHERE o.status NOT IN ('archived', 'hidden')
      AND (o.id IN (SELECT api.current_user_crm_object_ids())
           OR api.is_platform_superuser())
  ),
  resolved AS (
    SELECT
      e.object_id,
      e.ord,
      e.name,
      COALESCE(actor_mail.value, own_mail.value)                       AS email,
      CASE WHEN actor_mail.value IS NOT NULL THEN 'actor' ELSE 'object' END AS source
    FROM eligible e
    LEFT JOIN LATERAL (
      -- Bras PRESTATAIRE : rôle operator, visibilité public/partners (private
      -- exclu — un drapeau de visibilité se compose), lien temporellement valide,
      -- et refus de consentement honoré. NULLS LAST : is_primary est NULLABLE et
      -- `DESC` place les NULL EN PREMIER par défaut.
      SELECT ac.value
      FROM public.actor_object_role aor
      JOIN public.actor_channel ac        ON ac.actor_id = aor.actor_id
      JOIN public.ref_code_contact_kind k ON k.id = ac.kind_id AND k.code = 'email'
      JOIN public.ref_actor_role ar       ON ar.id = aor.role_id AND ar.code = 'operator'
      WHERE aor.object_id = e.object_id
        AND aor.visibility IN ('public', 'partners')
        AND (aor.valid_from IS NULL OR aor.valid_from <= CURRENT_DATE)
        AND (aor.valid_to   IS NULL OR aor.valid_to   >= CURRENT_DATE)
        AND NOT EXISTS (
          SELECT 1 FROM public.actor_consent ac2
          WHERE ac2.actor_id = aor.actor_id
            AND ac2.channel = 'email'
            AND ac2.consent_given = FALSE)
      ORDER BY aor.is_primary DESC NULLS LAST,
               ac.is_primary  DESC NULLS LAST,
               ac.position NULLS LAST, ac.created_at, ac.id
      LIMIT 1
    ) actor_mail ON TRUE
    LEFT JOIN LATERAL (
      -- Bras FICHE : l'adresse de l'établissement. PAS de filtre `is_public`,
      -- volontairement — l'appelant est un éditeur de l'ORG publisher, qui a déjà
      -- accès aux canaux internes de ses propres fiches (le drapeau `is_public` ne
      -- gate que le lecteur anonyme, §49). Sur le corpus réel les 819 adresses
      -- sont publiques de toute façon.
      SELECT cc.value
      FROM public.contact_channel cc
      JOIN public.ref_code_contact_kind k ON k.id = cc.kind_id AND k.code = 'email'
      WHERE cc.object_id = e.object_id
      ORDER BY cc.is_primary DESC NULLS LAST,
               cc.position NULLS LAST, cc.created_at, cc.id
      LIMIT 1
    ) own_mail ON TRUE
  )
  SELECT json_build_object(
    'requested_count', v_requested,
    'eligible_count',  (SELECT count(*) FROM resolved),
    'excluded_count',  v_requested - (SELECT count(*) FROM resolved),
    'rows', COALESCE((
      SELECT json_agg(json_build_object(
               'object_id', r.object_id, 'email', r.email,
               'source', r.source, 'ord', r.ord) ORDER BY r.ord)
      FROM resolved r WHERE r.email IS NOT NULL), '[]'::json),
    'missing', COALESCE((
      SELECT json_agg(json_build_object(
               'object_id', r.object_id, 'name', r.name) ORDER BY r.ord)
      FROM resolved r WHERE r.email IS NULL), '[]'::json)
  ) INTO v_res;

  RETURN v_res;
END;
$$;

REVOKE ALL ON FUNCTION api.list_selection_emails(text[], uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION api.list_selection_emails(text[], uuid)
  TO authenticated, service_role;

COMMENT ON FUNCTION api.list_selection_emails(text[], uuid) IS
  'Export des e-mails d''une sélection Explorer (p_object_ids) OU d''une liste '
  '(p_list_id). Authorize-once SECURITY DEFINER : garde éditeur (§205) puis '
  'périmètre ORG publisher (= périmètre CRM — `readable` ne suffit pas pour une '
  'donnée partners). Cascade prestataire operator → fiche. Rend des lignes brutes ; '
  'dédoublonnage et formatage côté client. §211';
