'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, ArrowRight, BookOpen, CheckCircle2, Plus, RefreshCw, Send } from 'lucide-react';
import { ConfirmDialog } from '../components/common/ConfirmDialog';
import { EmptyState } from '../components/common/EmptyState';
import { Modal } from '../components/common/Modal';
import { REFERENCE_CATALOGS_QUERY_KEY } from '../hooks/useReferenceCatalogsQuery';
import { ThesaurusConceptEditor, ThesaurusIssues, THESAURUS_LIFECYCLE_LABELS } from '../features/settings/ThesaurusConceptEditor';
import { thesaurusDocumentValues } from '../features/settings/thesaurus-document-display';
import {
  bootstrapThesaurus, configureThesaurusDomain, configureThesaurusInstance,
  fetchThesaurusWorkspace, normalizeThesaurusDocument, previewThesaurusPublication, publishThesaurus,
  retryThesaurusOutbox, thesaurusErrorMessage,
} from '../services/thesaurus-admin';
import type {
  ThesaurusConcept, ThesaurusDocument, ThesaurusInstance,
  ThesaurusPreview, ThesaurusRevision, ThesaurusWorkspace,
} from '../types/thesaurus-admin';

type WorkspacePane = 'concepts' | 'publications' | 'requalification' | 'configuration';
type Navigation = { pane?: WorkspacePane; domain?: string; conceptId?: string | null; create?: boolean; reload?: boolean; search?: string; offset?: number };
const PAGE_SIZE = 100;

function dateLabel(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Date non renseignée' : date.toLocaleString('fr-FR');
}

function conceptDepth(concept: ThesaurusConcept, concepts: ThesaurusConcept[]) {
  let parent = concept.parent_concept_id;
  const visited = new Set([concept.concept_id]);
  let depth = 0;
  while (parent && !visited.has(parent) && depth < 7) {
    visited.add(parent);
    const found = concepts.find((item) => item.concept_id === parent);
    if (!found) break;
    depth += 1; parent = found.parent_concept_id;
  }
  return depth;
}

function documentComparison(before: ThesaurusDocument | undefined, after: ThesaurusDocument, concepts: ThesaurusConcept[]) {
  const previous = thesaurusDocumentValues(before, concepts);
  const next = thesaurusDocumentValues(after, concepts);
  return Object.keys(next).filter((key) => (previous[key] ?? '') !== next[key]).map((key) => ({ field: key, before: previous[key] || '—', after: next[key] || '—' }));
}

