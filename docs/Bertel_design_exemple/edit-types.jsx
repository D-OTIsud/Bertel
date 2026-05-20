/* global React, Ico, TYPE_DEFS, EditPrim, EditBlocks */
/* edit-types.jsx — full edit page shell composed of:
   topbar · type ribbon · left section nav · main form column · right rail · save footer.
   One EditPage per archetype; everything driven by typeCode + TYPE_DEFS extension. */

const { useState: useStateS } = React;
const {
  Fs, Field, Input, Textarea,
  SectionIdentity, SectionDescriptions, SectionLocation, SectionContacts,
  SectionMedia, SectionLabelsCap, SectionPayLangs, SectionProvider,
  SectionDistribution, SectionAttachments, SectionPublication, SectionSync,
  RailCompletion, RailIssues, RailPresence, RailHistory,
} = window.EditPrim;
const { BlockHEB, BlockRES, BlockASC, BlockITI, BlockVIS, BlockSRV } = window.EditBlocks;
const {
  SectionAccessibility, SectionSustainability, SectionPricing,
  SectionOpenings, SectionRelations, SectionPlaces, SectionCrm,
} = window.EditExt;
const { SectionClassification, SectionTags } = window.EditClass;
const { Prov, ValBanner, SiretCard, RelationPicker, ModeToggle } = window.EditEnh;

