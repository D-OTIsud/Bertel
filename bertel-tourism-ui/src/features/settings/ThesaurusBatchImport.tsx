'use client';

import { useState } from 'react';
import { Modal } from '../../components/common/Modal';
import { getThesaurusDomainLabel } from '../../lib/thesaurus-domain-labels';
import { parseThesaurusContentBatch, type ThesaurusContentBatch, type ThesaurusImportAnalysis } from '../../lib/thesaurus-content-batch';
import { analyseThesaurusImport, importThesaurusCorrections, thesaurusErrorMessage, validateThesaurusImport, type ThesaurusBatchProgress } from '../../services/thesaurus-admin';
import type { ThesaurusDomain, ThesaurusRevision } from '../../types/thesaurus-admin';

const FIELD_NAMES: Record<string, string> = { name: 'libellé français', description: 'définition française', name_i18n: 'libellés traduits', description_i18n: 'définitions traduites', labels: 'synonymes et termes de recherche', notes: 'notes et sources', relations: 'relations sémantiques', mappings: 'correspondances externes', replaced_by: 'remplacements', parent_concept_id: 'parent', lifecycle: 'état', assignable: 'possibilité d’affectation', valid_from: 'début de validité', valid_to: 'fin de validité', legacy_search_terms: 'termes de recherche hérités' };

