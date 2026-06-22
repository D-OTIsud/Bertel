import { useUiStore } from './ui-store';

describe('ui-store live presence slice', () => {
  it('defaults to an empty roster', () => {
    expect(useUiStore.getState().liveMembers).toEqual([]);
  });

  it('replaces the roster via setLivePresence', () => {
    useUiStore.getState().setLivePresence([
      { userId: 'u1', name: 'Marie', avatar: 'MA', color: '#ff7b54', onlineSince: 1000 },
    ]);
    expect(useUiStore.getState().liveMembers).toHaveLength(1);
    expect(useUiStore.getState().liveMembers[0].name).toBe('Marie');
  });
});
