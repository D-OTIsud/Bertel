import {
  computeRoster,
  derivePeerSavedNotice,
  groupPeersBySection,
  hasUnsavedEdits,
  type EditorPeer,
} from './editor-presence';

const peer = (over: Partial<EditorPeer> & { userId: string }): EditorPeer => ({
  name: over.userId,
  avatar: '',
  color: '#000',
  ...over,
});

describe('groupPeersBySection', () => {
  it('groups the other editors by their active section', () => {
    const peers = [
      peer({ userId: 'me', activeSection: '01' }),
      peer({ userId: 'u1', activeSection: '06' }),
      peer({ userId: 'u2', activeSection: '06' }),
      peer({ userId: 'u3', activeSection: '13' }),
    ];
    const result = groupPeersBySection(peers, 'me');
    expect(result['06'].map((p) => p.userId)).toEqual(['u1', 'u2']);
    expect(result['13'].map((p) => p.userId)).toEqual(['u3']);
  });

  it('excludes the current user from the section groups', () => {
    const peers = [peer({ userId: 'me', activeSection: '01' })];
    expect(groupPeersBySection(peers, 'me')).toEqual({});
  });

  it('ignores peers that have no active section', () => {
    const peers = [peer({ userId: 'u1' })];
    expect(groupPeersBySection(peers, 'me')).toEqual({});
  });

  it('collapses several connections of the same peer in one section', () => {
    const peers = [
      peer({ userId: 'u1', activeSection: '06' }),
      peer({ userId: 'u1', activeSection: '06' }),
    ];
    expect(groupPeersBySection(peers, 'me')['06']).toHaveLength(1);
  });
});

describe('computeRoster', () => {
  it('lists the current user first, flagged isSelf', () => {
    const peers = [peer({ userId: 'u1', name: 'Bob' }), peer({ userId: 'me', name: 'Moi' })];
    const roster = computeRoster(peers, 'me');
    expect(roster.map((r) => r.userId)).toEqual(['me', 'u1']);
    expect(roster[0].isSelf).toBe(true);
    expect(roster[1].isSelf).toBe(false);
  });

  it('deduplicates a peer that has several connections', () => {
    const peers = [peer({ userId: 'me' }), peer({ userId: 'u1' }), peer({ userId: 'u1' })];
    expect(computeRoster(peers, 'me').map((r) => r.userId)).toEqual(['me', 'u1']);
  });
});

describe('hasUnsavedEdits', () => {
  it('is true when at least one module is dirty', () => {
    expect(hasUnsavedEdits({ contacts: false, pricing: true })).toBe(true);
  });

  it('is false when nothing is dirty', () => {
    expect(hasUnsavedEdits({ contacts: false })).toBe(false);
    expect(hasUnsavedEdits({})).toBe(false);
  });
});

describe('derivePeerSavedNotice', () => {
  it('returns a notice naming the peer who saved', () => {
    expect(derivePeerSavedNotice({ userId: 'u1', name: 'Sarah', at: 10 }, 'me')).toEqual({
      name: 'Sarah',
      at: 10,
    });
  });

  it('ignores the current user own save (defence in depth over broadcast self:false)', () => {
    expect(derivePeerSavedNotice({ userId: 'me', name: 'Moi', at: 10 }, 'me')).toBeNull();
  });

  it('returns null without an event', () => {
    expect(derivePeerSavedNotice(null, 'me')).toBeNull();
  });
});
