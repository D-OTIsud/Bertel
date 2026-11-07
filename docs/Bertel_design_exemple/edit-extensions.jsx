/* global React, Ico, EditPrim */
/* edit-extensions.jsx — additional universal sections covering the
   parts of schema_unified.sql we hadn't surfaced yet:

     Accessibility — description_adapted + ref_amenity (accessibility family)
                     + per-room is_accessible (HEB)
     Sustainability — object_sustainability_action by category > group > action
                      (V5 catalog, distinct from labels)
     Pricing — object_price structured table (adapts per type)
     Openings — object_opening periods, exceptional closures, holidays
     Relations — object_relation (uses_itinerary, based_at_site, inverse)
     Places — object_place_description (ITI/VIS sub-lieux)
     CRM — Suivi prestataire (interactions + crm_demand_topic_oti)
*/

const { Fs, Field, Input, Textarea, Select, Chip, ChipSet, Toggle, StatCard } = window.EditPrim;

/* ========================== Accessibility ========================== */
function SectionAccessibility({ t, typeCode }) {
  const families = [
    { lbl: 'Mobilité réduite', amenities: [
      ['Accès PMR', true], ['Place de parking PMR', true], ['Ascenseur accessible', true],
      ['Rampe d\'accès', true], ['Douche italienne / siège', false], ['Seuils ≤ 2 cm', false],
      ['Toilettes adaptées', true],
    ]},
    { lbl: 'Visuel', amenities: [
      ['Signalétique braille', false], ['Bande podotactile', false], ['Audio-description', false],
      ['Documents en gros caractères', true], ['Animal d\'assistance accepté', true],
    ]},
    { lbl: 'Auditif', amenities: [
      ['Boucle magnétique', false], ['Sous-titrage vidéos', false], ['LSF sur RDV', false],
      ['Pictogrammes & supports écrits', true],
    ]},
    { lbl: 'Mental & cognitif', amenities: [
      ['Pictogrammes FALC', false], ['Accueil formé Tourisme & Handicap', true],
      ['Espace calme à disposition', false],
    ]},
  ];
  return (
    <Fs num="10" title="Accessibilité" sub="Description adaptée multilingue, équipements (ref_amenity famille accessibility), chambres / lieux accessibles" pill={{ tone: 'warn', label: '2 / 4 familles' }}>
      <Field label="Description adaptée (description_adapted)" hint="Texte alternatif détaillé — utilisé par les fiches Acceslibre et lecteurs d'écran. Multilingue.">
        <div className="lang-tabs" style={{ marginBottom: 6 }}>
          <button className="is-on">FR <span className="ok">●</span></button>
          <button>EN <span className="miss">○</span></button>
          <button>CRE <span className="miss">○</span></button>
        </div>
        <Textarea
          value="Entrée de plain-pied côté parking PMR (2 places à 5 m de l'accueil). Comptoir abaissé à 80 cm. Toilettes adaptées au RDC. Pour les déficiences visuelles, un livret en gros caractères est disponible au comptoir et un chemin de circulation libre est garanti."
          rows={5}/>
      </Field>

      {families.map((fam, i) => (
        <div key={i}>
          <div className="chip-group__label" style={{ marginTop: 14 }}>{fam.lbl}</div>
          <div className="chip-set">
            {fam.amenities.map(([l, on], j) => (
              <Chip key={j} label={l} on={on} icon={on ? 'check' : null}/>
            ))}
            <Chip label="+ Ajouter"/>
          </div>
        </div>
      ))}

      {typeCode === 'HEB' && (
        <>
          <div className="chip-group__label" style={{ marginTop: 18 }}>
            Chambres accessibles — <span style={{ color: 'var(--ink-4)', fontWeight: 500, textTransform: 'none', letterSpacing: 0 }}>flag is_accessible par type de chambre</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            {[
              ['Chambre Standard', '12 unités', false],
              ['Chambre Supérieure', '8 unités', true],
              ['Suite Familiale', '3 unités', true],
              ['Suite Piton', '1 unité', false],
            ].map(([name, units, on], i) => (
              <div key={i} className={`tog ${on ? 'is-on' : ''}`}>
                <div>
                  {name}
                  <small>{units} · {on ? 'accessible' : 'non adaptée'}</small>
                </div>
                <span className="tog__sw"/>
              </div>
            ))}
          </div>
        </>
      )}

      <div className="chip-group__label" style={{ marginTop: 18 }}>Diagnostics &amp; déclarations</div>
      <div className="grid-3">
        <Field label="Inscription Acceslibre"><Input value="" placeholder="https://acceslibre.beta.gouv.fr/…"/></Field>
        <Field label="Registre public d'accessibilité">
          <Select value="yes" options={[{v:'yes',l:'Disponible sur place'},{v:'web',l:'En ligne'},{v:'no',l:'Non disponible'}]}/>
        </Field>
        <Field label="Audit RGAA site web"><Input value="Niveau AA partiel" placeholder="A · AA · AAA"/></Field>
      </div>
    </Fs>
  );
}

