/* global React, Ico, EditPrim */
/* edit-classification.jsx — proper object_classification editor + tags layer.

   object_classification rows = (scheme_id, value_id, status, awarded_at,
   valid_until, reference_no, awarding_body). Distinct from object_taxonomy
   (sous-catégorie métier) and from object_sustainability_action (déclarations).

   Tags layer = the colored display chips that appear on every card and at
   the top of the detail page. Each tag has a code, a color variant
   (teal · orange · neutral · outline · green) and a display priority.
*/

const { Fs, Field, Input, Textarea, Select, Chip, ChipSet, Toggle } = window.EditPrim;

/* =================== CLASSIFICATION =================== */

// Per-type default classification rows. Each row covers a real ref_classification_scheme.
const CLASSIFICATION_DATA = {
  HEB: [
    { sch: 'Étoiles Hôtel · Atout France', val: '★★★★ — 4 étoiles', status: 'granted', from: '12/04/2023', to: '11/04/2028', ref: 'AT-7724', body: 'Atout France' },
    { sch: 'Tourisme & Handicap',          val: 'Visuel + Mental',     status: 'granted', from: '03/03/2024', to: '02/03/2029', ref: 'TH-29011', body: 'DGE' },
    { sch: 'Clef Verte',                   val: 'Certifié 2025',       status: 'granted', from: '01/01/2025', to: '31/12/2025', ref: 'CV-2025-417', body: 'Teragir' },
    { sch: 'Qualité Tourisme™',            val: 'Marque accordée',     status: 'granted', from: '20/06/2022', to: '19/06/2025', ref: 'QT-19034', body: 'Atout France' },
    { sch: 'Maître Restaurateur',          val: 'Restaurant gastronomique', status: 'pending', from: '—', to: '—', ref: 'demande 04/2026', body: 'AFMR' },
    { sch: 'Écolabel européen',            val: '—',                   status: 'none',    from: '—',          to: '—',          ref: '—', body: 'AFNOR' },
  ],
  RES: [
    { sch: 'Maître Restaurateur',          val: 'Titre accordé',       status: 'granted', from: '14/11/2019', to: '13/11/2027', ref: 'AFMR-3014', body: 'AFMR' },
    { sch: 'Qualité Tourisme™',            val: 'Marque accordée',     status: 'granted', from: '08/10/2023', to: '07/10/2026', ref: 'QT-22118', body: 'Atout France' },
    { sch: 'Restaurateur Indépendant',     val: 'Adhérent',            status: 'granted', from: '01/01/2024', to: '31/12/2026', ref: 'GNI-118', body: 'GNI' },
    { sch: 'Tourisme & Handicap',          val: 'Visuel',              status: 'granted', from: '15/05/2024', to: '14/05/2029', ref: 'TH-29401', body: 'DGE' },
    { sch: 'Toques Blanches Réunion',      val: 'Membre',              status: 'granted', from: '01/06/2020', to: '—',           ref: 'TB-44',     body: 'TBR' },
    { sch: 'Guide Michelin',               val: '—',                   status: 'none',    from: '—',          to: '—',          ref: '—',         body: 'Michelin' },
    { sch: 'Bib Gourmand',                 val: '—',                   status: 'none',    from: '—',          to: '—',          ref: '—',         body: 'Michelin' },
  ],
  ASC: [
    { sch: 'École labellisée FFS',         val: 'Label école française',status: 'granted', from: '01/09/2022', to: '31/08/2027', ref: 'FFS-EC-118', body: 'Fédération Française de Surf' },
    { sch: 'Qualité Tourisme™',            val: 'En cours d\'audit',   status: 'pending', from: '—',          to: '—',          ref: 'demande 03/2026', body: 'Atout France' },
    { sch: 'Marque "Esprit Parc National"',val: '—',                   status: 'none',    from: '—',          to: '—',          ref: '—', body: 'Parc national' },
    { sch: 'Tourisme & Handicap',          val: '—',                   status: 'expired', from: '12/12/2018', to: '11/12/2023', ref: 'TH-19000', body: 'DGE' },
  ],
  ITI: [
    { sch: 'Balisage GR® R2',              val: 'Tronçon partiel',     status: 'granted', from: '01/01/2010', to: '—',          ref: 'GR-R2-T17', body: 'FFRandonnée' },
    { sch: 'Itinéraire PR balisé',         val: 'Boucle pédestre',     status: 'granted', from: '14/03/2017', to: '13/03/2027', ref: 'PR-974-0073', body: 'CDRP 974' },
    { sch: 'Marque "Esprit Parc National"',val: 'Compatible cœur de parc', status: 'granted', from: '08/06/2021', to: '07/06/2026', ref: 'EPN-974-008', body: 'Parc national de La Réunion' },
  ],
  VIS: [
    { sch: 'Monument Historique',          val: 'Classement (1995)',   status: 'granted', from: '12/06/1995', to: '—',           ref: 'MH-PA-974-000017', body: 'Ministère de la Culture' },
    { sch: 'Maisons des Illustres',        val: '—',                   status: 'none',    from: '—',          to: '—',          ref: '—', body: 'Ministère de la Culture' },
    { sch: 'Famille Plus',                 val: 'Marque accordée',     status: 'granted', from: '03/03/2022', to: '02/03/2027', ref: 'FP-974-12', body: 'ANMSM' },
    { sch: 'Tourisme & Handicap',          val: 'Mental',              status: 'granted', from: '10/10/2022', to: '09/10/2027', ref: 'TH-22001', body: 'DGE' },
    { sch: 'Qualité Tourisme™',            val: '—',                   status: 'none',    from: '—',          to: '—',          ref: '—',         body: 'Atout France' },
  ],
  SRV: [
    { sch: 'Catégorie Office de Tourisme', val: 'Catégorie I',         status: 'granted', from: '01/01/2024', to: '31/12/2028', ref: 'CAT-I-974-Sud', body: 'Préfecture de La Réunion' },
    { sch: 'Qualité Tourisme™',            val: 'Marque accordée',     status: 'granted', from: '15/02/2024', to: '14/02/2027', ref: 'QT-OT-419', body: 'Atout France' },
    { sch: 'Tourisme & Handicap',          val: 'Visuel + Mental + Moteur', status: 'granted', from: '06/04/2023', to: '05/04/2028', ref: 'TH-OT-009', body: 'DGE' },
    { sch: 'Destination Internationale',   val: 'Label en cours',      status: 'pending', from: '—', to: '—', ref: 'demande 01/2026', body: 'Atout France' },
  ],
};

