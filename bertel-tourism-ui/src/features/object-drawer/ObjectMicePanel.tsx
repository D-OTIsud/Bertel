import { parseMeetingRooms } from './utils';

interface ObjectMicePanelProps {
  raw: Record<string, unknown>;
}

export function ObjectMicePanel({ raw }: ObjectMicePanelProps) {
  const meetingRooms = parseMeetingRooms(raw);

  return (
    <div className="drawer-grid drawer-grid--stacked">
      <section className="panel-card field-block--wide">
        <div className="panel-heading">
          <div>
            <span className="eyebrow">MICE</span>
            <h2>Salles & equipements</h2>
          </div>
          <button type="button" className="ghost-button">Configurer les salles</button>
        </div>
        <div className="stack-list">
          {meetingRooms.length > 0 ? meetingRooms.map((room) => (
            <article key={room.id} className="panel-card panel-card--nested room-card">
              <strong>{room.name}</strong>
              <div className="room-card__grid">
                <span>Theatre: {room.capacityTheatre}</span>
                <span>Classe: {room.capacityClassroom}</span>
                <span>Equipements: {room.equipment.length > 0 ? room.equipment.join(', ') : 'n/a'}</span>
              </div>
            </article>
          )) : <p>Le panneau est pret pour `object_meeting_room` et les equipements MICE.</p>}
        </div>
      </section>
    </div>
  );
}
