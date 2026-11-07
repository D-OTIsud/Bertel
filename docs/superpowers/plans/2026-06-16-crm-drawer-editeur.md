# §19 « Suivi prestataire » — KPIs + tiroir CRM — Plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Réduire la section éditeur §19 à une carte de synthèse (KPIs + chips sujets + notes) + un bouton qui ouvre un tiroir latéral reprenant VERBATIM la vraie section CRM (`CrmObjectView` liste-acteurs ⇄ `CrmActorFiche` interactions).

**Architecture:** On réutilise les vues `/crm` telles quelles (fidélité visuelle garantie, zéro réimplémentation). Un nouveau `CrmEstablishmentPanel` porte la nav locale objet⇄acteur (sans route/localStorage), ancrée sur l'objet édité. Un nouveau `EditorCrmDrawer` est la coquille Sheet (clone d'`ObjectDrawer`) qui enveloppe le panneau dans `<div className="crm-app">` (obligatoire : tout le CSS CRM + les overlays des sous-modals sont scopés sous `.crm-app`). `SectionCrm` perd son repeater/formulaires inline et resynchronise ses KPIs (`refreshCrm` via `replaceModule`, module READONLY → pas de faux dirty) à la fermeture du tiroir.

**Tech Stack:** React 19 + Next App Router, TypeScript, TanStack Query, Radix Sheet (`@/components/ui/sheet`), Jest + React Testing Library, services CRM (RPC DEFINER).

> **⚠️ Git — PO en parallèle :** le PO commite en parallèle via Cursor (beaucoup de WIP non lié : pricing/RGPD/openings). **Confirmer avant tout commit.** Ne JAMAIS `git add -A`/`git add .` — stager UNIQUEMENT les fichiers explicites de chaque tâche (listés). Ne jamais amender un commit existant.

> **Référence spec :** [docs/superpowers/specs/2026-06-16-crm-drawer-editeur-design.md](../specs/2026-06-16-crm-drawer-editeur-design.md)

> **Affinement vs spec :** la spec évoquait un `onAfterWrite` (resync à chaque écriture). À l'implémentation, les vues `/crm` ne notifient pas l'hôte de leurs écritures (elles invalident leur propre cache react-query). Comme les KPIs §19 sont **derrière** le tiroir (invisibles pendant l'édition), on resynchronise **uniquement à la fermeture** (`onClose → refreshCrm`). C'est suffisant, et ça évite de modifier le chemin d'écriture des vues partagées (moins de surface, zéro risque de régression `/crm`).

**Commandes (depuis `bertel-tourism-ui/`) :**
- Test ciblé (1 run) : `npx jest <chemin du test>`
- Typecheck : `npm run typecheck` (`tsc -p tsconfig.app.json --noEmit`)
- Build : `npm run build` (exclut les `*.test.*`)

---

## File Structure

| Fichier | Responsabilité |
|---------|----------------|
| `src/features/crm/CrmObjectView.tsx` *(modify)* | + prop `hideOpenEditor` masquant le lien « Ouvrir dans l'éditeur » (circulaire dans l'éditeur) |
| `src/features/crm/CrmActorFiche.tsx` *(modify)* | + prop `backLabel` (libellé du bouton retour) |
| `src/features/crm/CrmEstablishmentPanel.tsx` *(create)* | Nav locale objet⇄acteur ancrée ; monte `CrmObjectView` ⇄ `CrmActorFiche` |
| `src/features/object-editor/widgets/EditorCrmDrawer.tsx` *(create)* | Coquille Sheet + wrapper `.crm-app` + header ; monte le panneau |
| `src/features/object-editor/sections/SectionCrm.tsx` *(modify)* | Allègement → synthèse (KPIs/chips/notes) + bouton + montage tiroir + `refreshCrm` |
| `src/features/crm/CrmEstablishmentPanel.test.tsx` *(create)* | Orchestration de nav (vues mockées) |
| `src/features/object-editor/widgets/EditorCrmDrawer.test.tsx` *(create)* | Coquille : ancêtre `.crm-app`, ouverture/fermeture (panneau mocké) |
| `src/features/object-editor/sections/SectionCrm.test.tsx` *(modify)* | Réécriture : KPIs/bouton/bandeau/tiroir (tiroir mocké) |

Ordre des tâches (linéaire — chaque tâche compile et teste sur la précédente) : 1 → 2 → 3 → 4 → 5 → 6.

---

## Task 1 : `CrmObjectView` — prop `hideOpenEditor`

**Files:**
- Modify: `src/features/crm/CrmObjectView.tsx` (signature de props + lignes 150-152)
- Test: `src/features/crm/CrmObjectView.test.tsx`

