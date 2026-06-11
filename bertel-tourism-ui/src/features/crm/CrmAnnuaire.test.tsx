import { render, screen, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { CrmAnnuaire } from './CrmAnnuaire';
import * as crm from '../../services/crm';
import { mockCrmDirectory } from '../../data/mock';

jest.mock('../../services/crm');

const crmMock = crm as jest.Mocked<typeof crm>;

function renderAnnuaire(onOpenActor = jest.fn()) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <CrmAnnuaire onOpenActor={onOpenActor} />
    </QueryClientProvider>,
  );
  return onOpenActor;
}

beforeEach(() => {
  jest.clearAllMocks();
  crmMock.listCrmDirectory.mockResolvedValue(mockCrmDirectory);
});

describe('CrmAnnuaire (§61 — annuaire des acteurs)', () => {
  it('rend les lignes acteurs : nom, premier établissement + rôle, pile +N, compteurs, sujets', async () => {
    renderAnnuaire();
    expect(await screen.findByText('Mme Marie Hoarau')).toBeInTheDocument();
    expect(screen.getByText('SARL Basalte & Lagon')).toBeInTheDocument();
    // Premier objet + rôle de l'acteur multi-établissements, et la pile « +N ».
    expect(screen.getAllByText('Hotel Basalte & Lagon').length).toBeGreaterThan(0);
    expect(screen.getByText('Gérante')).toBeInTheDocument();
    expect(screen.getByText('+1')).toBeInTheDocument();
    // Compteur interactions : 12 mois + total.
    expect(screen.getByText('9 au total')).toBeInTheDocument();
    // Top sujets (max 2 chips).
    expect(screen.getByText('Demande de visite')).toBeInTheDocument();
  });

  it('affiche les KPI réels : acteurs suivis, interactions 12 mois, établissements liés', async () => {
    renderAnnuaire();
    await screen.findByText('Mme Marie Hoarau');
    expect(screen.getByText('Acteurs suivis')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument(); // 3 acteurs
    expect(screen.getByText('Interactions · 12 mois')).toBeInTheDocument();
    expect(screen.getByText('6')).toBeInTheDocument(); // 4 + 1 + 1
    expect(screen.getByText('Établissements liés')).toBeInTheDocument();
    expect(screen.getByText('4')).toBeInTheDocument(); // 2 + 1 + 1
  });

  it('filtre par recherche sur le nom de l acteur ET le nom d établissement', async () => {
    renderAnnuaire();
    await screen.findByText('Mme Marie Hoarau');
    fireEvent.change(screen.getByPlaceholderText(/filtrer/i), { target: { value: 'comptoir' } });
    expect(screen.getByText('Mme Marie Hoarau')).toBeInTheDocument();
    expect(screen.queryByText('M. Paul Técher')).not.toBeInTheDocument();
    fireEvent.change(screen.getByPlaceholderText(/filtrer/i), { target: { value: 'Técher' } });
    expect(screen.getByText('M. Paul Técher')).toBeInTheDocument();
    expect(screen.queryByText('Mme Marie Hoarau')).not.toBeInTheDocument();
  });

  it('filtre par chip de type d objet (types présents dans l annuaire)', async () => {
    renderAnnuaire();
    await screen.findByText('Mme Marie Hoarau');
    fireEvent.click(screen.getByRole('button', { name: 'ITI' }));
    expect(screen.getByText('M. Paul Técher')).toBeInTheDocument();
    expect(screen.queryByText('Mme Marie Hoarau')).not.toBeInTheDocument();
    // Toggle off → tout revient.
    fireEvent.click(screen.getByRole('button', { name: 'ITI' }));
    expect(screen.getByText('Mme Marie Hoarau')).toBeInTheDocument();
  });

  it('clic sur une ligne → onOpenActor(actorId)', async () => {
    const onOpenActor = renderAnnuaire();
    fireEvent.click(await screen.findByText('M. Paul Técher'));
    expect(onOpenActor).toHaveBeenCalledWith('actor-3');
  });

  it('état vide quand aucun acteur ne correspond aux filtres', async () => {
    renderAnnuaire();
    await screen.findByText('Mme Marie Hoarau');
    fireEvent.change(screen.getByPlaceholderText(/filtrer/i), { target: { value: 'zzzz-aucun' } });
    expect(screen.getByText(/aucun acteur ne correspond/i)).toBeInTheDocument();
  });

  it('échec de chargement → erreur visible (pas d écran vide silencieux)', async () => {
    crmMock.listCrmDirectory.mockRejectedValue(new Error('refus RLS'));
    renderAnnuaire();
    expect(await screen.findByText(/refus RLS/)).toBeInTheDocument();
  });
});
