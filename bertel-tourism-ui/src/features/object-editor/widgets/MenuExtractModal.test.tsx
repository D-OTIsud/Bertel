import { StrictMode } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MenuExtractModal } from './MenuExtractModal';
import type { ObjectWorkspaceMenu, ObjectWorkspaceMenuItem } from '../../../services/object-workspace-parser';

jest.mock('../../../services/document-upload', () => ({
  uploadDocument: jest.fn(async () => ({ documentId: 'doc1', url: 'http://x/doc1.jpg', title: 'menu' })),
}));
jest.mock('../../../services/object-cartes', () => ({ linkObjectCarte: jest.fn(async () => undefined) }));
jest.mock('../../../services/menu-extract', () => {
  const actual = jest.requireActual('../../../services/menu-extract');
  return { ...actual, extractMenuFromImages: jest.fn(), readFileAsBase64: jest.fn(async () => ({ mime: 'image/jpeg', base64: 'XXXX' })) };
});
jest.mock('../../../lib/pdf-rasterize', () => ({
  rasterizePdfToImages: jest.fn(async () => [{ mime: 'image/jpeg', base64: 'PG1' }, { mime: 'image/jpeg', base64: 'PG2' }]),
}));
jest.mock('../../../hooks/useServiceAvailability', () => ({ useServiceAvailability: jest.fn(() => ({ translation: true, imageAnalysis: true, email: true })) }));
jest.mock('../../../services/service-availability', () => ({ getServiceAvailability: jest.fn(async () => ({ translation: true, imageAnalysis: true, email: true })) }));

import { extractMenuFromImages, readFileAsBase64 } from '../../../services/menu-extract';
import { rasterizePdfToImages } from '../../../lib/pdf-rasterize';
import { uploadDocument } from '../../../services/document-upload';

function dish(name: string, over: Partial<ObjectWorkspaceMenuItem> = {}): ObjectWorkspaceMenuItem {
  return {
    recordId: null, name, description: '', price: '', currency: '',
    kindId: '', kindCode: '', kindLabel: '', unitId: '', unitCode: '', unitLabel: '',
    mediaIds: [], available: true, position: '1',
    dietaryTagCodes: [], allergenCodes: [], cuisineTypeCodes: [],
    sectionCode: '', sectionId: '', sectionLabel: '', ...over,
  };
}
const MENU: ObjectWorkspaceMenu = {
  recordId: null, categoryId: '', categoryCode: '', categoryLabel: '',
  name: 'Carte de la semaine', description: '', active: true, visibility: 'public', position: '1',
  items: [dish('Cari poulet', { price: '12 €', sectionLabel: 'Plats' })],
};

const SECTIONS = [{ id: 's1', code: 'main', label: 'Plats' }];
const DIETARY = [{ id: 'd1', code: 'vegetarian', label: 'Végétarien' }];

function setup(onInject = jest.fn()) {
  render(
    <MenuExtractModal
      open
      objectId="RESRUN0000000001AB"
      accessToken="tok"
      allowedSections={SECTIONS}
      allowedDietary={DIETARY}
      onClose={jest.fn()}
      onInject={onInject}
    />,
  );
  return { onInject };
}

function addImage() {
  const input = screen.getByLabelText('Ajouter des fichiers de carte');
  const file = new File(['data'], 'menu.jpg', { type: 'image/jpeg' });
  fireEvent.change(input, { target: { files: [file] } });
}

function addPdf() {
  const input = screen.getByLabelText('Ajouter des fichiers de carte');
  const file = new File(['%PDF-1.4'], 'menu.pdf', { type: 'application/pdf' });
  fireEvent.change(input, { target: { files: [file] } });
}

