import 'server-only';
import { after, NextResponse } from 'next/server';
import { logPartnerCall } from './partner-auth';

type Stage = 'admission' | 'list_rpc' | 'detail_rpc' | 'published_gate' | 'pivot' | 'i18n' | 'serialization';
type Route = 'list' | 'detail';
const STAGES: Stage[] = ['admission', 'list_rpc', 'detail_rpc', 'published_gate', 'pivot', 'i18n', 'serialization'];

/** Only fixed route/stage names and numeric measurements enter performance telemetry. */
export function partnerRequestMetrics(route: Route) {
  const started = performance.now();
  let list: { view: 'full' | 'card'; page_size: number } | undefined;
  function listOptions(view: 'full' | 'card', pageSize: number) {
    list = { view, page_size: pageSize };
  }
  const durations: Partial<Record<Stage, number>> = {};
  async function measure<T>(stage: Stage, work: () => Promise<T>): Promise<T> {
    const start = performance.now();
    try { return await work(); }
    finally { durations[stage] = (durations[stage] ?? 0) + performance.now() - start; }
  }
  function audit(keyId: string, path: 'GET /api/public/objects' | 'GET /api/public/objects/{id}', status: number) {
    after(async () => {
      const start = performance.now();
      try { await logPartnerCall(keyId, path, status); }
      catch { /* Audit failures cannot affect the already completed response. */ }
      console.info({ event: 'partner_api_audit', route, status, duration_ms: performance.now() - start });
    });
  }
  function json(body: unknown, init: { status: number; headers: Record<string, string> }): NextResponse {
    const start = performance.now();
    const serialized = JSON.stringify(body);
    const bytes = Buffer.byteLength(serialized, 'utf8');
    const response = new NextResponse(serialized, {
      ...init, headers: { 'content-type': 'application/json', ...init.headers },
    });
    durations.serialization = performance.now() - start;
    const total = performance.now() - started;
    const timing = STAGES.filter((stage) => durations[stage] !== undefined)
      .map((stage) => `${stage};dur=${durations[stage]!.toFixed(2)}`);
    timing.push(`total;dur=${total.toFixed(2)}`);
    response.headers.set('Server-Timing', timing.join(', '));
    console.info({ event: 'partner_api_response', route, status: init.status, bytes,
      ...(list ?? {}), stages_ms: { ...durations }, total_ms: total });
    return response;
  }
  return { measure, audit, json, listOptions };
}
