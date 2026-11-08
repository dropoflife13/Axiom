import { NextResponse, type NextRequest } from 'next/server';

export async function GET(request: NextRequest) {
  const url = new URL('/data/run-ablation-v2.json', request.url);
  return NextResponse.redirect(url, 307);
}
