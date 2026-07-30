#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const sourceArg = process.argv.find((arg) => arg.startsWith('--source='));
const sourcePath = sourceArg
  ? path.resolve(root, sourceArg.slice('--source='.length))
  : path.join(root, 'outputs', '019fb14c-4037-7712-8d37-8b3a387f3c29', 'tourinsoft_reunion_schema.json');
const outDir = path.join(root, 'docs', 'integrations', 'tourinsoft', 'reunion-hebergement-v1');

if (!fs.existsSync(sourcePath)) {
  throw new Error(`Source schema not found: ${sourcePath}`);
}

const raw = JSON.parse(fs.readFileSync(sourcePath, 'utf8'));
fs.mkdirSync(outDir, { recursive: true });

const slimField = (field) => ({
  name: field.name,
  type: field.type,
  count: field.count,
  non_empty: field.non_empty,
  coverage_pct: field.coverage_pct,
});

const schema = {
  contract: 'reunion-hebergement-v1',
  source_url: raw.source_url,
  feed_title: 'FSHebergementOTISud',
  feed_updated: raw.feed_updated,
  sampled_objects: raw.object_count,
  object_id_prefixes: raw.object_id_prefixes,
  object_fields: raw.object_fields.map(slimField),
  relations: Object.fromEntries(
    Object.entries(raw.relations).map(([name, relation]) => [name, {
      entry_count: relation.entry_count,
      fields: relation.fields.map(slimField),
    }]),
  ),
};

fs.writeFileSync(path.join(outDir, 'source-schema.json'), `${JSON.stringify(schema, null, 2)}\n`);

