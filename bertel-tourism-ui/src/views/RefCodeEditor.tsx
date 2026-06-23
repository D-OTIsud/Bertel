'use client';

// Phase 7.5 — éditeur de référentiels (ref_code) : maître (domaines éditables) / détail
// (valeurs). Par valeur : code mono VERROUILLÉ après création, libellé éditable, actif
// (bascule), position (monter/descendre). Création : code + libellé. Toute écriture passe
// par les RPC gated super-admin (service ref-codes) — désactiver, pas supprimer (v1).

import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowDown, ArrowUp, Plus } from 'lucide-react';
import {
  listRefCodeDomains,
  listRefCodeValues,
  reorderRefCode,
  setRefCodeActive,
  upsertRefCode,
  type RefValue,
} from '../services/ref-codes';
import { moveItem } from './ref-code-reorder';
import { EmptyState } from '../components/common/EmptyState';

export function RefCodeEditor() {
  const queryClient = useQueryClient();
  const [selectedDomain, setSelectedDomain] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [newCode, setNewCode] = useState('');
  const [newName, setNewName] = useState('');
  const [actionError, setActionError] = useState<string | null>(null);

  const domainsQuery = useQuery({ queryKey: ['ref-domains'], queryFn: listRefCodeDomains });
  const domains = useMemo(() => domainsQuery.data ?? [], [domainsQuery.data]);
  const activeDomain = selectedDomain ?? domains[0]?.domain ?? null;

  const valuesQuery = useQuery({
    queryKey: ['ref-values', activeDomain],
    queryFn: () => listRefCodeValues(activeDomain as string),
    enabled: Boolean(activeDomain),
  });
  const values = useMemo(() => valuesQuery.data ?? [], [valuesQuery.data]);

  function refresh() {
    void queryClient.invalidateQueries({ queryKey: ['ref-values', activeDomain] });
    void queryClient.invalidateQueries({ queryKey: ['ref-domains'] });
  }

  const renameMutation = useMutation({
    mutationFn: (value: RefValue) => upsertRefCode({ domain: activeDomain as string, id: value.id, name: drafts[value.id] ?? value.name }),
    onSuccess: (_id, value) => {
      setDrafts((current) => {
        const next = { ...current };
        delete next[value.id];
        return next;
      });
      setActionError(null);
      refresh();
    },
    onError: (error) => setActionError(error instanceof Error ? error.message : 'Échec de l’enregistrement.'),
  });

  const activeMutation = useMutation({
    mutationFn: (input: { value: RefValue; active: boolean }) => setRefCodeActive(input.value.id, activeDomain as string, input.active),
    onSuccess: () => { setActionError(null); refresh(); },
    onError: (error) => setActionError(error instanceof Error ? error.message : 'Échec de la bascule.'),
  });

  const reorderMutation = useMutation({
    mutationFn: (ids: string[]) => reorderRefCode(activeDomain as string, ids),
    onSuccess: () => { setActionError(null); refresh(); },
    onError: (error) => setActionError(error instanceof Error ? error.message : 'Échec du réordonnancement.'),
  });

  const createMutation = useMutation({
    mutationFn: () => upsertRefCode({ domain: activeDomain as string, code: newCode.trim(), name: newName.trim() }),
    onSuccess: () => { setNewCode(''); setNewName(''); setActionError(null); refresh(); },
    onError: (error) => setActionError(error instanceof Error ? error.message : 'Échec de la création.'),
  });

  function reorder(index: number, direction: -1 | 1) {
    const next = moveItem(values, index, direction);
    if (next.map((v) => v.id).join() === values.map((v) => v.id).join()) return;
    reorderMutation.mutate(next.map((v) => v.id));
  }

  if (domainsQuery.isError) {
    return <EmptyState mode="error" title="Référentiels indisponibles" description={(domainsQuery.error as Error).message} action={{ label: 'Réessayer', onClick: () => void domainsQuery.refetch() }} />;
  }

  const canCreate = Boolean(activeDomain) && newCode.trim().length > 0 && newName.trim().length > 0 && !createMutation.isPending;

  return (
    <div className="refcode-editor">
      <nav className="refcode-master" aria-label="Domaines de référentiels">
        {domains.map((domain) => (
          <button
            key={domain.domain}
            type="button"
            className={domain.domain === activeDomain ? 'refcode-master__item is-active' : 'refcode-master__item'}
            aria-current={domain.domain === activeDomain ? 'page' : undefined}
            onClick={() => setSelectedDomain(domain.domain)}
          >
            <span className="refcode-master__label">{domain.label}</span>
            <span className="refcode-master__count">{domain.nActive}/{domain.nValues}</span>
          </button>
        ))}
        {domains.length === 0 && !domainsQuery.isLoading && (
          <p className="muted">Aucun domaine éditable.</p>
        )}
      </nav>

      <div className="refcode-detail">
        {actionError && <div className="inline-alert inline-alert--danger" role="alert">{actionError}</div>}

        {activeDomain && (
          <>
            <div className="refcode-rows">
              {values.map((value, index) => {
                const draft = drafts[value.id] ?? value.name;
                const dirty = draft.trim() !== value.name && draft.trim().length > 0;
                return (
                  <div key={value.id} className={value.isActive ? 'refcode-row' : 'refcode-row is-inactive'}>
                    <div className="refcode-row__order">
                      <button type="button" className="ghost-button refcode-icon-btn" aria-label="Monter" disabled={index === 0 || reorderMutation.isPending} onClick={() => reorder(index, -1)}>
                        <ArrowUp size={13} aria-hidden />
                      </button>
                      <button type="button" className="ghost-button refcode-icon-btn" aria-label="Descendre" disabled={index === values.length - 1 || reorderMutation.isPending} onClick={() => reorder(index, 1)}>
                        <ArrowDown size={13} aria-hidden />
                      </button>
                    </div>
                    <code className="refcode-row__code" title="Le code est verrouillé après création">{value.code}</code>
                    <input
                      className="refcode-row__name"
                      aria-label={`Libellé de ${value.code}`}
                      value={draft}
                      onChange={(event) => setDrafts((current) => ({ ...current, [value.id]: event.target.value }))}
                    />
                    <button type="button" className="primary-button refcode-save" disabled={!dirty || renameMutation.isPending} onClick={() => renameMutation.mutate(value)}>
                      Enregistrer
                    </button>
                    <button
                      type="button"
                      className={value.isActive ? 'ghost-button refcode-active is-on' : 'ghost-button refcode-active'}
                      aria-pressed={value.isActive}
                      disabled={activeMutation.isPending}
                      onClick={() => activeMutation.mutate({ value, active: !value.isActive })}
                    >
                      {value.isActive ? 'Actif' : 'Inactif'}
                    </button>
                  </div>
                );
              })}
              {values.length === 0 && !valuesQuery.isLoading && <p className="muted">Aucune valeur dans ce domaine.</p>}
            </div>

            <form
              className="refcode-create"
              onSubmit={(event) => {
                event.preventDefault();
                if (canCreate) createMutation.mutate();
              }}
            >
              <span className="refcode-create__title">Nouvelle valeur</span>
              <input aria-label="Code de la nouvelle valeur" placeholder="code_normalise" value={newCode} onChange={(event) => setNewCode(event.target.value)} className="refcode-row__code-input" />
              <input aria-label="Libellé de la nouvelle valeur" placeholder="Libellé" value={newName} onChange={(event) => setNewName(event.target.value)} />
              <button type="submit" className="primary-button" disabled={!canCreate}>
                <Plus size={13} aria-hidden /> Créer
              </button>
            </form>
            <p className="refcode-note muted">Le code est verrouillé après création. Pour retirer une valeur, désactivez-la (la suppression définitive n’est pas disponible).</p>
          </>
        )}
      </div>
    </div>
  );
}
