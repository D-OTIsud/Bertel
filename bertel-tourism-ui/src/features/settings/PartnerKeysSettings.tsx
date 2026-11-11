'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Ban, ChevronRight, KeyRound, Plus, RefreshCw, ShieldAlert } from 'lucide-react';
import { ConfirmDialog } from '../../components/common/ConfirmDialog';
import { useSessionStore } from '../../store/session-store';
import {
  listPartnerKeys,
  revokePartnerKey,
  type PartnerKey,
} from '../../services/partner-keys';
import { IssuePartnerKeyModal } from './IssuePartnerKeyModal';
import { isIdle, lastUseLabel, splitKeys, summarize } from './partner-keys-view';
import './settings-panels.css';

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString('fr-FR');
}

/**
 * Partner API keys admin (audit API R1a/R1b) — super-admin only (the RPCs are superuser-gated
 * server-side; this is the UI convenience). Issue returns the raw `bk_live_…` key ONCE.
 */
export function PartnerKeysSettings() {
  const userId = useSessionStore((state) => state.userId);
  const orgId = useSessionStore((state) => state.orgId);
  const role = useSessionStore((state) => state.role);
  const identity = JSON.stringify([userId, orgId, role]);
  const identityRef = useRef(identity);
  identityRef.current = identity;
  const [keys, setKeys] = useState<PartnerKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [issueIdentity, setIssueIdentity] = useState<string | null>(null);
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [revokeTarget, setRevokeTarget] = useState<{ id: string; label: string; keyPrefix: string; identity: string } | null>(null);
  const [revokeError, setRevokeError] = useState<string | null>(null);
  const revokeLockRef = useRef(false);
  const keysRef = useRef(keys);
  keysRef.current = keys;
  const loadingRef = useRef(true);
  const loadSequenceRef = useRef(0);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const openerRef = useRef<HTMLButtonElement | null>(null);
  const restoreFocusRef = useRef(false);

  function isCurrentIdentity(expected: string) {
    const session = useSessionStore.getState();
    return identityRef.current === expected && JSON.stringify([session.userId, session.orgId, session.role]) === expected;
  }

  useEffect(() => {
    if (revokeTarget || !restoreFocusRef.current) return;
    // Follow actual removal, since React may commit later than the exit animation's timer.
    const observer = new MutationObserver(restoreFocus);
    function restoreFocus() {
      if (document.querySelector('[role="dialog"][aria-label="Révoquer la clé partenaire ?"]')) return;
      restoreFocusRef.current = false;
      observer.disconnect();
      if (document.activeElement !== document.body) return;
      const opener = openerRef.current;
      if (opener?.isConnected && !opener.disabled) opener.focus();
      else headingRef.current?.focus();
    }
    observer.observe(document.body, { childList: true, subtree: true });
    restoreFocus();
    return () => observer.disconnect();
  }, [revokeTarget]);

  const load = useCallback(async () => {
    const sequence = ++loadSequenceRef.current;
    loadingRef.current = true;
    setLoading(true);
    setError(null);
    try {
      const fresh = await listPartnerKeys();
      if (sequence !== loadSequenceRef.current || !isCurrentIdentity(identity)) return;
      keysRef.current = fresh;
      setKeys(fresh);
    } catch (err) {
      if (sequence === loadSequenceRef.current && isCurrentIdentity(identity)) setError((err as Error).message);
    } finally {
      if (sequence === loadSequenceRef.current && isCurrentIdentity(identity)) {
        loadingRef.current = false;
        setLoading(false);
      }
    }
  }, [identity]);

  useEffect(() => {
    keysRef.current = [];
    setKeys([]);
    setRevokeTarget(null);
    setRevokeError(null);
    setIssueIdentity(null);
    void load();
  }, [load]);

  const handleRevoke = async () => {
    const target = revokeTarget;
    if (!target || revokeLockRef.current || !isCurrentIdentity(target.identity)) return;
    if (loadingRef.current || error) {
      setRevokeError('Attendez le chargement des clés puis réessayez.');
      return;
    }
    const key = keysRef.current.find((candidate) => candidate.id === target.id && candidate.isActive);
    if (!key || key.label !== target.label || key.keyPrefix !== target.keyPrefix) {
      setRevokeError('Cette clé a changé ou n’est plus active. Fermez cette fenêtre et vérifiez les accès partenaires.');
      return;
    }
    revokeLockRef.current = true;
    setRevokingId(target.id);
    setRevokeError(null);
    try {
      await revokePartnerKey(target.id);
      if (!isCurrentIdentity(target.identity)) return;
      toast.success('Clé révoquée.');
      // Keep membership safe even if the refresh fails after a successful revocation.
      keysRef.current = keysRef.current.map((candidate) => candidate.id === target.id ? { ...candidate, isActive: false } : candidate);
      setKeys(keysRef.current);
      await load();
      if (isCurrentIdentity(target.identity)) setRevokeTarget(null);
    } catch (err) {
      if (isCurrentIdentity(target.identity)) {
        setRevokeError((err as Error).message);
        toast.error((err as Error).message);
      }
    } finally {
      revokeLockRef.current = false;
      setRevokingId(null);
    }
  };

  const now = new Date();
  const { active, revoked } = splitKeys(keys);
  const summary = summarize(active, now);

  return (
    <section className="settings-pane settings-admin partner-keys" aria-labelledby="partner-keys-heading">
      <header className="settings-pane__head settings-admin__header">
        <div className="settings-admin__heading">
          <span className="settings-admin__icon"><KeyRound size={22} aria-hidden /></span>
          <div>
            <p className="settings-admin__eyebrow">Intégrations · Super-admin</p>
            <h2 id="partner-keys-heading" ref={headingRef} tabIndex={-1}>Clés API partenaire</h2>
            <p>Une clé par partenaire : on retire un accès sans toucher aux autres.</p>
          </div>
        </div>
        <div className="settings-pane__actions">
          <button type="button" className="primary-button" onClick={() => setIssueIdentity(identity)}>
            <Plus size={16} aria-hidden /> Émettre une clé
          </button>
        </div>
      </header>

      <section className="partner-keys__list" aria-labelledby="partner-keys-list-heading">
        <h3 id="partner-keys-list-heading" className="sr-only">Accès partenaires</h3>
        {error ? (
          <div className="settings-admin__note settings-admin__note--danger" role="alert">
            <ShieldAlert size={18} aria-hidden />
            <div>
              <strong>Impossible de charger les clés</strong>
              <p>{error}</p>
              <button type="button" className="ghost-button" onClick={() => void load()}><RefreshCw size={14} aria-hidden /> Réessayer</button>
            </div>
          </div>
        ) : loading ? (
          <div className="settings-admin__empty" role="status">Chargement des clés…</div>
        ) : (
          <>
            {active.length > 0 ? (
              <>
                <div className="partner-keys__summary" aria-live="polite">
                  <span className="badge badge--ok badge--xs">{summary.activeCount} active{summary.activeCount > 1 ? 's' : ''}</span>
                  <span className="partner-keys__separator" aria-hidden>·</span>
                  <span>{summary.usedLast7Days} utilisée{summary.usedLast7Days > 1 ? 's' : ''} ces 7 derniers jours</span>
                  {summary.idleCount > 0 && (
                    <>
                      <span className="partner-keys__separator" aria-hidden>·</span>
                      <span className="badge badge--warn badge--xs" title="Aucun appel depuis plus de 30 jours ou jamais utilisée">
                        {summary.idleCount} inactive{summary.idleCount > 1 ? 's' : ''} &gt; 30 j
                      </span>
                    </>
                  )}
                </div>
                <table className="partner-keys__table">
                  <caption className="sr-only">Clés partenaires actives</caption>
                  <thead>
                    <tr>
                      <th scope="col">Partenaire</th>
                      <th scope="col">Dernier usage</th>
                      <th scope="col" className="partner-keys__created">Créée le</th>
                      <th scope="col" className="partner-keys__expires">Expiration</th>
                      <th scope="col"><span className="sr-only">Actions</span></th>
                    </tr>
                  </thead>
                  <tbody>
                    {active.map((key) => {
                      const lastUse = lastUseLabel(key.lastUsedAt, now);
                      const idle = isIdle(key, now);
                      const usedAt = key.lastUsedAt ? Date.parse(key.lastUsedAt) : NaN;
                      const age = now.getTime() - usedAt;
                      const recent = age >= 0 && age <= 7 * 24 * 60 * 60 * 1000;
                      return (
                        <tr key={key.id}>
                          <td className="partner-keys__name" title={`Clé ${key.keyPrefix}…`}>{key.label}</td>
                          <td className="partner-keys__usage">
                            {idle ? (
                              <span className="badge badge--warn badge--xs">
                                {lastUse.startsWith('il y a ') ? `Inactive depuis ${lastUse.slice(7)}` : lastUse}
                              </span>
                            ) : (
                              <span className="partner-keys__last-use">
                                {recent && <span className="partner-keys__live-dot" aria-hidden />}
                                {lastUse}
                              </span>
                            )}
                          </td>
                          <td className="partner-keys__created">{formatDate(key.createdAt)}</td>
                          <td className="partner-keys__expires">{key.expiresAt ? formatDate(key.expiresAt) : 'Sans'}</td>
                          <td className="partner-keys__actions">
                            <button
                              type="button"
                              className="partner-keys__revoke"
                              aria-label={`Révoquer la clé ${key.label}`}
                              title="Révoquer"
                              onClick={(event) => {
                                if (revokeLockRef.current) return;
                                openerRef.current = event.currentTarget;
                                restoreFocusRef.current = true;
                                setRevokeError(null);
                                setRevokeTarget({ id: key.id, label: key.label, keyPrefix: key.keyPrefix, identity });
                              }}
                              disabled={revokingId === key.id}
                              aria-busy={revokingId === key.id}
                            >
                              <Ban size={16} aria-hidden />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </>
            ) : (
              <div className="settings-admin__section settings-admin__empty">
                <KeyRound size={28} aria-hidden />
                <strong>{revoked.length > 0 ? 'Aucune clé partenaire active.' : 'Aucune clé partenaire émise pour l’instant.'}</strong>
                <p>Émettez une clé pour donner accès à un partenaire.</p>
                <div className="partner-keys__empty-action">
                  <button type="button" className="primary-button" onClick={() => setIssueIdentity(identity)}>
                    <Plus size={16} aria-hidden /> Émettre une clé
                  </button>
                </div>
              </div>
            )}
            {revoked.length > 0 && (
              <details className="partner-keys__history">
                <summary>
                  <ChevronRight size={14} className="partner-keys__chevron" aria-hidden />
                  Historique — {revoked.length} clé{revoked.length > 1 ? 's' : ''} révoquée{revoked.length > 1 ? 's' : ''}
                </summary>
                <table className="partner-keys__history-table">
                  <caption className="sr-only">Clés partenaires révoquées</caption>
                  <tbody>
                    {revoked.map((key) => (
                      <tr key={key.id}>
                        <td className="partner-keys__name" title={`Clé ${key.keyPrefix}…`}>{key.label}</td>
                        <td className="partner-keys__history-use">
                          {key.expiresAt && Date.parse(key.expiresAt) <= now.getTime()
                            ? 'Expirée'
                            : key.lastUsedAt ? `Dernier usage ${lastUseLabel(key.lastUsedAt, now)}` : 'Jamais utilisée'}
                        </td>
                        <td>Révoquée le {formatDate(key.revokedAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p className="partner-keys__history-foot">Conservé pour la traçabilité. Une clé révoquée ne peut pas être réactivée.</p>
              </details>
            )}
          </>
        )}
      </section>
      <IssuePartnerKeyModal
        key={identity}
        open={issueIdentity === identity}
        onOpenChange={(open) => setIssueIdentity(open ? identity : null)}
        onIssued={() => { if (isCurrentIdentity(identity)) void load(); }}
      />
      <ConfirmDialog
        open={revokeTarget !== null && revokeTarget.identity === identity}
        title="Révoquer la clé partenaire ?"
        message={<>
          Révoquer la clé de « {revokeTarget?.label} » ({revokeTarget?.keyPrefix}…) ? Son accès sera coupé immédiatement. Cette action est irréversible.
          {revokeError && <span className="block text-red-600" role="alert">{revokeError}</span>}
        </>}
        confirmLabel="Révoquer"
        cancelLabel="Annuler"
        tone="danger"
        busy={revokingId !== null}
        onCancel={() => { if (!revokeLockRef.current) setRevokeTarget(null); }}
        onConfirm={() => void handleRevoke()}
      />
    </section>
  );
}
