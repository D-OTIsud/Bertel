import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ExportExcelModal } from './ExportExcelModal';
import { useExplorerStore } from '../../../store/explorer-store';
import { useSessionStore } from '../../../store/session-store';
import { useExplorerExportStore } from '../../../store/explorer-export-store';
import { runSelectionXlsxExport } from '../../../services/export/export-workbook';
import { getExportActorCapabilitiesResult } from '../../../services/rpc';

jest.mock('../../../services/export/export-workbook', () => ({ runSelectionXlsxExport: jest.fn() }));
// R2 (revue 4e vague) — le découpage par lots (`fetchActorExportCapabilities`) consomme
// la variante BAS NIVEAU `getExportActorCapabilitiesResult`, pas le wrapper single-call
// `getExportActorCapabilities` : c'est elle qu'il faut mocker pour exercer le VRAI chemin
// que la modale emprunte (cf. rpc.ts). Mocker l'ancien wrapper ferait passer ces tests
// sans jamais exercer la logique d'abandon sur `!result.ok`.
jest.mock('../../../services/rpc', () => ({ getExportActorCapabilitiesResult: jest.fn() }));
const mockRun = runSelectionXlsxExport as jest.Mock;
const mockCaps = getExportActorCapabilitiesResult as jest.Mock;

/** Verdict RÉEL réussi — la forme que rend `getExportActorCapabilitiesResult` sur succès. */
const capsOk = (caps: { actorIdentityAvailable: boolean; actorContactsAvailable: boolean }) => ({ ok: true as const, caps });
/**
 * Signal d'ÉCHEC RÉEL (revue 4e vague) — `getExportActorCapabilitiesResult` n'AVALE
 * jamais une erreur en la laissant remonter comme un rejet : client absent, erreur
 * PostgREST (`{error}` sans rejet — la branche qui tire réellement pré-16t) ou exception
 * catchée y rendent toutes `{ ok: false }`. Un mock qui REJETTERAIT à la place testerait
 * un chemin que le vrai code n'emprunte jamais (c'était le défaut de cette suite avant la
 * revue 4e vague : le test « un seul lot en échec » passait alors même que le chunker
 * n'aurait JAMAIS pu observer un rejet en production).
 */
const capsFail = () => ({ ok: false as const });

