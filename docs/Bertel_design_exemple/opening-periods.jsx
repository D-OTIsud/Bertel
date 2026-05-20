/* global React, Ico */
const { useState: useStateOP } = React;

// ============================================================
// Shared mock data — a chambre d'hôte with seasonal hours
// ============================================================
const PERIODS = [
  { key: 'haute', name: 'Haute saison', kind: 'high',
    range: '15 juin → 15 sept.',
    nextSwitch: '16 sept. → Hors saison',
    summary: '7 / 7 jours · amplitude 11h',
    hours: [
      { d: 'Lun', open: true, ranges: [[8, 21]] },
      { d: 'Mar', open: true, ranges: [[8, 21]] },
      { d: 'Mer', open: true, ranges: [[8, 21]] },
      { d: 'Jeu', open: true, ranges: [[8, 21]] },
      { d: 'Ven', open: true, ranges: [[8, 22]] },
      { d: 'Sam', open: true, ranges: [[8, 22]] },
      { d: 'Dim', open: true, ranges: [[9, 20]] },
    ]},
  { key: 'inter', name: 'Hors saison', kind: 'low',
    range: '16 fév → 14 juin · 16 sept → 14 nov',
    nextSwitch: '15 juin → Haute saison',
    summary: '6 / 7 jours (fermé lundi) · amplitude 7h30',
    hours: [
      { d: 'Lun', open: false, ranges: [] },
      { d: 'Mar', open: true,  ranges: [[9, 12], [14, 18]] },
      { d: 'Mer', open: true,  ranges: [[9, 12], [14, 18]] },
      { d: 'Jeu', open: true,  ranges: [[9, 12], [14, 18]] },
      { d: 'Ven', open: true,  ranges: [[9, 12], [14, 19]] },
      { d: 'Sam', open: true,  ranges: [[9, 19]] },
      { d: 'Dim', open: true,  ranges: [[10, 17]] },
    ]},
  { key: 'ferme', name: 'Fermeture annuelle', kind: 'shut',
    range: '15 nov → 15 fév',
    nextSwitch: '16 fév → Hors saison',
    summary: 'Établissement fermé',
    hours: Array(7).fill(0).map((_, i) => ({
      d: ['Lun','Mar','Mer','Jeu','Ven','Sam','Dim'][i],
      open: false, ranges: []
    }))},
];

// Year ribbon segments (months 0–12), shared by A's "all periods" view and B
const RIBBON_SEGS = [
  { kind: 'shut', periodKey: 'ferme', start: 0,    end: 1.5,  abbr: 'Fermé' },
  { kind: 'low',  periodKey: 'inter', start: 1.5,  end: 5.5,  abbr: 'Hors saison' },
  { kind: 'high', periodKey: 'haute', start: 5.5,  end: 8.5,  abbr: 'Haute saison' },
  { kind: 'low',  periodKey: 'inter', start: 8.5,  end: 10.5, abbr: 'Hors s.' },
  { kind: 'shut', periodKey: 'ferme', start: 10.5, end: 12,   abbr: 'Fermé' },
];
const MONTHS = ['Jan','Fév','Mar','Avr','Mai','Juin','Juil','Août','Sep','Oct','Nov','Déc'];

const EXCEPTIONS = [
  { date: '14 juil. 2026', reason: 'Fête nationale · ouverture prolongée', status: 'special', hours: '09:00 → 23:00' },
  { date: '15 août 2026', reason: 'Assomption', status: 'closed' },
  { date: '01 nov. 2026', reason: 'Toussaint', status: 'closed' },
  { date: '25 déc. 2026', reason: 'Noël', status: 'closed' },
];

// Today = 15 mai 2026 → period "Hors saison"
const TODAY = { name: 'Jeu', dayIdx: 3, dateStr: 'jeudi 15 mai', dayOfYear: 135 };
const ACTIVE_PERIOD = PERIODS[1]; // Hors saison

const fmtH = (h) => {
  const hh = Math.floor(h);
  const mm = Math.round((h - hh) * 60);
  return `${String(hh).padStart(2,'0')}:${String(mm).padStart(2,'0')}`;
};
const fmtRanges = (ranges) => ranges.map(([a,b]) => `${fmtH(a)}–${fmtH(b)}`).join(', ');

