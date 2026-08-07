import { act, fireEvent, render, renderHook, screen } from '@testing-library/react';
import { useObjectEditorState } from '../useObjectEditorState';
import { SectionLegal } from './SectionLegal';
import { readLegalScalar } from './legal-edit';
import { allowAll, fullModulesFixture } from './section-fixture.test-utils';
import type { ObjectWorkspaceLegalModule, ObjectWorkspaceModules } from '../../../services/object-workspace-parser';

function legalModule(overrides: Partial<ObjectWorkspaceLegalModule> = {}): ObjectWorkspaceLegalModule {
  return {
    // `description` (§209) = l'aide « quand demander cette pièce », rendue en hint du sélecteur de
    // la modale. Libellés repris du catalogue ref_legal_type réel.
    typeOptions: [
      {
        id: 'id-siret', code: 'siret', label: 'SIRET',
        description: 'Identifiant établissement (14 chiffres = SIREN 9 + NIC 5).',
        category: 'business', isPublic: true, isRequired: true,
      },
      {
        id: 'id-siren', code: 'siren', label: 'SIREN',
        description: 'Identifiant entreprise (9 chiffres), dérivable des 9 premiers chiffres du SIRET.',
        category: 'business', isPublic: true, isRequired: false,
      },
      {
        id: 'id-rs', code: 'raison_sociale', label: 'Raison sociale',
        description: 'Dénomination ou raison sociale de la personne morale exploitante.',
        category: 'business', isPublic: false, isRequired: false,
      },
      {
        id: 'id-vat', code: 'vat_number', label: 'Numéro TVA',
        description: 'Numéro de TVA intracommunautaire.',
        category: 'business', isPublic: false, isRequired: false,
      },
      {
        id: 'id-tax', code: 'tourist_tax', label: 'Taxe de séjour',
        description: "Numéro d'enregistrement ou d'autorisation de collecte de la taxe de séjour.",
        category: 'accommodation', isPublic: true, isRequired: true,
      },
      {
        id: 'id-li', code: 'attestation_assurance', label: "Attestation d'assurance",
        description: "Attestation d'assurance en cours de validité couvrant l'activité : responsabilité civile professionnelle. Renouvellement annuel.",
        category: 'insurance', isPublic: false, isRequired: false,
      },
    ],
    records: [
      {
        recordId: 'r-siret', typeId: 'id-siret', typeCode: 'siret', typeLabel: 'SIRET', category: 'business',
        isPublic: true, isRequired: true, valueJson: JSON.stringify({ value: '44851998300012' }), documentId: '',
        documentUrl: '', documentTitle: '',
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

  it('auto-fills the SIREN from the SIRET (first 9 digits) as the user types', () => {
    const { result } = renderHook(() => useObjectEditorState('o1', modulesWithLegal({ records: [] })));
    render(<SectionLegal editor={result.current} permissions={allowAll} />);

    act(() => {
      fireEvent.change(screen.getByLabelText('SIRET'), { target: { value: '44851998300012' } });
    });

    expect(readLegalScalar(result.current.draft.legal.records, 'siret')).toBe('44851998300012');
    expect(readLegalScalar(result.current.draft.legal.records, 'siren')).toBe('448519983');
  });

  it('shows and saves the tourist-tax number for accommodation objects only', () => {
    const { result } = renderHook(() => useObjectEditorState('o1', modulesWithLegal({ records: [] })));
    const view = render(<SectionLegal editor={result.current} permissions={allowAll} archetype="HEB" />);

    act(() => {
      fireEvent.change(screen.getByLabelText('N° de taxe de séjour'), { target: { value: 'TAX-RUN-2026-42' } });
    });
    expect(readLegalScalar(result.current.draft.legal.records, 'tourist_tax')).toBe('TAX-RUN-2026-42');

    view.rerender(<SectionLegal editor={result.current} permissions={allowAll} archetype="RES" />);
    expect(screen.queryByLabelText('N° de taxe de séjour')).toBeNull();
  });

  it('adds a legal document via the modal ("Ajouter un document" → "Enregistrer")', () => {
    const { result } = renderHook(() => useObjectEditorState('o1', modulesWithLegal()));
    render(<SectionLegal editor={result.current} permissions={allowAll} />);

    const documentsBefore = result.current.draft.legal.records.filter((record) => record.typeCode === 'attestation_assurance');
    expect(documentsBefore).toHaveLength(0);

    // Opening the modal must NOT mutate state — only saving commits the row.
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: /Ajouter un document/ }));
    });
    expect(result.current.draft.legal.records.filter((r) => r.typeCode === 'attestation_assurance')).toHaveLength(0);
    expect(screen.getByLabelText('Type de document')).toBeInTheDocument();
    // La section passe bien les options COMPLÈTES à la modale : l'aide §209 du type présélectionné
    // est rendue (sans elle, le catalogue arriverait amputé de sa description).
    expect(screen.getByText(/responsabilité civile professionnelle/)).toBeInTheDocument();

    act(() => {
      fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));
    });

    const documentsAfter = result.current.draft.legal.records.filter((record) => !['siret', 'siren', 'raison_sociale', 'vat_number'].includes(record.typeCode));
    expect(documentsAfter).toHaveLength(1);
    expect(documentsAfter[0].typeCode).toBe('attestation_assurance');
    expect(documentsAfter[0].validityMode).toBe('forever');
  });

  it('shows an "Obligatoire" chip and an expiry flag, and raises the §18 alert pill for an expired mandatory document', () => {
    const expiredInsurance: ObjectWorkspaceLegalModule['records'][number] = {
      recordId: 'r-li', typeId: 'id-li', typeCode: 'attestation_assurance', typeLabel: "Attestation d'assurance", category: 'insurance',
      isPublic: false, isRequired: true, valueJson: JSON.stringify({ value: 'POL-1' }), documentId: '',
      documentUrl: '', documentTitle: '', validFrom: '2024-01-01', validTo: '2000-01-01', validityMode: 'fixed_end_date',
      status: 'active', documentRequestedAt: '', documentDeliveredAt: '', note: '', daysUntilExpiry: '',
    };
    const { result } = renderHook(() => useObjectEditorState('o1', modulesWithLegal()));
    act(() => {
      result.current.replaceModule('legal', { ...result.current.draft.legal, records: [...result.current.draft.legal.records, expiredInsurance] });
    });
    render(<SectionLegal editor={result.current} permissions={allowAll} />);

    expect(screen.getByText("Attestation d'assurance")).toBeInTheDocument();
    expect(screen.getByText('Obligatoire')).toBeInTheDocument();
    expect(screen.getByText('Expiré')).toBeInTheDocument();
    expect(screen.getByText('Document obligatoire expiré')).toBeInTheDocument();
  });

  it('opens the edit modal on a document row and commits changes via "Enregistrer"', () => {
    const insurance: ObjectWorkspaceLegalModule['records'][number] = {
      recordId: 'r-li', typeId: 'id-li', typeCode: 'attestation_assurance', typeLabel: "Attestation d'assurance", category: 'insurance',
      isPublic: false, isRequired: true, valueJson: '', documentId: '', documentUrl: '', documentTitle: '',
      validFrom: '', validTo: '', validityMode: 'forever', status: 'active', documentRequestedAt: '',
      documentDeliveredAt: '', note: '', daysUntilExpiry: '',
    };
    const { result } = renderHook(() => useObjectEditorState('o1', modulesWithLegal()));
    act(() => {
      result.current.replaceModule('legal', { ...result.current.draft.legal, records: [...result.current.draft.legal.records, insurance] });
    });
    render(<SectionLegal editor={result.current} permissions={allowAll} />);

    act(() => {
      fireEvent.click(screen.getByRole('button', { name: /Modifier le document/ }));
    });
    act(() => {
      fireEvent.change(screen.getByLabelText('Référence du document'), { target: { value: 'POL-2026-99' } });
    });
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));
    });

    const saved = result.current.draft.legal.records.find((r) => r.typeCode === 'attestation_assurance');
    expect(saved?.valueJson).toBe(JSON.stringify({ value: 'POL-2026-99' }));
  });

  it('is read-only (no SIRET input) when the legal module is unavailable', () => {
    const { result } = renderHook(() => useObjectEditorState('o1', modulesWithLegal({ unavailableReason: 'Indisponible pour ce profil.' })));
    render(<SectionLegal editor={result.current} permissions={allowAll} />);

    expect(screen.getByText(/Lecture seule/)).toBeInTheDocument();
    expect(screen.queryByLabelText('SIRET')).toBeNull();
    expect(screen.getByText('44851998300012')).toBeInTheDocument();
  });
});
