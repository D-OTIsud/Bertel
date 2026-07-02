import { listEmailSubject, renderListEmailHtml, type ListEmailData } from './ListEmail';

const base: ListEmailData = {
  name: 'Immersion créole & saveurs',
  intro: 'Bonjour, préparez vos papilles !',
  advisorName: 'Delphine Grondin',
  advisorEmail: 'delphine.grondin@otisud.com',
  advisorAvatarUrl: null,
  publicUrl: 'https://sud.reunion.fr/l/tok123',
  accentInk: '#b34b3d',
  lang: 'fr',
  coverUrl: null,
  items: [{
    name: 'Le Manapany', typeLabel: 'Table', city: 'Saint-Joseph', image: 'https://img/x.jpg',
    note: 'Ma table préférée', phone: '+262 262 56 30 30', web: 'http://lemanapany.re/',
  }],
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

  it('renders public contacts as tel: and normalized web links', () => {
    const html = renderListEmailHtml(base);
    expect(html).toContain('tel:+262262563030');
    expect(html).toContain('href="http://lemanapany.re/"'); // full URL kept as-is
    expect(html).toContain('lemanapany.re'); // short label without protocol
  });

  it('omits the contact line when the item has no public channel', () => {
    const html = renderListEmailHtml({
      ...base,
      items: [{ ...base.items[0], phone: null, web: null }],
    });
    expect(html).not.toContain('tel:');
  });

  it('shows a "+N" line when the full list has more items than embedded', () => {
    const html = renderListEmailHtml(base); // 1 embedded, total 5 → +4
    expect(html).toMatch(/\+\s*4/);
  });

  it('omits the "+N" line when all items are embedded', () => {
    const html = renderListEmailHtml({ ...base, totalCount: 1 });
    expect(html).not.toMatch(/autres? lieux?/);
  });

  it('shows the advisor name as the signature and the e-mail below it', () => {
    const html = renderListEmailHtml(base);
    expect(html).toContain('Delphine Grondin');
    expect(html).toContain('mailto:delphine.grondin@otisud.com');
  });

  it('embeds the advisor avatar image when set', () => {
    const html = renderListEmailHtml({ ...base, advisorAvatarUrl: 'https://cdn/avatars/u1/avatar.jpg?v=9' });
    expect(html).toContain('https://cdn/avatars/u1/avatar.jpg?v=9');
    expect(html).toContain('border-radius:999px');
  });

  it('does not print the e-mail twice when no real name is set (fallback = e-mail)', () => {
    const mail = 'd.philippe@otisud.com';
    const html = renderListEmailHtml({ ...base, advisorName: mail, advisorEmail: mail });
    // e-mail rendu comme identifiant unique, jamais dupliqué en ligne « nom » + ligne « e-mail »
    expect(html.match(new RegExp(mail.replace(/[.]/g, '\\.'), 'g'))?.length).toBe(1);
  });
});

describe('listEmailSubject', () => {
  it('includes the list name', () => {
    expect(listEmailSubject('Immersion', 'fr')).toContain('Immersion');
    expect(listEmailSubject('Immersion', 'en')).toContain('Immersion');
  });
});
