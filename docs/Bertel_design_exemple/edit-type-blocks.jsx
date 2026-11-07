/* global React, Ico, EditPrim */
/* edit-type-blocks.jsx — one rich "type-specific" section per archetype.
   Slotted at position 05 in the section list of each EditPage. */

const { Field, Input, Textarea, Select, Chip, ChipSet, Toggle, StatCard, Fs } = window.EditPrim;
const MonthsE = ['J','F','M','A','M','J','J','A','S','O','N','D'];

/* =================== Reusable bits =================== */
function SeasonPicker({ months }) {
  return (
    <>
      <div className="season-picker">
        {MonthsE.map((m, i) => {
          const state = months[i] || '';
          return <div key={i} className={`cell ${state}`}>{m}</div>;
        })}
      </div>
      <div className="season-legend">
        <span><i className="l-closed"/> Fermé</span>
        <span><i className="l-high"/> Saison haute</span>
        <span><i className="l-peak"/> Pic — affluence max</span>
        <span style={{ marginLeft: 'auto', color: 'var(--ink-4)' }}>Clic pour basculer · clic-droit pour fermer le mois</span>
      </div>
    </>
  );
}

function ScheduleEditor({ rows, colA = 'Service midi', colB = 'Service soir' }) {
  return (
    <>
      <div className="sched">
        <div className="sched__head">Jour</div>
        <div className="sched__head">{colA}</div>
        <div className="sched__head">{colB}</div>
        <div className="sched__head">Copier</div>
        {rows.map((r, i) => (
          <React.Fragment key={i}>
            <div className={`sched__day ${r.on ? 'is-on' : ''}`}>
              <span className="ck">{r.on && Ico.check({ width: 9, height: 9 })}</span>
              {r.d}<small>{r.lbl}</small>
            </div>
            <div className={`sched__slot ${!r.a ? 'is-closed' : ''}`}>
              <input defaultValue={r.a?.[0] || 'Fermé'} />
              {r.a && <span className="dash">—</span>}
              {r.a && <input defaultValue={r.a[1]} />}
            </div>
            <div className={`sched__slot ${!r.b ? 'is-closed' : ''}`}>
              <input defaultValue={r.b?.[0] || 'Fermé'} />
              {r.b && <span className="dash">—</span>}
              {r.b && <input defaultValue={r.b[1]} />}
            </div>
            <button className="sched__copy" title="Copier sur toute la semaine">⤓</button>
          </React.Fragment>
        ))}
        <div className="sched__hint">
          <button className="chip size-sm">Tous les jours</button>
          <button className="chip size-sm">Lun–Ven</button>
          <button className="chip size-sm">Week-end</button>
          <button className="chip size-sm">Service midi uniquement</button>
          <button className="chip size-sm">Soir uniquement</button>
        </div>
      </div>
    </>
  );
}

