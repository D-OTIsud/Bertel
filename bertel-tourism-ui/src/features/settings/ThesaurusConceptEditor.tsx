'use client';

import { useEffect, useId, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Plus, Trash2 } from 'lucide-react';
import { ConfirmDialog } from '../../components/common/ConfirmDialog';
import { thesaurusDocumentValues } from './thesaurus-document-display';
import {
  discardThesaurusDraft, fetchThesaurusWorkspace, normalizeThesaurusDocument, rebaseThesaurusDraft, saveThesaurusDraft,
  thesaurusErrorMessage, validateThesaurusDraft,
} from '../../services/thesaurus-admin';
import type {
  ThesaurusConcept, ThesaurusDocument, ThesaurusDomain, ThesaurusIssue, ThesaurusRevision,
} from '../../types/thesaurus-admin';

export const THESAURUS_LIFECYCLE_LABELS = { active: 'Actif', deprecated: 'Déprécié', retired: 'Retiré' } as const;

export function ThesaurusIssues({ errors, warnings }: { errors: ThesaurusIssue[]; warnings: ThesaurusIssue[] }) {
  return <>
    {errors.length > 0 && <div role="alert" className="inline-alert inline-alert--danger thesaurus__issues"><strong>À corriger avant validation</strong><ul>{errors.map((issue, index) => <li key={`${issue.code}-${index}`}>{issue.message}</li>)}</ul></div>}
    {warnings.length > 0 && <div role="note" className="inline-alert inline-alert--warning thesaurus__issues"><strong>Points à vérifier</strong><ul>{warnings.map((issue, index) => <li key={`${issue.code}-${index}`}>{issue.message}</li>)}</ul></div>}
  </>;
}

function ConceptPicker({ value, onChange, knownConcepts, domain, allowedDomains, label, excludeId }: {
  value: string | null; onChange: (id: string | null, concept?: ThesaurusConcept) => void; knownConcepts: ThesaurusConcept[];
  domain?: string; allowedDomains?: string[]; label: string; excludeId?: string;
}) {
  const id = useId();
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [opened, setOpened] = useState(false);
  const [selectedName, setSelectedName] = useState<string | null>(null);
  useEffect(() => { const timer = setTimeout(() => setQuery(search.trim()), 250); return () => clearTimeout(timer); }, [search]);
  const searchQuery = useQuery({
    queryKey: ['thesaurus-concept-lookup', domain, query],
    queryFn: () => fetchThesaurusWorkspace({ domain, query, page_size: 40 }),
    enabled: opened && query.length >= 2,
  });
  const selectedQuery = useQuery({
    queryKey: ['thesaurus-concept-selected', value],
    queryFn: () => fetchThesaurusWorkspace({ concept_ids: [value as string], page_size: 1 }),
    enabled: Boolean(value) && !knownConcepts.some((item) => item.concept_id === value),
  });
  const options = (query.length >= 2 ? searchQuery.data?.concepts ?? [] : knownConcepts)
    .filter((item) => item.concept_id !== excludeId && (!domain || item.domain === domain) && (!allowedDomains || allowedDomains.includes(item.domain))).slice(0, 40);
  const known = knownConcepts.find((item) => item.concept_id === value) ?? selectedQuery.data?.concepts.find((item) => item.concept_id === value);
  return <div className="thesaurus__picker">
    <label htmlFor={id}>{label}</label>
    {value && <div className="thesaurus__selected-reference"><span>{known?.name ?? selectedName ?? 'Concept lié'}{known && <small>{known.code}</small>}</span><button type="button" className="ghost-button" onClick={() => { onChange(null); setSelectedName(null); }}>Retirer</button></div>}
    <input id={id} type="search" value={search} placeholder="Rechercher un concept…" onChange={(event) => { setSearch(event.target.value); setOpened(true); }} onFocus={() => setOpened(true)} aria-controls={`${id}-options`} />
    {opened && <div id={`${id}-options`} className="thesaurus__picker-options">
      <div className="thesaurus__picker-head"><small>{query.length < 2 ? 'Concepts du domaine ouvert ; saisissez deux lettres pour élargir.' : 'Résultats de recherche'}</small><button type="button" className="ghost-button" onClick={() => setOpened(false)}>Fermer la recherche</button></div>
      {searchQuery.isFetching && query.length >= 2 && <p role="status">Recherche…</p>}
      {searchQuery.isError && <p role="alert">{thesaurusErrorMessage(searchQuery.error)}</p>}
      {options.map((item) => <button type="button" key={item.concept_id} className="thesaurus__picker-option" onClick={() => { onChange(item.concept_id, item); setSelectedName(item.name); setSearch(''); setOpened(false); }}><strong>{item.name}</strong><small>{item.domain} · {item.code}</small></button>)}
      {!searchQuery.isFetching && options.length === 0 && <p>Aucun concept ne correspond.</p>}
    </div>}
  </div>;
}

