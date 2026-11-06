import type { ThesaurusConcept, ThesaurusDocument } from '../../types/thesaurus-admin';

const lifecycleLabels = { active: 'Actif', deprecated: 'Déprécié', retired: 'Retiré' };
const noteLabels: Record<string, string> = { scope: 'Périmètre', definition: 'Définition', history: 'Historique', source: 'Source' };

/** Shared by the read-only published state and the exact publication comparison. */
export function thesaurusDocumentValues(document: ThesaurusDocument | undefined, concepts: ThesaurusConcept[]): Record<string, string> {
  if (!document) return {};
  const conceptName = (id: string | null | undefined) => {
    if (!id) return '—';
    const concept = concepts.find((item) => item.concept_id === id);
    return concept ? `${concept.name} (${concept.code})` : `Concept lié · ${id}`;
  };
  return {
    'Code': document.code, 'Libellé français': document.name, 'Définition française': document.description,
    'Autres libellés': Object.entries(document.name_i18n).map(([lang, value]) => `${lang} : ${value}`).join('\n'),
    'Autres définitions': Object.entries(document.description_i18n).map(([lang, value]) => `${lang} : ${value}`).join('\n'),
    'État': lifecycleLabels[document.lifecycle],
    'Parent': conceptName(document.parent_concept_id),
    'Termes': document.labels.map((item) => `${item.lang} · ${item.kind === 'alt' ? 'Synonyme' : 'Caché'} : ${item.value}`).join('\n'),
    'Notes et sources': document.notes.map((item) => `${item.lang} · ${noteLabels[item.type] ?? item.type} : ${item.value}${item.source ? ` (${item.source})` : ''}`).join('\n'),
    'Relations': document.relations.map((item) => `${item.type === 'related' ? 'Associé' : 'Équivalent exact'} : ${conceptName(item.target_id)}`).join('\n'),
    'Correspondances': document.mappings.map((item) => `${item.vocabulary}${item.version ? ` (${item.version})` : ''} · ${item.type} · ${item.target_uri}${item.source ? ` (${item.source})` : ''}`).join('\n'),
    'Successeurs': document.replaced_by.map(conceptName).join('\n'),
    'Nom dans sa langue': String(document.source_fields?.native_name ?? ''),
    'Début de validité': String(document.source_fields?.valid_from ?? ''),
    'Fin de validité': String(document.source_fields?.valid_to ?? ''),
  };
}
