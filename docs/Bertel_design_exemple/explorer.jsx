/* global React, Ico, DATA */
const { useState } = React;

function Sidebar({ active, onChange }) {
  const items = [
  { key: 'explorer', icon: 'compass', label: 'Explorer' },
  { key: 'dash', icon: 'dash', label: 'Dashboard' },
  { key: 'crm', icon: 'crm', label: 'CRM' },
  { key: 'pub', icon: 'layers', label: 'Publications', dot: true },
  { key: 'inbox', icon: 'inbox', label: 'Inbox' }];

  return (
    <aside className="rail">
      <div className="rail__logo"><img src="assets/logo.png" alt="OTI Sud" /></div>
      {items.map((it) =>
      <button
        key={it.key}
        className={'rail__btn' + (active === it.key ? ' is-active' : '')}
        onClick={() => onChange(it.key)}
        title={it.label}>
          {Ico[it.icon] && Ico[it.icon]({})}
          {it.dot && <span className="dot" />}
        </button>
      )}
      <div className="rail__divider" />
      <button className="rail__btn" title="Paramètres">{Ico.settings({})}</button>
      <div className="rail__bottom">
        <button className="rail__btn" title="Aide">{Ico.help({})}</button>
        <button className="rail__btn" title="Notifications">{Ico.bell({})}<span className="dot" /></button>
        <div className="rail__avatar">DG</div>
      </div>
    </aside>);

}

function TopBar() {
  return (
    <header className="topbar">
      <div className="topbar__title">
        <button className="icon-btn">{Ico.menu({})}</button>
        <span className="crumb">Tourism</span>
        <span className="crumb-sep">/</span>
        <span>Explorer</span>
      </div>
      <div className="search">
        {Ico.search({})}
        <input placeholder="Rechercher une fiche, une ville ou une action..." />
        <kbd>⌘K</kbd>
      </div>
      <div className="topbar__actions">
        <span className="pill-status"><span className="dot" /> 1 live</span>
        <button className="btn sm">Mer. 13 Mai · 13:34</button>
      </div>
    </header>);

}

function FilterChips({ items, kind = 'chip' }) {
  const [state, setState] = useState(items);
  return (
    <div className="chip-row">
      {state.map((it, i) =>
      <button key={it.key}
      className={'chip' + (it.on ? ' is-on' : '')}
      onClick={() => setState((s) => s.map((x, j) => j === i ? { ...x, on: !x.on } : x))}>
          {it.label}
          <span className="chip__count">{it.count}</span>
        </button>
      )}
    </div>);

}

function FilterCheckList({ items }) {
  const [state, setState] = useState(items);
  return (
    <div>
      {state.map((it, i) =>
      <div className="list-row" key={it.key}
      onClick={() => setState((s) => s.map((x, j) => j === i ? { ...x, on: !x.on } : x))}>
          <div className="list-row__left">
            <span className={'checkbox' + (it.on ? ' is-on' : '')}>
              {it.on && Ico.check({})}
            </span>
            <span>{it.label}</span>
          </div>
          <span className="list-row__count">{it.count}</span>
        </div>
      )}
    </div>);

}

