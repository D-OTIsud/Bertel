import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const discoveryAt = args.indexOf('--check-discovered');
const inputPath = args[0] && args[0] !== '--check-discovered'
  ? path.resolve(args[0])
  : path.join(here, 'catalog-coverage.json');
const report = JSON.parse(await readFile(inputPath, 'utf8'));
const entries = report.catalogs;
const errors = [];
if (!Array.isArray(entries)) errors.push('catalogs must be an array');
const byKey = new Map((entries ?? []).map((entry) => [entry.key, entry]));
if (byKey.size !== (entries ?? []).length) errors.push('duplicate key in captured coverage');
const schemaOnly = report.schema_only_catalogs ?? [];
const allClassified = new Map([...byKey, ...schemaOnly.map(entry => [entry.key, entry])]);
if (allClassified.size !== byKey.size + schemaOnly.length) errors.push('duplicate schema-only classification');
for (const entry of schemaOnly) {
  for (const field of ['name', 'source_migration', 'semantic_role', 'treatment', 'authority', 'production_presence', 'fresh_schema_presence']) {
    if (!entry[field]) errors.push(`${entry.key}: missing schema-only ${field}`);
  }
}
const discoveryTest = await readFile(path.resolve(here, '../../Base de donnée DLL et API/tests/test_thesaurus_catalog_coverage.sql'), 'utf8');
const expectedLiteral = discoveryTest.match(/expected CONSTANT text\[\] := ARRAY\[([\s\S]*?)\n  \];/);
const testedKeys = expectedLiteral ? [...expectedLiteral[1].matchAll(/'([^']+)'/g)].map(match => match[1]).sort() : [];
if (JSON.stringify(testedKeys) !== JSON.stringify([...allClassified.keys()].sort())) {
  errors.push('the fresh-schema live-discovery invariant must classify the same keys as the catalog matrix');
}
for (const entry of entries ?? []) {
  for (const field of [
    'name', 'table', 'kind', 'rows', 'semantic_role', 'adapter', 'treatment',
    'row_coverage_status', 'edge_coverage_status', 'columns', 'pk', 'incoming',
    'outgoing', 'rls', 'policies', 'visibility_effect',
  ]) {
    if (entry[field] === undefined || entry[field] === null || entry[field] === '') {
      errors.push(`${entry.key ?? '<unknown>'} missing ${field}`);
    }
  }
  if (!Object.hasOwn(entry, 'missing_identities')) {
    errors.push(`${entry.key}: missing_identities classification`);
  }
}
const publication = report.production_publication;
const aggregate = report.adapter_aggregate;
const releaseProof = report.release26_postflight_proof;
const integrityProof = report.integrity_proof_release26;
if (!publication || publication.release_id !== 26 || publication.total_concepts !== 1625 || publication.public_concepts !== 1496 || publication.private_concepts !== 129 || publication.domains !== 87 || publication.pending_revisions !== 0) {
  errors.push('release-26 publication totals or pending-revision state do not match the captured production receipt');
}
if (!aggregate || aggregate.keys !== 87 || aggregate.identities !== 1625 || aggregate.release_public !== 1496 || aggregate.release_private !== 129) {
  errors.push('adapter aggregate must account for all 87 release-26 domains and 1,625 identities');
}
if (!releaseProof || releaseProof.expected_new_identities !== 148 || releaseProof.canonical_ids_found !== 148 || releaseProof.snapshot_documents_found !== 148 || releaseProof.label_mismatches !== 0 || releaseProof.definition_mismatches !== 0 || releaseProof.visibility_mismatches !== 0 || releaseProof.old_release25_documents_preserved !== 1477 || releaseProof.release25_checksum_matches !== 1477 || releaseProof.release25_visibility_mismatches !== 0 || releaseProof.release25_document_mismatches !== 0) {
  errors.push('release-26 postflight must prove the 148 additions and preserve all 1,477 release-25 documents');
}
if (!integrityProof || integrityProof.catalogs !== 104 || integrityProof.checks_total !== 171 || integrityProof.duplicate_identities !== 0 || integrityProof.missing_key_components !== 0 || integrityProof.orphan_rows !== 0 || integrityProof.identities_match_pre_adapter_baseline !== true) {
  errors.push('release-26 catalog identity/FK integrity proof is missing or has issues');
}
const requiredRelease26 = new Map([
  ['ref_capacity_metric', [12, 'public']], ['ref_iti_assoc_role', [8, 'public']],
  ['ref_object_relation_type', [10, 'public']], ['ref_legal_type', [21, 'public']],
  ['ref_review_source', [7, 'public']], ['ref_sustainability_action_group', [76, 'public']],
  ['ref_actor_role', [5, 'private']], ['ref_contact_role', [6, 'private']], ['ref_org_role', [3, 'private']],
]);
for (const [key, [rows, visibility]] of requiredRelease26) {
  const entry = byKey.get(key);
  if (!entry || entry.rows !== rows || entry.missing_identities !== 0 || !entry.adapter?.includes('published in release 26') || !entry.row_coverage_status?.includes('release-26 snapshot')) {
    errors.push(`${key}: expected complete release-26 adapter identity coverage for ${rows} rows`);
    continue;
  }
  if (!entry.adapter?.includes(`${visibility} source adapter`)) {
    errors.push(`${key}: adapter publication visibility must remain ${visibility}`);
  }
  if (entry.publisher_acl !== true || entry.source_guard !== true || !entry.publisher_policy || !entry.source_guard_trigger) {
    errors.push(`${key}: release-26 publisher policy and source-guard trigger evidence are required`);
  }
  if (!entry.edge_integrity_status?.includes('orphan_rows=0')) {
    errors.push(`${key}: release-26 root FK integrity must be verified with no orphan rows`);
  }
  if (entry.identity_integrity && (entry.identity_integrity.duplicate_identities !== 0 || entry.identity_integrity.missing_key_components !== 0)) {
    errors.push(`${key}: native source identity integrity reports an issue`);
  }
}
const groupAudit = report.sustainability_group_assignment_audit;
if (!groupAudit || groupAudit.group_rows !== 76 || groupAudit.group_category_parent_edges !== 76 || groupAudit.actions_with_group !== 239 || groupAudit.membership_edges_represented !== 239 || groupAudit.unmapped_or_orphaned_membership_edges !== 0 || groupAudit.missing_public_endpoint_documents !== 0) {
  errors.push('sustainability group parent/membership edge accounting is incomplete');
}
const hierarchyProof = report.hierarchy_integrity_release26;
if (!hierarchyProof || hierarchyProof.broader_edges !== 837 || hierarchyProof.group_category_parent_edges !== 76 || hierarchyProof.native_grouped_action_edges !== 239 || hierarchyProof.duplicate_hierarchical_or_membership_edges !== 0 || hierarchyProof.orphan_broader_targets !== 0 || hierarchyProof.orphan_semantic_targets !== 0 || hierarchyProof.cyclic_hierarchy_starts !== 0 || hierarchyProof.asymmetric_action_memberships !== 0 || hierarchyProof.missing_group_member_refs !== 0) {
  errors.push('corrected release-26 hierarchy/membership proof is missing or reports issues');
}
const postflightPath = path.resolve(here, '../../db-graph-out/THESAURUS_NATIVE_PUBLICATION_POSTFLIGHT.json');
const nativeCatalogPath = path.resolve(here, '../../db-graph-out/THESAURUS_NATIVE_ADAPTERS_CATALOG.json');
try {
  const postflight = JSON.parse(await readFile(postflightPath, 'utf8'));
  const release = postflight.release;
  const finalHistory = postflight.final_history;
  const catalogIntegrity = postflight.catalog_integrity;
  if (release?.new_release_id !== 26 || release?.new_snapshot_rows !== 1625 || release?.new_public_rows !== 1496 || release?.new_private_rows !== 129 || release?.new_manifest_domain_count !== 72 || finalHistory?.governed_domains !== 87 || finalHistory?.pending_revisions !== 0 || finalHistory?.historical_release_rows_digest !== '9efdd0fad56332aebe6bf453a4882be6' || catalogIntegrity?.checks !== 171 || catalogIntegrity?.orphan_rows !== 0) {
    errors.push('consolidated publication receipt does not match release-26 aggregate proof');
  }
  const hierarchyReceipt = postflight.reports?.find((report) => report.file?.endsWith('05_hierarchy_membership_integrity.sql'));
  const corrected = hierarchyReceipt?.rows?.[0];
  if (hierarchyReceipt?.query_sha256 !== hierarchyProof?.query_sha256 || corrected?.broader_edges !== 837 || corrected?.group_category_parent_edges !== 76 || corrected?.native_grouped_action_edges !== 239 || corrected?.duplicate_hierarchical_or_membership_edges !== 0 || corrected?.orphan_broader_targets !== 0 || corrected?.orphan_semantic_targets !== 0 || corrected?.cyclic_hierarchy_starts !== 0 || corrected?.asymmetric_action_memberships !== 0 || corrected?.missing_group_member_refs !== 0) {
    errors.push('corrected hierarchy receipt does not match the matrix proof');
  }
  const nativeCatalog = JSON.parse(await readFile(nativeCatalogPath, 'utf8'));
  for (const key of requiredRelease26.keys()) {
    const policies = nativeCatalog.native_policies?.filter((policy) => policy.table === key) ?? [];
    const triggers = nativeCatalog.native_triggers?.filter((trigger) => trigger.table === key) ?? [];
    const publisherPolicy = policies.find((policy) => policy.name === 'thesaurus_publisher' && policy.command === 'ALL' && policy.roles?.includes('bertel_thesaurus_publisher'));
    const sourceGuard = triggers.find((trigger) => trigger.name === 'zz_thesaurus_source_guard' && trigger.enabled !== false);
    const entry = byKey.get(key);
    if (!publisherPolicy || !sourceGuard || entry.publisher_policy?.name !== publisherPolicy.name || entry.source_guard_trigger !== sourceGuard.name) {
      errors.push(`${key}: publisher/source-guard evidence does not match the native catalog capture`);
    }
  }
} catch (error) {
  errors.push(`required release-26 receipts are unavailable: ${error.message}`);
}
if (discoveryAt >= 0) {
  const freshPath = args[discoveryAt + 1];
  if (!freshPath) errors.push('--check-discovered requires a JSON file');
  else {
    const fresh = JSON.parse(await readFile(path.resolve(freshPath), 'utf8'));
    const catalogs = Array.isArray(fresh) ? fresh : fresh.catalogs;
    if (!Array.isArray(catalogs)) errors.push('discovery input must be an array or contain catalogs[]');
    else {
      const keys = catalogs.map((item) => typeof item === 'string' ? item : item.catalog_key ?? item.key);
      for (const key of keys) if (!allClassified.has(key)) errors.push(`new catalog key lacks deliberate classification: ${key}`);
      for (const key of byKey.keys()) if (!keys.includes(key)) errors.push(`captured key absent from fresh discovery: ${key}`);
    }
  }
}
if (errors.length) {
  process.stderr.write(`${errors.join('\n')}\n`);
  process.exitCode = 1;
} else {
  process.stdout.write(JSON.stringify({ catalog_keys: byKey.size, schema_only_catalog_keys: schemaOnly.length, classified: true, release_id: publication.release_id, adapters: aggregate.keys, identities: aggregate.identities, integrity_checks: integrityProof.checks_total, corrected_broader_edges: hierarchyProof.broader_edges }) + '\n');
}
