
// 7.1 — libellés complets des langues d'interface (fidélité maquette : « Français » plutôt
// que « FR »). L'ordre suit l'ordre d'affichage des chips.
const LANGUAGE_LABELS: Record<string, string> = { fr: 'Français', en: 'English', de: 'Deutsch' };

export function SettingsPreferencesPane({ langPrefs, toggleLanguage }: { langPrefs: string[]; toggleLanguage: (lang: string) => void }) {
  return (
<section className="settings-pane">
        <div className="settings-pane__head">
          <div>
            <h2>Préférences</h2>
            <p>Vos réglages personnels d’interface.</p>
          </div>
        </div>
        <div className="settings-pane__demo">
          <div className="pref__label">Langue de l’interface</div>
          <div className="chip-grid">
            {['fr', 'en', 'de'].map((lang) => (
              <button
                key={lang}
                type="button"
                className={langPrefs.includes(lang) ? 'chip chip--active' : 'chip'}
                aria-pressed={langPrefs.includes(lang)}
                onClick={() => toggleLanguage(lang)}
              >
                {LANGUAGE_LABELS[lang] ?? lang.toUpperCase()}
              </button>
            ))}
          </div>
          <p className="pref__hint">Au moins une langue reste active. Enregistré sur votre profil.</p>
        </div>
      </section>
  );
}
