-- =============================================================================
-- migration_taxonomy_accommodation_hierarchy_v2.sql
-- §201 — Taxonomie des hébergements v2 : hiérarchie honnête, familles de plein
--        air scindées, natures collectives au même niveau.
-- Manifest : taxo5 (APRÈS taxo4 `migration_taxonomy_accommodation_vocabulary.sql`)
-- Plan     : docs/plans/2026-07-29-taxonomie-hebergements-collectifs-campings-aires-plan.md
-- Gel live : docs/research/taxonomy-hebergements-gel-revalidation-2026-07-29.md
-- =============================================================================
--
-- POURQUOI
--   §192 a donné un AXE à chaque nœud, mais a laissé trois défauts que les agents
--   voient à l'écran :
--
--   1. Les natures d'hébergement collectif étaient à deux étages différents :
--      « Gîte de groupe » et « Auberge collective » étaient rendus comme des
--      SOUS-TYPES pendant que « Résidence de tourisme » (domaine RVA) était rendue
--      comme une NATURE. L'interface fabriquait donc une subordination qui
--      n'existe dans aucun référentiel — un gîte de groupe n'est pas une variété
--      de résidence de tourisme.
--   2. La famille « Hôtellerie de plein air » mélangeait deux réalités
--      réglementaires : un TERRAIN (camping, aire naturelle, terrain déclaré, PRL)
--      et une simple AUTORISATION DE HALTE (bivouac, aire camping-car, halte
--      nocturne). Un agent ne pouvait pas expliquer pourquoi une aire naturelle
--      est un camping alors qu'une aire de bivouac n'en est pas un.
--   3. « Hébergement insolite de plein air » (bulle, tipi, lodge, cabane) était
--      une NATURE d'établissement, alors que c'est ce dans quoi le visiteur dort.
--      Un même camping peut proposer plusieurs de ces unités : une valeur unique
--      par objet et par domaine ne peut pas le représenter.
--
-- CE QUE FAIT CETTE MIGRATION
--   1. Deux familles neuves : `campings_terrains` et `aires_haltes_plein_air`.
--      `plein_air` est CONSERVÉE mais désactivée (historique, caches, exports).
--   2. Les 3 nœuds HLO collectifs passent de l'axe `sous_type` à l'axe `nature`
--      et prennent leurs libellés courts (Auberge, Gîte) contextualisés par la
--      famille. Les codes techniques ne bougent PAS.
--   3. Campings et terrains : `camping`, `natural_camp_area`, le nœud neuf
--      `declared_campground` (parent réel de `farm_camping` / `homestay_camping`)
--      et le nœud neuf `residential_leisure_park`.
--   4. Aires et haltes : `motorhome_area`, `bivouac_area`, `motorhome_night_stop`.
--   5. `outdoor_glamping` sort de l'axe nature (non assignable, axe `type_unite`).
--   6. Deux reprises nominatives `object_taxonomy` — et deux seulement.
--
-- INVARIANT STRUCTUREL POSÉ ICI (à recopier dans CLAUDE.md)
--   Une entrée visuellement subordonnée à une autre DOIT être reliée par
--   `parent_id` dans le MÊME domaine et par la closure. `metadata.famille` ne
--   produit qu'un regroupement PLAT et ne doit jamais être lu comme une
--   hiérarchie. C'est pourquoi « Terrain de camping déclaré » est un vrai nœud
--   parent et non une étiquette : sans lui, filtrer le parent ne remonterait pas
--   les porteurs de ses deux enfants.
--
-- HORS PÉRIMÈTRE — volontairement
--   - `gratuit` / `payant` : vivent dans `object_price`, jamais dans une taxonomie.
--   - eau / vidange / électricité : `ref_amenity`, jamais dans une taxonomie.
--   - `taxonomy_spu.motorhome_services` (aire de SERVICES) reste un service SPU :
--     disposer des trois services ne prouve pas que la nuitée est autorisée.
--   - L'axe « Type d'unité » multi-valué (`accommodation_unit_type` +
--     `object_accommodation_unit_type`) est livré par le lot 5. Tant qu'il n'est
--     pas livré, `outdoor_glamping` reste `is_active = TRUE` : le désactiver
--     rendrait invisible l'historique avant d'avoir sa relève.
--
-- ORDRE DE DÉPLOIEMENT — NON NÉGOCIABLE (§4.11 du plan)
--   Le frontend rétrocompatible du lot 3 (exclusion de `is_assignable = false`
--   dans les familles ET dans les critères complémentaires) doit être EN LIGNE
--   AVANT ce SQL. Sinon `outdoor_glamping` reste affiché comme une nature
--   sélectionnable qui n'accepte plus aucune écriture.
--
-- IDEMPOTENT et re-jouable. FRESH-SAFE : les deux reprises de fiches sont des
--   no-op documentés si l'objet n'existe pas (base fraîche), et lèvent une
--   exception si l'objet existe avec une valeur source inattendue.
-- APRÈS COMMIT (hors transaction) : refresh borné + les 2 MV. Voir bas de fichier.
-- =============================================================================

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

-- -----------------------------------------------------------------------------
-- 0. Gardes de pré-requis — fail-closed.
--    Cette migration réécrit `metadata.famille` de nœuds que taxo4 vient de
--    poser. Jouée AVANT taxo4, elle serait silencieusement écrasée.
-- -----------------------------------------------------------------------------
DO $v2_prereq$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM ref_code
     WHERE domain = 'accommodation_family' AND code = 'plein_air'
  ) THEN
    RAISE EXCEPTION
      'v2: `accommodation_family` absent — appliquer d''abord taxo4 migration_taxonomy_accommodation_vocabulary.sql';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'api' AND p.proname = 'refresh_ref_code_taxonomy_closure'
  ) THEN
    RAISE EXCEPTION 'v2: api.refresh_ref_code_taxonomy_closure absent — la closure ne pourrait pas être reconstruite';
  END IF;
