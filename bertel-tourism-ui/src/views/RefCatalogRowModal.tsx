'use client';

// §211 — modale d'edition d'une ligne de catalogue de reference. Les champs sont derives de
// la forme du catalogue (buildCatalogFieldSpec, tache 6) ; les listes deroulantes de reference
// se chargent depuis catalog.fks, dont chaque `target` est deja un catalog_key exploitable
// (ex. 'ref_code:amenity_family') grace a la normalisation de la vue (tache 1) — sans elle on
// interrogerait une partition absente. Les traductions se saisissent EN LIGNE (details/summary)
// et non dans une modale imbriquee : Modal garde une modale sortante montee le temps de son
// animation de sortie, et deux modales simultanees se marchent dessus.

import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQueries } from '@tanstack/react-query';
import { Modal } from '../components/common/Modal';
import {
  buildCatalogFieldSpec, buildRowKey, formatRowLabel, rowKeyString,
  type CatalogField,
} from '../features/settings/catalog-fields';
import { getRefCatalog, upsertRefRow, type RefCatalogDetail } from '../services/ref-catalogs';

/** Langues traduisibles ; le libelle saisi hors traduction reste le FR canonique. */
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

/** Etat brut d'un champ, avant saisie — factorise car reconstruit a deux endroits
 *  (etat initial paresseux + resynchronisation, voir plus bas). */
function buildInitialDraft(
  fields: CatalogField[],
  row: Record<string, unknown> | null,
): Record<string, unknown> {
  const initial: Record<string, unknown> = {};
  for (const field of fields) {
    initial[field.name] = row?.[field.name] ?? '';
    if (field.kind === 'i18n-text') {
      initial[`${field.name}_i18n`] = row?.[`${field.name}_i18n`] ?? {};
    }
  }
  return initial;
}

interface ReferenceOptionsState {
  options: { value: string; label: string }[];
  isLoading: boolean;
  isError: boolean;
}

