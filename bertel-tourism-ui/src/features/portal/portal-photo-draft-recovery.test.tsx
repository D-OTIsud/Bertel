import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { portalModules } from './__fixtures__/portal-fixtures';
import { PortalSendModal } from './PortalSendModal';
import { buildPortalRubrics } from './portal-rubrics';
import { portalDraftFingerprint } from './portal-draft-schema';
import { portalDraftKey, portalFormKey, readPortalDraft, readPortalForms, usePortalDraft, writePortalDraft, writePortalForms } from './usePortalDraft';
import { useObjectEditorState } from '../object-editor/useObjectEditorState';
import { stripCatalogOptions } from '../object-editor/io/object-io-serialize';
import { buildGalleryWritePayload, galleryBaseline } from '../../services/media-write-contract';
import { portalPhotoDraft } from '../../services/portal-photos';
import { submitActorFiche } from '../../services/portal';
import { useSessionStore } from '../../store/session-store';
import type { ObjectWorkspaceModules } from '../../services/object-workspace-parser';

jest.mock('../../services/portal', () => ({ submitActorFiche: jest.fn() }));
jest.mock('../../services/write-compatibility', () => ({ readWriteCompatibility: jest.fn().mockResolvedValue({
  compatible: true, clientVersion: 2, minimumClientVersion: 2, serverWriteContractVersion: 2,
}) }));

const USER = 'temporary-photo-test', OBJ = 'ACTTST0000000001';
const TYPE = '00000000-0000-4000-a000-00000000f401', UPLOAD = '00000000-0000-4000-a000-00000000f402';
const READ_A = '00000000-0000-4000-a000-00000000f411', READ_B = '00000000-0000-4000-a000-00000000f412', READ_C = '00000000-0000-4000-a000-00000000f413';

function server(readId: string, officeTitle?: string): ObjectWorkspaceModules {
  const modules = portalModules();
  const base = { ...modules.media, typeOptions: [{ id: TYPE, code: 'photo', label: 'Photo' }] };
  const objectItems = Array.from({ length: 4 }, (_, index) => ({
    ...portalPhotoDraft({ id: `00000000-0000-4000-a000-00000000f42${index}`, title: index === 0 && officeTitle ? officeTitle : `Photo ${index + 1}`, width: 1600, height: 1200 }, 'Photographe', null, base),
    id: `00000000-0000-4000-a000-00000000f42${index}`, portalUploadId: undefined,
    isPublished: true, visibility: 'public', isMain: index === 0, position: String(index + 1), url: `https://example.test/photo-${index + 1}.jpg`,
  }));
  const media = { ...base, objectItems };
  const rows = objectItems.map(item => ({ id: item.id, object_id: OBJ, place_id: null, media_type_id: TYPE,
    title: item.title, title_i18n: null, description: null, description_i18n: null, credit: item.credit, url: item.url,
    is_main: item.isMain, is_published: true, position: Number(item.position), rights_expires_at: null,
    visibility: 'public', width: 1600, height: 1200, kind: 'illustration', updated_at: '2026-11-06T05:00:00Z', extra: {},
  }));
  return { ...modules, media: { ...media, galleryWriteBaseline: { ...galleryBaseline(media, rows), readId } } };
}

function deposited(modules: ObjectWorkspaceModules) {
  const photo = { ...portalPhotoDraft({ id: UPLOAD, title: 'Jardin fictif.jpg', width: 1600, height: 1200 }, 'Auteur de recette', null, modules.media), description: 'Photo synthétique déposée et textes confirmés.' };
  return { ...modules.media, objectItems: [...modules.media.objectItems, photo] };
}

/** Production8f used the complete media slice, including its transient readId. */
function legacyFingerprint(modules: ObjectWorkspaceModules) {
  return portalDraftFingerprint({ media: stripCatalogOptions(modules).media } as ObjectWorkspaceModules);
}

function legacyDraft(before: ObjectWorkspaceModules, refreshed: ObjectWorkspaceModules) {
  writePortalDraft(USER, OBJ, refreshed, { media: deposited(before) }, 'Un ajout à relire');
  const payload = JSON.parse(localStorage.getItem(portalDraftKey(USER, OBJ))!);
  payload.fingerprint = legacyFingerprint(refreshed);
  localStorage.setItem(portalDraftKey(USER, OBJ), JSON.stringify(payload));
}

function RestoredSend({ modules }: { modules: ObjectWorkspaceModules }) {
  const editor = useObjectEditorState(OBJ, modules);
  const saved = usePortalDraft({ userId: USER, objectId: OBJ, serverModules: modules, editor });
  const rubrics = buildPortalRubrics({ archetype: 'ASC', baseline: editor.baseline, draft: editor.draft, dirty: editor.dirtySections,
    masked: [], floor: ['legal', 'publication', 'provider'], pendingModules: new Set(), rejectedModules: new Set() });
  return <><span data-testid="recovery-state">{saved.discarded ? 'conflict' : 'ready'}</span>
    <PortalSendModal open onOpenChange={jest.fn()} objectId={OBJ} userId={USER} archetype="ASC" editor={editor}
      rubrics={rubrics} note={saved.note} onNoteChange={saved.setNote} onSent={jest.fn()} recoveryConflicts={saved.discardedModules} />
  </>;
}

