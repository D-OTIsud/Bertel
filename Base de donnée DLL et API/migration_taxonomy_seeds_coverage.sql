-- =============================================================================
-- migration_taxonomy_seeds_coverage.sql — Seeds des taxonomies vides + extensions (§57)
-- Manifest step 8y. Idempotent (ON CONFLICT) — re-run = no-op.
-- Live-applied 2026-06-11 (MCP migration taxonomy_seeds_coverage).
-- =============================================================================
-- POURQUOI. Vérifié live 2026-06-11 : seuls 10 domaines de taxonomie existaient
-- (act/camp/com/hlo/hot/loi/org/psv/res/spu) — PNA, PCU, VIL, ITI, FMA, HPA,
-- RVA, ASC n'avaient AUCUN nœud, alors que l'éditeur §01 et l'import des fiches
-- candidates (§50) en dépendent. Verdicts de l'analyse typologique (§57,
-- docs/research/type-gap-analysis-2026-06-11.md) :
--   * 8 registres + arbres de taxonomie à créer ;
--   * SPU élargi « services & équipements au public » (accès libre non marchand
--     → SPU ; marchand → LOI) : aires de pique-nique, BIT, équipements sportifs
--     libres, parking/gare/covoiturage/port, aire de services camping-car ;
--   * marchés : LIEU pérenne → nœuds COM (récurrence portée par les horaires) ;
--     FMA réservé aux ÉDITIONS datées (marché de Noël, foire) — règle §57 ;
--   * LOI : branche Bien-être (spa/institut/thermes) + nœud MICE « Centre de
--     congrès / salle de réception » avec ouverture d'applicabilité
--     object_meeting_room → LOI (cas nominal du registre §46) ;
--   * relation « sur_le_parcours_de » (POI ↔ itinéraire qui le dessert).
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Registres des 8 domaines manquants
-- ---------------------------------------------------------------------------
INSERT INTO ref_code_domain_registry (
  domain, name, description, object_type,
  is_hierarchical, is_taxonomy, position, is_active,
  name_i18n, description_i18n, metadata
) VALUES
  ('taxonomy_pna', 'Taxonomie PNA', 'Sous-catégories des sites naturels.',            'PNA'::object_type, TRUE, TRUE, 40, TRUE, jsonb_build_object('fr','Taxonomie PNA'), jsonb_build_object('fr','Sous-catégories des sites naturels.'), jsonb_build_object('source','taxonomy_seeds_20260611')),
  ('taxonomy_pcu', 'Taxonomie PCU', 'Sous-catégories du patrimoine culturel.',        'PCU'::object_type, TRUE, TRUE, 42, TRUE, jsonb_build_object('fr','Taxonomie PCU'), jsonb_build_object('fr','Sous-catégories du patrimoine culturel.'), jsonb_build_object('source','taxonomy_seeds_20260611')),
  ('taxonomy_vil', 'Taxonomie VIL', 'Sous-catégories des villes et villages.',        'VIL'::object_type, TRUE, TRUE, 44, TRUE, jsonb_build_object('fr','Taxonomie VIL'), jsonb_build_object('fr','Sous-catégories des villes et villages.'), jsonb_build_object('source','taxonomy_seeds_20260611')),
  ('taxonomy_iti', 'Taxonomie ITI', 'Sous-catégories des itinéraires.',               'ITI'::object_type, TRUE, TRUE, 46, TRUE, jsonb_build_object('fr','Taxonomie ITI'), jsonb_build_object('fr','Sous-catégories des itinéraires.'), jsonb_build_object('source','taxonomy_seeds_20260611')),
  ('taxonomy_fma', 'Taxonomie FMA', 'Sous-catégories des fêtes et manifestations.',   'FMA'::object_type, TRUE, TRUE, 48, TRUE, jsonb_build_object('fr','Taxonomie FMA'), jsonb_build_object('fr','Sous-catégories des fêtes et manifestations.'), jsonb_build_object('source','taxonomy_seeds_20260611')),
  ('taxonomy_hpa', 'Taxonomie HPA', 'Sous-catégories de l''hébergement de plein air.','HPA'::object_type, TRUE, TRUE, 50, TRUE, jsonb_build_object('fr','Taxonomie HPA'), jsonb_build_object('fr','Sous-catégories de l''hébergement de plein air.'), jsonb_build_object('source','taxonomy_seeds_20260611')),
  ('taxonomy_rva', 'Taxonomie RVA', 'Sous-catégories des résidences de vacances.',    'RVA'::object_type, TRUE, TRUE, 52, TRUE, jsonb_build_object('fr','Taxonomie RVA'), jsonb_build_object('fr','Sous-catégories des résidences de vacances.'), jsonb_build_object('source','taxonomy_seeds_20260611')),
  ('taxonomy_asc', 'Taxonomie ASC', 'Sous-catégories des structures d''activités sportives et culturelles.', 'ASC'::object_type, TRUE, TRUE, 54, TRUE, jsonb_build_object('fr','Taxonomie ASC'), jsonb_build_object('fr','Sous-catégories des structures d''activités.'), jsonb_build_object('source','taxonomy_seeds_20260611'))
