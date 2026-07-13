// normalize.test.ts — logique de normalisation vérifiée AUSSI via un harnais Node local avant
// commit (aucun Deno local dans cet environnement de dev) : les 30 assertions ci-dessous sont le
// portage direct de ce harnais, donc déjà connues vertes côté logique pure. Ce fichier tourne en
// CI/à l'invocation via `deno test`.
import { assertEquals, assertMatch } from 'jsr:@std/assert@1';
import { stripHorsGestionSuffix, mapStatus, parseReopeningDate, computeGeomHash, normalizeFeature } from './normalize.ts';

Deno.test('stripHorsGestionSuffix removes the suffix case-insensitively', () => {
  assertEquals(stripHorsGestionSuffix('Sentier X (hors gestion ONF)'), 'Sentier X');
  assertEquals(stripHorsGestionSuffix('Sentier Y (Hors Gestion onf)'), 'Sentier Y');
});

Deno.test('stripHorsGestionSuffix leaves names without the suffix untouched', () => {
  assertEquals(stripHorsGestionSuffix('Sentier Z'), 'Sentier Z');
});

Deno.test('mapStatus: Sentier ouvert without reason -> open', () => {
  assertEquals(mapStatus('Sentier ouvert', ''), 'open');
  assertEquals(mapStatus('Sentier ouvert', null), 'open');
});

Deno.test('mapStatus: Sentier ouvert with a non-empty reason -> warning (deterministic, not NLP)', () => {
  assertEquals(mapStatus('Sentier ouvert', 'Travaux en cours'), 'warning');
});

Deno.test('mapStatus: Sentier fermé -> closed', () => {
  assertEquals(mapStatus('Sentier fermé', ''), 'closed');
});

Deno.test('mapStatus: Sentier hors gestion ONF -> not_managed', () => {
  assertEquals(mapStatus('Sentier hors gestion ONF', ''), 'not_managed');
});

Deno.test('mapStatus: unrecognized value passes through verbatim (SQL detects the anomaly, never masked here)', () => {
  assertEquals(mapStatus('Sentier en travaux', ''), 'Sentier en travaux');
});

Deno.test('mapStatus: empty/null status passes through as empty string', () => {
  assertEquals(mapStatus('', ''), '');
  assertEquals(mapStatus(null, null), '');
});

Deno.test('parseReopeningDate: full day/month/year -> day precision', () => {
  assertEquals(parseReopeningDate('05/09/2026'), { date: '2026-09-05', precision: 'day' });
});

Deno.test('parseReopeningDate: day with lead-in words and 2-digit year -> day precision', () => {
  assertEquals(parseReopeningDate('Réouverture prévue le 05/09/26'), { date: '2026-09-05', precision: 'day' });
});

Deno.test('parseReopeningDate: French month name + year -> month precision', () => {
  assertEquals(parseReopeningDate('Septembre 2026'), { date: '2026-09-01', precision: 'month' });
});

Deno.test('parseReopeningDate: bare "Réouverture <year>" -> year precision', () => {
  assertEquals(parseReopeningDate('Réouverture 2026'), { date: '2026-01-01', precision: 'year' });
});

Deno.test('parseReopeningDate: "pas de réouverture" -> none_planned, no date invented', () => {
  assertEquals(parseReopeningDate('Pas de réouverture prévue (à court terme)'), { date: null, precision: 'none_planned' });
});

Deno.test('parseReopeningDate: garbled typo + ambiguous slash-year -> text_only, never a guessed year', () => {
  assertEquals(parseReopeningDate('Réouverure 2027/2028ux'), { date: null, precision: 'text_only' });
});

Deno.test('parseReopeningDate: empty/whitespace -> null date, null precision (nothing to say)', () => {
  assertEquals(parseReopeningDate(''), { date: null, precision: null });
  assertEquals(parseReopeningDate('   '), { date: null, precision: null });
});

Deno.test('parseReopeningDate: unrecognized free text -> text_only, no date invented', () => {
  assertEquals(parseReopeningDate('bientot peut etre'), { date: null, precision: 'text_only' });
});

Deno.test('computeGeomHash: produces a stable 64-char hex sha256', async () => {
  const geom = { type: 'LineString', coordinates: [[55.5, -21.1], [55.6, -21.2]] };
  const hash = await computeGeomHash(geom);
  assertMatch(hash, /^[0-9a-f]{64}$/);
});

Deno.test('computeGeomHash: insensitive to reprojection noise past 7 decimals (§10)', async () => {
  const a = { type: 'LineString', coordinates: [[55.5123456789, -21.1987654321], [55.6, -21.2]] };
  const aNoisy = { type: 'LineString', coordinates: [[55.51234567891234, -21.19876543219999], [55.6000000001, -21.2]] };
  assertEquals(await computeGeomHash(a), await computeGeomHash(aNoisy));
});

Deno.test('computeGeomHash: detects a real change within the 7 significant decimals', async () => {
  const a = { type: 'LineString', coordinates: [[55.5123456789, -21.1987654321], [55.6, -21.2]] };
  const b = { type: 'LineString', coordinates: [[55.5123999789, -21.1987654321], [55.6, -21.2]] };
  const hashA = await computeGeomHash(a);
  const hashB = await computeGeomHash(b);
  if (hashA === hashB) throw new Error('expected different hashes for a real geometry change');
});

Deno.test('normalizeFeature: end-to-end mapping preserves raw fields and derives clean ones', async () => {
  const feature = {
    type: 'Feature' as const,
    properties: {
      OBJECTID: 1538,
      WS_NomIti: 'Route Forestière du Gol (hors gestion ONF)',
      WS_NomItiL: 'RF Gol',
      WS_Statut: 'Sentier hors gestion ONF',
      WS_InfCaus: '',
      WS_InfDate: '',
      WS_LongM: 17,
      Shape__Length: 16.6787015250435,
    },
    geometry: { type: 'LineString', coordinates: [[55.36, -21.27], [55.37, -21.28]] },
  };
  const norm = await normalizeFeature(feature);
  assertEquals(norm.external_id, 'objectid:1538');
  assertEquals(norm.name_raw, 'Route Forestière du Gol (hors gestion ONF)');
  assertEquals(norm.name_normalized, 'Route Forestière du Gol');
  assertEquals(norm.status_normalized_code, 'not_managed');
  assertEquals(norm.raw_attributes['WS_NomIti'], 'Route Forestière du Gol (hors gestion ONF)');
  assertEquals(norm.length_m_source, 17);
  assertEquals(norm.reopening_date, null);
  assertEquals(norm.reopening_precision, null);
  assertMatch(norm.geom_hash ?? '', /^[0-9a-f]{64}$/);
});

Deno.test('normalizeFeature: missing OBJECTID throws (never silently accepted)', async () => {
  const feature = {
    type: 'Feature' as const,
    properties: { WS_NomIti: 'x' },
    geometry: { type: 'LineString', coordinates: [] },
  };
  let threw = false;
  try {
    await normalizeFeature(feature);
  } catch {
    threw = true;
  }
  assertEquals(threw, true);
});
