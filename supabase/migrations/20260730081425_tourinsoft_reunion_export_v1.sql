-- Tourinsoft CRT Réunion — opt-in accommodation export contract.
-- Default ?format=tourinsoft remains the legacy I4b document.

BEGIN;

CREATE TABLE IF NOT EXISTS public.ref_interop_value_crosswalk (
  profile             text    NOT NULL,
  domain              text    NOT NULL,
  source_code         text    NOT NULL,
  target_code         text    NOT NULL,
  target_label        text,
  target_external_id  text,
  target_order        integer,
  metadata            jsonb   NOT NULL DEFAULT '{}'::jsonb,
  is_active           boolean NOT NULL DEFAULT true,
  notes               text,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ref_interop_value_crosswalk_pkey PRIMARY KEY (profile, domain, source_code),
  CONSTRAINT ref_interop_value_crosswalk_nonempty CHECK (
    btrim(profile) <> '' AND btrim(domain) <> '' AND btrim(source_code) <> '' AND btrim(target_code) <> ''
  )
);

COMMENT ON TABLE public.ref_interop_value_crosswalk IS
  'Versioned source-code -> target-code mapping for interop exports. Tourinsoft target GUIDs/codes live here, never in serializers.';

ALTER TABLE public.ref_interop_value_crosswalk ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ref_interop_value_crosswalk_service_read ON public.ref_interop_value_crosswalk;
CREATE POLICY ref_interop_value_crosswalk_service_read
  ON public.ref_interop_value_crosswalk FOR SELECT TO service_role USING (true);
DROP POLICY IF EXISTS ref_interop_value_crosswalk_service_write ON public.ref_interop_value_crosswalk;
CREATE POLICY ref_interop_value_crosswalk_service_write
  ON public.ref_interop_value_crosswalk FOR ALL TO service_role USING (true) WITH CHECK (true);

REVOKE ALL ON TABLE public.ref_interop_value_crosswalk FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.ref_interop_value_crosswalk TO service_role;

INSERT INTO public.ref_interop_crosswalk (
  profile, object_type, taxonomy_domain, taxonomy_code, target_class, context_url, is_active
) VALUES
  ('tourinsoft_reunion_hebergement_v1', 'HOT',  NULL, NULL, 'HOT', NULL, true),
  ('tourinsoft_reunion_hebergement_v1', 'HLO',  NULL, NULL, 'HLO', NULL, true),
  ('tourinsoft_reunion_hebergement_v1', 'CAMP', NULL, NULL, 'CAM', NULL, true)
ON CONFLICT (profile, object_type) WHERE taxonomy_code IS NULL DO UPDATE SET
  target_class = EXCLUDED.target_class,
  context_url = EXCLUDED.context_url,
  is_active = true;

