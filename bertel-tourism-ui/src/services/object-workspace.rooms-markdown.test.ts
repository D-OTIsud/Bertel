import { readString } from './object-workspace-parser';

const MD = '## Suite\n\nVue **mer** avec *balcon*.';

describe('room description Markdown round-trip (D2 phase C)', () => {
  it('parser keeps raw Markdown from the direct PostgREST row', () => {
    const row = { id: 'r1', code: 'A', name: 'X', description: MD, description_i18n: { fr: MD } } as Record<string, unknown>;
    expect(readString(row.description)).toBe(MD);
  });
  it('save payload writes raw Markdown back to object_room_type', () => {
    const item = { description: MD, descriptionTranslations: { fr: MD } };
    const payload = { description: item.description, description_i18n: item.descriptionTranslations };
    expect(payload.description).toBe(MD);
    expect(payload.description_i18n.fr).toBe(MD);
  });
});
