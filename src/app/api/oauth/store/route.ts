import { NextRequest, NextResponse } from 'next/server';

// Global cache to temporarily store tokens mapped by state parameter during OAuth flow.
// In serverless, memory is ephemeral but fully reliable for single-developer instances/testing.
const globalStore = (global as unknown) as { oauthCache?: Map<string, unknown> };
const oauthCache = globalStore.oauthCache || new Map<string, unknown>();
globalStore.oauthCache = oauthCache;

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const state = searchParams.get('state');

  if (!state) {
    return NextResponse.json({ error: 'Missing state parameter' }, { status: 400 });
  }

  const tokens = oauthCache.get(state);
  if (tokens) {
    oauthCache.delete(state); // Consume token once read
    return NextResponse.json({ status: 'success', tokens });
  }

  return NextResponse.json({ status: 'pending' });
}

export async function POST(request: NextRequest) {
  try {
    const { state, tokens } = await request.json();

    if (!state || !tokens) {
      return NextResponse.json({ error: 'Missing state or tokens' }, { status: 400 });
    }

    oauthCache.set(state, tokens);
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
  }
}
