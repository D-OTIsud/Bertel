/* global React, ReactDOM, Sidebar, TopBar, Explorer, DetailDrawer, EditDrawer, TypeDetailPage, useTweaks, TweaksPanel, TweakSection, TweakRadio, TweakColor, TweakToggle, TweakSelect */
const { useState: useStateApp } = React;

const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "density": "comfortable",
  "accent": "#176b6a",
  "showSelbar": true,
  "viewMode": "explorer",
  "detailType": "HEB"
}/*EDITMODE-END*/;

function App() {
  const [view, setView] = useStateApp('explorer'); // explorer / detail / edit
  const [active, setActive] = useStateApp('explorer');
  const tw = (typeof useTweaks === 'function') ? useTweaks(TWEAK_DEFAULTS) : [TWEAK_DEFAULTS, () => {}];
  const tweaks = tw[0] || TWEAK_DEFAULTS;
  const setTweak = tw[1] || (() => {});

  // Apply accent color override
  React.useEffect(() => {
    if (tweaks.accent) document.documentElement.style.setProperty('--teal', tweaks.accent);
    if (tweaks.accent) document.documentElement.style.setProperty('--teal-2',
      shadeAccent(tweaks.accent, -0.15));
  }, [tweaks.accent]);

  React.useEffect(() => {
    document.body.classList.toggle('dense', tweaks.density === 'compact');
  }, [tweaks.density]);

  // Selection bar visibility
  React.useEffect(() => {
    const sb = document.querySelector('.selbar');
    if (sb) sb.style.display = tweaks.showSelbar ? '' : 'none';
  }, [tweaks.showSelbar, view]);

  return (
    <div className="app">
      <Sidebar active={active} onChange={setActive}/>
      <div className="work">
        <TopBar/>
        <Explorer onOpen={() => setView('detail')}/>
      </div>

      {view === 'detail' && (
        typeof TypeDetailPage === 'function' && tweaks.detailType && tweaks.detailType !== 'LEGACY' ? (
          <>
            <div className="scrim" onClick={() => setView('explorer')}/>
            <TypeDetailPage
              typeCode={tweaks.detailType}
              floating
              onClose={() => setView('explorer')}
              onEdit={() => setView('edit')}
            />
          </>
        ) : (
          <DetailDrawer
            onClose={() => setView('explorer')}
            onEdit={() => setView('edit')}/>
        )
      )}
      {view === 'edit' && (
        <EditDrawer
          onClose={() => setView('explorer')}
          onPreview={() => setView('detail')}/>
      )}

      {typeof TweaksPanel === 'function' && (
        <TweaksPanel title="Tweaks">
          <TweakSection title="Layout">
            <TweakRadio label="Densité" value={tweaks.density}
              options={[['comfortable','Confort'],['compact','Compact']]}
              onChange={v => setTweak('density', v)}/>
            <TweakToggle label="Barre de sélection" value={tweaks.showSelbar}
              onChange={v => setTweak('showSelbar', v)}/>
          </TweakSection>
          <TweakSection title="Couleur d'accent">
            <TweakColor label="Accent" value={tweaks.accent}
              options={['#176b6a','#1e7491','#c96d3b','#5a4fcf','#2a7a45']}
              onChange={v => setTweak('accent', v)}/>
          </TweakSection>
          <TweakSection title="Vue">
            <TweakRadio label="Écran" value={view}
              options={[['explorer','Explorer'],['detail','Détail'],['edit','Édition']]}
              onChange={v => setView(v)}/>
            {typeof TweakSelect === 'function' ? (
              <TweakSelect label="Type d'objet (détail)" value={tweaks.detailType}
                options={[
                  ['HEB',"Hébergement (HOT · HLO · HPA · CAMP · RVA)"],
                  ['RES','Restaurant (RES)'],
                  ['ASC','Activité (ASC)'],
                  ['ITI','Itinéraire (ITI · FMA) — map-first'],
                  ['VIS','Site & visite (LOI · PCU · PNA)'],
                  ['SRV','Service & commerce (PSV · SRV · COM · VIL)'],
                  ['LEGACY','— Ancienne fiche HLO'],
                ]}
                onChange={v => { setTweak('detailType', v); setView('detail'); }}/>
            ) : null}
          </TweakSection>
        </TweaksPanel>
      )}
    </div>
  );
}

function shadeAccent(hex, pct) {
  const c = hex.replace('#','');
  const num = parseInt(c, 16);
  let r = (num >> 16) & 0xff;
  let g = (num >> 8) & 0xff;
  let b = num & 0xff;
  r = Math.max(0, Math.min(255, Math.round(r + r * pct)));
  g = Math.max(0, Math.min(255, Math.round(g + g * pct)));
  b = Math.max(0, Math.min(255, Math.round(b + b * pct)));
  return '#' + [r,g,b].map(n => n.toString(16).padStart(2,'0')).join('');
}

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<App/>);
