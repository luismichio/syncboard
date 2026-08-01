import type { Metadata } from 'next';
import { getAllDocs } from '@/lib/docs';
import { DocsIndexClient } from './DocsIndexClient';

export const metadata: Metadata = {
  title: 'Documentation — SyncingBoard',
  description: 'Architecture specifications, setup guides, release notes, and configuration reference for self-hosting SyncingBoard.',
  alternates: {
    canonical: 'https://www.syncingboard.com/docs',
  },
  openGraph: {
    title: 'Documentation — SyncingBoard',
    description: 'Architecture specifications, setup guides, release notes, and configuration reference for self-hosting SyncingBoard.',
    url: 'https://www.syncingboard.com/docs',
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