// ============================================================
// VARIANT A — Compact side card
// 3 states: collapsed → week (current period) → periods (all)
// ============================================================
function OpeningPeriodsA() {
  const [view, setView] = useStateOP('collapsed'); // 'collapsed' | 'week' | 'periods'
  const [selKey, setSelKey] = useStateOP('inter'); // selected period in 'periods' view
  const sel = PERIODS.find(p => p.key === selKey);
  const nowPct = (135 / 365) * 100;

  return (
    <div className={'op opA is-' + view}>
      <div className="op__head">
        <h3 className="op__title">Périodes d'ouverture</h3>
        <a className="op__more">Modifier ›</a>
      </div>

      <button className="opA__hero opA__hero--btn"
          onClick={() => setView(v => v === 'collapsed' ? 'week' : 'collapsed')}
          aria-expanded={view !== 'collapsed'}>
        <span className="opA__hero-ind" aria-hidden="true"/>
        <div className="opA__hero-main">
          <div className="opA__hero-status">Ouvert · ferme à 18:00</div>
          <div className="opA__hero-sub">
            Aujourd'hui · <strong>09:00 – 12:00 · 14:00 – 18:00</strong>
          </div>
        </div>
        <span className="opA__hero-chev" aria-hidden="true">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6"/></svg>
        </span>
      </button>

      {view === 'collapsed' && (
        <div className="opA__collapsed-foot">
          <span className="opA__period opA__period--inline">
            <span className="swatch"/>
            Hors saison · jusqu'au 14 juin
          </span>
          <button className="opA__see-all" onClick={() => setView('week')}>
            Voir la semaine
          </button>
        </div>
      )}

      {view === 'week' && (
        <div className="opA__reveal">
          <div className="opA__period">
            <span className="swatch"/>
            Hors saison · jusqu'au 14 juin
          </div>

          <PeriodWeekStack period={PERIODS[1]} highlightToday/>

          <div className="opA__excep">
            <span className="opA__excep-icon">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 8v5M12 16.5v.1"/></svg>
            </span>
            <div>
              <strong>2 fermetures exceptionnelles</strong> à venir · 15 août, 01 nov.
            </div>
          </div>

          <button className="opA__see-all opA__see-all--full" onClick={() => setView('periods')}>
            Toutes les périodes
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="m9 18 6-6-6-6"/></svg>
          </button>
        </div>
      )}

      {view === 'periods' && (
        <div className="opA__reveal opA__periods">
          <button className="opA__back" onClick={() => setView('week')}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="m15 18-6-6 6-6"/></svg>
            Semaine en cours
          </button>

          <div className="opA__ribbon">
            {RIBBON_SEGS.map((s, i) => (
              <button key={i}
                  className={'opA__ribbon-seg ' + s.kind + (s.periodKey === selKey ? ' is-on' : '')}
                  style={{
                    left: `${(s.start / 12) * 100}%`,
                    width: `${((s.end - s.start) / 12) * 100}%`,
                  }}
                  onClick={() => setSelKey(s.periodKey)}
                  title={PERIODS.find(p => p.key === s.periodKey).name}/>
            ))}
            <div className="opA__now-mark" style={{ left: `${nowPct}%` }}/>
          </div>

          <div className="opA__scale">
            {MONTHS.map(m => <span key={m}>{m[0]}</span>)}
          </div>

          <div className="opA__period-detail">
            <div className="opA__period-head">
              <span className={'swatch ' + sel.kind}/>
              <div>
                <div className="opA__period-name">
                  {sel.name}
                  {sel.key === 'inter' && <span className="opA__period-now">en cours</span>}
                </div>
                <div className="opA__period-range">{sel.range}</div>
              </div>
            </div>

            {sel.kind === 'shut'
              ? <div className="opA__period-shut">Établissement fermé pendant cette période.</div>
              : <PeriodWeekStack period={sel} highlightToday={sel.key === 'inter'}/>
            }
          </div>
        </div>
      )}
    </div>
  );
}

