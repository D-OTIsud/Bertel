/**
 * « Vos photos » — LECTURE SEULE (D7/D11).
 *
 * La route `/api/media/upload` refuse la persona partenaire en 403 : un bouton « Ajouter »
 * échouerait TOUJOURS. L'écran dit la vérité et donne les chemins qui marchent — l'e-mail
 * ET le téléphone, parce qu'un `mailto:` échoue EN SILENCE sur un téléphone sans
 * application de courrier.
 */
import { render, screen } from '@testing-library/react';
import { PhotosRubric, PORTAL_PHOTO_TARGET, countPortalPhotos } from './PhotosRubric';
import type { ObjectWorkspaceMediaModule } from '../../../services/object-workspace-parser';

const photo = (over: Record<string, unknown> = {}) =>
  ({
    id: 'm1',
    scope: 'object',
    typeCode: 'photo',
    kind: 'photo',
    title: '',
    url: 'https://example.re/1.jpg',
    isMain: false,
    ...over,
  }) as never;

const media = (over: Partial<ObjectWorkspaceMediaModule> = {}): ObjectWorkspaceMediaModule =>
  ({
    objectItems: [],
    placeItems: [],
    typeOptions: [],
    tagOptions: [],
    unavailableReason: null,
    placeScopeUnavailableReason: null,
    ...over,
  }) as unknown as ObjectWorkspaceMediaModule;

function setup(over: Partial<React.ComponentProps<typeof PhotosRubric>> = {}) {
  render(
    <PhotosRubric
      media={media()}
      ficheName="Le Longanis"
      officeEmail="contact@oti.re"
      officePhone="0262 00 00 00"
      {...over}
    />,
  );
}

describe('PhotosRubric', () => {
  it('n’offre AUCUN moyen d’ajouter une photo (la route refuse la persona acteur en 403)', () => {
    setup({ media: media({ objectItems: [photo()] }) });

    expect(screen.queryByRole('button', { name: /Ajouter/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    expect(document.querySelector('input[type="file"]')).toBeNull();
  });

  it('rend chaque photo avec un texte de remplacement, et nomme la principale', () => {
    setup({
      media: media({
        objectItems: [photo({ id: 'm1', title: 'La terrasse', isMain: true }), photo({ id: 'm2', title: '' })],
      }),
    });

    expect(screen.getByAltText('La terrasse')).toBeInTheDocument();
    // Une photo sans titre garde un alt utile plutôt qu'un attribut vide.
    expect(screen.getByAltText('Photo 2')).toBeInTheDocument();
    expect(screen.getByText('Photo principale')).toBeInTheDocument();
  });

  it('sans photo : le dit, sans grille vide', () => {
    setup();
    expect(screen.getByText('Aucune photo pour l’instant.')).toBeInTheDocument();
  });

  it('chargement des médias en échec : le dit, au lieu de faire croire à zéro photo', () => {
    setup({ media: media({ unavailableReason: 'Lecture des médias impossible.' }) });

    expect(screen.getByText(/Nous n’avons pas pu afficher vos photos/)).toBeInTheDocument();
    expect(screen.queryByText('Aucune photo pour l’instant.')).not.toBeInTheDocument();
  });

  it('propose l’envoi par e-mail avec l’objet pré-rempli, ET le téléphone en second chemin', () => {
    setup();

    expect(screen.getByRole('link', { name: 'Envoyer mes photos par e-mail' })).toHaveAttribute(
      'href',
      'mailto:contact@oti.re?subject=Photos%20%E2%80%94%20Le%20Longanis',
    );
    expect(screen.getByRole('link', { name: '0262 00 00 00' })).toHaveAttribute('href', 'tel:0262000000');
  });

  it('la copie de l’adresse porte un LIBELLÉ VISIBLE, pas une icône seule', () => {
    setup();
    const copy = screen.getByRole('button', { name: 'Copier l’adresse e-mail' });
    expect(copy).toHaveTextContent('Copier l’adresse e-mail');
  });

  it('sans e-mail d’office : le téléphone prend le relais', () => {
    setup({ officeEmail: null });

    expect(screen.queryByRole('link', { name: 'Envoyer mes photos par e-mail' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: '0262 00 00 00' })).toBeInTheDocument();
  });

  it('sans e-mail NI téléphone : une phrase, jamais un bouton mort', () => {
    setup({ officeEmail: null, officePhone: null });

    expect(screen.getByText('Contactez votre office de tourisme.')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /e-mail/ })).not.toBeInTheDocument();
  });
});

describe('countPortalPhotos', () => {
  it('ne compte que les photos, jamais les brochures ni les vidéos', () => {
    expect(
      countPortalPhotos(
        media({
          objectItems: [
            photo({ id: 'a' }),
            photo({ id: 'b', typeCode: 'brochure', kind: 'document' }),
            photo({ id: 'c', typeCode: 'video', kind: 'video' }),
          ],
        }),
      ),
    ).toBe(1);
  });

  it('une tranche absente vaut zéro, sans jeter', () => {
    expect(countPortalPhotos(undefined)).toBe(0);
  });

  it('l’objectif affiché est celui de la maquette', () => {
    expect(PORTAL_PHOTO_TARGET).toBe(4);
  });
});
