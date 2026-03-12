import { parseRoomTypes } from './utils';

interface ObjectRoomsPanelProps {
  raw: Record<string, unknown>;
}

export function ObjectRoomsPanel({ raw }: ObjectRoomsPanelProps) {
  const roomTypes = parseRoomTypes(raw);

  return (
    <div className="drawer-grid drawer-grid--stacked">
      <section className="panel-card field-block--wide">
        <div className="panel-heading">
          <div>
            <span className="eyebrow">Hebergement</span>
            <h2>Types de chambres</h2>
          </div>
          <button type="button" className="ghost-button">Gerer les room types</button>
        </div>
        <div className="stack-list">
          {roomTypes.length > 0 ? roomTypes.map((roomType) => (
            <article key={roomType.id} className="panel-card panel-card--nested room-card">
              <strong>{roomType.name}</strong>
              <div className="room-card__grid">
                <span>Capacite adultes: {roomType.capacityAdults}</span>
                <span>Lits: {roomType.beds}</span>
                <span>Quantite: {roomType.quantity}</span>
              </div>
              {roomType.amenities.length > 0 && <small>{roomType.amenities.join(' · ')}</small>}
            </article>
          )) : <p>Le panneau est pret pour `object_room_type`, la configuration lits et les capacites.</p>}
        </div>
      </section>
    </div>
  );
}
