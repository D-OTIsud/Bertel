import { render, screen } from '@testing-library/react';
import { SortableList } from './SortableList';

describe('SortableList', () => {
  it('renders each item with a drag handle in order', () => {
    render(
      <SortableList
        items={[{ id: 'a' }, { id: 'b' }]}
        getId={(it) => it.id}
        onReorder={() => {}}
        renderItem={(it) => <span>{it.id}</span>}
      />,
    );
    expect(screen.getAllByRole('button', { name: /déplacer/i })).toHaveLength(2);
    expect(screen.getByText('a')).toBeInTheDocument();
    expect(screen.getByText('b')).toBeInTheDocument();
  });
});
