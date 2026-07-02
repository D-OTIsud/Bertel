'use client';

// Phase 7.5 (delivery 2) — éditeur de référentiels (ref_code) : maître (domaines éditables) /
// détail (valeurs en table). Par valeur : code mono VERROUILLÉ après création, libellé éditable,
// traductions (modale i18n), « utilisé par N fiches » (api.ref_code_usage_counts), bascule actif
// (interrupteur role=switch), ordre (monter/descendre) et SUPPRESSION définitive — uniquement à
// 0 référence, via ConfirmDialog (api.rpc_delete_ref_code, gated super-admin). Toute écriture
// passe par les RPC SECURITY DEFINER (service ref-codes).

import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowDown, ArrowUp, Languages, Plus, Trash2 } from 'lucide-react';
import {
  deleteRefCode,
  getRefCodeUsageCounts,
  listRefCodeDomains,
  listRefCodeValues,
  reorderRefCode,
  setRefCodeActive,
  upsertRefCode,
  type RefValue,
} from '../services/ref-codes';
import { moveItem } from './ref-code-reorder';
import { EmptyState } from '../components/common/EmptyState';
import { ConfirmDialog } from '../components/common/ConfirmDialog';
import { Modal } from '../components/common/Modal';

// Langues traduisibles (le libellé `name` est le FR canonique). Alignées sur les préférences
// d'interface (fr/en/de).
const I18N_LANGS: Array<{ code: string; label: string }> = [
  { code: 'en', label: 'Anglais (EN)' },
  { code: 'de', label: 'Allemand (DE)' },
];

