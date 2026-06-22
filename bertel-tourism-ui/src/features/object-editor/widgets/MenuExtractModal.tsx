import { useMemo, useState } from 'react';
import { FileText, Image as ImageIcon, Loader2, Sparkles } from 'lucide-react';
import { EditorModal, Field, Input } from '../primitives';
import type { ObjectWorkspaceMenu, WorkspaceReferenceOption } from '../../../services/object-workspace-parser';
import { uploadDocument } from '../../../services/document-upload';
import { linkObjectCarte } from '../../../services/object-cartes';
import {
  extractMenuFromImages,
  applyDietarySuggestions,
  readFileAsBase64,
  type ExtractResult,
  type ExtractImage,
} from '../../../services/menu-extract';
import { rasterizePdfToImages } from '../../../lib/pdf-rasterize';

interface Props {
  open: boolean;
  objectId: string;
  accessToken: string;
  allowedSections: WorkspaceReferenceOption[];
  allowedDietary: WorkspaceReferenceOption[];
  onClose: () => void;
  /** Inject the reviewed draft menu into the editor's menus module (save-bar persists it). */
  onInject: (menu: ObjectWorkspaceMenu) => void;
  /** Notify the parent that a downloadable carte was added (refresh the cartes list). */
  onCarteUploaded?: () => void;
}

interface ModalFile {
  key: string;
  name: string;
  isPdf: boolean;
  status: 'uploading' | 'ready' | 'error';
  /** Analyzable images: one for an image file, one-per-page for a (client-rasterized) PDF. */
  images?: ExtractImage[];
  error?: string;
}

const ACCEPT = 'application/pdf,image/jpeg,image/png,image/webp';
const MAX_ANALYZE_IMAGES = 8;

function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : 'Erreur inattendue.';
}

/**
 * §06 « Ajouter une carte » — upload one or more carte files (kept as downloadable cartes,
 * decision D4) and optionally run the AI to build a structured draft menu. Images are analyzable;
 * a PDF is stored as a downloadable carte but, for analysis, the user adds images (client-side PDF
 * rasterization is a tracked follow-up). The extracted menu lands in the editor draft for review —
 * dietary tags are SUGGESTED (unchecked), allergens are never inferred. Spec §6.
 */
