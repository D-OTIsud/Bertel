'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { BarChart3, Compass, Download, Printer, ShoppingBag, Users } from 'lucide-react';
import { useObjectDrawerStore } from '../../store/object-drawer-store';
import { useUiStore } from '../../store/ui-store';
import { useExplorerStore } from '../../store/explorer-store';
import { useSessionStore } from '../../store/session-store';
import { StatusPill } from '../common/StatusPill';
import { cn } from '@/lib/utils';
import { exportSelectedObjectsCsv } from '@/services/selection-export';
import { getObjectResource } from '../../services/rpc';

const footerLinks = [
  { href: '/explorer', label: 'Explorer', icon: Compass },
  { href: '/dashboard', label: 'Dashboard', icon: BarChart3 },
  { href: '/crm', label: 'CRM', icon: Users },
];

function isActivePath(pathname: string | null, href: string): boolean {
  if (!pathname) {
    return false;
  }

  return pathname === href || pathname.startsWith(`${href}/`);
}

export function AppFooter() {
  const pathname = usePathname();
  const drawerObjectId = useUiStore((state) => state.drawerObjectId);
  const closeDrawer = useUiStore((state) => state.closeDrawer);
  const networkStatus = useUiStore((state) => state.networkStatus);
  const liveUsersCount = useUiStore((state) => state.liveUsersCount);
  const footerActionMode = useUiStore((state) => state.footerActionMode);
  const drawerDirty = useObjectDrawerStore((state) =>
    drawerObjectId ? Boolean(state.draftsByObject[drawerObjectId]?.dirty) : false,
  );
  const networkTone = networkStatus === 'connected' ? 'green' : networkStatus === 'degraded' ? 'orange' : 'red';

  const [exporting, setExporting] = useState(false);
  const selectedObjectIds = useExplorerStore((state) => state.selectedObjectIds);
  const selectAllVisible = useExplorerStore((state) => state.selectAllVisible);
  const clearSelection = useExplorerStore((state) => state.clearSelection);
  const langPrefs = useSessionStore((state) => state.langPrefs);

  async function handlePrintSelection() {
    if (selectedObjectIds.length === 0) return;

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
    if (selectedObjectIds.length === 0) return;
    setExporting(true);
    try {
      await exportSelectedObjectsCsv(selectedObjectIds, langPrefs);
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="app-footer" role="contentinfo">
      <nav className="app-footer__nav" aria-label="Raccourcis principaux">
        {footerLinks.map((item) => {
          const Icon = item.icon;
          const active = isActivePath(pathname, item.href);

          return (
            <Link key={item.href} href={item.href} className={cn('app-footer__link', active && 'app-footer__link--active')}>
              <Icon className="h-4 w-4" />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>

      <div className="app-footer__context">
        {footerActionMode === 'drawer' && drawerObjectId ? (
          <>
            <span className="app-footer__chip">{drawerDirty ? 'Modification locale' : 'Fiche ouverte'}</span>
            <button type="button" className="ghost-button app-footer__action" onClick={closeDrawer}>
              Fermer la fiche
            </button>
          </>
        ) : footerActionMode === 'explorer' ? (
          <>
            <span className="app-footer__chip">
              <ShoppingBag className="h-4 w-4" />
              {selectedObjectIds.length} selection
            </span>
            <button
              type="button"
              className="ghost-button app-footer__action"
              onClick={selectAllVisible}
              disabled={selectedObjectIds.length === 0}
            >
              Tout
            </button>
            <button
              type="button"
              className="ghost-button app-footer__action"
              onClick={() => void handlePrintSelection()}
              disabled={selectedObjectIds.length === 0}
            >
              <Printer className="h-4 w-4" />
              Imprimer
            </button>
            <button
              type="button"
              className="ghost-button app-footer__action"
              onClick={() => void handleExportCsv()}
              disabled={selectedObjectIds.length === 0 || exporting}
            >
              <Download className="h-4 w-4" />
              Export CSV
            </button>
            <button
              type="button"
              className="ghost-button app-footer__action"
              onClick={clearSelection}
              disabled={selectedObjectIds.length === 0}
            >
              Vider
            </button>
          </>
        ) : (
          <>
            <span className="app-footer__chip">Shell</span>
            <strong className="app-footer__label">{pathname?.replace('/', '') || 'Explorer'}</strong>
          </>
        )}
      </div>

      <div className="app-footer__status">
        <StatusPill tone={networkTone}>{networkStatus}</StatusPill>
        <StatusPill tone="neutral">{liveUsersCount} live</StatusPill>
      </div>
    </div>
  );
}
