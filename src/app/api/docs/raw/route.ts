import { NextRequest, NextResponse } from "next/server";
import { getDocBySlug, getAllDocs } from "@/lib/docs";

/**
 * GET /api/docs/raw?file=<filename.md>
 * GET /api/docs/raw?slug=<slug>
 *
 * Returns the raw markdown content of a documentation file.
 * Agent-friendly: plain text response for easy consumption.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const file = searchParams.get("file");
  const slugParam = searchParams.get("slug");

  // Resolve slug from filename
  let slug: string | null = null;

  if (slugParam) {
    slug = slugParam;
  } else if (file) {
    // Map filename to slug
    const docs = getAllDocs();
    const doc = docs.find((d) => d.filename === file);
    if (!doc) {
      return NextResponse.json(
        { error: `Document not found: ${file}` },
        { status: 404 }
      );
    }
    slug = doc.slug;
  }

  if (!slug) {
    return NextResponse.json(
      { error: "Provide ?file=<filename.md> or ?slug=<slug>" },
      { status: 400 }
    );
  }

  const doc = getDocBySlug(slug);
  if (!doc) {
    return NextResponse.json(
      { error: `Document not found: ${slug}` },
      { status: 404 }
    );
  }

  return new NextResponse(doc.content, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "X-Doc-Title": doc.meta.title,
      "X-Doc-Slug": doc.meta.slug,
      "X-Doc-Size": String(doc.meta.size),
    },
  });
}
