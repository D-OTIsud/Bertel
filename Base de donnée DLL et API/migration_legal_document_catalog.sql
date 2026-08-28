-- migration_legal_document_catalog.sql
-- §209 (2026-08-07) — Catalogue des documents juridiques réellement demandés aux prestataires.
--
-- CONTEXTE (signalement PO) : le catalogue `ref_legal_type` livré à l'origine portait 12 types de
-- « documents » génériques largement inventés (Licence d'hébergement, Assurance cyber, Gestion des
-- déchets…) qu'aucun prestataire ne fournit jamais. Mesuré avant écriture : sur toute la base,
-- `object_legal` ne portait que 5 lignes (siret ×2, siren ×2, liability_insurance ×1) — le catalogue
-- était donc quasi vierge et restructurable sans perte.
--
-- CE QUE FAIT CETTE MIGRATION
--   (1) Renomme 2 types dont la pièce réelle existe mais sous un autre nom — le RENAME préserve l'`id`,
--       donc les lignes `object_legal` déjà rattachées SUIVENT (aucune donnée perdue) :
--         liability_insurance      → attestation_assurance         (terme employé par l'OTI ; porte la
--                                                                   ligne live de LOIRUN00000001C5)
--         tourism_license          → immatriculation_atout_france  (la « licence tourisme » n'existe plus
--                                                                   depuis 2009 : la pièce est
--                                                                   l'immatriculation au registre des
--                                                                   opérateurs de voyages)
--   (2) Réétiquette les 2 types ERP conservés (`fire_safety`, `accessibility`) — obligations réelles,
--       couvertes par aucun des documents de la liste PO.
--   (3) Supprime les 8 types restants, FAIL-CLOSED : si l'un d'eux porte encore une ligne
--       `object_legal`, la migration ÉCHOUE plutôt que de casser une FK ou de perdre une saisie.
--   (4) Installe les 11 documents manquants de la liste PO (SIRENE, KBIS, CERFA meublé, CERFA chambre
--       d'hôtes, permis d'exploitation, diplôme, carte professionnelle, licence restaurant, récépissé
--       mairie, extrait INPI, statuts association).
--   (5) AJOUT ULTÉRIEUR (2026-08-28, lot de corrections chantier 2, demande PO) : `courrier_fermeture`,
--       16e document et seule pièce de SORTIE du catalogue. La ligne vit ICI (et non dans la seule
--       migration 17a) parce que la garde de convergence ci-dessous compte le catalogue À CE POINT
--       du manifeste : si la ligne n'était installée qu'après, une base fraîche échouerait ici.
--       `migration_legal_type_courrier_fermeture.sql` (17a) porte la même ligne pour la base LIVE,
--       qui a déjà joué cette migration dans sa version à 15 documents.
--
-- ARBITRAGES PO (2026-08-07)
--   * `is_required = false` sur TOUS les documents : l'obligation dépend de la situation du prestataire
--     (meublé ≠ association ≠ restaurant), aucun document n'est universellement requis. La pastille
--     rouge « Document obligatoire expiré » de l'éditeur §18 devient donc dormante ; le drapeau
--     d'expiration par ligne (Expiré / Expire bientôt) reste actif, il ne dépend pas de is_required.
--   * `is_public = false` sur TOUS les documents : pièces administratives, jamais diffusées par l'API
--     partenaire ni le site public. Les codes d'IDENTITÉ (siret/siren/tourist_tax) gardent leur
--     visibilité publique arbitrée le 2026-07-31 et ne sont PAS touchés ici.
--
-- HORS PÉRIMÈTRE : les 5 codes d'identité (siret, siren, raison_sociale, vat_number, tourist_tax) —
-- ils alimentent les champs plats de l'éditeur §18 (LEGAL_IDENTITY_TYPE_CODES) et ne sont pas des
-- documents. Seule exception : la dérive live↔source sur `siren.is_required` (voir bloc 0).
--
-- PRÉREQUIS : `ref_legal_type` + `object_legal` (schema_unified.sql).
-- FOLDÉ dans `schema_unified.sql` (bloc « Insert common legal types ») ⇒ **no-op sur une base fraîche**.
-- IDEMPOTENT : renames sans effet au 2e passage, upserts convergents, DELETE sur un ensemble déjà vide.

BEGIN;

