-- Permanent, replayable §192 guard — vocabulaire canonique de l'hébergement.
--
-- Les 6 asserts intégrés à `migration_taxonomy_accommodation_vocabulary.sql` ne
-- protègent que l'instant de l'apply. Ce garde-ci protège dans la DURÉE : il
-- échoue si un nœud hébergement naît sans axe, si un libellé canonique est
-- réverti par un ré-apply de snapshot, ou si la chaîne d'alias de recherche est
-- débranchée. Lecture seule.
--
-- Invariant central : un axe = une signification. La profondeur de l'arbre n'est
-- jamais un axe.

\set ON_ERROR_STOP on

-- 1. Tout nœud hébergement ACTIF déclare un axe, et cet axe est du vocabulaire.
DO $accommodation_axis_declared$
DECLARE v_bad TEXT;
BEGIN
  SELECT string_agg(domain || '.' || code || ' → ' || COALESCE(metadata->>'axis', '(aucun)'), ', ' ORDER BY domain, code)
    INTO v_bad
    FROM ref_code
   WHERE domain IN ('taxonomy_hlo','taxonomy_hot','taxonomy_camp','taxonomy_hpa','taxonomy_rva')
     AND is_active
     AND parent_id IS NOT NULL          -- les racines techniques ne portent pas d'axe
     AND COALESCE(metadata->>'axis', '') NOT IN
         ('famille','nature','sous_type','type_unite','positionnement');

  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION '§192 axe manquant ou hors vocabulaire: %', v_bad;
  END IF;
END
$accommodation_axis_declared$;

-- 2. Toute nature / tout sous-type déclare une famille, et cette famille existe
--    dans `accommodation_family`. C'est ce qui permet au filtre de regrouper
--    sans jamais lire la profondeur de l'arbre — si ça casse, l'Explorer perd
--    son étage « Famille » en silence.
DO $accommodation_family_resolves$
DECLARE v_bad TEXT;
BEGIN
  SELECT string_agg(rc.domain || '.' || rc.code || ' → ' || COALESCE(rc.metadata->>'famille', '(aucune)'), ', ' ORDER BY rc.domain, rc.code)
    INTO v_bad
    FROM ref_code rc
   WHERE rc.domain IN ('taxonomy_hlo','taxonomy_hot','taxonomy_camp','taxonomy_hpa','taxonomy_rva')
     AND rc.is_active
     AND rc.metadata->>'axis' IN ('nature','sous_type')
     AND NOT EXISTS (
           SELECT 1 FROM ref_code fam
            WHERE fam.domain = 'accommodation_family'
              AND fam.code = rc.metadata->>'famille');

  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION '§192 famille absente ou non résolue dans accommodation_family: %', v_bad;
  END IF;
END
$accommodation_family_resolves$;

-- 3. Le marqueur d'import périmé `metadata.level` a disparu du périmètre.
--    Il disait « ce nœud vient de la sous-catégorie Berta » — l'affirmation qui
--    a causé les régressions §190 (la forme écrasant la nature).
DO $accommodation_no_stale_import_marker$
DECLARE v_bad TEXT;
BEGIN
  SELECT string_agg(domain || '.' || code, ', ' ORDER BY domain, code)
    INTO v_bad
    FROM ref_code
   WHERE domain IN ('taxonomy_hlo','taxonomy_hot','taxonomy_camp','taxonomy_hpa','taxonomy_rva')
     AND is_active
     AND metadata ? 'level';

  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION '§192 marqueur d''import périmé « level » réintroduit sur: %', v_bad;
  END IF;
END
$accommodation_no_stale_import_marker$;

