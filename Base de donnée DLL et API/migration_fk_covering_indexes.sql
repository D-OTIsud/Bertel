-- migration_fk_covering_indexes.sql
-- FK covering indexes + staging duplicate-index drop (2026-07-02). Manifest 16g. Decision log §146.
--
-- SYMPTOM (DB structure audit 2026-07-02, P2a; advisor `unindexed_foreign_keys` 310 findings /
--   61 tables): the bulk is lint amplification — an FK to the PARTITIONED ref_code parent is
--   cloned once per referenced partition in pg_constraint (object_taxonomy / object_web_channel:
--   53 clones each over ONE composite column set). One covering index per real column set clears it.
-- SCOPE (live-derived, exact missing sets on the audit's worthwhile tables — small tables were
--   deliberately left alone, indexes are not free):
--     object_taxonomy(ref_code_id, domain)      — hot path: taxonomy filters/caches; clears 53
--     object_web_channel(kind_id, kind_domain)  — §90 réseaux sociaux; clears 53
--     object_relation(target_object_id)         — the long-deferred object-delete cascade probe
--     object_relation(relation_type_id)
--     crm_interaction ×8                        — CRM actor drill-ins/annuaire joins (§61/§63)
--     object_membership ×3, object_menu_item ×3, object_private_description ×3
--   NOT indexed on purpose: ref_code_taxonomy_closure — the advisor still flags it but its 3 FK
--   column sets ARE covered live (pkey + idx_..._ancestor/_descendant lead with the FK columns);
--   stale-advisor noise, verified 2026-07-02.
-- ALSO: drop the 3 exact-duplicate `idx_old_data_*` twins in the (unexposed) staging schema
--   (advisor `duplicate_index`); guarded — staging does not exist on a fresh build.
-- IDEMPOTENT: CREATE INDEX IF NOT EXISTS / DROP INDEX IF EXISTS. REVERSIBLE: drop the indexes.

BEGIN;

-- ref_code-partition FK fan-out (composite sets; one index clears all 53 constraint clones)
CREATE INDEX IF NOT EXISTS idx_object_taxonomy_ref_code_domain ON object_taxonomy (ref_code_id, domain);
CREATE INDEX IF NOT EXISTS idx_object_web_channel_kind         ON object_web_channel (kind_id, kind_domain);

-- object_relation — target side of the relation (object-delete cascade / reverse lookups)
CREATE INDEX IF NOT EXISTS idx_object_relation_target_object   ON object_relation (target_object_id);
CREATE INDEX IF NOT EXISTS idx_object_relation_relation_type   ON object_relation (relation_type_id);

-- crm_interaction — actor-centric CRM joins (§61): actor drill-in, annuaire, sujets, sentiment
CREATE INDEX IF NOT EXISTS idx_crm_interaction_actor              ON crm_interaction (actor_id);
CREATE INDEX IF NOT EXISTS idx_crm_interaction_demand_topic       ON crm_interaction (demand_topic_id);
CREATE INDEX IF NOT EXISTS idx_crm_interaction_demand_subtopic    ON crm_interaction (demand_subtopic_id);
CREATE INDEX IF NOT EXISTS idx_crm_interaction_handled_by_actor   ON crm_interaction (handled_by_actor_id);
CREATE INDEX IF NOT EXISTS idx_crm_interaction_owner              ON crm_interaction (owner);
-- §61 created idx_crm_interaction_parent as a PARTIAL index (WHERE parent_interaction_id IS NOT
-- NULL): fine for equality probes, but not counted as FK-covering by the advisor/covering check.
-- Converge it to a full index (same name; NULL entries are a handful of bytes at this scale).
DROP INDEX IF EXISTS idx_crm_interaction_parent;
CREATE INDEX idx_crm_interaction_parent ON crm_interaction (parent_interaction_id);
CREATE INDEX IF NOT EXISTS idx_crm_interaction_request_sentiment  ON crm_interaction (request_sentiment_id);
CREATE INDEX IF NOT EXISTS idx_crm_interaction_response_sentiment ON crm_interaction (response_sentiment_id);

-- object_membership
CREATE INDEX IF NOT EXISTS idx_object_membership_tier        ON object_membership (tier_id);
CREATE INDEX IF NOT EXISTS idx_object_membership_created_by  ON object_membership (created_by);
CREATE INDEX IF NOT EXISTS idx_object_membership_updated_by  ON object_membership (updated_by);

-- object_menu_item
CREATE INDEX IF NOT EXISTS idx_object_menu_item_kind   ON object_menu_item (kind_id);
CREATE INDEX IF NOT EXISTS idx_object_menu_item_media  ON object_menu_item (media_id);
CREATE INDEX IF NOT EXISTS idx_object_menu_item_unit   ON object_menu_item (unit_id);

-- object_private_description
CREATE INDEX IF NOT EXISTS idx_object_private_description_created_by ON object_private_description (created_by_user_id);
CREATE INDEX IF NOT EXISTS idx_object_private_description_language   ON object_private_description (language_id);
CREATE INDEX IF NOT EXISTS idx_object_private_description_org        ON object_private_description (org_object_id);

-- staging duplicate-index twins (advisor `duplicate_index`; staging = unexposed Berta import
-- lineage — absent on a fresh build, hence the guard)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'staging') THEN
    DROP INDEX IF EXISTS staging.idx_old_data_media_temp_batch;
    DROP INDEX IF EXISTS staging.idx_old_data_object_temp_external_id;
    DROP INDEX IF EXISTS staging.idx_old_data_object_temp_batch;
  END IF;
END $$;

COMMIT;

-- No `NOTIFY pgrst`: index-only change.
