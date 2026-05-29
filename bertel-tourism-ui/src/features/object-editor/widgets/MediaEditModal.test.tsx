import { render, screen, fireEvent, act } from '@testing-library/react';
import { MediaEditModal } from './MediaEditModal';
import type { ObjectWorkspaceMediaItem } from '../../../services/object-workspace-parser';

jest.mock('../../../lib/supabase', () => ({
  getSupabaseClient: () => ({
    auth: { getSession: async () => ({ data: { session: { access_token: 'fake-jwt' } } }) },
  }),
}));

jest.mock('./MediaUploadField', () => ({
  MediaUploadField: ({ onUploaded }: { onUploaded: (m: { url: string; width: number; height: number; mimeType: string }) => void }) => (
    <button type="button" onClick={() => onUploaded({ url: 'https://cdn.test/x.jpg', width: 800, height: 600, mimeType: 'image/jpeg' })}>
      mock-upload
    </button>
  ),
}));

const media: ObjectWorkspaceMediaItem = {
  id: 'm1', scope: 'object', placeId: null, scopeLabel: 'Objet',
  typeId: 'mt1', typeCode: 'image', typeLabel: 'Image',
  title: 'Façade', titleTranslations: {}, description: '', descriptionTranslations: {},
  url: 'https://x/y.jpg', credit: '', visibility: 'public', position: '0',
  width: '', height: '', rightsExpiresAt: '', kind: 'image', isMain: true, isPublished: true, tags: [],
};

describe('MediaEditModal', () => {
  it('edits base metadata and returns the patched media on save', () => {
    const onSave = jest.fn();
    render(
      <MediaEditModal
        open media={media} languages={['fr', 'en', 'cre']}
        typeOptions={[{ id: 'mt1', code: 'image', label: 'Image' }, { id: 'mt2', code: 'pdf', label: 'PDF' }]}
        objectId="m1"
        onClose={() => {}} onSave={onSave}
      />,
    );
    fireEvent.change(screen.getByLabelText('Titre'), { target: { value: 'Nouvelle façade' } });
    fireEvent.change(screen.getByLabelText('Crédit / auteur'), { target: { value: 'OTI Sud' } });
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));
    const saved = onSave.mock.calls[0][0] as ObjectWorkspaceMediaItem;
    expect(saved.title).toBe('Nouvelle façade');
    expect(saved.credit).toBe('OTI Sud');
  });

  it('edits a non-primary-language title into titleTranslations', () => {
    const onSave = jest.fn();
    render(
      <MediaEditModal
        open media={media} languages={['fr', 'en', 'cre']}
        typeOptions={[{ id: 'mt1', code: 'image', label: 'Image' }]}
        objectId="m1"
        onClose={() => {}} onSave={onSave}
      />,
    );
    act(() => { fireEvent.click(screen.getByRole('button', { name: 'EN' })); });
    fireEvent.change(screen.getByLabelText('Titre'), { target: { value: 'Front view' } });
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));
    const saved = onSave.mock.calls[0][0] as ObjectWorkspaceMediaItem;
    expect(saved.title).toBe('Façade');                  // base FR untouched
    expect(saved.titleTranslations.en).toBe('Front view');
  });

  it('captures upload result (url, width, height) into the saved draft', async () => {
    const onSave = jest.fn();
    render(
      <MediaEditModal
        open
        media={media}
        languages={['fr']}
        typeOptions={[{ id: 'mt1', code: 'image', label: 'Image' }]}
        objectId="obj-edit-1"
        onClose={() => {}}
        onSave={onSave}
      />,
    );
    const uploadBtn = await screen.findByRole('button', { name: 'mock-upload' });
    fireEvent.click(uploadBtn);
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));
    const saved = onSave.mock.calls[0][0] as ObjectWorkspaceMediaItem;
    expect(saved.url).toBe('https://cdn.test/x.jpg');
    expect(saved.width).toBe('800');
    expect(saved.height).toBe('600');
  });
});