export function ThesaurusAdmin({ onDirtyChange: notifyDirty }: { onDirtyChange?: (dirty: boolean) => void } = {}) {
  const queryClient = useQueryClient();
  const [pane, setPane] = useState<WorkspacePane>('concepts');
  const [domain, setDomain] = useState('taxonomy_hlo');
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [offset, setOffset] = useState(0);
  const [selectedConceptId, setSelectedConceptId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [creatingRevision, setCreatingRevision] = useState<ThesaurusRevision | null>(null);
  const [editorEpoch, setEditorEpoch] = useState(0);
  const [dirty, setDirty] = useState(false);
  const [pendingNavigation, setPendingNavigation] = useState<Navigation | null>(null);
  const [selectedRevisions, setSelectedRevisions] = useState<string[]>([]);
  const [preview, setPreview] = useState<ThesaurusPreview | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewRevisions, setPreviewRevisions] = useState<ThesaurusRevision[]>([]);
  const [previewBaseRelease, setPreviewBaseRelease] = useState<number | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const publicationKey = useRef<string | null>(null);

  const workspaceQuery = useQuery({
    queryKey: ['thesaurus-workspace', domain, search, offset],
    queryFn: () => fetchThesaurusWorkspace({ ...(domain ? { domain } : {}), query: search, page_size: PAGE_SIZE, offset }),
    retry: false,
  });
  const workspace = workspaceQuery.data;
  const activeDomain = workspace?.domains.find((item) => item.domain === domain) ?? workspace?.domains[0] ?? null;
  const concepts = workspace?.concepts ?? [];
  const activeConcept = concepts.find((item) => item.concept_id === selectedConceptId) ?? (creating ? null : concepts[0] ?? null);
  const revisions = workspace?.revisions ?? [];
  const activeRevision = activeConcept?.revision
    ?? revisions.filter((item) => item.concept_id === activeConcept?.concept_id && item.status !== 'published').sort((a, b) => b.version - a.version)[0]
    ?? null;
  const validated = revisions.filter((item) => item.status === 'validated');
  const chosen = validated.filter((item) => selectedRevisions.includes(item.revision_id));
  const total = Number(workspace?.stats.matching_concepts ?? activeDomain?.concept_count ?? concepts.length);

  useEffect(() => { notifyDirty?.(dirty); }, [dirty, notifyDirty]);

  // Never persist workspace data: drafts and audit information are private to this session.
  const refresh = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: ['thesaurus-workspace'] });
  }, [queryClient]);
  const onDirtyChange = useCallback((value: boolean) => setDirty(value), []);

  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [dirty]);

  function applyNavigation(next: Navigation) {
    if (next.pane !== undefined) setPane(next.pane);
    if (next.domain !== undefined) { setDomain(next.domain); setOffset(0); setSelectedConceptId(null); }
    if (next.conceptId !== undefined) setSelectedConceptId(next.conceptId);
    if (next.create !== undefined) { setCreating(next.create); setCreatingRevision(null); }
    else if (next.conceptId !== undefined || next.domain !== undefined || next.search !== undefined || next.offset !== undefined) setCreating(false);
    if (next.search !== undefined) { setSearch(next.search); setOffset(0); setSelectedConceptId(null); }
    if (next.offset !== undefined) { setOffset(next.offset); setSelectedConceptId(null); }
    if (next.reload) { setEditorEpoch((value) => value + 1); void refresh(); }
    setDirty(false); setActionError(null); setNotice(null); setPendingNavigation(null);
  }
  function navigate(next: Navigation) {
    if (dirty) setPendingNavigation(next); else applyNavigation(next);
  }

  function onSaved(revision: ThesaurusRevision) {
    if (creating) setCreatingRevision(revision);
    if (revision.status === 'validated') setSelectedRevisions((current) => [...new Set([...current, revision.revision_id])]);
    void refresh();
  }

  async function openPreview() {
    setBusy('preview'); setActionError(null); setNotice(null);
    try {
      const selection = [...chosen];
      const result = await previewThesaurusPublication(selection.map((item) => item.revision_id), Object.fromEntries(selection.map((item) => [item.revision_id, item.version])));
      setPreviewRevisions(selection); setPreviewBaseRelease(workspace?.latest_release_id ?? null);
      setPreview(result); setPreviewOpen(true);
      publicationKey.current = crypto.randomUUID();
    } catch (error) { setActionError(thesaurusErrorMessage(error)); }
    finally { setBusy(null); }
  }

  async function publish() {
    if (!workspace || !preview || preview.errors.length > 0) return;
    setBusy('publish'); setActionError(null);
    try {
      const result = await publishThesaurus({
        revision_ids: previewRevisions.map((item) => item.revision_id),
        idempotency_key: publicationKey.current ?? crypto.randomUUID(),
        expected_release_id: previewBaseRelease,
        expected_revision_versions: Object.fromEntries(previewRevisions.map((item) => [item.revision_id, item.version])),
        ...(preview.preview_fingerprint ? { preview_fingerprint: preview.preview_fingerprint } : {}),
      });
      setPreviewOpen(false); setSelectedRevisions([]); setPreview(null); setDirty(false);
      setEditorEpoch((value) => value + 1);
      setNotice(`Publication ${result.release_id} disponible. ${result.changed_count} concept${result.changed_count > 1 ? 's' : ''} modifié${result.changed_count > 1 ? 's' : ''} ; ${result.affected_objects} fiche${result.affected_objects > 1 ? 's' : ''} à resynchroniser.`);
      await Promise.all([
        refresh(),
        queryClient.invalidateQueries({ queryKey: [...REFERENCE_CATALOGS_QUERY_KEY] }),
        ...['ref-catalogs', 'ref-catalog', 'explorer-reference', 'object-workspace'].map((key) => queryClient.invalidateQueries({ queryKey: [key] })),
      ]);
      window.dispatchEvent(new CustomEvent('bertel:thesaurus-published', { detail: { releaseId: result.release_id } }));
    } catch (error) { setActionError(thesaurusErrorMessage(error)); }
    finally { setBusy(null); }
  }

  const navigation = [
    { id: 'concepts' as const, label: 'Concepts' },
    { id: 'publications' as const, label: `Publications${validated.length ? ` (${validated.length} à publier)` : ''}` },
    { id: 'requalification' as const, label: `Fiches à reprendre${workspace?.stats.retired_usages ? ` (${workspace.stats.retired_usages})` : ''}` },
    { id: 'configuration' as const, label: 'Configuration' },
  ];

  if (workspaceQuery.isError && !workspace) return <EmptyState mode="error" title="Thésaurus indisponible" description={thesaurusErrorMessage(workspaceQuery.error)} action={{ label: 'Réessayer', onClick: () => void workspaceQuery.refetch() }} />;

  return <div className="thesaurus">
    <div className="thesaurus__heading"><div><h2><BookOpen size={22} aria-hidden /> Thésaurus</h2><p className="muted">Préparez les termes métier, vérifiez leur sens, puis publiez une version commune.</p></div><div className="thesaurus__release-label">{workspace?.latest_release_id ? `Version publiée ${workspace.latest_release_id}` : 'Aucune version publiée'}</div></div>
    <nav className="thesaurus__tabs" aria-label="Administration du thésaurus">{navigation.map((item) => <button type="button" key={item.id} className={pane === item.id ? 'is-active' : ''} aria-current={pane === item.id ? 'page' : undefined} onClick={() => navigate({ pane: item.id })}>{item.label}</button>)}</nav>
    {workspaceQuery.isLoading && <p role="status">Chargement du thésaurus…</p>}
    {workspaceQuery.isError && workspace && <p role="alert" className="inline-alert inline-alert--danger">{thesaurusErrorMessage(workspaceQuery.error)}</p>}
    {actionError && <p role="alert" className="inline-alert inline-alert--danger">{actionError}</p>}
    {notice && <p role="status" className="inline-alert inline-alert--success">{notice}</p>}

    {workspace && pane === 'concepts' && <>
      <div className="thesaurus__toolbar"><label>Domaine<select aria-label="Domaine du thésaurus" value={activeDomain?.domain ?? ''} onChange={(event) => navigate({ domain: event.target.value })}>{workspace.domains.map((item) => <option key={item.domain} value={item.domain}>{item.name}{item.is_governed ? '' : ' · non activé'}</option>)}</select></label><form onSubmit={(event) => { event.preventDefault(); navigate({ search: searchInput }); }} className="thesaurus__search"><label htmlFor="thesaurus-search">Rechercher un terme ou un code</label><div><input id="thesaurus-search" type="search" value={searchInput} onChange={(event) => setSearchInput(event.target.value)} placeholder="Libellé, synonyme, code…" /><button type="submit" className="ghost-button">Rechercher</button></div></form><button type="button" className="primary-button" disabled={!activeDomain?.is_governed} onClick={() => navigate({ create: true, conceptId: null })}><Plus size={16} aria-hidden /> Nouveau concept</button></div>
      <div className={`thesaurus__layout${creating ? ' is-editing' : ''}`}>
        <section className="thesaurus__concepts" aria-label="Concepts du domaine">
          {concepts.length === 0 && <p className="muted">{search ? 'Aucun concept ne correspond à cette recherche.' : 'Aucun concept dans ce domaine. Activez-le dans Configuration pour reprendre son catalogue.'}</p>}
          {concepts.map((item) => <button type="button" key={item.concept_id} className={`thesaurus__concept${!creating && activeConcept?.concept_id === item.concept_id ? ' is-active' : ''}`} aria-current={!creating && activeConcept?.concept_id === item.concept_id ? 'true' : undefined} style={{ paddingInlineStart: `${12 + (search ? 0 : conceptDepth(item, concepts) * 12)}px` }} onClick={() => navigate({ conceptId: item.concept_id, create: false })}><span><strong>{item.name}</strong><small>{item.code}</small></span><small className={`thesaurus__lifecycle is-${item.lifecycle}`}>{THESAURUS_LIFECYCLE_LABELS[item.lifecycle]}</small></button>)}
          <div className="thesaurus__pagination"><button type="button" className="ghost-button" disabled={offset === 0 || workspaceQuery.isFetching} onClick={() => navigate({ offset: Math.max(0, offset - PAGE_SIZE) })}><ArrowLeft size={15} aria-hidden /> Précédents</button><span>{concepts.length ? `${offset + 1}–${offset + concepts.length}` : '0'}{total > 0 && ` / ${total}`}</span><button type="button" className="ghost-button" disabled={concepts.length < PAGE_SIZE || workspaceQuery.isFetching} onClick={() => navigate({ offset: offset + PAGE_SIZE })}>Suivants <ArrowRight size={15} aria-hidden /></button></div>
        </section>
        <div className="thesaurus__detail">
          {activeDomain && (activeConcept || creating) ? <ThesaurusConceptEditor key={`${creating ? `new-${activeDomain.domain}` : activeConcept?.concept_id}-${editorEpoch}`} concept={creating ? null : activeConcept} initialRevision={creating ? creatingRevision : activeRevision} domain={activeDomain} concepts={concepts} onSaved={onSaved} onDirtyChange={onDirtyChange} onReload={() => navigate({ reload: true })} onDiscarded={() => { setDirty(false); setCreating(false); setEditorEpoch((value) => value + 1); void refresh(); }} /> : <EmptyState mode="no-data" title="Choisissez un concept" description="Consultez sa définition, ses termes et ses relations avant de proposer une modification." />}
        </div>
      </div>
    </>}

    {workspace && pane === 'publications' && <section className="thesaurus__publications">
      <div className="thesaurus__section-line"><div><h3>Préparer une publication</h3><p className="muted">Sélectionnez les brouillons validés. Une publication conserve une version immuable.</p></div><button type="button" className="primary-button" disabled={chosen.length === 0 || Boolean(busy)} onClick={() => void openPreview()}><Send size={16} aria-hidden /> {busy === 'preview' ? 'Vérification…' : 'Prévisualiser la publication'}</button></div>
      {revisions.filter((item) => item.status !== 'published').length === 0 && <p>Aucun brouillon à publier.</p>}
      <div className="thesaurus__revision-list">{revisions.filter((item) => item.status !== 'published').map((revision) => <label key={revision.revision_id} className="thesaurus__revision"><input type="checkbox" checked={selectedRevisions.includes(revision.revision_id)} disabled={revision.status !== 'validated'} onChange={(event) => setSelectedRevisions((current) => event.target.checked ? [...new Set([...current, revision.revision_id])] : current.filter((id) => id !== revision.revision_id))} /><span><strong>{revision.document.name || revision.document.code}</strong><small>{revision.domain} · Révision {revision.version}</small></span><span className={`thesaurus__badge${revision.status === 'validated' ? ' is-valid' : ''}`}>{revision.status === 'validated' ? 'Validée' : 'À valider'}</span></label>)}</div>
      <h3>Versions publiées</h3>
      {workspace.releases.length === 0 ? <p className="muted">Aucune publication pour le moment.</p> : <div className="thesaurus__table-wrap"><table className="data-table"><thead><tr><th scope="col">Version</th><th scope="col">Publication</th><th scope="col">Concepts modifiés</th><th scope="col">Fiches affectées</th></tr></thead><tbody>{workspace.releases.map((release) => <tr key={release.release_id}><td>{release.release_id}</td><td>{dateLabel(release.created_at)}</td><td>{release.changed_count}</td><td>{release.affected_objects}</td></tr>)}</tbody></table></div>}
      {workspace.outbox.length > 0 && <><h3>Actualisations et tâches de publication</h3><ul className="thesaurus__outbox">{workspace.outbox.map((item) => <li key={item.id}><span>Version {item.release_id} · {item.status === 'done' || item.status === 'completed' ? 'Terminée' : item.status === 'failed' ? 'Échec à reprendre' : 'En attente'} · {item.attempts} tentative{item.attempts > 1 ? 's' : ''}{item.error && <small>{item.error}</small>}</span>{item.status !== 'done' && item.status !== 'completed' && <button type="button" className="ghost-button" disabled={Boolean(busy)} onClick={() => { setBusy('outbox'); void retryThesaurusOutbox(item.id).then(refresh).catch((error) => setActionError(thesaurusErrorMessage(error))).finally(() => setBusy(null)); }}><RefreshCw size={15} aria-hidden /> Reprendre</button>}</li>)}</ul></>}
    </section>}

    {workspace && pane === 'requalification' && <section><h3>Fiches à requalifier</h3><p className="muted">Les valeurs historiques restent lisibles. Choisissez leur remplacement dans chaque fiche ; une scission ne réaffecte jamais les fiches automatiquement.</p>{workspace.requalification.length === 0 ? <p>Aucune fiche signalée dans la liste de reprise.</p> : <div className="thesaurus__table-wrap"><table className="data-table"><thead><tr><th scope="col">Fiche</th><th scope="col">Valeur historique</th><th scope="col">État</th><th scope="col">Action</th></tr></thead><tbody>{workspace.requalification.map((item) => <tr key={`${item.object_id}-${item.concept_id}`}><td>{item.object_name}</td><td>{item.concept_name}{item.reason && <small>{item.reason}</small>}</td><td>{THESAURUS_LIFECYCLE_LABELS[item.lifecycle]}</td><td><a className="ghost-button" href={`/objects/${encodeURIComponent(item.object_id)}/edit`}>Ouvrir la fiche</a></td></tr>)}</tbody></table></div>}</section>}

    {workspace && pane === 'configuration' && <ThesaurusConfiguration workspace={workspace} onSaved={refresh} />}

    <ConfirmDialog open={Boolean(pendingNavigation)} title="Quitter les modifications ?" message="Votre saisie n’est pas enregistrée. Quitter cette vue abandonnera les modifications locales ; la version publiée reste inchangée." confirmLabel="Quitter sans enregistrer" onCancel={() => setPendingNavigation(null)} onConfirm={() => { if (pendingNavigation) applyNavigation(pendingNavigation); }} />
    <Modal open={previewOpen} title="Vérifier la publication du thésaurus" size="wide" onOpenChange={(open) => { if (busy !== 'publish') setPreviewOpen(open); }} footer={<><button type="button" className="ghost-button" disabled={busy === 'publish'} onClick={() => setPreviewOpen(false)}>Revenir aux brouillons</button><button type="button" className="primary-button" disabled={!preview || preview.errors.length > 0 || previewRevisions.length === 0 || Boolean(busy)} onClick={() => void publish()}>{busy === 'publish' ? 'Publication…' : 'Publier cette version'}</button></>}>
      {preview && <><p><strong>{preview.changed_count} concept{preview.changed_count > 1 ? 's' : ''}</strong> {preview.changed_count === 1 ? 'sera publié' : 'seront publiés'}. <strong>{preview.affected_objects} fiche{preview.affected_objects > 1 ? 's' : ''}</strong> {preview.affected_objects === 1 ? 'aura' : 'auront'} une représentation à resynchroniser chez les partenaires.</p><p className="pref__hint">La publication applique ensemble le vocabulaire et ses projections requises. Les anciennes versions restent consultables.</p><ThesaurusIssues errors={preview.errors} warnings={preview.warnings} />{actionError && <p role="alert" className="inline-alert inline-alert--danger">{actionError}</p>}{previewRevisions.map((revision) => { const serverChange = preview.changes.find((item) => item.revision_id === revision.revision_id); const previous = serverChange?.before ? normalizeThesaurusDocument(serverChange.before) : revision.base_document ?? concepts.find((item) => item.concept_id === revision.concept_id); const changes = documentComparison(previous, revision.document, concepts); return <section key={revision.revision_id} className="thesaurus__comparison"><h4>{revision.document.name}</h4>{changes.length === 0 ? <p>La vérification serveur porte sur cette révision validée.</p> : <table className="data-table"><thead><tr><th scope="col">Champ</th><th scope="col">Publié</th><th scope="col">Proposé</th></tr></thead><tbody>{changes.map((change) => <tr key={change.field}><th scope="row">{change.field}</th><td>{change.before}</td><td>{change.after}</td></tr>)}</tbody></table>}</section>; })}</>}
    </Modal>
  </div>;
}

