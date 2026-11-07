import { useId } from 'react';
import { useExplorerStore } from '../../store/explorer-store';
import { useProviderScopeStore } from '../../store/provider-scope-store';
import { cn } from '@/lib/utils';

export function ProviderScopeToggle({ useStore = useExplorerStore }: { useStore?: typeof useExplorerStore }) {
  const enabled = useStore((s) => s.common.providerOnly === true);
  const saving = useProviderScopeStore((s) => s.saving);
  const error = useProviderScopeStore((s) => s.error);
  const setEnabled = useProviderScopeStore((s) => s.setEnabled);
  const descriptionId = useId();

  return (
    <div className="mt-3.5">
      <button
        type="button"
        role="switch"
        aria-label="Avec prestataire uniquement"
        aria-checked={enabled}
        aria-describedby={descriptionId}
        disabled={saving}
        onClick={() => void setEnabled(!enabled)}
        className="flex min-h-11 w-full items-center justify-between gap-3 rounded-md text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal disabled:cursor-wait"
      >
        <span className="min-w-0">
          <span className="block text-[12px] font-semibold text-ink">Avec prestataire uniquement</span>
          <span id={descriptionId} className="mt-0.5 block text-[11px] text-ink-3" aria-live="polite">
            {saving ? 'Enregistrement…' : 'Choix mémorisé pour votre compte'}
          </span>
        </span>
        <span aria-hidden="true" className={cn('flex h-[22px] w-[38px] shrink-0 items-center rounded-full border p-[2px]', enabled ? 'border-teal bg-teal' : 'border-line bg-surface2')}>
          <span className={cn('h-4 w-4 rounded-full', enabled ? 'translate-x-4 bg-white' : 'bg-ink-3')} />
        </span>
      </button>
      {error && <p role="alert" className="mt-1 text-[12px] text-red">{error}</p>}
    </div>
  );
}
