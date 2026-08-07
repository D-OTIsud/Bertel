'use client';

// Modale « Copier les e-mails » (§211) — partagée par la SelectionBar de l'Exploreur
// et la page d'une liste.
//
// Elle existe parce qu'une copie silencieuse mentirait trois fois : elle tairait
// le périmètre écarté, le dédoublonnage (821 fiches → 717 adresses sur le corpus
// réel) et les fiches muettes. Les quatre chiffres sont donc annoncés, le texte
// exact est montré avant d'être copié, et les fiches sans adresse sont listées
// en lien — l'outil devient une boucle de qualité de données.
import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { Copy, Check } from 'lucide-react';
import { Modal } from '../common/Modal';
import {
  dedupeEmails,
  fetchSelectionEmails,
  formatEmailList,
  SELECTION_EMAIL_ERROR_MESSAGES,
  type EmailSeparator,
  type SelectionEmailsResult,
} from '@/services/selection-emails';

const SEPARATOR_LABELS: Array<{ value: EmailSeparator; label: string }> = [
  { value: 'comma', label: 'Virgule' },
  { value: 'semicolon', label: 'Point-virgule' },
  { value: 'newline', label: 'Une par ligne' },
];

type CopyState = 'idle' | 'copying' | 'copied' | 'refused';

interface Props {
  objectIds?: string[];
  listId?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CopyEmailsModal({ objectIds, listId, open, onOpenChange }: Props) {
  const [result, setResult] = useState<SelectionEmailsResult | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  /** Une erreur métier (refus, liste absente, trop large) ne se réessaie pas :
   *  seul l'aléa réseau mérite un bouton. */
  const [retryable, setRetryable] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [separator, setSeparator] = useState<EmailSeparator>('comma');
  const [copyState, setCopyState] = useState<CopyState>('idle');
  // Jeton de requête : une fermeture/réouverture rapide ne doit pas laisser la
  // réponse du premier chargement écraser l'état du second.
  const requestToken = useRef(0);

  // `objectIds` est un tableau : son identité change à CHAQUE rendu du parent.
  // Le mettre en dépendance d'effet boucle à l'infini — on passe par une clé
  // scalaire qui résume la demande, et l'input est mémoïsé sur elle.
  const key = listId ?? (objectIds ?? []).join(',');
  const input = useMemo(
    () => (listId ? { listId } : { objectIds: objectIds ?? [] }),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `key` résume listId + objectIds
    [key],
  );

  useEffect(() => {
    if (!open) return;
    const token = ++requestToken.current;
    setResult(null);
    setErrorMessage(null);
    setRetryable(false);
    setCopyState('idle');

    fetchSelectionEmails(input)
      .then((res) => {
        if (requestToken.current !== token) return;
        setResult(res);
      })
      .catch((err: unknown) => {
        if (requestToken.current !== token) return;
        const code = (err as { code?: string } | null)?.code;
        const known = code ? SELECTION_EMAIL_ERROR_MESSAGES[code] : undefined;
        setErrorMessage(known ?? 'Chargement impossible.');
        setRetryable(!known);
      });
  }, [open, input, attempt]);

  const emails = useMemo(() => dedupeEmails(result?.rows ?? []), [result]);
  const text = useMemo(() => formatEmailList(emails, separator), [emails, separator]);

  const viaActor = (result?.rows ?? []).filter((row) => row.source === 'actor').length;
  const viaObject = (result?.rows ?? []).length - viaActor;

  async function handleCopy() {
    if (copyState === 'copying' || emails.length === 0) return;
    setCopyState('copying');
    try {
      await navigator.clipboard.writeText(text);
      setCopyState('copied');
      window.setTimeout(() => setCopyState('idle'), 2000);
    } catch {
      // Jamais de « Copié » sur un presse-papiers vide : on le dit, et le
      // textarea reste sélectionnable pour un Ctrl+C manuel.
      setCopyState('refused');
    }
  }

  return (
    <Modal open={open} onOpenChange={onOpenChange} title="Copier les e-mails">
      {errorMessage ? (
        <div className="flex flex-col items-start gap-2">
          <p className="text-[13px] text-ink/70">{errorMessage}</p>
          {retryable && (
            <button
              type="button"
              onClick={() => setAttempt((n) => n + 1)}
              className="rounded-lg border px-3 py-1.5 text-[12px] font-semibold text-ink/80 hover:bg-ink/5"
            >
              Réessayer
            </button>
          )}
        </div>
      ) : !result ? (
        <p className="text-[13px] text-ink/60">Chargement…</p>
      ) : (
        <div className="flex flex-col gap-3">
          <p className="text-[13px] font-semibold text-ink">
            {result.excludedCount > 0
              ? `${result.eligibleCount} fiches éligibles sur ${result.requestedCount}`
              : `${result.eligibleCount} fiches éligibles`}
            {' · '}
            {emails.length} adresses
            {' · '}
            {result.missing.length} sans e-mail
          </p>

          <p className="text-[12px] text-ink/60">
            {viaActor} fiche{viaActor > 1 ? 's' : ''} résolue{viaActor > 1 ? 's' : ''} via le
            prestataire, {viaObject} via la fiche
          </p>

          <p className="rounded-lg bg-orange/10 px-3 py-2 text-[12px] text-ink/80">
            Collez ces adresses dans le champ Cci, pour ne pas les divulguer aux autres
            destinataires.
          </p>

          <div className="flex gap-1" role="group" aria-label="Séparateur">
            {SEPARATOR_LABELS.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => setSeparator(option.value)}
                className={
                  separator === option.value
                    ? 'rounded-lg bg-ink px-2.5 py-1.5 text-[12px] font-semibold text-white'
                    : 'rounded-lg border px-2.5 py-1.5 text-[12px] font-semibold text-ink/70'
                }
              >
                {option.label}
              </button>
            ))}
          </div>

          <textarea
            aria-label="Adresses à copier"
            readOnly
            value={text}
            rows={6}
            className="w-full rounded-lg border p-2 font-mono text-[12px]"
          />

          {result.missing.length > 0 && (
            <details>
              <summary className="cursor-pointer text-[12px] font-semibold text-ink/70">
                {result.missing.length} fiche{result.missing.length > 1 ? 's' : ''} sans e-mail
              </summary>
              <ul className="mt-2 flex flex-col gap-1">
                {result.missing.map((item) => (
                  <li key={item.objectId}>
                    <Link
                      href={`/objects/${item.objectId}/edit`}
                      className="text-[12px] text-orange hover:underline"
                    >
                      {item.name}
                    </Link>
                  </li>
                ))}
              </ul>
            </details>
          )}

          {copyState === 'refused' && (
            <p className="text-[12px] text-red-600">
              Copie refusée par le navigateur — sélectionnez le texte ci-dessus et faites Ctrl+C.
            </p>
          )}

          {/* L'état `copying` est VISIBLE et désactive le bouton : sans cela un
              double-clic relance une écriture presse-papiers concurrente, et
              l'utilisateur n'a aucun retour pendant l'attente. */}
          <button
            type="button"
            onClick={() => void handleCopy()}
            disabled={emails.length === 0 || copyState === 'copying'}
            className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-orange px-3 py-2 text-[13px] font-semibold text-white disabled:opacity-50"
          >
            {copyState === 'copied' ? (
              <>
                <Check className="h-4 w-4" /> Copié
              </>
            ) : copyState === 'copying' ? (
              <>
                <Copy className="h-4 w-4" /> Copie…
              </>
            ) : (
              <>
                <Copy className="h-4 w-4" /> Copier
              </>
            )}
          </button>
        </div>
      )}
    </Modal>
  );
}
