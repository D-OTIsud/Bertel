'use client';

// §211 — modale d'edition d'une ligne de catalogue de reference. Les champs sont derives de
// la forme du catalogue (buildCatalogFieldSpec, tache 6) ; les listes deroulantes de reference
// se chargent depuis catalog.fks, dont chaque `target` est deja un catalog_key exploitable
// (ex. 'ref_code:amenity_family') grace a la normalisation de la vue (tache 1) — sans elle on
// interrogerait une partition absente. Les traductions se saisissent EN LIGNE (details/summary)
// et non dans une modale imbriquee : Modal garde une modale sortante montee le temps de son
// animation de sortie, et deux modales simultanees se marchent dessus.

import { useMemo, useState } from 'react';
import { useMutation, useQueries } from '@tanstack/react-query';
import { Modal } from '../components/common/Modal';
import {
  buildCatalogFieldSpec, buildRowKey, formatRowLabel,
  type CatalogField,
} from '../features/settings/catalog-fields';
import { getRefCatalog, upsertRefRow, type RefCatalogDetail } from '../services/ref-catalogs';

/** Langues traduisibles, alignees sur RefCodeEditor (le libelle est le FR canonique). */
const I18N_LANGS: Array<{ code: string; label: string }> = [
  { code: 'en', label: 'Anglais (EN)' },
  { code: 'de', label: 'Allemand (DE)' },
];

interface Props {
  catalog: RefCatalogDetail;
  /** `null` ⇒ creation. */
  row: Record<string, unknown> | null;
  /** `false` ⇒ la modale se ferme ; elle reste MONTEE le temps de son animation de sortie. */
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}

export function RefCatalogRowModal({ catalog, row, open, onOpenChange, onSaved }: Props) {
  const mode = row ? 'edit' : 'create';
  const fields = useMemo(
    () => buildCatalogFieldSpec(catalog.columns, catalog.fks, catalog.primaryKeyColumns, mode),
    [catalog.columns, catalog.fks, catalog.primaryKeyColumns, mode],
  );

  const [draft, setDraft] = useState<Record<string, unknown>>(() => {
    const initial: Record<string, unknown> = {};
    for (const field of fields) {
      initial[field.name] = row?.[field.name] ?? '';
      if (field.kind === 'i18n-text') {
        initial[`${field.name}_i18n`] = row?.[`${field.name}_i18n`] ?? {};
      }
    }
    return initial;
  });
  const [error, setError] = useState<string | null>(null);

  // Options des references : une requete par catalogue cible, mise en cache par TanStack.
  // Chaque `target` est deja un catalog_key exploitable (ref_code:amenity_family) grace a
  // la normalisation de la vue — sans elle on interrogerait une partition absente.
  const referenceTargets = useMemo(
    () => [...new Set(fields.filter((f) => f.kind === 'reference').map((f) => f.target as string))],
    [fields],
  );
  const referenceQueries = useQueries({
    queries: referenceTargets.map((target) => ({
      queryKey: ['ref-catalog', target],
      queryFn: () => getRefCatalog(target),
      staleTime: 5 * 60 * 1000,
    })),
  });
  const optionsByTarget = new Map<string, { value: string; label: string }[]>();
  referenceTargets.forEach((target, index) => {
    const data = referenceQueries[index].data;
    if (!data) return;
    optionsByTarget.set(target, data.rows.map((r) => ({
      value: String(r[data.primaryKeyColumns[0]] ?? ''),
      label: formatRowLabel(r, data.labelColumn, data.primaryKeyColumns),
    })));
  });

  const save = useMutation({
    mutationFn: async () => {
      const values: Record<string, unknown> = {};
      for (const field of fields) {
        // Une colonne verrouillee n'est pas renvoyee : le serveur leverait UNKNOWN_COLUMN.
        if (field.locked) continue;
        const value = draft[field.name];
        // Un champ vide doit partir en `null`, PAS en chaine vide : `(p_values->>'x')::integer`
        // sur '' leve `invalid input syntax for type integer`. Une chaine JSON null rend NULL.
        values[field.name] = coerceEmpty(field, value);
        if (field.kind === 'i18n-text') {
          values[`${field.name}_i18n`] = draft[`${field.name}_i18n`] ?? {};
        }
      }
      await upsertRefRow(
        catalog.catalogKey,
        row ? buildRowKey(row, catalog.primaryKeyColumns) : null,
        values,
      );
    },
    onSuccess: () => { setError(null); onSaved(); },
    onError: (err: Error) => setError(humaniseCatalogError(err.message)),
  });

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title={row ? 'Modifier la valeur' : 'Ajouter une valeur'}
      footer={
        <>
          <button type="button" onClick={() => onOpenChange(false)}>Annuler</button>
          <button type="button" onClick={() => save.mutate()} disabled={save.isPending}>
            Enregistrer
          </button>
        </>
      }
    >
      {error && <p role="alert" className="form-error">{error}</p>}
      {fields.map((field) => (
        <div key={field.name} className="field-block">
          <label htmlFor={`catalog-field-${field.name}`}>{field.name}</label>
          {renderControl(field, draft[field.name],
            (value) => setDraft((current) => ({ ...current, [field.name]: value })),
            optionsByTarget.get(field.target ?? ''))}

          {/* Traductions EN LIGNE plutot qu'en modale imbriquee : Modal garde une modale
              sortante montee le temps de son animation, deux modales simultanees se
              marchent dessus. C'est ce qui preserve l'i18n de RefCodeEditor. */}
          {field.kind === 'i18n-text' && (
            <details className="field-block__i18n">
              <summary>Traductions</summary>
              {I18N_LANGS.map((lang) => (
                <div key={lang.code} className="field-block">
                  <label htmlFor={`i18n-${field.name}-${lang.code}`}>{lang.label}</label>
                  <input
                    id={`i18n-${field.name}-${lang.code}`}
                    aria-label={`${field.name} — ${lang.label}`}
                    value={String(
                      (draft[`${field.name}_i18n`] as Record<string, string>)?.[lang.code] ?? '')}
                    placeholder={String(draft[field.name] ?? '')}
                    onChange={(e) => setDraft((current) => ({
                      ...current,
                      [`${field.name}_i18n`]: {
                        ...(current[`${field.name}_i18n`] as Record<string, string>),
                        [lang.code]: e.target.value,
                      },
                    }))}
                  />
                </div>
              ))}
            </details>
          )}
        </div>
      ))}
    </Modal>
  );
}

