import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, symlinkSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const git = (...args) => execFileSync('git', args, { encoding: 'utf8' }).trim();
const root = git('rev-parse', '--show-toplevel');
const hooks = path.resolve(root, git('rev-parse', '--git-path', 'backronym-size-hooks'));
let current;
try { current = git('config', '--get', 'core.hooksPath'); }
catch (error) { if (error.status !== 1) throw error; }
if (current === hooks) {
  console.log(`Size hooks already installed: ${hooks}`);
  process.exit(0);
}
if (existsSync(hooks)) throw new Error(`Refusing to overwrite existing directory: ${hooks}`);
const previous = path.resolve(root, current || git('rev-parse', '--git-path', 'hooks'));
const quote = value => "'" + value.replaceAll("'", "'\\''") + "'";
mkdirSync(hooks);
// Preserve every existing hook, including push/merge protection.
if (existsSync(previous)) {
  for (const name of readdirSync(previous)) {
    if (!['pre-commit', 'pre-merge-commit'].includes(name)) symlinkSync(path.join(previous, name), path.join(hooks, name));
  }
}
for (const name of ['pre-commit', 'pre-merge-commit']) {
  const inherited = path.join(previous, name);
  writeFileSync(path.join(hooks, name), `#!/bin/sh\nif [ -x ${quote(inherited)} ]; then\n  ${quote(inherited)} "$@" || exit $?\nfi\nroot=$(git rev-parse --show-toplevel) || exit $?\ncd "$root" || exit $?\nexec node scripts/check-staged-size.mjs\n`, { mode: 0o755 });
}
git('config', '--local', 'backronym.previousHooksPath', current || '');
git('config', '--local', 'core.hooksPath', hooks);
console.log(`Installed size hooks: ${hooks}\nPrevious hooks preserved: ${previous}`);
