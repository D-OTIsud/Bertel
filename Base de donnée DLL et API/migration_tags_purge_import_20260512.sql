-- =====================================================================================
-- migration_tags_purge_import_20260512.sql
-- Manifest 16p — Purge des tags posés par l'import « old_data_enrichment_20260512 »
--                et réduction du catalogue §09 aux tags qui passent le test d'admission.
--
-- Design : docs/superpowers/specs/2026-07-29-tags-doctrine-gouvernance-design.md
-- Journal : lot1_mapping_decisions.md §203
--
-- ------------------------------------------------------------------------------------
-- POURQUOI
-- ------------------------------------------------------------------------------------
-- Les 4 529 liens `tag_link` ont été posés en UNE passe le 12/05/2026 13:52,
-- `created_by = NULL`, `extra.source = 'old_data_enrichment_20260512'` — le même import
-- qui a écrasé la nature par la forme dans la taxonomie hébergement (§190) et mal typé
-- la moitié des ACT (§186). Mesures live du 2026-07-29 :
--
--   * 830 fiches sur 846 taguées (828 par l'import, 2 par un éditeur), ~5,5 tags par
--     fiche jusqu'à 13 : l'axe ne sépare plus rien. « Plein air » 571 (68 % du corpus),
--     « Cuisine » 545, « Panorama » 442.
--   * Les tags ne sont pas reproductibles depuis le contenu de la fiche : seules 19 % des
--     fiches taguées « Boutique » contiennent un mot du champ lexical, 20 % pour
--     « Patrimoine », 42 % pour « Mer et littoral ». Et ce chiffre est une BORNE HAUTE :
--     les « expliqués » incluent « vue mer », « à 30 minutes de la mer », « cuisine
--     équipée ». 184 fiches portent « Mer et littoral » sans AUCUNE justification
--     textuelle ni marqueur littoral — aucune règle ne peut les trancher, d'où la purge
--     plutôt qu'une réparation.
--   * Hors périmètre flagrant : « Hébergement » sur 54 restaurants / 24 activités /
--     14 producteurs ; « Cuisine » sur 367 hébergements contre 133 restaurants.
--   * 13 tags sur 16 doublonnent un axe déjà filtrable (invariant §196 « un concept
--     filtrable n'a qu'UNE surface de saisie ») — recouvrement quasi 1:1 avec
--     `object_environment_tag` : Volcan 357 vs `volcan` 350 dont 350 en commun,
--     Panorama 445 vs `vue_panoramique` 439 dont 436, Patrimoine 264 vs 255 dont 253.
--
-- ⚠️ L'axe `object_environment_tag` est le JUMEAU du même import (3 419 de ses 3 441
--    lignes posées à la MÊME minute) et souffre de la même maladie — vérifié : 20 fiches
--    « Plage » au Tampon, commune sans littoral ; 5 des 6 « Lagon » au Tampon /
--    Entre-Deux alors qu'il n'y a aucun lagon sur le territoire. Sa réparation est un
--    lot SÉPARÉ (0b) : contrairement aux tags, ses codes sont falsifiables par la
--    géographie, donc il se répare au lieu de se purger. Cette migration NE LE TOUCHE PAS.
--
-- ------------------------------------------------------------------------------------
-- CE QUE FAIT CETTE MIGRATION
-- ------------------------------------------------------------------------------------
-- 1. Supprime les liens `tag_link` issus de l'import — et EUX SEULS. Le prédicat porte
--    exclusivement sur `extra->>'source' = 'old_data_enrichment_20260512'` (+ la cible
--    `target_table = 'object'`, `tag_link` étant polymorphe : sans elle, le DELETE
--    déborderait le périmètre que la table temporaire rafraîchit ensuite).
--
--    ⚠️ CORRECTION DE REVUE (2026-07-29) — NE JAMAIS revenir à `created_by IS NULL`
--    comme marqueur d'import. Le RPC éditeur `api.save_object_workspace_tags`
--    (`object_workspace_gap_rpcs.sql`) insère `(tag_id, target_table, target_pk,
--    position, extra)` **sans `created_by`** : une écriture humaine a donc, elle aussi,
--    `created_by = NULL`. La première version de cette migration présentait ce test comme
--    un garde-fou protégeant le travail des éditeurs ; il ne protégeait rien.
--
--    Les 6 lignes `extra = '{}'` (2 fiches, 17/06 et 03/07) ont été AUDITÉES et sont bien
--    de la SAISIE ÉDITEUR — donc explicitement HORS purge. Preuve : le RPC fait un
--    delete-then-insert sur toute la fiche en écrivant `position = ordinality-1` et
--    `extra = {}` ; ces 6 lignes ont des positions contiguës depuis 0 (0-1-2-3 sur
--    HLORUN00000000TV, 0-1 sur LOIRUN00000000QO), un horodatage identique par fiche, et
--    surtout ces 2 fiches ne portent AUCUNE ligne d'import — exactement ce que produit le
--    delete-then-insert quand un agent sauvegarde ses tags.
-- 2. Retire du catalogue les 15 tags qui échouent au test d'admission (§4.1 du design).
--    `Famille` et `Romantique` sont CONSERVÉS au catalogue (seuls sans doublon
--    structuré) mais vidés de leurs liens hérités : ils redeviennent des tags éditoriaux
--    à poser.
-- 3. Rafraîchit les caches de filtre UNE FOIS par fiche touchée.
--
-- ------------------------------------------------------------------------------------
-- PRÉCAUTION D'EXÉCUTION (invariant §197)
-- ------------------------------------------------------------------------------------
-- `tag_link` porte `trg_refresh_object_filter_caches_tag_link`, **FOR EACH ROW**, qui
-- appelle `api.refresh_object_filter_caches(target_pk)` à chaque suppression. Une purge
-- naïve de 4 529 lignes ferait donc 4 529 reconstructions de `search_document` pour
-- 828 fiches (~5,5 par fiche, toutes redondantes sauf une). Le trigger est éteint — dans
-- la transaction qui détient déjà le verrou, nommage gardé — puis UN seul passage de
-- rafraîchissement est fait sur les fiches touchées.
--
-- ⚠️ Ce rafraîchissement unique POSE VOLONTAIREMENT `updated_at = now()` sur les 828
--    fiches concernées (`search_document` n'est pas exclu des trois triggers « changement
--    métier » de `object` — différé §197 documenté). C'est VOULU ici, contrairement au
--    backfill §197 qui les éteignait : les tags SONT dans la charge utile partenaire
--    (`api.list_object_resources_since_fast`, `api.get_object_resource`), donc sans ce
--    bump les partenaires conserveraient indéfiniment les tags faux — leur delta ne
--    repasserait jamais sur ces fiches. Un snapshot `object_version` par fiche est écrit
--    au passage : c'est la trace de la correction, elle est souhaitable.
--
-- Idempotent, transaction-wrapped. Après `schema_unified.sql` (tag_link/ref_tag),
-- `api_views_functions.sql` (`refresh_object_filter_caches`) et `seeds_data.sql`.
-- Sur live, rafraîchir ensuite les deux MV (voir le pied de fichier).
-- =====================================================================================