END
$v2_prereq$;

-- -----------------------------------------------------------------------------
-- 1. Les deux familles neuves + retraite de `plein_air`.
--
--    Les DEUX portent les alias de l'ancien vocabulaire : « Hôtellerie de plein
--    air » recouvrait les deux réalités, donc une recherche sur l'ancien terme
--    doit proposer les deux familles, pas en choisir une arbitrairement.
-- -----------------------------------------------------------------------------
INSERT INTO ref_code (domain, code, name, description, position, is_active, is_assignable,
                      name_i18n, description_i18n, metadata)
VALUES
  ('accommodation_family', 'campings_terrains', 'Campings et terrains',
   'Terrains organisés pour le camping ou les hébergements légers, qu''ils soient classés, déclarés, naturels, à la ferme ou chez l''habitant, ainsi que les parcs résidentiels de loisirs.',
   4, TRUE, FALSE,
   '{"fr":"Campings et terrains"}'::jsonb,
   '{"fr":"Terrains organisés pour le camping ou les hébergements légers, classés, déclarés, naturels, à la ferme ou chez l''habitant, ainsi que les parcs résidentiels de loisirs."}'::jsonb,
   jsonb_build_object(
     'axis', 'famille',
     'aliases', '["Hôtellerie de plein air","Hébergement de plein air"]'::jsonb,
     'source', 'taxonomy_hierarchie_v2_20260729')),
  ('accommodation_family', 'aires_haltes_plein_air', 'Aires et haltes de plein air',
   'Lieux autorisant une halte ou une nuitée de plein air sans constituer un terrain de camping.',
   5, TRUE, FALSE,
   '{"fr":"Aires et haltes de plein air"}'::jsonb,
   '{"fr":"Lieux autorisant une halte ou une nuitée de plein air sans constituer un terrain de camping."}'::jsonb,
   jsonb_build_object(
     'axis', 'famille',
     'aliases', '["Hôtellerie de plein air","Hébergement de plein air"]'::jsonb,
     'source', 'taxonomy_hierarchie_v2_20260729'))
ON CONFLICT (domain, code) DO UPDATE
  SET name = EXCLUDED.name,
      description = EXCLUDED.description,
      position = EXCLUDED.position,
      is_active = EXCLUDED.is_active,
      is_assignable = EXCLUDED.is_assignable,
      name_i18n = COALESCE(ref_code.name_i18n, '{}'::jsonb) || EXCLUDED.name_i18n,
      description_i18n = COALESCE(ref_code.description_i18n, '{}'::jsonb) || EXCLUDED.description_i18n,
      metadata = COALESCE(ref_code.metadata, '{}'::jsonb) || EXCLUDED.metadata;

-- `plein_air` n'est PAS supprimée : elle reste citée par des caches, des exports
-- partenaires et l'historique `object_version`. On la sort du catalogue actif.
UPDATE ref_code rc
   SET is_active = FALSE,
       is_assignable = FALSE,
       metadata = COALESCE(rc.metadata, '{}'::jsonb)
                  || jsonb_build_object(
                       'deprecated', TRUE,
                       'replaced_by', '["campings_terrains","aires_haltes_plein_air"]'::jsonb,
                       'retired', 'taxonomy_hierarchie_v2_20260729',
                       'reason', 'la famille mélangeait terrain de camping et simple autorisation de halte')
 WHERE rc.domain = 'accommodation_family'
   AND rc.code = 'plein_air';

-- -----------------------------------------------------------------------------
-- 2. Hébergement collectif — les 3 nœuds HLO rejoignent l'axe `nature`.
--
--    `code`, `parent_id` et `is_assignable` sont conservés : le re-codage
--    casserait `ref_interop_crosswalk` et les correspondances partenaires pour un
--    gain nul. Seuls l'AXE et le LIBELLÉ VISIBLE changent.
--    `auberge_collective_stars` (classement) n'est pas renommé : c'est un schéma
--    de classement, pas un libellé de nature.
--
--    Les libellés deviennent courts (« Auberge », « Gîte ») parce que la famille
--    les désambiguïse déjà à l'écran. Les appellations longues restent
--    RETROUVABLES via `metadata.aliases` — le mot « Gîte » désigne aussi
--    commercialement un meublé de tourisme, d'où la description explicite.
-- -----------------------------------------------------------------------------
WITH v(domain, code, new_name, axis, famille, add_aliases, descr) AS (
  VALUES
    ('taxonomy_hlo', 'auberge_collective', 'Auberge', 'nature', 'collectif',
     '["Auberge collective"]',
     'Hébergement proposant notamment des lits en chambres partagées ou individuelles et des espaces collectifs.'),
    ('taxonomy_hlo', 'gite_de_groupe', 'Gîte', 'nature', 'collectif',
     '["Gîte de groupe"]',
     'Dans cette famille, hébergement destiné à l''accueil d''un groupe. Ne pas le confondre avec le mot « gîte » employé commercialement pour un meublé de tourisme.'),
    -- Libellé inchangé : « Refuge et gîte d'étape » est déjà le vocabulaire métier.
    ('taxonomy_hlo', 'gite_de_randonnee', NULL, 'nature', 'collectif',
     '["Gîte de randonnée","Gîte d''étape"]',
     'Hébergement collectif situé sur un itinéraire de randonnée, accueillant les marcheurs à l''étape.')
)
UPDATE ref_code rc
   SET name = COALESCE(v.new_name, rc.name),
       name_i18n = CASE WHEN v.new_name IS NULL THEN rc.name_i18n
                        ELSE COALESCE(rc.name_i18n, '{}'::jsonb) || jsonb_build_object('fr', v.new_name) END,
       description = v.descr,
       description_i18n = COALESCE(rc.description_i18n, '{}'::jsonb) || jsonb_build_object('fr', v.descr),
       metadata = (COALESCE(rc.metadata, '{}'::jsonb) - 'axis' - 'famille' - 'aliases')
                  || jsonb_build_object(
                       'axis', v.axis,
                       'famille', v.famille,
                       'aliases', (
                         SELECT COALESCE(jsonb_agg(DISTINCT a ORDER BY a), '[]'::jsonb)
                           FROM jsonb_array_elements_text(
                                  COALESCE(rc.metadata -> 'aliases', '[]'::jsonb) || v.add_aliases::jsonb
                                ) AS t(a)
                       ),
                       'source', 'taxonomy_hierarchie_v2_20260729')
  FROM v
 WHERE rc.domain = v.domain AND rc.code = v.code;

