import path from "node:path";
import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { compileMDX } from "next-mdx-remote/rsc";
import rehypeHighlight from "rehype-highlight";
import rehypeSlug from "rehype-slug";
import rehypeAutolinkHeadings from "rehype-autolink-headings";
import remarkGfm from "remark-gfm";
import { visit } from "unist-util-visit";
import { getAllDocs, getDocBySlug, extractHeadings, getWordCount } from "@/lib/docs";
import { VersionStamp } from "@/components/VersionStamp";
import TOC from "@/components/docs/TOC";
import MermaidHydrator from "@/components/docs/MermaidHydrator";
import CodeCopyHydrator from "@/components/docs/CodeCopyHydrator";
import VideoTabs from "@/components/docs/VideoTabs";
import CookieSettingsButton from "@/components/CookieSettingsButton";
import ThemeToggle from "@/components/ThemeToggle";

import type { Node } from "unist";

interface UnistNode extends Node {
  tagName?: string;
  properties?: {
    className?: string[];
    [key: string]: unknown;
  };
  children?: UnistNode[];
  value?: string;
}

// Rehype plugin: transform ```mermaid code blocks into <div class="mermaid-diagram">
function rehypeMermaidBlocks() {
  return (tree: UnistNode) => {
    visit(tree, "element", (node: UnistNode) => {
      if (node.tagName === "pre") {
        const code = node.children?.[0];
        if (
          code?.tagName === "code" &&
          Array.isArray(code.properties?.className) &&
          code.properties.className.includes("language-mermaid")
        ) {
          const text = code.children
            ?.filter((c: UnistNode) => c.type === "text")
            .map((c: UnistNode) => c.value)
            .join("");
          node.tagName = "div";
          node.properties = { className: ["mermaid-diagram"] };
          node.children = [{ type: "text", value: text || "" }];
        }
      }
    });
  };
}

export async function generateStaticParams() {
  const docs = getAllDocs();
  return docs.map((doc) => ({ slug: doc.slug }));
}

export async function generateMetadata(props: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await props.params;
  const doc = getDocBySlug(slug);
  if (!doc) return {};

  const title = `${doc.meta.title} — SyncingBoard Docs`;
  const description = doc.meta.description || "SyncingBoard documentation";

  return {
    title,
    description,
    alternates: {
      canonical: `https://www.syncingboard.com/docs/${slug}`,
    },
    openGraph: {
      title,
      description,
      url: `https://www.syncingboard.com/docs/${slug}`,
      type: "article",
    },
    twitter: {
      title,
      description,
    },
  };
}

