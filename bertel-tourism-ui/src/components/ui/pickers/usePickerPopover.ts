'use client';

// Positionnement du popover des pickers maison (SearchSelect / SearchMultiSelect).
//
// POURQUOI UN PORTAIL, ET PAS UN SIMPLE `position: fixed`
// ------------------------------------------------------
// Le panneau était `position: absolute` : il se faisait donc DÉCOUPER par le premier
// ancêtre à `overflow` non visible. Dans un modal CRM, cet ancêtre est
// `.crm-modal__body { overflow-y: auto }` — mesuré en navigateur sur « Nouvelle tâche » :
// panneau de 163 px dont 44 px visibles, ZÉRO option atteignable sans scroller le modal.
//
// Un `position: fixed` nu ne suffit PAS : `.motion-page-enter` (l'enveloppe d'animation
// d'entrée de page) porte un `transform`, ce qui en fait un CONTAINING BLOCK pour les
// descendants `fixed`. Les coordonnées issues de `getBoundingClientRect()` (viewport)
// seraient alors décalées de la translation en cours. Seul un portail hors de cet
// ancêtre rend `fixed` équivalent au viewport. C'est déjà le choix de
// `components/dashboard/FilterDropdown.tsx`, dont ce hook reprend la mécanique.
//
// TOKENS : `--r-md`, `--accent` et `--accent-tint` ne sont PAS sur `:root` — ils sont
// déclarés sur `.crm-app` et `.object-editor` (et varient par type d'objet via
// `.object-editor.acc-*`). Un panneau portalisé sous `<body>` en sortirait et perdrait
// son rayon et sa teinte de focus. On les recopie donc depuis le DÉCLENCHEUR, qui, lui,
// est resté dans le scope. Ajouter un token au CSS du panneau ⇒ l'ajouter ici.

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';

/**
 * `useLayoutEffect` côté client, `useEffect` au pré-rendu (où il n'a pas de sens et
 * déclencherait un avertissement React). Le positionnement DOIT précéder la peinture :
 * en `useEffect` le panneau est peint une frame en pleine largeur, en bas du document,
 * avant d'être replacé — un clignotement bien visible.
 */
const useIsomorphicLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;

/**
 * Hauteur maximale du panneau. DOIT rester égale à `.picker__panel { max-height }`
 * (src/styles.css) : c'est elle qui décide de la bascule au-dessus du déclencheur.
 * Désynchroniser les deux ferait décider la bascule sur une hauteur fausse.
 */
export const PICKER_PANEL_MAX_HEIGHT = 280;

/** Marge minimale conservée entre le panneau et les bords du viewport. */
const VIEWPORT_MARGIN = 8;

/**
 * Tokens que le CSS du panneau consomme et qui ne vivent PAS sur `:root`.
 * Les autres (`--surface`, `--line`, `--ink*`, `--surface-2`, `--bg-tint`, `--shadow-m`)
 * sont globaux et héritent naturellement jusqu'à `<body>`.
 */
const SCOPED_TOKENS = ['--r-md', '--accent', '--accent-tint'] as const;

export interface PickerPopover {
  /** Faux tant que le premier montage client n'a pas eu lieu (createPortal exige document). */
  mounted: boolean;
  /** À poser sur le BOUTON déclencheur — jamais sur la racine `.picker` (qui englobe les puces). */
  triggerRef: React.RefObject<HTMLButtonElement | null>;
  /** À poser sur `.picker__panel`. */
  panelRef: React.RefObject<HTMLDivElement | null>;
  /** Style inline du panneau : position fixe calculée + tokens recopiés du scope hôte. */
  panelStyle: React.CSSProperties;
}

/**
 * @param open      le popover est-il affiché
 * @param onClose   fermeture demandée par un clic hors du déclencheur ET du panneau
 * @param reflowKey valeur qui change quand le CONTENU du panneau change de taille
 *                  (typiquement la saisie de recherche) — déclenche un recalcul.
 */
