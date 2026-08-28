-- migration_crm_interaction_default_status.sql
-- Manifeste 17b — lot de corrections 2026-08-28, chantier 5 (signalement PO).
--
-- SYMPTÔME : « les demandes CRM naissent déjà traitées ». Prouvé en production, pas déduit —
-- sur 3 144 interactions, les 3 seules créées par l'interface (`source='bertel_ui'`) sont nées
-- `done` puis ont été rebasculées À LA MAIN dans les secondes qui suivent (18 s ; 15 s avec cinq
-- allers-retours ; 5 s, d'après `audit_log`). 100 % de reprise manuelle.
--
-- LE DÉFAUT VIVAIT À TROIS ÉTAGES, tous sur 'done' :
--   1. DDL          `crm_interaction.status crm_status NOT NULL DEFAULT 'done'`
--   2. RPC          `api.save_crm_interaction`, branche INSERT racine : COALESCE(…, 'done')
--   3. Front        `CrmInteractionModal` n'envoyait jamais `status` ⇒ le COALESCE décidait seul
-- Corriger un seul étage ne change rien : le COALESCE fournit toujours 'done' EXPLICITEMENT,
-- donc le DEFAULT DDL n'est même jamais consulté par la voie UI.
--
-- EFFETS EN CHAÎNE MESURÉS
--   * une demande née `done` est invisible du chip « Actives » (`p_status='active'` → 'planned') ;
--   * elle n'a pas de `resolved_at` : « traitée » sans preuve de traitement ;
--   * le prompt de clôture du kanban (`CrmTaches`, `CLOSED_INTERACTION_STATUSES`) est
--     structurellement MORT — `relatedInteractionStatus` vaut 'done' dès la création, donc la
--     condition « l'interaction liée n'est pas close » n'est jamais vraie. Il guérit ici.
--
-- CE QUE FAIT CETTE MIGRATION
--   (A) SUPPRIME le DEFAULT DDL au lieu de le remplacer. Un `DEFAULT 'planned'` contredirait la
--       règle par-sujet du RPC pour toute écriture DIRECTE ; sans défaut, la colonne étant
--       NOT NULL, une écriture directe sans statut ÉCHOUE au lieu de deviner. Balayage
--       `pg_proc` : les 3 seules fonctions qui insèrent ici passent toutes `status`
--       explicitement (`save_crm_interaction`, `create_crm_artifacts_from_incident`,
--       `log_publication_proof_interaction`) — rien ne casse.
--   (B) REDÉPLOIE `api.save_crm_interaction` avec, sur la branche RACINE, un défaut DÉRIVÉ DU
--       SUJET : sujet de demande renseigné ⇒ 'planned' (c'est une demande) ; sans sujet ⇒ 'done'
--       (note interne, compte rendu d'un échange déjà clos). Arbitrage PO : la modale porte
--       désormais un choix EXPLICITE « À traiter / Déjà traitée » et envoie toujours `status` ;
--       ce défaut reste le FILET pour tout autre appelant, et dit la MÊME chose que la modale.
--       Sans ce discriminant, basculer le défaut sur 'planned' aurait transformé toutes les
--       notes internes en demandes en attente — l'erreur symétrique de celle qu'on corrige.
--   (C) Pose `resolved_at` à l'INSERT quand le statut inséré est 'done', dans les DEUX branches.
--       Le bras UPDATE (cycle « marquer traitée / rouvrir », §66) le faisait déjà ; l'INSERT non,
--       d'où des lignes (done, resolved_at NULL) que le cycle ne produit JAMAIS.
--
-- CE QU'ELLE NE FAIT PAS, DÉLIBÉRÉMENT
--   * La branche RÉPONSE d'un fil garde 'done' : une réponse n'est pas une demande en attente
--     (décision §66, inchangée).
--   * Les DEUX triggers qui insèrent dans `crm_interaction` sont laissés tels quels, et ils ne
--     sont PAS de même nature : `log_publication_proof_interaction` écrit 'done' à juste titre
--     (le BAT EST parti) ; `create_crm_artifacts_from_incident` écrit 'done' pour une note de
--     journal, mais il crée AUSSI une `crm_task` — c'est elle qui porte le travail à faire.
--     À rouvrir si le PO veut que le signalement lui-même apparaisse dans « Actives ».
--   * AUCUN backfill des 3 144 lignes existantes. En particulier, les 1 721 lignes
--     `import_berta2_commentaire` sont `done` avec `resolved_at` NULL (le staging portait le
--     même défaut). Leur inventer une date de résolution depuis `created_at` violerait
--     l'invariant §218 (« une colonne de provenance ne se remplit QUE si la ligne le prouve ») :
--     NULL vaut mieux qu'une date inventée, qu'aucun lecteur ultérieur ne pourrait distinguer
--     d'un fait. Décision PO en attente ; l'invariant « done ⇒ resolved_at renseigné » n'est
--     donc vrai que pour les lignes créées À PARTIR DE MAINTENANT.
--
-- CONSÉQUENCE À SIGNALER AU PO : le KPI historisé `crm_backlog`
-- (`api.capture_metric_snapshots`, cron quotidien) compte `resolved_at IS NULL AND status <>
-- 'done'`. Il vaut 170 aujourd'hui, contre 71 points de série déjà écrits dans `metric_snapshot`.
-- Il va MONTER — non pas parce qu'un travail nouveau apparaît, mais parce qu'il cessera de
-- compter comme « traité » ce qui ne l'est pas. La rupture de série est une conséquence assumée
-- du correctif, pas un effet de bord neutre.
--
-- ATTENTION AU REJEU : `Base de donnée DLL et API/crm_body_deploy.tmp.sql` est une copie LOCALE
-- et NON VERSIONNÉE du corps de `save_crm_interaction` portant l'ancien défaut. Un rejeu depuis
-- ce fichier réintroduirait silencieusement le bug.
--
-- IDEMPOTENT (`ALTER … DROP DEFAULT` + `CREATE OR REPLACE`). Signature inchangée ⇒ **pas** de
-- `NOTIFY pgrst`. Aucun MV concerné. Doit passer APRÈS 8z (`migration_crm_module.sql`).
-- Le corps ci-dessous est dérivé de `migration_crm_module.sql`, dont le `prosrc` VIF a été
-- vérifié md5-identique avant patch (138 lignes normalisées de part et d'autre — discipline
-- §213), puis diffé hunk par hunk pour ne porter QUE ce patch.

\set ON_ERROR_STOP on
BEGIN;

-- =====================================================
-- (A) Plus de DEFAULT : une écriture directe sans statut échoue au lieu de deviner.
-- =====================================================
ALTER TABLE public.crm_interaction ALTER COLUMN status DROP DEFAULT;

COMMENT ON COLUMN public.crm_interaction.status IS
  'planned = à traiter | done = traitée | canceled (jamais produit ni affiché). AUCUN DEFAULT depuis le 2026-08-28 (manifeste 17b) : la naissance du statut est une décision métier portée par api.save_crm_interaction (dérivée du sujet) ou par l''appelant, jamais par la colonne.';

-- =====================================================
-- (B) + (C) Le RPC : défaut dérivé du sujet sur la racine, et resolved_at cohérent à l'INSERT.
-- =====================================================
CREATE OR REPLACE FUNCTION api.save_crm_interaction(p_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = public, api, auth
AS $$
DECLARE
  v_id uuid := NULLIF(p_payload->>'id','')::uuid;
  v_object_id text := NULLIF(btrim(COALESCE(p_payload->>'object_id','')),'');
  v_actor_id uuid := NULLIF(p_payload->>'actor_id','')::uuid;
  v_existing_object text;
  v_existing_actor uuid;
  v_topic_id uuid;
  v_sentiment_id uuid;
  -- Fil de réponses (§66) : parent fourni à l'INSERT ⇒ la nouvelle interaction est une réponse.
  v_parent_id uuid := NULLIF(p_payload->>'parent_interaction_id','')::uuid;
  v_root_id uuid;          -- racine normalisée (réponse-à-réponse → racine)
  v_root_parent uuid;      -- parent du parent (NULL si le parent EST la racine)
  v_root_object text;      -- contexte objet hérité de la racine
  v_root_actor uuid;       -- contexte acteur hérité de la racine
  -- Statut effectivement inséré (chantier 2026-08-28, manifeste 17b) : résolu AVANT l'INSERT
  -- parce qu'il pilote AUSSI `resolved_at`. Voir le commentaire de la branche RACINE.
  v_new_status crm_status;
BEGIN
  IF NULLIF(p_payload->>'topic_code','') IS NOT NULL THEN
    SELECT id INTO v_topic_id FROM ref_code_demand_topic
    WHERE code = p_payload->>'topic_code' AND is_active;
    IF v_topic_id IS NULL THEN
      RAISE EXCEPTION 'topic_code inconnu: %', p_payload->>'topic_code' USING ERRCODE = '22023';
    END IF;
  END IF;
  IF NULLIF(p_payload->>'sentiment_code','') IS NOT NULL THEN
    SELECT id INTO v_sentiment_id FROM ref_code_crm_sentiment
    WHERE code = p_payload->>'sentiment_code' AND is_active;
    IF v_sentiment_id IS NULL THEN
      RAISE EXCEPTION 'sentiment_code inconnu: %', p_payload->>'sentiment_code' USING ERRCODE = '22023';
    END IF;
  END IF;

  IF v_id IS NOT NULL THEN
    -- object_id est nullable (interaction acteur-seul) ⇒ existence testée par FOUND,
    -- jamais par v_existing_object IS NULL.
    SELECT object_id, actor_id INTO v_existing_object, v_existing_actor
    FROM crm_interaction WHERE id = v_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'crm_interaction inconnue: %', v_id USING ERRCODE = 'P0002';
    END IF;
    -- Autorisation par l'ancrage existant : arme objet si contexte présent, sinon arme acteur.
    IF v_existing_object IS NOT NULL THEN
      IF NOT api.user_can_write_crm(v_existing_object) THEN
        RAISE EXCEPTION 'Écriture CRM non autorisée' USING ERRCODE = '42501';
      END IF;
    ELSIF v_existing_actor IS NULL OR NOT api.user_can_write_crm_actor(v_existing_actor) THEN
      RAISE EXCEPTION 'Écriture CRM non autorisée' USING ERRCODE = '42501';
    END IF;
    -- Refus explicite plutôt qu'object_id accepté-puis-ignoré (contrairement à save_crm_task,
    -- le déplacement d'une interaction n'est pas un cas métier supporté). En revanche AJOUTER
    -- un contexte objet là où il n'y en avait pas (NULL → valeur) est permis — le contexte est
    -- optionnel par design — sous réserve du droit d'écriture CRM sur la cible.
    IF v_object_id IS NOT NULL AND v_existing_object IS NOT NULL
       AND v_object_id <> v_existing_object THEN
      RAISE EXCEPTION 'Re-parentage d''une interaction non supporté' USING ERRCODE = '22023';
    END IF;
    IF v_object_id IS NOT NULL AND v_existing_object IS NULL
       AND NOT api.user_can_write_crm(v_object_id) THEN
      RAISE EXCEPTION 'Écriture CRM non autorisée' USING ERRCODE = '42501';
    END IF;

    UPDATE crm_interaction SET
      -- COALESCE(object_id, v_object_id) : conserve le contexte existant, n'accepte une valeur
      -- entrante que pour COMBLER un contexte absent (le retrait de contexte n'est pas supporté).
      object_id            = COALESCE(object_id, v_object_id),
      interaction_type     = CASE WHEN p_payload ? 'interaction_type' THEN (p_payload->>'interaction_type')::crm_interaction_type ELSE interaction_type END,
      direction            = CASE WHEN p_payload ? 'direction' THEN (p_payload->>'direction')::crm_direction ELSE direction END,
      status               = CASE WHEN p_payload ? 'status' THEN (p_payload->>'status')::crm_status ELSE status END,
      -- Cycle « marquer traitée / rouvrir » (§66) : quand status est posé, resolved_at suit —
      -- 'done' ⇒ now() (COALESCE, ne réécrase pas une résolution antérieure), 'planned' ⇒ NULL
      -- (rouvrir), tout autre statut ⇒ inchangé. Le re-parentage (parent_interaction_id) est
      -- volontairement IGNORÉ sur UPDATE : les fils ne se déplacent pas.
      resolved_at          = CASE WHEN p_payload ? 'status'
                                  THEN (CASE (p_payload->>'status')
                                          WHEN 'done'    THEN COALESCE(resolved_at, NOW())
                                          WHEN 'planned' THEN NULL
                                          ELSE resolved_at END)
                                  ELSE resolved_at END,
      subject              = CASE WHEN p_payload ? 'subject' THEN NULLIF(p_payload->>'subject','') ELSE subject END,
      body                 = CASE WHEN p_payload ? 'body' THEN NULLIF(p_payload->>'body','') ELSE body END,
      occurred_at          = CASE WHEN p_payload ? 'occurred_at' THEN NULLIF(p_payload->>'occurred_at','')::timestamptz ELSE occurred_at END,
      actor_id             = CASE WHEN p_payload ? 'actor_id' THEN v_actor_id ELSE actor_id END,
      demand_topic_id      = CASE WHEN p_payload ? 'topic_code' THEN v_topic_id ELSE demand_topic_id END,
      request_sentiment_id = CASE WHEN p_payload ? 'sentiment_code' THEN v_sentiment_id ELSE request_sentiment_id END,
      updated_at           = NOW()
    WHERE id = v_id;
    -- Un effacement d'actor_id sur une interaction sans contexte objet viole
    -- chk_crm_interaction_anchor (23514) — garde-fou DB, pas de reset silencieux.
    RETURN jsonb_build_object('id', v_id);
  END IF;

  -- INSERT — RÉPONSE (§66) : parent fourni ⇒ interaction enfant rattachée à la demande RACINE.
  IF v_parent_id IS NOT NULL THEN
    -- Le contexte du fil EST celui du parent : on récupère la racine et son contexte, en
    -- NORMALISANT vers la racine (réponse-à-réponse → racine, 1 niveau).
    SELECT parent_interaction_id, actor_id, object_id
    INTO v_root_parent, v_existing_actor, v_existing_object
    FROM crm_interaction WHERE id = v_parent_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'interaction parente inconnue: %', v_parent_id USING ERRCODE = 'P0002';
    END IF;
    -- v_root_parent NULL ⇒ le parent EST la racine ; sinon la racine est son parent.
    IF v_root_parent IS NULL THEN
      v_root_id     := v_parent_id;
      v_root_actor  := v_existing_actor;
      v_root_object := v_existing_object;
    ELSE
      v_root_id := v_root_parent;
      SELECT actor_id, object_id INTO v_root_actor, v_root_object
      FROM crm_interaction WHERE id = v_root_id;
    END IF;
    -- Autorisation sur le contexte HÉRITÉ de la racine (jamais sur le payload) : arme objet si
    -- contexte objet présent, sinon arme acteur.
    IF v_root_object IS NOT NULL THEN
      IF NOT api.user_can_write_crm(v_root_object) THEN
        RAISE EXCEPTION 'Écriture CRM non autorisée' USING ERRCODE = '42501';
      END IF;
    ELSIF v_root_actor IS NULL OR NOT api.user_can_write_crm_actor(v_root_actor) THEN
      RAISE EXCEPTION 'Écriture CRM non autorisée' USING ERRCODE = '42501';
    END IF;

    v_id := gen_random_uuid();
    -- Une réponse hérite acteur+contexte de la racine (payload actor_id/object_id ignoré) ;
    -- statut 'done' par défaut (une réponse n'est pas une demande en attente — décision §66,
    -- INCHANGÉE par le chantier 2026-08-28, qui ne corrige que la naissance des RACINES) ;
    -- topic NULL sauf topic_code fourni ; owner = auteur de la réponse.
    v_new_status := COALESCE(NULLIF(p_payload->>'status','')::crm_status, 'done'::crm_status);
    INSERT INTO crm_interaction (id, parent_interaction_id, object_id, actor_id,
                                 interaction_type, direction, status, resolved_at,
                                 subject, body, occurred_at,
                                 demand_topic_id, request_sentiment_id, owner, source)
    VALUES (v_id, v_root_id, v_root_object, v_root_actor,
            COALESCE(NULLIF(p_payload->>'interaction_type',''),'note')::crm_interaction_type,
            COALESCE(NULLIF(p_payload->>'direction',''),'internal')::crm_direction,
            v_new_status,
            -- Cohérence : une ligne qui NAÎT « traitée » porte sa date de résolution. Sans cela
            -- elle reste dans un état (done, resolved_at NULL) que le cycle §66 ne produit
            -- JAMAIS — c'est exactement l'état des 1 721 lignes d'import héritées.
            CASE WHEN v_new_status = 'done' THEN NOW() ELSE NULL END,
            NULLIF(p_payload->>'subject',''),
            NULLIF(p_payload->>'body',''),
            COALESCE(NULLIF(p_payload->>'occurred_at','')::timestamptz, NOW()),
            v_topic_id, v_sentiment_id,
            auth.uid(), 'bertel_ui');
    -- La racine est marquée « répondue » (premier accusé de réponse ; COALESCE = ne réécrase pas).
    UPDATE crm_interaction
       SET first_response_at = COALESCE(first_response_at, NOW()), updated_at = NOW()
     WHERE id = v_root_id;
    RETURN jsonb_build_object('id', v_id);
  END IF;

  -- INSERT — RACINE : au moins un ancrage (acteur OU objet).
  IF v_object_id IS NULL AND v_actor_id IS NULL THEN
    RAISE EXCEPTION 'objet ou acteur requis' USING ERRCODE = '22023';
  END IF;
  IF v_object_id IS NOT NULL THEN
    IF NOT api.user_can_write_crm(v_object_id) THEN
      RAISE EXCEPTION 'Écriture CRM non autorisée' USING ERRCODE = '42501';
    END IF;
  ELSIF NOT api.user_can_write_crm_actor(v_actor_id) THEN
    RAISE EXCEPTION 'Écriture CRM non autorisée' USING ERRCODE = '42501';
  END IF;

  -- Statut de naissance d'une RACINE (chantier 2026-08-28, manifeste 17b).
  --
  -- AVANT : le COALESCE retombait sur 'done'. La même modale crée les DEMANDES et les NOTES
  -- internes, et le front n'envoyait jamais `status` : toute demande naissait donc « traitée »,
  -- invisible du chip « Actives » (qui filtre p_status='active' → 'planned'). Mesuré en
  -- production : les 3 seules interactions créées par l'UI ont été rebasculées à la main dans
  -- les secondes suivantes (18 s, 15 s avec 5 allers-retours, 5 s) — 100 % de reprise manuelle.
  --
  -- APRÈS : le client fournit `status` explicitement (la modale porte le choix « À traiter /
  -- Déjà traitée », arbitrage PO 2026-08-28). CE DÉFAUT RESTE LE FILET pour tout autre appelant
  -- — un front tiers, un futur appel RPC — et il doit dire la MÊME chose que la modale : un
  -- sujet de demande renseigné ⇒ c'est une DEMANDE, elle naît « en attente » ; sans sujet, c'est
  -- une note interne (compte rendu d'un échange déjà clos), elle naît « traitée ».
  -- Sans ce discriminant, basculer le défaut sur 'planned' aurait transformé toutes les notes
  -- en demandes en attente — l'erreur symétrique de celle qu'on corrige.
  --
  -- v_topic_id est résolu en tête de fonction (avant les 3 branches), donc lisible ici.
  v_new_status := COALESCE(
    NULLIF(p_payload->>'status','')::crm_status,
    CASE WHEN v_topic_id IS NOT NULL THEN 'planned'::crm_status ELSE 'done'::crm_status END);

  v_id := gen_random_uuid();
  INSERT INTO crm_interaction (id, object_id, interaction_type, direction, status, resolved_at,
                               subject, body, occurred_at, actor_id,
                               demand_topic_id, request_sentiment_id, owner, source)
  VALUES (v_id, v_object_id,
          COALESCE(NULLIF(p_payload->>'interaction_type',''),'note')::crm_interaction_type,
          COALESCE(NULLIF(p_payload->>'direction',''),'internal')::crm_direction,
          v_new_status,
          -- Cohérence : une ligne qui naît « traitée » porte sa date de résolution. Le bras
          -- UPDATE (cycle « marquer traitée / rouvrir », §66) la pose déjà ; l'INSERT ne le
          -- faisait pas, d'où des lignes (done, resolved_at NULL) que le cycle ne produit jamais.
          CASE WHEN v_new_status = 'done' THEN NOW() ELSE NULL END,
          NULLIF(p_payload->>'subject',''),
          NULLIF(p_payload->>'body',''),
          COALESCE(NULLIF(p_payload->>'occurred_at','')::timestamptz, NOW()),
          v_actor_id,
          v_topic_id, v_sentiment_id,
          auth.uid(), 'bertel_ui');
  RETURN jsonb_build_object('id', v_id);
END;
$$;

COMMIT;