/* ---- Per-type form-data overlays (extends TYPE_DEFS used by the read view) ---- */
const EDIT_DATA = {
  HEB: {
    legal: 'SARL Domaine du Bel Air',
    taxoPath: 'Hôtellerie ▸ Hôtel ▸ Hôtel boutique',
    accroche: 'Hôtel-restaurant 4★ niché dans les hauteurs de L\'Entre-Deux, à 15 min des plages du Sud.',
    accrocheOti: 'Une parenthèse confidentielle dans les hauteurs du Sud — table semi-gastronomique et spa.',
    descriptif: 'Hôtel-restaurant indépendant niché dans les hauteurs de L\'Entre-Deux, à 15 min des plages du Sud. Vue dégagée sur le piton des Neiges, table semi-gastronomique en circuit court et spa de 220 m² ouvert aux extérieurs.\n\nL\'équipe maîtrise le créole, le français et l\'anglais. Accueil familial, séminaires sur mesure jusqu\'à 60 personnes en mode théâtre.',
    descriptifOti: 'L\'office recommande la table et le spa, ouverts aux non-résidents sur réservation.',
    accessText: 'Depuis Saint-Pierre, prendre la D26 direction L\'Entre-Deux. Au rond-point central, suivre Bras-Long sur 3 km. Le domaine se trouve à droite, signalé par un panneau en pierre volcanique.',
    addrLine2: 'Bras-Long',
    cp: '97414', bp: 'L\'Entre-Deux', commune: 'L\'Entre-Deux',
    zone: 'Hauts du Sud', lieuDit: 'Bras-Long',
    contact: { phone: '+262 262 39 06 06', phone2: '+262 692 88 12 04', email: 'contact@belair-reunion.re', web: 'belair-reunion.re' },
    statusValue: 'pub',
    secondaries: [{ label: 'HOT principal', on: true, icon: 'check' }, { label: '+ Ajouter une seconde famille' }],
  },
  RES: {
    legal: 'SARL Le Manapany',
    taxoPath: 'Restauration ▸ Restaurant ▸ Cuisine créole',
    accroche: 'Petite table familiale créole en bord de mer, carte renouvelée toutes les six semaines selon la pêche.',
    accrocheOti: 'Une halte gourmande face à la baie de Manapany — réservation conseillée le week-end.',
    descriptif: 'Petite table familiale ouverte en 1998, spécialisée en cuisine créole de bord de mer. La carte change toutes les six semaines selon la pêche et les arrivages du marché. Réservation conseillée le week-end et les jours fériés.\n\nSpécialités : tartare de thon rouge, cari de canard fumé, rougail saucisses au feu de bois. Terrasse couverte de 20 couverts face à la mer.',
    descriptifOti: 'Établissement reconnu Maître Restaurateur depuis 2019.',
    accessText: 'À Manapany-les-Bains, depuis la N2, prendre la route en lacets vers la mer. Le restaurant est en face de la plage, parking partagé avec la guinguette.',
    addrLine2: 'Manapany-les-Bains',
    cp: '97480', bp: 'Saint-Joseph', commune: 'Saint-Joseph',
    zone: 'Littoral Sud', lieuDit: 'Manapany-les-Bains',
    contact: { phone: '+262 262 56 12 80', phone2: '+262 692 41 22 80', email: 'reservation@lemanapany.re', web: 'lemanapany.re' },
    statusValue: 'pub',
    capacityStats: [
      { label: 'Couverts intérieur', value: '60', suffix: 'cv.' },
      { label: 'Couverts terrasse', value: '20', suffix: 'cv.' },
      { label: 'Ticket moyen', value: '25', suffix: '€' },
      { label: 'Groupes max', value: '40', suffix: 'pers.' },
    ],
    secondaries: [{ label: 'RES principal', on: true, icon: 'check' }],
  },
  ASC: {
    legal: 'SAS Surf School Saint-Pierre',
    taxoPath: 'Activité ▸ Sport encadré ▸ Surf (FFS)',
    accroche: 'École de surf agréée FFS opérant sur le spot abrité de Grands Bois. Tous niveaux dès 7 ans.',
    accrocheOti: 'Cours collectifs (6 max), stages et coaching — planches mousse et combis fournis.',
    descriptif: 'École de surf agréée Fédération Française de Surf opérant sur le spot abrité de Grands Bois. Cours collectifs (6 max), stages 5 jours et coaching individuel — planches mousse et combinaisons toutes tailles fournies, douche et casiers sur place.\n\nMoniteurs BPJEPS, assurance RC incluse, briefing sécurité avant chaque session. Pic de fréquentation et meilleures vagues de juin à septembre.',
    descriptifOti: 'Spot praticable toute l\'année — école recommandée pour les premières sessions.',
    accessText: 'Plage de Grands Bois, suivre la signalétique "Spot de surf" depuis Saint-Pierre centre.',
    addrLine2: 'Plage de Grands Bois',
    cp: '97410', bp: 'Saint-Pierre', commune: 'Saint-Pierre',
    zone: 'Littoral Sud', lieuDit: 'Grands Bois',
    contact: { phone: '+262 692 17 84 50', phone2: '+262 692 88 12 04', email: 'cours@surfschool-stp.re', web: 'surfschool-stp.re' },
    statusValue: 'pub',
    capacityStats: [
      { label: 'Sessions / sem.', value: '14' },
      { label: 'Capacité / session', value: '8', suffix: 'élèves' },
      { label: 'Moniteurs', value: '3', suffix: 'BPJEPS' },
      { label: 'À partir de', value: '45', suffix: '€/pers' },
    ],
    secondaries: [{ label: 'ACT principal', on: true, icon: 'check' }],
  },
  ITI: {
    legal: 'OTI du Sud',
    taxoPath: 'Itinéraire ▸ Pédestre ▸ Boucle',
    accroche: 'Boucle pédestre exigeante reliant trois bassins formés par la rivière des Remparts.',
    accrocheOti: 'Sentier technique avec passages câblés et gués — à éviter par temps de pluie.',
    descriptif: 'Boucle pédestre qui descend dans la ravine pour relier trois bassins formés par la rivière des Remparts. Sentier technique avec passages câblés sur 200 m et deux gués à franchir — à éviter par temps de pluie.\n\nDépart parking Bras-Sec (40 places), retour par la piste forestière carrossable.',
    descriptifOti: 'L\'office recommande de partir tôt le matin (5h30 en été austral).',
    accessText: 'Depuis La Plaine des Cafres, suivre la D70 puis "Bras-Sec". Parking à l\'embranchement, panneau ONF.',
    addrLine2: 'Départ : parking Bras-Sec',
    cp: '97418', bp: 'Plaine des Cafres', commune: 'Le Tampon',
    zone: 'Hauts du Sud', lieuDit: 'Bras-Sec',
    contact: { phone: '+262 262 31 71 12', phone2: '+262 692 14 22 80', email: 'rando@otsud.re', web: 'otsud.re/randonnees' },
    statusValue: 'pub',
    capacityStats: [
      { label: 'Distance', value: '8.4', suffix: 'km' },
      { label: 'Durée a/r', value: '4 h' },
      { label: 'Dénivelé +', value: '+560', suffix: 'm' },
      { label: 'Difficulté', value: 'T3' },
    ],
    secondaries: [{ label: 'ITI principal', on: true, icon: 'check' }, { label: 'LOI · secondaire', on: true }],
  },
  VIS: {
    legal: 'Paroisse de Cilaos',
    taxoPath: 'Patrimoine ▸ Religieux ▸ Église',
    accroche: 'Église construite en pierre volcanique du cirque, classée Monument Historique en 1995.',
    accrocheOti: 'Charpente en tamarin des Hauts, fonts baptismaux en lave, vitraux Mauméjean (1924).',
    descriptif: 'Église construite en pierre volcanique du cirque, classée Monument Historique en 1995. Charpente en tamarin des Hauts, fonts baptismaux en lave taillée et vitraux Mauméjean (1924). Visites guidées les mercredis et samedis à 10h.',
    descriptifOti: 'Don libre à l\'entrée — recette reversée à la conservation du patrimoine.',
    accessText: 'Place de l\'Église, au cœur du bourg de Cilaos, à 50 m de l\'office de tourisme.',
    addrLine2: 'Centre-bourg',
    cp: '97413', bp: 'Cilaos', commune: 'Cilaos',
    zone: 'Cirque de Cilaos', lieuDit: 'Centre-bourg',
    contact: { phone: '+262 262 31 71 12', phone2: '+262 692 51 22 80', email: 'patrimoine@cilaos.re', web: 'cilaos.re/patrimoine' },
    statusValue: 'pub',
    capacityStats: [
      { label: 'Période', value: 'XIXe' },
      { label: 'Visite (mn)', value: '30-45' },
      { label: 'Entrée', value: 'Libre' },
      { label: 'Capacité', value: '180', suffix: 'pers.' },
    ],
    secondaries: [{ label: 'PCU principal', on: true, icon: 'check' }],
  },
  SRV: {
    legal: 'OTI du Sud — EPCI',
    taxoPath: 'Service ▸ PSV ▸ Office de tourisme',
    accroche: 'Bureau d\'accueil principal de l\'office intercommunal — 5 communes du Sud Sauvage.',
    accrocheOti: 'Information, billetterie, boutique péi et conseil personnalisé en 4 langues.',
    descriptif: 'Bureau d\'accueil principal de l\'office intercommunal couvrant Saint-Pierre, Le Tampon, Petite-Île, Saint-Joseph et L\'Entre-Deux. Information, billetterie, réservation hébergements, boutique de produits péi et conseil personnalisé en 4 langues.',
    descriptifOti: 'Délivrance du Pass touristique Sud Sauvage à l\'accueil.',
    accessText: 'Boulevard Hubert-Delisle, front de mer de Saint-Pierre, en face du débarcadère.',
    addrLine2: 'Front de mer',
    cp: '97410', bp: 'Saint-Pierre', commune: 'Saint-Pierre',
    zone: 'Sud Sauvage', lieuDit: 'Front de mer',
    contact: { phone: '+262 262 39 00 00', phone2: '+262 692 88 12 04', email: 'accueil@otsud.re', web: 'sud-reunion-tourisme.re' },
    statusValue: 'pub',
    capacityStats: [
      { label: 'Communes', value: '5', suffix: 'EPCI' },
      { label: 'Agents', value: '14' },
      { label: 'Langues', value: '4', suffix: 'au comptoir' },
      { label: 'Visiteurs/an', value: '82k' },
    ],
    secondaries: [{ label: 'PSV principal', on: true, icon: 'check' }],
  },
};