export function MenuExtractModal({
  open,
  objectId,
  accessToken,
  allowedSections,
  allowedDietary,
  onClose,
  onInject,
  onCarteUploaded,
}: Props) {
  const [files, setFiles] = useState<ModalFile[]>([]);
  const [confirmed, setConfirmed] = useState(false);
  const [title, setTitle] = useState('Carte');
  const [phase, setPhase] = useState<'collect' | 'analyzing' | 'preview'>('collect');
  const [result, setResult] = useState<ExtractResult | null>(null);
  const [accepted, setAccepted] = useState<string[][]>([]);
  const [error, setError] = useState<string | null>(null);

  const dietaryLabel = useMemo(() => {
    const map = new Map(allowedDietary.map((o) => [o.code, o.label]));
    return (code: string) => map.get(code) ?? code;
  }, [allowedDietary]);

  const analyzableImages = files
    .filter((f) => f.status === 'ready')
    .flatMap((f) => f.images ?? [])
    .slice(0, MAX_ANALYZE_IMAGES);
  const canAnalyze = phase === 'collect' && confirmed && analyzableImages.length > 0;

  async function addFiles(fileList: FileList) {
    setError(null);
    for (const file of Array.from(fileList)) {
      const key = `${file.name}-${file.size}-${files.length}-${Math.round(performance.now())}`;
      const isPdf = file.type === 'application/pdf';
      setFiles((prev) => [...prev, { key, name: file.name, isPdf, status: 'uploading' }]);
      try {
        const uploaded = await uploadDocument({ file, objectId, accessToken });
        await linkObjectCarte(objectId, uploaded.documentId, Math.floor(performance.now()));
        onCarteUploaded?.();
        // PDFs are rasterized to page images in the browser; an image becomes a single image.
        const images = isPdf ? await rasterizePdfToImages(file) : [await readFileAsBase64(file)];
        setFiles((prev) => prev.map((f) => (f.key === key ? { ...f, status: 'ready', images } : f)));
      } catch (err) {
        setFiles((prev) => prev.map((f) => (f.key === key ? { ...f, status: 'error', error: errMsg(err) } : f)));
      }
    }
  }

  async function analyze() {
    setPhase('analyzing');
    setError(null);
    try {
      const res = await extractMenuFromImages(
        {
          objectId,
          menuTitle: title.trim() || 'Carte',
          images: analyzableImages,
          allowedSections: allowedSections.map((o) => ({ id: o.id, code: o.code, label: o.label })),
          allowedDietary: allowedDietary.map((o) => ({ id: o.id, code: o.code, label: o.label })),
        },
        accessToken,
      );
      setResult(res);
      setAccepted(res.suggestedDietaryByDish.map(() => []));
      setPhase('preview');
    } catch (err) {
      setError(errMsg(err));
      setPhase('collect');
    }
  }

  function toggleSuggestion(dishIndex: number, code: string) {
    setAccepted((prev) =>
      prev.map((codes, i) =>
        i === dishIndex ? (codes.includes(code) ? codes.filter((c) => c !== code) : [...codes, code]) : codes,
      ),
    );
  }

  function inject() {
    if (!result) return;
    onInject(applyDietarySuggestions(result.menu, accepted));
    onClose();
  }

  return (
    <EditorModal
      open={open}
      title="Ajouter une carte"
      size="lg"
      saveLabel="Ajouter ce menu au brouillon"
      saveDisabled={phase !== 'preview'}
      onSave={inject}
      onClose={onClose}
    >
      {phase !== 'preview' && (
        <>
          <Field
            label="Fichiers (images de la carte ou PDF)"
            hint="Images (JPEG/PNG) ou PDF — tous analysés par l'IA. Chaque fichier est aussi conservé comme carte téléchargeable."
          >
            <input
              type="file"
              accept={ACCEPT}
              multiple
              aria-label="Ajouter des fichiers de carte"
              onChange={(e) => {
                if (e.target.files && e.target.files.length) void addFiles(e.target.files);
                e.target.value = '';
              }}
            />
          </Field>

          {files.length > 0 && (
            <ul style={{ listStyle: 'none', padding: 0, margin: '8px 0', display: 'flex', flexDirection: 'column', gap: 4 }}>
              {files.map((f) => (
                <li key={f.key} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
                  {f.isPdf ? <FileText size={14} aria-hidden /> : <ImageIcon size={14} aria-hidden />}
                  <span>{f.name}</span>
                  {f.status === 'uploading' && <span className="muted">· envoi…</span>}
                  {f.status === 'ready' && f.isPdf && <span className="muted">· carte · {f.images?.length ?? 0} page(s)</span>}
                  {f.status === 'ready' && !f.isPdf && <span className="muted">· prête</span>}
                  {f.status === 'error' && <span role="alert" style={{ color: 'var(--danger, #c00)' }}>· {f.error}</span>}
                </li>
              ))}
            </ul>
          )}

          <Field label="Titre du menu généré">
            <Input value={title} onChange={setTitle} placeholder="Carte de la semaine" />
          </Field>

          <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 13, margin: '6px 0' }}>
            <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} />
            <span>
              Il s'agit de la <strong>carte complète</strong> : toutes les pages/images sont importées avant l'analyse.
            </span>
          </label>

          {error && <p role="alert" style={{ color: 'var(--danger, #c00)', fontSize: 13 }}>{error}</p>}

          <button
            type="button"
            className="btn primary"
            disabled={!canAnalyze && phase !== 'analyzing'}
            aria-disabled={!canAnalyze}
            onClick={() => { if (canAnalyze) void analyze(); }}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginTop: 6 }}
          >
            {phase === 'analyzing' ? <Loader2 size={15} className="spin" aria-hidden /> : <Sparkles size={15} aria-hidden />}
            {phase === 'analyzing' ? 'Analyse en cours…' : 'Analyser et créer un menu'}
          </button>
        </>
      )}

      {phase === 'preview' && result && (
        <div>
          <p style={{ fontSize: 13, marginTop: 0 }}>
            Menu <strong>{result.menu.name}</strong> — {result.menu.items.length} plat(s). Vérifiez, cochez les régimes
            pertinents (suggérés par l'IA), puis ajoutez-le. <em>Les allergènes ne sont pas déduits : à saisir ensuite.</em>
          </p>
          {result.truncated && (
            <p className="muted" style={{ fontSize: 12 }}>Toutes les images n'ont pas pu être analysées (trop nombreuses).</p>
          )}
          <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
            {result.menu.items.map((item, index) => (
              <li key={index} style={{ borderTop: '1px solid var(--line)', paddingTop: 8 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                  <strong style={{ fontSize: 14 }}>{item.name}</strong>
                  <span className="muted" style={{ fontSize: 13 }}>{item.price}</span>
                </div>
                {item.sectionLabel && <div className="muted" style={{ fontSize: 12 }}>{item.sectionLabel}</div>}
                {item.description && <div style={{ fontSize: 13 }}>{item.description}</div>}
                {result.suggestedDietaryByDish[index]?.length > 0 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 4 }}>
                    {result.suggestedDietaryByDish[index].map((code) => {
                      const on = accepted[index]?.includes(code);
                      return (
                        <button
                          key={code}
                          type="button"
                          className={on ? 'pill-mini active' : 'pill-mini'}
                          aria-pressed={on}
                          onClick={() => toggleSuggestion(index, code)}
                          style={{ cursor: 'pointer' }}
                        >
                          {on ? '✓ ' : '+ '}
                          {dietaryLabel(code)}
                        </button>
                      );
                    })}
                  </div>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </EditorModal>
  );
}
