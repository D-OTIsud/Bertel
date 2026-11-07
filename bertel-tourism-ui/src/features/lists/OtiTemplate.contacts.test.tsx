import { render, screen } from '@testing-library/react';
import OtiTemplate, { type OtiPoi } from './OtiTemplate';

// Les coordonnées d'un lieu (téléphone, site, itinéraire) sont l'information UTILE d'une
// sélection envoyée à un visiteur : elles doivent être LISIBLES dans les trois templates.
// Le template Grille les rendait en pastilles icône-seule (`iconsOnly`) : des boutons sans
// aucune information, et sans nom accessible (ni texte ni title) sur tel/web.
function poi(): OtiPoi {
  return {
    id: 'a',
    name: 'Le Longanis',
    typeCode: 'RES',
    city: 'Saint-Joseph',
    image: null,
    subtitle: null,
    note: null,
    lat: -21.38,
    lon: 55.61,
    phone: '0262 56 12 34',
    web: 'https://le-longanis.re/carte?fbclid=abc',
  };
}

describe.each(['carnet', 'grille', 'itineraire'] as const)('OtiTemplate — contacts (%s)', (template) => {
  it('affiche le numéro de téléphone, le domaine du site et le lien carte en toutes lettres', () => {
    render(
      <OtiTemplate
        template={template}
        lang="fr"
        accent="teal"
        name="Sélection test"
        items={[poi()]}
        showMap={false}
      />,
    );

    expect(screen.getByRole('link', { name: /0262 56 12 34/ })).toHaveAttribute('href', 'tel:0262561234');
    expect(screen.getByRole('link', { name: /le-longanis\.re/ })).toHaveAttribute(
      'href',
      'https://le-longanis.re/carte?fbclid=abc',
    );
    expect(screen.getByRole('link', { name: /Voir sur la carte/ })).toHaveAttribute(
      'href',
      'https://maps.google.com/?q=-21.38,55.61',
    );
  });
});
