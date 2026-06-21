-- migration_menu_item_section.sql
-- §06 P2b — carte structurée à 3 niveaux : Menu → Sections → Plats.
-- Manifest step 14v. Idempotent. Folded into schema_unified.sql.
--
-- WHY: the structured-carte editor must mirror a real restaurant menu — a titled MENU containing
-- SECTIONS (Entrée / Plat / Dessert / Boissons…), each with its dishes. The DB was 2-level
-- (object_menu = a categorized block → object_menu_item = dish). We move the section to the DISH:
--   * object_menu       = the MENU (name = title ; category_id now an optional container hint).
--   * object_menu_item.section_id → ref_code_menu_category = the dish's SECTION.
--   * a "section" in the UI = the distinct section_id values within a menu, with their dishes.
-- 0 menu/0 item live ⇒ free reshape; object_menu.category_id is already nullable.

ALTER TABLE object_menu_item
  ADD COLUMN IF NOT EXISTS section_id UUID REFERENCES ref_code_menu_category(id);
CREATE INDEX IF NOT EXISTS idx_object_menu_item_section ON object_menu_item(section_id);
