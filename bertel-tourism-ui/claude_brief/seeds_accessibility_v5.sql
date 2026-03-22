-- V5 accessibility seeds aligned to schema_unified.sql
-- CAT_ACCESS is translated into accessibility classifications + amenity references.
-- Editorial accessibility remains in object_description.description_adapted / object_place_description.description_adapted.
-- Room accessibility remains in object_room_type.is_accessible.

BEGIN;

-- 1) Official accessibility classification scheme
WITH src(code, name, description, selection, display_group, is_distinction, name_i18n) AS (
VALUES
  ('LBL_TOURISME_HANDICAP', 'Tourisme & Handicap', 'Label d''État dédié à l''accessibilité touristique, référentiels par filière.', 'single', 'accessibility_labels', TRUE, '{"fr": "Tourisme & Handicap"}'::jsonb)
)
INSERT INTO ref_classification_scheme (code, name, description, selection, display_group, is_distinction, name_i18n)
SELECT code, name, description, selection, display_group, is_distinction, name_i18n
FROM src
ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  selection = EXCLUDED.selection,
  display_group = EXCLUDED.display_group,
  is_distinction = EXCLUDED.is_distinction,
  name_i18n = EXCLUDED.name_i18n,
  updated_at = NOW();

WITH src(scheme_code, code, name, position, name_i18n, metadata) AS (
VALUES
  ('LBL_TOURISME_HANDICAP', 'granted', 'Titulaire Tourisme & Handicap', 1, '{"fr": "Titulaire Tourisme & Handicap"}'::jsonb, '{"kind": "label_status", "label_code": "LBL_TOURISME_HANDICAP"}'::jsonb)
)
INSERT INTO ref_classification_value (scheme_id, code, name, position, name_i18n, metadata)
SELECT s.id, src.code, src.name, src.position, src.name_i18n, src.metadata
FROM src
JOIN ref_classification_scheme s ON s.code = src.scheme_code
ON CONFLICT (scheme_id, code) DO UPDATE SET
  name = EXCLUDED.name,
  position = EXCLUDED.position,
  name_i18n = EXCLUDED.name_i18n,
  metadata = EXCLUDED.metadata,
  updated_at = NOW();

-- 2) Accessibility amenity family goes through ref_code / ref_code_amenity_family, not a custom family table.
INSERT INTO ref_code (domain, code, name, description, position, is_active, metadata, name_i18n, description_i18n)
SELECT 'amenity_family', 'accessibilite', 'Accessibilité',
       'Aménagements et aides d’accessibilité physiques ou de service.',
       900, TRUE,
       '{"seed": "v5", "source": "CAT_ACCESS"}'::jsonb,
       '{"fr": "Accessibilité"}'::jsonb,
       '{"fr": "Aménagements et aides d’accessibilité physiques ou de service."}'::jsonb
WHERE NOT EXISTS (
  SELECT 1 FROM ref_code_amenity_family WHERE code = 'accessibilite'
);

