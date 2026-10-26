import { NextResponse } from 'next/server';
import { MINIMUM_CLIENT_VERSION, WRITE_CONTRACT_VERSION } from '../../../services/write-compatibility';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(): Promise<NextResponse> {
  return NextResponse.json(
    { minimumClientVersion: MINIMUM_CLIENT_VERSION, writeContractVersion: WRITE_CONTRACT_VERSION },
    { headers: { 'Cache-Control': 'no-store, max-age=0' } },
  );
}
