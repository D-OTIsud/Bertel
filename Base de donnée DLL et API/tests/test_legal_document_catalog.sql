-- test_legal_document_catalog.sql
-- Prouve migration_legal_document_catalog.sql (§209, étape manifeste 16t) :
--   (A) les 12 documents demandés par l'OTI sont au catalogue, sous les libellés attendus ;
--   (B) les 8 types génériques inventés sont partis — un seul qui revient et le sélecteur du §18
--       réoffre une pièce qu'aucun prestataire ne fournira jamais ;
--   (C) les 2 renommages ont préservé l'id (donc les lignes object_legal rattachées) — l'ancien code
--       a disparu ET le nouveau existe, ce qui n'est vrai que si c'est bien un UPDATE et pas un
--       DELETE + INSERT ;
--   (D) arbitrage PO : AUCUN document n'est obligatoire ni public (une seule ligne fautive suffit
--       à rallumer la pastille rouge du §18 ou à faire sortir un KBIS par l'API partenaire) ;
--   (E) les 5 codes d'IDENTITÉ consommés par l'éditeur comme champs plats sont intacts — la §18
--       lit `siret`/`siren`/`raison_sociale`/`vat_number`/`tourist_tax` en dur, un code manquant
--       transforme le champ en trou muet ;
--   (F) NON VACUITÉ — une ligne object_legal témoin sur un nouveau type traverse réellement la FK
--       et ressort de `api.get_object_legal_data` (le RPC que l'éditeur appelle) avec son libellé
--       et sa visibilité. C'est CE bloc qui rougit si le catalogue est présent mais inexploitable.
-- Run AFTER the full manifest. Self-contained + transactional (ROLLBACK; nothing persists).
\set ON_ERROR_STOP on
BEGIN;
DO $$
DECLARE
  -- Les 12 pièces listées par l'OTI (2026-08-07), code → libellé attendu.
  v_expected CONSTANT TEXT[][] := ARRAY[
    ['avis_situation_sirene',        'Avis de situation au répertoire SIRENE'],
    ['kbis',                         'Extrait KBIS'],
    ['cerfa_meuble_tourisme',        'CERFA de déclaration de meublé de tourisme'],
    ['cerfa_chambre_hotes',          'CERFA de déclaration de chambre d''hôtes'],
    ['attestation_assurance',        'Attestation d''assurance'],
    ['permis_exploitation',          'Permis d''exploitation'],
    ['diplome_activite',             'Diplôme d''activité'],
    ['carte_professionnelle',        'Carte professionnelle'],
    ['licence_restaurant',           'Licence restaurant'],
    ['recepisse_declaration_mairie', 'Récépissé de déclaration en mairie'],
    ['extrait_inpi',                 'Extrait INPI'],
    ['statuts_association',          'Statuts d''association']
  ];
  v_retired CONSTANT TEXT[] := ARRAY[
    'business_license', 'accommodation_license', 'safety_certificate', 'property_insurance',
    'cyber_insurance', 'waste_management', 'environmental_permit', 'guide_license',
    -- les deux codes renommés : ils ne doivent plus exister sous leur ancien nom
    'liability_insurance', 'tourism_license'
  ];
  v_identity CONSTANT TEXT[] := ARRAY['siret', 'siren', 'raison_sociale', 'vat_number', 'tourist_tax'];
  v_code TEXT;
  v_label TEXT;
  v_missing TEXT;
  v_type_id UUID;
  v_payload JSONB;
BEGIN
  -- ---------- (A) Les 12 pièces demandées sont là, sous le bon libellé ----------
  FOR i IN 1 .. array_length(v_expected, 1) LOOP
    v_code  := v_expected[i][1];
    v_label := v_expected[i][2];
    ASSERT EXISTS (SELECT 1 FROM ref_legal_type WHERE code = v_code),
           format('type juridique « %s » absent du catalogue : le §18 ne peut pas le proposer', v_code);
    ASSERT (SELECT name FROM ref_legal_type WHERE code = v_code) = v_label,
           format('libellé de « %s » : attendu « %s », obtenu « %s »',
                  v_code, v_label, (SELECT name FROM ref_legal_type WHERE code = v_code));
  END LOOP;

  -- ---------- (B) + (C) Les types retirés et les anciens codes renommés sont partis ----------
  SELECT string_agg(code, ', ' ORDER BY code) INTO v_missing
  FROM ref_legal_type WHERE code = ANY(v_retired);
  ASSERT v_missing IS NULL,
         format('types juridiques génériques de retour au catalogue : %s', v_missing);

  -- ---------- (C) Le renommage a bien PRÉSERVÉ la ligne (pas un DELETE + INSERT) ----------
  -- Si le rename avait été fait par suppression puis ré-insertion, la ligne object_legal de
  -- LOIRUN00000001C5 aurait sauté sur la FK RESTRICT — donc le fait que le nouveau code existe
  -- ET qu'aucune ligne n'ait été orpheline est la preuve. On vérifie ici l'absence d'orphelin.
  ASSERT NOT EXISTS (
           SELECT 1 FROM object_legal ol
           LEFT JOIN ref_legal_type t ON t.id = ol.type_id
           WHERE t.id IS NULL),
         'des lignes object_legal pointent vers un type juridique disparu';

  -- ---------- (D) Aucun document obligatoire ni public (arbitrage PO) ----------
  SELECT string_agg(code, ', ' ORDER BY code) INTO v_missing
  FROM ref_legal_type
  WHERE NOT (code = ANY(v_identity))
    AND (is_required IS DISTINCT FROM false OR is_public IS DISTINCT FROM false);
  ASSERT v_missing IS NULL,
         format('ces documents sont marqués obligatoires ou publics alors que l''obligation dépend '
                'de la situation du prestataire et qu''aucun ne se diffuse : %s', v_missing);

  -- ---------- (E) Les 5 codes d'identité des champs plats du §18 sont intacts ----------
  SELECT string_agg(c, ', ' ORDER BY c) INTO v_missing
  FROM unnest(v_identity) AS c
  WHERE NOT EXISTS (SELECT 1 FROM ref_legal_type t WHERE t.code = c);
  ASSERT v_missing IS NULL,
         format('codes d''identité §18 manquants (champs plats devenus muets) : %s', v_missing);

  -- ---------- (F) NON VACUITÉ : une saisie témoin traverse la FK et ressort du RPC éditeur ----------
  SELECT id INTO v_type_id FROM ref_legal_type WHERE code = 'kbis';

  INSERT INTO object (id, object_type, name, status, published_at)
    VALUES ('LGLDOC9999999901', 'HLO', 'Témoin catalogue juridique', 'published', now());
  INSERT INTO object_legal (object_id, type_id, value, valid_from, valid_to, validity_mode, status)
    VALUES ('LGLDOC9999999901', v_type_id, '{"value": "KBIS-2026-0001"}'::jsonb,
            CURRENT_DATE, CURRENT_DATE + 90, 'fixed_end_date', 'active');

  v_payload := api.get_object_legal_data('LGLDOC9999999901');

  ASSERT jsonb_array_length(v_payload) = 1,
         format('get_object_legal_data doit rendre la ligne témoin ; obtenu : %s', v_payload);
  ASSERT v_payload -> 0 -> 'type' ->> 'code' = 'kbis',
         format('le RPC éditeur doit rendre le code kbis ; obtenu : %s', v_payload -> 0 -> 'type');
  ASSERT v_payload -> 0 -> 'type' ->> 'name' = 'Extrait KBIS',
         'le RPC éditeur doit rendre le libellé humain du type, pas son code';
  ASSERT (v_payload -> 0 -> 'type' ->> 'is_public')::boolean = false,
         'un extrait KBIS ne doit jamais ressortir comme document public';

  RAISE NOTICE 'legal document catalog assertions passed (12 pièces OTI + 8 génériques retirés + 2 renommages sans orphelin + aucun obligatoire/public + identité intacte + RPC non vacant).';
END$$;
ROLLBACK;
