/** Page footer: keyboard-shortcut hints + the publish action. */
export function EditorFooter({ onPublish }: { onPublish: () => void }) {
  return (
    <div className="edit-footer">
      <div className="edit-footer__hint">
        <span>Raccourcis :</span>
        <code>⌘+S</code> enregistrer <code>⌘+⇧+P</code> publier <code>Esc</code> quitter
      </div>
      <button type="button" className="btn primary" onClick={onPublish}>
        Publier les modifs
      </button>
    </div>
  );
}
