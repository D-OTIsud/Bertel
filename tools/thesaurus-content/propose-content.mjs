#!/usr/bin/env node
/** Propose a versioned Bertel content update without publishing or replacing local drafts. */
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const FIELDS = new Set(['name', 'description', 'name_i18n', 'description_i18n', 'labels', 'notes',
  'mappings', 'relations', 'replaced_by', 'parent_concept_id', 'lifecycle', 'assignable',
  'valid_from', 'valid_to', 'legacy_search_terms']);
const DOMAIN = /^[a-z][a-z0-9_]{0,79}$/;
const UUID = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
const record = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const canonical = (value) => Array.isArray(value) ? `[${value.map(canonical).join(',')}]`
  : record(value) ? `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`
    : JSON.stringify(value);
const keyOf = (value) => JSON.stringify([value.domain, value.context_key, value.code]);

export function validateBatch(batch) {
  if (!record(batch) || batch.format_version !== 1 || typeof batch.batch_id !== 'string'
    || !batch.batch_id.trim() || batch.batch_id.length > 160
    || !Array.isArray(batch.proposals) || batch.proposals.length < 1 || batch.proposals.length > 1000) {
    throw new Error('Invalid content batch: format_version=1, batch_id and 1..1000 proposals are required.');
  }
  const keys = new Set();
  for (const proposal of batch.proposals) {
    if (!record(proposal) || !DOMAIN.test(proposal.domain) || typeof proposal.code !== 'string' || !proposal.code
      || typeof proposal.context_key !== 'string' || !record(proposal.base) || !record(proposal.changes)
      || Object.keys(proposal.changes).length === 0) throw new Error('Invalid qualified content proposal.');
    const changed = Object.keys(proposal.changes);
    if (changed.some((field) => !FIELDS.has(field) || !Object.hasOwn(proposal.base, field))
      || Object.keys(proposal.base).some((field) => !changed.includes(field))) {
      throw new Error('Every changed editable field requires its exact previous value in base.');
    }
    if (proposal.expected_source_fingerprint !== undefined
      && !/^[a-f0-9]{32}$/.test(proposal.expected_source_fingerprint)) throw new Error('Invalid source fingerprint.');
    const key = keyOf(proposal);
    if (keys.has(key)) throw new Error('Duplicate qualified concept in content batch.');
    keys.add(key);
  }
  return batch;
}

/** All conflicts are detected before any draft is saved; server guards close the read/write race. */
export async function proposeContentBatch(batch, workspace, { apply = false, rpc } = {}) {
  validateBatch(batch);
  if (!record(workspace) || !Array.isArray(workspace.concepts)) throw new Error('Invalid workspace snapshot.');
  const concepts = new Map();
  for (const concept of workspace.concepts) {
    const key = keyOf(concept);
    if (concepts.has(key)) throw new Error('Workspace contains an ambiguous qualified concept.');
    concepts.set(key, concept);
  }
  const results = batch.proposals.map((proposal) => {
    const concept = concepts.get(keyOf(proposal));
    const result = { domain: proposal.domain, context_key: proposal.context_key, code: proposal.code };
    const conflict = (reason, fields) => ({ ...result, status: 'conflict', reason, ...(fields ? { fields } : {}) });
    if (!concept) return conflict('concept_missing');
    if (!UUID.test(concept.concept_id) || !/^[a-f0-9]{32}$/.test(concept.source_fingerprint)) {
      return conflict('invalid_workspace_identity');
    }
    if (concept.revision !== null && concept.revision !== undefined) return conflict('local_revision_exists');
    if (proposal.expected_source_fingerprint !== undefined
      && proposal.expected_source_fingerprint !== concept.source_fingerprint) return conflict('source_changed');
    const fields = Object.keys(proposal.changes);
    if (fields.every((field) => canonical(concept[field]) === canonical(proposal.changes[field]))) {
      return { ...result, status: 'unchanged', concept_id: concept.concept_id };
    }
    const conflicts = fields.filter((field) => canonical(concept[field]) !== canonical(proposal.base[field]));
    if (conflicts.length) return conflict('local_content_changed', conflicts);
    return { ...result, status: 'ready', concept_id: concept.concept_id, expected_version: 0,
      source_fingerprint: concept.source_fingerprint, changes: proposal.changes };
  });
  const report = { batch_id: batch.batch_id, mode: apply ? 'apply' : 'dry-run', results };
  if (!apply || results.some((item) => item.status === 'conflict')) return report;
  if (typeof rpc !== 'function') throw new Error('An authenticated RPC adapter is required to apply proposals.');
  for (const result of results) {
    if (result.status !== 'ready') continue;
    try {
      const revision = await rpc('save_draft', { concept_id: result.concept_id, domain: result.domain,
        expected_version: 0, expected_source_fingerprint: result.source_fingerprint,
        only_if_no_revision: true, document: result.changes });
      if (!record(revision) || !UUID.test(revision.revision_id) || !Number.isInteger(revision.version)) {
        throw new Error('invalid_response');
      }
      result.status = 'proposed'; result.revision_id = revision.revision_id; result.version = revision.version;
    } catch (error) {
      result.status = error?.code === 'PT409' ? 'conflict' : 'failed';
      result.reason = error?.code === 'PT409' ? 'concurrent_change' : 'proposal_not_saved';
      // A later race may leave earlier proposals as private drafts. Stop the batch and report
      // exactly what was saved; no validation or publication is ever attempted here.
      for (const pending of results) if (pending.status === 'ready') pending.status = 'not_attempted';
      break;
    }
  }
  return report;
}

