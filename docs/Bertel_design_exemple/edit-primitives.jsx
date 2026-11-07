/* global React, Ico */
/* edit-primitives.jsx — shared input primitives + universal edit sections
   Universal sections (apply to every object type):
     Identité · Descriptions · Localisation · Contacts · Médias · Labels & capacité
     Paiements & langues · Fournisseur · Distribution · Rattachements · Publication · Sync
*/

const { useState: useStateE } = React;

/* ModeCtx is created here so every section file sees the same context object.
   EditPage wraps everything with <window.ModeCtx.Provider value={mode}>. */
window.ModeCtx = window.ModeCtx || React.createContext('complet');
const MODE_ESSENTIAL = ['01','02','03','04','05','13','14','21'];

/* ============================ Field primitives ============================ */
function Field({ label, hint, required, locked, children }) {
  return (
    <div className="field">
      <div className="field__label">
        <span>{label}{required && <span className="req"> *</span>}</span>
        {hint && <span className="help" title={hint}>?</span>}
        {locked && (
          <span className="lock">
            <span className="avatar">{locked}</span> verrouillé
          </span>
        )}
      </div>
      {children}
    </div>
  );
}

function Input({ value, placeholder, prefix, suffix, mono, lg }) {
  if (prefix || suffix) {
    return (
      <div className="input-wrap">
        {prefix && <span className="prefix">{prefix}</span>}
        <input
          className={`input ${mono ? 'mono' : ''} ${lg ? 'lg' : ''} ${prefix ? 'has-prefix' : ''} ${suffix ? 'has-suffix' : ''}`}
          defaultValue={value}
          placeholder={placeholder}
        />
        {suffix && <span className="suffix">{suffix}</span>}
      </div>
    );
  }
  return <input className={`input ${mono ? 'mono' : ''} ${lg ? 'lg' : ''}`} defaultValue={value} placeholder={placeholder}/>;
}

function Textarea({ value, placeholder, rows, rich, count, max = 300 }) {
  return (
    <>
      <textarea
        className={`textarea ${rich ? 'rich' : ''}`}
        defaultValue={value}
        placeholder={placeholder}
        style={rows ? { minHeight: rows * 18 } : null}
      />
      {count != null && (
        <div className={`char-count ${count > max ? 'over' : ''}`}>{count} / {max} caractères</div>
      )}
    </>
  );
}

function Select({ value, options }) {
  return (
    <select className="select" defaultValue={value}>
      {options.map((o, i) => <option key={i} value={typeof o === 'string' ? o : o.v}>{typeof o === 'string' ? o : o.l}</option>)}
    </select>
  );
}

function Chip({ label, on, icon, sm }) {
  return (
    <span className={`chip ${on ? 'is-on' : ''} ${sm ? 'size-sm' : ''}`}>
      {icon && Ico[icon] && Ico[icon]({ width: 12, height: 12 })}
      {label}
    </span>
  );
}

function ChipSet({ items }) {
  return (
    <div className="chip-set">
      {items.map((c, i) => <Chip key={i} {...c}/>)}
    </div>
  );
}

function Toggle({ label, sub, on }) {
  return (
    <div className={`tog ${on ? 'is-on' : ''}`}>
      <div>
        {label}
        {sub && <small>{sub}</small>}
      </div>
      <span className="tog__sw"/>
    </div>
  );
}

function StatCard({ label, value, suffix, hasStep }) {
  return (
    <div className="stat-card">
      <div className="stat-card__label">{label}</div>
      <div className="stat-card__row">
        <span className="stat-card__value">{value}{suffix && <small className="stat-card__suffix"> {suffix}</small>}</span>
        {hasStep && (
          <div className="stat-card__step">
            <button>{Ico.minus({ width: 12, height: 12 })}</button>
            <button>{Ico.plus({ width: 12, height: 12 })}</button>
          </div>
        )}
      </div>
    </div>
  );
}

function FsHead({ num, title, sub, pill, action }) {
  return (
    <div className="fs__head">
      <span className="fs__num">{num}</span>
      <h3>{title}{sub && <small>{sub}</small>}</h3>
      <div className="meta">
        {pill && <span className={`fs-pill ${pill.tone || 'ok'}`}>{pill.label}</span>}
        {action || <button className="icbtn" title="Replier">{Ico.chev({})}</button>}
      </div>
    </div>
  );
}

