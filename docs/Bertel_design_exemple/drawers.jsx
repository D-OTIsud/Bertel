/* global React, Ico, DATA */
const { useState: useStateD } = React;

function DetailDrawer({ onClose, onEdit }) {
  const d = DATA.DETAIL;
  const [tab, setTab] = useStateD('overview');
  const [photoIdx, setPhotoIdx] = useStateD(0);

  return (
    <>
      <div className="scrim" onClick={onClose}/>
      <div className="drawer">
        <div className="drawer__head">
          <div>
            <div className="drawer__eyebrow">
              {d.type}
              <span className="code">{d.code}</span>
              <span style={{ color: 'var(--ink-4)' }}>· #FCH-04821</span>
            </div>
            <h2 className="drawer__title">{d.name}</h2>
            <div className="drawer__tags">
              {d.tags.map(([label, tone], i) => (
                <span key={i} className={'tag ' + (tone || '')}>{label}</span>
              ))}
            </div>
          </div>
          <div className="drawer__actions">
            <span className="pill-status"><span className="dot"/>{d.live} live</span>
            <button className="btn sm">{Ico.star({ width: 14, height: 14 })}</button>
            <button className="btn sm">{Ico.print({})} Imprimer</button>
            <button className="btn primary" onClick={onEdit}>{Ico.edit({})} Modifier</button>
            <button className="btn ghost" onClick={onClose}>{Ico.close({})}</button>
          </div>
        </div>

        <div className="tabs">
          {[
            ['overview', 'Aperçu'],
            ['equip', 'Équipements', 14],
            ['tarifs', 'Tarifs & horaires'],
            ['media', 'Médias', 4],
            ['legal', 'Légal'],
            ['activity', 'Activité', 6],
          ].map(([k, l, c]) => (
            <button key={k} className={tab === k ? 'is-on' : ''} onClick={() => setTab(k)}>
              {l}{c != null && <span className="tabs__count">{c}</span>}
            </button>
          ))}
        </div>

        <div className="drawer__body">
          <div className="drawer__main">
            {/* Hero */}
            <div className="hero">
              <div className="hero__main" style={{ backgroundImage: `url(${d.photos[photoIdx]})` }}>
                <span className="badge">{Ico.pin({ width: 12, height: 12 })} Saint-Joseph · Les Jacques</span>
                <button className="arrow l" onClick={() => setPhotoIdx(i => (i - 1 + d.photos.length) % d.photos.length)}>‹</button>
                <button className="arrow r" onClick={() => setPhotoIdx(i => (i + 1) % d.photos.length)}>›</button>
                <div className="pager">
                  {d.photos.map((_, i) => <span key={i} className={i === photoIdx ? 'on' : ''}/>)}
                </div>
              </div>
              <div className="hero__grid">
                {d.photos.slice(1, 4).map((p, i) => (
                  <div key={i} style={{ backgroundImage: `url(${p})` }}
                    className={i === 2 ? 'more' : ''}>
                    {i === 2 && `+${d.photos.length - 3}`}
                  </div>
                ))}
              </div>
            </div>

            {/* Key facts */}
            <div className="kv-grid">
              <div className="kv">
                <div className="kv__label">Capacité</div>
                <div className="kv__value">{d.capacity.total}<small>pers.</small></div>
              </div>
              <div className="kv">
                <div className="kv__label">Chambres</div>
                <div className="kv__value">{d.capacity.rooms}</div>
              </div>
              <div className="kv">
                <div className="kv__label">À partir de</div>
                <div className="kv__value">{d.prices.from}{d.prices.currency}<small>{d.prices.unit}</small></div>
              </div>
              <div className="kv">
                <div className="kv__label">Statut</div>
                <div className="kv__value" style={{ fontSize: 15, color: 'var(--green)' }}>
                  <span className="pill-status" style={{ verticalAlign: 'middle' }}><span className="dot"/>Ouvert</span>
                </div>
              </div>
            </div>

            {/* Description */}
            <div className="section">
              <div className="section__head">
                <h3>Description</h3>
                <a className="more">Voir versions ·  FR / EN ›</a>
              </div>
              <div className="prose">
                {d.description.split('\n\n').map((p, i) => <p key={i}>{p}</p>)}
              </div>
            </div>

            {/* Equipments */}
            <div className="section">
              <div className="section__head">
                <h3>Équipements & services</h3>
                <a className="more">Voir les 14 ›</a>
              </div>
              <div className="equip-grid">
                {d.equipments.map(([label, icon], i) => (
                  <div key={i} className="equip">
                    {Ico[icon] && Ico[icon]({ width: 16, height: 16 })}
                    <span>{label}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Setting */}
            <div className="section">
              <div className="section__head">
                <h3>Cadre & environnement</h3>
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {d.setting.map((s, i) => (
                  <span key={i} className="cap-tag neutral">{s}</span>
                ))}
              </div>
            </div>
          </div>

          {/* Side */}
          <aside className="drawer__side">
            <div className="side-card">
              <h4>Plan d'accès <a className="small-act">Ouvrir ›</a></h4>
              <div className="mini-map">
                <div className="pin"/>
              </div>
              <div className="addr">
                {d.address}
                <div className="addr__coord">{d.coords}</div>
              </div>
              <div style={{ display: 'flex', gap: 6, marginTop: 12 }}>
                <button className="btn sm" style={{ flex: 1 }}>{Ico.globe({})} Google Maps</button>
                <button className="btn sm primary" style={{ flex: 1 }}>{Ico.nav({})} Itinéraire</button>
              </div>
            </div>

            {typeof OpeningPeriodsA === 'function' && <OpeningPeriodsA/>}

            <div className="side-card">
              <h4>Contact</h4>
              <div className="contact-row">
                {Ico.mail({ width: 14, height: 14 })}
                <span>{d.contact.email}</span>
                <span className="copy">{Ico.copy({})}</span>
              </div>
              <div className="contact-row">
                {Ico.phone({ width: 14, height: 14 })}
                <span>{d.contact.phone}</span>
                <span className="copy">{Ico.copy({})}</span>
              </div>
              <div className="contact-row">
                {Ico.globe({ width: 14, height: 14 })}
                <span>{d.contact.web}</span>
                <span className="copy">{Ico.copy({})}</span>
              </div>
            </div>

            <div className="side-card">
              <h4>À savoir</h4>
              <dl className="def-list">
                <div><dt>Langues</dt><dd>{d.langs.join(' · ')}</dd></div>
                <div><dt>Paiements</dt><dd>{d.payments.join(' · ')}</dd></div>
                <div><dt>Animaux</dt><dd>Acceptés</dd></div>
                <div><dt>Enfants</dt><dd>Acceptés (dès 6 ans)</dd></div>
                <div><dt>Check-in</dt><dd>16h00 · 19h00</dd></div>
              </dl>
            </div>

            <div className="side-card">
              <h4>Réseau</h4>
              {d.orgs.map((o, i) => (
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
          </aside>
        </div>
      </div>
    </>
  );
}

function EditDrawer({ onClose, onPreview }) {
  const d = DATA.DETAIL;
  const [activeKey, setActiveKey] = useStateD('tax');
  const [collapsed, setCollapsed] = useStateD(['hotel']);
  const [selected, setSelected] = useStateD('standard');
  const [search, setSearch] = useStateD('');

  const toggleCat = (k) => setCollapsed(c => c.includes(k) ? c.filter(x => x !== k) : [...c, k]);

  const filterNode = (node) => {
    if (!search) return true;
    if (node.label.toLowerCase().includes(search.toLowerCase())) return true;
    if (node.sub && node.sub.some(n => n.label.toLowerCase().includes(search.toLowerCase()))) return true;
    return false;
  };

  return (
    <>
      <div className="scrim" onClick={onClose}/>
      <div className="drawer">
        <div className="drawer__head">
          <div>
            <div className="drawer__eyebrow">
              Édition
              <span className="code">{d.code}</span>
              <span style={{ color: 'var(--ink-4)' }}>· Modifications non enregistrées</span>
            </div>
            <h2 className="drawer__title">{d.name}</h2>
            <div className="drawer__tags">
              {d.tags.slice(0, 4).map(([label, tone], i) => (
                <span key={i} className={'tag ' + (tone || '')}>{label}</span>
              ))}
            </div>
          </div>
          <div className="drawer__actions">
            <span className="pill-status"><span className="dot"/>{d.live} live</span>
            <button className="btn sm" onClick={onPreview}>Aperçu</button>
            <button className="btn primary">{Ico.check({ width: 12, height: 12 })} Enregistrer</button>
            <button className="btn ghost" onClick={onClose}>{Ico.close({})}</button>
          </div>
        </div>

        <div className="edit-body">
          {/* Nav */}
          <nav className="edit-nav">
            {DATA.EDIT_NAV.map((group, gi) => (
              <div key={gi}>
                <div className="edit-nav__sect">{group.group}</div>
                {group.items.map(it => (
                  <div key={it.key}
                    className={'edit-nav__item' + (activeKey === it.key ? ' is-on' : '')}
                    onClick={() => setActiveKey(it.key)}>
                    {it.label}
                    {it.stat && <span className={'stat ' + it.stat}>{it.statText || (it.stat === 'ok' ? '✓' : it.stat === 'warn' ? '!' : '!')}</span>}
                  </div>
                ))}
              </div>
            ))}
          </nav>

          {/* Main */}
          <div className="edit-main">
            <div className="edit-main__head">
              <div>
                <h3 className="edit-main__title">
                  {activeKey === 'tax' ? 'Taxonomie' : 'Informations générales'}
                </h3>
                <p className="edit-main__sub">
                  {activeKey === 'tax'
                    ? 'Le nœud sélectionné qualifie la fiche et conditionne les attributs disponibles.'
                    : 'Identité de la fiche. La taxonomie pilote les champs disponibles.'}
                </p>
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                <button className="btn sm">Historique</button>
                <button className="btn sm">{Ico.more({})}</button>
              </div>
            </div>

            {/* Common: informations générales */}
            <div className="section">
              <div className="row-2">
                <div className="field">
                  <label className="field__label">Nom principal <span className="req">*</span><span className="help">FR</span></label>
                  <input type="text" defaultValue={d.name}/>
                </div>
                <div className="field">
                  <label className="field__label">Type de fiche <span className="help">verrouillé</span></label>
                  <input type="text" defaultValue="Hébergement loisir (HLO)" disabled style={{ background: 'var(--bg-tint)', color: 'var(--ink-3)' }}/>
                </div>
              </div>
            </div>

            {/* Taxonomy */}
            {activeKey === 'tax' && (
              <>
                <div className="section">
                  <div className="section__head">
                    <h3>Taxonomie structurante</h3>
                    <span style={{ fontSize: 12, color: 'var(--ink-3)' }}>
                      Sélection : <strong style={{ color: 'var(--teal)' }}>Chambre d'hôte › Chambre d'hôte</strong>
                    </span>
                  </div>

                  <div className="taxo">
                    <div className="taxo__head">
                      <div className="taxo__path">
                        <strong>Hébergements locatifs</strong>
                        <span className="sep">/</span>
                        <span>HLO</span>
                        <span className="sep">/</span>
                        <strong style={{ color: 'var(--teal)' }}>Sélection en cours</strong>
                      </div>
                      <div className="taxo__search">
                        {Ico.search({ width: 12, height: 12 })}
                        <input placeholder="Rechercher..."
                          value={search}
                          onChange={e => setSearch(e.target.value)}/>
                      </div>
                    </div>

                    {DATA.TAXONOMY_NODES.filter(filterNode).map(node => {
                      const isCollapsed = collapsed.includes(node.key) && !search;
                      return (
                        <React.Fragment key={node.key}>
                          <div className={'taxo__row is-cat' + (isCollapsed ? ' collapsed' : '')}
                              onClick={() => node.sub.length && toggleCat(node.key)}>
                            <span className="caret">{Ico.chev({ width: 12, height: 12 })}</span>
                            <span className="lbl">{node.label}</span>
                            <span className="meta">{node.sub.length} sous-catégories · {node.count} fiches</span>
                          </div>
                          {!isCollapsed && node.sub.filter(n =>
                              !search || n.label.toLowerCase().includes(search.toLowerCase())
                          ).map(child => (
                            <div key={child.key}
                                className={'taxo__row lvl-1' + (selected === child.key ? ' is-on' : '')}
                                onClick={() => setSelected(child.key)}>
                              <span className="radio"/>
                              <span className="lbl">{child.label}</span>
                              <span className="meta">{child.count}</span>
                            </div>
                          ))}
                        </React.Fragment>
                      );
                    })}
                  </div>
                </div>
              </>
            )}

            <div className="savebar">
              <div className="savebar__msg">
                <strong>3 modifications</strong> non enregistrées · dernière sauvegarde il y a 14 min
              </div>
              <div className="savebar__actions">
                <button className="btn sm">Annuler</button>
                <button className="btn sm primary">{Ico.check({ width: 12, height: 12 })} Enregistrer & publier</button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

window.DetailDrawer = DetailDrawer;
window.EditDrawer = EditDrawer;
