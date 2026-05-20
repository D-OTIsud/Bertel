/** Page footer: keyboard-shortcut hints + draft / preview / publish actions. */
export function EditorFooter({
  onPreview,
  onPublish,
}: {
  onPreview: () => void;
  onPublish: () => void;
}) {
  return (
    <div className="edit-footer">
      <div className="edit-footer__hint">
        <span>Raccourcis :</span>
        <code>⌘+S</code> enregistrer <code>⌘+⇧+P</code> publier <code>Esc</code> quitter
      </div>
      <div className="edit-footer__actions">
        <button type="button" className="btn" disabled title="Bientôt disponible">
          Brouillon
        </button>
        <button type="button" className="btn" onClick={onPreview}>
          Aperçu
        </button>
        <button type="button" className="btn primary" onClick={onPublish}>
          Publier les modifs
        </button>
      </div>
    </div>
  );
}
