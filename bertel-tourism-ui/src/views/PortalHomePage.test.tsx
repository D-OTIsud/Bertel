import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { PortalHomePage } from './PortalHomePage';
import { useSessionStore } from '../store/session-store';
import * as portal from '../services/portal';

jest.mock('../services/portal');
const replace = jest.fn();
jest.mock('next/navigation', () => ({ useRouter: () => ({ push: jest.fn(), replace }) }));
const mocked = portal as jest.Mocked<typeof portal>;

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <PortalHomePage />
    </QueryClientProvider>,
  );
}

const fiche = (over: Partial<portal.PortalFiche>): portal.PortalFiche => ({
  id: 'HOT1',
  name: 'Villa Vanille',
  objectType: 'HOT',
  status: 'published',
  updatedAt: null,
  openSubmission: null,
  lastResolved: null,
  officeEmail: 'contact@oti.re',
  officePhone: null,
  ...over,
});

/** Le badge d'une carte, retrouvé par son TEXTE — l'élément porteur, pas le nœud de texte. */
function badgeFor(label: string): HTMLElement {
  const node = screen.getByText(label);
  const badge = node.closest('.badge');
  if (!badge) throw new Error(`« ${label} » n'est pas rendu dans un .badge`);
  return badge as HTMLElement;
}

beforeEach(() => {
  jest.clearAllMocks();
  window.localStorage.clear();
  useSessionStore.setState({
    status: 'ready',
    role: 'actor',
    userId: 'u1',
    userName: 'Marie Payet',
    demoMode: false,
  } as never);
});