/* ========================== Sustainability (V5) ========================== */
function SectionSustainability({ t }) {
  const cats = [
    { lbl: 'Énergie', count: '4 / 9', actions: [
      ['LED généralisée sur l\'établissement', true],
      ['Audit énergétique réalisé', true],
      ['Production électrique renouvelable sur site (PV, micro-éolien)', false],
      ['Eau chaude solaire', true],
      ['Détecteurs de présence / minuteries', true],
      ['Climatisation pilotée (sondes / programmation)', false],
    ]},
    { lbl: 'Eau', count: '3 / 7', actions: [
      ['Mousseurs / réducteurs de débit', true],
      ['Récupération eaux de pluie', false],
      ['Système de double chasse WC', true],
      ['Linge changé à la demande', true],
    ]},
    { lbl: 'Déchets', count: '2 / 6', actions: [
      ['Tri sélectif visible client', true],
      ['Compostage des déchets organiques', false],
      ['Produits ménagers en vrac / écolabellisés', true],
    ]},
    { lbl: 'Mobilité', count: '1 / 4', actions: [
      ['Borne de recharge véhicule électrique', true],
      ['Prêt de vélos / VAE', false],
      ['Information transports en commun', false],
    ]},
    { lbl: 'Achats & circuit court', count: '3 / 5', actions: [
      ['> 50 % de produits péi à la carte', true],
      ['Producteurs locaux référencés', true],
      ['Fournitures éco-labellisées', true],
    ]},
    { lbl: 'Sensibilisation', count: '2 / 4', actions: [
      ['Charte client signée à l\'arrivée', true],
      ['Affichage éco-gestes en chambre', true],
    ]},
  ];
  return (
    <Fs num="11" title="Démarche durable" sub="object_sustainability_action — actions concrètes déclarées par l'établissement, distinctes des labels officiels (§ Labels)" pill={{ tone: 'ok', label: '15 actions' }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 16 }}>
        <StatCard label="Actions déclarées" value="15" suffix="/ 35"/>
        <StatCard label="Catégories couvertes" value="6" suffix="/ 8"/>
        <StatCard label="Score Bertel" value="42" suffix="/ 100"/>
      </div>

      {cats.map((c, i) => (
        <div key={i} style={{ marginBottom: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <span className="fs__num" style={{ width: 22, height: 22, fontSize: 9 }}>{(i+1+'').padStart(2,'0')}</span>
            <strong style={{ fontFamily: 'var(--font-display)', fontSize: 13 }}>{c.lbl}</strong>
            <span className="pill-mini" style={{ marginLeft: 'auto' }}>{c.count}</span>
            <button className="pill-mini" style={{ cursor: 'pointer', color: 'var(--accent-deep)' }}>Voir toutes ›</button>
          </div>
          <div className="chip-set">
            {c.actions.map(([l, on], j) => <Chip key={j} label={l} on={on} icon={on ? 'check' : null} sm/>)}
            <Chip label="+ Ajouter une action" sm/>
          </div>
        </div>
      ))}

      <div className="chip-group__label" style={{ marginTop: 14 }}>Équivalence labels (search expansion)</div>
      <p style={{ fontSize: 11.5, color: 'var(--ink-3)', margin: '0 0 8px' }}>
        Les actions déclarées ci-dessus rendent automatiquement la fiche visible dans les recherches portant sur :
      </p>
      <div className="chip-set">
        <Chip label="Clef Verte (équivalent)" on/>
        <Chip label="Écolabel européen (équivalent)" on/>
        <Chip label="Green Globe (équivalent)" on/>
      </div>
    </Fs>
  );
}

/* ========================== Pricing (object_price) ========================== */
function SectionPricing({ typeCode }) {
  const data = {
    HEB: [
      ['Chambre Standard · basse saison', '165', 'EUR / nuit', 'all'],
      ['Chambre Standard · haute saison', '220', 'EUR / nuit', 'all'],
      ['Petit-déjeuner', '14', 'EUR / pers.', 'option'],
      ['Demi-pension (+ dîner)', '38', 'EUR / pers.', 'option'],
      ['Lit supplémentaire enfant', '20', 'EUR / nuit', 'option'],
      ['Animal de compagnie', '12', 'EUR / nuit', 'option'],
      ['Taxe de séjour', '1.50', 'EUR / pers / nuit', 'taxe'],
    ],
    RES: [
      ['Menu midi du marché', '24', 'EUR · entrée + plat', 'menu'],
      ['Menu midi 3 services', '32', 'EUR', 'menu'],
      ['Menu Manapany (dégustation soir)', '56', 'EUR', 'menu'],
      ['Menu enfant (-12 ans)', '12', 'EUR', 'menu'],
      ['Menu groupe (10+ pers.)', 'sur devis', '—', 'devis'],
      ['Forfait boisson midi', '8', 'EUR · verre vin + café', 'option'],
    ],
    ASC: [
      ['Initiation 1h30', '45', 'EUR / pers.', 'session'],
      ['Cours collectif 2 h', '55', 'EUR / pers.', 'session'],
      ['Stage 5 jours', '225', 'EUR / pers.', 'pack'],
      ['Coaching privé', '95', 'EUR / pers.', 'session'],
      ['Location planche seule (h)', '10', 'EUR / h', 'option'],
      ['Photo / vidéo de session', '15', 'EUR · livraison J+1', 'option'],
    ],
    ITI: [
      ['Accès au sentier', 'Gratuit', '—', 'free'],
      ['Stationnement Bras-Sec', 'Gratuit', '—', 'free'],
      ['Visite guidée OTI (groupe)', '180', 'EUR / groupe', 'option'],
    ],
    VIS: [
      ['Entrée individuelle', 'Gratuit', 'don libre', 'free'],
      ['Visite guidée (1 h)', '5', 'EUR / pers.', 'option'],
      ['Audioguide', '3', 'EUR / appareil', 'option'],
      ['Groupe scolaire', '30', 'EUR / classe', 'group'],
      ['Groupe adulte (10+)', '3', 'EUR / pers.', 'group'],
    ],
    SRV: [
      ['Information & conseil', 'Gratuit', '—', 'free'],
      ['Pass Sud Sauvage (jour)', '15', 'EUR', 'pack'],
      ['Pass Sud Sauvage (3 jours)', '35', 'EUR', 'pack'],
      ['Réservation hébergement', 'Gratuit', '—', 'free'],
      ['Réservation activité (commission)', '0–10%', 'selon prestataire', 'commission'],
    ],
  };
  const rows = data[typeCode] || data.HEB;
  return (
    <Fs num="13" title="Tarifs &amp; extras" sub="object_price — modèle tarifaire structuré · saison · audience · option" pill={{ tone: 'ok', label: `${rows.length} lignes` }}>
      <div style={{ display: 'grid', gridTemplateColumns: '14px 2fr 90px 130px 110px auto', gap: 8, padding: '6px 12px', fontSize: 10, fontWeight: 700, color: 'var(--ink-4)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
        <span/><span>Libellé</span><span>Montant</span><span>Unité</span><span>Catégorie</span><span/>
      </div>
      <div className="repeater">
        {rows.map((r, i) => (
          <div key={i} className="rep-row" style={{ gridTemplateColumns: '14px 2fr 90px 130px 110px auto' }}>
            <span className="rep-row__handle"/>
            <Input value={r[0]}/>
            <Input value={r[1]} mono/>
            <Input value={r[2]}/>
            <Select value={r[3]} options={[
              { v: 'all',    l: 'Tarif principal' },
              { v: 'option', l: 'Option / extra' },
              { v: 'menu',   l: 'Menu / formule' },
              { v: 'pack',   l: 'Pack / forfait' },
              { v: 'session',l: 'Session encadrée' },
              { v: 'group',  l: 'Groupe' },
              { v: 'taxe',   l: 'Taxe / collecte' },
              { v: 'devis',  l: 'Sur devis' },
              { v: 'commission', l: 'Commission' },
              { v: 'free',   l: 'Gratuit' },
            ]}/>
            <div className="rep-row__act"><button>{Ico.copy({})}</button><button className="del">{Ico.trash({})}</button></div>
          </div>
        ))}
      </div>
      <button className="rep-add">{Ico.plus({})} Ajouter une ligne tarifaire</button>

      <div className="chip-group__label" style={{ marginTop: 14 }}>Politique &amp; règles</div>
      <div className="grid-3">
        <Field label="Acompte demandé"><Select value="30" options={['Aucun','30 %','50 %','Totalité']}/></Field>
        <Field label="Délai annulation gratuite"><Input value="J-7" mono/></Field>
        <Field label="TVA applicable"><Select value="10" options={['0 %','5.5 %','10 %','20 %','Auto-entrepreneur (exo.)']}/></Field>
      </div>
    </Fs>
  );
}

/* ========================== Opening periods ========================== */
function SectionOpenings({ typeCode }) {
  const periods = [
    { name: 'Période standard', range: 'Toute l\'année · sauf saison cyclonique', tag: 'standard', on: true, days: 'Mar–Dim · 09:00–18:00' },
    { name: 'Haute saison',     range: '1er juin → 31 octobre',  tag: 'high',    on: true, days: 'Lun–Dim · 08:30–19:00' },
    { name: 'Saison cyclonique',range: '15 décembre → 15 janvier',tag: 'closed', on: true, days: 'Fermé' },
  ];
  const exceptions = [
    ['01/01/2026', 'Jour de l\'An', 'Fermé'],
    ['20/12/2025', 'Fermeture annuelle', 'Fermé jusqu\'au 06/01'],
    ['12/03/2026', 'Fermeture exceptionnelle', 'Maintenance piscine'],
    ['01/05/2026', 'Fête du Travail', 'Ouvert · horaires dim.'],
    ['20/12/2026', 'Abolition esclavage', 'Ouvert'],
  ];
  return (
    <Fs num="14" title="Périodes d'ouverture" sub="object_opening — saisons, exceptions, jours fériés · le détail jour-par-jour vit dans la section 05 du type" pill={{ tone: 'ok', label: '3 périodes' }}>

      <div className="chip-group__label" style={{ marginTop: 0 }}>Périodes saisonnières</div>
      <div className="repeater">
        {periods.map((p, i) => (
          <div key={i} className="rep-row" style={{ gridTemplateColumns: '14px 1.4fr 1.4fr 1fr 100px auto' }}>
            <span className="rep-row__handle"/>
            <Input value={p.name}/>
            <Input value={p.range} mono/>
            <Input value={p.days} mono placeholder="Voir détail dans la section 05"/>
            <Select value={p.tag} options={[
              { v: 'standard', l: 'Standard' },
              { v: 'high', l: 'Haute saison' },
              { v: 'low', l: 'Basse saison' },
              { v: 'event', l: 'Événement' },
              { v: 'closed', l: 'Fermeture' },
            ]}/>
            <div className="rep-row__act"><button>{Ico.edit({})}</button><button className="del">{Ico.trash({})}</button></div>
          </div>
        ))}
      </div>
      <button className="rep-add">{Ico.plus({})} Ajouter une période</button>

      <div className="chip-group__label" style={{ marginTop: 18 }}>Calendrier 2026 — aperçu</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(12, 1fr)', gap: 2 }}>
        {Array.from({ length: 12 }).map((_, m) => (
          <div key={m} style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            <div style={{ textAlign: 'center', fontSize: 9, fontWeight: 700, color: 'var(--ink-4)', letterSpacing: '0.05em', marginBottom: 2 }}>
              {['Jan','Fév','Mar','Avr','Mai','Juin','Juil','Août','Sep','Oct','Nov','Déc'][m]}
            </div>
            {Array.from({ length: 31 }).map((__, d) => {
              const high = (m >= 5 && m <= 9);
              const closed = (m === 11 && d > 18) || (m === 0 && d < 6);
              const bg = closed ? 'rgba(200,92,72,0.55)' :
                         high ? 'var(--accent)' :
                         'rgba(24,49,59,0.12)';
              return <div key={d} style={{ height: 5, background: bg, borderRadius: 1 }}/>;
            })}
          </div>
        ))}
      </div>

      <div className="chip-group__label" style={{ marginTop: 14 }}>Fermetures exceptionnelles &amp; jours fériés</div>
      <div className="repeater">
        {exceptions.map((e, i) => (
          <div key={i} className="rep-row" style={{ gridTemplateColumns: '14px 110px 1.5fr 1.5fr auto' }}>
            <span className="rep-row__handle"/>
            <Input value={e[0]} mono prefix="📅"/>
            <Input value={e[1]}/>
            <Input value={e[2]}/>
            <div className="rep-row__act"><button className="del">{Ico.trash({})}</button></div>
          </div>
        ))}
      </div>
      <button className="rep-add">{Ico.plus({})} Ajouter une fermeture</button>
    </Fs>
  );
}

/* ========================== Relations (object_relation) ========================== */
function SectionRelations({ typeCode }) {
  const map = {
    ASC: {
      pill: '2 supports',
      outgoing: [
        ['based_at_site', 'Plage de Grands Bois', 'PNA-00184', 'Site support de pratique'],
        ['uses_itinerary', 'Boucle baie de Saint-Pierre', 'ITI-00091', 'Itinéraire emprunté'],
      ],
      incoming: [
        ['operated_by', 'Office de Tourisme du Sud', 'PSV-00007', 'Distribué via la billetterie OTI'],
      ],
    },
    ITI: {
      pill: '3 fiches liées',
      outgoing: [
        ['part_of_park', 'Parc national de La Réunion', 'PNA-00001', 'Tracé en zone cœur de parc'],
      ],
      incoming: [
        ['uses_itinerary', 'Surf School Saint-Pierre — Sortie SUP', 'ASC-00188', 'Activité ACT qui emprunte ce tracé'],
        ['uses_itinerary', 'Run Réunion Trail Coaching', 'ASC-00222', 'Trail running encadré'],
      ],
    },
    VIS: {
      pill: '2 fiches liées',
      outgoing: [
        ['inside_zone', 'Cirque de Cilaos', 'PNA-00012', 'Localisation patrimoniale'],
      ],
      incoming: [
        ['mentioned_in', 'Boucle patrimoine du bourg', 'ITI-00073', 'Étape de l\'itinéraire'],
      ],
    },
    HEB: {
      pill: 'Aucun lien',
      outgoing: [],
      incoming: [
        ['recommended_by', 'Boucle des Trois Bassins', 'ITI-00073', 'Hébergement recommandé en fin de boucle'],
      ],
    },
    RES: {
      pill: '1 fiche liée',
      outgoing: [
        ['part_of', 'Hôtel Bel Air', 'HOT-01284', 'Restaurant de l\'hôtel'],
      ],
      incoming: [],
    },
    SRV: {
      pill: '12 fiches portées',
      outgoing: [
        ['publishes', '+ 124 fiches', '—', 'Voir la liste des fiches portées'],
      ],
      incoming: [],
    },
  };
  const d = map[typeCode] || map.HEB;
  return (
    <Fs num="15" title="Liens vers d'autres fiches" sub="object_relation — supports (uses_itinerary, based_at_site), appartenance (part_of), distribution (operated_by)" pill={{ tone: 'ok', label: d.pill }}>

      <div className="chip-group__label" style={{ marginTop: 0 }}>Liens sortants — cette fiche pointe vers</div>
      <div className="repeater">
        {d.outgoing.length === 0 && (
          <div className="rep-row" style={{ gridTemplateColumns: '1fr', color: 'var(--ink-4)', fontSize: 12, fontStyle: 'italic' }}>
            Aucun lien sortant pour cet objet — utiliser le bouton ci-dessous pour ajouter une relation.
          </div>
        )}
        {d.outgoing.map((r, i) => (
          <div key={i} className="rep-row" style={{ gridTemplateColumns: '14px 130px 1fr 110px 1.5fr auto' }}>
            <span className="rep-row__handle"/>
            <Select value={r[0]} options={[
              { v: 'based_at_site', l: 'based_at_site' },
              { v: 'uses_itinerary', l: 'uses_itinerary' },
              { v: 'part_of', l: 'part_of' },
              { v: 'part_of_park', l: 'part_of_park' },
              { v: 'inside_zone', l: 'inside_zone' },
              { v: 'recommended_by', l: 'recommended_by' },
              { v: 'mentioned_in', l: 'mentioned_in' },
              { v: 'publishes', l: 'publishes' },
            ]}/>
            <Input value={r[1]}/>
            <Input value={r[2]} mono/>
            <Input value={r[3]} placeholder="Note libre" />
            <div className="rep-row__act"><button>{Ico.expand({})}</button><button className="del">{Ico.trash({})}</button></div>
          </div>
        ))}
      </div>
      <button className="rep-add">{Ico.plus({})} Lier vers une fiche…</button>

      {window.EditEnh && <window.EditEnh.RelationPicker open={true}/>}

      <div className="chip-group__label" style={{ marginTop: 18 }}>Liens entrants — fiches qui pointent vers celle-ci <span style={{ color: 'var(--ink-4)', fontWeight: 500, textTransform: 'none', letterSpacing: 0 }}>(lecture seule)</span></div>
      <div className="repeater">
        {d.incoming.length === 0 && (
          <div className="rep-row" style={{ gridTemplateColumns: '1fr', color: 'var(--ink-4)', fontSize: 12, fontStyle: 'italic' }}>
            Aucune fiche ne pointe encore vers cet objet.
          </div>
        )}
        {d.incoming.map((r, i) => (
          <div key={i} className="rep-row" style={{ gridTemplateColumns: '14px 130px 1fr 110px 1.5fr auto' }}>
            <span className="rep-row__handle" style={{ visibility: 'hidden' }}/>
            <span className="pill-mini" style={{ height: 22, display: 'inline-flex', alignItems: 'center' }}>{r[0]}</span>
            <strong style={{ fontSize: 12, color: 'var(--ink)', fontWeight: 600 }}>{r[1]}</strong>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--ink-3)' }}>{r[2]}</span>
            <span style={{ fontSize: 11, color: 'var(--ink-3)' }}>{r[3]}</span>
            <button className="icbtn" title="Ouvrir la fiche">{Ico.expand({ width: 12, height: 12 })}</button>
          </div>
        ))}
      </div>
    </Fs>
  );
}

/* ========================== Places / sub-lieux ========================== */
function SectionPlaces({ typeCode }) {
  const map = {
    ITI: [
      { kind: 'start', name: 'Parking Bras-Sec',     accessible: 'partial', desc: '40 places · sol stabilisé, dépose-minute à 30 m du panneau ONF.' },
      { kind: 'mid',   name: 'Belvédère du Maïdo',   accessible: 'no',      desc: 'Plateforme rocheuse, accès par marches irrégulières.' },
      { kind: 'mid',   name: 'Premier bassin',        accessible: 'no',      desc: 'Descente technique 200 m, passages câblés. Baignade aux risques du visiteur.' },
      { kind: 'end',   name: 'Retour parking (variante piste)', accessible: 'partial', desc: 'Piste forestière carrossable — possible navette PMR sur RDV.' },
    ],
    VIS: [
      { kind: 'start', name: 'Parvis & entrée principale', accessible: 'yes',     desc: 'Plain-pied, place PMR à 8 m, signalétique adaptée.' },
      { kind: 'mid',   name: 'Nef centrale',               accessible: 'yes',     desc: 'Allée centrale large 2 m, sièges à disposition tous les 10 m.' },
      { kind: 'mid',   name: 'Crypte historique',          accessible: 'no',      desc: 'Accès par 18 marches étroites · non accessible PMR.' },
      { kind: 'mid',   name: 'Comptoir d\'accueil & boutique', accessible: 'yes', desc: 'Comptoir abaissé 80 cm, audioguide à retirer ici.' },
    ],
  };
  const places = map[typeCode];
  if (!places) return null;
  return (
    <Fs num="16" title={typeCode === 'ITI' ? 'Lieux & étapes' : 'Sous-lieux & description'} sub="object_place_description — chaque sous-lieu porte sa propre description et son flag accessibilité">
      <div className="repeater">
        {places.map((p, i) => (
          <div key={i} className="rep-row" style={{ gridTemplateColumns: '14px 110px 1fr 1fr 130px auto', alignItems: 'flex-start', paddingTop: 12 }}>
            <span className="rep-row__handle" style={{ marginTop: 6 }}/>
            <Select value={p.kind} options={[
              { v: 'start', l: 'Départ / Entrée' },
              { v: 'mid',   l: 'Étape / Salle' },
              { v: 'end',   l: 'Arrivée / Sortie' },
              { v: 'park',  l: 'Parking' },
              { v: 'wc',    l: 'Sanitaires' },
              { v: 'shop',  l: 'Boutique' },
            ]}/>
            <Input value={p.name}/>
            <Textarea value={p.desc} rows={2}/>
            <Select value={p.accessible} options={[
              { v: 'yes', l: '♿ Accessible' },
              { v: 'partial', l: '◐ Partiellement' },
              { v: 'no', l: '✕ Non accessible' },
            ]}/>
            <div className="rep-row__act"><button>{Ico.edit({})}</button><button className="del">{Ico.trash({})}</button></div>
          </div>
        ))}
      </div>
      <button className="rep-add">{Ico.plus({})} Ajouter un sous-lieu</button>
    </Fs>
  );
}

/* ========================== CRM / Suivi prestataire ========================== */
function SectionCrm() {
  const log = [
    { d: '14/04/2026', who: 'Florence G.', kind: 'Appel sortant', topic: 'Mise à jour tarifs 2026', mood: 'positif', dur: '8 min', summary: 'Tarifs HEB ajustés en direct, photos été à venir.' },
    { d: '02/04/2026', who: 'Florence G.', kind: 'Visite terrain', topic: 'Vérification accessibilité', mood: 'neutre', dur: '45 min', summary: 'Constat sur Suite Piton : marche d\'accès à signaler.' },
    { d: '24/03/2026', who: 'Jean-Marc B.', kind: 'E-mail', topic: 'Renouvellement Pass Sud Sauvage', mood: 'positif', dur: '—', summary: 'Adhésion 2026-2027 confirmée, facture envoyée.' },
    { d: '11/03/2026', who: 'Florence G.', kind: 'Appel entrant', topic: 'Réclamation hébergé', mood: 'tendu', dur: '22 min', summary: 'Problème de wifi signalé · suivi côté technique.' },
    { d: '02/01/2026', who: 'Système', kind: 'Import CRM', topic: 'Migration Airtable → Bertel', mood: 'neutre', dur: '—', summary: 'Reprise de 38 interactions historiques.' },
  ];
  return (
    <Fs num="19" title="Suivi prestataire (CRM)" sub="Interactions, demandes, sujets normalisés (crm_demand_topic_oti) · pilotage OTI" pill={{ tone: 'ok', label: '38 interactions' }}>
      <div className="grid-4" style={{ marginBottom: 14 }}>
        <StatCard label="Interactions / 12 mois" value="14"/>
        <StatCard label="Dernier contact" value="14/04"/>
        <StatCard label="NPS prestataire" value="+62" suffix="/100"/>
        <StatCard label="Sujets ouverts" value="2" suffix="à traiter"/>
      </div>

      <div className="chip-group__label" style={{ marginTop: 0 }}>Demandes / sujets normalisés (crm_demand_topic_oti)</div>
      <div className="chip-set">
        {['Mise à jour fiche','Renouvellement adhésion','Demande visuelle','Demande de visite','Réclamation client','Litige','Formation','Information générale','Refus de diffusion']
          .map((c, i) => <Chip key={i} label={c} on={[0,1,4].includes(i)}/>)}
      </div>

      <div className="chip-group__label" style={{ marginTop: 14 }}>Journal d'interactions</div>
      <div className="repeater">
        {log.map((it, i) => (
          <div key={i} className="rep-row" style={{ gridTemplateColumns: '14px 80px 110px 1.5fr 80px 60px 1.6fr auto', alignItems: 'center' }}>
            <span className="rep-row__handle"/>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--ink-3)' }}>{it.d}</span>
            <span className="pill-mini">{it.kind}</span>
            <Input value={it.topic}/>
            <Select value={it.mood} options={['positif','neutre','tendu']}/>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--ink-3)' }}>{it.dur}</span>
            <span style={{ fontSize: 11.5, color: 'var(--ink-3)' }}>{it.summary}</span>
            <div className="rep-row__act"><button>{Ico.edit({})}</button><button className="del">{Ico.trash({})}</button></div>
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
        <button className="rep-add" style={{ marginTop: 0 }}>{Ico.plus({})} Nouvelle interaction</button>
        <button className="rep-add" style={{ marginTop: 0 }}>{Ico.mail({})} Programmer un appel</button>
        <button className="rep-add" style={{ marginTop: 0 }}>{Ico.bag({})} Créer un ticket</button>
      </div>
    </Fs>
  );
}

window.EditExt = {
  SectionAccessibility, SectionSustainability, SectionPricing,
  SectionOpenings, SectionRelations, SectionPlaces, SectionCrm,
};
