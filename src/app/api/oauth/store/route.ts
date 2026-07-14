import { NextRequest, NextResponse } from 'next/server';
import { storeOauthToken, getOauthToken } from '@/lib/relayRedis';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const state = searchParams.get('state');

  if (!state) {
    return NextResponse.json({ error: 'Missing state parameter' }, { status: 400 });
  }

  try {
    const tokens = await getOauthToken(state);
    if (tokens) {
      return NextResponse.json({ status: 'success', tokens });
    }
    return NextResponse.json({ status: 'pending' });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Database error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const { state, tokens } = await request.json();

    if (!state || !tokens) {
      return NextResponse.json({ error: 'Missing state or tokens' }, { status: 400 });
    }

    await storeOauthToken(state, tokens);
    return NextResponse.json({ success: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Invalid payload or server error';
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
