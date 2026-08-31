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
});
