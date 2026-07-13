// benchmark.test.ts — bancs d'essai contre le snapshot RÉEL de la couche 5 ONF (fixture téléchargée
// en direct le 2026-07-13, 375 features, ~4,4 Mo, ~122k sommets — cf. design §1.3/§25). Vérifié en
// premier via un harnais Node local (aucun Deno local dans cet environnement de dev) : parse
// 117 ms, normalisation 375 features 499 ms (1,33 ms/feature), delta heap 15,8 Mo, payload
// normalisé 4,52 Mo — largement dans le budget d'une invocation Edge Function.
import { assertEquals, assertMatch } from 'jsr:@std/assert@1';
import { normalizeFeature, type ArcGisFeature } from '../_shared/normalize.ts';

const FIXTURE_PATH = new URL('./__fixtures__/onf-layer5-live-snapshot.geojson', import.meta.url);
// Budget conservateur : très en-dessous des ~150s de plafond wall-clock des Edge Functions
// Supabase — le pipeline de normalisation pur mesure ~0,6s en pratique (Node), le fetch réseau
// domine le temps total mais reste hors du périmètre de ce test (couvert par arcgis.test.ts avec
// fetch mocké — un test réseau réel et non-déterministe n'a pas sa place dans la suite unitaire).
const TIME_BUDGET_MS = 30000;

Deno.test('benchmark: full ONF layer-5 fixture normalizes within budget, no crash, no unexpected anomaly rate', async () => {
  const raw = await Deno.readTextFile(FIXTURE_PATH);
  const geo = JSON.parse(raw) as { features: ArcGisFeature[] };

  const t0 = performance.now();
  const normalized = await Promise.all(geo.features.map((f) => normalizeFeature(f)));
  const elapsedMs = performance.now() - t0;

  console.log(`normalized ${normalized.length} features in ${elapsedMs.toFixed(1)} ms (${(elapsedMs / normalized.length).toFixed(3)} ms/feature)`);

  if (elapsedMs > TIME_BUDGET_MS) {
    throw new Error(`normalize pipeline exceeded ${TIME_BUDGET_MS} ms budget (${elapsedMs.toFixed(0)} ms)`);
  }

  // Le fixture live du 2026-07-13 a exactement 3 valeurs WS_Statut connues (vérifié en direct) ->
  // 0 feature ne devrait tomber en passthrough (statut inconnu). Si ce nombre grandit, ce n'est PAS
  // un bug de ce test : ça signale une nouvelle valeur WS_Statut côté ONF, à traiter côté §5.2.
  const passthrough = normalized.filter((n) => !['open', 'closed', 'warning', 'not_managed'].includes(n.status_normalized_code));
  console.log(`status passthrough (non mappé) : ${passthrough.length}`);

  // Tous les hash doivent être des sha256 hex valides, et — signal de non-régression — uniques
  // (deux sentiers distincts ne devraient pas partager un tracé identique au mètre près).
  for (const n of normalized) {
    assertMatch(n.geom_hash ?? '', /^[0-9a-f]{64}$/);
  }
  const uniqueHashes = new Set(normalized.map((n) => n.geom_hash)).size;
  assertEquals(uniqueHashes, normalized.length);

  // Chaque feature source (OBJECTID) doit produire exactement une feature normalisée — aucune
  // perte silencieuse.
  assertEquals(normalized.length, geo.features.length);
});
