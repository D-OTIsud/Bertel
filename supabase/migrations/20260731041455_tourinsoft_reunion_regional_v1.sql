-- Tourinsoft CRT Réunion — six-family regional export contract.
-- Opt-in only: legacy-v1 and reunion-hebergement-v1 remain unchanged.

BEGIN;

CREATE TABLE IF NOT EXISTS public.ref_tourinsoft_reunion_profile (
  profile                  text PRIMARY KEY,
  slug                     text NOT NULL UNIQUE,
  feed_id                  uuid NOT NULL UNIQUE,
  feed_url                 text NOT NULL,
  classification_code      text NOT NULL,
  classification_label     text NOT NULL,
  access_collection        text NOT NULL,
  location_collection      text NOT NULL,
  animal_collection        text,
  social_collection        text,
  reservation_collection   text,
  price_collection         text,
  capacity_collection      text,
  online_field             text,
  group_acceptance_field   text,
  category_collection      text NOT NULL,
  category_is_scalar       boolean NOT NULL DEFAULT false,
  is_active                boolean NOT NULL DEFAULT true,
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ref_tourinsoft_reunion_profile_nonempty CHECK (
    btrim(profile) <> '' AND btrim(slug) <> '' AND feed_url ~ '^https://'
  )
);

COMMENT ON TABLE public.ref_tourinsoft_reunion_profile IS
  'Exact wire-level profile for one current CRT Reunion Tourinsoft syndication family.';

