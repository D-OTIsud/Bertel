import { Fs } from '../primitives';
import type { SectionProps } from './section-types';
import type { ObjectWorkspaceDistributionChannel } from '../../../services/object-workspace-parser';

/**
 * Plan 4 — Section 20 "Distribution & réseaux sociaux".
 *
 * Mirrors `docs/Bertel_design_exemple/edit-primitives.jsx → SectionDistribution`.
 *
 * READ-ONLY in Plan 4 (see lot1_mapping_decisions.md §16). The channels are
 * projected from the operator actor's `actor_channel` rows already exposed
 * under `actors[].contacts`. Per the canonical decision, an operator-actor
 * write contract is deferred to a follow-up plan; the section surfaces the
 * existing data with a clear lecture-seule banner.
 */

function ChannelRow({ channel }: { channel: ObjectWorkspaceDistributionChannel }) {
  return (
    <div className="chan-row">
      <div className="chan-row__logo">{channel.code}</div>
      <div>
        <div className="chan-row__name">{channel.name}</div>
        <span className="chan-row__url">{channel.url}</span>
      </div>
      <span className={`chan-row__sync ${channel.syncTone}`}>{channel.syncStatus}</span>
    </div>
  );
}

export function SectionDistribution({ editor, folded }: SectionProps) {
  const module = editor.draft.distribution;
  const booking = module.channels.filter((c) => c.group === 'booking');
  const social = module.channels.filter((c) => c.group === 'social');
  const disconnected = module.channels.filter((c) => c.syncTone === 'warn').length;

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
        <p style={{ fontSize: 12, color: 'var(--ink-4)' }}>
          Aucun canal de distribution configuré pour l'acteur opérateur de cette fiche.
        </p>
      ) : (
        booking.map((channel) => <ChannelRow key={channel.id} channel={channel} />)
      )}

      <div className="chip-group__label" style={{ marginTop: 14 }}>Réseaux sociaux</div>
      {social.length === 0 ? (
        <p style={{ fontSize: 12, color: 'var(--ink-4)' }}>
          Aucun réseau social déclaré.
        </p>
      ) : (
        social.map((channel) => <ChannelRow key={channel.id} channel={channel} />)
      )}
    </Fs>
  );
}
