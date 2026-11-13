// Verify a batch without rebuilding or changing author files.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { readShards, compileRecords } from './compile.mjs';
import { LANGS, parseTsv } from './schema.mjs';
import { fingerprint } from '../lexicon/baseline.mjs';
const ROOT = fileURLToPath(new URL('../../', import.meta.url));
assert.ok(process.argv.length === 3 || (process.argv.length === 4 && process.argv[3] === '--draft'), 'Usage: verify.mjs <batch-directory> [--draft]');
const draftOnly = process.argv[3] === '--draft';
const dir = path.resolve(process.argv[2]);
const inputs = JSON.parse(fs.readFileSync(path.join(dir, 'inputs.json'), 'utf8'));
const sourceMap = new Map(inputs.files.map(s => [s.path, s]));
for (const source of inputs.files) {
  assert.ok(!path.isAbsolute(source.path) && !source.path.split('/').includes('..'));
  assert.deepEqual(await fingerprint(path.join(ROOT, source.path)), { bytes: source.bytes, sha256: source.sha256 }, 'input changed: ' + source.path);
}
const records = await readShards(path.join(dir, 'lexicon')), byId = new Map(records.map(r => [r.sense_id, r]));
assert.equal(records.length, byId.size);
const concepts = JSON.parse(fs.readFileSync(path.join(dir, 'concepts.json'), 'utf8'));
const conceptMap = new Map(concepts.map(c => [c.id, c]));
assert.equal(concepts.length, 250); assert.equal(conceptMap.size, 250);
const mapping = [];
for (const lang of LANGS) for (const theme of [...new Set(concepts.map(c => c.theme))]) {
  for (const row of parseTsv(fs.readFileSync(path.join(dir, 'mapping', lang, theme + '.tsv'), 'utf8')).rows) {
    assert.equal(row.language, lang);
    const concept = conceptMap.get(row.concept_id); assert.ok(concept);
    assert.equal(row.target, concept.label); assert.equal(row.category, concept.category);
    row.candidate_ids = JSON.parse(row.candidate_ids);
    if (!concept.languages.includes(lang)) { assert.equal(row.status, '范围不适用'); assert.equal(row.candidate_ids.length, 0); }
    else assert.equal(row.status, '待核义');
    for (const id of row.candidate_ids) {
      const record = byId.get(id); assert.ok(record); assert.equal(record.language, lang);
      assert.ok(record.concept_ids.includes(row.concept_id));
    }
    mapping.push(row);
  }
}
assert.equal(mapping.length, 1500); assert.equal(new Set(mapping.map(m => m.language + '/' + m.concept_id)).size, 1500);
const legacyTables = new Map();
for (const record of records) {
  if (draftOnly) assert.equal(record.review.state, 'pending', 'draft must not silently approve proposals');
  assert.ok(record.evidence.source_records.length, 'source record missing: ' + record.display);
  for (const source of record.evidence.sources) assert.equal(source.sha256, sourceMap.get(source.path)?.sha256, 'untracked source: ' + source.path);
  for (const concept of record.concept_ids) assert.ok(mapping.some(m => m.language === record.language && m.concept_id === concept && m.candidate_ids.includes(record.sense_id)));
  if (record.language !== 'en') assert.ok(record.legacy_refs.length, 'legacy key missing: ' + record.display);
  for (const ref of record.legacy_refs) {
    assert.equal(ref.sha256, sourceMap.get(ref.path)?.sha256);
    if (!legacyTables.has(ref.path)) legacyTables.set(ref.path, parseTsv(fs.readFileSync(path.join(ROOT, ref.path), 'utf8')).rows);
    const row = legacyTables.get(ref.path)[ref.line - 2]; assert.ok(row);
    assert.deepEqual(ref.key, ref.kind === 'original-review-key' ? [row['词'], row['显示'], row['词性']] : [row['词'], row['显示'], row['冠词']]);
  }
}
// Regression for historical identity changes: do not use final POS/spelling as the original key.
const hanzo = records.find(r => r.language === 'es' && r.display === 'hanzo');
assert.equal(hanzo.pos, 'noun'); assert.ok(hanzo.legacy_refs.some(r => r.key[2] === 'adj'));
assert.ok(hanzo.evidence.source_records.some(r => r.record.pos === 'adj'));
for (const word of ['homō', 'gelū', 'erēmus']) {
  const record = records.find(r => r.language === 'la' && r.display === word); assert.ok(record);
  assert.ok(record.legacy_refs.some(ref => ref.key[1].includes('\u0306')), 'original breve identity lost');
}
const compiled = compileRecords(records);
if (draftOnly) { assert.equal(Object.keys(compiled.bundles).length, 0); assert.equal(compiled.excluded.length, records.length); }
console.log(JSON.stringify({ source_files_verified: inputs.files.length, concepts: concepts.length, mapping_cells: mapping.length,
  candidate_fragments: records.length, with_leads: mapping.filter(m => m.candidate_ids.length).length,
  no_exact_match: mapping.filter(m => !m.candidate_ids.length && m.status !== '范围不适用').length,
  not_applicable: mapping.filter(m => m.status === '范围不适用').length,
  source_records_linked: records.length, five_language_legacy_keys_linked: records.filter(r => r.language !== 'en').length,
  admitted: Object.values(compiled.bundles).reduce((n,b)=>n+b.records.length,0), draft_only: draftOnly }, null, 2));
