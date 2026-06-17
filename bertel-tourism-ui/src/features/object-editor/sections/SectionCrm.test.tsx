import { render, screen, fireEvent, renderHook } from '@testing-library/react';
import { useObjectEditorState } from '../useObjectEditorState';
import { SectionCrm } from './SectionCrm';
import { allowAll, fullModulesFixture } from './section-fixture.test-utils';

// Le tiroir CRM est testé séparément (EditorCrmDrawer/CrmEstablishmentPanel). Ici on isole §19
// (synthèse + bouton d'ouverture) : on remplace le tiroir par une doublure exposant ses props.
jest.mock('../widgets/EditorCrmDrawer', () => ({
  EditorCrmDrawer: ({ open, canWrite, objectId }: { open: boolean; canWrite: boolean; objectId: string }) =>
    open ? <div data-testid="crm-drawer">drawer:{objectId}:{String(canWrite)}</div> : null,
}));

function fixtureWithCrm() {
  const modules = fullModulesFixture();
  modules.providerFollowUp = {
    ...modules.providerFollowUp,
    interactions: [{
      id: 'i1', interactionType: 'call', subject: 'Demande de visite',
      body: 'RDV fixé au 12.', occurredAt: '2026-06-01T08:00:00Z', actorId: 'a1', actorName: 'M. Payet',
      topicCode: 'demande_de_visite', topicName: 'Demande de visite',
      sentimentCode: 'positif', sentimentName: 'Positif', ownerName: 'Marie', source: 'bertel_ui',
      interlocutorEmail: null, status: 'done', resolvedAt: null, replies: [],
    }],
    topics: [{ code: 'demande_de_visite', name: 'Demande de visite', count: 1 }],
    interactionsUnavailableReason: null,
    tasksUnavailableReason: null,
  };
  return modules;
}

describe('SectionCrm — §19 synthèse + tiroir', () => {
  it('rend les KPIs et la distribution de sujets (tooltip du KPI « Sujets distincts »)', () => {
    const { result } = renderHook(() => useObjectEditorState('o1', fixtureWithCrm()));
    render(<SectionCrm editor={result.current} permissions={allowAll} objectId="o1" />);
    expect(screen.getByText('Interactions totales')).toBeInTheDocument();
    expect(screen.getByText('Sujets distincts')).toBeInTheDocument();
    // La distribution de sujets vit désormais dans le tooltip du KPI (présente dans le DOM).
    expect(screen.getByText('Sujets abordés')).toBeInTheDocument();
    expect(screen.getByText('Demande de visite')).toBeInTheDocument();
  });

  it('le bouton « Fiche CRM » d’une carte ouvre le tiroir sur cet acteur', () => {
    const { result } = renderHook(() => useObjectEditorState('o1', fixtureWithCrm()));
    render(<SectionCrm editor={result.current} permissions={allowAll} objectId="o1" />);
    expect(screen.queryByTestId('crm-drawer')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /fiche crm/i }));
    expect(screen.getByTestId('crm-drawer')).toBeInTheDocument();
  });

  it('sans permission crm : bandeau lecture seule + raison, le tiroir s’ouvre en canWrite=false', () => {
    const { result } = renderHook(() => useObjectEditorState('o1', fixtureWithCrm()));
    const noCrm = {
      ...allowAll,
      crm: { canDirectWrite: false, canPrepareProposal: false, canSubmitProposal: false, disabledReason: 'Permission « Écrire des notes CRM » requise (administration d’équipe).' },
    };
    render(<SectionCrm editor={result.current} permissions={noCrm} objectId="o1" />);
    expect(screen.getByText(/Écrire des notes CRM/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /fiche crm/i }));
    expect(screen.getByTestId('crm-drawer')).toHaveTextContent('drawer:o1:false');
  });

  it('aucune entrée vers le tiroir (bouton « Fiche CRM ») quand objectId absent', () => {
    const { result } = renderHook(() => useObjectEditorState('o1', fixtureWithCrm()));
    render(<SectionCrm editor={result.current} permissions={allowAll} />);
    expect(screen.queryByRole('button', { name: /fiche crm/i })).not.toBeInTheDocument();
  });

  it('badge de notification sur la carte du prestataire ayant des interactions en attente', () => {
    const modules = fixtureWithCrm();
    modules.providerFollowUp = {
      ...modules.providerFollowUp,
      interactions: [
        ...modules.providerFollowUp.interactions, // a1 / status 'done' → ne compte pas
        {
          id: 'i2', interactionType: 'call', subject: 'Rappel en attente', body: null,
          occurredAt: '2026-06-10T08:00:00Z', actorId: 'a1', actorName: 'Marie Guide',
          topicCode: null, topicName: null, sentimentCode: null, sentimentName: null,
          ownerName: null, source: null, interlocutorEmail: null,
          status: 'planned', resolvedAt: null, replies: [],
        },
      ],
    };
    const { result } = renderHook(() => useObjectEditorState('o1', modules));
    render(<SectionCrm editor={result.current} permissions={allowAll} objectId="o1" />);
    expect(screen.getByLabelText(/1 interaction\(s\) en attente avec Marie Guide/i)).toBeInTheDocument();
  });

  it('affiche la raison d indisponibilité quand le module n est pas chargé', () => {
    const { result } = renderHook(() => useObjectEditorState('o1', fullModulesFixture()));
    render(<SectionCrm editor={result.current} permissions={allowAll} objectId="o1" />);
    expect(screen.getByText(/n'expose pas encore les interactions CRM/)).toBeInTheDocument();
  });
});
