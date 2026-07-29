-- =============================================================================
-- test_taxonomy_accommodation_hierarchy_v2.sql
-- Garde permanente §200 — hiérarchie v2 des hébergements.
-- Manifest : immédiatement après taxo5.
--
-- Les asserts intégrés à la migration ne protègent que l'instant de l'apply.
-- Ce garde-ci protège dans la DURÉE, et surtout il est NON VACANT : le contrôle
-- 17 exécute réellement `api.get_filtered_object_ids` sur des porteurs témoins,
-- parce qu'affirmer qu'un parent existe ne prouve pas que filtrer ce parent
-- remonte ses enfants. C'est exactement la classe de bug §196 : le catalogue
-- semble juste, l'utilisateur saisit, et le filtre reste muet.
--
-- Auto-contenu et transactionnel : BEGIN … ROLLBACK, rien ne persiste.
-- Fresh-aware : les contrôles qui dépendent du corpus importé se déclarent
-- explicitement « ignorés » sur une base sans fiches, jamais silencieusement.
-- =============================================================================

\set ON_ERROR_STOP on

BEGIN;

DO $v2_guard$
DECLARE
  v_n        INT;
  v_bad      TEXT;
BEGIN

  -- 1. Cinq familles actives, et seulement cinq.
  SELECT count(*) INTO v_n FROM ref_code WHERE domain = 'accommodation_family' AND is_active;
  IF v_n <> 5 THEN
    RAISE EXCEPTION 'v2: % famille(s) d''hébergement active(s) au lieu de 5', v_n;
  END IF;
  -- Filtrer sur is_active, PAS count(*) global : `plein_air` est CONSERVÉE (historique,
  -- caches, exports) et compterait pour 6.
  SELECT string_agg(t.code, ', ')
    INTO v_bad
    FROM (VALUES ('hotellerie'),('locatif'),('collectif'),('campings_terrains'),('aires_haltes_plein_air')) AS t(code)
   WHERE NOT EXISTS (SELECT 1 FROM ref_code rc
                      WHERE rc.domain = 'accommodation_family' AND rc.code = t.code AND rc.is_active);
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'v2: famille(s) attendue(s) absente(s) ou inactive(s): %', v_bad;
  END IF;

  -- 2. `plein_air` conservée mais inactive, et pointant vers ses deux remplaçantes.
  IF EXISTS (SELECT 1 FROM ref_code WHERE domain = 'accommodation_family' AND code = 'plein_air' AND is_active) THEN
    RAISE EXCEPTION 'v2: accommodation_family.plein_air est encore active';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM ref_code
     WHERE domain = 'accommodation_family' AND code = 'plein_air'
       AND metadata -> 'replaced_by' @> '["campings_terrains"]'::jsonb
       AND metadata -> 'replaced_by' @> '["aires_haltes_plein_air"]'::jsonb
  ) THEN
    RAISE EXCEPTION 'v2: plein_air ne déclare pas ses deux familles de remplacement — une recherche sur l''ancien terme ne saurait pas où aller';
  END IF;

  -- 3. Campings et terrains : 4 natures + les 2 sous-types du terrain déclaré.
  SELECT string_agg(t.code, ', ')
    INTO v_bad
    FROM (VALUES
            ('taxonomy_camp','camping','nature'),
            ('taxonomy_hpa','natural_camp_area','nature'),
            ('taxonomy_hpa','declared_campground','nature'),
            ('taxonomy_hpa','residential_leisure_park','nature'),
            ('taxonomy_hpa','farm_camping','sous_type'),
            ('taxonomy_hpa','homestay_camping','sous_type')
         ) AS t(domain, code, axis)
   WHERE NOT EXISTS (
           SELECT 1 FROM ref_code rc
            WHERE rc.domain = t.domain AND rc.code = t.code
              AND rc.is_active AND rc.is_assignable
              AND rc.metadata->>'axis' = t.axis
              AND rc.metadata->>'famille' = 'campings_terrains');
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'v2: entrée(s) « Campings et terrains » manquante(s) ou mal classée(s): %', v_bad;
  END IF;

  -- 4. Aires et haltes de plein air : 3 natures.
  SELECT string_agg(t.code, ', ')
    INTO v_bad
    FROM (VALUES ('bivouac_area'),('motorhome_area'),('motorhome_night_stop')) AS t(code)
   WHERE NOT EXISTS (
           SELECT 1 FROM ref_code rc
            WHERE rc.domain = 'taxonomy_hpa' AND rc.code = t.code
              AND rc.is_active AND rc.is_assignable
              AND rc.metadata->>'axis' = 'nature'
              AND rc.metadata->>'famille' = 'aires_haltes_plein_air');
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'v2: nature(s) « Aires et haltes de plein air » manquante(s) ou mal classée(s): %', v_bad;
  END IF;

  -- 4b. Aire naturelle est un CAMPING, aire d'accueil camping-car ne l'est pas.
  --     C'est l'arbitrage que les agents doivent pouvoir expliquer sans connaître HPA.
  IF EXISTS (SELECT 1 FROM ref_code WHERE domain='taxonomy_hpa' AND code='natural_camp_area'
              AND metadata->>'famille' = 'aires_haltes_plein_air') THEN
    RAISE EXCEPTION 'v2: natural_camp_area doit appartenir à campings_terrains — c''est une catégorie de terrain de camping, malgré le mot « aire »';
  END IF;
  IF EXISTS (SELECT 1 FROM ref_code WHERE domain='taxonomy_hpa' AND code='motorhome_area'
              AND metadata->>'famille' = 'campings_terrains') THEN
    RAISE EXCEPTION 'v2: motorhome_area doit appartenir à aires_haltes_plein_air';
  END IF;

  -- 5. Les 6 natures d'hébergement collectif au MÊME axe.
  --    C'est le défaut visible d'origine : « Gîte » rendu comme un sous-type
  --    pendant que « Résidence de tourisme » était une nature.
  SELECT string_agg(t.domain || '.' || t.code, ', ')
    INTO v_bad
    FROM (VALUES
            ('taxonomy_hlo','auberge_collective'),
            ('taxonomy_hlo','gite_de_groupe'),
            ('taxonomy_hlo','gite_de_randonnee'),
            ('taxonomy_rva','tourism_residence'),
            ('taxonomy_rva','holiday_village'),
            ('taxonomy_rva','aparthotel')
         ) AS t(domain, code)
   WHERE NOT EXISTS (
           SELECT 1 FROM ref_code rc
            WHERE rc.domain = t.domain AND rc.code = t.code
              AND rc.is_active
              AND rc.metadata->>'axis' = 'nature'
              AND rc.metadata->>'famille' = 'collectif');
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'v2: nature(s) collective(s) absente(s) ou pas à l''axe nature/collectif: %', v_bad;
  END IF;

  -- 5b. Libellés courts + appellations longues conservées comme alias.
  IF NOT EXISTS (SELECT 1 FROM ref_code WHERE domain='taxonomy_hlo' AND code='auberge_collective'
                   AND name = 'Auberge' AND metadata -> 'aliases' @> '["Auberge collective"]'::jsonb) THEN
    RAISE EXCEPTION 'v2: auberge_collective doit s''afficher « Auberge » et garder « Auberge collective » en alias';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM ref_code WHERE domain='taxonomy_hlo' AND code='gite_de_groupe'
                   AND name = 'Gîte' AND metadata -> 'aliases' @> '["Gîte de groupe"]'::jsonb) THEN
    RAISE EXCEPTION 'v2: gite_de_groupe doit s''afficher « Gîte » et garder « Gîte de groupe » en alias';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM ref_code WHERE domain='taxonomy_camp' AND code='camping'
                   AND name = 'Camping'
                   AND metadata -> 'aliases' @> '["Camping aménagé"]'::jsonb
                   AND metadata -> 'aliases' @> '["Camping classé"]'::jsonb) THEN
    RAISE EXCEPTION 'v2: taxonomy_camp.camping doit garder le libellé « Camping » et porter les alias « Camping aménagé » / « Camping classé »';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM ref_code WHERE domain='taxonomy_hlo' AND code='gite_de_randonnee'
                   AND name = 'Refuge et gîte d''étape') THEN
    RAISE EXCEPTION 'v2: gite_de_randonnee doit garder le libellé « Refuge et gîte d''étape »';
  END IF;

  -- 6. Aucune nature ou sous-type actif ne référence une famille inactive.
  SELECT string_agg(rc.domain || '.' || rc.code || ' → ' || COALESCE(rc.metadata->>'famille','(aucune)'), ', ' ORDER BY rc.domain, rc.code)
    INTO v_bad
    FROM ref_code rc
   WHERE rc.domain IN ('taxonomy_hlo','taxonomy_hot','taxonomy_camp','taxonomy_hpa','taxonomy_rva')
     AND rc.is_active
     AND rc.metadata->>'axis' IN ('nature','sous_type')
     AND NOT EXISTS (SELECT 1 FROM ref_code fam
                      WHERE fam.domain = 'accommodation_family'
                        AND fam.code = rc.metadata->>'famille' AND fam.is_active);
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'v2: nature(s)/sous-type(s) rattaché(s) à une famille inactive: %', v_bad;
  END IF;

  -- 7. `outdoor_glamping` non assignable tant que le lot 5 n'a pas livré sa relève.
  IF NOT EXISTS (SELECT 1 FROM ref_code
                  WHERE domain = 'taxonomy_hpa' AND code = 'outdoor_glamping'
                    AND NOT is_assignable
                    AND metadata->>'axis' = 'type_unite'
                    AND NOT (metadata ? 'famille')) THEN
    RAISE EXCEPTION 'v2: outdoor_glamping doit être non assignable, à l''axe type_unite, et hors de toute famille';
  END IF;
  IF EXISTS (SELECT 1 FROM object_taxonomy ot
               JOIN ref_code rc ON rc.id = ot.ref_code_id
              WHERE rc.domain = 'taxonomy_hpa' AND rc.code = 'outdoor_glamping') THEN
    RAISE EXCEPTION 'v2: outdoor_glamping a repris un porteur alors qu''il n''est plus assignable';
  END IF;

  -- 8. L'aire de SERVICES reste un service SPU.
  --    Disposer d'eau, de vidange et d'électricité ne prouve pas que la nuitée
  --    est autorisée ; autoriser la nuitée n'impose aucun service.
  IF NOT EXISTS (SELECT 1 FROM ref_code WHERE domain = 'taxonomy_spu' AND code = 'motorhome_services' AND is_active) THEN
    RAISE EXCEPTION 'v2: taxonomy_spu.motorhome_services a disparu — l''aire de services autonome perd sa nature';
  END IF;
  IF EXISTS (SELECT 1 FROM ref_code WHERE domain = 'taxonomy_spu' AND code = 'motorhome_services'
               AND (metadata ? 'famille' OR metadata->>'axis' IN ('nature','sous_type'))) THEN
    RAISE EXCEPTION 'v2: motorhome_services a été rattaché à une famille d''hébergement';
  END IF;

  -- 9. Gratuit / payant restent hors de la taxonomie (ils vivent dans object_price).
  SELECT string_agg(domain || '.' || code, ', ')
    INTO v_bad
    FROM ref_code
   WHERE domain LIKE 'taxonomy\_%'
     AND (code ~* '(^|_)(gratuit|payant|free|paid)($|_)'
          OR metadata ? 'gratuit' OR metadata ? 'payant');
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'v2: vocabulaire tarifaire dans une taxonomie: %', v_bad;
  END IF;

  -- 10. `prl_stars` reste UN seul classement, applicable à HPA et CAMP.
  SELECT count(*) INTO v_n
    FROM ref_classification_scheme s
    JOIN ref_classification_scheme_applicability a ON a.scheme_id = s.id
   WHERE s.code = 'prl_stars' AND a.object_type IN ('HPA','CAMP');
  IF v_n <> 2 THEN
    RAISE EXCEPTION 'v2: prl_stars doit rester applicable à HPA et CAMP (trouvé % applicabilité(s)) — ne pas créer un second classement PRL', v_n;
  END IF;

  -- 11. Chaque nouveau nœud est dans la closure, relié à la racine technique.
  SELECT string_agg(t.code, ', ')
    INTO v_bad
    FROM (VALUES ('declared_campground'),('residential_leisure_park'),('bivouac_area'),('motorhome_night_stop'),
                 ('farm_camping'),('homestay_camping')) AS t(code)
   WHERE NOT EXISTS (
           SELECT 1
             FROM ref_code_taxonomy_closure cl
             JOIN ref_code anc ON anc.id = cl.ancestor_id
             JOIN ref_code dsc ON dsc.id = cl.descendant_id
            WHERE cl.domain = 'taxonomy_hpa'
              AND anc.code = 'root' AND dsc.code = t.code);
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'v2: closure incomplète — % non relié(s) à la racine taxonomy_hpa', v_bad;
  END IF;

  -- 12. INVARIANT STRUCTUREL : un sous-type est un VRAI enfant, dans le MÊME
  --     domaine, dont le parent est une nature de la MÊME famille.
  --     `metadata.famille` ne produit qu'un regroupement plat ; il ne crée jamais
  --     de parenté (contrôle 18 ci-dessous).
  SELECT string_agg(rc.domain || '.' || rc.code || ' (' || COALESCE(p.domain || '.' || p.code, 'sans parent') || ')', ', ' ORDER BY rc.domain, rc.code)
    INTO v_bad
    FROM ref_code rc
    LEFT JOIN ref_code p ON p.id = rc.parent_id
   WHERE rc.is_active
     AND rc.metadata->>'axis' = 'sous_type'
     AND rc.domain LIKE 'taxonomy\_%'
     AND (p.id IS NULL
          OR p.domain IS DISTINCT FROM rc.domain
          OR p.metadata->>'axis' IS DISTINCT FROM 'nature'
          OR p.metadata->>'famille' IS DISTINCT FROM rc.metadata->>'famille');
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'v2: sous-type(s) sans parent réel same-domain de nature et de même famille: %', v_bad;
  END IF;

  -- 13. …et la closure porte la relation DIRECTE à depth = 1.
  SELECT string_agg(t.code, ', ')
    INTO v_bad
    FROM (VALUES ('farm_camping'),('homestay_camping')) AS t(code)
   WHERE NOT EXISTS (
           SELECT 1 FROM ref_code_taxonomy_closure cl
             JOIN ref_code anc ON anc.id = cl.ancestor_id
             JOIN ref_code dsc ON dsc.id = cl.descendant_id
            WHERE cl.domain = 'taxonomy_hpa' AND cl.depth = 1
              AND anc.code = 'declared_campground' AND dsc.code = t.code);
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'v2: relation directe depth=1 absente sous declared_campground pour %', v_bad;
  END IF;

  -- 14. Aucun nœud n'est l'enfant d'un nœud d'un autre domaine.
  --     Deux natures peuvent partager une famille sans jamais devenir parent/enfant.
  SELECT string_agg(c.domain || '.' || c.code || ' ← ' || p.domain || '.' || p.code, ', ')
    INTO v_bad
    FROM ref_code c JOIN ref_code p ON p.id = c.parent_id
   WHERE c.domain IS DISTINCT FROM p.domain;
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'v2: parenté inter-domaines détectée: %', v_bad;
  END IF;

  RAISE NOTICE 'v2: contrôles de catalogue (1-14) verts';
