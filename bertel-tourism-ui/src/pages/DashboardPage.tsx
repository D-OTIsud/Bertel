import { mockCards, mockTimeline } from '../data/mock';
import { useSessionStore } from '../store/session-store';
import { useThemeStore } from '../store/theme-store';
import { useUiStore } from '../store/ui-store';

export function DashboardPage() {
  const role = useSessionStore((state) => state.role);
  const brandName = useThemeStore((state) => state.theme.brandName);
  const logoUrl = useThemeStore((state) => state.theme.logoUrl);
  const openDrawer = useUiStore((state) => state.openDrawer);
  const visibleObjects = role === 'owner' ? mockCards.filter((item) => item.type === 'HOT' || item.type === 'RES') : mockCards;
  const liveEditing = mockCards.slice(0, 3);
  const openNowCount = visibleObjects.filter((item) => item.open_now).length;
  const attentionCount = visibleObjects.length - openNowCount;

  return (
    <section className="dashboard-shell">
      <article className="hero-panel dashboard-hero">
        <div className="dashboard-hero__content">
          <span className="eyebrow">Overview</span>
          <h2>{role === 'owner' ? 'Pilotage proprietaire plus lisible' : 'Poste de pilotage du reseau touristique'}</h2>
          <p>
            {role === 'owner'
              ? 'Retrouvez vos etablissements, les actions prioritaires et les signaux de collaboration dans une vue plus sereine.'
              : `Gardez la pulse du reseau ${brandName}, les activites en cours et les objets a surveiller dans un meme cockpit.`}
          </p>
          <div className="dashboard-hero__metrics">
            <article className="dashboard-metric-card">
              <span>Fiches suivies</span>
              <strong>{visibleObjects.length}</strong>
            </article>
            <article className="dashboard-metric-card">
              <span>Ouvertes maintenant</span>
              <strong>{openNowCount}</strong>
            </article>
            <article className="dashboard-metric-card">
              <span>Attention requise</span>
              <strong>{attentionCount}</strong>
            </article>
          </div>
          <div className="inline-actions">
            <button type="button" className="primary-button">Ouvrir le radar</button>
            <button type="button" className="ghost-button">Partager un export</button>
          </div>
        </div>
        <div className="dashboard-brand-card">
          {logoUrl ? (
            <img src={logoUrl} alt={brandName} className="dashboard-brand-card__logo" />
          ) : (
            <div className="dashboard-brand-card__logo dashboard-brand-card__logo--fallback">{brandName.slice(0, 1)}</div>
          )}
          <strong>{brandName}</strong>
          <span>Branding live et direction editoriale centralisee.</span>
          <div className="dashboard-brand-card__stats">
            <div>
              <span>Edition live</span>
              <strong>{liveEditing.length}</strong>
            </div>
            <div>
              <span>Focus du jour</span>
              <strong>{role === 'owner' ? 'Portefeuille' : 'Moderation'}</strong>
            </div>
          </div>
        </div>
      </article>

      <div className="dashboard-grid">
        <section className="dashboard-grid__main">
          <div className="stats-grid dashboard-stats-grid">
            <article className="stat-card stat-card--highlight">
              <span>Fiches actives</span>
              <strong>{visibleObjects.length}</strong>
            </article>
            <article className="stat-card">
              <span>Ouvertes maintenant</span>
              <strong>{openNowCount}</strong>
            </article>
            <article className="stat-card">
              <span>Score moyen</span>
              <strong>4.6</strong>
            </article>
            <article className="stat-card">
              <span>Editeurs en direct</span>
              <strong>{liveEditing.length}</strong>
            </article>
          </div>

          <article className="panel-card panel-card--wide">
            <div className="panel-heading">
              <div>
                <span className="eyebrow">Portefeuille</span>
                <h2>Acces rapides</h2>
                <p>Entrez dans une fiche depuis la vue portefeuille sans perdre le contexte global.</p>
              </div>
              <button type="button" className="ghost-button">Voir tout</button>
            </div>
            <div className="dashboard-card-grid">
              {visibleObjects.map((item) => (
                <button key={item.id} type="button" className="dashboard-object-card" onClick={() => openDrawer(item.id)}>
                  <div className="dashboard-object-card__media" style={{ backgroundImage: `linear-gradient(180deg, rgba(24, 49, 59, 0.06), rgba(24, 49, 59, 0.18)), url(${item.image ?? ''})` }} />
                  <div className="dashboard-object-card__body">
                    <div className="dashboard-object-card__title-row">
                      <strong>{item.name}</strong>
                      {item.open_now ? <span className="open-pill open-pill--open">Ouvert</span> : <span className="open-pill">A suivre</span>}
                    </div>
                    <span>{item.location?.city ?? 'Sans ville'}</span>
                    <small>{item.render?.updated_at ?? item.render?.price ?? item.render?.rating ?? 'Mise a jour recente'}</small>
                  </div>
                </button>
              ))}
            </div>
          </article>
        </section>

        <aside className="dashboard-grid__side">
          <article className="panel-card">
            <div className="panel-heading">
              <div>
                <span className="eyebrow">Activite live</span>
                <h2>Radar equipe</h2>
              </div>
            </div>
            <div className="stack-list">
              {liveEditing.map((item, index) => (
                <article key={item.id} className="timeline-item">
                  <strong>{['Marie', 'Jean', 'Lina'][index] ?? 'Equipe'}</strong>
                  <p>edite actuellement {item.name}</p>
                  <span>{item.location?.city}</span>
                </article>
              ))}
            </div>
          </article>

          <article className="panel-card">
            <div className="panel-heading">
              <div>
                <span className="eyebrow">Timeline</span>
                <h2>Dernieres interactions</h2>
              </div>
            </div>
            <div className="stack-list">
              {mockTimeline.map((item) => (
                <article key={item.id} className="timeline-item">
                  <strong>{item.author}</strong>
                  <p>{item.text}</p>
                  <span>{item.at}</span>
                </article>
              ))}
            </div>
          </article>
        </aside>
      </div>
    </section>
  );
}