CREATE TABLE IF NOT EXISTS public.ref_tourinsoft_reunion_route (
  variant             text NOT NULL,
  object_type         public.object_type NOT NULL,
  taxonomy_domain     text,
  taxonomy_code       text,
  target_profile      text NOT NULL REFERENCES public.ref_tourinsoft_reunion_profile(profile) ON DELETE RESTRICT,
  priority            integer NOT NULL DEFAULT 100,
  is_active           boolean NOT NULL DEFAULT true,
  notes               text,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ref_tourinsoft_reunion_route_taxonomy_pair CHECK (
    (taxonomy_domain IS NULL) = (taxonomy_code IS NULL)
  ),
  CONSTRAINT ref_tourinsoft_reunion_route_taxonomy_fk FOREIGN KEY (taxonomy_domain, taxonomy_code)
    REFERENCES public.ref_code(domain, code) ON DELETE RESTRICT
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_tourinsoft_reunion_route_default
  ON public.ref_tourinsoft_reunion_route(variant, object_type)
  WHERE taxonomy_code IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_tourinsoft_reunion_route_taxonomy
  ON public.ref_tourinsoft_reunion_route(variant, object_type, taxonomy_domain, taxonomy_code)
  WHERE taxonomy_code IS NOT NULL;

COMMENT ON TABLE public.ref_tourinsoft_reunion_route IS
  'Taxonomy-aware Bertel object routing to exactly one Tourinsoft Reunion family. Specific taxonomy routes win over type defaults.';

CREATE TABLE IF NOT EXISTS public.object_interop_extension (
  object_id       text NOT NULL REFERENCES public.object(id) ON DELETE CASCADE,
  profile         text NOT NULL REFERENCES public.ref_tourinsoft_reunion_profile(profile) ON DELETE RESTRICT,
  external_id     text,
  data            jsonb NOT NULL DEFAULT '{}'::jsonb,
  source          text,
  last_synced_at  timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT object_interop_extension_pkey PRIMARY KEY (object_id, profile),
  CONSTRAINT object_interop_extension_external_id_nonempty CHECK (
    external_id IS NULL OR btrim(external_id) <> ''
  ),
  CONSTRAINT object_interop_extension_identity_not_in_data CHECK (
    NOT (data ? 'SyndicObjectID')
  ),
  CONSTRAINT object_interop_extension_object CHECK (jsonb_typeof(data) = 'object')
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_object_interop_extension_external_id
  ON public.object_interop_extension(profile, external_id)
  WHERE external_id IS NOT NULL;

COMMENT ON TABLE public.object_interop_extension IS
  'Service-only, profile-scoped Tourinsoft identity and round-trip storage for approved partner fields that have no canonical Bertel model yet. Canonical serializer leaves override extension leaves.';

CREATE TABLE IF NOT EXISTS public.ref_tourinsoft_reunion_extension_field (
  profile          text NOT NULL REFERENCES public.ref_tourinsoft_reunion_profile(profile) ON DELETE CASCADE,
  path             text NOT NULL,
  canonical_owned  boolean NOT NULL DEFAULT false,
  created_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ref_tourinsoft_reunion_extension_field_pkey PRIMARY KEY (profile, path),
  CONSTRAINT ref_tourinsoft_reunion_extension_field_path CHECK (
    btrim(path) <> '' AND path !~ '(^\.|\.$|\.\.)'
  )
);

COMMENT ON TABLE public.ref_tourinsoft_reunion_extension_field IS
  'Profile-scoped allowlist of approved and pending-CRT Tourinsoft JSON leaf paths. canonical_owned paths may only augment a canonical Bertel value already present; excluded/private fields are never syndicated.';

DROP TRIGGER IF EXISTS update_ref_tourinsoft_reunion_profile_updated_at
  ON public.ref_tourinsoft_reunion_profile;
CREATE TRIGGER update_ref_tourinsoft_reunion_profile_updated_at
BEFORE UPDATE ON public.ref_tourinsoft_reunion_profile
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_ref_tourinsoft_reunion_route_updated_at
  ON public.ref_tourinsoft_reunion_route;
CREATE TRIGGER update_ref_tourinsoft_reunion_route_updated_at
BEFORE UPDATE ON public.ref_tourinsoft_reunion_route
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_object_interop_extension_updated_at
  ON public.object_interop_extension;
CREATE TRIGGER update_object_interop_extension_updated_at
BEFORE UPDATE ON public.object_interop_extension
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.ref_tourinsoft_reunion_profile ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ref_tourinsoft_reunion_route ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.object_interop_extension ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ref_tourinsoft_reunion_extension_field ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ref_tourinsoft_reunion_profile_service ON public.ref_tourinsoft_reunion_profile;
CREATE POLICY ref_tourinsoft_reunion_profile_service ON public.ref_tourinsoft_reunion_profile
  FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS ref_tourinsoft_reunion_route_service ON public.ref_tourinsoft_reunion_route;
CREATE POLICY ref_tourinsoft_reunion_route_service ON public.ref_tourinsoft_reunion_route
  FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS object_interop_extension_service ON public.object_interop_extension;
CREATE POLICY object_interop_extension_service ON public.object_interop_extension
  FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS ref_tourinsoft_reunion_extension_field_service
  ON public.ref_tourinsoft_reunion_extension_field;
CREATE POLICY ref_tourinsoft_reunion_extension_field_service
  ON public.ref_tourinsoft_reunion_extension_field
  FOR ALL TO service_role USING (true) WITH CHECK (true);

REVOKE ALL ON TABLE public.ref_tourinsoft_reunion_profile FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.ref_tourinsoft_reunion_route FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.object_interop_extension FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.ref_tourinsoft_reunion_extension_field FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.ref_tourinsoft_reunion_profile TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.ref_tourinsoft_reunion_route TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.object_interop_extension TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.ref_tourinsoft_reunion_extension_field TO service_role;

INSERT INTO public.ref_tourinsoft_reunion_profile (
  profile, slug, feed_id, feed_url, classification_code, classification_label,
  access_collection, location_collection, animal_collection, social_collection,
  reservation_collection, price_collection, capacity_collection, online_field,
  group_acceptance_field, category_collection, category_is_scalar
) VALUES
  ('tourinsoft_reunion_decouverte_v1', 'decouverte', '39bab676-97bb-4c78-9d7d-28dd43753314',
   'https://api-v3.tourinsoft.com/api/syndications/reunion.tourinsoft.com/39BAB676-97BB-4C78-9D7D-28DD43753314',
   'DECO', 'Découverte', 'Descriptifaccess', 'Localisations', 'Animauxs', NULL,
   'Reservations', 'Tarifs', 'Capacites', 'EnLigne', 'Groupeaccepte', 'ClassificationCategories', false),
  ('tourinsoft_reunion_hebergement_v1', 'hebergement', 'b2bc0524-adc3-45d5-8a77-a0d70d2425b3',
   'https://api-v3.tourinsoft.com/api/syndications/reunion.tourinsoft.com/B2BC0524-ADC3-45D5-8A77-A0D70D2425B3',
   'HEB', 'Hébergement', 'Access', 'Localisationss', 'Animauxacceptess', 'Reseauxsociauxs',
   'Reservations', 'Tarifs', 'Capacites', NULL, NULL, 'Classificationcategories', false),
  ('tourinsoft_reunion_information_service_v1', 'information_service', '5a285c91-d35f-4873-8f3c-a032abb418d3',
   'https://api-v3.tourinsoft.com/api/syndications/reunion.tourinsoft.com/5A285C91-D35F-4873-8F3C-A032ABB418D3',
   'INF', 'Information et service touristique', 'Descriptifaccess', 'Localisations', NULL, NULL,
   NULL, NULL, NULL, NULL, NULL, 'ClassificationCategorie', true),
  ('tourinsoft_reunion_loisir_plein_air_v1', 'loisir_plein_air', 'c32a0407-a66f-48d5-8db0-618fdf03f49f',
   'https://api-v3.tourinsoft.com/api/syndications/reunion.tourinsoft.com/C32A0407-A66F-48D5-8DB0-618FDF03F49F',
   'LPA', 'Loisir/plein air', 'Descriptifaccess', 'Localisations', NULL, NULL,
   'Reservations', 'Tarifs', 'Capacites', NULL, NULL, 'ClassificationCategoriess', false),
  ('tourinsoft_reunion_restauration_v1', 'restauration', 'cc575ee1-aa90-49bd-b23f-1935c4b151cd',
   'https://api-v3.tourinsoft.com/api/syndications/reunion.tourinsoft.com/CC575EE1-AA90-49BD-B23F-1935C4B151CD',
   'REST', 'Restauration', 'Descriptifaccess', 'Localisations', 'Animauxs', NULL,
   'Reservations', 'Tarifs', 'Capacites', 'EnLigne', 'Receptiongroupe', 'ClassificationCategories', false),
  ('tourinsoft_reunion_transport_v1', 'transport', '15dd031a-caac-4e1b-aa75-5f65d7a437e8',
   'https://api-v3.tourinsoft.com/api/syndications/reunion.tourinsoft.com/15DD031A-CAAC-4E1B-AA75-5F65D7A437E8',
   'TRAN', 'Transport', 'Descriptifaccess', 'Localisations', NULL, NULL,
   'Reservations', 'Tarifs', NULL, NULL, NULL, 'ClassificationCategories', false)
ON CONFLICT (profile) DO UPDATE SET
  slug = EXCLUDED.slug, feed_id = EXCLUDED.feed_id, feed_url = EXCLUDED.feed_url,
  classification_code = EXCLUDED.classification_code, classification_label = EXCLUDED.classification_label,
  access_collection = EXCLUDED.access_collection, location_collection = EXCLUDED.location_collection,
  animal_collection = EXCLUDED.animal_collection, social_collection = EXCLUDED.social_collection,
  reservation_collection = EXCLUDED.reservation_collection, price_collection = EXCLUDED.price_collection,
  capacity_collection = EXCLUDED.capacity_collection, online_field = EXCLUDED.online_field,
  group_acceptance_field = EXCLUDED.group_acceptance_field, category_collection = EXCLUDED.category_collection,
  category_is_scalar = EXCLUDED.category_is_scalar, is_active = true, updated_at = now();

-- Tighten the generated contract to pending business leaves plus the minimum
-- canonical business keys required for safe, order-independent matching.
DELETE FROM public.ref_tourinsoft_reunion_extension_field
WHERE profile IN (SELECT profile FROM public.ref_tourinsoft_reunion_profile);

INSERT INTO public.ref_tourinsoft_reunion_extension_field(profile, path, canonical_owned)
SELECT entry->>'profile', path.value,
       (entry->'canonical_keys') ? split_part(path.value, '.', 1)
FROM jsonb_array_elements($safe_allowlist$[{"profile":"tourinsoft_reunion_decouverte_v1","paths":["AccueilPMR","Animauxs.ID","Animauxs.SyndicObjectId","Capacites.ID","Capacites.SyndicObjectId","Chaines.Groupe","Chaines.Groupe.ThesCode","Chaines.Groupe.ThesID","Chaines.Groupe.ThesLibelle","Chaines.ID","Chaines.Reseaux","Chaines.Reseaux.ThesCode","Chaines.Reseaux.ThesID","Chaines.Reseaux.ThesLibelle","Chaines.SyndicObjectId","ClassificationCategories.ID","ClassificationCategories.SyndicObjectId","ClassificationCategories.ThesCode","ClassificationCategories.ThesID","ClassificationSousCategorieArts.ID","ClassificationSousCategorieArts.SyndicObjectId","ClassificationSousCategorieArts.ThesCode","ClassificationSousCategorieArts.ThesID","ClassificationSousCategoriePatAgricoles.ID","ClassificationSousCategoriePatAgricoles.SyndicObjectId","ClassificationSousCategoriePatAgricoles.ThesCode","ClassificationSousCategoriePatAgricoles.ThesID","ClassificationSousCategoriePatCulturels.ID","ClassificationSousCategoriePatCulturels.SyndicObjectId","ClassificationSousCategoriePatCulturels.ThesCode","ClassificationSousCategoriePatCulturels.ThesID","ClassificationSousCategoriePatIndustriels.ID","ClassificationSousCategoriePatIndustriels.SyndicObjectId","ClassificationSousCategoriePatIndustriels.ThesCode","ClassificationSousCategoriePatIndustriels.ThesID","ClassificationSousCategoriePatNaturels.ID","ClassificationSousCategoriePatNaturels.SyndicObjectId","ClassificationSousCategoriePatNaturels.ThesCode","ClassificationSousCategoriePatNaturels.ThesID","ClassificationSousCategorieTerroirs.ID","ClassificationSousCategorieTerroirs.SyndicObjectId","ClassificationSousCategorieTerroirs.ThesCode","ClassificationSousCategorieTerroirs.ThesID","ClassificationType.ThesCode","ClassificationType.ThesID","Descriptifaccess.ID","Descriptifaccess.SyndicObjectId","Descriptifss.ID","Descriptifss.SyndicObjectId","Fichiers.DocumentFichier.Url","Fichiers.ID","Fichiers.SyndicObjectId","Handicaps.ID","Handicaps.SyndicObjectId","Handicaps.ThesCode","Handicaps.ThesID","Handicaps.ThesLibelle","IdentifiantSoubik","Labels.ID","Labels.SyndicObjectId","Labels.ThesCode","Labels.ThesID","LanguesParleess.ID","LanguesParleess.SyndicObjectId","LanguesParleess.ThesCode","LanguesParleess.ThesID","Lieudit","Lieudit.ThesCode","Lieudit.ThesID","Localisations.ID","Localisations.SyndicObjectId","Localisations.ThesCode","Localisations.ThesID","Marques.ID","Marques.SyndicObjectId","ModesPaiements.ID","ModesPaiements.SyndicObjectId","ModesPaiements.ThesCode","ModesPaiements.ThesID","Moyencommunications.Complementdinformations","Moyencommunications.Coordonnees","Moyencommunications.ID","Moyencommunications.Moyendecommunication","Moyencommunications.Moyendecommunication.ThesCode","Moyencommunications.Moyendecommunication.ThesID","Moyencommunications.SyndicObjectId","Moyencommunications.Typedecoordonnees.ThesCode","Moyencommunications.Typedecoordonnees.ThesID","PeriodeOuvertures.Datedebut","PeriodeOuvertures.Datefin","PeriodeOuvertures.ID","PeriodeOuvertures.Precisionssurlesfermetures","PeriodeOuvertures.SyndicObjectId","PeriodeOuvertures.heuredebut1","PeriodeOuvertures.heuredebut2","PeriodeOuvertures.heurefin1","PeriodeOuvertures.heurefin2","Photos.ID","Photos.Licencecreativecommons","Photos.Photo.Url","Photos.SyndicObjectId","PrestationProximites.ID","PrestationProximites.SyndicObjectId","PrestationProximites.ThesCode","PrestationProximites.ThesID","PrestationProximites.ThesLibelle","PrestationsActivites.ID","PrestationsActivites.SyndicObjectId","PrestationsActivites.ThesCode","PrestationsActivites.ThesID","PrestationsActivites.ThesLibelle","PrestationsEquipementss.ID","PrestationsEquipementss.SyndicObjectId","PrestationsEquipementss.ThesCode","PrestationsEquipementss.ThesID","Reservations.ID","Reservations.Lien","Reservations.Listeplateforme.ThesCode","Reservations.Listeplateforme.ThesID","Reservations.Listeplateforme.ThesLibelle","Reservations.SyndicObjectId","SyndicStructureId","Tarifs.Datedebutaffichage","Tarifs.Datedebutvalidite","Tarifs.Datefinaffichage","Tarifs.Datefinvalidite","Tarifs.ID","Tarifs.IntituleTarifs","Tarifs.IntituleTarifs.ThesCode","Tarifs.IntituleTarifs.ThesID","Tarifs.IntituleTarifs.ThesLibelle","Tarifs.MaximumEuro","Tarifs.MinimumEuro","Tarifs.Saisonnalite","Tarifs.Saisonnalite.ThesCode","Tarifs.Saisonnalite.ThesID","Tarifs.Saisonnalite.ThesLibelle","Tarifs.SyndicObjectId","Thematiques.ID","Thematiques.SyndicObjectId","Thematiques.ThesCode","Thematiques.ThesID","Typeequipements.ID","Typeequipements.SyndicObjectId","Typeequipements.Typedactivite.ThesID","Videos.ID","Videos.IntegrerlavideosursonsitecopiercollerdeObjetouembedYoutubeouDailymotion","Videos.Licencecreativecommons","Videos.SyndicObjectId","Videos.URLvideo"],"canonical_keys":["Adresse1","Adresse2","Adresse3","Animauxs","Capacites","ClassificationCategories","ClassificationSousCategorieArts","ClassificationSousCategoriePatAgricoles","ClassificationSousCategoriePatCulturels","ClassificationSousCategoriePatIndustriels","ClassificationSousCategoriePatNaturels","ClassificationSousCategorieTerroirs","ClassificationType","CodeINSEE","CodePostal","Commune","Descriptifaccess","Descriptifss","EnLigne","Fichiers","GmapLatitude","GmapLongitude","Groupeaccepte","Labels","LanguesParleess","Lieudit","Localisations","ModesPaiements","Moyencommunications","Nometablissement","ObjectTypeFix","ObjectTypeName","PeriodeOuvertures","Photos","PrestationsEquipementss","Published","Reservations","SIRET","SyndicObjectName","Tarifs","Thematiques","Updated","Videos"]},{"profile":"tourinsoft_reunion_hebergement_v1","paths":["Access.ID","Access.SyndicObjectId","AccueilPMR","Allinclusive","Animauxacceptess.Complementdinfo","Animauxacceptess.Complementdinfo.ThesCode","Animauxacceptess.Complementdinfo.ThesID","Animauxacceptess.Complementdinfo.ThesLibelle","Animauxacceptess.ID","Animauxacceptess.SyndicObjectId","Capacitecampings.ID","Capacitecampings.Nombredemplacementcamping","Capacitecampings.Surfacecamping","Capacitecampings.Surfacedelhabitation","Capacitecampings.SyndicObjectId","Capacites.ID","Capacites.Nombredechambresfamiliales","Capacites.Nombredechambrespourpersonneamobilitereduite","Capacites.Superficieduterrain","Capacites.SyndicObjectId","Capacitesallereunions.Capacitedelasalle","Capacitesallereunions.Descriptifdelasalle","Capacitesallereunions.ID","Capacitesallereunions.Nomdelasalle","Capacitesallereunions.SyndicObjectId","Chaine","Chaine.ThesCode","Chaine.ThesID","Chaine.ThesLibelle","ClassementGitesDeFrances.ID","ClassementGitesDeFrances.SyndicObjectId","ClassementGitesDeFrances.ThesCode","ClassementGitesDeFrances.ThesID","ClassementGitesDeFrances.ThesLibelle","ClassementPrefectoral","ClassementsCleVacancess.ID","ClassementsCleVacancess.SyndicObjectId","ClassementsCleVacancess.ThesCode","ClassementsCleVacancess.ThesID","ClassementsCleVacancess.ThesLibelle","ClassificationType","ClassificationType.ThesCode","ClassificationType.ThesID","Classificationcategories.ID","Classificationcategories.SyndicObjectId","Classificationcategories.ThesCode","Classificationcategories.ThesID","ClassificationsouscategorieCHoteHLOs.ID","ClassificationsouscategorieCHoteHLOs.SyndicObjectId","ClassificationsouscategorieCHoteHLOs.ThesCode","ClassificationsouscategorieCHoteHLOs.ThesID","ClassificationsouscategoriegiteHLOs.ID","ClassificationsouscategoriegiteHLOs.SyndicObjectId","ClassificationsouscategoriegiteHLOs.ThesCode","ClassificationsouscategoriegiteHLOs.ThesID","ClassificationsouscategorielocsaisHLOs.ID","ClassificationsouscategorielocsaisHLOs.SyndicObjectId","ClassificationsouscategorielocsaisHLOs.ThesCode","ClassificationsouscategorielocsaisHLOs.ThesID","Classificationsouscategories.ID","Classificationsouscategories.SyndicObjectId","Classificationsouscategories.ThesCode","Classificationsouscategories.ThesID","Descriptifss.ID","Descriptifss.SyndicObjectId","Fichiers.DocumentFichier.Url","Fichiers.ID","Fichiers.SyndicObjectId","Handicaps.ID","Handicaps.SyndicObjectId","Handicaps.ThesCode","Handicaps.ThesID","Handicaps.ThesLibelle","Horairearriveedeparts.ID","Horairearriveedeparts.SyndicObjectId","IdentifiantSoubik","Labels.ID","Labels.SyndicObjectId","Labels.ThesCode","Labels.ThesID","LanguesParleess.ID","LanguesParleess.SyndicObjectId","LanguesParleess.ThesCode","LanguesParleess.ThesID","Lieudit","Lieudit.ThesCode","Lieudit.ThesID","Localisationss.ID","Localisationss.SyndicObjectId","Localisationss.ThesCode","Localisationss.ThesID","ModesPaiements.ID","ModesPaiements.SyndicObjectId","ModesPaiements.ThesCode","ModesPaiements.ThesID","Moyencommunications.Complementdinformations","Moyencommunications.Coordonnees","Moyencommunications.ID","Moyencommunications.Moyendecommunication","Moyencommunications.Moyendecommunication.ThesCode","Moyencommunications.Moyendecommunication.ThesID","Moyencommunications.SyndicObjectId","Moyencommunications.Typedecoordonnees.ThesCode","Moyencommunications.Typedecoordonnees.ThesID","PeriodeOuvertures.Datedebut","PeriodeOuvertures.Datefin","PeriodeOuvertures.ID","PeriodeOuvertures.Precisionssurlesfermetures","PeriodeOuvertures.SyndicObjectId","PeriodeOuvertures.heuredebut1","PeriodeOuvertures.heuredebut2","PeriodeOuvertures.heurefin1","PeriodeOuvertures.heurefin2","Photos.ID","Photos.Licencecreativecommons","Photos.Photo.Url","Photos.SyndicObjectId","PrestationProximites.ID","PrestationProximites.SyndicObjectId","PrestationProximites.ThesCode","PrestationProximites.ThesID","PrestationProximites.ThesLibelle","PrestationsActivites.ID","PrestationsActivites.SyndicObjectId","PrestationsActivites.ThesCode","PrestationsActivites.ThesID","PrestationsActivites.ThesLibelle","PrestationsEquipementss.ID","PrestationsEquipementss.SyndicObjectId","PrestationsEquipementss.ThesCode","PrestationsEquipementss.ThesID","Reseauxsociauxs.ID","Reseauxsociauxs.SyndicObjectId","Reseauxsociauxs.Typedeplateforme.ThesCode","Reseauxsociauxs.Typedeplateforme.ThesID","Reseauxsociauxs.URL","Reseauxsociauxs.codeembed","Reservations.ID","Reservations.Lien","Reservations.Listeplateforme.ThesCode","Reservations.Listeplateforme.ThesID","Reservations.Listeplateforme.ThesLibelle","Reservations.SyndicObjectId","SyndicStructureId","Tarifs.Datedebutaffichage","Tarifs.Datedebutvalidite","Tarifs.Datefinaffichage","Tarifs.Datefinvalidite","Tarifs.ID","Tarifs.IntituleTarifs","Tarifs.IntituleTarifs.ThesCode","Tarifs.IntituleTarifs.ThesID","Tarifs.IntituleTarifs.ThesLibelle","Tarifs.MaximumEuro","Tarifs.MinimumEuro","Tarifs.Nombredenuits","Tarifs.Saisonnalite","Tarifs.Saisonnalite.ThesCode","Tarifs.Saisonnalite.ThesID","Tarifs.Saisonnalite.ThesLibelle","Tarifs.SyndicObjectId","Thematiques.ID","Thematiques.SyndicObjectId","Thematiques.ThesCode","Thematiques.ThesID","Videos.ID","Videos.IntegrerlavideosursonsitecopiercollerdeObjetouembedYoutubeouDailymotion","Videos.Licencecreativecommons","Videos.SyndicObjectId","Videos.URLvideo","ZonesTypes.ID","ZonesTypes.SyndicObjectId","ZonesTypes.ZoneId","ZonesTypes.ZoneTypeId","ZonesTypes.ZoneTypeLibelle","Zoness.AdresseOrdre","Zoness.ID","Zoness.SyndicObjectId","Zoness.ZoneId","Zoness.ZoneLibelle"],"canonical_keys":["Access","Adresse1","Adresse2","Adresse3","Animauxacceptess","Capacitecampings","Capacites","ClassificationType","Classificationcategories","ClassificationsouscategorieCHoteHLOs","ClassificationsouscategoriegiteHLOs","ClassificationsouscategorielocsaisHLOs","Classificationsouscategories","CodeINSEE","CodePostal","Commune","Descriptifss","Fichiers","GmapLatitude","GmapLongitude","Horairearriveedeparts","Labels","LanguesParleess","Lieudit","Localisationss","ModesPaiements","Moyencommunications","Nometablissement","ObjectTypeFix","ObjectTypeName","PeriodeOuvertures","Photos","PrestationsEquipementss","Published","Reseauxsociauxs","Reservations","SIRET","SyndicObjectName","Tarifs","Thematiques","Updated","Videos"]},{"profile":"tourinsoft_reunion_information_service_v1","paths":["AccueilPMR","Chaines.Groupe","Chaines.Groupe.ThesCode","Chaines.Groupe.ThesID","Chaines.Groupe.ThesLibelle","Chaines.ID","Chaines.Reseaux","Chaines.Reseaux.ThesCode","Chaines.Reseaux.ThesID","Chaines.Reseaux.ThesLibelle","Chaines.SyndicObjectId","ClassificationCategorie.ThesCode","ClassificationCategorie.ThesID","ClassificationSousCategorieInfoServs.ID","ClassificationSousCategorieInfoServs.SyndicObjectId","ClassificationSousCategorieInfoServs.ThesCode","ClassificationSousCategorieInfoServs.ThesID","ClassificationSousCategorieOrgs.ID","ClassificationSousCategorieOrgs.SyndicObjectId","ClassificationSousCategorieOrgs.ThesCode","ClassificationSousCategorieOrgs.ThesID","ClassificationSousCategorieTourAffs.ID","ClassificationSousCategorieTourAffs.SyndicObjectId","ClassificationSousCategorieTourAffs.ThesCode","ClassificationSousCategorieTourAffs.ThesID","ClassificationType.ThesCode","ClassificationType.ThesID","Descriptifaccess.ID","Descriptifaccess.SyndicObjectId","Descriptifss.ID","Descriptifss.SyndicObjectId","Fichiers.DocumentFichier.Url","Fichiers.ID","Fichiers.SyndicObjectId","Handicaps.ID","Handicaps.SyndicObjectId","Handicaps.ThesCode","Handicaps.ThesID","Handicaps.ThesLibelle","IdentifiantSoubik","Labels.ID","Labels.SyndicObjectId","Labels.ThesCode","Labels.ThesID","LanguesParleess.ID","LanguesParleess.SyndicObjectId","LanguesParleess.ThesCode","LanguesParleess.ThesID","Lieudit","Lieudit.ThesCode","Lieudit.ThesID","Localisations.ID","Localisations.SyndicObjectId","Localisations.ThesCode","Localisations.ThesID","Marques.ID","Marques.SyndicObjectId","ModesPaiements.ID","ModesPaiements.SyndicObjectId","ModesPaiements.ThesCode","ModesPaiements.ThesID","Moyencommunications.Complementdinformations","Moyencommunications.Coordonnees","Moyencommunications.ID","Moyencommunications.Moyendecommunication","Moyencommunications.Moyendecommunication.ThesCode","Moyencommunications.Moyendecommunication.ThesID","Moyencommunications.SyndicObjectId","Moyencommunications.Typedecoordonnees.ThesCode","Moyencommunications.Typedecoordonnees.ThesID","PeriodeOuvertures.Datedebut","PeriodeOuvertures.Datefin","PeriodeOuvertures.ID","PeriodeOuvertures.Precisionssurlesfermetures","PeriodeOuvertures.SyndicObjectId","PeriodeOuvertures.heuredebut1","PeriodeOuvertures.heuredebut2","PeriodeOuvertures.heurefin1","PeriodeOuvertures.heurefin2","Photos.ID","Photos.Licencecreativecommons","Photos.Photo.Url","Photos.SyndicObjectId","PrestationProximites.ID","PrestationProximites.SyndicObjectId","PrestationProximites.ThesCode","PrestationProximites.ThesID","PrestationProximites.ThesLibelle","PrestationsActivites.ID","PrestationsActivites.SyndicObjectId","PrestationsActivites.ThesCode","PrestationsActivites.ThesID","PrestationsActivites.ThesLibelle","PrestationsEquipementss.ID","PrestationsEquipementss.SyndicObjectId","PrestationsEquipementss.ThesCode","PrestationsEquipementss.ThesID","SyndicStructureId","Thematiques.ID","Thematiques.SyndicObjectId","Thematiques.ThesCode","Thematiques.ThesID","Typeequipements.ID","Typeequipements.SyndicObjectId","Typeequipements.Typedactivite.ThesID","Videos.ID","Videos.IntegrerlavideosursonsitecopiercollerdeObjetouembedYoutubeouDailymotion","Videos.Licencecreativecommons","Videos.SyndicObjectId","Videos.URLvideo"],"canonical_keys":["Adresse1","Adresse2","Adresse3","ClassificationCategorie","ClassificationSousCategorieInfoServs","ClassificationSousCategorieOrgs","ClassificationSousCategorieTourAffs","ClassificationType","CodeINSEE","CodePostal","Commune","Descriptifaccess","Descriptifss","Fichiers","GmapLatitude","GmapLongitude","Labels","LanguesParleess","Lieudit","Localisations","ModesPaiements","Moyencommunications","Nometablissement","ObjectTypeFix","ObjectTypeName","PeriodeOuvertures","Photos","PrestationsEquipementss","Published","SIRET","SyndicObjectName","Thematiques","Updated","Videos"]},{"profile":"tourinsoft_reunion_loisir_plein_air_v1","paths":["AccueilPMR","Capacites.ID","Capacites.SyndicObjectId","Chaines.Groupe","Chaines.Groupe.ThesCode","Chaines.Groupe.ThesID","Chaines.Groupe.ThesLibelle","Chaines.ID","Chaines.Reseaux","Chaines.Reseaux.ThesCode","Chaines.Reseaux.ThesID","Chaines.Reseaux.ThesLibelle","Chaines.SyndicObjectId","ClassificationCategoriesSousCategorieAdrenalines.ID","ClassificationCategoriesSousCategorieAdrenalines.SyndicObjectId","ClassificationCategoriesSousCategorieAdrenalines.ThesCode","ClassificationCategoriesSousCategorieAdrenalines.ThesID","ClassificationCategoriesSousCategorieAeronautiques.ID","ClassificationCategoriesSousCategorieAeronautiques.SyndicObjectId","ClassificationCategoriesSousCategorieAeronautiques.ThesCode","ClassificationCategoriesSousCategorieAeronautiques.ThesID","ClassificationCategoriesSousCategorieAttractionss.ID","ClassificationCategoriesSousCategorieAttractionss.SyndicObjectId","ClassificationCategoriesSousCategorieAttractionss.ThesCode","ClassificationCategoriesSousCategorieAttractionss.ThesID","ClassificationCategoriesSousCategorieAutress.ID","ClassificationCategoriesSousCategorieAutress.SyndicObjectId","ClassificationCategoriesSousCategorieAutress.ThesCode","ClassificationCategoriesSousCategorieAutress.ThesID","ClassificationCategoriesSousCategorieExplorations.ID","ClassificationCategoriesSousCategorieExplorations.SyndicObjectId","ClassificationCategoriesSousCategorieExplorations.ThesCode","ClassificationCategoriesSousCategorieExplorations.ThesID","ClassificationCategoriesSousCategorieJeuxs.ID","ClassificationCategoriesSousCategorieJeuxs.SyndicObjectId","ClassificationCategoriesSousCategorieJeuxs.ThesCode","ClassificationCategoriesSousCategorieJeuxs.ThesID","ClassificationCategoriesSousCategorieLocMats.ID","ClassificationCategoriesSousCategorieLocMats.SyndicObjectId","ClassificationCategoriesSousCategorieLocMats.ThesCode","ClassificationCategoriesSousCategorieLocMats.ThesID","ClassificationCategoriesSousCategorieNautiquess.ID","ClassificationCategoriesSousCategorieNautiquess.SyndicObjectId","ClassificationCategoriesSousCategorieNautiquess.ThesCode","ClassificationCategoriesSousCategorieNautiquess.ThesID","ClassificationCategoriesSousCategorieVehiculeLoisirs.ID","ClassificationCategoriesSousCategorieVehiculeLoisirs.SyndicObjectId","ClassificationCategoriesSousCategorieVehiculeLoisirs.ThesCode","ClassificationCategoriesSousCategorieVehiculeLoisirs.ThesID","ClassificationCategoriess.ID","ClassificationCategoriess.SyndicObjectId","ClassificationCategoriess.ThesCode","ClassificationCategoriess.ThesID","ClassificationType","ClassificationType.ThesCode","ClassificationType.ThesID","Descriptifaccess.ID","Descriptifaccess.SyndicObjectId","Descriptifss.ID","Descriptifss.SyndicObjectId","Fichiers.DocumentFichier.Url","Fichiers.ID","Fichiers.SyndicObjectId","Handicaps.ID","Handicaps.SyndicObjectId","Handicaps.ThesCode","Handicaps.ThesID","Handicaps.ThesLibelle","IdentifiantSoubik","Labels.ID","Labels.SyndicObjectId","LanguesParleess.ID","LanguesParleess.SyndicObjectId","LanguesParleess.ThesCode","LanguesParleess.ThesID","Lieudit","Lieudit.ThesCode","Lieudit.ThesID","Localisations.ID","Localisations.SyndicObjectId","Localisations.ThesCode","Localisations.ThesID","Marques.ID","Marques.SyndicObjectId","Marques.ThesCode","Marques.ThesID","ModesPaiements.ID","ModesPaiements.SyndicObjectId","ModesPaiements.ThesCode","ModesPaiements.ThesID","Moyencommunications.Complementdinformations","Moyencommunications.Coordonnees","Moyencommunications.ID","Moyencommunications.Moyendecommunication.ThesCode","Moyencommunications.Moyendecommunication.ThesID","Moyencommunications.SyndicObjectId","Moyencommunications.Typedecoordonnees.ThesCode","Moyencommunications.Typedecoordonnees.ThesID","PeriodeOuvertures.Datedebut","PeriodeOuvertures.Datefin","PeriodeOuvertures.ID","PeriodeOuvertures.Precisionssurlesfermetures","PeriodeOuvertures.SyndicObjectId","PeriodeOuvertures.heuredebut1","PeriodeOuvertures.heuredebut2","PeriodeOuvertures.heurefin1","PeriodeOuvertures.heurefin2","Photos.ID","Photos.Licencecreativecommons","Photos.Photo.Url","Photos.SyndicObjectId","PrestationProximites.ID","PrestationProximites.SyndicObjectId","PrestationProximites.ThesCode","PrestationProximites.ThesID","PrestationProximites.ThesLibelle","PrestationsActivites.ID","PrestationsActivites.SyndicObjectId","PrestationsActivites.ThesCode","PrestationsActivites.ThesID","PrestationsActivites.ThesLibelle","PrestationsEquipementss.ID","PrestationsEquipementss.SyndicObjectId","PrestationsEquipementss.ThesCode","PrestationsEquipementss.ThesID","Reservations.ID","Reservations.Lien","Reservations.Listeplateforme.ThesCode","Reservations.Listeplateforme.ThesID","Reservations.Listeplateforme.ThesLibelle","Reservations.SyndicObjectId","Surreservation","SyndicStructureId","Tarifs.Capacites","Tarifs.Datedebutaffichage","Tarifs.Datedebutvalidite","Tarifs.Datefinaffichage","Tarifs.Datefinvalidite","Tarifs.ID","Tarifs.IntituleTarifs","Tarifs.IntituleTarifs.ThesCode","Tarifs.IntituleTarifs.ThesID","Tarifs.IntituleTarifs.ThesLibelle","Tarifs.MaximumEuro","Tarifs.MinimumEuro","Tarifs.Saisonnalite","Tarifs.Saisonnalite.ThesCode","Tarifs.Saisonnalite.ThesID","Tarifs.Saisonnalite.ThesLibelle","Tarifs.SyndicObjectId","Thematiques.ID","Thematiques.SyndicObjectId","Thematiques.ThesCode","Thematiques.ThesID","Videos.ID","Videos.IntegrerlavideosursonsitecopiercollerdeObjetouembedYoutubeouDailymotion","Videos.Licencecreativecommons","Videos.SyndicObjectId","Videos.URLvideo","moniteurcertifies.Expertaccrediteprestationliee","moniteurcertifies.ID","moniteurcertifies.SyndicObjectId"],"canonical_keys":["Adresse1","Adresse2","Adresse3","Capacites","ClassificationCategoriesSousCategorieAdrenalines","ClassificationCategoriesSousCategorieAeronautiques","ClassificationCategoriesSousCategorieAttractionss","ClassificationCategoriesSousCategorieAutress","ClassificationCategoriesSousCategorieExplorations","ClassificationCategoriesSousCategorieJeuxs","ClassificationCategoriesSousCategorieLocMats","ClassificationCategoriesSousCategorieNautiquess","ClassificationCategoriesSousCategorieVehiculeLoisirs","ClassificationCategoriess","ClassificationType","CodeINSEE","CodePostal","Commune","Descriptifaccess","Descriptifss","Fichiers","GmapLatitude","GmapLongitude","LanguesParleess","Lieudit","Localisations","Marques","ModesPaiements","Moyencommunications","Nometablissement","ObjectTypeFix","ObjectTypeName","PeriodeOuvertures","Photos","PrestationsEquipementss","Published","Reservations","SIRET","SyndicObjectName","Tarifs","Thematiques","Updated","Videos"]},{"profile":"tourinsoft_reunion_restauration_v1","paths":["AccessibilitePMR","Animauxs.Complementdinfo","Animauxs.ID","Animauxs.Poidsanimal.ThesCode","Animauxs.Poidsanimal.ThesID","Animauxs.Poidsanimal.ThesLibelle","Animauxs.SyndicObjectId","Capacites.ID","Capacites.SyndicObjectId","Chaines.Groupe","Chaines.Groupe.ThesCode","Chaines.Groupe.ThesID","Chaines.Groupe.ThesLibelle","Chaines.ID","Chaines.Reseaux","Chaines.Reseaux.ThesCode","Chaines.Reseaux.ThesID","Chaines.Reseaux.ThesLibelle","Chaines.SyndicObjectId","ClassificationCategories.ID","ClassificationCategories.SyndicObjectId","ClassificationCategories.ThesCode","ClassificationCategories.ThesID","ClassificationSousCategorieAuberges.ID","ClassificationSousCategorieAuberges.SyndicObjectId","ClassificationSousCategorieAuberges.ThesCode","ClassificationSousCategorieAuberges.ThesID","ClassificationSousCategorieAutreTypes.ID","ClassificationSousCategorieAutreTypes.SyndicObjectId","ClassificationSousCategorieAutreTypes.ThesCode","ClassificationSousCategorieAutreTypes.ThesID","ClassificationSousCategorieRestaurants.ID","ClassificationSousCategorieRestaurants.SyndicObjectId","ClassificationSousCategorieRestaurants.ThesCode","ClassificationSousCategorieRestaurants.ThesID","ClassificationSousCategorieTableHotess.ID","ClassificationSousCategorieTableHotess.SyndicObjectId","ClassificationSousCategorieTableHotess.ThesCode","ClassificationSousCategorieTableHotess.ThesID","ClassificationType.ThesCode","ClassificationType.ThesID","Descriptifaccess.ID","Descriptifaccess.SyndicObjectId","Descriptifss.ID","Descriptifss.SyndicObjectId","Fichiers.DocumentFichier.Url","Fichiers.ID","Fichiers.SyndicObjectId","Handicaps.ID","Handicaps.SyndicObjectId","Handicaps.ThesCode","Handicaps.ThesID","Handicaps.ThesLibelle","IdentifiantSoubik","Labels.ID","Labels.SyndicObjectId","LanguesParleess.ID","LanguesParleess.SyndicObjectId","LanguesParleess.ThesCode","LanguesParleess.ThesID","Lieudit","Lieudit.ThesCode","Lieudit.ThesID","Localisations.ID","Localisations.SyndicObjectId","Localisations.ThesCode","Localisations.ThesID","Marques.ID","Marques.SyndicObjectId","Marques.ThesCode","Marques.ThesID","ModesPaiements.ID","ModesPaiements.SyndicObjectId","ModesPaiements.ThesCode","ModesPaiements.ThesID","Moyencommunications.Complementdinformations","Moyencommunications.Coordonnees","Moyencommunications.ID","Moyencommunications.Moyendecommunication","Moyencommunications.Moyendecommunication.ThesCode","Moyencommunications.Moyendecommunication.ThesID","Moyencommunications.SyndicObjectId","Moyencommunications.Typedecoordonnees.ThesCode","Moyencommunications.Typedecoordonnees.ThesID","PeriodeOuvertures.Datedebut","PeriodeOuvertures.Datefin","PeriodeOuvertures.ID","PeriodeOuvertures.Precisionssurlesfermetures","PeriodeOuvertures.SyndicObjectId","PeriodeOuvertures.heuredebut1","PeriodeOuvertures.heuredebut2","PeriodeOuvertures.heurefin1","PeriodeOuvertures.heurefin2","Photos.ID","Photos.Licencecreativecommons","Photos.Photo","Photos.Photo.Url","Photos.SyndicObjectId","PrestationProximites.ID","PrestationProximites.SyndicObjectId","PrestationProximites.ThesCode","PrestationProximites.ThesID","PrestationProximites.ThesLibelle","PrestationsActivites.ID","PrestationsActivites.SyndicObjectId","PrestationsActivites.ThesCode","PrestationsActivites.ThesID","PrestationsActivites.ThesLibelle","PrestationsEquipementss.ID","PrestationsEquipementss.SyndicObjectId","PrestationsEquipementss.ThesCode","PrestationsEquipementss.ThesID","Reservations.ID","Reservations.Lien","Reservations.Listeplateforme.ThesCode","Reservations.Listeplateforme.ThesID","Reservations.Listeplateforme.ThesLibelle","Reservations.SyndicObjectId","Restaurateurcertifies.Expertaccrediteprestationliee","Restaurateurcertifies.ID","Restaurateurcertifies.SyndicObjectId","Surreservation","SyndicStructureId","Tarifs.Datedebutaffichage","Tarifs.Datedebutvalidite","Tarifs.Datefinaffichage","Tarifs.Datefinvalidite","Tarifs.ID","Tarifs.IntituleTarifs","Tarifs.IntituleTarifs.ThesCode","Tarifs.IntituleTarifs.ThesID","Tarifs.IntituleTarifs.ThesLibelle","Tarifs.MaximumEuro","Tarifs.MinimumEuro","Tarifs.Saisonnalite","Tarifs.Saisonnalite.ThesCode","Tarifs.Saisonnalite.ThesID","Tarifs.Saisonnalite.ThesLibelle","Tarifs.SyndicObjectId","Thematiques.ID","Thematiques.SyndicObjectId","Thematiques.ThesCode","Thematiques.ThesID","Typecuisines.ID","Typecuisines.SyndicObjectId","Typecuisines.ThesCode","Typecuisines.ThesID","Typeequipements.ID","Typeequipements.SyndicObjectId","Typeequipements.Typedactivite.ThesID","Videos.ID","Videos.IntegrerlavideosursonsitecopiercollerdeObjetouembedYoutubeouDailymotion","Videos.Licencecreativecommons","Videos.SyndicObjectId","Videos.URLvideo"],"canonical_keys":["Adresse1","Adresse2","Adresse3","Animauxs","Capacites","ClassificationCategories","ClassificationSousCategorieAuberges","ClassificationSousCategorieAutreTypes","ClassificationSousCategorieRestaurants","ClassificationSousCategorieTableHotess","ClassificationType","CodeINSEE","CodePostal","Commune","Descriptifaccess","Descriptifss","EnLigne","Fichiers","GmapLatitude","GmapLongitude","LanguesParleess","Lieudit","Localisations","Marques","Menuenfant","ModesPaiements","Moyencommunications","Nometablissement","ObjectTypeFix","ObjectTypeName","Ouvertdimanchesoir","PeriodeOuvertures","Photos","PrestationsEquipementss","Published","Receptiongroupe","Reservations","SIRET","SyndicObjectName","Tarifs","Thematiques","Typecuisines","Updated","Videos"]},{"profile":"tourinsoft_reunion_transport_v1","paths":["Chaines.Groupe","Chaines.Groupe.ThesCode","Chaines.Groupe.ThesID","Chaines.Groupe.ThesLibelle","Chaines.ID","Chaines.Reseaux","Chaines.Reseaux.ThesCode","Chaines.Reseaux.ThesID","Chaines.Reseaux.ThesLibelle","Chaines.SyndicObjectId","ClassificationCategories.ID","ClassificationCategories.SyndicObjectId","ClassificationCategories.ThesCode","ClassificationCategories.ThesID","ClassificationSousCategorieLocVehicules.ID","ClassificationSousCategorieLocVehicules.SyndicObjectId","ClassificationSousCategorieLocVehicules.ThesCode","ClassificationSousCategorieLocVehicules.ThesID","ClassificationSousCategorieServicess.ID","ClassificationSousCategorieServicess.SyndicObjectId","ClassificationSousCategorieServicess.ThesCode","ClassificationSousCategorieServicess.ThesID","ClassificationSousCategorieTransAeriens.ID","ClassificationSousCategorieTransAeriens.SyndicObjectId","ClassificationSousCategorieTransAeriens.ThesCode","ClassificationSousCategorieTransAeriens.ThesID","ClassificationType.ThesCode","ClassificationType.ThesID","Descriptifaccess.ID","Descriptifaccess.SyndicObjectId","Descriptifss.ID","Descriptifss.SyndicObjectId","Fichiers.DocumentFichier.Url","Fichiers.ID","Fichiers.SyndicObjectId","Handicaps.ID","Handicaps.SyndicObjectId","Handicaps.ThesCode","Handicaps.ThesID","Handicaps.ThesLibelle","IdentifiantSoubik","Labels.ID","Labels.SyndicObjectId","Labels.ThesCode","Labels.ThesID","LanguesParleess.ID","LanguesParleess.SyndicObjectId","LanguesParleess.ThesCode","LanguesParleess.ThesID","Lieudit","Lieudit.ThesCode","Lieudit.ThesID","Localisations.ID","Localisations.SyndicObjectId","Localisations.ThesCode","Localisations.ThesID","Marques.ID","Marques.SyndicObjectId","Marques.ThesCode","Marques.ThesID","ModesPaiements.ID","ModesPaiements.SyndicObjectId","ModesPaiements.ThesCode","ModesPaiements.ThesID","Moyencommunications.Complementdinformations","Moyencommunications.Coordonnees","Moyencommunications.ID","Moyencommunications.Moyendecommunication","Moyencommunications.Moyendecommunication.ThesCode","Moyencommunications.Moyendecommunication.ThesID","Moyencommunications.SyndicObjectId","Moyencommunications.Typedecoordonnees.ThesCode","Moyencommunications.Typedecoordonnees.ThesID","PeriodeOuvertures.Datedebut","PeriodeOuvertures.Datefin","PeriodeOuvertures.ID","PeriodeOuvertures.Precisionssurlesfermetures","PeriodeOuvertures.SyndicObjectId","PeriodeOuvertures.heuredebut1","PeriodeOuvertures.heuredebut2","PeriodeOuvertures.heurefin1","PeriodeOuvertures.heurefin2","Photos.ID","Photos.Licencecreativecommons","Photos.Photo.Url","Photos.SyndicObjectId","PrestationProximites.ID","PrestationProximites.SyndicObjectId","PrestationProximites.ThesCode","PrestationProximites.ThesID","PrestationProximites.ThesLibelle","PrestationsEquipementss.ID","PrestationsEquipementss.SyndicObjectId","PrestationsEquipementss.ThesCode","PrestationsEquipementss.ThesID","Reservations.ID","Reservations.Lien","Reservations.Listeplateforme.ThesCode","Reservations.Listeplateforme.ThesID","Reservations.Listeplateforme.ThesLibelle","Reservations.SyndicObjectId","Surreservation","SyndicStructureId","Tarifs.Capacites","Tarifs.Datedebutaffichage","Tarifs.Datedebutvalidite","Tarifs.Datefinaffichage","Tarifs.Datefinvalidite","Tarifs.ID","Tarifs.IntituleTarifs","Tarifs.IntituleTarifs.ThesCode","Tarifs.IntituleTarifs.ThesID","Tarifs.IntituleTarifs.ThesLibelle","Tarifs.MaximumEuro","Tarifs.MinimumEuro","Tarifs.Saisonnalite","Tarifs.Saisonnalite.ThesCode","Tarifs.Saisonnalite.ThesID","Tarifs.Saisonnalite.ThesLibelle","Tarifs.SyndicObjectId","Thematiques.ID","Thematiques.SyndicObjectId","Thematiques.ThesCode","Thematiques.ThesID","Transporteurcertifies.Expertaccrediteprestationliee","Transporteurcertifies.ID","Transporteurcertifies.SyndicObjectId","Typeequipements.ID","Typeequipements.SyndicObjectId","Typeequipements.Typedactivite.ThesID","Videos.ID","Videos.IntegrerlavideosursonsitecopiercollerdeObjetouembedYoutubeouDailymotion","Videos.Licencecreativecommons","Videos.SyndicObjectId","Videos.URLvideo"],"canonical_keys":["Adresse1","Adresse2","Adresse3","ClassificationCategories","ClassificationSousCategorieLocVehicules","ClassificationSousCategorieServicess","ClassificationSousCategorieTransAeriens","ClassificationType","CodeINSEE","CodePostal","Commune","Descriptifaccess","Descriptifss","Fichiers","GmapLatitude","GmapLongitude","Labels","LanguesParleess","Lieudit","Localisations","Marques","ModesPaiements","Moyencommunications","Nometablissement","ObjectTypeFix","ObjectTypeName","PeriodeOuvertures","Photos","PrestationsEquipementss","Published","Reservations","SIRET","SyndicObjectName","Tarifs","Thematiques","Updated","Videos"]}]$safe_allowlist$::jsonb) AS entry
CROSS JOIN LATERAL jsonb_array_elements_text(entry->'paths') AS path(value)
ON CONFLICT (profile, path) DO UPDATE SET canonical_owned = EXCLUDED.canonical_owned;

-- True Bertel vocabulary gaps revealed by the current INF/TRA profiles.
INSERT INTO public.ref_code (domain, code, name, parent_id, is_active, is_assignable)
SELECT 'taxonomy_psv', seed.code, seed.name, parent.id, true, true
FROM (VALUES
  ('receptive_travel_agency', 'Agence de voyage réceptive', 'services'),
  ('transfer', 'Transfert de voyageurs', 'transport_mobility'),
  ('passenger_car_rental', 'Location de voiture de tourisme', 'location_vehicule'),
  ('motorhome_rental', 'Location de camping-car', 'location_vehicule'),
  ('four_wheel_drive_rental', 'Location de véhicule 4×4', 'location_vehicule')
) AS seed(code, name, parent_code)
JOIN public.ref_code parent ON parent.domain = 'taxonomy_psv' AND parent.code = seed.parent_code
ON CONFLICT (domain, code) DO UPDATE SET
  name = EXCLUDED.name, parent_id = EXCLUDED.parent_id, is_active = true, is_assignable = true;

INSERT INTO public.ref_capacity_metric (code, name, unit, position, description)
VALUES ('terrace_seats', 'Places assises en terrasse', 'seat', 125,
        'Dedicated restaurant terrace capacity required by the CRT Reunion restaurant profile.')
ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, unit = EXCLUDED.unit, description = EXCLUDED.description;
INSERT INTO public.ref_capacity_applicability (metric_id, object_type)
SELECT id, 'RES'::public.object_type FROM public.ref_capacity_metric WHERE code = 'terrace_seats'
ON CONFLICT DO NOTHING;

INSERT INTO public.ref_tourinsoft_reunion_route (
  variant, object_type, taxonomy_domain, taxonomy_code, target_profile, priority, is_active, notes
) VALUES
  ('reunion-regional-v1','PCU',NULL,NULL,'tourinsoft_reunion_decouverte_v1',100,true,'Patrimoine culturel'),
  ('reunion-regional-v1','PNA',NULL,NULL,'tourinsoft_reunion_decouverte_v1',100,true,'Patrimoine naturel'),
  ('reunion-regional-v1','PRD',NULL,NULL,'tourinsoft_reunion_decouverte_v1',100,true,'Producteur / terroir'),
  ('reunion-regional-v1','LOI',NULL,NULL,'tourinsoft_reunion_decouverte_v1',100,true,'Site de découverte / loisir non encadré'),
  ('reunion-regional-v1','HOT',NULL,NULL,'tourinsoft_reunion_hebergement_v1',100,true,'Hôtellerie'),
  ('reunion-regional-v1','HLO',NULL,NULL,'tourinsoft_reunion_hebergement_v1',100,true,'Hébergement locatif'),
  ('reunion-regional-v1','CAMP',NULL,NULL,'tourinsoft_reunion_hebergement_v1',100,true,'Camping'),
  ('reunion-regional-v1','HPA',NULL,NULL,'tourinsoft_reunion_hebergement_v1',100,true,'Hôtellerie de plein air routed to camping'),
  ('reunion-regional-v1','RVA',NULL,NULL,'tourinsoft_reunion_hebergement_v1',100,true,'Résidence routed to locatif'),
  ('reunion-regional-v1','RES',NULL,NULL,'tourinsoft_reunion_restauration_v1',100,true,'Restauration'),
  ('reunion-regional-v1','PSV',NULL,NULL,'tourinsoft_reunion_transport_v1',200,true,'Transport/service fallback'),
  ('reunion-regional-v1','SPU','taxonomy_spu','tourist_info_office','tourinsoft_reunion_information_service_v1',10,true,'BIT/OTI only; no SPU fallback'),
  ('reunion-regional-v1','PSV','taxonomy_psv','receptive_travel_agency','tourinsoft_reunion_information_service_v1',10,true,'Agence réceptive'),
  ('reunion-regional-v1','PSV','taxonomy_psv','cycle_scooter_rental','tourinsoft_reunion_loisir_plein_air_v1',10,true,'Location de vélo'),
  ('reunion-regional-v1','PSV','taxonomy_psv','v_t_t_autres_cycles','tourinsoft_reunion_loisir_plein_air_v1',10,true,'Location de vélo / VTT')
ON CONFLICT DO NOTHING;

-- Shared controlled values. Family-specific rows override these at serialization time.
INSERT INTO public.ref_interop_value_crosswalk (
  profile, domain, source_code, target_code, target_label, target_external_id, metadata, is_active, notes
) VALUES
  ('tourinsoft_reunion_common_v1','language','fr','FR','Français',NULL,'{}',true,'Observed in current Reunion feeds'),
  ('tourinsoft_reunion_common_v1','language','en','AN','Anglais',NULL,'{}',true,'Observed'),
  ('tourinsoft_reunion_common_v1','language','rcf','CRE','Créole',NULL,'{}',true,'Observed'),
  ('tourinsoft_reunion_common_v1','language','de','AL','Allemand',NULL,'{}',true,'Observed'),
  ('tourinsoft_reunion_common_v1','language','es','ES','Espagnol',NULL,'{}',true,'Observed'),
  ('tourinsoft_reunion_common_v1','language','it','IT','Italien',NULL,'{}',true,'Observed'),
  ('tourinsoft_reunion_common_v1','language','pt','PO','Portugais',NULL,'{}',true,'Observed'),
  ('tourinsoft_reunion_common_v1','language','ar','ARA','Arabe',NULL,'{}',true,'Observed in transport'),
  ('tourinsoft_reunion_common_v1','language','zh','CH','Chinois',NULL,'{}',true,'Observed in découverte'),
  ('tourinsoft_reunion_common_v1','contact_kind','phone','C1','Tél. fixe',NULL,'{}',true,'Observed'),
  ('tourinsoft_reunion_common_v1','contact_kind','fax','C2','Télécopieur /fax',NULL,'{}',true,'Observed'),
  ('tourinsoft_reunion_common_v1','contact_kind','email','C4','Mail',NULL,'{}',true,'Observed'),
  ('tourinsoft_reunion_common_v1','contact_kind','website','C5','Site web (url)',NULL,'{}',true,'Observed'),
  ('tourinsoft_reunion_common_v1','contact_kind','mobile','C6','Tél. mobile',NULL,'{}',true,'Observed'),
  ('tourinsoft_reunion_common_v1','social_network','facebook','FACE','Facebook',NULL,'{}',true,'Observed'),
  ('tourinsoft_reunion_common_v1','social_network','instagram','INSTA','Instagram',NULL,'{}',true,'Observed'),
  ('tourinsoft_reunion_common_v1','payment_method','especes','ES','Espèces',NULL,'{}',true,'Observed'),
  ('tourinsoft_reunion_common_v1','payment_method','cheque','CHQ','Chèques bancaires',NULL,'{}',true,'Observed'),
  ('tourinsoft_reunion_common_v1','payment_method','virement','Virement','Virement bancaire',NULL,'{}',true,'Observed'),
  ('tourinsoft_reunion_common_v1','payment_method','carte_bleue','CB','Cartes bancaires',NULL,'{}',true,'Observed'),
  ('tourinsoft_reunion_common_v1','payment_method','cheque_vacances','VAC','Chèques vacances',NULL,'{}',true,'Observed'),
  ('tourinsoft_reunion_common_v1','payment_method','paypal','PAYPAL','Paypal',NULL,'{}',true,'Observed'),
  ('tourinsoft_reunion_common_v1','payment_method','american_express','AEX','American express',NULL,'{}',true,'Observed'),
  ('tourinsoft_reunion_common_v1','payment_method','tickets_restaurant','TICKETRESTO','Tickets restaurant',NULL,'{}',true,'Observed in restauration'),
  ('tourinsoft_reunion_common_v1','localisation','rural','MRUR','Milieu rural',NULL,'{}',true,'Observed'),
  ('tourinsoft_reunion_common_v1','localisation','centre_ville','CVIL','Centre ville',NULL,'{}',true,'Observed'),
  ('tourinsoft_reunion_common_v1','localisation','bord_mer','LIT','Littoral',NULL,'{}',true,'Observed'),
  ('tourinsoft_reunion_common_v1','localisation','montagne','MONT','Montagne',NULL,'{}',true,'Observed'),
  ('tourinsoft_reunion_common_v1','localisation','volcan','VOLC','Volcan',NULL,'{}',true,'Observed'),
  ('tourinsoft_reunion_common_v1','localisation','ville','VILL','Village',NULL,'{}',true,'Observed'),
  ('tourinsoft_reunion_common_v1','localisation','plage','PLAG','Plage',NULL,'{}',true,'Observed'),
  ('tourinsoft_reunion_common_v1','localisation','littoral_sauvage','LITV','Littoral volcan',NULL,'{}',true,'Observed'),
  ('tourinsoft_reunion_common_v1','theme','volcan','VOLC','Volcan',NULL,'{}',true,'Observed'),
  ('tourinsoft_reunion_common_v1','theme','montagne','MONT','Montagne',NULL,'{}',true,'Observed'),
  ('tourinsoft_reunion_common_v1','theme','riviere','RIVI','Rivière',NULL,'{}',true,'Observed')
ON CONFLICT (profile, domain, source_code) DO UPDATE SET
  target_code = EXCLUDED.target_code, target_label = EXCLUDED.target_label,
  target_external_id = EXCLUDED.target_external_id, metadata = EXCLUDED.metadata,
  is_active = true, notes = EXCLUDED.notes, updated_at = now();

-- Exact target object types; no GUID is hardcoded in the serializer.
INSERT INTO public.ref_interop_value_crosswalk (
  profile, domain, source_code, target_code, target_label, target_external_id, metadata, is_active, notes
) VALUES
  ('tourinsoft_reunion_decouverte_v1','object_type','PCU','DEC','Découverte','C713C5B4-8DE3-4B95-9597-C8206B3EE13C','{}',true,'Current feed'),
  ('tourinsoft_reunion_decouverte_v1','object_type','PNA','DEC','Découverte','C713C5B4-8DE3-4B95-9597-C8206B3EE13C','{}',true,'Current feed'),
  ('tourinsoft_reunion_decouverte_v1','object_type','PRD','DEC','Découverte','C713C5B4-8DE3-4B95-9597-C8206B3EE13C','{}',true,'Current feed'),
  ('tourinsoft_reunion_decouverte_v1','object_type','LOI','DEC','Découverte','C713C5B4-8DE3-4B95-9597-C8206B3EE13C','{}',true,'Current feed'),
  ('tourinsoft_reunion_hebergement_v1','object_type','HOT','HOT','Hôtellerie','25EB2EC5-507B-40A9-A799-2716A0536792','{}',true,'Current feed'),
  ('tourinsoft_reunion_hebergement_v1','object_type','HLO','HLO','Hébergement locatifs','55782D99-B37E-4933-90AD-B79401000C1D','{}',true,'Current feed'),
  ('tourinsoft_reunion_hebergement_v1','object_type','CAMP','CAM','Camping','EECC37A2-050A-45EB-B288-9D288EC3316F','{}',true,'Current feed'),
  ('tourinsoft_reunion_hebergement_v1','object_type','HPA','CAM','Camping','EECC37A2-050A-45EB-B288-9D288EC3316F','{}',true,'Regional route'),
  ('tourinsoft_reunion_hebergement_v1','object_type','RVA','HLO','Hébergement locatifs','55782D99-B37E-4933-90AD-B79401000C1D','{}',true,'Regional route'),
  ('tourinsoft_reunion_information_service_v1','object_type','SPU','INF','Information et service touristique','8A787E66-2FDC-4A4C-95D1-3D08E6C86505','{}',true,'Current feed'),
  ('tourinsoft_reunion_information_service_v1','object_type','PSV','INF','Information et service touristique','8A787E66-2FDC-4A4C-95D1-3D08E6C86505','{}',true,'Current feed'),
  ('tourinsoft_reunion_loisir_plein_air_v1','object_type','ACT','LOI','Loisirs / Plein air','7737C632-EB09-4E81-B3CA-2F1C9BCCAD5D','{}',true,'Current feed'),
  ('tourinsoft_reunion_loisir_plein_air_v1','object_type','ASC','LOI','Loisirs / Plein air','7737C632-EB09-4E81-B3CA-2F1C9BCCAD5D','{}',true,'Current feed'),
  ('tourinsoft_reunion_loisir_plein_air_v1','object_type','PSV','LOI','Loisirs / Plein air','7737C632-EB09-4E81-B3CA-2F1C9BCCAD5D','{}',true,'Cycle rental route'),
  ('tourinsoft_reunion_restauration_v1','object_type','RES','RES','Restauration','BF6C9728-398A-4E02-B258-0B4E945F8574','{}',true,'Current feed'),
  ('tourinsoft_reunion_transport_v1','object_type','PSV','TRA','Transport','1F1D1630-34B0-40E3-99CC-D999FAE76872','{}',true,'Current feed')
ON CONFLICT (profile, domain, source_code) DO UPDATE SET
  target_code = EXCLUDED.target_code, target_label = EXCLUDED.target_label,
  target_external_id = EXCLUDED.target_external_id, is_active = true,
  notes = EXCLUDED.notes, updated_at = now();

-- Fallback category rows are used only when no more precise taxonomy row applies.
INSERT INTO public.ref_interop_value_crosswalk (
  profile, domain, source_code, target_code, target_label, metadata, is_active, notes
) VALUES
  ('tourinsoft_reunion_decouverte_v1','category','PCU','PATC','Patrimoine culturel','{"category_collection":"ClassificationCategories"}',true,'Type fallback'),
  ('tourinsoft_reunion_decouverte_v1','category','PNA','PATN','Patrimoine naturel','{"category_collection":"ClassificationCategories"}',true,'Type fallback'),
  ('tourinsoft_reunion_decouverte_v1','category','PRD','PATA','Patrimoine agricole','{"category_collection":"ClassificationCategories"}',true,'Type fallback'),
  ('tourinsoft_reunion_decouverte_v1','category','LOI','TER','Terroir','{"category_collection":"ClassificationCategories"}',true,'Type fallback'),
  ('tourinsoft_reunion_hebergement_v1','category','HOT','HOT','Hôtellerie','{"category_collection":"Classificationcategories","subcategory_collection":"Classificationsouscategories","subcategory_code":"HOTEL","subcategory_label":"Hôtel"}',true,'Type fallback'),
  ('tourinsoft_reunion_hebergement_v1','category','HLO','LSAI','Locations saisonnières','{"category_collection":"Classificationcategories"}',true,'Type fallback'),
  ('tourinsoft_reunion_hebergement_v1','category','CAMP','CAMP','Camping','{"category_collection":"Classificationcategories","subcategory_collection":"Classificationsouscategories","subcategory_code":"CAMP","subcategory_label":"Camping"}',true,'Type fallback'),
  ('tourinsoft_reunion_hebergement_v1','category','HPA','CAMP','Camping','{"category_collection":"Classificationcategories","subcategory_collection":"Classificationsouscategories","subcategory_code":"CAMP","subcategory_label":"Camping"}',true,'Type fallback'),
  ('tourinsoft_reunion_hebergement_v1','category','RVA','LSAI','Locations saisonnières','{"category_collection":"Classificationcategories"}',true,'Type fallback'),
  ('tourinsoft_reunion_information_service_v1','category','SPU','ACC','Information et services touristique','{"category_collection":"ClassificationCategorie","category_scalar":true,"subcategory_collection":"ClassificationSousCategorieInfoServs","subcategory_code":"OTI","subcategory_label":"Office de tourisme"}',true,'BIT fallback'),
  ('tourinsoft_reunion_information_service_v1','category','PSV','ORG','Organisation de séjours','{"category_collection":"ClassificationCategorie","category_scalar":true,"subcategory_collection":"ClassificationSousCategorieOrgs","subcategory_code":"AVR","subcategory_label":"Agence de voyage réceptive"}',true,'Agency fallback'),
  ('tourinsoft_reunion_loisir_plein_air_v1','category','ACT','EXPLR','Explorations & balades guidées','{"category_collection":"ClassificationCategoriess"}',true,'Type fallback'),
  ('tourinsoft_reunion_loisir_plein_air_v1','category','ASC','EXPLR','Explorations & balades guidées','{"category_collection":"ClassificationCategoriess"}',true,'Type fallback'),
  ('tourinsoft_reunion_loisir_plein_air_v1','category','PSV','LOC V','Location de véhicules de loisir','{"category_collection":"ClassificationCategoriess"}',true,'Cycle rental fallback'),
  ('tourinsoft_reunion_restauration_v1','category','RES','REST','Restaurant','{"category_collection":"ClassificationCategories","subcategory_collection":"ClassificationSousCategorieRestaurants","subcategory_code":"REST","subcategory_label":"Restaurant"}',true,'Type fallback'),
  ('tourinsoft_reunion_transport_v1','category','PSV','SERV','Services','{"category_collection":"ClassificationCategories"}',true,'Type fallback')
ON CONFLICT (profile, domain, source_code) DO UPDATE SET
  target_code = EXCLUDED.target_code, target_label = EXCLUDED.target_label,
  metadata = EXCLUDED.metadata, is_active = true, notes = EXCLUDED.notes, updated_at = now();

INSERT INTO public.ref_interop_value_crosswalk (
  profile, domain, source_code, target_code, target_label, metadata, is_active, notes
) VALUES
  ('tourinsoft_reunion_decouverte_v1','capacity_metric','max_capacity','Capacite','Capacité','{}',true,'Canonical regional serializer'),
  ('tourinsoft_reunion_loisir_plein_air_v1','capacity_metric','max_capacity','Capacite','Capacité','{}',true,'Canonical regional serializer'),
  ('tourinsoft_reunion_restauration_v1','capacity_metric','max_capacity','Capacitetotale','Capacité totale','{}',true,'Canonical regional serializer'),
  ('tourinsoft_reunion_restauration_v1','capacity_metric','seats','Capaciteensalle','Capacité en salle','{}',true,'Canonical regional serializer'),
  ('tourinsoft_reunion_restauration_v1','capacity_metric','terrace_seats','Capaciteenterrasse','Capacité en terrasse','{}',true,'Canonical regional serializer')
ON CONFLICT (profile, domain, source_code) DO UPDATE SET
  target_code = EXCLUDED.target_code, target_label = EXCLUDED.target_label,
  metadata = EXCLUDED.metadata, is_active = true, notes = EXCLUDED.notes, updated_at = now();

CREATE OR REPLACE FUNCTION api.tourinsoft_array_item_key(p_item jsonb)
RETURNS text
LANGUAGE sql
IMMUTABLE
SECURITY INVOKER
SET search_path = api, public, extensions
AS $function$
SELECT CASE WHEN jsonb_typeof(p_item) = 'object' THEN COALESCE(
  CASE WHEN NULLIF(p_item->>'ThesCode', '') IS NOT NULL
    THEN 'thes:' || (p_item->>'ThesCode') END,
  CASE WHEN NULLIF(p_item->>'Coordonnees', '') IS NOT NULL
    THEN 'contact:' || (p_item->>'Coordonnees') END,
  CASE WHEN NULLIF(p_item->>'Lien', '') IS NOT NULL
    THEN 'link:' || (p_item->>'Lien') END,
  CASE WHEN NULLIF(p_item->>'URL', '') IS NOT NULL
    THEN 'url:' || (p_item->>'URL') END,
  CASE WHEN NULLIF(p_item->>'URLvideo', '') IS NOT NULL
    THEN 'video:' || (p_item->>'URLvideo') END,
  CASE WHEN NULLIF(p_item#>>'{Photo,Url}', '') IS NOT NULL
    THEN 'photo:' || (p_item#>>'{Photo,Url}') END,
  CASE WHEN NULLIF(p_item#>>'{DocumentFichier,Url}', '') IS NOT NULL
    THEN 'file:' || (p_item#>>'{DocumentFichier,Url}') END,
  CASE WHEN p_item ?| ARRAY[
      'Datedebutaffichage', 'Datefinvalidite', 'MinimumEuro', 'MaximumEuro'
    ] THEN 'price:' || jsonb_build_array(
      p_item->'Datedebutaffichage',
      p_item->'Datefinvalidite',
      CASE WHEN jsonb_typeof(p_item->'MinimumEuro') = 'number'
        THEN to_jsonb(trim_scale((p_item->>'MinimumEuro')::numeric))
        ELSE p_item->'MinimumEuro' END,
      CASE WHEN jsonb_typeof(p_item->'MaximumEuro') = 'number'
        THEN to_jsonb(trim_scale((p_item->>'MaximumEuro')::numeric))
        ELSE p_item->'MaximumEuro' END
    )::text END,
  CASE WHEN p_item ? 'Datedebut' OR p_item ? 'Datefin'
    THEN 'opening:' || jsonb_build_array(p_item->'Datedebut', p_item->'Datefin')::text END
) END;
$function$;

COMMENT ON FUNCTION api.tourinsoft_array_item_key(jsonb) IS
  'Stable business key used to merge Tourinsoft extension arrays without attaching target identifiers to a different canonical item after reordering.';

CREATE OR REPLACE FUNCTION api.jsonb_deep_overlay(p_base jsonb, p_overlay jsonb)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
SECURITY INVOKER
SET search_path = api, public, extensions
AS $function$
DECLARE
  result jsonb;
  item record;
  overlay_position integer;
  base_position integer;
  matched_position integer;
  base_item jsonb;
  overlay_item jsonb;
  overlay_key text;
  used_positions integer[] := ARRAY[]::integer[];
BEGIN
  IF p_overlay IS NULL THEN
    RETURN p_base;
  ELSIF p_base IS NULL THEN
    RETURN p_overlay;
  ELSIF jsonb_typeof(p_base) = 'object' AND jsonb_typeof(p_overlay) = 'object' THEN
    -- A Tourinsoft identifier is meaningful only for the same controlled value.
    -- When both sides identify different ThesCode values, the canonical object
    -- replaces the extension object rather than inheriting a foreign ThesID.
    IF NULLIF(p_base->>'ThesCode', '') IS NOT NULL
       AND NULLIF(p_overlay->>'ThesCode', '') IS NOT NULL
       AND p_base->>'ThesCode' <> p_overlay->>'ThesCode' THEN
      RETURN p_overlay;
    END IF;
    result := p_base;
    FOR item IN SELECT key, value FROM jsonb_each(p_overlay) ORDER BY key LOOP
      result := jsonb_set(
        result,
        ARRAY[item.key],
        api.jsonb_deep_overlay(p_base -> item.key, item.value),
        true
      );
    END LOOP;
    RETURN result;
  ELSIF jsonb_typeof(p_base) = 'array' AND jsonb_typeof(p_overlay) = 'array' THEN
    result := '[]'::jsonb;
    IF jsonb_array_length(p_overlay) > 0 THEN
      FOR overlay_position IN 0..jsonb_array_length(p_overlay) - 1 LOOP
        overlay_item := p_overlay -> overlay_position;
        overlay_key := api.tourinsoft_array_item_key(overlay_item);
        matched_position := NULL;
        IF overlay_key IS NOT NULL AND jsonb_array_length(p_base) > 0 THEN
          FOR base_position IN 0..jsonb_array_length(p_base) - 1 LOOP
            IF NOT (base_position = ANY(used_positions))
               AND api.tourinsoft_array_item_key(p_base -> base_position) = overlay_key THEN
              matched_position := base_position;
              EXIT;
            END IF;
          END LOOP;
        END IF;
        IF matched_position IS NULL
           AND overlay_position < jsonb_array_length(p_base)
           AND NOT (overlay_position = ANY(used_positions))
           AND (
             overlay_key IS NULL
             OR api.tourinsoft_array_item_key(p_base -> overlay_position) IS NULL
           ) THEN
          matched_position := overlay_position;
        END IF;
        base_item := CASE WHEN matched_position IS NULL THEN NULL ELSE p_base -> matched_position END;
        result := result || jsonb_build_array(api.jsonb_deep_overlay(base_item, overlay_item));
        IF matched_position IS NOT NULL THEN
          used_positions := array_append(used_positions, matched_position);
        END IF;
      END LOOP;
    END IF;
    RETURN result;
  END IF;
  RETURN p_overlay;
END;
$function$;

COMMENT ON FUNCTION api.jsonb_deep_overlay(jsonb, jsonb) IS
  'Recursively overlays canonical Tourinsoft values on a profile extension. Arrays match by stable business key; positional fallback is allowed only when at least one item has no key, and unmatched extension items are not syndicated when a canonical array exists.';

CREATE OR REPLACE FUNCTION api.jsonb_keep_allowed_paths(
  p_value jsonb,
  p_allowed_paths text[],
  p_path text DEFAULT ''
)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
SECURITY INVOKER
SET search_path = api, public, extensions
AS $function$
DECLARE
  result jsonb;
  item record;
  child jsonb;
  next_path text;
BEGIN
  IF p_value IS NULL OR COALESCE(cardinality(p_allowed_paths), 0) = 0 THEN
    RETURN NULL;
  END IF;

  IF jsonb_typeof(p_value) = 'object' THEN
    result := '{}'::jsonb;
    FOR item IN SELECT key, value FROM jsonb_each(p_value) ORDER BY key LOOP
      next_path := CASE WHEN p_path = '' THEN item.key ELSE p_path || '.' || item.key END;
      IF EXISTS (
        SELECT 1 FROM unnest(p_allowed_paths) AS allowed(path)
        WHERE allowed.path = next_path OR allowed.path LIKE next_path || '.%'
      ) THEN
        child := api.jsonb_keep_allowed_paths(item.value, p_allowed_paths, next_path);
        IF child IS NOT NULL THEN
          result := result || jsonb_build_object(item.key, child);
        END IF;
      END IF;
    END LOOP;
    RETURN CASE WHEN result = '{}'::jsonb THEN NULL ELSE result END;
  ELSIF jsonb_typeof(p_value) = 'array' THEN
    result := '[]'::jsonb;
    FOR item IN SELECT value FROM jsonb_array_elements(p_value) LOOP
      child := api.jsonb_keep_allowed_paths(item.value, p_allowed_paths, p_path);
      IF child IS NOT NULL THEN
        result := result || jsonb_build_array(child);
      END IF;
    END LOOP;
    RETURN CASE WHEN result = '[]'::jsonb THEN NULL ELSE result END;
  ELSIF p_path = ANY(p_allowed_paths) THEN
    RETURN p_value;
  END IF;

  RETURN NULL;
END;
$function$;

COMMENT ON FUNCTION api.jsonb_keep_allowed_paths(jsonb, text[], text) IS
  'Recursively retains only explicitly allowlisted Tourinsoft leaf paths; array indexes are ignored so one profile contract applies to every relation item.';

CREATE OR REPLACE FUNCTION api.jsonb_leaf_paths(p_value jsonb, p_path text DEFAULT '')
RETURNS TABLE(path text)
LANGUAGE plpgsql
IMMUTABLE
SECURITY INVOKER
SET search_path = api, public, extensions
AS $function$
DECLARE
  item record;
  next_path text;
BEGIN
  IF p_value IS NULL THEN
    RETURN;
  ELSIF jsonb_typeof(p_value) = 'object' THEN
    FOR item IN SELECT key, value FROM jsonb_each(p_value) ORDER BY key LOOP
      next_path := CASE WHEN p_path = '' THEN item.key ELSE p_path || '.' || item.key END;
      RETURN QUERY SELECT nested.path FROM api.jsonb_leaf_paths(item.value, next_path) nested;
    END LOOP;
  ELSIF jsonb_typeof(p_value) = 'array' THEN
    FOR item IN SELECT value FROM jsonb_array_elements(p_value) LOOP
      RETURN QUERY SELECT nested.path FROM api.jsonb_leaf_paths(item.value, p_path) nested;
    END LOOP;
  ELSIF p_path <> '' THEN
    path := p_path;
    RETURN NEXT;
  END IF;
END;
$function$;

COMMENT ON FUNCTION api.jsonb_leaf_paths(jsonb, text) IS
  'Returns normalized JSON leaf paths without array indexes for Tourinsoft extension allowlist diagnostics.';

CREATE OR REPLACE FUNCTION api.jsonb_remove_unbacked_canonical_keys(
  p_extension jsonb,
  p_canonical jsonb,
  p_canonical_keys text[]
)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
SECURITY INVOKER
SET search_path = api, public, extensions
AS $function$
DECLARE
  result jsonb := CASE WHEN jsonb_typeof(p_extension) = 'object' THEN p_extension ELSE '{}'::jsonb END;
  canonical_key text;
BEGIN
  FOREACH canonical_key IN ARRAY COALESCE(p_canonical_keys, ARRAY[]::text[]) LOOP
    IF NOT COALESCE(p_canonical ? canonical_key, false) THEN
      result := result - canonical_key;
    END IF;
  END LOOP;
  RETURN result;
END;
$function$;

COMMENT ON FUNCTION api.jsonb_remove_unbacked_canonical_keys(jsonb, jsonb, text[]) IS
  'Drops extension-owned copies of canonical fields when Bertel has no public canonical value, preventing an extension from creating private or stale canonical relations.';

CREATE OR REPLACE FUNCTION api.tourinsoft_reunion_resolve_profile(
  p_object_id text,
  p_object_type public.object_type
)
RETURNS text
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = api, public, extensions
AS $function$
WITH candidates AS (
  SELECT r.target_profile, 0 AS fallback_rank, r.priority, closure.depth
  FROM public.ref_tourinsoft_reunion_route r
  JOIN public.object_taxonomy ot
    ON ot.object_id = p_object_id AND ot.domain = r.taxonomy_domain
  JOIN public.ref_code mapped
    ON mapped.domain = r.taxonomy_domain AND mapped.code = r.taxonomy_code
  JOIN public.ref_code_taxonomy_closure closure
    ON closure.domain = r.taxonomy_domain
   AND closure.descendant_id = ot.ref_code_id
   AND closure.ancestor_id = mapped.id
  WHERE r.variant = 'reunion-regional-v1'
    AND r.object_type = p_object_type
    AND r.taxonomy_code IS NOT NULL
    AND r.is_active

  UNION ALL

  SELECT r.target_profile, 1, r.priority, 2147483647
  FROM public.ref_tourinsoft_reunion_route r
  WHERE r.variant = 'reunion-regional-v1'
    AND r.object_type = p_object_type
    AND r.taxonomy_code IS NULL
    AND r.is_active
), route_state AS (
  SELECT count(DISTINCT target_profile) FILTER (WHERE fallback_rank = 0) AS specific_profiles
  FROM candidates
)
SELECT c.target_profile
FROM candidates c CROSS JOIN route_state s
WHERE s.specific_profiles <= 1
ORDER BY c.fallback_rank, c.priority, c.depth, c.target_profile
LIMIT 1;
$function$;

COMMENT ON FUNCTION api.tourinsoft_reunion_resolve_profile(text, public.object_type) IS
  'Returns one exact regional profile. Conflicting taxonomy-specific profiles fail closed and are reported by tourinsoft_reunion_regional_routing_issues().';

CREATE OR REPLACE FUNCTION api.tourinsoft_reunion_regional_documents(p_object_ids text[])
RETURNS TABLE(object_id text, document jsonb)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = api, public, extensions
AS $function$
WITH requested AS (
  SELECT DISTINCT id
  FROM unnest(COALESCE(p_object_ids, ARRAY[]::text[])) AS u(id)
  WHERE id IS NOT NULL
  ORDER BY id
  LIMIT 200
),
routed AS (
  SELECT o.*, selected.target_profile
  FROM requested req
  JOIN public.object o
    ON o.id = req.id
   AND o.status = 'published'
   AND o.commercial_visibility = 'active'
  JOIN LATERAL (
    SELECT api.tourinsoft_reunion_resolve_profile(o.id, o.object_type) AS target_profile
  ) selected ON selected.target_profile IS NOT NULL
),
base AS (
  SELECT o.id, o.object_type::text AS source_type, o.name, o.published_at, o.updated_at,
         o.target_profile, p.slug, p.classification_code, p.classification_label,
         p.access_collection, p.location_collection, p.animal_collection,
         p.social_collection, p.reservation_collection, p.price_collection,
         p.capacity_collection, p.online_field, p.group_acceptance_field,
         p.category_collection, p.category_is_scalar,
         type_x.target_code AS target_type,
         type_x.target_label AS target_type_name,
         type_x.target_external_id AS target_type_id
  FROM routed o
  JOIN public.ref_tourinsoft_reunion_profile p
    ON p.profile = o.target_profile AND p.is_active
  JOIN public.ref_interop_value_crosswalk type_x
    ON type_x.profile = o.target_profile
   AND type_x.domain = 'object_type'
   AND type_x.source_code = o.object_type::text
   AND type_x.is_active
),
descriptions AS (
  SELECT DISTINCT ON (d.object_id)
         d.object_id,
         api.strip_markdown(COALESCE(api.i18n_pick(d.description_chapo_i18n, 'fr', 'fr'), d.description_chapo)) AS accroche,
         api.strip_markdown(COALESCE(api.i18n_pick(d.description_i18n, 'fr', 'fr'), d.description)) AS commerciale
  FROM public.object_description d
  JOIN base b ON b.id = d.object_id
  WHERE d.org_object_id IS NULL AND (d.visibility IS NULL OR d.visibility = 'public')
  ORDER BY d.object_id, NULLIF(d.position, 0) NULLS LAST, d.updated_at DESC, d.id
),
locations AS (
  SELECT DISTINCT ON (l.object_id)
         l.object_id, l.address1, l.address2, l.address3, l.postcode, l.city,
         l.code_insee, l.lieu_dit, api.strip_markdown(l.direction) AS direction,
         l.latitude, l.longitude
  FROM public.object_location l
  JOIN base b ON b.id = l.object_id
  ORDER BY l.object_id, l.is_main_location DESC NULLS LAST,
           NULLIF(l.position, 0) NULLS LAST, l.created_at, l.id
),
contacts AS (
  SELECT c.object_id,
         jsonb_agg(jsonb_build_object(
           'Coordonnees', c.value,
           'Moyendecommunication', jsonb_build_object(
             'ThesCode', x.target_code, 'ThesLibelle', x.target_label
           ),
           'Typedecoordonnees', jsonb_build_object(
             'ThesCode', 'LP002', 'ThesLibelle', 'Professionnelles'
           )
         ) ORDER BY c.is_primary DESC NULLS LAST, NULLIF(c.position, 0) NULLS LAST, rc.position NULLS LAST, c.id) AS items
  FROM public.contact_channel c
  JOIN base b ON b.id = c.object_id
  JOIN public.ref_code_contact_kind rc ON rc.id = c.kind_id
  JOIN public.ref_interop_value_crosswalk x
    ON x.profile = 'tourinsoft_reunion_common_v1'
   AND x.domain = 'contact_kind' AND x.source_code = rc.code AND x.is_active
  WHERE c.is_public IS TRUE AND NULLIF(btrim(c.value), '') IS NOT NULL
  GROUP BY c.object_id
),
socials AS (
  SELECT w.object_id,
         jsonb_agg(jsonb_build_object(
           'Typedeplateforme', jsonb_build_object('ThesCode', x.target_code, 'ThesLibelle', x.target_label),
           'URL', w.value
         ) ORDER BY NULLIF(w.position, 0) NULLS LAST, rc.position NULLS LAST, w.id) AS items
  FROM public.object_web_channel w
  JOIN base b ON b.id = w.object_id
  JOIN public.ref_code_social_network rc ON rc.id = w.kind_id
  JOIN public.ref_interop_value_crosswalk x
    ON x.profile = 'tourinsoft_reunion_common_v1'
   AND x.domain = 'social_network' AND x.source_code = rc.code AND x.is_active
  WHERE w.is_public IS TRUE AND w.value ~* '^https?://'
  GROUP BY w.object_id
),
reservations AS (
  SELECT w.object_id,
         jsonb_agg(jsonb_build_object('Lien', w.value)
           ORDER BY NULLIF(w.position, 0) NULLS LAST, w.id) AS items
  FROM public.object_web_channel w
  JOIN base b ON b.id = w.object_id
  LEFT JOIN public.ref_code rc ON rc.id = w.kind_id
  WHERE w.is_public IS TRUE AND w.value ~* '^https?://'
    AND (w.kind_domain = 'distribution_channel' OR rc.code = 'booking_engine')
  GROUP BY w.object_id
),
photos AS (
  SELECT m.object_id,
         jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
           'Photo', jsonb_strip_nulls(jsonb_build_object(
             'MediaID', m.id::text,
             'Titre', COALESCE(api.i18n_pick(m.title_i18n, 'fr', 'fr'), m.title),
             'Credit', m.credit,
             'Url', m.url
           )),
           'Datedefindutilisation', m.rights_expires_at
         )) ORDER BY m.is_main DESC NULLS LAST, NULLIF(m.position, 0) NULLS LAST, m.created_at, m.id) AS items
  FROM public.media m
  JOIN base b ON b.id = m.object_id
  JOIN public.ref_code_media_type mt ON mt.id = m.media_type_id AND mt.code = 'photo'
  WHERE m.is_published IS TRUE
    AND (m.visibility IS NULL OR m.visibility = 'public')
    AND (m.rights_expires_at IS NULL OR m.rights_expires_at >= CURRENT_DATE)
    AND m.url ~* '^https?://'
  GROUP BY m.object_id
),
videos AS (
  SELECT m.object_id,
         jsonb_agg(jsonb_build_object('URLvideo', m.url)
           ORDER BY m.is_main DESC NULLS LAST, NULLIF(m.position, 0) NULLS LAST, m.created_at, m.id) AS items
  FROM public.media m
  JOIN base b ON b.id = m.object_id
  JOIN public.ref_code_media_type mt ON mt.id = m.media_type_id AND mt.code = 'video'
  WHERE m.is_published IS TRUE
    AND (m.visibility IS NULL OR m.visibility = 'public')
    AND (m.rights_expires_at IS NULL OR m.rights_expires_at >= CURRENT_DATE)
    AND m.url ~* '^https?://'
  GROUP BY m.object_id
),
files AS (
  SELECT od.object_id,
         jsonb_agg(jsonb_build_object(
           'DocumentFichier', jsonb_strip_nulls(jsonb_build_object(
             'MediaID', d.id::text,
             'Titre', COALESCE(od.title, api.i18n_pick(d.title_i18n, 'fr', 'fr'), d.title),
             'Credit', d.issuer,
             'Url', d.url
           ))
         ) ORDER BY od.position, d.position NULLS LAST, d.id) AS items
  FROM public.object_document od
  JOIN base b ON b.id = od.object_id
  JOIN public.ref_document d ON d.id = od.document_id AND d.access_scope = 'public'
  WHERE d.url ~* '^https?://'
    AND (od.valid_from IS NULL OR od.valid_from <= CURRENT_DATE)
    AND (od.valid_to IS NULL OR od.valid_to >= CURRENT_DATE)
    AND (d.valid_from IS NULL OR d.valid_from <= CURRENT_DATE)
    AND (d.valid_to IS NULL OR d.valid_to >= CURRENT_DATE)
  GROUP BY od.object_id
),
languages AS (
  SELECT ol.object_id,
         jsonb_agg(jsonb_build_object('ThesCode', x.target_code, 'ThesLibelle', x.target_label)
           ORDER BY rl.position NULLS LAST, rl.code) AS items
  FROM public.object_language ol
  JOIN base b ON b.id = ol.object_id
  JOIN public.ref_language rl ON rl.id = ol.language_id
  JOIN public.ref_interop_value_crosswalk x
    ON x.profile = 'tourinsoft_reunion_common_v1'
   AND x.domain = 'language' AND x.source_code = rl.code AND x.is_active
  GROUP BY ol.object_id
),
payments AS (
  SELECT op.object_id,
         jsonb_agg(jsonb_build_object('ThesCode', x.target_code, 'ThesLibelle', x.target_label)
           ORDER BY rc.position NULLS LAST, rc.code) AS items
  FROM public.object_payment_method op
  JOIN base b ON b.id = op.object_id
  JOIN public.ref_code_payment_method rc ON rc.id = op.payment_method_id
  JOIN public.ref_interop_value_crosswalk x
    ON x.profile = 'tourinsoft_reunion_common_v1'
   AND x.domain = 'payment_method' AND x.source_code = rc.code AND x.is_active
  GROUP BY op.object_id
),
capacities AS (
  SELECT oc.object_id,
         max(oc.value_integer) FILTER (WHERE cm.code = 'max_capacity') AS max_capacity,
         max(oc.value_integer) FILTER (WHERE cm.code = 'beds') AS beds,
         max(oc.value_integer) FILTER (WHERE cm.code = 'bedrooms') AS bedrooms,
         max(oc.value_integer) FILTER (WHERE cm.code = 'pitches') AS pitches,
         max(oc.value_integer) FILTER (WHERE cm.code = 'floor_area_m2') AS floor_area_m2,
         max(oc.value_integer) FILTER (WHERE cm.code = 'meeting_rooms') AS meeting_rooms,
         max(oc.value_integer) FILTER (WHERE cm.code = 'seats') AS seats,
         max(oc.value_integer) FILTER (WHERE cm.code = 'terrace_seats') AS terrace_seats
  FROM public.object_capacity oc
  JOIN base b ON b.id = oc.object_id
  JOIN public.ref_capacity_metric cm ON cm.id = oc.metric_id
  WHERE (oc.effective_from IS NULL OR oc.effective_from <= CURRENT_DATE)
    AND (oc.effective_to IS NULL OR oc.effective_to >= CURRENT_DATE)
  GROUP BY oc.object_id
),
meeting_rooms AS (
  SELECT mr.object_id, count(*)::integer AS room_count
  FROM public.object_meeting_room mr JOIN base b ON b.id = mr.object_id
  GROUP BY mr.object_id
),
activities AS (
  SELECT a.object_id, a.duration_min, a.min_participants, a.max_participants,
         a.difficulty_level, a.guide_required, a.min_age, a.equipment_provided
  FROM public.object_act a JOIN base b ON b.id = a.object_id
),
pet_policies AS (
  SELECT p.object_id, p.accepted, api.strip_markdown(p.conditions) AS conditions
  FROM public.object_pet_policy p JOIN base b ON b.id = p.object_id
),
group_policies AS (
  SELECT g.object_id, g.min_size, g.max_size, g.group_only, api.strip_markdown(g.notes) AS notes
  FROM public.object_group_policy g JOIN base b ON b.id = g.object_id
),
stay_policies AS (
  SELECT s.object_id, s.check_in_from, s.check_in_until, s.check_out_until
  FROM public.object_stay_policy s JOIN base b ON b.id = s.object_id
),
child_menus AS (
  SELECT m.object_id, true AS has_child_menu
  FROM public.object_menu m
  LEFT JOIN public.ref_code_menu_category c ON c.id = m.category_id
  JOIN base b ON b.id = m.object_id
  WHERE m.is_active IS TRUE AND (m.visibility IS NULL OR m.visibility = 'public')
    AND (c.code = 'menu_enfant' OR immutable_unaccent(lower(m.name)) LIKE '%enfant%')
  GROUP BY m.object_id
),
legal_siret AS (
  SELECT DISTINCT ON (ol.object_id) ol.object_id,
         regexp_replace(candidate.raw_siret, '[^0-9]', '', 'g') AS siret
  FROM public.object_legal ol
  JOIN public.ref_legal_type lt ON lt.id = ol.type_id AND lt.code = 'siret' AND lt.is_public IS TRUE
  JOIN base b ON b.id = ol.object_id
  CROSS JOIN LATERAL (
    SELECT CASE jsonb_typeof(ol.value)
      WHEN 'string' THEN ol.value #>> '{}'
      WHEN 'object' THEN COALESCE(NULLIF(ol.value->>'siret', ''), NULLIF(ol.value->>'value', ''))
    END AS raw_siret
  ) candidate
  WHERE ol.status = 'active' AND ol.valid_from <= CURRENT_DATE
    AND (ol.valid_to IS NULL OR ol.valid_to >= CURRENT_DATE)
    AND regexp_replace(COALESCE(candidate.raw_siret, ''), '[^0-9]', '', 'g') ~ '^[0-9]{14}$'
  ORDER BY ol.object_id, ol.valid_from DESC, ol.updated_at DESC, ol.id
),
prices AS (
  SELECT p.object_id,
         jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
           'Nom', CASE WHEN b.slug IN ('hebergement', 'loisir_plein_air', 'transport')
             THEN concat_ws(' — ', kind.name, unit.name) END,
           'MinimumEuro', p.amount,
           'MaximumEuro', p.amount_max,
           'Datedebutaffichage', p.valid_from,
           'Datefinvalidite', p.valid_to,
           'complementtarifs', api.strip_markdown(p.conditions)
         )) ORDER BY p.valid_from NULLS FIRST, kind.position NULLS LAST, unit.position NULLS LAST, p.id) AS items
  FROM public.object_price p
  JOIN base b ON b.id = p.object_id
  LEFT JOIN public.ref_code_price_kind kind ON kind.id = p.kind_id
  LEFT JOIN public.ref_code_price_unit unit ON unit.id = p.unit_id
  GROUP BY p.object_id, b.target_profile, b.slug
),
opening_slots AS (
  SELECT op.object_id, op.id AS period_id, op.date_start, op.date_end, op.name, op.extra,
         schedule.note AS schedule_note, weekday.dow_number,
         frame.start_time, frame.end_time,
         row_number() OVER (
           PARTITION BY op.id, weekday.dow_number
           ORDER BY frame.start_time NULLS LAST, frame.end_time NULLS LAST, frame.id
         ) AS slot
  FROM public.opening_period op
  JOIN base b ON b.id = op.object_id
  LEFT JOIN public.opening_schedule schedule ON schedule.period_id = op.id
  LEFT JOIN public.opening_time_period time_period
    ON time_period.schedule_id = schedule.id AND time_period.closed IS NOT TRUE
  LEFT JOIN public.opening_time_period_weekday period_weekday ON period_weekday.time_period_id = time_period.id
  LEFT JOIN public.ref_code_weekday weekday ON weekday.id = period_weekday.weekday_id
  LEFT JOIN public.opening_time_frame frame ON frame.time_period_id = time_period.id
  WHERE op.is_closure IS NOT TRUE
),
opening_rows AS (
  SELECT os.object_id, os.period_id,
         jsonb_strip_nulls(jsonb_build_object(
           'Datedebut', min(os.date_start), 'Datefin', max(os.date_end),
           'Precisionssurlesouvertures', api.strip_markdown(concat_ws(' — ', min(os.name), min(os.schedule_note))),
           'lundiheuredebut1', to_char(max(os.start_time) FILTER (WHERE os.dow_number=1 AND os.slot=1), 'HH24:MI'),
           'lundiheurefin1', to_char(max(os.end_time) FILTER (WHERE os.dow_number=1 AND os.slot=1), 'HH24:MI'),
           'lundiheuredebut2', to_char(max(os.start_time) FILTER (WHERE os.dow_number=1 AND os.slot=2), 'HH24:MI'),
           'lundiheurefin2', to_char(max(os.end_time) FILTER (WHERE os.dow_number=1 AND os.slot=2), 'HH24:MI'),
           'mardiheuredebut1', to_char(max(os.start_time) FILTER (WHERE os.dow_number=2 AND os.slot=1), 'HH24:MI'),
           'mardiheurefin1', to_char(max(os.end_time) FILTER (WHERE os.dow_number=2 AND os.slot=1), 'HH24:MI'),
           'mardiheuredebut2', to_char(max(os.start_time) FILTER (WHERE os.dow_number=2 AND os.slot=2), 'HH24:MI'),
           'mardiheurefin2', to_char(max(os.end_time) FILTER (WHERE os.dow_number=2 AND os.slot=2), 'HH24:MI'),
           'mercrediheuredebut1', to_char(max(os.start_time) FILTER (WHERE os.dow_number=3 AND os.slot=1), 'HH24:MI'),
           'mercrediheurefin1', to_char(max(os.end_time) FILTER (WHERE os.dow_number=3 AND os.slot=1), 'HH24:MI'),
           'mercrediheuredebut2', to_char(max(os.start_time) FILTER (WHERE os.dow_number=3 AND os.slot=2), 'HH24:MI'),
           'mercrediheurefin2', to_char(max(os.end_time) FILTER (WHERE os.dow_number=3 AND os.slot=2), 'HH24:MI'),
           'jeudiheuredebut1', to_char(max(os.start_time) FILTER (WHERE os.dow_number=4 AND os.slot=1), 'HH24:MI'),
           'jeudiheurefin1', to_char(max(os.end_time) FILTER (WHERE os.dow_number=4 AND os.slot=1), 'HH24:MI'),
           'jeudiheuredebut2', to_char(max(os.start_time) FILTER (WHERE os.dow_number=4 AND os.slot=2), 'HH24:MI'),
           'jeudiheurefin2', to_char(max(os.end_time) FILTER (WHERE os.dow_number=4 AND os.slot=2), 'HH24:MI'),
           'vendrediheuredebut1', to_char(max(os.start_time) FILTER (WHERE os.dow_number=5 AND os.slot=1), 'HH24:MI'),
           'vendrediheurefin1', to_char(max(os.end_time) FILTER (WHERE os.dow_number=5 AND os.slot=1), 'HH24:MI'),
           'vendrediheuredebut2', to_char(max(os.start_time) FILTER (WHERE os.dow_number=5 AND os.slot=2), 'HH24:MI'),
           'vendrediheurefin2', to_char(max(os.end_time) FILTER (WHERE os.dow_number=5 AND os.slot=2), 'HH24:MI'),
           'samediheuredebut1', to_char(max(os.start_time) FILTER (WHERE os.dow_number=6 AND os.slot=1), 'HH24:MI'),
           'samediheurefin1', to_char(max(os.end_time) FILTER (WHERE os.dow_number=6 AND os.slot=1), 'HH24:MI'),
           'samediheuredebut2', to_char(max(os.start_time) FILTER (WHERE os.dow_number=6 AND os.slot=2), 'HH24:MI'),
           'samediheurefin2', to_char(max(os.end_time) FILTER (WHERE os.dow_number=6 AND os.slot=2), 'HH24:MI'),
           'dimancheheuredebut1', to_char(max(os.start_time) FILTER (WHERE os.dow_number=7 AND os.slot=1), 'HH24:MI'),
           'dimancheheurefin1', to_char(max(os.end_time) FILTER (WHERE os.dow_number=7 AND os.slot=1), 'HH24:MI'),
           'dimancheheuredebut2', to_char(max(os.start_time) FILTER (WHERE os.dow_number=7 AND os.slot=2), 'HH24:MI'),
           'dimancheheurefin2', to_char(max(os.end_time) FILTER (WHERE os.dow_number=7 AND os.slot=2), 'HH24:MI')
         )) AS item,
         bool_or(os.dow_number = 7 AND os.end_time > time '18:00') AS open_sunday_evening
  FROM opening_slots os
  GROUP BY os.object_id, os.period_id
),
openings AS (
  SELECT object_id, jsonb_agg(item ORDER BY item->>'Datedebut', period_id) AS items,
         bool_or(open_sunday_evening) AS open_sunday_evening
  FROM opening_rows GROUP BY object_id
),
amenities AS (
  SELECT oa.object_id,
         jsonb_agg(jsonb_build_object('ThesCode', x.target_code, 'ThesLibelle', x.target_label)
           ORDER BY a.position NULLS LAST, a.code) AS items
  FROM public.object_amenity oa
  JOIN base b ON b.id = oa.object_id
  JOIN public.ref_amenity a ON a.id = oa.amenity_id
  JOIN public.ref_interop_value_crosswalk x
    ON x.profile = b.target_profile AND x.domain = 'amenity'
   AND x.source_code = a.code AND x.is_active
  GROUP BY oa.object_id
),
localisations AS (
  SELECT oe.object_id,
         jsonb_agg(jsonb_build_object('ThesCode', x.target_code, 'ThesLibelle', x.target_label)
           ORDER BY e.position NULLS LAST, e.code) AS items
  FROM public.object_environment_tag oe
  JOIN base b ON b.id = oe.object_id
  JOIN public.ref_code_environment_tag e ON e.id = oe.environment_tag_id
  JOIN public.ref_interop_value_crosswalk x
    ON x.profile = 'tourinsoft_reunion_common_v1' AND x.domain = 'localisation'
   AND x.source_code = e.code AND x.is_active
  GROUP BY oe.object_id
),
themes AS (
  SELECT oe.object_id,
         jsonb_agg(jsonb_build_object('ThesCode', x.target_code, 'ThesLibelle', x.target_label)
           ORDER BY e.position NULLS LAST, e.code) AS items
  FROM public.object_environment_tag oe
  JOIN base b ON b.id = oe.object_id
  JOIN public.ref_code_environment_tag e ON e.id = oe.environment_tag_id
  JOIN public.ref_interop_value_crosswalk x
    ON x.profile = 'tourinsoft_reunion_common_v1' AND x.domain = 'theme'
   AND x.source_code = e.code AND x.is_active
  GROUP BY oe.object_id
),
cuisines AS (
  SELECT oc.object_id,
         jsonb_agg(jsonb_build_object('ThesCode', x.target_code, 'ThesLibelle', x.target_label)
           ORDER BY oc.position, c.position NULLS LAST, c.code) AS items
  FROM public.object_cuisine_type oc
  JOIN base b ON b.id = oc.object_id
  JOIN public.ref_code_cuisine_type c ON c.id = oc.cuisine_type_id
  JOIN public.ref_interop_value_crosswalk x
    ON x.profile = b.target_profile AND x.domain = 'cuisine_type'
   AND x.source_code = c.code AND x.is_active
  GROUP BY oc.object_id
),
classification_items AS (
  SELECT oc.object_id, COALESCE(x.metadata->>'collection', 'Labels') AS collection,
         jsonb_build_object('ThesCode', x.target_code, 'ThesLibelle', x.target_label) AS item
  FROM public.object_classification oc
  JOIN base b ON b.id = oc.object_id
  JOIN public.ref_classification_scheme s ON s.id = oc.scheme_id
  JOIN public.ref_interop_value_crosswalk x
    ON x.profile = b.target_profile AND x.domain = 'classification_scheme'
   AND x.source_code = s.code AND x.is_active
  WHERE (oc.status IS NULL OR oc.status = 'granted')
    AND (oc.valid_until IS NULL OR oc.valid_until >= CURRENT_DATE)
),
classification_collections AS (
  SELECT object_id, collection, jsonb_agg(item ORDER BY item->>'ThesCode') AS items
  FROM (SELECT DISTINCT object_id, collection, item FROM classification_items) dedup
  GROUP BY object_id, collection
),
classification_documents AS (
  SELECT object_id, jsonb_object_agg(collection, items) AS document
  FROM classification_collections GROUP BY object_id
),
taxonomy_specific AS (
  SELECT b.id AS object_id,
         COALESCE(x.metadata->>'category_collection', b.category_collection) AS category_collection,
         COALESCE((x.metadata->>'category_scalar')::boolean, b.category_is_scalar) AS category_scalar,
         COALESCE(x.metadata->>'category_code', x.target_code) AS category_code,
         COALESCE(x.metadata->>'category_label', x.target_label) AS category_label,
         CASE WHEN COALESCE((x.metadata->>'emit_subcategory')::boolean, true)
              THEN x.metadata->>'subcategory_collection' END AS subcategory_collection,
         CASE WHEN COALESCE((x.metadata->>'emit_subcategory')::boolean, true)
              THEN x.target_code END AS subcategory_code,
         CASE WHEN COALESCE((x.metadata->>'emit_subcategory')::boolean, true)
              THEN x.target_label END AS subcategory_label
  FROM base b
  JOIN public.object_taxonomy ot ON ot.object_id = b.id
  JOIN public.ref_code rc ON rc.id = ot.ref_code_id AND rc.domain = ot.domain
  JOIN public.ref_interop_value_crosswalk x
    ON x.profile = b.target_profile AND x.domain = ot.domain
   AND x.source_code = rc.code AND x.is_active
),
taxonomy_fallback AS (
  SELECT b.id AS object_id,
         COALESCE(x.metadata->>'category_collection', b.category_collection) AS category_collection,
         COALESCE((x.metadata->>'category_scalar')::boolean, b.category_is_scalar) AS category_scalar,
         x.target_code AS category_code, x.target_label AS category_label,
         x.metadata->>'subcategory_collection' AS subcategory_collection,
         x.metadata->>'subcategory_code' AS subcategory_code,
         x.metadata->>'subcategory_label' AS subcategory_label
  FROM base b
  JOIN public.ref_interop_value_crosswalk x
    ON x.profile = b.target_profile AND x.domain = 'category'
   AND x.source_code = b.source_type AND x.is_active
  WHERE NOT EXISTS (SELECT 1 FROM taxonomy_specific t WHERE t.object_id = b.id)
),
taxonomy_resolved AS (
  SELECT * FROM taxonomy_specific
  UNION ALL
  SELECT * FROM taxonomy_fallback
),
taxonomy_items AS (
  SELECT object_id, category_collection AS collection, category_scalar AS scalar,
         jsonb_build_object('ThesCode', category_code, 'ThesLibelle', category_label) AS item
  FROM taxonomy_resolved WHERE category_collection IS NOT NULL AND category_code IS NOT NULL
  UNION ALL
  SELECT object_id, subcategory_collection, false,
         jsonb_build_object('ThesCode', subcategory_code, 'ThesLibelle', subcategory_label)
  FROM taxonomy_resolved WHERE subcategory_collection IS NOT NULL AND subcategory_code IS NOT NULL
),
taxonomy_collections AS (
  SELECT object_id, collection, bool_or(scalar) AS scalar,
         jsonb_agg(item ORDER BY item->>'ThesCode') AS items
  FROM (SELECT DISTINCT object_id, collection, scalar, item FROM taxonomy_items) dedup
  GROUP BY object_id, collection
),
taxonomy_documents AS (
  SELECT object_id,
         jsonb_object_agg(collection, CASE WHEN scalar THEN items->0 ELSE items END) AS document
  FROM taxonomy_collections GROUP BY object_id
),
extensions AS (
  SELECT e.object_id, e.external_id,
         api.jsonb_keep_allowed_paths(e.data, allowed.paths) AS data,
         allowed.canonical_keys
  FROM public.object_interop_extension e
  JOIN base b ON b.id = e.object_id AND b.target_profile = e.profile
  LEFT JOIN LATERAL (
    SELECT array_agg(field.path ORDER BY field.path) AS paths,
           array_agg(DISTINCT split_part(field.path, '.', 1)
             ORDER BY split_part(field.path, '.', 1))
             FILTER (WHERE field.canonical_owned) AS canonical_keys
    FROM public.ref_tourinsoft_reunion_extension_field field
    WHERE field.profile = e.profile
  ) allowed ON true
),
canonical_documents AS (
SELECT b.id AS object_id,
       jsonb_strip_nulls(
          jsonb_build_object(
            'SyndicObjectName', b.name,
           'Nometablissement', b.name,
           'ObjectTypeName', b.target_type_name,
           'ObjectTypeFix', b.target_type_id,
           'Published', COALESCE(b.published_at, b.updated_at),
           'Updated', b.updated_at,
           'ClassificationType', jsonb_build_object(
             'ThesCode', b.classification_code, 'ThesLibelle', b.classification_label
           ),
           'Adresse1', loc.address1,
           'Adresse2', loc.address2,
           'Adresse3', loc.address3,
           'CodePostal', loc.postcode,
           'Commune', loc.city,
           'CodeINSEE', loc.code_insee,
           'GmapLatitude', CASE WHEN loc.latitude IS NOT NULL THEN loc.latitude::text END,
           'GmapLongitude', CASE WHEN loc.longitude IS NOT NULL THEN loc.longitude::text END,
           'Lieudit', CASE WHEN loc.lieu_dit IS NOT NULL THEN jsonb_build_object('ThesLibelle', loc.lieu_dit) END,
           'SIRET', legal.siret,
           'Descriptifss', CASE WHEN description.accroche IS NOT NULL OR description.commerciale IS NOT NULL
             THEN jsonb_build_array(jsonb_strip_nulls(jsonb_build_object(
               'Accroche', description.accroche, 'Descriptioncommerciale', description.commerciale
             ))) END,
           'Moyencommunications', contact.items,
           'Photos', photo.items,
           'Videos', video.items,
           'Fichiers', file.items,
           'LanguesParleess', language.items,
           'ModesPaiements', payment.items,
           'PrestationsEquipementss', amenity.items,
           'Thematiques', theme.items,
           'Typecuisines', CASE WHEN b.slug = 'restauration' THEN cuisine.items END,
           'PeriodeOuvertures', opening.items,
           'Menuenfant', CASE WHEN b.slug = 'restauration' THEN child_menu.has_child_menu END,
           'Ouvertdimanchesoir', CASE WHEN b.slug = 'restauration' THEN opening.open_sunday_evening END,
           b.access_collection, CASE WHEN loc.direction IS NOT NULL THEN
             jsonb_build_array(jsonb_build_object('Descriptifduplandacces', loc.direction)) END,
           b.location_collection, localisation.items,
           'Capacitecampings', CASE WHEN b.slug = 'hebergement' AND b.target_type = 'CAM' AND capacity.object_id IS NOT NULL
             THEN jsonb_build_array(jsonb_strip_nulls(jsonb_build_object(
               'Capacite', capacity.max_capacity,
               'Nombredeproduits', capacity.pitches,
               'Superficieduterrain', capacity.floor_area_m2
             ))) END,
           'Horairearriveedeparts', CASE WHEN b.slug = 'hebergement' AND stay.object_id IS NOT NULL AND
             (stay.check_in_from IS NOT NULL OR stay.check_in_until IS NOT NULL OR stay.check_out_until IS NOT NULL)
             THEN jsonb_build_array(jsonb_strip_nulls(jsonb_build_object(
               'Heuredarrivee', stay.check_in_from,
               'Heuredarriveemax', stay.check_in_until,
               'Heurededepart', stay.check_out_until
             ))) END
         )
         || CASE WHEN b.online_field IS NOT NULL
              THEN jsonb_build_object(b.online_field, true) ELSE '{}'::jsonb END
         || CASE WHEN b.social_collection IS NOT NULL AND social.items IS NOT NULL
              THEN jsonb_build_object(b.social_collection, social.items) ELSE '{}'::jsonb END
         || CASE WHEN b.reservation_collection IS NOT NULL AND reservation.items IS NOT NULL
              THEN jsonb_build_object(b.reservation_collection, reservation.items) ELSE '{}'::jsonb END
         || CASE WHEN b.price_collection IS NOT NULL AND price.items IS NOT NULL
              THEN jsonb_build_object(b.price_collection, price.items) ELSE '{}'::jsonb END
         || CASE WHEN b.group_acceptance_field IS NOT NULL AND group_policy.object_id IS NOT NULL
              THEN jsonb_build_object(b.group_acceptance_field, true) ELSE '{}'::jsonb END
         || CASE WHEN b.animal_collection IS NOT NULL AND pet_policy.object_id IS NOT NULL
              THEN jsonb_build_object(
                b.animal_collection,
                jsonb_build_array(jsonb_strip_nulls(jsonb_build_object(
                  'Animauxacceptes', pet_policy.accepted,
                  'Complementdinformations', pet_policy.conditions
                )))
              ) ELSE '{}'::jsonb END
         || CASE WHEN b.capacity_collection IS NOT NULL THEN
              CASE
                WHEN b.slug = 'restauration' AND capacity.object_id IS NOT NULL THEN
                  jsonb_build_object(b.capacity_collection, jsonb_build_array(
                    jsonb_strip_nulls(jsonb_build_object(
                      'Capacitetotale', capacity.max_capacity,
                      'Capaciteensalle', capacity.seats,
                      'Capaciteenterrasse', capacity.terrace_seats
                    ))))
                WHEN b.slug = 'hebergement'
                     AND (capacity.object_id IS NOT NULL OR meeting.room_count IS NOT NULL) THEN
                  jsonb_build_object(b.capacity_collection, jsonb_build_array(
                    jsonb_strip_nulls(jsonb_build_object(
                      'Capacitetotalenombredepersonnes', capacity.max_capacity,
                      'Nombredelits', capacity.beds,
                      'Nombretotaldechambres', capacity.bedrooms,
                      'Surfacedelhabitation', capacity.floor_area_m2,
                      'Salledereunion', CASE WHEN COALESCE(meeting.room_count, capacity.meeting_rooms, 0) > 0 THEN true END
                    ))))
                WHEN COALESCE(activity.max_participants, capacity.max_capacity) IS NOT NULL THEN
                  jsonb_build_object(b.capacity_collection, jsonb_build_array(
                    jsonb_build_object('Capacite', COALESCE(activity.max_participants, capacity.max_capacity))))
                ELSE '{}'::jsonb
              END
            ELSE '{}'::jsonb END
         || COALESCE(taxonomy.document, '{}'::jsonb)
         || COALESCE(classification.document, '{}'::jsonb)
         ) AS document
FROM base b
LEFT JOIN descriptions description ON description.object_id = b.id
LEFT JOIN locations loc ON loc.object_id = b.id
LEFT JOIN contacts contact ON contact.object_id = b.id
LEFT JOIN socials social ON social.object_id = b.id
LEFT JOIN reservations reservation ON reservation.object_id = b.id
LEFT JOIN photos photo ON photo.object_id = b.id
LEFT JOIN videos video ON video.object_id = b.id
LEFT JOIN files file ON file.object_id = b.id
LEFT JOIN languages language ON language.object_id = b.id
LEFT JOIN payments payment ON payment.object_id = b.id
LEFT JOIN capacities capacity ON capacity.object_id = b.id
LEFT JOIN meeting_rooms meeting ON meeting.object_id = b.id
LEFT JOIN activities activity ON activity.object_id = b.id
LEFT JOIN pet_policies pet_policy ON pet_policy.object_id = b.id
LEFT JOIN group_policies group_policy ON group_policy.object_id = b.id
LEFT JOIN stay_policies stay ON stay.object_id = b.id
LEFT JOIN child_menus child_menu ON child_menu.object_id = b.id
LEFT JOIN legal_siret legal ON legal.object_id = b.id
LEFT JOIN prices price ON price.object_id = b.id
LEFT JOIN openings opening ON opening.object_id = b.id
LEFT JOIN amenities amenity ON amenity.object_id = b.id
LEFT JOIN localisations localisation ON localisation.object_id = b.id
LEFT JOIN themes theme ON theme.object_id = b.id
LEFT JOIN cuisines cuisine ON cuisine.object_id = b.id
LEFT JOIN classification_documents classification ON classification.object_id = b.id
LEFT JOIN taxonomy_documents taxonomy ON taxonomy.object_id = b.id
),
wire_documents AS (
  SELECT canonical.object_id,
         canonical.document
           || CASE WHEN ext.external_id IS NOT NULL
                THEN jsonb_build_object('SyndicObjectID', ext.external_id)
                ELSE '{}'::jsonb
              END AS document,
         ext.data AS extension_data,
         ext.canonical_keys
  FROM canonical_documents canonical
  LEFT JOIN extensions ext ON ext.object_id = canonical.object_id
)
SELECT wire.object_id,
       api.jsonb_deep_overlay(
         api.jsonb_remove_unbacked_canonical_keys(
           COALESCE(wire.extension_data, '{}'::jsonb),
           wire.document,
           wire.canonical_keys
         ),
         wire.document
       ) AS document
