'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Download } from 'lucide-react';
import { Modal } from '../../../components/common/Modal';
import { FilterColumnGroup } from '../../../components/common/FilterColumnGroup';
import { useExplorerStore } from '../../../store/explorer-store';
import { useSessionStore } from '../../../store/session-store';
import { useExplorerExportStore } from '../../../store/explorer-export-store';
import {
  availableColumns, EXPORT_GROUP_LABELS, EXPORT_PRESETS, presetColumnIds, purposeRequired,
  type ExportColumnDef, type ExportGroupId,
} from '../../../services/export/export-columns';
import { runSelectionXlsxExport } from '../../../services/export/export-workbook';
import { getExportActorCapabilities } from '../../../services/rpc';
import { cn } from '@/lib/utils';

/** R2 — capacités acteur par défaut : FERMÉES tant que le serveur n'a pas répondu. */
const CLOSED_CAPS = { actorIdentityAvailable: false, actorContactsAvailable: false };

/**
 * §208 — modale de l'export Excel de la sélection. L'offre de colonnes est
 * FILTRÉE par le niveau de session (jamais masquée-mais-active, §205) ; la
 * GARDE reste serveur (RLS + 16t). « Diffusion partenaire » est verrouillé et
 * recalculé du code à chaque sélection du préréglage. Une colonne à finalité
 * cochée ⇒ champ Finalité obligatoire + export journalisé (Lisez-moi porte
 * l'identifiant de journal).
 */
