import { render, screen } from '@testing-library/react';
import { SortableGrid } from './SortableGrid';

describe('SortableGrid', () => {
  it('renders each tile with its injected drag handle, inside the given container class', () => {
    const { container } = render(
      <SortableGrid
        items={[{ id: 'a' }, { id: 'b' }]}
        getId={(it) => it.id}
        onReorder={() => {}}
        className="media-grid"
        renderItem={(it, _index, handle) => (
          <article>
            <span>{it.id}</span>
            {handle}
          </article>
        )}
      />,
    );
    expect(container.querySelector('.media-grid')).not.toBeNull();
    expect(screen.getAllByRole('button', { name: /déplacer/i })).toHaveLength(2);
    expect(screen.getByText('a')).toBeInTheDocument();
    expect(screen.getByText('b')).toBeInTheDocument();
  });
});
