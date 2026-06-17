import { buildEditorTools, archiveTargetStatus } from './editor-tools';

describe('buildEditorTools', () => {
  const base = { status: 'draft', canArchive: true };

  it('lists exactly the three tools in order: versions, import-export, archive', () => {
    const keys = buildEditorTools(base).map((t) => t.key);
    expect(keys).toEqual(['versions', 'import-export', 'archive']);
  });

  it('never includes a duplicate tool', () => {
    const labels = buildEditorTools(base).map((t) => t.label.toLowerCase());
    expect(labels.some((l) => l.includes('dupliquer'))).toBe(false);
  });

  it('keeps versions and import-export disabled with a "bientôt" reason (wired in later tranches)', () => {
    const tools = buildEditorTools(base);
    const versions = tools.find((t) => t.key === 'versions')!;
    const io = tools.find((t) => t.key === 'import-export')!;
    expect(versions.disabled).toBe(true);
    expect(versions.disabledReason).toMatch(/bient/i);
    expect(io.disabled).toBe(true);
    expect(versions.stat).toBeUndefined(); // no fake version number
  });

  it('labels archive "Archiver" with danger tone when not archived', () => {
    const archive = buildEditorTools({ status: 'published', canArchive: true }).find((t) => t.key === 'archive')!;
    expect(archive.label).toBe('Archiver');
    expect(archive.danger).toBe(true);
    expect(archive.disabled).toBe(false);
  });

  it('labels archive "Restaurer" without danger when already archived', () => {
    const archive = buildEditorTools({ status: 'archived', canArchive: true }).find((t) => t.key === 'archive')!;
    expect(archive.label).toBe('Restaurer');
    expect(archive.danger).toBe(false);
  });

  it('disables archive with the supplied reason when the user lacks publish rights', () => {
    const archive = buildEditorTools({ status: 'draft', canArchive: false, archiveDisabledReason: 'Lecture seule.' }).find((t) => t.key === 'archive')!;
    expect(archive.disabled).toBe(true);
    expect(archive.disabledReason).toBe('Lecture seule.');
  });
});

describe('archiveTargetStatus', () => {
  it('archives a live fiche', () => {
    expect(archiveTargetStatus('published', '2026-01-01')).toBe('archived');
  });
  it('restores an archived fiche that was once published to hidden', () => {
    expect(archiveTargetStatus('archived', '2026-01-01')).toBe('hidden');
  });
  it('restores a never-published archived fiche to draft', () => {
    expect(archiveTargetStatus('archived', '')).toBe('draft');
  });
});