-- 3) Accessibility amenities extracted from CAT_ACCESS only when they map to tangible infrastructure/equipment/service aids
WITH family AS (
  SELECT id
  FROM ref_code_amenity_family
  WHERE code = 'accessibilite'
  LIMIT 1
), src(code, name, description, scope, name_i18n, description_i18n, extra) AS (
VALUES
  ('acc_braille_or_audio_docs', 'Documents braille ou audio', 'Version braille ou audio lorsque pertinent.', 'object', '{"fr": "Documents braille ou audio"}'::jsonb, '{"fr": "Version braille ou audio lorsque pertinent."}'::jsonb, '{"source_action_external_code": "MA_BRAILLE_OR_AUDIO", "source_group_code": "SA_ACCESSIBLE_DOCUMENTS", "accessibility_seed_v": "v5"}'::jsonb),
  ('acc_falc_docs', 'Documents en FALC', 'Documents en FALC.', 'object', '{"fr": "Documents en FALC"}'::jsonb, '{"fr": "Documents en FALC."}'::jsonb, '{"source_action_external_code": "MA_FALC_DOCS", "source_group_code": "SA_ACCESSIBLE_DOCUMENTS", "accessibility_seed_v": "v5"}'::jsonb),
  ('acc_large_print_docs', 'Documents en grands caractères', 'Documents en grands caractères.', 'object', '{"fr": "Documents en grands caractères"}'::jsonb, '{"fr": "Documents en grands caractères."}'::jsonb, '{"source_action_external_code": "MA_LARGE_PRINT_DOCS", "source_group_code": "SA_ACCESSIBLE_DOCUMENTS", "accessibility_seed_v": "v5"}'::jsonb),
  ('acc_braille_buttons', 'Boutons braille / relief', 'Boutons en relief ou braille.', 'object', '{"fr": "Boutons braille / relief"}'::jsonb, '{"fr": "Boutons en relief ou braille."}'::jsonb, '{"source_action_external_code": "MA_BRAILLE_BUTTONS", "source_group_code": "SA_ACCESSIBLE_LIFT", "accessibility_seed_v": "v5"}'::jsonb),
  ('acc_accessible_lift', 'Ascenseur accessible', 'Dimensions de cabine adaptées.', 'object', '{"fr": "Ascenseur accessible"}'::jsonb, '{"fr": "Dimensions de cabine adaptées."}'::jsonb, '{"source_action_external_code": "MA_LIFT_DIMENSIONS", "source_group_code": "SA_ACCESSIBLE_LIFT", "accessibility_seed_v": "v5"}'::jsonb),
  ('acc_visual_audio_announce', 'Annonces visuelles et sonores', 'Annonces visuelles et sonores présentes.', 'object', '{"fr": "Annonces visuelles et sonores"}'::jsonb, '{"fr": "Annonces visuelles et sonores présentes."}'::jsonb, '{"source_action_external_code": "MA_VISUAL_AUDIO_ANNOUNCE", "source_group_code": "SA_ACCESSIBLE_LIFT", "accessibility_seed_v": "v5"}'::jsonb),
  ('acc_contrast_menu', 'Menu contrasté', 'Menu contrasté et lisible.', 'object', '{"fr": "Menu contrasté"}'::jsonb, '{"fr": "Menu contrasté et lisible."}'::jsonb, '{"source_action_external_code": "MA_CONTRAST_MENU", "source_group_code": "SA_ACCESSIBLE_MENUS", "accessibility_seed_v": "v5"}'::jsonb),
  ('acc_large_print_menu', 'Menu grands caractères', 'Menu en grands caractères.', 'object', '{"fr": "Menu grands caractères"}'::jsonb, '{"fr": "Menu en grands caractères."}'::jsonb, '{"source_action_external_code": "MA_LARGE_PRINT_MENU", "source_group_code": "SA_ACCESSIBLE_MENUS", "accessibility_seed_v": "v5"}'::jsonb),
  ('acc_simplified_menu', 'Menu simplifié', 'Version simplifiée disponible.', 'object', '{"fr": "Menu simplifié"}'::jsonb, '{"fr": "Version simplifiée disponible."}'::jsonb, '{"source_action_external_code": "MA_SIMPLIFIED_MENU", "source_group_code": "SA_ACCESSIBLE_MENUS", "accessibility_seed_v": "v5"}'::jsonb),
  ('acc_pmr_signage', 'Signalétique parking PMR', 'Signalétique parking adaptée.', 'object', '{"fr": "Signalétique parking PMR"}'::jsonb, '{"fr": "Signalétique parking adaptée."}'::jsonb, '{"source_action_external_code": "MA_PMR_SIGNAGE", "source_group_code": "SA_ACCESSIBLE_PARKING", "accessibility_seed_v": "v5"}'::jsonb),
  ('acc_pmr_parking', 'Places PMR', 'Places PMR matérialisées.', 'object', '{"fr": "Places PMR"}'::jsonb, '{"fr": "Places PMR matérialisées."}'::jsonb, '{"source_action_external_code": "MA_PMR_SPACES", "source_group_code": "SA_ACCESSIBLE_PARKING", "accessibility_seed_v": "v5"}'::jsonb),
  ('acc_step_removal', 'Accès sans ressaut', 'Ressauts ou obstacles supprimés.', 'object', '{"fr": "Accès sans ressaut"}'::jsonb, '{"fr": "Ressauts ou obstacles supprimés."}'::jsonb, '{"source_action_external_code": "MA_STEP_REMOVAL", "source_group_code": "SA_ACCESSIBLE_PATHWAYS", "accessibility_seed_v": "v5"}'::jsonb),
  ('acc_tactile_guidance', 'Guidage tactile', 'Bandes ou guidage tactile installés.', 'object', '{"fr": "Guidage tactile"}'::jsonb, '{"fr": "Bandes ou guidage tactile installés."}'::jsonb, '{"source_action_external_code": "MA_TACTILE_GUIDANCE", "source_group_code": "SA_ACCESSIBLE_PATHWAYS", "accessibility_seed_v": "v5"}'::jsonb),
  ('acc_width_120cm', 'Cheminement 1,20 m', 'Largeur minimale respectée.', 'object', '{"fr": "Cheminement 1,20 m"}'::jsonb, '{"fr": "Largeur minimale respectée."}'::jsonb, '{"source_action_external_code": "MA_WIDTH_120CM", "source_group_code": "SA_ACCESSIBLE_PATHWAYS", "accessibility_seed_v": "v5"}'::jsonb),
  ('acc_lowered_counter', 'Comptoir abaissé', 'Partie de comptoir abaissée.', 'object', '{"fr": "Comptoir abaissé"}'::jsonb, '{"fr": "Partie de comptoir abaissée."}'::jsonb, '{"source_action_external_code": "MA_LOWERED_COUNTER", "source_group_code": "SA_ACCESSIBLE_RECEPTION", "accessibility_seed_v": "v5"}'::jsonb),
  ('acc_adapted_bed_height', 'Lit à hauteur adaptée', 'Lit à hauteur adaptée.', 'object', '{"fr": "Lit à hauteur adaptée"}'::jsonb, '{"fr": "Lit à hauteur adaptée."}'::jsonb, '{"source_action_external_code": "MA_ADAPTED_BED_HEIGHT", "source_group_code": "SA_ACCESSIBLE_ROOMS", "accessibility_seed_v": "v5"}'::jsonb),
  ('acc_room_clearance', 'Dégagements suffisants', 'Dégagements suffisants autour du lit.', 'object', '{"fr": "Dégagements suffisants"}'::jsonb, '{"fr": "Dégagements suffisants autour du lit."}'::jsonb, '{"source_action_external_code": "MA_ROOM_CLEARANCE", "source_group_code": "SA_ACCESSIBLE_ROOMS", "accessibility_seed_v": "v5"}'::jsonb),
  ('acc_adapted_toilet_height', 'WC à hauteur adaptée', 'Hauteur de WC adaptée.', 'object', '{"fr": "WC à hauteur adaptée"}'::jsonb, '{"fr": "Hauteur de WC adaptée."}'::jsonb, '{"source_action_external_code": "MA_ADAPTED_TOILET_HEIGHT", "source_group_code": "SA_ACCESSIBLE_SANITARY", "accessibility_seed_v": "v5"}'::jsonb),
  ('acc_grab_bars', 'Barres d’appui WC', 'Barres d’appui fixes installées.', 'object', '{"fr": "Barres d’appui WC"}'::jsonb, '{"fr": "Barres d’appui fixes installées."}'::jsonb, '{"source_action_external_code": "MA_GRAB_BARS", "source_group_code": "SA_ACCESSIBLE_SANITARY", "accessibility_seed_v": "v5"}'::jsonb),
  ('acc_turning_space', 'Espace de manœuvre', 'Espace de manœuvre suffisant.', 'object', '{"fr": "Espace de manœuvre"}'::jsonb, '{"fr": "Espace de manœuvre suffisant."}'::jsonb, '{"source_action_external_code": "MA_TURNING_SPACE", "source_group_code": "SA_ACCESSIBLE_SANITARY", "accessibility_seed_v": "v5"}'::jsonb),
  ('acc_grab_bar_shower', 'Barres d’appui douche', 'Barres d’appui en douche installées.', 'object', '{"fr": "Barres d’appui douche"}'::jsonb, '{"fr": "Barres d’appui en douche installées."}'::jsonb, '{"source_action_external_code": "MA_GRAB_BAR_SHOWER", "source_group_code": "SA_ACCESSIBLE_SHOWER", "accessibility_seed_v": "v5"}'::jsonb),
  ('acc_shower_seat', 'Siège de douche', 'Siège de douche stable disponible.', 'object', '{"fr": "Siège de douche"}'::jsonb, '{"fr": "Siège de douche stable disponible."}'::jsonb, '{"source_action_external_code": "MA_SHOWER_SEAT", "source_group_code": "SA_ACCESSIBLE_SHOWER", "accessibility_seed_v": "v5"}'::jsonb),
  ('acc_walk_in_shower', 'Douche plain-pied', 'Douche de plain-pied installée.', 'object', '{"fr": "Douche plain-pied"}'::jsonb, '{"fr": "Douche de plain-pied installée."}'::jsonb, '{"source_action_external_code": "MA_WALK_IN_SHOWER", "source_group_code": "SA_ACCESSIBLE_SHOWER", "accessibility_seed_v": "v5"}'::jsonb),
  ('acc_contrast_signage', 'Signalétique contrastée', 'Contrastes visuels respectés.', 'object', '{"fr": "Signalétique contrastée"}'::jsonb, '{"fr": "Contrastes visuels respectés."}'::jsonb, '{"source_action_external_code": "MA_CONTRAST_SIGNAGE", "source_group_code": "SA_ACCESSIBLE_SIGNAGE", "accessibility_seed_v": "v5"}'::jsonb),
  ('acc_pictograms_used', 'Pictogrammes accessibles', 'Pictogrammes cohérents utilisés.', 'object', '{"fr": "Pictogrammes accessibles"}'::jsonb, '{"fr": "Pictogrammes cohérents utilisés."}'::jsonb, '{"source_action_external_code": "MA_PICTOGRAMS_USED", "source_group_code": "SA_ACCESSIBLE_SIGNAGE", "accessibility_seed_v": "v5"}'::jsonb),
  ('acc_readable_height', 'Signalétique à bonne hauteur', 'Hauteur et lisibilité adaptées.', 'object', '{"fr": "Signalétique à bonne hauteur"}'::jsonb, '{"fr": "Hauteur et lisibilité adaptées."}'::jsonb, '{"source_action_external_code": "MA_READABLE_HEIGHT", "source_group_code": "SA_ACCESSIBLE_SIGNAGE", "accessibility_seed_v": "v5"}'::jsonb),
  ('acc_hearing_signage', 'Signalétique aide auditive', 'Signalisation du dispositif.', 'object', '{"fr": "Signalétique aide auditive"}'::jsonb, '{"fr": "Signalisation du dispositif."}'::jsonb, '{"source_action_external_code": "MA_HEARING_SIGNAGE", "source_group_code": "SA_HEARING_ASSISTANCE", "accessibility_seed_v": "v5"}'::jsonb),
  ('acc_magnetic_loop', 'Boucle magnétique', 'Boucle à induction installée.', 'object', '{"fr": "Boucle magnétique"}'::jsonb, '{"fr": "Boucle à induction installée."}'::jsonb, '{"source_action_external_code": "MA_MAGNETIC_LOOP", "source_group_code": "SA_HEARING_ASSISTANCE", "accessibility_seed_v": "v5"}'::jsonb),
  ('acc_flash_alarms', 'Alarmes flash', 'Alarmes lumineuses disponibles.', 'object', '{"fr": "Alarmes flash"}'::jsonb, '{"fr": "Alarmes lumineuses disponibles."}'::jsonb, '{"source_action_external_code": "MA_FLASH_ALARMS", "source_group_code": "SA_MULTISENSORY_SAFETY", "accessibility_seed_v": "v5"}'::jsonb),
  ('acc_vibrating_alarms', 'Alarmes vibrantes', 'Dispositifs vibrants disponibles.', 'object', '{"fr": "Alarmes vibrantes"}'::jsonb, '{"fr": "Dispositifs vibrants disponibles."}'::jsonb, '{"source_action_external_code": "MA_VIBRATING_ALARMS", "source_group_code": "SA_MULTISENSORY_SAFETY", "accessibility_seed_v": "v5"}'::jsonb),
  ('acc_audio_description', 'Audiodescription', 'Audiodescription proposée.', 'object', '{"fr": "Audiodescription"}'::jsonb, '{"fr": "Audiodescription proposée."}'::jsonb, '{"source_action_external_code": "MA_AUDIO_DESCRIPTION", "source_group_code": "SA_SUBTITLE_AUDIO_DESC", "accessibility_seed_v": "v5"}'::jsonb),
  ('acc_subtitles', 'Sous-titrage', 'Sous-titrage des contenus.', 'object', '{"fr": "Sous-titrage"}'::jsonb, '{"fr": "Sous-titrage des contenus."}'::jsonb, '{"source_action_external_code": "MA_SUBTITLES", "source_group_code": "SA_SUBTITLE_AUDIO_DESC", "accessibility_seed_v": "v5"}'::jsonb),
  ('acc_visit_device', 'Aide de visite accessible', 'Dispositifs d’aide de visite disponibles.', 'object', '{"fr": "Aide de visite accessible"}'::jsonb, '{"fr": "Dispositifs d’aide de visite disponibles."}'::jsonb, '{"source_action_external_code": "MA_VISIT_DEVICE", "source_group_code": "SA_SUBTITLE_AUDIO_DESC", "accessibility_seed_v": "v5"}'::jsonb)
)
INSERT INTO ref_amenity (code, name, family_id, scope, description, name_i18n, description_i18n, extra)
SELECT src.code, src.name, family.id, src.scope, src.description, src.name_i18n, src.description_i18n, src.extra
FROM src
CROSS JOIN family
ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name,
  family_id = EXCLUDED.family_id,
  scope = EXCLUDED.scope,
  description = EXCLUDED.description,
  name_i18n = EXCLUDED.name_i18n,
  description_i18n = EXCLUDED.description_i18n,
  extra = EXCLUDED.extra,
  updated_at = NOW();

COMMIT;
