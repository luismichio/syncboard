import * as fs from 'node:fs';
import * as path from 'node:path';
import GithubSlugger from 'github-slugger';

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
 * Normalizes a filename or relative path into a web URL slug.
 * E.g. `architecture/sources.md` -> `architecture-sources`
 * E.g. `setup.md` -> `setup`
 */
function filenameToSlug(filename: string): string {
  const cleanPath = filename.replace(/\.mdx?$/, '');
  if (cleanPath.toUpperCase() === 'README') return 'readme';
  return cleanPath.replace(/[/\\]/g, '-').toLowerCase();
}

/**
 * Parses YAML frontmatter between `---` delimiters at the start of a markdown string.
 */
function parseFrontmatter(md: string): { title?: string; description?: string } {
  const match = md.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) return {};
  const block = match[1];
  const result: { title?: string; description?: string } = {};

  for (const line of block.split(/\r?\n/)) {
    const titleMatch = line.match(/^title:\s*(?:"([^"]+)"|'([^']+)'|(.+))$/);
    if (titleMatch) {
      result.title = (titleMatch[1] || titleMatch[2] || titleMatch[3]).trim();
    }
    const descMatch = line.match(/^description:\s*(?:"([^"]+)"|'([^']+)'|(.+))$/);
    if (descMatch) {
      result.description = (descMatch[1] || descMatch[2] || descMatch[3]).trim();
    }
  }

  return result;
}

/**
 * Extracts a title from markdown (frontmatter `title` or first `# Heading`).
 */