INSERT INTO public.ref_interop_value_crosswalk (
  profile, domain, source_code, target_code, target_label, target_external_id, is_active, notes
) VALUES
  ('tourinsoft_reunion_hebergement_v1','object_type','HOT','HOT','Hôtellerie','25EB2EC5-507B-40A9-A799-2716A0536792',true,'Observed in FSHebergementOTISud'),
  ('tourinsoft_reunion_hebergement_v1','object_type','HLO','HLO','Hébergement locatifs','55782D99-B37E-4933-90AD-B79401000C1D',true,'Observed in FSHebergementOTISud'),
  ('tourinsoft_reunion_hebergement_v1','object_type','CAMP','CAM','Camping','EECC37A2-050A-45EB-B288-9D288EC3316F',true,'Observed CAM prefix and CAMP category'),
  ('tourinsoft_reunion_hebergement_v1','language','fr','FR','Français',NULL,true,'Observed'),
  ('tourinsoft_reunion_hebergement_v1','language','en','AN','Anglais',NULL,true,'Observed'),
  ('tourinsoft_reunion_hebergement_v1','language','rcf','CRE','Créole',NULL,true,'Observed'),
  ('tourinsoft_reunion_hebergement_v1','language','de','AL','Allemand',NULL,true,'Observed'),
  ('tourinsoft_reunion_hebergement_v1','language','es','ES','Espagnol',NULL,true,'Observed'),
  ('tourinsoft_reunion_hebergement_v1','language','it','IT','Italien',NULL,true,'Observed'),
  ('tourinsoft_reunion_hebergement_v1','language','pt','PO','Portugais',NULL,true,'Observed'),
  ('tourinsoft_reunion_hebergement_v1','contact_kind','phone','C1','Tél. fixe',NULL,true,'Observed'),
  ('tourinsoft_reunion_hebergement_v1','contact_kind','fax','C2','Télécopieur /fax',NULL,true,'Observed'),
  ('tourinsoft_reunion_hebergement_v1','contact_kind','email','C4','Mail',NULL,true,'Observed'),
  ('tourinsoft_reunion_hebergement_v1','contact_kind','website','C5','Site web (url)',NULL,true,'Observed'),
  ('tourinsoft_reunion_hebergement_v1','contact_kind','mobile','C6','Tél. mobile',NULL,true,'Observed'),
  ('tourinsoft_reunion_hebergement_v1','social_network','facebook','FACE','Facebook',NULL,true,'Observed'),
  ('tourinsoft_reunion_hebergement_v1','social_network','instagram','INSTA','Instagram',NULL,true,'Observed'),
  ('tourinsoft_reunion_hebergement_v1','payment_method','especes','ES','Espèces',NULL,true,'Observed'),
  ('tourinsoft_reunion_hebergement_v1','payment_method','cheque','CHQ','Chèques bancaires',NULL,true,'Observed'),
  ('tourinsoft_reunion_hebergement_v1','payment_method','virement','Virement','Virement bancaire',NULL,true,'Observed'),
  ('tourinsoft_reunion_hebergement_v1','payment_method','carte_bleue','CB','Cartes bancaires',NULL,true,'Observed'),
  ('tourinsoft_reunion_hebergement_v1','payment_method','cheque_vacances','VAC','Chèques vacances',NULL,true,'Observed'),
  ('tourinsoft_reunion_hebergement_v1','payment_method','paypal','PAYPAL','Paypal',NULL,true,'Observed'),
  ('tourinsoft_reunion_hebergement_v1','payment_method','american_express','AEX','American express',NULL,true,'Observed'),
  ('tourinsoft_reunion_hebergement_v1','capacity_metric','max_capacity','Capacitetotalenombredepersonnes','Capacité totale en nombre de personnes',NULL,true,'Approved Bertel metric to observed Tourinsoft field'),
  ('tourinsoft_reunion_hebergement_v1','capacity_metric','beds','Nombredelits','Nombre de lits',NULL,true,'Approved Bertel metric to observed Tourinsoft field'),
  ('tourinsoft_reunion_hebergement_v1','capacity_metric','bedrooms','Nombretotaldechambres','Nombre total de chambres',NULL,true,'Approved Bertel metric to observed Tourinsoft field'),
  ('tourinsoft_reunion_hebergement_v1','capacity_metric','meeting_rooms','Salledereunion','Salle de réunion',NULL,true,'Approved Bertel metric to observed Tourinsoft field'),
  ('tourinsoft_reunion_hebergement_v1','capacity_metric','floor_area_m2','Surfacedelhabitation','Surface de l’habitation',NULL,true,'Approved Bertel metric to observed Tourinsoft field'),
  ('tourinsoft_reunion_hebergement_v1','capacity_metric','pitches','Nombredeproduits','Nombre de produits/emplacements camping',NULL,true,'Approved Bertel metric to observed Tourinsoft field')
ON CONFLICT (profile, domain, source_code) DO UPDATE SET
  target_code = EXCLUDED.target_code,
  target_label = EXCLUDED.target_label,
  target_external_id = EXCLUDED.target_external_id,
  is_active = true,
  notes = EXCLUDED.notes,
  updated_at = now();

