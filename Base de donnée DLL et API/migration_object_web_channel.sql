-- =====================================================================
-- migration_object_web_channel.sql  (manifest step 14m)
-- §90 — Object-scoped online presence: réseaux sociaux + distribution (OTA).
--
-- WHY: social profiles (facebook/instagram/tripadvisor…) and OTA/booking links
-- (booking/airbnb/abritel…) are the ESTABLISHMENT's public web identity — the
-- same nature as `website` (already a contact_channel kind). They were neither
-- authorable nor storable before: both ref_code domains (`social_network`,
-- `distribution_channel`) had NO table — contact_channel/actor_channel FK their
-- kind_id to the `contact_kind` partition only. The §20 "Distribution & réseaux
-- sociaux" editor section projected the OPERATOR actor's actor_channel rows (which
-- can hold neither domain) ⇒ structurally always empty. This anchors the data on
-- the OBJECT (where the public card consumes it) and retires the §20 dead-end.
--
-- MODEL: one table for BOTH domains. A single FK cannot target two ref_code
-- partitions, and `ref_code_distribution_channel` doesn't even exist (those rows
-- live in the `ref_code_other` DEFAULT partition). So we carry (kind_id, kind_domain)
-- and a COMPOSITE FK to the partitioned PARENT ref_code(id, domain) (PG12+; verified
-- live: both domains insert, a mismatched (id,domain) is rejected) + a CHECK pinning
-- the domain. No partition surgery.
--
-- RLS: mirrors contact_channel — §49 split read gate (the is_public flag COMPOSES
-- inside the published arm, never substitutes) + per-command canonical write triple
-- (NEVER FOR ALL — §47). Outer columns are table-qualified in the policy subquery
-- (CLAUDE.md silent-rebinding gotcha). House DML grants, RLS enforces.
--
-- Read goes through api.get_object_resource (new `web_channels` key, same read gate)
-- so the PUBLIC drawer renders it; the editor §03 load/save use direct PostgREST
-- (the §40/§41 child-table precedent). Additive, idempotent, reversible (DROP TABLE).
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.object_web_channel (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  object_id   text NOT NULL REFERENCES public.object(id) ON DELETE CASCADE,
  kind_id     uuid NOT NULL,
  kind_domain text NOT NULL,
  value       text NOT NULL,
  is_public   boolean NOT NULL DEFAULT true,
  position    integer DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_web_channel_domain CHECK (kind_domain IN ('social_network','distribution_channel')),
  CONSTRAINT chk_web_channel_value_not_empty CHECK (length(trim(value)) > 0),
  CONSTRAINT object_web_channel_kind_fkey
    FOREIGN KEY (kind_id, kind_domain) REFERENCES public.ref_code(id, domain) ON DELETE RESTRICT,
  CONSTRAINT uq_object_web_channel UNIQUE (object_id, kind_id, value)
);

CREATE INDEX IF NOT EXISTS idx_object_web_channel_object_id ON public.object_web_channel(object_id);

ALTER TABLE public.object_web_channel ENABLE ROW LEVEL SECURITY;

-- Read gate: §49 split form — published parent AND is_public for anon; caller's
-- extended scope sees all rows. Outer columns table-qualified (silent-rebinding gotcha).
DROP POLICY IF EXISTS "read_object_web_channel" ON public.object_web_channel;
CREATE POLICY "read_object_web_channel" ON public.object_web_channel
  FOR SELECT USING (
    (EXISTS (SELECT 1 FROM public.object o
              WHERE o.id = object_web_channel.object_id AND o.status = 'published')
     AND object_web_channel.is_public IS TRUE)
    OR object_web_channel.object_id IN (SELECT api.current_user_extended_object_ids())
  );

-- Per-command canonical write family (NEVER FOR ALL — §47).
DROP POLICY IF EXISTS "canonical_ins_object_web_channel" ON public.object_web_channel;
CREATE POLICY "canonical_ins_object_web_channel" ON public.object_web_channel
  FOR INSERT WITH CHECK (api.user_can_write_object_canonical(object_id));
DROP POLICY IF EXISTS "canonical_upd_object_web_channel" ON public.object_web_channel;
CREATE POLICY "canonical_upd_object_web_channel" ON public.object_web_channel
  FOR UPDATE USING (api.user_can_write_object_canonical(object_id))
  WITH CHECK (api.user_can_write_object_canonical(object_id));
DROP POLICY IF EXISTS "canonical_del_object_web_channel" ON public.object_web_channel;
CREATE POLICY "canonical_del_object_web_channel" ON public.object_web_channel
  FOR DELETE USING (api.user_can_write_object_canonical(object_id));

-- House DML grants (RLS enforces; mirror contact_channel / object_stay_policy).
GRANT SELECT, INSERT, UPDATE, DELETE ON public.object_web_channel TO anon, authenticated, service_role;

-- updated_at + audit triggers (mirror object_stay_policy).
DROP TRIGGER IF EXISTS update_object_web_channel_updated_at ON public.object_web_channel;
CREATE TRIGGER update_object_web_channel_updated_at
  BEFORE UPDATE ON public.object_web_channel
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS trg_audit_object_web_channel ON public.object_web_channel;
CREATE TRIGGER trg_audit_object_web_channel
  AFTER DELETE OR UPDATE ON public.object_web_channel
  FOR EACH ROW EXECUTE FUNCTION audit.log_row_changes();