export function ThesaurusConceptEditor({ concept, initialRevision, domain, concepts, onSaved, onDirtyChange, onReload, onDiscarded }: {
  concept: ThesaurusConcept | null; initialRevision: ThesaurusRevision | null;
  domain: ThesaurusDomain; concepts: ThesaurusConcept[];
  onSaved: (revision: ThesaurusRevision) => void; onDirtyChange: (dirty: boolean) => void;
  onReload: () => void; onDiscarded?: () => void;
}) {
  const formId = useId();
  const initial = initialRevision?.document ?? concept ?? { name: '', code: '', lifecycle: 'active' };
  const [document, setDocument] = useState<ThesaurusDocument>(() => normalizeThesaurusDocument(initial));
  const [revision, setRevision] = useState<ThesaurusRevision | null>(initialRevision);
  const [savedSignature, setSavedSignature] = useState(() => JSON.stringify(normalizeThesaurusDocument(initial)));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<'save' | 'validate' | 'rebase' | 'discard' | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [language, setLanguage] = useState('en');
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [rebaseConflicts, setRebaseConflicts] = useState<Array<keyof ThesaurusDocument>>([]);
  const dirty = JSON.stringify(document) !== savedSignature;
  const languages = useMemo(() => [...new Set(['fr', ...Object.keys(document.name_i18n), ...Object.keys(document.description_i18n)])], [document.name_i18n, document.description_i18n]);
  useEffect(() => { onDirtyChange(dirty); }, [dirty, onDirtyChange]);
  const errors = revision?.errors ?? [];
  const warnings = revision?.warnings ?? [];
  const sourceKind = domain.source_kind ?? 'ref_code';
  const parentDomain = sourceKind === 'amenity' ? 'amenity_family' : sourceKind === 'sustainability_action' ? 'sustainability_category' : sourceKind === 'ref_code' ? domain.domain : undefined;
  const parentDomains = sourceKind === 'classification_value' ? ['classification_scheme', 'classification_value'] : undefined;
  const hasParent = sourceKind === 'ref_code' || sourceKind === 'amenity' || sourceKind === 'classification_value' || sourceKind === 'sustainability_action';
  function change(patch: Partial<ThesaurusDocument>) { setDocument((current) => ({ ...current, ...patch })); setError(null); setNotice(null); }
  function changeParent(parentId: string | null, parent?: ThesaurusConcept) {
    const fields = { ...document.source_fields };
    if (sourceKind === 'amenity') fields.family_id = parent?.source_key.id ?? null;
    if (sourceKind === 'sustainability_action') fields.category_id = parent?.source_key.id ?? null;
    if (sourceKind === 'classification_value') {
      fields.scheme_id = parent?.domain === 'classification_scheme' ? parent.source_key.id : parent?.source_fields?.scheme_id ?? fields.scheme_id;
    }
    change({ parent_concept_id: parentId, source_fields: fields });
  }

  async function rebase() {
    if (!revision) return;
    setBusy('rebase'); setError(null); setNotice(null);
    try {
      const saved = JSON.parse(savedSignature) as ThesaurusDocument;
      const local = document;
      const rebased = await rebaseThesaurusDraft(revision.revision_id, revision.version);
      const next = { ...rebased.document };
      const overlaps: Array<keyof ThesaurusDocument> = [];
      for (const key of Object.keys(local) as Array<keyof ThesaurusDocument>) {
        if (JSON.stringify(local[key]) === JSON.stringify(saved[key])) continue;
        if (JSON.stringify(rebased.document[key]) !== JSON.stringify(saved[key]) && JSON.stringify(rebased.document[key]) !== JSON.stringify(local[key])) overlaps.push(key);
        // Preserve unsaved local values without reverting unrelated canonical changes.
        Object.assign(next, { [key]: local[key] });
      }
      setRevision(rebased); setDocument(next); setSavedSignature(JSON.stringify(rebased.document));
      setRebaseConflicts(overlaps); onSaved(rebased);
      setNotice(overlaps.length ? 'La publication courante a changé des champs que vous éditiez aussi. Votre saisie reste présente ; comparez les champs signalés avant de valider.' : 'Brouillon repris sur la publication courante. Vos modifications locales éventuelles sont conservées ; validez de nouveau après vérification.');
    } catch (cause) { setError(thesaurusErrorMessage(cause)); }
    finally { setBusy(null); }
  }

  async function discard() {
    if (!revision) return;
    setBusy('discard'); setError(null); setNotice(null);
    try {
      await discardThesaurusDraft(revision.revision_id, revision.version);
      const current = normalizeThesaurusDocument(concept ?? { name: '', code: '' });
      setDocument(current); setSavedSignature(JSON.stringify(current)); setRevision(null); setRebaseConflicts([]);
      setNotice('Brouillon abandonné. La publication courante reste inchangée.');
      onDiscarded?.();
    } catch (cause) { setError(thesaurusErrorMessage(cause)); }
    finally { setBusy(null); setConfirmDiscard(false); }
  }

  async function save(validate = false) {
    if (sourceKind === 'amenity' && !document.source_fields?.family_id) { setError('Choisissez la famille de cet équipement avant d’enregistrer.'); return; }
    if (sourceKind === 'classification_value' && !document.source_fields?.scheme_id) { setError('Choisissez le schéma de classement avant d’enregistrer.'); return; }
    if (sourceKind === 'sustainability_action' && !document.source_fields?.category_id) { setError('Choisissez la catégorie de cette action de durabilité avant d’enregistrer.'); return; }
    setBusy(validate ? 'validate' : 'save'); setError(null); setNotice(null);
    try {
      let current = revision;
      if (dirty || !current) {
        current = await saveThesaurusDraft({
          concept_id: concept?.concept_id ?? current?.concept_id ?? null, domain: domain.domain,
          expected_version: current?.version ?? 0, document,
        });
        setRevision(current); setSavedSignature(JSON.stringify(document)); onSaved(current);
      }
      if (validate && current) {
        const validated = await validateThesaurusDraft(current.revision_id, current.version);
        setRevision(validated); onSaved(validated);
        setNotice(validated.status === 'validated' ? 'Brouillon validé. Vous pouvez préparer sa publication.' : 'Le brouillon est enregistré ; corrigez les points signalés avant validation.');
      } else setNotice('Brouillon enregistré. La version publiée reste inchangée.');
    } catch (cause) { setError(thesaurusErrorMessage(cause)); }
    finally { setBusy(null); }
  }

  return <section className="thesaurus__editor" aria-labelledby={`${formId}-heading`}>
    <header className="thesaurus__editor-head">
      <div><h3 id={`${formId}-heading`}>{concept?.name ?? 'Nouveau concept'}</h3><p className="muted">{domain.name}{concept && ` · ${concept.usage_count} fiche${concept.usage_count > 1 ? 's' : ''}`}</p></div>
      <span className={`thesaurus__badge ${revision?.status === 'validated' && !dirty ? 'is-valid' : ''}`}>{dirty ? 'Modifications non enregistrées' : revision?.status === 'validated' ? 'Brouillon validé' : revision && revision.status !== 'published' ? 'Brouillon' : concept ? 'Publié' : 'À créer'}</span>
    </header>
    {!domain.is_governed && <p role="note" className="inline-alert inline-alert--warning">Ce domaine doit être activé dans Configuration avant de publier ses modifications.</p>}
    {concept?.lifecycle !== 'active' && concept && <p className="inline-alert inline-alert--warning">Cette valeur historique reste consultable et conservable dans les fiches. Elle ne peut plus être choisie pour une nouvelle affectation.</p>}
    {error && <div role="alert" className="inline-alert inline-alert--danger"><p>{error}</p>{/contenu a changé/.test(error) && <button type="button" className="ghost-button" onClick={onReload}>Recharger la version courante</button>}</div>}
    {notice && <p role="status" className="inline-alert inline-alert--success">{notice}</p>}
    <ThesaurusIssues errors={errors} warnings={warnings} />
    {rebaseConflicts.length > 0 && <div className="inline-alert inline-alert--warning"><p>À comparer : {rebaseConflicts.map((key) => ({ name: 'libellé français', description: 'définition française', name_i18n: 'traductions des libellés', description_i18n: 'traductions des définitions', labels: 'termes', notes: 'notes et sources', relations: 'relations', mappings: 'correspondances', parent_concept_id: 'parent', source_fields: 'propriétés du catalogue', replaced_by: 'successeurs', lifecycle: 'état', code: 'code' }[key] ?? key)).join(', ')}.</p><label><input type="checkbox" onChange={(event) => { if (event.target.checked) setRebaseConflicts([]); }} /> J’ai comparé ces changements avec la publication courante.</label></div>}
    {concept && Object.keys(concept.source_key).length > 0 && <details className="thesaurus__section"><summary>Version publiée actuelle · lecture seule</summary><div className="thesaurus__comparison"><table className="data-table"><thead><tr><th scope="col">Champ</th><th scope="col">Valeur publiée</th></tr></thead><tbody>{Object.entries(thesaurusDocumentValues(concept, concepts)).filter(([, value]) => value && value !== '—').map(([field, value]) => <tr key={field}><th scope="row">{field}</th><td>{value}</td></tr>)}</tbody></table></div></details>}

    <form onSubmit={(event) => { event.preventDefault(); void save(); }}>
      <fieldset disabled={Boolean(busy)} className="thesaurus__fieldset">
        <legend>Identité et sens</legend>
        <div className="thesaurus__two-fields">
          <label htmlFor={`${formId}-code`}>Code stable<input id={`${formId}-code`} value={document.code} disabled={Boolean(concept || revision)} required onChange={(event) => change({ code: event.target.value })} /></label>
          <label htmlFor={`${formId}-lifecycle`}>État du concept<select id={`${formId}-lifecycle`} value={document.lifecycle} onChange={(event) => change({ lifecycle: event.target.value as ThesaurusDocument['lifecycle'] })}><option value="active">Actif</option><option value="deprecated">Déprécié — usage historique conservé</option><option value="retired">Retiré — fiches à requalifier</option></select></label>
        </div>
        {concept && <p className="pref__hint">Le code publié est conservé. Un changement de sens se traite par un nouveau concept et un remplacement.</p>}
        {hasParent && sourceKind !== 'ref_code' && <ConceptPicker label={sourceKind === 'amenity' ? 'Famille d’équipement' : sourceKind === 'sustainability_action' ? 'Catégorie de durabilité' : 'Schéma ou valeur de classement parent'} value={document.parent_concept_id} domain={parentDomain} allowedDomains={parentDomains} knownConcepts={concepts} excludeId={concept?.concept_id} onChange={changeParent} />}
        {sourceKind === 'language' && <label>Nom dans sa langue<input value={String(document.source_fields?.native_name ?? '')} onChange={(event) => change({ source_fields: { ...document.source_fields, native_name: event.target.value } })} /></label>}
        {languages.map((lang) => <div className="thesaurus__language" key={lang}>
          <div className="thesaurus__section-line"><strong>{lang === 'fr' ? 'Français' : lang.toUpperCase()}</strong>{lang !== 'fr' && <button type="button" className="ghost-button" onClick={() => { const names = { ...document.name_i18n }; const definitions = { ...document.description_i18n }; delete names[lang]; delete definitions[lang]; change({ name_i18n: names, description_i18n: definitions }); }}>Retirer cette langue</button>}</div>
          <label htmlFor={`${formId}-name-${lang}`}>Libellé préféré ({lang})<input id={`${formId}-name-${lang}`} value={lang === 'fr' ? document.name : document.name_i18n[lang] ?? ''} required={lang === 'fr'} onChange={(event) => change(lang === 'fr' ? { name: event.target.value } : { name_i18n: { ...document.name_i18n, [lang]: event.target.value } })} /></label>
          <label htmlFor={`${formId}-definition-${lang}`}>Définition ({lang})<textarea id={`${formId}-definition-${lang}`} rows={3} value={lang === 'fr' ? document.description : document.description_i18n[lang] ?? ''} required={lang === 'fr' && domain.require_definition} onChange={(event) => change(lang === 'fr' ? { description: event.target.value } : { description_i18n: { ...document.description_i18n, [lang]: event.target.value } })} /></label>
        </div>)}
        <div className="thesaurus__add-language"><label htmlFor={`${formId}-language`}>Ajouter une langue<input id={`${formId}-language`} value={language} placeholder="en, es, de…" onChange={(event) => setLanguage(event.target.value)} /></label><button type="button" className="ghost-button" onClick={() => { const lang = language.trim().toLowerCase(); if (!/^[a-z]{2,3}(?:-[a-z0-9]{2,8})*$/.test(lang)) { setError('Saisissez un code de langue valide, par exemple en ou es.'); return; } if (languages.includes(lang)) { setError('Cette langue est déjà présente. Modifiez ses champs existants.'); return; } change({ name_i18n: { ...document.name_i18n, [lang]: '' } }); }}>Ajouter</button></div>
      </fieldset>

      <details className="thesaurus__section" open><summary>Synonymes et termes de recherche <span>{document.labels.length}</span></summary>
        <p className="pref__hint">Un synonyme décrit le même concept. Un terme de recherche caché n’est pas présenté comme son libellé.</p>
        {document.labels.map((label, index) => <div className="thesaurus__repeat-row" key={index}>
          <label>Langue<input aria-label={`Langue du terme ${index + 1}`} value={label.lang} onChange={(event) => change({ labels: document.labels.map((item, position) => position === index ? { ...item, lang: event.target.value } : item) })} /></label>
          <label>Nature<select aria-label={`Nature du terme ${index + 1}`} value={label.kind} onChange={(event) => change({ labels: document.labels.map((item, position) => position === index ? { ...item, kind: event.target.value as 'alt' | 'hidden' } : item) })}><option value="alt">Synonyme</option><option value="hidden">Terme caché</option></select></label>
          <label className="thesaurus__grow">Terme<input aria-label={`Terme ${index + 1}`} value={label.value} onChange={(event) => change({ labels: document.labels.map((item, position) => position === index ? { ...item, value: event.target.value } : item) })} /></label>
          <button type="button" className="ghost-button thesaurus__icon-button" aria-label={`Retirer le terme ${index + 1}`} onClick={() => change({ labels: document.labels.filter((_, position) => position !== index) })}><Trash2 size={16} aria-hidden /></button>
        </div>)}
        <button type="button" className="ghost-button" onClick={() => change({ labels: [...document.labels, { lang: 'fr', kind: 'alt', value: '' }] })}><Plus size={15} aria-hidden /> Ajouter un terme</button>
      </details>

      <details className="thesaurus__section"><summary>Hiérarchie et relations <span>{document.relations.length}</span></summary>
        {hasParent && sourceKind === 'ref_code' && <ConceptPicker label="Concept parent" value={document.parent_concept_id} domain={parentDomain} knownConcepts={concepts} excludeId={concept?.concept_id} onChange={changeParent} />}
        {document.relations.map((relation, index) => <div className="thesaurus__relation-row" key={index}><label>Relation<select aria-label={`Nature de la relation ${index + 1}`} value={relation.type} onChange={(event) => change({ relations: document.relations.map((item, position) => position === index ? { ...item, type: event.target.value } : item) })}><option value="related">Terme associé</option><option value="exact_equivalent">Équivalence exacte validée</option></select></label><ConceptPicker label={`Concept lié ${index + 1}`} value={relation.target_id || null} knownConcepts={concepts} excludeId={concept?.concept_id} onChange={(target_id) => change({ relations: document.relations.map((item, position) => position === index ? { ...item, target_id: target_id ?? '' } : item) })} /><button type="button" className="ghost-button" aria-label={`Retirer la relation ${index + 1}`} onClick={() => change({ relations: document.relations.filter((_, position) => position !== index) })}>Retirer</button></div>)}
        <button type="button" className="ghost-button" onClick={() => change({ relations: [...document.relations, { type: 'related', target_id: '' }] })}><Plus size={15} aria-hidden /> Ajouter une relation</button>
        {document.lifecycle !== 'active' && <div className="thesaurus__replacement"><h4>Remplacements proposés</h4><p className="pref__hint">Plusieurs successeurs sont possibles. Les fiches ne sont jamais réaffectées automatiquement.</p>{document.replaced_by.map((target, index) => <ConceptPicker key={index} label={`Successeur ${index + 1}`} value={target || null} knownConcepts={concepts} excludeId={concept?.concept_id} onChange={(id) => change({ replaced_by: id ? document.replaced_by.map((item, position) => position === index ? id : item) : document.replaced_by.filter((_, position) => position !== index) })} />)}<button type="button" className="ghost-button" onClick={() => change({ replaced_by: [...document.replaced_by, ''] })}>Ajouter un successeur</button></div>}
      </details>

      <details className="thesaurus__section"><summary>Notes d’usage et sources <span>{document.notes.length}</span></summary>
        {document.notes.map((note, index) => <div className="thesaurus__repeated-card" key={index}><div className="thesaurus__two-fields"><label>Langue<input aria-label={`Langue de la note ${index + 1}`} value={note.lang} onChange={(event) => change({ notes: document.notes.map((item, position) => position === index ? { ...item, lang: event.target.value } : item) })} /></label><label>Type<select aria-label={`Type de la note ${index + 1}`} value={note.type} onChange={(event) => change({ notes: document.notes.map((item, position) => position === index ? { ...item, type: event.target.value } : item) })}><option value="scope">Quand employer ce terme</option><option value="source">Source</option><option value="history">Historique</option><option value="definition">Précision de définition</option></select></label></div><label>Note<textarea aria-label={`Texte de la note ${index + 1}`} value={note.value} onChange={(event) => change({ notes: document.notes.map((item, position) => position === index ? { ...item, value: event.target.value } : item) })} /></label><label>Référence ou URL<input aria-label={`Source de la note ${index + 1}`} value={note.source ?? ''} onChange={(event) => change({ notes: document.notes.map((item, position) => position === index ? { ...item, source: event.target.value } : item) })} /></label><button type="button" className="ghost-button" onClick={() => change({ notes: document.notes.filter((_, position) => position !== index) })}>Retirer cette note</button></div>)}
        <button type="button" className="ghost-button" onClick={() => change({ notes: [...document.notes, { lang: 'fr', type: 'scope', value: '', source: '' }] })}><Plus size={15} aria-hidden /> Ajouter une note</button>
      </details>

      <details className="thesaurus__section"><summary>Correspondances externes <span>{document.mappings.length}</span></summary>
        <p className="pref__hint">Une règle d’export ne prouve pas une équivalence. Renseignez la cible et la source de validation.</p>
        {document.mappings.map((mapping, index) => <div className="thesaurus__repeated-card" key={index}><div className="thesaurus__two-fields"><label>Correspondance<select aria-label={`Type de correspondance ${index + 1}`} value={mapping.type} onChange={(event) => change({ mappings: document.mappings.map((item, position) => position === index ? { ...item, type: event.target.value } : item) })}><option value="exactMatch">Exacte</option><option value="closeMatch">Proche</option><option value="broadMatch">Cible plus générale</option><option value="narrowMatch">Cible plus précise</option><option value="relatedMatch">Associée</option></select></label><label>Vocabulaire<input aria-label={`Vocabulaire externe ${index + 1}`} value={mapping.vocabulary} onChange={(event) => change({ mappings: document.mappings.map((item, position) => position === index ? { ...item, vocabulary: event.target.value } : item) })} /></label></div><label>URI du concept cible<input aria-label={`URI cible ${index + 1}`} type="url" value={mapping.target_uri} onChange={(event) => change({ mappings: document.mappings.map((item, position) => position === index ? { ...item, target_uri: event.target.value } : item) })} /></label><div className="thesaurus__two-fields"><label>Version<input aria-label={`Version externe ${index + 1}`} value={mapping.version ?? ''} onChange={(event) => change({ mappings: document.mappings.map((item, position) => position === index ? { ...item, version: event.target.value } : item) })} /></label><label>Source de validation<input aria-label={`Source de correspondance ${index + 1}`} value={mapping.source ?? ''} onChange={(event) => change({ mappings: document.mappings.map((item, position) => position === index ? { ...item, source: event.target.value } : item) })} /></label></div><button type="button" className="ghost-button" onClick={() => change({ mappings: document.mappings.filter((_, position) => position !== index) })}>Retirer cette correspondance</button></div>)}
        <button type="button" className="ghost-button" onClick={() => change({ mappings: [...document.mappings, { type: 'closeMatch', vocabulary: '', target_uri: '', version: '', source: '' }] })}><Plus size={15} aria-hidden /> Ajouter une correspondance</button>
      </details>

      {sourceKind === 'ref_code' && <details className="thesaurus__section"><summary>Dates de validité</summary><p className="pref__hint">Les versions publiées conservent ces dates. Leur contenu ne change pas au passage du calendrier.</p><div className="thesaurus__two-fields"><label>Valide à partir du<input type="date" value={String(document.source_fields?.valid_from ?? '')} onChange={(event) => change({ source_fields: { ...document.source_fields, valid_from: event.target.value || null } })} /></label><label>Valide jusqu’au<input type="date" value={String(document.source_fields?.valid_to ?? '')} onChange={(event) => change({ source_fields: { ...document.source_fields, valid_to: event.target.value || null } })} /></label></div></details>}

      <div className="thesaurus__editor-actions"><button type="submit" className="ghost-button" disabled={Boolean(busy) || (!dirty && Boolean(revision))}>{busy === 'save' ? 'Enregistrement…' : 'Enregistrer le brouillon'}</button><button type="button" className="primary-button" disabled={Boolean(busy) || rebaseConflicts.length > 0 || (!dirty && revision?.status === 'validated')} onClick={() => void save(true)}>{busy === 'validate' ? 'Vérification…' : 'Soumettre à validation'}</button></div>
    </form>
    {revision && <details className="thesaurus__section" open={Boolean(error)}><summary>Historique et reprise du brouillon</summary><p>Révision {revision.version} · {revision.status === 'published' ? 'Publiée' : revision.status === 'validated' ? 'Validée' : 'Brouillon'}</p>{revision.updated_at && <p className="muted">Dernière modification : {new Date(revision.updated_at).toLocaleString('fr-FR')}</p>}<p className="pref__hint">Toute nouvelle modification annule la validation. Une publication conserve une version immuable.</p>{revision.status !== 'published' && <div className="thesaurus__recovery-actions"><button type="button" className="ghost-button" disabled={Boolean(busy)} onClick={() => void rebase()}>{busy === 'rebase' ? 'Reprise…' : 'Reprendre sur la publication courante'}</button><button type="button" className="ghost-button" disabled={Boolean(busy)} onClick={() => setConfirmDiscard(true)}>Abandonner ce brouillon</button></div>}</details>}
    <ConfirmDialog open={confirmDiscard} title="Abandonner ce brouillon ?" message="La proposition enregistrée et vos modifications locales seront abandonnées. La version publiée et les affectations des fiches sont conservées." confirmLabel="Abandonner le brouillon" busy={busy === 'discard'} onCancel={() => { if (!busy) setConfirmDiscard(false); }} onConfirm={() => void discard()} />
  </section>;
}