beforeEach(() => {
  localStorage.clear(); jest.clearAllMocks();
  useSessionStore.setState({ userId: USER, role: 'actor', demoMode: false });
  jest.mocked(submitActorFiche).mockResolvedValue({ submissionId: 'photo-submission', taskId: 'photo-task', changeCount: 1, assigneeCount: 1 });
});

test('un JPEG déposé et une modification Accessibilité survivent au reload et produisent deux enveloppes distinctes', async () => {
  const a = server(READ_A), b = server(READ_B), c = server(READ_C);
  for (const modules of [a, b, c]) Object.assign(modules.characteristics, {
    selectedLanguages: [], selectedEnvironmentCodes: [],
    amenityGroups: [{ familyCode: 'accessibility', familyLabel: 'Accessibilité', options: [
      { id: 'parking', code: 'acc_pmr_parking', label: 'Places PMR', disabilityTypes: ['motor'] },
    ] }],
  });
  writePortalDraft(USER, OBJ, b, { media: deposited(a), characteristics: {
    ...a.characteristics, selectedAmenityCodes: ['acc_pmr_parking'],
  } }, 'Photo et accueil');
  expect(readPortalDraft(USER, OBJ, c)?.droppedModules).toEqual([]);
  render(<RestoredSend modules={c} />);
  await waitFor(() => expect(screen.getByRole('button', { name: 'Envoyer' })).not.toHaveAttribute('aria-disabled', 'true'));
  expect(screen.getByText('Accessibilité')).toBeInTheDocument();
  expect(screen.queryByText('Équipements et moyens de paiement')).not.toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'Envoyer' }));
  await waitFor(() => expect(submitActorFiche).toHaveBeenCalledTimes(1));
  const envelopes = jest.mocked(submitActorFiche).mock.calls[0][1];
  expect(envelopes).toHaveLength(2);
  expect(envelopes.find(envelope => envelope.targetTable === 'object_amenity')).toMatchObject({
    payload: { amenities: [{ amenity_code: 'acc_pmr_parking' }] }, metadata: { section: 'characteristics', field: 'Accessibilité' },
  });
  expect(envelopes.find(envelope => envelope.targetTable === 'media')).toMatchObject({
    payload: { additions: [{ upload_id: UPLOAD }] },
  });
  expect(c.media.objectItems).toHaveLength(4);
});

test('JPEG déjà déposé : refreshB puis reloadC ne bloquent pas son envoi et ne modifient aucune des4photos', async () => {
  const a = server(READ_A), b = server(READ_B), c = server(READ_C);
  const originals = JSON.stringify([a, b, c]);
  legacyDraft(a, b);
  const restored = readPortalDraft(USER, OBJ, c)!;
  expect(restored.droppedModules).toEqual([]);
  const media = restored.draft.media as ObjectWorkspaceModules['media'];
  expect(media.objectItems.slice(0, 4)).toEqual(c.media.objectItems);
  expect(media.objectItems[4]).toMatchObject({ portalUploadId: UPLOAD, title: 'Jardin fictif.jpg', description: 'Photo synthétique déposée et textes confirmés.' });
  expect(media.galleryWriteBaseline).toEqual(c.media.galleryWriteBaseline);
  expect(JSON.stringify([a, b, c])).toBe(originals);
  render(<RestoredSend modules={c} />);
  await waitFor(() => expect(screen.getByRole('button', { name: 'Envoyer' })).not.toHaveAttribute('aria-disabled', 'true'));
  expect(screen.getByTestId('recovery-state')).toHaveTextContent('ready');
  await userEvent.click(screen.getByRole('button', { name: 'Envoyer' }));
  await waitFor(() => expect(submitActorFiche).toHaveBeenCalledTimes(1));
  expect(jest.mocked(submitActorFiche).mock.calls[0][1]).toEqual([expect.objectContaining({ targetTable: 'media', payload: {
    additions: [{ upload_id: UPLOAD, credit: 'Auteur de recette', replace_media_id: null }],
  } })]);
});

test('une vraie modification office reste conflictuelle et interdit toujours l’envoi sans vérification', async () => {
  legacyDraft(server(READ_A), server(READ_B));
  const changed = server(READ_C, 'Titre réellement corrigé par l’office');
  expect(readPortalDraft(USER, OBJ, changed)?.droppedModules).toEqual(['media']);
  render(<RestoredSend modules={changed} />);
  await waitFor(() => expect(screen.getByTestId('recovery-state')).toHaveTextContent('conflict'));
  expect(screen.getByRole('button', { name: 'Envoyer' })).toHaveAttribute('aria-disabled', 'true');
  await userEvent.click(screen.getByRole('button', { name: 'Envoyer' }));
  expect(await screen.findByText(/certaines rubriques ont aussi changé côté office/)).toBeInTheDocument();
  expect(submitActorFiche).not.toHaveBeenCalled();
});

