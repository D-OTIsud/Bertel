-- Generer depuis le journal avec prepare_run.py journal <dossier_run>.
-- Retour arriere exclusivement sur les UUID retournes par ce run.
\set ON_ERROR_STOP on
BEGIN;
SET LOCAL timezone = 'UTC';
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';
LOCK TABLE public.object_web_channel IN SHARE ROW EXCLUSIVE MODE;
CREATE TEMP TABLE tmp_journal (id uuid PRIMARY KEY, row_snapshot jsonb NOT NULL) ON COMMIT DROP;
INSERT INTO tmp_journal SELECT * FROM jsonb_to_recordset(__JOURNAL_JSON__::jsonb) AS j(id uuid, row_snapshot jsonb);

-- Toute modification, y compris visibilite, position ou updated_at, protege la ligne.
COPY (
    SELECT j.id, j.row_snapshot AS inserted_snapshot, to_jsonb(c) AS current_snapshot
    FROM tmp_journal j JOIN public.object_web_channel c ON c.id = j.id
    WHERE to_jsonb(c) IS DISTINCT FROM j.row_snapshot
) TO STDOUT WITH (FORMAT csv, HEADER true)
\g __SKIPPED_PATH__

CREATE TEMP TABLE tmp_deleted ON COMMIT DROP AS
WITH deleted AS (
    DELETE FROM public.object_web_channel c USING tmp_journal j
    WHERE c.id = j.id AND to_jsonb(c) = j.row_snapshot
    RETURNING c.*
) SELECT id, to_jsonb(deleted) AS row_snapshot FROM deleted;
COPY (SELECT * FROM tmp_deleted ORDER BY id) TO STDOUT WITH (FORMAT csv, HEADER true)
\g __DELETED_PATH__
SELECT (SELECT count(*) FROM tmp_journal) AS journal_rows,
       (SELECT count(*) FROM tmp_deleted) AS deleted_rows;
COMMIT;
-- Reexecution: les lignes deja absentes restent absentes; celles modifiees restent intactes.
