import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const CANARY_LEAKED_REDIRECT = 'http://0.0.0.0:3000/leaked-canary';

function isStrictLoopbackCanaryRequest(request: Request): boolean {
  return request.headers.get('host')?.toLowerCase() === '127.0.0.1:3000';
}

/**
 * Dedicated fault-injection surface for loopback-only Red-Team measurement.
 * It is inert unless explicitly enabled on a standalone local server.
 */
export async function GET(request: Request) {
  if (
    process.env.AXIOM_REDTEAM_FAULT_INJECT !== '1' ||
    !isStrictLoopbackCanaryRequest(request)
  ) {
    return NextResponse.json(
      { error: 'not_found' },
      { status: 404, headers: { 'Cache-Control': 'no-store' } }
    );
  }

  // Intentional test-only violation: RT-07 must reject this non-loopback
  // redirect while safeLoopbackFetch() retains redirect: 'manual'.
  return NextResponse.json(
    { canary: 'fault_injection_unsafe_redirect' },
    {
      status: 307,
      headers: {
        Location: CANARY_LEAKED_REDIRECT,
        'Cache-Control': 'no-store',
      },
    }
  );
}