BEGIN;

-- -------------------------------------------------------------------------------------
-- Garde de pré-vol : les objets dont dépend la migration existent.
-- -------------------------------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('public.tag_link') IS NULL OR to_regclass('public.ref_tag') IS NULL THEN
    RAISE EXCEPTION 'migration 16p : tag_link/ref_tag absents — appliquer schema_unified.sql d''abord';
  END IF;
  IF to_regprocedure('api.refresh_object_filter_caches(text)') IS NULL THEN
    RAISE EXCEPTION 'migration 16p : api.refresh_object_filter_caches(text) absente — appliquer api_views_functions.sql d''abord';
  END IF;
  -- Le nom du trigger est codé en dur dans le DISABLE/ENABLE ci-dessous : s'il a été
  -- renommé, il faut le savoir AVANT d'avoir supprimé quoi que ce soit (sinon la purge
  -- part avec le trigger actif et fait 4 529 rafraîchissements).
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE NOT tgisinternal
      AND tgrelid = 'public.tag_link'::regclass
      AND tgname = 'trg_refresh_object_filter_caches_tag_link'
  ) THEN
    RAISE EXCEPTION 'migration 16p : trigger trg_refresh_object_filter_caches_tag_link introuvable sur tag_link — vérifier le nommage avant de purger';
  END IF;
END $$;

-- -------------------------------------------------------------------------------------
-- 1) Fiches impactées, capturées AVANT la suppression.
--    (temp table : `ON COMMIT DROP` la fait disparaître à la fin de la transaction)
-- -------------------------------------------------------------------------------------
CREATE TEMP TABLE _tags_purge_targets ON COMMIT DROP AS
SELECT DISTINCT tl.target_pk AS object_id
FROM public.tag_link tl
WHERE tl.target_table = 'object'
  AND tl.extra ->> 'source' = 'old_data_enrichment_20260512';

