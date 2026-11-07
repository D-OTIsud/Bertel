import {
  pendingChangeSubmittedEmailSubject,
  renderPendingChangeSubmittedEmailHtml,
  type PendingChangeSubmittedEmailData,
} from './PendingChangeSubmittedEmail';

const base: PendingChangeSubmittedEmailData = {
  objectName: 'Ti Kaz Komela', submitterName: 'Clément', recipientName: 'David',
  appUrl: 'https://bertel.example/moderation?object=HLORUN00000001CS',
};

it('annonce une proposition à traiter avec un lien vers sa fiche en modération', () => {
  expect(pendingChangeSubmittedEmailSubject(base)).toBe('Modifications à modérer — Ti Kaz Komela');
  const html = renderPendingChangeSubmittedEmailHtml(base);
  expect(html).toContain('Bonjour David,');
  expect(html).toContain('Ti Kaz Komela');
  expect(html).toContain('Clément a proposé des modifications');
  expect(html).toContain('depuis l’éditeur contributeur');
  expect(html).toContain('Elles attendent votre validation');
  expect(html).toContain(`href="${base.appUrl}"`);
  expect(html).toContain('Examiner les modifications');
});

it('échappe les noms et le lien avant de composer le HTML', () => {
  const html = renderPendingChangeSubmittedEmailHtml({
    objectName: '<img src=x>', submitterName: '<b>Alice</b>', recipientName: '<i>David</i>',
    appUrl: 'https://bertel.example/moderation?object="<fiche>&x=1',
  });
  expect(html).toContain('&lt;img src=x&gt;');
  expect(html).toContain('&lt;b&gt;Alice&lt;/b&gt;');
  expect(html).toContain('&lt;i&gt;David&lt;/i&gt;');
  expect(html).toContain('object=&quot;&lt;fiche&gt;&amp;x=1');
  expect(html).not.toContain('<img src=x>');
});

it.each([null, '   '])('garde un message lisible quand les noms sont absents : %p', (name) => {
  const html = renderPendingChangeSubmittedEmailHtml({ ...base, submitterName: name, recipientName: name });
  expect(html).toContain('Bonjour,');
  expect(html).toContain('Un contributeur a proposé');
  expect(html).not.toContain('null');
});
