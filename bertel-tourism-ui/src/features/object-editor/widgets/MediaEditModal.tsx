import { useState, useEffect } from 'react';
import { EditorModal, ReferenceSelect, Field, Input, Textarea, Toggle, Select, LangTabs } from '../primitives';
import type { ObjectWorkspaceMediaItem, WorkspaceReferenceOption } from '../../../services/object-workspace-parser';
import { MediaUploadField } from './MediaUploadField';
import { getSupabaseClient } from '../../../lib/supabase';

interface Props {
  open: boolean;
  media: ObjectWorkspaceMediaItem;
  typeOptions: WorkspaceReferenceOption[];
  languages: string[];
  objectId: string;
  onClose: () => void;
  onSave: (media: ObjectWorkspaceMediaItem) => void;
}

// Read-audience vocabulary (§52 precedent — aligned with §16): media.visibility gates
// WHO reads the row, it is not a publication switch ("Publié" is). 'private' = Interne.
const VISIBILITY = [
  { v: 'public', l: 'Publique' },
  { v: 'partners', l: 'Partenaires' },
  { v: 'private', l: 'Interne' },
];
const LANG_LABELS: Record<string, string> = { fr: 'FR', en: 'EN', cre: 'CRE' };

/** Focused add/edit form for one media item, with per-language title/description. */
export function MediaEditModal({ open, media, typeOptions, languages, objectId, onClose, onSave }: Props) {
  const [draft, setDraft] = useState(media);
  const primary = languages[0] ?? 'fr';
  const [lang, setLang] = useState(primary);
  const set = (patch: Partial<ObjectWorkspaceMediaItem>) => setDraft((d) => ({ ...d, ...patch }));

  // Resolve the Supabase access token so the upload widget can authenticate against
  // /api/media/upload. Session resolves asynchronously — render the upload widget
  // only after we have a token, otherwise the field would fire unauthenticated requests.
  const [accessToken, setAccessToken] = useState<string | null>(null);
  useEffect(() => {
    const client = getSupabaseClient();
    if (!client) return;
    client.auth.getSession().then(({ data }) => setAccessToken(data.session?.access_token ?? null));
  }, []);

  const isPrimary = lang === primary;
  const titleValue = isPrimary ? draft.title : (draft.titleTranslations[lang] ?? '');
  const descValue = isPrimary ? draft.description : (draft.descriptionTranslations[lang] ?? '');
  // Primary-language edits write BOTH the flat column and the i18n key: public readers
  // prefer the i18n map, so a flat-only edit would be silently shadowed by an existing
  // imported key. An emptied value removes the key (no '' shadow left behind).
  const withLangKey = (map: Record<string, string>, v: string) => {
    if (v.trim()) return { ...map, [lang]: v };
    const { [lang]: _removed, ...rest } = map;
    return rest;
  };
  const setTitle = (v: string) =>
    isPrimary
      ? set({ title: v, titleTranslations: withLangKey(draft.titleTranslations, v) })
      : set({ titleTranslations: { ...draft.titleTranslations, [lang]: v } });
  const setDesc = (v: string) =>
    isPrimary
      ? set({ description: v, descriptionTranslations: withLangKey(draft.descriptionTranslations, v) })
      : set({ descriptionTranslations: { ...draft.descriptionTranslations, [lang]: v } });

  return (
    <EditorModal
      open={open}
      title={draft.title || 'Média'}
      onClose={onClose}
      onSave={() => onSave(draft)}
      // A media row without a file would fail the DB chk_media_url_* constraints at
      // global save — block here with a disabled action instead of a late raw error.
      saveDisabled={!draft.url.trim()}
    >
      {draft.url && <img className="ed-modal__preview" src={draft.url} alt={draft.description || draft.title || 'Aperçu'} />}
      <Field label="Type de média">
        <ReferenceSelect
          value={draft.typeCode}
          options={typeOptions}
          aria-label="Type de média"
          onChange={(code, opt) => set({ typeCode: code, typeId: opt?.id ?? '', typeLabel: opt?.label ?? '' })}
        />
      </Field>
      {accessToken && (
        <MediaUploadField
          objectId={objectId}
          accessToken={accessToken}
          onUploaded={(uploaded) => {
            // `uploaded.mimeType` is intentionally not persisted: the `media` table has no
            // mime_type column today, and processImage always normalises to image/jpeg
            // (which the bucket path's .jpg suffix already reflects).
            set({
              url: uploaded.url,
              width: String(uploaded.width),
              height: String(uploaded.height),
            });
          }}
        />
      )}
      {languages.length > 1 && (
        <LangTabs
          tabs={languages.map((code) => ({
            code,
            label: LANG_LABELS[code] ?? code.toUpperCase(),
            filled: code === primary
              ? Boolean(draft.title.trim())
              : Boolean((draft.titleTranslations[code] ?? '').trim()),
          }))}
          active={lang}
          onSelect={setLang}
        />
      )}
      <Field label="Titre"><Input value={titleValue} aria-label="Titre" onChange={setTitle} /></Field>
      <Field label="Description (texte alternatif)">
        <Textarea value={descValue} rows={3} aria-label="Description (texte alternatif)" onChange={setDesc} />
      </Field>
      <Field label="Crédit / auteur"><Input value={draft.credit} aria-label="Crédit / auteur" onChange={(credit) => set({ credit })} /></Field>
      {/* Publication settings cluster — Visibilité + Photo de couverture share
          a 2-column grid (.ed-modal__group), Publié sits below as a full-width
          final toggle. Styling lives in object-editor.css under .ed-modal__group. */}
      <div className="ed-modal__group">
        <Field label="Visibilité">
          {/* A NULL DB visibility renders honestly (§16 precedent) instead of a fake
              "Publique" display — picking a real value is an explicit user choice. */}
          <Select
            value={draft.visibility}
            options={draft.visibility === ''
              ? [{ v: '', l: '— Visibilité non définie —' }, ...VISIBILITY]
              : VISIBILITY}
            aria-label="Visibilité"
            onChange={(visibility) => set({ visibility })}
          />
        </Field>
        <Toggle label="Photo de couverture" on={draft.isMain} onChange={(isMain) => set({ isMain })} />
      </div>
      <Toggle label="Publié" on={draft.isPublished} onChange={(isPublished) => set({ isPublished })} />
    </EditorModal>
  );
}