/* Type-specific section #5 mapping */
const TYPE_BLOCK = { HEB: BlockHEB, RES: BlockRES, ASC: BlockASC, ITI: BlockITI, VIS: BlockVIS, SRV: BlockSRV };
const TYPE_BLOCK_LABEL = {
  HEB: 'Chambres & séminaire',
  RES: 'Cuisine & service',
  ASC: 'Formules & saison',
  ITI: 'Tracé & étapes',
  VIS: 'Visite & médiation',
  SRV: 'Prestations & zone',
};

/* Section nav config (universal + type-specific slot) */
function makeSections(typeCode) {
  const hasPlaces = typeCode === 'ITI' || typeCode === 'VIS';
  return [
    { group: 'Identité', items: [
      { k: '01', l: 'Identité & taxonomie', stat: 'ok',   pct: 100 },
      { k: '02', l: 'Descriptions',         stat: 'warn', pct: 60, hint: 'EN/CRE' },
      { k: '03', l: 'Localisation',         stat: 'ok',   pct: 95 },
      { k: '04', l: 'Contacts',             stat: 'ok',   pct: 100 },
    ]},
    { group: 'Caractéristiques', items: [
      { k: '05', l: TYPE_BLOCK_LABEL[typeCode], stat: 'ok',   pct: 88, current: true },
      { k: '06', l: 'Médias',              stat: 'warn', pct: 67, hint: '4/6' },
      { k: '07', l: 'Capacité & cadre',    stat: 'ok',   pct: 92 },
      { k: '08', l: 'Classifications',       stat: 'warn', pct: 75, hint: '1 expir.' },
      { k: '09', l: 'Tags & étiquettes',    stat: 'ok',   pct: 100 },
      { k: '10', l: 'Accessibilité',       stat: 'warn', pct: 55, hint: '2/4 fam.' },
      { k: '11', l: 'Démarche durable',    stat: 'ok',   pct: 43, hint: '15 act.' },
      { k: '12', l: 'Paiements & langues', stat: 'ok',   pct: 100 },
    ]},
    { group: 'Tarifs & ouverture', items: [
      { k: '13', l: 'Tarifs & extras',     stat: 'ok',   pct: 92 },
      { k: '14', l: 'Périodes d\'ouverture',stat: 'ok',   pct: 88 },
    ]},
    { group: 'Liens & territoire', items: [
      { k: '15', l: 'Liens vers fiches',    stat: 'ok',   pct: 100 },
      ...(hasPlaces ? [{ k: '16', l: typeCode === 'ITI' ? 'Lieux & étapes' : 'Sous-lieux', stat: 'ok', pct: 80 }] : []),
      { k: '17', l: 'Rattachements',        stat: 'ok',   pct: 100 },
    ]},
    { group: 'Gestion', items: [
      { k: '18', l: 'Fournisseur',          stat: 'ok',   pct: 100 },
      { k: '19', l: 'Suivi prestataire',    stat: 'warn', pct: 64, hint: '2 ouverts' },
      { k: '20', l: 'Distribution',         stat: 'warn', pct: 50, hint: '2/4' },
      { k: '21', l: 'Publication',          stat: 'ok',   pct: 100 },
      { k: '22', l: 'Identifiants externes',stat: 'ok',   pct: 80 },
    ]},
  ];
}

