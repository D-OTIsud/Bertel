
export function SettingsDiagnosticPane({ env, demoMode, theme, logoSourceLabel }: { env: { supabaseUrl?: string }; demoMode: boolean; theme: { brandName: string }; logoSourceLabel: string }) {
  return (
<section className="settings-pane">
        <div className="settings-pane__head">
          <div>
            <h2>Diagnostic</h2>
            <p>État technique de l’environnement (lecture seule).</p>
          </div>
        </div>
        <div className="diag__body" style={{ maxWidth: 640 }}>
          <div className="diag__line"><span className="muted">Environnement Supabase</span><span className="mono">{env.supabaseUrl ? 'configuré' : 'à renseigner'}</span></div>
          <div className="diag__line"><span className="muted">Mode démonstration</span><span className="mono">{demoMode ? 'oui' : 'non'}</span></div>
          <div className="diag__line"><span className="muted">Marque active</span><span className="mono">{theme.brandName}</span></div>
          <div className="diag__line"><span className="muted">Source du logo</span><span className="mono">{logoSourceLabel}</span></div>
        </div>
      </section>
  );
}
