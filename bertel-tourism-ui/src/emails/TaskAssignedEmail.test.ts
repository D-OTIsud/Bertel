import { renderTaskAssignedEmailHtml, taskAssignedEmailSubject } from './TaskAssignedEmail';

const base = {
  taskTitle: 'Rappeler le client',
  objectName: 'Hôtel des Palmes',
  dueAt: '2026-09-15T00:00:00+00:00',
  assignerName: 'Marie Payet',
  appUrl: 'https://app.example.re/crm',
};

describe('TaskAssignedEmail', () => {
  it('sujet = Nouvelle tâche : {titre} — {établissement}', () => {
    expect(taskAssignedEmailSubject(base)).toBe('Nouvelle tâche : Rappeler le client — Hôtel des Palmes');
  });

  it('corps : titre, établissement, échéance formatée, assignateur, lien /crm', () => {
    const html = renderTaskAssignedEmailHtml(base);
    expect(html).toContain('Rappeler le client');
    expect(html).toContain('Hôtel des Palmes');
    expect(html).toContain('15/09/2026');
    expect(html).toContain('Marie Payet');
    expect(html).toContain('https://app.example.re/crm');
  });

  it('échappe le HTML injecté et affiche les replis (— / équipe)', () => {
    const html = renderTaskAssignedEmailHtml({
      ...base, taskTitle: '<b>xss</b>', dueAt: null, assignerName: null,
    });
    expect(html).not.toContain('<b>xss</b>');
    expect(html).toContain('&lt;b&gt;xss&lt;/b&gt;');
    expect(html).toContain('Sans échéance');
    expect(html).toContain('votre équipe');
  });

  it('repli sur « Sans échéance » si dueAt est une chaîne non-parsable', () => {
    const html = renderTaskAssignedEmailHtml({
      ...base, dueAt: 'pas-une-date',
    });
    expect(html).toContain('Sans échéance');
    expect(html).not.toContain('Invalid Date');
  });

  it('échappe le HTML dans objectName, assignerName et appUrl simultanément', () => {
    const html = renderTaskAssignedEmailHtml({
      taskTitle: 'Tâche test',
      objectName: '<img src=x onerror="alert()">',
      dueAt: '2026-09-15T00:00:00+00:00',
      assignerName: '<script>alert("xss")</script>',
      appUrl: 'https://example.com?param="<b>test</b>',
    });
    // Vérifie que les formes brutes d'injection sont absentes
    expect(html).not.toContain('<img src=x onerror="alert()">');
    expect(html).not.toContain('<script>alert("xss")</script>');
    expect(html).not.toContain('"<b>test</b>');
    // Vérifie que les formes échappées sont présentes
    expect(html).toContain('&lt;img src=x onerror=&quot;alert()&quot;&gt;');
    expect(html).toContain('&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;');
    expect(html).toContain('&quot;&lt;b&gt;test&lt;/b&gt;');
  });
});
