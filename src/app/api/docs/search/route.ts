import { NextResponse } from 'next/server';
import { searchDocs } from '@/lib/docs';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const q = searchParams.get('q') || '';

  if (!q.trim()) {
    return NextResponse.json({ results: [] });
  }

  const results = searchDocs(q);
  return NextResponse.json({ results });
}
