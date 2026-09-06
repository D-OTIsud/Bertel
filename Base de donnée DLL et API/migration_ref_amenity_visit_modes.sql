-- migration_ref_amenity_visit_modes.sql
-- Créneau 18b — arbitrage PO du 2026-09-03.
--
-- POURQUOI. L'éditeur (§06 BlockVIS.tsx + VISIT_MODE_CODES dans
-- src/features/object-editor/editor-completion.ts) écrit depuis sa mise en service trois codes
-- d'équipement — visite_libre / visite_guidee / audioguide — qui n'ont JAMAIS existé dans
-- ref_amenity, ni en production ni dans les seeds (vérifié en base : une recherche ILIKE sur
-- %visit%/%guid%/%audio%/%tour% + %visite%/%guid%/%audio% ne remonte QUE des codes de la
-- famille accessibility — acc_audio_description, acc_flexible_visit, acc_visit_device,
-- acc_sign_language, acc_tactile_guidance, acc_braille_or_audio_docs, acc_guide_dog_welcome,
-- acc_visual_audio_announce — plus boutique/tour_desk : aucun « mode de visite »).
--
-- L'IMPACT N'EST PAS UN ORPHELINAT DE DONNÉES SILENCIEUX, C'EST UN BLOCAGE DE SAUVEGARDE.
-- object_amenity.amenity_id est une FK NOT NULL -> ref_amenity(id) ON DELETE CASCADE, et le
-- bras 'amenities' du RPC d'écriture (object_workspace_safe_write_rpcs.sql) résout chaque code
-- AVANT d'écrire : `v_id := internal.workspace_uuid(v_row->>'amenity_id'); IF v_id IS NULL THEN
-- SELECT id INTO v_id FROM ref_amenity WHERE lower(code) = lower(v_row->>'amenity_code'); END
-- IF; IF v_id IS NULL THEN RAISE EXCEPTION 'Unknown amenity reference: %' USING ERRCODE =
-- '23503'; END IF;`. Comme le module 'characteristics' est à écriture groupée (amenities +
-- moyens de paiement + tags environnement dans le MÊME payload — règle §48 single-owner,
-- cf. le commentaire de BlockVIS.tsx sur §13/§14), cocher UN SEUL de ces trois boutons dans §06
-- et sauvegarder faisait échouer LA SAUVEGARDE ENTIÈRE de la fiche VIS, pas seulement la
-- rubrique Visite. Vérifié en base (jointe object_amenity -> ref_amenity) : 0 ligne ne
-- référence ces 3 codes aujourd'hui — c'est attendu, pas une coïncidence : la garde 23503 rend
-- structurellement impossible qu'une telle ligne existe. Ce seed ne nettoie donc pas un
-- orphelinat relationnel, il DÉBLOQUE le chemin de sauvegarde : toute session d'édition qui
-- aurait coché un de ces modes depuis la mise en service de BlockVIS n'a jamais pu persister
-- quoi que ce soit d'autre dans le même geste.
--
-- FAMILLE : `visit_mediation` (NEUVE), PAS `accessibility`. Ce sont des MODES DE VISITE
-- (comment le visiteur parcourt le site), pas des AIDES D'ACCESSIBILITÉ : le catalogue porte
-- déjà ce rôle-là sous des codes acc_* dédiés et distincts (acc_flexible_visit = rythme
-- adaptable sur demande, acc_visit_device = dispositif d'aide de visite accessible). Les
-- ranger sous accessibility fausserait le filtre public d'accessibilité, qui ne lit QUE cette
-- famille-là (cf. nonAccessibilityAmenityCount() dans editor-completion.ts, qui EXCLUT
-- explicitement `accessibility` du calcul de complétude §06 — la réciproque doit rester vraie :
-- rien qui n'est PAS une aide d'accessibilité ne doit s'y trouver). Les 20 autres familles
-- existantes ne conviennent pas davantage : `services` (bureau d'excursions, conciergerie,
-- pressing…) et `entertainment` (jeux de société, bibliothèque…) sont un fourre-tout
-- hôtelier/loisirs, pas la médiation d'un site de visite patrimonial/muséal. Aucune des 21
-- familles au catalogue ne porte ce concept ⇒ ce fichier en crée une nouvelle,
-- `visit_mediation`, nommée d'après le sous-titre §06 de l'éditeur lui-même
-- (« Modes de visite et équipements de médiation »).
--
-- CONVENTIONS REPRODUITES (seeds_data.sql, bloc B-3/B-4 « Famille amenity accessibility ») :
-- la famille est semée par un INSERT minimal dans ref_code (domain='amenity_family',
-- ON CONFLICT DO NOTHING) — 20 des 21 familles existantes suivent cette forme à 4 colonnes,
-- seule `accessibility` porte un metadata enrichi (non repris ici : pas de justification à
-- alourdir une famille à 3 membres). Les équipements sont semés par un WITH family AS (...)
-- INSERT ... ON CONFLICT (code) DO UPDATE SET ... — le patron exact des 43 codes acc_*.
-- scope='object' (un mode de visite est une propriété de l'objet visité, jamais d'une chambre
-- — comme la totalité des 113 lignes scope='object' existantes, jamais 'both'/'meeting_room').
-- position laissée NULL : convention des familles/équipements ajoutés APRÈS la passe de tri
-- par popularité réelle (migration_amenity_popularity_order.sql, §73) — business/comforts/
-- equipment/family/sustainable et tous leurs membres portent déjà position=NULL pour cette
-- même raison ; une famille neuve à 0 usage n'a rien à déclarer dans un classement mesuré sur
-- l'usage vécu.
--
-- IDEMPOTENT : ON CONFLICT DO NOTHING (famille, code UNIQUE via la contrainte de partition
-- ref_code_amenity_family_pkey (id,domain) + l'unicité fonctionnelle du code au sein du domaine
-- amenity_family) / ON CONFLICT (code) DO UPDATE (équipements, ref_amenity_code_key). Rejouable
-- sans erreur ni doublon. Aucun DROP : rien n'est recréé dans ce fichier, donc aucune collision
-- de la classe Task 7 (DROP incomplet) n'est possible ici.
\set ON_ERROR_STOP on

-- 1) Famille « Médiation de visite » (amenity_family), si absente.
INSERT INTO ref_code (domain, code, name, description) VALUES
  ('amenity_family', 'visit_mediation', 'Médiation de visite',
   'Modes de visite et dispositifs de médiation proposés aux visiteurs d''un site (visite libre, visite guidée, audioguide...) — distincte des AIDES d''accessibilité (famille accessibility).')
ON CONFLICT DO NOTHING;

-- 2) Les trois équipements déjà écrits par l'éditeur (VISIT_MODE_CODES / BlockVIS §06).
WITH family AS (
  SELECT id FROM ref_code_amenity_family WHERE code = 'visit_mediation' LIMIT 1
), src(code, name, description, name_i18n, description_i18n) AS (
VALUES
  ('visite_libre', 'Visite libre',
   'Visite en autonomie, sans accompagnement ni support audio dédié.',
   '{"fr": "Visite libre"}'::jsonb,
   '{"fr": "Visite en autonomie, sans accompagnement ni support audio dédié."}'::jsonb),
  ('visite_guidee', 'Visite guidée',
   'Visite accompagnée par un guide, généralement sur réservation.',
   '{"fr": "Visite guidée"}'::jsonb,
   '{"fr": "Visite accompagnée par un guide, généralement sur réservation."}'::jsonb),
  ('audioguide', 'Audioguide',
   'Support audio de visite mis à disposition (dispositif physique ou application).',
   '{"fr": "Audioguide"}'::jsonb,
   '{"fr": "Support audio de visite mis à disposition (dispositif physique ou application)."}'::jsonb)
)
INSERT INTO ref_amenity (code, name, family_id, scope, description, name_i18n, description_i18n)
SELECT src.code, src.name, family.id, 'object', src.description, src.name_i18n, src.description_i18n
FROM src
CROSS JOIN family
ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name,
  family_id = EXCLUDED.family_id,
  scope = EXCLUDED.scope,
  description = EXCLUDED.description,
  name_i18n = EXCLUDED.name_i18n,
  description_i18n = EXCLUDED.description_i18n,
  updated_at = NOW();

-- 3) Garde interne fail-closed (miroir de la garde disability_types de seeds_data.sql) : les
-- trois codes doivent exister, dans la bonne famille, avant de rendre la main — un seed muet
-- (JOIN sans correspondance, famille mal orthographiée) ne doit jamais réussir en silence.
DO $$
DECLARE
  v_missing INTEGER;
BEGIN
  SELECT count(*) INTO v_missing
  FROM (VALUES ('visite_libre'), ('visite_guidee'), ('audioguide')) AS expected(code)
  WHERE NOT EXISTS (
    SELECT 1
    FROM ref_amenity ra
    JOIN ref_code_amenity_family fam ON fam.id = ra.family_id
    WHERE ra.code = expected.code AND fam.code = 'visit_mediation'
  );
  IF v_missing > 0 THEN
    RAISE EXCEPTION 'migration_ref_amenity_visit_modes: % code(s) manquant(s) ou mal-famillé(s) (attendu : famille visit_mediation)', v_missing;
  END IF;
END;
$$;