-- -------------------------------------------------------------------------------------
-- 1bis) SAUVEGARDE EXACTE des lignes qui vont disparaître — avant toute suppression.
--
--   Sans elle, la purge est irréversible : 4 529 liens dont on ne saurait plus reconstruire
--   ni le `position` ni le `extra`. La table vit dans `internal` (non exposé à PostgREST),
--   porte la forme complète de `tag_link` + l'horodatage de purge, et sert deux usages :
--     * le ROLLBACK (SQL fourni au pied de ce fichier) ;
--     * la garde CI, qui vérifie que la sauvegarde ne contient QUE des lignes d'import —
--       c'est la preuve exécutable qu'aucune écriture éditeur n'a été emportée.
-- -------------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS internal.tag_link_purge_backup_20260512 (
  id           uuid,
  tag_id       uuid,
  tag_slug     text,          -- dénormalisé : le `ref_tag` correspondant est supprimé en 3
  tag_name     text,
  target_table text,
  target_pk    text,
  created_by   uuid,
  created_at   timestamptz,
  extra        jsonb,
  position     integer,
  purged_at    timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE internal.tag_link_purge_backup_20260512 IS
  'Sauvegarde des tag_link supprimés par la migration 16p (import old_data_enrichment_20260512). Rollback : voir le pied de migration_tags_purge_import_20260512.sql. Ne pas supprimer sans décision explicite — c est le seul exemplaire de ces lignes.';

INSERT INTO internal.tag_link_purge_backup_20260512
  (id, tag_id, tag_slug, tag_name, target_table, target_pk, created_by, created_at, extra, position)
SELECT tl.id, tl.tag_id, t.slug, t.name, tl.target_table, tl.target_pk,
       tl.created_by, tl.created_at, tl.extra, tl.position
FROM public.tag_link tl
JOIN public.ref_tag t ON t.id = tl.tag_id
WHERE tl.target_table = 'object'
  AND tl.extra ->> 'source' = 'old_data_enrichment_20260512'
  -- rejeu : ne pas empiler deux sauvegardes de la même ligne
  AND NOT EXISTS (SELECT 1 FROM internal.tag_link_purge_backup_20260512 b WHERE b.id = tl.id);

-- -------------------------------------------------------------------------------------
-- 2) Suppression des liens, trigger de cache éteint (cf. précaution §197 ci-dessus).
-- -------------------------------------------------------------------------------------
ALTER TABLE public.tag_link DISABLE TRIGGER trg_refresh_object_filter_caches_tag_link;

DO $$
DECLARE v_deleted bigint;
BEGIN
  DELETE FROM public.tag_link tl
  WHERE tl.target_table = 'object'
    AND tl.extra ->> 'source' = 'old_data_enrichment_20260512';
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RAISE NOTICE 'migration 16p : % lien(s) tag_link supprimé(s) (attendu 4529 sur live, 0 en rejeu)', v_deleted;
END $$;

ALTER TABLE public.tag_link ENABLE TRIGGER trg_refresh_object_filter_caches_tag_link;

-- -------------------------------------------------------------------------------------
-- 3) Réduction du catalogue — les 15 tags qui échouent le test d'admission (design §4.1).
--
--    Motifs, par tag : R2-a = un axe structuré porte déjà le concept (invariant §196) ;
--    R2-b = non sélectif (> 25 % du corpus) ; R2-c = non vérifiable sans interpréter ;
--    R1 = qualifie le voisinage de la fiche, pas la fiche.
--
--      accommodation   R2-a/b  → object_type (HLO/HOT/HPA/CAMP)
--      outdoor         R2-a/b/c→ cadre (rural, montagne, foret), taxonomie ASC
--      food            R2-a/b  → object_type RES + object_cuisine_type
--      panorama        R2-a    → cadre `vue_panoramique` (doublon 436/439)
--      volcano         R2-a/R1 → cadre `volcan` (doublon 350/350)
--      wellness        R2-a    → équipements spa/massage/jacuzzi, taxonomy_act.wellness_massage
--      beach           R1/R2-a → cadre bord_mer/plage/lagon  ← le signalement PO d'origine
--      shopping        R2-a/c  → équipement « Boutique », taxonomy_com.souvenir_shop
--      heritage        R2-a    → cadre `patrimoine`, taxonomie VIS/PCU
--      local_products  R2-a    → object_type PRD, taxonomy_com.local_crafts
--      farm            R2-a    → taxonomy_prd.exploitation_agricole / agrotourisme
--      workshop        R2-a    → taxonomy_act.craft_workshop, taxonomy_loi.atelier
--      guided_tour     R2-a    → taxonomy_loi.visite_guidee, taxonomy_act.guided_tour (§186)
--      organic         R2-c    → candidat à promotion en classification (certificat AB)
--      jacuzzy         doublon orthographique de l'équipement « Jacuzzi » (85 usages) —
--                      la preuve vivante du trou de gouvernance que le lot 1 comble.
--
--    CONSERVÉS : `family` et `romantic` — les seuls sans doublon structuré. Vidés de
--    leurs liens hérités par l'étape 2, ils redeviennent des tags éditoriaux à poser.
-- -------------------------------------------------------------------------------------
DO $$
DECLARE
  v_retired  text[] := ARRAY[
    'accommodation','outdoor','food','panorama','volcano','wellness','beach','shopping',
    'heritage','local_products','farm','workshop','guided_tour','organic','jacuzzy'
  ];
  v_blocking bigint;
  v_removed  bigint;
