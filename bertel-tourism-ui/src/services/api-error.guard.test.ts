/** @jest-environment node */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * GARDE DE NON-RETOUR (2026-09-01) — un code allowlisté ne doit JAMAIS être alimenté par un
 * `error.message` de PostgREST / Postgres / GoTrue.
 *
 * POURQUOI UNE GARDE ET PAS SEULEMENT DES TESTS DE ROUTE. Le défaut est arrivé DEUX fois pour la
 * même raison : `task-document/route.ts` a été écrit en CLONANT `actor-document/route.ts`, ligne
 * `detail: error.message` comprise. Les tests par route couvrent les routes qui EXISTENT ; celle
 * qu'on clonera demain n'est couverte par personne. Cette garde-ci lit le code source de toutes
 * les routes et échoue sur la copie AVANT qu'elle n'atteigne un écran.
 *
 * Le `detail` de `delete_failed` / `erase_failed` est affiché VERBATIM (`CODES_WITH_BUSINESS_DETAIL`
 * dans api-error.ts) : c'est voulu pour les messages de nos `RAISE`, jamais pour la sortie du
 * moteur. Le tri se fait avec `engineErrorDetail` (@/lib/db-error-message).
 */
const ALLOWLISTED_CODES = ['delete_failed', 'erase_failed'];

const API_ROOT = join(process.cwd(), 'src', 'app', 'api');

function routeFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) return routeFiles(full);
    if (!entry.name.endsWith('.ts') || entry.name.includes('.test.')) return [];
    return [full];
  });
}

/**
 * Les deux ordres d'écriture du littéral (`error` puis `detail`, ou l'inverse) et le `detail`
 * capturé jusqu'à la virgule ou l'accolade fermante.
 */
function offendingDetails(source: string): string[] {
  const codes = ALLOWLISTED_CODES.join('|');
  const patterns = [
    new RegExp(`error:\\s*'(?:${codes})'\\s*,\\s*detail:\\s*([^,}]+)`, 'g'),
    new RegExp(`detail:\\s*([^,}]+),\\s*error:\\s*'(?:${codes})'`, 'g'),
  ];
  const found: string[] = [];
  for (const pattern of patterns) {
    for (const match of source.matchAll(pattern)) {
      const expression = match[1].trim();
      // `\.message` sous toutes ses formes : `error.message`, `err?.message`, `rpcErr.message`.
      if (/\??\.message\b/.test(expression)) found.push(expression);
    }
  }
  return found;
}

describe('garde — aucune route n’alimente un code allowlisté avec le brut du moteur', () => {
  it('la garde détecte bien le motif qu’elle cherche (sinon elle ne garde rien)', () => {
    expect(offendingDetails("NextResponse.json({ error: 'delete_failed', detail: error.message }, { status: 500 })"))
      .toEqual(['error.message']);
    expect(offendingDetails("NextResponse.json({ error: 'erase_failed', detail: rpcErr?.message })"))
      .toEqual(['rpcErr?.message']);
    expect(offendingDetails("NextResponse.json({ detail: e.message, error: 'delete_failed' })"))
      .toEqual(['e.message']);
    // Et elle laisse passer ce qui est LÉGITIME : un message métier trié à la source.
    expect(offendingDetails("NextResponse.json({ error: 'delete_failed', detail: engineErrorDetail(error) })"))
      .toEqual([]);
    expect(offendingDetails("NextResponse.json({ error: 'upload_failed', detail: error.message })"))
      .toEqual([]); // code NON allowlisté : son detail reste au journal, jamais affiché
  });

  it('aucune route sous src/app/api ne relaie un `error.message` sur ces codes', () => {
    const offenders = routeFiles(API_ROOT)
      .map((file) => ({ file, details: offendingDetails(readFileSync(file, 'utf8')) }))
      .filter(({ details }) => details.length > 0)
      .map(({ file, details }) => `${file.replace(process.cwd(), '.')} → detail: ${details.join(', ')}`);

    expect(offenders).toEqual([]);
  });
});
