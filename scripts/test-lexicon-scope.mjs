import assert from 'node:assert/strict';
import fs from 'node:fs';
import { legacyDir } from './legacy-packs.mjs';
const LEGACY = legacyDir(); // 旧管线词包：T19 接入后不再随包，从固定提交取出（见 legacy-packs.mjs）
import vm from 'node:vm';
import { scopeRow, scopeWords, excludedPos, formOnly } from './lexicon/scope.mjs';
assert.equal(formOnly(['creep (motion, deformation), gerund of kriechen']), false);
assert.equal(formOnly(['dropping, dump (gerund of abwerfen)']), false);
assert.equal(formOnly(['gerund of kriechen']), true);
assert.equal(formOnly(['ablative/dative gerund of illābor']), true, '拉丁带格的动名词仍是变形');
assert.equal(formOnly(['genitive gerund of amō']), true);
assert.equal(formOnly(['only used in se ... quejando, syntactic variant of quejándose, gerund of quejarse']), true);
assert.equal(scopeRow(['ihr', 'pron.她的|pron.你们'], 'de')[1], 'pron.你们');
assert.equal(scopeRow(['you', 'Pron.你'], 'en')[1], 'Pron.你');
assert.equal(scopeRow(['hélas', 'intj.唉'], 'fr'), null);
assert.equal(scopeRow(['they', 'pron.他们'], 'en'), null);
assert.equal(scopeRow(['le', 'art.定冠词'], 'fr'), null);
assert.deepEqual(scopeRow(['will', 'aux.将会|n.意志|v.决意', '', '正式', { source: 1 }], 'en'),
  ['will', 'n.意志|v.决意', '', '正式', { source: 1 }]);
assert.deepEqual(scopeRow(['Sangre', 'n.血', 'la'], 'es'), ['Sangre', 'n.血', 'la', '']);
assert.deepEqual(scopeRow(['rosa', 'n.玫瑰', 'la'], 'la'), ['rosa', 'n.玫瑰', '', '']);
assert.equal(scopeRow(['lait', 'n.奶', 'le'], 'fr')[0], 'lait');
assert.equal(scopeRow(['vite', 'adv.快', 'la'], 'fr')[2], '');
assert.equal(scopeRow(['x', '[医]测试', '', '注释'], 'en')[1], '[医]测试');
const source = { a: [['a', 'art.一'], ['art', 'n.艺术', '', '艺术']] };
const snapshot = JSON.stringify(source);
assert.equal(scopeWords(source, 'en').a.length, 1);
assert.equal(JSON.stringify(source), snapshot, '不修改输入或元数据');
const context = { window: {} }; vm.createContext(context);
vm.runInContext(fs.readFileSync(new URL('../app/assets/core.js', import.meta.url), 'utf8'), context);
const { CORE } = context.window;
assert.equal(CORE.entryData(['kaki', 'n.柿子', 'le'], 'fr').article, 'le');
assert.equal(CORE.entryData(['rose', 'n.玫瑰', 'the'], 'en').article, '');
assert.equal(CORE.entryData(['rosa', 'n.玫瑰', 'la'], 'la').article, '');
assert.equal(CORE.entryData(['test', 'n.测试']).note, '');
assert.equal(CORE.entryData(['test', 'n.测试', '', '罕见']).note, '罕见');
for (const lang of ['en', 'fr', 'de', 'es', 'it', 'la']) {
  const parts = {}, window = { LANGPACK: { put: (code, part, value) => { parts[part] = value; } } };
  vm.runInNewContext(fs.readFileSync(new URL(`${LEGACY}/${lang}/words.js`, import.meta.url), 'utf8'), { window });
  const words = lang === 'en' ? window.WORDS : parts.words;
  const rows = Object.values(words).flat(), targets = new Set(rows.map(r => r[0]));
  for (const row of rows) {
    assert.ok(row.length >= 4, `${lang}/${row[0]} 缺注释位`);
    assert.ok(row[1]);
    for (const group of row[1].split('|')) assert.ok(!excludedPos((group.match(/^([a-z]+)\./i) || [])[1]), `${lang}/${row[0]}/${group}`);
    if (lang === 'en' || lang === 'la' || !/(^|\|)n\./.test(row[1])) assert.equal(row[2], '');
  }
  for (const target of Object.keys(parts.forms || {})) assert.ok(targets.has(target), `${lang} 变形索引悬空 ${target}`);
  const filtered = scopeWords(words, lang); // v3 会从 v2 历史词包剔除感叹义。
  assert.equal(JSON.stringify(scopeWords(filtered, lang)), JSON.stringify(filtered), '重复过滤稳定');
  console.log(lang, rows.length, '词条范围与数据结构通过');
}
// Q4-R1：非独立形式（全部原始义项都只是变形 / 组合说明）不作独立候选；有一个真释义就保留
for (const g of [['compound of the infinitive porre with le'], ["compound of di', the second-person singular imperative form of dire, with me"],
  ['Used other than figuratively or idiomatically: compound of fare and ci'], ['genitive/locative singular of bellum (“war”)'],
  ['second-person singular present active indicative/imperative of orior'], ['accusative/nominative neuter singular of alius'],
  ['synonym of tessuto, past participle of tessere'], ['second-person singular present/imperfect subjunctive of être'], ['inflection of amare:'],
  ['first-person singular present indicative of amare', 'third-person plural of amare']]) assert.equal(formOnly(g), true, '应判为变形条目：' + g[0]);