BEGIN
  -- Fail-closed : `tag_link.tag_id → ref_tag ON DELETE CASCADE`. Tout lien qui SUBSISTE
  -- sur un tag sortant a survécu à l'étape 2, donc il n'est PAS de l'import : c'est de la
  -- saisie éditeur. Le cascader détruirait silencieusement le travail d'un agent.
  --
  -- ⚠️ SUR LIVE AUJOURD'HUI CETTE GARDE FIRE, ET C'EST VOULU : 5 des 6 liens éditeur
  -- audités pointent vers des tags sortants (HLORUN00000000TV « Panorama », « Mer et
  -- littoral », « Bien-être » ; LOIRUN00000000QO « Produits locaux », « Boutique »).
  -- Un agent les a posés délibérément — leur sort est un ARBITRAGE MÉTIER, pas un effet
  -- de bord de migration. Il se règle au lot de requalification (rail de suggestion), pas
  -- ici. Cette migration ne peut donc pas s'appliquer avant cet arbitrage : c'est la
  -- raison technique qui confirme le reséquencement (purge en DERNIER, cf. design §6).
  SELECT count(*) INTO v_blocking
  FROM public.tag_link tl JOIN public.ref_tag t ON t.id = tl.tag_id
  WHERE t.slug = ANY(v_retired);

  IF v_blocking > 0 THEN
    RAISE EXCEPTION
      'migration 16p : % lien(s) de SAISIE ÉDITEUR subsistent sur des tags sortants — les cascader les détruirait. Détail : %. Arbitrer (conserver le tag / requalifier la fiche / accepter la perte) avant de rejouer.',
      v_blocking,
      (SELECT string_agg(format('%s→%s', tl.target_pk, t.name), ', ' ORDER BY tl.target_pk, t.name)
         FROM public.tag_link tl JOIN public.ref_tag t ON t.id = tl.tag_id
        WHERE t.slug = ANY(v_retired));
  END IF;

  DELETE FROM public.ref_tag WHERE slug = ANY(v_retired);
  GET DIAGNOSTICS v_removed = ROW_COUNT;
  -- Sur base fraîche : 0 — les deux seuls tags seedés (`shopping`, `local_products`)
  -- ont été retirés de `seeds_data.sql` par la même passe, donc rien à supprimer.
  RAISE NOTICE 'migration 16p : % tag(s) retiré(s) du catalogue (attendu 15 sur live, 0 sur base fraîche et en rejeu)', v_removed;
END $$;

-- -------------------------------------------------------------------------------------
-- 4) UN rafraîchissement de cache par fiche touchée (et non un par lien supprimé).
--    Pose `updated_at = now()` une fois par fiche ⇒ reprise partenaires (cf. précaution).
-- -------------------------------------------------------------------------------------
DO $$
DECLARE v_id text; v_n bigint := 0;
BEGIN
  FOR v_id IN SELECT object_id FROM _tags_purge_targets LOOP
    PERFORM api.refresh_object_filter_caches(v_id);
    v_n := v_n + 1;
  END LOOP;
  RAISE NOTICE 'migration 16p : caches de filtre rafraîchis sur % fiche(s) (attendu 828 sur live, 0 en rejeu)', v_n;
END $$;