ON CONFLICT (domain) DO UPDATE
SET object_type = EXCLUDED.object_type,
    is_hierarchical = TRUE, is_taxonomy = TRUE, is_active = TRUE,
    metadata = coalesce(ref_code_domain_registry.metadata, '{}'::jsonb) || EXCLUDED.metadata,
    updated_at = NOW();

-- ---------------------------------------------------------------------------
-- 2. Racines techniques des 8 domaines
-- ---------------------------------------------------------------------------
INSERT INTO ref_code (domain, code, name, description, position, parent_id, is_assignable, metadata, name_i18n, description_i18n)
SELECT 'taxonomy_' || d, 'root', upper(d), 'Racine technique Taxonomie ' || upper(d), 0, NULL, FALSE,
       jsonb_build_object('source','taxonomy_seeds_20260611'),
       jsonb_build_object('fr', upper(d)),
       jsonb_build_object('fr', 'Racine technique Taxonomie ' || upper(d))
FROM unnest(ARRAY['pna','pcu','vil','iti','fma','hpa','rva','asc']) AS d
ON CONFLICT (domain, code) DO NOTHING;

-- Technical roots for the EXISTING spu/com/loi domains too. On a fresh DB their roots are not
-- guaranteed to exist before this file: taxonomy_spu's root comes from migration_object_type_spu
-- (step 8u, earlier — kept by ON CONFLICT), but taxonomy_com/_loi had NO versioned root anywhere
-- in the repo (created ad-hoc on live). Without a root, the node INSERT below (INNER JOIN
-- r.code='root') silently DROPS every com/loi extension node — the "2 of 5" the fresh-apply gate
-- caught (2026-07-01). Idempotent: DO NOTHING keeps any pre-existing root; ref_code has no FK to
-- ref_code_domain_registry, so this needs no prior domain registration.
INSERT INTO ref_code (domain, code, name, description, position, parent_id, is_assignable, metadata, name_i18n, description_i18n)
SELECT 'taxonomy_' || d, 'root', upper(d), 'Racine technique Taxonomie ' || upper(d), 0, NULL, FALSE,
       jsonb_build_object('source','taxonomy_seeds_20260611'),
       jsonb_build_object('fr', upper(d)),
       jsonb_build_object('fr', 'Racine technique Taxonomie ' || upper(d))