test('nouvelle empreinte stable : localA/baseB reprend le CAS deC sans perdre le dépôt ni ses textes', () => {
  const a = server(READ_A), b = server(READ_B), c = server(READ_C);
  const before = JSON.stringify([a, b, c]);
  writePortalDraft(USER, OBJ, b, { media: deposited(a) }, 'Dépôt confirmé');
  writePortalDraft('fingerprint-control', OBJ, c, { media: deposited(c) }, '');
  const saved = JSON.parse(localStorage.getItem(portalDraftKey(USER, OBJ))!);
  const control = JSON.parse(localStorage.getItem(portalDraftKey('fingerprint-control', OBJ))!);
  expect(saved.fingerprint).toBe(control.fingerprint); // Exercise the equal-fingerprint branch.
  const restored = readPortalDraft(USER, OBJ, c)!;
  expect(restored.droppedModules).toEqual([]);
  const media = restored.draft.media as ObjectWorkspaceModules['media'];
  expect(media.galleryWriteBaseline).toEqual(c.media.galleryWriteBaseline);
  expect(media.objectItems.slice(0, 4)).toEqual(c.media.objectItems);
  expect(media.objectItems[4]).toMatchObject({ portalUploadId: UPLOAD, title: 'Jardin fictif.jpg',
    description: 'Photo synthétique déposée et textes confirmés.', credit: 'Auteur de recette' });
  expect(JSON.stringify([a, b, c])).toBe(before);
});

test.each([READ_A, READ_B, READ_C])('ancienne forme avec readId=%s : reprise seulement à données identiques, sans réécriture', readId => {
  legacyDraft(server(READ_A), server(READ_B));
  const forms = { photos: { additions: [deposited(server(READ_A)).objectItems[4]], files: [], rights: true, credit: 'Auteur de recette' } };
  const raw = JSON.stringify({ fingerprint: legacyFingerprint(server(readId)), forms });
  localStorage.setItem(portalFormKey(USER, OBJ), raw);
  expect(readPortalForms(USER, OBJ, server(READ_C))).toEqual(forms);
  expect(localStorage.getItem(portalFormKey(USER, OBJ))).toBe(raw);
  expect(readPortalForms(USER, OBJ, server(READ_C, 'Vrai changement office'))).toEqual({});
});

test('une ancienne forme dont le readId n’est attesté nulle part reste refusée sans réécriture', () => {
  legacyDraft(server(READ_A), server(READ_B));
  const raw = JSON.stringify({ fingerprint: legacyFingerprint(server('00000000-0000-4000-a000-00000000f414')),
    forms: { photos: { additions: [], files: [], rights: true, credit: 'Ancien crédit' } } });
  localStorage.setItem(portalFormKey(USER, OBJ), raw);
  expect(readPortalForms(USER, OBJ, server(READ_C))).toEqual({});
  expect(localStorage.getItem(portalFormKey(USER, OBJ))).toBe(raw);
});

test('les nouvelles formes ignorent uniquementreadId, et la baseline office reste utilisable par son CAS', () => {
  const a = server(READ_A), c = server(READ_C), forms = { photos: { additions: [], files: [], rights: true, credit: 'Crédit conservé' } };
  writePortalForms(USER, OBJ, a, forms);
  expect(readPortalForms(USER, OBJ, c)).toEqual(forms);
  expect(readPortalForms(USER, OBJ, server(READ_C, 'Vrai changement office'))).toEqual({});
  expect(c.media.galleryWriteBaseline?.readId).toBe(READ_C);
  const edited = { ...c.media, objectItems: c.media.objectItems.map((item, i) => i === 0 ? { ...item, description: 'Correction office' } : item) };
  const request = buildGalleryWritePayload(edited);
  expect(request.rows).toHaveLength(1);
  expect(request.rows[0]).toMatchObject({ expected: c.media.galleryWriteBaseline!.rows[0], changes: { description: 'Correction office' } });
});

test('un changement du snapshotCAS autre que readId n’est pas ignoré', () => {
  const a = server(READ_A), b = server(READ_B), c = server(READ_C);
  const local = deposited(a);
  local.galleryWriteBaseline = { ...local.galleryWriteBaseline!, createdIds: { local: 'intention-locale' } };
  writePortalDraft(USER, OBJ, b, { media: local }, '');
  c.media.galleryWriteBaseline!.createdIds = { local: 'autre-intention' };
  expect(readPortalDraft(USER, OBJ, c)?.droppedModules).toEqual(['media']);
});