export function RefCatalogRowModal({ catalog, row, open, onOpenChange, onSaved }: Props) {
  const mode = row ? 'edit' : 'create';
  const fields = useMemo(
    () => buildCatalogFieldSpec(catalog.columns, catalog.fks, catalog.primaryKeyColumns, mode),
    [catalog.columns, catalog.fks, catalog.primaryKeyColumns, mode],
  );

  const [draft, setDraft] = useState<Record<string, unknown>>(() => buildInitialDraft(fields, row));
  const [error, setError] = useState<string | null>(null);

  // §211 revue T8, constat 1 (CRITIQUE) : Modal reste MONTEE par contrat (son en-tete
  // interdit `if (!open) return null`), donc l'initialiseur paresseux de useState ci-dessus
  // ne s'execute qu'au tout premier montage. Sans resynchronisation explicite, annuler sur
  // la ligne A puis rouvrir sur la ligne B laisse `draft` porter les valeurs de A —
  // « Enregistrer » cible bien B (buildRowKey lit `row`) mais y ECRIT les valeurs de A.
  // On resynchronise sur la transition d'ouverture / le changement de ligne (identifie par
  // sa cle canonique, PAS la reference d'objet — un simple refetch qui recree `row` ne doit
  // pas ecraser une saisie en cours) ou de catalogue, jamais a chaque rendu (ce qui
  // detruirait la saisie en cours pendant que la modale reste ouverte sur la meme ligne).
  const rowSignature = row ? rowKeyString(row, catalog.primaryKeyColumns) : null;
  useEffect(() => {
    if (!open) return;
    setDraft(buildInitialDraft(fields, row));
    setError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `fields`/`row` volontairement
    // absents : le vrai signal de « nouvelle ligne a editer » est rowSignature (+ catalogue),
    // pas leurs references d'objet qui changent a chaque rendu.
  }, [open, rowSignature, catalog.catalogKey]);

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

  // §211 revue T8, constat 3 (mineur) : `useQueries` rend un NOUVEAU tableau conteneur a
  // chaque rendu meme quand aucune requete n'a change d'etat (ex. une frappe dans un champ
  // texte re-rend tout le composant) — deriver la Map directement sur `referenceQueries`
  // annulerait donc toute memoisation. `referenceStateKey` resume l'etat REEL (statut +
  // horodatage de derniere reussite) de chaque requete ; c'est LUI la dependance utile.
  const referenceStateKey = referenceQueries.map((q) => `${q.status}:${q.dataUpdatedAt}`).join('|');
  const optionsByTarget = useMemo(() => {
    const map = new Map<string, ReferenceOptionsState>();
    referenceTargets.forEach((target, index) => {
      const query = referenceQueries[index];
      const data = query.data;
      map.set(target, {
        isLoading: query.isLoading,
        isError: query.isError,
        options: data
          ? data.rows.map((r) => ({
              value: String(r[data.primaryKeyColumns[0]] ?? ''),
              label: formatRowLabel(r, data.labelColumn, data.primaryKeyColumns),
            }))
          : [],
      });
    });
    return map;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `referenceStateKey` resume deja
    // (statut + dataUpdatedAt) l'etat pertinent de chaque requete ; `referenceQueries` en
    // dependance directe recreerait la Map a chaque rendu (voir commentaire ci-dessus).
  }, [referenceTargets, referenceStateKey]);

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
              marchent dessus. C'est ce qui preserve la saisie i18n en ligne. */}
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
  refState?: ReferenceOptionsState,
) {
  const id = `catalog-field-${field.name}`;
  if (field.kind === 'boolean') {
    return <input id={id} type="checkbox" checked={Boolean(value)} disabled={field.locked}
      aria-label={field.name} onChange={(e) => onChange(e.target.checked)} />;
  }
  if (field.kind === 'reference') {
    return renderReferenceSelect(field, value, onChange, refState);
  }
  if (field.kind === 'select') {
    const list = (field.options ?? []).map((o) => ({ value: o, label: o }));
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

/**
 * §211 revue T8, constat 2 (important) : distingue « en cours de chargement », « en echec »
 * et « vide » — le code precedent traitait les trois identiquement (`if (!data) return`),
 * offrant un `<select>` avec la seule option vide sans jamais dire pourquoi. En edition, si
 * la valeur courante pointe vers une cible pas encore chargee (ou dont le chargement a
 * echoue), l'utilisateur voyait « — » alors que `draft` porte toujours la vraie valeur —
 * l'ecran mentait sur l'etat reel. Une option de secours (portant la valeur brute) est donc
 * injectee des que la valeur courante n'apparait pas dans la liste chargee, qu'elle qu'en
 * soit la raison (chargement, echec, ou valeur retiree du catalogue cible).
 */
function renderReferenceSelect(
  field: CatalogField,
  value: unknown,
  onChange: (value: unknown) => void,
  refState: ReferenceOptionsState | undefined,
) {
  const id = `catalog-field-${field.name}`;
  const isLoading = refState?.isLoading ?? false;
  const isError = refState?.isError ?? false;
  const options = refState?.options ?? [];
  const stringValue = String(value ?? '');
  const hasCurrentInList = stringValue === '' || options.some((o) => o.value === stringValue);
  const fallbackLabel = isLoading
    ? `${stringValue} (chargement…)`
    : isError
      ? `${stringValue} (liste indisponible)`
      : stringValue;

  return (
    <>
      <select id={id} value={stringValue} disabled={field.locked || isLoading}
        aria-label={field.name} aria-busy={isLoading}
        onChange={(e) => onChange(e.target.value)}>
        <option value="">—</option>
        {!hasCurrentInList && <option value={stringValue}>{fallbackLabel}</option>}
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      {isLoading && <span role="status" className="field-block__hint">Chargement…</span>}
      {isError && (
        <span role="alert" className="field-block__error">
          Impossible de charger les valeurs de reference.
        </span>
      )}
    </>
  );
}

/** Les codes d'erreur du RPC deviennent des phrases : une erreur PostgreSQL brute ne doit
 *  jamais remonter à l'utilisateur. Couvre aussi bien les échecs d'ECRITURE (upsert/delete/
 *  reorder) que de LECTURE (list_ref_catalogs/get_ref_catalog) — FORBIDDEN et UNKNOWN_CATALOG
 *  sont levés par les cinq RPC, revue T9 constat 1. */
export function humaniseCatalogError(message: string): string {
  if (message.includes('FORBIDDEN')) return 'Accès réservé aux super-administrateurs.';
  if (message.includes('UNKNOWN_CATALOG')) return 'Ce catalogue est introuvable.';
  if (message.includes('LOCKED_CATALOG')) return 'Ce catalogue est en lecture seule.';
  if (message.includes('CODE_IMMUTABLE')) return "Le code d'une valeur existante ne se change pas.";
  if (message.includes('STILL_REFERENCED')) return 'Cette valeur est utilisee par des fiches.';
  if (message.includes('ROW_NOT_FOUND')) return 'Cette valeur a ete supprimee entre-temps.';
  if (message.includes('REQUIRED_HIDDEN_COLUMN')) return 'Une information obligatoire manque.';
  if (message.includes('UNKNOWN_COLUMN')) return 'Ce champ ne peut pas etre enregistre ici.';
  if (message.includes('INCOMPLETE_ORDER')) return 'La liste a change : rechargez avant de reordonner.';
  return "L'enregistrement a echoue.";
}
