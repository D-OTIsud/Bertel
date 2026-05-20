/** Page footer: preview shortcut hints (publish lives in the top bar only). */
export function EditorFooter({ onPreview }: { onPreview: () => void }) {
  return (
    <div className="edit-footer">
      <div className="edit-footer__hint">
        Les changements restent locaux tant que vous n&apos;avez pas cliqué sur <span>Publier</span> (en haut à droite).
      </div>
      <div className="edit-footer__actions">
        <button type="button" className="btn" disabled title="Bientôt disponible">
          Brouillon
        </button>
        <button type="button" className="btn" onClick={onPreview}>
          Aperçu fiche
        </button>
      </div>
    </div>
  );
}
