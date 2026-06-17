import { useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../../../components/ui/dialog';
import type { ObjectWorkspaceOrgOption } from '../../../services/object-workspace-parser';

function normalize(value: string): string {
  return value.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

interface OrgPickerProps {
  open: boolean;
  options: ObjectWorkspaceOrgOption[];
  /** Org ids already linked — filtered out of the list (anti-doublon). */
  excludeIds?: string[];
  onPick: (org: ObjectWorkspaceOrgOption) => void;
  onClose: () => void;
}

/**
 * §17 — modal to attach an organisation. Orgs are a bounded catalog (relationships.orgOptions), so this
 * is a client-side filtered list (no server search), on the shared Dialog shell with the `rpick` look of
 * ActorPicker for visual parity. Picking creates the link with role `publisher` by default (see org-links).
 */
export function OrgPicker({ open, options, excludeIds = [], onPick, onClose }: OrgPickerProps) {
  const [query, setQuery] = useState('');
  const excluded = useMemo(() => new Set(excludeIds), [excludeIds]);
  const q = normalize(query);
  const matches = useMemo(
    () => options.filter((option) => !excluded.has(option.id) && (!q || normalize(option.name).includes(q))),
    [options, excluded, q],
  );

  return (
    <Dialog open={open} onOpenChange={(next: boolean) => { if (!next) onClose(); }}>
      <DialogContent className="object-editor">
        <DialogHeader>
          <DialogTitle>Rattacher une organisation</DialogTitle>
        </DialogHeader>
        <div className="ed-modal__body">
          <div className="rpick">
            <div className="rpick__head">
              <span className="rpick__icon">⌕</span>
              <input
                className="rpick__input"
                autoFocus
                value={query}
                placeholder="Rechercher une organisation…"
                aria-label="Rechercher une organisation"
                onChange={(event) => setQuery(event.target.value)}
              />
            </div>
            <div className="rpick__list">
              {matches.length === 0 ? (
                <div className="rpick__empty">Aucune organisation disponible.</div>
              ) : (
                matches.map((option, index) => (
                  <button
                    type="button"
                    key={option.id}
                    className={`rpick__row${index === 0 ? ' is-hi' : ''}`}
                    onClick={() => onPick(option)}
                  >
                    <span className="rpick__main">
                      <strong>{option.name}</strong>
                    </span>
                    <span className="rpick__suggest">Rattacher</span>
                  </button>
                ))
              )}
            </div>
            <div className="rpick__foot">
              <span>Organisations du catalogue de votre périmètre</span>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
