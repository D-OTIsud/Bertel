'use client';

import { useState } from 'react';
import { Download, Mail, Printer, ShoppingBag, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { useExplorerStore } from '../../store/explorer-store';
import { useSessionStore } from '../../store/session-store';
import { exportSelectedObjectsCsv } from '@/services/selection-export';
import { getObjectResource } from '../../services/rpc';
import { cn } from '@/lib/utils';

/** Docked under the results column header — solid bar, no viewport-wide float. */
export function SelectionBar() {
  const selectedObjectIds = useExplorerStore((state) => state.selectedObjectIds);
  const selectAllVisible = useExplorerStore((state) => state.selectAllVisible);
  const clearSelection = useExplorerStore((state) => state.clearSelection);
  const langPrefs = useSessionStore((state) => state.langPrefs);
  const [exporting, setExporting] = useState(false);
  const empty = selectedObjectIds.length === 0;

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

  return (
    <div
      className="flex w-full min-w-0 flex-none flex-wrap items-center gap-x-1 gap-y-1 border-b border-line bg-ink px-2 py-1.5 text-white shadow-none"
      role="toolbar"
      aria-label="Actions de selection"
    >
      <span className="inline-flex min-w-0 items-center gap-2 pl-1 pr-2 text-[12.5px] font-semibold tabular-nums">
        <span className="grid h-[22px] w-[22px] shrink-0 place-items-center rounded-[6px] bg-orange text-[11px] font-bold text-white">
          {selectedObjectIds.length}
        </span>
        <span className="truncate">dans le panier</span>
      </span>
      <span className="hidden h-[18px] w-px bg-white/15 sm:block" aria-hidden />
      <button
        type="button"
        onClick={() => selectAllVisible()}
        className="inline-flex h-[30px] shrink-0 items-center gap-1.5 rounded-[9px] px-2.5 text-[12.5px] font-semibold text-white hover:bg-white/12"
      >
        <ShoppingBag className="h-3.5 w-3.5 shrink-0" />
        Tout selectionner
      </button>
      <button
        type="button"
        disabled={empty}
        onClick={() => void handlePrintSelection()}
        className={cn(
          'inline-flex h-[30px] shrink-0 items-center gap-1.5 rounded-[9px] px-2.5 text-[12.5px] font-semibold text-white hover:bg-white/12',
          empty && 'cursor-not-allowed text-white/40 hover:bg-transparent',
        )}
      >
        <Printer className="h-3.5 w-3.5 shrink-0" />
        Imprimer
      </button>
      <button
        type="button"
        disabled={empty || exporting}
        onClick={() => void handleExportCsv()}
        className={cn(
          'inline-flex h-[30px] shrink-0 items-center gap-1.5 rounded-[9px] px-2.5 text-[12.5px] font-semibold text-white hover:bg-white/12',
          (empty || exporting) && 'cursor-not-allowed text-white/40 hover:bg-transparent',
        )}
      >
        <Download className="h-3.5 w-3.5 shrink-0" />
        CSV
      </button>
      <button
        type="button"
        disabled={empty}
        onClick={() => clearSelection()}
        className={cn(
          'inline-flex h-[30px] shrink-0 items-center gap-1.5 rounded-[9px] px-2.5 text-[12.5px] font-semibold text-white hover:bg-white/12',
          empty && 'cursor-not-allowed text-white/40 hover:bg-transparent',
        )}
      >
        <Trash2 className="h-3.5 w-3.5 shrink-0" />
        Vider
      </button>
      <span className="hidden h-[18px] w-px bg-white/15 sm:block" aria-hidden />
      <button
        type="button"
        disabled={empty}
        onClick={() => {
          if (!empty) toast.info('Envoi par mail : bientot disponible.');
        }}
        className={cn(
          'ml-auto inline-flex h-[30px] shrink-0 items-center gap-1.5 rounded-[9px] px-3 text-[12.5px] font-semibold text-white',
          empty
            ? 'cursor-not-allowed bg-[#6a4a32] text-white/50'
            : 'bg-orange hover:bg-orange-2',
        )}
      >
        <Mail className="h-3.5 w-3.5 shrink-0" />
        Envoyer
      </button>
    </div>
  );
}