CREATE OR REPLACE FUNCTION api.tourinsoft_reunion_documents(p_object_ids text[])
RETURNS TABLE(object_id text, document jsonb)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = api, public, extensions
AS $function$
WITH requested AS (
  SELECT DISTINCT id
  FROM unnest(COALESCE(p_object_ids, ARRAY[]::text[])) WITH ORDINALITY AS u(id, ord)
  WHERE id IS NOT NULL
  ORDER BY id
  LIMIT 200
),
base AS (
  SELECT o.id, o.object_type::text AS source_type, o.name, o.published_at, o.updated_at,
         type_x.target_code AS target_type,
         type_x.target_label AS target_type_name,
         type_x.target_external_id AS target_type_id
  FROM requested r
  JOIN public.object o ON o.id = r.id AND o.status = 'published'
  JOIN public.ref_interop_crosswalk profile_x
    ON profile_x.profile = 'tourinsoft_reunion_hebergement_v1'
   AND profile_x.object_type = o.object_type
   AND profile_x.taxonomy_code IS NULL
   AND profile_x.is_active
  JOIN public.ref_interop_value_crosswalk type_x
    ON type_x.profile = profile_x.profile
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
  WHERE d.org_object_id IS NULL
    AND (d.visibility IS NULL OR d.visibility = 'public')
  ORDER BY d.object_id, NULLIF(d.position, 0) NULLS LAST, d.updated_at DESC, d.id
),
locations AS (
  SELECT DISTINCT ON (l.object_id)
         l.object_id, l.address1, l.address2, l.address3, l.postcode, l.city,
         l.code_insee, l.lieu_dit, api.strip_markdown(l.direction) AS direction,
         l.latitude, l.longitude
  FROM public.object_location l
  JOIN base b ON b.id = l.object_id
  ORDER BY l.object_id, l.is_main_location DESC NULLS LAST, NULLIF(l.position, 0) NULLS LAST, l.created_at, l.id
),
contacts AS (
  SELECT c.object_id,
         jsonb_agg(
           jsonb_strip_nulls(jsonb_build_object(
             'Coordonnees', c.value,
             'Moyendecommunication', jsonb_build_object(
               'ThesCode', x.target_code,
               'ThesLibelle', x.target_label
             )
           ))
           ORDER BY c.is_primary DESC NULLS LAST, NULLIF(c.position, 0) NULLS LAST, rc.position NULLS LAST, c.id
         ) AS items
  FROM public.contact_channel c
  JOIN base b ON b.id = c.object_id
  JOIN public.ref_code_contact_kind rc ON rc.id = c.kind_id
  JOIN public.ref_interop_value_crosswalk x
    ON x.profile = 'tourinsoft_reunion_hebergement_v1'
   AND x.domain = 'contact_kind' AND x.source_code = rc.code AND x.is_active
  WHERE c.is_public IS TRUE AND NULLIF(btrim(c.value), '') IS NOT NULL
  GROUP BY c.object_id
),
socials AS (
  SELECT w.object_id,
         jsonb_agg(
           jsonb_build_object(
             'Typedeplateforme', jsonb_build_object('ThesCode', x.target_code, 'ThesLibelle', x.target_label),
             'URL', w.value
           )
           ORDER BY NULLIF(w.position, 0) NULLS LAST, rc.position NULLS LAST, w.id
         ) AS items
  FROM public.object_web_channel w
  JOIN base b ON b.id = w.object_id
  JOIN public.ref_code_social_network rc ON rc.id = w.kind_id
  JOIN public.ref_interop_value_crosswalk x
    ON x.profile = 'tourinsoft_reunion_hebergement_v1'
   AND x.domain = 'social_network' AND x.source_code = rc.code AND x.is_active
  WHERE w.is_public IS TRUE AND w.value ~* '^https?://'
  GROUP BY w.object_id
),
reservations AS (
  SELECT w.object_id,
         jsonb_agg(
           jsonb_build_object('Lien', w.value)
           ORDER BY NULLIF(w.position, 0) NULLS LAST, w.id
         ) AS items
  FROM public.object_web_channel w
  JOIN base b ON b.id = w.object_id
  JOIN public.ref_code rc ON rc.id = w.kind_id
  WHERE w.is_public IS TRUE
    AND w.value ~* '^https?://'
    AND (w.kind_domain = 'distribution_channel' OR rc.code = 'booking_engine')
  GROUP BY w.object_id
),
photos AS (
  SELECT m.object_id,
         jsonb_agg(
           jsonb_strip_nulls(jsonb_build_object(
             'Photo', jsonb_strip_nulls(jsonb_build_object(
               'MediaID', m.id::text,
               'Titre', COALESCE(api.i18n_pick(m.title_i18n, 'fr', 'fr'), m.title),
               'Credit', m.credit,
               'Url', m.url
             )),
             'Datedefindutilisation', m.rights_expires_at
           ))
           ORDER BY m.is_main DESC NULLS LAST, NULLIF(m.position, 0) NULLS LAST, m.created_at, m.id
         ) AS items
  FROM public.media m
  JOIN base b ON b.id = m.object_id
  WHERE m.is_published IS TRUE
    AND (m.visibility IS NULL OR m.visibility = 'public')
    AND (m.rights_expires_at IS NULL OR m.rights_expires_at >= CURRENT_DATE)
    AND m.url ~* '^https?://'
  GROUP BY m.object_id
),
languages AS (
  SELECT ol.object_id,
         jsonb_agg(
           jsonb_build_object('ThesCode', x.target_code, 'ThesLibelle', x.target_label)
           ORDER BY rl.position NULLS LAST, rl.code
         ) AS items
  FROM public.object_language ol
  JOIN base b ON b.id = ol.object_id
  JOIN public.ref_language rl ON rl.id = ol.language_id
  JOIN public.ref_interop_value_crosswalk x
    ON x.profile = 'tourinsoft_reunion_hebergement_v1'
   AND x.domain = 'language' AND x.source_code = rl.code AND x.is_active
  GROUP BY ol.object_id
),
payments AS (
  SELECT op.object_id,
         jsonb_agg(
           jsonb_build_object('ThesCode', x.target_code, 'ThesLibelle', x.target_label)
           ORDER BY rc.position NULLS LAST, rc.code
         ) AS items
  FROM public.object_payment_method op
  JOIN base b ON b.id = op.object_id
  JOIN public.ref_code_payment_method rc ON rc.id = op.payment_method_id
  JOIN public.ref_interop_value_crosswalk x
    ON x.profile = 'tourinsoft_reunion_hebergement_v1'
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
         max(oc.value_integer) FILTER (WHERE cm.code = 'meeting_rooms') AS meeting_rooms
  FROM public.object_capacity oc
  JOIN base b ON b.id = oc.object_id
  JOIN public.ref_capacity_metric cm ON cm.id = oc.metric_id
  WHERE (oc.effective_from IS NULL OR oc.effective_from <= CURRENT_DATE)
    AND (oc.effective_to IS NULL OR oc.effective_to >= CURRENT_DATE)
  GROUP BY oc.object_id
),
meeting_rooms AS (
  SELECT mr.object_id, count(*)::integer AS room_count
  FROM public.object_meeting_room mr
  JOIN base b ON b.id = mr.object_id
  GROUP BY mr.object_id
),
pet_policies AS (
  SELECT p.object_id, p.accepted, api.strip_markdown(p.conditions) AS conditions
  FROM public.object_pet_policy p JOIN base b ON b.id = p.object_id
),
stay_policies AS (
  SELECT s.object_id, s.check_in_from, s.check_in_until, s.check_out_until
  FROM public.object_stay_policy s JOIN base b ON b.id = s.object_id
),
prices AS (
  SELECT p.object_id,
         jsonb_agg(
           jsonb_strip_nulls(jsonb_build_object(
             'Nom', concat_ws(' — ', kind.name, unit.name),
             'MinimumEuro', p.amount,
             'MaximumEuro', p.amount_max,
             'Datedebutaffichage', p.valid_from,
             'Datefinvalidite', p.valid_to,
             'complementtarifs', api.strip_markdown(p.conditions)
           ))
           ORDER BY p.valid_from NULLS FIRST, kind.position NULLS LAST, unit.position NULLS LAST, p.id
         ) AS items
  FROM public.object_price p
  JOIN base b ON b.id = p.object_id
  LEFT JOIN public.ref_code_price_kind kind ON kind.id = p.kind_id
  LEFT JOIN public.ref_code_price_unit unit ON unit.id = p.unit_id
  GROUP BY p.object_id
),
openings AS (
  SELECT op.object_id,
         jsonb_agg(
           jsonb_strip_nulls(jsonb_build_object(
             'Datedebut', op.date_start,
             'Datefin', op.date_end
           ))
           ORDER BY op.date_start NULLS FIRST, op.date_end NULLS LAST, op.id
         ) AS items
  FROM public.opening_period op
  JOIN base b ON b.id = op.object_id
  WHERE op.is_closure IS NOT TRUE
  GROUP BY op.object_id
)
SELECT b.id AS object_id,
       jsonb_strip_nulls(jsonb_build_object(
         'SyndicObjectID', b.id,
         'SyndicObjectName', b.name,
         'Nometablissement', b.name,
         'ObjectTypeName', b.target_type_name,
         'ObjectTypeFix', b.target_type_id,
         'Published', COALESCE(b.published_at, b.updated_at),
         'Updated', b.updated_at,
         'Adresse1', l.address1,
         'Adresse2', l.address2,
         'Adresse3', l.address3,
         'CodePostal', l.postcode,
         'Commune', l.city,
         'CodeINSEE', l.code_insee,
         'GmapLatitude', CASE WHEN l.latitude IS NOT NULL THEN l.latitude::text END,
         'GmapLongitude', CASE WHEN l.longitude IS NOT NULL THEN l.longitude::text END,
         'Lieudit', CASE WHEN l.lieu_dit IS NOT NULL THEN jsonb_build_object('ThesLibelle', l.lieu_dit) END,
         'Access', CASE WHEN l.direction IS NOT NULL THEN jsonb_build_array(jsonb_build_object('Descriptifduplandacces', l.direction)) END,
         'Descriptifss', CASE WHEN d.accroche IS NOT NULL OR d.commerciale IS NOT NULL THEN
           jsonb_build_array(jsonb_strip_nulls(jsonb_build_object('Accroche', d.accroche, 'Descriptioncommerciale', d.commerciale))) END,
         'Moyencommunications', c.items,
         'Reseauxsociauxs', so.items,
         'Reservations', r.items,
         'Photos', ph.items,
         'LanguesParleess', la.items,
         'ModesPaiements', pa.items,
         'Animauxacceptess', CASE WHEN pp.object_id IS NOT NULL THEN jsonb_build_array(
           jsonb_strip_nulls(jsonb_build_object('Animauxacceptes', pp.accepted, 'Complementdinformations', pp.conditions))) END,
         'Capacites', CASE WHEN cap.object_id IS NOT NULL OR mr.room_count IS NOT NULL THEN jsonb_build_array(
           jsonb_strip_nulls(jsonb_build_object(
             'Capacitetotalenombredepersonnes', cap.max_capacity,
             'Nombredelits', cap.beds,
             'Nombretotaldechambres', cap.bedrooms,
             'Surfacedelhabitation', cap.floor_area_m2,
             'Salledereunion', CASE WHEN COALESCE(mr.room_count, cap.meeting_rooms, 0) > 0 THEN true END
           ))) END,
         'Capacitecampings', CASE WHEN b.source_type = 'CAMP' AND cap.object_id IS NOT NULL THEN jsonb_build_array(
           jsonb_strip_nulls(jsonb_build_object(
             'Capacite', cap.max_capacity,
             'Nombredeproduits', cap.pitches,
             'Superficieduterrain', cap.floor_area_m2
           ))) END,
         'Horairearriveedeparts', CASE WHEN sp.object_id IS NOT NULL AND
           (sp.check_in_from IS NOT NULL OR sp.check_in_until IS NOT NULL OR sp.check_out_until IS NOT NULL) THEN
           jsonb_build_array(jsonb_strip_nulls(jsonb_build_object(
             'Heuredarrivee', sp.check_in_from,
             'Heuredarriveemax', sp.check_in_until,
             'Heurededepart', sp.check_out_until
           ))) END,
         'Tarifs', pr.items,
         'PeriodeOuvertures', op.items
       )) AS document
