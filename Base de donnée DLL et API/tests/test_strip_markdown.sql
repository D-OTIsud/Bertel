-- test_strip_markdown.sql — api.strip_markdown unit tests (run via Supabase execute_sql)
DO $$
DECLARE
  r text;
BEGIN
  -- headings (space required)
  ASSERT api.strip_markdown('## Titre') = 'Titre', 'heading';
  ASSERT api.strip_markdown('#1 du quartier') = '#1 du quartier', 'hash-no-space survives';
  -- emphasis (emitted markers only)
  ASSERT api.strip_markdown('**gras**') = 'gras', 'bold';
  ASSERT api.strip_markdown('*ital*') = 'ital', 'italic';
  ASSERT api.strip_markdown('***both***') = 'both', 'triple';
  ASSERT api.strip_markdown('fichier_2024_final') = 'fichier_2024_final', 'underscores survive';
  -- lists (line-anchored, space required)
  ASSERT api.strip_markdown(E'- a\n- b') = E'a\nb', 'bullets';
  ASSERT api.strip_markdown(E'1. a\n10. b') = E'a\nb', 'ordered multi-digit';
  ASSERT api.strip_markdown('Lun - Ven') = 'Lun - Ven', 'mid-line dash survives';
  ASSERT api.strip_markdown('Phase 2. Lancement') = 'Phase 2. Lancement', 'mid-line ordered survives';
  -- quote (nested to fixpoint)
  ASSERT api.strip_markdown('> > cite') = 'cite', 'nested quote';
  -- links / images
  ASSERT api.strip_markdown('[OTI](https://oti.re)') = 'OTI', 'link';
  ASSERT api.strip_markdown('![alt](https://x/a.jpg)') = '', 'image removed';
  -- escapes
  ASSERT api.strip_markdown('\*literal\*') = '*literal*', 'escapes';
  -- NULL + idempotency
  ASSERT api.strip_markdown(NULL) IS NULL, 'strict null';
  r := api.strip_markdown(E'## T\n- **x**\n> q');
  ASSERT api.strip_markdown(r) = r, 'idempotent';
  RAISE NOTICE 'test_strip_markdown OK';
END $$;
