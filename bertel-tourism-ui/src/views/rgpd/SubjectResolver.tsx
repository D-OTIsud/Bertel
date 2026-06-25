'use client';

// P3-i1 — résolution du sujet à effacer. Pour les acteurs : recherche par nom/e-mail
// (api.search_actors, §95b) → sélection → l'UUID exact est rempli (jamais saisi à la main) +
// carte « Sujet sélectionné ». Pour les autres types (ou en repli expert) : saisie d'UUID avec
// validation de format v4 — un UUID invalide bloque la soumission (onResolved('')).
// Hint UNIQUE associé via aria-describedby (fin du doublon placeholder+span).
// NB l'aperçu d'impact (api.rgpd_preview_subject) est volontairement différé (plan §p3-i1,
// non bloquant) ; on ne l'affiche pas tant que le RPC lecture-seule n'existe pas.

import { useEffect, useRef, useState } from 'react';
import { Mail, Search, UserCheck } from 'lucide-react';
import { searchActors, type ActorSearchResult } from '@/services/object-workspace';
import type { ErasureSubjectKind } from '@/services/rgpd';

const UUID_V4_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const HINT_ID = 'rgpd-subject-hint';

function initials(actor: ActorSearchResult): string {
  const fromNames = `${actor.firstName.trim()[0] ?? ''}${actor.lastName.trim()[0] ?? ''}`.toUpperCase();
  return fromNames || actor.displayName.trim().slice(0, 2).toUpperCase() || '?';
}