function Filters() {
  return (
    <div className="col col-filters" style={{ minWidth: 0 }}>
      <div className="col-head">
        <div className="col-head__title">
          Filtres
          <span className="col-head__count">3 actifs</span>
        </div>
        <div className="col-head__actions">
          <button className="btn sm ghost" style={{ color: 'var(--orange-2)' }}>Réinitialiser</button>
        </div>
      </div>
      <div className="filters">
        <div className="filters__group">
          <div className="filters__label">Catégorie <span className="count">7</span></div>
          <FilterChips items={DATA.FILTER_CATEGORIES} />
        </div>

        <div className="filters__group">
          <div className="filters__label">Statut</div>
          <div className="chip-row">
            <button className="chip is-on">Publié <span className="chip__count">312</span></button>
            <button className="chip">Brouillon <span className="chip__count">38</span></button>
            <button className="chip">Archivé <span className="chip__count">14</span></button>
          </div>
        </div>

        <div className="filters__group">
          <div className="filters__label">Localisation</div>
          <FilterCheckList items={DATA.LOCATIONS} />
        </div>

        <div className="filters__group">
          <div className="filters__label">Labels & certifications</div>
          <FilterCheckList items={DATA.LABELS} />
        </div>

        <div className="filters__group">
          <div className="filters__label">Capacité d'accueil</div>
          <div className="slider-track">
            <div className="slider-fill" />
            <div className="slider-thumb" style={{ left: '20%' }} />
            <div className="slider-thumb" style={{ left: '70%' }} />
          </div>
          <div className="slider-vals">
            <span>2 personnes</span><span>14 personnes</span>
          </div>
        </div>

        <div className="filters__group">
          <div className="filters__label">Ouverture</div>
          <div className="chip-row">
            <button className="chip is-on">Aujourd'hui</button>
            <button className="chip">Cette semaine</button>
            <button className="chip">Week-end</button>
          </div>
        </div>

        <div className="filters__group">
          <div className="filters__label">Plus de filtres</div>
          <div className="chip-row">
            <button className="chip">+ Équipements</button>
            <button className="chip">+ Langues</button>
            <button className="chip">+ Paiements</button>
            <button className="chip">+ Tarifs</button>
          </div>
        </div>
      </div>
    </div>);

}

function ResultCard({ r, selected, onSelect, onOpen }) {
  return (
    <button
      className={'result' + (selected ? ' is-selected' : '')}
      onClick={() => onSelect(r.id)}
      onDoubleClick={() => onOpen(r.id)} style={{ borderWidth: "0.3px", borderRadius: "5px" }}>
      <div className="result__media" style={{ backgroundImage: `url(${r.photo})` }}>
        <span className="result__type">{Ico.bed({ width: 12, height: 12 })}</span>
      </div>
      <div className="result__body">
        <div className="result__title-row">
          <span className={'result__status' + (r.open ? ' is-open' : ' is-closed')}
          title={r.open ? 'Ouvert' : 'Fermé'} />
          <h3 className="result__title">{r.name}</h3>
        </div>
        <div className="result__meta">
          <span>{Ico.pin({ width: 12, height: 12, style: { verticalAlign: -1 } })} {r.city}</span>
          <span className="sep">·</span>
          <span>{r.type}</span>
          {r.capacity != null && <><span className="sep">·</span><span>{r.capacity} pers.</span></>}
        </div>
        <div className="result__tags">
          {r.tags.slice(0, 2).map(([label, tone], i) =>
          <span key={i} className={'tag ' + (tone || '')}>{label}</span>
          )}
          {(r.tags.length > 2 || r.more > 0) &&
          <span className="tag outline tag--more">+{r.more + Math.max(0, r.tags.length - 2)}</span>
          }
        </div>
      </div>
      <div className="result__side">
        <span className={'result__star' + (r.fav ? ' is-on' : '')} title="Favori" role="button" onClick={(e) => e.stopPropagation()}>{Ico.star({})}</span>
      </div>
    </button>);

}

function Results({ selectedId, onSelect, onOpen }) {
  return (
    <div className="col col-results">
      <div className="col-head">
        <div className="col-head__title">
          Résultats
          <span className="col-head__count">364 fiches · 3 sélectionnées</span>
        </div>
        <div className="col-head__actions">
          <button className="btn sm ghost">Trier · Pertinence{Ico.chev({})}</button>
          <button className="btn sm ghost" title="Plein écran">{Ico.expand({})}</button>
        </div>
      </div>
      <div className="results">
        {DATA.RESULTS.map((r) =>
        <ResultCard key={r.id} r={r} selected={selectedId === r.id}
        onSelect={onSelect} onOpen={onOpen} />
        )}
      </div>
    </div>);

}

