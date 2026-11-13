// Read-only German 147 -> 198 reconciliation. Prints JSON; never updates old delivery evidence.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { fingerprint } from './baseline.mjs';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const oldDir = 'review/lexicon/de-expansion-20261111';
const nextDir = 'review/lexicon-independent-20261111';
const read = relative => fs.readFileSync(path.join(ROOT, relative), 'utf8');
const json = relative => JSON.parse(read(relative));
const key = row => row.slice(0, 3).join('\u0001');
export function readTable(text) {
  const [header, ...lines] = text.trimEnd().split(/\r?\n/);
  assert.equal(header, '词\t显示\t词性\t中文释义\t冠词\t来源\t英文依据');
  const map = new Map();
  lines.forEach((line, i) => {
    const row = line.split('\t');
    assert.equal(row.length, 7, 'Invalid columns at ' + (i + 2));
    assert.ok(row.every(v => v.trim()), 'Empty field at ' + (i + 2));
    assert.ok(!map.has(key(row)), 'Duplicate identity: ' + key(row));
    map.set(key(row), row);
  });
  return map;
}
export function readWords(text) {
  // Generated payload is JSON; do not execute the JavaScript wrapper.
  const line = text.split('\n').find(l => l.startsWith('window.LANGPACK.put("de","words",'));
  assert.ok(line && line.endsWith(');'), 'Missing de words payload');
  const groups = JSON.parse(line.slice('window.LANGPACK.put("de","words",'.length, -2));
  const rows = Object.values(groups).flat(), map = new Map();
  for (const row of rows) {
    assert.ok(Array.isArray(row) && typeof row[0] === 'string');
    assert.ok(!map.has(row[0]), 'Duplicate display: ' + row[0]);
    map.set(row[0], row);
  }
  return map;
}
export function compareGerman(oldTable, currentTable, additions, oldWords, currentWords) {
  for (const [k, row] of oldTable) assert.deepEqual(currentTable.get(k), row, 'Changed old supplement: ' + k);
  const added = [...currentTable].filter(([k]) => !oldTable.has(k));
  assert.equal(added.length, additions.size, 'Unexpected supplement delta');
  for (const [k, row] of added) assert.deepEqual(row, additions.get(k), 'Addition differs from evidence: ' + k);
  for (const [word, row] of oldWords) assert.deepEqual(currentWords.get(word), row, 'Changed old word: ' + word);
  const newWords = [...currentWords].filter(([word]) => !oldWords.has(word));
  assert.equal(newWords.length, added.length, 'Unexplained output additions');
  const ledger = added.map(([k, row]) => {
    assert.ok(!oldWords.has(row[1]), 'Addition already in old output: ' + k);
    const expected = [row[1], 'n.' + row[3], row[4], ''];
    assert.deepEqual(currentWords.get(row[1]), expected, 'Output differs: ' + k);
    return { identity: row.slice(0, 3), old: 'absent', current: currentWords.get(row[1]),
      source: row[5], evidence: row[6], semanticReview: 'pending-independent-review' };
  });
  return { oldSupplements: oldTable.size, currentSupplements: currentTable.size,
    oldRows: oldWords.size, currentRows: currentWords.size, unchangedOldRows: oldWords.size, ledger };
}
export async function reconcile() {
  const delivery = json(oldDir + '/DELIVERY.json');
  const recovery = json(nextDir + '/RECOVERY.json');
  const originals = ['review/lexicon/de/supplement.tsv', 'app/assets/lang/de/words.js'];
  const backups = [];
  for (const original of originals) {
    const saved = recovery.find(r => r.original.endsWith('/' + original));
    assert.ok(saved, 'Recovery reference missing: ' + original);
    // Rebase the recorded backup under the current repo, but never modify it.
    const suffix = saved.backup.slice(saved.backup.indexOf('/_recovery/'));
    assert.ok(suffix.startsWith('/_recovery/') && !suffix.includes('..'));
    const relative = path.dirname(original) + suffix;
    const actual = await fingerprint(path.join(ROOT, relative));
    assert.equal(actual.sha256, saved.sha256, 'Recovery fingerprint: ' + relative);
    assert.equal(actual.sha256, delivery.files[original], 'Old DELIVERY fingerprint: ' + original);
    backups.push({ original, backup: relative, ...actual });
  }
  const result = compareGerman(readTable(read(backups[0].backup)), readTable(read(originals[0])),
    readTable(read(nextDir + '/de-reviewed-additions.tsv')), readWords(read(backups[1].backup)), readWords(read(originals[1])));
  assert.equal(result.oldSupplements, 147); assert.equal(result.currentSupplements, 198);
  assert.equal(result.oldRows, 14768); assert.equal(result.currentRows, 14819);
  const preservation = json(nextDir + '/PRESERVATION.json');
  const current = {};
  for (const lang of ['fr', 'de', 'es', 'it', 'la']) {
    current[lang] = await fingerprint(path.join(ROOT, 'app/assets/lang', lang, 'words.js'));
    assert.equal(current[lang].sha256, preservation.afterHashes[lang], 'Current versus later delivery: ' + lang);
    if (lang !== 'de') assert.equal(preservation.beforeHashes[lang], current[lang].sha256);
  }
  const deliveryDrift = [];
  for (const [file, oldHash] of Object.entries(delivery.files)) {
    const actual = await fingerprint(path.join(ROOT, file));
    if (actual.sha256 !== oldHash) deliveryDrift.push({ path: file, oldSha256: oldHash, currentSha256: actual.sha256 });
  }
  return { schema: 1, checkedAt: new Date().toISOString(), status: 'structural-check-passed-not-semantic-approval',
    backups, current, deliveryDrift, ...result };
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { console.log(JSON.stringify(await reconcile(), null, 2)); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