function Fs({ num, title, sub, pill, children, folded, alwaysOpen }) {
  const mode = React.useContext(window.ModeCtx);
  const autoFolded = mode === 'rapide' && !MODE_ESSENTIAL.includes(num) && !alwaysOpen;
  if (folded || autoFolded) {
    return (
      <div className={`fs ${autoFolded ? 'fs--rapide-folded' : 'fs--folded'}`}>
        <FsHead num={num} title={title} sub={sub} pill={pill}/>
      </div>
    );
  }
  return (
    <div className="fs">
      <FsHead num={num} title={title} sub={sub} pill={pill}/>
      <div className="fs__body">{children}</div>
    </div>
  );
}

/* ============================ Universal sections ========================== */

function SectionIdentity({ t }) {
  return (
    <Fs num="01" title="Identité & taxonomie" sub="Nom commercial, type principal, sous-catégorie métier, statut" pill={{ tone: 'ok', label: 'OK' }}>
      <div className="grid-2-1" style={{ marginBottom: 12 }}>
        <Field label="Nom commercial" required>
          <Input value={t.name} lg/>
          {window.EditEnh && <window.EditEnh.Prov source="Prestataire" who="Mr Versluys" when="il y a 9 mois"/>}
        </Field>
        <Field label="Statut publication" hint="Visibilité dans l'Explorer">
          <Select value={t.statusValue} options={[
            { v: 'pub', l: '🟢 Publié — en ligne' },
            { v: 'draft', l: '🟡 Brouillon' },
            { v: 'off', l: '🔴 Hors ligne' },
            { v: 'arch', l: '⚫ Archivé' },
          ]}/>
        </Field>
      </div>
      <div className="grid-2" style={{ marginBottom: 12 }}>
        <Field label="Raison sociale" hint="Personne morale propriétaire">
          <Input value={t.legal} placeholder="SARL Domaine du Bel Air"/>
        </Field>
        <Field label="ID OTI" hint="Identifiant canonique, généré, non modifiable">
          <Input value={t.refId} mono/>
        </Field>
      </div>

      <div className="grid-1-2" style={{ marginBottom: 12 }}>
        <Field label="Type d'objet (famille)" required hint="Famille canonique — détermine les sections obligatoires">
          <div className="input-wrap">
            <input className="input mono has-prefix" defaultValue={`${t.code} — ${t.codeName}`} readOnly/>
            <span className="prefix">●</span>
          </div>
        </Field>
        <Field label="Sous-catégorie métier (taxonomy)" hint="object_taxonomy hiérarchique">
          <div className="input-wrap">
            <input className="input has-suffix"
                   defaultValue={t.taxoPath}
                   placeholder="taper pour chercher dans la taxonomie…"/>
            <span className="suffix">▾</span>
          </div>
        </Field>
      </div>

      <Field label="Familles secondaires" hint="Cas multi-appartenance rares (ex : ITI + LOI). Ne stocke jamais un sous-type métier.">
        <ChipSet items={t.secondaries || [
          { label: 'HOT', on: true, icon: 'check' },
          { label: '+ Ajouter une seconde famille' },
        ]}/>
      </Field>
    </Fs>
  );
}

