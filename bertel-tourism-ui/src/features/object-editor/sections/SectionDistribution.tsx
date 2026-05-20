import { Fs } from '../primitives';
import type { SectionProps } from './section-types';
import type { ObjectWorkspaceDistributionChannel } from '../../../services/object-workspace-parser';

/**
 * Section 20 — Distribution & réseaux sociaux (design: edit-primitives SectionDistribution).
 * Read-only per lot1_mapping_decisions §16.
 */
function ChannelRow({ channel, readOnly }: { channel: ObjectWorkspaceDistributionChannel; readOnly: boolean }) {
  const socialStatus = channel.url === '—' || !channel.url.trim() ? 'Vide' : 'OK';

  return (
    <div className="chan-row">
      <div className="chan-row__logo">{channel.code}</div>
      <div>
        <div className="chan-row__name">{channel.name}</div>
        <span className="chan-row__url">{channel.url || '—'}</span>
      </div>
      <span className={`chan-row__sync ${channel.group === 'booking' ? channel.syncTone : ''}`}>
        {channel.group === 'booking' ? channel.syncStatus : socialStatus}
      </span>
      <button type="button" className="icbtn" disabled={readOnly} title={readOnly ? 'Lecture seule' : 'Modifier'} aria-label="Modifier">
        ✎
      </button>
      <button type="button" className="icbtn" disabled={readOnly} title={readOnly ? 'Lecture seule' : 'Supprimer'} aria-label="Supprimer">
        ×
      </button>
    </div>
  );
}

export function SectionDistribution({ editor, folded }: SectionProps) {
  const module = editor.draft.distribution;
  const booking = module.channels.filter((c) => c.group === 'booking');
  const social = module.channels.filter((c) => c.group === 'social');
  const disconnected = module.channels.filter((c) => c.syncTone === 'warn').length;
  const readOnly = Boolean(module.readonlyReason);

  return (
    <Fs
      num="20"
      title="Distribution & réseaux sociaux"
      sub="Booking, Airbnb, Abritel (canaux de réservation) · Facebook, Instagram, TripAdvisor (réseaux)"
      folded={folded}
      pill={{
        tone: disconnected > 0 ? 'warn' : 'ok',
        label: disconnected > 0 ? `${disconnected} non lié(s)` : 'Tous liés',
      }}
    >
      {module.readonlyReason && (
        <p
          style={{
            fontSize: 12,
            color: 'var(--ink-4)',
            margin: '0 0 12px',
            padding: '8px 12px',
            borderRadius: 'var(--r-md)',
            background: 'var(--bg-tint)',
            border: '1px solid var(--line-soft)',
          }}
        >
          <strong style={{ color: 'var(--ink-3)' }}>Lecture seule.</strong> {module.readonlyReason}
        </p>
      )}

      <div className="chip-group__label" style={{ marginTop: 0 }}>Canaux de distribution</div>
      {booking.length === 0 ? (
        <p style={{ fontSize: 12, color: 'var(--ink-4)', marginBottom: 8 }}>
          Aucun canal de distribution configuré pour l'acteur opérateur de cette fiche.
        </p>
      ) : (
        booking.map((channel) => <ChannelRow key={channel.id} channel={channel} readOnly={readOnly} />)
      )}
      <button type="button" className="rep-add" disabled={readOnly} title={readOnly ? 'Lecture seule' : undefined}>
        + Connecter un canal
      </button>

      <div className="chip-group__label" style={{ marginTop: 14 }}>Réseaux sociaux</div>
      {social.length === 0 ? (
        <p style={{ fontSize: 12, color: 'var(--ink-4)' }}>Aucun réseau social déclaré.</p>
      ) : (
        social.map((channel) => <ChannelRow key={channel.id} channel={channel} readOnly={readOnly} />)
      )}
    </Fs>
  );
}
