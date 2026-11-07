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

  it('applies grid-template-columns to each rep-row when columns prop is given', () => {
    const { container } = render(
      <SortableList
        items={[{ id: 'x' }]}
        getId={(it) => it.id}
        onReorder={() => {}}
        renderItem={(it) => <span>{it.id}</span>}
        columns="14px 1fr 150px 130px auto"
      />,
    );
    const row = container.querySelector('.rep-row') as HTMLElement;
    expect(row.style.gridTemplateColumns).toBe('14px 1fr 150px 130px auto');
  });
});