/** Un champ vide rend `null` pour tout ce qui n'est pas du texte libre. */
function coerceEmpty(field: CatalogField, value: unknown): unknown {
  if (field.kind === 'boolean') return Boolean(value);
  if (value === '' || value === undefined) return null;
  return value;
}

function renderControl(
  field: CatalogField,
  value: unknown,
  onChange: (value: unknown) => void,
  options?: { value: string; label: string }[],
) {
  const id = `catalog-field-${field.name}`;
  if (field.kind === 'boolean') {
    return <input id={id} type="checkbox" checked={Boolean(value)} disabled={field.locked}
      aria-label={field.name} onChange={(e) => onChange(e.target.checked)} />;
  }
  if (field.kind === 'select' || field.kind === 'reference') {
    const list = field.kind === 'select'
      ? (field.options ?? []).map((o) => ({ value: o, label: o }))
      : (options ?? []);
    return (
      <select id={id} value={String(value ?? '')} disabled={field.locked} aria-label={field.name}
        onChange={(e) => onChange(e.target.value)}>
        <option value="">—</option>
        {list.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    );
  }
  const inputType = field.kind === 'number' ? 'number' : field.kind === 'date' ? 'date' : 'text';
  return <input id={id} type={inputType} value={String(value ?? '')} disabled={field.locked}
    aria-label={field.name} onChange={(e) => onChange(e.target.value)} />;
}

/** Les codes d'erreur du RPC deviennent des phrases : une erreur PostgreSQL brute ne doit
 *  jamais remonter a l'utilisateur. */
export function humaniseCatalogError(message: string): string {
  if (message.includes('LOCKED_CATALOG')) return 'Ce catalogue est en lecture seule.';
  if (message.includes('CODE_IMMUTABLE')) return "Le code d'une valeur existante ne se change pas.";
  if (message.includes('STILL_REFERENCED')) return 'Cette valeur est utilisee par des fiches.';
  if (message.includes('ROW_NOT_FOUND')) return 'Cette valeur a ete supprimee entre-temps.';
  if (message.includes('REQUIRED_HIDDEN_COLUMN')) return 'Une information obligatoire manque.';
  if (message.includes('UNKNOWN_COLUMN')) return 'Ce champ ne peut pas etre enregistre ici.';
  if (message.includes('INCOMPLETE_ORDER')) return 'La liste a change : rechargez avant de reordonner.';
  return "L'enregistrement a echoue.";
}
