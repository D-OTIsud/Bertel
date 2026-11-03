import { useEffect, useRef, useState } from 'react';
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
import { strictErrorMessage } from '../../../lib/strict-error-message';

interface MenuPdfCartesProps {
  objectId: string;
  canEdit: boolean;
  /** Bump to force a reload (e.g. after the extraction modal uploads a new carte). */
  reloadToken?: number;
  /** Hide the inline file picker — adding now goes through the « Ajouter une carte » modal. */
  hideUploader?: boolean;
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
export function MenuPdfCartes({ objectId, canEdit, reloadToken = 0, hideUploader = false }: MenuPdfCartesProps) {
  const [cartes, setCartes] = useState<CarteDocument[]>([]);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const current = useRef<CarteDocument[]>([]);
  const generation = useRef(0);
  const writes = useRef<Promise<void>>(Promise.resolve());
  function show(next: CarteDocument[]) { current.current = next; setCartes(next); }

  async function reload() {
    const epoch = generation.current;
    try {
      const rows = await listObjectCartes(objectId);
      if (epoch !== generation.current) return;
      show(rows);
      setError(null);
    } catch (err) {
      if (epoch !== generation.current) return;
      setError(strictErrorMessage(err, 'Chargement des cartes impossible.'));
    } finally {
      if (epoch === generation.current) setLoading(false);
    }
  }

  useEffect(() => {
    generation.current += 1;
    let alive = true;
    const client = getSupabaseClient();
    if (client) {
      client.auth.getSession().then(({ data }) => {
        if (alive) setAccessToken(data.session?.access_token ?? null);
      });
    }
    void reload();
    return () => { alive = false; generation.current += 1; };
    // objectId + reloadToken drive reloads; reload is stable enough for this immediate-write surface.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [objectId, reloadToken]);

  function patchLocal(documentId: string, patch: Partial<CarteDocument>) {
    show(current.current.map((c) => (c.documentId === documentId ? { ...c, ...patch } : c)));
  }

  function enqueue(action: () => Promise<void>) {
    if (!canEdit) return;
    const epoch = generation.current;
    writes.current = writes.current.then(async () => {
      if (epoch !== generation.current) return;
      try { await action(); } catch (err) {
        if (epoch === generation.current) setError(strictErrorMessage(err, 'Enregistrement impossible. Votre saisie est conservée.'));
      }
    });
  }

  function commit(documentId: string, patch: { title?: string; validFrom?: string; validTo?: string }) {
    const epoch = generation.current;
    enqueue(async () => {
      const before = current.current.find(row => row.documentId === documentId);
      const rows = await updateObjectCarte(objectId, documentId, patch, before);
      if (epoch !== generation.current || !rows) return;
      const server = rows.find(row => row.documentId === documentId);
      if (!server) throw new Error('La carte a été retirée entre-temps. Rechargez les cartes ; votre saisie est conservée.');
      const raw = before?.expected ?? {};
      const doc = raw.document as Record<string, unknown> | undefined;
      const old = { title: String(raw.title ?? doc?.title ?? ''), validFrom: String(raw.valid_from ?? ''), validTo: String(raw.valid_to ?? '') };
      let conflict = false;
      show(current.current.map(row => {
        if (row.documentId !== documentId) return row;
        const next = { ...row, expected: server.expected, readId: server.readId };
        for (const key of ['title', 'validFrom', 'validTo'] as const) {
          if (row[key] === patch[key] || row[key] === old[key]) next[key] = server[key];
          else if (server[key] !== old[key] && server[key] !== row[key] && server[key] !== patch[key]) conflict = true;
        }
        return conflict ? { ...next, expected: row.expected, readId: row.readId } : next;
      }));
      if (conflict) throw new Error('Une autre modification concerne votre saisie. Rechargez les cartes pour la vérifier ; votre texte est conservé.');
      setError(null);
    });
  }

  async function onUploaded(documentId: string) {
    const epoch = generation.current;
    enqueue(async () => {
      const rows = await linkObjectCarte(objectId, documentId);
      if (epoch !== generation.current) return;
      show([...current.current, ...rows.filter(row => !current.current.some(local => local.documentId === row.documentId))]);
      setError(null);
    });
  }

  async function remove(documentId: string) {
    const epoch = generation.current;
    enqueue(async () => {
      await unlinkObjectCarte(objectId, documentId, current.current.find(row => row.documentId === documentId));
      if (epoch !== generation.current) return;
      show(current.current.filter(row => row.documentId !== documentId));
      setError(null);
    });
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

      {!hideUploader && canEdit && accessToken && (
        <DocumentUploadField objectId={objectId} accessToken={accessToken} onUploaded={(doc) => onUploaded(doc.documentId)} />
      )}
    </div>
  );
}
