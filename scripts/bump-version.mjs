import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const targetVersion = process.argv[2];
if (!targetVersion) {
  console.error('Error: Please specify the version to bump to (e.g. node scripts/bump-version.mjs 0.3.0)');
  process.exit(1);
}

const rootDir = path.resolve(__dirname, '..');

// 1. Root package.json
const rootPkgPath = path.join(rootDir, 'package.json');
const rootPkg = JSON.parse(fs.readFileSync(rootPkgPath, 'utf8'));
rootPkg.version = targetVersion;
fs.writeFileSync(rootPkgPath, JSON.stringify(rootPkg, null, 2) + '\n');
console.log(`Updated root package.json version to ${targetVersion}`);

// 2. tauri-bridge/package.json
const tauriPkgPath = path.join(rootDir, 'tauri-bridge', 'package.json');
if (fs.existsSync(tauriPkgPath)) {
  const tauriPkg = JSON.parse(fs.readFileSync(tauriPkgPath, 'utf8'));
  tauriPkg.version = targetVersion;
  fs.writeFileSync(tauriPkgPath, JSON.stringify(tauriPkg, null, 2) + '\n');
  console.log(`Updated tauri-bridge/package.json version to ${targetVersion}`);
}

// 3. tauri-bridge/src-tauri/tauri.conf.json
const tauriConfPath = path.join(rootDir, 'tauri-bridge', 'src-tauri', 'tauri.conf.json');
if (fs.existsSync(tauriConfPath)) {
  const tauriConf = JSON.parse(fs.readFileSync(tauriConfPath, 'utf8'));
  tauriConf.version = targetVersion;
  fs.writeFileSync(tauriConfPath, JSON.stringify(tauriConf, null, 2) + '\n');
  console.log(`Updated tauri.conf.json version to ${targetVersion}`);
}

// 4. tauri-bridge/src-tauri/Cargo.toml
const cargoPath = path.join(rootDir, 'tauri-bridge', 'src-tauri', 'Cargo.toml');
if (fs.existsSync(cargoPath)) {
  let cargoContent = fs.readFileSync(cargoPath, 'utf8');
  cargoContent = cargoContent.replace(/^version\s*=\s*"[^"]*"/m, `version = "${targetVersion}"`);
  fs.writeFileSync(cargoPath, cargoContent);
  console.log(`Updated Cargo.toml version to ${targetVersion}`);
}

// 5. doc/CHANGELOG.md
const changelogPath = path.join(rootDir, 'doc', 'CHANGELOG.md');
if (fs.existsSync(changelogPath)) {
  let changelog = fs.readFileSync(changelogPath, 'utf8');
  const today = new Date().toISOString().split('T')[0];
  changelog = changelog.replace(/##\s*\[\s*(?:[\d\.]+)\s*\]\s*-\s*\d{4}-\d{2}-\d{2}/, `## [${targetVersion}] - ${today}`);
  fs.writeFileSync(changelogPath, changelog);
  console.log(`Updated CHANGELOG.md version header to [${targetVersion}] - ${today}`);
}