function ThesaurusConfiguration({ workspace, onSaved }: { workspace: ThesaurusWorkspace; onSaved: () => Promise<void> }) {
  const [instance, setInstance] = useState<ThesaurusInstance>(workspace.instance);
  const [selectedDomains, setSelectedDomains] = useState<string[]>([]);
  const [confirmBootstrap, setConfirmBootstrap] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [requiredDefinitions, setRequiredDefinitions] = useState<Record<string, boolean>>(() => Object.fromEntries(workspace.domains.map((item) => [item.domain, item.require_definition])));
  const ungoverned = workspace.domains.filter((item) => item.is_public && !item.is_governed);
  async function run(action: string, execute: () => Promise<void>, message: string) {
    setBusy(action); setError(null); setNotice(null);
    try { await execute(); await onSaved(); setNotice(message); return true; }
    catch (cause) { setError(thesaurusErrorMessage(cause)); return false; }
    finally { setBusy(null); }
  }
  return <section className="thesaurus__configuration"><h3>Identité et réutilisation</h3><p className="muted">L’adresse pérenne identifie les concepts de cette instance. La licence et l’attribution doivent correspondre aux droits réellement retenus.</p>{error && <p role="alert" className="inline-alert inline-alert--danger">{error}</p>}{notice && <p role="status" className="inline-alert inline-alert--success">{notice}</p>}
    <form onSubmit={(event) => { event.preventDefault(); void run('instance', () => configureThesaurusInstance(instance), 'Configuration enregistrée.'); }}><fieldset disabled={Boolean(busy)} className="thesaurus__fieldset"><legend>Publication partenaires</legend><label>Adresse pérenne des concepts<input aria-label="Adresse pérenne des concepts" type="url" value={instance.base_uri} placeholder="https://votre-domaine/api/public/thesaurus/concepts/" required onChange={(event) => setInstance((current) => ({ ...current, base_uri: event.target.value }))} /></label><label>Licence effective<input aria-label="Licence effective" value={instance.license} placeholder="Renseigner la licence retenue" onChange={(event) => setInstance((current) => ({ ...current, license: event.target.value }))} /></label><label>Attribution<textarea aria-label="Attribution" value={instance.attribution} onChange={(event) => setInstance((current) => ({ ...current, attribution: event.target.value }))} /></label><button type="submit" className="primary-button">{busy === 'instance' ? 'Enregistrement…' : 'Enregistrer la configuration'}</button></fieldset></form>
    <h3>Domaines gouvernés</h3><p className="muted">Un domaine activé se modifie uniquement par brouillon et publication. Les catalogues internes restent exclus des partenaires.</p><div className="thesaurus__domain-config">{workspace.domains.filter((item) => item.is_governed).map((item) => <div key={item.domain} className="thesaurus__domain-policy"><div><strong>{item.name}</strong><small>{item.is_public ? 'Partenaires autorisés' : 'Usage interne'}</small></div><label><input type="checkbox" checked={requiredDefinitions[item.domain] ?? item.require_definition} onChange={(event) => setRequiredDefinitions((current) => ({ ...current, [item.domain]: event.target.checked }))} /> Définition obligatoire</label><button type="button" className="ghost-button" disabled={Boolean(busy) || requiredDefinitions[item.domain] === item.require_definition} onClick={() => void run(item.domain, () => configureThesaurusDomain({ domain: item.domain, is_governed: true, is_public: item.is_public, require_definition: requiredDefinitions[item.domain] ?? item.require_definition }), 'Règle du domaine enregistrée.')}>Enregistrer la règle</button></div>)}</div>
    {ungoverned.length > 0 && <><h3>Reprendre des catalogues existants</h3><p className="muted">Sélectionnez explicitement les domaines à activer. Cette opération reprend leurs termes et protège leurs écritures ; elle crée une publication initiale cohérente.</p><div className="thesaurus__bootstrap-domains">{ungoverned.map((item) => <label key={item.domain}><input type="checkbox" checked={selectedDomains.includes(item.domain)} onChange={(event) => setSelectedDomains((current) => event.target.checked ? [...current, item.domain] : current.filter((value) => value !== item.domain))} /><span>{item.name}<small>{item.concept_count} concepts existants</small></span></label>)}</div><button type="button" className="primary-button" disabled={selectedDomains.length === 0 || Boolean(busy) || !workspace.instance.base_uri} onClick={() => setConfirmBootstrap(true)}><CheckCircle2 size={16} aria-hidden /> Vérifier l’activation de {selectedDomains.length} domaine{selectedDomains.length > 1 ? 's' : ''}</button>{!workspace.instance.base_uri && <p className="pref__hint">Enregistrez d’abord l’adresse pérenne de cette instance.</p>}</>}
    <ConfirmDialog open={confirmBootstrap} title="Activer ces domaines dans le thésaurus ?" message={<><span>Les domaines sélectionnés seront repris dans une publication et leurs écritures passeront par le circuit éditorial.</span><br /><br /><strong>{ungoverned.filter((item) => selectedDomains.includes(item.domain)).map((item) => `${item.name} · ${item.concept_count} concepts`).join(' ; ')}</strong><br /><br /><span>Les codes et affectations actuels sont conservés. Les termes hérités non validés ne deviennent pas automatiquement des synonymes publiés.</span></>} confirmLabel="Activer les domaines sélectionnés" busy={busy === 'bootstrap'} onCancel={() => { if (!busy) setConfirmBootstrap(false); }} onConfirm={() => { void run('bootstrap', () => bootstrapThesaurus(selectedDomains), 'Domaines activés et publication initiale disponible.').then((success) => { setConfirmBootstrap(false); if (success) setSelectedDomains([]); }); }} />
  </section>;
}
