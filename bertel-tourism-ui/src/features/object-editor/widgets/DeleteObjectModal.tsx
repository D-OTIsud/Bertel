import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../../../components/ui/dialog';
import { Field, Input } from '../primitives';
import { requestObjectDeletion } from '../../../services/object-delete';

/** Pure : le bouton destructeur n'est actif que si le texte saisi == nom de la fiche (trim, non vide). */
export function deleteConfirmEnabled(typed: string, name: string): boolean {
  const t = typed.trim();
  return t.length > 0 && t === name.trim();
}

interface DeleteObjectModalProps {
  open: boolean;
  objectId: string;
  objectName: string;
  accessToken: string | null;
  onClose: () => void;
  onDeleted: () => void;
}

export function DeleteObjectModal({ open, objectId, objectName, accessToken, onClose, onDeleted }: DeleteObjectModalProps) {
  const [typed, setTyped] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const canConfirm = deleteConfirmEnabled(typed, objectName) && !!accessToken && !pending;

  function reset() { setTyped(''); setError(null); setPending(false); }
  function handleClose() { reset(); onClose(); }

  async function handleConfirm() {
    if (!accessToken) { setError('Session expirée — reconnectez-vous.'); return; }
    setPending(true);
    setError(null);
    try {
      await requestObjectDeletion({ objectId, confirmName: typed.trim(), accessToken });
      reset();
      onDeleted();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Suppression impossible.');
      setPending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next: boolean) => { if (!next) handleClose(); }}>
      <DialogContent className="object-editor">
        <DialogHeader>
          <DialogTitle>Supprimer définitivement la fiche</DialogTitle>
        </DialogHeader>
        <div className="ed-modal__body">
          <p className="delete-modal__warning">
            Cette action est <strong>irréversible</strong>. La fiche «&nbsp;{objectName}&nbsp;» et toutes ses données
            associées seront définitivement supprimées : photos et vidéos, descriptions, relations entrantes et
            sortantes, tarifs, périodes d&apos;ouverture, documents… Aucune restauration n&apos;est possible.
          </p>
          <Field label="Pour confirmer, saisissez le nom exact de la fiche" required>
            <Input
              value={typed}
              placeholder={objectName}
              aria-label="Nom de confirmation"
              onChange={(value) => setTyped(value)}
            />
          </Field>
          {error && <p className="delete-modal__error" role="alert">{error}</p>}
        </div>
        <DialogFooter>
          <button type="button" className="btn" onClick={handleClose}>Annuler</button>
          <button type="button" className="btn danger" disabled={!canConfirm} onClick={() => void handleConfirm()}>
            {pending ? 'Suppression…' : 'Supprimer définitivement'}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
