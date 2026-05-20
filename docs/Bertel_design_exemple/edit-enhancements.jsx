/* global React, Ico */
/* edit-enhancements.jsx — cross-cutting UX improvements layered onto the
   edit pages:
     - <Prov>  field-level provenance line (source · auteur · date · lock)
     - <ValBanner>  publication-gate summary at the top of the page
     - <SiretCard>  INSEE/SIRENE verification card replacing the plain SIRET input
     - <RelationPicker>  typeahead overlay showing how the relation input is meant to work
     - <ModeToggle>  Quick mode vs Full mode switch
*/

const { useState: useStateH } = React;

/* =================== Provenance ====================== */
function Prov({ source, who, when, locked, color = '#176b6a' }) {
  const sourceMap = {
    Apidae:       { ic: 'A', color: '#176b6a' },
    DataTourisme: { ic: 'D', color: '#1e7491' },
    INSEE:        { ic: 'I', color: '#6c4f8a' },
    Acceslibre:   { ic: '♿', color: '#2a7a45' },
    Prestataire:  { ic: 'P', color: '#c96d3b' },
    OTI:          { ic: 'O', color: '#a45330' },
    Manuel:       { ic: '⌨', color: 'var(--ink-3)' },
    Importé:      { ic: '↓', color: 'var(--ink-3)' },
  };
  const s = sourceMap[source] || sourceMap.Manuel;
  return (
    <div className="prov">
      <span className="prov__src" style={{ background: s.color }}>{s.ic}</span>
      <span className="prov__lbl">
        <strong>{source}</strong>
        {who && <> · {who}</>}
        {when && <> · <span className="prov__when">{when}</span></>}
      </span>
      {locked && (
        <span className="prov__lock" title={`Champ verrouillé par ${locked}`}>
          🔒 {locked}
        </span>
      )}
    </div>
  );
}

/* =================== Validation banner =================== */
function ValBanner({ blockers, warnings, type, mode }) {
  return (
    <div className="val-banner">
      <div className="val-banner__col val-banner__col--block">
        <div className="val-banner__head">
          <span className="val-banner__dot req"/>
          Bloque la publication
          <span className="val-banner__count">{blockers.length}</span>
        </div>
        {blockers.map((b, i) => (
          <div key={i} className="val-banner__row">
            <span className="val-banner__sec">§{b.sec}</span>
            <span className="val-banner__txt">{b.txt}</span>
            <button className="val-banner__go">Corriger ›</button>
          </div>
        ))}
      </div>
      <div className="val-banner__col val-banner__col--warn">
        <div className="val-banner__head">
          <span className="val-banner__dot warn"/>
          Recommandé avant publication
          <span className="val-banner__count">{warnings.length}</span>
        </div>
        {warnings.slice(0, 3).map((b, i) => (
          <div key={i} className="val-banner__row">
            <span className="val-banner__sec">§{b.sec}</span>
            <span className="val-banner__txt">{b.txt}</span>
            <button className="val-banner__go">Voir ›</button>
          </div>
        ))}
        {warnings.length > 3 && (
          <div className="val-banner__more">+ {warnings.length - 3} autres avertissements</div>
        )}
      </div>
      <div className="val-banner__col val-banner__col--gate">
        <div className="val-banner__gate">
          <div className="val-banner__gate-num">{blockers.length === 0 ? '✓' : blockers.length}</div>
          <div>
            <strong>{blockers.length === 0 ? 'Publication possible' : `${blockers.length} blocage${blockers.length > 1 ? 's' : ''} restant${blockers.length > 1 ? 's' : ''}`}</strong>
            <small>Mode {mode} · type {type}</small>
          </div>
        </div>
        <button className="btn primary" disabled={blockers.length > 0} style={{ width: '100%' }}>
          {Ico.check({ width: 12, height: 12 })} Publier maintenant
        </button>
        <button className="btn" style={{ width: '100%', marginTop: 4 }}>
          Demander revue OTI
        </button>
      </div>
    </div>
  );
}