-- -------------------------------------------------------------------------------------
-- 5) Assertions de sortie, fail-closed.
-- -------------------------------------------------------------------------------------
DO $$
DECLARE v_left bigint; v_slugs text;
BEGIN
  SELECT count(*) INTO v_left
  FROM public.tag_link
  WHERE target_table = 'object'
    AND extra ->> 'source' = 'old_data_enrichment_20260512';
  IF v_left > 0 THEN
    RAISE EXCEPTION 'migration 16p : % lien(s) de l''import subsistent après purge', v_left;
  END IF;

  SELECT string_agg(slug, ', ' ORDER BY slug) INTO v_slugs
  FROM public.ref_tag
  WHERE slug = ANY(ARRAY['accommodation','outdoor','food','panorama','volcano','wellness','beach',
                         'shopping','heritage','local_products','farm','workshop','guided_tour',
                         'organic','jacuzzy']);
  IF v_slugs IS NOT NULL THEN
    RAISE EXCEPTION 'migration 16p : tag(s) sortant(s) encore au catalogue : %', v_slugs;
  END IF;

  RAISE NOTICE 'migration 16p : OK — catalogue restant = %',
    (SELECT COALESCE(string_agg(slug, ', ' ORDER BY slug), '(vide)') FROM public.ref_tag);
END $$;

COMMIT;

-- =====================================================================================
-- APRÈS APPLICATION SUR LIVE (hors transaction) :
--
--   REFRESH MATERIALIZED VIEW CONCURRENTLY internal.mv_filtered_objects;
--   REFRESH MATERIALIZED VIEW CONCURRENTLY internal.mv_ref_data_json;
--
-- Pas de `NOTIFY pgrst` : aucune signature de fonction ni colonne exposée ne change.
--
-- -------------------------------------------------------------------------------------
-- ROLLBACK EXACT (à exécuter en UNE transaction, trigger de cache éteint comme à l'aller)
--
-- Restaure les liens ET les entrées de catalogue supprimées, à l'identique (`id`,
-- `position`, `extra`, `created_at`, `created_by` d'origine). Les `ref_tag` sont recréés
-- AVANT les liens (FK), avec leur `id` d'origine — celui que la sauvegarde a conservé —
-- sinon les liens restaurés pointeraient dans le vide.
--
--   BEGIN;
--   ALTER TABLE public.tag_link DISABLE TRIGGER trg_refresh_object_filter_caches_tag_link;
--
--   -- 1. catalogue : re-créer les ref_tag disparus, avec leur id d'origine
--   INSERT INTO public.ref_tag (id, slug, name)
--   SELECT DISTINCT b.tag_id, b.tag_slug, b.tag_name
--     FROM internal.tag_link_purge_backup_20260512 b
--    WHERE NOT EXISTS (SELECT 1 FROM public.ref_tag t WHERE t.id = b.tag_id);
--
--   -- 2. liens : restauration à l'identique
--   INSERT INTO public.tag_link (id, tag_id, target_table, target_pk, created_by, created_at, extra, position)
--   SELECT b.id, b.tag_id, b.target_table, b.target_pk, b.created_by, b.created_at, b.extra, b.position
--     FROM internal.tag_link_purge_backup_20260512 b
--    WHERE NOT EXISTS (SELECT 1 FROM public.tag_link tl WHERE tl.id = b.id);
--
--   ALTER TABLE public.tag_link ENABLE TRIGGER trg_refresh_object_filter_caches_tag_link;
--
--   -- 3. caches : un seul passage par fiche restaurée
--   DO $rb$ DECLARE v_id text; BEGIN
--     FOR v_id IN SELECT DISTINCT target_pk FROM internal.tag_link_purge_backup_20260512
--                  WHERE target_table = 'object' LOOP
--       PERFORM api.refresh_object_filter_caches(v_id);
--     END LOOP;
--   END $rb$;
--   COMMIT;
--
--   -- puis, hors transaction, les 2 REFRESH MATERIALIZED VIEW ci-dessus.
--
-- ⚠️ Le rollback re-bumpe `updated_at` sur les fiches restaurées : les partenaires
--    reprendront une seconde fois. C'est le prix d'un aller-retour, pas un défaut.
-- ⚠️ Il ne défait PAS les couleurs/positions/descriptions du catalogue reseedé entre-temps
--    (`family`/`romantic` de `seeds_data.sql`) — sans objet, ces deux tags ne sont pas purgés.
-- -------------------------------------------------------------------------------------
-- =====================================================================================