-- =====================================================
-- 0. Dérive live↔source (hors périmètre documents, 1 ligne)
--    `migration_legal_siret_canonical.sql` pose déjà is_required=false sur `siren` (le SIREN est
--    dérivable du SIRET, il n'est jamais exigé en propre) ; la base live portait encore `true`.
-- =====================================================
UPDATE ref_legal_type SET is_required = false WHERE code = 'siren' AND is_required IS DISTINCT FROM false;

-- =====================================================
-- 1. Renommages porteurs (l'id est préservé ⇒ les lignes object_legal suivent)
-- =====================================================
UPDATE ref_legal_type SET code = 'attestation_assurance'         WHERE code = 'liability_insurance';
UPDATE ref_legal_type SET code = 'immatriculation_atout_france'  WHERE code = 'tourism_license';

-- =====================================================
-- 2. Retrait des types génériques inutilisés — FAIL-CLOSED
--    Un type encore porteur d'une ligne object_legal fait échouer la migration : mieux vaut un
--    déploiement rouge qu'une saisie effacée ou une FK RESTRICT violée en fin de transaction.
-- =====================================================
DO $$
DECLARE
  v_retired TEXT[] := ARRAY[
    'business_license',       -- vague ; couvert par permis_exploitation / licence_restaurant
    'accommodation_license',  -- n'existe pas en droit français ; couvert par les 2 CERFA
    'safety_certificate',     -- doublon vague de fire_safety
    'property_insurance',     -- couvert par attestation_assurance
    'cyber_insurance',        -- hors périmètre d'un OTI
    'waste_management',       -- inventé, jamais demandé à un prestataire touristique
    'environmental_permit',   -- procédure ICPE/IOTA industrielle, sans objet ici
    'guide_license'           -- = carte_professionnelle (guide-conférencier)
  ];
  v_blocked TEXT;
BEGIN
  SELECT string_agg(t.code, ', ' ORDER BY t.code) INTO v_blocked
  FROM ref_legal_type t
  WHERE t.code = ANY(v_retired)
    AND EXISTS (SELECT 1 FROM object_legal ol WHERE ol.type_id = t.id);

  IF v_blocked IS NOT NULL THEN
    RAISE EXCEPTION
      'migration_legal_document_catalog: suppression annulee, ces types portent encore des lignes object_legal: %. Reaffecter ces lignes avant de rejouer.',
      v_blocked;
  END IF;

  DELETE FROM ref_legal_type WHERE code = ANY(v_retired);
END $$;

-- =====================================================
-- 3. Catalogue cible des DOCUMENTS juridiques (16 types : 15 §209 + courrier_fermeture 2026-08-28)
--    Convergent : DO UPDATE réaligne libellé/description/catégorie/drapeaux sur une base déjà seedée
--    (c'est ce qui réétiquette fire_safety/accessibility et finalise les 2 renommages du bloc 1).
--    `review_interval_days` = périodicité indicative de re-demande, pas une règle bloquante.
-- =====================================================
INSERT INTO ref_legal_type (code, name, description, category, is_required, is_public, review_interval_days) VALUES
  -- Existence juridique de l'exploitant -------------------------------------------------
  ('avis_situation_sirene', 'Avis de situation au répertoire SIRENE',
   'Attestation INSEE d''inscription au répertoire SIRENE. Justificatif d''existence le plus universel : accepté pour tout exploitant immatriculé (entreprise individuelle, micro-entrepreneur, société, association employeuse). Demandé de moins de 3 mois.',
   'business', false, false, 90),
  ('kbis', 'Extrait KBIS',
   'Extrait d''immatriculation au registre du commerce et des sociétés — carte d''identité des sociétés et commerçants. Demandé de moins de 3 mois. Ne concerne PAS les associations (statuts) ni les professions libérales (extrait INPI / avis SIRENE).',
   'business', false, false, 90),
  ('extrait_inpi', 'Extrait INPI',
   'Extrait du registre national des entreprises (INPI), guichet unique depuis 2023. Équivalent du KBIS pour les exploitants non inscrits au RCS : artisans, agriculteurs, professions libérales. Demandé de moins de 3 mois.',
   'business', false, false, 90),
  ('statuts_association', 'Statuts d''association',
   'Statuts déposés de l''association loi 1901 exploitante, accompagnés le cas échéant du récépissé de déclaration en préfecture. Pièce d''existence des exploitants associatifs, en lieu et place du KBIS.',
   'business', false, false, NULL),

  -- Déclaration d'hébergement -----------------------------------------------------------
  ('cerfa_meuble_tourisme', 'CERFA de déclaration de meublé de tourisme',
   'Déclaration en mairie d''un meublé de tourisme (CERFA 14004). Obligatoire pour toute location saisonnière de logement meublé. À rapprocher du récépissé de déclaration en mairie, qui en accuse le dépôt.',
   'accommodation', false, false, NULL),
  ('cerfa_chambre_hotes', 'CERFA de déclaration de chambre d''hôtes',
   'Déclaration en mairie d''une activité de chambres d''hôtes (CERFA 13566). Obligatoire dès la première chambre ; distincte de la déclaration de meublé de tourisme.',
   'accommodation', false, false, NULL),
  ('recepisse_declaration_mairie', 'Récépissé de déclaration en mairie',
   'Accusé de réception délivré par la commune à la suite d''une déclaration (meublé de tourisme, chambres d''hôtes, occupation du domaine public…). Preuve que la déclaration a bien été déposée.',
   'accommodation', false, false, NULL),

  -- Restauration / débit de boissons ----------------------------------------------------
  ('permis_exploitation', 'Permis d''exploitation',
   'Attestation de la formation obligatoire préalable à l''exploitation d''un débit de boissons ou d''un établissement de restauration servant de l''alcool. Valable 10 ans.',
   'restauration', false, false, 3650),
  ('licence_restaurant', 'Licence restaurant',
   'Licence de débit de boissons à consommer sur place attachée au service des repas (petite licence restaurant ou licence restaurant). Délivrée après déclaration en mairie ; attachée à l''établissement.',
   'restauration', false, false, NULL),

  -- Encadrement d'activité --------------------------------------------------------------
  ('diplome_activite', 'Diplôme d''activité',
   'Diplôme ou titre professionnel autorisant l''encadrement contre rémunération de l''activité proposée (BPJEPS, DEJEPS, BEES, brevet fédéral reconnu…). Une pièce par activité encadrée.',
   'activite', false, false, NULL),
  ('carte_professionnelle', 'Carte professionnelle',
   'Carte professionnelle en cours de validité : guide-conférencier, moniteur, agent immobilier (loi Hoguet, pour les intermédiaires de location)… Précise la profession concernée dans la référence.',
   'activite', false, false, NULL),
  ('immatriculation_atout_france', 'Immatriculation Atout France',
   'Immatriculation au registre des opérateurs de voyages et de séjours tenu par Atout France, exigée dès qu''un prestataire vend un forfait ou combine plusieurs prestations. Remplace depuis 2009 l''ancienne « licence tourisme ». Renouvellement triennal.',
   'activite', false, false, 1095),

  -- Assurance ---------------------------------------------------------------------------
  ('attestation_assurance', 'Attestation d''assurance',
   'Attestation d''assurance en cours de validité couvrant l''activité : responsabilité civile professionnelle, et le cas échéant multirisque de l''établissement. Pièce demandée à tout prestataire, quelle que soit sa situation. Renouvellement annuel.',
   'insurance', false, false, 365),

  -- Établissement recevant du public ----------------------------------------------------
  ('fire_safety', 'Attestation de sécurité incendie (ERP)',
   'Attestation ou procès-verbal de la commission de sécurité pour un établissement recevant du public. Périodicité de visite variable selon la catégorie et le type d''ERP.',
   'erp', false, false, 365),
  ('accessibility', 'Attestation d''accessibilité (ERP)',
   'Attestation d''accessibilité d''un établissement recevant du public, ou agenda d''accessibilité programmée (Ad''AP). Distincte du label Tourisme & Handicap, qui est une distinction volontaire saisie en §10.',
   'erp', false, false, 1095),

  -- Cycle de vie de l'établissement -----------------------------------------------------
  -- Ajout du 2026-08-28 (lot de corrections, chantier 2 — demande PO). Seule pièce de SORTIE du
  -- catalogue : le §18 devient le porte-documents administratif de la fiche, entrée ET sortie.
  ('courrier_fermeture', 'Courrier de fermeture',
   'Courrier attestant la fermeture de l''établissement (cessation d''activité, fermeture administrative ou définitive). À joindre lorsqu''une fiche est retirée de la diffusion : il documente la date d''effet et l''origine de la décision.',
   'business', false, false, NULL)
ON CONFLICT (code) DO UPDATE SET
  name                 = EXCLUDED.name,
  description          = EXCLUDED.description,
  category             = EXCLUDED.category,
  is_required          = EXCLUDED.is_required,
  is_public            = EXCLUDED.is_public,
  review_interval_days = EXCLUDED.review_interval_days,
  updated_at           = NOW();

-- =====================================================
-- 4. Garde de convergence — le catalogue doit valoir exactement 5 identités + 16 documents
-- =====================================================
DO $$
DECLARE
  v_docs INTEGER;
  v_leftovers TEXT;
BEGIN
  SELECT count(*) INTO v_docs
  FROM ref_legal_type
  WHERE code NOT IN ('siret', 'siren', 'raison_sociale', 'vat_number', 'tourist_tax');

  -- 15 documents §209 (2026-08-07) + 1 ajouté le 2026-08-28 (courrier_fermeture, manifeste 17a).
  IF v_docs <> 16 THEN
    RAISE EXCEPTION 'migration_legal_document_catalog: % types de documents apres convergence, 16 attendus.', v_docs;
  END IF;

  SELECT string_agg(code, ', ' ORDER BY code) INTO v_leftovers
  FROM ref_legal_type
  WHERE code NOT IN ('siret', 'siren', 'raison_sociale', 'vat_number', 'tourist_tax')
    AND (is_required IS DISTINCT FROM false OR is_public IS DISTINCT FROM false);

  IF v_leftovers IS NOT NULL THEN
    RAISE EXCEPTION 'migration_legal_document_catalog: documents encore obligatoires ou publics: %', v_leftovers;
  END IF;
END $$;

COMMIT;