FROM base b
LEFT JOIN descriptions d ON d.object_id = b.id
LEFT JOIN locations l ON l.object_id = b.id
LEFT JOIN contacts c ON c.object_id = b.id
LEFT JOIN socials so ON so.object_id = b.id
LEFT JOIN reservations r ON r.object_id = b.id
LEFT JOIN photos ph ON ph.object_id = b.id
LEFT JOIN languages la ON la.object_id = b.id
LEFT JOIN payments pa ON pa.object_id = b.id
LEFT JOIN capacities cap ON cap.object_id = b.id
LEFT JOIN meeting_rooms mr ON mr.object_id = b.id
LEFT JOIN pet_policies pp ON pp.object_id = b.id
LEFT JOIN stay_policies sp ON sp.object_id = b.id
LEFT JOIN prices pr ON pr.object_id = b.id
LEFT JOIN openings op ON op.object_id = b.id
ORDER BY b.id;
$function$;

COMMENT ON FUNCTION api.tourinsoft_reunion_documents(text[]) IS
  'Set-based public projection and Tourinsoft FSHebergementOTISud candidate serializer for up to 200 published HOT/HLO/CAMP objects.';

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
  END IF;
  IF p_variant <> 'reunion-hebergement-v1' THEN
    RETURN NULL;
  END IF;
  SELECT d.document INTO v_document
  FROM api.tourinsoft_reunion_documents(ARRAY[p_object_id]) d
  WHERE d.object_id = p_object_id;
  RETURN v_document;
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
  END IF;
  IF p_variant <> 'reunion-hebergement-v1' THEN
    RETURN '{}'::jsonb;
  END IF;
  SELECT COALESCE(jsonb_object_agg(d.object_id, d.document ORDER BY d.object_id), '{}'::jsonb)
  INTO v_documents
  FROM api.tourinsoft_reunion_documents(p_object_ids) d;
  RETURN v_documents;
