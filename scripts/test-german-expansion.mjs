import assert from 'node:assert/strict';
import fs from 'node:fs';
import { legacyDir } from './legacy-packs.mjs';
const LEGACY = legacyDir(); // 旧管线词包：T19 接入后不再随包，从固定提交取出（见 legacy-packs.mjs）
import vm from 'node:vm';
import { isInflectionSense } from './lexicon/sense-kind.mjs';
import { loadGermanSelection } from './lexicon/german-selection.mjs';
const root = new URL('../', import.meta.url);
const agent = { tags: ['agent', 'form-of'], form_of: [{ word: 'fahren' }], glosses: ['agent noun of fahren; driver (person)'] };
assert.equal(isInflectionSense('de', 'noun', agent), false);
assert.equal(isInflectionSense('de', 'verb', agent), true);
assert.equal(isInflectionSense('fr', 'noun', agent), true);
assert.equal(isInflectionSense('de', 'noun', { form_of: [{ word: 'Fahrer' }], glosses: ['plural of Fahrer'] }), true);
assert.equal(isInflectionSense('de', 'verb', { form_of: [{ word: 'fahren' }], glosses: ['past participle of fahren'] }), true);
assert.equal(isInflectionSense('de', 'noun', { alt_of: [{ word: 'Photo' }], glosses: ['alternative spelling of Photo'] }), true);
const reviewed = loadGermanSelection(new URL('review/lexicon/de/', root).pathname);
assert.ok(reviewed.supplements.size >= 147, "既有147条补词不能丢失");
const env = { window: {}, setTimeout, clearTimeout }; vm.createContext(env);
for (const f of ['block/core.js', 'core.js', 'lang/packs.js', 'lang/de/rules.js', 'lang/de/block.js'])
  vm.runInContext(fs.readFileSync(new URL('app/assets/' + f, root), 'utf8'), env);
vm.runInContext(fs.readFileSync(process.argv[2] || LEGACY + '/de/words.js', 'utf8'), env);
const { CORE, LANGPACK } = env.window; CORE.useLang('de');
const words = LANGPACK.get('de', 'words'), forms = LANGPACK.get('de', 'forms');
for (const e of reviewed.supplements.values()) {
  const row = CORE.lookupEntry(words, null, e.display);
  assert.ok(row, e.display);
  assert.equal(row[0], e.display);
  assert.equal(row[1], 'n.' + e.zh.join('，'));
  assert.equal(row[2], e.art);
  assert.equal(CORE.blocked(e.display), false);
}
for (const w of ['Fahrers', 'Fahrern']) assert.equal(CORE.formEntry(words, forms, w)[1], 'n.驾驶员');
assert.equal(CORE.formEntry(words, forms, 'Lehrern')[1], 'n.教师');
assert.equal(CORE.formEntry(words, forms, 'Herrschern')[1], 'n.统治者');
assert.equal(CORE.formEntry(words, forms, 'mich'), null);
assert.ok(CORE.formEntry(words, forms, 'bist')[1].startsWith('v.'));
console.log('german expansion ok:', reviewed.supplements.size, '条补词、派生/屈折边界及关键变形通过');
