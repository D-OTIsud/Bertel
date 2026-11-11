-- Simplify the capacity vocabulary and its French reference-catalog label.
-- Published manifests keep their snapshot and are refreshed by publication.
DO $capacity_label$
DECLARE
  labels CONSTANT jsonb := '{"fr":"Capacité","en":"Capacity","es":"Capacidad","de":"Kapazität"}';
BEGIN
  UPDATE thesaurus.vocabulary
  SET name=labels->>'fr', name_i18n=labels, updated_at=now()
  WHERE domain='capacity_metric' AND source_kind='capacity_metric'
    AND (name, name_i18n) IS DISTINCT FROM (labels->>'fr', labels);

  UPDATE public.ref_catalog_registry
  SET label=labels->>'fr'
  WHERE catalog_key='ref_capacity_metric' AND label IS DISTINCT FROM labels->>'fr';

  IF NOT EXISTS (
    SELECT 1 FROM thesaurus.vocabulary v
    JOIN public.ref_catalog_registry c ON c.catalog_key='ref_capacity_metric'
    WHERE v.domain='capacity_metric' AND v.source_kind='capacity_metric' AND v.is_public
      AND v.name=labels->>'fr' AND v.name_i18n=labels AND c.label=v.name
  ) THEN
    RAISE EXCEPTION 'The capacity vocabulary or reference catalog is missing';
  END IF;
END
$capacity_label$;
