import { parseWorkspaceWebChannelItem } from './object-workspace-parser';

describe('parseWorkspaceWebChannelItem (§90)', () => {
  it('parses a get_object_resource web_channels row', () => {
    const item = parseWorkspaceWebChannelItem(
      {
        kind_code: 'facebook',
        kind_name: 'Facebook',
        kind_domain: 'social_network',
        value: 'https://facebook.com/x',
        is_public: true,
        position: 0,
      },
      0,
    );

    expect(item).toMatchObject({
      kindCode: 'facebook',
      kindLabel: 'Facebook',
      kindDomain: 'social_network',
      value: 'https://facebook.com/x',
      isPublic: true,
    });
  });

  it('parses a distribution (OTA) row', () => {
    const item = parseWorkspaceWebChannelItem(
      { id: 'w3', kind_id: 'k3', kind_domain: 'distribution_channel', kind_code: 'booking', value: 'https://booking.com/x', is_public: true },
      0,
    );

    expect(item).toMatchObject({ id: 'w3', kindId: 'k3', kindCode: 'booking', kindDomain: 'distribution_channel' });
  });

  it('drops a row with an empty value', () => {
    expect(parseWorkspaceWebChannelItem({ kind_code: 'instagram', value: '   ' }, 0)).toBeNull();
  });

  it('treats NULL is_public as public', () => {
    const item = parseWorkspaceWebChannelItem(
      { kind_code: 'booking', kind_domain: 'distribution_channel', value: 'https://booking.com/x', is_public: null },
      1,
    );

    expect(item?.isPublic).toBe(true);
  });

  it('falls back to the kind code when no kind_name is present', () => {
    const item = parseWorkspaceWebChannelItem(
      { id: 'w9', kind_id: 'k9', kind_domain: 'social_network', value: 'https://x.com/y', kind_code: 'twitter' },
      2,
    );

    expect(item?.kindLabel).toBe('twitter');
    expect(item?.id).toBe('w9');
  });
});