END
$v2_guard$;

-- -----------------------------------------------------------------------------
-- 15-17. Contrôles NON VACANTS sur le filtre : on exécute la MÊME RPC que
--        l'Explorer sur des porteurs témoins créés dans la transaction.
--        Asserter que `declared_campground` existe ne prouve pas que le filtrer
--        remonte ses enfants — c'est précisément le lien que la closure et le
--        cache `cached_taxonomy_codes` doivent établir.
-- -----------------------------------------------------------------------------
DO $v2_filter_is_wired$
DECLARE
  v_farm  uuid;
  v_home  uuid;
  v_nat   uuid;
  v_id_farm TEXT;
  v_id_home TEXT;
  v_id_out  TEXT;
  v_ids   TEXT[];
BEGIN
  SELECT id INTO v_farm FROM ref_code WHERE domain = 'taxonomy_hpa' AND code = 'farm_camping';
  SELECT id INTO v_home FROM ref_code WHERE domain = 'taxonomy_hpa' AND code = 'homestay_camping';
  SELECT id INTO v_nat  FROM ref_code WHERE domain = 'taxonomy_hpa' AND code = 'natural_camp_area';

  -- Trois témoins : un sous chaque sous-type, un HORS du sous-arbre.
  -- `status = 'draft'` est délibéré : `get_filtered_object_ids` ne bascule sur le
  -- MV (construit WHERE status='published') que si TOUS les statuts demandés sont
  -- publics. En restant sur 'draft' la RPC lit la table `object` vive, donc nos
  -- fixtures transactionnelles sont visibles — un test qui interrogerait le MV
  -- passerait au vert sans rien avoir mesuré.
  INSERT INTO object (object_type, name, status, region_code)
  VALUES ('HPA', 'FIXTURE v2 — terrain déclaré à la ferme', 'draft', 'RUN') RETURNING id INTO v_id_farm;
  INSERT INTO object (object_type, name, status, region_code)
  VALUES ('HPA', 'FIXTURE v2 — terrain déclaré chez l''habitant', 'draft', 'RUN') RETURNING id INTO v_id_home;
  INSERT INTO object (object_type, name, status, region_code)
  VALUES ('HPA', 'FIXTURE v2 — aire naturelle hors sous-arbre', 'draft', 'RUN') RETURNING id INTO v_id_out;

  INSERT INTO object_taxonomy (object_id, domain, ref_code_id) VALUES
    (v_id_farm, 'taxonomy_hpa', v_farm),
    (v_id_home, 'taxonomy_hpa', v_home),
    (v_id_out,  'taxonomy_hpa', v_nat);

  PERFORM api.refresh_object_filter_caches(v_id_farm);
  PERFORM api.refresh_object_filter_caches(v_id_home);
  PERFORM api.refresh_object_filter_caches(v_id_out);

  -- 15. Le cache d'un porteur d'enfant contient bien son ancêtre assignable :
  --     c'est le maillon que le re-parentage crée, et sans lui le filtre parent
  --     ne remonte rien.
  IF NOT (SELECT COALESCE(cached_taxonomy_codes, ARRAY[]::text[]) @> ARRAY['taxonomy_hpa:declared_campground']
            FROM object WHERE id = v_id_farm) THEN
    RAISE EXCEPTION 'v2: le cache du porteur farm_camping ne contient pas taxonomy_hpa:declared_campground — le filtre parent sera muet';
  END IF;

  -- 16. Filtrer le PARENT remonte les DEUX enfants et exclut le témoin extérieur.
  SELECT COALESCE(array_agg(object_id ORDER BY object_id), ARRAY[]::TEXT[]) INTO v_ids
    FROM api.get_filtered_object_ids(
           jsonb_build_object('taxonomy_any',
             jsonb_build_array(jsonb_build_object('domain','taxonomy_hpa','code','declared_campground'))),
           ARRAY['HPA']::object_type[],
           ARRAY['draft']::object_status[]);

  -- COALESCE obligatoire : un array_agg vide rend NULL, et `NULL @> …` vaut NULL,
  -- donc `IF NOT (…)` ne déclencherait pas. Un test qui ne peut pas échouer sur
  -- « zéro résultat » ne teste rien.
  IF NOT (v_ids @> ARRAY[v_id_farm, v_id_home]) THEN
    RAISE EXCEPTION 'v2: filtrer declared_campground ne remonte pas ses deux sous-types (obtenu: %)', COALESCE(array_to_string(v_ids, ','), '(vide)');
  END IF;
  IF v_ids @> ARRAY[v_id_out] THEN
    RAISE EXCEPTION 'v2: filtrer declared_campground remonte un objet hors de son sous-arbre (%)', v_id_out;
  END IF;

  -- 17. Filtrer un ENFANT ne remonte que son propre sous-arbre.
  SELECT COALESCE(array_agg(object_id ORDER BY object_id), ARRAY[]::TEXT[]) INTO v_ids
    FROM api.get_filtered_object_ids(
           jsonb_build_object('taxonomy_any',
             jsonb_build_array(jsonb_build_object('domain','taxonomy_hpa','code','farm_camping'))),
           ARRAY['HPA']::object_type[],
           ARRAY['draft']::object_status[]);

  IF NOT (v_ids @> ARRAY[v_id_farm]) THEN
    RAISE EXCEPTION 'v2: filtrer farm_camping ne remonte pas son propre porteur';
  END IF;
  IF v_ids @> ARRAY[v_id_home] OR v_ids @> ARRAY[v_id_out] THEN
    RAISE EXCEPTION 'v2: filtrer farm_camping déborde sur un autre sous-arbre (obtenu: %)', array_to_string(v_ids, ',');
  END IF;

  RAISE NOTICE 'v2: filtre parent/enfant vérifié sur porteurs témoins (15-17)';
