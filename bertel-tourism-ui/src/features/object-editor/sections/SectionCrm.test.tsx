import { render, screen, renderHook, fireEvent } from '@testing-library/react';
import { useObjectEditorState } from '../useObjectEditorState';
import { SectionCrm } from './SectionCrm';
import { allowAll, fullModulesFixture } from './section-fixture.test-utils';
import { listDemandTopics } from '../../../services/crm';

// Mock partiel : seules les fonctions réseau dont les specs contrôlent la valeur sont
// remplacées ; les parsers et les autres services restent réels (non invoqués au render).
jest.mock('../../../services/crm', () => ({
  ...jest.requireActual<typeof import('../../../services/crm')>('../../../services/crm'),
  listDemandTopics: jest.fn().mockResolvedValue([]),
}));

const listDemandTopicsMock = listDemandTopics as jest.MockedFunction<typeof listDemandTopics>;

/**
 * §19 CRM (Tâche 11) — le journal et la distribution des sujets viennent des
 * interactions réelles (api.list_object_crm via l'enrichissement workspace),
 * plus aucune liste mockée ni faux contrôle. L'authoring est gated par la
 * permission PAR OBJET `permissions.crm` (api.user_can_write_crm).
 */
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

describe('SectionCrm — §19 données réelles', () => {
  it('rend le journal depuis les interactions réelles (sujet + sentiment résolus)', () => {
    const { result } = renderHook(() => useObjectEditorState('o1', fixtureWithCrm()));
    render(<SectionCrm editor={result.current} permissions={allowAll} objectId="o1" />);
    expect(screen.getByText('Demande de visite — 1')).toBeInTheDocument(); // chip distribution réelle
    expect(screen.getByText(/RDV fixé au 12/)).toBeInTheDocument();
    expect(screen.getByText('Positif')).toBeInTheDocument();
  });

  it('désactive l authoring avec raison sans permission crm (no-write-trap)', () => {
    const { result } = renderHook(() => useObjectEditorState('o1', fixtureWithCrm()));
    const noCrm = {
      ...allowAll,
      crm: { canDirectWrite: false, canPrepareProposal: false, canSubmitProposal: false, disabledReason: 'Permission « Écrire des notes CRM » requise (administration d’équipe).' },
    };
    render(<SectionCrm editor={result.current} permissions={noCrm} objectId="o1" />);
    expect(screen.getByRole('button', { name: /nouvelle interaction/i })).toBeDisabled();
    expect(screen.getByText(/Écrire des notes CRM/)).toBeInTheDocument();
  });

  it('affiche la raison d indisponibilité quand le module n est pas chargé', () => {
    const { result } = renderHook(() => useObjectEditorState('o1', fullModulesFixture()));
    render(<SectionCrm editor={result.current} permissions={allowAll} objectId="o1" />);
    expect(screen.getByText(/n'expose pas encore les interactions CRM/)).toBeInTheDocument();
  });

  // Fix cold-start : le select « Sujet » du formulaire doit proposer le vocabulaire
  // complet demand_topic (listDemandTopics), pas seulement la distribution de l'objet —
  // sinon la PREMIÈRE interaction d'un objet ne peut jamais porter de sujet.
  it('propose le vocabulaire complet des sujets dans le formulaire (pas seulement la distribution de l objet)', async () => {
    listDemandTopicsMock.mockResolvedValue([
      { code: 'boutique', name: 'Boutique' },
      { code: 'demande_de_visite', name: 'Demande de visite' },
    ]);
    const { result } = renderHook(() => useObjectEditorState('o1', fixtureWithCrm()));
    render(<SectionCrm editor={result.current} permissions={allowAll} objectId="o1" />);
    fireEvent.click(screen.getByRole('button', { name: /nouvelle interaction/i }));
    expect(await screen.findByRole('option', { name: /Boutique/ })).toBeInTheDocument();
  });

  it('ne rend plus la liste de sujets mockée ni le faux select humeur', () => {
    const { result } = renderHook(() => useObjectEditorState('o1', fixtureWithCrm()));
    render(<SectionCrm editor={result.current} permissions={allowAll} objectId="o1" />);
    expect(screen.queryByText('Renouvellement adhésion')).not.toBeInTheDocument(); // ex-mock CRM_TOPICS
    expect(screen.queryByDisplayValue('neutre')).not.toBeInTheDocument(); // ex-fake Select
  });
});
