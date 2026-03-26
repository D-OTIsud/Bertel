-- =============================================================================
-- Media Lot 1 — 00 : Création de staging.media_temp
-- Exécuter une seule fois (idempotent : CREATE TABLE IF NOT EXISTS).
-- Convention : calquée sur staging.crm_interaction_temp (v2 + v3) et
--              staging.crm_comment_temp.
-- =============================================================================

CREATE TABLE IF NOT EXISTS staging.media_temp (
    import_media_id                UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    import_batch_id                TEXT        NOT NULL
                                               REFERENCES staging.import_batches(batch_id)
                                               ON DELETE CASCADE,

    -- Identifiants legacy source — jamais utilisés comme PK ou FK finales
    legacy_img_id                  TEXT,                   -- galerie.Img_id
    legacy_formulaire              TEXT,                   -- galerie.formulaire (rec*)

    -- Champs source bruts
    url_source                     TEXT,                   -- galerie.Path
    main_pic_source                BOOLEAN,               -- galerie.main_Pic (brut)
    description_source             TEXT,                   -- galerie.Description

    -- Colonne de réconciliation
    object_id                      TEXT,                   -- résolu depuis legacy_formulaire

    -- Déduplication is_main : TRUE uniquement pour le MIN(legacy_img_id) par object
    -- Les autres main_Pic=TRUE sont rétrogradés à FALSE avant promotion (Option A)
    is_main_resolved               BOOLEAN     NOT NULL DEFAULT FALSE,

    -- Colonnes de contrôle standard (convention staging v2)
    resolution_status              TEXT        NOT NULL DEFAULT 'pending',
    is_approved                    BOOLEAN     NOT NULL DEFAULT FALSE,
    raw_source_data                JSONB       NOT NULL DEFAULT '{}'::jsonb,
    extra                          JSONB,
    created_at                     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at                     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_media_temp_batch
    ON staging.media_temp (import_batch_id);

CREATE INDEX IF NOT EXISTS idx_media_temp_resolution
    ON staging.media_temp (import_batch_id, resolution_status);

CREATE INDEX IF NOT EXISTS idx_media_temp_formulaire
    ON staging.media_temp (import_batch_id, legacy_formulaire);

DROP TRIGGER IF EXISTS trg_media_temp_updated_at ON staging.media_temp;
CREATE TRIGGER trg_media_temp_updated_at
    BEFORE UPDATE ON staging.media_temp
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
