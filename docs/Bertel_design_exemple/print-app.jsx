/* global React, ReactDOM, Sidebar, TopBar, Explorer, DetailDrawer, EditDrawer */

function Page({ tag, drawer, children }) {
  return (
    <section className={'print-page' + (drawer ? ' print-page--drawer' : '')}>
      <div className="print-page-tag">{tag}</div>
      {children}
    </section>
  );
}

function PrintApp() {
  const noop = () => {};
  return (
    <>
      <Page tag="01 · Explorer · liste + carte">
        <div className="app">
          <Sidebar active="explorer" onChange={noop}/>
          <div className="work">
            <TopBar/>
            <Explorer onOpen={noop}/>
          </div>
        </div>
      </Page>

      <Page tag="02 · Fiche détail · A la Kaz Ti Zozeff" drawer>
        <DetailDrawer onClose={noop} onEdit={noop}/>
      </Page>

      <Page tag="03 · Édition · Taxonomie" drawer>
        <EditDrawer onClose={noop} onPreview={noop}/>
      </Page>
    </>
  );
}

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<PrintApp/>);
