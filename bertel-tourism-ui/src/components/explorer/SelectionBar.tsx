'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Download, ListPlus, Printer, ShoppingBag, Trash2 } from 'lucide-react';
import { useExplorerStore } from '../../store/explorer-store';
import { useSessionStore } from '../../store/session-store';
import { exportSelectedObjectsCsv } from '@/services/selection-export';
import { createListFromSelection } from '@/services/lists';
import { getObjectResource } from '../../services/rpc';
import { OtiCarnetCard, type OtiPoi } from '@/features/lists/OtiTemplate';
import { preloadImages, selectionDetailToOtiPoi } from './selection-print';
import { cn } from '@/lib/utils';

/**
 * Floating selection bar over the map (and the liste/table views).
 *
 * Positioned absolutely at the bottom of the parent (MapPanel's `.map-canvas`).
 * The bar adapts to the selection: with nothing selected it only shows the
 * count chip and « Sélection » (select all visible); the actions that need a
 * selection (Imprimer / CSV / Vider / Créer une liste) appear once at least
 * one fiche is selected. `flex-wrap` keeps every button inside the rounded
 * bar on narrow panels (the CTA used to overflow past the bar's edge).
 */
export function SelectionBar() {
  const selectedObjectIds = useExplorerStore((state) => state.selectedObjectIds);
  const selectAllVisible = useExplorerStore((state) => state.selectAllVisible);
  const clearSelection = useExplorerStore((state) => state.clearSelection);
  const langPrefs = useSessionStore((state) => state.langPrefs);
  const [exporting, setExporting] = useState(false);
  const [creating, setCreating] = useState(false);
  const [printing, setPrinting] = useState(false);
  // Cartes prêtes à imprimer : non-vide ⇒ le portail .oti-print-portal est monté.
  const [printPois, setPrintPois] = useState<OtiPoi[]>([]);
  const router = useRouter();
  const count = selectedObjectIds.length;
  const empty = count === 0;

  // « Créer une liste » : la sélection active devient une liste STATIQUE (figée), puis on
  // ouvre la composition où le conseiller la nomme, l'annote, l'imprime, l'envoie ou la partage.
  async function handleCreateList() {
    if (empty || creating) return;
    setCreating(true);
    try {
      const name = `Sélection · ${count} ${count > 1 ? 'lieux' : 'lieu'}`;
      const id = await createListFromSelection(name, selectedObjectIds);
      router.push(`/listes/${id}`);
    } finally {
      setCreating(false);
    }
  }

  // Imprimer = les cartes « carnet » du module Listes (accroche, photo, contacts publics),
  // sans hero ni pied de liste : on monte un portail .oti-print-portal (révélé par le
  // @media print d'oti-template.css, pagination insécable + pied « OTI du Sud · n/N »),
  // puis window.print(). Données : la ressource complète de chaque fiche sélectionnée.
  async function handlePrintSelection() {
    if (empty || printing) return;
    setPrinting(true);
    try {
      const details = await Promise.all(selectedObjectIds.map((id) => getObjectResource(id, langPrefs)));
      const pois = details.map(selectionDetailToOtiPoi);
      // Le portail est display:none : on chauffe le cache des visuels avant d'ouvrir
      // l'aperçu d'impression, sinon les photos peuvent manquer au premier rendu.
      await preloadImages(pois.map((poi) => poi.image));
      setPrintPois(pois);
    } catch {
      toast.error('Impression impossible — le chargement des fiches a échoué.');
    } finally {
      setPrinting(false);
    }
  }

  // Le portail vient d'être monté (commit DOM fait au moment de l'effet) : on imprime,
  // puis on le démonte à la fermeture du dialogue pour ne pas capturer les Ctrl+P
  // suivants de la page (le tiroir objet a sa propre impression).
  useEffect(() => {
    if (printPois.length === 0) return;
    const unmountPortal = () => setPrintPois([]);
    window.addEventListener('afterprint', unmountPortal);
    window.print();
    return () => window.removeEventListener('afterprint', unmountPortal);
  }, [printPois]);

  async function handleExportCsv() {
    if (empty) return;
    setExporting(true);
    try {
      await exportSelectedObjectsCsv(selectedObjectIds, langPrefs);
    } finally {
      setExporting(false);
    }
  }

  const idleAction =
    'inline-flex h-[30px] shrink-0 items-center gap-1.5 rounded-[9px] px-3 text-[12.5px] font-semibold transition';
  const enabledAction = `${idleAction} text-white/85 hover:bg-white/10 hover:text-white`;
  const disabledAction = `${idleAction} cursor-not-allowed text-white/40 hover:bg-transparent`;

  return (
    <div
      className="pointer-events-auto absolute bottom-4 left-1/2 z-30 flex max-w-[calc(100%-2rem)] -translate-x-1/2 flex-wrap items-center justify-center gap-1 rounded-[14px] bg-ink p-1.5 text-white shadow-l"
      role="toolbar"
      aria-label="Actions de selection"
    >
      <span className="inline-flex shrink-0 items-center gap-2 pl-2 pr-3 text-[12.5px] font-semibold tabular-nums">
        <span
          data-selection-count-anchor
          className={cn(
            'grid h-[22px] w-[22px] place-items-center rounded-[6px] text-[11px] font-bold text-white',
            empty ? 'bg-white/15' : 'bg-orange',
          )}
        >
          {count}
        </span>
        <span>{count > 1 ? 'fiches' : 'fiche'}</span>
      </span>

      <span className="h-[18px] w-px shrink-0 bg-white/15" aria-hidden />

      <button
        type="button"
        onClick={() => {
          // D9 : « tout sélectionner » n'est plus silencieux — compte + Annuler
          // (risqué à 500+ fiches : la sélection précédente est restaurable).
          const previous = selectedObjectIds;
          selectAllVisible();
          const next = useExplorerStore.getState().selectedObjectIds.length;
          if (next === 0) {
            toast.warning('Aucune fiche visible à sélectionner.');
            return;
          }
          toast.info(`${next} fiche${next > 1 ? 's' : ''} sélectionnée${next > 1 ? 's' : ''}`, {
            action: {
              label: 'Annuler',
              onClick: () => useExplorerStore.getState().replaceSelection(previous),
            },
          });
        }}
        className={enabledAction}
      >
        <ShoppingBag className="h-3.5 w-3.5 shrink-0" />
        Sélection
      </button>

      {/* Les actions qui exigent une sélection n'existent que lorsqu'il y en a une :
          la barre reste minimale (compteur + Sélection) tant que rien n'est coché. */}
      {!empty && (
        <>
          <button
            type="button"
            disabled={printing}
            onClick={() => void handlePrintSelection()}
            title="Imprimer les fiches sélectionnées (cartes du carnet OTI)"
            className={printing ? disabledAction : enabledAction}
          >
            <Printer className="h-3.5 w-3.5 shrink-0" />
            {printing ? 'Préparation…' : 'Imprimer'}
          </button>
          <button
            type="button"
            disabled={exporting}
            onClick={() => void handleExportCsv()}
            className={exporting ? disabledAction : enabledAction}
          >
            <Download className="h-3.5 w-3.5 shrink-0" />
            CSV
          </button>
          <button type="button" onClick={() => clearSelection()} className={enabledAction}>
            <Trash2 className="h-3.5 w-3.5 shrink-0" />
            Vider
          </button>

          <span className="h-[18px] w-px shrink-0 bg-white/15" aria-hidden />

          {/* La sélection active se transforme en LISTE (statique) : imprimer / envoyer / partager
              se font ensuite depuis le module Listes. Remplace l'ancien « Envoyer » inerte. */}
          <button
            type="button"
            disabled={creating}
            onClick={() => void handleCreateList()}
            title="Transformer la sélection en liste (imprimer, envoyer, partager)"
            className={cn(
              'inline-flex h-[30px] shrink-0 items-center gap-1.5 rounded-[9px] px-3 text-[12.5px] font-semibold transition',
              creating ? 'cursor-not-allowed bg-orange/30 text-white/70' : 'bg-orange text-white hover:bg-orange/90',
            )}
          >
            <ListPlus className="h-3.5 w-3.5 shrink-0" />
            {creating ? 'Création…' : 'Créer une liste'}
          </button>
        </>
      )}

      {/* Portail d'impression : les cartes carnet des fiches sélectionnées, rendues sous
          <body> et révélées uniquement à l'impression (cf. @media print, oti-template.css).
          Monté seulement le temps du dialogue — jamais de hero/pied de liste ici. */}
      {printPois.length > 0 &&
        createPortal(
          <div className="oti-print-portal">
            <div className="oti">
              <div className="oti-body">
                <div className="oti-carnet">
                  {printPois.map((poi, index) => (
                    <OtiCarnetCard key={poi.id} poi={poi} index={index} lang="fr" advisorFirst="" />
                  ))}
                </div>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}
