'use client';

import { useState } from 'react';
import { Download, Mail, Printer, ShoppingBag, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { useExplorerStore } from '../../store/explorer-store';
import { useSessionStore } from '../../store/session-store';
import { exportSelectedObjectsCsv } from '@/services/selection-export';
import { getObjectResource } from '../../services/rpc';
import { cn } from '@/lib/utils';

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
      className="pointer-events-none absolute inset-x-0 bottom-4 z-30 flex justify-center px-3"
      role="toolbar"
      aria-label="Actions de selection"
    >
      <div
        className={cn(
          'pointer-events-auto flex items-center gap-1 rounded-shellMd bg-ink p-1.5 text-white shadow-l',
          empty && 'opacity-80',
        )}
      >
        <span className="inline-flex items-center gap-2 pl-2 pr-3 text-[12.5px] font-semibold tabular-nums">
          <span className="grid h-[22px] w-[22px] place-items-center rounded-[6px] bg-orange text-[11px] font-bold text-white">
            {selectedObjectIds.length}
          </span>
          fiches
        </span>
        <span className="h-[18px] w-px bg-white/10" aria-hidden />
        <button
          type="button"
          onClick={() => selectAllVisible()}
          className="inline-flex h-[30px] items-center gap-1.5 rounded-[9px] px-3 text-[12.5px] font-semibold text-white/90 hover:bg-white/10 hover:text-white"
        >
          <ShoppingBag className="h-3.5 w-3.5" />
          Selection
        </button>
        <button
          type="button"
          disabled={empty}
          onClick={() => void handlePrintSelection()}
          className={cn(
            'inline-flex h-[30px] items-center gap-1.5 rounded-[9px] px-3 text-[12.5px] font-semibold text-white/90 hover:bg-white/10 hover:text-white',
            empty && 'pointer-events-none opacity-40',
          )}
        >
          <Printer className="h-3.5 w-3.5" />
          Imprimer
        </button>
        <button
          type="button"
          disabled={empty || exporting}
          onClick={() => void handleExportCsv()}
          className={cn(
            'inline-flex h-[30px] items-center gap-1.5 rounded-[9px] px-3 text-[12.5px] font-semibold text-white/90 hover:bg-white/10 hover:text-white',
            (empty || exporting) && 'pointer-events-none opacity-40',
          )}
        >
          <Download className="h-3.5 w-3.5" />
          CSV
        </button>
        <button
          type="button"
          disabled={empty}
          onClick={() => clearSelection()}
          className={cn(
            'inline-flex h-[30px] items-center gap-1.5 rounded-[9px] px-3 text-[12.5px] font-semibold text-white/90 hover:bg-white/10 hover:text-white',
            empty && 'pointer-events-none opacity-40',
          )}
        >
          <Trash2 className="h-3.5 w-3.5" />
          Vider
        </button>
        <span className="h-[18px] w-px bg-white/10" aria-hidden />
        <button
          type="button"
          disabled={empty}
          onClick={() => {
            if (!empty) toast.info('Envoi par mail : bientot disponible.');
          }}
          className={cn(
            'inline-flex h-[30px] items-center gap-1.5 rounded-[9px] px-3 text-[12.5px] font-semibold text-white',
            empty
              ? 'pointer-events-none bg-orange/35 opacity-60'
              : 'bg-orange hover:bg-orange-2',
          )}
        >
          <Mail className="h-3.5 w-3.5" />
          Envoyer
        </button>
      </div>
    </div>
  );
}