- [ ] **Step 1 : Écrire le test qui échoue**

Ajouter ce test dans `describe('CrmObjectView (§61 — vue établissement)', …)` de `CrmObjectView.test.tsx` :

```tsx
  it('masque le lien éditeur quand hideOpenEditor (hôte = éditeur)', async () => {
    renderView({ hideOpenEditor: true });
    await screen.findByText('Hotel Basalte & Lagon');
    expect(screen.queryByRole('link', { name: /ouvrir dans l.éditeur/i })).not.toBeInTheDocument();
  });
```

- [ ] **Step 2 : Lancer le test → échec attendu**

Run : `npx jest src/features/crm/CrmObjectView.test.tsx -t "masque le lien"`
Expected : FAIL — TypeScript/RTL : `hideOpenEditor` n'existe pas sur les props, le lien est toujours rendu.

- [ ] **Step 3 : Implémenter**

Dans `CrmObjectView.tsx`, étendre la signature de props (bloc `export function CrmObjectView({ … }: { … })`) :

```tsx
export function CrmObjectView({
  objectId,
  backLabel,
  canWrite,
  onBack,
  onOpenActor,
  hideOpenEditor = false,
}: {
  objectId: string;
  backLabel: string;
  canWrite: boolean;
  onBack: () => void;
  onOpenActor: (actorId: string) => void;
  /** Masque le lien « Ouvrir dans l'éditeur » — circulaire quand l'hôte EST déjà l'éditeur. */
  hideOpenEditor?: boolean;
}) {
```

Puis envelopper le `<Link>` « Ouvrir dans l'éditeur » (lignes ~150-152) :

```tsx
          {!hideOpenEditor && (
            <Link className="crm-btn" href={`/objects/${objectId}/edit`}>
              <ExternalLink size={13} aria-hidden /> Ouvrir dans l&apos;éditeur
            </Link>
          )}
```

Mettre à jour le commentaire d'en-tête du fichier : ajouter « Gate `canWrite` fourni par l'hôte (page-wide `write_crm_notes` sur /crm ; per-objet `user_can_write_crm` dans le tiroir éditeur). »

- [ ] **Step 4 : Lancer les tests → succès**

