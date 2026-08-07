import { render, screen, waitFor } from '@testing-library/react';
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

  it('Finding 1 (revue tâche 10) — la finalité ne survit PAS à une réouverture (justification par export, jamais rejouée)', async () => {
    const { rerender } = setup();
    await userEvent.click(await screen.findByLabelText(/Acteur — mobile/));
    await userEvent.type(screen.getByLabelText(/Finalité/), 'Campagne relance adhésions 2026');
    const download = screen.getByRole('button', { name: /Télécharger/ });
    expect(download).toBeEnabled();
    await userEvent.click(download);
    // Laisse l'export mocké (résolu) traverser son try/finally avant de rouvrir.
    await waitFor(() => expect(screen.queryByText(/Chargement/)).not.toBeInTheDocument());

    // Fermeture puis réouverture : seul `open` change, le composant reste MONTÉ
    // (Modal possède son propre cycle de présence, cf. usePresence) — c'est
    // exactement le scénario du finding, pas un démontage/remontage complet.
    rerender(<ExportExcelModal open={false} onOpenChange={jest.fn()} />);
    rerender(<ExportExcelModal open onOpenChange={jest.fn()} />);

    // La case Acteur — mobile reste cochée (persistance VOULUE du store des
    // préférences), mais la finalité — justification PAR EXPORT — repart vide
    // et redésactive Télécharger tant qu'elle n'est pas retapée.
    expect(await screen.findByLabelText(/Finalité/)).toHaveValue('');
    expect(screen.getByRole('button', { name: /Télécharger/ })).toBeDisabled();
  });

  it('Finding 2 (revue tâche 10) — sélection stockée devenue entièrement invisible (bascule de clearance) : message explicite, pas un blocage muet', async () => {
    // Le garde-fou « jamais 0 colonne » du store (explorer-export-store.ts) porte
    // sur les ids STOCKÉS, pas sur ceux réellement OFFERTS pour la session/caps
    // courants : une sélection qui ne survit à aucune colonne offerte est un état
    // atteignable (bascule vers une fiche dont le préflight refuse l'identité).
    mockCaps.mockResolvedValue({ actorIdentityAvailable: false, actorContactsAvailable: false });
    useExplorerStore.setState({ selectedObjectIds: ['a', 'b', 'c'] });
    useSessionStore.setState({ orgId: 'ORG', orgName: 'OTI du Sud', canEditObjects: true, role: 'tourism_agent', langPrefs: ['fr'] });
    useExplorerExportStore.setState({ presetId: 'custom', columnIds: ['actor_names'] });

    render(<ExportExcelModal open onOpenChange={jest.fn()} />);

    expect(await screen.findByRole('dialog', { name: /Exporter en Excel/ })).toBeInTheDocument();
    expect(screen.getByText(/Aucune colonne disponible pour cette sélection/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Télécharger/ })).toBeDisabled();
    // Le groupe acteur, seul détenteur de la sélection invisible, ne s'affiche pas non plus.
    expect(screen.queryByLabelText(/Acteur — nom/)).toBeNull();
  });

  it('Finding 3 (revue tâche 10) — le préréglage actif est signalé par aria-pressed, pas seulement par la couleur', async () => {
    setup();
    await screen.findByRole('dialog', { name: /Exporter en Excel/ });
    expect(screen.getByRole('button', { name: /^Essentiel$/ })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: /Diffusion partenaire/ })).toHaveAttribute('aria-pressed', 'false');

    await userEvent.click(screen.getByRole('button', { name: /Diffusion partenaire/ }));

    expect(screen.getByRole('button', { name: /Diffusion partenaire/ })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: /^Essentiel$/ })).toHaveAttribute('aria-pressed', 'false');
  });
});
