'use client';

import { useState } from 'react';
import { Download, Mail, Printer, ShoppingBag, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { useExplorerStore } from '../../store/explorer-store';
import { useSessionStore } from '../../store/session-store';
import { exportSelectedObjectsCsv } from '@/services/selection-export';
import { getObjectResource } from '../../services/rpc';
import { cn } from '@/lib/utils';

/**
 * Floating selection bar over the map.
 *
 * Positioned absolutely at the bottom of the parent (MapPanel's `.map-canvas`).
 * Always visible — the bar is the persistent action surface for the Explorer
 * (Sélection / Imprimer / CSV / Vider / Envoyer). When nothing is selected
 * the count chip shows "0" and the destructive/export actions are disabled,
 * but the bar itself stays mounted as a visual landmark.
 */
export function SelectionBar() {
  const selectedObjectIds = useExplorerStore((state) => state.selectedObjectIds);
  const selectAllVisible = useExplorerStore((state) => state.selectAllVisible);
  const clearSelection = useExplorerStore((state) => state.clearSelection);
  const langPrefs = useSessionStore((state) => state.langPrefs);
  const [exporting, setExporting] = useState(false);
  const count = selectedObjectIds.length;
  const empty = count === 0;

  async function handlePrintSelection() {
    if (empty) return;

    const details = await Promise.all(selectedObjectIds.map((id) => getObjectResource(id, langPrefs)));
    const rowsHtml = details
      .map((d) => {
        const location = d.raw?.location as { address?: unknown; city?: unknown } | undefined;
        const address = typeof location?.address === 'string' ? location.address : '';
        const city = typeof location?.city === 'string' ? location.city : '';
        return `<tr><td>${d.id}</td><td>${d.name}</td><td>${d.type ?? ''}</td><td>${city}</td><td>${address}</td></tr>`;
      })
      .join('');

    const html = `
      <html>
        <head>
          <title>Selection</title>
          <style>
            body { font-family: sans-serif; padding: 20px; }
            table { width: 100%; border-collapse: collapse; }
            th, td { border: 1px solid #ddd; padding: 8px; font-size: 12px; text-align: left; }
            th { background: #f5f5f5; }
          </style>
        </head>
        <body>
          <h1>Selection (${details.length})</h1>
          <table>
            <thead><tr><th>ID</th><th>Nom</th><th>Type</th><th>Ville</th><th>Adresse</th></tr></thead>
            <tbody>${rowsHtml}</tbody>
          </table>
        </body>
      </html>
    `;

    const w = window.open('', '_blank');
    if (!w) return;
    w.document.write(html);
    w.document.close();
    w.focus();
    w.print();
  }

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
      className="pointer-events-auto absolute bottom-4 left-1/2 z-30 flex max-w-[calc(100%-2rem)] -translate-x-1/2 items-center gap-1 rounded-[14px] bg-ink p-1.5 text-white shadow-l"
      role="toolbar"
      aria-label="Actions de selection"
    >
      <span className="inline-flex shrink-0 items-center gap-2 pl-2 pr-3 text-[12.5px] font-semibold tabular-nums">
        <span
          className={cn(
            'grid h-[22px] w-[22px] place-items-center rounded-[6px] text-[11px] font-bold text-white',
            empty ? 'bg-white/15' : 'bg-orange',
          )}
        >
          {count}
        </span>
        <span>{count > 1 ? 'fiches' : 'fiche'}</span>
      </span>

      <span className="h-[18px] w-px bg-white/15" aria-hidden />

      <button
        type="button"
        onClick={() => selectAllVisible()}
        className={enabledAction}
      >
        <ShoppingBag className="h-3.5 w-3.5 shrink-0" />
        Sélection
      </button>
      <button
        type="button"
        disabled={empty}
        onClick={() => void handlePrintSelection()}
        className={empty ? disabledAction : enabledAction}
      >
        <Printer className="h-3.5 w-3.5 shrink-0" />
        Imprimer
      </button>
      <button
        type="button"
        disabled={empty || exporting}
        onClick={() => void handleExportCsv()}
        className={empty || exporting ? disabledAction : enabledAction}
      >
        <Download className="h-3.5 w-3.5 shrink-0" />
        CSV
      </button>
      <button
        type="button"
        disabled={empty}
        onClick={() => clearSelection()}
        className={empty ? disabledAction : enabledAction}
      >
        <Trash2 className="h-3.5 w-3.5 shrink-0" />
        Vider
      </button>

      <span className="h-[18px] w-px bg-white/15" aria-hidden />

      <button
        type="button"
        disabled={empty}
        onClick={() => {
          if (!empty) toast.info('Envoi par mail : bientôt disponible.');
        }}
        className={cn(
          'inline-flex h-[30px] shrink-0 items-center gap-1.5 rounded-[9px] px-3 text-[12.5px] font-semibold text-white transition',
          empty ? 'cursor-not-allowed bg-orange/40' : 'bg-orange hover:bg-orange-2',
        )}
      >
        <Mail className="h-3.5 w-3.5 shrink-0" />
        Envoyer
      </button>
    </div>
  );
}
