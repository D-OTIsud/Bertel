import { interactionStatusLabel } from "../../crm/crm-status";
import type { PortalPhotoWorkspace } from "../../../services/portal-photos";

export type AlbumPhotoStatus = "online" | "draft" | "pending" | "refused";
export type PhotoTextSnapshot = PortalPhotoWorkspace["published"][number]["textSnapshot"];
export interface PhotoTextValues { title: string; description: string }

/** Match the server's Unicode limits; unchanged legacy values remain editable. */
export function photoTextErrors(value: PhotoTextValues, baseline?: PhotoTextValues): Partial<Record<keyof PhotoTextValues, string>> {
  const errors: Partial<Record<keyof PhotoTextValues, string>> = {};
  if ((!baseline || value.title !== baseline.title) && Array.from(value.title.trim()).length > 180)
    errors.title = "Le titre ne peut pas dépasser 180 caractères.";
  if ((!baseline || value.description !== baseline.description) && Array.from(value.description.trim()).length > 5000)
    errors.description = "La description ne peut pas dépasser 5 000 caractères.";
  return errors;
}

/** A lost response is confirmed only by the complete canonical, normalized order. */
export function matchesSavedPhotoOrder(workspace: PortalPhotoWorkspace, ids: string[]): boolean {
  return workspace.orderSnapshot.length === ids.length && workspace.orderSnapshot.every((photo, index) =>
    photo.id === ids[index] && photo.position === index + 1 && photo.isMain === (index === 0));
}

/** UI identities keep public media and private replacement versions separate. */
export interface AlbumPhoto {
  key: string;
  mediaId: string | null;
  documentId: string | null;
  title: string;
  description: string;
  credit: string;
  status: AlbumPhotoStatus;
  url?: string;
  file?: File | null;
  replaceMediaId: string | null;
  position: number;
  isMain?: boolean;
  createdAt?: string | null;
  reviewNote?: string | null;
  changeId?: string | null;
  reviewAppeal?: { interactionId: string; status: string | null } | null;
  canEdit: boolean;
  canCancel: boolean;
  canAppeal?: boolean;
  textSnapshot?: PhotoTextSnapshot;
  analysis?: PortalPhotoWorkspace["proposals"][number]["analysis"];
}

export const photoName = (photo: Pick<AlbumPhoto, "title">) => photo.title || "Photo sans titre";
export const photoAppealId = (photo: AlbumPhoto) => photo.reviewAppeal?.interactionId ?? photo.analysis?.appealInteractionId ?? null;
export function photoAppealStatus(photo: Pick<AlbumPhoto, "reviewAppeal" | "analysis">): string {
  const state = photo.reviewAppeal?.status ?? photo.analysis?.appealStatus;
  if (state === "new") return "Envoyée à l’office";
  if (state === "in_progress") return "En cours de révision";
  if (state === "resolved") return "Traitée par l’office";
  return interactionStatusLabel(state) ?? "Statut indisponible";
}

export function albumPhotoStatus(photo: AlbumPhoto): string {
  if (photo.status === "online") return "";
  if (photo.status === "refused") return photoAppealId(photo) ? "Révision demandée" : "Refusée";
  if (photo.status === "pending") return "En attente";
  return photo.file ? "À déposer" : "À envoyer";
}

export function displayPhotoDate(value: string | null | undefined): string {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? "" : new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long", year: "numeric" }).format(date);
}