export function createRpc({ url, anonKey, accessToken, fetchImpl = globalThis.fetch }) {
  const target = new URL(url);
  if (target.protocol !== 'https:' && !(target.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(target.hostname))) {
    throw new Error('Supabase URL must use HTTPS, except on localhost.');
  }
  if (!anonKey || !accessToken) throw new Error('Existing Supabase public key and authenticated user access token are required.');
  const endpoint = `${target.origin}${target.pathname.replace(/\/$/, '')}/rest/v1/rpc/thesaurus_admin`;
  return async (action, payload) => {
    const response = await fetchImpl(endpoint, { method: 'POST', redirect: 'error',
      headers: { apikey: anonKey, Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json',
        'Content-Profile': 'api', 'Accept-Profile': 'api' },
      body: JSON.stringify({ p_action: action, p_payload: payload }) });
    let data;
    try { data = await response.json(); } catch { throw new Error('Invalid RPC response.'); }
    if (!response.ok) {
      const error = new Error('Authenticated thesaurus RPC failed.');
      error.code = data?.code === 'PT409' ? 'PT409' : `HTTP_${response.status}`;
      throw error;
    }
    return data;
  };
}

export async function loadWorkspace(batch, rpc) {
  const concepts = [];
  for (const domain of [...new Set(batch.proposals.map((proposal) => proposal.domain))].sort()) {
    let offset = 0;
    while (true) {
      const page = await rpc('workspace', { domain, page_size: 200, offset, read_only: true });
      if (!record(page) || !Array.isArray(page.concepts)) throw new Error('Invalid workspace page.');
      if (page.capabilities?.content_proposal_preconditions !== 1 || page.capabilities?.read_only_workspace !== 1) {
        throw new Error('The database must support protected content proposals and read-only workspace before using this tool.');
      }
      concepts.push(...page.concepts);
      if (page.concepts.length < 200) break;
      offset += 200;
      if (offset > 100000) throw new Error('Workspace page limit exceeded.');
    }
  }
  return { concepts };
}

export async function main(args = process.argv.slice(2), env = process.env) {
  const options = {};
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--apply') options.apply = true;
    else if (arg === '--input' || arg === '--workspace') {
      const value = args[++index];
      if (!value || value.startsWith('--') || options[arg]) throw new Error('Invalid command options.');
      options[arg] = value;
    } else throw new Error('Usage: node tools/thesaurus-content/propose-content.mjs --input batch.json [--workspace snapshot.json] [--apply]');
  }
  if (!options['--input']) throw new Error('--input is required. Dry-run is the default.');
  if (options.apply && options['--workspace']) throw new Error('--apply requires a fresh authenticated workspace, not an offline snapshot.');
  const batch = validateBatch(JSON.parse(await readFile(resolve(options['--input']), 'utf8')));
  const rpc = options['--workspace'] ? undefined : createRpc({
    url: env.NEXT_PUBLIC_SUPABASE_URL || env.SUPABASE_URL,
    anonKey: env.NEXT_PUBLIC_SUPABASE_ANON_KEY || env.SUPABASE_ANON_KEY,
    accessToken: env.SUPABASE_AUTH_ACCESS_TOKEN,
  });
  const workspace = options['--workspace']
    ? JSON.parse(await readFile(resolve(options['--workspace']), 'utf8')) : await loadWorkspace(batch, rpc);
  const report = await proposeContentBatch(batch, workspace, { apply: Boolean(options.apply), rpc });
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  return report.results.some((result) => ['conflict', 'failed', 'not_attempted'].includes(result.status)) ? 2 : 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().then((code) => { process.exitCode = code; }).catch((error) => {
    process.stderr.write(`${error.message}\n`); process.exitCode = 1;
  });
}