function MapPanel({ onOpen }) {
  const [hoveredPin, setHoveredPin] = useState(null);
  // Markers placed within La Réunion island silhouette (south region)
  const markers = [
  // West coast (Saint-Pierre area)
  { x: 22, y: 68, n: 46, size: 'l', dark: true },
  { x: 16, y: 62, n: 17, size: 'm' },
  { x: 28, y: 76, n: 25, size: 'l', dark: true },
  { x: 20, y: 78, n: 8, size: 's' },
  // Le Tampon central
  { x: 38, y: 60, n: 29, size: 'l', dark: true },
  { x: 32, y: 54, n: 12, size: 'm' },
  { x: 44, y: 66, n: 11, size: 'm' },
  { x: 36, y: 50, n: 6, size: 's' },
  // Saint-Joseph east
  { x: 50, y: 78, n: 45, size: 'l', dark: true },
  { x: 56, y: 72, n: 17, size: 'm' },
  { x: 60, y: 80, n: 9, size: 's' },
  { x: 46, y: 70, n: 5, size: 's' },
  // Plaine des Cafres (interior)
  { x: 54, y: 46, n: 14, size: 'm' },
  { x: 62, y: 52, n: 7, size: 's' },
  { x: 46, y: 38, n: 3, size: 's' },
  // Saint-Philippe east
  { x: 74, y: 74, n: 11, size: 'm' },
  { x: 80, y: 68, n: 8, size: 's' },
  { x: 70, y: 80, n: 6, size: 's' },
  // North (Cilaos / Salazie direction)
  { x: 36, y: 34, n: 6, size: 's' },
  { x: 52, y: 28, n: 4, size: 's' },
  { x: 64, y: 32, n: 5, size: 's' },
  // Single highlights (selected pins)
  { x: 30, y: 70, n: 1, size: 's', solo: true },
  { x: 50, y: 56, n: 1, size: 's', solo: true },
  { x: 72, y: 62, n: 1, size: 's', solo: true }];

  // Sample fiches shown by solo (single-pin) hovers — keyed by marker index
  const SOLO_PREVIEWS = {
    21: DATA.RESULTS[0],
    22: DATA.RESULTS[4],
    23: DATA.RESULTS[5]
  };

  return (
    <div className="col col-map">
      <div className="col-head">
        <div className="col-head__title">
          Carte
          <span className="col-head__count">29 zones</span>
        </div>
        <div className="col-head__actions">
          <button className="btn sm ghost">{Ico.layers({ width: 14, height: 14 })} Couches</button>
          <button className="btn sm ghost" title="Plein écran">{Ico.expand({})}</button>
        </div>
      </div>
      <div className="map">
        <div className="map-bg" />
        <div className="map-grid" />
        {/* Réunion island silhouette + landmarks */}
        <svg className="map-coast" viewBox="0 0 100 100" preserveAspectRatio="xMidYMid meet">
          <defs>
            <linearGradient id="land" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#dfe9c8" />
              <stop offset="100%" stopColor="#c9d9a8" />
            </linearGradient>
            <radialGradient id="peak" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#a8b988" stopOpacity="0.6" />
              <stop offset="100%" stopColor="#a8b988" stopOpacity="0" />
            </radialGradient>
          </defs>
          {/* Island body */}
          <path d="M50,12 C66,12 78,18 85,30 C92,42 92,56 88,68 C84,80 72,88 60,90 C46,92 30,90 20,82 C10,74 6,60 8,46 C10,32 18,22 30,16 C36,13 42,12 50,12 Z"
          fill="url(#land)" stroke="rgba(255,255,255,0.7)" strokeWidth="0.4" />
          {/* Volcano shadow */}
          <circle cx="58" cy="48" r="14" fill="url(#peak)" />
          <circle cx="42" cy="44" r="12" fill="url(#peak)" />
          {/* Roads */}
          <path d="M14,60 Q30,72 50,76 T88,64" stroke="rgba(255,255,255,0.65)" strokeWidth="0.5" fill="none" strokeDasharray="0.6 0.6" />
          <path d="M22,28 Q42,38 60,40 T84,38" stroke="rgba(255,255,255,0.55)" strokeWidth="0.4" fill="none" strokeDasharray="0.6 0.6" />
        </svg>
        {/* City labels */}
        <span className="city-label" style={{ left: '16%', top: '70%' }}>Saint-Pierre</span>
        <span className="city-label" style={{ left: '38%', top: '78%' }}>Saint-Joseph</span>
        <span className="city-label" style={{ left: '32%', top: '52%' }}>Le Tampon</span>
        <span className="city-label" style={{ left: '24%', top: '40%' }}>L'Entre-Deux</span>
        <span className="city-label" style={{ left: '64%', top: '50%' }}>Plaine des Cafres</span>
        <span className="city-label" style={{ left: '76%', top: '76%' }}>Saint-Philippe</span>

        <div className="map-overlay-top">
        </div>

        {markers.map((m, i) =>
        <span key={i} className="marker" style={{ left: m.x + '%', top: m.y + '%' }}
        onMouseEnter={() => m.solo && setHoveredPin(i)}
        onMouseLeave={() => setHoveredPin(null)}
        onClick={() => m.solo && onOpen('r1')}>
            <span className={'marker__pin ' + m.size + (m.dark ? ' dark' : '') + (m.solo ? ' solo' : '')}>
              {m.solo ? '' : m.n}
            </span>
            {m.solo && hoveredPin === i && SOLO_PREVIEWS[i] &&
            <MapPopup r={SOLO_PREVIEWS[i]} onOpen={() => onOpen(SOLO_PREVIEWS[i].id)}/>
            }
          </span>
        )}

        <div className="map-zoom">
          <button>{Ico.plus({})}</button>
          <button>{Ico.minus({})}</button>
        </div>

        {/* Selection bar */}
        <div className="selbar">
          <span className="selbar__count"><span className="num">3</span> fiches</span>
          <span className="sep" />
          <button className="act">{Ico.bag({})} Sélection</button>
          <button className="act">{Ico.print({})} Imprimer</button>
          <button className="act">{Ico.download({})} CSV</button>
          <button className="act">{Ico.trash({})} Vider</button>
          <span className="sep" />
          <button className="primary act">{Ico.mail({})} Envoyer</button>
        </div>
      </div>
    </div>);

}