// Shared compact weekly stack used in A.week and A.periods
function PeriodWeekStack({ period, highlightToday }) {
  const span = 14, left = 8;
  return (
    <div className="opA__week">
      {period.hours.map((day, i) => {
        const isToday = highlightToday && i === TODAY.dayIdx;
        return (
          <div key={day.d}
              className={'opA__day' + (day.open ? '' : ' is-closed') + (isToday ? ' is-today' : '')}>
            <div className="opA__day-name">{day.d}</div>
            <div className="opA__day-bar">
              {day.open && day.ranges.map(([s, e], j) => (
                <span key={j} className="seg" style={{
                  left: `${((s - left) / span) * 100}%`,
                  width: `${((e - s) / span) * 100}%`,
                }}/>
              ))}
            </div>
            <div className="opA__day-hrs">
              {day.open ? day.ranges.map(([s, e]) => `${fmtH(s)}–${fmtH(e)}`).join(' · ') : 'Fermé'}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ============================================================
// VARIANT B — Annual ribbon (12 months) · clickable segments
// ============================================================
function OpeningPeriodsB() {
  const [selKey, setSelKey] = useStateOP('inter'); // current period by default
  const sel = PERIODS.find(p => p.key === selKey);
  const isNow = selKey === 'inter';
  const nowPct = (135 / 365) * 100; // 15 May ≈ 37%

  return (
    <div className="op opB">
      <div className="op__head">
        <h3 className="op__title">Périodes d'ouverture · vue annuelle</h3>
        <a className="op__more">Modifier ›</a>
      </div>

      <div className="opB__top">
        <div className="opB__status">
          <span className="opB__pill"><span className="dot"/>Ouvert · ferme à 18:00</span>
          <span className="opB__until">Hors saison · <strong>jusqu'au 14 juin</strong></span>
        </div>
        <div className="opB__legend">
          <span><i style={{ background: 'var(--op-high)' }}/>Haute saison</span>
          <span><i style={{ background: 'var(--op-low)' }}/>Hors saison</span>
          <span><i style={{ background: 'var(--op-shut)' }}/>Fermé</span>
        </div>
      </div>

      <div className="opB__ribbon">
        {RIBBON_SEGS.map((s, i) => (
          <button key={i}
              className={'opB__seg ' + s.kind + (s.periodKey === selKey ? ' is-selected' : '')}
              style={{
                left: `${(s.start / 12) * 100}%`,
                width: `${((s.end - s.start) / 12) * 100}%`,
              }}
              onClick={() => setSelKey(s.periodKey)}>
            <span className="opB__seg-label">{s.abbr}</span>
          </button>
        ))}
        <div className="opB__now-mark" style={{ left: `${nowPct}%` }}/>
      </div>

      <div className="opB__scale">
        {MONTHS.map(m => <span key={m}>{m}</span>)}
      </div>

      <div className="opB__detail">
        <div className="opB__detail-l">
          <div className="opB__detail-eyebrow">
            {isNow ? 'Période en cours' : 'Période sélectionnée'}
          </div>
          <h4 className="opB__detail-name">
            <i style={{ background: `var(--op-${sel.kind})` }}/>
            {sel.name}
            {isNow && <span className="opB__now-chip">en cours</span>}
          </h4>
          <div className="opB__detail-range">{sel.range}</div>
          <dl className="opB__detail-meta">
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <dt>Résumé</dt><dd>{sel.summary}</dd>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <dt>Bascule suivante</dt><dd>{sel.nextSwitch}</dd>
            </div>
          </dl>
        </div>

        <div>
          <div className="opB__detail-eyebrow" style={{ marginBottom: 6 }}>Semaine type</div>
          {sel.kind === 'shut' ? (
            <div className="opB__week-shut">Établissement fermé pendant cette période.</div>
          ) : (
            <div className="opB__week">
              {sel.hours.map((day, i) => {
                const isToday = isNow && i === TODAY.dayIdx;
                const span = 14, left = 8;
                return (
                  <div key={day.d}
                      className={'opB__week-day' + (!day.open ? ' is-closed' : '') + (isToday ? ' is-today' : '')}>
                    <div className="opB__week-day-name">{day.d}</div>
                    <div className="opB__week-day-cell">
                      {day.open && day.ranges.map(([s, e], j) => (
                        <span key={j} className="fill" style={{
                          top: `${((s - left) / span) * 100}%`,
                          height: `${((e - s) / span) * 100}%`,
                        }}/>
                      ))}
                    </div>
                    <div className="opB__week-day-hrs">
                      {day.open ? day.ranges.map(([s]) => `${fmtH(s).slice(0,2)}h`).join(' · ') : '—'}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ============================================================
// VARIANT C — Named period cards
// ============================================================
function OpeningPeriodsC() {
  const [open, setOpen] = useStateOP({ inter: true });
  const toggle = (k) => setOpen(o => ({ ...o, [k]: !o[k] }));

  return (
    <div className="op opC">
      <div className="op__head">
        <h3 className="op__title">Périodes d'ouverture · 3 saisons · 4 exceptions</h3>
        <a className="op__more">+ Ajouter une période</a>
      </div>

      {PERIODS.map(p => {
        const isNow = p.key === 'inter';
        const isOpen = !!open[p.key];
        const daysOpen = p.hours.filter(h => h.open).length;
        return (
          <div key={p.key} className={'opC__card ' + p.kind + (isNow ? ' is-now' : '') + (isOpen ? ' is-open' : '')}>
            <div className="opC__card-head" onClick={() => toggle(p.key)}>
              <span className="opC__card-stripe"/>
              <div className="opC__card-info">
                <div className="opC__card-name">
                  {p.name}
                  {isNow && <span className="opC__card-now">en cours</span>}
                </div>
                <div className="opC__card-range">{p.range}</div>
              </div>
              <div className="opC__card-summary">
                {p.kind === 'shut'
                  ? <span style={{ color: 'var(--ink-3)' }}>Établissement fermé</span>
                  : <span><strong>{daysOpen}/7 j.</strong> · {p.hours.find(h => h.open).ranges.length === 1 ? 'continu' : 'avec coupure'}</span>}
                <span className="opC__chev">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="m6 9 6 6 6-6"/></svg>
                </span>
              </div>
            </div>
            {isOpen && p.kind !== 'shut' && (
              <div className="opC__card-body">
                <div className="opC__week">
                  {p.hours.map((d, i) => (
                    <div key={d.d}
                        className={'opC__week-cell' + (d.open ? '' : ' closed') + (isNow && i === TODAY.dayIdx ? ' is-today' : '')}>
                      <div className="d">{d.d}</div>
                      <div className="h">
                        {d.open
                          ? d.ranges.map(([s,e], j) => (
                              <div key={j}>{fmtH(s)}<br/>{fmtH(e)}</div>
                            ))
                          : 'Fermé'}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        );
      })}

      <div className="opC__excep-card">
        <div className="opC__excep-head">
          <h4>Fermetures & ouvertures exceptionnelles</h4>
          <a className="op__more">+ Ajouter</a>
        </div>
        <div className="opC__excep-list">
          {EXCEPTIONS.map((e, i) => (
            <div key={i} className="opC__excep-row">
              <span className="date">{e.date}</span>
              <span className="reason">
                {e.reason}
                {e.hours && <span style={{ color: 'var(--ink-4)', marginLeft: 6, fontFamily: 'var(--font-mono)', fontSize: 11 }}>{e.hours}</span>}
              </span>
              <span className={'status ' + e.status}>
                {e.status === 'closed' ? 'Fermé' : 'Spécial'}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ============================================================
// VARIANT D — Month calendar
// ============================================================
function OpeningPeriodsD() {
  const [selected, setSelected] = useStateOP(15); // 15 May = today

  // May 2026: starts Fri (index 4 in mon-start week)
  // Mon=0, Tue=1, ... Sun=6
  // 1 May 2026 = Friday → leading offset = 4 (Mon, Tue, Wed, Thu)
  const daysInMay = 31;
  const leading = 4; // Mon..Thu
  const trailing = 7 - ((leading + daysInMay) % 7);

  // Get period for a given day in May
  // May is in "Hors saison" entirely (Hors saison: 16 sept → 14 nov + 16 fév → 14 juin)
  // Exception: nothing in May for our mock
  const periodForDay = () => 'low';

  // Day of week for a date in May 2026 (1 May = Fri = idx 4)
  const dowOf = (d) => (4 + (d - 1)) % 7;

  const dayInfo = (d) => {
    const dow = dowOf(d);
    const hours = ACTIVE_PERIOD.hours[dow];
    return { dow, hours, period: periodForDay(d) };
  };

  const days = [];
  for (let i = 0; i < leading; i++) {
    const dApr = 27 + i;
    days.push({ day: dApr, muted: true, kind: 'low', closed: dowOf(1 - (leading - i)) === 0 });
  }
  for (let d = 1; d <= daysInMay; d++) {
    const info = dayInfo(d);
    days.push({
      day: d,
      muted: false,
      kind: info.period,
      closed: !info.hours.open,
      ranges: info.hours.ranges,
      excep: d === 8 || d === 25, // mock 8 May = Victoire 1945, 25 May = Pentecôte
    });
  }
  for (let i = 0; i < trailing; i++) {
    days.push({ day: i + 1, muted: true, kind: 'low' });
  }

  const sel = selected ? dayInfo(selected) : null;

  return (
    <div className="op opD">
      <div className="op__head">
        <h3 className="op__title">Périodes d'ouverture · calendrier</h3>
        <a className="op__more">Modifier ›</a>
      </div>

      <div className="opD__top">
        <div className="opD__nav">
          <button>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="m15 18-6-6 6-6"/></svg>
          </button>
          <span className="label">Mai 2026</span>
          <button>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="m9 18 6-6-6-6"/></svg>
          </button>
        </div>
        <div className="opD__viewtoggle">
          <button>Année</button>
          <button className="is-on">Mois</button>
          <button>Semaine</button>
        </div>
      </div>

      <div className="opD__grid">
        {['Lun','Mar','Mer','Jeu','Ven','Sam','Dim'].map(d => (
          <div key={d} className="opD__weekday">{d}</div>
        ))}
        {days.map((d, i) => {
          const isToday = !d.muted && d.day === 15;
          const isSel = !d.muted && d.day === selected;
          const cls = ['opD__cell'];
          if (d.muted) cls.push('muted');
          if (d.closed) cls.push('closed');
          else cls.push(d.kind);
          if (isToday) cls.push('is-today');
          if (isSel && !isToday) cls.push('is-selected');
          if (d.excep) cls.push('excep');
          return (
            <div key={i} className={cls.join(' ')}
                onClick={() => !d.muted && setSelected(d.day)}>
              <span className="num">{d.day}</span>
              {!d.muted && !d.closed && d.ranges && d.ranges[0] && (
                <span className="hrs">{fmtH(d.ranges[0][0]).slice(0,2)}h–{fmtH(d.ranges[d.ranges.length-1][1]).slice(0,2)}h</span>
              )}
              <span className="bar"/>
            </div>
          );
        })}
      </div>

      <div className="opD__footer">
        <div className="opD__selected">
          <div>
            <div className="opD__selected-date">
              {selected && (sel.hours.open ? `${selected} mai · ouvert` : `${selected} mai · fermé`)}
            </div>
            <div className="opD__selected-hrs">
              {sel && sel.hours.open ? fmtRanges(sel.hours.ranges) : 'Établissement fermé ce jour'}
            </div>
          </div>
          <span className="opD__selected-period low">
            <i style={{ width: 8, height: 8, borderRadius: 2, background: 'currentColor', display: 'inline-block' }}/>
            Hors saison
          </span>
        </div>
        <div className="opD__legend-d">
          <span><i style={{ background: 'var(--op-high)' }}/>Haute</span>
          <span><i style={{ background: 'var(--op-low)' }}/>Hors saison</span>
          <span><i style={{ background: 'var(--red)', opacity: 0.5 }}/>Fermé</span>
          <span><i style={{ width: 5, height: 5, borderRadius: 999, background: 'var(--orange)' }}/>Exception</span>
        </div>
      </div>
    </div>
  );
}

window.OpeningPeriodsA = OpeningPeriodsA;
window.OpeningPeriodsB = OpeningPeriodsB;
window.OpeningPeriodsC = OpeningPeriodsC;
window.OpeningPeriodsD = OpeningPeriodsD;
