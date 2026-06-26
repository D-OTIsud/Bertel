import { render, screen, fireEvent } from '@testing-library/react';
import type { ReactNode } from 'react';
import { StageEditModal } from './StageEditModal';
import type { ObjectWorkspaceItineraryStageSummary, WorkspaceMediaOption } from '../../../services/object-workspace-parser';

// react-map-gl/maplibre needs WebGL (absent in jsdom) — stub the stage map.
jest.mock('react-map-gl/maplibre', () => ({
  Map: ({ children }: { children?: ReactNode }) => <div data-testid="stage-map">{children}</div>,
  Source: ({ children }: { children?: ReactNode }) => <>{children}</>,
  Layer: () => null,
  Marker: ({ children }: { children?: ReactNode }) => <div data-testid="stage-marker">{children}</div>,
  NavigationControl: () => null,
}));

// MarkdownCellField opens a lazy TipTap modal on click — not exercised here; stub to a textarea.
jest.mock('../../../components/markdown/MarkdownCellField', () => ({
  MarkdownCellField: ({ value, onChange, ariaLabel }: { value: string; onChange: (v: string) => void; ariaLabel: string }) => (
    <textarea aria-label={ariaLabel} value={value} onChange={(e) => onChange(e.target.value)} />
  ),
}));

const stage = (over: Partial<ObjectWorkspaceItineraryStageSummary> = {}): ObjectWorkspaceItineraryStageSummary => ({
  recordId: 'st1', name: 'Belvédère', description: '', position: '1', kind: 'panorama', lng: '', lat: '', mediaIds: [], ...over,
});

const mediaOptions: WorkspaceMediaOption[] = [
  { id: 'med-1', code: 'med-1', label: 'Vue du belvédère', url: 'https://cdn/iti-1.jpg' },
  { id: 'med-2', code: 'med-2', label: 'Sentier en forêt', url: 'https://cdn/iti-2.jpg' },
];

const kindOptions = [{ id: 'panorama', code: 'panorama', label: 'Panorama' }];

function renderModal(props: Partial<Parameters<typeof StageEditModal>[0]> = {}) {
  const onSave = jest.fn();
  render(
    <StageEditModal
      open
      stage={props.stage ?? stage()}
      stageKindOptions={kindOptions}
      mediaOptions={props.mediaOptions ?? mediaOptions}
      trackGeojson={null}
      onSave={onSave}
      onClose={() => {}}
    />,
  );
  return { onSave };
}

describe('StageEditModal — stage photos (§111 closeout)', () => {
  it('renders linked stage photos as thumbnails with a remove button and count', () => {
    renderModal({ stage: stage({ mediaIds: ['med-1'] }) });
    expect(screen.getByAltText('Vue du belvédère')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Retirer la photo Vue du belvédère' })).toBeInTheDocument();
    expect(screen.getByText('Photos & médias (1)')).toBeInTheDocument();
  });

  it('shows the stage-specific empty hint when nothing is linked', () => {
    renderModal({ stage: stage({ mediaIds: [] }) });
    expect(screen.getByText('Aucune photo rattachée à cette étape.')).toBeInTheDocument();
  });

  it('links an existing object photo and returns it on save', () => {
    const { onSave } = renderModal({ stage: stage({ mediaIds: [] }) });
    fireEvent.click(screen.getByRole('button', { name: 'Lier une photo' }));
    fireEvent.click(screen.getByRole('button', { name: 'Lier la photo Sentier en forêt' }));
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));
    expect((onSave.mock.calls[0][0] as ObjectWorkspaceItineraryStageSummary).mediaIds).toEqual(['med-2']);
  });

  it('unlinks a linked photo and returns the remainder on save', () => {
    const { onSave } = renderModal({ stage: stage({ mediaIds: ['med-1', 'med-2'] }) });
    fireEvent.click(screen.getByRole('button', { name: 'Retirer la photo Vue du belvédère' }));
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));
    expect((onSave.mock.calls[0][0] as ObjectWorkspaceItineraryStageSummary).mediaIds).toEqual(['med-2']);
  });

  it('guides to the Médias section when the object has no media to link', () => {
    renderModal({ stage: stage({ mediaIds: [] }), mediaOptions: [] });
    fireEvent.click(screen.getByRole('button', { name: 'Lier une photo' }));
    expect(screen.getByText(/Ajoutez des photos dans la/i)).toBeInTheDocument();
  });
});