function EditTopbar({ t, mode, onMode }) {
  return (
    <div className="edit-top">
      <div className="edit-top__left">
        <button className="icbtn">{Ico.caret({ width: 12, height: 12 })}</button>
        <div>
          <div className="edit-top__crumbs">
            Explorer <span className="sep">›</span>
            <strong>{t.codeName}</strong> <span className="sep">›</span>
            {t.name} <span className="sep">›</span>
            <strong style={{ color: 'var(--accent-deep)' }}>Modifier</strong>
          </div>
          <div className="edit-top__title">
            {t.name}
            <button className="pen" title="Renommer">{Ico.edit({ width: 12, height: 12 })}</button>
            <span className="edit-top__code">{t.code}</span>
            <span className="edit-top__ref">#{t.refId}</span>
          </div>
        </div>
      </div>
      <div className="edit-top__right">
        <ModeToggle mode={mode} onChange={onMode}/>
        <span className="edit-top__save">
          <span className="pulse"/>
          Auto-sauvegardé · il y a 12 s
        </span>
        <button className="btn sm">{Ico.expand({})} Aperçu fiche</button>
        <button className="btn">Annuler</button>
        <button className="btn primary">{Ico.check({ width: 12, height: 12 })} Publier les modifs</button>
      </div>
    </div>
  );
}

