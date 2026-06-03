/** Page footer: draft-save + preview shortcuts (publish lives in the top bar only). */
export function EditorFooter({
  onPreview,
  onSaveDraft,
  savingDraft = false,
}: {
  onPreview: () => void;
  onSaveDraft?: () => void;
  savingDraft?: boolean;
}) {
  return (
    <div className="edit-footer">
      <div className="edit-footer__hint">
        Enregistrez un brouillon à tout moment&nbsp;; la <span>Publication</span> (en haut à droite) met la fiche en ligne.
      </div>
      <div className="edit-footer__actions">
        <button type="button" className="btn" disabled={!onSaveDraft || savingDraft} onClick={onSaveDraft}>
          {savingDraft ? 'Enregistrement…' : 'Brouillon'}
        </button>
        <button type="button" className="btn" onClick={onPreview}>
          Aperçu fiche
        </button>
      </div>
    </div>
  );
}
