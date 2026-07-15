import * as fs from 'node:fs';
import * as path from 'node:path';

const DOC_DIR = path.resolve(process.cwd(), 'doc');

/** Files to exclude from the public docs index and API */
const HIDDEN_DOCS = new Set([
  'backlog.md',      // Internal task tracking, not public
]);

export interface DocHeading {
  level: number;
  text: string;
  id: string;
}

export interface DocMeta {
  slug: string;
  title: string;
  description: string;
  filename: string;
  size: number;
  updatedAt: Date;
}

/**
 * Parses the first heading or frontmatter title from markdown content.
 */
function extractTitle(md: string, filename: string): string {
  // Try frontmatter title
  const fmTitle = md.match(/^---\s*\n(?:.*\n)*?title:\s*["']?(.+?)["']?\s*\n(?:.*\n)*?---/);
  if (fmTitle) return fmTitle[1];

  // Try first # heading
  const heading = md.match(/^#\s+(.+)/m);
  if (heading) return heading[1].trim();

  // Fallback: filename without extension
  return filename.replace(/\.md$/, '').replace(/[-_]/g, ' ');
}

/**
 * Extracts a short description from markdown (first paragraph after the heading).
 */
function extractDescription(md: string): string {
  // Skip frontmatter
  const body = md.replace(/^---[\s\S]*?---\n*/, '');
  const para = body.match(/(?:^|\n)([^\n#].*?)(?:\n|$)/);
  if (para) return para[1].trim().slice(0, 160);
  return '';
}

/**
 * Returns metadata for all markdown documents.
 */
export function getAllDocs(): DocMeta[] {
  const files = fs.readdirSync(DOC_DIR)
    .filter((f) => f.endsWith('.md') && !HIDDEN_DOCS.has(f))
    .sort();

  return files.map((filename) => {
    const filepath = path.join(DOC_DIR, filename);
    const stat = fs.statSync(filepath);
    const md = fs.readFileSync(filepath, 'utf-8');
    const slug = filename.replace(/\.md$/, '').toLowerCase();

    return {
      slug,
      title: extractTitle(md, filename),
      description: extractDescription(md),
      filename,
      size: stat.size,
      updatedAt: stat.mtime,
    };
  });
}

/**
 * Returns metadata and raw content for a single doc by slug.
 */
export function getDocBySlug(slug: string): { meta: DocMeta; content: string } | null {
  // Block hidden docs regardless of how they're accessed
  const filename = `${slug}.md`;
  if (HIDDEN_DOCS.has(filename)) return null;

  const docs = getAllDocs();
  const doc = docs.find((d) => d.slug === slug);
  if (!doc) return null;

  const filepath = path.join(DOC_DIR, doc.filename);
  const content = stripFrontmatter(fs.readFileSync(filepath, 'utf-8'));
  return { meta: doc, content };
}

/**
 * Extracts h2-h4 headings from raw markdown for TOC generation.
 * Skip frontmatter and code blocks.
 */
export function extractHeadings(md: string): DocHeading[] {
  const body = md.replace(/^---[\s\S]*?---\n*/, '');
  const headingRegex = /^(#{2,4})\s+(.+)$/gm;
  const headings: DocHeading[] = [];
  let match;
  while ((match = headingRegex.exec(body)) !== null) {
    const level = match[1].length;
    const text = match[2].trim();
    const id = text
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');
    headings.push({ level, text, id });
  }
  return headings;
}

/** Strips YAML frontmatter (delimited by `---` at start of file) from markdown content. */
export function stripFrontmatter(md: string): string {
  return md.replace(/^---[\s\S]*?---\n*/, '');
}

/**
 * Rough word count for a markdown document.
 */
export function getWordCount(md: string): number {
  const body = stripFrontmatter(md);
  const text = body.replace(/#+\s/g, '').replace(/[\s\n]+/g, ' ').trim();
  return text.split(/\s+/).length;
}
