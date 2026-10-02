/**
 * Simple static build for Velvet Veil Vortex
 * Usage: node build.mjs
 * Output: dist/  (ready for Cloudflare Pages / Workers static assets / GitHub Pages)
 */
import { mkdir, rm, copyFile, writeFile, stat, cp, readFile } from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const root = process.cwd();
const dist = path.join(root, 'dist');

const ROOT_FILES = [
  'index.html',
  'style.css',
  'app.js',
  'dancer3d.js',
  'albums.json',
  'songs.json',
  '_headers',
  'site.webmanifest'
];

const ROOT_DIRS = ['assets', 'music', 'vendor'];

const REQUIRED_AFTER_BUILD = [
  'index.html',
  'app.js',
  'dancer3d.js',
  'style.css',
  '_headers',
  'assets/js/three.module.js',
  'assets/js/GLTFLoader.js',
  'assets/models/neon-valkyrie.glb',
  'assets/icon-192.png'
];

async function exists(rel) {
  try {
    await stat(path.join(root, rel));
    return true;
  } catch {
    return false;
  }
}

async function copyIfExists(rel) {
  const src = path.join(root, rel);
  try {
    const s = await stat(src);
    const dest = path.join(dist, rel);
    if (s.isDirectory()) {
      await cp(src, dest, { recursive: true });
      console.log('  dir ', rel);
    } else if (s.isFile()) {
      await mkdir(path.dirname(dest), { recursive: true });
      await copyFile(src, dest);
      console.log('  file', rel);
    }
  } catch {
    console.warn('  skip', rel, '(missing)');
  }
}

// 1) Optional catalog refresh
if (await exists('generate-songs.mjs')) {
  console.log('→ generate-songs.mjs');
  const r = spawnSync(process.execPath, ['generate-songs.mjs'], {
    cwd: root,
    stdio: 'inherit'
  });
  if (r.status !== 0) {
    console.warn('generate-songs.mjs exited', r.status, '— continuing with existing catalogs');
  }
}

// 2) Clean dist
await rm(dist, { recursive: true, force: true });
await mkdir(dist, { recursive: true });
console.log('→ copy into dist/');

for (const f of ROOT_FILES) await copyIfExists(f);
for (const d of ROOT_DIRS) await copyIfExists(d);

await writeFile(path.join(dist, '.nojekyll'), '');

// 3) Verify CSP allows blob: (GLTF textures)
const headersPath = path.join(dist, '_headers');
try {
  const headers = await readFile(headersPath, 'utf8');
  if (!/connect-src[^;]*blob:/.test(headers)) {
    console.error('\n✖ _headers CSP missing blob: in connect-src');
    console.error('  Textures from GLB will fail. Expected: connect-src \'self\' blob: data:;');
    process.exitCode = 1;
  } else {
    console.log('✓ CSP connect-src includes blob:');
  }
} catch {
  console.warn('⚠ no _headers in dist');
}

// 4) Verify required assets
let missing = 0;
for (const rel of REQUIRED_AFTER_BUILD) {
  try {
    await stat(path.join(dist, rel));
  } catch {
    console.error('✖ missing in dist:', rel);
    missing += 1;
  }
}
if (missing) {
  console.error(`\n✖ build incomplete (${missing} missing)`);
  process.exitCode = 1;
} else {
  console.log('✓ required files present');
}

console.log('\nBuild completed → dist/');
console.log('Deploy the contents of dist/ (or repo root if you publish path: .)');
