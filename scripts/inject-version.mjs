/**
 * Injects version + plan from package.json into static HTML files.
 *
 * Replaces {{VERSION}} and {{PLAN}} placeholders in:
 *   - public/penpot-companion-ui.html
 *   - tauri-bridge/index.html
 *   - tauri-bridge/dist/index.html
 *
 * Run: node scripts/inject-version.mjs
 * Called automatically during yarn build (see package.json scripts).
 */

import { readFileSync, writeFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

// Read package.json
const pkg = JSON.parse(readFileSync(resolve(root, "package.json"), "utf-8"));
const VERSION = pkg.version;
const PLAN = pkg.plan || "community";
const PLAN_DISPLAY = PLAN.charAt(0).toUpperCase() + PLAN.slice(1);

const files = [
  "public/penpot-companion-ui.html",
  "tauri-bridge/index.html",
  "tauri-bridge/dist/index.html",
];

for (const file of files) {
  const path = resolve(root, file);
  try {
    let content = readFileSync(path, "utf-8");
    const original = content;

    content = content
      .replace(/\{\{VERSION\}\}/g, VERSION)
      .replace(/\{\{PLAN\}\}/g, PLAN_DISPLAY);

    // Also update any existing hardcoded v0.x.x tags
    content = content.replace(/v\d+\.\d+\.\d+(?:\s+\w+)?/g, `v${VERSION} ${PLAN_DISPLAY}`);

    if (content !== original) {
      writeFileSync(path, content, "utf-8");
      console.log(`  ✔ ${file} → v${VERSION} ${PLAN_DISPLAY}`);
    } else {
      console.log(`  ~ ${file} (no changes needed)`);
    }
  } catch {
    console.warn(`  ⚠ ${file} not found, skipping`);
  }
}

console.log(`\nVersion injected: v${VERSION} ${PLAN_DISPLAY}`);
