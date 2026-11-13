import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { id, encode, decode, admission, eligible, rankMatches, partition, LANGS, CATEGORIES } from './t19/schema.mjs';
import { glossTerms, searchTerms } from './t19/search.mjs';
import { conceptsFrom } from './t19/map-core.mjs';
import { summarize } from './t19/progress.mjs';
import { applyReviews, recordHash } from './t19/review.mjs';
import { appendProposals } from './t19/append.mjs';
import { compileRecords, compile, readShards } from './t19/compile.mjs';
import { fingerprint } from './lexicon/baseline.mjs';
const ROOT = new URL('../', import.meta.url);
const concepts = conceptsFrom(fs.readFileSync(new URL('plans/v00.03.00/T19_CORE.md', ROOT), 'utf8'));
assert.equal(concepts.length, 250);
assert.equal(concepts.filter(c => c.languages.length === 6).length, 240);
assert.deepEqual(concepts.at(-1).languages, ['la']);
function record(label = 'light', overrides = {}) {
  return { entry_id: id('e', ['en', label, 'noun']), sense_id: id('s', ['en', label, 'noun', 0]),
    language: 'en', display: label, pos: 'noun', zh: '光', article: '', note: '', category: 'creative', theme: 'C03',
    concept_ids: ['C03-01'], legacy_refs: [], evidence: { sources: [{ path: 'fixture', sha256: 'a'.repeat(64) }] },
    review: { state: 'approved', reviewer: 'fixture-reviewer', evidence: 'fixture-only' },
    adverb_relation: { state: 'not-applicable', evidence: '' }, latin_use: { state: 'not-applicable', evidence: '' }, name_payload: null, ...overrides };
}
assert.equal(admission(record()), null);
assert.equal(eligible(record('pending', { review: { state: 'pending' } })), false);
assert.equal(eligible(record('pending-evidence', { review: { state: 'approved', reviewer: 'x' } })), false);
for (const pos of ['prep', 'postp', 'pron', 'conj', 'det', 'article', 'aux', 'particle', 'contraction', 'intj'])
  assert.equal(admission(record('same', { pos })), 'excluded-use');
assert.equal(eligible(record('same')), true, 'same spelling lexical noun survives');
for (const state of ['unknown', 'has-adjective', 'not-applicable'])
  assert.ok(admission(record('quickly', { pos: 'adv', adverb_relation: { state, evidence: 'fixture' } })));
assert.equal(admission(record('here', { pos: 'adv', adverb_relation: { state: 'no-adjective', evidence: 'fixture relationship review' } })), null);
const numeral = record('one', { pos: 'num', category: 'numerals' });
assert.equal(eligible(numeral), false); assert.equal(eligible(numeral, { mode: 'expanded', expanded: ['numerals'] }), false);
assert.equal(eligible(numeral, { mode: 'query', query: 'one' }), true);
assert.equal(eligible(numeral, { mode: 'query', query: 'someone' }), false);
assert.equal(eligible(record('one', { pos: 'num' })), false);
const name = record('Antoine', { pos: 'name', category: 'names', zh: '安托万', name_payload: ['Antoine', '安托万', 'm', 'fr'],
  evidence: { sources: [{ path: 'fixture', sha256: 'a'.repeat(64) }], name_origin: 'fixture source language evidence' } });