export function ThesaurusBatchImport({ open, onOpenChange, domains, onSaved }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  domains: ThesaurusDomain[];
  onSaved: (revisions: ThesaurusRevision[]) => Promise<void>;
}) {
  const [text, setText] = useState('');
  const [batch, setBatch] = useState<ThesaurusContentBatch | null>(null);
  const [analysis, setAnalysis] = useState<ThesaurusImportAnalysis | null>(null);
  const [revisions, setRevisions] = useState<ThesaurusRevision[]>([]);
  const [busy, setBusy] = useState<'analyse' | 'create' | 'validate' | null>(null);
  const [progress, setProgress] = useState<ThesaurusBatchProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [uncertain, setUncertain] = useState(false);
  const conflicts = analysis?.results.filter((item) => item.status === 'conflict') ?? [];
  const ready = analysis?.results.filter((item) => item.status === 'ready') ?? [];
  const unchanged = analysis?.results.filter((item) => item.status === 'unchanged') ?? [];
  const drafts = revisions.filter((item) => item.status === 'draft');
  const validated = revisions.filter((item) => item.status === 'validated');
  const invalid = drafts.filter((item) => item.errors.length > 0);

  async function updateWorkspace(saved: ThesaurusRevision[]) {
    try { await onSaved(saved); }
    catch { setError((current) => [current, 'Les réponses du serveur sont conservées ici, mais la liste des publications n’a pas pu être actualisée. Rechargez-la avant de publier.'].filter(Boolean).join(' ')); }
  }
  async function analyse() {
    setBusy('analyse'); setError(null); setNotice(null); setProgress(null); setUncertain(false);
    try {
      const parsed = parseThesaurusContentBatch(text);
      const result = await analyseThesaurusImport(parsed);
      setBatch(parsed); setAnalysis(result); setRevisions([]);
    } catch (cause) { setAnalysis(null); setBatch(null); setError(thesaurusErrorMessage(cause)); }
    finally { setBusy(null); }
  }
  async function create() {
    if (!batch || conflicts.length || !ready.length || revisions.length || uncertain) return;
    setBusy('create'); setError(null); setNotice(null);
    try {
      const result = await importThesaurusCorrections(batch, setProgress);
      setAnalysis(result.analysis); setRevisions(result.revisions); setUncertain(Boolean(result.uncertain));
      setError(result.error ?? null);
      if (result.analysis.results.some((item) => item.status === 'conflict')) setNotice('La vérification avant enregistrement a détecté un conflit. Aucun brouillon n’a été créé.');
      else setNotice(`${result.revisions.length} brouillon${result.revisions.length > 1 ? 's privés créés' : ' privé créé'}. La validation du lot est une action séparée.`);
      if (result.revisions.length || result.uncertain) await updateWorkspace(result.revisions);
    } catch (cause) { setError(thesaurusErrorMessage(cause)); }
    finally { setBusy(null); }
  }
  async function validate() {
    setBusy('validate'); setError(null); setNotice(null);
    try {
      const result = await validateThesaurusImport(revisions, setProgress);
      const updated = new Map(result.revisions.map((item) => [item.revision_id, item]));
      const merged = revisions.map((item) => updated.get(item.revision_id) ?? item);
      setRevisions(merged); setUncertain(Boolean(result.uncertain)); setError(result.error ?? null);
      const count = merged.filter((item) => item.status === 'validated').length;
      setNotice(`${count} brouillon${count > 1 ? 's validés' : ' validé'} sur ${merged.length}. Revenez aux publications pour vérifier l’aperçu et publier.`);
      await updateWorkspace(merged);
    } catch (cause) { setError(thesaurusErrorMessage(cause)); }
    finally { setBusy(null); }
  }

  return <Modal open={open} title="Importer des corrections" size="wide" onOpenChange={(value) => { if (!busy) onOpenChange(value); }} footer={<>
    <button type="button" className="ghost-button" disabled={Boolean(busy)} onClick={() => onOpenChange(false)}>Revenir aux publications</button>
    {!revisions.length && <button type="button" className="primary-button" disabled={Boolean(busy) || !batch || conflicts.length > 0 || ready.length === 0 || uncertain} onClick={() => void create()}>{busy === 'create' ? 'Création des brouillons…' : 'Créer les brouillons privés'}</button>}
    {revisions.length > 0 && <button type="button" className="primary-button" disabled={Boolean(busy) || drafts.length === 0 || uncertain} onClick={() => void validate()}>{busy === 'validate' ? 'Validation…' : 'Valider les brouillons du lot'}</button>}
  </>}>
    <p>Collez le lot de corrections, puis analysez ses différences avec les valeurs courantes. Les brouillons existants sont préservés. La création et la validation ne publient aucun contenu.</p>
    <label htmlFor="thesaurus-import-json">Lot de corrections (JSON)<textarea id="thesaurus-import-json" rows={9} value={text} disabled={Boolean(busy) || revisions.length > 0 || uncertain} onChange={(event) => { setText(event.target.value); setAnalysis(null); setBatch(null); setError(null); setNotice(null); }} /></label>
    <button type="button" className="ghost-button" disabled={Boolean(busy) || !text.trim() || revisions.length > 0 || uncertain} onClick={() => void analyse()}>{busy === 'analyse' ? 'Analyse…' : 'Analyser le lot'}</button>
    {busy && progress && <p role="status">{busy === 'create' ? 'Création' : 'Validation'} : {progress.completed} / {progress.total} réponses confirmées.</p>}
    {error && <p role="alert" className="inline-alert inline-alert--danger">{error}</p>}
    {notice && <p role="status" className="inline-alert inline-alert--success">{notice}</p>}
    {uncertain && <p role="alert" className="inline-alert inline-alert--warning">La dernière requête n’a pas fourni de réponse certaine. Les groupes précédents restent enregistrés. Rechargez les brouillons et comparez leur contenu avant toute reprise ; ne relancez pas le lot entier.</p>}
    {analysis && <section aria-label="Résultat de l’analyse du lot">
      <h4>Lot {analysis.batch_id}</h4>
      <p>{ready.length} correction{ready.length > 1 ? 's prêtes' : ' prête'} · {unchanged.length} déjà à jour · {conflicts.length} conflit{conflicts.length > 1 ? 's' : ''}.</p>
      {conflicts.length > 0 && <p role="alert">Corrigez tous les conflits puis analysez à nouveau. Aucun brouillon ne sera créé tant qu’un conflit subsiste.</p>}
      {(conflicts.length ? conflicts : ready.slice(0, 20)).map((item, index) => <div className="thesaurus__repeated-card" key={index}><strong>{item.name ?? item.proposal.code}</strong><p>{getThesaurusDomainLabel(item.proposal.domain, domains.find((domain) => domain.domain === item.proposal.domain)?.name)}</p><p>{item.reason ?? `Champs modifiés : ${Object.keys(item.proposal.changes).map((field) => FIELD_NAMES[field] ?? field).join(', ')}.`}</p>{item.fields && <p>À comparer : {item.fields.map((field) => FIELD_NAMES[field] ?? field).join(', ')}.</p>}</div>)}
      {!conflicts.length && ready.length > 20 && <p className="pref__hint">Les 20 premières corrections sont présentées ici. Les {ready.length} corrections ont toutes été analysées ; leur comparaison complète sera disponible dans l’aperçu de publication.</p>}
    </section>}
    {revisions.length > 0 && <section aria-label="Brouillons du lot"><h4>{revisions.length} réponses de création confirmées · {validated.length} brouillons validés</h4><p>Les brouillons créés restent privés jusqu’à leur publication. Chaque groupe de 100 enregistrements au maximum est traité ensemble ; un arrêt conserve les groupes précédents.</p>{invalid.map((item) => <div key={item.revision_id} role="alert" className="inline-alert inline-alert--danger"><strong>{item.document.name}</strong><ul>{item.errors.map((issue, index) => <li key={index}>{issue.message}</li>)}</ul></div>)}<p className="pref__hint">Les brouillons validés du lot sont sélectionnés dans Publications. La prévisualisation et la publication restent deux actions explicites.</p></section>}
  </Modal>;
}