const direct = new Map([
  ['object.Adresse1', ['object_location', 'address1', 'direct', '', 'approved', 'public']],
  ['object.Adresse2', ['object_location', 'address2', 'direct', '', 'approved', 'public']],
  ['object.Adresse3', ['object_location', 'address3', 'direct', '', 'approved', 'public']],
  ['object.CodeINSEE', ['object_location', 'code_insee', 'direct', '', 'approved', 'public']],
  ['object.CodePostal', ['object_location', 'postcode', 'direct', '', 'approved', 'public']],
  ['object.Commune', ['object_location', 'city', 'direct', '', 'approved', 'public']],
  ['object.GmapLatitude', ['object_location', 'latitude', 'string_decimal', '', 'approved', 'public']],
  ['object.GmapLongitude', ['object_location', 'longitude', 'string_decimal', '', 'approved', 'public']],
  ['object.Nometablissement', ['object', 'name', 'direct', '', 'approved', 'public']],
  ['object.ObjectTypeName', ['object', 'object_type', 'crosswalk', 'object_type', 'approved', 'public']],
  ['object.ObjectTypeFix', ['object', 'object_type', 'crosswalk_external_id', 'object_type', 'approved', 'public']],
  ['object.Published', ['object', 'published_at', 'utc_iso8601', '', 'approved', 'public']],
  ['object.SyndicObjectID', ['object', 'id', 'direct', '', 'approved', 'public']],
  ['object.SyndicObjectName', ['object', 'name', 'direct', '', 'approved', 'public']],
  ['object.Updated', ['object', 'updated_at', 'utc_iso8601', '', 'approved', 'public']],
  ['object.Lieudit.ThesLibelle', ['object_location', 'lieu_dit', 'direct', '', 'approved', 'public']],
  ['Access.Descriptifduplandacces', ['object_location', 'direction', 'strip_markdown', '', 'approved', 'public']],
  ['Animauxacceptess.Animauxacceptes', ['object_pet_policy', 'accepted', 'direct', '', 'approved', 'public']],
  ['Animauxacceptess.Complementdinformations', ['object_pet_policy', 'conditions', 'strip_markdown', '', 'approved', 'public']],
  ['Capacitecampings.Capacite', ['object_capacity', 'max_capacity', 'metric', 'capacity_metric', 'approved', 'public']],
  ['Capacitecampings.Nombredeproduits', ['object_capacity', 'pitches', 'metric', 'capacity_metric', 'approved', 'public']],
  ['Capacitecampings.Superficieduterrain', ['object_capacity', 'floor_area_m2', 'metric', 'capacity_metric', 'approved', 'public']],
  ['Capacites.Capacitetotalenombredepersonnes', ['object_capacity', 'max_capacity', 'metric', 'capacity_metric', 'approved', 'public']],
  ['Capacites.Nombredelits', ['object_capacity', 'beds', 'metric', 'capacity_metric', 'approved', 'public']],
  ['Capacites.Nombretotaldechambres', ['object_capacity', 'bedrooms', 'metric', 'capacity_metric', 'approved', 'public']],
  ['Capacites.Salledereunion', ['object_meeting_room', 'id', 'exists_boolean', '', 'approved', 'public']],
  ['Capacites.Surfacedelhabitation', ['object_capacity', 'floor_area_m2', 'metric', 'capacity_metric', 'approved', 'public']],
  ['Descriptifss.Accroche', ['object_description', 'description_chapo', 'strip_markdown', '', 'approved', 'public']],
  ['Descriptifss.Descriptioncommerciale', ['object_description', 'description', 'strip_markdown', '', 'approved', 'public']],
  ['Horairearriveedeparts.Heuredarrivee', ['object_stay_policy', 'check_in_from', 'timespan', '', 'approved', 'public']],
  ['Horairearriveedeparts.Heuredarriveemax', ['object_stay_policy', 'check_in_until', 'timespan', '', 'approved', 'public']],
  ['Horairearriveedeparts.Heurededepart', ['object_stay_policy', 'check_out_until', 'timespan', '', 'approved', 'public']],
  ['LanguesParleess.ThesCode', ['object_language', 'language_id', 'crosswalk', 'language', 'approved', 'public']],
  ['LanguesParleess.ThesLibelle', ['ref_language', 'name', 'crosswalk_label', 'language', 'approved', 'public']],
  ['ModesPaiements.ThesCode', ['object_payment_method', 'payment_method_id', 'crosswalk', 'payment_method', 'approved', 'public']],
  ['ModesPaiements.ThesLibelle', ['ref_code_payment_method', 'name', 'crosswalk_label', 'payment_method', 'approved', 'public']],
  ['Moyencommunications.Coordonnees', ['contact_channel', 'value', 'direct', '', 'approved', 'public']],
  ['Moyencommunications.Moyendecommunication.ThesCode', ['ref_code_contact_kind', 'code', 'crosswalk', 'contact_kind', 'approved', 'public']],
  ['Moyencommunications.Moyendecommunication.ThesLibelle', ['ref_code_contact_kind', 'name', 'crosswalk_label', 'contact_kind', 'approved', 'public']],
  ['Photos.Photo.Credit', ['media', 'credit', 'direct', '', 'approved', 'public']],
  ['Photos.Photo.MediaID', ['media', 'id', 'uuid_text', '', 'approved', 'public']],
  ['Photos.Photo.Titre', ['media', 'title', 'direct', '', 'approved', 'public']],
  ['Photos.Photo.Url', ['media', 'url', 'http_url', '', 'approved', 'public']],
  ['Photos.Datedefindutilisation', ['media', 'rights_expires_at', 'utc_date', '', 'approved', 'public']],
  ['Reseauxsociauxs.Typedeplateforme.ThesCode', ['ref_code_social_network', 'code', 'crosswalk', 'social_network', 'approved', 'public']],
  ['Reseauxsociauxs.Typedeplateforme.ThesLibelle', ['ref_code_social_network', 'name', 'crosswalk_label', 'social_network', 'approved', 'public']],
  ['Reseauxsociauxs.URL', ['object_web_channel', 'value', 'http_url', '', 'approved', 'public']],
  ['Reservations.Lien', ['object_web_channel', 'value', 'http_url', '', 'approved', 'public']],
  ['Tarifs.MinimumEuro', ['object_price', 'amount', 'decimal', '', 'approved', 'public']],
  ['Tarifs.MaximumEuro', ['object_price', 'amount_max', 'decimal', '', 'approved', 'public']],
  ['Tarifs.Datedebutaffichage', ['object_price', 'valid_from', 'utc_date', '', 'approved', 'public']],
  ['Tarifs.Datefinvalidite', ['object_price', 'valid_to', 'utc_date', '', 'approved', 'public']],
  ['Tarifs.complementtarifs', ['object_price', 'conditions', 'strip_markdown', '', 'approved', 'public']],
  ['PeriodeOuvertures.Datedebut', ['opening_period', 'date_start', 'utc_date', '', 'approved', 'public']],
  ['PeriodeOuvertures.Datefin', ['opening_period', 'date_end', 'utc_date', '', 'approved', 'public']],
]);

const technical = /(^|\.)(ID|Ordre|SyndicObjectId|ThesID|ThesOrdre|ThesPicto|AdresseOrdre|ZoneId|ZoneTypeId)$/i;
const privateFields = new Set(['object.RaisonSociale', 'object.SIRET']);
const sourceMissing = new Set(['object.Allinclusive', 'object.Chaine.ThesCode', 'object.Chaine.ThesLibelle']);

const rows = [];
const pushField = (scope, field, cardinality) => {
  const key = `${scope}.${field.name}`;
  let mapping;
  if (direct.has(key)) {
    mapping = direct.get(key);
  } else if (privateFields.has(key)) {
    mapping = ['', '', 'excluded_private', '', 'excluded', 'private'];
  } else if (technical.test(key) || key.startsWith('TisTracking.') || key.startsWith('Structure.') || key.startsWith('ZonesTypes.')) {
    mapping = ['', '', 'excluded_auxiliary', '', 'excluded', 'technical'];
  } else if (sourceMissing.has(key)) {
    mapping = ['', '', 'source_missing', '', 'pending_crt', 'public'];
  } else {
    mapping = ['', '', 'extension_pending', '', 'pending_crt', 'public'];
  }
  const [table, column, transform, domain, review, privacy] = mapping;
  rows.push({
    object_type: 'HOT|HLO|CAMP',
    group: scope === 'object' ? 'object' : scope,
    bertel_table: table,
    bertel_field: column,
    tourinsoft_collection: scope === 'object' ? '' : scope,
    tourinsoft_field: field.name,
    cardinality,
    transform,
    crosswalk_domain: domain,
    required: field.coverage_pct === 100 ? 'observed_100pct' : 'optional',
    privacy,
    mapping_status: transform || 'extension_pending',
    review_status: review,
    evidence: `FSHebergementOTISud ${field.non_empty}/${field.count}`,
    notes: review === 'pending_crt' ? 'Target/import semantics require CRT confirmation.' : '',
  });
};

