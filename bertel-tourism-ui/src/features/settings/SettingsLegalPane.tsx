import Link from 'next/link';
import type { UserRole } from '../../types/domain';

export function SettingsLegalPane({ role }: { role: UserRole | null }) {
  return (
<section className="settings-pane">
        <div className="settings-pane__head">
          <div>
            <h2>Mentions légales</h2>
            <p>Documents de référence : confidentialité, conditions d’utilisation et analyse d’impact (RGPD).</p>
          </div>
        </div>
        <div className="settings-pane__demo">
          <ul className="legal-links">
            <li>
              <a href="/legal/rgpd.html" target="_blank" rel="noopener noreferrer">Politique de confidentialité</a>
              <span className="pref__hint">Traitement des données personnelles, base légale et durées de conservation (RGPD).</span>
            </li>
            <li>
              <a href="/legal/cgu.html" target="_blank" rel="noopener noreferrer">Conditions générales d’utilisation</a>
              <span className="pref__hint">Règles d’accès et d’usage de la plateforme.</span>
            </li>
            <li>
              <a href="/legal/dpia.html" target="_blank" rel="noopener noreferrer">Analyse d’impact (AIPD)</a>
              <span className="pref__hint">Évaluation des risques du traitement sur la vie privée.</span>
            </li>
          </ul>
          <p className="pref__hint">
            Pour exercer vos droits (accès, rectification, effacement), consultez la{' '}
            <a href="/legal/rgpd.html" target="_blank" rel="noopener noreferrer">politique de confidentialité</a>{' '}
            ou contactez le responsable de traitement. En cas de désaccord persistant, vous pouvez saisir la{' '}
            <a href="https://www.cnil.fr" target="_blank" rel="noopener noreferrer">CNIL</a>.
          </p>
          {(role === 'owner' || role === 'super_admin') && (
            <p className="pref__hint">
              Administration : le module{' '}
              <Link href="/rgpd">RGPD &amp; droits des personnes</Link>{' '}
              permet de traiter les demandes d’effacement.
            </p>
          )}
        </div>
      </section>
  );
}
