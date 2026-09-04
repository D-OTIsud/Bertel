// Garde du réglage « Portail acteurs » (Task 19) — la matrice de visibilité par type de fiche.
//
// L'écran est lu par un AGENT D'OFFICE : vocabulaire métier légitime. Ce qu'il décide, en
// revanche, atterrit chez le partenaire — une rubrique fermée disparaît de son écran.
//
// Deux propriétés valent d'être verrouillées :
//  1. la liste des interrupteurs suit l'ARCHÉTYPE du type choisi (un gîte n'a pas d'horaires
//     d'ouverture à la journée, un restaurant n'a pas de calendrier saisonnier) ;
//  2. le PLANCHER DUR ne se ferme ni ne s'ouvre : le serveur le refuse en 22023, donc l'écran
//     ne doit pas proposer le geste. Un interrupteur actif sur un module du plancher, c'est
//     une erreur promise à chaque clic.
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ActorSectionVisibilityForm } from './ActorSectionVisibilityForm';
import * as service from '../../services/actor-visibility';
import { OBJECT_TYPE_CODES } from '../../lib/object-types';

// Seuls les DEUX appels réseau sont doublés. `actorVisibilityKeys` reste la VRAIE fabrique
// de clés : automockée, elle rendrait `undefined` pour tous les types, la query ne serait
// plus jamais re-tirée au changement de type… et le test « re-lue quand il change » serait
// vert par accident, en observant une seule et même clé.
jest.mock('../../services/actor-visibility', () => ({
  ...jest.requireActual('../../services/actor-visibility'),
  getActorSectionVisibility: jest.fn(),
  setActorSectionVisibility: jest.fn(),
}));

const mocked = service as jest.Mocked<typeof service>;

// Le plancher RÉEL de `api.actor_portal_floor_modules()` (migration_actor_portal.sql:299-305).
const FLOOR = [
  'legal', 'provider-follow-up', 'publication', 'sync-identifiers',
  'distribution', 'provider', 'relationships', 'places', 'media',
];

function renderForm() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const invalidate = jest.spyOn(client, 'invalidateQueries');
  render(
    <QueryClientProvider client={client}>
      <ActorSectionVisibilityForm orgId="ORG1" />
    </QueryClientProvider>,
  );
  return { invalidate };
}

beforeEach(() => {
  jest.clearAllMocks();
  mocked.getActorSectionVisibility.mockResolvedValue({ floorModules: FLOOR, maskedModules: [] });
  mocked.setActorSectionVisibility.mockResolvedValue(undefined);
});

describe('les rubriques listées suivent le type de fiche', () => {
  it('type hébergement : les rubriques d’un gîte, et PAS celles des autres archétypes', async () => {
    renderForm();
    expect(await screen.findByRole('checkbox', { name: /Vos coordonnées/ })).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: /Ouverture et fermetures/ })).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: /Capacité et animaux/ })).toBeInTheDocument();
    // « Vos horaires » est explicitement EXCLU de HEB par le registre ; « Votre activité »
    // n'appartient qu'à ASC. Les proposer ici ferait régler une rubrique que le partenaire
    // ne verra jamais.
    expect(screen.queryByRole('checkbox', { name: /Vos horaires/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('checkbox', { name: /Votre activité/ })).not.toBeInTheDocument();
  });

  it('la matrice est lue POUR le type affiché, et re-lue quand il change', async () => {
    renderForm();
    await screen.findByRole('checkbox', { name: /Vos coordonnées/ });
    expect(mocked.getActorSectionVisibility).toHaveBeenCalledWith('ORG1', 'HLO');

    fireEvent.change(screen.getByLabelText('Type de fiche'), { target: { value: 'RES' } });
    await waitFor(() => expect(mocked.getActorSectionVisibility).toHaveBeenCalledWith('ORG1', 'RES'));
    // Restaurant ⇒ archétype RES : les horaires apparaissent, le calendrier saisonnier part.
    expect(await screen.findByRole('checkbox', { name: /Vos horaires/ })).toBeInTheDocument();
    expect(screen.queryByRole('checkbox', { name: /Ouverture et fermetures/ })).not.toBeInTheDocument();
  });

  it('ne propose que des types que le portail sait ouvrir', async () => {
    renderForm();
    const select = await screen.findByLabelText('Type de fiche');
    const codes = within(select as HTMLSelectElement).getAllByRole('option').map((o) => (o as HTMLOptionElement).value);
    expect(codes).toContain('HLO');
    expect(codes).toContain('RES');
    // …et pas seulement les familles évidentes : SRV couvre aussi commerces et services.
    expect(codes).toContain('COM');
    // ITI et FMA n'ont AUCUNE rubrique de portail (registre fail-closed) : les régler serait
    // un réglage sans effet, donc un mensonge.
    expect(codes).not.toContain('ITI');
    expect(codes).not.toContain('FMA');
    // ORG est l'un des 19 codes du modèle mais n'est PAS une fiche. L'assertion est comparée
    // au vocabulaire fermé de la DB, sinon elle serait vraie par construction (ORG n'est pas
    // une clé de TYPE_ARCHETYPES) et ne mordrait pas si la liste venait d'OBJECT_TYPE_CODES.
    expect(OBJECT_TYPE_CODES.has('ORG')).toBe(true);
    expect(codes).not.toContain('ORG');
    for (const code of codes) expect(OBJECT_TYPE_CODES.has(code)).toBe(true);
  });
});