// Rehype plugin: transform relative .md links and GitHub doc links into /docs/<slug> web routes
function rehypeDocLinks(docFilename: string) {
  return (tree: UnistNode) => {
    const docDir = path.dirname(docFilename);
    const allDocs = getAllDocs();

    visit(tree, "element", (node: UnistNode) => {
      if (node.tagName === "a" && typeof node.properties?.href === "string") {
        let href = node.properties.href;

        // Convert GitHub repository doc links (e.g. https://github.com/luismichio/syncingboard/blob/dev/doc/setup.md) into relative paths
        const githubBlobMatch = href.match(/^https?:\/\/github\.com\/luismichio\/syncingboard\/blob\/[^/]+\/(.+)$/i);
        if (githubBlobMatch) {
          href = githubBlobMatch[1];
        }

        // Skip non-doc external URLs, mailto, tel, or hash-only links
        if (
          href.startsWith("http://") ||
          href.startsWith("https://") ||
          href.startsWith("mailto:") ||
          href.startsWith("tel:") ||
          href.startsWith("#")
        ) {
          return;
        }

        const [rawPathPart, hash] = href.split("#");
        const pathPart = rawPathPart.replace(/^\.\//, ""); // Strip leading ./

        if (pathPart && (pathPart.endsWith(".md") || pathPart.startsWith("doc/") || pathPart.startsWith("."))) {
          // Resolve relative path against document directory
          const targetPath = path.normalize(path.join(docDir, pathPart)).replace(/\\/g, "/");
          const cleanTarget = targetPath.replace(/^(\.\.\/|\.\/)+/, "").replace(/^\/?(doc\/)?/, "");
          const baseName = path.basename(pathPart).toLowerCase();

          if (baseName === "readme.md") {
            node.properties.href = `/docs/readme${hash ? "#" + hash : ""}`;
            return;
          }

          if (baseName === "license" || baseName === "license.md") {
            node.properties.href = `/docs/license${hash ? "#" + hash : ""}`;
            return;
          }

          if (baseName === "security" || baseName === "security.md") {
            node.properties.href = `/docs/security${hash ? "#" + hash : ""}`;
            return;
          }

          if (baseName === "contributing" || baseName === "contributing.md") {
            node.properties.href = `/docs/contributing${hash ? "#" + hash : ""}`;
            return;
          }

          const matched = allDocs.find(
            (d) =>
              d.filename.toLowerCase() === targetPath.toLowerCase() ||
              d.filename.toLowerCase() === cleanTarget.toLowerCase() ||
              d.slug === cleanTarget.replace(/\.md$/, "").replace(/\//g, "-").toLowerCase() ||
              d.slug === baseName.replace(/\.md$/, "")
          );

          if (matched) {
            node.properties.href = `/docs/${matched.slug}${hash ? "#" + hash : ""}`;
          } else {
            const fallbackSlug = cleanTarget.replace(/\.md$/, "").replace(/\//g, "-").toLowerCase();
            node.properties.href = `/docs/${fallbackSlug}${hash ? "#" + hash : ""}`;
          }
        }
      }
    });
  };
}

export default async function DocPage(props: { params: Promise<{ slug: string }> }) {
  const { slug } = await props.params;
  const doc = getDocBySlug(slug);
  if (!doc) notFound();

  const headings = extractHeadings(doc.content);
  const wordCount = getWordCount(doc.content);

  const { content } = await compileMDX({
    source: doc.content,
    components: {
      VideoTabs,
    },
    options: {
      parseFrontmatter: false,
      mdxOptions: {
        remarkPlugins: [
          remarkGfm,
        ],
        rehypePlugins: [
          rehypeSlug,
          [
            rehypeAutolinkHeadings,
            {
              behavior: "prepend",
              properties: {
                className: ["heading-anchor"],
                ariaHidden: "true",
                tabIndex: -1,
              },
              content: {
                type: "element",
                tagName: "span",
                properties: { className: ["heading-anchor-icon"] },
                children: [
                  {
                    type: "text",
                    value: "#",
                  },
                ],
              },
            },
          ],
          rehypeMermaidBlocks,
          [rehypeDocLinks, doc.meta.filename],
          rehypeHighlight,
        ],
      },
    },
  });

  const lastUpdated = new Date(doc.meta.updatedAt).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return (
    <main className="min-h-screen bg-bg-page text-text-page font-sans selection:bg-accent selection:text-bg-page relative overflow-x-clip">
      {/* Decorative background grid */}
      <div
        className="absolute inset-0 opacity-[0.03] pointer-events-none"
        aria-hidden="true"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='40' height='40' viewBox='0 0 40 40'%3E%3Cpath d='M0 40h40V0H0v40zM39 39H1V1h38v38z' fill='%23FAF9F5'/%3E%3C/svg%3E")`,
          backgroundSize: "40px 40px",
        }}
      />

      {/* Header */}
      <header className="sticky top-0 z-50 bg-bg-page/80 backdrop-blur-md border-b border-border-card transition-all">
        <div className="max-w-5xl mx-auto px-6 py-6 flex items-center justify-between">
          <div className="flex items-center gap-3 min-w-0">
            <Link href="/" className="hover:opacity-80 transition shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent rounded-lg">
              <span className="text-lg font-bold tracking-tight">SyncingBoard</span>
            </Link>
            <span className="text-text-muted font-mono text-xs shrink-0" aria-hidden="true">/</span>
            <Link href="/docs" className="text-xs font-mono text-text-muted hover:text-text-page transition shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent rounded-sm">
              docs
            </Link>
            <span className="text-text-muted font-mono text-xs shrink-0" aria-hidden="true">/</span>
            <h1 className="text-sm font-mono text-accent font-semibold truncate">{doc.meta.title}</h1>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <a
              href={`https://github.com/luismichio/syncingboard/blob/main/doc/${encodeURIComponent(path.basename(doc.meta.filename))}`}
              target="_blank"
              rel="noreferrer"
              className="hidden sm:inline-flex px-4 py-2 rounded-lg font-mono font-bold text-xs border border-border-card text-text-page hover:bg-bg-card transition duration-200 shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            >
              VIEW ON GITHUB
            </a>
            <VersionStamp
              as="span"
              className="hidden md:inline-flex text-xs font-mono text-text-muted px-3 py-2 rounded-lg border border-border-card shrink-0"
            />
          </div>
        </div>
      </header>

      {/* Content + TOC */}
      <div className="relative z-10 max-w-5xl mx-auto px-6 py-12 flex gap-12">
        {/* Main content */}
        <div className="doc-content min-w-0 flex-1">
          {/* Metadata bar */}
          <div className="flex flex-wrap items-center gap-3 mb-8 pb-6 border-b border-border-card text-xs font-mono text-text-muted">
            <span>{lastUpdated}</span>
            <span className="w-1 h-1 rounded-full bg-border-card" aria-hidden="true" />
            <span>~{wordCount} words</span>
            <span className="w-1 h-1 rounded-full bg-border-card" aria-hidden="true" />
            <span>{doc.meta.filename}</span>
          </div>

          {/* Rendered markdown */}
          <article className="
            prose max-w-none
            prose-headings:font-bold prose-headings:tracking-tight prose-headings:text-text-page prose-headings:scroll-mt-24
            prose-h1:text-3xl prose-h1:border-b prose-h1:border-border-card prose-h1:pb-4 prose-h1:mb-10 prose-h1:font-extrabold prose-h1:leading-tight
            prose-h2:text-2xl prose-h2:mt-14 prose-h2:mb-5 prose-h2:font-extrabold prose-h2:leading-snug prose-h2:text-text-page
            prose-h3:text-xl prose-h3:mt-10 prose-h3:mb-4 prose-h3:font-bold prose-h3:leading-snug
            prose-h4:text-lg prose-h4:mt-8 prose-h4:mb-3 prose-h4:font-semibold prose-h4:leading-snug
            prose-p:text-[15px] prose-p:text-text-muted prose-p:leading-[1.75] prose-p:my-4
            prose-a:text-accent prose-a:no-underline hover:prose-a:underline prose-a:font-medium
            prose-strong:text-text-page prose-strong:font-semibold
            prose-li:text-[15px] prose-li:text-text-muted prose-li:leading-[1.75] prose-li:my-1.5
            prose-hr:border-border-card prose-hr:my-10
            prose-blockquote:border-l-2 prose-blockquote:border-l-accent prose-blockquote:bg-bg-card/60 prose-blockquote:rounded-r-xl prose-blockquote:py-3 prose-blockquote:px-5 prose-blockquote:not-italic
            prose-blockquote:text-text-muted prose-blockquote:my-6
            prose-img:rounded-xl prose-img:border prose-img:border-border-card prose-img:my-8
            prose-ul:my-6 prose-ol:my-6
            prose-li:marker:text-text-muted
          ">
            {content}
          </article>
          <MermaidHydrator />
          <CodeCopyHydrator />

          {/* Back link */}
          <div className="mt-16 pt-8 border-t border-border-card">
            <Link
              href="/docs"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg font-mono font-bold text-xs border border-border-card text-text-page hover:bg-bg-card transition duration-200"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="m12 19-7-7 7-7"/><path d="M19 12H5"/>
              </svg>
              BACK TO DOCS
            </Link>
          </div>
        </div>

        {/* TOC sidebar */}
        <aside className="hidden lg:block w-56 shrink-0">
          <div className="sticky top-28">
            <div className="toc-container max-h-[calc(100vh-9rem)] overflow-y-auto overflow-x-hidden">
              <TOC headings={headings} />
            </div>
          </div>
        </aside>
      </div>

      {/* Mobile TOC (collapsed below content) */}
      {headings.length >= 2 && (
        <div className="relative z-10 max-w-5xl mx-auto px-6 pb-8 lg:hidden">
          <details className="group">
            <summary className="cursor-pointer text-xs font-mono font-bold uppercase tracking-widest text-text-muted hover:text-text-page transition list-none flex items-center gap-2">
              <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="transition-transform group-open:rotate-90">
                <path d="m9 18 6-6-6-6"/>
              </svg>
              On this page
            </summary>
            <ul className="mt-3 space-y-1.5 border-l border-border-card">
              {headings.map((h) => (
                <li key={h.id}>
                  <a
                    href={`#${h.id}`}
                    className={`
                      block text-xs leading-tight py-1 border-l transition-all duration-150
                      ${h.level === 2
                        ? "pl-4 -ml-[1px] border-l-accent text-text-page hover:text-accent"
                        : h.level === 3
                        ? "pl-7 -ml-[1px] border-l-transparent text-text-muted hover:text-text-page"
                        : "pl-10 -ml-[1px] border-l-transparent text-text-muted/70 hover:text-text-muted"
                      }
                    `}
                  >
                    {h.text}
                  </a>
                </li>
              ))}
            </ul>
          </details>
        </div>
      )}

      {/* Footer */}
      <footer className="relative z-10 border-t border-border-card">
        <div className="max-w-5xl mx-auto px-6 py-6 flex items-center justify-between text-[10px] font-mono text-text-muted">
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href="/docs/license"
              className="px-2.5 py-1 rounded-lg bg-bg-card border border-border-card text-text-muted hover:text-text-page hover:border-text-muted/40 transition duration-200 inline-flex items-center gap-1.5 text-xs font-mono select-none"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="m16 16 3-8 3 8c-.87.65-1.92 1-3 1s-2.13-.35-3-1Z" />
                <path d="m2 16 3-8 3 8c-.87.65-1.92 1-3 1s-2.13-.35-3-1Z" />
                <path d="M7 21h10" />
                <path d="M12 3v18" />
                <path d="M3 7h18" />
              </svg>
              <span>AGPLv3 License</span>
            </Link>
            <CookieSettingsButton />
            <ThemeToggle />
          </div>
          <a href="https://github.com/luismichio/syncingboard" target="_blank" rel="noreferrer" className="hover:text-text-page transition">
            github.com/luismichio/syncingboard
          </a>
        </div>
      </footer>
    </main>
  );
}