function SectionDescriptions({ t }) {
  const [lang, setLang] = useStateE('fr');
  const langs = [
    { k: 'fr', l: 'Français', state: 'ok' },
    { k: 'en', l: 'English', state: 'miss' },
    { k: 'cre', l: 'Créole', state: 'miss' },
  ];
  return (
    <Fs num="02" title="Descriptions" sub="Accroche, descriptif, descriptifs OTI, plan d'accès — multilingue" pill={{ tone: 'warn', label: '2 langues' }}>
      <div className="lang-tabs">
        {langs.map(L => (
          <button key={L.k} className={lang === L.k ? 'is-on' : ''} onClick={() => setLang(L.k)}>
            {L.l.slice(0,2).toUpperCase()}
            <span className={L.state === 'ok' ? 'ok' : 'miss'}>
              {L.state === 'ok' ? '●' : '○'}
            </span>
          </button>
        ))}
        <button>+ Ajouter une langue</button>
      </div>

      <div className="grid-2" style={{ marginBottom: 12 }}>
        <Field label="Accroche" hint="≤ 160 caractères — apparaît sous le titre dans l'Explorer">
          <Textarea value={t.accroche} count={t.accroche?.length || 0} max={160} rows={2}/>
        </Field>
        <Field label="Accroche OTI" hint="Version recommandée par l'office (override Explorer)">
          <Textarea value={t.accrocheOti} count={t.accrocheOti?.length || 0} max={160} rows={2}/>
        </Field>
      </div>

      <Field label="Descriptif" required hint="Texte principal de la fiche détail · gras, listes et liens autorisés">
        <Textarea value={t.descriptif} rich count={t.descriptif?.length || 0} max={2000}/>
        {window.EditEnh && <window.EditEnh.Prov source="Prestataire" who="Mme Florence G. (OTI)" when="il y a 2 j" locked="OTI"/>}
      </Field>

      <div className="grid-2" style={{ marginTop: 12 }}>
        <Field label="Descriptif OTI">
          <Textarea value={t.descriptifOti} rows={4}/>
        </Field>
        <Field label="Descriptif du plan d'accès" hint="Itinéraire textuel ; complète les coordonnées GPS">
          <Textarea value={t.accessText} rows={4}/>
        </Field>
      </div>
    </Fs>
  );
}

function SectionLocation({ t }) {
  return (
    <Fs num="03" title="Localisation" sub="Adresse postale, commune, lieu-dit, zone touristique, coordonnées GPS" pill={{ tone: 'ok', label: 'Géocodé' }}>
      <div className="grid-2" style={{ marginBottom: 12 }}>
        <Field label="Adresse" required>
          <Input value={t.addr.line.split(',')[0]} placeholder="38 Chemin du Bel Air"/>
        </Field>
        <Field label="Complément (lieu-dit interne)">
          <Input value={t.addrLine2} placeholder="Bras-Long"/>
        </Field>
      </div>

      <div className="grid-4" style={{ marginBottom: 12 }}>
        <Field label="Code postal" required>
          <Input value={t.cp} mono/>
        </Field>
        <Field label="Bureau postal" hint="Ex : Le Tampon · La Plaine des Cafres">
          <Input value={t.bp}/>
        </Field>
        <Field label="Commune">
          <Select value={t.commune} options={['L\'Entre-Deux','Saint-Pierre','Saint-Joseph','Le Tampon','Cilaos','Petite-Île']}/>
        </Field>
        <Field label="Zone touristique" hint="Backfill via correspondance lieu_dit → zone">
          <Select value={t.zone} options={['Sud Sauvage','Hauts du Sud','Littoral Sud','Cirque de Cilaos']}/>
        </Field>
      </div>

      <Field label="Lieu-dit (Lieux-dits / formulaire)" hint="Valeur brute trimée — colonne source canonique">
        <Input value={t.lieuDit} placeholder="Bras-Long"/>
        {window.EditEnh && <window.EditEnh.Prov source="Apidae" who="import auto" when="il y a 4 j"/>}
      </Field>

      <div style={{ marginTop: 12 }}>
        <div className="field__label" style={{ marginBottom: 5 }}>
          <span>Coordonnées GPS <span className="req">*</span></span>
          <button className="pill-mini" style={{ marginLeft: 'auto', cursor: 'pointer' }}>Géocoder l'adresse</button>
        </div>
        <div className="map-shell">
          <div>
            <div className="grid-2" style={{ marginBottom: 6 }}>
              <Input value={t.addr.coords.split(',')[0]} mono prefix="lat"/>
              <Input value={t.addr.coords.split(',')[1].trim()} mono prefix="lon"/>
            </div>
            <Field label="Localisations (chips)" hint="Centre-ville, montagne, littoral… plusieurs valeurs possibles">
              <ChipSet items={t.localisations || [
                { label: 'Centre ville', on: true },
                { label: 'Montagne', on: true },
                { label: 'Milieu rural' },
                { label: 'Littoral' },
                { label: 'Village des Hauts' },
                { label: '+' },
              ]}/>
            </Field>
          </div>
          <div className="map-mini">
            <div className="crosshair"/>
            <div className="pin"/>
          </div>
        </div>
      </div>
    </Fs>
  );
}