for (const g of [['to go away, leave'], ['compound of fare and ci', 'to make it, to manage'], ['female equivalent of attore', 'actress'], ['feminine of amico'], ['plural of ciseau', 'scissors'],
  ['diminutive of casa'], ['synonym of gatto'], ['post-1990 spelling of dîner'], ['involving'], ['a person of note'], ['the act of writing'], []]) assert.equal(formOnly(g), false, '不应判为变形条目：' + (g[0] || '（空）'));
// SCOPE-R1 / R2：英语成品（词库与短语）要与从 ECDICT 源生成的结果逐字节一致；同形实义保留、短语不因组成词是功能词而丢
{
  const en = {}; vm.runInNewContext(fs.readFileSync(new URL(LEGACY + '/en/words.js', import.meta.url), 'utf8'), { window: en });
  const word = new Map(Object.values(en.WORDS).flat().map(r => [r[0], r[1]]));
  assert.equal(word.get('below'), 'adv.在下面', 'below 的副词义保留');
  assert.equal(word.get('beneath'), 'adv.在…下方');
  for (const w of ['concerning', 'and', 'or', 'vs', 'for', 'with', 'the', 'at', 'it']) assert.ok(!word.has(w), w + ' 是纯功能词，领域义项不能把它带回独立候选');
  for (const w of ['will', 'like', 'round', 'past']) assert.ok(word.has(w), w + ' 的实义组保留');
  const ph = {}; vm.runInNewContext(fs.readFileSync(new URL(LEGACY + '/en/phrases.js', import.meta.url), 'utf8'), { window: ph });
  const has = p => ('~' + ph.PHRASES[p[0]] + '~').includes('~' + p + '^');
  for (const p of ['account for', 'absence of mind', 'achieve the goal']) assert.ok(has(p), '短语不能因组成词是功能词而丢：' + p);
  const src = new URL('./.cache/ecdict.csv', import.meta.url);
  if (fs.existsSync(src)) {
    const { execFileSync } = await import('node:child_process'); const os = await import('node:os'); const path = await import('node:path');
    const out = fs.mkdtempSync(path.join(os.tmpdir(), 'dict-rebuild-'));
    execFileSync(process.execPath, [new URL('./build-dict.mjs', import.meta.url).pathname], { env: { ...process.env, BACKRONYM_DICT_OUT: out }, stdio: 'ignore' });
    for (const f of ['words.js', 'phrases.js']) assert.ok(fs.readFileSync(path.join(out, f)).equals(fs.readFileSync(LEGACY + '/en/' + f)), 'en/' + f + ' 与从源重建的结果不一致（成品不能靠迁移改，重跑 npm run dict）');
    fs.rmSync(out, { recursive: true });
    console.log('en 成品与源重建逐字节一致');
  } else console.log('en 源重建对照跳过：没有 scripts/.cache/ecdict.csv');
}
console.log('lexicon scope ok');
