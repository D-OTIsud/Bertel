import type { ReactNode } from 'react';
import { DndContext, closestCenter, PointerSensor, KeyboardSensor, useSensor, useSensors } from '@dnd-kit/core';
import type { DragEndEvent } from '@dnd-kit/core';
import { SortableContext, rectSortingStrategy, useSortable, sortableKeyboardCoordinates, arrayMove } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical } from 'lucide-react';

interface SortableGridProps<T> {
  items: T[];
  getId: (item: T) => string;
  onReorder: (next: T[]) => void;
  /**
   * Renders one tile. The injected `handle` is the listeners-bound drag button —
   * place it wherever the tile's action cluster lives (unlike SortableList rows,
   * a tile has no fixed handle slot).
   */
  renderItem: (item: T, index: number, handle: ReactNode) => ReactNode;
  /** Class of the grid container (e.g. `media-grid`) — the wrapper divs become its grid items. */
  className?: string;
}

function SortableTile({ id, render }: { id: string; render: (handle: ReactNode) => ReactNode }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const handle = (
    <button type="button" aria-label="Déplacer" {...attributes} {...listeners}>
      <GripVertical size={12} />
    </button>
  );
  return (
    <div
      ref={setNodeRef}
      className="sortable-tile"
      style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.6 : 1 }}
    >
      {render(handle)}
    </div>
  );
}

/** Drag-and-drop tile grid (2D, rectSortingStrategy). Keyboard accessible. */
export function SortableGrid<T>({ items, getId, onReorder, renderItem, className }: SortableGridProps<T>) {
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
      <SortableContext items={items.map(getId)} strategy={rectSortingStrategy}>
        <div className={className}>
          {items.map((item, index) => (
            <SortableTile key={getId(item)} id={getId(item)} render={(handle) => renderItem(item, index, handle)} />
          ))}
        </div>
      </SortableContext>
    </DndContext>
  );
}