-- -----------------------------------------------------------------------------
-- 3. Campings et terrains.
--
-- 3a. Le nœud parent neuf `declared_campground`. Créé AVANT le re-parentage.
--     Source : Direction générale des Entreprises, « Les terrains de camping
--     déclarés » — « camping à la ferme » et « terrain rural / chez un
--     particulier » y sont décrits comme des formes USUELLES du terrain déclaré,
--     pas comme trois régimes sœurs. Les rendre sœurs créerait un chevauchement
--     qu'aucun agent ne saurait arbitrer (cas live : Le Verger de la Chapelle,
--     classé « chez l'habitant » par l'IRT tout en étant sur une exploitation).
-- -----------------------------------------------------------------------------
INSERT INTO ref_code (domain, code, name, description, parent_id, position,
                      is_active, is_assignable, name_i18n, description_i18n, metadata)
SELECT
  'taxonomy_hpa', 'declared_campground', 'Terrain de camping déclaré',
  'Terrain accueillant des campeurs sous le régime déclaratif applicable, sans être présenté comme un camping classé.',
  root.id, 3, TRUE, TRUE,
  '{"fr":"Terrain de camping déclaré"}'::jsonb,
  '{"fr":"Terrain accueillant des campeurs sous le régime déclaratif applicable, sans être présenté comme un camping classé."}'::jsonb,
  jsonb_build_object(
    'axis', 'nature',
    'famille', 'campings_terrains',
    'aliases', '["Terrain déclaré","Camping déclaré","Terrain rural"]'::jsonb,
    'source_ref', 'Direction générale des Entreprises — Les terrains de camping déclarés (màj 2026-04-03)',
    'source', 'taxonomy_hierarchie_v2_20260729')
FROM ref_code root
WHERE root.domain = 'taxonomy_hpa' AND root.code = 'root'
ON CONFLICT (domain, code) DO UPDATE
  SET name = EXCLUDED.name,
      description = EXCLUDED.description,
      parent_id = EXCLUDED.parent_id,
      position = EXCLUDED.position,
      is_active = EXCLUDED.is_active,
      is_assignable = EXCLUDED.is_assignable,
      name_i18n = COALESCE(ref_code.name_i18n, '{}'::jsonb) || EXCLUDED.name_i18n,
      description_i18n = COALESCE(ref_code.description_i18n, '{}'::jsonb) || EXCLUDED.description_i18n,
      metadata = (COALESCE(ref_code.metadata, '{}'::jsonb) - 'axis' - 'famille')
                 || EXCLUDED.metadata;

-- 3b. Parc résidentiel de loisirs.
--     Le classement `prl_stars` EXISTE DÉJÀ et s'applique à HPA et CAMP — ne pas
--     en créer un second. La nature reste « PRL », classé ou non.
INSERT INTO ref_code (domain, code, name, description, parent_id, position,
                      is_active, is_assignable, name_i18n, description_i18n, metadata)
SELECT
  'taxonomy_hpa', 'residential_leisure_park', 'Parc résidentiel de loisirs',
  'Terrain aménagé proposant des emplacements nus ou équipés d''habitations légères, de mobil-homes ou de caravanes, loués avec des équipements communs à une clientèle qui n''y élit pas domicile.',
  root.id, 6, TRUE, TRUE,
  '{"fr":"Parc résidentiel de loisirs"}'::jsonb,
  '{"fr":"Terrain aménagé proposant des emplacements nus ou équipés d''habitations légères, de mobil-homes ou de caravanes, loués avec des équipements communs à une clientèle qui n''y élit pas domicile."}'::jsonb,
  jsonb_build_object(
    'axis', 'nature',
    'famille', 'campings_terrains',
    'aliases', '["PRL","Parc résidentiel"]'::jsonb,
    'source_ref', 'Code du tourisme, articles D333-3 et D333-4',
    'source', 'taxonomy_hierarchie_v2_20260729')
