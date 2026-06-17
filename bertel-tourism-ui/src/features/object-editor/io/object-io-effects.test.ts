import { downloadTextFile, readFileText } from './object-io-effects';

describe('downloadTextFile', () => {
  it('creates an object URL, clicks an anchor with the download name, then revokes', () => {
    const createObjectURL = jest.fn(() => 'blob:fake');
    const revokeObjectURL = jest.fn();
    // jsdom provides URL but not these statics.
    (URL as unknown as { createObjectURL: typeof createObjectURL }).createObjectURL = createObjectURL;
    (URL as unknown as { revokeObjectURL: typeof revokeObjectURL }).revokeObjectURL = revokeObjectURL;

    const click = jest.fn();
    const realCreate = document.createElement.bind(document);
    const createSpy = jest.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      const el = realCreate(tag);
      if (tag === 'a') {
        (el as HTMLAnchorElement).click = click;
      }
      return el;
    });

    downloadTextFile('fiche.json', 'application/json', '{"a":1}');

    expect(createObjectURL).toHaveBeenCalledTimes(1);
    expect(click).toHaveBeenCalledTimes(1);
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:fake');
    createSpy.mockRestore();
  });
});

describe('readFileText', () => {
  it('resolves the text content of a File', async () => {
    const file = new File(['hello-import'], 'fiche.json', { type: 'application/json' });
    await expect(readFileText(file)).resolves.toBe('hello-import');
  });
});
