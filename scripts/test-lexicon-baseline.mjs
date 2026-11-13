import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { capture, verify, clean, inventory } from './lexicon/baseline.mjs';
import { compareGerman, readTable } from './lexicon/reconcile-de.mjs';

const root = fs.mkdtempSync(path.join(os.tmpdir(), 't19-baseline-test-'));
try {
  fs.mkdirSync(path.join(root, 'inputs/_recovery/keep'), { recursive: true });
  const input = path.join(root, 'inputs/author.tsv');
  fs.writeFileSync(input, 'author content');
  fs.writeFileSync(path.join(root, 'inputs/_recovery/keep/author.tsv'), 'recovery content');
  const roots = ['inputs'], out = path.join(root, 'snapshot');
  const manifest = await capture(root, out, roots);
  assert.equal(manifest.files.length, 1);
  assert.ok(clean(await verify(root, manifest)));
  await assert.rejects(capture(root, out, roots), /must not exist/);
  await assert.rejects(capture(root, path.join(root, 'inputs/nested'), roots), /inside inventory/);
  fs.writeFileSync(input, 'changed content');
  assert.deepEqual((await verify(root, manifest)).changed, ['inputs/author.tsv']);
  fs.writeFileSync(input, 'author content');
  fs.writeFileSync(path.join(root, 'inputs/new.tsv'), 'new input');
  assert.deepEqual((await verify(root, manifest)).added, ['inputs/new.tsv']);
  fs.unlinkSync(input);
  assert.deepEqual((await verify(root, manifest)).missing, ['inputs/author.tsv']);
  fs.symlinkSync(out, path.join(root, 'inputs/link'));
  assert.throws(() => inventory(root, roots), /Symlink refused/);
  assert.throws(() => inventory(root, ['../outside']), /Invalid relative path/);
  assert.equal(fs.readFileSync(path.join(root, 'inputs/_recovery/keep/author.tsv'), 'utf8'), 'recovery content');

  const head = '词\t显示\t词性\t中文释义\t冠词\t来源\t英文依据\n';
  const one = 'alt\tAlt\tnoun\t旧词\tder\tsource\told\n';
  const two = 'neu\tNeu\tnoun\t新词\tdas\tsource\tnew\n';
  const before = readTable(head + one), after = readTable(head + one + two), added = readTable(head + two);
  const oldWords = new Map([['Alt', ['Alt', 'n.旧词', 'der', '', { unknown: 'keep' }]]]);
  const words = new Map([...oldWords, ['Neu', ['Neu', 'n.新词', 'das', '']]]);
  assert.equal(compareGerman(before, after, added, oldWords, words).ledger.length, 1);
  const bad = new Map(words); bad.set('Alt', ['Alt', 'n.旧词', 'der', '']);
  assert.throws(() => compareGerman(before, after, added, oldWords, bad), /Changed old word/);
  assert.throws(() => compareGerman(before, after, new Map(), oldWords, words), /supplement delta/);
  assert.throws(() => readTable(head + one + one), /Duplicate identity/);
  console.log('baseline checks passed: drift, additions, deletions, overwrite protection, symlink boundary, recovery exclusion, German evidence and unknown-field preservation');
} finally { fs.rmSync(root, { recursive: true, force: true }); } // disposable fixtures only
