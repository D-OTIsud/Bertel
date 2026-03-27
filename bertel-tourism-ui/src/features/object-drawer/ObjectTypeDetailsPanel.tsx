import type { ModifierPayload } from '../../services/modifier-payload';
import { ModifierEmptyState, ModifierSectionHero, ModifierStatStrip } from './modifier-shared';

interface ObjectTypeDetailsPanelProps {
  payload: ModifierPayload;
}

function readString(value: unknown, fallback = ''): string {
  if (typeof value === 'string') {
    return value;
  }
  if (typeof value === 'number') {
    return String(value);
  }
  return fallback;
}

export function ObjectTypeDetailsPanel({ payload }: ObjectTypeDetailsPanelProps) {
  const typeCode = payload.typeCode;
  const hasTypeDetails =
    payload.typeDetails.capacities.length > 0
    || payload.typeDetails.roomTypes.length > 0
    || payload.typeDetails.meetingRooms.length > 0
    || payload.typeDetails.menus.length > 0
    || payload.typeDetails.itineraryStages.length > 0
    || payload.typeDetails.itinerarySections.length > 0
    || payload.typeDetails.itineraryProfiles.length > 0
    || payload.typeDetails.activity !== null
    || payload.typeDetails.events.length > 0
    || payload.typeDetails.eventOccurrences.length > 0;

  if (!hasTypeDetails) {
    return (
      <ModifierEmptyState
        title="Pas de profondeur typologique"
        body="Cette typologie utilise surtout les surfaces communes. Le detail metier apparaitra ici quand les satellites seront exposes."
      />
    );
  }

  return (
    <div className="drawer-form-stack">
      <ModifierSectionHero
        kicker="Type Details"
        title="Surface metier profonde"
        description="Chaque type garde sa logique propre ici: chambres et MICE, carte de restaurant, traces d itineraire, parametres d activite ou calendrier d evenement."
        stats={[
          { label: 'Capacites', value: String(payload.typeDetails.capacities.length) },
          { label: 'Chambres', value: String(payload.typeDetails.roomTypes.length) },
          { label: 'Menus', value: String(payload.typeDetails.menus.length) },
          { label: 'Occurrences', value: String(payload.typeDetails.eventOccurrences.length) },
        ]}
        chips={[payload.typeLabel, typeCode].filter(Boolean)}
      />

      {payload.typeDetails.capacities.length > 0 && (
        <section className="panel-card panel-card--nested">
          <span className="facet-title">Capacites</span>
          <ModifierStatStrip
            stats={payload.typeDetails.capacities.map((capacity) => ({
              label: capacity.label,
              value: capacity.value,
            }))}
          />
        </section>
      )}

      {payload.typeDetails.roomTypes.length > 0 && (
        <section className="panel-card panel-card--nested">
          <span className="facet-title">Chambres et unites</span>
          <div className="modifier-card-list">
            {payload.typeDetails.roomTypes.map((room) => (
              <article key={room.id} className="detail-mini-card">
                <div className="detail-mini-card__header">
                  <strong>{room.name}</strong>
                  {room.quantity && room.quantity !== 'n/a' && <span className="detail-chip detail-chip--soft">{room.quantity}</span>}
                </div>
                <p className="detail-mini-card__meta">
                  {[room.capacityAdults !== 'n/a' ? `${room.capacityAdults} adultes` : '', room.beds !== 'n/a' ? room.beds : '']
                    .filter(Boolean)
                    .join(' · ')}
                </p>
                {room.amenities.length > 0 && <small>{room.amenities.join(' · ')}</small>}
              </article>
            ))}
          </div>
        </section>
      )}

      {payload.typeDetails.meetingRooms.length > 0 && (
        <section className="panel-card panel-card--nested">
          <span className="facet-title">MICE</span>
          <div className="modifier-card-list">
            {payload.typeDetails.meetingRooms.map((room) => (
              <article key={room.id} className="detail-mini-card">
                <div className="detail-mini-card__header">
                  <strong>{room.name}</strong>
                </div>
                <ModifierStatStrip
                  stats={[
                    room.capacityTheatre !== 'n/a' ? { label: 'Theatre', value: room.capacityTheatre } : null,
                    room.capacityClassroom !== 'n/a' ? { label: 'Classe', value: room.capacityClassroom } : null,
                    room.capacityBoardroom !== 'n/a' ? { label: 'Conseil', value: room.capacityBoardroom } : null,
                    room.areaM2 !== 'n/a' ? { label: 'Surface', value: `${room.areaM2} m2` } : null,
                  ].filter((item): item is { label: string; value: string } => item !== null)}
                />
              </article>
            ))}
          </div>
        </section>
      )}

      {payload.typeDetails.menus.length > 0 && (
        <section className="panel-card panel-card--nested">
          <span className="facet-title">Carte & menus</span>
          <div className="modifier-card-list">
            {payload.typeDetails.menus.map((menu) => (
              <article key={menu.id} className="detail-mini-card">
                <div className="detail-mini-card__header">
                  <strong>{menu.name}</strong>
                  <span className="detail-chip detail-chip--soft">{menu.items.length} items</span>
                </div>
                {menu.description && <p className="detail-mini-card__meta">{menu.description}</p>}
                <div className="detail-chip-strip detail-chip-strip--compact">
                  {menu.items.slice(0, 4).map((item) => (
                    <span key={item.id} className="detail-chip detail-chip--soft">
                      {item.name}
                    </span>
                  ))}
                </div>
              </article>
            ))}
          </div>
        </section>
      )}

      {typeCode === 'ITI' && (
        <section className="panel-card panel-card--nested">
          <span className="facet-title">Structure itineraire</span>
          <div className="drawer-grid modifier-read-grid">
            <article className="detail-mini-card">
              <strong>Etapes</strong>
              <p className="detail-mini-card__meta">{payload.typeDetails.itineraryStages.length} etapes</p>
            </article>
            <article className="detail-mini-card">
              <strong>Sections</strong>
              <p className="detail-mini-card__meta">{payload.typeDetails.itinerarySections.length} sections</p>
            </article>
            <article className="detail-mini-card">
              <strong>Profils</strong>
              <p className="detail-mini-card__meta">{payload.typeDetails.itineraryProfiles.length} profils</p>
            </article>
            <article className="detail-mini-card">
              <strong>Infos pratiques</strong>
              <p className="detail-mini-card__meta">{payload.typeDetails.itineraryInfos.length} blocs</p>
            </article>
          </div>
        </section>
      )}

      {typeCode === 'ACT' && payload.typeDetails.activity && (
        <section className="panel-card panel-card--nested">
          <span className="facet-title">Parametres activite</span>
          <ModifierStatStrip
            stats={[
              readString(payload.typeDetails.activity.duration_min) ? { label: 'Duree', value: `${readString(payload.typeDetails.activity.duration_min)} min` } : null,
              readString(payload.typeDetails.activity.min_participants) ? { label: 'Min pax', value: readString(payload.typeDetails.activity.min_participants) } : null,
              readString(payload.typeDetails.activity.max_participants) ? { label: 'Max pax', value: readString(payload.typeDetails.activity.max_participants) } : null,
              readString(payload.typeDetails.activity.difficulty_level) ? { label: 'Difficulte', value: readString(payload.typeDetails.activity.difficulty_level) } : null,
            ].filter((item): item is { label: string; value: string } => item !== null)}
          />
        </section>
      )}

      {typeCode === 'FMA' && (payload.typeDetails.events.length > 0 || payload.typeDetails.eventOccurrences.length > 0) && (
        <section className="panel-card panel-card--nested">
          <span className="facet-title">Calendrier evenement</span>
          <div className="modifier-card-list">
            {payload.typeDetails.events.map((event, index) => (
              <article key={readString(event.id, `event-${index}`)} className="detail-mini-card">
                <div className="detail-mini-card__header">
                  <strong>{readString(event.name, 'Evenement')}</strong>
                  {readString(event.event_start_date) && <span className="detail-chip detail-chip--soft">{readString(event.event_start_date)}</span>}
                </div>
                <p className="detail-mini-card__meta">
                  {[readString(event.event_start_date), readString(event.event_end_date)].filter(Boolean).join(' -> ') || 'Dates non renseignees'}
                </p>
              </article>
            ))}
            {payload.typeDetails.eventOccurrences.slice(0, 4).map((occurrence, index) => (
              <article key={readString(occurrence.id, `occurrence-${index}`)} className="detail-mini-card">
                <div className="detail-mini-card__header">
                  <strong>Occurrence</strong>
                  <span className="detail-chip detail-chip--soft">{readString(occurrence.state, 'planned')}</span>
                </div>
                <p className="detail-mini-card__meta">{[readString(occurrence.start_date), readString(occurrence.end_date)].filter(Boolean).join(' -> ')}</p>
              </article>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
