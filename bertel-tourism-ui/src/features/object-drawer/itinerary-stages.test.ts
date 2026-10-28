import { buildItineraryStages } from './itinerary-stages';
import { parseMedia } from './utils';

describe('buildItineraryStages', () => {
  it('renvoie vide sans étape', () => {
    expect(buildItineraryStages({})).toEqual([]);
    expect(buildItineraryStages({ stages: [] })).toEqual([]);
  });

  it('lit les étapes RÉELLES (nom, type, description) — pas d’interpolation', () => {
    const rows = buildItineraryStages({
      stages: [
        { id: 's1', name: 'Départ du Bloc', description: 'Parking', extra: { kind: 'start_point' } },
        { id: 's2', name: 'Sommet du Piton', extra: { kind: 'viewpoint' } },
      ],
    });
    expect(rows).toHaveLength(2);
    expect(rows[0].name).toBe('Départ du Bloc');
    expect(rows[0].description).toBe('Parking');
    expect(rows[0].kindLabel).toBe('Start point');
    expect(rows[0].positionLabel).toBe('Étape 1');
    expect(rows[1].name).toBe('Sommet du Piton');
    expect(rows[1].positionLabel).toBe('Étape 2');
  });

  it('ne fabrique PAS de nom pour une étape sans nom (name reste vide)', () => {
    const rows = buildItineraryStages({ stages: [{ description: 'Passage technique' }] });
    expect(rows).toHaveLength(1);
    expect(rows[0].name).toBe('');
    expect(rows[0].positionLabel).toBe('Étape 1');
    expect(rows[0].description).toBe('Passage technique');
  });

  it('écarte une étape totalement vide', () => {
    const rows = buildItineraryStages({ stages: [{ id: 'empty' }, { name: 'Vrai' }] });
    expect(rows.map((r) => r.name)).toEqual(['Vrai']);
    expect(rows[0].positionLabel).toBe('Étape 1');
  });

  it('conserve une étape n’ayant que des coordonnées', () => {
    const rows = buildItineraryStages({ stages: [{ id: 'p', lng: 55.5, lat: -21.1 }] });
    expect(rows).toHaveLength(1);
    expect(rows[0].name).toBe('');
    expect(rows[0].coordinates).toEqual([55.5, -21.1]);
  });

  it('conserve les descriptions Markdown même sans description aplatie', () => {
    const rows = buildItineraryStages({ stages: [{ description_md: 'Suivre **le balisage**.' }] });
    expect(rows).toHaveLength(1);
    expect(rows[0].descriptionMd).toBe('Suivre **le balisage**.');
  });

  it('ne place que des coordonnées GPS valides et conserve les étapes descriptives sans position', () => {
    const rows = buildItineraryStages({
      stages: [
        { name: 'Origine', lng: 0, lat: 0 },
        { name: 'Sans position', lng: null, lat: null },
        { name: 'Partiel', lng: 55.5 },
        { name: 'Infini', lng: Infinity, lat: -21 },
        { name: 'Hors limites', lng: 181, lat: 91 },
      ],
    });
    expect(rows).toHaveLength(5);
    expect(rows.map((row) => row.coordinates)).toEqual([[0, 0], null, null, null, null]);
    expect(new Set(rows.map((row) => row.anchorId)).size).toBe(5);
  });

  it('conserve une étape n’ayant que des médias', () => {
    const rows = buildItineraryStages({ stages: [{ id: 'm', media: [{ id: 'x', url: 'u' }] }] });
    expect(rows).toHaveLength(1);
  });

  it('préserve l’ordre serveur et numérote les étapes conservées de façon contiguë', () => {
    const rows = buildItineraryStages({
      stages: [
        { name: 'A' },
        { id: 'empty' },
        { name: 'B' },
      ],
    });
    expect(rows.map((r) => r.name)).toEqual(['A', 'B']);
    expect(rows.map((r) => r.positionLabel)).toEqual(['Étape 1', 'Étape 2']);
  });

  it('résout les media_id du RPC dans l’ordre des liens, indépendamment de la galerie objet', () => {
    const media = parseMedia({ media: [
      { id: 'first', url: 'https://example.com/first.jpg', title: 'Départ', description: 'Le sentier au départ', credit: 'Office de tourisme', is_main: true },
      { id: 'second', url: 'https://example.com/second.jpg', title: 'Sommet', position: 2 },
      { id: 'unlinked', url: 'https://example.com/other.jpg', title: 'Autre photo' },
    ] });
    const rows = buildItineraryStages({ stages: [
      { name: 'A', media: [
        { id: 'junction-2', media_id: 'second', position: 0 },
        { id: 'junction-1', media_id: 'first', position: 1 },
      ] },
      { name: 'B', media: [{ id: 'junction-3', media_id: 'first' }] },
      { name: 'Sans photo' },
    ] }, media);

    expect(rows[0].photos).toEqual([
      { id: 'second', url: 'https://example.com/second.jpg', title: 'Sommet' },
      { id: 'first', url: 'https://example.com/first.jpg', title: 'Départ', description: 'Le sentier au départ', credit: 'Office de tourisme' },
    ]);
    expect(rows[1].photos.map((photo) => photo.id)).toEqual(['first']);
    expect(rows[2].photos).toEqual([]);
  });

  it('ne remplace pas un média lié absent par une photo objet ou une URL du lien', () => {
    const media = parseMedia({ media: [{ id: 'other', url: 'https://example.com/other.jpg' }] });
    const rows = buildItineraryStages({ stages: [
      { name: 'Sans lien', media: [] },
      { name: 'Supprimé ou inaccessible', media: [
        { id: 'other', media_id: 'missing', url: 'https://example.com/stale.jpg' },
      ] },
    ] }, media);
    expect(rows.map((row) => row.photos)).toEqual([[], []]);
    expect(buildItineraryStages({ stages: [{ name: 'Sans galerie', media: [{ media_id: 'other' }] }] })[0].photos).toEqual([]);
  });

  it('projette les photos intégrées et leurs formats réels sans altérer les textes', () => {
    const rows = buildItineraryStages({ stages: [{
      description: 'Suivre le balisage.',
      description_md: 'Suivre **le balisage**.',
      media: [
        { id: 'cdn', url: 'https://images.example.com/photo-123?width=600', type_code: 'photo', title: 'Vue du cirque' },
        { id: 'nested', secure_url: 'https://example.com/nested', media_type: { code: 'photo' }, name: 'La forêt' },
        { url: 'https://example.com/trail.AVIF?token=abc#photo', alt_text: 'Le sentier' },
        { id: 'gif', url: 'http://example.com/view.gif' },
      ],
    }] });
    expect(rows[0]).toMatchObject({ name: '', positionLabel: 'Étape 1', description: 'Suivre le balisage.', descriptionMd: 'Suivre **le balisage**.' });
    expect(rows[0].photos).toEqual([
      { id: 'cdn', url: 'https://images.example.com/photo-123?width=600', title: 'Vue du cirque' },
      { id: 'nested', url: 'https://example.com/nested', title: 'La forêt' },
      { id: 'https://example.com/trail.AVIF?token=abc#photo', url: 'https://example.com/trail.AVIF?token=abc#photo', title: 'Le sentier', description: 'Le sentier' },
      { id: 'gif', url: 'http://example.com/view.gif', title: 'Media' },
    ]);
  });

  it('écarte les médias privés, partenaires, non publiés, non images et les URL invalides', () => {
    const unavailable = [
      { id: 'private', url: 'https://example.com/private.jpg', visibility: 'private' },
      { id: 'partners', url: 'https://example.com/partners.jpg', visibility: 'partners' },
      { id: 'video', url: 'https://example.com/video.jpg', type_code: 'video' },
      { id: 'pdf', url: 'https://example.com/guide.pdf' },
      { id: 'script', url: 'javascript:alert(1)', type_code: 'photo' },
      { id: 'invalid', url: 'https://', type_code: 'photo' },
      { id: 'relative', url: '/photo.jpg' },
      { id: 'protocol', url: 'https:photo.jpg', type_code: 'photo' },
      { id: 'blank', url: '', type_code: 'photo' },
    ];
    const media = parseMedia({ media: unavailable });
    const rows = buildItineraryStages({ stages: [
      { name: 'Liens', media: unavailable.map((item) => ({ media_id: item.id })) },
      { name: 'Intégrés', media: [...unavailable,
        { id: 'unpublished', url: 'https://example.com/draft.jpg', is_published: false },
        { id: 'public', url: 'https://example.com/public.webp', visibility: null },
      ] },
    ] }, media);
    expect(rows[0].photos).toEqual([]);
    expect(rows[1].photos.map((photo) => photo.id)).toEqual(['public']);
  });

  it('déduplique les photos par identifiant ou URL sans changer leur ordre', () => {
    const media = parseMedia({ media: [{ id: 'linked', url: 'https://example.com/a.jpg', title: 'A' }] });
    const rows = buildItineraryStages({ stages: [{ media: [
      { media_id: 'linked' },
      { media_id: 'linked' },
      { id: 'same-url', url: 'https://example.com/a.jpg' },
      { id: 'b', url: 'https://example.com/b.png' },
      { id: 'b', url: 'https://example.com/b-copy.png' },
      { url: 'https://example.com/c.webp' },
    ] }] }, media);
    expect(rows[0].photos.map((photo) => photo.url)).toEqual([
      'https://example.com/a.jpg', 'https://example.com/b.png', 'https://example.com/c.webp',
    ]);
    expect(rows[0].name).toBe('');
  });
});