describe('PortalHomePage', () => {
  it('liste les fiches avec un état en mots (jamais la couleur seule)', async () => {
    mocked.listMyPortalFiches.mockResolvedValue([
      fiche({ openSubmission: { id: 's1', submittedAt: '2026-08-28T00:00:00Z' } }),
      fiche({
        id: 'ASC2',
        name: 'Kayak Sud',
        objectType: 'ASC',
        lastResolved: { status: 'rejected', resolvedAt: '2026-08-21T00:00:00Z' },
      }),
    ]);
    renderPage();

    expect(await screen.findByText('Villa Vanille')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Bonjour Marie');
    expect(screen.getByText('Envoyé — en vérification')).toBeInTheDocument();
    expect(screen.getByText('À reprendre')).toBeInTheDocument();
    // Le type de fiche est écrit en toutes lettres.
    expect(screen.getByText('Hôtel')).toBeInTheDocument();
    expect(screen.getByText('Activité')).toBeInTheDocument();
    // Chaque carte mène à SA fiche.
    expect(screen.getByRole('link', { name: /Villa Vanille/ })).toHaveAttribute('href', '/espace/fiches/HOT1');
    expect(screen.getByRole('link', { name: /Kayak Sud/ })).toHaveAttribute('href', '/espace/fiches/ASC2');
  });

  it('porte chaque état par une icône ET un texte, jamais par la couleur seule', async () => {
    mocked.listMyPortalFiches.mockResolvedValue([
      fiche({ openSubmission: { id: 's1', submittedAt: '2026-08-28T00:00:00Z' } }),
      fiche({ id: 'RES2', name: 'Le Longanis', objectType: 'RES' }),
    ]);
    renderPage();

    await screen.findByText('Le Longanis');
    // Un daltonien lit le mot ; un lecteur d'écran ne lit QUE le mot (icône aria-hidden).
    for (const label of ['Envoyé — en vérification', 'À jour']) {
      const icon = badgeFor(label).querySelector('svg');
      expect(icon).not.toBeNull();
      expect(icon).toHaveAttribute('aria-hidden');
    }
  });

  it('traite un retour PARTIEL de l’office comme « À reprendre »', async () => {
    // `partial` = l'office a retenu une partie et refusé le reste. Une implémentation qui
    // ne teste que `=== 'rejected'` afficherait « À jour » et laisserait le partenaire
    // sans réponse sur des rubriques réellement refusées.
    mocked.listMyPortalFiches.mockResolvedValue([
      fiche({ lastResolved: { status: 'partial', resolvedAt: '2026-08-21T00:00:00Z' } }),
      fiche({ id: 'RES2', name: 'Le Longanis', objectType: 'RES' }),
    ]);
    renderPage();

    await screen.findByText('Le Longanis');
    expect(screen.getByText('À reprendre')).toBeInTheDocument();
  });

  it('signale les modifications encore sur l’appareil', async () => {
    window.localStorage.setItem('portal-draft:u1:HOT1', '{"note":null}');
    // Appareil partagé : les modifications de u2 sur RES2 n'appartiennent pas à u1.
    window.localStorage.setItem('portal-draft:u2:RES2', '{"note":null}');
    mocked.listMyPortalFiches.mockResolvedValue([
      fiche({}),
      fiche({ id: 'RES2', name: 'Le Longanis', objectType: 'RES' }),
    ]);
    renderPage();

    await screen.findByText('Le Longanis');
    expect(badgeFor('Modifications à envoyer')).toBeInTheDocument();
    expect(screen.getByText('À jour')).toBeInTheDocument();
  });

  it('ouvre directement la fiche quand il n’y en a qu’une', async () => {
    mocked.listMyPortalFiches.mockResolvedValue([fiche({})]);
    renderPage();

    await screen.findByText(/Ouverture de votre fiche/);
    expect(replace).toHaveBeenCalledWith('/espace/fiches/HOT1');
    // L'accueil ne se voit qu'à partir de DEUX fiches : pas de « Bonjour », pas de liste.
    expect(screen.queryByRole('heading', { level: 1 })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Villa Vanille/ })).not.toBeInTheDocument();
  });

  it('état vide honnête, sans badge « Bientôt »', async () => {
    mocked.listMyPortalFiches.mockResolvedValue([]);
    renderPage();

    expect(await screen.findByText(/Aucune fiche n’est encore reliée/)).toBeInTheDocument();
    // `mode="coming-soon"` afficherait « Bientôt » : une promesse que personne ne tient.
    expect(screen.queryByText('Bientôt')).not.toBeInTheDocument();
    expect(replace).not.toHaveBeenCalled();
  });

  it('dit la panne et propose de réessayer', async () => {
    mocked.listMyPortalFiches.mockRejectedValue(new Error('boom'));
    renderPage();

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/Nous n’avons pas pu afficher vos fiches/);
    expect(screen.getByRole('button', { name: 'Réessayer' })).toBeInTheDocument();
  });

  it('affiche le squelette de LISTE pendant le chargement', async () => {
    mocked.listMyPortalFiches.mockReturnValue(new Promise(() => {}));
    renderPage();

    // `variant="list"` : un `variant="form"` annoncerait « Chargement du formulaire ».
    expect(await screen.findByRole('status')).toHaveAttribute('aria-label', 'Chargement de la liste');
  });

  it('ne charge RIEN d’autre que la liste des fiches', async () => {
    // Ouvrir une fiche complète coûte ~38 requêtes à froid : l'accueil ne le fait pas.
    mocked.listMyPortalFiches.mockResolvedValue([
      fiche({}),
      fiche({ id: 'RES2', name: 'Le Longanis', objectType: 'RES' }),
    ]);
    renderPage();

    await screen.findByText('Le Longanis');
    expect(mocked.listMyPortalFiches).toHaveBeenCalledTimes(1);
    expect(mocked.listMySubmissions).not.toHaveBeenCalled();
    expect(mocked.getPortalSectionVisibility).not.toHaveBeenCalled();
  });

  it('n’écrit aucun mot de l’outil interne à l’écran', async () => {
    mocked.listMyPortalFiches.mockResolvedValue([
      fiche({ openSubmission: { id: 's1', submittedAt: '2026-08-28T00:00:00Z' } }),
      // Type inconnu du catalogue : on n'écrit rien plutôt que de replier sur le code.
      fiche({ id: 'XYZ2', name: 'Le Longanis', objectType: 'XYZ' }),
    ]);
    renderPage();

    await screen.findByText('Le Longanis');
    expect(screen.queryByText('XYZ')).not.toBeInTheDocument();
    expect(document.body.textContent ?? '').not.toMatch(
      /prestataire|canonique|modération|soumission|contributeur|brouillon|workspace|pending|module|section/i,
    );
  });
});