export function usePickerPopover(open: boolean, onClose: () => void, reflowKey: unknown): PickerPopover {
  const [mounted, setMounted] = useState(false);
  // Le panneau naît HORS FLUX et invisible. Ce n'est pas de la cosmétique : rendu en flux
  // sous <body>, il allonge le document, fait apparaître la barre de défilement, ce qui
  // rétrécit le viewport et RECENTRE le modal — la mesure du déclencheur partait alors
  // d'une position déjà déplacée (constaté : 4 px d'écart persistant, la barre disparaissant
  // ensuite quand le panneau passait en `fixed`). Il ne devient visible qu'une fois placé.
  const [position, setPosition] = useState<React.CSSProperties>({
    position: 'fixed',
    top: 0,
    left: 0,
    visibility: 'hidden',
  });
  const [tokens, setTokens] = useState<React.CSSProperties>({});
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);

  // Garde SSR : `createPortal` exige `document.body`, absent au pré-rendu Next.
  useEffect(() => {
    setMounted(true);
  }, []);

  const updatePosition = useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    // Le clamp horizontal se fait sur la largeur du DÉCLENCHEUR, jamais sur celle mesurée
    // du panneau. Mesuré (2026-08-28) : au premier calcul le panneau est déjà monté sous
    // <body> mais PAS encore positionné — c'est donc un bloc en pleine largeur de page
    // (1280 px), et le clamp le rabattait à `left: 8`, à l'opposé de son déclencheur.
    // `minWidth: rect.width` + le `max-width` du CSS garantissent que la largeur réelle
    // ne descend pas sous celle du déclencheur ni ne déborde du viewport.
    const left = Math.min(
      Math.max(VIEWPORT_MARGIN, rect.left),
      Math.max(VIEWPORT_MARGIN, viewportWidth - rect.width - VIEWPORT_MARGIN),
    );
    // Bascule au-dessus quand la place manque dessous ET qu'il y en a davantage dessus.
    // On raisonne sur la hauteur MAXIMALE, pas la hauteur réelle : à l'ouverture le
    // panneau n'est pas encore monté, et un panneau court qui bascule inutilement reste
    // lisible, alors qu'un panneau long qui ne bascule pas est tronqué.
    const spaceBelow = viewportHeight - rect.bottom;
    const openUp = spaceBelow < PICKER_PANEL_MAX_HEIGHT + VIEWPORT_MARGIN && rect.top > spaceBelow;
    const common = { position: 'fixed', left, minWidth: rect.width, visibility: 'visible' } as const;
    setPosition(
      openUp
        ? { ...common, bottom: viewportHeight - rect.top + 4 }
        : { ...common, top: rect.bottom + 4 },
    );
  }, []);

  // Recopie des tokens du scope hôte (voir l'en-tête). Lue sur le déclencheur À L'OUVERTURE :
  // c'est le moment où le thème (y compris le branding par ORG injecté au runtime) est résolu.
  useEffect(() => {
    const trigger = triggerRef.current;
    if (!open || !trigger) return;
    const computed = window.getComputedStyle(trigger);
    const copied: Record<string, string> = {};
    for (const token of SCOPED_TOKENS) {
      const value = computed.getPropertyValue(token).trim();
      // Une valeur vide signifie « non résolu ici » (jsdom, ou token réellement absent) :
      // on ne l'écrit pas, la feuille de style garde alors la main.
      if (value !== '') copied[token] = value;
    }
    setTokens(copied as React.CSSProperties);
  }, [open]);

  useIsomorphicLayoutEffect(() => {
    if (!open) return;
    updatePosition();
    // `true` = phase de CAPTURE : le panneau doit suivre le défilement de N'IMPORTE quel
    // conteneur scrollable intermédiaire (le corps du modal notamment), pas seulement
    // celui de la fenêtre — un événement `scroll` d'élément ne remonte pas en bulle.
    window.addEventListener('scroll', updatePosition, true);
    window.addEventListener('resize', updatePosition);
    return () => {
      window.removeEventListener('scroll', updatePosition, true);
      window.removeEventListener('resize', updatePosition);
    };
    // `reflowKey` : la recherche change la hauteur réelle du panneau ⇒ re-clamp.
  }, [open, reflowKey, updatePosition]);

  // Clic extérieur. Le panneau n'est PLUS un descendant de la racine `.picker` (il est
  // portalisé) : tester le seul conteneur du déclencheur fermerait le popover sur le
  // `mousedown` d'une option, AVANT que le `click` n'atterrisse — la sélection serait
  // silencieusement perdue. Les DEUX refs doivent être consultées.
  useEffect(() => {
    if (!open) return;
    function onDocMouseDown(event: MouseEvent) {
      const target = event.target as Node;
      if (triggerRef.current?.contains(target) || panelRef.current?.contains(target)) return;
      onClose();
    }
    document.addEventListener('mousedown', onDocMouseDown);
    return () => document.removeEventListener('mousedown', onDocMouseDown);
  }, [open, onClose]);

  return {
    mounted,
    triggerRef,
    panelRef,
    panelStyle: {
      ...tokens,
      ...position,
      zIndex: 200,
      // Radix (Dialog/Sheet) pose `pointer-events: none` sur <body> pendant qu'une couche
      // modale est ouverte. Un panneau portalisé sous <body> en hériterait et deviendrait
      // inerte (cas réel : les pickers du CRM dans EditorCrmDrawer, qui est un Sheet Radix).
      pointerEvents: 'auto',
    },
  };
}
