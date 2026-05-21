import { render, screen, fireEvent, act } from '@testing-library/react';
import { MediaEditModal } from './MediaEditModal';
import type { ObjectWorkspaceMediaItem } from '../../../services/object-workspace-parser';

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
});