END;
$function$;

CREATE OR REPLACE FUNCTION api.tourinsoft_reunion_unmapped_values()
RETURNS TABLE(domain text, source_code text, source_label text, object_count bigint)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = api, public, extensions
AS $function$
WITH used AS (
  SELECT 'object_type'::text AS domain, o.object_type::text AS source_code,
         o.object_type::text AS source_label, count(DISTINCT o.id)::bigint AS object_count
  FROM public.object o
  WHERE o.status = 'published' AND o.object_type IN ('HOT','HLO','CAMP')
  GROUP BY o.object_type
  UNION ALL
  SELECT 'language'::text AS domain, rl.code AS source_code, rl.name::text AS source_label, count(DISTINCT o.id)::bigint AS object_count
  FROM public.object o
  JOIN public.object_language ol ON ol.object_id = o.id
  JOIN public.ref_language rl ON rl.id = ol.language_id
  WHERE o.status = 'published' AND o.object_type IN ('HOT','HLO','CAMP')
  GROUP BY rl.code, rl.name
  UNION ALL
  SELECT 'contact_kind', rc.code, rc.name, count(DISTINCT o.id)::bigint
  FROM public.object o
  JOIN public.contact_channel c ON c.object_id = o.id AND c.is_public IS TRUE
  JOIN public.ref_code_contact_kind rc ON rc.id = c.kind_id
  WHERE o.status = 'published' AND o.object_type IN ('HOT','HLO','CAMP')
  GROUP BY rc.code, rc.name
  UNION ALL
  SELECT 'payment_method', rc.code, rc.name, count(DISTINCT o.id)::bigint
  FROM public.object o
  JOIN public.object_payment_method op ON op.object_id = o.id
  JOIN public.ref_code_payment_method rc ON rc.id = op.payment_method_id
  WHERE o.status = 'published' AND o.object_type IN ('HOT','HLO','CAMP')
  GROUP BY rc.code, rc.name
  UNION ALL
  SELECT 'social_network', rc.code, rc.name, count(DISTINCT o.id)::bigint
  FROM public.object o
  JOIN public.object_web_channel w ON w.object_id = o.id AND w.is_public IS TRUE
  JOIN public.ref_code_social_network rc ON rc.id = w.kind_id
  WHERE o.status = 'published' AND o.object_type IN ('HOT','HLO','CAMP')
  GROUP BY rc.code, rc.name
  UNION ALL
  SELECT 'capacity_metric', rc.code, rc.name, count(DISTINCT o.id)::bigint
  FROM public.object o
  JOIN public.object_capacity oc ON oc.object_id = o.id
  JOIN public.ref_capacity_metric rc ON rc.id = oc.metric_id
  WHERE o.status = 'published' AND o.object_type IN ('HOT','HLO','CAMP')
  GROUP BY rc.code, rc.name
)
SELECT u.domain, u.source_code, u.source_label, u.object_count
FROM used u
LEFT JOIN public.ref_interop_value_crosswalk x
  ON x.profile = 'tourinsoft_reunion_hebergement_v1'
 AND x.domain = u.domain AND x.source_code = u.source_code AND x.is_active
WHERE x.source_code IS NULL
ORDER BY u.domain, u.source_code;
$function$;

REVOKE ALL ON FUNCTION api.tourinsoft_reunion_documents(text[]) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION api.get_object_tourinsoft(text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION api.get_objects_tourinsoft_batch(text[], text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION api.tourinsoft_reunion_unmapped_values() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION api.tourinsoft_reunion_documents(text[]) TO service_role;
GRANT EXECUTE ON FUNCTION api.get_object_tourinsoft(text, text) TO service_role;
GRANT EXECUTE ON FUNCTION api.get_objects_tourinsoft_batch(text[], text) TO service_role;
GRANT EXECUTE ON FUNCTION api.tourinsoft_reunion_unmapped_values() TO service_role;

COMMIT;
