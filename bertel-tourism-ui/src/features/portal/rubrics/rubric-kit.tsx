'use client';

/**
 * Les briques communes à toutes les rubriques du portail (18a, D10).
 *
 * UN SEUL MOTIF POUR TOUS LES CHAMPS : libellé VISIBLE au-dessus, phrase d'aide sous le
 * libellé, erreur en TEXTE sous le champ (jamais la couleur seule — un partenaire
 * daltonien, ou un écran au soleil, ne verrait rien). Le champ porte `aria-invalid` et
 * `aria-describedby` : le lecteur d'écran lit l'aide ET l'erreur au moment où le doigt
 * arrive dans le champ, pas après coup.
 *
 * `useRubricForm` — §212. L'état du formulaire est LOCAL (rien ne part avant « Valider »),
 * mais il doit se resynchroniser quand la rubrique affichée change, PENDANT LE RENDU. Un
 * `useEffect` de resynchronisation laisserait passer un rendu avec les valeurs de la
 * rubrique précédente : le partenaire verrait son téléphone dans le champ « e-mail ».
 */
import { useState, type ReactNode } from 'react';

/** Les attributs que le champ doit reprendre pour que l'aide et l'erreur soient lues. */
export interface PortalFieldSlots {
  id: string;
  'aria-describedby': string | undefined;
  'aria-invalid': true | undefined;
  className: string;
}

export function PortalField({
  id,
  label,
  hint,
  error,
  children,
}: {
  id: string;
  label: ReactNode;
  hint?: ReactNode;
  /** Phrase COMPLÈTE, en français courant. `null` quand tout va bien. */
  error?: string | null;
  children: (slots: PortalFieldSlots) => ReactNode;
}) {
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(' ') || undefined;

  return (
    <div className="auth-field portal-field">
      <label htmlFor={id}>{label}</label>
      {hint ? (
        <p className="auth-field__hint" id={hintId}>
          {hint}
        </p>
      ) : null}
      {children({
        id,
        'aria-describedby': describedBy,
        'aria-invalid': error ? true : undefined,
        className: error ? 'portal-input portal-input--invalid' : 'portal-input',
      })}
      {error ? (
        <p className="field-error" id={errorId}>
          {error}
        </p>
      ) : null}
    </div>
  );
}

/**
 * Une case ou un bouton radio à cocher, taillé pour un pouce (≥ 56 px) : le libellé fait
 * partie de la cible, on ne vise jamais la petite case.
 */
export function PortalChoice({
  type,
  name,
  checked,
  onChange,
  disabled,
  children,
}: {
  type: 'checkbox' | 'radio';
  name?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  children: ReactNode;
}) {
  return (
    <label className="portal-choice">
      <input
        type={type}
        name={name}
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span>{children}</span>
    </label>
  );
}

/**
 * Le pied commun d'une rubrique. « Valider » est un `submit` : la touche Entrée d'un
 * clavier de téléphone valide donc le formulaire, comme partout ailleurs.
 */
export function PortalRubricActions({ onCancel, disabled }: { onCancel: () => void; disabled?: boolean }) {
  return (
    <div className="portal-rubric-actions">
      <button type="submit" className="primary-button" disabled={disabled}>
        Valider
      </button>
      <button type="button" className="ghost-button" onClick={onCancel}>
        Retour sans changer
      </button>
      <p className="muted portal-rubric-actions__note">
        Rien n’est envoyé pour l’instant. Vous enverrez tout depuis la page de la fiche.
      </p>
    </div>
  );
}

export interface RubricForm<T> {
  form: T;
  setForm: (next: T | ((previous: T) => T)) => void;
  /** Le formulaire a été touché depuis son ouverture — quitter perdrait la saisie. */
  dirty: boolean;
}

/**
 * L'état local d'un formulaire de rubrique, resynchronisé PENDANT LE RENDU quand la clé
 * change (motif §212). `read` est appelée à la volée : ne lui donner que des lectures pures.
 */
export function useRubricForm<T>(formKey: string, read: () => T): RubricForm<T> {
  const [state, setState] = useState<{ key: string; initial: T; value: T }>(() => {
    const value = read();
    return { key: formKey, initial: value, value };
  });

  if (state.key !== formKey) {
    const value = read();
    setState({ key: formKey, initial: value, value });
  }

  const setForm = (next: T | ((previous: T) => T)) =>
    setState((previous) => ({
      ...previous,
      value: typeof next === 'function' ? (next as (p: T) => T)(previous.value) : next,
    }));

  return {
    form: state.value,
    setForm,
    dirty: serialize(state.value) !== serialize(state.initial),
  };
}

function serialize(value: unknown): string {
  try {
    return JSON.stringify(value) ?? '';
  } catch {
    // Un formulaire non sérialisable serait déclaré modifié par prudence : mieux vaut une
    // confirmation de trop qu'une saisie jetée en silence.
    return Math.random().toString();
  }
}