assert.equal(eligible(name), false); assert.equal(eligible(name, { mode: 'expanded', expanded: ['names'] }), false);
assert.equal(eligible(name, { mode: 'query', query: 'Antoine' }), true);
assert.equal(eligible(name, { mode: 'query', query: 'Ant' }), false);
assert.equal(compileRecords([name]).bundles['en/names'].records[0].row[3], 'fr', 'source language remains fr in English query table');
const professional = record('entropy', { category: 'professional-natural' });
assert.equal(eligible(professional), false);
assert.equal(eligible(professional, { mode: 'expanded', expanded: ['professional-natural'] }), true);
assert.equal(eligible(professional, { mode: 'expanded', expanded: ['professional-humanities'] }), false);
const cultural = record('Rome', { category: 'historical-cultural' });
assert.equal(eligible(cultural), false); assert.equal(eligible(cultural, { mode: 'query', query: 'Rome' }), true);
assert.equal(admission(record('rosa', { language: 'la', latin_use: { state: 'pending' } })), 'Latin-use-unverified');
assert.equal(admission(record('rosa', { language: 'la', latin_use: { state: 'literary', evidence: 'fixture usage evidence' } })), null);
const daily = record('day', { category: 'daily' }), creative = record('glow');
assert.equal(rankMatches([{ record: daily, tier: 2 }, { record: creative, tier: 0 }], {})[0].record.sense_id, creative.sense_id);
assert.equal(rankMatches([{ record: daily, tier: 0 }, { record: creative, tier: 0 }], {})[0].record.sense_id, daily.sense_id);
assert.equal(rankMatches([{ record: creative, tier: 2 }, { record: creative, tier: 0 }], {}).length, 1);
const human = record('metaphor', { category: 'professional-humanities' });
assert.equal(rankMatches([{ record: professional, tier: 0 }, { record: human, tier: 0 }], { mode: 'expanded', expanded: [human.category, professional.category] })[0].record.sense_id, human.sense_id);
const unknown = record('author', { author_note: 'keep unknown column', note: '' });
const roundtrip = decode(encode([unknown], ['author_note']));
assert.deepEqual(roundtrip.records[0], unknown);
assert.equal(compileRecords(roundtrip.records).bundles['en/creative'].records[0].metadata.author_note, unknown.author_note);
assert.throws(() => encode([record('bad', { note: 'two\nlines' })]), /invalid TSV/);
assert.throws(() => compileRecords([creative, creative]), /duplicate authoritative/);
const many = Array.from({ length: 601 }, (_, i) => record('word' + i));
assert.deepEqual(partition(many).map(s => s.records.length), [300, 300, 1]);
assert.deepEqual(partition(many).map(s => s.records.map(r => r.sense_id)), partition([...many].reverse()).map(s => s.records.map(r => r.sense_id)));
assert.throws(() => partition([record('escape', { theme: '../escape' })]), /theme path/);
assert.equal(compileRecords([record('pending', { review: { state: 'pending' } })]).excluded.length, 1);

// A lemma's morphology can belong to a different sense (off: depart vs kill).
const restricted = record('off', { pos: 'verb', evidence: {
  sources: creative.evidence.sources,
  form_restriction: { allowed: [], source: 'fixture dictionary', evidence: 'imperative departure only', reviewer: 'fixture' }
} });
const unrestricted = record('other-off', { display: 'off', pos: 'verb' });
const sourceForms = new Map([[restricted.sense_id, ['offed', 'offing']], [unrestricted.sense_id, ['offed']]]);
const restrictedOutput = compileRecords([restricted, unrestricted], sourceForms).bundles['en/creative'].records;
assert.deepEqual(restrictedOutput.find(r => r.sense_id === restricted.sense_id).forms, []);
assert.deepEqual(restrictedOutput.find(r => r.sense_id === unrestricted.sense_id).forms, ['offed']);
restricted.evidence.form_restriction.allowed = ['offed', 'imaginary'];
assert.deepEqual(compileRecords([restricted], sourceForms).bundles['en/creative'].records[0].forms, ['offed'], 'restriction cannot invent source relations');
assert.deepEqual(sourceForms.get(restricted.sense_id), ['offed', 'offing'], 'source morphology remains unchanged');
assert.deepEqual(decode(encode([restricted])).records[0].evidence, restricted.evidence, 'restriction survives shards');
restricted.evidence.form_restriction.allowed = ['OFFED'];
assert.throws(() => compileRecords([restricted], sourceForms), /invalid restricted form/);
restricted.evidence.form_restriction.allowed = [];
delete restricted.evidence.form_restriction.evidence;
assert.throws(() => compileRecords([restricted], sourceForms), /form restriction evidence required/);