function SectionContacts({ t }) {
  return (
    <Fs num="04" title="Contacts" sub="Téléphones, e-mail, web, dirigeants" pill={{ tone: 'ok', label: 'OK' }}>
      <div className="repeater">
        <div className="rep-row" style={{ gridTemplateColumns: '14px 110px 1fr auto auto auto' }}>
          <span className="rep-row__handle"/>
          <Select value="fixe" options={[
            { v: 'fixe', l: '☎ Fixe (public)' },
            { v: 'mobile', l: '📱 Mobile' },
            { v: 'fax', l: '🖨 Fax' },
            { v: 'autre', l: 'Autre' },
          ]}/>
          <Input value={t.contact.phone} mono/>
          <span className="pill-mini">Public</span>
          <button className="icbtn">{Ico.copy({})}</button>
          <div className="rep-row__act">
            <button className="del">{Ico.trash({})}</button>
          </div>
        </div>
        <div className="rep-row" style={{ gridTemplateColumns: '14px 110px 1fr auto auto auto' }}>
          <span className="rep-row__handle"/>
          <Select value="mobile" options={[{v:'mobile',l:'📱 Mobile'}]}/>
          <Input value={t.contact.phone2 || '+262 692 88 12 04'} mono/>
          <span className="pill-mini">Interne</span>
          <button className="icbtn">{Ico.copy({})}</button>
          <div className="rep-row__act">
            <button className="del">{Ico.trash({})}</button>
          </div>
        </div>
        <div className="rep-row" style={{ gridTemplateColumns: '14px 110px 1fr auto auto auto' }}>
          <span className="rep-row__handle"/>
          <Select value="email" options={[
            { v:'email', l:'✉ E-mail (public)' },
            { v:'emailOti', l:'✉ E-mail (OTI)' },
            { v:'web', l:'🌐 Site web' },
          ]}/>
          <Input value={t.contact.email}/>
          <span className="pill-mini">Public</span>
          <button className="icbtn">{Ico.copy({})}</button>
          <div className="rep-row__act"><button className="del">{Ico.trash({})}</button></div>
        </div>
        <div className="rep-row" style={{ gridTemplateColumns: '14px 110px 1fr auto auto auto' }}>
          <span className="rep-row__handle"/>
          <Select value="web" options={[{v:'web',l:'🌐 Site web'}]}/>
          <Input value={t.contact.web} placeholder="example.re"/>
          <span className="pill-mini">Public</span>
          <button className="icbtn">{Ico.globe({})}</button>
          <div className="rep-row__act"><button className="del">{Ico.trash({})}</button></div>
        </div>
      </div>
      <button className="rep-add">{Ico.plus({})} Ajouter un canal de contact</button>
    </Fs>
  );
}

function SectionMedia({ t }) {
  const photos = t.photos || ['p1','p2','p3','p4'];
  return (
    <Fs num="06" title="Médias" sub="Photos (≥ 4 recommandées), documents, vidéo de présentation" pill={{ tone: 'warn', label: `${photos.length} / 6` }}>
      <div className="grid-1-2" style={{ marginBottom: 14 }}>
        <div className="dropzone">
          <span className="ico">{Ico.download({ width: 16, height: 16 })}</span>
          <strong>Déposer des photos ici</strong>
          <small>JPG/PNG · max 8 Mo · paysage 16:9 recommandé</small>
        </div>
        <div>
          <div className="media-grid">
            {photos.map((p, i) => (
              <div key={i} className="media-tile">
                {i === 0 && <span className="media-tile__cover">Cover</span>}
                <div className="media-tile__act">
                  <button>{Ico.star({ width: 12, height: 12 })}</button>
                  <button>{Ico.trash({ width: 12, height: 12 })}</button>
                </div>
                <div className={`media-tile__alt ${i === 3 ? 'empty' : ''}`}>
                  {i === 3 ? 'alt à compléter…' : `Photo · ${p}`}
                  <span className="pen" style={{ marginLeft: 'auto' }}>{Ico.edit({ width: 10, height: 10 })}</span>
                </div>
              </div>
            ))}
            <div className="media-tile media-tile__add">
              {Ico.plus({ width: 18, height: 18 })}
              Ajouter
            </div>
          </div>
          <div className="char-count" style={{ marginTop: 8 }}>Glisser-déposer pour réordonner · La première image est la photo de couverture.</div>
        </div>
      </div>

      <div className="chip-group__label">Documents associés</div>
      <div className="repeater">
        <div className="rep-row" style={{ gridTemplateColumns: '14px 30px 1fr 90px 80px auto' }}>
          <span className="rep-row__handle"/>
          <div className="sync-row__src">PDF</div>
          <div><strong>Fiche technique 2026</strong><small style={{ fontSize: 10.5, color: 'var(--ink-4)' }}>FR · 4 pages · mise à jour 12/03/2026</small></div>
          <span className="pill-mini">2.1 Mo</span>
          <span className="pill-mini">Public</span>
          <div className="rep-row__act"><button>{Ico.download({})}</button><button className="del">{Ico.trash({})}</button></div>
        </div>
        <div className="rep-row" style={{ gridTemplateColumns: '14px 30px 1fr 90px 80px auto' }}>
          <span className="rep-row__handle"/>
          <div className="sync-row__src">JPG</div>
          <div><strong>Logo officiel</strong><small style={{ fontSize: 10.5, color: 'var(--ink-4)' }}>800×800 · transparent</small></div>
          <span className="pill-mini">340 ko</span>
          <span className="pill-mini">Public</span>
          <div className="rep-row__act"><button>{Ico.download({})}</button><button className="del">{Ico.trash({})}</button></div>
        </div>
      </div>
      <button className="rep-add">{Ico.plus({})} Ajouter un document</button>
    </Fs>
  );
}

