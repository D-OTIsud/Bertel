import { sessionAvatarInitials, shellAvatarInitials } from './avatar-initials';

// These outputs preserve the two existing avatar policies, including separator and UTF-16 behavior.
const cases: [string, string, string][] = [
  ['', 'BT', '--'],
  ['   ', 'BT', '--'],
  ['David Philippe', 'DP', 'DP'],
  ['  David   Philippe  ', 'DP', 'DP'],
  ['Anna\tBob', 'AB', 'A'],
  ['Anna\nBob', 'AB', 'A'],
  ['Anna\u00a0Bob', 'AB', 'A'],
  ['Anna\u200bBob', 'A', 'A'],
  ['Jane-Doe Smith', 'JS', 'JS'],
  ["O'Brien Dupont", 'OD', 'OD'],
  ['Élodie Àngle', 'ÉÀ', 'ÉÀ'],
  ['ß chloé', 'SSC', 'SSC'],
  ['😀 Bob', '\ud83dB', '\ud83dB'],
  ['David Philippe Martin', 'DP', 'DP'],
];

describe('shell avatar initials', () => {
  it.each(cases)('preserves the shell output for %j', (name, expectedShell) => {
    expect(shellAvatarInitials(name)).toBe(expectedShell);
  });

  it.each([null, undefined])('uses BT for %j', (name) => {
    expect(shellAvatarInitials(name)).toBe('BT');
  });
});

describe('session avatar initials', () => {
  it.each(cases)('preserves the session output for %j', (name, _expectedShell, expectedSession) => {
    expect(sessionAvatarInitials(name)).toBe(expectedSession);
  });
});
