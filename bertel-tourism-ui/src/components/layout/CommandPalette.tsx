'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { CornerDownLeft, Keyboard, MapPin, Plus, Search } from 'lucide-react';
import { visibleNavItems } from '../../config/nav-items';
import { searchPaletteObjects, PALETTE_SEARCH_MIN_CHARS } from '../../services/palette-search';
import { useSessionStore } from '../../store/session-store';
import { useUiStore } from '../../store/ui-store';
import { resolveTypeLabel } from '../../utils/labels';
import { Modal } from '../common/Modal';
import { CreateObjectDialog } from '../../features/object-editor/create/CreateObjectDialog';
import { cn } from '@/lib/utils';

const SEARCH_DEBOUNCE_MS = 250;

interface PaletteEntry {
  key: string;
  group: 'nav' | 'action' | 'object';
  label: string;
  caption?: string;
  run: () => void;
}

function normalize(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim();
}

/** Feuille des raccourcis (D24) — dresse ce que l'app écoute réellement. */
function ShortcutHelpModal({ onClose }: { onClose: () => void }) {
  const rows: Array<[string, string]> = [
    ['Ctrl/⌘ + K', 'Ouvrir la palette de commandes'],
    ['↑ / ↓', 'Naviguer dans la palette'],
    ['Entrée', 'Exécuter l’élément en surbrillance'],
    ['Échap', 'Fermer palette, modales et tiroirs'],
    ['Tab / Maj + Tab', 'Circuler dans une modale (focus bouclé)'],
    ['← / → · Début / Fin', 'Changer d’onglet (Dashboard)'],
  ];
  return (
    <Modal title="Raccourcis clavier" onClose={onClose}>
      <table className="shortcut-table">
        <tbody>
          {rows.map(([keys, action]) => (
            <tr key={keys}>
              <td>
                <kbd>{keys}</kbd>
              </td>
              <td>{action}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Modal>
  );
}

/**
 * D24 — palette de commandes ⌘K (le raccourci affiché dans la TopBar était
 * décoratif) : navigation rôle-filtrée (registre partagé avec la Sidebar),
 * actions (créer une fiche, raccourcis) et recherche d'objets (tsvector
 * `object.search_document` via le RPC markers). Sélection d'une fiche = drawer.
 */
export function CommandPalette() {
  const open = useUiStore((state) => state.commandPaletteOpen);
  const setOpen = useUiStore((state) => state.setCommandPaletteOpen);
  const openDrawer = useUiStore((state) => state.openDrawer);
  const role = useSessionStore((state) => state.role);
  const demoMode = useSessionStore((state) => state.demoMode);
  const canEditObjects = useSessionStore((state) => state.canEditObjects);
  const canCreateObjects = useSessionStore((state) => state.canCreateObjects);
  const router = useRouter();

  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [highlight, setHighlight] = useState(0);
  const [createOpen, setCreateOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const listRef = useRef<HTMLUListElement | null>(null);

  // Raccourci global : Ctrl/⌘+K bascule la palette (y compris depuis un champ).
  useEffect(() => {
    function handleKey(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setOpen(!useUiStore.getState().commandPaletteOpen);
      }
    }
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [setOpen]);

  // Remise à zéro à la fermeture (la prochaine ouverture repart propre).
  useEffect(() => {
    if (!open) {
      setQuery('');
      setDebouncedQuery('');
      setHighlight(0);
    }
  }, [open]);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedQuery(query), SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [query]);

  const objectsQuery = useQuery({
    queryKey: ['palette-search', debouncedQuery],
    queryFn: () => searchPaletteObjects(debouncedQuery),
    enabled: open && debouncedQuery.trim().length >= PALETTE_SEARCH_MIN_CHARS,
    staleTime: 30 * 1000,
  });

  const entries = useMemo<PaletteEntry[]>(() => {
    if (!open) return [];
    const needle = normalize(query);
    const navEntries: PaletteEntry[] = visibleNavItems(role, demoMode, canEditObjects)
      .filter((item) => !needle || normalize(`${item.label} ${item.caption}`).includes(needle))
      .map((item) => ({
        key: `nav:${item.to}`,
        group: 'nav' as const,
        label: item.label,
        caption: item.caption,
        run: () => {
          setOpen(false);
          router.push(item.to);
        },
      }));

    const actionEntries: PaletteEntry[] = [];
    if (canCreateObjects && (!needle || normalize('créer une fiche nouvelle').includes(needle))) {
      actionEntries.push({
        key: 'action:create',
        group: 'action',
        label: 'Créer une fiche',
        caption: 'Nouvel établissement, itinéraire, événement…',
        run: () => {
          setOpen(false);
          setCreateOpen(true);
        },
      });
    }
    if (!needle || normalize('raccourcis clavier aide').includes(needle)) {
      actionEntries.push({
        key: 'action:shortcuts',
        group: 'action',
        label: 'Raccourcis clavier',
        caption: 'Afficher la feuille des raccourcis',
        run: () => {
          setOpen(false);
          setShortcutsOpen(true);
        },
      });
    }

    const objectEntries: PaletteEntry[] = (objectsQuery.data ?? []).map((card) => ({
      key: `object:${card.id}`,
      group: 'object' as const,
      label: card.name,
      caption: [resolveTypeLabel(card.type), card.location?.city].filter(Boolean).join(' · '),
      run: () => {
        setOpen(false);
        openDrawer(card.id);
      },
    }));

    return [...objectEntries, ...navEntries, ...actionEntries];
  }, [open, query, role, demoMode, canEditObjects, canCreateObjects, objectsQuery.data, router, setOpen, openDrawer]);

  // Surbrillance re-clampée quand la liste change (résultats async).
  useEffect(() => {
    setHighlight((current) => Math.min(current, Math.max(0, entries.length - 1)));
  }, [entries.length]);

  function handleInputKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setHighlight((current) => Math.min(entries.length - 1, current + 1));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setHighlight((current) => Math.max(0, current - 1));
    } else if (event.key === 'Enter') {
      event.preventDefault();
      entries[highlight]?.run();
    }
  }

  // Garde l'option en surbrillance visible dans la liste scrollable (absent de jsdom).
  useEffect(() => {
    const active = listRef.current?.querySelector<HTMLElement>('[data-highlighted="true"]');
    if (active && typeof active.scrollIntoView === 'function') {
      active.scrollIntoView({ block: 'nearest' });
    }
  }, [highlight, entries.length]);

  const groupLabels: Record<PaletteEntry['group'], string> = {
    object: 'Fiches',
    nav: 'Aller à',
    action: 'Actions',
  };
  const searching = objectsQuery.isFetching && debouncedQuery.trim().length >= PALETTE_SEARCH_MIN_CHARS;

  return (
    <>
      {open ? (
        <Modal title="Palette de commandes" onClose={() => setOpen(false)}>
          <div className="palette">
            <label className="palette__search">
              <Search size={14} aria-hidden />
              <input
                type="search"
                role="combobox"
                aria-expanded="true"
                aria-controls="palette-list"
                aria-activedescendant={entries[highlight] ? `palette-item-${entries[highlight].key}` : undefined}
                aria-label="Rechercher une fiche, un module ou une action"
                placeholder="Rechercher une fiche, un module, une action…"
                value={query}
                onChange={(event) => {
                  setQuery(event.target.value);
                  setHighlight(0);
                }}
                onKeyDown={handleInputKeyDown}
              />
              {searching ? <span className="palette__spinner">Recherche…</span> : null}
            </label>
            <ul id="palette-list" role="listbox" aria-label="Résultats de la palette" ref={listRef} className="palette__list">
              {entries.length === 0 ? (
                <li className="palette__empty" role="presentation">
                  {query.trim().length >= PALETTE_SEARCH_MIN_CHARS
                    ? 'Aucun résultat — essayez un autre terme.'
                    : 'Tapez pour chercher une fiche, un module ou une action.'}
                </li>
              ) : null}
              {entries.map((entry, index) => {
                const previous = entries[index - 1];
                const showGroup = !previous || previous.group !== entry.group;
                return (
                  <li key={entry.key} role="presentation">
                    {showGroup ? (
                      <p className="palette__group" role="presentation">
                        {groupLabels[entry.group]}
                      </p>
                    ) : null}
                    <button
                      type="button"
                      id={`palette-item-${entry.key}`}
                      role="option"
                      aria-selected={index === highlight}
                      data-highlighted={index === highlight || undefined}
                      className={cn('palette__item', index === highlight && 'is-highlighted')}
                      onMouseEnter={() => setHighlight(index)}
                      onClick={() => entry.run()}
                    >
                      <span className="palette__item-icon" aria-hidden>
                        {entry.group === 'object' ? <MapPin size={13} /> : entry.group === 'action' ? (
                          entry.key === 'action:shortcuts' ? <Keyboard size={13} /> : <Plus size={13} />
                        ) : (
                          <CornerDownLeft size={13} />
                        )}
                      </span>
                      <span className="palette__item-body">
                        <span className="palette__item-label">{entry.label}</span>
                        {entry.caption ? <span className="palette__item-caption">{entry.caption}</span> : null}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        </Modal>
      ) : null}

      <CreateObjectDialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={(id) => {
          setCreateOpen(false);
          router.push(`/objects/${id}/edit`);
        }}
        onOpenExisting={(id) => {
          setCreateOpen(false);
          router.push(`/objects/${id}/edit`);
        }}
      />
      {shortcutsOpen ? <ShortcutHelpModal onClose={() => setShortcutsOpen(false)} /> : null}
    </>
  );
}
