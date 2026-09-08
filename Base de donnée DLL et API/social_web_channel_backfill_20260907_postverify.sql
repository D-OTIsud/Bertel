-- Generer depuis le journal avec prepare_run.py journal <dossier_run>.
-- Lecture seule, aucune table temporaire ni ecriture.
\set ON_ERROR_STOP on
BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;
SET LOCAL timezone = 'UTC';
SET LOCAL statement_timeout = '30s';
WITH journal AS (
    SELECT * FROM jsonb_to_recordset(__JOURNAL_JSON__::jsonb) AS j(id uuid, row_snapshot jsonb)
)
SELECT current_setting('transaction_read_only') AS read_only_confirmed,
       count(*) AS journal_rows,
       count(*) FILTER (WHERE c.id IS NOT NULL AND to_jsonb(c) = j.row_snapshot) AS present_unchanged,
       count(*) FILTER (WHERE c.id IS NULL) AS missing,
       count(*) FILTER (WHERE c.id IS NOT NULL AND to_jsonb(c) IS DISTINCT FROM j.row_snapshot) AS changed
FROM journal j LEFT JOIN public.object_web_channel c ON c.id = j.id;
COMMIT;
-- Attendu apres application: present_unchanged = journal_rows, missing = changed = 0.
-- Un journal vide est normal pour une reexecution sans ajout.