-- 4. Les 3 libellés canoniques tiennent.
--    Garde volontairement redondante avec la migration : le snapshot
--    `migration_taxonomy_trees_seed.sql` porte encore les libellés d'avant §192
--    et s'exécute AVANT taxo4 dans le manifest. L'ordre actuel est correct, mais
--    si quelqu'un déplace le seed après taxo4 (ou le re-joue seul sur live), les
--    renommages sont silencieusement révertés. Ce test le fait échouer bruyamment.
DO $accommodation_canonical_labels$
DECLARE v_bad TEXT;
BEGIN
  SELECT string_agg(t.domain || '.' || t.code || ' = « ' || COALESCE(rc.name, '(absent)') || ' » au lieu de « ' || t.expected || ' »', ', ')
    INTO v_bad
    FROM (VALUES
            ('taxonomy_hot','hotel','Hôtel'),
            ('taxonomy_hlo','location_saisonniere','Meublé de tourisme'),
            ('taxonomy_rva','tourism_residence','Résidence de tourisme'),
            -- §200 : mêmes raisons, mêmes risques. Le snapshot des arbres porte
            -- désormais ces libellés, mais il s'exécute AVANT taxo5 : si quelqu'un
            -- le rejoue seul avec une version antérieure, « Auberge » redevient
            -- « Auberge collective » sans qu'aucune requête n'échoue.
            ('taxonomy_hlo','auberge_collective','Auberge'),
            ('taxonomy_hlo','gite_de_groupe','Gîte'),
            ('taxonomy_hlo','gite_de_randonnee','Refuge et gîte d''étape'),
            ('taxonomy_camp','camping','Camping')
         ) AS t(domain, code, expected)
    LEFT JOIN ref_code rc ON rc.domain = t.domain AND rc.code = t.code
   WHERE rc.name IS DISTINCT FROM t.expected;

  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION '§192 libellé canonique réverti: %', v_bad;
  END IF;
END
$accommodation_canonical_labels$;

-- 5. Les alias sont exploitables : tableau jsonb (le doc_b s'en protège par un
--    CASE, mais un `aliases` mal typé signalerait une écriture hors migration),
--    et la nature renommée porte bien son alias Berta.
DO $accommodation_aliases_usable$
DECLARE v_bad TEXT;
BEGIN
  SELECT string_agg(domain || '.' || code || ' → ' || jsonb_typeof(metadata -> 'aliases'), ', ' ORDER BY domain, code)
    INTO v_bad
    FROM ref_code
   WHERE domain IN ('taxonomy_hlo','taxonomy_hot','taxonomy_camp','taxonomy_hpa','taxonomy_rva')
     AND is_active
     AND metadata ? 'aliases'
     AND jsonb_typeof(metadata -> 'aliases') <> 'array';

  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION '§192 metadata.aliases n''est pas un tableau: %', v_bad;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM ref_code
     WHERE domain = 'taxonomy_hlo' AND code = 'location_saisonniere'
       AND metadata -> 'aliases' @> '["Location saisonnière"]'::jsonb
  ) THEN
    RAISE EXCEPTION
      '§192 l''alias Berta « Location saisonnière » a disparu de location_saisonniere — les utilisateurs Berta perdent leur porte d''entrée';
  END IF;
END
$accommodation_aliases_usable$;

-- 6. La chaîne d'alias est BRANCHÉE côté index plein-texte.
--    Sans ce maillon, le renommage de `location_saisonniere` retire le token
--    « git » du doc_b de ses 376 porteurs (mesuré live le 2026-07-27 : « gite »
--    remonte 415 fiches HLO publiées). Un ré-apply d'un `schema_unified.sql`
--    antérieur à §192 débrancherait ça en silence : rien ne planterait, la
--    recherche se dégraderait simplement.
DO $accommodation_alias_indexing_wired$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'api' AND p.proname = 'refresh_object_filter_caches'
       AND pg_get_functiondef(p.oid) LIKE '%aliases%'
  ) THEN
    RAISE EXCEPTION
      '§192 api.refresh_object_filter_caches n''indexe plus metadata.aliases — la recherche par ancien terme Berta est cassée';
  END IF;
END
$accommodation_alias_indexing_wired$;

-- 7. Le référentiel orphelin `accommodation_type` reste retiré et sans porteur.
--    Il mélangeait nature + positionnement + type d'unité : le ressusciter
--    rouvrirait l'anti-pattern que §192 ferme.
DO $accommodation_type_stays_retired$
DECLARE v_active INT; v_carriers INT;
BEGIN
  SELECT count(*) INTO v_active   FROM ref_code WHERE domain = 'accommodation_type' AND is_active;
  SELECT count(*) INTO v_carriers FROM object_taxonomy ot
    JOIN ref_code rc ON rc.id = ot.ref_code_id WHERE rc.domain = 'accommodation_type';

  IF v_active > 0 OR v_carriers > 0 THEN
    RAISE EXCEPTION
      '§192 accommodation_type réactivé (% code(s) actif(s), % porteur(s)) — référentiel à 3 axes mélangés, doit rester retiré',
      v_active, v_carriers;
  END IF;
END
$accommodation_type_stays_retired$;

DO $$ BEGIN RAISE NOTICE 'test_taxonomy_accommodation_vocabulary.sql: OK'; END $$;