const temp = fs.mkdtempSync(path.join(os.tmpdir(), 't19-contract-'));
try {
  const lexicon = path.join(temp, 'lexicon');
  for (const lang of LANGS) {
    fs.mkdirSync(path.join(lexicon, lang), { recursive: true });
    fs.writeFileSync(path.join(lexicon, lang, 'index.json'), JSON.stringify({ schema: 1, language: lang, shards: [] }));
  }
  const file = path.join(lexicon, 'en/creative/C03-001.tsv'); fs.mkdirSync(path.dirname(file));
  fs.writeFileSync(file, encode([unknown], ['author_note']));
  const index = { schema: 1, language: 'en', shards: [{ path: 'creative/C03-001.tsv', category: 'creative',
    weight: 90, visibility: 'default', rows: 1, sha256: (await fingerprint(file)).sha256 }] };
  fs.writeFileSync(path.join(lexicon, 'en/index.json'), JSON.stringify(index));
  const output = path.join(temp, 'output');
  assert.equal((await compile(lexicon, output)).admitted, 1);
  await assert.rejects(compile(lexicon, output), /refusing overwrite/);
  await assert.rejects(compile(lexicon, path.join(lexicon, 'output')), /inside source/);
  const appended = path.join(temp, 'appended');
  const delta = await appendProposals(lexicon, [record('author', { zh: '不得覆盖' }), record('new', {author_extra:'keep new metadata'})], appended);
  assert.equal(delta.preserved, 1); assert.equal(delta.appended, 1);
  assert.equal((await readShards(appended)).find(r=>r.display==='new').author_extra,'keep new metadata');
  assert.deepEqual(fs.readFileSync(path.join(appended, 'en/creative/C03-001.tsv')), fs.readFileSync(file));
  assert.equal((await readShards(appended)).find(r=>r.display==='author').author_note, 'keep unknown column');
  assert.ok(fs.existsSync(path.join(appended, 'en/creative/C03-002.tsv')));
  await assert.rejects(appendProposals(lexicon, [], appended), /refusing overwrite/);
  await assert.rejects(appendProposals(lexicon, [], path.join(lexicon,'nested')), /inside source/);
  await assert.rejects(appendProposals(lexicon, [record('new'),record('new')], path.join(temp,'duplicate')), /duplicate proposal/);
  const reviewed=path.join(temp,'reviewed');
  const decision={sense_id:unknown.sense_id,expected_sha256:recordHash(unknown),review:{state:'rejected',reviewer:'fixture',evidence:'fixture',reason:'fixture rejection'}};
  await applyReviews(lexicon,[decision],reviewed);
  const checked=(await readShards(reviewed))[0];assert.equal(checked.review.state,'rejected');assert.equal(checked.author_note,unknown.author_note);
  assert.deepEqual((await readShards(lexicon))[0],unknown,'review must not mutate source');
  await assert.rejects(applyReviews(lexicon,[{...decision,expected_sha256:'0'.repeat(64)}],path.join(temp,'stale')),/stale decision/);
  await assert.rejects(applyReviews(lexicon,[{...decision,display:'rename'}],path.join(temp,'rename')),/unsupported decision/);
  fs.appendFileSync(file, 'corruption');
  await assert.rejects(readShards(lexicon), /checksum/);
  index.shards[0].path = '../outside.tsv'; fs.writeFileSync(path.join(lexicon, 'en/index.json'), JSON.stringify(index));
  await assert.rejects(readShards(lexicon), /invalid shard path/);
} finally { fs.rmSync(temp, { recursive: true, force: true }); }
console.log('T19 contract passed: 250 concepts, sense-level scope, default/expanded/query gates, names/numerals, adverbs, Latin evidence, ranking, 300-row shards, author metadata, hashes and overwrite protection');

assert.deepEqual(glossTerms('新的', 'adj'), ['新的', '新']);
assert.deepEqual(glossTerms('目的', 'noun'), ['目的']);
assert.deepEqual(glossTerms('好（口语）', 'intj'), ['好']);
assert.deepEqual(searchTerms('影'), ['影', '影子']);
assert.deepEqual(searchTerms('未知'), ['未知']);

const progressFixture=summarize([record('approved'),record('pending',{review:{state:'pending'}})], [{id:'C03-01',label:'光',languages:['en']}]);
assert.equal(progressFixture.admitted,1);assert.equal(progressFixture.pending,1);
assert.equal(progressFixture.languages.en.with_admitted_sense,1,'two candidates are not two completed concepts');
assert.equal(progressFixture.languages.fr.with_admitted_sense,0);
assert.equal(progressFixture.cells.find(c=>c.language==='fr').status,'范围不适用');

assert.deepEqual(searchTerms('窗'), ['窗', '窗户']);

const rejectedProgress = summarize([record('rejected',{review:{state:'rejected'}})],[{id:'C03-01',label:'光',languages:['en']}]);
assert.equal(rejectedProgress.languages.en.pending_cells,0);
assert.equal(rejectedProgress.languages.en.unadmitted_cells,1);
assert.equal(rejectedProgress.languages.en.missing_cells,0,'rejected candidate is not missing-source proof');
