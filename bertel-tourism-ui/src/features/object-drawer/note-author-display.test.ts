import {
  getNoteAuthorDisplayName,
  getNoteAuthorEmail,
  getNoteAuthorFullName,
  getNoteAuthorShortLabel,
} from './note-author-display';

describe('note-author-display', () => {
  it('formats a full name as given name plus surname initial', () => {
    expect(getNoteAuthorShortLabel({ createdByName: 'Marie Dupont' })).toBe('Marie D.');
    expect(getNoteAuthorFullName({ createdByName: 'Marie Dupont' })).toBe('Marie Dupont');
  });

  it('derives a short label from email when only email is known', () => {
    expect(
      getNoteAuthorShortLabel({
        createdByName: 'marie.dupont@oti.re',
        createdByEmail: 'marie.dupont@oti.re',
      }),
    ).toBe('marie D.');
    expect(getNoteAuthorEmail({ createdByName: '', createdByEmail: 'marie@oti.re' })).toBe('marie@oti.re');
  });

  it('prefers explicit email over display_name for tooltips', () => {
    expect(
      getNoteAuthorEmail({
        createdByName: 'Sophie Admin',
        createdByEmail: 'sophie@oti.re',
      }),
    ).toBe('sophie@oti.re');
  });

  it('falls back to Equipe when author is unknown', () => {
    expect(getNoteAuthorShortLabel({ createdByName: '' })).toBe('Equipe');
    expect(getNoteAuthorDisplayName({ createdByName: '' })).toBe('Equipe');
  });
});