FROM unnest(ARRAY['spu','com','loi']) AS d
ON CONFLICT (domain, code) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 3. Nœuds assignables par domaine
-- ---------------------------------------------------------------------------
WITH nodes(domain, code, name, description, position) AS (VALUES
  -- PNA — sites naturels
  ('taxonomy_pna','beach',            'Plage',                              'Plage (sable, galets)', 1),
  ('taxonomy_pna','natural_pool',     'Bassin de baignade / piscine naturelle', 'Bassin, piscine naturelle, lagon', 2),
  ('taxonomy_pna','waterfall',        'Cascade',                            'Cascade, chute d''eau', 3),
  ('taxonomy_pna','viewpoint',        'Point de vue / belvédère',           'Belvédère, point de vue aménagé', 4),
  ('taxonomy_pna','forest',           'Forêt',                              'Forêt, espace boisé remarquable', 5),
  ('taxonomy_pna','volcanic_site',    'Site volcanique',                    'Coulées, cratères, paysages volcaniques', 6),
  ('taxonomy_pna','coastline',        'Littoral remarquable',               'Cap, falaise, souffleur, côte sauvage', 7),
  ('taxonomy_pna','remarkable_tree',  'Arbre remarquable',                  'Arbre remarquable ou vétéran', 8),
  ('taxonomy_pna','geological_site',  'Site géologique',                    'Curiosité géologique (hyaloclastite, orgues, tunnels de lave non encadrés)', 9),
  -- PCU — patrimoine culturel
  ('taxonomy_pcu','museum',           'Musée / centre d''interprétation',   'Musée, écomusée, centre d''interprétation', 1),
  ('taxonomy_pcu','religious_building','Édifice religieux',                 'Église, chapelle, temple, mosquée', 2),
  ('taxonomy_pcu','historic_monument','Monument historique',                'Édifice ou site protégé au titre des MH', 3),
  ('taxonomy_pcu','industrial_heritage','Patrimoine industriel',            'Usines, sucreries, cheminées, ouvrages techniques', 4),
  ('taxonomy_pcu','creole_architecture','Architecture créole',              'Cases et demeures créoles, patrimoine vernaculaire', 5),
  ('taxonomy_pcu','historic_site',    'Site historique',                    'Lieu de mémoire, vestige, ouvrage historique', 6),
  -- VIL — villes et villages
  ('taxonomy_vil','creole_village',   'Village créole',                     'Village de caractère créole', 1),
  ('taxonomy_vil','character_village','Village de caractère',               'Bourg ou village remarquable', 2),
  ('taxonomy_vil','town_center',      'Bourg / centre-ville',               'Centre urbain, chef-lieu', 3),
  ('taxonomy_vil','islet',            'Îlet',                               'Îlet habité (cirques, vallées)', 4),
  -- ITI — itinéraires
  ('taxonomy_iti','hiking',           'Randonnée pédestre',                 'Itinéraire de randonnée à pied', 1),
  ('taxonomy_iti','trail_running',    'Trail',                              'Parcours de trail', 2),
  ('taxonomy_iti','mountain_biking',  'VTT',                                'Itinéraire ou circuit VTT', 3),
  ('taxonomy_iti','scenic_drive',     'Itinéraire routier / route touristique', 'Route scénique (voiture, moto)', 4),
  ('taxonomy_iti','interpretive_trail','Sentier botanique / d''interprétation', 'Sentier thématique, botanique, pédagogique', 5),
  ('taxonomy_iti','coastal_path',     'Sentier littoral',                   'Itinéraire le long du littoral', 6),
  -- FMA — fêtes et manifestations
  ('taxonomy_fma','terroir_festival', 'Fête de terroir / de produit',       'Fête d''un produit ou du terroir (miel, vacoa, choca…)', 1),
  ('taxonomy_fma','fair_show',        'Foire / salon',                      'Foire, salon, exposition', 2),
  ('taxonomy_fma','festival',         'Festival',                           'Festival (musique, arts…)', 3),
  ('taxonomy_fma','sports_event',     'Événement sportif / trail',          'Compétition ou événement sportif ouvert au public', 4),
  ('taxonomy_fma','cultural_event',   'Manifestation culturelle',           'Spectacle, commémoration, manifestation culturelle', 5),
  ('taxonomy_fma','seasonal_market',  'Marché éphémère / de Noël',          'Édition datée d''un marché (lieu pérenne = COM)', 6),
  ('taxonomy_fma','religious_celebration','Célébration religieuse',         'Fête ou pèlerinage religieux ouvert au public', 7),
  -- HPA — hébergement de plein air
  ('taxonomy_hpa','natural_camp_area','Aire naturelle de camping',          'Aire naturelle, camping non classé', 1),
  ('taxonomy_hpa','farm_camping',     'Camping à la ferme',                 'Camping à la ferme', 2),
  ('taxonomy_hpa','outdoor_glamping', 'Hébergement insolite de plein air',  'Bulles, tipis, kabanons, lodges toilés', 3),
  ('taxonomy_hpa','motorhome_area',   'Aire d''accueil camping-car',        'Aire de stationnement/nuitée camping-cars (services → SPU)', 4),
  -- RVA — résidences de vacances
  ('taxonomy_rva','tourism_residence','Résidence de tourisme classée',      'Résidence de tourisme (classement Atout France)', 1),
  ('taxonomy_rva','holiday_village',  'Village de vacances',                'Village de vacances', 2),
  ('taxonomy_rva','aparthotel',       'Résidence hôtelière',                'Résidence hôtelière / apparthôtel', 3),
  -- ASC — structures d'activités
  ('taxonomy_asc','sports_club',      'École / club sportif',               'Club ou école sportive', 1),
  ('taxonomy_asc','equestrian_center','Centre équestre',                    'Centre ou ferme équestre', 2),
  ('taxonomy_asc','mountain_school',  'École de canyoning / montagne',      'Structure d''encadrement canyoning, escalade, montagne', 3),
  ('taxonomy_asc','nautical_club',    'Club nautique',                      'Club ou base nautique', 4),
  ('taxonomy_asc','cultural_school',  'École / atelier culturel',           'École de danse, musique, atelier artistique', 5),
  ('taxonomy_asc','cultural_association','Association culturelle',          'Association culturelle accueillant du public', 6),
  -- SPU — extensions « services & équipements au public » (accès libre non marchand)
  ('taxonomy_spu','picnic_area',      'Aire de pique-nique / kiosque',      'Aire de pique-nique aménagée, kiosques (ONF, Département, commune)', 10),
  ('taxonomy_spu','tourist_info_office','Bureau d''information touristique','BIT / antenne d''accueil (lié à l''ORG par object_org_link)', 11),
  ('taxonomy_spu','public_pool',      'Piscine municipale',                 'Piscine publique', 12),
  ('taxonomy_spu','public_sports_facility','Équipement sportif en accès libre','Stade, gymnase, plateau sportif, skatepark, pumptrack', 13),
  ('taxonomy_spu','playground',       'Aire de jeux',                       'Aire de jeux publique', 14),
  ('taxonomy_spu','tourist_parking',  'Parking touristique',                'Parking d''accès à un site touristique', 15),
  ('taxonomy_spu','bus_station',      'Gare routière / arrêt structurant',  'Gare routière, pôle d''échanges', 16),
  ('taxonomy_spu','carpool_area',     'Aire de covoiturage',                'Aire de covoiturage', 17),
  ('taxonomy_spu','marina',           'Port de plaisance / capitainerie',   'Port de plaisance, base nautique publique', 18),
  ('taxonomy_spu','motorhome_services','Aire de services camping-car',      'Eau, vidange, électricité pour camping-cars (nuitée → HPA)', 19),
  ('taxonomy_spu','public_library',   'Médiathèque / bibliothèque',         'Équipement culturel public en accès libre', 20),
  -- COM — extensions marchés (lieu pérenne ; les éditions datées → FMA)
  ('taxonomy_com','weekly_market',    'Marché forain',                      'Marché hebdomadaire de plein air (récurrence portée par les horaires)', 10),
  ('taxonomy_com','covered_market',   'Marché couvert',                     'Marché couvert / halles', 11),
  ('taxonomy_com','flea_market',      'Brocante / vide-grenier',            'Brocante régulière (édition datée → FMA)', 12),
  -- LOI — extensions bien-être + MICE (marchand)
  ('taxonomy_loi','wellness',         'Bien-être',                          'Branche bien-être (marchand)', 60),
  ('taxonomy_loi','conference_venue', 'Centre de congrès / salle de réception', 'Lieu MICE autonome (salles : facette object_meeting_room)', 61)
)
INSERT INTO ref_code (domain, code, name, description, position, parent_id, is_assignable, metadata, name_i18n, description_i18n)
SELECT n.domain, n.code, n.name, n.description, n.position, r.id, TRUE,
       jsonb_build_object('source','taxonomy_seeds_20260611'),
       jsonb_build_object('fr', n.name),
       jsonb_build_object('fr', n.description)