/* =================== SIRET verification card =================== */
function SiretCard({ siret = '44851998300012', company = 'SARL Domaine du Bel Air' }) {
  const insee = {
    siret, company,
    naf: '55.10Z · Hôtels et hébergement similaire',
    formeJuridique: 'SARL',
    capital: '50 000 €',
    effectif: '6 à 9 salariés',
    dirigeant: 'Mr Franck Versluys',
    inscription: '14/03/2003',
    status: 'Active',
    lastCheck: 'il y a 2 jours',
  };
  return (
    <div className="siret-card">
      <div className="siret-card__head">
        <div className="siret-card__siret">{insee.siret}</div>
        <div className="siret-card__status">
          <span className="dot"/> Active · INSEE vérifié
        </div>
        <button className="pill-mini" style={{ cursor: 'pointer', color: 'var(--accent-deep)' }}>
          ↻ Re-vérifier
        </button>
      </div>
      <div className="siret-card__grid">
        <div className="siret-card__kv">
          <span className="k">Raison sociale</span>
          <span className="v">{insee.company}</span>
        </div>
        <div className="siret-card__kv">
          <span className="k">Forme juridique</span>
          <span className="v">{insee.formeJuridique}</span>
        </div>
        <div className="siret-card__kv">
          <span className="k">Code NAF</span>
          <span className="v">{insee.naf}</span>
        </div>
        <div className="siret-card__kv">
          <span className="k">Capital social</span>
          <span className="v">{insee.capital}</span>
        </div>
        <div className="siret-card__kv">
          <span className="k">Effectif déclaré</span>
          <span className="v">{insee.effectif}</span>
        </div>
        <div className="siret-card__kv">
          <span className="k">Inscription</span>
          <span className="v">{insee.inscription}</span>
        </div>
      </div>
      <div className="siret-card__foot">
        <Prov source="INSEE" who="API SIRENE" when={insee.lastCheck}/>
      </div>
    </div>
  );
}

/* =================== Relation typeahead (overlay demo) =================== */
function RelationPicker({ open = true }) {
  if (!open) return null;
  const results = [
    { type: 'PNA', code: 'PNA-00184', name: 'Plage de Grands Bois', city: 'Saint-Pierre', match: 'based_at_site' },
    { type: 'ITI', code: 'ITI-00091', name: 'Boucle baie de Saint-Pierre', city: 'Saint-Pierre · 4.2 km', match: 'uses_itinerary' },
    { type: 'PNA', code: 'PNA-00227', name: 'Spot de Grand Anse', city: 'Petite-Île', match: 'based_at_site' },
    { type: 'ITI', code: 'ITI-00308', name: 'Sentier du littoral', city: 'Saint-Pierre · 9.8 km', match: 'uses_itinerary' },
    { type: 'ASC', code: 'ASC-00188', name: 'Surf School Saint-Pierre · cette fiche', city: '— même fiche, ignorer', match: 'self' },
  ];
  return (
    <div className="rpick">
      <div className="rpick__head">
        <span className="rpick__icon">{Ico.search({ width: 12, height: 12 })}</span>
        <input className="rpick__input" defaultValue="grand"/>
        <span className="rpick__hint">↑ ↓ pour naviguer · ↵ pour sélectionner · Esc pour fermer</span>
      </div>
      <div className="rpick__filters">
        <button className="chip size-sm is-on">Tous types</button>
        <button className="chip size-sm">PNA · sites</button>
        <button className="chip size-sm">ITI · itinéraires</button>
        <button className="chip size-sm">HEB · hébergements</button>
        <button className="chip size-sm" style={{ marginLeft: 'auto' }}>≤ 5 km de l'objet</button>
      </div>
      <div className="rpick__list">
        {results.map((r, i) => (
          <div key={i} className={`rpick__row ${r.match === 'self' ? 'is-disabled' : ''} ${i === 0 ? 'is-hi' : ''}`}>
            <div className={`rpick__type type-${r.type.toLowerCase()}`}>{r.type}</div>
            <div className="rpick__main">
              <strong>{r.name}</strong>
              <small>{r.city} · {r.code}</small>
            </div>
            {r.match !== 'self' && (
              <span className="rpick__suggest">
                Lier en <strong>{r.match}</strong>
              </span>
            )}
            {r.match === 'self' && <span className="pill-mini" style={{ color: 'var(--ink-4)' }}>même fiche</span>}
          </div>
        ))}
      </div>
      <div className="rpick__foot">
        <button className="rep-add" style={{ marginTop: 0 }}>{Ico.plus({})} Créer une nouvelle fiche</button>
        <span style={{ fontSize: 10.5, color: 'var(--ink-4)', marginLeft: 'auto' }}>
          Recherche dans 4 218 fiches · index Bertel à jour
        </span>
      </div>
    </div>
  );
}

/* =================== Mode toggle (Rapide vs Complet) =================== */
function ModeToggle({ mode, onChange }) {
  return (
    <div className="mode-tog">
      <button className={mode === 'rapide' ? 'is-on' : ''}
              onClick={() => onChange('rapide')}>
        Rapide
        <span className="hint">Sections requises</span>
      </button>
      <button className={mode === 'complet' ? 'is-on' : ''}
              onClick={() => onChange('complet')}>
        Complet
        <span className="hint">Toutes les sections</span>
      </button>
    </div>
  );
}

window.EditEnh = { Prov, ValBanner, SiretCard, RelationPicker, ModeToggle };
