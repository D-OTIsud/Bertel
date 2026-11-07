-- =============================================================================
-- migration_object_type_prd.sql — Nouveau type d'objet PRD « Producteur » (§57)
-- Manifest step 8x. Idempotent (IF NOT EXISTS / ON CONFLICT) — re-run = no-op.
-- Live-applied 2026-06-11 (MCP migrations object_type_prd_enum + object_type_prd_taxonomy).
-- =============================================================================
-- POURQUOI. L'analyse typologique du 2026-06-11 (docs/research/type-gap-analysis-
-- 2026-06-11.md, juge adversarial sur 4 angles Apidae/DATAtourisme/offre locale/
-- international) a identifié UN seul vrai type manquant : le producteur ouvert
-- au public (agritourisme / dégustation / vente directe — thé, vanille, curcuma,
-- miel, distilleries). Le concept était éclaté SANS règle d'arbitrage entre
-- 4 nœuds taxonomy_loi (Agrotourisme, Plantation, Exploitation agricole,
-- Produits du terroir), taxonomy_res « Distillerie - sucrerie » et COM.
-- Équivalents référentiels : Apidae DEGUSTATION (« Producteur »), DATAtourisme
-- TastingProvider/WineCellar.
--
-- RÈGLE D'ARBITRAGE (décision log §57, LOCKED) :
--   production + accueil/vente directe → PRD · repas servi → RES ·
--   revente seule (sans production) → COM · prestation encadrée (visite guidée
--   payante) → ACT (rattachée au PRD par relation).
--
-- QUOI. 1) Enum object_type += 'PRD'. 2) Registre taxonomy_prd (position 22)
-- + racine technique + 6 sous-catégories assignables. PAS de table facette
-- (modules génériques — une facette object_degustation reste ajoutable plus
-- tard via ref_facet_registry, 1 INSERT). Le re-routage des objets existants
-- (35 LOI + 1 RES) est porté par migration_loi_prd_cleanup_retype.sql (13d).
--
-- APPLY LIVE : DEUX transactions (valeur d'enum inutilisable dans sa propre
-- transaction) — partie 1 = enum, partie 2 = taxonomie. En psql autocommit
-- (CI fresh-apply) le fichier passe tel quel.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Partie 1 — valeur d'enum
-- ---------------------------------------------------------------------------
DO $$ BEGIN
  BEGIN
    ALTER TYPE object_type ADD VALUE IF NOT EXISTS 'PRD';
  EXCEPTION WHEN others THEN NULL; END;
END $$;

-- ---------------------------------------------------------------------------
-- Partie 2 — taxonomie PRD (registre + racine + sous-catégories)
-- ---------------------------------------------------------------------------
INSERT INTO ref_code_domain_registry (
  domain, name, description, object_type,
  is_hierarchical, is_taxonomy, position, is_active,
  name_i18n, description_i18n, metadata
) VALUES (
  'taxonomy_prd', 'Taxonomie PRD',
  'Sous-catégories pour les producteurs ouverts au public (agritourisme, dégustation, vente directe).',
  'PRD'::object_type, TRUE, TRUE, 22, TRUE,
  jsonb_build_object('fr', 'Taxonomie PRD'),
  jsonb_build_object('fr', 'Sous-catégories pour les producteurs ouverts au public (agritourisme, dégustation, vente directe).'),
  jsonb_build_object('source', 'object_type_prd_20260611')
)
ON CONFLICT (domain) DO UPDATE
SET object_type = EXCLUDED.object_type,
    is_hierarchical = TRUE, is_taxonomy = TRUE, is_active = TRUE,
    name_i18n = coalesce(ref_code_domain_registry.name_i18n, '{}'::jsonb) || EXCLUDED.name_i18n,
    description_i18n = coalesce(ref_code_domain_registry.description_i18n, '{}'::jsonb) || EXCLUDED.description_i18n,
    metadata = coalesce(ref_code_domain_registry.metadata, '{}'::jsonb) || EXCLUDED.metadata,
    updated_at = NOW();

INSERT INTO ref_code (domain, code, name, description, position, parent_id, is_assignable, metadata, name_i18n, description_i18n)
VALUES (
  'taxonomy_prd', 'root', 'PRD', 'Racine technique Taxonomie PRD', 0, NULL, FALSE,
  jsonb_build_object('source', 'object_type_prd_20260611'),
  jsonb_build_object('fr', 'PRD'),
  jsonb_build_object('fr', 'Racine technique Taxonomie PRD')
)
ON CONFLICT (domain, code) DO UPDATE
SET name = EXCLUDED.name, description = EXCLUDED.description, is_assignable = FALSE,
    metadata = coalesce(ref_code.metadata, '{}'::jsonb) || EXCLUDED.metadata,
    updated_at = NOW();

-- Sous-catégories : les 4 premières reprennent 1:1 les nœuds agro migrés
-- depuis taxonomy_loi (13d) ; distillerie_brasserie reprend le nœud RES
-- « Distillerie - sucrerie » ; apiculture est un ajout canonique.
WITH root AS (
  SELECT id FROM ref_code WHERE domain = 'taxonomy_prd' AND code = 'root'
)
INSERT INTO ref_code (domain, code, name, description, position, parent_id, is_assignable, metadata, name_i18n, description_i18n)
SELECT
  'taxonomy_prd', v.code, v.name, v.description, v.position, root.id, TRUE,
  jsonb_build_object('source', 'object_type_prd_20260611'),
  jsonb_build_object('fr', v.name),
  jsonb_build_object('fr', v.description)
FROM (VALUES
  ('plantation',            'Plantation',                      'Plantation ouverte à la visite (thé, vanille, café, épices…)',            1),
  ('exploitation_agricole', 'Exploitation agricole / ferme',   'Exploitation agricole accueillant du public',                              2),
  ('agrotourisme',          'Agrotourisme',                    'Accueil et activités agritouristiques à la ferme',                         3),
  ('produits_terroir',      'Produits du terroir / vente directe', 'Production artisanale de terroir avec vente directe (tisanes, sirops, confitures…)', 4),
  ('distillerie_brasserie', 'Distillerie / brasserie / rhumerie', 'Production de boissons ouverte à la visite ou à la dégustation',        5),
  ('apiculture',            'Apiculture / miellerie',          'Production apicole ouverte au public',                                     6)
) AS v(code, name, description, position)
CROSS JOIN root
ON CONFLICT (domain, code) DO UPDATE
SET name = EXCLUDED.name, description = EXCLUDED.description,
    parent_id = EXCLUDED.parent_id, position = EXCLUDED.position, is_assignable = TRUE,
    metadata = coalesce(ref_code.metadata, '{}'::jsonb) || EXCLUDED.metadata,
    updated_at = NOW();
