import { useEffect, useMemo, useRef, useState } from 'react';
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
import { useServiceAvailability } from '../../../hooks/useServiceAvailability';
import { getServiceAvailability } from '../../../services/service-availability';

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
  const { imageAnalysis } = useServiceAvailability();
  const [files, setFiles] = useState<ModalFile[]>([]);
  const [confirmed, setConfirmed] = useState(false);
  const [title, setTitle] = useState('Carte');
  const [phase, setPhase] = useState<'collect' | 'analyzing' | 'preview'>('collect');
  const [result, setResult] = useState<ExtractResult | null>(null);
  const [accepted, setAccepted] = useState<string[][]>([]);
  const [error, setError] = useState<string | null>(null);
  const actionGeneration = useRef(0);
  const analysisRequest = useRef<AbortController | null>(null);
  const mounted = useRef(true);
  const modalVersion = useRef(0);

  useEffect(() => {
    // StrictMode runs setup → cleanup → setup in development.
    mounted.current = true;
    return () => {
      mounted.current = false;
      modalVersion.current += 1;
      actionGeneration.current += 1;
      analysisRequest.current?.abort();
      analysisRequest.current = null;
    };
  }, []);

  useEffect(() => {
    modalVersion.current += 1;
    actionGeneration.current += 1;
    analysisRequest.current?.abort();
    analysisRequest.current = null;
    setPhase('collect');
    setResult(null);
    setAccepted([]);
  }, [open, objectId]);

  useEffect(() => {
    if (imageAnalysis) return;
    actionGeneration.current += 1;
    analysisRequest.current?.abort();
    analysisRequest.current = null;
    setPhase('collect');
    setResult(null);
    setAccepted([]);
  }, [imageAnalysis]);

  const dietaryLabel = useMemo(() => {
    const map = new Map(allowedDietary.map((o) => [o.code, o.label]));
    return (code: string) => map.get(code) ?? code;
  }, [allowedDietary]);

  const analyzableImages = files
    .filter((f) => f.status === 'ready')
    .flatMap((f) => f.images ?? [])
    .slice(0, MAX_ANALYZE_IMAGES);
  const canAnalyze = imageAnalysis && phase === 'collect' && confirmed && analyzableImages.length > 0;

  async function addFiles(fileList: FileList) {
    setError(null);
    for (const file of Array.from(fileList)) {
      const generation = actionGeneration.current;
      const version = modalVersion.current;
      const key = `${file.name}-${file.size}-${files.length}-${Math.round(performance.now())}`;
      const isPdf = file.type === 'application/pdf';
      setFiles((prev) => [...prev, { key, name: file.name, isPdf, status: 'uploading' }]);
      let linked = false;
      try {
        const uploaded = await uploadDocument({ file, objectId, accessToken });
        await linkObjectCarte(objectId, uploaded.documentId, Math.floor(performance.now()));
        linked = true;
        onCarteUploaded?.();
        // The upload itself remains useful even if AI was switched off while it
        // was in flight. Only update the same still-open modal instance.
        if (!mounted.current || version !== modalVersion.current) continue;
        setFiles((prev) => prev.map((f) => (f.key === key ? { ...f, status: 'ready' } : f)));
        // Uploading a downloadable carte is always available. Do not decode or
        // rasterize it unless availability is freshly confirmed for AI analysis.
        const availability = await getServiceAvailability({ force: true });
        if (generation !== actionGeneration.current || version !== modalVersion.current
          || !mounted.current || !availability.imageAnalysis) continue;
        const images = isPdf ? await rasterizePdfToImages(file) : [await readFileAsBase64(file)];
        if (generation === actionGeneration.current && version === modalVersion.current
          && mounted.current && imageAnalysis) {
          setFiles((prev) => prev.map((f) => (f.key === key ? { ...f, status: 'ready', images } : f)));
        }
      } catch (err) {
        if (!linked && mounted.current && version === modalVersion.current) {
          setFiles((prev) => prev.map((f) => (f.key === key ? { ...f, status: 'error', error: errMsg(err) } : f)));
        }
      }
    }
  }

  async function analyze() {
    if (analysisRequest.current || !imageAnalysis || !canAnalyze) return;
    const generation = actionGeneration.current;
    const version = modalVersion.current;
    const controller = new AbortController();
    analysisRequest.current = controller;
    setPhase('analyzing');
    setError(null);
    try {
      const availability = await getServiceAvailability({ force: true });
      if (generation !== actionGeneration.current || version !== modalVersion.current
        || controller.signal.aborted || !mounted.current || !availability.imageAnalysis) {
        if (analysisRequest.current === controller && !controller.signal.aborted) setPhase('collect');
        return;
      }
      const res = await extractMenuFromImages(
        {
          objectId,
          menuTitle: title.trim() || 'Carte',
          images: analyzableImages,
          allowedSections: allowedSections.map((o) => ({ id: o.id, code: o.code, label: o.label })),
          allowedDietary: allowedDietary.map((o) => ({ id: o.id, code: o.code, label: o.label })),
        },
        accessToken,
        globalThis.fetch,
        controller.signal,
      );
      if (generation !== actionGeneration.current || version !== modalVersion.current
        || controller.signal.aborted || !mounted.current || !imageAnalysis) return;
      setResult(res);
      setAccepted(res.suggestedDietaryByDish.map(() => []));
      setPhase('preview');
    } catch (err) {
      if (generation !== actionGeneration.current || version !== modalVersion.current || controller.signal.aborted || !mounted.current) return;
      setError(errMsg(err));
      setPhase('collect');
    } finally {
      if (analysisRequest.current === controller) analysisRequest.current = null;
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
    close();
  }

  function close() {
    modalVersion.current += 1;
    actionGeneration.current += 1;
    analysisRequest.current?.abort();
    analysisRequest.current = null;
    onClose();
  }

  return (
    <EditorModal
      open={open}
      title={imageAnalysis ? 'Ajouter une carte' : 'Importer une carte'}
      size="lg"
      saveLabel={imageAnalysis ? 'Ajouter ce menu au brouillon' : 'Fermer'}
      saveDisabled={imageAnalysis ? phase !== 'preview' : false}
      onSave={imageAnalysis ? inject : close}
      onClose={close}
    >
      {phase !== 'preview' && (
        <>
          <Field
            label="Fichiers (images de la carte ou PDF)"
            hint={imageAnalysis
              ? "Images (JPEG/PNG) ou PDF — tous analysés par l'IA. Chaque fichier est aussi conservé comme carte téléchargeable."
              : 'Images (JPEG/PNG) ou PDF — chaque fichier est conservé comme carte téléchargeable.'}
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
                  {f.status === 'ready' && f.isPdf && <span className="muted">· carte{imageAnalysis ? ` · ${f.images?.length ?? 0} page(s)` : ''}</span>}
                  {f.status === 'ready' && !f.isPdf && <span className="muted">· prête</span>}
                  {f.status === 'error' && <span role="alert" style={{ color: 'var(--danger, #c00)' }}>· {f.error}</span>}
                </li>
              ))}
            </ul>
          )}

          {imageAnalysis && <>
            <Field label="Titre du menu généré">
              <Input value={title} onChange={setTitle} placeholder="Carte de la semaine" />
            </Field>

            <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 13, margin: '6px 0' }}>
              <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} />
              <span>
                Il s'agit de la <strong>carte complète</strong> : toutes les pages/images sont importées avant l'analyse.
              </span>
            </label>
          </>}

          {error && <p role="alert" style={{ color: 'var(--danger, #c00)', fontSize: 13 }}>{error}</p>}

          {imageAnalysis && <button
            type="button"
            className="btn primary"
            disabled={!canAnalyze && phase !== 'analyzing'}
            aria-disabled={!canAnalyze}
            onClick={() => { if (canAnalyze) void analyze(); }}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginTop: 6 }}
          >
            {phase === 'analyzing' ? <Loader2 size={15} className="spin" aria-hidden /> : <Sparkles size={15} aria-hidden />}
            {phase === 'analyzing' ? 'Analyse en cours…' : 'Analyser et créer un menu'}
          </button>}
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
