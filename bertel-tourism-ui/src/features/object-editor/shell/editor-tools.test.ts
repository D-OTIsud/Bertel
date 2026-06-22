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

  it('keeps versions disabled with a "bientôt" reason but enables import-export (tranche E)', () => {
    const tools = buildEditorTools(base);
    const versions = tools.find((t) => t.key === 'versions')!;
    const io = tools.find((t) => t.key === 'import-export')!;
    expect(versions.disabled).toBe(true);
    expect(versions.disabledReason).toMatch(/bient/i);
    expect(io.disabled).toBe(false);
    expect(io.disabledReason).toBeUndefined();
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

  it('enables the versions tool with a real version stat when currentVersion is provided', () => {
    const versions = buildEditorTools({ ...base, currentVersion: 7 }).find((t) => t.key === 'versions')!;
    expect(versions.disabled).toBe(false);
    expect(versions.stat).toBe('v7');
    expect(versions.disabledReason).toBeUndefined();
  });

  it('keeps versions disabled (no fake stat) while currentVersion is unknown', () => {
    const versions = buildEditorTools(base).find((t) => t.key === 'versions')!;
    expect(versions.disabled).toBe(true);
    expect(versions.stat).toBeUndefined();
    expect(versions.disabledReason).toMatch(/bient/i);
  });

  it('omits the delete tool when canHardDelete is falsy (default)', () => {
    const keys = buildEditorTools(base).map((t) => t.key);
    expect(keys).not.toContain('delete');
  });

  it('appends a danger delete tool for a superuser', () => {
    const tools = buildEditorTools({ status: 'archived', canArchive: true, canHardDelete: true });
    const del = tools.find((t) => t.key === 'delete')!;
    expect(del.label).toBe('Supprimer définitivement');
    expect(del.danger).toBe(true);
    expect(del.disabled).toBe(false);
    expect(tools[tools.length - 1].key).toBe('delete'); // dernier
  });

  it("disables the delete tool with an \"archivez d'abord\" reason when not archived", () => {
    const del = buildEditorTools({ status: 'published', canArchive: true, canHardDelete: true })
      .find((t) => t.key === 'delete')!;
    expect(del.disabled).toBe(true);
    expect(del.disabledReason).toMatch(/archivez/i);
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