function SectionLabelsCap({ t }) {
  return (
    <Fs num="07" title="Capacité & contenance" sub="Numéros clés affichés dans l'Explorer (capacité, contenance, prix d'appel). Les labels officiels vivent dans la section Classifications.">
      <div className="grid-4" style={{ marginBottom: 14 }}>
        {(t.capacityStats || [
          { label: 'Capacité totale', value: '48', suffix: 'pers.' },
          { label: 'Unités locatives', value: '24' },
          { label: 'Couchages', value: '52' },
          { label: 'À partir de', value: '165', suffix: '€ /nuit' },
        ]).map((s, i) => <StatCard key={i} {...s} hasStep/>)}
      </div>

      <div className="chip-group__label">Cadre / environnement</div>
      <div className="chip-set">
        {['Centre-ville','Jardin','Montagne','Rural','Vue mer','Vue montagne','Bord de mer','Site patrimonial','Terrasse','Piscine'].map((s, i) => (
          <Chip key={i} label={s} on={[0,1,2,4].includes(i)}/>
        ))}
      </div>
    </Fs>
  );
}

function SectionPayLangs() {
  return (
    <Fs num="12" title="Modes de paiement & langues" sub="Acceptés au comptoir · langues parlées">
      <div className="chip-group__label" style={{ marginTop: 0 }}>Modes de paiement acceptés</div>
      <div className="chip-set">
        {[
          ['CB', true], ['Espèces', true], ['Chèque', true], ['Virement', true],
          ['Tickets restaurant', false], ['Chèques vacances', false], ['American Express', false],
          ['PayPal', false], ['Eurocard', false],
        ].map(([l, on], i) => <Chip key={i} label={l} on={on}/>)}
        <Chip label="+ Ajouter"/>
      </div>

      <div className="chip-group__label" style={{ marginTop: 14 }}>Langues parlées</div>
      <div className="chip-set">
        {[
          ['Français', true], ['Créole', true], ['Anglais', true],
          ['Allemand', false], ['Italien', false], ['Espagnol', false], ['Portugais', false],
          ['Langue des signes', false],
        ].map(([l, on], i) => <Chip key={i} label={l} on={on}/>)}
      </div>
    </Fs>
  );
}