Run : `npx jest src/features/crm/CrmObjectView.test.tsx`
Expected : PASS (le nouveau test + les anciens, dont « résout nom + type … et rend le lien éditeur » qui n'utilise pas `hideOpenEditor` → lien toujours rendu par défaut).

- [ ] **Step 5 : Commit** *(après accord PO ; fichiers explicites)*

```bash
git add bertel-tourism-ui/src/features/crm/CrmObjectView.tsx bertel-tourism-ui/src/features/crm/CrmObjectView.test.tsx
git commit -m "feat(crm): CrmObjectView prop hideOpenEditor (hote-fourni)"
```

---

## Task 2 : `CrmActorFiche` — prop `backLabel`

**Files:**
- Modify: `src/features/crm/CrmActorFiche.tsx` (signature de props + 2 libellés hard-codés, lignes ~377 et ~398)
- Test: `src/features/crm/CrmActorFiche.test.tsx`

- [ ] **Step 1 : Écrire le test qui échoue**

Ajouter dans `CrmActorFiche.test.tsx` (le helper `renderFiche` accepte des overrides de props) :

```tsx
  it('utilise le libellé de retour fourni (backLabel)', async () => {
    const props = renderFiche({ backLabel: "Retour à l'établissement" });
    fireEvent.click(await screen.findByRole('button', { name: "Retour à l'établissement" }));
    expect(props.onBack).toHaveBeenCalled();
  });
```

- [ ] **Step 2 : Lancer le test → échec attendu**

Run : `npx jest src/features/crm/CrmActorFiche.test.tsx -t "libellé de retour"`
Expected : FAIL — pas de bouton nommé « Retour à l'établissement » (libellé hard-codé « Annuaire des acteurs »).

- [ ] **Step 3 : Implémenter**

Dans `CrmActorFiche.tsx`, étendre la signature de props :

```tsx
export function CrmActorFiche({
  actorId,
  canWrite,
  onBack,
  onOpenObject,
  backLabel = 'Annuaire des acteurs',
}: {
  actorId: string;
  canWrite: boolean;
  onBack: () => void;
  onOpenObject: (objectId: string) => void;
  /** Libellé du bouton retour (défaut /crm = « Annuaire des acteurs » ; tiroir = « Retour à l'établissement »). */
  backLabel?: string;
}) {
```

Remplacer les DEUX occurrences hard-codées `Annuaire des acteurs` dans les boutons `.crm-back` (branche erreur ~ligne 377 et branche principale ~ligne 398) par `{backLabel}` :

```tsx
        <button type="button" className="crm-back" onClick={onBack}>
          <ChevronLeft size={12} aria-hidden /> {backLabel}
        </button>
```

Mettre à jour le commentaire d'en-tête : « Gate `canWrite` fourni par l'hôte (page-wide sur /crm ; per-objet dans le tiroir éditeur). »

- [ ] **Step 4 : Lancer les tests → succès**

Run : `npx jest src/features/crm/CrmActorFiche.test.tsx`
Expected : PASS (nouveau test + anciens : ceux qui n'overrident pas `backLabel` gardent « Annuaire des acteurs »).

- [ ] **Step 5 : Commit** *(après accord PO)*

```bash
git add bertel-tourism-ui/src/features/crm/CrmActorFiche.tsx bertel-tourism-ui/src/features/crm/CrmActorFiche.test.tsx
git commit -m "feat(crm): CrmActorFiche prop backLabel"
```

---

## Task 3 : `CrmEstablishmentPanel` — nav objet⇄acteur ancrée

**Files:**
- Create: `src/features/crm/CrmEstablishmentPanel.tsx`
- Test: `src/features/crm/CrmEstablishmentPanel.test.tsx`

- [ ] **Step 1 : Écrire le test qui échoue**

Créer `src/features/crm/CrmEstablishmentPanel.test.tsx` (les vraies vues sont mockées — on teste UNIQUEMENT l'orchestration de nav locale ; les vues ont leurs propres specs) :

```tsx
import { render, screen, fireEvent } from '@testing-library/react';
import { CrmEstablishmentPanel } from './CrmEstablishmentPanel';

type ObjViewProps = { onOpenActor: (id: string) => void; onBack: () => void; canWrite: boolean; hideOpenEditor?: boolean };
type ActorViewProps = { onBack: () => void; onOpenObject: (id: string) => void; backLabel?: string; canWrite: boolean };

jest.mock('./CrmObjectView', () => ({
  CrmObjectView: ({ onOpenActor, onBack, canWrite, hideOpenEditor }: ObjViewProps) => (
    <div data-testid="object-view">
      <span>canWrite:{String(canWrite)}</span>
      <span>hideOpenEditor:{String(hideOpenEditor)}</span>
      <button type="button" onClick={() => onOpenActor('actor-9')}>vers acteur</button>
      <button type="button" onClick={onBack}>retour objet</button>
    </div>
  ),
}));
jest.mock('./CrmActorFiche', () => ({
  CrmActorFiche: ({ onBack, onOpenObject, backLabel, canWrite }: ActorViewProps) => (
    <div data-testid="actor-fiche">
      <span>backLabel:{backLabel}</span>
      <span>canWrite:{String(canWrite)}</span>
      <button type="button" onClick={onBack}>retour acteur</button>
      <button type="button" onClick={() => onOpenObject('obj-autre')}>vers autre objet</button>
    </div>
  ),
}));

describe('CrmEstablishmentPanel — nav objet⇄acteur ancrée', () => {
  it('rend la vue établissement par défaut (hideOpenEditor=true)', () => {
    render(<CrmEstablishmentPanel objectId="o1" canWrite onClose={jest.fn()} />);
    expect(screen.getByTestId('object-view')).toBeInTheDocument();
    expect(screen.getByText('hideOpenEditor:true')).toBeInTheDocument();
  });

  it('clic acteur → fiche acteur (backLabel établissement) ; retour → vue établissement', () => {
    render(<CrmEstablishmentPanel objectId="o1" canWrite onClose={jest.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'vers acteur' }));
    expect(screen.getByTestId('actor-fiche')).toBeInTheDocument();
    expect(screen.getByText("backLabel:Retour à l'établissement")).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'retour acteur' }));
    expect(screen.getByTestId('object-view')).toBeInTheDocument();
  });

  it('ancrage strict : depuis la fiche acteur, onOpenObject ramène à la vue établissement', () => {
    render(<CrmEstablishmentPanel objectId="o1" canWrite onClose={jest.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'vers acteur' }));
    fireEvent.click(screen.getByRole('button', { name: 'vers autre objet' }));
    expect(screen.getByTestId('object-view')).toBeInTheDocument();
  });

  it('retour depuis la vue établissement ferme le tiroir (onClose)', () => {
    const onClose = jest.fn();
    render(<CrmEstablishmentPanel objectId="o1" canWrite onClose={onClose} />);
    fireEvent.click(screen.getByRole('button', { name: 'retour objet' }));
    expect(onClose).toHaveBeenCalled();
  });

  it('propage canWrite=false aux vues', () => {
    render(<CrmEstablishmentPanel objectId="o1" canWrite={false} onClose={jest.fn()} />);
    expect(screen.getByText('canWrite:false')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2 : Lancer le test → échec attendu**

Run : `npx jest src/features/crm/CrmEstablishmentPanel.test.tsx`
Expected : FAIL — module `./CrmEstablishmentPanel` introuvable.

- [ ] **Step 3 : Implémenter**

Créer `src/features/crm/CrmEstablishmentPanel.tsx` :

```tsx
'use client';

// Panneau de navigation CRM objet⇄acteur, autonome et ANCRÉ sur UN établissement.
// Réplique minimale de la machine de nav de CrmPage SANS localStorage, SANS route, SANS
// useUiStore. Il monte les VRAIES vues /crm (CrmObjectView ⇄ CrmActorFiche) telles quelles
// → fidélité visuelle garantie. Ancrage strict (décision PO 2026-06-16) : on ne déroule
// jamais un AUTRE établissement — onOpenObject ramène toujours à l'établissement édité.

import { useState } from 'react';
import { CrmObjectView } from './CrmObjectView';
import { CrmActorFiche } from './CrmActorFiche';

export function CrmEstablishmentPanel({
  objectId,
  canWrite,
  onClose,
}: {
  objectId: string;
  canWrite: boolean;
  /** Ferme le tiroir hôte : le bouton retour de la vue établissement est la racine du tiroir. */
  onClose: () => void;
}) {
  // null = vue établissement (par défaut) ; set = fiche de cet acteur (sous-vue glissée).
  const [actorId, setActorId] = useState<string | null>(null);

  if (actorId) {
    return (
      <CrmActorFiche
        actorId={actorId}
        canWrite={canWrite}
        backLabel="Retour à l'établissement"
        onBack={() => setActorId(null)}
        // Ancrage strict : tout clic établissement (même un tiers) ramène à l'objet ancre.
        onOpenObject={() => setActorId(null)}
      />
    );
  }

  return (
    <CrmObjectView
      objectId={objectId}
      backLabel="Suivi CRM"
      canWrite={canWrite}
      hideOpenEditor
      onBack={onClose}
      onOpenActor={(aid) => setActorId(aid)}
    />
  );
}
```

- [ ] **Step 4 : Lancer les tests → succès**

Run : `npx jest src/features/crm/CrmEstablishmentPanel.test.tsx`
Expected : PASS (5 tests).

- [ ] **Step 5 : Commit** *(après accord PO)*

```bash
git add bertel-tourism-ui/src/features/crm/CrmEstablishmentPanel.tsx bertel-tourism-ui/src/features/crm/CrmEstablishmentPanel.test.tsx
git commit -m "feat(crm): CrmEstablishmentPanel (nav objet-acteur ancree)"
```

---

## Task 4 : `EditorCrmDrawer` — coquille Sheet + wrapper `.crm-app`

**Files:**
- Create: `src/features/object-editor/widgets/EditorCrmDrawer.tsx`
- Test: `src/features/object-editor/widgets/EditorCrmDrawer.test.tsx`

- [ ] **Step 1 : Écrire le test qui échoue**

Créer `src/features/object-editor/widgets/EditorCrmDrawer.test.tsx` (panneau mocké → on teste la coquille : présence de l'ancêtre `.crm-app`, ouverture/fermeture) :

```tsx
import { render, screen, fireEvent } from '@testing-library/react';
import { EditorCrmDrawer } from './EditorCrmDrawer';

jest.mock('../../crm/CrmEstablishmentPanel', () => ({
  CrmEstablishmentPanel: () => <div data-testid="crm-panel">panel</div>,
}));

describe('EditorCrmDrawer', () => {
  it('ne rend rien quand fermé', () => {
    render(<EditorCrmDrawer objectId="o1" canWrite open={false} onClose={jest.fn()} />);
    expect(screen.queryByTestId('crm-panel')).not.toBeInTheDocument();
  });

  it('monte le panneau sous un ancêtre .crm-app (overlays des sous-modals)', () => {
    render(<EditorCrmDrawer objectId="o1" canWrite open onClose={jest.fn()} />);
    const panel = screen.getByTestId('crm-panel');
    expect(panel.closest('.crm-app')).not.toBeNull();
  });

  it('appelle onClose au clic sur Fermer', () => {
    const onClose = jest.fn();
    render(<EditorCrmDrawer objectId="o1" canWrite open onClose={onClose} />);
    fireEvent.click(screen.getByRole('button', { name: /fermer/i }));
    expect(onClose).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2 : Lancer le test → échec attendu**

Run : `npx jest src/features/object-editor/widgets/EditorCrmDrawer.test.tsx`
Expected : FAIL — module `./EditorCrmDrawer` introuvable.

- [ ] **Step 3 : Implémenter**

Créer `src/features/object-editor/widgets/EditorCrmDrawer.tsx` :

```tsx
'use client';

// Tiroir CRM local à l'éditeur (§19). Coquille Sheet clonée d'ObjectDrawer, qui enveloppe le
// contenu dans <div className="crm-app"> — OBLIGATOIRE : tout le CSS CRM ET les overlays des
// sous-modals (CrmModal, sans createPortal) sont scopés sous .crm-app (styles.css). Sans cet
// ancêtre, vues + modals s'affichent non stylés / sans overlay. Ne réutilise PAS
// ObjectDrawerShell (lourd : useObjectWorkspaceQuery + usePresenceRoom). Monté via un useState
// LOCAL dans SectionCrm — PAS le useUiStore mono-slot de l'aperçu fiche.

import { X } from 'lucide-react';
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet';
import { CrmEstablishmentPanel } from '../../crm/CrmEstablishmentPanel';

export function EditorCrmDrawer({
  objectId,
  canWrite,
  open,
  onClose,
}: {
  objectId: string;
  canWrite: boolean;
  open: boolean;
  onClose: () => void;
}) {
  return (
    <Sheet open={open} onOpenChange={(isOpen) => { if (!isOpen) onClose(); }}>
      <SheetContent
        side="right"
        showClose={false}
        aria-describedby={undefined}
        className="drawer-panel w-full max-w-[1180px] overflow-hidden border-0 p-0 sm:max-w-[1180px]"
      >
        <SheetTitle className="sr-only">Suivi CRM de l&apos;établissement</SheetTitle>
        <SheetDescription className="sr-only">
          Panneau latéral du suivi relation prestataire : acteurs liés et historique d&apos;interactions.
        </SheetDescription>
        {/* OBLIGATOIRE : ancêtre .crm-app pour styler les vues CRM + leurs sous-modals. */}
        <div className="crm-app">
          <div className="drawer-shell__inner">
            <div className="drawer-header">
              <div className="drawer-header__left">
                <h2 className="font-display text-2xl font-semibold">Suivi CRM</h2>
              </div>
              <div className="drawer-header__actions">
                <button
                  type="button"
                  className="drawer-header__icon-btn drawer-header__icon-btn--plain"
                  onClick={onClose}
                  aria-label="Fermer"
                >
                  <X className="h-5 w-5" strokeWidth={2} />
                </button>
              </div>
            </div>
            <div className="drawer__content">
              <CrmEstablishmentPanel objectId={objectId} canWrite={canWrite} onClose={onClose} />
            </div>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
```

- [ ] **Step 4 : Lancer les tests → succès**

Run : `npx jest src/features/object-editor/widgets/EditorCrmDrawer.test.tsx`
Expected : PASS (3 tests). Radix Sheet portalise dans `document.body` ; `screen` interroge tout le document.

- [ ] **Step 5 : Commit** *(après accord PO)*

```bash
git add bertel-tourism-ui/src/features/object-editor/widgets/EditorCrmDrawer.tsx bertel-tourism-ui/src/features/object-editor/widgets/EditorCrmDrawer.test.tsx
git commit -m "feat(editor): EditorCrmDrawer (coquille Sheet + wrapper crm-app)"
```

---

## Task 5 : Refonte de `SectionCrm` (§19) — synthèse + bouton tiroir

**Files:**
- Modify: `src/features/object-editor/sections/SectionCrm.tsx` (allègement complet)
- Test: `src/features/object-editor/sections/SectionCrm.test.tsx` (réécriture)

- [ ] **Step 1 : Réécrire les tests (RED)**

Remplacer INTÉGRALEMENT le contenu de `SectionCrm.test.tsx` par (les tests repeater/formulaires/cold-start/anti-mock sont hors-scope ; le tiroir est mocké pour isoler §19) :

```tsx
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
  it('rend les KPIs et la distribution de sujets depuis providerFollowUp', () => {
    const { result } = renderHook(() => useObjectEditorState('o1', fixtureWithCrm()));
    render(<SectionCrm editor={result.current} permissions={allowAll} objectId="o1" />);
    expect(screen.getByText('Interactions totales')).toBeInTheDocument();
    expect(screen.getByText('Demande de visite — 1')).toBeInTheDocument();
  });

  it('le bouton « Ouvrir le suivi CRM » ouvre le tiroir', () => {
    const { result } = renderHook(() => useObjectEditorState('o1', fixtureWithCrm()));
    render(<SectionCrm editor={result.current} permissions={allowAll} objectId="o1" />);
    expect(screen.queryByTestId('crm-drawer')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /ouvrir le suivi crm/i }));
    expect(screen.getByTestId('crm-drawer')).toBeInTheDocument();
  });

  it('sans permission crm : bandeau lecture seule + raison, bouton actif, tiroir canWrite=false', () => {
    const { result } = renderHook(() => useObjectEditorState('o1', fixtureWithCrm()));
    const noCrm = {
      ...allowAll,
      crm: { canDirectWrite: false, canPrepareProposal: false, canSubmitProposal: false, disabledReason: 'Permission « Écrire des notes CRM » requise (administration d’équipe).' },
    };
    render(<SectionCrm editor={result.current} permissions={noCrm} objectId="o1" />);
    expect(screen.getByText(/Écrire des notes CRM/)).toBeInTheDocument();
    const openBtn = screen.getByRole('button', { name: /ouvrir le suivi crm/i });
    expect(openBtn).toBeEnabled();
    fireEvent.click(openBtn);
    expect(screen.getByTestId('crm-drawer')).toHaveTextContent('drawer:o1:false');
  });

  it('bouton désactivé quand objectId absent', () => {
    const { result } = renderHook(() => useObjectEditorState('o1', fixtureWithCrm()));
    render(<SectionCrm editor={result.current} permissions={allowAll} />);
    expect(screen.getByRole('button', { name: /ouvrir le suivi crm/i })).toBeDisabled();
  });

  it('affiche la raison d indisponibilité quand le module n est pas chargé', () => {
    const { result } = renderHook(() => useObjectEditorState('o1', fullModulesFixture()));
    render(<SectionCrm editor={result.current} permissions={allowAll} objectId="o1" />);
    expect(screen.getByText(/n'expose pas encore les interactions CRM/)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2 : Lancer les tests → échec attendu**

Run : `npx jest src/features/object-editor/sections/SectionCrm.test.tsx`
Expected : FAIL — l'ancien `SectionCrm` n'a ni bouton « Ouvrir le suivi CRM » ni le tiroir mocké rendu ; les nouvelles assertions échouent.

- [ ] **Step 3 : Réécrire `SectionCrm.tsx` (GREEN)**

Remplacer INTÉGRALEMENT le contenu de `SectionCrm.tsx` par :

```tsx
import { useState } from 'react';
import { Chip, ChipSet, Fs, StatCard } from '../primitives';
import type { SectionProps } from './section-types';
import { listObjectCrm } from '../../../services/crm';
import { EditorCrmDrawer } from '../widgets/EditorCrmDrawer';

const YEAR_MS = 365 * 86_400_000;

function formatShortDate(value: string) {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) {
    return value || '—';
  }
  return new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(timestamp));
}

/**
 * §19 Suivi prestataire (CRM) — carte de SYNTHÈSE en mode édité : 4 KPIs (depuis
 * editor.draft.providerFollowUp), distribution des sujets normalisés (demand_topic) et rappel
 * des notes internes (lecture seule, §43). L'authoring (interactions / tâches / fiche acteur)
 * vit dans un TIROIR latéral (EditorCrmDrawer) qui monte la VRAIE section CRM
 * (CrmObjectView ⇄ CrmActorFiche), gaté par la permission PAR OBJET `permissions.crm`
 * (api.user_can_write_crm — JAMAIS le helper page-wide userCanWriteCrmNotes : write-trap).
 * À la fermeture du tiroir, refreshCrm() resynchronise les KPIs ; providerFollowUp est un module
 * READONLY pour la save bar ⇒ replaceModule ne crée pas de dirty fantôme.
 */
export function SectionCrm({ editor, permissions, objectId, folded }: SectionProps) {
  const followUp = editor.draft.providerFollowUp;
  const interactions = followUp.interactions;
  const topics = followUp.topics;
  const access = permissions.crm;
  const canWrite = Boolean(access?.canDirectWrite);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const now = Date.now();
  const occurredTimestamps = interactions
    .map((item) => (item.occurredAt ? Date.parse(item.occurredAt) : Number.NaN))
    .filter((timestamp) => Number.isFinite(timestamp));
  const last12Months = occurredTimestamps.filter((timestamp) => now - timestamp <= YEAR_MS).length;
  const lastContact = occurredTimestamps.length > 0 ? new Date(Math.max(...occurredTimestamps)).toISOString() : null;

  // Resync des KPIs après une session d'écriture dans le tiroir. providerFollowUp est READONLY
  // pour la save bar ⇒ replaceModule ne crée pas de dirty fantôme.
  async function refreshCrm() {
    if (!objectId) return;
    const fresh = await listObjectCrm(objectId);
    editor.replaceModule('providerFollowUp', {
      ...followUp,
      interactions: fresh.interactions,
      topics: fresh.topics,
      interactionsUnavailableReason: null,
      tasksUnavailableReason: null,
    });
  }

  const pillLabel = followUp.interactionsUnavailableReason
    ? 'Non chargé'
    : `${interactions.length} interaction(s)`;

  return (
    <Fs
      num="19"
      title="Suivi prestataire (CRM)"
      sub="Interactions, demandes, sujets normalisés (demand_topic) · pilotage OTI"
      folded={folded}
      pill={{ tone: interactions.length > 0 ? 'ok' : 'warn', label: pillLabel }}
    >
      {!canWrite && (
        <p
          style={{
            fontSize: 12,
            color: 'var(--ink-4)',
            margin: '0 0 12px',
            padding: '8px 12px',
            borderRadius: 'var(--r-md)',
            background: 'var(--bg-tint)',
            border: '1px solid var(--line-soft)',
          }}
        >
          <strong style={{ color: 'var(--ink-3)' }}>Lecture seule.</strong>{' '}
          {access?.disabledReason ?? followUp.interactionsUnavailableReason}
        </p>
      )}

      <div className="grid-4" style={{ marginBottom: 14 }}>
        <StatCard label="Interactions / 12 mois" value={String(last12Months)} />
        <StatCard label="Dernier contact" value={lastContact ? formatShortDate(lastContact) : '—'} />
        <StatCard label="Interactions totales" value={String(interactions.length)} />
        <StatCard label="Sujets distincts" value={String(topics.length)} />
      </div>

      <div className="chip-group__label" style={{ marginTop: 0 }}>Sujets normalisés (demand_topic) — distribution réelle</div>
      {topics.length > 0 ? (
        <ChipSet>
          {topics.map((topic) => (
            <Chip key={topic.code} label={`${topic.name} — ${topic.count}`} on />
          ))}
        </ChipSet>
      ) : (
        <p style={{ fontSize: 12, color: 'var(--ink-4)' }}>Aucun sujet relevé pour cette fiche.</p>
      )}

      <div style={{ display: 'flex', gap: 6, marginTop: 14, flexWrap: 'wrap' }}>
        <button
          type="button"
          className="rep-add"
          style={{ marginTop: 0 }}
          disabled={!objectId}
          title={!objectId ? 'Enregistrez la fiche pour accéder au suivi CRM.' : undefined}
          onClick={() => setDrawerOpen(true)}
        >
          Ouvrir le suivi CRM{interactions.length > 0 ? ` · ${interactions.length}` : ''}
        </button>
      </div>

      {followUp.interactionsUnavailableReason && (
        <p style={{ fontSize: 12, color: 'var(--ink-4)', marginTop: 8 }}>
          {followUp.interactionsUnavailableReason}
        </p>
      )}

      {followUp.notes.length > 0 && (
        <>
          <div className="chip-group__label" style={{ marginTop: 14 }}>
            Notes internes — gérées dans le panneau latéral (§43)
          </div>
          {followUp.notes.slice(0, 3).map((note) => (
            <p key={note.id} style={{ fontSize: 12, color: 'var(--ink-3)', margin: '2px 0' }}>
              {formatShortDate(note.updatedAt || note.createdAt)} · {note.createdByName} — {note.body}
            </p>
          ))}
        </>
      )}

      {objectId && (
        <EditorCrmDrawer
          objectId={objectId}
          canWrite={canWrite}
          open={drawerOpen}
          onClose={() => {
            setDrawerOpen(false);
            void refreshCrm();
          }}
        />
      )}
    </Fs>
  );
}
```

- [ ] **Step 4 : Lancer les tests → succès**

Run : `npx jest src/features/object-editor/sections/SectionCrm.test.tsx`
Expected : PASS (5 tests).

- [ ] **Step 5 : Commit** *(après accord PO)*

```bash
git add bertel-tourism-ui/src/features/object-editor/sections/SectionCrm.tsx bertel-tourism-ui/src/features/object-editor/sections/SectionCrm.test.tsx
git commit -m "refactor(editor): §19 CRM en synthese KPIs + tiroir (retrait repeater/formulaires inline)"
```

---

## Task 6 : Vérification globale + documentation

**Files:**
- Modify: `bertel-tourism-ui/claude_brief/lot1_mapping_decisions.md` (nouvelle décision)
- Mémoire MCP (rafraîchir après le log)

- [ ] **Step 1 : Suite Jest CRM + éditeur**

Run : `npx jest src/features/crm src/features/object-editor/sections/SectionCrm.test.tsx src/features/object-editor/widgets/EditorCrmDrawer.test.tsx`
Expected : PASS — aucune régression sur les vues `/crm` (props optionnelles, défauts inchangés).

- [ ] **Step 2 : Typecheck**

Run : `npm run typecheck`
Expected : 0 erreur.

- [ ] **Step 3 : Build (exclut les tests)**

Run : `npm run build`
Expected : build réussi.

- [ ] **Step 4 : Vérification navigateur** (preview_* — NE PAS demander au PO de vérifier à la main)

Sur `/objects/<id>/edit`, section §19 :
1. KPIs + chips + bouton « Ouvrir le suivi CRM » rendus (plus de tableau repeater / formulaires inline).
2. Clic bouton → le tiroir glisse depuis la droite, **stylé** (fidélité `/crm`) — confirme le wrapper `.crm-app`.
3. Le rail « Acteurs liés » est cliquable → clic acteur → fiche acteur **glissée** (bouton retour « Retour à l'établissement »).
4. Bouton « Nouvelle interaction » → un sous-modal s'ouvre **avec overlay/centré** (confirme `.crm-app` + z-index) ; **Escape ferme le modal, pas le tiroir**.
5. À 1180px les grilles 2-colonnes des vues CRM tiennent (pas d'overflow).
6. Après une écriture puis fermeture du tiroir, les KPIs §19 reflètent le changement.
7. Capturer une preuve (`preview_screenshot`).

- [ ] **Step 5 : Documentation — décision**

Ajouter une entrée dans `bertel-tourism-ui/claude_brief/lot1_mapping_decisions.md` : « §19 « Suivi prestataire » passe en synthèse (4 KPIs + chips sujets + notes) + tiroir `EditorCrmDrawer` montant la VRAIE section CRM (`CrmObjectView` ⇄ `CrmActorFiche`) verbatim. **Invariant** : monter une vue CRM hors `/crm` exige un ancêtre `<div className="crm-app">` (CSS + overlays `CrmModal` scopés, `CrmModal` sans `createPortal`). Gate d'écriture du tiroir = `permissions.crm.canDirectWrite` (per-objet `user_can_write_crm`), fourni par l'hôte ; jamais `userCanWriteCrmNotes` (write-trap). Ancrage strict : le tiroir ne déroule jamais un autre établissement. KPIs resync via `refreshCrm`/`replaceModule` à la fermeture (module READONLY, pas de dirty). »

- [ ] **Step 6 : Mémoire MCP** — rafraîchir après le log (ajouter l'observation : §19 KPIs + tiroir CRM verbatim ; invariant `.crm-app` ; gate per-objet hôte-fourni).

- [ ] **Step 7 : Commit doc** *(après accord PO)*

```bash
git add "bertel-tourism-ui/claude_brief/lot1_mapping_decisions.md"
git commit -m "docs(editor): decision §19 CRM en synthese + tiroir (invariant crm-app)"
```

---

## Self-Review

**Spec coverage :**
- §19 → KPIs + chips + notes + bouton → **Task 5** ✓
- Tiroir Sheet + wrapper `.crm-app` → **Task 4** ✓
- Liste acteurs → clic → interactions (CrmObjectView ⇄ CrmActorFiche verbatim) → **Task 3** ✓
- Gate per-objet `canDirectWrite` → **Task 5** (prop `canWrite`) + propagation Tasks 3/4 ✓
- `hideOpenEditor` / `backLabel` (props hôte-fournies) → **Tasks 1/2** ✓
- Ancrage strict (décision PO) → **Task 3** (`onOpenObject → setActorId(null)`) ✓
- Garder chips + notes (décision PO) → **Task 5** ✓
- Pas de bouton tâche objet (décision PO) → aucun ajout (✓ par omission)
- Resync KPIs → **Task 5** (`onClose → refreshCrm`) ✓
- Largeur 1180px → **Task 4** ✓
- Tests TDD (5 fichiers) + vérif build/tsc/navigateur → **Tasks 1-6** ✓

**Placeholder scan :** aucun « TBD/TODO » ; tout le code est complet ; commandes + sorties attendues fournies.

**Type consistency :** `CrmEstablishmentPanel` props `{objectId, canWrite, onClose}` cohérentes entre Task 3 (création/test) et Task 4 (consommation). `EditorCrmDrawer` props `{objectId, canWrite, open, onClose}` cohérentes entre Task 4 (création/test) et Task 5 (consommation). `hideOpenEditor`/`backLabel` ajoutées Tasks 1/2 et consommées Task 3. `refreshCrm` lit `editor.draft.providerFollowUp` + `editor.replaceModule` (API existante, inchangée).

**Écart spec assumé & documenté :** `onAfterWrite` retiré au profit d'un resync à la fermeture uniquement (justifié en tête de plan — KPIs invisibles pendant l'édition, surface partagée minimale).
