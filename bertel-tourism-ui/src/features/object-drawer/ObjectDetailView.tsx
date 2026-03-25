import type { ObjectDetail } from '../../types/domain';
import { readString, readArray, parseRoomTypes, parseOpenings, parseContacts } from './utils';

// Object type families — matches BackendObjectTypeCode in domain.ts
const ACCOMMODATION_TYPES = new Set(['HOT', 'HPA', 'HLO', 'CAMP', 'RVA']);
const ITINERARY_TYPES = new Set(['ITI', 'FMA']);

interface DetailViewProps {
  data: ObjectDetail;
  raw: Record<string, unknown>;
}

/** Resolve a display label from a potentially nested object (e.g. {name, code, label}). */
function resolveLabel(value: unknown): string {
  if (!value) {
    return '';
  }
  if (typeof value === 'string' || typeof value === 'number') {
    return String(value);
  }
  if (typeof value === 'object' && !Array.isArray(value)) {
    const r = value as Record<string, unknown>;
    return String(r.name ?? r.label ?? r.code ?? '');
  }
  return '';
}

function IdentityBlock({ data, raw, eyebrow }: DetailViewProps & { eyebrow: string }) {
  const address = resolveLabel((raw.location as Record<string, unknown> | undefined)?.address);
  const description = readString(raw.description as unknown);

  return (
    <article className="panel-card panel-card--nested">
      <div className="panel-heading">
        <div>
          <span className="eyebrow">{eyebrow}</span>
          <h2 className="font-display text-2xl font-semibold">{data.name}</h2>
          {address && <p>{address}</p>}
        </div>
      </div>
      {description && <p className="detail-description mt-2 text-sm text-muted-foreground">{description}</p>}
    </article>
  );
}

function AccommodationDetailView({ data, raw }: DetailViewProps) {
  const rooms = parseRoomTypes(raw);
  const openings = parseOpenings(raw);
  const contacts = parseContacts(raw);
  const eyebrow = readString(data.type, 'Hébergement');

  return (
    <div className="object-detail-view drawer-form-stack">
      <IdentityBlock data={data} raw={raw} eyebrow={eyebrow} />

      <div className="drawer-grid">
        {rooms.length > 0 && (
          <article className="panel-card panel-card--nested">
            <span className="facet-title">Hébergement</span>
            <div className="stack-list">
              {rooms.map((room) => (
                <div key={room.id} className="timeline-item">
                  <strong>{room.name}</strong>
                  <small>{[room.quantity && `${room.quantity} unité(s)`, room.beds].filter(Boolean).join(' · ')}</small>
                  {room.amenities.length > 0 && <small>{room.amenities.slice(0, 4).join(' · ')}</small>}
                </div>
              ))}
            </div>
          </article>
        )}

        {openings.length > 0 && (
          <article className="panel-card panel-card--nested">
            <span className="facet-title">Ouvertures</span>
            <div className="stack-list">
              {openings.slice(0, 3).map((opening, index) => (
                <div key={`${opening.label}-${index}`} className="timeline-item">
                  <strong>{opening.label}</strong>
                  {opening.weekdays.length > 0 && <small>{opening.weekdays.join(', ')}</small>}
                  {opening.slots.length > 0 && <small>{opening.slots.slice(0, 2).join(' · ')}</small>}
                </div>
              ))}
              {openings.length > 3 && <small className="text-muted-foreground">+ {openings.length - 3} autre(s)</small>}
            </div>
          </article>
        )}

        {contacts.length > 0 && (
          <article className="panel-card panel-card--nested">
            <span className="facet-title">Contacts</span>
            <div className="stack-list">
              {contacts.slice(0, 4).map((contact) => (
                <div key={contact.id} className="timeline-item">
                  <strong>{contact.label}</strong>
                  <small>{contact.value}</small>
                </div>
              ))}
              {contacts.length > 4 && <small className="text-muted-foreground">+ {contacts.length - 4} autre(s)</small>}
            </div>
          </article>
        )}
      </div>
    </div>
  );
}

function ItineraryDetailView({ data, raw }: DetailViewProps) {
  const lengthKm = resolveLabel(raw.length_km ?? raw.distance_km ?? raw.total_length_km);
  const durationH = resolveLabel(raw.duration_h ?? raw.duration_hours ?? raw.total_duration_h);
  const difficulty = resolveLabel(raw.difficulty);
  const isLoop = Boolean(raw.is_loop);
  const practices = readArray(raw.practices ?? raw.object_practices ?? [])
    .map((p) => resolveLabel((p as Record<string, unknown>).name ?? (p as Record<string, unknown>).practice ?? p))
    .filter(Boolean);

  const hasStats = Boolean(lengthKm || durationH || difficulty);
  const eyebrow = `Itinéraire${isLoop ? ' · Boucle' : ''}`;

  return (
    <div className="object-detail-view drawer-form-stack">
      <IdentityBlock data={data} raw={raw} eyebrow={eyebrow} />

      {hasStats && (
        <article className="panel-card panel-card--nested">
          <span className="facet-title">Caractéristiques</span>
          <div className="room-card__grid">
            {lengthKm && <span>Distance : {lengthKm} km</span>}
            {durationH && <span>Durée : {durationH} h</span>}
            {difficulty && <span>Difficulté : {difficulty}</span>}
          </div>
        </article>
      )}

      {practices.length > 0 && (
        <article className="panel-card panel-card--nested">
          <span className="facet-title">Pratiques</span>
          <div className="stack-list">
            {practices.map((practice, index) => (
              <span key={`${practice}-${index}`} className="timeline-item">{practice}</span>
            ))}
          </div>
        </article>
      )}
    </div>
  );
}

function GenericDetailView({ data, raw }: DetailViewProps) {
  const eyebrow = readString(data.type, 'Fiche');

  return (
    <div className="object-detail-view drawer-form-stack">
      <IdentityBlock data={data} raw={raw} eyebrow={eyebrow} />
    </div>
  );
}

/** Renders a read-only detail view adaptive to object type.
 *  Dispatches to AccommodationDetailView (HOT/HPA/HLO/CAMP/RVA),
 *  ItineraryDetailView (ITI/FMA), or GenericDetailView for unrecognised types.
 */
export function ObjectDetailView({ data, raw }: DetailViewProps) {
  const objectType = (data.type ?? '').toUpperCase();

  if (ACCOMMODATION_TYPES.has(objectType)) {
    return <AccommodationDetailView data={data} raw={raw} />;
  }
  if (ITINERARY_TYPES.has(objectType)) {
    return <ItineraryDetailView data={data} raw={raw} />;
  }
  return <GenericDetailView data={data} raw={raw} />;
}
