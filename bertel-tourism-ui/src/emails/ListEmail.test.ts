import { listEmailSubject, renderListEmailHtml, type ListEmailData } from './ListEmail';

const base: ListEmailData = {
  name: 'Immersion créole & saveurs',
  intro: 'Bonjour, préparez vos papilles !',
  advisorName: 'Delphine Grondin',
  publicUrl: 'https://sud.reunion.fr/l/tok123',
  accentInk: '#b34b3d',
  lang: 'fr',
  coverUrl: null,
  items: [{ name: 'Le Manapany', typeLabel: 'Table', city: 'Saint-Joseph', image: 'https://img/x.jpg', note: 'Ma table préférée' }],
  totalCount: 5,
};

describe('renderListEmailHtml', () => {
  it('renders the CTA to the public url and the item content', () => {
    const html = renderListEmailHtml(base);
    expect(html).toContain('https://sud.reunion.fr/l/tok123');
    expect(html).toContain('Consulter la sélection complète');
    expect(html).toContain('Le Manapany');
    expect(html).toContain('Saint-Joseph');
    expect(html).toContain('Ma table préférée');
    expect(html.startsWith('<!DOCTYPE html>')).toBe(true);
  });

  it('escapes HTML in dynamic fields (no raw injection)', () => {
    const html = renderListEmailHtml({ ...base, name: '<script>alert(1)</script>' });
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;');
  });

  it('shows a "+N" line when the full list has more items than embedded', () => {
    const html = renderListEmailHtml(base); // 1 embedded, total 5 → +4
    expect(html).toMatch(/\+\s*4/);
  });

  it('omits the "+N" line when all items are embedded', () => {
    const html = renderListEmailHtml({ ...base, totalCount: 1 });
    expect(html).not.toMatch(/autres? lieux?/);
  });
});

describe('listEmailSubject', () => {
  it('includes the list name', () => {
    expect(listEmailSubject('Immersion', 'fr')).toContain('Immersion');
    expect(listEmailSubject('Immersion', 'en')).toContain('Immersion');
  });
});