schema.object_fields.forEach((field) => pushField('object', field, '0..1'));
for (const [name, relation] of Object.entries(schema.relations)) {
  relation.fields.forEach((field) => pushField(name, field, '0..n'));
}

const columns = [
  'object_type', 'group', 'bertel_table', 'bertel_field', 'tourinsoft_collection',
  'tourinsoft_field', 'cardinality', 'transform', 'crosswalk_domain', 'required',
  'privacy', 'mapping_status', 'review_status', 'evidence', 'notes',
];
const csvEscape = (value) => `"${String(value ?? '').replaceAll('"', '""')}"`;
const csv = [columns.map(csvEscape).join(','), ...rows.map((row) => columns.map((key) => csvEscape(row[key])).join(','))].join('\n');
fs.writeFileSync(path.join(outDir, 'field-mapping.csv'), `${csv}\n`);

const crosswalks = [
  ['object_type', 'HOT', 'HOT', 'Hôtellerie', '25EB2EC5-507B-40A9-A799-2716A0536792', 'approved'],
  ['object_type', 'HLO', 'HLO', 'Hébergement locatifs', '55782D99-B37E-4933-90AD-B79401000C1D', 'approved'],
  ['object_type', 'CAMP', 'CAM', 'Camping', 'EECC37A2-050A-45EB-B288-9D288EC3316F', 'approved'],
  ['language', 'fr', 'FR', 'Français', '', 'approved'],
  ['language', 'en', 'AN', 'Anglais', '', 'approved'],
  ['language', 'rcf', 'CRE', 'Créole', '', 'approved'],
  ['language', 'de', 'AL', 'Allemand', '', 'approved'],
  ['language', 'es', 'ES', 'Espagnol', '', 'approved'],
  ['language', 'it', 'IT', 'Italien', '', 'approved'],
  ['language', 'pt', 'PO', 'Portugais', '', 'approved'],
  ['contact_kind', 'phone', 'C1', 'Tél. fixe', '', 'approved'],
  ['contact_kind', 'fax', 'C2', 'Télécopieur /fax', '', 'approved'],
  ['contact_kind', 'email', 'C4', 'Mail', '', 'approved'],
  ['contact_kind', 'website', 'C5', 'Site web (url)', '', 'approved'],
  ['contact_kind', 'mobile', 'C6', 'Tél. mobile', '', 'approved'],
  ['social_network', 'facebook', 'FACE', 'Facebook', '', 'approved'],
  ['social_network', 'instagram', 'INSTA', 'Instagram', '', 'approved'],
  ['payment_method', 'especes', 'ES', 'Espèces', '', 'approved'],
  ['payment_method', 'cheque', 'CHQ', 'Chèques bancaires', '', 'approved'],
  ['payment_method', 'virement', 'Virement', 'Virement bancaire', '', 'approved'],
  ['payment_method', 'carte_bleue', 'CB', 'Cartes bancaires', '', 'approved'],
  ['payment_method', 'cheque_vacances', 'VAC', 'Chèques vacances', '', 'approved'],
  ['payment_method', 'paypal', 'PAYPAL', 'Paypal', '', 'approved'],
  ['payment_method', 'american_express', 'AEX', 'American express', '', 'approved'],
  ['capacity_metric', 'max_capacity', 'Capacitetotalenombredepersonnes', 'Capacité totale en nombre de personnes', '', 'approved'],
  ['capacity_metric', 'beds', 'Nombredelits', 'Nombre de lits', '', 'approved'],
  ['capacity_metric', 'bedrooms', 'Nombretotaldechambres', 'Nombre total de chambres', '', 'approved'],
  ['capacity_metric', 'meeting_rooms', 'Salledereunion', 'Salle de réunion', '', 'approved'],
  ['capacity_metric', 'floor_area_m2', 'Surfacedelhabitation', 'Surface de l’habitation', '', 'approved'],
  ['capacity_metric', 'pitches', 'Nombredeproduits', 'Nombre de produits/emplacements camping', '', 'approved'],
];
const cwColumns = ['domain', 'source_code', 'target_code', 'target_label', 'target_external_id', 'review_status'];
const cwCsv = [cwColumns.map(csvEscape).join(','), ...crosswalks.map((row) => row.map(csvEscape).join(','))].join('\n');
fs.writeFileSync(path.join(outDir, 'value-crosswalk.csv'), `${cwCsv}\n`);

console.log(`Tourinsoft contract generated: ${rows.length} field rows, ${crosswalks.length} crosswalk rows`);