FROM ref_code root
WHERE root.domain = 'taxonomy_hpa' AND root.code = 'root'
ON CONFLICT (domain, code) DO UPDATE
  SET name = EXCLUDED.name,
      description = EXCLUDED.description,
      parent_id = EXCLUDED.parent_id,
      position = EXCLUDED.position,
      is_active = EXCLUDED.is_active,
      is_assignable = EXCLUDED.is_assignable,
      name_i18n = COALESCE(ref_code.name_i18n, '{}'::jsonb) || EXCLUDED.name_i18n,
      description_i18n = COALESCE(ref_code.description_i18n, '{}'::jsonb) || EXCLUDED.description_i18n,
      metadata = (COALESCE(ref_code.metadata, '{}'::jsonb) - 'axis' - 'famille')
                 || EXCLUDED.metadata;

-- 3c. Re-parentage RÉEL des deux formes déclarées + passage à l'axe `sous_type`.
--     `parent_id` (et non `metadata.famille`) est ce qui fait que filtrer le
--     parent remonte les porteurs des enfants : la closure serveur descend par
--     `parent_id`. Un regroupement purement visuel serait un mensonge de filtre.
WITH v(code, new_position, descr) AS (
  VALUES
    ('farm_camping', 1,
     'Terrain de camping déclaré situé sur une exploitation agricole et exploité dans le cadre de l''accueil touristique de cette exploitation.'),
    ('homestay_camping', 2,
     'Terrain de camping déclaré mis à disposition chez un particulier hors exploitation agricole.')
)
UPDATE ref_code rc
   SET parent_id = parent.id,
       position = v.new_position,
       description = v.descr,
       description_i18n = COALESCE(rc.description_i18n, '{}'::jsonb) || jsonb_build_object('fr', v.descr),
       metadata = (COALESCE(rc.metadata, '{}'::jsonb) - 'axis' - 'famille')
                  || jsonb_build_object(
                       'axis', 'sous_type',
                       'famille', 'campings_terrains',
                       'source_ref', 'Direction générale des Entreprises — Les terrains de camping déclarés',
                       'source', 'taxonomy_hierarchie_v2_20260729')
  FROM v
  JOIN ref_code parent
    ON parent.domain = 'taxonomy_hpa' AND parent.code = 'declared_campground'
 WHERE rc.domain = 'taxonomy_hpa' AND rc.code = v.code;

-- 3d. Les deux natures de terrain déjà existantes changent de famille.
--     `taxonomy_camp.camping` GARDE son code ET son libellé « Camping » : le
--     renommer surchargerait l'interface et casserait les affectations et les
--     correspondances partenaires pour un bénéfice nul.
WITH v(domain, code, add_aliases, descr) AS (
  VALUES
    ('taxonomy_camp', 'camping', '["Camping aménagé","Camping classé"]',
     'Terrain aménagé pour l''accueil de tentes, caravanes ou résidences mobiles de loisirs. Le classement se filtre séparément.'),
    ('taxonomy_hpa', 'natural_camp_area', '["Aire naturelle"]',
     'Catégorie réglementaire de terrain de camping aménagé, classée sans étoile, réservée aux tentes, caravanes et autocaravanes, exploitée au maximum six mois par an et sans habitation légère ni résidence mobile de loisirs.')
)
UPDATE ref_code rc
   SET description = v.descr,
       description_i18n = COALESCE(rc.description_i18n, '{}'::jsonb) || jsonb_build_object('fr', v.descr),
       metadata = (COALESCE(rc.metadata, '{}'::jsonb) - 'axis' - 'famille' - 'aliases')
                  || jsonb_build_object(
                       'axis', 'nature',
                       'famille', 'campings_terrains',
                       'aliases', (
                         SELECT COALESCE(jsonb_agg(DISTINCT a ORDER BY a), '[]'::jsonb)
                           FROM jsonb_array_elements_text(
                                  COALESCE(rc.metadata -> 'aliases', '[]'::jsonb) || v.add_aliases::jsonb
                                ) AS t(a)
                       ),
                       'source', 'taxonomy_hierarchie_v2_20260729')
  FROM v
 WHERE rc.domain = v.domain AND rc.code = v.code;

UPDATE ref_code rc
   SET metadata = COALESCE(rc.metadata, '{}'::jsonb)
                  || jsonb_build_object(
                       'source_ref', 'Code du tourisme, articles D332-1 et D332-1-2 ; DGE — Aires naturelles de camping',
                       'source', 'taxonomy_hierarchie_v2_20260729')
 WHERE rc.domain = 'taxonomy_hpa' AND rc.code = 'natural_camp_area';

-- -----------------------------------------------------------------------------
-- 4. Aires et haltes de plein air.
--
--    Règle métier verrouillée : la NUITÉE est une propriété de la nature, les
--    SERVICES (eau, vidange, électricité) sont des équipements. Une aire de
--    services camping-car (`taxonomy_spu.motorhome_services`) ne prouve donc
--    jamais que la nuitée est autorisée, et une aire d'accueil peut l'autoriser
--    sans posséder un seul service.
-- -----------------------------------------------------------------------------
UPDATE ref_code rc
   SET description = 'Aire autorisant explicitement le stationnement et la nuitée des camping-cars. Les équipements d''eau, de vidange ou d''électricité sont décrits séparément.',
       description_i18n = COALESCE(rc.description_i18n, '{}'::jsonb)
                          || '{"fr":"Aire autorisant explicitement le stationnement et la nuitée des camping-cars. Les équipements d''eau, de vidange ou d''électricité sont décrits séparément."}'::jsonb,
       metadata = (COALESCE(rc.metadata, '{}'::jsonb) - 'axis' - 'famille' - 'aliases')
                  || jsonb_build_object(
                       'axis', 'nature',
                       'famille', 'aires_haltes_plein_air',
                       'aliases', (
                         SELECT COALESCE(jsonb_agg(DISTINCT a ORDER BY a), '[]'::jsonb)
                           FROM jsonb_array_elements_text(
                                  COALESCE(rc.metadata -> 'aliases', '[]'::jsonb)
                                  || '["Aire camping-car","Aire d''accueil camping-car"]'::jsonb
                                ) AS t(a)
                       ),
                       'source', 'taxonomy_hierarchie_v2_20260729')
 WHERE rc.domain = 'taxonomy_hpa' AND rc.code = 'motorhome_area';

