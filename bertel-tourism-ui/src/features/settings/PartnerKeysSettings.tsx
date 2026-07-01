'use client';

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Copy, KeyRound, ShieldAlert } from 'lucide-react';
import {
  issuePartnerKey,
  listPartnerKeys,
  revokePartnerKey,
  type IssuedPartnerKey,
  type PartnerKey,
} from '../../services/partner-keys';

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

  return (
    <section className="settings-pane">
      <div className="settings-pane__head">
        <div>
          <h2><KeyRound size={18} aria-hidden /> Clés API partenaire</h2>
          <p>Émettez une clé par prestataire externe pour l’API publique <code>/api/public/*</code>. Traçable, révocable, jamais l’accès <code>anon</code> partagé.</p>
        </div>
        <div className="settings-pane__actions">
          <span className="badge badge--info badge--xs">Super-admin</span>
        </div>
      </div>

      {/* Clé émise — affichée UNE SEULE FOIS */}
      {issued && (
        <div className="inline-alert inline-alert--ok" role="status">
          <div>
            <strong>Clé pour « {issued.label} » — copiez-la maintenant.</strong>
            <p className="muted" style={{ margin: '4px 0' }}>
              <ShieldAlert size={14} aria-hidden /> Elle ne sera <strong>plus jamais affichée</strong>. Transmettez-la au partenaire par un canal sûr.
            </p>
            <code className="mono" style={{ wordBreak: 'break-all' }}>{issued.apiKey}</code>
          </div>
          <div className="inline-actions">
            <button type="button" className="ghost-button" onClick={copyKey}><Copy size={14} aria-hidden /> Copier</button>
            <button type="button" className="ghost-button" onClick={() => setIssued(null)}>J’ai copié la clé</button>
          </div>
        </div>
      )}

      {/* Émission */}
      <article className="panel-card panel-card--nested">
        <div className="field-block">
          <label htmlFor="partner-label">Nouveau partenaire</label>
          <div className="inline-actions">
            <input
              id="partner-label"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="Nom du prestataire (ex. Portail régional)"
              maxLength={120}
              disabled={issuing}
            />
            <button type="button" className="primary-button" onClick={() => void handleIssue()} disabled={issuing || !label.trim()}>
              {issuing ? 'Émission…' : 'Émettre une clé'}
            </button>
          </div>
        </div>
      </article>

      {/* Liste */}
      {error ? (
        <div className="inline-alert inline-alert--danger" role="alert">{error}</div>
      ) : loading ? (
        <p className="muted">Chargement des clés…</p>
      ) : keys.length === 0 ? (
        <p className="muted">Aucune clé partenaire émise pour l’instant.</p>
      ) : (
        <div className="partner-key-list">
          {keys.map((key) => (
            <article key={key.id} className="panel-card panel-card--nested">
              <div className="settings-pane__head" style={{ marginBottom: 8 }}>
                <div>
                  <strong>{key.label}</strong>{' '}
                  <span className={key.isActive ? 'badge badge--ok badge--xs' : 'badge badge--danger badge--xs'}>
                    {key.isActive ? 'Active' : 'Révoquée'}
                  </span>
                  <p className="mono muted" style={{ margin: '2px 0' }}>{key.keyPrefix}…</p>
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
              <div className="state-card">
                <div className="state-row"><span className="state-row__k">Créée</span><span className="state-row__v">{formatDate(key.createdAt)}</span></div>
                <div className="state-row"><span className="state-row__k">Dernier usage</span><span className="state-row__v">{formatDate(key.lastUsedAt)}</span></div>
                <div className="state-row"><span className="state-row__k">Expire</span><span className="state-row__v">{key.expiresAt ? formatDate(key.expiresAt) : 'jamais'}</span></div>
                {key.revokedAt && (
                  <div className="state-row"><span className="state-row__k">Révoquée le</span><span className="state-row__v">{formatDate(key.revokedAt)}</span></div>
                )}
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
