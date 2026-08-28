-- migration_legal_type_courrier_fermeture.sql
-- Manifeste 17a — lot de corrections 2026-08-28, chantier 2 (demande PO).
--
-- OBJET : ajoute la 16e pièce du catalogue `ref_legal_type` — « Courrier de fermeture ».
--
-- POURQUOI CE CATALOGUE ET PAS L'AUTRE. Il existe DEUX catalogues de types de document et ils ne
-- portent pas la même chose :
--   * `ref_legal_type`      → `object_legal.type_id`, éditeur §18 « Juridique ». Une pièce datée,
--                             avec validité, statut, justificatif uploadé et drapeau de visibilité.
--   * `ref_code` domaine `document_type` → `object_document.role_id`. Un simple rôle de fichier
--                             (carte PDF d'un restaurant, brochure) : ni validité, ni statut, ni
--                             gate de visibilité.
-- Un courrier de fermeture est une pièce administrative datée, non diffusable, avec justificatif :
-- c'est `ref_legal_type`. (Le commit `b65eda7` du CRM concernait l'autre catalogue.)
--
-- ARBITRAGES PO (2026-08-28)
--   * catégorie `business` — se range avec l'existence juridique (KBIS, statuts, avis SIRENE).
--     La colonne n'a aucun CHECK ; une catégorie neuve n'aurait influé que sur le TRI du sélecteur
--     §18 (is_required DESC → category → name) au prix d'un groupe à une seule entrée.
--   * `is_required = false` — l'obligation dépend de la situation de l'exploitant, comme les 15
--     autres documents. Le passer à `true` rallumerait la pastille rouge « Document obligatoire
--     expiré » sur TOUTES les fiches et ferait échouer le bloc (D) de `test_legal_document_catalog`.
--   * `is_public = false` — pièce administrative, jamais diffusée par l'API partenaire ni le site
--     public. Même garde.
--   * `review_interval_days = NULL` — une fermeture ne se renouvelle pas.
--
-- RÉSERVE ASSUMÉE : le §18 s'intitule « documents juridiques » et §209 l'a cadré sur les pièces
-- d'ENTRÉE en base ; un courrier de fermeture est une pièce de SORTIE. Le PO l'a arbitré ainsi
-- (2026-08-28) : le §18 devient le porte-documents administratif de la fiche, entrée comme sortie.
--
-- PORTÉE / IDEMPOTENCE. Sur une base FRAÎCHE cette étape est un NO-OP complet : la ligne est déjà
-- installée par `migration_legal_document_catalog.sql` (16t), dont la garde de convergence compte
-- désormais 16 documents, et elle est également foldée dans `schema_unified.sql`. Ce fichier existe
-- pour la base LIVE, qui a déjà joué 16t dans sa version à 15 documents : il porte, en un seul
-- endroit traçable, exactement ce qui a été appliqué en production — plutôt que de rejouer 16t en
-- entier (qui SUPPRIME les 8 types retirés et réécrit 20 lignes : un pari, pas un déploiement).
--
-- APRÈS APPLICATION : rien. Aucune fonction, vue ou colonne touchée ⇒ pas de `NOTIFY pgrst`. Aucun
-- MV concerné (`mv_ref_data_json` ne porte pas `ref_legal_type`, que le frontend lit en direct).
-- Le cache de session des catalogues du frontend (staleTime 1 h) se purge au rechargement de page.
--
-- FRONTEND : zéro changement, et c'est vérifié et non supposé — le catalogue est chargé par un
-- `select` déjà porteur de `description` (`reference-catalogs.ts`), le tri du sélecteur est
-- data-driven, `SectionLegal` range tout code non-identité du côté DOCUMENTS, et le seul hard-code
-- de codes `ref_legal_type` est `LEGAL_IDENTITY_TYPE_CODES` (les 5 identités).

\set ON_ERROR_STOP on
BEGIN;

-- =====================================================
-- 1. La ligne de catalogue
--    DO UPDATE (et non DO NOTHING) pour la même raison que 16t : convergent sur une base déjà
--    seedée, donc réappliquer ce fichier réaligne libellé/description/drapeaux au lieu de laisser
--    dormir une version périmée.
-- =====================================================
INSERT INTO ref_legal_type (code, name, description, category, is_required, is_public, review_interval_days) VALUES
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
-- 2. Garde de convergence — même forme que 16t, portée sur la valeur NEUVE.
--    Elle échoue fort plutôt que de laisser passer une ligne obligatoire ou publique : ces deux
--    drapeaux sont des règles métier (§209), pas de la décoration, et une seule ligne fautive
--    suffit à rallumer la pastille rouge du §18 ou à faire sortir la pièce par l'API partenaire.
-- =====================================================
DO $$
DECLARE
  v_docs INTEGER;
  v_row  ref_legal_type%ROWTYPE;
BEGIN
  SELECT * INTO v_row FROM ref_legal_type WHERE code = 'courrier_fermeture';

  IF v_row.id IS NULL THEN
    RAISE EXCEPTION 'migration_legal_type_courrier_fermeture: la ligne courrier_fermeture est absente apres upsert.';
  END IF;

  IF v_row.is_required IS DISTINCT FROM false OR v_row.is_public IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'migration_legal_type_courrier_fermeture: courrier_fermeture doit etre is_required=false ET is_public=false ; obtenu is_required=%, is_public=%.',
      v_row.is_required, v_row.is_public;
  END IF;

  SELECT count(*) INTO v_docs
  FROM ref_legal_type
  WHERE code NOT IN ('siret', 'siren', 'raison_sociale', 'vat_number', 'tourist_tax');

  IF v_docs <> 16 THEN
    RAISE EXCEPTION 'migration_legal_type_courrier_fermeture: % types de documents apres convergence, 16 attendus.', v_docs;
  END IF;
END $$;

COMMIT;