describe('bascule d’une rubrique', () => {
  it('une rubrique fermée est décochée ; la rouvrir écrit visible = true', async () => {
    mocked.getActorSectionVisibility.mockResolvedValue({ floorModules: FLOOR, maskedModules: ['pricing'] });
    const { invalidate } = renderForm();
    const tarifs = await screen.findByRole('checkbox', { name: /Vos tarifs/ });
    expect(tarifs).not.toBeChecked();

    fireEvent.click(tarifs);
    await waitFor(() =>
      expect(mocked.setActorSectionVisibility).toHaveBeenCalledWith('ORG1', 'HLO', 'pricing', true),
    );
    // La matrice relue est celle que l'éditeur en mode portail consomme : sans invalidation,
    // l'écran affiche un réglage que la fiche du partenaire n'a pas encore. La CLÉ compte :
    // invalider trop large (ou `undefined`) rafraîchirait tout le cache et masquerait une
    // clé fausse, invalider une autre clé ne rafraîchirait rien.
    await waitFor(() =>
      expect(invalidate).toHaveBeenCalledWith({ queryKey: ['actor-section-visibility', 'ORG1', 'HLO'] }),
    );
  });

  it('fermer une rubrique ouverte écrit visible = false, avec SON module', async () => {
    renderForm();
    const contacts = await screen.findByRole('checkbox', { name: /Vos coordonnées/ });
    expect(contacts).toBeChecked();
    fireEvent.click(contacts);
    await waitFor(() =>
      expect(mocked.setActorSectionVisibility).toHaveBeenCalledWith('ORG1', 'HLO', 'contacts', false),
    );
  });

  it('un échec serveur ne laisse pas l’écran mentir : le message est affiché', async () => {
    mocked.setActorSectionVisibility.mockRejectedValue(new Error('Réservé aux administrateurs d’organisation'));
    renderForm();
    fireEvent.click(await screen.findByRole('checkbox', { name: /Vos coordonnées/ }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Réservé aux administrateurs');
  });
});

describe('plancher dur — l’écran ne propose jamais un geste que le serveur refuse', () => {
  it('un module du plancher est VERROUILLÉ, pas un interrupteur cliquable', async () => {
    // On force `contacts` dans le plancher : le registre n'y met aucune rubrique aujourd'hui,
    // mais le plancher est une fonction SQL, il peut s'allonger sans que ce front change.
    mocked.getActorSectionVisibility.mockResolvedValue({
      floorModules: [...FLOOR, 'contacts'],
      maskedModules: [],
    });
    renderForm();
    const contacts = await screen.findByRole('checkbox', { name: /Vos coordonnées/ });
    expect(contacts).toBeDisabled();
    fireEvent.click(contacts);
    expect(mocked.setActorSectionVisibility).not.toHaveBeenCalled();
  });

  it('dit ce qui reste interne quoi qu’il arrive, photos comprises', async () => {
    renderForm();
    expect(await screen.findByText(/jamais visible/i)).toBeInTheDocument();
    expect(screen.getByText(/Gestion interne/i)).toBeInTheDocument();
    expect(screen.getByText(/Photos/)).toBeInTheDocument();
    expect(screen.getByText(/Lecture seule/i)).toBeInTheDocument();
  });
});