describe('MenuExtractModal', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    const { useServiceAvailability } = jest.requireMock('../../../hooks/useServiceAvailability') as { useServiceAvailability: jest.Mock };
    const { getServiceAvailability } = jest.requireMock('../../../services/service-availability') as { getServiceAvailability: jest.Mock };
    useServiceAvailability.mockReturnValue({ translation: true, imageAnalysis: true, email: true });
    getServiceAvailability.mockResolvedValue({ translation: true, imageAnalysis: true, email: true });
  });

  it('keeps "Analyser" disabled until an image is ready AND the completeness box is checked', async () => {
    setup();
    const analyser = screen.getByRole('button', { name: /Analyser et créer un menu/ });
    expect(analyser).toBeDisabled();

    addImage();
    expect(await screen.findByText(/menu\.jpg/)).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText(/· prête/)).toBeInTheDocument());
    // still gated: completeness not confirmed yet
    expect(screen.getByRole('button', { name: /Analyser et créer un menu/ })).toBeDisabled();

    fireEvent.click(screen.getByRole('checkbox'));
    expect(screen.getByRole('button', { name: /Analyser et créer un menu/ })).toBeEnabled();
  });

  it('analyzes, previews the extracted dishes, and injects only the dietary the human accepts', async () => {
    (extractMenuFromImages as jest.Mock).mockResolvedValue({ menu: MENU, suggestedDietaryByDish: [['vegetarian']], truncated: false });
    const { onInject } = setup();

    addImage();
    await waitFor(() => expect(screen.getByText(/· prête/)).toBeInTheDocument());
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(screen.getByRole('button', { name: /Analyser et créer un menu/ }));

    // preview
    expect(await screen.findByText('Cari poulet')).toBeInTheDocument();
    expect(extractMenuFromImages).toHaveBeenCalledTimes(1);

    // the inject button is gated until preview, now enabled
    const inject = screen.getByRole('button', { name: /Ajouter ce menu au brouillon/ });
    expect(inject).toBeEnabled();

    // accept the suggested dietary, then inject
    fireEvent.click(screen.getByRole('button', { name: /Végétarien/ }));
    fireEvent.click(inject);

    expect(onInject).toHaveBeenCalledTimes(1);
    const injected = (onInject as jest.Mock).mock.calls[0][0] as ObjectWorkspaceMenu;
    expect(injected.items[0].dietaryTagCodes).toEqual(['vegetarian']);
    expect(injected.items[0].allergenCodes).toEqual([]);
  });

  it('rasterizes a PDF client-side so it becomes analyzable (page images are sent)', async () => {
    (extractMenuFromImages as jest.Mock).mockResolvedValue({ menu: MENU, suggestedDietaryByDish: [[]], truncated: false });
    setup();
    addPdf();
    expect(await screen.findByText(/menu\.pdf/)).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText(/2 page\(s\)/)).toBeInTheDocument());

    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(screen.getByRole('button', { name: /Analyser et créer un menu/ }));

    expect(await screen.findByText('Cari poulet')).toBeInTheDocument();
    const call = (extractMenuFromImages as jest.Mock).mock.calls[0][0];
    expect(call.images).toHaveLength(2);
    expect(call.images[0].base64).toBe('PG1');
  });

  it('surfaces a provider error without leaving the analyzing state stuck', async () => {
    (extractMenuFromImages as jest.Mock).mockRejectedValue(new Error('aucun fournisseur IA actif'));
    setup();
    addImage();
    await waitFor(() => expect(screen.getByText(/· prête/)).toBeInTheDocument());
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(screen.getByRole('button', { name: /Analyser et créer un menu/ }));

    expect(await screen.findByText(/aucun fournisseur IA actif/)).toBeInTheDocument();
    // back to a usable state
    expect(screen.getByRole('button', { name: /Analyser et créer un menu/ })).toBeEnabled();
  });

  it('starts only one extraction when the action is double-clicked before availability resolves', async () => {
    (extractMenuFromImages as jest.Mock).mockResolvedValue({ menu: MENU, suggestedDietaryByDish: [[]], truncated: false });
    setup();
    addImage();
    await waitFor(() => expect(screen.getByText(/· prête/)).toBeInTheDocument());
    fireEvent.click(screen.getByRole('checkbox'));
    const analyze = screen.getByRole('button', { name: /Analyser et créer un menu/ });
    fireEvent.click(analyze);
    fireEvent.click(analyze);
    await waitFor(() => expect(extractMenuFromImages).toHaveBeenCalledTimes(1));
  });

  it('keeps ordinary uploads but hides analysis and does not prepare image bytes when unavailable', async () => {
    const { useServiceAvailability } = jest.requireMock('../../../hooks/useServiceAvailability') as { useServiceAvailability: jest.Mock };
    const { getServiceAvailability } = jest.requireMock('../../../services/service-availability') as { getServiceAvailability: jest.Mock };
    useServiceAvailability.mockReturnValue({ translation: false, imageAnalysis: false, email: false });
    getServiceAvailability.mockResolvedValue({ translation: false, imageAnalysis: false, email: false });
    setup();
    addPdf();
    expect(screen.queryByRole('button', { name: /Analyser et créer un menu/ })).not.toBeInTheDocument();
    expect(screen.queryByText(/tous analysés par l'IA/i)).not.toBeInTheDocument();
    await waitFor(() => expect(screen.getByText(/menu\.pdf/)).toBeInTheDocument());
    await waitFor(() => expect(screen.getByText(/· carte/)).toBeInTheDocument());
    expect(rasterizePdfToImages).not.toHaveBeenCalled();
    expect(readFileAsBase64).not.toHaveBeenCalled();
    expect(extractMenuFromImages).not.toHaveBeenCalled();
  });

  it('marks a linked upload ready in StrictMode when analysis is disabled while it is uploading', async () => {
    let finishUpload!: (value: { documentId: string; url: string; title: string }) => void;
    (uploadDocument as jest.Mock).mockImplementationOnce(() => new Promise((resolve) => { finishUpload = resolve; }));
    const { useServiceAvailability } = jest.requireMock('../../../hooks/useServiceAvailability') as { useServiceAvailability: jest.Mock };
    const { getServiceAvailability } = jest.requireMock('../../../services/service-availability') as { getServiceAvailability: jest.Mock };
    const modal = () => <MenuExtractModal open objectId="RESRUN0000000001AB" accessToken="tok" allowedSections={SECTIONS} allowedDietary={DIETARY} onClose={jest.fn()} onInject={jest.fn()} />;
    const view = render(<StrictMode>{modal()}</StrictMode>);
    addPdf();
    expect(screen.getByText(/envoi/)).toBeInTheDocument();
    useServiceAvailability.mockReturnValue({ translation: false, imageAnalysis: false, email: false });
    getServiceAvailability.mockResolvedValue({ translation: false, imageAnalysis: false, email: false });
    view.rerender(<StrictMode>{modal()}</StrictMode>);
    finishUpload({ documentId: 'doc1', url: 'http://x/doc1.pdf', title: 'menu' });
    await waitFor(() => expect(screen.getByText(/· carte/)).toBeInTheDocument());
    expect(rasterizePdfToImages).not.toHaveBeenCalled();
  });
});