INSERT INTO ref_code (domain, code, name, description, parent_id, position,
                      is_active, is_assignable, name_i18n, description_i18n, metadata)
SELECT * FROM (
  SELECT
    'taxonomy_hpa'::text, 'bivouac_area'::text, 'Aire de bivouac'::text,
    'Lieu identifié où une installation légère et temporaire pour la nuit est autorisée, selon la réglementation locale.'::text,
    root.id, 10,
    TRUE, TRUE,
    '{"fr":"Aire de bivouac"}'::jsonb,
    '{"fr":"Lieu identifié où une installation légère et temporaire pour la nuit est autorisée, selon la réglementation locale."}'::jsonb,
    jsonb_build_object(
      'axis', 'nature',
      'famille', 'aires_haltes_plein_air',
      'aliases', '["Bivouac","Zone de bivouac"]'::jsonb,
      'source', 'taxonomy_hierarchie_v2_20260729')
  FROM ref_code root WHERE root.domain = 'taxonomy_hpa' AND root.code = 'root'
  UNION ALL
  SELECT
    'taxonomy_hpa', 'motorhome_night_stop', 'Halte nocturne camping-car/van',
    'Lieu autorisant une halte nocturne courte pour camping-car ou van, sans présumer de la présence de services.',
    root.id, 12,
    TRUE, TRUE,
    '{"fr":"Halte nocturne camping-car/van"}'::jsonb,
    '{"fr":"Lieu autorisant une halte nocturne courte pour camping-car ou van, sans présumer de la présence de services."}'::jsonb,
    jsonb_build_object(
      'axis', 'nature',
      'famille', 'aires_haltes_plein_air',
      'aliases', '["Halte nocturne","Halte van","Stationnement nuit van"]'::jsonb,
      'source', 'taxonomy_hierarchie_v2_20260729')
  FROM ref_code root WHERE root.domain = 'taxonomy_hpa' AND root.code = 'root'
) AS s(domain, code, name, description, parent_id, position, is_active, is_assignable,
       name_i18n, description_i18n, metadata)
ON CONFLICT (domain, code) DO UPDATE
  SET name = EXCLUDED.name,
      description = EXCLUDED.description,
      parent_id = EXCLUDED.parent_id,
      position = EXCLUDED.position,
      is_active = EXCLUDED.is_active,
      is_assignable = EXCLUDED.is_assignable,
      name_i18n = COALESCE(ref_code.name_i18n, '{}'::jsonb) || EXCLUDED.name_i18n,
      description_i18n = COALESCE(ref_code.description_i18n, '{}'::jsonb) || EXCLUDED.description_i18n,
      metadata = (COALESCE(ref_code.metadata, '{}'::jsonb) - 'axis' - 'famille')
                 || EXCLUDED.metadata;

-- -----------------------------------------------------------------------------
-- 5. `outdoor_glamping` sort de l'axe nature.
--
--    GARDÉ sur 0 porteur : avec un porteur, le rendre non assignable
--    bloquerait la ré-écriture de cette fiche sans lui offrir de cible. Dans ce
--    cas la migration s'arrête (assert 6 plus bas) et il faut un mapping
--    nominatif fiche par fiche.
--    `is_active` reste TRUE : le lot 5 le désactivera une fois que
--    `accommodation_unit_type` aura pris le relais.
-- -----------------------------------------------------------------------------
UPDATE ref_code rc
   SET is_assignable = FALSE,
       description = 'Ancienne nature devenue un type d''unité. Bulle, tipi, lodge et cabane se saisissent désormais dans « Type d''unité », qui accepte plusieurs valeurs par fiche.',
       description_i18n = COALESCE(rc.description_i18n, '{}'::jsonb)
                          || '{"fr":"Ancienne nature devenue un type d''unité. Bulle, tipi, lodge et cabane se saisissent désormais dans « Type d''unité »."}'::jsonb,
       metadata = (COALESCE(rc.metadata, '{}'::jsonb) - 'famille' - 'axis')
                  || jsonb_build_object(
                       'axis', 'type_unite',
                       'deprecated_in_taxonomy', TRUE,
                       'replacement_domain', 'accommodation_unit_type',
                       'source', 'taxonomy_hierarchie_v2_20260729')
 WHERE rc.domain = 'taxonomy_hpa'
   AND rc.code = 'outdoor_glamping'
   AND NOT EXISTS (SELECT 1 FROM object_taxonomy ot WHERE ot.ref_code_id = rc.id);

-- -----------------------------------------------------------------------------
-- 6. Reprises nominatives — DEUX lignes `object_taxonomy`, et deux seulement.
--
--    Chaque reprise VÉRIFIE sa valeur source avant d'écrire. Si la fiche a été
--    corrigée entre le gel du 29/07 et l'application, la transaction échoue au
--    lieu d'écraser une décision plus récente. Sur base fraîche (objet absent),
--    c'est un no-op documenté.
--    Aucune reprise n'est déduite d'un mot-clé : l'audit a montré que
--    « bivouac », « refuge », « lodge » et « résidence » produisent des faux
--    positifs.
-- -----------------------------------------------------------------------------
DO $v2_data_manifest$
DECLARE
  r          RECORD;
  v_target   uuid;
  v_current  text;
  v_rows     int;
