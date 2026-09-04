'use client';

/**
 * « Vérifiez ces informations » — ce que le partenaire ne peut PAS modifier lui-même
 * (le nom, le type, l'adresse, le téléphone publié), et la seule chose qu'il peut en
 * faire : signaler une erreur.
 *
 * JAMAIS UNE IMPASSE. `submit_actor_fiche` exige au moins une modification : si le
 * signalement est la SEULE chose saisie, il ne partira pas tout seul. La carte le dit,
 * et donne les deux voies immédiates — l'e-mail et le TÉLÉPHONE de l'office. Le doublon
 * n'est pas décoratif : un `mailto:` échoue en silence sur un téléphone sans application
 * de courrier.
 *
 * Le texte est rangé dans le BROUILLON (clé `note`), pas dans un état d'écran : il peut
 * être la seule chose saisie, et un rechargement l'effacerait sans un mot.
 */
import { useState } from 'react';
import { CopyButton } from '../../components/common/CopyButton';
import { composePortalNote, readPortalMessage, readPortalReport } from './portal-note';

export function PortalVerifyCard({
  ficheName,
  typeLabel,
  address,
  publicPhone,
  officeEmail,
  officePhone,
  note,
  onNoteChange,
  hasPendingChanges,
}: {
  ficheName: string;
  typeLabel: string;
  address: string;
  publicPhone: string;
  officeEmail: string | null;
  officePhone: string | null;
  note: string;
  onNoteChange: (value: string) => void;
  /** Au moins une rubrique modifiée : le message partira avec l'envoi. */
  hasPendingChanges: boolean;
}) {
  // §212 — l'état se resynchronise PENDANT LE RENDU sur la note. `usePortalDraft` la
  // restaure dans un EFFET : au premier rendu elle vaut '', et un `useState` figé laissait
  // la carte fermée sur un texte vide pour toujours. Le partenaire ne voyait alors son
  // signalement NULLE PART (sans rubrique modifiée il n'y a ni barre ni fenêtre d'envoi),
  // le rouvrait, trouvait un champ vide, et un simple clic ailleurs l'effaçait.
  const reported = readPortalReport(note);
  const [state, setState] = useState({ note, text: reported, open: reported !== '' });
  if (state.note !== note) {
    const fresh = readPortalReport(note);
    setState({ note, text: fresh, open: fresh !== '' || state.open });
  }
  const { text, open } = state;
  const setText = (value: string) => setState((previous) => ({ ...previous, text: value }));

  // On ne remplace que NOTRE part : le message libre écrit dans la fenêtre d'envoi
  // traverse intact, et vider le signalement ne laisse pas le préfixe orphelin.
  function save() {
    onNoteChange(composePortalNote(text, readPortalMessage(note)));
  }

  return (
    <section className="portal-card portal-verify" aria-labelledby="portal-verify-title">
      <h2 id="portal-verify-title">Vérifiez ces informations</h2>
      <dl className="portal-verify__list">
        <div>
          <dt>Nom</dt>
          <dd>{ficheName}</dd>
        </div>
        <div>
          <dt>Type de fiche</dt>
          <dd>{typeLabel || 'Non précisé'}</dd>
        </div>
        <div>
          <dt>Adresse</dt>
          <dd>{address || 'Non précisée'}</dd>
        </div>
        <div>
          <dt>Téléphone publié</dt>
          <dd>{publicPhone || 'Non précisé'}</dd>
        </div>
      </dl>
      <p className="muted">Ces informations sont tenues par l’office. Si l’une d’elles est fausse, dites-le-lui.</p>

      {open ? (
        <div className="auth-field">
          <label htmlFor="portal-report">Dites-nous ce qui est faux</label>
          <textarea
            id="portal-report"
            className="portal-input"
            rows={3}
            value={text}
            onChange={(event) => setText(event.target.value)}
            onBlur={save}
          />
          <button type="button" className="ghost-button" onClick={save}>
            Garder ce signalement
          </button>
          {!hasPendingChanges ? (
            <div className="notice">
              <span>
                Ce message partira avec votre prochain envoi. Pour prévenir l’office tout de suite :
                {officeEmail || officePhone ? (
                  <span className="portal-verify__contacts">
                    {officeEmail ? (
                      <span className="portal-copy">
                        <a href={`mailto:${officeEmail}`}>{officeEmail}</a>
                        <CopyButton
                          className="ghost-button"
                          value={officeEmail}
                          label="Copier l’adresse e-mail"
                          visibleLabel="Copier l’adresse e-mail"
                        />
                      </span>
                    ) : null}
                    {officePhone ? <a href={`tel:${officePhone.replace(/\s/g, '')}`}>{officePhone}</a> : null}
                  </span>
                ) : (
                  <> Contactez votre office de tourisme.</>
                )}
              </span>
            </div>
          ) : null}
        </div>
      ) : (
        <button
          type="button"
          className="ghost-button"
          onClick={() => setState((previous) => ({ ...previous, open: true }))}
        >
          Signaler une erreur
        </button>
      )}
    </section>
  );
}
