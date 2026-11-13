import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, statSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

// Decimal MB, deliberately stricter than the platform's 10 MiB audit.
const FILE_LIMIT = 5_000_000;
const ZIP_LIMIT = 10_000_000;
const git = (...args) => execFileSync('git', args, { maxBuffer: 64 * 1024 * 1024 });
const changed = new Set(git('diff', '--cached', '--name-only', '--diff-filter=ACMRT', '-z')
  .toString().split('\0').filter(Boolean));
const entries = git('ls-files', '--stage', '-z').toString().split('\0').filter(Boolean).map(line => {
  const tab = line.indexOf('\t');
  const [mode, oid, stage] = line.slice(0, tab).split(' ');
  return { mode, oid, stage, name: line.slice(tab + 1) };
});
const errors = [];
for (const entry of entries) {
  if (entry.stage !== '0') errors.push(`Unmerged index entry: ${entry.name}`);
  if (changed.has(entry.name) && entry.mode !== '160000') {
    const size = Number(git('cat-file', '-s', entry.oid).toString());
    if (size >= FILE_LIMIT) errors.push(`${entry.name}: ${size} B; individual files must be < ${FILE_LIMIT} B`);
  }
}
const app = entries.filter(entry => entry.name.startsWith('app/'));
if (!app.some(entry => entry.name === 'app/index.html')) errors.push('Staged app/index.html is missing.');
for (const entry of app) {
  if (!['100644', '100755'].includes(entry.mode)) errors.push(`Unsupported package entry: ${entry.name} (${entry.mode})`);
}
if (errors.length) {
  console.error(errors.join('\n'));
  process.exit(1);
}
const temporary = mkdtempSync(path.join(tmpdir(), 'backronym-staged-size-'));
try {
  const directory = path.join(temporary, 'app');
  mkdirSync(directory);
  for (const entry of app) {
    const destination = path.join(temporary, entry.name);
    mkdirSync(path.dirname(destination), { recursive: true });
    writeFileSync(destination, git('cat-file', 'blob', entry.oid), { mode: parseInt(entry.mode, 8) & 0o777 });
  }
  const archive = path.join(temporary, 'backronym.zip');
  execFileSync('zip', ['-q', '-r', '-X', archive, '.', '-x', '.*', '-x', '*/.*'], { cwd: directory });
  const size = statSync(archive).size;
  console.log(`Staged release ZIP: ${size} B (${(size / 1_000_000).toFixed(2)} MB).`);
  if (size >= ZIP_LIMIT) {
    console.error(`Release ZIP must be < ${ZIP_LIMIT} B.`);
    process.exitCode = 1;
  } else if (size >= 6_000_000) {
    console.warn(size >= 8_000_000 ? 'Size warning: above the 6–8 MB tolerance band.' : 'Size warning: within the 6–8 MB tolerance band.');
  }
} finally {
  rmSync(temporary, { recursive: true, force: true });
}