function SectionProvider({ t }) {
  const SiretCard = window.EditEnh && window.EditEnh.SiretCard;
  const Prov = window.EditEnh && window.EditEnh.Prov;
  return (
    <Fs num="18" title="Fournisseur / Prestataire" sub="Entité juridique exploitant l'objet — données KBis vérifiées contre l'API SIRENE de l'INSEE" pill={{ tone: 'ok', label: 'SIRET vérifié' }}>
      {SiretCard && <SiretCard siret={t.provider?.siret || '44851998300012'} company={t.legal || t.provider?.name}/>}

      <div className="chip-group__label" style={{ marginTop: 4 }}>Compléments éditables</div>
      <div className="provider-grid">
        <Field label="Forme juridique"><Select value="SARL" options={['SARL','SAS','EI','SCI','EURL','SA','Association','Autre']}/></Field>
        <Field label="Code NAF (APE)"><Input value="55.10Z" mono/></Field>
        <Field label="Chambre consulaire"><Select value="CCI" options={['CCI','CMA','Chambre d\'Agriculture','Aucune']}/></Field>
        <Field label="CFE (organisme)"><Input value="CCI Réunion"/></Field>
      </div>

      <div className="chip-group__label" style={{ marginTop: 14 }}>Contact dirigeant</div>
      <div className="grid-3">
        <Field label="Nom complet"><Input value="Mr Franck Versluys"/></Field>
        <Field label="E-mail dirigeant"><Input value="versluys.f@belair.re" mono/></Field>
        <Field label="Téléphone dirigeant"><Input value="+262 692 41 22 80" mono/></Field>
      </div>
      {Prov && <Prov source="Prestataire" who="auto-déclaré" when="il y a 12 j"/>}

      <div className="grid-2" style={{ marginTop: 12 }}>
        <Field label="Adresse du fournisseur"><Input value="150-178 Rue Jules Bertaut, 97430 Le Tampon"/></Field>
        <Field label="Date de création de la société"><Input value="14/03/2003" mono prefix="📅"/></Field>
      </div>
      {Prov && <Prov source="INSEE" who="API SIRENE" when="il y a 2 j" locked="OTI"/>}
    </Fs>
  );
}

function SectionDistribution() {
  const dist = [
    { code: 'BK', name: 'Booking', url: 'booking.com/le-bel-air', sync: 'Sync OK · il y a 12 min', tone: 'ok' },
    { code: 'AB', name: 'Airbnb', url: 'airbnb.fr/rooms/882441', sync: 'Sync OK · 1 h', tone: 'ok' },
    { code: 'AB', name: 'Abritel', url: '—', sync: 'Non connecté', tone: 'warn' },
    { code: 'LB', name: 'Leboncoin', url: '—', sync: 'Non connecté', tone: 'warn' },
  ];
  const social = [
    { code: 'FB', name: 'Facebook', url: 'fb.com/belair.reunion' },
    { code: 'IG', name: 'Instagram', url: '@belair_reunion' },
    { code: 'TA', name: 'TripAdvisor', url: 'tripadvisor.fr/belair' },
    { code: 'TT', name: 'TikTok', url: '—' },
  ];
  return (
    <Fs num="20" title="Distribution & réseaux sociaux" sub="Booking, Airbnb, Abritel (canaux de réservation) · Facebook, Instagram, TripAdvisor (réseaux)" pill={{ tone: 'warn', label: '2 non liés' }}>
      <div className="chip-group__label" style={{ marginTop: 0 }}>Canaux de distribution</div>
      {dist.map((c, i) => (
        <div key={i} className="chan-row">
          <div className="chan-row__logo">{c.code}</div>
          <div>
            <div className="chan-row__name">{c.name}</div>
            <span className="chan-row__url">{c.url}</span>
          </div>
          <span className={`chan-row__sync ${c.tone}`}>{c.sync}</span>
          <button className="icbtn">{Ico.edit({ width: 12, height: 12 })}</button>
          <button className="icbtn">{Ico.trash({ width: 12, height: 12 })}</button>
        </div>
      ))}
      <button className="rep-add">{Ico.plus({})} Connecter un canal</button>

      <div className="chip-group__label" style={{ marginTop: 14 }}>Réseaux sociaux</div>
      {social.map((c, i) => (
        <div key={i} className="chan-row">
          <div className="chan-row__logo">{c.code}</div>
          <div>
            <div className="chan-row__name">{c.name}</div>
            <span className="chan-row__url">{c.url}</span>
          </div>
          <span className="chan-row__sync">{c.url === '—' ? 'Vide' : 'OK'}</span>
          <button className="icbtn">{Ico.edit({ width: 12, height: 12 })}</button>
          <button className="icbtn">{Ico.trash({ width: 12, height: 12 })}</button>
        </div>
      ))}
    </Fs>
  );
}