BEGIN
  FOR r IN
    SELECT * FROM (VALUES
      -- Audit live 2026-07-29 §3 — source IRT : « gîte d'étape et de randonnée »,
      -- accueil des randonneurs du GRR2, 3 chambres + 2 dortoirs.
      ('HLORUN000000017A', 'HLO',  'taxonomy_hlo', 'chambre_d_hotes',   'gite_de_randonnee',
       'Audit live 2026-07-29 — IRT : gîte d''étape et de randonnée, accueil GRR2'),
      -- Décision PO 2026-07-29 (D2) : le statut d'exploitation agricole l'emporte
      -- sur le libellé commercial IRT « chez l'habitant ».
      ('CAMRUN000000013J', 'HPA',  'taxonomy_hpa', 'homestay_camping',  'farm_camping',
       'Décision PO 2026-07-29 — exploitation agricole : sous-type « à la ferme » du terrain déclaré')
    ) AS t(object_id, object_type, domain, from_code, to_code, note)
  LOOP
    -- Fresh-safe : la fiche n'existe que sur les bases alimentées par l'import.
    IF NOT EXISTS (SELECT 1 FROM object o WHERE o.id = r.object_id) THEN
      RAISE NOTICE 'v2: % absent (base fraîche) — reprise ignorée', r.object_id;
      CONTINUE;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM object o WHERE o.id = r.object_id AND o.object_type::text = r.object_type) THEN
      RAISE EXCEPTION 'v2: % n''est plus de type % — reprise annulée (aucun object_type n''est modifié par ce chantier)',
        r.object_id, r.object_type;
    END IF;

    SELECT rc.code INTO v_current
      FROM object_taxonomy ot
      JOIN ref_code rc ON rc.id = ot.ref_code_id AND rc.domain = ot.domain
     WHERE ot.object_id = r.object_id AND ot.domain = r.domain;

    -- Déjà repris : re-jeu de la migration.
    IF v_current = r.to_code THEN
      CONTINUE;
    END IF;

    IF v_current IS DISTINCT FROM r.from_code THEN
      RAISE EXCEPTION
        'v2: % porte %.% au lieu de la valeur gelée %.% — la fiche a changé depuis l''audit du 2026-07-29, arbitrage requis avant écriture',
        r.object_id, r.domain, COALESCE(v_current, '(aucune)'), r.domain, r.from_code;
    END IF;

    SELECT rc.id INTO v_target FROM ref_code rc WHERE rc.domain = r.domain AND rc.code = r.to_code;
    IF v_target IS NULL THEN
      RAISE EXCEPTION 'v2: nœud cible %.% introuvable', r.domain, r.to_code;
    END IF;

    UPDATE object_taxonomy ot
       SET ref_code_id = v_target,
           source = 'taxonomy_hebergement_audit_20260729',
           note = r.note,
           updated_at = now()
     WHERE ot.object_id = r.object_id AND ot.domain = r.domain;

    GET DIAGNOSTICS v_rows = ROW_COUNT;
    IF v_rows <> 1 THEN
      RAISE EXCEPTION 'v2: reprise de % a touché % ligne(s) au lieu d''une seule', r.object_id, v_rows;
    END IF;

    RAISE NOTICE 'v2: % repris %.% → %.%', r.object_id, r.domain, r.from_code, r.domain, r.to_code;
  END LOOP;
END
$v2_data_manifest$;

-- -----------------------------------------------------------------------------
-- 7. Reconstruction explicite de la fermeture taxonomique.
--    Rendue visible même si un trigger la maintient : les asserts 9 et 10
--    ci-dessous lisent la closure, et le filtre parent « Terrain de camping
--    déclaré » en dépend directement.
-- -----------------------------------------------------------------------------
SELECT api.refresh_ref_code_taxonomy_closure('taxonomy_hlo');
SELECT api.refresh_ref_code_taxonomy_closure('taxonomy_camp');
SELECT api.refresh_ref_code_taxonomy_closure('taxonomy_hpa');

