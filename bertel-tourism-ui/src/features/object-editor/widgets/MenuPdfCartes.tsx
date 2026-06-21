import { useEffect, useState } from 'react';
import { ExternalLink, FileText, Trash2 } from 'lucide-react';
import { Field, Input } from '../primitives';
import { getSupabaseClient } from '../../../lib/supabase';
import { DocumentUploadField } from './DocumentUploadField';
import {
  listObjectCartes,
  linkObjectCarte,
  unlinkObjectCarte,
  updateObjectCarte,
  type CarteDocument,
} from '../../../services/object-cartes';

interface MenuPdfCartesProps {
  objectId: string;
  canEdit: boolean;
}

const ROW = {
  display: 'grid', gridTemplateColumns: '1fr 130px 130px auto auto', gap: 8, alignItems: 'end',
  padding: '8px 0', borderTop: '1px solid var(--line)',
} as const;
const ICON_BTN = {
  display: 'inline-grid', placeItems: 'center', width: 32, height: 32,
  border: '1px solid transparent', borderRadius: 8, background: 'transparent',
  color: 'var(--ink-3)', cursor: 'pointer',
} as const;

/**
 * §06 P3 — restaurant « Cartes PDF » (object_document, role 'carte'). Self-contained immediate-write
 * surface (NOT the save bar): upload a PDF via DocumentUploadField (→ ref_document), link it to the
 * object, edit its label + validity window (de quand à quand) on the link, view or detach it. Replaces
 * the old fake dropzone. Validity/title persist on object_document (canonical-write); url from ref_document.
 */
export function MenuPdfCartes({ objectId, canEdit }: MenuPdfCartesProps) {
  const [cartes, setCartes] = useState<CarteDocument[]>([]);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  async function reload() {
    try {
      setCartes(await listObjectCartes(objectId));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Chargement des cartes impossible.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    let alive = true;
    const client = getSupabaseClient();
    if (client) {
      client.auth.getSession().then(({ data }) => {
        if (alive) setAccessToken(data.session?.access_token ?? null);
      });
    }
    void reload();
    return () => { alive = false; };
    // objectId is the only input; reload is stable enough for this immediate-write surface.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [objectId]);

  function patchLocal(documentId: string, patch: Partial<CarteDocument>) {
    setCartes((list) => list.map((c) => (c.documentId === documentId ? { ...c, ...patch } : c)));
  }

  async function commit(documentId: string, patch: { title?: string; validFrom?: string; validTo?: string }) {
    try {
      await updateObjectCarte(objectId, documentId, patch);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Enregistrement impossible.');
      void reload();
    }
  }

  async function onUploaded(documentId: string) {
    try {
      await linkObjectCarte(objectId, documentId, cartes.length + 1);
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Rattachement de la carte impossible.');
    }
  }

  async function remove(documentId: string) {
    try {
      await unlinkObjectCarte(objectId, documentId);
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Suppression impossible.');
    }
  }

  return (
    <div>
      {loading ? (
        <p className="muted" style={{ fontSize: 12 }}>Chargement des cartes…</p>
      ) : cartes.length === 0 ? (
        <p className="muted" style={{ fontSize: 12 }}>Aucune carte PDF déposée.</p>
      ) : (
        cartes.map((carte) => (
          <div key={carte.documentId} style={ROW}>
            <Field label="Titre">
              <Input
                value={carte.title}
                placeholder="Carte des plats"
                onChange={(title) => patchLocal(carte.documentId, { title })}
                onBlur={() => commit(carte.documentId, { title: carte.title })}
                readOnly={!canEdit}
              />
            </Field>
            <Field label="Valide du">
              <Input
                type="date"
                value={carte.validFrom}
                aria-label="Valide du"
                onChange={(validFrom) => patchLocal(carte.documentId, { validFrom })}
                onBlur={() => commit(carte.documentId, { validFrom: carte.validFrom })}
                readOnly={!canEdit}
              />
            </Field>
            <Field label="au">
              <Input
                type="date"
                value={carte.validTo}
                aria-label="Valide jusqu'au"
                onChange={(validTo) => patchLocal(carte.documentId, { validTo })}
                onBlur={() => commit(carte.documentId, { validTo: carte.validTo })}
                readOnly={!canEdit}
              />
            </Field>
            <a
              href={carte.url || undefined}
              target="_blank"
              rel="noopener noreferrer"
              className="pill-mini"
              style={{ display: 'inline-flex', alignItems: 'center', gap: 4, textDecoration: 'none' }}
              aria-label={`Voir le PDF ${carte.title}`}
            >
              <FileText size={13} aria-hidden /> PDF <ExternalLink size={11} aria-hidden />
            </a>
            {canEdit && (
              <button type="button" aria-label={`Supprimer la carte ${carte.title}`} style={ICON_BTN} onClick={() => remove(carte.documentId)}>
                <Trash2 size={15} aria-hidden />
              </button>
            )}
          </div>
        ))
      )}

      {error && <p role="alert" className="media-upload-field__error" style={{ fontSize: 12 }}>{error}</p>}

      {canEdit && accessToken && (
        <DocumentUploadField objectId={objectId} accessToken={accessToken} onUploaded={(doc) => onUploaded(doc.documentId)} />
      )}
    </div>
  );
}
