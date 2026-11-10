import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const expectedDomains = [
  "accommodation_family",
  "accommodation_type",
  "accommodation_unit_type",
  "activity_type",
  "allergen",
  "amenity",
  "amenity_family",
  "assistance_type",
  "bed_type",
  "booking_status",
  "classification_scheme",
  "classification_value",
  "client_type",
  "commune",
  "contact_kind",
  "crm_sentiment",
  "cuisine_type",
  "demand_topic",
  "destination_type",
  "dietary_tag",
  "distribution_channel",
  "document_type",
  "environment_tag",
  "event_type",
  "feedback_type",
  "insurance_type",
  "iti_difficulty",
  "iti_open_status",
  "iti_practice",
  "iti_stage_kind",
  "language",
  "language_level",
  "media_tag",
  "media_type",
  "meeting_equipment",
  "membership_campaign",
  "membership_tier",
  "menu_category",
  "mood",
  "opening_period_type",
  "opening_schedule_type",
  "package_type",
  "partnership_type",
  "payment_method",
  "price_kind",
  "price_type",
  "price_unit",
  "promotion_type",
  "room_type",
  "season_type",
  "service_type",
  "social_network",
  "sustainability_action",
  "sustainability_category",
  "taxonomy_act",
  "taxonomy_asc",
  "taxonomy_camp",
  "taxonomy_com",
  "taxonomy_fma",
  "taxonomy_hlo",
  "taxonomy_hot",
  "taxonomy_hpa",
  "taxonomy_iti",
  "taxonomy_loi",
  "taxonomy_org",
  "taxonomy_pcu",
  "taxonomy_pna",
  "taxonomy_prd",
  "taxonomy_psv",
  "taxonomy_res",
  "taxonomy_rva",
  "taxonomy_spu",
  "taxonomy_vil",
  "tourism_type",
  "trail_link_role",
  "transport_type",
  "view_type",
  "weekday"
];
const locales = ["fr", "en", "es", "de"];
const labels = JSON.parse(await readFile(path.join(root, "tools/thesaurus-content/domain-labels.i18n.json"), "utf8"));
const french = JSON.parse(await readFile(path.join(root, "bertel-tourism-ui/src/lib/thesaurus-domain-labels.fr.json"), "utf8"));

assert.deepEqual(Object.keys(labels), expectedDomains, "The governed domain set or order changed.");
for (const domain of expectedDomains) {
  assert.deepEqual(Object.keys(labels[domain]), locales, `${domain}: expected exactly ${locales.join(", ")} labels.`);
  for (const locale of locales) {
    assert.equal(typeof labels[domain][locale], "string", `${domain}.${locale}: label must be text.`);
    assert.ok(labels[domain][locale].trim().length > 0, `${domain}.${locale}: label must not be blank.`);
  }
  assert.equal(labels[domain].fr, french[domain], `${domain}: French label must match the application registry.`);
}
assert.deepEqual(Object.keys(french), expectedDomains, "The French registry domain set or order changed.");
const { readdir } = await import('node:fs/promises');
const migrations = (await readdir(path.join(root, 'supabase/migrations')))
  .filter(file => /^\d{14}_thesaurus_domain_metadata_localization\.sql$/.test(file));
assert.equal(migrations.length, 1, 'Expected exactly one native metadata migration.');
const upgrade = await readFile(path.join(root, 'supabase/migrations', migrations[0]), 'utf8');
const mirror = await readFile(path.join(root, 'Base de donnée DLL et API/thesaurus_domain_metadata_localization.sql'), 'utf8');
assert.equal(upgrade.replace(/\r\n/g, '\n'), mirror.replace(/\r\n/g, '\n'), 'Upgrade/fresh SQL must match.');
const frozen = mirror.match(/\$reviewed_names\$\s*([\s\S]*?)\s*\$reviewed_names\$::jsonb/);
assert.ok(frozen, 'SQL dictionary is missing.');
assert.deepEqual(JSON.parse(frozen[1]), labels, 'SQL metadata must match the canonical reviewed dictionary.');
console.log(`Validated ${expectedDomains.length} governed domain labels in ${locales.length} locales.`);
