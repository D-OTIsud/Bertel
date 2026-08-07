import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ExportExcelModal } from './ExportExcelModal';
import { useExplorerStore } from '../../../store/explorer-store';
import { useSessionStore } from '../../../store/session-store';
import { useExplorerExportStore } from '../../../store/explorer-export-store';
import { runSelectionXlsxExport } from '../../../services/export/export-workbook';
import { getExportActorCapabilities } from '../../../services/rpc';

jest.mock('../../../services/export/export-workbook', () => ({ runSelectionXlsxExport: jest.fn() }));
jest.mock('../../../services/rpc', () => ({ getExportActorCapabilities: jest.fn() }));
const mockRun = runSelectionXlsxExport as jest.Mock;
const mockCaps = getExportActorCapabilities as jest.Mock;

function setup(session: Partial<ReturnType<typeof useSessionStore.getState>> = {}) {
  // role: as const — sinon le littéral s'élargit en `string`, incompatible avec le type
  // UserRole strict de SessionState une fois fusionné avec `...session` (Partial<SessionState>).
  const merged = { orgId: 'ORG', orgName: 'OTI du Sud', canEditObjects: true, role: 'tourism_agent' as const, langPrefs: ['fr'], ...session };
  useExplorerStore.setState({ selectedObjectIds: ['a', 'b', 'c'] });
  useSessionStore.setState(merged);
  useExplorerExportStore.setState({ presetId: 'essentiel', columnIds: [] });
  // Le préréglage initial part de la session RÉELLE du cas (pas d'ORG codée en
  // dur) et SANS caps : les colonnes acteur ne sont jamais pré-cochées — le
  // préflight ouvre l'OFFRE, il ne coche rien.
  useExplorerExportStore.getState().applyPreset('essentiel', {
    orgId: merged.orgId, canEditObjects: merged.canEditObjects, role: merged.role,
  });
  return render(<ExportExcelModal open onOpenChange={jest.fn()} />);
}

describe('ExportExcelModal (§208)', () => {
  beforeEach(() => {
    mockRun.mockReset().mockResolvedValue({ exported: 3, requested: 3 });
    // R2 : par défaut le préflight ouvre tout (membre publisher) — les cas contraires le surchargent.
    mockCaps.mockReset().mockResolvedValue({ actorIdentityAvailable: true, actorContactsAvailable: true });
  });

  it('affiche le compte, les 3 préréglages et les groupes repliables', async () => {
    setup();
    // findBy (pas getBy) : le préflight R2 résout sur un microtask même quand le test ne
    // s'y intéresse pas — sans l'attendre ici, le setCaps() ultérieur atterrit hors act()
    // (avertissement React) une fois le test terminé.
    expect(await screen.findByRole('dialog', { name: /Exporter en Excel/ })).toBeInTheDocument();
    expect(screen.getByText(/3 fiches sélectionnées/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Essentiel/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Diffusion partenaire/ })).toBeInTheDocument();
  });

  it("un lecteur sans ORG ne voit PAS les colonnes org (clearance filtre l'offre, §205)", async () => {
    setup({ orgId: null, canEditObjects: false, role: null });
    // Même remarque : attend la résolution du préflight avant la fin du test (act-safe).
    await screen.findByRole('dialog', { name: /Exporter en Excel/ });
    expect(screen.queryByLabelText(/Contacts de la fiche \(tous\)/)).toBeNull();
  });

  it('R2 — préflight serveur : capacités refusées ⇒ colonnes acteur ABSENTES malgré la session ORG', async () => {
    mockCaps.mockResolvedValue({ actorIdentityAvailable: false, actorContactsAvailable: false });
    setup();
    expect(await screen.findByRole('dialog', { name: /Exporter en Excel/ })).toBeInTheDocument();
    expect(mockCaps).toHaveBeenCalledWith(['a', 'b', 'c']);
    expect(screen.queryByLabelText(/Acteur — nom/)).toBeNull();
    expect(screen.queryByLabelText(/Acteur — mobile/)).toBeNull();
  });

  it('R2 — identité disponible mais pas les coordonnées : nom/rôle offerts, mobile absent', async () => {
    mockCaps.mockResolvedValue({ actorIdentityAvailable: true, actorContactsAvailable: false });
    setup();
    expect(await screen.findByLabelText(/Acteur — nom/)).toBeInTheDocument();
    expect(screen.queryByLabelText(/Acteur — mobile/)).toBeNull();
  });

  it('R2.1 — persona I3 : lecteur SANS ORG + identité accordée par le serveur ⇒ « Acteur — nom » VISIBLE', async () => {
    // C'est le cas que la R2 laissait mort-né : la session filtrait avant le préflight.
    mockCaps.mockResolvedValue({ actorIdentityAvailable: true, actorContactsAvailable: false });
    setup({ orgId: null, orgName: null, canEditObjects: false, role: null });
    expect(await screen.findByLabelText(/Acteur — nom/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Acteur\(s\) principal\(aux\)/)).toBeInTheDocument();
    expect(screen.queryByLabelText(/Acteur — mobile/)).toBeNull();
    // Le niveau `org`, lui, reste session-dérivé : toujours absent pour ce lecteur.
    expect(screen.queryByLabelText(/Contacts de la fiche \(tous\)/)).toBeNull();
  });

  it('R2 — préflight en échec (ex. 16t pas encore déployée) : offre FAIL-CLOSED, pas de crash', async () => {
    mockCaps.mockRejectedValue(new Error('function api.export_actor_capabilities does not exist'));
    setup();
    expect(await screen.findByRole('dialog', { name: /Exporter en Excel/ })).toBeInTheDocument();
    expect(screen.queryByLabelText(/Acteur — nom/)).toBeNull();
    expect(screen.getByLabelText(/^Nom$/)).toBeInTheDocument(); // le reste de la modale vit normalement
  });

  it('sans colonne à finalité : télécharge directement, sans champ finalité', async () => {
    setup();
    expect(screen.queryByLabelText(/Finalité/)).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: /Télécharger/ }));
    expect(mockRun).toHaveBeenCalledWith(expect.objectContaining({ ids: ['a', 'b', 'c'], purpose: '' }));
  });

  it('avec une colonne acteur gardée cochée : la finalité devient obligatoire', async () => {
    setup();
    // Le préflight R2 est asynchrone (véritable appel réseau en production) : la case
    // n'existe qu'une fois la promesse résolue — findBy attend cette résolution avant
    // le clic, plutôt qu'un getBy synchrone qui daterait d'avant la réponse serveur.
    await userEvent.click(await screen.findByLabelText(/Acteur — mobile/));
    const download = screen.getByRole('button', { name: /Télécharger/ });
    expect(download).toBeDisabled(); // finalité vide ⇒ pas d'export
    await userEvent.type(screen.getByLabelText(/Finalité/), 'Campagne relance adhésions 2026');
    expect(download).toBeEnabled();
    await userEvent.click(download);
    expect(mockRun).toHaveBeenCalledWith(expect.objectContaining({ purpose: 'Campagne relance adhésions 2026' }));
  });

  it('préréglage Diffusion : cases désactivées (verrouillé), colonnes recalculées du code', async () => {
    setup();
    await userEvent.click(screen.getByRole('button', { name: /Diffusion partenaire/ }));
    const nameBox = screen.getByLabelText<HTMLInputElement>(/^Nom$/);
    expect(nameBox).toBeChecked();
    expect(nameBox).toBeDisabled();
  });
});
