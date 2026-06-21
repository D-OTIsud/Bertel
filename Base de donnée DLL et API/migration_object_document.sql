-- migration_object_document.sql
-- §06 Restaurant — Phase 3 : CARTE PDF (document) attachée au restaurant.
-- Manifest step 14u. Idempotent. Folded into schema_unified.sql (table/index) + rls_policies.sql (RLS/grants)
-- + seeds_data.sql (ref_code document_type).
--
-- WHY: a restaurateur wants to upload a PDF « carte » (distinct from the structured menu items and the
-- global cuisine facet). `object_menu` has no document column; the §06 dropzone was a no-op. This generic
-- object↔document link attaches one or more ref_document files to an object, role-coded
-- (ref_code_document_type), forward-compatible with the PO's « documents par section » vision.
--
-- Title + validity (de quand à quand) live ON THE LINK, not on ref_document: ref_document is admin-write
-- only (its write policy gates on service_role/admin/superuser), so an editor could not set them there;
-- object_document is canonical-write (the editor can). The PDF url stays on ref_document (public read).
-- Upload pipeline: POST /api/document/upload (service-role, authorizes per object) creates the ref_document
-- row + returns its id; the client then inserts the object_document link.
--
-- RLS: §38 split read gate + per-command canonical write (NO FOR ALL). Outer column qualified.

-- Document-type vocabulary (was empty). 'carte' is the §06 restaurant role.
INSERT INTO ref_code (domain, code, name, description) VALUES
('document_type','carte','Carte / menu (PDF)','Carte ou menu téléchargeable d''un restaurant'),
('document_type','brochure','Brochure','Brochure ou dépliant'),
('document_type','certificat','Certificat','Certificat ou attestation')
ON CONFLICT DO NOTHING;

CREATE TABLE IF NOT EXISTS object_document (
  object_id   TEXT NOT NULL REFERENCES object(id) ON DELETE CASCADE,
  document_id UUID NOT NULL REFERENCES ref_document(id) ON DELETE CASCADE,
  role_id     UUID REFERENCES ref_code_document_type(id),  -- 'carte' for §06
  title       TEXT,                                         -- editor label (falls back to ref_document.title)
  valid_from  DATE,
  valid_to    DATE,
  position    INT NOT NULL DEFAULT 1,
  PRIMARY KEY (object_id, document_id)
);
CREATE INDEX IF NOT EXISTS idx_object_document_object ON object_document(object_id);
CREATE INDEX IF NOT EXISTS idx_object_document_role   ON object_document(role_id);

ALTER TABLE object_document ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS read_object_document ON object_document;
CREATE POLICY read_object_document ON object_document FOR SELECT USING (
  (EXISTS (SELECT 1 FROM object o WHERE o.id = object_document.object_id AND o.status = 'published'))
  OR object_document.object_id IN (SELECT api.current_user_extended_object_ids())
);

DROP POLICY IF EXISTS canonical_ins_object_document ON object_document;
CREATE POLICY canonical_ins_object_document ON object_document FOR INSERT
  WITH CHECK (api.user_can_write_object_canonical(object_document.object_id));
DROP POLICY IF EXISTS canonical_upd_object_document ON object_document;
CREATE POLICY canonical_upd_object_document ON object_document FOR UPDATE
  USING (api.user_can_write_object_canonical(object_document.object_id))
  WITH CHECK (api.user_can_write_object_canonical(object_document.object_id));
DROP POLICY IF EXISTS canonical_del_object_document ON object_document;
CREATE POLICY canonical_del_object_document ON object_document FOR DELETE
  USING (api.user_can_write_object_canonical(object_document.object_id));

GRANT SELECT, INSERT, UPDATE, DELETE ON object_document TO authenticated, service_role;
GRANT SELECT ON object_document TO anon;