function SectionAttachments() {
  return (
    <Fs num="17" title="Rattachements organisationnels" sub="Publisher (object_org_link) · partenaires · réseau" pill={{ tone: 'ok', label: 'Publisher OK' }}>
      <Field label="Organisation éditrice (publisher)" required hint="Définit la portée RLS et les droits d'édition">
        <div className="input-wrap">
          <input className="input has-prefix" defaultValue="OTI du Sud — Office de tourisme intercommunal"/>
          <span className="prefix">●</span>
        </div>
      </Field>
      <div className="grid-2" style={{ marginTop: 10 }}>
        <Field label="Rôle"><Select value="publisher" options={['publisher','co-publisher','partenaire','simple lien']}/></Field>
        <Field label="Lien primaire"><Toggle label="Marquer comme is_primary = TRUE" on/></Field>
      </div>
      <div className="chip-group__label" style={{ marginTop: 14 }}>Partenaires & réseaux thématiques</div>
      <div className="chip-set">
        <Chip label="Région Réunion · Direction du tourisme" on icon="check"/>
        <Chip label="IRT" on icon="check"/>
        <Chip label="Sud Sauvage Tourisme" on icon="check"/>
        <Chip label="Pass touristique Sud Sauvage"/>
        <Chip label="+ Rattacher une organisation"/>
      </div>
    </Fs>
  );
}

function SectionPublication() {
  return (
    <Fs num="21" title="Publication & cycle de vie" sub="Statut, motif hors ligne, dates clés, aire d'adhésion" pill={{ tone: 'ok', label: 'Publié' }}>
      <div className="grid-3" style={{ marginBottom: 12 }}>
        <Field label="Statut courant">
          <Select value="pub" options={[
            { v: 'pub', l: '🟢 Publié — en ligne' },
            { v: 'draft', l: '🟡 Brouillon' },
            { v: 'off', l: '🔴 Hors ligne' },
            { v: 'arch', l: '⚫ Archivé' },
          ]}/>
        </Field>
        <Field label="Aire d'adhésion"><Select value="AD2R" options={['AD2R','OTI Sud','Autre','Aucune']}/></Field>
        <Field label="Visibilité commerciale"><Select value="full" options={[
          { v: 'full', l: 'Complète' },
          { v: 'private', l: 'Privée' },
          { v: 'hidden', l: 'Masquée' },
        ]}/></Field>
      </div>

      <div className="grid-3" style={{ marginBottom: 12 }}>
        <Field label="Date de création"><Input value="14/03/2003" mono/></Field>
        <Field label="Date de fermeture (si applicable)"><Input value="" mono placeholder="—"/></Field>
        <Field label="Num. taxe de séjour"><Input value="CSC41HTE" mono/></Field>
      </div>

      <Field label="Motif hors ligne" hint="Renseigner si statut = Hors ligne · explication visible aux agents">
        <Textarea value="" placeholder="Ex : fermeture saisonnière, sinistre, travaux…" rows={2}/>
      </Field>

      <div className="chip-group__label" style={{ marginTop: 14 }}>Workflow</div>
      <div className="grid-3">
        <Toggle label="Demande de validation" sub="Soumettre à modération" on/>
        <Toggle label="Publication différée" sub="Programmer une mise en ligne"/>
        <Toggle label="Notifier les partenaires" sub="À l'enregistrement" on/>
      </div>
    </Fs>
  );
}

function SectionSync() {
  const ids = [
    { src: 'OTI', label: 'ID OTI (canonical)', val: 'HOT-01284', when: '—', editable: false },
    { src: 'AT', label: 'Airtable recId', val: 'recVHmZ8KZb33XzNm', when: 'Import 01/04/2026', editable: true },
    { src: 'DT', label: 'DataTourisme URI', val: 'https://data.datatourisme…', when: 'Sync OK · 2 h', editable: true },
    { src: 'AP', label: 'Apidae object_id', val: '4421902', when: 'Sync OK · 4 h', editable: true },
    { src: 'SU', label: 'Supabase row_id', val: 'a3f1-…-bd44', when: '—', editable: false },
  ];
  return (
    <Fs num="22" title="Identifiants externes & synchronisation" sub="Correspondances inter-systèmes · dernier import · jobs planifiés" pill={{ tone: 'ok', label: '4 / 5 synchros' }}>
      {ids.map((row, i) => (
        <div key={i} className="sync-row">
          <div className="sync-row__src">{row.src}</div>
          <div>
            <strong>{row.label}</strong>
            <small>{row.val}</small>
          </div>
          <span className="sync-row__when">{row.when}</span>
          <button className="sync-row__btn" title={row.editable ? 'Modifier' : 'Lecture seule'}>
            {row.editable ? Ico.edit({ width: 12, height: 12 }) : '🔒'}
          </button>
        </div>
      ))}
      <button className="rep-add" style={{ marginTop: 10 }}>{Ico.plus({})} Lier un nouvel identifiant externe</button>
    </Fs>
  );
}

