-- PostgREST hoists this bounded timeout for this RPC only, across all its actions.
-- Existing authorization, function bodies and role-wide timeouts remain unchanged.
ALTER FUNCTION api.thesaurus_admin(text,jsonb) SET statement_timeout = '30s';
NOTIFY pgrst, 'reload schema';