FROM nodes n
JOIN ref_code r ON r.domain = n.domain AND r.code = 'root'
ON CONFLICT (domain, code) DO UPDATE
SET name = EXCLUDED.name, description = EXCLUDED.description,
    parent_id = EXCLUDED.parent_id, position = EXCLUDED.position, is_assignable = TRUE,
    metadata = coalesce(ref_code.metadata, '{}'::jsonb) || EXCLUDED.metadata,
    updated_at = NOW();

-- Enfants de la branche LOI Bien-être (multi-niveaux §45 : tous assignables)
WITH parent AS (
  SELECT id FROM ref_code WHERE domain = 'taxonomy_loi' AND code = 'wellness'
)
INSERT INTO ref_code (domain, code, name, description, position, parent_id, is_assignable, metadata, name_i18n, description_i18n)
SELECT 'taxonomy_loi', v.code, v.name, v.name, v.position, parent.id, TRUE,
       jsonb_build_object('source','taxonomy_seeds_20260611'),
       jsonb_build_object('fr', v.name), jsonb_build_object('fr', v.name)
FROM (VALUES
  ('spa_hammam',      'Spa / hammam',        1),
  ('massage_institute','Institut / massage', 2),
  ('thermal_baths',   'Thalasso / thermes',  3)
) AS v(code, name, position)
CROSS JOIN parent
ON CONFLICT (domain, code) DO UPDATE
SET parent_id = EXCLUDED.parent_id, position = EXCLUDED.position, is_assignable = TRUE,
    metadata = coalesce(ref_code.metadata, '{}'::jsonb) || EXCLUDED.metadata,
    updated_at = NOW();

-- ---------------------------------------------------------------------------
-- 4. Applicabilité MICE : object_meeting_room s'ouvre à LOI (registre §46 —
--    « Loosening = INSERT a row » ; backlog « applicability matrix breadth »)
-- ---------------------------------------------------------------------------
INSERT INTO ref_facet_applicability (facet_table, object_type)
VALUES ('object_meeting_room', 'LOI'::object_type)
ON CONFLICT DO NOTHING;

-- ---------------------------------------------------------------------------
-- 5. Rôle de relation « sur le parcours de » (POI desservi par un itinéraire)
-- ---------------------------------------------------------------------------
INSERT INTO ref_object_relation_type (code, name, description, position)
SELECT 'sur_le_parcours_de', 'Sur le parcours de',
       'L''objet (site, producteur, hébergement…) est situé sur le tracé de l''itinéraire cible.',
       coalesce((SELECT max(position) + 1 FROM ref_object_relation_type), 1)
WHERE NOT EXISTS (SELECT 1 FROM ref_object_relation_type WHERE code = 'sur_le_parcours_de');
