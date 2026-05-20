/* global React, Ico */
// Type-specific detail pages for Bertel — 6 archetypes covering all object types.
const { useState: useStateT } = React;

// -------- Tiny helpers ---------------------------------------------------
const Star = (p) => (
  <svg viewBox="0 0 24 24" fill="currentColor" {...p}>
    <path d="m12 3 2.7 6 6.3.6-4.8 4.3 1.5 6.4L12 17l-5.7 3.3 1.5-6.4L3 9.6 9.3 9 12 3Z"/>
  </svg>
);
const Stars = ({ n = 4, max = 5 }) => (
  <span className="stars" title={`${n}/${max}`}>
    {Array.from({ length: max }).map((_, i) => (
      <Star key={i} style={{ opacity: i < n ? 1 : 0.25 }}/>
    ))}
  </span>
);
const Months = ['J','F','M','A','M','J','J','A','S','O','N','D'];

// -------- TYPE DEFINITIONS ---------------------------------------------------
const TYPE_DEFS = {

  /* ============== 1. HÉBERGEMENT (HOT/HLO/HPA/CAMP/RVA) ============== */
  HEB: {
    accent: 'acc-teal',
    code: 'HOT',
    codeName: 'Hébergement marchand',
    family: 'Hôtel · Hébergement loisir · Camping · Résidence',
    covers: 'HOT · HPA · HLO · CAMP · RVA',
    name: 'Domaine du Bel Air',
    eyebrow: 'Hôtel ★★★★',
    refId: 'HOT-01284',
    statusPill: { tone: 'on', label: '1 fiche live' },
    badge: 'L\'Entre-Deux · Bras-Long',
    addr: { line: '38 Chemin du Bel Air, 97414 L\'Entre-Deux', coords: '-21.250011, 55.469228' },
    tags: [
      ['Hôtel 4★', 'orange'], ['Cuisine', 'teal'], ['Bien-être', 'teal'],
      ['Séminaire', 'neutral'], ['Tourisme & Handicap', 'outline'],
    ],
    photos: [
      'belair-suite', 'belair-piscine', 'belair-restaurant', 'belair-spa',
    ],
    kpis: [
      { label: 'Capacité', value: '48', unit: 'pers.' },
      { label: 'Chambres', value: '24' },
      { label: 'À partir de', value: '165', unit: '€/nuit' },
      { label: 'Statut', value: 'Ouvert', sub: 'aujourd\'hui · 7h–23h', tone: 'open' },
    ],
    summary:
      `Hôtel-restaurant indépendant niché dans les hauteurs de L'Entre-Deux, à 15 min des plages du Sud. Vue dégagée sur le piton, table semi-gastronomique en circuit court et spa de 220 m² ouvert aux extérieurs.`,
  },

  /* ============== 2. RESTAURANT (RES) ============== */
  RES: {
    accent: 'acc-orange',
    code: 'RES',
    codeName: 'Restaurant',
    family: 'Restauration · Bar · Snack',
    covers: 'RES',
    name: 'Le Manapany — table créole',
    eyebrow: 'Restaurant traditionnel',
    refId: 'RES-00472',
    statusPill: { tone: 'on', label: 'Service en cours' },
    badge: 'Saint-Joseph · Manapany-les-Bains',
    addr: { line: '12 Route de Manapany-les-Bains, 97480 Saint-Joseph', coords: '-21.380942, 55.589008' },
    tags: [
      ['Cuisine créole', 'orange'], ['Fait maison', 'teal'], ['Terrasse vue mer', 'teal'],
      ['Maître Restaurateur', 'outline'], ['Groupes', 'neutral'],
    ],
    photos: ['rougail', 'salle', 'terrasse', 'plat'],
    kpis: [
      { label: 'Couverts', value: '60', sub: '+ 20 en terrasse' },
      { label: 'Ticket moyen', value: '25', unit: '€' },
      { label: 'Cuisine', value: 'Créole', sub: '· française' },
      { label: 'Statut', value: 'Ouvert', sub: 'jusqu\'à 22h00', tone: 'open' },
    ],
    summary:
      `Petite table familiale ouverte en 1998, spécialisée en cuisine créole de bord de mer. La carte change toutes les six semaines selon la pêche et les arrivages du marché. Réservation conseillée le week-end et les jours fériés.`,
  },

  /* ============== 3. ACTIVITÉ (ASC) ============== */
  ASC: {
    accent: 'acc-blue',
    code: 'ASC',
    codeName: 'Activité sportive & culturelle',
    family: 'Activité encadrée · Stage · Initiation',
    covers: 'ASC',
    name: 'Surf School Saint-Pierre',
    eyebrow: 'École de surf · BPJEPS',
    refId: 'ASC-00188',
    statusPill: { tone: 'on', label: 'Sessions du jour' },
    badge: 'Saint-Pierre · Plage de Grands Bois',
    addr: { line: 'Plage de Grands Bois, 97410 Saint-Pierre', coords: '-21.337712, 55.500041' },
    tags: [
      ['Surf', 'teal'], ['Mer & littoral', 'teal'], ['Tous niveaux', 'neutral'],
      ['FFS · École labellisée', 'outline'], ['Plein air', 'orange'],
    ],
    photos: ['surf1', 'planches', 'coach', 'spot'],
    kpis: [
      { label: 'Durée', value: '1h30', sub: 'session standard' },
      { label: 'Niveau', value: 'Tous', sub: 'dès 7 ans' },
      { label: 'À partir de', value: '45', unit: '€/pers' },
      { label: 'Statut', value: 'Ouvert', sub: '3 créneaux restants', tone: 'open' },
    ],
    summary:
      `École de surf agréée Fédération Française de Surf opérant sur le spot abrité de Grands Bois. Cours collectifs (6 max), stages 5 jours et coaching individuel — planches mousse et combis fournis, douche et casiers sur place.`,
  },

  /* ============== 4. ITINÉRAIRE (ITI/FMA) ============== */
  ITI: {
    accent: 'acc-green',
    code: 'ITI',
    codeName: 'Itinéraire',
    family: 'Randonnée · Trail · VTT · Boucle',
    covers: 'ITI · FMA',
    name: 'Sentier des Trois Bassins',
    eyebrow: 'Boucle pédestre · GR® R2',
    refId: 'ITI-00073',
    statusPill: { tone: 'on', label: 'Sentier ouvert' },
    badge: 'Saint-Joseph · Plaine des Cafres',
    addr: { line: 'Départ : parking Bras-Sec, 97418 Plaine des Cafres', coords: '-21.193411, 55.621008' },
    tags: [
      ['Boucle', 'teal'], ['Difficile', 'orange'], ['Pédestre', 'teal'],
      ['Patrimoine', 'neutral'], ['Eaux vives', 'outline'],
    ],
    kpis5: true,
    kpis: [
      { label: 'Distance', value: '8.4', unit: 'km' },
      { label: 'Durée', value: '4h', sub: 'aller-retour' },
      { label: 'Dénivelé +', value: '+560', unit: 'm' },
      { label: 'Difficulté', value: 'Difficile', sub: 'T3' },
      { label: 'Type', value: 'Boucle', sub: 'balisage jaune', tone: 'open' },
    ],
    summary:
      `Boucle pédestre qui descend dans la ravine pour relier trois bassins formés par la rivière des Remparts. Sentier technique avec passages câblés sur 200 m et deux gués à franchir — à éviter par temps de pluie.`,
  },

  /* ============== 5. SITE & VISITE (LOI/PCU/PNA) ============== */
  VIS: {
    accent: 'acc-plum',
    code: 'PCU',
    codeName: 'Patrimoine culturel',
    family: 'Patrimoine · Loisir · Site naturel',
    covers: 'LOI · PCU · PNA',
    name: 'Église Notre-Dame des Neiges',
    eyebrow: 'Patrimoine religieux · XIXe',
    refId: 'PCU-00021',
    statusPill: { tone: 'on', label: 'Ouvert au public' },
    badge: 'Cilaos · Centre-bourg',
    addr: { line: 'Place de l\'Église, 97413 Cilaos', coords: '-21.137422, 55.471889' },
    tags: [
      ['Patrimoine', 'teal'], ['Architecture', 'teal'], ['Site classé', 'orange'],
      ['Gratuit', 'neutral'], ['PMR accessible', 'outline'],
    ],
    photos: ['eglise-ext', 'eglise-nef', 'eglise-vitraux', 'eglise-place'],
    kpis: [
      { label: 'Période', value: 'XIXe', sub: '1841-1869' },
      { label: 'Visite', value: '30-45', unit: 'min' },
      { label: 'Entrée', value: 'Gratuite', sub: 'don libre' },
      { label: 'Statut', value: 'Ouvert', sub: 'jusqu\'à 18h00', tone: 'open' },
    ],
    summary:
      `Église construite en pierre volcanique du cirque, classée Monument Historique en 1995. Charpente en tamarin des Hauts, fonts baptismaux en lave taillée et vitraux Mauméjean (1924). Visites guidées les mercredis et samedis.`,
  },

  /* ============== 6. SERVICE & COMMERCE (PSV/SRV/COM/VIL) ============== */
  SRV: {
    accent: 'acc-rust',
    code: 'PSV',
    codeName: 'Prestataire de service',
    family: 'OT · Commerce · Service · Ville',
    covers: 'PSV · SRV · COM · VIL',
    name: 'Office de Tourisme du Sud — Saint-Pierre',
    eyebrow: 'Office de tourisme intercommunal',
    refId: 'PSV-00007',
    statusPill: { tone: 'on', label: 'Bureau ouvert' },
    badge: 'Saint-Pierre · Front de mer',
    addr: { line: '17 Boulevard Hubert-Delisle, 97410 Saint-Pierre', coords: '-21.341072, 55.476789' },
    tags: [
      ['Service public', 'teal'], ['Information touristique', 'teal'],
      ['Billetterie', 'neutral'], ['Qualité Tourisme™', 'outline'], ['Multilingue', 'orange'],
    ],
    photos: ['ot-acc', 'ot-boutique', 'ot-comptoir', 'ot-vue'],
    kpis: [
      { label: 'Service', value: 'OT', sub: 'intercommunal' },
      { label: 'Zone', value: 'Sud', sub: '5 communes' },
      { label: 'Horaires', value: '09:00', sub: '— 17:00 lun–sam', tone: 'open' },
      { label: 'Statut', value: 'Ouvert', sub: 'sans rendez-vous', tone: 'open' },
    ],
    summary:
      `Bureau d'accueil principal de l'office intercommunal couvrant Saint-Pierre, Le Tampon, Petite-Île, Saint-Joseph et Entre-Deux. Information, billetterie, réservation hébergements, boutique de produits péi et conseil personnalisé en 4 langues.`,
  },
};