/* =================== HEB : Hébergement =================== */
function BlockHEB() {
  const rooms = [
    { name: 'Chambre Standard', sub: 'vue jardin · douche', sleep: '2', surface: '22', units: '12', low: '165', high: '220' },
    { name: 'Chambre Supérieure', sub: 'vue piton · balcon', sleep: '2-3', surface: '28', units: '8', low: '210', high: '280' },
    { name: 'Suite Familiale', sub: '2 chambres · salon', sleep: '4', surface: '52', units: '3', low: '340', high: '440' },
    { name: 'Suite Piton', sub: 'vue panoramique · jacuzzi', sleep: '2', surface: '48', units: '1', low: '420', high: '560' },
  ];
  const mice = [
    { name: 'Salle Bras-Long', area: '78', theatre: '60', class: '32', banquet: '40' },
    { name: 'Salon Tamarin',   area: '34', theatre: '24', class: '16', banquet: '14' },
  ];
  return (
    <Fs num="05" title="Chambres, équipements & séminaire"
        sub="Inventaire de l'offre hébergement : unités locatives, capacités, tarifs basse/haute saison, équipements, salles MICE"
        pill={{ tone: 'ok', label: '4 types · 24 unités' }}>

      <div className="chip-group__label" style={{ marginTop: 0 }}>Catégorie d'hébergement</div>
      <div className="grid-3" style={{ marginBottom: 14 }}>
        <Field label="Sous-type (taxonomy_hot)">
          <Select value="hotel_boutique" options={[
            { v: 'hotel_classic', l: 'Hôtel classique' },
            { v: 'hotel_boutique', l: 'Hôtel boutique' },
            { v: 'hotel_family', l: 'Hôtel familial' },
            { v: 'auberge', l: 'Auberge' },
          ]}/>
        </Field>
        <Field label="Mode d'exploitation">
          <Select value="indep" options={['Indépendant','Chaîne intégrée','Franchise','Groupement']}/>
        </Field>
        <Field label="Saisonnalité"><Select value="all" options={['Toute l\'année','Saisonnier (hiver austral)','Saisonnier (été austral)','Fermeture annuelle']}/></Field>
      </div>

      <div className="chip-group__label">Chambres / unités locatives</div>
      <div style={{ display: 'grid', gridTemplateColumns: '14px 1.4fr 70px 70px 70px 80px 80px auto', gap: 8, padding: '6px 12px', fontSize: 10, fontWeight: 700, color: 'var(--ink-4)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
        <span/>
        <span>Type · vue · équipements</span>
        <span>Couchages</span>
        <span>Surface</span>
        <span>Unités</span>
        <span>Tarif basse</span>
        <span>Tarif haute</span>
        <span/>
      </div>
      <div className="repeater">
        {rooms.map((r, i) => (
          <div key={i} className="rep-row" style={{ gridTemplateColumns: '14px 1.4fr 70px 70px 70px 80px 80px auto' }}>
            <span className="rep-row__handle"/>
            <div>
              <Input value={r.name}/>
              <div style={{ marginTop: 4 }}>
                <Input value={r.sub} placeholder="vue · équipements clés"/>
              </div>
            </div>
            <Input value={r.sleep} mono/>
            <Input value={r.surface} mono suffix="m²"/>
            <Input value={r.units} mono/>
            <Input value={r.low} mono suffix="€"/>
            <Input value={r.high} mono suffix="€"/>
            <div className="rep-row__act"><button>{Ico.copy({})}</button><button className="del">{Ico.trash({})}</button></div>
          </div>
        ))}
      </div>
      <button className="rep-add">{Ico.plus({})} Ajouter un type de chambre</button>

      <div className="chip-group__label" style={{ marginTop: 20 }}>Équipements & services sur place (catégorisés)</div>

      <div style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--ink-3)', margin: '6px 0 4px' }}>Confort chambre</div>
      <div className="chip-set">
        {['Climatisation','Wi-Fi gratuit','TV','Coffre','Sèche-cheveux','Mini-bar','Bouilloire','Balcon / terrasse','Vue mer','Vue montagne','Salle de bain privée','Douche italienne']
          .map((l, i) => <Chip key={i} label={l} on={i < 7}/>)}
      </div>

      <div style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--ink-3)', margin: '14px 0 4px' }}>Services & loisirs</div>
      <div className="chip-set">
        {['Piscine extérieure','Piscine chauffée','Spa & bien-être','Restaurant sur place','Bar','Petit-déjeuner','Parking gratuit','Recharge VE','Animaux acceptés','Service en chambre','Conciergerie','Navette aéroport']
          .map((l, i) => <Chip key={i} label={l} on={[0,2,3,4,5,6].includes(i)} icon={['pool','pool','pool','coffee','coffee','coffee'][i]}/>)}
      </div>

      <div style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--ink-3)', margin: '14px 0 4px' }}>Accessibilité</div>
      <div className="chip-set">
        {['Accès PMR','Chambre PMR','Ascenseur','Signalétique braille','Boucle magnétique','Animaux d\'assistance acceptés']
          .map((l, i) => <Chip key={i} label={l} on={i < 2}/>)}
      </div>

      <div className="chip-group__label" style={{ marginTop: 20 }}>Politiques d'accueil</div>
      <div className="grid-3" style={{ marginBottom: 10 }}>
        <Field label="Check-in"><Input value="15h00 – 19h00" mono/></Field>
        <Field label="Check-out"><Input value="avant 11h00" mono/></Field>
        <Field label="Âge minimum"><Input value="dès 6 ans" placeholder="ex : dès 6 ans"/></Field>
      </div>
      <div className="grid-3">
        <Toggle label="Animaux acceptés" sub="Supplément 12 €/nuit" on/>
        <Toggle label="Fumeurs autorisés" sub="Terrasses uniquement"/>
        <Toggle label="Caution demandée" sub="200 € à l'arrivée" on/>
      </div>

      <div className="chip-group__label" style={{ marginTop: 20 }}>Salles séminaire & événementiel</div>
      <div style={{ display: 'grid', gridTemplateColumns: '14px 1.4fr 70px 70px 70px 70px auto', gap: 8, padding: '6px 12px', fontSize: 10, fontWeight: 700, color: 'var(--ink-4)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
        <span/><span>Salle</span><span>Surface m²</span><span>Théâtre</span><span>Classe</span><span>Banquet</span><span/>
      </div>
      <div className="repeater">
        {mice.map((m, i) => (
          <div key={i} className="rep-row" style={{ gridTemplateColumns: '14px 1.4fr 70px 70px 70px 70px auto' }}>
            <span className="rep-row__handle"/>
            <Input value={m.name}/>
            <Input value={m.area} mono/>
            <Input value={m.theatre} mono/>
            <Input value={m.class} mono/>
            <Input value={m.banquet} mono/>
            <div className="rep-row__act"><button className="del">{Ico.trash({})}</button></div>
          </div>
        ))}
      </div>
      <button className="rep-add">{Ico.plus({})} Ajouter une salle</button>
    </Fs>
  );
}

/* =================== RES : Restaurant =================== */
function BlockRES() {
  const week = [
    { d: 'Lun', lbl: 'lundi', on: true, a: ['11:30','14:00'], b: null },
    { d: 'Mar', lbl: 'mardi', on: true, a: ['11:30','14:00'], b: ['19:00','22:00'] },
    { d: 'Mer', lbl: 'mercredi', on: true, a: ['11:30','14:00'], b: ['19:00','22:00'] },
    { d: 'Jeu', lbl: 'jeudi', on: true, a: ['11:30','14:00'], b: ['19:00','22:00'] },
    { d: 'Ven', lbl: 'vendredi', on: true, a: ['11:30','14:00'], b: ['19:00','22:30'] },
    { d: 'Sam', lbl: 'samedi', on: true, a: ['11:30','15:00'], b: ['19:00','22:30'] },
    { d: 'Dim', lbl: 'dimanche', on: false, a: ['11:30','15:00'], b: null },
  ];
  const menus = [
    { name: 'Carte midi · semaine', sub: 'FR · 4 p. · maj 02/03/2026', size: '480 ko' },
    { name: 'Carte soir', sub: 'FR · 6 p. · maj 02/03/2026', size: '620 ko' },
    { name: 'Menu enfant', sub: 'FR · 1 p.', size: '120 ko' },
    { name: 'Carte des vins', sub: 'FR · 8 p. · maj 12/2025', size: '740 ko' },
  ];
  return (
    <Fs num="05" title="Cuisine, cartes & service"
        sub="Cuisines & spécialités, capacité couverts, ticket moyen, cartes PDF, horaires midi / soir, services"
        pill={{ tone: 'ok', label: 'Service en cours' }}>

      <div className="chip-group__label" style={{ marginTop: 0 }}>Identité culinaire</div>
      <div className="grid-3" style={{ marginBottom: 10 }}>
        <Field label="Type de restauration">
          <Select value="restaurant" options={[
            { v: 'restaurant', l: 'Restaurant' },
            { v: 'auberge', l: 'Auberge' },
            { v: 'table_hote', l: 'Table d\'hôte' },
            { v: 'snack', l: 'Snack' },
            { v: 'foodtruck', l: 'Food truck' },
            { v: 'traiteur', l: 'Traiteur' },
            { v: 'bar', l: 'Bar / Pub' },
          ]}/>
        </Field>
        <Field label="Couverts intérieur" hint="Capacité Berta 2.0">
          <Input value="60" mono suffix="cv."/>
        </Field>
        <Field label="Couverts terrasse">
          <Input value="20" mono suffix="cv."/>
        </Field>
      </div>
      <div className="grid-3" style={{ marginBottom: 14 }}>
        <Field label="Ticket moyen midi"><Input value="18" mono suffix="€"/></Field>
        <Field label="Ticket moyen soir"><Input value="28" mono suffix="€"/></Field>
        <Field label="Groupes — capacité max"><Input value="40" mono suffix="pers."/></Field>
      </div>

      <Field label="Cuisines proposées" hint="Multi-sélection — la 1ère sera la cuisine principale">
        <div className="chip-set">
          {['Créole','Française','Indienne','Métisse','Méditerranéenne','Asiatique','Italienne','Snacks péi','Spécialités sénégalaises']
            .map((c, i) => <Chip key={i} label={c} on={[0,1,3].includes(i)}/>)}
        </div>
      </Field>
      <Field label="Spécialités maison" hint="Quelques signatures (3-6 idéal)" >
        <div className="chip-set">
          <Chip label="Cari de canard fumé" on/>
          <Chip label="Tartare de thon rouge" on/>
          <Chip label="Rougail saucisses" on/>
          <Chip label="Cassoulet péi" on/>
          <Chip label="+ Ajouter une spécialité"/>
        </div>
      </Field>

      <div className="chip-group__label" style={{ marginTop: 14 }}>Services & ambiance</div>
      <div className="chip-set">
        {['Terrasse vue mer','Climatisation','Réservation en ligne','Plats à emporter','Livraison','Accueil groupes','Wi-Fi gratuit','Animaux acceptés','Accessibilité PMR','Coin enfants','Bar à cocktails','Cave à vins','Cuisine au feu de bois']
          .map((c, i) => <Chip key={i} label={c} on={[0,1,2,3,5,6,8].includes(i)}/>)}
      </div>

      <div className="chip-group__label" style={{ marginTop: 18 }}>Cartes & menus (PDF)</div>
      <div className="repeater">
        {menus.map((m, i) => (
          <div key={i} className="rep-row" style={{ gridTemplateColumns: '14px 36px 1fr 90px 90px auto' }}>
            <span className="rep-row__handle"/>
            <div className="sync-row__src">PDF</div>
            <div>
              <Input value={m.name}/>
              <div style={{ fontSize: 10.5, color: 'var(--ink-4)', marginTop: 3 }}>{m.sub}</div>
            </div>
            <Select value="fr" options={['FR','EN','FR+EN','CRE']}/>
            <span className="pill-mini">{m.size}</span>
            <div className="rep-row__act"><button>{Ico.download({})}</button><button className="del">{Ico.trash({})}</button></div>
          </div>
        ))}
      </div>
      <div className="grid-2" style={{ marginTop: 8 }}>
        <div className="dropzone" style={{ padding: 12 }}>
          <span className="ico">{Ico.plus({ width: 14, height: 14 })}</span>
          <strong>Déposer un PDF de carte</strong>
          <small>Mise à jour conseillée tous les 3 mois</small>
        </div>
        <Field label="URL menu en ligne (TheFork, Yumi, etc.)"
               hint="Renvoie vers la carte interactive du partenaire">
          <Input value="" placeholder="https://thefork.fr/restaurant/le-manapany" mono/>
        </Field>
      </div>

      <div className="chip-group__label" style={{ marginTop: 18 }}>Horaires de service</div>
      <ScheduleEditor rows={week}/>
    </Fs>
  );
}

/* =================== ASC : Activité =================== */
function BlockASC() {
  const formulas = [
    { name: 'Initiation 1h30', dur: '1h30', age: 'dès 7 ans', lvl: 'Débutant', max: '6', price: '45' },
    { name: 'Cours collectif',  dur: '2h00', age: 'dès 10 ans', lvl: 'Tous niveaux', max: '8', price: '55' },
    { name: 'Stage 5 jours',    dur: '5×2h', age: 'dès 8 ans', lvl: 'Progressif', max: '6', price: '225' },
    { name: 'Coaching privé',   dur: '1h30', age: 'tous âges', lvl: 'Sur mesure', max: '2', price: '95' },
  ];
  return (
    <Fs num="05" title="Formules, public & saison"
        sub="Sous-type d'activité, sessions/forfaits, niveau, public cible, fenêtre saisonnière, conditions"
        pill={{ tone: 'ok', label: '4 formules actives' }}>

      <div className="grid-3" style={{ marginBottom: 14 }}>
        <Field label="Sous-type (taxonomy_act)" required>
          <Select value="surf" options={[
            { v: 'surf', l: 'Surf · École' },
            { v: 'canyoning', l: 'Canyoning' },
            { v: 'paragliding', l: 'Parapente' },
            { v: 'fitness_wellness', l: 'Remise en forme' },
            { v: 'diving', l: 'Plongée' },
            { v: 'hiking_guided', l: 'Rando guidée' },
          ]}/>
        </Field>
        <Field label="Environnement de pratique"><Select value="sea" options={['Mer & littoral','Eaux vives','Montagne','Plein air terrestre','Indoor','Aéronautique']}/></Field>
        <Field label="Encadrement"><Select value="bpjeps" options={['BPJEPS','Diplôme d\'État','Brevet fédéral','Sans encadrement','Animateur bénévole']}/></Field>
      </div>

      <div className="chip-group__label" style={{ marginTop: 0 }}>Caractéristiques métier <span style={{ color: 'var(--ink-4)', fontWeight: 500, textTransform: 'none', letterSpacing: 0 }}>· table object_act</span></div>
      <div className="grid-4" style={{ marginBottom: 10 }}>
        <Field label="Durée minimale" hint="object_act.duration_min · en minutes">
          <Input value="90" mono suffix="min"/>
        </Field>
        <Field label="Participants min." hint="object_act.min_participants">
          <Input value="2" mono suffix="pers."/>
        </Field>
        <Field label="Participants max." hint="object_act.max_participants">
          <Input value="8" mono suffix="pers."/>
        </Field>
        <Field label="Âge minimum" hint="object_act.min_age">
          <Input value="7" mono suffix="ans"/>
        </Field>
      </div>
      <div className="grid-2" style={{ marginBottom: 14 }}>
        <Toggle label="Encadrement obligatoire" sub="object_act.guide_required — pratique impossible sans guide diplômé" on/>
        <Toggle label="Équipement fourni" sub="object_act.equipment_provided — planches, combinaisons, harnais inclus" on/>
      </div>

      <div className="chip-group__label" style={{ marginTop: 14 }}>Opérateur &amp; encadrants <span style={{ color: 'var(--ink-4)', fontWeight: 500, textTransform: 'none', letterSpacing: 0 }}>· actor_object_role [operator] / [guide]</span></div>
      <p style={{ fontSize: 11.5, color: 'var(--ink-3)', margin: '0 0 8px' }}>
        Distinct du publisher (OTI · § Rattachements). L'opérateur est la société commerciale qui vend la prestation ; les guides sont les personnes qui l'encadrent.
      </p>
      <div className="repeater" style={{ marginBottom: 8 }}>
        <div className="rep-row" style={{ gridTemplateColumns: '14px 110px 1.4fr 1fr 90px auto' }}>
          <span className="rep-row__handle"/>
          <Select value="operator" options={[{v:'operator',l:'Opérateur'},{v:'guide',l:'Guide'},{v:'helper',l:'Assistant'}]}/>
          <Input value="Surf School Saint-Pierre SAS"/>
          <Input value="actor-00188" mono/>
          <span className="pill-mini">Principal</span>
          <div className="rep-row__act"><button>{Ico.edit({})}</button><button className="del">{Ico.trash({})}</button></div>
        </div>
        <div className="rep-row" style={{ gridTemplateColumns: '14px 110px 1.4fr 1fr 90px auto' }}>
          <span className="rep-row__handle"/>
          <Select value="guide" options={[{v:'guide',l:'Guide'}]}/>
          <Input value="Léo Hoarau (BPJEPS Surf)"/>
          <Input value="actor-00342" mono/>
          <span className="pill-mini">Référent</span>
          <div className="rep-row__act"><button>{Ico.edit({})}</button><button className="del">{Ico.trash({})}</button></div>
        </div>
        <div className="rep-row" style={{ gridTemplateColumns: '14px 110px 1.4fr 1fr 90px auto' }}>
          <span className="rep-row__handle"/>
          <Select value="guide" options={[{v:'guide',l:'Guide'}]}/>
          <Input value="Manon Picard (BPJEPS Surf)"/>
          <Input value="actor-00344" mono/>
          <span className="pill-mini">Saison</span>
          <div className="rep-row__act"><button>{Ico.edit({})}</button><button className="del">{Ico.trash({})}</button></div>
        </div>
      </div>
      <button className="rep-add">{Ico.plus({})} Ajouter un opérateur ou un guide</button>

      <Field label="Pratiques associées" hint="Toutes les disciplines exercées par le prestataire">
        <div className="chip-set">
          {['Surf','Bodyboard','Stand-up paddle','Kitesurf','Wing-foil','Snorkeling']
            .map((c, i) => <Chip key={i} label={c} on={i < 3}/>)}
          <Chip label="+ Ajouter"/>
        </div>
      </Field>

      <div className="chip-group__label" style={{ marginTop: 18 }}>Formules & sessions</div>
      <div style={{ display: 'grid', gridTemplateColumns: '14px 1.4fr 70px 110px 110px 70px 80px auto', gap: 8, padding: '6px 12px', fontSize: 10, fontWeight: 700, color: 'var(--ink-4)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
        <span/><span>Nom de la formule</span><span>Durée</span><span>Niveau</span><span>Public / âge</span><span>Max</span><span>Prix / pers.</span><span/>
      </div>
      <div className="repeater">
        {formulas.map((f, i) => (
          <div key={i} className="rep-row" style={{ gridTemplateColumns: '14px 1.4fr 70px 110px 110px 70px 80px auto' }}>
            <span className="rep-row__handle"/>
            <Input value={f.name}/>
            <Input value={f.dur} mono/>
            <Select value={f.lvl} options={['Débutant','Intermédiaire','Confirmé','Tous niveaux','Progressif','Sur mesure']}/>
            <Input value={f.age}/>
            <Input value={f.max} mono/>
            <Input value={f.price} mono suffix="€"/>
            <div className="rep-row__act"><button>{Ico.copy({})}</button><button className="del">{Ico.trash({})}</button></div>
          </div>
        ))}
      </div>
      <button className="rep-add">{Ico.plus({})} Ajouter une formule</button>

      <div className="chip-group__label" style={{ marginTop: 18 }}>Public &amp; niveau accueillis</div>
      <div className="aud-row">
        <div className="aud-row__lbl">Débutants <small>première séance / découverte</small></div>
        <div className="tri">
          <button className="is-on ok">Oui</button><button>Conditionnel</button><button>Non</button>
        </div>
      </div>
      <div className="aud-row">
        <div className="aud-row__lbl">Enfants <small>7+ ans, savoir nager</small></div>
        <div className="tri"><button>Oui</button><button className="is-on mid">Conditionnel</button><button>Non</button></div>
      </div>
      <div className="aud-row">
        <div className="aud-row__lbl">Groupes <small>jusqu'à 8 pers. par moniteur</small></div>
        <div className="tri"><button className="is-on ok">Oui</button><button>Conditionnel</button><button>Non</button></div>
      </div>
      <div className="aud-row">
        <div className="aud-row__lbl">Personnes à mobilité réduite</div>
        <div className="tri"><button>Oui</button><button>Conditionnel</button><button className="is-on no">Non</button></div>
      </div>

      <div className="chip-group__label" style={{ marginTop: 18 }}>Équipement &amp; sécurité fournis</div>
      <div className="chip-set">
        {['Planches mousse','Combinaisons toutes tailles','Vestiaires & douche','Casiers sécurisés','Matériel fourni','Brevet BPJEPS','Assurance RC incluse','Trousse de secours','Briefing sécurité','Encadrement diplômé']
          .map((c, i) => <Chip key={i} label={c} on={i < 7}/>)}
      </div>

      <div className="chip-group__label" style={{ marginTop: 18 }}>Conditions saisonnières</div>
      <SeasonPicker months={['','','','high','peak','peak','peak','peak','peak','high','','']}/>

      <div className="grid-3" style={{ marginTop: 14 }}>
        <Field label="Difficulté technique (1-5)">
          <div className="slider">
            <div className="slider__track"><div className="slider__thumb" style={{ left: '40%' }}/></div>
            <div className="slider__scale"><span>1</span><span>2</span><span>3</span><span>4</span><span>5</span></div>
          </div>
        </Field>
        <Field label="Annulation météo">
          <Select value="full" options={['Remboursement intégral','Report uniquement','Frais 30 %','Non remboursable']}/>
        </Field>
        <Field label="Réservation minimum">
          <Input value="J-1 à 18:00" mono/>
        </Field>
      </div>
    </Fs>
  );
}

/* =================== ITI : Itinéraire =================== */
function BlockITI() {
  const wps = [
    { num: 'D', name: 'Parking Bras-Sec',     km: '0.0', alt: '280' },
    { num: '2', name: 'Belvédère du Maïdo',   km: '1.8', alt: '540' },
    { num: '3', name: 'Premier bassin',        km: '3.4', alt: '720' },
    { num: '4', name: 'Gué du Trou Blanc',     km: '5.6', alt: '480' },
    { num: 'A', name: 'Retour parking',        km: '8.4', alt: '320' },
  ];
  return (
    <Fs num="05" title="Tracé, étapes & praticabilité"
        sub="GPX, distance, dénivelé, durée, balisage, type de boucle, waypoints, conditions et équipement"
        pill={{ tone: 'ok', label: 'Trace GPX importée' }}>

      <div className="grid-1-2" style={{ marginBottom: 14 }}>
        <div className="dropzone">
          <span className="ico">{Ico.layers({ width: 16, height: 16 })}</span>
          <strong>Déposer un fichier GPX ou KML</strong>
          <small>Le profil altimétrique et les KPI seront recalculés automatiquement</small>
        </div>
        <div className="grid-2-1" style={{ alignItems: 'center' }}>
          <div className="map-mini" style={{ minHeight: 150 }}>
            <svg viewBox="0 0 220 110" preserveAspectRatio="none" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}>
              <path d="M10,90 C 40,55 70,85 100,55 S 160,30 200,75" fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round"/>
              <circle cx="10" cy="90" r="4" fill="var(--green)" stroke="#fff" strokeWidth="1.5"/>
              <circle cx="200" cy="75" r="4" fill="var(--red)" stroke="#fff" strokeWidth="1.5"/>
            </svg>
          </div>
          <Field label="Type de tracé">
            <Select value="loop" options={[
              { v: 'loop', l: 'Boucle' },
              { v: 'ar', l: 'Aller-retour' },
              { v: 'simple', l: 'Aller simple' },
              { v: 'star', l: 'En étoile' },
            ]}/>
          </Field>
        </div>
      </div>

      <div className="grid-4" style={{ marginBottom: 14 }}>
        <StatCard label="Distance" value="8.4" suffix="km" hasStep/>
        <StatCard label="Durée a/r" value="4 h" hasStep/>
        <StatCard label="Dénivelé +" value="+560" suffix="m" hasStep/>
        <StatCard label="Dénivelé −" value="−560" suffix="m" hasStep/>
      </div>

      <div className="grid-3" style={{ marginBottom: 14 }}>
        <Field label="Difficulté (T1 → T6)" hint="Échelle SAC / FFRandonnée">
          <div className="slider">
            <div className="slider__track"><div className="slider__thumb" style={{ left: '55%' }}/></div>
            <div className="slider__scale"><span>T1</span><span>T2</span><span>T3</span><span>T4</span><span>T5</span><span>T6</span></div>
          </div>
        </Field>
        <Field label="Balisage">
          <Select value="yellow" options={[
            { v: 'yellow', l: 'Jaune (PR)' },
            { v: 'redwhite', l: 'Blanc-rouge (GR)' },
            { v: 'redyellow', l: 'Jaune-rouge (GRP)' },
            { v: 'unmarked', l: 'Non balisé' },
          ]}/>
        </Field>
        <Field label="Réseau">
          <ChipSet items={[{ label: 'GR® R2', on: true }, { label: 'PR', on: true }, { label: 'GRP' }, { label: 'VTT FFC' }]}/>
        </Field>
      </div>

      <Field label="Pratiques autorisées" hint="Plusieurs disciplines possibles">
        <div className="chip-set">
          {['Pédestre','Trail running','VTT','Équestre','Raquettes','Course d\'orientation']
            .map((c, i) => <Chip key={i} label={c} on={i < 2}/>)}
        </div>
      </Field>

      <div className="chip-group__label" style={{ marginTop: 16 }}>Étapes &amp; points d'intérêt sur le parcours</div>
      <div style={{ display: 'grid', gridTemplateColumns: '14px 28px 1fr 90px 80px auto', gap: 8, padding: '6px 12px', fontSize: 10, fontWeight: 700, color: 'var(--ink-4)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
        <span/><span/><span>Nom de l'étape</span><span>Km</span><span>Alt. m</span><span/>
      </div>
      <div className="repeater wp-rep">
        {wps.map((w, i) => (
          <div key={i} className="rep-row" style={{ gridTemplateColumns: '14px 28px 1fr 90px 80px auto' }}>
            <span className="rep-row__handle"/>
            <div className="wp-num">{w.num}</div>
            <Input value={w.name}/>
            <Input value={w.km} mono suffix="km"/>
            <Input value={w.alt} mono suffix="m"/>
            <div className="rep-row__act"><button>{Ico.edit({})}</button><button className="del">{Ico.trash({})}</button></div>
          </div>
        ))}
      </div>
      <button className="rep-add">{Ico.plus({})} Ajouter une étape / un POI</button>

      <div className="chip-group__label" style={{ marginTop: 18 }}>Conditions &amp; équipement recommandé</div>
      <div className="chip-set">
        {['Chaussures montantes','Bâtons','1.5 L d\'eau min','Crème solaire','Vêtement chaud','Lampe frontale','GPS / topo','Téléphone chargé']
          .map((c, i) => <Chip key={i} label={c} on={i < 6}/>)}
      </div>

      <div className="chip-group__label" style={{ marginTop: 18 }}>Praticabilité saisonnière</div>
      <SeasonPicker months={['','','','high','peak','peak','peak','peak','peak','high','closed','closed']}/>
      <Field label="Note de fermeture saisonnière" hint="Affiché en bandeau quand le sentier est fermé">
        <Input value="Sentier régulièrement fermé en saison cyclonique (déc-jan)"/>
      </Field>
    </Fs>
  );
}

/* =================== VIS : Site & visite =================== */
function BlockVIS() {
  const tariffs = [
    { lbl: 'Entrée individuelle', val: 'Gratuit · don libre' },
    { lbl: 'Visite guidée (1h)', val: '5 € / pers.' },
    { lbl: 'Audioguide (FR · EN · DE · CRE)', val: '3 € / appareil' },
    { lbl: 'Groupe scolaire (par classe)', val: '30 €' },
    { lbl: 'Groupe adulte (10+ pers.)', val: '3 € / pers.' },
  ];
  const haute = [
    { d: 'Lun', lbl: 'lundi', on: false, a: null, b: null },
    { d: 'Mar', lbl: 'mardi', on: true, a: ['09:00','18:00'], b: ['09:30','17:00'] },
    { d: 'Mer', lbl: 'mercredi', on: true, a: ['09:00','18:00'], b: ['09:30','17:00'] },
    { d: 'Jeu', lbl: 'jeudi', on: true, a: ['09:00','18:00'], b: ['09:30','17:00'] },
    { d: 'Ven', lbl: 'vendredi', on: true, a: ['09:00','18:00'], b: ['09:30','17:00'] },
    { d: 'Sam', lbl: 'samedi', on: true, a: ['09:00','19:00'], b: ['09:30','18:00'] },
    { d: 'Dim', lbl: 'dimanche', on: true, a: ['14:00','18:00'], b: ['14:00','17:00'] },
  ];
  return (
    <Fs num="05" title="Visite, médiation & accessibilité"
        sub="Sous-type patrimonial, période historique, modes de visite, tarifs, horaires basse/haute saison, publics"
        pill={{ tone: 'ok', label: 'Médiation active' }}>

      <div className="grid-3" style={{ marginBottom: 14 }}>
        <Field label="Sous-type (LOI · PCU · PNA)">
          <Select value="pcu_religious" options={[
            { v: 'pcu_religious', l: 'PCU · Patrimoine religieux' },
            { v: 'pcu_industrial', l: 'PCU · Patrimoine industriel' },
            { v: 'pcu_agricole', l: 'PCU · Patrimoine agricole' },
            { v: 'loi_art', l: 'LOI · Art / création' },
            { v: 'loi_artisanat', l: 'LOI · Artisanat' },
            { v: 'pna_site', l: 'PNA · Site naturel' },
          ]}/>
        </Field>
        <Field label="Période historique"><Input value="XIXe (1841 – 1869)"/></Field>
        <Field label="Statut juridique du site">
          <ChipSet items={[
            { label: 'Monument historique', on: true },
            { label: 'Site classé' },
            { label: 'Site inscrit', on: true },
            { label: 'UNESCO' },
          ]}/>
        </Field>
      </div>

      <div className="chip-group__label">Modes de visite proposés</div>
      <div className="grid-3" style={{ marginBottom: 10 }}>
        <Toggle label="Visite libre" sub="Livret FR/EN distribué à l'entrée" on/>
        <Toggle label="Visite guidée" sub="Mercredi & samedi 10h00" on/>
        <Toggle label="Audioguide" sub="4 langues — 3 €/appareil" on/>
      </div>
      <div className="grid-3">
        <Toggle label="Visite scolaire" sub="Sur réservation · adapté primaire / collège" on/>
        <Toggle label="Médiateur sur place" sub="Réponse aux questions" on/>
        <Toggle label="Application mobile" sub="QR codes à découvrir"/>
      </div>

      <Field label="Durée moyenne de visite" hint="Hors visite guidée">
        <div className="grid-2">
          <Input value="30" mono suffix="min" prefix="min"/>
          <Input value="45" mono suffix="min" prefix="max"/>
        </div>
      </Field>

      <div className="chip-group__label" style={{ marginTop: 16 }}>Tarifs</div>
      <div className="repeater">
        {tariffs.map((t, i) => (
          <div key={i} className="rep-row" style={{ gridTemplateColumns: '14px 1.6fr 1fr 80px auto' }}>
            <span className="rep-row__handle"/>
            <Input value={t.lbl}/>
            <Input value={t.val}/>
            <Select value="eur" options={['EUR','% remise','Gratuit']}/>
            <div className="rep-row__act"><button className="del">{Ico.trash({})}</button></div>
          </div>
        ))}
      </div>
      <button className="rep-add">{Ico.plus({})} Ajouter une ligne tarifaire</button>

      <div className="chip-group__label" style={{ marginTop: 18 }}>Horaires haute saison <span style={{ color: 'var(--ink-4)', fontWeight: 500, textTransform: 'none', letterSpacing: 0 }}>· 1er juin → 31 octobre</span></div>
      <ScheduleEditor rows={haute} colA="Matin / journée" colB="Après-midi"/>

      <div className="chip-group__label" style={{ marginTop: 18 }}>Public &amp; accessibilité</div>
      <div className="aud-row">
        <div className="aud-row__lbl">Familles</div>
        <div className="tri"><button className="is-on ok">Oui</button><button>Conditionnel</button><button>Non</button></div>
      </div>
      <div className="aud-row">
        <div className="aud-row__lbl">Scolaires <small>sur réservation</small></div>
        <div className="tri"><button className="is-on ok">Oui</button><button>Conditionnel</button><button>Non</button></div>
      </div>
      <div className="aud-row">
        <div className="aud-row__lbl">Personnes à mobilité réduite <small>rampe d'accès, comptoir abaissé</small></div>
        <div className="tri"><button>Oui</button><button className="is-on mid">Conditionnel</button><button>Non</button></div>
      </div>
      <div className="aud-row">
        <div className="aud-row__lbl">Malentendants <small>boucle magnétique, audio amplifié</small></div>
        <div className="tri"><button className="is-on ok">Oui</button><button>Conditionnel</button><button>Non</button></div>
      </div>
      <div className="aud-row">
        <div className="aud-row__lbl">Animaux</div>
        <div className="tri"><button>Oui</button><button>Conditionnel</button><button className="is-on no">Non</button></div>
      </div>
    </Fs>
  );
}

/* =================== SRV : Service & commerce =================== */
function BlockSRV() {
  const prestations = [
    { ic: 'inbox', name: 'Information touristique', sub: 'Conseils personnalisés, brochures, cartes du territoire' },
    { ic: 'bag',   name: 'Billetterie & réservation', sub: 'Excursions, activités, transferts, hébergements' },
    { ic: 'globe', name: 'Boutique péi', sub: 'Produits locaux, livres, vêtements, souvenirs labellisés' },
    { ic: 'mail',  name: 'Bureau d\'accueil presse', sub: 'Sur rendez-vous · pro@otsud.re' },
    { ic: 'phone', name: 'Centrale d\'appel', sub: 'Numéro unique 0262 39 00 00 · 7j/7 en saison' },
    { ic: 'layers',name: 'Pass touristique Sud Sauvage', sub: 'Délivrance, recharge, info adhérents' },
  ];
  const haute = [
    { d: 'Lun', lbl: 'lundi', on: true, a: ['08:30','18:00'], b: ['09:00','17:00'] },
    { d: 'Mar', lbl: 'mardi', on: true, a: ['08:30','18:00'], b: ['09:00','17:00'] },
    { d: 'Mer', lbl: 'mercredi', on: true, a: ['08:30','18:00'], b: ['09:00','17:00'] },
    { d: 'Jeu', lbl: 'jeudi', on: true, a: ['08:30','18:00'], b: ['09:00','17:00'] },
    { d: 'Ven', lbl: 'vendredi', on: true, a: ['08:30','18:00'], b: ['09:00','17:00'] },
    { d: 'Sam', lbl: 'samedi', on: true, a: ['09:00','17:00'], b: ['09:00','13:00'] },
    { d: 'Dim', lbl: 'dimanche', on: true, a: ['09:00','13:00'], b: null },
  ];
  return (
    <Fs num="05" title="Prestations &amp; zone d'intervention"
        sub="Sous-type (PSV · SRV · COM · VIL), prestations délivrées au comptoir, communes desservies, horaires saisonniers"
        pill={{ tone: 'ok', label: '6 prestations · 5 communes' }}>

      <div className="grid-3" style={{ marginBottom: 14 }}>
        <Field label="Sous-type (PSV · SRV · COM · VIL)">
          <Select value="psv_oti" options={[
            { v: 'psv_oti', l: 'PSV · Office de tourisme' },
            { v: 'srv_pro', l: 'SRV · Service professionnel' },
            { v: 'com_shop', l: 'COM · Commerce / boutique' },
            { v: 'com_souvenir', l: 'COM · Boutique souvenir' },
            { v: 'vil_office', l: 'VIL · Service municipal' },
          ]}/>
        </Field>
        <Field label="Portée géographique">
          <Select value="intercom" options={['Communal','Intercommunal','Régional','National']}/>
        </Field>
        <Field label="Rendez-vous obligatoire">
          <Select value="no" options={['Non — accueil libre','Oui — uniquement sur RDV','Mixte']}/>
        </Field>
      </div>

      <div className="chip-group__label">Prestations délivrées</div>
      <div className="repeater">
        {prestations.map((p, i) => (
          <div key={i} className="rep-row" style={{ gridTemplateColumns: '14px 30px 1fr 1fr 100px auto' }}>
            <span className="rep-row__handle"/>
            <div className="sync-row__src" style={{ background: 'var(--accent-tint)', color: 'var(--accent-deep)' }}>
              {Ico[p.ic] && Ico[p.ic]({ width: 14, height: 14 })}
            </div>
            <Input value={p.name}/>
            <Input value={p.sub} placeholder="Description courte affichée dans la fiche"/>
            <Select value="free" options={['Gratuit','Payant','Sur devis','Adhérent']}/>
            <div className="rep-row__act"><button>{Ico.edit({})}</button><button className="del">{Ico.trash({})}</button></div>
          </div>
        ))}
      </div>
      <button className="rep-add">{Ico.plus({})} Ajouter une prestation</button>

      <div className="chip-group__label" style={{ marginTop: 18 }}>Zone d'intervention</div>
      <Field label="Communes desservies" hint="Pour les services intercommunaux. Filtre les recherches Explorer.">
        <div className="chip-set">
          {['Saint-Pierre','Le Tampon','Petite-Île','Saint-Joseph','L\'Entre-Deux','Cilaos','Saint-Philippe','Sud Sauvage']
            .map((c, i) => <Chip key={i} label={c} on={i < 5} icon="check"/>)}
          <Chip label="+ Commune"/>
        </div>
      </Field>

      <div className="chip-group__label" style={{ marginTop: 18 }}>Langues parlées au comptoir</div>
      <div className="chip-set">
        {['Français','Créole réunionnais','Anglais','Allemand','Espagnol','Italien','Chinois (sur RDV)','Langue des signes']
          .map((l, i) => <Chip key={i} label={l} on={i < 4} icon={i < 4 ? 'check' : null}/>)}
      </div>

      <div className="chip-group__label" style={{ marginTop: 18 }}>Horaires d'accueil — haute saison <span style={{ color: 'var(--ink-4)', fontWeight: 500, textTransform: 'none', letterSpacing: 0 }}>· juil-août, dec-janv</span></div>
      <ScheduleEditor rows={haute} colA="Saison" colB="Hors saison"/>
    </Fs>
  );
}

window.EditBlocks = { BlockHEB, BlockRES, BlockASC, BlockITI, BlockVIS, BlockSRV };
