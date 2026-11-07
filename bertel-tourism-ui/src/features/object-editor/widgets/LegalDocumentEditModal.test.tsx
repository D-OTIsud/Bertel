import { act, fireEvent, render, screen } from '@testing-library/react';
import { LegalDocumentEditModal } from './LegalDocumentEditModal';
import { buildNewDocumentRecord } from '../sections/legal-edit';
import type { ObjectWorkspaceLegalTypeOption } from '../../../services/object-workspace-parser';
import { getObjectDocumentUrl } from '../../../services/object-documents';
import { useSessionStore } from '../../../store/session-store';
jest.mock('../../../services/object-documents', () => ({ getObjectDocumentUrl: jest.fn() }));

/**
 * §209 — le catalogue `ref_legal_type` a été refait sur les pièces réellement demandées aux
 * prestataires. Ce que ces tests gardent :
 *  - l'aide « quand demander cette pièce » (ref_legal_type.description) est bien RENDUE et suit le
 *    type sélectionné ; sans elle l'agent doit deviner entre KBIS, extrait INPI et avis SIRENE ;
 *  - la case « Obligatoire », retirée parce qu'aucun document ne l'est plus, n'est pas réintroduite.
 */

const TYPE_OPTIONS: ObjectWorkspaceLegalTypeOption[] = [
  {
    id: 't-kbis',
    code: 'kbis',
    label: 'Extrait KBIS',
    description: 'Extrait d’immatriculation au RCS. Demandé de moins de 3 mois.',
    category: 'business',
    isPublic: false,
    isRequired: false,
  },
  {
    id: 't-statuts',
    code: 'statuts_association',
    label: "Statuts d'association",
    description: "Pièce d'existence des exploitants associatifs, en lieu et place du KBIS.",
    category: 'business',
    isPublic: false,
    isRequired: false,
  },
];

function renderModal() {
  const onSave = jest.fn();
  render(
    <LegalDocumentEditModal
      open
      mode="add"
      draft={buildNewDocumentRecord(TYPE_OPTIONS[0])}
      typeOptions={TYPE_OPTIONS}
      objectId="HLORUN0000000001"
      onClose={() => {}}
      onSave={onSave}
    />,
  );
  return { onSave };
}

describe('LegalDocumentEditModal', () => {
  it('keeps the dedicated legal reader for an attached private document without a canonical capability', async () => {
    useSessionStore.setState({ canEditObjects: false, userId: 'synthetic-legal-only', status: 'ready' });
    const target = { opener: null, closed: false, close: jest.fn(), location: { replace: jest.fn() } };
    const open = jest.spyOn(window, 'open').mockReturnValue(target as never);
    jest.mocked(getObjectDocumentUrl).mockResolvedValueOnce('https://example.invalid/signed?token=synthetic');
    try {
      const draft = { ...buildNewDocumentRecord(TYPE_OPTIONS[0]), documentId: 'synthetic-document', documentUrl: 'private:synthetic-document', documentTitle: 'Synthetic legal attachment' };
      render(<LegalDocumentEditModal open mode="edit" draft={draft} typeOptions={TYPE_OPTIONS} objectId="HLORUN0000000001" onClose={() => {}} onSave={jest.fn()} />);
      await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Synthetic legal attachment' })); });
      expect(getObjectDocumentUrl).toHaveBeenCalledWith('HLORUN0000000001', 'synthetic-document', expect.any(AbortSignal), 'legal');
      expect(target.location.replace).toHaveBeenCalled();
    } finally { open.mockRestore(); }
  });
  it('propose les types du catalogue juridique', () => {
    renderModal();
    expect(screen.getByRole('button', { name: 'Extrait KBIS' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: "Statuts d'association" })).toBeInTheDocument();
  });

  it('rend accessible la description du type sélectionné — « quand demander cette pièce »', () => {
    renderModal();
    expect(screen.getByRole('button', { name: 'Aide : Type de document' }))
      .toHaveAccessibleDescription(TYPE_OPTIONS[0].description);
  });

  it('remplace cette aide quand on change de type', () => {
    renderModal();
    fireEvent.click(screen.getByRole('button', { name: "Statuts d'association" }));
    expect(screen.getByRole('button', { name: 'Aide : Type de document' }))
      .toHaveAccessibleDescription(TYPE_OPTIONS[1].description);
    expect(screen.queryByText(/Demandé de moins de 3 mois/)).not.toBeInTheDocument();
  });

  it("n'affiche plus de case « Obligatoire » — aucun document ne l'est depuis §209", () => {
    renderModal();
    expect(screen.queryByLabelText(/Document obligatoire/i)).not.toBeInTheDocument();
  });
});