// -------- SHARED side panel content (network, contact) ---------------------
const SIDE_NETWORK = [
  { name: 'OTI du Sud', sub: 'Office de tourisme intercommunal', role: 'Publisher', logo: 'OS' },
  { name: 'Région Réunion', sub: 'Direction du tourisme', role: 'Partenaire', logo: 'RR' },
];

// -------- Generic shell ----------------------------------------------------
function TypeDetailPage({ typeCode = 'HEB', floating = false, onClose, onEdit }) {
  const t = TYPE_DEFS[typeCode] || TYPE_DEFS.HEB;
  const [tab, setTab] = useStateT('overview');
  const isItinerary = typeCode === 'ITI';
  const wrapperClass = floating
    ? `detail-flat detail-flat--floating ${t.accent}`
    : `detail-flat ${t.accent}`;

  // Tab presets per type
  const tabs = (() => {
    switch (typeCode) {
      case 'ITI': return [
        ['overview', 'Aperçu'], ['profile', 'Profil & étapes', 6],
        ['conditions', 'Conditions'], ['poi', 'À voir', 4],
        ['media', 'Médias', 3], ['activity', 'Activité', 2],
      ];
      case 'RES': return [
        ['overview', 'Aperçu'], ['menu', 'Cartes & menus', 4],
        ['hours', 'Horaires'], ['media', 'Médias', 5],
        ['legal', 'Légal'], ['activity', 'Activité', 3],
      ];
      case 'ASC': return [
        ['overview', 'Aperçu'], ['formula', 'Formules', 4],
        ['safety', 'Conditions & sécurité'], ['media', 'Médias', 6],
        ['legal', 'Légal'], ['activity', 'Activité', 1],
      ];
      case 'VIS': return [
        ['overview', 'Aperçu'], ['visit', 'Visites & public'],
        ['hours', 'Horaires & tarifs'], ['media', 'Médias', 7],
        ['legal', 'Légal'], ['activity', 'Activité', 4],
      ];
      case 'SRV': return [
        ['overview', 'Aperçu'], ['services', 'Prestations', 8],
        ['hours', 'Horaires'], ['media', 'Médias', 2],
        ['legal', 'Légal'], ['activity', 'Activité', 1],
      ];
      case 'HEB':
      default: return [
        ['overview', 'Aperçu'], ['equip', 'Équipements', 16],
        ['rooms', 'Chambres', 4], ['tarifs', 'Tarifs & horaires'],
        ['media', 'Médias', 12], ['legal', 'Légal'], ['activity', 'Activité', 9],
      ];
    }
  })();

  return (
    <div className={wrapperClass}>

      <div className="drawer__head">
        <div>
          <div className="drawer__eyebrow">
            {t.eyebrow}
            <span className="code">{t.code}</span>
            <span style={{ color: 'var(--ink-4)' }}>· #{t.refId}</span>
          </div>
          <h2 className="drawer__title">{t.name}</h2>
          <div className="drawer__tags">
            {t.tags.map(([label, tone], i) => (
              <span key={i} className={'tag ' + (tone || '')}>{label}</span>
            ))}
          </div>
        </div>
        <div className="drawer__actions">
          <span className={'pill-status ' + (t.statusPill.tone || '')}>
            <span className="dot"/>{t.statusPill.label}
          </span>
          <button className="btn sm">{Ico.star({ width: 14, height: 14 })}</button>
          <button className="btn sm">{Ico.print({})} Imprimer</button>
          <button className="btn primary" onClick={onEdit}>{Ico.edit({})} Modifier</button>
          {floating && <button className="btn ghost" onClick={onClose}>{Ico.close({})}</button>}
        </div>
      </div>

      <div className="type-ribbon">
        <span className="blob"/>
        <span><strong>{t.codeName}</strong> · {t.family}</span>
        <span className="meta">{t.covers}</span>
      </div>

      <div className="tabs">
        {tabs.map(([k, l, c]) => (
          <button key={k} className={tab === k ? 'is-on' : ''} onClick={() => setTab(k)}>
            {l}{c != null && <span className="tabs__count">{c}</span>}
          </button>
        ))}
      </div>

      <div className="drawer__body">
        <div className="drawer__main">
          {/* Hero: gallery OR map-first */}
          {isItinerary ? <RouteHero t={t}/> : <GalleryHero t={t}/>}

          {/* KPI strip */}
          <KpiStrip kpis={t.kpis} cols5={t.kpis5}/>

          {/* Summary */}
          <section className="section">
            <div className="section__head">
              <h3>Description</h3>
              <a className="more">Voir versions · FR / EN ›</a>
            </div>
            <div className="prose"><p>{t.summary}</p></div>
          </section>

          {/* Type-specific blocks */}
          {typeCode === 'HEB' && <HebBlocks/>}
          {typeCode === 'RES' && <ResBlocks/>}
          {typeCode === 'ASC' && <AscBlocks/>}
          {typeCode === 'ITI' && <ItiBlocks/>}
          {typeCode === 'VIS' && <VisBlocks/>}
          {typeCode === 'SRV' && <SrvBlocks/>}
        </div>

        <aside className="drawer__side">
          {typeCode === 'ITI' && <SideGallery/>}
          <SideMap t={t}/>
          {typeCode === 'ITI' ? <SideDownloads/> : <SideContact t={t}/>}
          {typeCode === 'ITI' && <SideWeather/>}
          {typeCode !== 'ITI' && <SideAskAbout typeCode={typeCode}/>}
          {typeCode === 'HEB' && <SideOpening/>}
          <SideNetwork/>
        </aside>
      </div>
    </div>
  );
}

