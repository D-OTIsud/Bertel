"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { ArrowDown, ArrowUp, GripVertical, Star } from "lucide-react";
import {
  closestCenter, DndContext, KeyboardSensor, PointerSensor,
  useSensor, useSensors, type DragEndEvent, type DragOverEvent,
} from "@dnd-kit/core";
import {
  arrayMove, SortableContext, sortableKeyboardCoordinates,
  useSortable, verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

export interface OrderedPortalPhoto {
  id: string;
  title: string;
  url: string;
  description?: string;
}

function OrderRow({ photo, index, count, disabled, marker, onMove, rowRef }: {
  photo: OrderedPortalPhoto;
  index: number;
  count: number;
  disabled: boolean;
  marker?: "before" | "after";
  onMove: (id: string, direction: -1 | 1) => void;
  rowRef: (id: string, node: HTMLLIElement | null) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: photo.id, disabled });
  const title = photo.title || `Photo ${index + 1}`;
  const style: CSSProperties = { transform: CSS.Transform.toString(transform), transition };
  return <li
    ref={(node) => { setNodeRef(node); rowRef(photo.id, node); }}
    className={`portal-photo-order__item${isDragging ? " is-dragging" : ""}${marker ? ` drop-${marker}` : ""}`}
    style={style}
    data-order-id={photo.id}
  >
    <button type="button" className="portal-photo-order__handle"
      aria-label={`Déplacer ${title}`} disabled={disabled} {...attributes} {...listeners}>
      <GripVertical size={20} aria-hidden />
    </button>
    <span className="portal-photo-order__rank">{String(index + 1).padStart(2, "0")}</span>
    <img className="portal-photo-order__thumb" src={photo.url} alt="" draggable={false} />
    <span className="portal-photo-order__name" data-order-title tabIndex={-1}>{title}</span>
    {index === 0 ? <span className="portal-photo-order__primary"><Star size={11} aria-hidden /> Principale</span> : null}
    <div className="portal-photo-order__moves">
      <button type="button" className="portal-photo-icon" data-direction="-1"
        disabled={disabled || index === 0} aria-label={`Monter ${title}`} onClick={() => onMove(photo.id, -1)}>
        <ArrowUp size={18} aria-hidden />
      </button>
      <button type="button" className="portal-photo-icon" data-direction="1"
        disabled={disabled || index === count - 1} aria-label={`Descendre ${title}`} onClick={() => onMove(photo.id, 1)}>
        <ArrowDown size={18} aria-hidden />
      </button>
    </div>
  </li>;
}

/** A local intention: only the complete list of public IDs is committed on Save. */
export function PortalPhotoOrder({ photos, busy, conflict, attempted, writesEnabled, onChange, onSave, onCancel }: {
  photos: OrderedPortalPhoto[];
  busy: boolean;
  conflict: boolean;
  attempted: boolean;
  writesEnabled: boolean;
  onChange: (ids: string[]) => void;
  onSave: () => void;
  onCancel: () => void;
}) {
  const rows = useRef(new Map<string, HTMLLIElement>());
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => { heading.current?.focus(); }, []);
  const [over, setOver] = useState<{ id: string; side: "before" | "after" } | null>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const disabled = busy || conflict || !writesEnabled;
  function focusRow(id: string, direction?: -1 | 1) {
    requestAnimationFrame(() => {
      const row = rows.current.get(id);
      const preferred = direction ? row?.querySelector<HTMLButtonElement>(`button[data-direction="${direction}"]:not(:disabled)`) : null;
      const fallback = direction ? row?.querySelector<HTMLButtonElement>("button[data-direction]:not(:disabled)") : null;
      (preferred ?? fallback ?? row?.querySelector<HTMLElement>("[data-order-title]"))?.focus();
    });
  }
  function move(id: string, direction: -1 | 1) {
    if (disabled) return;
    const from = photos.findIndex((photo) => photo.id === id), to = from + direction;
    if (from < 0 || to < 0 || to >= photos.length) return;
    onChange(arrayMove(photos, from, to).map((photo) => photo.id));
    focusRow(id, direction);
  }
  function dragOver(event: DragOverEvent) {
    if (!event.over || event.over.id === event.active.id) { setOver(null); return; }
    const from = photos.findIndex((photo) => photo.id === event.active.id);
    const to = photos.findIndex((photo) => photo.id === event.over!.id);
    setOver({ id: String(event.over.id), side: from < to ? "after" : "before" });
  }
  function drop(event: DragEndEvent) {
    setOver(null);
    if (disabled || !event.over || event.over.id === event.active.id) return;
    const from = photos.findIndex((photo) => photo.id === event.active.id);
    const to = photos.findIndex((photo) => photo.id === event.over!.id);
    if (from < 0 || to < 0) return;
    onChange(arrayMove(photos, from, to).map((photo) => photo.id));
    focusRow(String(event.active.id));
  }
  return <section className="portal-photo-order" aria-labelledby="portal-photo-order-title">
    <div className="portal-photo-section-head portal-photo-order__toolbar">
      <div><h3 id="portal-photo-order-title" ref={heading} tabIndex={-1}>Ordre d’affichage</h3>
        <p>La première photo est la photo principale. Glissez une poignée ou utilisez les flèches.</p></div>
      <div className="portal-photo-order__actions">
        <button type="button" className="ghost-button" onClick={onCancel} disabled={busy}>Annuler</button>
        <button type="button" className="primary-button" onClick={onSave} disabled={disabled}>
          {busy ? "Enregistrement…" : "Enregistrer l’ordre"}
        </button>
      </div>
    </div>
    {conflict ? <p className="notice notice--warn" role="alert">{attempted
      ? "L’ordre actuel diffère de votre classement. Votre brouillon est conservé. Annulez pour consulter la galerie à jour."
      : "Les photos ont changé pendant le classement. Annulez pour retrouver la galerie à jour ; aucun ordre n’a été envoyé."}</p> : null}
    <DndContext sensors={sensors} collisionDetection={closestCenter} autoScroll
      onDragOver={dragOver} onDragEnd={drop} onDragCancel={() => setOver(null)}>
      <SortableContext items={photos.map((photo) => photo.id)} strategy={verticalListSortingStrategy}>
        <ol className="portal-photo-order__list" aria-label="Ordre des photos en ligne">
          {photos.map((photo, index) => <OrderRow key={photo.id} photo={photo} index={index} count={photos.length}
            disabled={disabled} marker={over?.id === photo.id ? over.side : undefined} onMove={move}
            rowRef={(id, node) => { if (node) rows.current.set(id, node); else rows.current.delete(id); }} />)}
        </ol>
      </SortableContext>
    </DndContext>
    <p className="sr-only" role="status">{photos.map((photo, index) => `${index + 1}. ${photo.title || "Photo"}`).join(" ; ")}</p>
  </section>;
}