export function RefCodeEditor() {
  const queryClient = useQueryClient();
  const [selectedDomain, setSelectedDomain] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [newCode, setNewCode] = useState('');
  const [newName, setNewName] = useState('');
  const [actionError, setActionError] = useState<string | null>(null);
  const [i18nTarget, setI18nTarget] = useState<RefValue | null>(null);
  const [i18nDraft, setI18nDraft] = useState<Record<string, string>>({});
  const [confirmDelete, setConfirmDelete] = useState<RefValue | null>(null);

  const domainsQuery = useQuery({ queryKey: ['ref-domains'], queryFn: listRefCodeDomains });
  const domains = useMemo(() => domainsQuery.data ?? [], [domainsQuery.data]);
  const activeDomain = selectedDomain ?? domains[0]?.domain ?? null;

  const valuesQuery = useQuery({
    queryKey: ['ref-values', activeDomain],
    queryFn: () => listRefCodeValues(activeDomain as string),
    enabled: Boolean(activeDomain),
  });
  const values = useMemo(() => valuesQuery.data ?? [], [valuesQuery.data]);

  const usageQuery = useQuery({
    queryKey: ['ref-usage', activeDomain],
    queryFn: () => getRefCodeUsageCounts(activeDomain as string),
    enabled: Boolean(activeDomain),
  });
  const usage = useMemo(() => usageQuery.data ?? {}, [usageQuery.data]);

  function refresh() {
    void queryClient.invalidateQueries({ queryKey: ['ref-values', activeDomain] });
    void queryClient.invalidateQueries({ queryKey: ['ref-usage', activeDomain] });
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

  const i18nMutation = useMutation({
    mutationFn: (input: { value: RefValue; nameI18n: Record<string, string> }) =>
      upsertRefCode({ domain: activeDomain as string, id: input.value.id, name: input.value.name, nameI18n: input.nameI18n }),
    onSuccess: () => { setActionError(null); setI18nTarget(null); refresh(); },
    onError: (error) => setActionError(error instanceof Error ? error.message : 'Échec de l’enregistrement des traductions.'),
  });

  const deleteMutation = useMutation({
    mutationFn: (value: RefValue) => deleteRefCode(activeDomain as string, value.id),
    onSuccess: () => { setActionError(null); setConfirmDelete(null); refresh(); },
    onError: (error) => setActionError(error instanceof Error ? error.message : 'Échec de la suppression.'),
  });

  function reorder(index: number, direction: -1 | 1) {
    const next = moveItem(values, index, direction);
    if (next.map((v) => v.id).join() === values.map((v) => v.id).join()) return;
    reorderMutation.mutate(next.map((v) => v.id));
  }

  function openI18n(value: RefValue) {
    setI18nTarget(value);
    setI18nDraft({ ...(value.nameI18n ?? {}) });
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
            <table className="data-table refcode-table">
              <thead>
                <tr>
                  <th scope="col">Code</th>
                  <th scope="col">Libellé</th>
                  <th scope="col">Traductions</th>
                  <th scope="col">Utilisé</th>
                  <th scope="col">Actif</th>
                  <th scope="col" className="data-table__actions">Ordre &amp; actions</th>
                </tr>
              </thead>
              <tbody>
                {values.map((value, index) => {
                  const draft = drafts[value.id] ?? value.name;
                  const dirty = draft.trim() !== value.name && draft.trim().length > 0;
                  const refs = usage[value.id] ?? 0;
                  const i18nCount = Object.values(value.nameI18n ?? {}).filter((v) => v && v.trim().length > 0).length;
                  return (
                    <tr key={value.id} className={value.isActive ? undefined : 'is-inactive'}>
                      <td><code className="refcode-code" title="Le code est verrouillé après création">{value.code}</code></td>
                      <td>
                        <div className="refcode-name-cell">
                          <input
                            className="refcode-name-input"
                            aria-label={`Libellé de ${value.code}`}
                            value={draft}
                            onChange={(event) => setDrafts((current) => ({ ...current, [value.id]: event.target.value }))}
                          />
                          {dirty && (
                            <button type="button" className="primary-button refcode-save-btn" disabled={renameMutation.isPending} onClick={() => renameMutation.mutate(value)}>
                              Enregistrer
                            </button>
                          )}
                        </div>
                      </td>
                      <td>
                        <button type="button" className="ghost-button refcode-i18n-btn" onClick={() => openI18n(value)}>
                          <Languages size={14} aria-hidden />
                          {i18nCount > 0 ? `FR +${i18nCount}` : 'FR'}
                        </button>
                      </td>
                      <td>
                        <span className={refs > 0 ? 'refcode-usage' : 'refcode-usage is-zero'}>
                          {usageQuery.isLoading ? '…' : `${refs} fiche${refs > 1 ? 's' : ''}`}
                        </span>
                      </td>
                      <td>
                        <button
                          type="button"
                          className="app-switch"
                          role="switch"
                          aria-checked={value.isActive}
                          aria-label={`${value.isActive ? 'Désactiver' : 'Activer'} ${value.code}`}
                          disabled={activeMutation.isPending}
                          onClick={() => activeMutation.mutate({ value, active: !value.isActive })}
                        />
                      </td>
                      <td className="data-table__actions">
                        <div className="refcode-row-actions">
                          <button type="button" className="ghost-button refcode-icon-btn" aria-label="Monter" disabled={index === 0 || reorderMutation.isPending} onClick={() => reorder(index, -1)}>
                            <ArrowUp size={13} aria-hidden />
                          </button>
                          <button type="button" className="ghost-button refcode-icon-btn" aria-label="Descendre" disabled={index === values.length - 1 || reorderMutation.isPending} onClick={() => reorder(index, 1)}>
                            <ArrowDown size={13} aria-hidden />
                          </button>
                          {/* D10 : aria-disabled garde le bouton atteignable (clavier/SR) et la
                              raison est reliée par aria-describedby — un `disabled` natif sortait
                              le motif « référencée par N fiches » de l'arbre d'accessibilité. */}
                          {refs > 0 && (
                            <span id={`delete-reason-${value.id}`} className="sr-only">
                              {`Référencée par ${refs} fiche${refs > 1 ? 's' : ''} — désactivez-la plutôt`}
                            </span>
                          )}
                          <button
                            type="button"
                            className="ghost-button refcode-icon-btn refcode-delete-btn"
                            aria-label={`Supprimer ${value.code}`}
                            title={refs > 0 ? `Référencée par ${refs} fiche${refs > 1 ? 's' : ''} — désactivez-la plutôt` : 'Supprimer définitivement'}
                            aria-disabled={refs > 0 || usageQuery.isLoading || deleteMutation.isPending || undefined}
                            aria-describedby={refs > 0 ? `delete-reason-${value.id}` : undefined}
                            onClick={() => {
                              if (refs > 0 || usageQuery.isLoading || deleteMutation.isPending) return;
                              setConfirmDelete(value);
                            }}
                          >
                            <Trash2 size={13} aria-hidden />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {values.length === 0 && !valuesQuery.isLoading && (
                  <tr><td colSpan={6} className="muted">Aucune valeur dans ce domaine.</td></tr>
                )}
              </tbody>
            </table>

            <form
              className="refcode-create"
              onSubmit={(event) => {
                event.preventDefault();
                if (canCreate) createMutation.mutate();
              }}
            >
              <span className="refcode-create__title">Nouvelle valeur</span>
              <input aria-label="Code de la nouvelle valeur" placeholder="code_normalise" value={newCode} onChange={(event) => setNewCode(event.target.value)} className="refcode-code-input" />
              <input aria-label="Libellé de la nouvelle valeur" placeholder="Libellé" value={newName} onChange={(event) => setNewName(event.target.value)} />
              <button type="submit" className="primary-button" disabled={!canCreate}>
                <Plus size={13} aria-hidden /> Créer
              </button>
            </form>
            <p className="refcode-note muted">
              Le code est verrouillé après création. Désactivez une valeur pour la retirer de l’interface ;
              la suppression définitive n’est possible qu’à 0 référence.
            </p>
          </>
        )}
      </div>

      {i18nTarget && (
        <Modal
          title={`Traductions — ${i18nTarget.name}`}
          onClose={() => setI18nTarget(null)}
          footer={
            <>
              <button type="button" className="ghost-button" onClick={() => setI18nTarget(null)}>Annuler</button>
              <button
                type="button"
                className="primary-button"
                disabled={i18nMutation.isPending}
                onClick={() => i18nMutation.mutate({ value: i18nTarget, nameI18n: i18nDraft })}
              >
                Enregistrer les traductions
              </button>
            </>
          }
        >
          <p className="confirm-message" style={{ marginBottom: 12 }}>
            Libellé canonique (FR) : <strong>{i18nTarget.name}</strong>. Renseignez les traductions ; les champs vides sont ignorés.
          </p>
          {I18N_LANGS.map((lang) => (
            <div key={lang.code} className="field-block">
              <label htmlFor={`i18n-${lang.code}`}>{lang.label}</label>
              <input
                id={`i18n-${lang.code}`}
                value={i18nDraft[lang.code] ?? ''}
                onChange={(event) => setI18nDraft((current) => ({ ...current, [lang.code]: event.target.value }))}
                placeholder={i18nTarget.name}
              />
            </div>
          ))}
        </Modal>
      )}

      <ConfirmDialog
        open={Boolean(confirmDelete)}
        title="Supprimer définitivement cette valeur ?"
        tone="danger"
        confirmLabel="Supprimer définitivement"
        busy={deleteMutation.isPending}
        message={
          confirmDelete
            ? `La valeur « ${confirmDelete.name} » (${confirmDelete.code}) sera supprimée de façon irréversible. Cette action n’est possible que parce qu’aucune fiche ne la référence.`
            : ''
        }
        onCancel={() => setConfirmDelete(null)}
        onConfirm={() => confirmDelete && deleteMutation.mutate(confirmDelete)}
      />
    </div>
  );
}