function MapPopup({ r, onOpen }) {
  return (
    <div className="map-popup" onClick={(e) => e.stopPropagation()}>
      <div className="map-popup__media" style={{ backgroundImage: `url(${r.photo})` }}>
        <span className={'map-popup__status ' + (r.open ? 'is-open' : 'is-closed')}>
          <span className="dot"/>{r.open ? 'Ouvert' : 'Fermé'}
        </span>
      </div>
      <div className="map-popup__body">
        <h4 className="map-popup__title">{r.name}</h4>
        <div className="map-popup__meta">
          {Ico.pin({ width: 11, height: 11 })} {r.city} <span className="sep">·</span> {r.type}
        </div>
        <div className="map-popup__tags">
          {r.tags.slice(0, 2).map(([label, tone], i) => (
            <span key={i} className={'tag ' + (tone || '')}>{label}</span>
          ))}
        </div>
        <button className="map-popup__cta" onClick={onOpen}>
          Ouvrir la fiche
          {Ico.caret({ width: 12, height: 12 })}
        </button>
      </div>
      <span className="map-popup__tail"/>
    </div>
  );
}

function Explorer({ onOpen }) {
  const [selected, setSelected] = useState('r1');
  return (
    <div className="explorer">
      <Filters />
      <Results selectedId={selected} onSelect={setSelected} onOpen={onOpen} />
      <MapPanel onOpen={onOpen} />
    </div>);

}

window.Sidebar = Sidebar;
window.TopBar = TopBar;
window.Explorer = Explorer;