-- ════════════════════════════════════════════════════════════════════════════
-- migration_classification_labels_expansion.sql
-- §71 — Expansion du catalogue §08 « Classifications & distinctions »
--
-- Ajoute des classements officiels (Atout France) et des labels qualité manquants,
-- demandés par l'OTI (« avoir tous les classements / labels »). Recherche
-- adversariale 2026-06-15 (cf. décision log §71). Portée §08 uniquement :
-- display_group ∈ {official_classification, quality_label}, is_distinction=TRUE.
-- L'accessibilité (§10, accessibility_labels) et la durabilité (§11,
-- sustainability_labels) restent dans leurs sections.
--
-- IDEMPOTENT : ON CONFLICT (code) DO NOTHING pour les schemes ; NOT EXISTS pour
-- les valeurs. Replié dans seeds_data.sql. Manifest 14d (14c = room_type_bed).
-- No-op sur une base fraîche (seeds_data les insère déjà). i18n FR-only (état
-- canonique du vocabulaire classification, cf. audit §68 — i18n différé).
-- ════════════════════════════════════════════════════════════════════════════

-- ─── Classements officiels Atout France manquants (1–5★, single) ─────────────
-- Atout France classe officiellement 6 types d'hébergement ; nous avions hôtel +
-- camping + meublés. Ajout des autres types gradués (mêmes valeurs 1–5 étoiles).
INSERT INTO ref_classification_scheme (code, name, description, selection, is_distinction, display_group, position) VALUES
('residence_tourisme_stars','Classement résidence de tourisme','Classement officiel Atout France des résidences de tourisme (étoiles)','single',TRUE,'official_classification',6),
('village_vacances_stars',  'Classement village de vacances',  'Classement officiel Atout France des villages de vacances (étoiles)','single',TRUE,'official_classification',7),
('auberge_collective_stars','Classement auberge collective',   'Classement officiel Atout France des auberges collectives (étoiles)','single',TRUE,'official_classification',8),
('prl_stars',               'Classement parc résidentiel de loisirs','Classement officiel Atout France des PRL (étoiles)','single',TRUE,'official_classification',9),
('ot_category',             'Classement office de tourisme',   'Classement préfectoral des offices de tourisme (catégories)','single',TRUE,'official_classification',10)
ON CONFLICT (code) DO NOTHING;

-- ─── Labels qualité — patrimoine (Culture) + réseaux ─────────────────────────
-- NOTE (§71 E) : « Qualité Tourisme™ » national N'EST PAS recréé ici — il existe déjà
-- en base sous `LBL_QUALITE_TOURISME` (display_group sustainability_labels), désormais
-- éditable en §08 via la passe §71 E (relâchement du filtre distinctions). Son
-- successeur « Destination d'excellence » = `LBL_DESTINATION_EXCELLENCE` (idem).
INSERT INTO ref_classification_scheme (code, name, description, selection, is_distinction, display_group, position) VALUES
('monument_historique',  'Monument Historique',       'Protection au titre des monuments historiques (classé ou inscrit) — Ministère de la Culture',                'single',  TRUE,'quality_label',19),
('musee_de_france',      'Musée de France',           'Appellation « Musée de France » (Ministère de la Culture)',                                                    'single',  TRUE,'quality_label',20),
('jardin_remarquable',   'Jardin Remarquable',        'Label « Jardin Remarquable » (Ministère de la Culture)',                                                       'single',  TRUE,'quality_label',21),
('maison_des_illustres', 'Maison des Illustres',      'Label « Maison des Illustres » (Ministère de la Culture)',                                                     'single',  TRUE,'quality_label',22),
('accueil_velo',         'Accueil Vélo',              'Marque nationale « Accueil Vélo » (services aux cyclotouristes)',                                               'single',  TRUE,'quality_label',23),
('tables_auberges',      'Tables & Auberges de France','Label restauration Tables & Auberges de France (catégories)',                                                  'single',  TRUE,'quality_label',24),
('logis',                'Logis',                     'Réseau Logis — classement cheminées (hébergement) et cocottes (restauration)',                                 'multiple',TRUE,'quality_label',25)
ON CONFLICT (code) DO NOTHING;

-- ─── Valeurs : étoiles 1–5 pour les nouveaux classements gradués ─────────────
INSERT INTO ref_classification_value (scheme_id, code, name, ordinal)
SELECT s.id, v.code, v.name, v.ordinal
FROM ref_classification_scheme s
JOIN (VALUES ('1','1 étoile',1),('2','2 étoiles',2),('3','3 étoiles',3),('4','4 étoiles',4),('5','5 étoiles',5)) AS v(code,name,ordinal) ON TRUE
WHERE s.code IN ('residence_tourisme_stars','village_vacances_stars','auberge_collective_stars','prl_stars')
  AND NOT EXISTS (SELECT 1 FROM ref_classification_value cv WHERE cv.scheme_id = s.id AND cv.code = v.code);

