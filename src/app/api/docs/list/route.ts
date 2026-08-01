import { NextResponse } from "next/server";
import { getAllDocs } from "@/lib/docs";

/**
 * GET /api/docs/list
 *
 * Returns a JSON index of all documentation files.
 * Agent-friendly: structured metadata for discovery.
 */
export async function GET() {
  const docs = getAllDocs();
  return NextResponse.json({
    count: docs.length,
    docs: docs.map((d) => ({
      slug: d.slug,
      title: d.title,
      description: d.description,
      filename: d.filename,
      size: d.size,
      updatedAt: d.updatedAt.toISOString(),
      rawUrl: `/api/docs/raw?file=${d.filename}`,
      htmlUrl: `/docs/${d.slug}`,
      githubUrl: `https://github.com/luismichio/syncingboard/blob/main/doc/${d.filename}`,
    })),
  });
}
