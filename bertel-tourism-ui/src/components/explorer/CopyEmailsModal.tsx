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
  SELECTION_EMAIL_REASON_MAX,
  SELECTION_EMAIL_REASON_MIN,
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
  const [reason, setReason] = useState('');
  /** La finalité SOUMISE — `null` tant qu'aucun chargement n'a été demandé. */
  const [submittedReason, setSubmittedReason] = useState<string | null>(null);
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

  const canSubmit = reason.trim().length >= SELECTION_EMAIL_REASON_MIN;

  // Finalité PAR EXTRACTION : toute ouverture — et tout changement de sélection
  // — repart d'un champ vide et d'un chargement non déclenché.
  //
  // La remise à zéro se fait PENDANT LE RENDU, pas dans un effet : deux effets
  // du même commit lisent tous deux l'état d'AVANT, donc l'effet de chargement
  // relancerait une extraction — et une ligne de journal (§208) — avec la
  // finalité de l'ouverture précédente avant que la remise à zéro n'atterrisse.
  // C'est l'ajustement d'état sur changement de prop documenté par React : le
  // re-rendu est immédiat, et l'effet ne voit que la valeur corrigée.
  //
  // La remise à zéro n'a lieu qu'à l'(RÉ)OUVERTURE, jamais à la fermeture :
  // `Modal` reste MONTÉ pendant son animation de sortie (~220 ms), donc vider
  // l'état en fermant faisait réapparaître l'étape 1 — le champ Finalité vide —
  // par-dessus les adresses qu'on venait de copier, le temps du fondu.
  const sessionKey = open ? key : null;
  const [prevSessionKey, setPrevSessionKey] = useState<string | null>(sessionKey);
  if (sessionKey !== prevSessionKey) {
    setPrevSessionKey(sessionKey);
    if (open) {
      setReason('');
      setSubmittedReason(null);
      setResult(null);
      setErrorMessage(null);
      setRetryable(false);
      setCopyState('idle');
    }
  }

  useEffect(() => {
    // Rien ne part tant que la finalité n'a pas été soumise : le RPC ÉCRIT
    // (journal §208), un chargement automatique à l'ouverture journaliserait un
    // export que personne n'a demandé.
    if (!open || submittedReason === null) return;
    const token = ++requestToken.current;
    setResult(null);
    setErrorMessage(null);
    setRetryable(false);
    setCopyState('idle');

    fetchSelectionEmails({ ...input, reason: submittedReason })
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
  }, [open, input, submittedReason, attempt]);

  const emails = useMemo(() => dedupeEmails(result?.rows ?? []), [result]);
  const text = useMemo(() => formatEmailList(emails, separator), [emails, separator]);

  // Le clic sur « Afficher les adresses » DÉMONTE l'étape 1, donc le seul
  // élément focusable du corps disparaît et le focus retombe sur <body> : au
  // clavier comme au lecteur d'écran, on se retrouve nulle part. On le porte sur
  // la zone d'adresses, qui est à la fois le résultat attendu et la cible d'un
  // Ctrl+C manuel si le presse-papiers est refusé.
  const addressesRef = useRef<HTMLTextAreaElement | null>(null);
  useEffect(() => {
    if (result) addressesRef.current?.focus();
  }, [result]);

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

  const footer = submittedReason === null ? (
    <>
      <button type="button" className="ghost-button" onClick={() => onOpenChange(false)}>Annuler</button>
      <button
        type="button"
        onClick={() => setSubmittedReason(reason.trim())}
        disabled={!canSubmit}
        className="primary-button"
      >
        Afficher les adresses
      </button>
    </>
  ) : result ? (
    <>
      <button type="button" className="ghost-button" onClick={() => onOpenChange(false)}>Fermer</button>
      <button
        type="button"
        onClick={() => void handleCopy()}
        disabled={emails.length === 0 || copyState === 'copying'}
        className="primary-button"
      >
        {copyState === 'copied' ? (
          <><Check className="h-4 w-4" /> Copié</>
        ) : copyState === 'copying' ? (
          <><Copy className="h-4 w-4" /> Copie…</>
        ) : (
          <><Copy className="h-4 w-4" /> Copier</>
        )}
      </button>
    </>
  ) : (
    <>
      <button type="button" className="ghost-button" onClick={() => onOpenChange(false)}>Fermer</button>
      {retryable && errorMessage ? (
        <button type="button" onClick={() => setAttempt((n) => n + 1)} className="primary-button">
          Réessayer
        </button>
      ) : null}
    </>
  );

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title="Copier les e-mails"
      className="copy-emails-modal"
      footer={footer}
    >
      {submittedReason === null ? (
        // Étape 1 — la finalité. Le RPC ne rend AUCUNE adresse sans elle
        // (`PT400/REASON_REQUIRED`) : la demander avant de charger, plutôt
        // qu'échouer après, est la seule forme honnête.
        <div className="copy-emails-modal__content">
          <label
            className="field-block copy-emails-modal__field"
            htmlFor="copy-emails-reason"
          >
            Finalité de l'extraction (obligatoire — inscrite au journal)
            <textarea
              id="copy-emails-reason"
              rows={2}
              value={reason}
              maxLength={SELECTION_EMAIL_REASON_MAX}
              onChange={(e) => setReason(e.target.value)}
              className="textarea"
              placeholder="Campagne relance adhésions 2026"
            />
          </label>
          <p className="copy-emails-modal__privacy">
            Ces adresses sont des coordonnées de personnes. Dès qu&apos;une provient d&apos;un
            prestataire, l&apos;extraction est tracée&nbsp;: qui, quand, quelles fiches — jamais
            les adresses elles-mêmes.
          </p>
        </div>
      ) : errorMessage ? (
        <div className="copy-emails-modal__status copy-emails-modal__status--error" role="alert">
          <p>{errorMessage}</p>
        </div>
      ) : !result ? (
        <p className="copy-emails-modal__status" role="status">Chargement…</p>
      ) : (
        <div className="copy-emails-modal__content">
          {/* `role="status"` : les compteurs sont le resultat de l'action, pas une
              decoration. Sans region live, un lecteur d'ecran ne les annonce
              jamais — l'utilisateur ne sait pas combien d'adresses il copie. */}
          <p className="copy-emails-modal__summary" role="status">
            {result.excludedCount > 0
              ? `${result.eligibleCount} fiches éligibles sur ${result.requestedCount}`
              : `${result.eligibleCount} fiches éligibles`}
            {' · '}
            {emails.length} adresses
            {' · '}
            {result.missing.length} sans e-mail
          </p>

          <p className="copy-emails-modal__breakdown">
            {viaActor} fiche{viaActor > 1 ? 's' : ''} résolue{viaActor > 1 ? 's' : ''} via le
            prestataire, {viaObject} via la fiche
          </p>

          <p className="copy-emails-modal__notice">
            Collez ces adresses dans le champ Cci, pour ne pas les divulguer aux autres
            destinataires.
          </p>

          <div className="copy-emails-modal__separators" role="group" aria-label="Séparateur">
            {SEPARATOR_LABELS.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => setSeparator(option.value)}
                className={`chip copy-emails-modal__separator${separator === option.value ? ' chip--active' : ''}`}
              >
                {option.label}
              </button>
            ))}
          </div>

          <textarea
            ref={addressesRef}
            aria-label="Adresses à copier"
            readOnly
            value={text}
            rows={6}
            className="textarea copy-emails-modal__addresses"
          />

          {result.missing.length > 0 && (
            <details>
              <summary className="copy-emails-modal__missing-summary">
                {result.missing.length} fiche{result.missing.length > 1 ? 's' : ''} sans e-mail
              </summary>
              <ul className="copy-emails-modal__missing-list">
                {result.missing.map((item) => (
                  <li key={item.objectId}>
                    <Link
                      href={`/objects/${item.objectId}/edit`}
                      className="copy-emails-modal__missing-link"
                    >
                      {item.name}
                    </Link>
                  </li>
                ))}
              </ul>
            </details>
          )}

          {copyState === 'refused' && (
            <p className="copy-emails-modal__copy-error" role="alert">
              Copie refusée par le navigateur — sélectionnez le texte ci-dessus et faites Ctrl+C.
            </p>
          )}

        </div>
      )}
    </Modal>
  );
}
