'use client';

// §211 — administration generee des catalogues de reference. Le maitre regroupe les
// 103 catalogues par famille ; le detail consomme la forme renvoyee par get_ref_catalog
// pour rendre les valeurs et ouvrir RefCatalogRowModal sans connaissance par table.

import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowDown, ArrowUp, Lock, Pencil, Plus, Trash2 } from 'lucide-react';
import { ConfirmDialog } from '../components/common/ConfirmDialog';
import { EmptyState } from '../components/common/EmptyState';
import {
  buildCatalogFieldSpec,
  buildRowKey,
  computeAddBlocked,
  formatRowLabel,
  rowKeyString,
} from '../features/settings/catalog-fields';
import { REFERENCE_CATALOGS_QUERY_KEY } from '../hooks/useReferenceCatalogsQuery';
import {
  deleteRefRow,
  getRefCatalog,
  groupByFamily,
  listRefCatalogs,
  reorderRefRows,
} from '../services/ref-catalogs';
import { RefCatalogRowModal, humaniseCatalogError } from './RefCatalogRowModal';
import { moveItem } from './ref-code-reorder';

type ModalRow = Record<string, unknown> | 'add' | null;

export function RefCatalogAdmin() {
  const queryClient = useQueryClient();
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [modalRow, setModalRow] = useState<ModalRow>(null);
  const [confirmRow, setConfirmRow] = useState<Record<string, unknown> | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const catalogsQuery = useQuery({
    queryKey: ['ref-catalogs'],
    queryFn: listRefCatalogs,
  });
  const catalogs = useMemo(() => catalogsQuery.data ?? [], [catalogsQuery.data]);
  const activeKey = selectedKey ?? catalogs[0]?.catalogKey ?? null;

  const detailQuery = useQuery({
    queryKey: ['ref-catalog', activeKey],
    queryFn: () => getRefCatalog(activeKey as string),
    enabled: Boolean(activeKey),
  });
  const detail = detailQuery.data ?? null;
  const needle = search.trim().toLocaleLowerCase('fr');

  // La recherche porte aussi sur les valeurs du catalogue ouvert. Une recherche transverse
  // sur les lignes des 103 catalogues demanderait une RPC distincte, hors perimetre.
  const visibleRows = useMemo(() => {
    if (!detail) return [];
    if (!needle) return detail.rows;
    return detail.rows.filter((row) => {
      const label = formatRowLabel(row, detail.labelColumn, detail.primaryKeyColumns);
      return label.toLocaleLowerCase('fr').includes(needle)
        || String(row.code ?? '').toLocaleLowerCase('fr').includes(needle);
    });
  }, [detail, needle]);

  // Si le terme ne correspond qu'a une valeur du catalogue ouvert, celui-ci reste visible
  // dans le rail : masquer le maitre pendant que son detail reste affiche serait contradictoire.
  const groups = useMemo(() => {
    const activeHasMatchingRow = Boolean(needle && detail && visibleRows.length > 0);
    const filtered = needle
      ? catalogs.filter((catalog) => (
        catalog.label.toLocaleLowerCase('fr').includes(needle)
        || catalog.catalogKey.toLocaleLowerCase('fr').includes(needle)
        || (catalog.catalogKey === detail?.catalogKey && activeHasMatchingRow)
      ))
      : catalogs;
    return groupByFamily(filtered);
  }, [catalogs, detail, needle, visibleRows.length]);

  function refresh(catalogKey: string | null = activeKey) {
    void queryClient.invalidateQueries({ queryKey: ['ref-catalogs'] });
    if (catalogKey) {
      void queryClient.invalidateQueries({ queryKey: ['ref-catalog', catalogKey] });
    }
    // Les redacteurs gardent ces listes une heure dans un cache persiste. Sans cette
    // invalidation, une mutation reussie resterait invisible dans leurs formulaires.
    void queryClient.invalidateQueries({ queryKey: [...REFERENCE_CATALOGS_QUERY_KEY] });
  }

  function selectCatalog(catalogKey: string) {
    setSelectedKey(catalogKey);
    setActionError(null);
    setModalRow(null);
    setConfirmRow(null);
  }

  const removeRow = useMutation({
    mutationFn: (input: { catalogKey: string; rowKey: Record<string, unknown> }) =>
      deleteRefRow(input.catalogKey, input.rowKey),
    onSuccess: (_data, input) => {
      setActionError(null);
      setConfirmRow(null);
      refresh(input.catalogKey);
    },
    onError: (error: Error) => setActionError(humaniseCatalogError(error.message)),
  });

  const reorder = useMutation({
    mutationFn: (input: { catalogKey: string; rowKeys: Record<string, unknown>[] }) =>
      reorderRefRows(input.catalogKey, input.rowKeys),
    onSuccess: (_data, input) => {
      setActionError(null);
      refresh(input.catalogKey);
    },
    onError: (error: Error) => setActionError(humaniseCatalogError(error.message)),
  });

  const createFields = detail
    ? buildCatalogFieldSpec(detail.columns, detail.fks, detail.primaryKeyColumns, 'create')
    : [];
  const addBlocked = detail
    ? computeAddBlocked(detail.columns, createFields, detail.primaryKeyColumns)
    : null;
  const isReadonly = detail?.access === 'readonly';
  // Une liste filtree ne doit jamais envoyer un ordre partiel a la RPC.
  const canReorder = Boolean(detail?.columns.some((column) => column.name === 'position'))
    && !isReadonly
    && !needle;

  if (catalogsQuery.isError) {
    return (
      <EmptyState
        mode="error"
        title="Catalogues indisponibles"
        description={(catalogsQuery.error as Error).message}
        action={{ label: 'Réessayer', onClick: () => void catalogsQuery.refetch() }}
      />
    );
  }

  return (
    <div className="ref-admin">
      <div className="ref-admin__toolbar">
        <label className="sr-only" htmlFor="ref-catalog-search">
          Rechercher un catalogue ou une valeur
        </label>
        <input
          id="ref-catalog-search"
          className="ref-admin__search"
          type="search"
          value={search}
          placeholder="Rechercher un catalogue ou une valeur"
          onChange={(event) => setSearch(event.target.value)}
        />
        <p className="ref-admin__search-note muted">
          Les valeurs sont recherchées dans le catalogue ouvert.
        </p>
      </div>

      <div className="ref-admin__layout">
        <nav className="ref-admin__rail" aria-label="Familles de catalogues">
          {catalogsQuery.isLoading && <p role="status" className="muted">Chargement des catalogues…</p>}
          {groups.map((group) => (
            <section className="ref-admin__family" key={group.family}>
              <h3>{group.family}</h3>
              {group.catalogs.map((catalog) => (
                <button
                  key={catalog.catalogKey}
                  type="button"
                  className={catalog.catalogKey === activeKey
                    ? 'ref-admin__catalog is-active'
                    : 'ref-admin__catalog'}
                  aria-current={catalog.catalogKey === activeKey ? 'page' : undefined}
                  onClick={() => selectCatalog(catalog.catalogKey)}
                >
                  <span className="ref-admin__catalog-label">
                    {catalog.access === 'readonly' && <Lock size={13} aria-label="Lecture seule" />}
                    {catalog.label}
                  </span>
                  <span className="ref-admin__catalog-count">{catalog.nValues}</span>
                </button>
              ))}
            </section>
          ))}
          {!catalogsQuery.isLoading && catalogs.length === 0 && (
            <p className="muted">Aucun catalogue disponible.</p>
          )}
          {!catalogsQuery.isLoading && catalogs.length > 0 && groups.length === 0 && (
            <p className="muted">Aucun catalogue ne correspond.</p>
          )}
        </nav>

        <section className="ref-admin__detail" aria-live="polite">
          {detailQuery.isLoading && <p role="status" className="muted">Chargement du catalogue…</p>}
          {detailQuery.isError && (
            <EmptyState
              mode="error"
              title="Catalogue indisponible"
              description={(detailQuery.error as Error).message}
              action={{ label: 'Réessayer', onClick: () => void detailQuery.refetch() }}
            />
          )}
          {!detail && !detailQuery.isLoading && !detailQuery.isError && (
            <EmptyState
              mode="no-data"
              title="Choisissez un catalogue"
              description="La colonne de gauche range les catalogues par famille."
            />
          )}

          {detail && !detailQuery.isError && (
            <>
              <header className="ref-admin__detail-head">
                <div>
                  <h2>{detail.label}</h2>
                  <p className="mono muted">{detail.catalogKey}</p>
                </div>
                {detail.usedIn && <p className="muted">Utilisé dans {detail.usedIn}</p>}
              </header>

              {isReadonly && (
                <p role="note" className="inline-alert inline-alert--warning">
                  <Lock size={14} aria-hidden />
                  {detail.readonlyReason ?? 'Ce catalogue est en lecture seule.'}
                </p>
              )}
              {actionError && <p role="alert" className="inline-alert inline-alert--danger">{actionError}</p>}

              {visibleRows.length === 0 ? (
                <EmptyState
                  mode={needle ? 'filtered' : 'no-data'}
                  title={needle ? 'Aucune valeur ne correspond' : 'Ce catalogue est vide'}
                  description={needle ? 'La recherche ne porte que sur le catalogue ouvert.' : undefined}
                  action={needle ? { label: 'Effacer la recherche', onClick: () => setSearch('') } : undefined}
                />
              ) : (
                <div className="ref-admin__table-wrap">
                  <table className="data-table ref-admin__table">
                    <thead>
                      <tr>
                        <th scope="col">Libellé</th>
                        <th scope="col">Code</th>
                        <th scope="col">Utilisé</th>
                        <th scope="col" className="data-table__actions">Ordre &amp; actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {visibleRows.map((row, index) => {
                        const label = formatRowLabel(
                          row,
                          detail.labelColumn,
                          detail.primaryKeyColumns,
                        );
                        const rowKey = rowKeyString(row, detail.primaryKeyColumns);
                        const uses = detail.usage[rowKey] ?? 0;
                        const deleteReasonId = `ref-catalog-delete-reason-${index}`;
                        const deleteBlocked = isReadonly || uses > 0 || removeRow.isPending;

                        return (
                          <tr key={rowKey}>
                            <td>{label}</td>
                            <td><code className="ref-admin__code">{String(row.code ?? '')}</code></td>
                            <td>
                              <span className={uses > 0 ? 'ref-admin__usage' : 'ref-admin__usage is-zero'}>
                                {uses > 0 ? `${uses} fiche${uses > 1 ? 's' : ''}` : '—'}
                              </span>
                            </td>
                            <td className="data-table__actions">
                              <div className="ref-admin__row-actions">
                                {canReorder && (
                                  <>
                                    <button
                                      type="button"
                                      className="ghost-button ref-admin__icon-button"
                                      aria-label={`Monter ${label}`}
                                      disabled={index === 0 || reorder.isPending}
                                      onClick={() => {
                                        const rows = moveItem(detail.rows, index, -1);
                                        reorder.mutate({
                                          catalogKey: detail.catalogKey,
                                          rowKeys: rows.map((item) => buildRowKey(
                                            item,
                                            detail.primaryKeyColumns,
                                          )),
                                        });
                                      }}
                                    >
                                      <ArrowUp size={14} aria-hidden />
                                    </button>
                                    <button
                                      type="button"
                                      className="ghost-button ref-admin__icon-button"
                                      aria-label={`Descendre ${label}`}
                                      disabled={index === detail.rows.length - 1 || reorder.isPending}
                                      onClick={() => {
                                        const rows = moveItem(detail.rows, index, 1);
                                        reorder.mutate({
                                          catalogKey: detail.catalogKey,
                                          rowKeys: rows.map((item) => buildRowKey(
                                            item,
                                            detail.primaryKeyColumns,
                                          )),
                                        });
                                      }}
                                    >
                                      <ArrowDown size={14} aria-hidden />
                                    </button>
                                  </>
                                )}
                                <button
                                  type="button"
                                  className="ghost-button ref-admin__icon-button"
                                  aria-label={`Modifier ${label}`}
                                  disabled={isReadonly}
                                  onClick={() => setModalRow(row)}
                                >
                                  <Pencil size={14} aria-hidden />
                                </button>
                                {uses > 0 && (
                                  <span id={deleteReasonId} className="sr-only">
                                    {`Référencée par ${uses} fiche${uses > 1 ? 's' : ''} — désactivez-la plutôt`}
                                  </span>
                                )}
                                <button
                                  type="button"
                                  className="ghost-button ref-admin__icon-button ref-admin__delete-button"
                                  aria-label={`Supprimer ${label}`}
                                  aria-disabled={deleteBlocked || undefined}
                                  aria-describedby={uses > 0 ? deleteReasonId : undefined}
                                  title={uses > 0
                                    ? `Référencée par ${uses} fiche${uses > 1 ? 's' : ''} — désactivez-la plutôt`
                                    : 'Supprimer définitivement'}
                                  onClick={() => {
                                    if (deleteBlocked) return;
                                    setConfirmRow(row);
                                  }}
                                >
                                  <Trash2 size={14} aria-hidden />
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              {!isReadonly && (
                <div className="ref-admin__add">
                  <button
                    type="button"
                    className="primary-button"
                    disabled={Boolean(addBlocked)}
                    onClick={() => setModalRow('add')}
                  >
                    <Plus size={14} aria-hidden /> Ajouter
                  </button>
                  {addBlocked && (
                    <p className="muted">
                      Ajout impossible depuis l&apos;interface : la colonne <code>{addBlocked}</code>{' '}
                      est obligatoire et ne peut pas être saisie ici.
                    </p>
                  )}
                </div>
              )}
            </>
          )}
        </section>
      </div>

      {/* Ces composants restent montes pendant leur animation de sortie. */}
      {detail && (
        <RefCatalogRowModal
          catalog={detail}
          row={modalRow === 'add' || modalRow === null ? null : modalRow}
          open={modalRow !== null}
          onOpenChange={(next) => { if (!next) setModalRow(null); }}
          onSaved={() => {
            setModalRow(null);
            refresh(detail.catalogKey);
          }}
        />
      )}

      <ConfirmDialog
        open={Boolean(confirmRow)}
        title="Supprimer définitivement cette valeur ?"
        tone="danger"
        confirmLabel="Supprimer définitivement"
        busy={removeRow.isPending}
        message={confirmRow && detail
          ? `La valeur « ${formatRowLabel(confirmRow, detail.labelColumn, detail.primaryKeyColumns)} » sera supprimée de façon irréversible. Cette action n'est possible que parce qu'aucune fiche ne la référence.`
          : ''}
        onCancel={() => setConfirmRow(null)}
        onConfirm={() => {
          if (!confirmRow || !detail) return;
          removeRow.mutate({
            catalogKey: detail.catalogKey,
            rowKey: buildRowKey(confirmRow, detail.primaryKeyColumns),
          });
        }}
      />
    </div>
  );
}
