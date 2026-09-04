'use client';

/**
 * « Vos photos » — LECTURE SEULE (D7/D11).
 *
 * La route `/api/media/upload` refuse la persona partenaire en 403 : un bouton « Ajouter une
 * photo » échouerait donc TOUJOURS. Plutôt qu'un bouton menteur, l'écran dit la vérité et
 * donne le chemin qui marche — l'e-mail à l'office, doublé du téléphone.
 *
 * Le doublon n'est pas décoratif : un `mailto:` échoue EN SILENCE sur un téléphone sans
 * application de courrier configurée (le cas le plus fréquent sur un appareil qui ne relève
 * ses messages que dans une application web). D'où aussi la copie de l'adresse, avec un
 * libellé VISIBLE — `CopyButton` est une icône seule, et une icône seule ne se comprend pas.
 */
import { forwardRef } from 'react';
import { Mail, Phone } from 'lucide-react';
import { CopyButton } from '../../../components/common/CopyButton';
import type { ObjectWorkspaceMediaModule } from '../../../services/object-workspace-parser';

/** Le nombre de photos au-delà duquel une fiche « donne envie » (arbitrage PO, maquette). */
export const PORTAL_PHOTO_TARGET = 4;

export function countPortalPhotos(media: ObjectWorkspaceMediaModule | undefined): number {
  return (media?.objectItems ?? []).filter((item) => isPhoto(item.typeCode, item.kind)).length;
}

function isPhoto(typeCode: string, kind: string): boolean {
  const haystack = `${typeCode} ${kind}`.toLowerCase();
  return haystack.includes('photo') || haystack.includes('image');
}

/**
 * La référence est transmise pour que « Ajoutez des photos » puisse DÉPLACER LE FOCUS ici :
 * une ancre fait défiler sans bouger le focus, et un utilisateur au clavier reste là où il
 * était pendant que la page saute sous ses yeux.
 */
export const PhotosRubric = forwardRef<
  HTMLElement,
  {
    media: ObjectWorkspaceMediaModule | undefined;
    ficheName: string;
    officeEmail: string | null;
    officePhone: string | null;
  }
>(function PhotosRubric({ media, ficheName, officeEmail, officePhone }, ref) {
  const photos = (media?.objectItems ?? []).filter((item) => isPhoto(item.typeCode, item.kind));

  return (
    <section className="portal-card portal-photos" aria-labelledby="portal-photos-title" ref={ref} tabIndex={-1}>
      <h2 id="portal-photos-title">Vos photos</h2>
      {media?.unavailableReason ? (
        <p className="notice notice--warn">
          Nous n’avons pas pu afficher vos photos pour le moment. Réessayez plus tard.
        </p>
      ) : photos.length === 0 ? (
        <p className="muted">Aucune photo pour l’instant.</p>
      ) : (
        <ul className="portal-gallery">
          {photos.map((photo, index) => (
            <li key={photo.id}>
              {/* eslint-disable-next-line @next/next/no-img-element -- média distant non optimisable */}
              <img src={photo.url} alt={photo.title || `Photo ${index + 1}`} loading="lazy" />
              {photo.isMain ? <span className="portal-gallery__tag">Photo principale</span> : null}
            </li>
          ))}
        </ul>
      )}

      <div className="notice">
        <Mail size={18} aria-hidden />
        <span>
          Pour l’instant, les photos sont ajoutées par l’office. Envoyez-lui vos plus belles photos (JPG ou PNG) et il
          les publiera pour vous. <span className="muted">(les photos de votre téléphone conviennent)</span>
        </span>
      </div>

      {officeEmail ? (
        <div className="portal-photos__actions">
          <a
            className="primary-button"
            href={`mailto:${officeEmail}?subject=${encodeURIComponent(`Photos — ${ficheName}`)}`}
          >
            Envoyer mes photos par e-mail
          </a>
          <span className="portal-copy">
            <span className="portal-copy__value">{officeEmail}</span>
            <CopyButton className="ghost-button" value={officeEmail} label="Copier l’adresse e-mail" visibleLabel="Copier l’adresse e-mail" />
          </span>
          {officePhone ? (
            <p className="muted">
              {/* Le second chemin, quand le courrier ne s'ouvre pas : un numéro, appelable. */}
              <Phone size={16} aria-hidden /> Vous pouvez aussi appeler l’office au{' '}
              <a href={`tel:${officePhone.replace(/\s/g, '')}`}>{officePhone}</a>.
            </p>
          ) : null}
        </div>
      ) : officePhone ? (
        <p className="muted">
          Appelez votre office de tourisme au <a href={`tel:${officePhone.replace(/\s/g, '')}`}>{officePhone}</a> pour
          lui transmettre vos photos.
        </p>
      ) : (
        <p className="muted">Contactez votre office de tourisme.</p>
      )}
    </section>
  );
});