export function SubjectResolver({
  kind,
  onResolved,
  hint,
  example,
  disabled = false,
}: {
  kind: ErasureSubjectKind;
  /** Appelé avec l'UUID résolu (valide) ou '' (vide / invalide → soumission bloquée). */
  onResolved: (id: string) => void;
  hint: string;
  example?: string;
  disabled?: boolean;
}) {
  const canSearch = kind === 'actor';
  const onResolvedRef = useRef(onResolved);
  onResolvedRef.current = onResolved;

  const [mode, setMode] = useState<'search' | 'paste'>(canSearch ? 'search' : 'paste');
  const [resolved, setResolved] = useState<ActorSearchResult | null>(null);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<ActorSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [pasteValue, setPasteValue] = useState('');

  // Changer de type de sujet réinitialise tout (le mode dépend de la recherche disponible).
  useEffect(() => {
    setMode(kind === 'actor' ? 'search' : 'paste');
    setResolved(null);
    setQuery('');
    setResults([]);
    setPasteValue('');
    onResolvedRef.current('');
  }, [kind]);

  // Recherche debouncée (300ms, min 2 caractères) — même mécanique que ActorPicker.
  useEffect(() => {
    if (mode !== 'search' || query.trim().length < 2) {
      setResults([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    let cancelled = false;
    const handle = setTimeout(() => {
      void searchActors(query).then((rows) => {
        if (cancelled) return;
        setResults(rows);
        setLoading(false);
      });
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [query, mode]);

  function pick(actor: ActorSearchResult) {
    setResolved(actor);
    setResults([]);
    setQuery('');
    onResolvedRef.current(actor.id);
  }

  function clearResolved() {
    setResolved(null);
    onResolvedRef.current('');
  }

  function handlePaste(value: string) {
    setPasteValue(value);
    onResolvedRef.current(UUID_V4_RE.test(value.trim()) ? value.trim() : '');
  }

  const pasteInvalid = pasteValue.trim().length > 0 && !UUID_V4_RE.test(pasteValue.trim());

  // — Sujet résolu (carte) —
  if (resolved) {
    return (
      <div className="space-y-1">
        <span className="text-sm font-medium text-ink-2">Sujet sélectionné</span>
        <div
          className="flex items-start gap-3 rounded-shellLg border border-teal bg-teal-tint p-3"
          aria-live="polite"
        >
          <span
            className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-teal text-xs font-semibold text-white"
            aria-hidden
          >
            {initials(resolved)}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-semibold text-ink">
              Sujet sélectionné : {resolved.displayName}
            </span>
            {resolved.email && <span className="block truncate text-xs text-ink-2">{resolved.email}</span>}
            <span className="mt-0.5 block break-all font-mono text-xs text-ink-3">{resolved.id}</span>
          </span>
          <button
            type="button"
            onClick={clearResolved}
            disabled={disabled}
            className="shrink-0 rounded-shellMd border border-line bg-white px-2.5 py-1 text-xs font-medium text-ink-2 hover:border-lineStrong"
          >
            Changer
          </button>
        </div>
      </div>
    );
  }

  // — Recherche (acteurs) —
  if (mode === 'search') {
    const tooShort = query.trim().length < 2;
    return (
      <div className="space-y-1">
        <span className="text-sm font-medium text-ink-2" id="rgpd-subject-label">
          Sujet à effacer
        </span>
        <div className="flex items-center gap-2 rounded-shellLg border border-line bg-surface px-3">
          <Search size={15} className="shrink-0 text-ink-3" aria-hidden />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            disabled={disabled}
            aria-labelledby="rgpd-subject-label"
            aria-describedby={HINT_ID}
            placeholder="Rechercher par nom ou e-mail…"
            className="w-full bg-transparent py-2 text-sm text-ink outline-none"
          />
        </div>
        {!tooShort && (
          <div className="overflow-hidden rounded-shellLg border border-line bg-surface">
            {loading && <p className="px-3 py-2 text-sm text-ink-2">Recherche…</p>}
            {!loading && results.length === 0 && (
              <p className="px-3 py-2 text-sm text-ink-2">
                Aucun sujet trouvé pour « {query.trim()} ». Vérifiez l&apos;orthographe ou collez l&apos;UUID.
              </p>
            )}
            {!loading &&
              results.map((actor) => (
                <button
                  key={actor.id}
                  type="button"
                  onClick={() => pick(actor)}
                  disabled={disabled}
                  className="flex w-full items-center gap-3 border-b border-line px-3 py-2 text-left last:border-b-0 hover:bg-teal-tint"
                >
                  <span
                    className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-teal-soft text-xs font-semibold text-teal"
                    aria-hidden
                  >
                    {initials(actor)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-ink">{actor.displayName}</span>
                    {actor.email ? (
                      <span className="flex items-center gap-1 truncate text-xs text-ink-2">
                        <Mail size={11} aria-hidden /> {actor.email}
                      </span>
                    ) : (
                      <span className="text-xs text-ink-3">Aucun e-mail renseigné</span>
                    )}
                  </span>
                  <UserCheck size={15} className="shrink-0 text-teal" aria-hidden />
                </button>
              ))}
          </div>
        )}
        <p id={HINT_ID} className="text-xs text-ink-2">
          {hint}
        </p>
        <button
          type="button"
          onClick={() => setMode('paste')}
          disabled={disabled}
          className="text-xs font-medium text-teal underline-offset-2 hover:underline"
        >
          Je connais déjà l&apos;identifiant (coller un UUID)
        </button>
      </div>
    );
  }

  // — Saisie expert (UUID) —
  return (
    <div className="space-y-1">
      <label htmlFor="rgpd-subject-uuid" className="block text-sm font-medium text-ink-2">
        Identifiant du sujet (UUID)
      </label>
      <input
        id="rgpd-subject-uuid"
        value={pasteValue}
        onChange={(event) => handlePaste(event.target.value)}
        disabled={disabled}
        aria-describedby={HINT_ID}
        aria-invalid={pasteInvalid}
        placeholder={example ?? '00000000-0000-4000-8000-000000000000'}
        className={`w-full rounded-shellLg border bg-surface px-3 py-2 font-mono text-sm text-ink ${
          pasteInvalid ? 'border-danger-strong' : 'border-line'
        }`}
      />
      <p id={HINT_ID} className={pasteInvalid ? 'text-xs text-danger-ink' : 'text-xs text-ink-2'}>
        {pasteInvalid ? "Format d'UUID invalide — la soumission est bloquée." : hint}
      </p>
      {canSearch && (
        <button
          type="button"
          onClick={() => {
            setMode('search');
            setPasteValue('');
            onResolvedRef.current('');
          }}
          disabled={disabled}
          className="text-xs font-medium text-teal underline-offset-2 hover:underline"
        >
          Revenir à la recherche par nom
        </button>
      )}
    </div>
  );
}