// ---------- Generic shared bits ------------------------------------------
function KpiStrip({ kpis, cols5 }) {
  return (
    <div className={'kpi-row' + (cols5 ? ' cols-5' : '')}>
      {kpis.map((k, i) => (
        <div key={i} className="kpi">
          <div className="kpi__label">{k.label}</div>
          <div className="kpi__value">
            {k.tone === 'open' ? (
              <>
                <span className="pill-status" style={{ marginRight: 4 }}>
                  <span className="dot"/>{k.value}
                </span>
              </>
            ) : (
              <>{k.value}{k.unit && <small>{k.unit}</small>}</>
            )}
          </div>
          {k.sub && <div className="kpi__sub">{k.sub}</div>}
        </div>
      ))}
    </div>
  );
}

// Hero — placeholder mosaic styled with type accent
function GalleryHero({ t }) {
  const photos = t.photos || ['p1','p2','p3','p4'];
  return (
    <div className="hero">
      <div className="hero__main is-placeholder" data-label={photos[0]}>
        <span className="badge">{Ico.pin({ width: 12, height: 12 })} {t.badge}</span>
        <button className="arrow l">‹</button>
        <button className="arrow r">›</button>
        <div className="pager">
          {photos.map((_, i) => <span key={i} className={i === 0 ? 'on' : ''}/>)}
        </div>
      </div>
      <div className="hero__grid">
        {photos.slice(1, 4).map((p, i) => (
          <div key={i} className={'is-placeholder' + (i === 2 ? ' more' : '')}
               style={{ backgroundImage: 'none',
                        background: 'repeating-linear-gradient(135deg, rgba(0,0,0,0.04) 0 12px, transparent 12px 24px), linear-gradient(180deg, var(--accent-tint), var(--surface-2))',
                        display: 'grid', placeItems: 'center',
                        fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--ink-3)',
                        letterSpacing: '0.04em' }}>
            {i === 2 ? `+${(photos.length || 4) + 5}` : p}
          </div>
        ))}
      </div>
    </div>
  );
}

