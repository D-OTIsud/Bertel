import { render, screen, fireEvent } from '@testing-library/react';
import { useState } from 'react';
import { MediaLinkField } from './MediaLinkField';
import type { WorkspaceMediaOption } from '../../../services/object-workspace-parser';

const opts: WorkspaceMediaOption[] = [
  { id: 'm1', code: 'm1', label: 'Vue terrasse', url: 'https://cdn/m1.jpg' },
  { id: 'm2', code: 'm2', label: 'Salle de bain', url: 'https://cdn/m2.jpg' },
];

/** Stateful harness so click handlers actually mutate the linked ids (the parent owns the draft). */
function Harness({ initial, options }: { initial: string[]; options: WorkspaceMediaOption[] }) {
  const [ids, setIds] = useState(initial);
  return (
    <>
      <MediaLinkField mediaIds={ids} options={options} onChange={setIds} emptyLinkedHint="Aucune photo rattachée à ce test." />
      <output aria-label="ids">{ids.join(',')}</output>
    </>
  );
}

describe('MediaLinkField', () => {
  it('renders linked media as thumbnails with a remove button', () => {
    render(<Harness initial={['m1']} options={opts} />);
    expect(screen.getByAltText('Vue terrasse')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Retirer la photo Vue terrasse' })).toBeInTheDocument();
  });

  it('shows the empty hint when nothing is linked', () => {
    render(<Harness initial={[]} options={opts} />);
    expect(screen.getByText('Aucune photo rattachée à ce test.')).toBeInTheDocument();
  });

  it('links an available object photo', () => {
    render(<Harness initial={[]} options={opts} />);
    fireEvent.click(screen.getByRole('button', { name: 'Lier une photo' }));
    fireEvent.click(screen.getByRole('button', { name: 'Lier la photo Salle de bain' }));
    expect(screen.getByLabelText('ids')).toHaveTextContent('m2');
  });

  it('unlinks a linked photo', () => {
    render(<Harness initial={['m1', 'm2']} options={opts} />);
    fireEvent.click(screen.getByRole('button', { name: 'Retirer la photo Vue terrasse' }));
    expect(screen.getByLabelText('ids')).toHaveTextContent('m2');
    expect(screen.getByLabelText('ids')).not.toHaveTextContent('m1,');
  });

  it('guides to the Médias section when the object has no media to link', () => {
    render(<Harness initial={[]} options={[]} />);
    fireEvent.click(screen.getByRole('button', { name: 'Lier une photo' }));
    expect(screen.getByText(/Ajoutez des photos dans la/i)).toBeInTheDocument();
  });

  it('reports when every object photo is already linked', () => {
    render(<Harness initial={['m1', 'm2']} options={opts} />);
    fireEvent.click(screen.getByRole('button', { name: 'Lier une photo' }));
    expect(screen.getByText(/déjà rattachées/i)).toBeInTheDocument();
  });
});
