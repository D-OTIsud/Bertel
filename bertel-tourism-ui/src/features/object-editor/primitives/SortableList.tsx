import type { ReactNode } from 'react';
import { DndContext, closestCenter, PointerSensor, KeyboardSensor, useSensor, useSensors } from '@dnd-kit/core';
import type { DragEndEvent } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy, useSortable, sortableKeyboardCoordinates, arrayMove } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

interface SortableListProps<T> {
  items: T[];
  getId: (item: T) => string;
  onReorder: (next: T[]) => void;
  renderItem: (item: T, index: number) => ReactNode;
  /** CSS grid-template-columns for each row — must match the column header template above the list. */
  columns?: string;
}

function SortableRow({ id, children, columns }: { id: string; children: ReactNode; columns?: string }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  return (
    <div
      ref={setNodeRef}
      className="rep-row"
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.6 : 1,
        ...(columns ? { gridTemplateColumns: columns } : {}),
      }}
    >
      <button type="button" className="rep-row__handle" aria-label="Déplacer" {...attributes} {...listeners} />
      {children}
    </div>
  );
}

/** Vertical drag-and-drop list. Keyboard accessible (dnd-kit KeyboardSensor). */
export function SortableList<T>({ items, getId, onReorder, renderItem, columns }: SortableListProps<T>) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const from = items.findIndex((it) => getId(it) === active.id);
    const to = items.findIndex((it) => getId(it) === over.id);
    if (from === -1 || to === -1) return;
    onReorder(arrayMove(items, from, to));
  }
  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={items.map(getId)} strategy={verticalListSortingStrategy}>
        <div className="repeater">
          {items.map((item, index) => (
            <SortableRow key={getId(item)} id={getId(item)} columns={columns}>
              {renderItem(item, index)}
            </SortableRow>
          ))}
        </div>
      </SortableContext>
    </DndContext>
  );
}