function EditNav({ sections }) {
  return (
    <nav className="edit-nav">
      <div className="edit-nav__title">Sections de la fiche</div>
      {sections.map((g, gi) => (
        <div key={gi} className="edit-nav__group">
          <div className="edit-nav__title">{g.group}</div>
          {g.items.map((it, ii) => (
            <div key={ii} className={`edit-nav__item ${it.current ? 'is-on' : ''}`}>
              <span className={`edit-nav__dot ${it.stat}`}/>
              <span className="label"><span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--ink-4)', marginRight: 6 }}>{it.k}</span>{it.l}</span>
              <span className={`stat ${it.stat}`}>
                {it.hint || `${it.pct}%`}
              </span>
            </div>
          ))}
        </div>
      ))}
      <div className="edit-nav__group">
        <div className="edit-nav__title">Outils</div>
        <div className="edit-nav__item"><span className="edit-nav__dot"/><span className="label">Versions / historique</span><span className="stat">v12</span></div>
        <div className="edit-nav__item"><span className="edit-nav__dot"/><span className="label">Import / export</span><span className="stat"/></div>
        <div className="edit-nav__item"><span className="edit-nav__dot"/><span className="label">Dupliquer la fiche</span><span className="stat"/></div>
        <div className="edit-nav__item"><span className="edit-nav__dot req"/><span className="label" style={{ color: 'var(--red)' }}>Archiver</span><span className="stat"/></div>
      </div>
    </nav>
  );
}

function EditSide({ typeCode }) {
  const completion = [
    { l: 'Identité',         pct: 100, stat: 'ok' },
    { l: 'Descriptions',     pct: 60,  stat: 'warn' },
    { l: TYPE_BLOCK_LABEL[typeCode], pct: 88, stat: 'ok' },
    { l: 'Médias',           pct: 67,  stat: 'warn' },
    { l: 'Classifications',  pct: 75,  stat: 'warn' },
    { l: 'Tags & étiquettes', pct: 100, stat: 'ok' },
    { l: 'Accessibilité',    pct: 55,  stat: 'warn' },
    { l: 'Démarche durable', pct: 43,  stat: 'warn' },
    { l: 'Tarifs',           pct: 92,  stat: 'ok' },
    { l: 'Périodes',         pct: 88,  stat: 'ok' },
    { l: 'Suivi CRM',        pct: 64,  stat: 'warn' },
    { l: 'Distribution',     pct: 50,  stat: 'warn' },
  ];
  const issues = ISSUES_BY_TYPE[typeCode] || ISSUES_BY_TYPE.HEB;
  return (
    <aside className="edit-side">
      <RailCompletion percent={78} sections={completion}/>
      <RailIssues items={issues}/>
      <RailPresence/>
      <RailHistory/>
    </aside>
  );
}

