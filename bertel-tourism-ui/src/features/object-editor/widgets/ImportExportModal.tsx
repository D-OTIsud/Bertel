import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../../../components/ui/dialog';
import { ConfirmDialog } from '../primitives';

interface ImportExportModalProps {
  open: boolean;
  onClose: () => void;
  onExportJson: () => void;
  onExportCsv: () => void;
  onExportPdf: () => void;
  onImportFile: (file: File) => void;
  /** Last import error to surface (null when none). */
  importError: string | null;
}

/**
 * Import / export tool. Export = JSON / CSV / PDF of the current fiche (effects owned by
 * the parent). Import = pick a previously exported JSON, confirm overwrite, then apply
 * onto the open draft (no object creation). Confirmation lives here so the parent owns
 * a single onImportFile handler.
 */
export function ImportExportModal({
  open,
  onClose,
  onExportJson,
  onExportCsv,
  onExportPdf,
  onImportFile,
  importError,
}: ImportExportModalProps) {
  const [pendingFile, setPendingFile] = useState<File | null>(null);

  function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null;
    event.target.value = ''; // reset so re-picking the same file fires change again
    if (file) {
      setPendingFile(file);
    }
  }

  function confirmImport() {
    if (pendingFile) {
      onImportFile(pendingFile);
    }
    setPendingFile(null);
  }

  return (
    <>
      <Dialog open={open} onOpenChange={(next: boolean) => { if (!next) onClose(); }}>
        <DialogContent className="object-editor">
          <DialogHeader>
            <DialogTitle>Import / export de la fiche</DialogTitle>
          </DialogHeader>
          <div className="ed-modal__body io-modal">
            <section className="io-modal__group">
              <h4 className="io-modal__heading">Exporter</h4>
              <p className="io-modal__hint">Télécharge la fiche telle qu’enregistrée en base (vos modifications non sauvegardées ne sont pas incluses).</p>
              <div className="io-modal__actions">
                <button type="button" className="btn" onClick={onExportJson}>Exporter en JSON</button>
                <button type="button" className="btn" onClick={onExportCsv}>Exporter en CSV</button>
                <button type="button" className="btn" onClick={onExportPdf}>Exporter en PDF</button>
              </div>
            </section>
            <section className="io-modal__group">
              <h4 className="io-modal__heading">Importer</h4>
              <p className="io-modal__hint">
                Charge un fichier JSON précédemment exporté. Les valeurs remplaceront le brouillon
                courant ; vous pourrez revoir puis enregistrer.
              </p>
              <input
                type="file"
                accept="application/json,.json"
                aria-label="Importer un fichier JSON"
                onChange={handleFileChange}
              />
              {importError && <p role="alert" className="io-modal__error">{importError}</p>}
            </section>
          </div>
          <DialogFooter>
            <button type="button" className="btn" onClick={onClose}>Fermer</button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <ConfirmDialog
        open={pendingFile !== null}
        title="Importer et remplacer le brouillon"
        message="Les modules importés écraseront le brouillon courant de cette fiche. Aucune donnée enregistrée n’est modifiée tant que vous n’avez pas sauvegardé."
        confirmLabel="Remplacer"
        cancelLabel="Annuler"
        tone="danger"
        onCancel={() => setPendingFile(null)}
        onConfirm={confirmImport}
      />
    </>
  );
}
