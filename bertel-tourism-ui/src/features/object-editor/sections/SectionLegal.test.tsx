import { act, fireEvent, render, renderHook, screen } from '@testing-library/react';
import { useObjectEditorState } from '../useObjectEditorState';
import { SectionLegal } from './SectionLegal';
import { readLegalScalar } from './legal-edit';
import { allowAll, fullModulesFixture } from './section-fixture.test-utils';
import type { ObjectWorkspaceLegalModule, ObjectWorkspaceModules } from '../../../services/object-workspace-parser';

function legalModule(overrides: Partial<ObjectWorkspaceLegalModule> = {}): ObjectWorkspaceLegalModule {
  return {
    typeOptions: [
      { id: 'id-siret', code: 'siret', label: 'SIRET', category: 'business', isPublic: true, isRequired: true },
      { id: 'id-siren', code: 'siren', label: 'SIREN', category: 'business', isPublic: true, isRequired: false },
      { id: 'id-rs', code: 'raison_sociale', label: 'Raison sociale', category: 'business', isPublic: false, isRequired: false },
      { id: 'id-vat', code: 'vat_number', label: 'Numéro TVA', category: 'business', isPublic: false, isRequired: false },
      { id: 'id-li', code: 'liability_insurance', label: 'Assurance RC', category: 'insurance', isPublic: false, isRequired: true },
    ],
    records: [
      {
        recordId: 'r-siret', typeId: 'id-siret', typeCode: 'siret', typeLabel: 'SIRET', category: 'business',
        isPublic: true, isRequired: true, valueJson: JSON.stringify({ value: '44851998300012' }), documentId: '',
        validFrom: '', validTo: '', validityMode: 'forever', status: 'active', documentRequestedAt: '',
        documentDeliveredAt: '', note: '', daysUntilExpiry: '',
      },
    ],
    compliance: { complianceStatus: 'unknown', requiredCount: 0, validCount: 0, expiringCount: 0, missingCount: 0, compliancePercentage: 0, details: [] },
    unavailableReason: null,
    ...overrides,
  };
}

function modulesWithLegal(overrides: Partial<ObjectWorkspaceLegalModule> = {}): ObjectWorkspaceModules {
  return { ...fullModulesFixture(), legal: legalModule(overrides) };
}

describe('SectionLegal', () => {
  it('renders the Juridique heading and the editable SIRET from object_legal', () => {
    const { result } = renderHook(() => useObjectEditorState('o1', modulesWithLegal()));
    render(<SectionLegal editor={result.current} permissions={allowAll} />);

    expect(screen.getByText('Juridique')).toBeInTheDocument();
    expect(screen.getByLabelText('SIRET')).toHaveValue('44851998300012');
  });

  it('keeps only digits (max 14) when editing the SIRET', () => {
    const { result } = renderHook(() => useObjectEditorState('o1', modulesWithLegal({ records: [] })));
    render(<SectionLegal editor={result.current} permissions={allowAll} />);

    act(() => {
      fireEvent.change(screen.getByLabelText('SIRET'), { target: { value: 'AB 123-456-789-000-12-99' } });
    });

    expect(readLegalScalar(result.current.draft.legal.records, 'siret')).toBe('12345678900012');
  });

  it('adds a legal document row via "Ajouter un document"', () => {
    const { result } = renderHook(() => useObjectEditorState('o1', modulesWithLegal()));
    render(<SectionLegal editor={result.current} permissions={allowAll} />);

    const documentsBefore = result.current.draft.legal.records.filter((record) => record.typeCode === 'liability_insurance');
    expect(documentsBefore).toHaveLength(0);

    act(() => {
      fireEvent.click(screen.getByRole('button', { name: /Ajouter un document/ }));
    });

    const documentsAfter = result.current.draft.legal.records.filter((record) => !['siret', 'siren', 'raison_sociale', 'vat_number'].includes(record.typeCode));
    expect(documentsAfter).toHaveLength(1);
    expect(documentsAfter[0].validityMode).toBe('forever');
  });

  it('is read-only (no SIRET input) when the legal module is unavailable', () => {
    const { result } = renderHook(() => useObjectEditorState('o1', modulesWithLegal({ unavailableReason: 'Indisponible pour ce profil.' })));
    render(<SectionLegal editor={result.current} permissions={allowAll} />);

    expect(screen.getByText(/Lecture seule/)).toBeInTheDocument();
    expect(screen.queryByLabelText('SIRET')).toBeNull();
    expect(screen.getByText('44851998300012')).toBeInTheDocument();
  });
});