function ClassRow({ row, i, total }) {
  return (
    <div className="rep-row class-row" style={{ gridTemplateColumns: '14px 1.4fr 1.2fr 110px 95px 95px 1fr 110px auto', alignItems: 'center' }}>
      <span className="rep-row__handle"/>
      <div className="class-row__sch">
        <div className="class-row__scheme">{row.sch}</div>
        <small>{row.body}</small>
      </div>
      <Input value={row.val === '—' ? '' : row.val} placeholder="Valeur / niveau attribué…"/>
      <Select value={row.status} options={[
        { v: 'granted', l: '🟢 Accordé' },
        { v: 'pending', l: '🟡 En cours' },
        { v: 'expired', l: '🔴 Expiré' },
        { v: 'revoked', l: '⚫ Retiré' },
        { v: 'none',    l: '○ Non concerné' },
      ]}/>
      <Input value={row.from === '—' ? '' : row.from} mono placeholder="JJ/MM/AAAA"/>
      <Input value={row.to === '—' ? '' : row.to} mono placeholder="JJ/MM/AAAA"/>
      <Input value={row.ref === '—' ? '' : row.ref} mono placeholder="Numéro / référence"/>
      <Select value="att" options={[
        { v: 'att', l: 'Attestation PDF' },
        { v: 'arr', l: 'Arrêté préfectoral' },
        { v: 'pho', l: 'Photo plaque' },
        { v: 'non', l: 'Aucun justificatif' },
      ]}/>
      <div className="rep-row__act">
        <button title="Renouveler">{Ico.copy({})}</button>
        <button className="del">{Ico.trash({})}</button>
      </div>
    </div>
  );
}

