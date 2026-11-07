'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Copy, KeyRound, Plus, RefreshCw, ShieldAlert } from 'lucide-react';
import { ConfirmDialog } from '../../components/common/ConfirmDialog';
import { useSessionStore } from '../../store/session-store';
import {
  issuePartnerKey,
  listPartnerKeys,
  revokePartnerKey,
  type IssuedPartnerKey,
  type PartnerKey,
} from '../../services/partner-keys';
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
  const [label, setLabel] = useState('');
  const [issuing, setIssuing] = useState(false);
  const [issued, setIssued] = useState<IssuedPartnerKey | null>(null);
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
    void load();
  }, [load]);

  const handleIssue = async () => {
    const trimmed = label.trim();
    if (!trimmed) {
      toast.error('Donnez un nom au partenaire (ex. « Portail régional »).');
      return;
    }
    setIssuing(true);
    try {
      const result = await issuePartnerKey(trimmed);
      setIssued(result);
      setLabel('');
      toast.success('Clé émise. Copiez-la maintenant — elle ne sera plus affichée.');
      await load();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setIssuing(false);
    }
  };

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

  const copyKey = () => {
    if (!issued) return;
    void navigator.clipboard?.writeText(issued.apiKey).then(
      () => toast.success('Clé copiée dans le presse-papier.'),
      () => toast.error('Copie impossible — sélectionnez la clé manuellement.'),
    );
  };

  const activeKeyCount = keys.filter((key) => key.isActive).length;

  return (
    <section className="settings-pane settings-admin" aria-labelledby="partner-keys-heading">
      <header className="settings-pane__head settings-admin__header">
        <div className="settings-admin__heading">
          <span className="settings-admin__icon"><KeyRound size={22} aria-hidden /></span>
          <div>
            <p className="settings-admin__eyebrow">Intégrations</p>
            <h2 id="partner-keys-heading">Clés API partenaire</h2>
            <p>Créez un accès dédié à chaque partenaire et suivez l’utilisation de ses clés.</p>
          </div>
        </div>
        <div className="settings-pane__actions">
          <span className="badge badge--info badge--xs">Super-admin</span>
        </div>
      </header>

      <div className="settings-admin__body">

      {/* Clé émise — affichée UNE SEULE FOIS */}
      {issued && (
        <div className="settings-admin__note settings-admin__note--success motion-status-enter" role="status">
          <ShieldAlert size={20} aria-hidden />
          <div className="settings-admin__key-list">
            <strong>Clé pour « {issued.label} » — copiez-la maintenant.</strong>
            <p>
              Elle ne sera <strong>plus jamais affichée</strong>. Transmettez-la au partenaire par un canal sûr.
            </p>
            <code className="mono settings-admin__secret">{issued.apiKey}</code>
            <div className="settings-admin__actions">
              <button type="button" className="ghost-button" onClick={copyKey}><Copy size={14} aria-hidden /> Copier</button>
              <button type="button" className="ghost-button" onClick={() => setIssued(null)}>J’ai copié la clé</button>
            </div>
          </div>
        </div>
      )}

      {/* Émission */}
      <form className="settings-admin__section" onSubmit={(event) => { event.preventDefault(); void handleIssue(); }}>
        <div className="settings-admin__section-head">
          <div>
            <h3>Nouveau partenaire</h3>
            <p>Une clé par prestataire permet de retirer un accès sans affecter les autres.</p>
          </div>
          <Plus size={18} aria-hidden />
        </div>
        <div className="settings-admin__form-grid">
          <div className="settings-admin__field settings-admin__field--wide">
            <label htmlFor="partner-label">Nom du partenaire</label>
            <input
              id="partner-label"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="Nom du prestataire (ex. Portail régional)"
              aria-describedby="partner-label-help"
              maxLength={120}
              disabled={issuing}
            />
            <small id="partner-label-help">Choisissez un nom qui vous permettra d’identifier cet accès.</small>
          </div>
        </div>
        <div className="settings-admin__footer">
          <p>La clé complète sera affichée une seule fois, à sa création.</p>
          <button type="submit" className="primary-button" disabled={issuing || !label.trim()}>
            <KeyRound size={16} aria-hidden /> {issuing ? 'Émission…' : 'Émettre une clé'}
          </button>
        </div>
      </form>

      {/* Liste */}
      <section className="settings-admin__key-list" aria-labelledby="partner-keys-list-heading">
        <div className="settings-admin__section-head">
          <div>
            <h3 id="partner-keys-list-heading" ref={headingRef} tabIndex={-1}>Accès partenaires</h3>
            <p>Consultez les derniers usages et révoquez les clés qui ne sont plus nécessaires.</p>
          </div>
          {!loading && !error && <span className="badge badge--info badge--xs">{activeKeyCount} active{activeKeyCount > 1 ? 's' : ''}</span>}
        </div>
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
        <div className="settings-admin__section settings-admin__empty" role="status">Chargement des clés…</div>
      ) : keys.length === 0 ? (
        <div className="settings-admin__section settings-admin__empty">
          <KeyRound size={28} aria-hidden />
          <strong>Aucune clé partenaire émise pour l’instant.</strong>
          <p>Ajoutez votre premier partenaire avec le formulaire ci-dessus.</p>
        </div>
      ) : (
        <div className="settings-admin__key-list">
          {keys.map((key) => (
            <article key={key.id} className="settings-admin__section">
              <div className="settings-admin__section-head">
                <div>
                  <div className="settings-admin__actions">
                    <h4>{key.label}</h4>
                    <span className={key.isActive ? 'badge badge--ok badge--xs' : 'badge badge--danger badge--xs'}>
                      {key.isActive ? 'Active' : 'Révoquée'}
                    </span>
                  </div>
                  <p className="mono">{key.keyPrefix}…</p>
                </div>
                {key.isActive && (
                  <button
                    type="button"
                    className="ghost-button"
                    onClick={(event) => {
                      if (revokeLockRef.current) return;
                      openerRef.current = event.currentTarget;
                      restoreFocusRef.current = true;
                      setRevokeError(null);
                      setRevokeTarget({ id: key.id, label: key.label, keyPrefix: key.keyPrefix, identity });
                    }}
                    disabled={revokingId === key.id}
                  >
                    {revokingId === key.id ? 'Révocation…' : 'Révoquer'}
                  </button>
                )}
              </div>
              <dl className="settings-admin__key-meta">
                <div><dt>Créée le</dt><dd>{formatDate(key.createdAt)}</dd></div>
                <div><dt>Dernier usage</dt><dd>{key.lastUsedAt ? formatDate(key.lastUsedAt) : 'Pas encore utilisée'}</dd></div>
                <div><dt>Expiration</dt><dd>{key.expiresAt ? formatDate(key.expiresAt) : 'Sans expiration'}</dd></div>
                {key.revokedAt && (
                  <div><dt>Révoquée le</dt><dd>{formatDate(key.revokedAt)}</dd></div>
                )}
              </dl>
            </article>
          ))}
        </div>
      )}
      </section>
      </div>
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
