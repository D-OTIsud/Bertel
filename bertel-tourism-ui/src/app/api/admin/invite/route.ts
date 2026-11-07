import { NextResponse } from 'next/server';

export function POST(): NextResponse {
  return NextResponse.json({ error: 'bad_request' }, { status: 426 });
}
