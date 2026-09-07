'use client';

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Copy, KeyRound, Plus, RefreshCw, ShieldAlert } from 'lucide-react';
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
  const [keys, setKeys] = useState<PartnerKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [label, setLabel] = useState('');
  const [issuing, setIssuing] = useState(false);
  const [issued, setIssued] = useState<IssuedPartnerKey | null>(null);
  const [revokingId, setRevokingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setKeys(await listPartnerKeys());
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
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

  const handleRevoke = async (key: PartnerKey) => {
    if (!window.confirm(`Révoquer la clé « ${key.label} » (${key.keyPrefix}…) ? Effet immédiat, irréversible.`)) {
      return;
    }
    setRevokingId(key.id);
    try {
      await revokePartnerKey(key.id);
      toast.success('Clé révoquée.');
      await load();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
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
            <h3 id="partner-keys-list-heading">Accès partenaires</h3>
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
                    onClick={() => void handleRevoke(key)}
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
    </section>
  );
}
