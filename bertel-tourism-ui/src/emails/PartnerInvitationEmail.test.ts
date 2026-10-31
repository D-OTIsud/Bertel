import { partnerInvitationEmailSubject, renderPartnerInvitationEmailHtml } from './PartnerInvitationEmail';

const data = { officeName: 'Office du Sud', officeLogoUrl: null, recipientName: 'Marie', ficheNames: ['Le Longanis'], invitationUrl: 'https://auth.example.test/verify?token=invite&type=invite' };

test('reprend le parcours de la maquette avec le lien généré, l’office et la fiche', () => {
  const html = renderPartnerInvitationEmailHtml(data);
  expect(partnerInvitationEmailSubject(data)).toBe('Le Longanis : mettez à jour votre fiche vous-même');
  expect(html).toContain('Bonjour Marie,');
  expect(html).toContain('Office du Sud');
  expect(html).toContain('Ouvrir mon espace partenaire');
  expect(html).toContain('https://auth.example.test/verify?token=invite&amp;type=invite');
  expect(html).toContain('Vous envoyez à l’office');
  expect(html).toContain('Nous relisons et publions');
  expect(html).not.toContain('en remplacer');
});

test('échappe les données, refuse les URL actives et traite les invitations à plusieurs fiches', () => {
  const html = renderPartnerInvitationEmailHtml({ ...data, recipientName: '<script>Marie</script>', officeName: 'Office <Sud>', officeLogoUrl: 'javascript:alert(1)', ficheNames: ['<Fiche>', 'Autre'], invitationUrl: 'javascript:alert(1)' });
  expect(html).toContain('&lt;script&gt;Marie&lt;/script&gt;');
  expect(html).toContain('Office &lt;Sud&gt;');
  expect(html).not.toContain('javascript:');
  expect(html).not.toContain('<script>');
  expect(html).toContain('&lt;Fiche&gt;');
});