// Map-first hero for itineraries
function RouteHero({ t }) {
  return (
    <div className="route-hero">
      <div className="route-hero__map">
        <span className="route-hero__chip">{Ico.pin({ width: 12, height: 12 })} {t.badge}</span>
        <div className="route-hero__layers">
          <button className="is-on">Carte</button>
          <button>Satellite</button>
          <button>Topo</button>
        </div>
        <svg className="route-hero__svg" viewBox="0 0 800 280" preserveAspectRatio="none">
          <defs>
            <linearGradient id="rgrad" x1="0" x2="1">
              <stop offset="0" stopColor="#2a7a45"/>
              <stop offset="1" stopColor="#1a5a30"/>
            </linearGradient>
          </defs>
          {/* Soft river */}
          <path d="M0,220 C120,180 200,260 320,200 S560,120 800,180"
                fill="none" stroke="rgba(255,255,255,0.4)" strokeWidth="10"/>
          {/* Route */}
          <path d="M60,230 C 140,140 220,210 300,150 S 460,80 540,130 660,200 740,90"
                fill="none" stroke="url(#rgrad)" strokeWidth="4"
                strokeDasharray="2 0" strokeLinecap="round"/>
          <path d="M60,230 C 140,140 220,210 300,150 S 460,80 540,130 660,200 740,90"
                fill="none" stroke="#fff" strokeWidth="1.5"
                strokeDasharray="6 6" strokeLinecap="round" opacity="0.65"/>
        </svg>
        <div className="route-marker start" style={{ left: '7.5%', top: '82%' }}>D</div>
        <div className="route-marker" style={{ left: '37%', top: '54%' }}>2</div>
        <div className="route-marker" style={{ left: '57%', top: '38%' }}>3</div>
        <div className="route-marker" style={{ left: '78%', top: '63%' }}>4</div>
        <div className="route-marker end" style={{ left: '92.5%', top: '32%' }}>A</div>
      </div>

      <div className="route-profile">
        <div className="route-profile__legend"><i/> Profil altimétrique</div>
        <svg className="route-profile__svg" viewBox="0 0 800 56" preserveAspectRatio="none">
          <defs>
            <linearGradient id="pgrad" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0" stopColor="rgba(42,122,69,0.45)"/>
              <stop offset="1" stopColor="rgba(42,122,69,0.05)"/>
            </linearGradient>
          </defs>
          <path d="M0,46 C 80,40 130,18 180,15 230,12 280,30 340,28 380,27 420,12 480,8 520,5 560,18 620,22 680,26 720,40 800,44 L 800,56 L 0,56 Z"
                fill="url(#pgrad)"/>
          <path d="M0,46 C 80,40 130,18 180,15 230,12 280,30 340,28 380,27 420,12 480,8 520,5 560,18 620,22 680,26 720,40 800,44"
                fill="none" stroke="#2a7a45" strokeWidth="1.5"/>
        </svg>
        <div className="route-profile__axis">
          <span>0 km · 280 m</span>
          <span>2 · 540</span>
          <span>4 · 720</span>
          <span>6 · 480</span>
          <span>8.4 km · 320 m</span>
        </div>
      </div>
    </div>
  );
}