function SectionClassification({ typeCode }) {
  const rows = CLASSIFICATION_DATA[typeCode] || CLASSIFICATION_DATA.HEB;
  const granted = rows.filter(r => r.status === 'granted').length;
  const pending = rows.filter(r => r.status === 'pending').length;
  const expired = rows.filter(r => r.status === 'expired').length;
  const next = rows.filter(r => r.to && r.to !== '—').sort((a, b) => a.to.split('/').reverse().join('') > b.to.split('/').reverse().join('') ? 1 : -1)[0];

  return (
    <Fs num="08" title="Classifications & distinctions" sub="object_classification — étoiles, labels, marques. Chaque ligne a son scheme, sa value, son statut, et ses dates de validité." pill={{ tone: 'ok', label: `${granted} accordées · ${pending} en cours` }}>

      <div className="grid-4" style={{ marginBottom: 14 }}>
        <div className="class-kpi class-kpi--ok">
          <div className="class-kpi__num">{granted}</div>
          <div className="class-kpi__lbl">Accordées</div>
        </div>
        <div className="class-kpi class-kpi--warn">
          <div className="class-kpi__num">{pending}</div>
          <div className="class-kpi__lbl">En cours / demande</div>
        </div>
        <div className="class-kpi class-kpi--red">
          <div className="class-kpi__num">{expired}</div>
          <div className="class-kpi__lbl">Expirées · à renouveler</div>
        </div>
        <div className="class-kpi">
          <div className="class-kpi__num" style={{ fontSize: 14, fontFamily: 'var(--font-mono)' }}>{next ? next.to : '—'}</div>
          <div className="class-kpi__lbl">Prochaine échéance</div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '14px 1.4fr 1.2fr 110px 95px 95px 1fr 110px auto', gap: 8, padding: '6px 12px', fontSize: 10, fontWeight: 700, color: 'var(--ink-4)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
        <span/><span>Référentiel (scheme)</span><span>Valeur attribuée</span><span>Statut</span><span>Acquis le</span><span>Valable jusqu'au</span><span>Réf · n°</span><span>Justificatif</span><span/>
      </div>
      <div className="repeater">
        {rows.map((row, i) => <ClassRow key={i} row={row} i={i} total={rows.length}/>)}
      </div>
      <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
        <button className="rep-add" style={{ marginTop: 0 }}>{Ico.plus({})} Ajouter un référentiel</button>
        <button className="rep-add" style={{ marginTop: 0 }}>{Ico.download({})} Importer depuis Atout France</button>
        <button className="rep-add" style={{ marginTop: 0 }}>{Ico.mail({})} Demander une auto-évaluation</button>
      </div>

      <div className="chip-group__label" style={{ marginTop: 18 }}>Référentiels disponibles · non encore renseignés</div>
      <div className="chip-set">
        {['Pavillon Bleu','Vignobles & Découvertes','Accueil Vélo','Petites Cités de Caractère','Gîtes de France · épis','Clévacances · clés','Logis de France']
          .map((s, i) => <Chip key={i} label={s} sm/>)}
      </div>

      <p style={{ fontSize: 11, color: 'var(--ink-4)', margin: '14px 0 0' }}>
        Les chips ci-dessus ne créent pas la classification — elles ouvrent l'éditeur de référentiel correspondant.
        Une marque devient « équivalente » seulement après validation par l'organisme attributaire.
      </p>
    </Fs>
  );
}

/* =================== TAGS & ÉTIQUETTES =================== */

/* The tag pool — what's pickable; per object you select a subset and assign
   color variants + priority. Mirrors the colored tags shown on the read cards. */
const TAG_POOL = {
  thematic: [
    'Cuisine', 'Bien-être', 'Patrimoine', 'Plein air', 'Mer & littoral',
    'Eaux vives', 'Famille', 'Atelier', 'Boutique', 'Site naturel',
    'Sport', 'Culture', 'Artisanat', 'Terroir', 'Festif',
  ],
  audience: [
    'Famille', 'Couple', 'Groupe', 'Solo', 'Tribu / amis',
    'Pro / séminaire', 'Scolaires', 'Tribu sportive',
  ],
  ambience: [
    'Vue mer', 'Vue montagne', 'Calme', 'Authentique', 'Moderne',
    'Coup de cœur', 'Cosy', 'Romantique', 'Festif',
  ],
  badges: [
    'Sélection 2026', 'Nouveau', 'Coup de cœur OTI', 'Best of péi',
    'Lauréat 2025', 'Soutien aux producteurs locaux',
  ],
};

