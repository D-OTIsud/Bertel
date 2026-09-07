'use client';

import { useEffect, useRef, useState } from 'react';
import { Loader2, Sparkles } from 'lucide-react';
import { translateWithAi, type AiTranslationInput } from '../../services/ai-translate';
import { useServiceAvailability } from '../../hooks/useServiceAvailability';

export interface AiTranslateButtonProps extends AiTranslationInput {
  existingValues?: Record<string, string>;
  sourceLabel?: string;
  targetLabel?: string;
  /** Include the edit scope/form identity to invalidate a response after navigation or reset. */
  contextKey?: string;
  disabled?: boolean;
  onTranslated: (translations: Record<string, string>) => void;
}

/** Every changed source/target creates a new request lifetime, so late AI results cannot erase edits. */
export function AiTranslateButton(props: AiTranslateButtonProps) {
  const key = JSON.stringify([
    props.objectId, props.sourceLanguage, props.targetLanguage, props.contextKey,
    props.fields, props.existingValues, props.disabled,
  ]);
  return <TranslationAction key={key} {...props} />;
}

function TranslationAction({
  objectId, sourceLanguage, targetLanguage, fields, existingValues = {},
  sourceLabel = sourceLanguage, targetLabel = targetLanguage, disabled, onTranslated,
}: AiTranslateButtonProps) {
  const { translation } = useServiceAvailability();
  const [replaceExisting, setReplaceExisting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const request = useRef<AbortController | null>(null);
  const onResult = useRef(onTranslated);
  onResult.current = onTranslated;
  useEffect(() => () => { request.current?.abort(); }, []);
  // Settings can change while a draft is open. Abort before hiding so a late
  // response cannot overwrite text after translation was disabled.
  useEffect(() => {
    if (!translation) {
      request.current?.abort();
      request.current = null;
      setBusy(false);
    }
  }, [translation]);

  const sourceEntries = Object.entries(fields).filter(([, value]) => value.trim());
  const hasExisting = sourceEntries.some(([key]) => existingValues[key]?.trim());
  const selectedFields = Object.fromEntries(sourceEntries.filter(([key]) => replaceExisting || !existingValues[key]?.trim()));
  const noSource = sourceEntries.length === 0;
  const noMissing = Object.keys(selectedFields).length === 0;
  const unavailable = !translation || disabled || noSource || noMissing || sourceLanguage === targetLanguage;

  async function translate() {
    // Ref closes the double-click window before React commits the disabled state.
    if (request.current || unavailable) return;
    const controller = new AbortController();
    request.current = controller;
    setBusy(true);
    setError(null);
    try {
      const translations = await translateWithAi({ objectId, sourceLanguage, targetLanguage, fields: selectedFields }, controller.signal);
      if (!controller.signal.aborted) onResult.current(translations);
    } catch (cause) {
      if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : 'La traduction a échoué. Réessayez.');
    } finally {
      if (!controller.signal.aborted) {
        request.current = null;
        setBusy(false);
      }
    }
  }

  if (!translation) return null;

  return (
    <div className="rounded-xl border border-line bg-surface2 p-3 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-ink-2">{sourceLabel} → {targetLabel}</p>
        <button
          type="button"
          className="inline-flex min-h-12 items-center justify-center gap-2 rounded-lg border border-line bg-surface px-3 py-2 font-semibold text-ink transition-colors hover:bg-surface2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
          disabled={Boolean(unavailable || busy)}
          aria-busy={busy}
          onClick={() => { void translate(); }}
        >
          {busy ? <Loader2 size={16} aria-hidden className="animate-spin motion-reduce:animate-none" /> : <Sparkles size={16} aria-hidden />}
          {busy ? 'Traduction en cours…' : 'Traduire avec l’IA'}
        </button>
      </div>
      {hasExisting && (
        <label className="mt-2 flex min-h-12 items-center gap-2 text-ink-2">
          <input type="checkbox" checked={replaceExisting} disabled={busy || disabled} onChange={(event) => setReplaceExisting(event.target.checked)} />
          Remplacer les traductions existantes
        </label>
      )}
      <p className="mt-2 text-xs text-ink-3" role="status">
        {busy ? 'L’IA prépare votre traduction…'
          : noSource ? `Saisissez d’abord un texte en ${sourceLabel}.`
          : noMissing ? 'Les traductions sont déjà renseignées.'
          : 'Relisez la traduction avant de valider. Le texte reste modifiable.'}
      </p>
      {error && <p className="mt-2 text-sm text-red-700" role="alert">{error}</p>}
    </div>
  );
}
