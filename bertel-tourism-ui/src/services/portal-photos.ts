import { getApiClient } from "../lib/supabase";
import type {
  ObjectWorkspaceMediaItem,
  ObjectWorkspaceMediaModule,
} from "./object-workspace-parser";
import type { SubmitPendingChangeInput } from "./moderation";
import { assertWorkspaceSaveAvailable } from "./object-workspace-safety";

export interface PortalPublishedPhoto {
  id: string;
  url: string;
  title: string;
  credit: string;
  position: number;
  isMain: boolean;
  portalDocumentId: string | null;
}
export interface PortalPhotoUpload {
  id: string;
  title: string;
  width: number;
  height: number;
}
const rec = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" ? (value as Record<string, unknown>) : {};
const text = (value: unknown) => (typeof value === "string" ? value : "");
function client() {
  const c = getApiClient();
  if (!c) throw new Error("Le service est indisponible. Réessayez.");
  return c;
}
export async function portalPhotoToken(): Promise<string> {
  const { data, error } = await client().auth.getSession();
  if (error || !data.session?.access_token)
    throw new Error("Votre session a expiré. Reconnectez-vous.");
  return data.session.access_token;
}
function parsePhotos(data: unknown): PortalPublishedPhoto[] {
  return (Array.isArray(data) ? data : [])
    .map(rec)
    .filter((row) => text(row.id) && text(row.url))
    .map((row) => ({
      id: text(row.id),
      url: text(row.url),
      title: text(row.title),
      credit: text(row.credit),
      position: Number(row.position) || 0,
      isMain: row.isMain === true,
      portalDocumentId: text(row.portalDocumentId) || null,
    }));
}
async function rpc(
  name: string,
  args: Record<string, unknown>,
): Promise<PortalPublishedPhoto[]> {
  const { data, error } = await client().schema("api").rpc(name, args);
  if (error)
    throw new Error(
      error.code === "PT409"
        ? "Les photos ont changé. Actualisez-les avant de réessayer."
        : "L’opération sur les photos a échoué. Vos ajouts sont conservés ; réessayez.",
    );
  if (!Array.isArray(data))
    throw new Error(
      "Les photos n’ont pas pu être relues. Actualisez la fiche.",
    );
  return parsePhotos(data);
}
export const listMyPortalPhotos = (objectId: string) =>
  rpc("list_my_portal_photos", { p_object_id: objectId });
export const withdrawPortalPhoto = (objectId: string, mediaId: string) =>
  rpc("withdraw_portal_photo", { p_object_id: objectId, p_media_id: mediaId });
export const reorderPortalPhotos = (objectId: string, mediaIds: string[]) =>
  rpc("reorder_portal_photos", {
    p_object_id: objectId,
    p_media_ids: mediaIds,
  });