/* Display priority per object — 4 chips that show on the result card. */
const TAG_DISPLAY = {
  HEB: [
    ['Hôtel 4★', 'orange', 'classification'],
    ['Cuisine', 'teal', 'thematic'],
    ['Bien-être', 'teal', 'thematic'],
    ['Séminaire', 'neutral', 'audience'],
    ['Tourisme & Handicap', 'outline', 'classification'],
  ],
  RES: [
    ['Cuisine créole', 'orange', 'thematic'],
    ['Fait maison', 'teal', 'badges'],
    ['Terrasse vue mer', 'teal', 'ambience'],
    ['Maître Restaurateur', 'outline', 'classification'],
    ['Groupes', 'neutral', 'audience'],
  ],
  ASC: [
    ['Surf', 'teal', 'thematic'],
    ['Mer & littoral', 'teal', 'thematic'],
    ['Tous niveaux', 'neutral', 'audience'],
    ['FFS · École labellisée', 'outline', 'classification'],
    ['Plein air', 'orange', 'thematic'],
  ],
  ITI: [
    ['Boucle', 'teal', 'thematic'],
    ['Difficile', 'orange', 'thematic'],
    ['Pédestre', 'teal', 'thematic'],
    ['Patrimoine', 'neutral', 'thematic'],
    ['Eaux vives', 'outline', 'thematic'],
  ],
  VIS: [
    ['Patrimoine', 'teal', 'thematic'],
    ['Architecture', 'teal', 'thematic'],
    ['Site classé', 'orange', 'classification'],
    ['Gratuit', 'neutral', 'badges'],
    ['PMR accessible', 'outline', 'classification'],
  ],
  SRV: [
    ['Service public', 'teal', 'thematic'],
    ['Information touristique', 'teal', 'thematic'],
    ['Billetterie', 'neutral', 'thematic'],
    ['Qualité Tourisme™', 'outline', 'classification'],
    ['Multilingue', 'orange', 'badges'],
  ],
};

const COLOR_VARIANTS = [
  { v: 'teal',    sw: '#176b6a',           lbl: 'Teal · principal' },
  { v: 'orange',  sw: '#c96d3b',           lbl: 'Orange · accroche' },
  { v: 'neutral', sw: 'var(--surface-2)',  lbl: 'Neutre',           dark: true },
  { v: 'outline', sw: 'transparent',       lbl: 'Outline · sobre',  border: true },
  { v: 'green',   sw: '#2ca36f',           lbl: 'Vert · statut' },
];

function TagPreviewCard({ tags }) {
  return (
    <div className="tag-preview">
      <div className="tag-preview__head">
        <strong>Aperçu carte</strong>
        <span style={{ fontSize: 10.5, color: 'var(--ink-4)' }}>tel qu'affiché dans l'Explorer</span>
      </div>
      <div className="tag-preview__card">
        <div className="tag-preview__img"/>
        <div className="tag-preview__body">
          <div className="tag-preview__title">Domaine du Bel Air</div>
          <div className="tag-preview__sub">Hôtel 4★ · L'Entre-Deux · Bras-Long</div>
          <div className="tag-preview__tags">
            {tags.slice(0, 4).map(([label, tone], i) => (
              <span key={i} className={`tag ${tone}`}>{label}</span>
            ))}
            {tags.length > 4 && <span className="tag outline">+{tags.length - 4}</span>}
          </div>
        </div>
      </div>
    </div>
  );
}

