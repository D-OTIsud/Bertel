-- Gabarit de migration de donnees. Generer avec prepare_run.py; ne pas executer ce gabarit.
-- Arret des controles URL automatiques demande le 07/09/2026.
-- INSERT uniquement; aucune modification du schema, des contacts existants ou du statut des objets.
\set ON_ERROR_STOP on
BEGIN;
SET LOCAL search_path = public, pg_catalog;
SET LOCAL timezone = 'UTC';
SET LOCAL standard_conforming_strings = on;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

CREATE TEMP TABLE tmp_manifest (
    id_r_s text PRIMARY KEY, object_id_v2 text NOT NULL,
    expected_object_id_v3 text NOT NULL, kind_domain text NOT NULL,
    kind_code text NOT NULL, expected_kind_id uuid NOT NULL, url text NOT NULL,
    expected_status text NOT NULL,
    UNIQUE (expected_object_id_v3, expected_kind_id, url)
) ON COMMIT DROP;
INSERT INTO tmp_manifest
SELECT * FROM jsonb_to_recordset(__MANIFEST_JSON__::jsonb) AS r(
    id_r_s text, object_id_v2 text, expected_object_id_v3 text, kind_domain text,
    kind_code text, expected_kind_id uuid, url text, expected_status text
);

-- Verrous courts: aucune resolution ni saisie concurrente entre les gardes et l'INSERT.
LOCK TABLE public.object_origin IN SHARE MODE;
LOCK TABLE public.object_web_channel IN SHARE ROW EXCLUSIVE MODE;
DO $guard$
BEGIN
    IF (SELECT count(*) FROM tmp_manifest) <> __EXPECTED_ROWS__ THEN
        RAISE EXCEPTION 'Nombre de lignes different du lot relu';
    END IF;
    PERFORM 1 FROM public.object o JOIN tmp_manifest m ON o.id = m.expected_object_id_v3 FOR SHARE OF o;
    PERFORM 1 FROM public.ref_code r JOIN tmp_manifest m ON r.id = m.expected_kind_id AND r.domain = m.kind_domain FOR SHARE OF r;
    IF EXISTS (
        SELECT 1 FROM tmp_manifest m
        WHERE (SELECT count(*) FROM public.object_origin x
               WHERE x.source_system = 'berta_v2_csv_export' AND x.source_object_id = m.object_id_v2) <> 1
           OR NOT EXISTS (SELECT 1 FROM public.object_origin x
               WHERE x.source_system = 'berta_v2_csv_export' AND x.source_object_id = m.object_id_v2
                 AND x.object_id = m.expected_object_id_v3)
           OR NOT EXISTS (SELECT 1 FROM public.object o
               WHERE o.id = m.expected_object_id_v3 AND o.status::text = m.expected_status)
           OR NOT EXISTS (SELECT 1 FROM public.ref_code r
               WHERE r.id = m.expected_kind_id AND r.domain = m.kind_domain AND r.code = m.kind_code AND r.is_active)
           OR m.kind_domain NOT IN ('social_network', 'distribution_channel')
    ) THEN
        RAISE EXCEPTION 'Derive de correspondance, statut objet ou catalogue: refaire la revue du lot';
    END IF;
END $guard$;

CREATE TEMP TABLE tmp_before ON COMMIT DROP AS
SELECT c.id, to_jsonb(c) AS snapshot FROM public.object_web_channel c
WHERE c.object_id IN (SELECT expected_object_id_v3 FROM tmp_manifest);

CREATE TEMP TABLE tmp_already ON COMMIT DROP AS
SELECT m.id_r_s, m.object_id_v2, c.id, to_jsonb(c) AS row_snapshot
FROM tmp_manifest m JOIN public.object_web_channel c
  ON c.object_id = m.expected_object_id_v3 AND c.kind_id = m.expected_kind_id AND c.value = m.url;

-- Plusieurs liens distincts par plateforme sont permis par le modele.
-- Export pour revue humaine, sans ecraser ni normaliser l'URL existante.
COPY (
    SELECT m.id_r_s, m.expected_object_id_v3, m.kind_code, m.url AS proposed_url,
           c.id AS existing_id, c.value AS existing_url, c.is_public
    FROM tmp_manifest m JOIN public.object_web_channel c
      ON c.object_id = m.expected_object_id_v3 AND c.kind_id = m.expected_kind_id AND c.value <> m.url
) TO STDOUT WITH (FORMAT csv, HEADER true)
\g __OTHER_URLS_PATH__

CREATE TEMP TABLE tmp_applied ON COMMIT DROP AS
WITH candidates AS (
    SELECT m.*, coalesce((SELECT max(c.position) FROM public.object_web_channel c
                          WHERE c.object_id = m.expected_object_id_v3), -1) AS last_position
    FROM tmp_manifest m
    WHERE NOT EXISTS (SELECT 1 FROM public.object_web_channel c
        WHERE c.object_id = m.expected_object_id_v3 AND c.kind_id = m.expected_kind_id AND c.value = m.url)
), ins AS (
    INSERT INTO public.object_web_channel (object_id, kind_id, kind_domain, value, is_public, position)
    SELECT expected_object_id_v3, expected_kind_id, kind_domain, url, true,
           (last_position + row_number() OVER (PARTITION BY expected_object_id_v3 ORDER BY id_r_s))::integer
    FROM candidates
    ON CONFLICT (object_id, kind_id, value) DO NOTHING
    RETURNING *
)
SELECT m.id_r_s, m.object_id_v2, ins.id, to_jsonb(ins) AS row_snapshot
FROM ins JOIN tmp_manifest m
  ON m.expected_object_id_v3 = ins.object_id AND m.expected_kind_id = ins.kind_id AND m.url = ins.value;

DO $verify$
BEGIN
    IF EXISTS (SELECT 1 FROM tmp_manifest m WHERE NOT EXISTS (
        SELECT 1 FROM public.object_web_channel c WHERE c.object_id = m.expected_object_id_v3
        AND c.kind_id = m.expected_kind_id AND c.value = m.url)) THEN
        RAISE EXCEPTION 'Une entree du lot manque apres insertion';
    END IF;
    IF EXISTS (SELECT 1 FROM tmp_before b LEFT JOIN public.object_web_channel c ON c.id = b.id
               WHERE c.id IS NULL OR to_jsonb(c) IS DISTINCT FROM b.snapshot) THEN
        RAISE EXCEPTION 'Un canal preexistant a change';
    END IF;
END $verify$;

-- Ces fichiers sont ecrits avant COMMIT dans un dossier exclusif par run.
-- Leur presence ne prouve pas le COMMIT en cas de coupure reseau: utiliser postverify.sql.
COPY (SELECT * FROM tmp_applied ORDER BY id_r_s) TO STDOUT WITH (FORMAT csv, HEADER true)
\g __JOURNAL_PATH__
COPY (SELECT * FROM tmp_already ORDER BY id_r_s) TO STDOUT WITH (FORMAT csv, HEADER true)
\g __EXISTING_PATH__
SELECT (SELECT count(*) FROM tmp_manifest) AS selected,
       (SELECT count(*) FROM tmp_applied) AS inserted,
       (SELECT count(*) FROM tmp_already) AS already_present;
COMMIT;