-- ─── Valeurs : catégories Office de Tourisme (III en extinction depuis 2019) ──
INSERT INTO ref_classification_value (scheme_id, code, name, ordinal)
SELECT s.id, v.code, v.name, v.ordinal
FROM ref_classification_scheme s
JOIN (VALUES ('cat_1','Catégorie I',1),('cat_2','Catégorie II',2),('cat_3','Catégorie III (en extinction)',3)) AS v(code,name,ordinal) ON TRUE
WHERE s.code = 'ot_category'
  AND NOT EXISTS (SELECT 1 FROM ref_classification_value cv WHERE cv.scheme_id = s.id AND cv.code = v.code);

-- ─── Valeurs : Monument Historique (classé / inscrit) ────────────────────────
INSERT INTO ref_classification_value (scheme_id, code, name, ordinal)
SELECT s.id, v.code, v.name, v.ordinal
FROM ref_classification_scheme s
JOIN (VALUES ('classe','Classé',1),('inscrit','Inscrit à l''inventaire',2)) AS v(code,name,ordinal) ON TRUE
WHERE s.code = 'monument_historique'
  AND NOT EXISTS (SELECT 1 FROM ref_classification_value cv WHERE cv.scheme_id = s.id AND cv.code = v.code);

-- ─── Valeurs : labels « Obtenu » à valeur unique ─────────────────────────────
INSERT INTO ref_classification_value (scheme_id, code, name, ordinal)
SELECT s.id, 'granted', 'Obtenu', 1
FROM ref_classification_scheme s
WHERE s.code IN ('musee_de_france','jardin_remarquable','maison_des_illustres','accueil_velo')
  AND NOT EXISTS (SELECT 1 FROM ref_classification_value cv WHERE cv.scheme_id = s.id AND cv.code = 'granted');

-- ─── Valeurs : Tables & Auberges de France (catégories) ──────────────────────
INSERT INTO ref_classification_value (scheme_id, code, name, ordinal)
SELECT s.id, v.code, v.name, v.ordinal
FROM ref_classification_scheme s
JOIN (VALUES
  ('prestige',        'Prestige',             1),
  ('gastronomique',   'Gastronomique',        2),
  ('terroir',         'Terroir',              3),
  ('bistrot_gourmand','Bistrot gourmand',     4),
  ('auberge_village', 'Auberge de village',   5),
  ('hostellerie',     'Hostellerie',          6),
  ('producteur',      'Producteur / fermier', 7)
) AS v(code,name,ordinal) ON TRUE
WHERE s.code = 'tables_auberges'
  AND NOT EXISTS (SELECT 1 FROM ref_classification_value cv WHERE cv.scheme_id = s.id AND cv.code = v.code);

-- ─── Valeurs : Logis (cheminées hébergement + cocottes restauration, cumulables) ─
INSERT INTO ref_classification_value (scheme_id, code, name, ordinal)
SELECT s.id, v.code, v.name, v.ordinal
FROM ref_classification_scheme s
JOIN (VALUES
  ('cheminee_1','1 cheminée',1),('cheminee_2','2 cheminées',2),('cheminee_3','3 cheminées',3),
  ('cocotte_1','1 cocotte',4),  ('cocotte_2','2 cocottes',5),  ('cocotte_3','3 cocottes',6)
) AS v(code,name,ordinal) ON TRUE
WHERE s.code = 'logis'
  AND NOT EXISTS (SELECT 1 FROM ref_classification_value cv WHERE cv.scheme_id = s.id AND cv.code = v.code);

-- ─── QTIR « de Charme » : ajout d'une valeur au scheme régional existant ──────
-- qualite_tourisme_reunion porte déjà 'granted' ('Obtenu'). On ajoute la variante
-- « de Charme » (single, 2 valeurs) plutôt qu'un scheme séparé (cf. recherche §71).
INSERT INTO ref_classification_value (scheme_id, code, name, ordinal)
SELECT s.id, 'charme', 'QTIR de Charme', 2
FROM ref_classification_scheme s
WHERE s.code = 'qualite_tourisme_reunion'
  AND NOT EXISTS (SELECT 1 FROM ref_classification_value cv WHERE cv.scheme_id = s.id AND cv.code = 'charme');