async function request(
  path: string,
  body: BodyInit,
): Promise<Record<string, unknown>> {
  let response: Response;
  try {
    response = await fetch(path, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${await portalPhotoToken()}`,
        ...(typeof body === "string"
          ? { "Content-Type": "application/json" }
          : {}),
      },
      body,
    });
  } catch {
    throw new Error(
      "La connexion a été interrompue. Votre saisie est conservée ; réessayez.",
    );
  }
  if (!response.ok)
    throw new Error(
      response.status === 413
        ? "La photo dépasse 20 Mo. Choisissez un fichier plus petit."
        : response.status === 415
          ? "Choisissez une photo JPG, PNG ou WebP."
          : response.status === 409
            ? "Une validation est déjà en cours, ou les photos ont changé. Actualisez avant de réessayer."
            : "L’opération n’a pas pu être confirmée. Actualisez la fiche avant de réessayer.",
    );
  return rec(await response.json());
}
export async function uploadPortalPhoto(
  objectId: string,
  file: File,
  rights: boolean,
): Promise<PortalPhotoUpload> {
  const form = new FormData();
  form.append("object_id", objectId);
  form.append("file", file);
  form.append("rights", String(rights));
  const data = await request("/api/portal-photo/upload", form);
  if (!text(data.id))
    throw new Error("Le dépôt n’a pas pu être confirmé. Réessayez.");
  return {
    id: text(data.id),
    title: text(data.title),
    width: Number(data.width) || 0,
    height: Number(data.height) || 0,
  };
}
export async function getPortalPhotoPreview(id: string): Promise<string> {
  const data = await request(
    "/api/portal-photo/preview",
    JSON.stringify({ documentId: id }),
  );
  if (!text(data.url)) throw new Error("Aperçu indisponible.");
  return text(data.url);
}
export function approvePortalPhotos(input: {
  id: string;
  batch: boolean;
  reviewNote: string | null;
  manual: boolean;
}) {
  return request("/api/portal-photo/approve", JSON.stringify(input));
}
export async function getPortalPhotoReview(
  changeId: string,
): Promise<
  { id: string; title: string; credit: string; replacement: boolean }[]
> {
  const { data, error } = await client()
    .schema("api")
    .rpc("get_portal_photo_review", { p_change_id: changeId });
  if (error)
    throw new Error(
      "Les photos proposées n’ont pas pu être chargées. Réessayez.",
    );
  return (Array.isArray(data) ? data : [])
    .map(rec)
    .filter((row) => text(row.id))
    .map((row) => ({
      id: text(row.id),
      title: text(row.title),
      credit: text(row.credit),
      replacement: row.replacement === true,
    }));
}

export function isPublishedPortalPhoto(item: ObjectWorkspaceMediaItem) {
  return (
    item.scope === "object" &&
    item.typeCode === "photo" &&
    item.isPublished &&
    (!item.visibility || item.visibility === "public") &&
    !item.portalUploadId
  );
}
export function portalPhotoDraft(
  upload: PortalPhotoUpload,
  credit: string,
  replaceId: string | null,
  media: ObjectWorkspaceMediaModule,
): ObjectWorkspaceMediaItem {
  const type = media.typeOptions.find((item) => item.code === "photo");
  return {
    id: `portal-photo:${upload.id}`,
    portalUploadId: upload.id,
    portalReplaceMediaId: replaceId,
    scope: "object",
    placeId: null,
    scopeLabel: "Fiche",
    typeId: type?.id ?? "",
    typeCode: "photo",
    typeLabel: type?.label ?? "Photo",
    title: upload.title,
    titleTranslations: {},
    description: "",
    descriptionTranslations: {},
    url: "",
    credit,
    visibility: "private",
    position: String(media.objectItems.length + 1),
    width: String(upload.width),
    height: String(upload.height),
    rightsExpiresAt: "",
    kind: "illustration",
    isMain: false,
    isPublished: false,
    tags: [],
  };
}
/** Rebase just the published gallery, preserving private media and unsent additions. */
export function mergePortalPublishedPhotos(
  current: ObjectWorkspaceMediaModule,
  photos: PortalPublishedPhoto[],
): ObjectWorkspaceMediaModule {
  const publishedDocuments = new Set(
    photos.map((p) => p.portalDocumentId).filter(Boolean),
  );
  const retained = current.objectItems.filter(
    (item) =>
      !isPublishedPortalPhoto(item) &&
      !publishedDocuments.has(item.portalUploadId ?? ""),
  );
  const canonical = photos.map((photo) => {
    const existing = current.objectItems.find((item) => item.id === photo.id);
    const base =
      existing ??
      portalPhotoDraft(
        { id: photo.id, title: photo.title, width: 0, height: 0 },
        photo.credit,
        null,
        current,
      );
    const {
      portalUploadId: _upload,
      portalReplaceMediaId: _replace,
      ...clean
    } = base;
    void _upload;
    void _replace;
    return {
      ...clean,
      id: photo.id,
      title: photo.title,
      url: photo.url,
      credit: photo.credit,
      position: String(photo.position),
      isMain: photo.isMain,
      isPublished: true,
      visibility: "public",
    };
  });
  const next = { ...current, objectItems: [...retained, ...canonical] };
  return JSON.stringify(next) === JSON.stringify(current) ? current : next;
}
export function buildPortalPhotoSubmission(
  objectId: string,
  baseline: ObjectWorkspaceMediaModule,
  draft: ObjectWorkspaceMediaModule,
): SubmitPendingChangeInput {
  assertWorkspaceSaveAvailable("media", baseline);
  assertWorkspaceSaveAvailable("media", draft);
  const additions = draft.objectItems
    .filter((item) => item.portalUploadId)
    .map((item) => ({
      upload_id: item.portalUploadId!,
      credit: item.credit,
      replace_media_id: item.portalReplaceMediaId ?? null,
    }));
  if (!additions.length) throw new Error("Aucune nouvelle photo à envoyer.");
  return {
    objectId,
    targetTable: "media",
    targetPk: null,
    action: "update",
    payload: { additions },
    metadata: {
      section: "media",
      rpc: "publish_portal_photo_additions",
      manual_apply: false,
      field: "Vos photos",
      before: "",
      after: `${additions.length} photo${additions.length > 1 ? "s" : ""} à ajouter`,
    },
  };
}
