import { NextResponse } from "next/server";
import packageJson from "../../../../package.json";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({
    status: "ok",
    name: "SyncingBoard",
    version: packageJson.version,
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
}