/* ============================ Right rail ============================ */
function RailCompletion({ percent = 78, sections }) {
  const r = 56, c = 2 * Math.PI * r;
  return (
    <div className="card">
      <h4>Complétude <span className="small-act">Voir détails ›</span></h4>
      <div className="edit-nav__ring">
        <svg width="148" height="148" viewBox="0 0 148 148">
          <circle cx="74" cy="74" r={r} fill="none" stroke="rgba(24,49,59,0.08)" strokeWidth="10"/>
          <circle cx="74" cy="74" r={r} fill="none" stroke="var(--accent)" strokeWidth="10"
                  strokeLinecap="round"
                  strokeDasharray={`${(c * percent) / 100} ${c}`}/>
        </svg>
        <div className="edit-nav__ring__center">
          <div>
            <div className="num">{percent}<small style={{ fontSize: 12, color: 'var(--ink-3)' }}>%</small></div>
            <div className="lbl">prête à publier</div>
          </div>
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 11.5 }}>
        {sections.map((s, i) => (
          <div key={i} style={{ display: 'grid', gridTemplateColumns: '8px 1fr auto', gap: 8, alignItems: 'center' }}>
            <span className={`edit-nav__dot ${s.stat}`}/>
            <span style={{ color: 'var(--ink-2)' }}>{s.l}</span>
            <span className="pill-mini">{s.pct}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function RailIssues({ items }) {
  return (
    <div className="card">
      <h4>À corriger <span className="small-act">{items.length} ›</span></h4>
      {items.map((it, i) => (
        <div key={i} className="issue">
          <span className={`issue__dot ${it.tone}`}/>
          <div>
            <strong>{it.title}</strong>
            <small style={{ color: 'var(--ink-4)', fontSize: 10.5 }}>{it.detail}</small>
          </div>
          <span className="issue__go">Aller ›</span>
        </div>
      ))}
    </div>
  );
}

function RailPresence() {
  const peers = [
    { name: 'Florence G.', role: 'OTI · agent', color: 'linear-gradient(135deg,#176b6a,#0d4f4e)', initials: 'FG', editing: '02 Descriptions · EN' },
    { name: 'Jean-Marc B.', role: 'Bertel · admin', color: 'linear-gradient(135deg,#c96d3b,#93501f)', initials: 'JB', editing: null },
  ];
  return (
    <div className="card">
      <h4>En cours d'édition <span className="small-act">Live</span></h4>
      {peers.map((p, i) => (
        <div key={i} className="peer">
          <span className="peer__av" style={{ background: p.color }}>{p.initials}</span>
          <div>
            <strong>{p.name}</strong>
            <small>{p.role}</small>
          </div>
          {p.editing && <span className="tag-mini">{p.editing}</span>}
        </div>
      ))}
    </div>
  );
}

function RailHistory() {
  const events = [
    { who: 'Florence G.', what: 'a modifié Descriptions · FR (accroche)', when: 'il y a 12 s' },
    { who: 'Jean-Marc B.', what: 'a ajouté un canal Airbnb', when: 'il y a 3 min' },
    { who: 'Import Apidae', what: 'a synchronisé 4 champs', when: 'il y a 4 h' },
    { who: 'Florence G.', what: 'a publié la fiche', when: 'hier · 18:42' },
  ];
  return (
    <div className="card">
      <h4>Historique <span className="small-act">Tout voir ›</span></h4>
      {events.map((e, i) => (
        <div key={i} className="history-row">
          <div>
            <strong>{e.who}</strong>
            <small>{e.what} <span className="when">· {e.when}</span></small>
          </div>
        </div>
      ))}
    </div>
  );
}

window.EditPrim = {
  Field, Input, Textarea, Select, Chip, ChipSet, Toggle, StatCard, Fs,
  SectionIdentity, SectionDescriptions, SectionLocation, SectionContacts,
  SectionMedia, SectionLabelsCap, SectionPayLangs, SectionProvider,
  SectionDistribution, SectionAttachments, SectionPublication, SectionSync,
  RailCompletion, RailIssues, RailPresence, RailHistory,
};