function SectionTags({ typeCode }) {
  const displayed = TAG_DISPLAY[typeCode] || TAG_DISPLAY.HEB;

  return (
    <Fs num="09" title="Tags & étiquettes" sub="Couche d'affichage colorée — apparaît sur la carte Explorer et en tête de fiche. Distincte de la taxonomie métier et des classifications." pill={{ tone: 'ok', label: `${displayed.length} affichées` }}>

      <div className="grid-2-1" style={{ marginBottom: 18 }}>
        <div>
          <div className="chip-group__label" style={{ marginTop: 0 }}>Tags affichés en priorité <span style={{ color: 'var(--ink-4)', fontWeight: 500, textTransform: 'none', letterSpacing: 0 }}>(ordre = priorité)</span></div>
          <div style={{ display: 'grid', gridTemplateColumns: '14px 1fr 150px 130px auto', gap: 6, padding: '6px 12px', fontSize: 10, fontWeight: 700, color: 'var(--ink-4)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
            <span/><span>Libellé affiché</span><span>Variante couleur</span><span>Source</span><span/>
          </div>
          <div className="repeater">
            {displayed.map((tag, i) => (
              <div key={i} className="rep-row" style={{ gridTemplateColumns: '14px 1fr 150px 130px auto', alignItems: 'center' }}>
                <span className="rep-row__handle"/>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span className={`tag ${tag[1]}`} style={{ flex: 'none' }}>{tag[0]}</span>
                  <Input value={tag[0]}/>
                </div>
                <Select value={tag[1]} options={COLOR_VARIANTS.map(c => ({ v: c.v, l: c.lbl }))}/>
                <Select value={tag[2]} options={[
                  { v: 'thematic',       l: 'Thématique' },
                  { v: 'audience',       l: 'Public' },
                  { v: 'ambience',       l: 'Ambiance' },
                  { v: 'badges',         l: 'Badge éditorial' },
                  { v: 'classification', l: 'Auto · classification' },
                  { v: 'taxo',           l: 'Auto · taxonomie' },
                ]}/>
                <div className="rep-row__act">
                  <button title="Monter">{Ico.caret({ style: { transform: 'rotate(-90deg)' }, width: 12, height: 12 })}</button>
                  <button title="Descendre">{Ico.caret({ style: { transform: 'rotate(90deg)' }, width: 12, height: 12 })}</button>
                  <button className="del">{Ico.trash({})}</button>
                </div>
              </div>
            ))}
          </div>
          <button className="rep-add">{Ico.plus({})} Ajouter un tag</button>
        </div>

        <TagPreviewCard tags={displayed}/>
      </div>

      <div className="chip-group__label" style={{ marginTop: 0 }}>Bibliothèque · Thématiques</div>
      <div className="chip-set">
        {TAG_POOL.thematic.map((c, i) => (
          <Chip key={i} label={c} on={displayed.some(d => d[0] === c)} icon={displayed.some(d => d[0] === c) ? 'check' : null}/>
        ))}
      </div>

      <div className="chip-group__label" style={{ marginTop: 14 }}>Bibliothèque · Public cible</div>
      <div className="chip-set">
        {TAG_POOL.audience.map((c, i) => <Chip key={i} label={c} on={displayed.some(d => d[0] === c)} icon={displayed.some(d => d[0] === c) ? 'check' : null}/>)}
      </div>

      <div className="chip-group__label" style={{ marginTop: 14 }}>Bibliothèque · Ambiance</div>
      <div className="chip-set">
        {TAG_POOL.ambience.map((c, i) => <Chip key={i} label={c} on={displayed.some(d => d[0] === c)} icon={displayed.some(d => d[0] === c) ? 'check' : null}/>)}
      </div>

      <div className="chip-group__label" style={{ marginTop: 14 }}>Bibliothèque · Badges éditoriaux <span style={{ color: 'var(--ink-4)', fontWeight: 500, textTransform: 'none', letterSpacing: 0 }}>(attribués par l'OTI)</span></div>
      <div className="chip-set">
        {TAG_POOL.badges.map((c, i) => <Chip key={i} label={c} on={displayed.some(d => d[0] === c)} icon={displayed.some(d => d[0] === c) ? 'check' : null}/>)}
      </div>

      <div className="chip-group__label" style={{ marginTop: 18 }}>Tags auto-générés <span style={{ color: 'var(--ink-4)', fontWeight: 500, textTransform: 'none', letterSpacing: 0 }}>(dérivés de classification + taxonomie · lecture seule)</span></div>
      <div className="chip-set">
        <span className="tag outline">{Ico.layers({ width: 12, height: 12 })} Hôtel 4★ <em style={{ marginLeft: 4, color: 'var(--ink-4)', fontStyle: 'normal' }}>← classification</em></span>
        <span className="tag outline">{Ico.layers({ width: 12, height: 12 })} Hôtel boutique <em style={{ marginLeft: 4, color: 'var(--ink-4)', fontStyle: 'normal' }}>← taxonomy_hot</em></span>
        <span className="tag outline">{Ico.layers({ width: 12, height: 12 })} Tourisme & Handicap <em style={{ marginLeft: 4, color: 'var(--ink-4)', fontStyle: 'normal' }}>← classification</em></span>
      </div>
    </Fs>
  );
}

window.EditClass = { SectionClassification, SectionTags };
