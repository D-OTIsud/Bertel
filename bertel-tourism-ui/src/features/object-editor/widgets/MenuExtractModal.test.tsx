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

import { extractMenuFromImages } from '../../../services/menu-extract';

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

describe('MenuExtractModal', () => {
  beforeEach(() => jest.clearAllMocks());

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
});