const ISSUES_BY_TYPE = {
  HEB: [
    { tone: 'req',  title: 'Tarifs haute saison manquants', detail: 'Suite Familiale, Suite Piton · requis pour publication.' },
    { tone: 'warn', title: 'Descriptions EN & CRE absentes', detail: '60 % de complétude — recommandé pour OTI.' },
    { tone: 'warn', title: 'Photos < 6', detail: '4 photos chargées · 2 alt-text vides.' },
    { tone: 'tip',  title: 'Activer Booking', detail: 'L\'API attend une URL de connexion.' },
  ],
  RES: [
    { tone: 'req',  title: 'Ticket moyen soir manquant', detail: 'Champ tariff_soir requis pour le filtre Explorer.' },
    { tone: 'warn', title: 'Carte des vins datée', detail: 'Dernière mise à jour : 12/2025 (>3 mois).' },
    { tone: 'tip',  title: 'Ajouter Spécialités', detail: 'Au moins 3 signatures attendues.' },
    { tone: 'tip',  title: 'Photos plats récentes', detail: 'Aucune photo plats < 12 mois.' },
  ],
  ASC: [
    { tone: 'req',  title: 'Brevet BPJEPS à scanner', detail: 'Justificatif obligatoire pour publication.' },
    { tone: 'warn', title: 'Conditions saisonnières incomplètes', detail: 'Mars & avril non renseignés.' },
    { tone: 'tip',  title: 'Ajouter pictogramme niveau', detail: 'Compatibilité fiche Apidae.' },
  ],
  ITI: [
    { tone: 'req',  title: 'Fichier GPX manquant', detail: 'Trace obligatoire pour générer le profil.' },
    { tone: 'warn', title: 'Praticabilité jan-fév non renseignée', detail: 'Fermeture cyclonique à confirmer.' },
    { tone: 'tip',  title: 'Lier les POI à des fiches', detail: '2 POI ne pointent vers aucune fiche existante.' },
  ],
  VIS: [
    { tone: 'warn', title: 'Horaires basse saison à mettre à jour', detail: 'Dernière modif il y a 11 mois.' },
    { tone: 'warn', title: 'Audioguide EN/DE non testé', detail: 'Versions installées il y a > 6 mois.' },
    { tone: 'tip',  title: 'Ajouter période historique précise', detail: 'Champ requis par la grille patrimoine.' },
  ],
  SRV: [
    { tone: 'warn', title: '2 communes sans horaire saisonnier', detail: 'Petite-Île et L\'Entre-Deux : annexes seulement.' },
    { tone: 'warn', title: 'Langue espagnole sur RDV', detail: 'À préciser dans les langues conditionnelles.' },
    { tone: 'tip',  title: 'Ajouter contact presse', detail: 'Recommandé pour fiche pro@.' },
  ],
};

function EditFooter() {
  return (
    <div className="edit-footer">
      <div className="edit-footer__hint">
        <span>Raccourcis :</span>
        <code>⌘+S</code> enregistrer
        <code>⌘+⇧+P</code> publier
        <code>Esc</code> quitter
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <button className="btn">Brouillon</button>
        <button className="btn">{Ico.print({})} Aperçu</button>
        <button className="btn primary">{Ico.check({ width: 12, height: 12 })} Publier les modifs</button>
      </div>
    </div>
  );
}