FROM wire_documents wire
ORDER BY wire.object_id;
$function$;

COMMENT ON FUNCTION api.tourinsoft_reunion_regional_documents(text[]) IS
  'Set-based, taxonomy-routed public projection for the six current Tourinsoft CRT Reunion families; max 200 ids, canonical fields override service-only partner extensions.';

CREATE OR REPLACE FUNCTION api.get_object_tourinsoft(
  p_object_id text,
  p_variant text DEFAULT 'legacy-v1'
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = api, public, extensions
AS $function$
DECLARE
  v_document jsonb;
BEGIN
  IF p_variant IS NULL OR p_variant = '' OR p_variant = 'legacy-v1' THEN
    RETURN api.get_object_interop(p_object_id, 'tourinsoft');
  ELSIF p_variant = 'reunion-hebergement-v1' THEN
    SELECT d.document INTO v_document
    FROM api.tourinsoft_reunion_documents(ARRAY[p_object_id]) d
    WHERE d.object_id = p_object_id;
    RETURN v_document;
  ELSIF p_variant = 'reunion-regional-v1' THEN
    SELECT d.document INTO v_document
    FROM api.tourinsoft_reunion_regional_documents(ARRAY[p_object_id]) d
    WHERE d.object_id = p_object_id;
    RETURN v_document;
  END IF;
  RETURN NULL;
END;
$function$;

CREATE OR REPLACE FUNCTION api.get_objects_tourinsoft_batch(
  p_object_ids text[],
  p_variant text DEFAULT 'legacy-v1'
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = api, public, extensions
AS $function$
DECLARE
  v_documents jsonb;
BEGIN
  IF p_variant IS NULL OR p_variant = '' OR p_variant = 'legacy-v1' THEN
    RETURN api.get_objects_interop_batch(p_object_ids, 'tourinsoft');
  ELSIF p_variant = 'reunion-hebergement-v1' THEN
    SELECT COALESCE(jsonb_object_agg(d.object_id, d.document ORDER BY d.object_id), '{}'::jsonb)
    INTO v_documents FROM api.tourinsoft_reunion_documents(p_object_ids) d;
    RETURN v_documents;
  ELSIF p_variant = 'reunion-regional-v1' THEN
    SELECT COALESCE(jsonb_object_agg(d.object_id, d.document ORDER BY d.object_id), '{}'::jsonb)
    INTO v_documents FROM api.tourinsoft_reunion_regional_documents(p_object_ids) d;
    RETURN v_documents;
  END IF;
  RETURN '{}'::jsonb;
END;
$function$;

CREATE OR REPLACE FUNCTION api.tourinsoft_reunion_regional_unmapped_values()
RETURNS TABLE(profile text, domain text, source_code text, source_label text, object_count bigint)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = api, public, extensions
AS $function$
WITH published AS (
  SELECT o.id, o.object_type, selected.target_profile
  FROM public.object o
  JOIN LATERAL (
    SELECT api.tourinsoft_reunion_resolve_profile(o.id, o.object_type) AS target_profile
  ) selected ON selected.target_profile IS NOT NULL
  WHERE o.status = 'published' AND o.commercial_visibility = 'active'
),
used AS (
  SELECT p.target_profile AS profile, 'object_type'::text AS domain,
         p.object_type::text AS source_code, p.object_type::text AS source_label,
         count(DISTINCT p.id)::bigint AS object_count
  FROM published p GROUP BY p.target_profile, p.object_type
  UNION ALL
  SELECT p.target_profile, ot.domain, rc.code, rc.name, count(DISTINCT p.id)::bigint
  FROM published p
  JOIN public.object_taxonomy ot ON ot.object_id = p.id
  JOIN public.ref_code rc ON rc.id = ot.ref_code_id AND rc.domain = ot.domain
  GROUP BY p.target_profile, ot.domain, rc.code, rc.name
  UNION ALL
  SELECT 'tourinsoft_reunion_common_v1', 'language', rc.code, rc.name, count(DISTINCT p.id)::bigint
  FROM published p JOIN public.object_language ol ON ol.object_id = p.id
  JOIN public.ref_language rc ON rc.id = ol.language_id GROUP BY rc.code, rc.name
  UNION ALL
  SELECT 'tourinsoft_reunion_common_v1', 'contact_kind', rc.code, rc.name, count(DISTINCT p.id)::bigint
  FROM published p JOIN public.contact_channel c ON c.object_id = p.id AND c.is_public IS TRUE
  JOIN public.ref_code_contact_kind rc ON rc.id = c.kind_id GROUP BY rc.code, rc.name
  UNION ALL
  SELECT 'tourinsoft_reunion_common_v1', 'social_network', rc.code, rc.name, count(DISTINCT p.id)::bigint
  FROM published p JOIN public.object_web_channel w ON w.object_id = p.id AND w.is_public IS TRUE
  JOIN public.ref_code_social_network rc ON rc.id = w.kind_id
  WHERE w.kind_domain = 'social_network'
  GROUP BY rc.code, rc.name
  UNION ALL
  SELECT 'tourinsoft_reunion_common_v1', 'payment_method', rc.code, rc.name, count(DISTINCT p.id)::bigint
  FROM published p JOIN public.object_payment_method op ON op.object_id = p.id
  JOIN public.ref_code_payment_method rc ON rc.id = op.payment_method_id GROUP BY rc.code, rc.name
  UNION ALL
  SELECT p.target_profile, 'amenity', rc.code, rc.name, count(DISTINCT p.id)::bigint
  FROM published p JOIN public.object_amenity oa ON oa.object_id = p.id
  JOIN public.ref_amenity rc ON rc.id = oa.amenity_id GROUP BY p.target_profile, rc.code, rc.name
  UNION ALL
  SELECT p.target_profile, 'cuisine_type', rc.code, rc.name, count(DISTINCT p.id)::bigint
  FROM published p JOIN public.object_cuisine_type oc ON oc.object_id = p.id
  JOIN public.ref_code_cuisine_type rc ON rc.id = oc.cuisine_type_id
  GROUP BY p.target_profile, rc.code, rc.name
  UNION ALL
  SELECT 'tourinsoft_reunion_common_v1', 'localisation', rc.code, rc.name, count(DISTINCT p.id)::bigint
  FROM published p JOIN public.object_environment_tag oe ON oe.object_id = p.id
  JOIN public.ref_code_environment_tag rc ON rc.id = oe.environment_tag_id
  GROUP BY rc.code, rc.name
  UNION ALL
  SELECT 'tourinsoft_reunion_common_v1', 'theme', rc.code, rc.name, count(DISTINCT p.id)::bigint
  FROM published p JOIN public.object_environment_tag oe ON oe.object_id = p.id
  JOIN public.ref_code_environment_tag rc ON rc.id = oe.environment_tag_id
  GROUP BY rc.code, rc.name
  UNION ALL
  SELECT p.target_profile, 'classification_scheme', scheme.code, scheme.name,
         count(DISTINCT p.id)::bigint
  FROM published p JOIN public.object_classification oc ON oc.object_id = p.id
  JOIN public.ref_classification_scheme scheme ON scheme.id = oc.scheme_id
  WHERE (oc.status IS NULL OR oc.status = 'granted')
    AND (oc.valid_until IS NULL OR oc.valid_until >= CURRENT_DATE)
  GROUP BY p.target_profile, scheme.code, scheme.name
  UNION ALL
  SELECT p.target_profile, 'capacity_metric', metric.code, metric.name,
         count(DISTINCT p.id)::bigint
  FROM published p
  JOIN public.ref_tourinsoft_reunion_profile profile
    ON profile.profile = p.target_profile AND profile.capacity_collection IS NOT NULL
  JOIN public.object_capacity capacity ON capacity.object_id = p.id
  JOIN public.ref_capacity_metric metric ON metric.id = capacity.metric_id
  WHERE (capacity.effective_from IS NULL OR capacity.effective_from <= CURRENT_DATE)
    AND (capacity.effective_to IS NULL OR capacity.effective_to >= CURRENT_DATE)
  GROUP BY p.target_profile, metric.code, metric.name
)
SELECT u.profile, u.domain, u.source_code, u.source_label, sum(u.object_count)::bigint
FROM used u
LEFT JOIN public.ref_interop_value_crosswalk x
  ON x.profile = u.profile AND x.domain = u.domain
 AND x.source_code = u.source_code AND x.is_active
WHERE x.source_code IS NULL
GROUP BY u.profile, u.domain, u.source_code, u.source_label
ORDER BY u.profile, u.domain, u.source_code;
$function$;

CREATE OR REPLACE FUNCTION api.tourinsoft_reunion_regional_routing_issues()
RETURNS TABLE(object_id text, object_type text, issue text, candidate_profiles text[])
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = api, public, extensions
AS $function$
WITH published AS (
  SELECT o.id, o.object_type
  FROM public.object o
  WHERE o.status = 'published' AND o.commercial_visibility = 'active'
), candidates AS (
  SELECT o.id AS object_id, r.target_profile, 0 AS fallback_rank
  FROM published o
  JOIN public.ref_tourinsoft_reunion_route r
    ON r.variant = 'reunion-regional-v1'
   AND r.object_type = o.object_type
   AND r.taxonomy_code IS NOT NULL
   AND r.is_active
  JOIN public.object_taxonomy ot
    ON ot.object_id = o.id AND ot.domain = r.taxonomy_domain
  JOIN public.ref_code mapped
    ON mapped.domain = r.taxonomy_domain AND mapped.code = r.taxonomy_code
  JOIN public.ref_code_taxonomy_closure closure
    ON closure.domain = r.taxonomy_domain
   AND closure.descendant_id = ot.ref_code_id
   AND closure.ancestor_id = mapped.id

  UNION ALL

  SELECT o.id, r.target_profile, 1
  FROM published o
  JOIN public.ref_tourinsoft_reunion_route r
    ON r.variant = 'reunion-regional-v1'
   AND r.object_type = o.object_type
   AND r.taxonomy_code IS NULL
   AND r.is_active
), aggregated AS (
  SELECT o.id, o.object_type,
         count(c.target_profile) AS candidate_count,
         count(DISTINCT c.target_profile) FILTER (WHERE c.fallback_rank = 0) AS specific_profile_count,
         COALESCE(
           array_agg(DISTINCT c.target_profile ORDER BY c.target_profile)
             FILTER (WHERE c.target_profile IS NOT NULL),
           ARRAY[]::text[]
         ) AS candidate_profiles
  FROM published o
  LEFT JOIN candidates c ON c.object_id = o.id
  GROUP BY o.id, o.object_type
), resolved AS (
  SELECT a.*, api.tourinsoft_reunion_resolve_profile(a.id, a.object_type) AS target_profile
  FROM aggregated a
)
SELECT r.id, r.object_type::text,
       CASE
         WHEN r.candidate_count = 0 THEN 'unroutable'
         WHEN r.specific_profile_count > 1 THEN 'ambiguous_specific_routes'
         WHEN r.target_profile IS NOT NULL AND x.source_code IS NULL THEN 'missing_object_type_crosswalk'
         WHEN r.specific_profile_count = 0 AND r.object_type IN ('HLO', 'RES')
           THEN 'provisional_type_fallback'
         ELSE 'missing_object_type_crosswalk'
       END,
       r.candidate_profiles
FROM resolved r
LEFT JOIN public.ref_interop_value_crosswalk x
  ON x.profile = r.target_profile
 AND x.domain = 'object_type'
 AND x.source_code = r.object_type::text
 AND x.is_active
WHERE r.candidate_count = 0
   OR r.specific_profile_count > 1
   OR (r.target_profile IS NOT NULL AND x.source_code IS NULL)
   OR (r.specific_profile_count = 0 AND r.object_type IN ('HLO', 'RES'))
ORDER BY r.id;
$function$;

COMMENT ON FUNCTION api.tourinsoft_reunion_regional_routing_issues() IS
  'Service-only review queue for published objects that are unroutable, have conflicting taxonomy-specific profiles, rely on provisional HLO/RES type fallbacks, or lack the target object-type crosswalk.';

CREATE OR REPLACE FUNCTION api.tourinsoft_reunion_regional_extension_issues()
RETURNS TABLE(object_id text, profile text, issue text, paths text[])
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = api, public, extensions
AS $function$
SELECT e.object_id,
       e.profile,
       'extension_field_not_allowed'::text AS issue,
       array_agg(DISTINCT leaf.path ORDER BY leaf.path) AS paths
FROM public.object_interop_extension e
CROSS JOIN LATERAL api.jsonb_leaf_paths(e.data) leaf
LEFT JOIN public.ref_tourinsoft_reunion_extension_field allowed
  ON allowed.profile = e.profile AND allowed.path = leaf.path
WHERE allowed.path IS NULL
GROUP BY e.object_id, e.profile
ORDER BY e.object_id, e.profile;
$function$;

COMMENT ON FUNCTION api.tourinsoft_reunion_regional_extension_issues() IS
  'Service-only review queue for stored extension leaves rejected by the profile allowlist and therefore omitted from syndication.';

REVOKE ALL ON FUNCTION api.tourinsoft_reunion_regional_documents(text[]) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION api.tourinsoft_array_item_key(jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION api.jsonb_deep_overlay(jsonb, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION api.jsonb_keep_allowed_paths(jsonb, text[], text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION api.jsonb_leaf_paths(jsonb, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION api.jsonb_remove_unbacked_canonical_keys(jsonb, jsonb, text[]) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION api.tourinsoft_reunion_resolve_profile(text, public.object_type) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION api.get_object_tourinsoft(text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION api.get_objects_tourinsoft_batch(text[], text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION api.tourinsoft_reunion_regional_unmapped_values() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION api.tourinsoft_reunion_regional_routing_issues() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION api.tourinsoft_reunion_regional_extension_issues() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION api.tourinsoft_reunion_regional_documents(text[]) TO service_role;
GRANT EXECUTE ON FUNCTION api.tourinsoft_array_item_key(jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION api.jsonb_deep_overlay(jsonb, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION api.jsonb_keep_allowed_paths(jsonb, text[], text) TO service_role;
GRANT EXECUTE ON FUNCTION api.jsonb_leaf_paths(jsonb, text) TO service_role;
GRANT EXECUTE ON FUNCTION api.jsonb_remove_unbacked_canonical_keys(jsonb, jsonb, text[]) TO service_role;
GRANT EXECUTE ON FUNCTION api.tourinsoft_reunion_resolve_profile(text, public.object_type) TO service_role;
GRANT EXECUTE ON FUNCTION api.get_object_tourinsoft(text, text) TO service_role;
GRANT EXECUTE ON FUNCTION api.get_objects_tourinsoft_batch(text[], text) TO service_role;
GRANT EXECUTE ON FUNCTION api.tourinsoft_reunion_regional_unmapped_values() TO service_role;
GRANT EXECUTE ON FUNCTION api.tourinsoft_reunion_regional_routing_issues() TO service_role;
GRANT EXECUTE ON FUNCTION api.tourinsoft_reunion_regional_extension_issues() TO service_role;

-- Taxonomy leaf -> exact Tourinsoft category/subcategory. Metadata controls wire collection names.
INSERT INTO public.ref_interop_value_crosswalk (
  profile, domain, source_code, target_code, target_label, metadata, is_active, notes
) VALUES
  ('tourinsoft_reunion_decouverte_v1','taxonomy_pcu','museum','MUSE','Musée','{"category_collection":"ClassificationCategories","category_code":"PATC","category_label":"Patrimoine culturel","subcategory_collection":"ClassificationSousCategoriePatCulturels"}',true,'Observed'),
  ('tourinsoft_reunion_decouverte_v1','taxonomy_pcu','religious_building','PATC','Patrimoine culturel','{"category_collection":"ClassificationCategories","emit_subcategory":false}',true,'No exact observed subtype'),
  ('tourinsoft_reunion_decouverte_v1','taxonomy_pcu','historic_monument','PATC','Patrimoine culturel','{"category_collection":"ClassificationCategories","emit_subcategory":false}',true,'No exact observed subtype'),
  ('tourinsoft_reunion_decouverte_v1','taxonomy_pcu','industrial_heritage','PATC','Patrimoine culturel','{"category_collection":"ClassificationCategories","emit_subcategory":false}',true,'No exact observed subtype'),
  ('tourinsoft_reunion_decouverte_v1','taxonomy_pcu','creole_architecture','PATC','Patrimoine culturel','{"category_collection":"ClassificationCategories","emit_subcategory":false}',true,'No exact observed subtype'),
  ('tourinsoft_reunion_decouverte_v1','taxonomy_pcu','historic_site','PATC','Patrimoine culturel','{"category_collection":"ClassificationCategories","emit_subcategory":false}',true,'No exact observed subtype'),
  ('tourinsoft_reunion_decouverte_v1','taxonomy_pna','beach','PATN','Patrimoine naturel','{"category_collection":"ClassificationCategories","emit_subcategory":false}',true,'No exact observed subtype'),
  ('tourinsoft_reunion_decouverte_v1','taxonomy_pna','natural_pool','PATN','Patrimoine naturel','{"category_collection":"ClassificationCategories","emit_subcategory":false}',true,'No exact observed subtype'),
  ('tourinsoft_reunion_decouverte_v1','taxonomy_pna','waterfall','PATN','Patrimoine naturel','{"category_collection":"ClassificationCategories","emit_subcategory":false}',true,'No exact observed subtype'),
  ('tourinsoft_reunion_decouverte_v1','taxonomy_pna','viewpoint','PATN','Patrimoine naturel','{"category_collection":"ClassificationCategories","emit_subcategory":false}',true,'No exact observed subtype'),
  ('tourinsoft_reunion_decouverte_v1','taxonomy_pna','forest','PATN','Patrimoine naturel','{"category_collection":"ClassificationCategories","emit_subcategory":false}',true,'No exact observed subtype'),
  ('tourinsoft_reunion_decouverte_v1','taxonomy_pna','volcanic_site','PATN','Patrimoine naturel','{"category_collection":"ClassificationCategories","emit_subcategory":false}',true,'No exact observed subtype'),
  ('tourinsoft_reunion_decouverte_v1','taxonomy_pna','coastline','PATN','Patrimoine naturel','{"category_collection":"ClassificationCategories","emit_subcategory":false}',true,'No exact observed subtype'),
  ('tourinsoft_reunion_decouverte_v1','taxonomy_pna','remarkable_tree','PATN','Patrimoine naturel','{"category_collection":"ClassificationCategories","emit_subcategory":false}',true,'No exact observed subtype'),
  ('tourinsoft_reunion_decouverte_v1','taxonomy_pna','geological_site','PATN','Patrimoine naturel','{"category_collection":"ClassificationCategories","emit_subcategory":false}',true,'No exact observed subtype'),
  ('tourinsoft_reunion_decouverte_v1','taxonomy_prd','plantation','PLAN','Plantation','{"category_collection":"ClassificationCategories","category_code":"PATA","category_label":"Patrimoine agricole","subcategory_collection":"ClassificationSousCategoriePatAgricoles"}',true,'Observed'),
  ('tourinsoft_reunion_decouverte_v1','taxonomy_prd','exploitation_agricole','PATA','Patrimoine agricole','{"category_collection":"ClassificationCategories","emit_subcategory":false}',true,'Safe category only'),
  ('tourinsoft_reunion_decouverte_v1','taxonomy_prd','agrotourisme','PATA','Patrimoine agricole','{"category_collection":"ClassificationCategories","emit_subcategory":false}',true,'Safe category only'),
  ('tourinsoft_reunion_decouverte_v1','taxonomy_prd','produits_terroir','PROD','Produit du terroir','{"category_collection":"ClassificationCategories","category_code":"TER","category_label":"Terroir","subcategory_collection":"ClassificationSousCategorieTerroirs"}',true,'Observed'),
  ('tourinsoft_reunion_decouverte_v1','taxonomy_prd','distillerie_brasserie','PROD','Produit du terroir','{"category_collection":"ClassificationCategories","category_code":"TER","category_label":"Terroir","subcategory_collection":"ClassificationSousCategorieTerroirs"}',true,'Closest observed subtype'),
  ('tourinsoft_reunion_decouverte_v1','taxonomy_prd','apiculture','PROD','Produit du terroir','{"category_collection":"ClassificationCategories","category_code":"TER","category_label":"Terroir","subcategory_collection":"ClassificationSousCategorieTerroirs"}',true,'Closest observed subtype'),
  ('tourinsoft_reunion_decouverte_v1','taxonomy_loi','art_artisanat','ART','Art & artisanat','{"category_collection":"ClassificationCategories","category_code":"TER","category_label":"Terroir","subcategory_collection":"ClassificationSousCategorieTerroirs"}',true,'Observed'),
  ('tourinsoft_reunion_decouverte_v1','taxonomy_loi','artisanat_bijoux','ART','Art & artisanat','{"category_collection":"ClassificationCategories","category_code":"TER","category_label":"Terroir","subcategory_collection":"ClassificationSousCategorieTerroirs"}',true,'Observed family'),
  ('tourinsoft_reunion_decouverte_v1','taxonomy_loi','atelier','ART','Art & artisanat','{"category_collection":"ClassificationCategories","category_code":"TER","category_label":"Terroir","subcategory_collection":"ClassificationSousCategorieTerroirs"}',true,'Observed family'),
  ('tourinsoft_reunion_decouverte_v1','taxonomy_loi','atelier_poterie_et_ceramique','ART','Art & artisanat','{"category_collection":"ClassificationCategories","category_code":"TER","category_label":"Terroir","subcategory_collection":"ClassificationSousCategorieTerroirs"}',true,'Observed family'),
  ('tourinsoft_reunion_decouverte_v1','taxonomy_loi','patrimoine_culturel','VPCU','Visite guidée patrimoine culturel','{"category_collection":"ClassificationCategories","category_code":"PATC","category_label":"Patrimoine culturel","subcategory_collection":"ClassificationSousCategoriePatCulturels"}',true,'Observed'),
  ('tourinsoft_reunion_decouverte_v1','taxonomy_loi','visite_guidee','VPCU','Visite guidée patrimoine culturel','{"category_collection":"ClassificationCategories","category_code":"PATC","category_label":"Patrimoine culturel","subcategory_collection":"ClassificationSousCategoriePatCulturels"}',true,'Observed'),
  ('tourinsoft_reunion_decouverte_v1','taxonomy_loi','parc_jardin','PAJA','Parc-jardin','{"category_collection":"ClassificationCategories","category_code":"PATN","category_label":"Patrimoine naturel","subcategory_collection":"ClassificationSousCategoriePatNaturels"}',true,'Observed'),
  ('tourinsoft_reunion_decouverte_v1','taxonomy_loi','patrimoine_agricole','PLAN','Plantation','{"category_collection":"ClassificationCategories","category_code":"PATA","category_label":"Patrimoine agricole","subcategory_collection":"ClassificationSousCategoriePatAgricoles"}',true,'Observed family'),

  ('tourinsoft_reunion_loisir_plein_air_v1','taxonomy_act','canyoning','CANY','Canyoning','{"category_collection":"ClassificationCategoriess","category_code":"ADR","category_label":"Adrénaline & sports extrêmes","subcategory_collection":"ClassificationCategoriesSousCategorieAdrenalines"}',true,'Observed'),
  ('tourinsoft_reunion_loisir_plein_air_v1','taxonomy_act','caving','SPEL','Tunnels de lave','{"category_collection":"ClassificationCategoriess","category_code":"ADR","category_label":"Adrénaline & sports extrêmes","subcategory_collection":"ClassificationCategoriesSousCategorieAdrenalines"}',true,'Observed'),
  ('tourinsoft_reunion_loisir_plein_air_v1','taxonomy_act','guided_climbing','ESCA','Escalade','{"category_collection":"ClassificationCategoriess","category_code":"ADR","category_label":"Adrénaline & sports extrêmes","subcategory_collection":"ClassificationCategoriesSousCategorieAdrenalines"}',true,'Observed'),
  ('tourinsoft_reunion_loisir_plein_air_v1','taxonomy_act','paragliding','PARA','Parapente','{"category_collection":"ClassificationCategoriess","category_code":"ADR","category_label":"Adrénaline & sports extrêmes","subcategory_collection":"ClassificationCategoriesSousCategorieAdrenalines"}',true,'Observed'),
  ('tourinsoft_reunion_loisir_plein_air_v1','taxonomy_act','guided_hiking','RADP','Randonnée pédestre','{"category_collection":"ClassificationCategoriess","category_code":"EXPLR","category_label":"Explorations & balades guidées","subcategory_collection":"ClassificationCategoriesSousCategorieExplorations"}',true,'Observed'),
  ('tourinsoft_reunion_loisir_plein_air_v1','taxonomy_act','horse_riding','EQUI','Équitation','{"category_collection":"ClassificationCategoriess","category_code":"EXPLR","category_label":"Explorations & balades guidées","subcategory_collection":"ClassificationCategoriesSousCategorieExplorations"}',true,'Observed'),
  ('tourinsoft_reunion_loisir_plein_air_v1','taxonomy_act','guided_mountain_biking','VTTC','VTT de descente','{"category_collection":"ClassificationCategoriess","category_code":"EXPLR","category_label":"Explorations & balades guidées","subcategory_collection":"ClassificationCategoriesSousCategorieExplorations"}',true,'Observed'),
  ('tourinsoft_reunion_loisir_plein_air_v1','taxonomy_act','motorized_excursion','4F4','Excursion 4x4','{"category_collection":"ClassificationCategoriess","category_code":"EXPLR","category_label":"Explorations & balades guidées","subcategory_collection":"ClassificationCategoriesSousCategorieExplorations"}',true,'Observed'),
  ('tourinsoft_reunion_loisir_plein_air_v1','taxonomy_act','boat_excursion','PROM','Promenade en mer','{"category_collection":"ClassificationCategoriess","category_code":"LOIN","category_label":"Loisirs nautiques","subcategory_collection":"ClassificationCategoriesSousCategorieNautiquess"}',true,'Observed'),
  ('tourinsoft_reunion_loisir_plein_air_v1','taxonomy_act','kayaking_paddleboarding','LOIN','Loisirs nautiques','{"category_collection":"ClassificationCategoriess","emit_subcategory":false}',true,'Category only'),
  ('tourinsoft_reunion_loisir_plein_air_v1','taxonomy_act','wellness_massage','SPA','Spa, massage & bien-être','{"category_collection":"ClassificationCategoriess","category_code":"AUTR","category_label":"Autres activités","subcategory_collection":"ClassificationCategoriesSousCategorieAutress"}',true,'Observed'),
  ('tourinsoft_reunion_loisir_plein_air_v1','taxonomy_act','fitness_wellness','AUTR','Autres activités','{"category_collection":"ClassificationCategoriess","emit_subcategory":false}',true,'Category only'),
  ('tourinsoft_reunion_loisir_plein_air_v1','taxonomy_act','nature_discovery','EXPLR','Explorations & balades guidées','{"category_collection":"ClassificationCategoriess","emit_subcategory":false}',true,'Category only'),
  ('tourinsoft_reunion_loisir_plein_air_v1','taxonomy_act','guided_tour','EXPLR','Explorations & balades guidées','{"category_collection":"ClassificationCategoriess","emit_subcategory":false}',true,'Category only'),
  ('tourinsoft_reunion_loisir_plein_air_v1','taxonomy_act','other_guided_activity','AUTR','Autres activités','{"category_collection":"ClassificationCategoriess","emit_subcategory":false}',true,'Category only'),
  ('tourinsoft_reunion_loisir_plein_air_v1','taxonomy_psv','cycle_scooter_rental','VELO','Location de vélo','{"category_collection":"ClassificationCategoriess","category_code":"LOC V","category_label":"Location de véhicules de loisir","subcategory_collection":"ClassificationCategoriesSousCategorieVehiculeLoisirs"}',true,'Observed'),
  ('tourinsoft_reunion_loisir_plein_air_v1','taxonomy_psv','v_t_t_autres_cycles','VELO','Location de vélo','{"category_collection":"ClassificationCategoriess","category_code":"LOC V","category_label":"Location de véhicules de loisir","subcategory_collection":"ClassificationCategoriesSousCategorieVehiculeLoisirs"}',true,'Observed'),

  ('tourinsoft_reunion_restauration_v1','taxonomy_res','restaurant','REST','Restaurant','{"category_collection":"ClassificationCategories","category_code":"REST","category_label":"Restaurant","subcategory_collection":"ClassificationSousCategorieRestaurants"}',true,'Observed'),
  ('tourinsoft_reunion_restauration_v1','taxonomy_res','restaurant_de_l_hotel','RESH','Restaurant d’hôtel','{"category_collection":"ClassificationCategories","category_code":"REST","category_label":"Restaurant","subcategory_collection":"ClassificationSousCategorieRestaurants"}',true,'Observed'),
  ('tourinsoft_reunion_restauration_v1','taxonomy_res','traiteur','TRAI','Traiteur','{"category_collection":"ClassificationCategories","category_code":"REST","category_label":"Restaurant","subcategory_collection":"ClassificationSousCategorieRestaurants"}',true,'Observed'),
  ('tourinsoft_reunion_restauration_v1','taxonomy_res','restauration_traditionnelle','REST','Restaurant','{"category_collection":"ClassificationCategories","category_code":"REST","category_label":"Restaurant","subcategory_collection":"ClassificationSousCategorieRestaurants"}',true,'Closest observed subtype'),
  ('tourinsoft_reunion_restauration_v1','taxonomy_res','table_d_hote','THOT','Table d’hôte','{"category_collection":"ClassificationCategories","category_code":"THOT","category_label":"Table d’hôtes","subcategory_collection":"ClassificationSousCategorieTableHotess"}',true,'Observed'),
  ('tourinsoft_reunion_restauration_v1','taxonomy_res','ferme_auberge','FAUB','Ferme auberge','{"category_collection":"ClassificationCategories","category_code":"AUBE","category_label":"Auberge","subcategory_collection":"ClassificationSousCategorieAuberges"}',true,'Observed'),
  ('tourinsoft_reunion_restauration_v1','taxonomy_res','auberge','AUBE','Auberge','{"category_collection":"ClassificationCategories","category_code":"AUBE","category_label":"Auberge","subcategory_collection":"ClassificationSousCategorieAuberges"}',true,'Observed'),
  ('tourinsoft_reunion_restauration_v1','taxonomy_res','auberge_de_campagne','ACAM','Auberge de campagne','{"category_collection":"ClassificationCategories","category_code":"AUBE","category_label":"Auberge","subcategory_collection":"ClassificationSousCategorieAuberges"}',true,'Observed'),
  ('tourinsoft_reunion_restauration_v1','taxonomy_res','pizzeria','PIZZ','Pizzeria','{"category_collection":"ClassificationCategories","category_code":"ATYR","category_label":"Autre type de restauration","subcategory_collection":"ClassificationSousCategorieAutreTypes"}',true,'Observed'),
  ('tourinsoft_reunion_restauration_v1','taxonomy_res','creperie','CREP','Crêperie','{"category_collection":"ClassificationCategories","category_code":"ATYR","category_label":"Autre type de restauration","subcategory_collection":"ClassificationSousCategorieAutreTypes"}',true,'Observed'),
  ('tourinsoft_reunion_restauration_v1','taxonomy_res','boulangerie_patisserie','BOUL','Boulangerie-pâtisserie','{"category_collection":"ClassificationCategories","category_code":"ATYR","category_label":"Autre type de restauration","subcategory_collection":"ClassificationSousCategorieAutreTypes"}',true,'Observed'),
  ('tourinsoft_reunion_restauration_v1','taxonomy_res','autre_type_de_restauration','ATYR','Autre type de restauration','{"category_collection":"ClassificationCategories","emit_subcategory":false}',true,'Observed category'),
  ('tourinsoft_reunion_restauration_v1','taxonomy_res','snack_bar','ATYR','Autre type de restauration','{"category_collection":"ClassificationCategories","emit_subcategory":false}',true,'No exact observed subtype'),
  ('tourinsoft_reunion_restauration_v1','taxonomy_res','food_truck','ATYR','Autre type de restauration','{"category_collection":"ClassificationCategories","emit_subcategory":false}',true,'No exact observed subtype'),
  ('tourinsoft_reunion_restauration_v1','taxonomy_res','bar_a_jus','ATYR','Autre type de restauration','{"category_collection":"ClassificationCategories","emit_subcategory":false}',true,'No exact observed subtype'),
  ('tourinsoft_reunion_restauration_v1','taxonomy_res','glacier','ATYR','Autre type de restauration','{"category_collection":"ClassificationCategories","emit_subcategory":false}',true,'No exact observed subtype'),
  ('tourinsoft_reunion_restauration_v1','taxonomy_res','salon_de_the','ATYR','Autre type de restauration','{"category_collection":"ClassificationCategories","emit_subcategory":false}',true,'No exact observed subtype'),

  ('tourinsoft_reunion_transport_v1','taxonomy_psv','tourist_excursion_transport','EXC','Excursion touristique','{"category_collection":"ClassificationCategories","category_code":"SERV","category_label":"Services","subcategory_collection":"ClassificationSousCategorieServicess"}',true,'Observed'),
  ('tourinsoft_reunion_transport_v1','taxonomy_psv','excursion_touristique','EXC','Excursion touristique','{"category_collection":"ClassificationCategories","category_code":"SERV","category_label":"Services","subcategory_collection":"ClassificationSousCategorieServicess"}',true,'Observed'),
  ('tourinsoft_reunion_transport_v1','taxonomy_psv','location_de_voiture_avec_chauffeur','LVAC','Location de voiture avec chauffeur','{"category_collection":"ClassificationCategories","category_code":"SERV","category_label":"Services","subcategory_collection":"ClassificationSousCategorieServicess"}',true,'Observed'),
  ('tourinsoft_reunion_transport_v1','taxonomy_psv','private_driver','LVAC','Location de voiture avec chauffeur','{"category_collection":"ClassificationCategories","category_code":"SERV","category_label":"Services","subcategory_collection":"ClassificationSousCategorieServicess"}',true,'Observed'),
  ('tourinsoft_reunion_transport_v1','taxonomy_psv','vtc','LVAC','Location de voiture avec chauffeur','{"category_collection":"ClassificationCategories","category_code":"SERV","category_label":"Services","subcategory_collection":"ClassificationSousCategorieServicess"}',true,'Observed'),
  ('tourinsoft_reunion_transport_v1','taxonomy_psv','transfer','TRAN','Transfert','{"category_collection":"ClassificationCategories","category_code":"SERV","category_label":"Services","subcategory_collection":"ClassificationSousCategorieServicess"}',true,'Observed'),
  ('tourinsoft_reunion_transport_v1','taxonomy_psv','location_vehicule','LDVO','Location voiture de tourisme','{"category_collection":"ClassificationCategories","category_code":"LOCV","category_label":"Location véhicule","subcategory_collection":"ClassificationSousCategorieLocVehicules"}',true,'Observed'),
  ('tourinsoft_reunion_transport_v1','taxonomy_psv','passenger_car_rental','LDVO','Location voiture de tourisme','{"category_collection":"ClassificationCategories","category_code":"LOCV","category_label":"Location véhicule","subcategory_collection":"ClassificationSousCategorieLocVehicules"}',true,'Observed'),
  ('tourinsoft_reunion_transport_v1','taxonomy_psv','motorhome_rental','CCAR','Camping-car','{"category_collection":"ClassificationCategories","category_code":"LOCV","category_label":"Location véhicule","subcategory_collection":"ClassificationSousCategorieLocVehicules"}',true,'Observed'),
  ('tourinsoft_reunion_transport_v1','taxonomy_psv','vans_amenages','CCAR','Camping-car','{"category_collection":"ClassificationCategories","category_code":"LOCV","category_label":"Location véhicule","subcategory_collection":"ClassificationSousCategorieLocVehicules"}',true,'Closest observed subtype'),
  ('tourinsoft_reunion_transport_v1','taxonomy_psv','four_wheel_drive_rental','LOC4','Location 4x4','{"category_collection":"ClassificationCategories","category_code":"LOCV","category_label":"Location véhicule","subcategory_collection":"ClassificationSousCategorieLocVehicules"}',true,'Observed')
ON CONFLICT (profile, domain, source_code) DO UPDATE SET
  target_code = EXCLUDED.target_code, target_label = EXCLUDED.target_label,
  metadata = EXCLUDED.metadata, is_active = true, notes = EXCLUDED.notes, updated_at = now();

INSERT INTO public.ref_interop_value_crosswalk (
  profile, domain, source_code, target_code, target_label, metadata, is_active, notes
) VALUES
  ('tourinsoft_reunion_hebergement_v1','amenity','wifi','E0049','Wifi','{}',true,'Observed'),
  ('tourinsoft_reunion_hebergement_v1','amenity','parking','E0025','Parking privé','{}',true,'Observed generic-to-closest'),
  ('tourinsoft_reunion_hebergement_v1','amenity','bbq','E0005','Barbecue','{}',true,'Observed'),
  ('tourinsoft_reunion_hebergement_v1','amenity','tv','E0045','Tv','{}',true,'Observed'),
  ('tourinsoft_reunion_hebergement_v1','amenity','swimming_pool','E0026','Piscine','{}',true,'Observed'),
  ('tourinsoft_reunion_hebergement_v1','amenity','garden','E0015','Jardin','{}',true,'Observed'),
  ('tourinsoft_reunion_hebergement_v1','amenity','laundry','E0017','Lave linge privatif','{}',true,'Closest observed'),
  ('tourinsoft_reunion_hebergement_v1','amenity','microwave','E0022','Micro-ondes','{}',true,'Observed'),
  ('tourinsoft_reunion_hebergement_v1','amenity','heating','E0007','Chauffage','{}',true,'Observed'),
  ('tourinsoft_reunion_hebergement_v1','amenity','air_conditioning','E0008','Climatisation','{}',true,'Observed'),
  ('tourinsoft_reunion_hebergement_v1','amenity','fan','E0047','Ventilateur','{}',true,'Observed'),
  ('tourinsoft_reunion_hebergement_v1','amenity','private_bathroom','E0038','Sanitaires privés','{}',true,'Observed'),
  ('tourinsoft_reunion_hebergement_v1','amenity','oven','E0013','Four','{}',true,'Observed'),
  ('tourinsoft_reunion_hebergement_v1','amenity','bed_linen','E0019','Linge de maison inclus','{}',true,'Observed'),
  ('tourinsoft_reunion_hebergement_v1','amenity','dishwasher','E0018','Lave vaisselle','{}',true,'Observed'),
  ('tourinsoft_reunion_hebergement_v1','amenity','towels','E0020','Linge de toilette inclus','{}',true,'Observed'),
  ('tourinsoft_reunion_hebergement_v1','amenity','jacuzzi','E0014','Jacuzzi','{}',true,'Observed'),
  ('tourinsoft_reunion_hebergement_v1','amenity','shared_bathroom','E0037','Sanitaires communs','{}',true,'Observed'),
  ('tourinsoft_reunion_hebergement_v1','amenity','spa','E0011','Espace spa - bien être','{}',true,'Observed'),
  ('tourinsoft_reunion_hebergement_v1','amenity','restaurant','E0010','Espace de restauration','{}',true,'Observed'),
  ('tourinsoft_reunion_hebergement_v1','amenity','outdoor_furniture','E0035','Salon de jardin','{}',true,'Observed'),
  ('tourinsoft_reunion_hebergement_v1','amenity','telephone','E0042','Téléphone','{}',true,'Observed'),
  ('tourinsoft_reunion_hebergement_v1','amenity','safe','E0029','Coffre-fort','{}',true,'Observed'),
  ('tourinsoft_reunion_hebergement_v1','amenity','meeting_room','E0032','Salle de réunion - séminaire','{}',true,'Observed'),
  ('tourinsoft_reunion_hebergement_v1','amenity','playground','E0002','Aire de jeux pour enfant','{}',true,'Observed'),
  ('tourinsoft_reunion_hebergement_v1','amenity','games_room','E0024','Salle de jeux','{}',true,'Observed'),
  ('tourinsoft_reunion_hebergement_v1','amenity','baby_crib','E0021','Lit bébé/parapluie','{}',true,'Observed'),
  ('tourinsoft_reunion_hebergement_v1','amenity','bar','E0004','Bar','{}',true,'Observed'),
  ('tourinsoft_reunion_hebergement_v1','amenity','pressing','E0028','Pressing','{}',true,'Observed'),
  ('tourinsoft_reunion_decouverte_v1','amenity','wifi','WIFI','Wifi','{}',true,'Observed'),
  ('tourinsoft_reunion_decouverte_v1','amenity','parking','E0025','Parking privé','{}',true,'Observed'),
  ('tourinsoft_reunion_decouverte_v1','amenity','shared_bathroom','E0037','Sanitaires communs','{}',true,'Observed'),
  ('tourinsoft_reunion_information_service_v1','amenity','wifi','E0049','Wifi','{}',true,'Observed'),
  ('tourinsoft_reunion_loisir_plein_air_v1','amenity','parking','E0025','Parking privé','{}',true,'Observed'),
  ('tourinsoft_reunion_loisir_plein_air_v1','amenity','wifi','E0049','Wifi','{}',true,'Observed'),
  ('tourinsoft_reunion_loisir_plein_air_v1','amenity','shared_bathroom','E0037','Sanitaires communs','{}',true,'Observed'),
  ('tourinsoft_reunion_loisir_plein_air_v1','amenity','tv','E0045','Tv','{}',true,'Observed'),
  ('tourinsoft_reunion_loisir_plein_air_v1','amenity','garden','E0015','Jardin','{}',true,'Observed'),
  ('tourinsoft_reunion_restauration_v1','amenity','parking','PRKPV','Parking privé','{}',true,'Observed'),
  ('tourinsoft_reunion_restauration_v1','amenity','air_conditioning','CLIM','Climatisation','{}',true,'Observed'),
  ('tourinsoft_reunion_restauration_v1','amenity','garden','JRD','Jardin','{}',true,'Observed'),
  ('tourinsoft_reunion_restauration_v1','amenity','wifi','WIFI','Wifi','{}',true,'Observed'),
  ('tourinsoft_reunion_restauration_v1','amenity','fan','VNTL','Ventilateur','{}',true,'Observed'),
  ('tourinsoft_reunion_restauration_v1','amenity','meeting_room','SDRSEM','Salle de réunion - séminaire','{}',true,'Observed'),
  ('tourinsoft_reunion_restauration_v1','amenity','playground','ADJE','Aire de jeux pour enfant','{}',true,'Observed'),
  ('tourinsoft_reunion_transport_v1','amenity','wifi','WIFI','Wifi','{}',true,'Observed'),
  ('tourinsoft_reunion_restauration_v1','cuisine_type','creole','CCR','Cuisine créole','{}',true,'Exact'),
  ('tourinsoft_reunion_restauration_v1','cuisine_type','indian','CIND','Cuisine indienne','{}',true,'Exact'),
  ('tourinsoft_reunion_restauration_v1','cuisine_type','international','CINT','Cuisine internationale','{}',true,'Exact'),
  ('tourinsoft_reunion_restauration_v1','cuisine_type','fast_food','CRAP','Cuisine rapide','{}',true,'Exact'),
  ('tourinsoft_reunion_restauration_v1','cuisine_type','metropolitan','CEUR','Cuisine européenne','{}',true,'French cuisine is a strict subset'),
  ('tourinsoft_reunion_restauration_v1','cuisine_type','chinese','CASI','Cuisine asiatique','{}',true,'Strict regional grouping'),
  ('tourinsoft_reunion_restauration_v1','cuisine_type','japonaise','CASI','Cuisine asiatique','{}',true,'Strict regional grouping'),
  ('tourinsoft_reunion_restauration_v1','cuisine_type','coreenne','CASI','Cuisine asiatique','{}',true,'Strict regional grouping'),
  ('tourinsoft_reunion_restauration_v1','cuisine_type','thai','CASI','Cuisine asiatique','{}',true,'Strict regional grouping'),
  ('tourinsoft_reunion_restauration_v1','cuisine_type','vietnamienne','CASI','Cuisine asiatique','{}',true,'Strict regional grouping'),
  ('tourinsoft_reunion_decouverte_v1','classification_scheme','qualite_tourisme_reunion','QTIR','Qualité Tourisme Réunion','{"collection":"Labels"}',true,'Observed'),
  ('tourinsoft_reunion_hebergement_v1','classification_scheme','qualite_tourisme_reunion','QTILDR','Qualité tourisme île de la Réunion','{"collection":"Labels"}',true,'Observed'),
  ('tourinsoft_reunion_information_service_v1','classification_scheme','qualite_tourisme_reunion','QTIDR','Qualité tourisme île de la Réunion','{"collection":"Labels"}',true,'Observed'),
  ('tourinsoft_reunion_loisir_plein_air_v1','classification_scheme','esprit_parc','EPNA','Esprit Parc National','{"collection":"Marques"}',true,'Observed'),
  ('tourinsoft_reunion_hebergement_v1','classification_scheme','gites_epics','GDF','Gîtes de France','{"collection":"Labels"}',true,'Observed'),
  ('tourinsoft_reunion_hebergement_v1','classification_scheme','clevacances_keys','CLVS','Clévacances','{"collection":"Labels"}',true,'Observed'),
  ('tourinsoft_reunion_hebergement_v1','classification_scheme','accueil_paysan','ACPAYS','Accueil paysan','{"collection":"Labels"}',true,'Observed')
ON CONFLICT (profile, domain, source_code) DO UPDATE SET
  target_code = EXCLUDED.target_code, target_label = EXCLUDED.target_label,
  metadata = EXCLUDED.metadata, is_active = true, notes = EXCLUDED.notes, updated_at = now();

-- ACT titles occur in both Découverte and Loisir / plein air, while ASC has no
-- approved feed crosswalk yet. Do not guess from object_type alone: only ACT
-- taxonomy values with an approved Loisir crosswalk are routed automatically;
-- every other ACT/ASC remains in the routing review queue.
DELETE FROM public.ref_tourinsoft_reunion_route
WHERE variant = 'reunion-regional-v1'
  AND object_type IN ('ACT', 'ASC')
  AND taxonomy_code IS NULL;

INSERT INTO public.ref_tourinsoft_reunion_route (
  variant, object_type, taxonomy_domain, taxonomy_code,
  target_profile, priority, is_active, notes
)
SELECT 'reunion-regional-v1', 'ACT'::public.object_type, x.domain, x.source_code,
       x.profile, 10, true, 'Taxonomy-confirmed Loisir route; no ACT type fallback'
FROM public.ref_interop_value_crosswalk x
JOIN public.ref_code code
  ON code.domain = x.domain AND code.code = x.source_code
WHERE x.profile = 'tourinsoft_reunion_loisir_plein_air_v1'
  AND x.domain = 'taxonomy_act'
  AND x.is_active
ON CONFLICT (variant, object_type, taxonomy_domain, taxonomy_code)
  WHERE taxonomy_code IS NOT NULL
DO UPDATE SET
  target_profile = EXCLUDED.target_profile,
  priority = EXCLUDED.priority,
  is_active = true,
  notes = EXCLUDED.notes,
  updated_at = now();

COMMIT;
