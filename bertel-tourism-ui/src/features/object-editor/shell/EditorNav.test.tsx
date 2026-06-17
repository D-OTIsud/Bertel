import { render, screen, fireEvent } from '@testing-library/react';
import { EditorNav } from './EditorNav';
import { makeSections } from '../section-config';
import type { EditorToolItem } from './editor-tools';

describe('EditorNav', () => {
  it('renders every section group heading', () => {
    render(<EditorNav groups={makeSections('HEB')} activeNum="01" onSelect={() => {}} />);
    expect(screen.getByText('Identité')).toBeInTheDocument();
    expect(screen.getByText('Gestion')).toBeInTheDocument();
  });

  it('fires onSelect with the section number when an item is clicked', () => {
    const onSelect = jest.fn();
    render(<EditorNav groups={makeSections('HEB')} activeNum="01" onSelect={onSelect} />);
    fireEvent.click(screen.getByText('Médias'));
    expect(onSelect).toHaveBeenCalledWith('05');
  });
});

const TOOLS: EditorToolItem[] = [
  { key: 'versions', label: 'Versions / historique', disabled: true, disabledReason: 'Bientôt disponible' },
  { key: 'import-export', label: 'Import / export', disabled: true, disabledReason: 'Bientôt disponible' },
  { key: 'archive', label: 'Archiver', danger: true, disabled: false },
];

describe('EditorNav tools', () => {
  it('renders the Outils group with the provided tools and no Dupliquer entry', () => {
    render(<EditorNav groups={makeSections('HEB')} activeNum="01" onSelect={() => {}} tools={TOOLS} />);
    expect(screen.getByText('Outils')).toBeInTheDocument();
    expect(screen.getByText('Archiver')).toBeInTheDocument();
    expect(screen.queryByText('Dupliquer la fiche')).not.toBeInTheDocument();
  });

  it('fires onToolSelect for an enabled tool', () => {
    const onToolSelect = jest.fn();
    render(<EditorNav groups={makeSections('HEB')} activeNum="01" onSelect={() => {}} tools={TOOLS} onToolSelect={onToolSelect} />);
    fireEvent.click(screen.getByText('Archiver'));
    expect(onToolSelect).toHaveBeenCalledWith('archive');
  });

  it('does not fire onToolSelect for a disabled tool', () => {
    const onToolSelect = jest.fn();
    render(<EditorNav groups={makeSections('HEB')} activeNum="01" onSelect={() => {}} tools={TOOLS} onToolSelect={onToolSelect} />);
    fireEvent.click(screen.getByText('Versions / historique'));
    expect(onToolSelect).not.toHaveBeenCalled();
  });
});