-- Caches des deux fiches reprises (le libellé d'ancêtre alimente `doc_b`).
-- Borné aux fiches réellement reprises : voir le manifeste §14 du plan.
SELECT api.refresh_object_filter_caches(o.id)
  FROM object o
 WHERE o.id IN ('HLORUN000000017A', 'CAMRUN000000013J');

-- -----------------------------------------------------------------------------
-- 8. Asserts fail-closed
-- -----------------------------------------------------------------------------
DO $v2_asserts$
DECLARE v_n INT; v_bad TEXT;
BEGIN
  -- 1. `plein_air` ne doit plus être active.
  IF EXISTS (SELECT 1 FROM ref_code WHERE domain = 'accommodation_family' AND code = 'plein_air' AND is_active) THEN
    RAISE EXCEPTION 'v2: accommodation_family.plein_air est encore active — l''ancienne famille doit être retirée du catalogue';
  END IF;

  -- 2. Exactement 5 familles actives.
  SELECT count(*) INTO v_n FROM ref_code WHERE domain = 'accommodation_family' AND is_active;
  IF v_n <> 5 THEN
    RAISE EXCEPTION 'v2: % famille(s) active(s) au lieu de 5', v_n;
  END IF;

  -- 3. Aucune nature / sous-type actif ne pointe vers une famille absente ou inactive.
  SELECT string_agg(rc.domain || '.' || rc.code || ' → ' || COALESCE(rc.metadata->>'famille','(aucune)'), ', ' ORDER BY rc.domain, rc.code)
    INTO v_bad
    FROM ref_code rc
   WHERE rc.domain IN ('taxonomy_hlo','taxonomy_hot','taxonomy_camp','taxonomy_hpa','taxonomy_rva')
     AND rc.is_active
     AND rc.metadata->>'axis' IN ('nature','sous_type')
     AND NOT EXISTS (
           SELECT 1 FROM ref_code fam
            WHERE fam.domain = 'accommodation_family'
              AND fam.code = rc.metadata->>'famille'
              AND fam.is_active);
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'v2: nature(s)/sous-type(s) rattaché(s) à une famille absente ou inactive: %', v_bad;
  END IF;

  -- 4. Les 3 nœuds HLO collectifs sont passés à l'axe nature.
  SELECT count(*) INTO v_n
    FROM ref_code
   WHERE domain = 'taxonomy_hlo'
     AND code IN ('gite_de_randonnee','gite_de_groupe','auberge_collective')
     AND metadata->>'axis' = 'nature'
     AND metadata->>'famille' = 'collectif';
  IF v_n <> 3 THEN
    RAISE EXCEPTION 'v2: % des 3 nœuds HLO collectifs sont en axe nature/collectif', v_n;
  END IF;

  -- 4b. Les 6 natures collectives (3 HLO + 3 RVA) sont au MÊME axe.
  SELECT count(*) INTO v_n
    FROM ref_code
   WHERE is_active AND metadata->>'axis' = 'nature' AND metadata->>'famille' = 'collectif';
  IF v_n <> 6 THEN
    RAISE EXCEPTION 'v2: % nature(s) collective(s) au lieu de 6 (Auberge, Gîte, Refuge et gîte d''étape, Résidence de tourisme, Village de vacances, Résidence hôtelière)', v_n;
  END IF;

  -- 5. Les 7 natures de plein air et les 2 sous-types de terrain déclaré existent.
  SELECT string_agg(t.domain || '.' || t.code, ', ')
    INTO v_bad
    FROM (VALUES
            ('taxonomy_camp','camping'),
            ('taxonomy_hpa','natural_camp_area'),
            ('taxonomy_hpa','declared_campground'),
            ('taxonomy_hpa','residential_leisure_park'),
            ('taxonomy_hpa','bivouac_area'),
            ('taxonomy_hpa','motorhome_area'),
            ('taxonomy_hpa','motorhome_night_stop'),
            ('taxonomy_hpa','farm_camping'),
            ('taxonomy_hpa','homestay_camping')
         ) AS t(domain, code)
   WHERE NOT EXISTS (
           SELECT 1 FROM ref_code rc
            WHERE rc.domain = t.domain AND rc.code = t.code
              AND rc.is_active AND rc.is_assignable);
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'v2: nature(s) de plein air manquante(s) ou non assignable(s): %', v_bad;
  END IF;

  -- 6. `outdoor_glamping` n'est jamais désactivé avec un porteur.
  IF EXISTS (
    SELECT 1 FROM ref_code rc
     WHERE rc.domain = 'taxonomy_hpa' AND rc.code = 'outdoor_glamping'
       AND NOT rc.is_assignable
       AND EXISTS (SELECT 1 FROM object_taxonomy ot WHERE ot.ref_code_id = rc.id)
  ) THEN
    RAISE EXCEPTION 'v2: outdoor_glamping a un porteur — il ne peut pas devenir non assignable sans mapping nominatif';
  END IF;
  IF EXISTS (
    SELECT 1 FROM ref_code rc
     WHERE rc.domain = 'taxonomy_hpa' AND rc.code = 'outdoor_glamping'
       AND rc.is_assignable
       AND NOT EXISTS (SELECT 1 FROM object_taxonomy ot WHERE ot.ref_code_id = rc.id)
  ) THEN
    RAISE EXCEPTION 'v2: outdoor_glamping a 0 porteur mais reste assignable — la sortie de l''axe nature n''a pas été appliquée';
  END IF;

  -- 7. Aucun code tarifaire n'a été introduit dans une taxonomie.
  SELECT string_agg(domain || '.' || code, ', ')
    INTO v_bad
    FROM ref_code
   WHERE domain LIKE 'taxonomy\_%'
     AND (code ~* '(^|_)(gratuit|payant|free|paid)($|_)'
          OR metadata ? 'gratuit' OR metadata ? 'payant');
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'v2: vocabulaire tarifaire introduit dans une taxonomie (il appartient à object_price): %', v_bad;
  END IF;

  -- 8. L'aire de SERVICES reste un service SPU, jamais une nature d'hébergement.
  IF EXISTS (
    SELECT 1 FROM ref_code
     WHERE domain = 'taxonomy_spu' AND code = 'motorhome_services'
       AND (metadata ? 'famille' OR metadata->>'axis' IN ('nature','sous_type'))
  ) THEN
    RAISE EXCEPTION 'v2: taxonomy_spu.motorhome_services a été rattaché à une famille d''hébergement — une aire de services ne prouve pas que la nuitée est autorisée';
  END IF;

  -- 9. Parenté RÉELLE, dans le même domaine.
  SELECT string_agg(t.code, ', ')
    INTO v_bad
    FROM (VALUES ('farm_camping'), ('homestay_camping')) AS t(code)
   WHERE NOT EXISTS (
           SELECT 1
             FROM ref_code child
             JOIN ref_code parent ON parent.id = child.parent_id
            WHERE child.domain = 'taxonomy_hpa' AND child.code = t.code
              AND parent.domain = 'taxonomy_hpa' AND parent.code = 'declared_campground');
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'v2: % n''a pas declared_campground comme parent réel dans taxonomy_hpa — un regroupement par metadata.famille ne remonterait pas ses porteurs au filtre parent', v_bad;
  END IF;

  -- 10. Et la closure porte bien la relation directe à depth = 1.
  SELECT string_agg(t.code, ', ')
    INTO v_bad
    FROM (VALUES ('farm_camping'), ('homestay_camping')) AS t(code)
   WHERE NOT EXISTS (
           SELECT 1
             FROM ref_code_taxonomy_closure cl
             JOIN ref_code parent ON parent.id = cl.ancestor_id
             JOIN ref_code child  ON child.id  = cl.descendant_id
            WHERE cl.domain = 'taxonomy_hpa' AND cl.depth = 1
              AND parent.code = 'declared_campground' AND child.code = t.code);
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'v2: closure incomplète pour % (relation directe depth=1 absente sous declared_campground)', v_bad;
  END IF;

  -- 11. Les deux reprises nominatives, quand la base porte les fiches.
  IF EXISTS (SELECT 1 FROM object WHERE id = 'HLORUN000000017A') THEN
    IF NOT EXISTS (
      SELECT 1 FROM object o
        JOIN object_taxonomy ot ON ot.object_id = o.id AND ot.domain = 'taxonomy_hlo'
        JOIN ref_code rc ON rc.id = ot.ref_code_id
       WHERE o.id = 'HLORUN000000017A' AND o.object_type = 'HLO'
         AND rc.code = 'gite_de_randonnee'
    ) THEN
      RAISE EXCEPTION 'v2: Gîte Hydrangea 974 (HLORUN000000017A) ne porte pas gite_de_randonnee en HLO';
    END IF;
  END IF;

  IF EXISTS (SELECT 1 FROM object WHERE id = 'CAMRUN000000013J') THEN
    IF NOT EXISTS (
      SELECT 1 FROM object o
        JOIN object_taxonomy ot ON ot.object_id = o.id AND ot.domain = 'taxonomy_hpa'
        JOIN ref_code rc ON rc.id = ot.ref_code_id
       WHERE o.id = 'CAMRUN000000013J' AND o.object_type = 'HPA'
         AND rc.code = 'farm_camping'
    ) THEN
      RAISE EXCEPTION 'v2: Le Verger de la Chapelle (CAMRUN000000013J) ne porte pas farm_camping en HPA';
    END IF;
  END IF;
END
$v2_asserts$;

COMMIT;

-- =============================================================================
-- APRÈS COMMIT — hors transaction, à exécuter séparément.
--
-- Rafraîchissement BORNÉ au manifeste nominatif (§14 du plan). Ne JAMAIS
-- rafraîchir tous les HLO/RVA/CAMP/HPA : `api.refresh_object_filter_caches`
-- réécrit `search_document`, `search_document_text` et `search_document_phonetic`,
-- qui ne figurent PAS dans les listes ignorées des trois triggers « changement
-- métier » de `object`. Un rafraîchissement large ferait donc bouger `updated_at`
-- et `current_version` sur tout le corpus — or `updated_at` est LE signal de
-- reprise des synchronisations partenaires (CLAUDE.md §197).
--
--   CREATE TEMP TABLE _taxonomy_refresh_manifest(object_id text PRIMARY KEY, reason text NOT NULL);
--   INSERT INTO _taxonomy_refresh_manifest VALUES
--     ('HLORUN00000000ZV','porteur gite_de_groupe — libellé/axe modifié'),
--     ('HLORUN000000011E','porteur gite_de_groupe — libellé/axe modifié'),
--     ('HLORUN000000012H','porteur gite_de_groupe — libellé/axe modifié'),
--     ('HLORUN000000017A','correction de nature Gîte Hydrangea'),
--     ('CAMRUN000000013J','porteur homestay_camping + reprise D2 vers farm_camping'),
--     ('CAMRUN00000000PH','porteur homestay_camping re-parenté sous declared_campground'),
--     ('CAMRUN000000013G','porteur CAMP — libellé/axe modifié');
--
--   SELECT api.refresh_object_filter_caches(o.id)
--     FROM object o JOIN _taxonomy_refresh_manifest m ON m.object_id = o.id;
--
--   REFRESH MATERIALIZED VIEW CONCURRENTLY internal.mv_filtered_objects;
--   REFRESH MATERIALIZED VIEW CONCURRENTLY internal.mv_ref_data_json;
--   NOTIFY pgrst, 'reload schema';
--
-- (Les 2 fiches reprises sont déjà rafraîchies DANS la transaction — les
--  ré-appeler est idempotent ; les 5 autres le sont parce que le libellé ou
--  l'ancêtre de leur nœud a changé, ce qu'aucun trigger ne couvre : seul
--  `object_taxonomy` déclenche un refresh, jamais un renommage de `ref_code`.)
--
-- VÉRIFICATION DE NON-RÉGRESSION (avant / après doivent être identiques) :
--   SELECT count(*) FROM object
--    WHERE object_type = 'HLO' AND status = 'published'
--      AND search_document @@ plainto_tsquery('french','gite');
-- =============================================================================
