import { cloneElement, isValidElement, useId, type ReactElement, type ReactNode } from 'react';

interface FieldProps {
  label: string;
  hint?: string;
  /** Erreur inline : rend un <p role="alert"> et pose aria-invalid sur l'enfant. */
  error?: string;
  required?: boolean;
  children: ReactNode;
}

/**
 * D2 (revue UX) : label réellement associé (htmlFor/id), hint lisible par tous
 * (paragraphe + aria-describedby, plus seulement un title au survol) et erreur
 * inline annoncée (role=alert + aria-invalid) — le tout injecté sur l'enfant
 * via cloneElement, donc sans changer les appelants.
 * Plafond : l'enfant doit transmettre id/aria-* à son contrôle natif
 * (Input/Textarea/Select le font) ; un contrôle composé prend `id` explicitement.
 */
export function Field({ label, hint, error, required, children }: FieldProps) {
  const uid = useId();
  const inputId = `field-${uid}`;
  const hintId = hint ? `hint-${uid}` : undefined;
  const errorId = error ? `error-${uid}` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(' ') || undefined;

  const wired = isValidElement(children)
    ? cloneElement(children as ReactElement<Record<string, unknown>>, {
        id: inputId,
        'aria-invalid': error ? true : undefined,
        'aria-describedby': describedBy,
        'aria-required': required ? true : undefined,
      })
    : children;

  return (
    <div className="field">
      <div className="field__label">
        <label htmlFor={inputId}>
          {label}
          {required && (
            <span className="req" aria-hidden="true">
              {' '}
              *
            </span>
          )}
          {required && <span className="sr-only"> (obligatoire)</span>}
        </label>
        {hint && (
          <span className="help" aria-hidden="true" title={hint}>
            ?
          </span>
        )}
      </div>
      {hint && (
        <p id={hintId} className="field__hint">
          {hint}
        </p>
      )}
      {wired}
      {error && (
        <p id={errorId} className="field__error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
