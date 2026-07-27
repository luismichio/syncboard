import type { Metadata } from 'next';
import { getAllDocs } from '@/lib/docs';
import { DocsIndexClient } from './DocsIndexClient';

export const metadata: Metadata = {
  title: 'Documentation — SyncBoard',
  description: 'Architecture specifications, setup guides, release notes, and configuration reference for self-hosting SyncBoard.',
  alternates: {
    canonical: 'https://syncboard.luiskobayashi.com/docs',
  },
  openGraph: {
    title: 'Documentation — SyncBoard',
    description: 'Architecture specifications, setup guides, release notes, and configuration reference for self-hosting SyncBoard.',
    url: 'https://syncboard.luiskobayashi.com/docs',
  },
};

export default function DocsIndexPage() {
  const rawDocs = getAllDocs();
  const docsData = rawDocs.map((d) => ({
    slug: d.slug,
    title: d.title,
    description: d.description,
    filename: d.filename,
    size: d.size,
  }));

  return <DocsIndexClient docs={docsData} />;
}
