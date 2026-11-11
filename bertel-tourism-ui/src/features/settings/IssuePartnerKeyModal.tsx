'use client';

import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { Copy, ShieldAlert } from 'lucide-react';
import { toast } from 'sonner';
import { Modal } from '../../components/common/Modal';
import { issuePartnerKey, type IssuedPartnerKey } from '../../services/partner-keys';

interface IssuePartnerKeyModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onIssued: () => void;
}

export function IssuePartnerKeyModal({ open, onOpenChange, onIssued }: IssuePartnerKeyModalProps) {
  const formId = useId();
  const labelId = useId();
  const helpId = useId();
  const [label, setLabel] = useState('');
  const [issuing, setIssuing] = useState(false);
  const [issued, setIssued] = useState<IssuedPartnerKey | null>(null);
  const mountedRef = useRef(false);
  const openRef = useRef(open);
  const issuingRef = useRef(false);
  const requestSequenceRef = useRef(0);
  openRef.current = open;

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      requestSequenceRef.current += 1;
    };
  }, []);

  useEffect(() => {
    if (open) return;
    requestSequenceRef.current += 1;
    issuingRef.current = false;
    setIssued(null);
    setLabel('');
    setIssuing(false);
  }, [open]);

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen) {
      // Purge before the shared Modal's exit animation, including while a request is pending.
      openRef.current = false;
      requestSequenceRef.current += 1;
      issuingRef.current = false;
      setIssued(null);
      setLabel('');
      setIssuing(false);
    }
    onOpenChange(nextOpen);
  }

  async function handleIssue(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = label.trim();
    if (!trimmed || issuingRef.current || !openRef.current) return;
    const sequence = ++requestSequenceRef.current;
    issuingRef.current = true;
    setIssuing(true);
    try {
      const result = await issuePartnerKey(trimmed);
      if (!mountedRef.current) return;
      // A dismissed request may still create a key: refresh metadata, never reveal its secret.
      onIssued();
      if (!openRef.current || sequence !== requestSequenceRef.current) return;
      setIssued(result);
      setLabel('');
      toast.success('Clé émise. Copiez-la maintenant — elle ne sera plus affichée.');
    } catch (error) {
      if (mountedRef.current && openRef.current && sequence === requestSequenceRef.current) {
        toast.error((error as Error).message);
      }
    } finally {
      if (mountedRef.current && sequence === requestSequenceRef.current) {
        issuingRef.current = false;
        setIssuing(false);
      }
    }
  }

  async function copyKey() {
    if (!issued || !openRef.current) return;
    const sequence = requestSequenceRef.current;
    try {
      if (!navigator.clipboard?.writeText) throw new Error('Clipboard unavailable');
      await navigator.clipboard.writeText(issued.apiKey);
      if (mountedRef.current && openRef.current && sequence === requestSequenceRef.current) {
        toast.success('Clé copiée dans le presse-papier.');
      }
    } catch {
      if (mountedRef.current && openRef.current && sequence === requestSequenceRef.current) {
        toast.error('Copie impossible — sélectionnez la clé manuellement.');
      }
    }
  }

  const visibleIssued = open ? issued : null;

  return (
    <Modal
      open={open}
      title={visibleIssued ? `Clé pour « ${visibleIssued.label} »` : 'Émettre une clé partenaire'}
      onOpenChange={handleOpenChange}
      className="partner-keys-modal"
      footer={visibleIssued ? (
        <>
          <button type="button" className="ghost-button" onClick={() => void copyKey()}>
            <Copy size={14} aria-hidden /> Copier
          </button>
          <button type="button" className="primary-button" onClick={() => handleOpenChange(false)}>
            J’ai copié la clé
          </button>
        </>
      ) : (
        <>
          <button type="button" className="ghost-button" onClick={() => handleOpenChange(false)}>Annuler</button>
          <button type="submit" form={formId} className="primary-button" disabled={!label.trim() || issuing} aria-busy={issuing}>
            {issuing ? 'Émission…' : 'Émettre la clé'}
          </button>
        </>
      )}
    >
      {visibleIssued ? (
        <div>
          <div className="partner-keys-modal__warning" role="status">
            <ShieldAlert size={18} aria-hidden />
            <p><strong>Copiez-la maintenant</strong> — elle ne sera plus jamais affichée. Transmettez-la par un canal sûr.</p>
          </div>
          <code className="partner-keys-modal__secret">{visibleIssued.apiKey}</code>
        </div>
      ) : (
        <form id={formId} className="partner-keys-modal__form" onSubmit={(event) => void handleIssue(event)}>
          <div className="settings-admin__field">
            <label htmlFor={labelId}>Nom du partenaire</label>
            <input
              id={labelId}
              autoFocus
              value={label}
              onChange={(event) => setLabel(event.target.value)}
              placeholder="ex. Portail régional"
              maxLength={120}
              disabled={issuing}
              aria-describedby={helpId}
            />
            <small id={helpId}>La clé complète ne sera affichée qu’une fois, juste après l’émission.</small>
          </div>
        </form>
      )}
    </Modal>
  );
}