function setup(
  session: Partial<ReturnType<typeof useSessionStore.getState>> = {},
  selectedObjectIds: string[] = ['a', 'b', 'c'],
) {
  // role: as const — sinon le littéral s'élargit en `string`, incompatible avec le type
  // UserRole strict de SessionState une fois fusionné avec `...session` (Partial<SessionState>).
  const merged = { orgId: 'ORG', orgName: 'OTI du Sud', canEditObjects: true, role: 'tourism_agent' as const, langPrefs: ['fr'], ...session };
  useExplorerStore.setState({ selectedObjectIds });
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
  // Perf (revue 18b) — l'API statique `userEvent.click/type` s'auto-`setup()` avec le
  // délai PAR DÉFAUT (`delay: 0`), qui insère malgré tout un `setTimeout` réel entre
  // chaque événement (pointerdown/up, ou chaque frappe pour `.type`). Sous contention
  // CPU (suite complète, 382 fichiers en parallèle) ces ticks réels s'étirent et la
  // saisie de 31 caractères de « Finalité » dépasse le timeout Jest de 5000 ms — alors
  // que le fichier est vert en isolation. `delay: null` rend CHAQUE appel synchrone
  // (même séquence d'événements réelle, juste sans le `setTimeout` inter-étapes) : la
  // recette RTL standard pour désensibiliser un test à la charge machine, sans toucher
  // à une seule assertion. `user` est réinstancié à chaque test (état interne — ex.
  // presse-papiers — non partagé entre tests).
  let user: ReturnType<typeof userEvent.setup>;

  beforeEach(() => {
    user = userEvent.setup({ delay: null });
    mockRun.mockReset().mockResolvedValue({ exported: 3, requested: 3 });
    // R2 : par défaut le préflight ouvre tout (membre publisher) — les cas contraires le surchargent.
    mockCaps.mockReset().mockResolvedValue(capsOk({ actorIdentityAvailable: true, actorContactsAvailable: true }));
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
    mockCaps.mockResolvedValue(capsOk({ actorIdentityAvailable: false, actorContactsAvailable: false }));
    setup();
    expect(await screen.findByRole('dialog', { name: /Exporter en Excel/ })).toBeInTheDocument();
    expect(mockCaps).toHaveBeenCalledWith(['a', 'b', 'c']);
    expect(screen.queryByLabelText(/Acteur — nom/)).toBeNull();
    expect(screen.queryByLabelText(/Acteur — mobile/)).toBeNull();
  });

  it('R2 — identité disponible mais pas les coordonnées : nom/rôle offerts, mobile absent', async () => {
    mockCaps.mockResolvedValue(capsOk({ actorIdentityAvailable: true, actorContactsAvailable: false }));
    setup();
    expect(await screen.findByLabelText(/Acteur — nom/)).toBeInTheDocument();
    expect(screen.queryByLabelText(/Acteur — mobile/)).toBeNull();
  });

  it('R2.1 — persona I3 : lecteur SANS ORG + identité accordée par le serveur ⇒ « Acteur — nom » VISIBLE', async () => {
    // C'est le cas que la R2 laissait mort-né : la session filtrait avant le préflight.
    mockCaps.mockResolvedValue(capsOk({ actorIdentityAvailable: true, actorContactsAvailable: false }));
    setup({ orgId: null, orgName: null, canEditObjects: false, role: null });
    expect(await screen.findByLabelText(/Acteur — nom/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Acteur\(s\) principal\(aux\)/)).toBeInTheDocument();
    expect(screen.queryByLabelText(/Acteur — mobile/)).toBeNull();
    // Le niveau `org`, lui, reste session-dérivé : toujours absent pour ce lecteur.
    expect(screen.queryByLabelText(/Contacts de la fiche \(tous\)/)).toBeNull();
  });

  it('R2 — préflight en échec (ex. 16t pas encore déployée) : offre FAIL-CLOSED, pas de crash', async () => {
    // Rejet volontairement IRRÉALISTE (la vraie `getExportActorCapabilitiesResult` n'en
    // produit jamais — elle avale tout et rend `{ok:false}`) : ce test couvre la COUCHE
    // COMPOSANT, le `.catch()` de défense en profondeur de l'effet R2 dans ExportExcelModal
    // (Task 10 : deux couches fail-closed indépendantes, service ET composant). La couche
    // service, elle, est couverte par `capsFail()`/`{ok:false}` dans les tests ci-dessous.
    mockCaps.mockRejectedValue(new Error('function api.export_actor_capabilities does not exist'));
    setup();
    expect(await screen.findByRole('dialog', { name: /Exporter en Excel/ })).toBeInTheDocument();
    expect(screen.queryByLabelText(/Acteur — nom/)).toBeNull();
    expect(screen.getByLabelText(/^Nom$/)).toBeInTheDocument(); // le reste de la modale vit normalement
  });

  // ---- Revue 3e vague : le plafond serveur de 500 ids ne doit PAS amputer le « tout sélectionner » ----

  /** 1 200 ids = 3 lots (500/500/200) — au-dessus du plafond, comme un « tout sélectionner » du corpus. */
  const OVER_CAP_IDS = Array.from({ length: 1200 }, (_, i) => `obj-${i}`);
  const batchesOf = (m: jest.Mock) => (m.mock.calls as Array<[string[]]>).map(([batch]) => batch);

  it('R2 (revue 3e vague) — sélection > 500 : le préflight est DÉCOUPÉ, les colonnes acteur restent OFFERTES', async () => {
    // Le mock REPRODUIT le refus serveur au-delà de 500 ids (BATCH_TOO_LARGE / 22023) — un
    // rejet reste légitime ICI : ce n'est pas un verdict `{ok:false}` que le vrai RPC
    // produirait, c'est un garde-fou de test prouvant qu'AUCUN appel réel n'envoie plus de
    // 500 ids (si le découpage régressait, un appel de 1 200 ids partirait en rejet non
    // catché par `fetchActorExportCapabilities` ⇒ capacités fermées ⇒ ROUGE). Sans lui, le
    // test passerait aussi SANS découpage — vacuité.
    mockCaps.mockReset().mockImplementation((batch: string[]) => {
      if (batch.length > 500) {
        return Promise.reject(new Error(`BATCH_TOO_LARGE: 500 max apres dedoublonnage (recu ${batch.length})`));
      }
      // N'accorde QUE sur le DERNIER lot : prouve à la fois que TOUS les lots sont posés
      // et que la réduction est un OR entre lots (jamais « le premier lot fait foi »).
      const granted = batch.includes('obj-1199');
      return Promise.resolve(capsOk({ actorIdentityAvailable: granted, actorContactsAvailable: granted }));
    });
    setup({}, OVER_CAP_IDS);

    expect(await screen.findByLabelText(/Acteur — mobile/)).toBeInTheDocument();
    expect(await screen.findByLabelText(/Acteur — nom/)).toBeInTheDocument();
    expect(batchesOf(mockCaps).map((b) => b.length)).toEqual([500, 500, 200]);
  });

  it("R2 (revue 4e vague) — un SEUL lot en ÉCHEC referme TOUTES les capacités (jamais un agrégat partiel)", async () => {
    // `capsFail()` = `{ ok: false }` — le signal RÉEL qu'un lot en échec produit (client
    // absent, erreur PostgREST, exception catchée : `getExportActorCapabilitiesResult` ne
    // rejette JAMAIS, cf. rpc.ts). AVANT la revue 4e vague ce test mockait un REJET, que le
    // module réel n'émet jamais : il passait sans exercer le moindre code de production —
    // preuve de non-vacuité dans le rapport de tâche (RED quand le chunker ignore `ok`,
    // GREEN une fois la lecture de `ok` restaurée).
    mockCaps.mockReset().mockImplementation((batch: string[]) => (
      batch.includes('obj-1199')
        ? Promise.resolve(capsFail())
        : Promise.resolve(capsOk({ actorIdentityAvailable: true, actorContactsAvailable: true }))
    ));
    setup({}, OVER_CAP_IDS);

    expect(await screen.findByRole('dialog', { name: /Exporter en Excel/ })).toBeInTheDocument();
    await waitFor(() => expect(batchesOf(mockCaps)).toHaveLength(3));
    // Les DEUX premiers lots accordaient tout : sans l'abandon sur `!ok`, l'OR entre lots
    // laisserait l'offre ouverte (c'est EXACTEMENT le défaut corrigé par la revue 4e vague).
    await waitFor(() => expect(screen.queryByLabelText(/Acteur — nom/)).toBeNull());
    expect(screen.queryByLabelText(/Acteur — mobile/)).toBeNull();
    expect(screen.getByLabelText(/^Nom$/)).toBeInTheDocument(); // le reste de la modale vit normalement
  });

  it('sans colonne à finalité : télécharge directement, sans champ finalité', async () => {
    setup();
    expect(screen.queryByLabelText(/Finalité/)).toBeNull();
    await user.click(screen.getByRole('button', { name: /Télécharger/ }));
    expect(mockRun).toHaveBeenCalledWith(expect.objectContaining({ ids: ['a', 'b', 'c'], purpose: '' }));
  });

  it('avec une colonne acteur gardée cochée : la finalité devient obligatoire', async () => {
    setup();
    // Le préflight R2 est asynchrone (véritable appel réseau en production) : la case
    // n'existe qu'une fois la promesse résolue — findBy attend cette résolution avant
    // le clic, plutôt qu'un getBy synchrone qui daterait d'avant la réponse serveur.
    await user.click(await screen.findByLabelText(/Acteur — mobile/));
    const download = screen.getByRole('button', { name: /Télécharger/ });
    expect(download).toBeDisabled(); // finalité vide ⇒ pas d'export
    await user.type(screen.getByLabelText(/Finalité/), 'Campagne relance adhésions 2026');
    expect(download).toBeEnabled();
    await user.click(download);
    expect(mockRun).toHaveBeenCalledWith(expect.objectContaining({ purpose: 'Campagne relance adhésions 2026' }));
  });

  it('préréglage Diffusion : cases désactivées (verrouillé), colonnes recalculées du code', async () => {
    setup();
    await user.click(screen.getByRole('button', { name: /Diffusion partenaire/ }));
    const nameBox = screen.getByLabelText<HTMLInputElement>(/^Nom$/);
    expect(nameBox).toBeChecked();
    expect(nameBox).toBeDisabled();
  });

  it('Finding 1 (revue tâche 10) — la finalité ne survit PAS à une réouverture (justification par export, jamais rejouée)', async () => {
    const { rerender } = setup();
    await user.click(await screen.findByLabelText(/Acteur — mobile/));
    await user.type(screen.getByLabelText(/Finalité/), 'Campagne relance adhésions 2026');
    const download = screen.getByRole('button', { name: /Télécharger/ });
    expect(download).toBeEnabled();
    await user.click(download);
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
    mockCaps.mockResolvedValue(capsOk({ actorIdentityAvailable: false, actorContactsAvailable: false }));
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

    await user.click(screen.getByRole('button', { name: /Diffusion partenaire/ }));

    expect(screen.getByRole('button', { name: /Diffusion partenaire/ })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: /^Essentiel$/ })).toHaveAttribute('aria-pressed', 'false');
  });
});
