import fs from 'node:fs';
import { legacyDir } from './legacy-packs.mjs';
const LEGACY = legacyDir(); // 旧管线词包：T19 接入后不再随包，从固定提交取出（见 legacy-packs.mjs）
import vm from 'node:vm';
import assert from 'node:assert/strict';
const root = new URL('../', import.meta.url);
const env = { window: {}, setTimeout, clearTimeout }; vm.createContext(env);
function load(file) { vm.runInContext(fs.readFileSync(new URL(file, root), 'utf8'), env); }
load('app/assets/block/core.js'); load('app/assets/core.js'); load('app/assets/lang/packs.js');
load('plans/v00.03.00/picker.js');
const picker = env.window.LEXICON_PICKER;
assert.throws(() => picker.open('en'), /未就绪/);
for (const code of ['en', 'fr', 'de', 'es', 'it', 'la']) {
  if (code !== 'en') load(`app/assets/lang/${code}/rules.js`);
  load(`${LEGACY}/${code}/words.js`);
  assert.throws(() => picker.open(code), /未就绪/, 'missing blocker must stop inspection');
  load(`app/assets/lang/${code}/block.js`);
  const model = picker.open(code), all = model.browse('');
  assert.ok(all.length > 5000, code);
  const kept = picker.visible(all, false);
  assert.ok(kept.every(item => !env.window.CORE.blocked(item.row[0]) && !env.window.CORE.blocked(item.row[1])));
  const random = picker.sample(kept, 24);
  assert.equal(random.length, 24);
  assert.equal(new Set(random.map(item => item.row[0])).size, 24);
  assert.equal(picker.visible(all, true).length, all.length);
  console.log(code, all.length, 'rows;', all.length - kept.length, 'hidden by current blocker');
}
load(LEGACY + '/en/phrases.js');
const en = picker.open('en');
assert.equal(en.lookup('moon').item.blocked, false);
const blocked = en.lookup('sex');
assert.equal(blocked.inputBlocked, true);
assert.ok(!blocked.item || blocked.item.blocked);
assert.equal(picker.visible(blocked.item ? [blocked.item] : [], false).length, 0);
const de = picker.open('de'), form = de.lookup('Fahrern');
assert.equal(form.kind, '变形'); assert.equal(form.lemma, 'Fahrer');
assert.equal(form.item.row[1], 'n.驾驶员'); assert.equal(form.item.row[2], '');
assert.equal(en.lookup('moon').item.blocked, false, 'model must reactivate its own language');
// Unknown row metadata remains intact and is never rewritten by preview/filter/sample.
const synthetic = { x: [['xword', 'n.测试', '', '', { author: 'keep' }], ['xblocked', 'n.毒品', '', '']] };
env.window.LANGPACK.put('en', 'words', synthetic);
const before = JSON.stringify(synthetic), inspect = picker.open('en').browse('x');
assert.equal(picker.visible(inspect, false).length, 1);
assert.equal(inspect[1].reasons[0], '释义');
picker.sample(inspect, 2); assert.equal(JSON.stringify(synthetic), before);
console.log('picker checks passed: six languages, fail-closed loading, shared blocker, inflections, language switching, read-only sampling');
