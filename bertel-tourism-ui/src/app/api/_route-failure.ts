import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';

type RouteFailureOptions = {
  status?: 500 | 502 | 503;
  headers?: HeadersInit;
  /** Existing safe business copy, such as a translated SQLSTATE. */
  detail?: string;
};

export function routeFailure(route: string, code: string, options: RouteFailureOptions = {}): NextResponse {
  const requestId = randomUUID();
  const headers = new Headers(options.headers);
  headers.set('x-request-id', requestId);
  console.warn('[route-error]', { route, code, requestId });
  return NextResponse.json({ error: code, detail: options.detail }, { status: options.status ?? 500, headers });
}