export function ExportExcelModal({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const selectedObjectIds = useExplorerStore((s) => s.selectedObjectIds);
  const langPrefs = useSessionStore((s) => s.langPrefs);
  // Sélection PAR CHAMP (jamais un littéral objet dans le sélecteur) : avec Zustand 5, un
  // sélecteur qui alloue un nouvel objet à chaque appel casse la détection de "tearing" de
  // useSyncExternalStore et boucle le rendu à l'infini (Maximum update depth exceeded,
  // constaté à l'exécution) — même piège que celui déjà évité ailleurs dans l'Exploreur
  // (SelectionBar/CapacityCriteria sélectionnent chaque champ séparément).
  const orgId = useSessionStore((s) => s.orgId);
  const canEditObjects = useSessionStore((s) => s.canEditObjects);
  const role = useSessionStore((s) => s.role);
  const session = useMemo(() => ({ orgId, canEditObjects, role }), [orgId, canEditObjects, role]);
  const { presetId, columnIds, applyPreset, toggleColumn } = useExplorerExportStore();

  const [purpose, setPurpose] = useState('');
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [caps, setCaps] = useState(CLOSED_CAPS);
  const abortRef = useRef<AbortController | null>(null);

  // R2 — préflight serveur à l'ouverture : l'offre de colonnes acteur suit la
  // consultation RÉELLE de la sélection (mêmes prédicats que les gates). Échec
  // ⇒ fermé. Garde anti-course : une réponse d'une sélection périmée est ignorée.
  useEffect(() => {
    if (!open || selectedObjectIds.length === 0) {
      setCaps(CLOSED_CAPS);
      return;
    }
    let stale = false;
    setCaps(CLOSED_CAPS);
    getExportActorCapabilities(selectedObjectIds)
      .then((result) => { if (!stale) setCaps(result); })
      .catch(() => { if (!stale) setCaps(CLOSED_CAPS); });
    return () => { stale = true; };
  }, [open, selectedObjectIds]);

  // R2.1 — `caps` est passé À availableColumns (il OUVRE les clearances acteur),
  // il ne filtre pas une liste déjà amputée par la session.
  const offered = useMemo(() => availableColumns(session, caps), [session, caps]);
  const locked = presetId === 'diffusion';
  // Verrouillé ⇒ on ignore l'état persisté et on recalcule (jamais restauré du localStorage).
  const effectiveIds = locked ? presetColumnIds('diffusion', session, caps) : columnIds.filter((id) => offered.some((c) => c.id === id));
  const needsPurpose = purposeRequired(effectiveIds);
  const exporting = progress !== null;
  // R1 : 5 caractères minimum — le serveur revalide (REASON_REQUIRED), la modale n'est que l'ergonomie.
  const canDownload = effectiveIds.length > 0 && !exporting && (!needsPurpose || purpose.trim().length >= 5);

  const byGroup = useMemo(() => {
    const map = new Map<ExportGroupId, ExportColumnDef[]>();
    for (const col of offered) {
      map.set(col.group, [...(map.get(col.group) ?? []), col]);
    }
    return map;
  }, [offered]);

  async function handleDownload() {
    if (!canDownload) return;
    const controller = new AbortController();
    abortRef.current = controller;
    setProgress({ done: 0, total: selectedObjectIds.length });
    try {
      const { exported, requested } = await runSelectionXlsxExport({
        ids: selectedObjectIds,
        columnIds: effectiveIds,
        langPrefs,
        purpose: needsPurpose ? purpose.trim() : '',
        onProgress: (done, total) => setProgress({ done, total }),
        signal: controller.signal,
      });
      toast.success(`Export terminé — ${exported} fiche${exported > 1 ? 's' : ''} sur ${requested}.`);
      onOpenChange(false);
    } catch (error) {
      if (!controller.signal.aborted) {
        toast.error(error instanceof Error ? error.message : "L'export a échoué.");
      }
    } finally {
      abortRef.current = null;
      setProgress(null);
    }
  }

  function handleCancel() {
    abortRef.current?.abort();
  }

  return (
    <Modal open={open} title="Exporter en Excel" onOpenChange={onOpenChange} size="wide"
      footer={
        <>
          <span className="mr-auto text-[12.5px] text-ink-3">
            {exporting
              ? `Chargement ${progress.done}/${progress.total}…`
              : `${effectiveIds.length} colonne${effectiveIds.length > 1 ? 's' : ''} · ${selectedObjectIds.length} ligne${selectedObjectIds.length > 1 ? 's' : ''}`}
          </span>
          {exporting ? (
            <button type="button" className="ghost-button" onClick={handleCancel}>Annuler l'export</button>
          ) : (
            <button type="button" className="ghost-button" onClick={() => onOpenChange(false)}>Annuler</button>
          )}
          <button type="button" className="primary-button" disabled={!canDownload} onClick={() => void handleDownload()}>
            <Download size={14} aria-hidden /> Télécharger .xlsx
          </button>
        </>
      }
    >
      <p className="text-[12.5px] text-ink-3">
        {selectedObjectIds.length} fiche{selectedObjectIds.length > 1 ? 's' : ''} sélectionnée{selectedObjectIds.length > 1 ? 's' : ''} — une ligne par fiche, valeurs en clair.
      </p>

      <div className="flex flex-wrap gap-2" role="group" aria-label="Partir d'un modèle">
        {EXPORT_PRESETS.map((preset) => (
          <button key={preset.id} type="button"
            className={cn('rounded-[9px] border px-3 py-1.5 text-[12.5px] font-semibold transition',
              presetId === preset.id ? 'border-teal bg-teal-soft text-teal' : 'border-line text-ink-3 hover:text-ink')}
            onClick={() => applyPreset(preset.id, session, caps)}
          >
            {preset.label}{preset.locked ? ' 🔒' : ''}
          </button>
        ))}
      </div>

      {byGroup.size === 0 ? null : [...byGroup.entries()].map(([groupId, cols]) => {
        const checkedCount = cols.filter((c) => effectiveIds.includes(c.id)).length;
        return (
          <FilterColumnGroup
            key={groupId}
            label={EXPORT_GROUP_LABELS[groupId]}
            count={checkedCount || undefined}
            collapsible
            // R2.1 — le groupe 'acteur' n'existe dans byGroup QUE lorsque le préflight vient
            // d'OUVRIR une clearance (il est absent tant que caps est fermé) : à son premier
            // montage checkedCount vaut toujours 0 (aucune colonne acteur n'est jamais
            // pré-cochée par un préréglage). Le laisser sous checkedCount>0 le monterait
            // replié en permanence — l'offre que le préflight vient d'ouvrir resterait
            // cachée derrière un disclosure que rien n'invite à ouvrir. Le préflight doit
            // pouvoir OUVRIR l'offre, pas seulement l'annoncer sous un repli.
            defaultOpen={checkedCount > 0 || groupId === 'acteur'}
          >
            <div className="grid grid-cols-2 gap-x-4">
              {cols.map((col) => (
                <label key={col.id} className={cn('flex items-center gap-2 py-0.5 text-[12.5px]', locked ? 'text-ink-4' : 'text-ink')}>
                  <input type="checkbox" checked={effectiveIds.includes(col.id)} disabled={locked} onChange={() => toggleColumn(col.id)} />
                  {col.label}
                  {col.requiresPurpose ? <span className="rounded-[6px] bg-orange-soft px-1.5 text-[10.5px] font-semibold text-orange">tracé</span> : null}
                </label>
              ))}
            </div>
          </FilterColumnGroup>
        );
      })}

      {needsPurpose ? (
        <div className="rounded-[10px] border border-orange/40 bg-orange-soft/40 p-3">
          <label className="flex flex-col gap-1 text-[12.5px] font-semibold text-ink" htmlFor="export-purpose">
            Finalité de l'export (obligatoire — inscrite au journal)
            <textarea id="export-purpose" rows={2} value={purpose} onChange={(e) => setPurpose(e.target.value)}
              className="rounded-[8px] border border-line bg-surface p-2 text-[12.5px] font-normal"
              placeholder="Campagne relance adhésions 2026" />
          </label>
          <p className="mt-1 text-[11.5px] text-ink-3">
            Colonnes réservées à votre organisation — cet export de coordonnées est tracé (qui, quand, quelles fiches).
          </p>
        </div>
      ) : null}
    </Modal>
  );
}