function extractTitle(md: string, fallback: string): string {
  const fm = parseFrontmatter(md);
  if (fm.title) return fm.title;

  const h1Match = md.match(/^#\s+(.+)$/m);
  if (h1Match) return h1Match[1].trim();

  return fallback.replace(/\.mdx?$/, '');
}

/**
 * Extracts a short description from markdown (frontmatter description or overview blockquote or first paragraph).
 */
function extractDescription(md: string): string {
  // 1. Try frontmatter description
  const fm = parseFrontmatter(md);
  if (fm.description) return fm.description;

  // Skip frontmatter
  const body = md.replace(/^---[\s\S]*?---\s*/, '');

  // 2. Try top blockquote summary (> **Overview:** ...)
  const overviewMatch = body.match(/^>\s*(?:\*\*Overview:\*\*|Overview:)\s*(.+)/m);
  if (overviewMatch && overviewMatch[1]) {
    return overviewMatch[1].trim().replace(/[*_`]/g, '').slice(0, 160);
  }

  // 3. Fallback: Find the first valid text paragraph
  let inCodeBlock = false;
  const lines = body.split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (trimmed.startsWith('```')) {
      inCodeBlock = !inCodeBlock;
      continue;
    }
    if (inCodeBlock) continue;
    if (trimmed.startsWith('#')) continue;
    if (trimmed.startsWith('>')) continue;
    if (trimmed.startsWith('<!--') || trimmed.startsWith('-->')) continue;
    if (trimmed.startsWith('<table') || trimmed.startsWith('<tr') || trimmed.startsWith('<td') || trimmed.startsWith('</table')) continue;
    if (trimmed.startsWith('[!') || (trimmed.startsWith('[') && (trimmed.includes('badge') || trimmed.includes('shields.io') || trimmed.includes('vercel.com')))) continue;

    const cleaned = trimmed.replace(/[*_`]/g, '').slice(0, 160);
    return cleaned;
  }
  return '';
}

/**
 * Recursively scans `dir` for `.md` and `.mdx` files.
 */
function findDocFiles(dir: string, baseDir: string = dir): string[] {
  if (!fs.existsSync(dir)) return [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    const relPath = path.relative(baseDir, fullPath);

    if (entry.isDirectory()) {
      // Ignore internal development logs
      if (entry.name === 'dev') continue;
      files.push(...findDocFiles(fullPath, baseDir));
    } else if (entry.isFile() && /\.(md|mdx)$/i.test(entry.name)) {
      if (HIDDEN_DOCS.has(entry.name)) continue;
      files.push(relPath);
    }
  }

  return files;
}

/**
 * Returns metadata for all documentation files in `doc/` plus `README.md`.
 */
export function getAllDocs(): DocMeta[] {
  const docFiles = findDocFiles(DOC_DIR);
  const results: DocMeta[] = [];

  for (const relFile of docFiles) {
    const filepath = path.join(DOC_DIR, relFile);
    try {
      const content = fs.readFileSync(filepath, 'utf-8');
      const stat = fs.statSync(filepath);
      const normalizedRelFile = relFile.replace(/\\/g, '/');
      results.push({
        slug: filenameToSlug(normalizedRelFile),
        title: extractTitle(content, relFile),
        description: extractDescription(content),
        filename: normalizedRelFile,
        size: stat.size,
        updatedAt: stat.mtime,
      });
    } catch {
      // Skip unreadable files
    }
  }

  // Include root-level markdown docs (README.md, CONTRIBUTING.md, SECURITY.md)
  const rootFiles = ['README.md', 'CONTRIBUTING.md', 'SECURITY.md'];
  for (const rootFile of rootFiles) {
    const rootFilePath = path.resolve(process.cwd(), rootFile);
    try {
      const md = fs.readFileSync(rootFilePath, 'utf-8');
      const stat = fs.statSync(rootFilePath);
      results.push({
        slug: filenameToSlug(rootFile),
        title: extractTitle(md, rootFile),
        description: extractDescription(md),
        filename: rootFile,
        size: stat.size,
        updatedAt: stat.mtime,
      });
    } catch {
      // Root file not found — skip
    }
  }

  return results;
}

const ROOT_DOCS = new Set(['README.md', 'CONTRIBUTING.md', 'SECURITY.md']);

/**
 * Returns metadata and raw content for a single doc by slug.
 */
export function getDocBySlug(slug: string): { meta: DocMeta; content: string } | null {
  const docs = getAllDocs();
  const doc = docs.find((d) => d.slug === slug || d.slug === slug.replace(/\//g, '-'));
  if (!doc) return null;

  // Block hidden docs
  if (HIDDEN_DOCS.has(path.basename(doc.filename))) return null;

  const isRootDoc = ROOT_DOCS.has(path.basename(doc.filename));
  const filepath = isRootDoc
    ? path.resolve(process.cwd(), doc.filename)
    : path.resolve(DOC_DIR, doc.filename);
  const content = stripFrontmatter(fs.readFileSync(filepath, 'utf-8')).replace(/\r/g, '');

  return { meta: doc, content };
}

/**
 * Extracts h2-h4 headings from raw markdown for TOC generation.
 * Uses official `github-slugger` for 100% ID parity with `rehypeSlug`.
 */
export function extractHeadings(md: string): DocHeading[] {
  const body = md.replace(/^---[\s\S]*?---\n*/, '');
  const lines = body.split('\n');
  const headings: DocHeading[] = [];
  const slugger = new GithubSlugger();

  let inCodeBlock = false;

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('```')) {
      inCodeBlock = !inCodeBlock;
      continue;
    }
    if (inCodeBlock) continue;

    const match = trimmed.match(/^(#{2,4})\s+(.+)$/);
    if (match) {
      const level = match[1].length;
      const rawText = match[2].trim();
      const displayText = rawText
        .replace(/<[^>]+>/g, '')
        .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
        .replace(/[`*_~]/g, '')
        .trim();
      const id = slugger.slug(rawText);
      headings.push({ level, text: displayText, id });
    }
  }

  return headings;
}

/** Strips YAML frontmatter (delimited by `---` at start of file) from markdown content. */
export function stripFrontmatter(md: string): string {
  return md.replace(/^---[\s\S]*?---\s*/, '').trimStart();
}

/**
 * Rough word count for a markdown document.
 */
export function getWordCount(md: string): number {
  const body = stripFrontmatter(md);
  const text = body.replace(/```[\s\S]*?```/g, '').replace(/<[^>]+>/g, '');
  return text.trim().split(/\s+/).filter(Boolean).length;
}