function EditPage({ typeCode = 'HEB' }) {
  const base = TYPE_DEFS[typeCode] || TYPE_DEFS.HEB;
  const extra = EDIT_DATA[typeCode] || {};
  const t = { ...base, ...extra };
  const sections = makeSections(typeCode);
  const Block = TYPE_BLOCK[typeCode] || BlockHEB;
  const [mode, setMode] = useStateS('complet');

  const blockers = (BLOCKERS_BY_TYPE[typeCode] || BLOCKERS_BY_TYPE.HEB).blockers;
  const warnings = (BLOCKERS_BY_TYPE[typeCode] || BLOCKERS_BY_TYPE.HEB).warnings;

  return (
    <window.ModeCtx.Provider value={mode}>
      <div className={`edit-flat ${t.accent}`}>
        <EditTopbar t={t} mode={mode} onMode={setMode}/>

        <div className="type-ribbon">
          <span className="blob"/>
          <span><strong>{t.codeName}</strong> · {t.family}</span>
          <span className="meta">{t.covers}</span>
        </div>

        <div className="edit-body">
          <EditNav sections={sections}/>

          <main className="edit-main">
            <ValBanner blockers={blockers} warnings={warnings} type={t.code} mode={mode}/>
            <SectionIdentity t={t}/>
            <SectionDescriptions t={t}/>
            <SectionLocation t={t}/>
            <SectionContacts t={t}/>
            <Block t={t}/>
            <SectionMedia t={t}/>
            <SectionLabelsCap t={t}/>
            <SectionClassification typeCode={typeCode}/>
            <SectionTags typeCode={typeCode}/>
            <SectionAccessibility t={t} typeCode={typeCode}/>
            <SectionSustainability t={t}/>
            <SectionPayLangs/>
            <SectionPricing typeCode={typeCode}/>
            <SectionOpenings typeCode={typeCode}/>
            <SectionRelations typeCode={typeCode}/>
            {(typeCode === 'ITI' || typeCode === 'VIS') && <SectionPlaces typeCode={typeCode}/>}
            <SectionAttachments/>
            <SectionProvider t={t}/>
            <SectionCrm/>
            <SectionDistribution/>
            <SectionPublication/>
            <SectionSync/>
          </main>

          <EditSide typeCode={typeCode}/>
        </div>

        <EditFooter/>
      </div>
    </window.ModeCtx.Provider>
  );
}

const BLOCKERS_BY_TYPE = {
  HEB: {
    blockers: [
      { sec: '02', txt: 'Descriptions EN absentes — requises pour publication OTI' },
      { sec: '13', txt: 'Tarifs haute saison manquants (Suite Familiale, Suite Piton)' },
    ],
    warnings: [
      { sec: '06', txt: '4 / 6 photos minimum recommandées' },
      { sec: '08', txt: '1 classification expirée · Qualité Tourisme™' },
      { sec: '20', txt: 'Booking & Abritel non connectés' },
      { sec: '11', txt: 'Démarche durable à 43 % · catégorie Déchets sous-couverte' },
    ],
  },
  RES: {
    blockers: [{ sec: '13', txt: 'Ticket moyen soir manquant — filtre Explorer' }],
    warnings: [
      { sec: '02', txt: 'Carte des vins datant de plus de 3 mois' },
      { sec: '08', txt: 'Renouvellement Qualité Tourisme™ dans 4 mois' },
      { sec: '11', txt: 'Aucune action durable déclarée en catégorie « Eau »' },
    ],
  },
  ASC: {
    blockers: [
      { sec: '08', txt: 'Tourisme & Handicap expiré depuis 11 / 12 / 2023' },
      { sec: '04', txt: 'Brevet BPJEPS à scanner et joindre comme justificatif' },
    ],
    warnings: [
      { sec: '15', txt: 'Site PNA support à confirmer (Plage de Grands Bois)' },
      { sec: '14', txt: 'Conditions saisonnières · mars-avril non renseignés' },
    ],
  },
  ITI: {
    blockers: [{ sec: '05', txt: 'Fichier GPX manquant — trace obligatoire pour publication' }],
    warnings: [
      { sec: '14', txt: 'Praticabilité jan-fév non renseignée' },
      { sec: '15', txt: '2 POI ne pointent vers aucune fiche existante' },
      { sec: '16', txt: 'Accessibilité étape « Güé du Trou Blanc » à documenter' },
    ],
  },
  VIS: {
    blockers: [],
    warnings: [
      { sec: '14', txt: 'Horaires basse saison à mettre à jour (> 11 mois)' },
      { sec: '10', txt: 'Audioguide EN / DE non testé récemment' },
      { sec: '11', txt: 'Démarche durable à 28 % · catégorie Sensibilisation manquante' },
    ],
  },
  SRV: {
    blockers: [],
    warnings: [
      { sec: '14', txt: '2 communes sans horaire saisonnier (Petite-Île, Entre-Deux)' },
      { sec: '12', txt: 'Langue espagnole « sur RDV » à documenter' },
      { sec: '08', txt: 'Label Destination Internationale · demande en cours' },
    ],
  },
};

window.EditPage = EditPage;
