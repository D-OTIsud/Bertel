-- =============================================================================
-- CRM Lot 1 — 00 : Création de staging.crm_comment_temp
-- Exécuter une seule fois (idempotent : CREATE TABLE IF NOT EXISTS).
-- Convention : calquée sur staging.crm_interaction_temp (v2 + v3).
-- =============================================================================

CREATE TABLE IF NOT EXISTS staging.crm_comment_temp (
    import_comment_id              UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    import_batch_id                TEXT        NOT NULL
                                               REFERENCES staging.import_batches(batch_id)
                                               ON DELETE CASCADE,

    -- Identifiants legacy source — jamais utilisés comme PK ou FK finales
    id                             TEXT,                   -- Commentaires.ID
    parent_legacy_crm_id           TEXT        NOT NULL,   -- Commentaires.CRM → CRM.ID

    -- Champs source bruts chargés par l'ETL
    user_email                     TEXT,                   -- Commentaires.User
    body                           TEXT,                   -- Commentaires.Commentaire
    occurred_at                    TIMESTAMPTZ,
    humeur_raw                     TEXT,                   -- Commentaires.Humeur (emoji ou 'ok')
    original_comment_status        TEXT,                   -- Commentaires.Status brut
    close_reqs                     BOOLEAN     DEFAULT FALSE,
    modere                         BOOLEAN     DEFAULT FALSE,

    -- Colonnes de réconciliation — TEXT, convention crm_interaction_temp v3
    object_id                      TEXT,                   -- hérité du parent promu
    actor_id                       TEXT,                   -- hérité du parent promu
    owner                          TEXT,                   -- résolu depuis user_email
    resolved_parent_interaction_id TEXT,                   -- crm_interaction.id du parent promu

    -- Colonnes de contrôle standard (convention staging v2)
    source_sheet                   TEXT,
    resolution_status              TEXT        NOT NULL DEFAULT 'pending',
    is_approved                    BOOLEAN     NOT NULL DEFAULT FALSE,
    raw_source_data                JSONB       NOT NULL DEFAULT '{}'::jsonb,
    extra                          JSONB,
    created_at                     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at                     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_crm_comment_temp_batch
    ON staging.crm_comment_temp (import_batch_id, parent_legacy_crm_id);

CREATE INDEX IF NOT EXISTS idx_crm_comment_temp_resolution
    ON staging.crm_comment_temp (import_batch_id, resolution_status);

DROP TRIGGER IF EXISTS trg_crm_comment_temp_updated_at ON staging.crm_comment_temp;
CREATE TRIGGER trg_crm_comment_temp_updated_at
    BEFORE UPDATE ON staging.crm_comment_temp
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
