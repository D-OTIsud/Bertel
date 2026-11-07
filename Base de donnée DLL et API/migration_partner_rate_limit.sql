-- migration_partner_rate_limit.sql
-- Audit API — R2 (rate-limit de la passerelle partenaire /api/public/*).
--
-- Limiteur pg-backed (pas de Redis dans le stack Coolify — cf. chantierDesign). Fenêtre FIXE :
-- un compteur par (clé, fenêtre). Appelé service-role par le route après authentification.
-- ponytail: fenêtre fixe (un burst à la frontière de fenêtre peut atteindre ~2×limite un court
--   instant) — plafond accepté ; l'upgrade est une fenêtre glissante. Le front interne n'appelle
--   PAS ce limiteur (routes /api/public/* uniquement).
-- Le balayage des vieilles fenêtres est une maintenance (index sur window_start) — pas fait par
-- appel pour ne pas payer un DELETE à chaque requête.
--
-- Étend la fondation R1a (internal.partner_api_key). Idempotent.

BEGIN;

CREATE TABLE IF NOT EXISTS internal.partner_rate_bucket (
  key_id       uuid NOT NULL REFERENCES internal.partner_api_key(id) ON DELETE CASCADE,
  window_start timestamptz NOT NULL,
  count        integer NOT NULL DEFAULT 0,
  PRIMARY KEY (key_id, window_start)
);
CREATE INDEX IF NOT EXISTS idx_partner_rate_bucket_window ON internal.partner_rate_bucket (window_start);
ALTER TABLE internal.partner_rate_bucket ENABLE ROW LEVEL SECURITY;

-- Incrémente le compteur de la fenêtre courante et rend le verdict. service_role-only.
CREATE OR REPLACE FUNCTION api.partner_rate_check(
  p_key_id         uuid,
  p_limit          integer DEFAULT 120,
  p_window_seconds integer DEFAULT 60
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = api, public, internal, extensions
AS $$
DECLARE
  v_epoch     bigint := floor(extract(epoch FROM clock_timestamp()))::bigint;
  v_win_epoch bigint := (v_epoch / p_window_seconds) * p_window_seconds;
  v_window    timestamptz := to_timestamp(v_win_epoch);
  v_count     integer;
BEGIN
  INSERT INTO internal.partner_rate_bucket (key_id, window_start, count)
  VALUES (p_key_id, v_window, 1)
  ON CONFLICT (key_id, window_start) DO UPDATE
    SET count = internal.partner_rate_bucket.count + 1
  RETURNING count INTO v_count;

  IF v_count > p_limit THEN
    RETURN jsonb_build_object('allowed', false, 'retry_after', p_window_seconds - (v_epoch - v_win_epoch));
  END IF;
  RETURN jsonb_build_object('allowed', true, 'remaining', greatest(0, p_limit - v_count));
END;
$$;

REVOKE EXECUTE ON FUNCTION api.partner_rate_check(uuid, integer, integer) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION api.partner_rate_check(uuid, integer, integer) TO service_role;

COMMIT;
