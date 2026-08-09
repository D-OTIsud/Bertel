-- migration_selection_emails.sql
-- §211 — Export de la liste d'e-mails d'une sélection (Explorer ou liste enregistrée).
--
-- Rend des lignes BRUTES : le dédoublonnage et le formatage vivent côté client,
-- de sorte que changer le séparateur dans la modale ne coûte aucun aller-retour.
--
-- Spec : docs/superpowers/specs/2026-08-07-copier-emails-selection-design.md
--
-- §208 (tâche 7, revue finale 2026-08-08) — cette fonction se PLIE au régime
-- posé par migration_actor_contacts_org_gate.sql pour tout export de
-- coordonnées d'ACTEUR : finalité obligatoire validée serveur, journal écrit
-- dans public.actor_contact_export_log DANS LA MÊME TRANSACTION que la
-- lecture (uniquement quand le bras acteur émet réellement une adresse — une
-- sélection entièrement résolue par les adresses de FICHE n'est pas un export
-- de PII d'acteur), bras superuser ALIGNÉ sur api.can_read_actor_contacts
-- (jamais api.is_platform_superuser(), dont le premier bras dirait TRUE à une
-- clé service_role), et AUCUN GRANT à service_role — un export de PII est
-- imputable à une personne. Voir le COMMENT de api.can_read_actor_contacts
-- (§208) : cette fonction en est désormais la TROISIÈME formulation du
-- périmètre « qui voit les coordonnées d'un acteur » ; les trois évoluent
-- ensemble.
--
-- Apply order (ci_fresh_apply.sql) : E2 vient désormais APRÈS
-- migration_actor_contacts_org_gate.sql (16u), qui crée
-- public.actor_contact_export_log — cette fonction y écrit.
-- La raison de cet ordre est une DÉPENDANCE LOGIQUE (et la lisibilité du
-- manifeste : une étape ne précède pas ce qu'elle utilise), PAS une contrainte
-- du moteur. Mesuré sur PG 17.6, check_function_bodies=on : un corps plpgsql
-- qui vise une relation absente ou appelle une fonction absente SE CRÉE SANS
-- ERREUR. Énoncé exact : le validateur plpgsql NE RÉSOUT PAS les noms de
-- relations ni de fonctions (résolution différée à l'EXÉCUTION) ; il échoue en
-- revanche sur la SYNTAXE et sur les TYPES (signature et `DECLARE`). Un corps
-- LANGUAGE sql, lui, est validé entièrement au CREATE (42P01 / 42883).
-- Cette fonction ÉTANT plpgsql, l'appliquer avant 16u réussirait EN SILENCE.
-- Sur base FRAÎCHE cela reste sans conséquence (16u passe plus loin dans le
-- même run, avant tout appel) ; le 42P01 n'existe QUE sur une base LIVE où 16u
-- n'a pas été appliquée — un piège pire qu'un déploiement rouge.
--
-- Signature CHANGÉE (tâche 7) : p_reason est désormais le PREMIER paramètre,
-- OBLIGATOIRE (pas de défaut — une finalité oubliée doit être une erreur
-- d'appel, pas une chaîne vide). Un DROP explicite précède le CREATE : une
-- fonction PostgreSQL ne se « remplace » pas quand sa signature change —
-- CREATE OR REPLACE créerait une SURCHARGE co-existante avec l'ancienne forme
-- (p_object_ids, p_list_id), et PostgREST deviendrait ambigu entre les deux.
-- Idempotent (DROP FUNCTION IF EXISTS puis CREATE OR REPLACE).

DROP FUNCTION IF EXISTS api.list_selection_emails(text[], uuid);

CREATE OR REPLACE FUNCTION api.list_selection_emails(
  p_reason     text,
  p_object_ids text[] DEFAULT NULL,
  p_list_id    uuid   DEFAULT NULL
) RETURNS json
-- VOLATILE (et non STABLE) : la fonction écrit désormais dans
-- public.actor_contact_export_log quand le bras acteur émet.
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
-- pg_temp EXPLICITEMENT EN DERNIER (§208 R2.1) : sans lui, PostgreSQL cherche
-- le schéma temporaire EN PREMIER pour résoudre les relations, donc un
-- `CREATE TEMP TABLE app_user_profile` par n'importe quel `authenticated`
-- masquerait la table qui décide du statut superuser au bras ci-dessous.
-- Les relations restent en plus schéma-qualifiées (ceinture + bretelles).
SET search_path = pg_catalog, public, api, internal, auth, pg_temp AS $$
DECLARE
  v_list           object_list;
  v_ids            text[];          -- ids DÉDOUBLONNÉS, dans l'ordre de la sélection
  v_requested      int;
  v_res            json;
  v_eligible_count int;             -- fiches éligibles (= object_count du journal)
  v_eligible_ids   text[];          -- ids éligibles, dans l'ordre (= object_ids du journal)
  v_emitted_actor  bigint;          -- adresses ÉMISES par le SEUL bras acteur
  v_actor_count    bigint;          -- acteurs distincts ayant émis une adresse
BEGIN
  -- NOTE D'IMPLÉMENTATION — pas de TABLE TEMPORAIRE ici, volontairement :
  -- `CREATE TEMP TABLE … ON COMMIT DROP` dans une fonction `STABLE` échoue au
  -- SECOND appel de la même transaction (« relation already exists ») et casse en
  -- transaction read-only. L'ordre est porté par un tableau + `WITH ORDINALITY`.
  -- (La fonction est désormais VOLATILE, mais la même construction reste la
  -- plus simple : aucune raison de la changer.)
  -- ---------- 1. Garde éditeur, FAIL-CLOSED ----------
  -- COALESCE obligatoire : la fonction est à TROIS valeurs et rend NULL hors
  -- contexte HTTP. Sans lui, `IF NOT NULL` ne prend pas la branche et la garde
  -- devient fail-OPEN.
  IF NOT COALESCE(api.current_user_can_edit_objects(), FALSE) THEN
    RAISE SQLSTATE '42501' USING MESSAGE = 'FORBIDDEN_EMAIL_EXPORT';
  END IF;

  -- ---------- 1bis. Finalité obligatoire (régime §208) ----------
  -- Validée ICI, avant de savoir quel bras (acteur ou fiche) répondra — on ne
  -- le sait qu'après la cascade (étape 4). §5 : le journal, lui, n'est écrit
  -- que si le bras acteur a réellement émis.
  IF length(btrim(coalesce(p_reason, ''))) < 5
     OR length(btrim(coalesce(p_reason, ''))) > 500 THEN
    RAISE SQLSTATE 'PT400' USING MESSAGE = 'REASON_REQUIRED';
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
  -- ---------- 4. Cascade + 5. Retour + agrégats du journal (§208) ----------
  WITH eligible AS (
    SELECT s.object_id, s.ord::int AS ord, o.name
    FROM unnest(v_ids) WITH ORDINALITY AS s(object_id, ord)
    JOIN public.object o ON o.id = s.object_id
    WHERE o.status NOT IN ('archived', 'hidden')
      -- Bras superuser ALIGNÉ sur api.can_read_actor_contacts (§208), JAMAIS
      -- api.is_platform_superuser() — son premier bras dirait TRUE à une clé
      -- service_role, exactement ce que le régime §208 exclut. auth.uid() est
      -- garanti non NULL ici (la garde éditeur de l'étape 1 a déjà fermé le cas
      -- hors-contexte-HTTP), mais la forme reprend celle de la source
      -- autoritaire sans la retranscrire différemment.
      AND (o.id IN (SELECT api.current_user_crm_object_ids())
           OR EXISTS (SELECT 1 FROM public.app_user_profile p
                       WHERE p.id = (SELECT auth.uid())
                         AND p.role IN ('owner', 'super_admin')))
  ),
  resolved AS (
    SELECT
      e.object_id,
      e.ord,
      e.name,
      COALESCE(actor_mail.value, own_mail.value)                       AS email,
      CASE WHEN actor_mail.value IS NOT NULL THEN 'actor' ELSE 'object' END AS source,
      actor_mail.actor_id                                              AS actor_id
    FROM eligible e
    LEFT JOIN LATERAL (
      -- Bras PRESTATAIRE : rôle operator, visibilité public/partners (private
      -- exclu — un drapeau de visibilité se compose), lien temporellement valide,
      -- et refus de consentement honoré. NULLS LAST : is_primary est NULLABLE et
      -- `DESC` place les NULL EN PREMIER par défaut.
      SELECT ac.value, aor.actor_id
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
  SELECT
    json_build_object(
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
    ),
    -- Agrégats destinés au SEUL journal (§208) — jamais rendus au client, et ne
    -- portant AUCUNE valeur de coordonnée : des ids et des comptages.
    (SELECT count(*) FROM resolved),
    (SELECT array_agg(r.object_id ORDER BY r.ord) FROM resolved r),
    (SELECT count(*) FROM resolved WHERE source = 'actor'),
    (SELECT count(DISTINCT actor_id) FROM resolved WHERE source = 'actor')
  INTO v_res, v_eligible_count, v_eligible_ids, v_emitted_actor, v_actor_count;

  -- ---------- 6. Journal (§208) — UNIQUEMENT si le bras acteur a émis ----------
  -- Une sélection entièrement résolue par les adresses de FICHE n'est pas un
  -- export de PII d'ACTEUR : rien à journaliser. AUCUNE valeur de coordonnée
  -- (aucune adresse e-mail) n'entre dans le journal — contrat de la table
  -- (COMMENT ON TABLE public.actor_contact_export_log, §208).
  IF coalesce(v_emitted_actor, 0) > 0 THEN
    INSERT INTO public.actor_contact_export_log(
      export_run_id, performed_by, performed_org, reason, format,
      object_count, actor_count, emitted_contact_count, object_ids, channel_kinds)
    VALUES (
      gen_random_uuid(),   -- search_path restreint : jamais uuid_generate_v4 (§29)
      (SELECT auth.uid()),
      api.current_user_org_id(),
      btrim(p_reason),
      'clipboard',
      coalesce(v_eligible_count, 0),
      coalesce(v_actor_count, 0),
      v_emitted_actor,
      coalesce(v_eligible_ids, '{}'),
      ARRAY['email']);
  END IF;

  RETURN v_res;
END;
$$;

-- REVOKE explicite de service_role EN PLUS de PUBLIC/anon (régime §208) : un
-- export de PII est imputable à une personne, jamais à une clé.
REVOKE ALL ON FUNCTION api.list_selection_emails(text, text[], uuid) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION api.list_selection_emails(text, text[], uuid)
  TO authenticated;

COMMENT ON FUNCTION api.list_selection_emails(text, text[], uuid) IS
  'Export des e-mails d''une sélection Explorer (p_object_ids) OU d''une liste '
  '(p_list_id). Authorize-once SECURITY DEFINER : garde éditeur (§205) puis '
  'périmètre ORG publisher (= périmètre CRM — `readable` ne suffit pas pour une '
  'donnée partners). Cascade prestataire operator → fiche. Rend des lignes brutes ; '
  'dédoublonnage et formatage côté client. §211. '
  'RÉGIME §208 (tâche 7, 2026-08-08) : p_reason PREMIER paramètre, obligatoire '
  '(5–500 car., sinon PT400/REASON_REQUIRED) ; VOLATILE (écrit) ; journal '
  'public.actor_contact_export_log dans la MÊME transaction, UNIQUEMENT quand le '
  'bras acteur émet au moins une adresse (une sélection entièrement résolue par '
  'les adresses de fiche n''a rien à journaliser) ; AUCUNE valeur de coordonnée '
  'dans le journal ; bras superuser ALIGNÉ sur api.can_read_actor_contacts '
  '(jamais api.is_platform_superuser()) ; PAS de GRANT à service_role. '
  'Troisième formulation du périmètre « qui voit les coordonnées d''un acteur » '
  '(§208) — évolue avec api.can_read_actor_contacts et la forme ensembliste de '
  'api.export_actor_contacts.';
