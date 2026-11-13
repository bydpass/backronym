// T19: fingerprint inputs without copying or rewriting author files.
// capture <new-directory> | check <manifest.json>; paths are relative to this repo.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
export const ROOTS = [
  'scripts/.cache/ecdict.csv', 'scripts/.cache/hyph', 'scripts/.cache/v003',
  'scripts/lexicon', 'scripts/build-dict.mjs', 'scripts/build-lexicon.mjs',
  'scripts/build-block.mjs', 'scripts/test-lexicon-baseline.mjs',
  'review/lexicon', 'review/lexicon-independent-20261111',
  'app/assets/lang', 'app/assets/core.js', 'app/assets/block',
  'app/assets/app-model.js', 'app/assets/fonts/NotoSansSC-Regular.woff2',
  'app/assets/fonts/NotoSans-Regular.woff2', 'package.json',
];
const compare = (a, b) => a < b ? -1 : a > b ? 1 : 0;
function safePath(root, relative) {
  if (typeof relative !== 'string' || !relative || path.isAbsolute(relative) ||
      relative.split('/').some(p => ['..', '.', ''].includes(p))) throw new Error('Invalid relative path: ' + relative);
  let cursor = root;
  for (const part of relative.split('/')) {
    cursor = path.join(cursor, part);
    if (fs.existsSync(cursor) && fs.lstatSync(cursor).isSymbolicLink()) throw new Error('Symlink refused: ' + relative);
  }
  return cursor;
}
export function inventory(root, roots = ROOTS) {
  const files = [];
  function visit(relative) {
    const absolute = safePath(root, relative), stat = fs.lstatSync(absolute);
    if (stat.isDirectory()) {
      for (const name of fs.readdirSync(absolute).sort(compare)) {
        if (['_recovery', '.DS_Store', '.git'].includes(name)) continue;
        visit(relative + '/' + name);
      }
    } else if (stat.isFile()) files.push(relative);
    else throw new Error('Non-regular input: ' + relative);
  }
  roots.forEach(visit); // Missing required roots fail, rather than silently shrink the baseline.
  if (new Set(files).size !== files.length) throw new Error('Overlapping inventory roots');
  return files.sort(compare);
}
export async function fingerprint(file) {
  const before = fs.statSync(file, { bigint: true });
  const hash = crypto.createHash('sha256');
  for await (const chunk of fs.createReadStream(file)) hash.update(chunk);
  const after = fs.statSync(file, { bigint: true });
  if (['size', 'mtimeNs', 'ctimeNs', 'ino', 'dev'].some(k => before[k] !== after[k]))
    throw new Error('Input changed while hashing: ' + file);
  return { bytes: Number(after.size), sha256: hash.digest('hex') };
}
export async function scan(root, roots = ROOTS) {
  const files = [];
  for (const relative of inventory(root, roots)) files.push({ path: relative, ...await fingerprint(safePath(root, relative)) });
  return files;
}
export function differences(expected, actual) {
  const old = new Map(expected.map(f => [f.path, f]));
  const now = new Map(actual.map(f => [f.path, f]));
  return {
    added: actual.filter(f => !old.has(f.path)).map(f => f.path),
    missing: expected.filter(f => !now.has(f.path)).map(f => f.path),
    changed: actual.filter(f => old.has(f.path) &&
      (old.get(f.path).sha256 !== f.sha256 || old.get(f.path).bytes !== f.bytes)).map(f => f.path),
  };
}
export const clean = delta => Object.values(delta).every(items => items.length === 0);
export async function verify(root, manifest) {
  if (manifest.schema !== 1 || !Array.isArray(manifest.files) || !Array.isArray(manifest.roots)) throw new Error('Invalid manifest');
  for (const f of manifest.files) {
    safePath(root, f.path);
    if (!/^[a-f0-9]{64}$/.test(f.sha256) || !Number.isSafeInteger(f.bytes) || f.bytes < 0) throw new Error('Invalid fingerprint: ' + f.path);
  }
  if (new Set(manifest.files.map(f => f.path)).size !== manifest.files.length) throw new Error('Duplicate manifest paths');
  return differences(manifest.files, await scan(root, manifest.roots));
}
export async function capture(root, output, roots = ROOTS) {
  const dest = path.resolve(output);
  // Prevent snapshots from capturing themselves or overwriting existing work.
  for (const r of roots) {
    const absolute = safePath(root, r);
    if (dest === absolute || dest.startsWith(absolute + path.sep)) throw new Error('Output is inside inventory: ' + r);
  }
  if (fs.existsSync(dest)) throw new Error('Output must not exist: ' + dest);
  const files = await scan(root, roots);
  const manifest = { schema: 1, createdAt: new Date().toISOString(),
    note: 'Content fingerprints, not recovery copies or semantic approval. Existing _recovery payloads excluded.',
    roots, environment: { node: process.version, v8: process.versions.v8, icu: process.versions.icu,
      platform: process.platform, arch: process.arch, minFormCount: process.env.MIN_FORM_COUNT || '5' }, files };
  // A second complete pass also detects edits after an individual file was hashed.
  const delta = await verify(root, manifest);
  if (!clean(delta)) throw new Error('Inputs changed during capture: ' + JSON.stringify(delta));
  fs.mkdirSync(dest); // exclusive: parent must exist; no merge into an existing delivery
  fs.writeFileSync(path.join(dest, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n', { flag: 'wx' });
  return manifest;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const [command, target, ...extra] = process.argv.slice(2);
    if (!target || extra.length || !['capture', 'check'].includes(command)) throw new Error('Usage: baseline.mjs capture <new-directory> | check <manifest.json>');
    if (command === 'capture') {
      const manifest = await capture(ROOT, target);
      const git = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim();
      fs.writeFileSync(path.join(target, 'git.json'), JSON.stringify({ head: git,
        status: execFileSync('git', ['status', '--porcelain=v1'], { cwd: ROOT, encoding: 'utf8' }),
        note: 'Dirty workspace; manifest hashes, not HEAD, identify the captured files.' }, null, 2) + '\n', { flag: 'wx' });
      console.log('Captured', manifest.files.length, 'files;', manifest.files.reduce((n, f) => n + f.bytes, 0), 'bytes');
    } else {
      const delta = await verify(ROOT, JSON.parse(fs.readFileSync(target, 'utf8')));
      console.log(JSON.stringify(delta, null, 2));
      if (!clean(delta)) process.exitCode = 1;
    }
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