END
$v2_filter_is_wired$;

-- -----------------------------------------------------------------------------
-- 18. Reprises nominatives + volumétrie — uniquement quand le corpus est présent.
--     Sur base fraîche (fresh-apply CI) il n'y a aucune fiche : le contrôle se
--     déclare ignoré, jamais « vert » par accident.
-- -----------------------------------------------------------------------------
DO $v2_corpus$
DECLARE v_collectif INT; v_locatif INT; v_hlo INT;
BEGIN
  SELECT count(*) INTO v_hlo FROM object WHERE object_type = 'HLO' AND status = 'published';
  IF v_hlo = 0 THEN
    RAISE NOTICE 'v2: base sans corpus importé — contrôles de reprise et de volumétrie IGNORÉS';
    RETURN;
  END IF;

  -- Gîte Hydrangea 974 : nature corrigée, type technique INCHANGÉ.
  IF NOT EXISTS (
    SELECT 1 FROM object o
      JOIN object_taxonomy ot ON ot.object_id = o.id AND ot.domain = 'taxonomy_hlo'
      JOIN ref_code rc ON rc.id = ot.ref_code_id
     WHERE o.id = 'HLORUN000000017A' AND o.object_type = 'HLO'
       AND rc.code = 'gite_de_randonnee'
       AND ot.source = 'taxonomy_hebergement_audit_20260729'
  ) THEN
    RAISE EXCEPTION 'v2: HLORUN000000017A (Gîte Hydrangea 974) doit être HLO / gite_de_randonnee avec la source d''audit taxonomy_hebergement_audit_20260729';
  END IF;

  -- Le Verger de la Chapelle : décision PO D2, type technique INCHANGÉ.
  IF NOT EXISTS (
    SELECT 1 FROM object o
      JOIN object_taxonomy ot ON ot.object_id = o.id AND ot.domain = 'taxonomy_hpa'
      JOIN ref_code rc ON rc.id = ot.ref_code_id
     WHERE o.id = 'CAMRUN000000013J' AND o.object_type = 'HPA'
       AND rc.code = 'farm_camping'
  ) THEN
    RAISE EXCEPTION 'v2: CAMRUN000000013J (Le Verger de la Chapelle) doit être HPA / farm_camping (décision PO 2026-07-29)';
  END IF;

  -- Volumétrie. Le gel du 29/07 donne 455 locatifs et 21 collectifs publiés
  -- (20 + Hydrangea). Un compte SUPÉRIEUR est une croissance légitime du corpus
  -- et ne casse rien ; un compte INFÉRIEUR signifie que le chantier a fait perdre
  -- des porteurs — c'est cela qu'on refuse.
  SELECT count(*) INTO v_collectif
    FROM object o
    JOIN object_taxonomy ot ON ot.object_id = o.id
    JOIN ref_code rc ON rc.id = ot.ref_code_id AND rc.domain = ot.domain
   WHERE o.status = 'published' AND rc.metadata->>'famille' = 'collectif';

  SELECT count(*) INTO v_locatif
    FROM object o
    JOIN object_taxonomy ot ON ot.object_id = o.id
    JOIN ref_code rc ON rc.id = ot.ref_code_id AND rc.domain = ot.domain
   WHERE o.status = 'published' AND rc.metadata->>'famille' = 'locatif';

  IF v_collectif < 21 THEN
    RAISE EXCEPTION 'v2: % porteur(s) collectif(s) publié(s) au lieu des 21 attendus au gel du 2026-07-29 — des fiches ont été perdues', v_collectif;
  END IF;
  IF v_locatif < 455 THEN
    RAISE EXCEPTION 'v2: % porteur(s) locatif(s) publié(s) au lieu des 455 attendus au gel du 2026-07-29 — des fiches ont été perdues', v_locatif;
  END IF;
  IF v_collectif > 21 OR v_locatif > 455 THEN
    RAISE NOTICE 'v2: corpus en croissance depuis le gel (collectif %, locatif % — gel: 21 / 455)', v_collectif, v_locatif;
  END IF;

  -- Aucun hébergement sans taxonomie compatible, aucun porteur de nœud mort.
  IF EXISTS (
    SELECT 1 FROM object o
      JOIN object_taxonomy ot ON ot.object_id = o.id
      JOIN ref_code rc ON rc.id = ot.ref_code_id AND rc.domain = ot.domain
     WHERE o.object_type IN ('HOT','HLO','RVA','CAMP','HPA')
       AND (NOT rc.is_active OR NOT rc.is_assignable)
  ) THEN
    RAISE EXCEPTION 'v2: au moins un hébergement porte un nœud inactif ou non assignable';
  END IF;

  RAISE NOTICE 'v2: reprises nominatives et volumétrie vérifiées sur corpus live';
END
$v2_corpus$;

ROLLBACK;

DO $$ BEGIN RAISE NOTICE 'test_taxonomy_accommodation_hierarchy_v2.sql: OK'; END $$;