// ---------- HEB: Hébergement blocks --------------------------------------
function HebBlocks() {
  const equipments = [
    ['Piscine extérieure','pool'], ['Spa & bien-être','pool'], ['Restaurant sur place','coffee'],
    ['Bar / lounge','coffee'], ['Wi-Fi gratuit','wifi'], ['Climatisation','ac'],
    ['Petit-déjeuner','coffee'], ['Parking gratuit','globe'], ['Animaux acceptés','globe'],
  ];
  return (
    <>
      <section className="section">
        <div className="section__head">
          <h3>Classement & labels</h3>
          <a className="more">Ajouter ›</a>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          <span className="cap-tag">
            <Stars n={4}/> Hôtel 4 étoiles
          </span>
          <span className="cap-tag orange">Clef Verte 2025</span>
          <span className="cap-tag neutral">Tourisme & Handicap · Visuel, Mental</span>
          <span className="cap-tag neutral">Maître Restaurateur</span>
        </div>
      </section>

      <section className="section">
        <div className="section__head">
          <h3>Chambres & couchages</h3>
          <a className="more">Voir toutes ›</a>
        </div>
        <table className="rooms-table">
          <thead>
            <tr>
              <th>Type</th><th>Couchages</th><th>Surface</th>
              <th>Unités</th><th>Tarif basse</th><th>Tarif haute</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td><strong>Chambre Standard</strong>vue jardin · douche</td>
              <td className="num">2</td><td className="num">22 m²</td><td className="num">12</td>
              <td><span className="room-price">165€<small> /nuit</small></span></td>
              <td><span className="room-price">220€</span></td>
            </tr>
            <tr>
              <td><strong>Chambre Supérieure</strong>vue piton · balcon</td>
              <td className="num">2-3</td><td className="num">28 m²</td><td className="num">8</td>
              <td><span className="room-price">210€</span></td>
              <td><span className="room-price">280€</span></td>
            </tr>
            <tr>
              <td><strong>Suite Familiale</strong>2 chambres · salon</td>
              <td className="num">4</td><td className="num">52 m²</td><td className="num">3</td>
              <td><span className="room-price">340€</span></td>
              <td><span className="room-price">440€</span></td>
            </tr>
            <tr>
              <td><strong>Suite Piton</strong>vue panoramique · jacuzzi</td>
              <td className="num">2</td><td className="num">48 m²</td><td className="num">1</td>
              <td><span className="room-price">420€</span></td>
              <td><span className="room-price">560€</span></td>
            </tr>
          </tbody>
        </table>
      </section>

      <section className="section">
        <div className="section__head">
          <h3>Équipements & services</h3>
          <a className="more">Voir les 16 ›</a>
        </div>
        <div className="equip-grid">
          {equipments.map(([label, icon], i) => (
            <div key={i} className="equip">
              {Ico[icon] && Ico[icon]({ width: 16, height: 16 })}
              <span>{label}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="section">
        <div className="section__head">
          <h3>Salles & séminaire</h3>
          <a className="more">Devis ›</a>
        </div>
        <div className="mice-grid">
          <div className="mice">
            <div className="mice__name">Salle Bras-Long</div>
            <div className="mice__caps">
              <span>Surface <strong>78 m²</strong></span>
              <span>Théâtre <strong>60</strong></span>
              <span>Classe <strong>32</strong></span>
              <span>Banquet <strong>40</strong></span>
            </div>
          </div>
          <div className="mice">
            <div className="mice__name">Salon Tamarin</div>
            <div className="mice__caps">
              <span>Surface <strong>34 m²</strong></span>
              <span>Théâtre <strong>24</strong></span>
              <span>Classe <strong>16</strong></span>
              <span>Réunion <strong>14</strong></span>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}

// ---------- RES: Restaurant blocks ---------------------------------------
function ResBlocks() {
  const week = [
    ['Lun', 'lundi', '11:30–14:00', '—', false, false],
    ['Mar', 'mardi', '11:30–14:00', '19:00–22:00', false, false],
    ['Mer', 'mercredi', '11:30–14:00', '19:00–22:00', false, true],   // today
    ['Jeu', 'jeudi', '11:30–14:00', '19:00–22:00', false, false],
    ['Ven', 'vendredi', '11:30–14:00', '19:00–22:30', false, false],
    ['Sam', 'samedi', '11:30–15:00', '19:00–22:30', false, false],
    ['Dim', 'dimanche', '11:30–15:00', '—', true, false],
  ];
  return (
    <>
      <section className="section">
        <div className="section__head">
          <h3>Cuisine & spécialités</h3>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {['Cuisine créole','Cuisine française','Poisson & fruits de mer','Fait maison',
            'Produits du marché','Cuisine au feu de bois','Cocktails maison']
            .map((s, i) => <span key={i} className="cap-tag neutral">{s}</span>)}
        </div>
      </section>

      <section className="section">
        <div className="section__head">
          <h3>Cartes & menus</h3>
          <a className="more">Ajouter document ›</a>
        </div>
        <div className="menu-list">
          {[
            ['Carte midi · semaine', 'FR · 4 pages · mis à jour il y a 2 sem.', '480 ko'],
            ['Carte soir', 'FR · 6 pages · mis à jour il y a 2 sem.', '620 ko'],
            ['Menu enfant', 'FR · 1 page', '120 ko'],
            ['Carte des vins', 'FR · 8 pages · mis à jour il y a 3 mois', '740 ko'],
          ].map(([name, sub, size], i) => (
            <div key={i} className="menu-row">
              <div className="menu-row__icon">PDF</div>
              <div>
                <div className="menu-row__name">{name}</div>
                <div className="menu-row__sub">{sub}</div>
              </div>
              <span className="menu-row__size">{size}</span>
              <button className="menu-row__dl">{Ico.download({})}</button>
            </div>
          ))}
        </div>
      </section>

      <section className="section">
        <div className="section__head">
          <h3>Services</h3>
        </div>
        <div className="equip-grid">
          {[
            ['Terrasse vue mer', 'pool'], ['Climatisation', 'ac'],
            ['Réservation en ligne', 'globe'], ['Plats à emporter', 'bag'],
            ['Accueil groupes (jusqu\'à 40)', 'crm'], ['Wi-Fi gratuit', 'wifi'],
            ['Animaux acceptés', 'globe'], ['Accessibilité PMR', 'check'],
            ['Parking à proximité', 'globe'],
          ].map(([label, icon], i) => (
            <div key={i} className="equip">
              {Ico[icon] && Ico[icon]({ width: 16, height: 16 })}
              <span>{label}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="section">
        <div className="section__head">
          <h3>Horaires de service</h3>
          <a className="more">Période en cours ›</a>
        </div>
        <div className="week-grid">
          <div className="wg-head">Jour</div>
          <div className="wg-head">Service midi</div>
          <div className="wg-head">Service soir</div>
          {week.map(([d, full, midi, soir, closed, today], i) => (
            <React.Fragment key={i}>
              <div className={'wg-day' + (today ? ' is-today' : '')}>{d}<small>{full}</small></div>
              <div className={'wg-slot' + (closed ? ' is-closed' : '') + (today ? ' is-now' : '')}>{midi}</div>
              <div className={'wg-slot' + (soir === '—' ? ' is-closed' : '')}>{soir === '—' ? 'Fermé' : soir}</div>
            </React.Fragment>
          ))}
        </div>
      </section>
    </>
  );
}

// ---------- ASC: Activité blocks -----------------------------------------
function AscBlocks() {
  return (
    <>
      <section className="section">
        <div className="section__head">
          <h3>Pratiques & environnement</h3>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {['Surf','Bodyboard','Stand-up paddle','Mer & littoral','Plage','Plein air','Sport encadré']
            .map((s, i) => <span key={i} className="cap-tag neutral">{s}</span>)}
        </div>
      </section>

      <section className="section">
        <div className="section__head">
          <h3>Formules & sessions</h3>
          <a className="more">Réservation ›</a>
        </div>
        <div className="formula-grid">
          {[
            { name: 'Initiation 1h30', dur: '1h30', max: '6 max', age: 'dès 7 ans', lvl: 'Débutant', price: 45, unit: '/ pers.' },
            { name: 'Cours collectif', dur: '2h00', max: '8 max', age: 'dès 10 ans', lvl: 'Tous niveaux', price: 55, unit: '/ pers.' },
            { name: 'Stage 5 jours', dur: '5 × 2h', max: '6 max', age: 'dès 8 ans', lvl: 'Progressif', price: 225, unit: '/ pers.' },
            { name: 'Coaching privé', dur: '1h30', max: '1-2', age: 'tous âges', lvl: 'Sur mesure', price: 95, unit: '/ pers.' },
          ].map((f, i) => (
            <div key={i} className="formula">
              <h4 className="formula__name">{f.name}</h4>
              <div className="formula__row">{Ico.compass({ width: 12, height: 12 })} {f.dur} · {f.lvl}</div>
              <div className="formula__row">{Ico.crm({ width: 12, height: 12 })} {f.max} · {f.age}</div>
              <div className="formula__price">
                <small>À partir de</small>
                <strong>{f.price}€<small style={{ fontSize: 11, color: 'var(--ink-3)' }}>{f.unit}</small></strong>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="section">
        <div className="section__head">
          <h3>Public & niveau</h3>
        </div>
        <div className="audience-row">
          <span className="audience-pill ok">{Ico.check({})} Débutants</span>
          <span className="audience-pill ok">{Ico.check({})} Intermédiaires</span>
          <span className="audience-pill ok">{Ico.check({})} Confirmés</span>
          <span className="audience-pill ok">Enfants (dès 7 ans)</span>
          <span className="audience-pill ok">Familles</span>
          <span className="audience-pill ok">Groupes (8 max)</span>
          <span className="audience-pill no">PMR</span>
        </div>
      </section>

      <section className="section">
        <div className="section__head">
          <h3>Équipement & sécurité</h3>
        </div>
        <div className="equip-grid">
          {[
            ['Planches mousse fournies','pool'], ['Combinaisons toutes tailles','bag'],
            ['Vestiaires & douche','pool'], ['Casiers sécurisés','globe'],
            ['Brevet BPJEPS','check'], ['Assurance RC incluse','check'],
          ].map(([label, icon], i) => (
            <div key={i} className="equip">
              {Ico[icon] && Ico[icon]({ width: 16, height: 16 })}
              <span>{label}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="section">
        <div className="section__head">
          <h3>Conditions saisonnières</h3>
          <span style={{ fontSize: 11, color: 'var(--ink-4)' }}>Saison du surf à La Réunion</span>
        </div>
        <div className="season-row">
          {Months.map((m, i) => {
            const cls = (i >= 4 && i <= 8) ? 'peak' : ((i === 3 || i === 9) ? 'high' : '');
            return <div key={i} className={'season-cell ' + cls}>{m}</div>;
          })}
        </div>
        <p style={{ fontSize: 11.5, color: 'var(--ink-3)', marginTop: 8 }}>
          Pic de fréquentation et meilleures vagues de juin à septembre · spot abrité praticable toute l'année.
        </p>
      </section>
    </>
  );
}

// ---------- ITI: Itinéraire blocks ---------------------------------------
function ItiBlocks() {
  const wps = [
    { num: 'D', name: 'Parking Bras-Sec', desc: 'Aire de stationnement (40 places) — point de départ.', km: '0.0 km', alt: '280 m' },
    { num: '2', name: 'Belvédère du Maïdo', desc: 'Vue plongeante sur la rivière des Remparts.', km: '1.8 km', alt: '540 m' },
    { num: '3', name: 'Premier bassin', desc: 'Bassin Manapany — baignade autorisée à vos risques.', km: '3.4 km', alt: '720 m' },
    { num: '4', name: 'Gué du Trou Blanc', desc: 'Passage à gué — éviter par fortes pluies.', km: '5.6 km', alt: '480 m' },
    { num: 'A', name: 'Retour parking', desc: 'Arrivée par la piste forestière (carrossable).', km: '8.4 km', alt: '320 m' },
  ];
  return (
    <>
      <section className="section">
        <div className="section__head">
          <h3>Profil & étapes</h3>
          <a className="more">Télécharger GPX ›</a>
        </div>
        <div className="waypoints">
          {wps.map((w, i) => (
            <div key={i} className="waypoint">
              <div className="waypoint__num">{w.num}</div>
              <div className="waypoint__body">
                <h4 className="waypoint__name">{w.name}</h4>
                <p className="waypoint__desc">{w.desc}</p>
              </div>
              <div className="waypoint__meta">
                <strong>{w.km}</strong>
                {w.alt}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="section">
        <div className="section__head">
          <h3>Pratiques & balisage</h3>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {['Randonnée pédestre','Trail running','Balisage jaune','GR® R2 partiel',
            'Praticable en boucle','Sens conseillé : horaire']
            .map((s, i) => <span key={i} className="cap-tag neutral">{s}</span>)}
        </div>
      </section>

      <section className="section">
        <div className="section__head">
          <h3>Conditions & équipement</h3>
        </div>
        <div className="equip-grid">
          {[
            ['Chaussures de marche tige montante','globe'],
            ['Bâtons recommandés','globe'],
            ['1.5 L d\'eau minimum','coffee'],
            ['Crème solaire & casquette','ac'],
            ['Vêtement chaud (sommet)','bag'],
            ['Téléphone chargé + carte hors-ligne','phone'],
          ].map(([label, icon], i) => (
            <div key={i} className="equip">
              {Ico[icon] && Ico[icon]({ width: 16, height: 16 })}
              <span>{label}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="section">
        <div className="section__head">
          <h3>Praticabilité saisonnière</h3>
          <span style={{ fontSize: 11, color: 'var(--ink-4)' }}>Sentier régulièrement fermé en saison cyclonique</span>
        </div>
        <div className="season-row">
          {Months.map((m, i) => {
            const cls = (i === 0 || i === 1 || i === 11) ? '' : ((i >= 4 && i <= 9) ? 'peak' : 'high');
            return <div key={i} className={'season-cell ' + cls}>{m}</div>;
          })}
        </div>
      </section>

      <section className="section">
        <div className="section__head">
          <h3>Points d'intérêt sur le parcours</h3>
          <a className="more">Voir sur la carte ›</a>
        </div>
        <div className="poi-grid">
          {[
            ['Patrimoine', 'Kiosque colonial', '0.4 km'],
            ['Site naturel', 'Cascade des Aigrettes', '2.1 km'],
            ['Site naturel', 'Bassin Manapany', '3.4 km'],
            ['Activité', 'Baignade surveillée', '3.5 km'],
            ['Patrimoine', 'Vestiges sucriers', '6.0 km'],
            ['Restauration', 'Snack péi', '8.0 km'],
          ].map(([kind, name, dist], i) => (
            <div key={i} className="poi">
              <div className="poi__kind">{kind}</div>
              <h4 className="poi__name">{name}</h4>
              <div className="poi__meta">@ {dist}</div>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}

// ---------- VIS: Site & visite blocks ------------------------------------
function VisBlocks() {
  return (
    <>
      <section className="section">
        <div className="section__head">
          <h3>Visites & médiation</h3>
        </div>
        <div className="equip-grid">
          {[
            ['Visite libre (livret FR/EN)','globe'],
            ['Visite guidée mer. & sam. 10h','crm'],
            ['Audioguide 4 langues','phone'],
            ['Visite scolaire sur réservation','bag'],
            ['Brochure téléchargeable','download'],
            ['Médiateur sur place','check'],
          ].map(([label, icon], i) => (
            <div key={i} className="equip">
              {Ico[icon] && Ico[icon]({ width: 16, height: 16 })}
              <span>{label}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="section">
        <div className="section__head">
          <h3>Public & accessibilité</h3>
        </div>
        <div className="audience-row">
          <span className="audience-pill ok">{Ico.check({})} Familles</span>
          <span className="audience-pill ok">{Ico.check({})} Scolaires</span>
          <span className="audience-pill ok">{Ico.check({})} Groupes (jusqu'à 30)</span>
          <span className="audience-pill ok">{Ico.check({})} Individuels</span>
          <span className="audience-pill ok">PMR (accès rampe)</span>
          <span className="audience-pill ok">Malentendants (audio)</span>
          <span className="audience-pill no">Animaux</span>
        </div>
      </section>

      <section className="section">
        <div className="section__head">
          <h3>Horaires saisonniers</h3>
          <a className="more">Période en cours ›</a>
        </div>
        <div className="week-grid">
          <div className="wg-head">Jour</div>
          <div className="wg-head">Haute saison · 1er juin–31 oct</div>
          <div className="wg-head">Basse saison · 1er nov–31 mai</div>
          {[
            ['Lun', 'lundi', 'Fermé', 'Fermé', true],
            ['Mar', 'mardi', '09:00–18:00', '09:30–17:00', false],
            ['Mer', 'mercredi', '09:00–18:00', '09:30–17:00', false],
            ['Jeu', 'jeudi', '09:00–18:00', '09:30–17:00', false],
            ['Ven', 'vendredi', '09:00–18:00', '09:30–17:00', false],
            ['Sam', 'samedi', '09:00–19:00', '09:30–18:00', false],
            ['Dim', 'dimanche', '14:00–18:00', '14:00–17:00', false],
          ].map(([d, full, h, b, closed], i) => (
            <React.Fragment key={i}>
              <div className="wg-day">{d}<small>{full}</small></div>
              <div className={'wg-slot' + (closed ? ' is-closed' : '')}>{h}</div>
              <div className={'wg-slot' + (closed ? ' is-closed' : '')}>{b}</div>
            </React.Fragment>
          ))}
        </div>
      </section>

      <section className="section">
        <div className="section__head">
          <h3>Tarifs</h3>
          <a className="more">Gérer ›</a>
        </div>
        <div>
          <div className="tariff-row"><span>Entrée individuelle</span><strong>Gratuit · don libre</strong></div>
          <div className="tariff-row"><span>Visite guidée (1h)</span><strong>5 € / pers.</strong></div>
          <div className="tariff-row"><span>Audioguide (FR · EN · DE · CRE)</span><strong>3 € / appareil</strong></div>
          <div className="tariff-row"><span>Groupe scolaire (par classe)</span><strong>30 €</strong></div>
          <div className="tariff-row"><span>Groupe adulte (10+ pers.)</span><strong>3 € / pers.</strong></div>
        </div>
      </section>
    </>
  );
}

// ---------- SRV: Service & commerce blocks -------------------------------
function SrvBlocks() {
  return (
    <>
      <section className="section">
        <div className="section__head">
          <h3>Prestations proposées</h3>
          <a className="more">Voir tout ›</a>
        </div>
        <div>
          {[
            ['inbox', 'Information touristique', 'Conseils personnalisés, brochures, cartes du territoire'],
            ['bag', 'Billetterie & réservation', 'Excursions, activités, transferts, hébergements'],
            ['globe', 'Boutique péi', 'Produits locaux, livres, vêtements, souvenirs labellisés'],
            ['mail', 'Bureau d\'accueil presse', 'Sur rendez-vous · pro@otsud.re'],
            ['phone', 'Centrale d\'appel', 'Numéro unique 0262 39 00 00 · 7j/7 en saison'],
            ['layers', 'Pass touristique Sud Sauvage', 'Délivrance, recharge, info adhérents'],
          ].map(([icon, name, sub], i) => (
            <div key={i} className="presta-row">
              <div className="presta-row__ic">{Ico[icon] && Ico[icon]({ width: 14, height: 14 })}</div>
              <div className="presta-row__main">
                {name}<small>{sub}</small>
              </div>
              <button className="btn sm">Détails</button>
            </div>
          ))}
        </div>
      </section>

      <section className="section">
        <div className="section__head">
          <h3>Zone d'intervention</h3>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {['Saint-Pierre','Le Tampon','Petite-Île','Saint-Joseph','L\'Entre-Deux','Sud Sauvage']
            .map((s, i) => <span key={i} className="cap-tag">{s}</span>)}
        </div>
      </section>

      <section className="section">
        <div className="section__head">
          <h3>Horaires d'accueil</h3>
        </div>
        <div className="week-grid">
          <div className="wg-head">Jour</div>
          <div className="wg-head">Saison · juil–août, dec–janv</div>
          <div className="wg-head">Hors saison</div>
          {[
            ['Lun', 'lundi', '08:30–18:00', '09:00–17:00', false],
            ['Mar', 'mardi', '08:30–18:00', '09:00–17:00', false],
            ['Mer', 'mercredi', '08:30–18:00', '09:00–17:00', false],
            ['Jeu', 'jeudi', '08:30–18:00', '09:00–17:00', false],
            ['Ven', 'vendredi', '08:30–18:00', '09:00–17:00', false],
            ['Sam', 'samedi', '09:00–17:00', '09:00–13:00', false],
            ['Dim', 'dimanche', '09:00–13:00', 'Fermé', true],
          ].map(([d, full, h, b, closed], i) => (
            <React.Fragment key={i}>
              <div className="wg-day">{d}<small>{full}</small></div>
              <div className="wg-slot">{h}</div>
              <div className={'wg-slot' + (closed ? ' is-closed' : '')}>{b}</div>
            </React.Fragment>
          ))}
        </div>
      </section>

      <section className="section">
        <div className="section__head">
          <h3>Langues parlées au comptoir</h3>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {['Français','Créole réunionnais','Anglais','Allemand','Espagnol (sur rdv)']
            .map((s, i) => <span key={i} className="cap-tag neutral">{s}</span>)}
        </div>
      </section>
    </>
  );
}

// ---------- Side cards ---------------------------------------------------
function SideGallery() {
  const shots = [
    { label: 'Vue · départ',      km: '0.0' },
    { label: 'Belvédère Maïdo',   km: '1.8' },
    { label: 'Bassin Manapany',   km: '3.4' },
    { label: 'Gué du Trou Blanc', km: '5.6' },
    { label: 'Cascade aigrettes', km: '2.1' },
  ];
  return (
    <div className="side-card">
      <h4>Galerie <a className="small-act">12 photos ›</a></h4>
      <div className="side-gallery">
        <div className="side-gallery__hero">
          <span className="side-gallery__hero-label">{shots[0].label}</span>
          <span className="side-gallery__hero-km">km {shots[0].km}</span>
        </div>
        <div className="side-gallery__thumbs">
          {shots.slice(1, 5).map((s, i) => (
            <div key={i} className="side-gallery__thumb">
              {i === 3 ? (
                <span className="side-gallery__more">+8</span>
              ) : (
                <>
                  <span className="side-gallery__thumb-label">{s.label}</span>
                  <span className="side-gallery__thumb-km">{s.km}</span>
                </>
              )}
            </div>
          ))}
        </div>
        <div className="side-gallery__cta">
          <button className="btn sm" style={{ flex: 1 }}>{Ico.layers({ width: 12, height: 12 })} Mosaïque</button>
          <button className="btn sm" style={{ flex: 1 }}>{Ico.plus({})} Ajouter</button>
        </div>
      </div>
    </div>
  );
}

function SideMap({ t }) {
  return (
    <div className="side-card">
      <h4>Plan d'accès <a className="small-act">Ouvrir ›</a></h4>
      <div className="mini-map">
        <div className="pin"/>
      </div>
      <div className="addr">
        {t.addr.line}
        <div className="addr__coord">{t.addr.coords}</div>
      </div>
      <div style={{ display: 'flex', gap: 6, marginTop: 12 }}>
        <button className="btn sm" style={{ flex: 1 }}>{Ico.globe({})} Google Maps</button>
        <button className="btn sm primary" style={{ flex: 1 }}>{Ico.nav({})} Itinéraire</button>
      </div>
    </div>
  );
}

function SideContact({ t }) {
  // Contact varies subtly per type
  const map = {
    HEB: { email: 'contact@belair-reunion.re', phone: '+262 262 39 06 06', web: 'belair-reunion.re' },
    RES: { email: 'reservation@lemanapany.re', phone: '+262 692 41 22 80', web: 'lemanapany.re' },
    ASC: { email: 'cours@surfschool-stp.re', phone: '+262 692 17 84 50', web: 'surfschool-stp.re' },
    VIS: { email: 'patrimoine@cilaos.re', phone: '+262 262 31 71 12', web: 'cilaos.re/patrimoine' },
    SRV: { email: 'accueil@otsud.re', phone: '+262 262 39 00 00', web: 'sud-reunion-tourisme.re' },
  };
  const c = map[t.code === 'HOT' ? 'HEB' : (map[t.code] ? t.code : 'HEB')] || map.HEB;
  return (
    <div className="side-card">
      <h4>Contact</h4>
      <div className="contact-row">
        {Ico.mail({ width: 14, height: 14 })}
        <span>{c.email}</span>
        <span className="copy">{Ico.copy({})}</span>
      </div>
      <div className="contact-row">
        {Ico.phone({ width: 14, height: 14 })}
        <span>{c.phone}</span>
        <span className="copy">{Ico.copy({})}</span>
      </div>
      <div className="contact-row">
        {Ico.globe({ width: 14, height: 14 })}
        <span>{c.web}</span>
        <span className="copy">{Ico.copy({})}</span>
      </div>
    </div>
  );
}

function SideAskAbout({ typeCode }) {
  const blocks = {
    HEB: [
      ['Langues', 'Français · Anglais · Créole'],
      ['Paiements', 'CB · Espèces · Chèque · Virement'],
      ['Animaux', 'Acceptés (supplément 12€)'],
      ['Enfants', 'Acceptés (dès 6 ans)'],
      ['Check-in', '15h00 – 19h00'],
      ['Check-out', 'Avant 11h00'],
    ],
    RES: [
      ['Langues', 'Français · Anglais · Créole'],
      ['Paiements', 'CB · Tickets restaurant · Espèces'],
      ['Animaux', 'Acceptés en terrasse'],
      ['Enfants', 'Menu enfant 12€'],
      ['Réservation', 'Conseillée le week-end'],
      ['Groupes', 'Jusqu\'à 40 pers. sur devis'],
    ],
    ASC: [
      ['Langues', 'Français · Anglais'],
      ['Paiements', 'CB · Espèces · Chèques vacances'],
      ['Âge minimum', '7 ans (savoir nager)'],
      ['Matériel', 'Fourni · combinaisons toutes tailles'],
      ['Annulation', 'Météo · remboursement intégral'],
      ['Assurance', 'RC incluse · individuelle conseillée'],
    ],
    VIS: [
      ['Langues', 'Français · Anglais · Allemand · Créole'],
      ['Tarif', 'Gratuit · don libre'],
      ['Animaux', 'Non admis'],
      ['Photos', 'Autorisées sans flash'],
      ['Visites', 'Mer. & sam. 10h · 5 € / pers.'],
      ['Boutique', 'Cartes postales · livret historique'],
    ],
    SRV: [
      ['Langues', 'Français · Créole · Anglais · Allemand'],
      ['Accès PMR', 'Oui · ascenseur + comptoir abaissé'],
      ['Wi-Fi', 'Gratuit pour les visiteurs'],
      ['Boutique', 'Espèces · CB · Pass touristique'],
      ['Numéro unique', '0262 39 00 00 · 7j/7 en saison'],
    ],
  };
  const rows = blocks[typeCode] || blocks.HEB;
  return (
    <div className="side-card">
      <h4>À savoir</h4>
      <dl className="def-list">
        {rows.map(([k, v], i) => <div key={i}><dt>{k}</dt><dd>{v}</dd></div>)}
      </dl>
    </div>
  );
}

function SideOpening() {
  // Reuse the existing OpeningPeriodsA if it's available
  if (typeof OpeningPeriodsA === 'function') return <OpeningPeriodsA/>;
  return null;
}

function SideDownloads() {
  return (
    <div className="side-card">
      <h4>Téléchargements <a className="small-act">Tout exporter ›</a></h4>
      <div className="dl-row">
        <div className="dl-row__ext">GPX</div>
        <div><strong>Trace GPS</strong><small>248 ko · IGN 2024</small></div>
        <button className="dl-row__act">{Ico.download({})}</button>
      </div>
      <div className="dl-row">
        <div className="dl-row__ext">KML</div>
        <div><strong>Trace Google Earth</strong><small>312 ko</small></div>
        <button className="dl-row__act">{Ico.download({})}</button>
      </div>
      <div className="dl-row">
        <div className="dl-row__ext">PDF</div>
        <div><strong>Fiche imprimable</strong><small>FR · 2 pages · 980 ko</small></div>
        <button className="dl-row__act">{Ico.download({})}</button>
      </div>
      <div className="dl-row">
        <div className="dl-row__ext">PNG</div>
        <div><strong>Carte routière 1:25k</strong><small>1.4 Mo</small></div>
        <button className="dl-row__act">{Ico.download({})}</button>
      </div>
    </div>
  );
}

function SideWeather() {
  return (
    <div className="side-card">
      <h4>Météo · Plaine des Cafres <a className="small-act">Voir ›</a></h4>
      <div className="weather-strip">
        {[
          { d: 'Auj.', t: '18°', i: '☀︎' },
          { d: 'Jeu', t: '17°', i: '⛅' },
          { d: 'Ven', t: '15°', i: '☁︎' },
          { d: 'Sam', t: '16°', i: '☔' },
          { d: 'Dim', t: '18°', i: '☀︎' },
        ].map((c, i) => (
          <div key={i} className="weather-cell">
            {c.d}<span className="ic">{c.i}</span><strong>{c.t}</strong>
          </div>
        ))}
      </div>
      <p style={{ fontSize: 11, color: 'var(--ink-3)', margin: '10px 0 0' }}>
        Vigilance jaune fortes pluies · sentier traversant 2 gués.
      </p>
    </div>
  );
}

function SideNetwork() {
  return (
    <div className="side-card">
      <h4>Réseau</h4>
      {SIDE_NETWORK.map((o, i) => (
        <div key={i} className="org-row">
          <div className="org-row__logo">{o.logo}</div>
          <div className="org-row__main">
            {o.name}
            <small>{o.sub}</small>
          </div>
          <span className="org-row__role">{o.role}</span>
        </div>
      ))}
    </div>
  );
}

window.TypeDetailPage = TypeDetailPage;
window.TYPE_DEFS = TYPE_DEFS;
