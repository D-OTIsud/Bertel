-- migration_markdown_strip_descriptions.sql (manifest 14v)
-- Markdown descriptions, Delivery 1: api.strip_markdown derives the plain ("sans styles")
-- text from the Markdown-canonical description columns. See spec 2026-06-21.
BEGIN;

CREATE OR REPLACE FUNCTION api.strip_markdown(md text)
RETURNS text
LANGUAGE sql
IMMUTABLE
STRICT
SET search_path = pg_catalog
AS $fn$
  WITH s0  AS (SELECT md AS t),
  -- order is load-bearing. Protect escaped asterisks (\*) with a sentinel BEFORE emphasis so a
  -- literal '\*' survives as '*' instead of being eaten by the italic/bold rules. (Other escapes
  -- like \#, \-, \> are naturally safe: the backslash sits before the line-start marker, so the
  -- anchored block rules don't fire; the generic unescape at s9 then drops the backslash.)
  sp  AS (SELECT replace(t, '\*', chr(1))                                  AS t FROM s0),  -- protect \*
  s1  AS (SELECT regexp_replace(t, '!\[[^\]]*\]\([^)]*\)', '', 'g')        AS t FROM sp),  -- images first
  s2  AS (SELECT regexp_replace(t, '\[([^\]]*)\]\([^)]*\)', '\1', 'g')     AS t FROM s1),  -- links -> label
  s3  AS (SELECT regexp_replace(t, '\*\*([^*]+)\*\*', '\1', 'g')           AS t FROM s2),  -- bold
  s4  AS (SELECT regexp_replace(t, '\*([^*\n]+)\*', '\1', 'g')             AS t FROM s3),  -- italic (paired)
  s5  AS (SELECT regexp_replace(t, '^[ \t]*#{1,6}[ \t]+', '', 'gn')        AS t FROM s4),  -- headings (space req)
  s6  AS (SELECT regexp_replace(t, '^[ \t]*(?:> ?)+', '', 'gn')            AS t FROM s5),  -- blockquote (nested)
  s7  AS (SELECT regexp_replace(t, '^[ \t]*[-*+][ \t]+', '', 'gn')         AS t FROM s6),  -- bullets (space req)
  s8  AS (SELECT regexp_replace(t, '^[ \t]*\d+\.[ \t]+', '', 'gn')         AS t FROM s7),  -- ordered (multi-digit)
  s9  AS (SELECT regexp_replace(t, '\\([\\`_{}\[\]()#+.!>-])', '\1', 'g')  AS t FROM s8),  -- escapes (\* via sentinel)
  sr  AS (SELECT replace(t, chr(1), '*')                                   AS t FROM s9),  -- restore literal *
  s10 AS (SELECT regexp_replace(t, '\n{3,}', E'\n\n', 'g')                 AS t FROM sr)   -- collapse blanks
  SELECT btrim(t) FROM s10;
$fn$;

REVOKE ALL ON FUNCTION api.strip_markdown(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION api.strip_markdown(text) TO anon, authenticated, service_role;

COMMIT;
-- After live apply: NOTIFY pgrst, 'reload schema';
