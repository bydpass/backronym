// T19 正式词包（app/assets/lang/<语种>/words.js）：与编译包一致、未手改；候选只含可推荐义项；查词按义项正确。
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import crypto from 'node:crypto';
import store from '../app/assets/lexicon-store.js';
import {sourceSubset} from './t19/source-lookup-fixture.mjs';
import policy from '../app/assets/lexicon-policy.js';
import {loadAppFunctions} from './app-source.mjs';
import {buildAll, shortIds, assignShortIds, ID_WIDTH, SPLIT_MIN, DEFAULT_COMPILED} from './t19/build-packs.mjs';
const LANGS = ['en', 'fr', 'de', 'es', 'it', 'la'];
// 1. 重新生成的结果与包内文件逐字节相同（生成产物没有被手改，也没有落后于编译包）。
{
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 't19-packs-'));
  await buildAll(DEFAULT_COMPILED, out);
  for (const f of [...LANGS.flatMap(l => [l + '/words.js', l + '/inflections.js']), 'en/phrases.js'])
    assert.ok(fs.readFileSync(path.join(out, f)).equals(fs.readFileSync('app/assets/lang/' + f)), f + ' 与重新生成的结果不一致：重跑 node scripts/t19/build-packs.mjs');
  fs.rmSync(out, {recursive: true});
}
// 2. 按应用的加载顺序装入：英语随页面静态加载，其余经 LANGPACK.put。
const env = {window: {}, setTimeout, clearTimeout}; vm.createContext(env);
const run = f => vm.runInContext(fs.readFileSync('app/assets/' + f, 'utf8'), env, {filename: f});
run('lang/en/words.js'); run('block/core.js'); run('lang/en/block.js'); run('core.js'); run('lang/packs.js'); run('lang/en/phrases.js');
for (const l of LANGS.slice(1)) { run(`lang/${l}/rules.js`); run(`lang/${l}/block.js`); run(`lang/${l}/words.js`); }
for (const lang of LANGS) run(`lang/${lang}/inflections.js`);
const {CORE: C, LANGPACK: P} = env.window;
assert.equal(Object.keys(env.window.PHRASES).length, 0, '旧短语补充表不再使用');
const read = async file => { const bytes = fs.readFileSync(file); return {value: JSON.parse(bytes), sha256: crypto.createHash('sha256').update(bytes).digest('hex')}; };
let senses = 0, formChecks = 0, rowCount = 0, compared = 0, moreCount = 0; const nameRows = [];
// 短 ID（批 S1）：包里的义项 ID 是原哈希在六语全部义项里统一排序后的名次（定宽 base36）。下面的逐条对照把编译包的哈希换成同一套短 ID 再比
const shortOf = await shortIds(DEFAULT_COMPILED), allPacked = new Map();
function shorten(records) {
  const out = records.map(r => ({...r, sense_id: shortOf.get(r.sense_id)}));
  for (const r of out) assert.ok(r.sense_id, r.display + ' 没有短 ID');
  Object.defineProperty(out, 'formsBySense', {value: Object.fromEntries(Object.entries(records.formsBySense).map(([id, forms]) => [shortOf.get(id), forms]))});
  Object.defineProperty(out, 'guards', {value: records.guards});
  return out;
}
{
  const pairs = [...shortOf].sort((a, b) => a[0] < b[0] ? -1 : 1), re = new RegExp('^[0-9a-z]{' + ID_WIDTH + '}$');
  assert.ok(pairs.length <= 36 ** ID_WIDTH, '义项总数在短 ID 容量内');
  assert.equal(new Set(pairs.map(p => p[1])).size, pairs.length, '短 ID 全局唯一（含跨语言）');
  for (let i = 0; i < pairs.length; i++) {
    assert.match(pairs[i][1], re);
    if (!i) continue;
    assert.ok(pairs[i - 1][1] < pairs[i][1] && pairs[i - 1][1].localeCompare(pairs[i][1]) < 0, '短 ID 的先后（码位序与 localeCompare）与原哈希一致：' + pairs[i][0]);
    assert.equal(pairs[i - 1][0].localeCompare(pairs[i][0]) < 0, true, '原哈希 localeCompare 与码位序一致：' + pairs[i][0]);
  }
}
for (const lang of LANGS) {
  assert.ok(C.useLang(lang));
  const words = P.get(lang, 'words'), pack = P.get(lang, 'lexicon');
  assert.ok(!('formGate' in pack), lang + ' 词包不再带词形门控（v00.03.04）');
  assert.ok(words && pack && P.ready(lang).words, lang + ' 词包就绪');
  assert.match(fs.readFileSync(`app/assets/lang/${lang}/words.js`, 'utf8').slice(0, 900), /build-packs\.mjs[\s\S]*(CC BY-SA|MIT)/, lang + ' 文件头写明生成脚本与许可');
  const compiled = shorten(await store.load(DEFAULT_COMPILED, lang, read)), byId = new Map(compiled.map(r => [r.sense_id, r]));
  allPacked.set(lang, pack);
  { // 批 S3：反查表不进包，第一次中文反查时由中文栏现建并记在词包对象上（不可枚举）
    assert.equal(pack.v, 4); assert.ok(!Object.keys(pack).includes('reverse'), lang + ' 词包不该再带 reverse');
    assert.ok(!fs.readFileSync(`app/assets/lang/${lang}/words.js`, 'utf8').includes('"reverse":'), lang + ' words.js 里还有 reverse');
    const probe = pack.senses.find(s => s[8] === 0 && policy.CATEGORIES[s[6]].visibility === 'default' && /^[\u4e00-\u9fff]{2,}$/.test(s[3]));
    const letter = C.LANG.fold(probe[1]).charAt(0).toUpperCase();
    const got = C.candidates(words, letter, probe[3], () => false, pack);
    assert.ok(got.some(it => it[0] === probe[1]), lang + ' 中文反查「' + probe[3] + '」找不回 ' + probe[1]);
    assert.ok(pack.reverse && !Object.keys(pack).includes('reverse'), '现建后记在词包上且不可枚举');
    const keys = Object.keys(pack.reverse), want = []; const seenKey = new Set();
    for (const s of pack.senses) { const k = pack.aliases[s[3]] || s[3]; if (!seenKey.has(k)) { seenKey.add(k); want.push(k); } }
    assert.deepEqual(keys, want, lang + ' 反查表的键按义项先后出现');
    assert.equal(keys.reduce((n, k) => n + pack.reverse[k].length, 0), pack.senses.length, lang + ' 每个义项恰好归到一个键下');
  }
  { // 批 S2：词形拆干。拆的行不少于 SPLIT_MIN 个词形、词干非空；词尾串表没有重复、每条都被用到。解码后与编译包逐条相同由下面的 lx.forms 全量对照保证
    const side = P.get(lang, 'inflections'), used = new Set();
    assert.equal(side.v, 3); assert.equal(new Set(side.tails).size, side.tails.length, lang + ' 词尾串表有重复');
    for (const row of side.entries) {
      const n = store.rowForms(side, row).list.length;
      if (typeof row[2] === 'number') { assert.ok(n >= SPLIT_MIN && row[1], lang + ' 不该拆的行'); used.add(row[2]); }
      else assert.ok(n < SPLIT_MIN || (() => { const f = row[1].split(' '); return f.some(x => x[0] !== f[0][0]); })(), lang + ' 有公共前缀却没拆：' + row[1].slice(0, 40));
    }
    assert.equal(used.size, side.tails.length, lang + ' 词尾串表有没用到的条目');
  }
  const opts = {exact: C.LANG.exactKey, fold: C.LANG.fold, blocked: () => false};
  const subset = sourceSubset(compiled, opts.fold);
  const lx = store.attachForms(store.fromPack(pack, lang, C.LANG.fold), P.get(lang,"inflections"));
  const editor = loadAppFunctions(['lookupAll','lookupIn','inLang','lexiconGroups','lexiconHit','lexicon','langData'], {
    CORE: C, window: {...env.window, LEXICON_STORE: store}, state: {lang, langs: [lang]}, lexCaches: Object.create(null)
  });
  // 用实际输入改写与编辑器查询逐条验证。每条按自己的稳定 ID 核对中文。
  for (const source of compiled) {
    const typed = C.rewriteWord(source.display, null, null, true).value;
    const group = editor.lexiconGroups(typed).find(g => Object.values(g.senseIds).includes(source.sense_id));
    assert.ok(group, lang + ' ' + typed + ' 缺本义 ' + source.zh);
    const slot = Object.keys(group.senseIds).find(key => group.senseIds[key] === source.sense_id);
    const row = editor.lookupAll(typed).find(hit => hit.entry === group.entry);
    assert.ok(row);
    const visible = C.displayGroups(row.entry).find(g => C.senseId(g) === slot);
    if (C.blocked(source.zh)) assert.equal(visible, undefined);
    else { const shown = source.zh; assert.ok(visible && visible.senses.includes(shown), source.display + ' 缺显示释义 ' + shown); } // v00.03.01 L01：形容词显示时去掉末尾的「的」
  }
  // 义项与编译包一一对应：字段、词形、只供查询、同形排除、防误借清单。
  assert.equal(lx.records.length, compiled.length);
  for (const r of lx.records) {
    const typed = C.rewriteWord(r.display);
    assert.ok(!typed.over, lang + " 格内放不下 " + r.display);
    assert.equal(typed.value, C.LANG.display(r.display.replace(/’/g, "'")), lang + " 格内改坏了 " + r.display);
    const src = byId.get(r.sense_id); assert.ok(src, r.display);
    assert.deepEqual([r.display, r.pos, r.zh, r.article, r.note, r.category], [src.display, src.pos, src.zh, src.article || '', src.note || '', src.category]);
    assert.deepEqual(lx.forms[r.sense_id], compiled.formsBySense[r.sense_id]);
    assert.equal(r.evidence.frequency_rank||0,src.evidence.frequency_rank||0);
    assert.equal(!!r.evidence.exact_query,!!src.evidence.exact_query);
    const allowedForms=new Set(compiled.formsBySense[r.sense_id]);
    const meta=Object.fromEntries(Object.entries(src.evidence.noun_forms||{}).filter(([form])=>allowedForms.has(form)));
    assert.deepEqual(JSON.parse(JSON.stringify(r.evidence.noun_forms||{})),meta);
    assert.equal(policy.queryOnly(r), policy.queryOnly(src)); assert.equal(policy.demoted(r), policy.demoted(src), r.display + ' 降权标记往返'); assert.equal(policy.admission(r), null);
    assert.deepEqual(r.evidence.form_homographs ? r.evidence.form_homographs.excluded : [], src.evidence.form_homographs ? src.evidence.form_homographs.excluded : []);
    // 人名专表四列（原拼写、中文译名、性别、来源语言）逐字段往返；非人名义项不带负载。
    assert.deepEqual(r.name_payload, src.name_payload, r.display + ' 人名负载');
    if (r.category === 'names') { nameRows.push(lang + ':' + r.name_payload.join('/')); assert.ok(!policy.eligible(r, {mode: 'default'}) && !policy.eligible(r, {mode: 'expanded', expanded: ['professional-humanities', 'professional-natural', 'historical-cultural']}), r.display + ' 人名只供查询'); }
    senses++;
  }
  assert.deepEqual(Object.keys(lx.guards).sort(), Object.keys(compiled.guards).sort());
  // 查词：每个义项按原形能查到自己（释义、冠词与编译包的查询结果相同）；每个词形能查到结果。
  for (const r of compiled) {
    const g = store.packLookup(lx, r.display, opts), want = store.queryEntries(subset(r.display), r.display, opts)[0];
    assert.ok(g, lang + ' ' + r.display); assert.deepEqual(g.entry, want.entry, r.display); assert.deepEqual(g.senseIds, want.senseIds);
    // 每个词形都能查到结果（预筛后的快速路径）；每 29 个抽一个，再加上经过同形复核的义项的全部词形，与全量查询逐项比对。
    const reviewed = !!r.evidence.form_homographs;
    for (const f of compiled.formsBySense[r.sense_id]) {
      const groups = store.packLookups(lx, f, opts);
      assert.ok(groups.some(group => Object.values(group.senseIds).includes(r.sense_id)), lang + ' ' + f + ' 缺 ' + r.display + ' 的本义');
      const hit = groups[0];
      assert.ok(hit && (hit.tier === 0 || hit.tier === 1), lang + ' ' + f);
      if ((reviewed && lang !== 'la') || formChecks % 29 === 0) { const full = store.queryEntries(subset(f), f, opts)[0]; assert.deepEqual(hit.entry, full.entry, lang + ' ' + f); assert.equal(hit.lemma, full.lemma); compared++; }
      formChecks++;
    }
  }
  // 候选用的旧四列词条：只含可默认推荐的义项，按首字母归组，显示词不重复。
  const recommendable = new Set(compiled.filter(r => policy.eligible(r, {mode: 'default'})).map(r => r.display));
  const seen = new Set();
  for (const [letter, rows] of Object.entries(words)) for (const row of rows) {
    assert.ok(Array.isArray(row) && row.length === 4 && row.every(v => typeof v === 'string'), lang + ' 四列词条');
    assert.equal(C.LANG.fold(row[0]).charAt(0), letter, row[0] + ' 首字母分组');
    assert.ok(recommendable.has(row[0]), row[0] + ' 不可默认推荐，不应进候选'); assert.ok(!seen.has(row[0])); seen.add(row[0]);
    const expect = subset(row[0]).filter(r => r.display === row[0] && policy.eligible(r, {mode: 'default'}));
    assert.equal(row[1].split('|').length, expect.length, row[0] + ' 只带可推荐的义项');
    for (const r of expect) assert.ok(row[1].includes(r.zh), row[0]);
    rowCount++;
  }
  assert.deepEqual([...seen].sort(), [...recommendable].sort(), lang + ' 可推荐的词都在候选里');
  // 开关打开才出的词（more）：正好是「默认不可推荐、展开后可推荐、显示词不在 words 里」的那些；第五列是类别标注；人名、数词、只供查询的孤例不在其中。
  const more = P.get(lang, 'more'), ALL = ['professional-humanities', 'professional-natural', 'historical-cultural'], TAGS = {'professional-humanities': 'pro', 'professional-natural': 'pro', 'historical-cultural': 'hist'};
  const expandable = new Map(); for (const r of compiled) if (!recommendable.has(r.display) && policy.eligible(r, {mode: 'expanded', expanded: ALL})) (expandable.get(r.display) || expandable.set(r.display, []).get(r.display)).push(r);
  const seenMore = new Set();
  for (const [letter, rows] of Object.entries(more)) for (const row of rows) {
    assert.ok(Array.isArray(row) && row.length === 5 && row.every(v => typeof v === 'string'), lang + ' 展开词条五列');
    assert.equal(C.LANG.fold(row[0]).charAt(0), letter); assert.ok(!seenMore.has(row[0])); seenMore.add(row[0]);
    const src = expandable.get(row[0]); assert.ok(src, row[0] + ' 不应进展开候选');
    assert.ok(src.some(r => TAGS[r.category] === row[4]), row[0] + ' 类别标注'); assert.equal(row[1].split('|').length <= src.length, true);
    for (const r of src) { assert.ok(row[1].includes(r.zh), row[0]); assert.ok(!policy.queryOnly(r) && r.category !== 'names' && r.category !== 'numerals'); }
    moreCount++;
  }
  assert.deepEqual([...seenMore].sort(), [...expandable.keys()].sort(), lang + ' 可展开的词都在 more 里');
  for (const letter of Object.keys(more)) for (const it of C.candidates(more, letter.toUpperCase(), letter)) assert.ok(expandable.has(it[0]));
  // 核心函数在新词包上照常工作：候选、随机池不含专业、历史文化、人名、数词与只供查询的词。
  for (const letter of Object.keys(words)) {
    for (const it of C.candidates(words, letter.toUpperCase(), letter)) assert.ok(recommendable.has(it[0]), it[0]);
    for (const it of C.randomPool(words, letter.toUpperCase())) assert.ok(recommendable.has(it[0]), it[0]);
  }
}
// 真机例词：经过草稿字段迁移和编辑器重查；使用实际语言包，不模拟词义或冠词。
{
  const d = C.migrateDraft({v: 2, word: 'TT', lang: 'fr', langs: ['fr', 'it'], pickLangs: ['fr', ''],
    picks: [['Terre', ''], ['Treeee', '']], glosses: ['', '手填'], glossAuto: [true, false]});
  C.useLangs(d.langs);
  const state = {...d, arts: ['', ''], poss: ['', '']};
  const model = loadAppFunctions(['refreshPicks','itemFor','lookupHit','inLang','lookupIn','lexiconHit','lexiconGroups','lexicon','langData','articleText','ownArticle','hyphOf'], {
    CORE: C, window: {...env.window, LEXICON_STORE: store}, state, lexCaches: Object.create(null), defaultSense: C.defaultSense
  });
  model.refreshPicks();
  assert.equal(model.articleText(0), 'la');
  assert.deepEqual(Array.from(state.glosses), [C.defaultGloss(model.lookupHit('terre','fr').entry),'手填'], '空的自动释义填当前首义');
  state.picks[0] = ['Terre','n.大地','la',''];
  state.glosses[0] = '大地'; state.glossAuto[0] = false; state.poss[0] = 'n.';
  model.refreshPicks();
  assert.equal(state.glosses[0],'大地','旧稿亲自选过的义项仍保留');
  assert.ok(C.senseGroups(state.picks[0]).some(g=>C.senseId(g)===state.poss[0] && g.senses.includes('大地')));
  assert.equal(model.articleText(1), '');
  const it = model.lookupHit('terre', 'it');
  assert.deepEqual([it.lang,it.entry[2]], ['it',''], '意语复数保留自身语言及词形规则');
  state.langs = ['en', 'fr']; state.pickLangs = ['fr', 'en'];
  assert.deepEqual(Array.from(model.hyphOf('Perspective', 0)), [4,7]);
  assert.deepEqual(Array.from(model.hyphOf('Perspective', 1)), [3,7]);
}
// 人名来源语言随名字，不随当前词包。
assert.equal(nameRows.length, 21, '人名记录数');
// 复审 S-A1：短 ID 的容量与重复检查。超过容量必须报错停止，不截断、不回绕
{
  const ids = n => Array.from({length: n}, (_, i) => 's-' + String(i).padStart(4, '0'));
  assert.deepEqual([...assignShortIds(ids(36), 1).values()].slice(-2), ['y', 'z'], '正好装满 1 位');
  assert.throws(() => assignShortIds(ids(37), 1), /容量 36.*ID_WIDTH 改成 2/, '超过容量报错并提示加宽');
  assert.throws(() => assignShortIds(['s-a', 's-a']), /重复/, '重复的义项 ID 报错');
  assert.deepEqual([...assignShortIds(['s-b', 's-a'], 2)], [['s-a', '00'], ['s-b', '01']], '按哈希先后给名次');
}
// 复审 S-A2：中文反查表现建时的同义别名。真实词包里没有哪条别名与义项中文相同，这一支用合成词包测
{
  C.useLang('en');
  const row = (id, w, pos, zh) => [id, w, pos, zh, '', '', 'daily', 1, 0, ''];
  const pack = {senses: [row('a', 'glad', 'adj', '高兴'), row('b', 'sun', 'noun', '太阳'), row('c', 'merry', 'adj', '开心')], aliases: {'高兴': '开心'}};
  const list = {g: [['glad', 'adj.高兴', '', '']], m: [['merry', 'adj.开心', '', '']], s: [['sun', 'n.太阳', '', '']]};
  const find = (letter, q) => Array.from(C.candidates(list, letter, q, () => false, pack), it => it[0]); // 结果数组来自 vm 沙箱，转成本域数组再比
  assert.deepEqual(find('G', '开心'), ['glad'], '别名指向的规范说法能找回原词');
  assert.deepEqual(find('G', '高兴'), ['glad'], '按别名本身查也归到同一个键');
  assert.deepEqual(find('M', '高兴'), ['merry'], '别名与规范说法共用一个键');
  assert.deepEqual(Object.keys(pack.reverse), ['开心', '太阳'], '键是「别名 || 中文」，按义项先后');
  assert.deepEqual(JSON.parse(JSON.stringify([pack.reverse['开心'], pack.reverse['太阳']])), [[0, 2], [1]]);
  assert.deepEqual(Array.from(C.candidates(list, 'S', '太阳', () => false, {senses: pack.senses}), it => it[0]), ['sun'], '词包没有 aliases 也能建');
}
// 批 S1：语言多选时候选池混着几门语言，sample 按 sense_id 去重、平局也按它比。短 ID 下的抽样结果须与原哈希下逐项相同
{
  const hashOf = new Map([...shortOf].map(([hash, short]) => [short, hash]));
  const mixed = ['fr', 'es', 'it', 'en'].flatMap(lang => store.fromPack(allPacked.get(lang), lang, C.LANG.fold).records.map(record => ({record, lang})));
  assert.equal(new Set(mixed.map(m => m.record.sense_id)).size, mixed.length, '多语混合后短 ID 不撞');
  assert.equal(new Set(mixed.map(m => m.lang + m.record.sense_id)).size, mixed.length);
  // 复审 S-A3：池里放进重复的义项，去重那一支才测得到
  for (const m of mixed.filter((_, i) => i % 53 === 0)) mixed.push({...m});
  assert.ok(new Set(mixed.map(m => m.record.sense_id)).size < mixed.length, '抽样池里确有重复义项');
  const asHash = mixed.map(m => ({...m, record: {...m.record, sense_id: hashOf.get(m.record.sense_id)}}));
  const seeded = () => { let x = 20261120; return () => { x = (x * 1103515245 + 12345) % 2147483648; return x / 2147483648; }; };
  const tie = () => 0.5; // 全部平局：先后只由 sense_id 决定
  for (const random of [seeded, () => tie]) {
    const a = store.sample(mixed, 400, {random: random()}), b = store.sample(asHash, 400, {random: random()});
    assert.equal(a.length, 400); assert.equal(new Set(a.map(m => m.record.sense_id)).size, 400, '抽样结果里没有重复义项');
    assert.deepEqual(a.map(m => m.lang + ':' + m.record.display + ':' + m.record.zh), b.map(m => m.lang + ':' + m.record.display + ':' + m.record.zh), '短 ID 不改变多语抽样与去重');
  }
}
for (const row of ['en:Francesca/弗朗西斯卡/f/it', 'it:Francesca/弗朗西斯卡/f/it', 'en:Antoine/安托万/m/fr', 'fr:Antoine/安托万/m/fr', 'en:Juan/胡安/m/es', 'es:Juan/胡安/m/es']) assert.ok(nameRows.includes(row), row);
assert.deepEqual([...new Set(nameRows.map(r => r.split(':')[1].split('/')[0]))].sort(), ['Antoine', 'Francesca', 'Francesco', 'Friedrich', 'Giovanni', 'Heinrich', 'Heinz', 'Johnny', 'Juan', 'Juana', 'Luigi', 'Paco', 'Pierre']);
{ // 缺负载、多余负载、非法性别的词包应被拒绝。
  const good = P.get('fr', 'lexicon'), bad = extra => Object.assign({}, good, extra);
  for (const names of [[], good.names.concat([['s-none', 'm', 'fr']]), good.names.map((n, i) => i ? n : [n[0], 'x', n[2]])]) assert.throws(() => store.fromPack(bad({names}), 'fr', C.LANG.fold));
}
// 3. 点名回归：独立复审查出过的负例在正式词包里同样成立。
const lookups = new Map();
function ask(lang, text) {
  C.useLang(lang);
  if (!lookups.has(lang)) lookups.set(lang, store.attachForms(store.fromPack(P.get(lang, 'lexicon'), lang, C.LANG.fold), P.get(lang,'inflections')));
  const hit = store.packLookup(lookups.get(lang), text, {exact: C.LANG.exactKey, fold: C.LANG.fold, blocked: () => false});
  return hit ? hit.entry : null;
}
for (const [lang, text] of [['de', 'beihelfen'], ['la', 'marcus'], ['la', 'lēgāre'], ['la', 'occīdere'], ['la', 'cubiti'], ['la', 'papam'], ['it', 'dramme'], ['en', 'zzz']])
  assert.equal(ask(lang, text), null, lang + ' ' + text + ' 不应查到');
{ const age = ask('fr','age'); assert.ok(!age || !/年龄/.test(age[1]), '独立农具词 age 不借 âge 的年龄义（2026-11-19 返工后 age 不在前 5000，查不到也算对）'); }
// 新审的阳性头词分别指帽子与湖；旧阴性头词仍指守护与海。
for (const [word, pairs] of [['Hut',[['守护','die'],['帽子','der']]],['See',[['海','die'],['湖','der']]]]){
  const entry=ask('de',word), groups=C.senseGroups(entry);
  for (const [zh,article] of pairs) {
    const sense=groups.find(g=>g.senses.includes(zh));
    assert.ok(sense,word+' '+zh);
    assert.equal(C.articleOf(entry,'',C.senseId(sense)).text,article);
  }
}
for(const spelling of ['Hüte','Hutes','Huts'])assert.deepEqual(Array.from(C.senseList(ask('de',spelling))),['帽子'],spelling+' 不借守护义');
assert.ok(C.senseList(ask('de','Seen')).includes('湖'),'阳性 See 的复数');

// v00.03.01 L05（用户 11-18 定，词库重建简报 Q3）：人称代词进 pronouns 类，查到的是代词本义，不借同形名词（nous 的「理性」）
assert.deepEqual(ask('fr', 'nous'), ['nous', 'pron.我们', '', '']); assert.deepEqual(ask('fr', 'tu'), ['tu', 'pron.你', '', '']);
// 用户 11-18 定：英语 you 只留「你」；名词与代词同形时名词那一义降权，代词义排第一（卡面默认取第一义）
assert.deepEqual(ask('en', 'you'), ['you', 'pron.你', '', '']);
for (const [lang, text, first, noun] of [['es', 'nada', 'pron.没有什么', 'n.虚无'], ['es', 'yo', 'pron.我', 'n.自我'], ['it', 'nulla', 'pron.没有什么', 'n.虚无'], ['it', 'io', 'pron.我', 'n.自我'], ['fr', 'personne', 'pron.没有人', 'n.人']]) {
  const glosses = ask(lang, text)[1].split('|');
  assert.deepEqual([glosses[0], glosses.includes(noun)], [first, true], lang + ' ' + text + '：代词义在前，名词义仍可选');
}
{ // 降权标记从词包第 9 列（2）还原，抽词权重降到 50；只降这五个义项
  const demoted = LANGS.flatMap(l => P.get(l, 'lexicon').senses.filter(s => s[8] === 2).map(s => l + ' ' + s[1] + ' ' + s[3])).sort();
  assert.deepEqual(demoted, ['es nada 虚无', 'es yo 自我', 'fr personne 人', 'it io 自我', 'it nulla 虚无']);
  const r = lookups.get('es').records.find(x => x.display === 'nada' && x.pos === 'noun');
  assert.equal(policy.demoted(r), true); assert.equal(policy.weightOf(r), 50);
  assert.throws(() => policy.demoted({evidence: {demoted: {reason: 'x'}}}), /requires reason, source and reviewer/);
}
// 交付61：schon 现在是收进来的副词（已经），首位是它自己，不是经去变音借到的 schön。
assert.deepEqual(ask('de', 'schon'), ['schon', 'adv.已经', '', '']);
// 交付61：morte 现在是 mourir（死）的过去分词阴性，查到的是动词，不是借到名词 mort（死亡）。
{
  C.useLang('fr');
  const groups = store.packLookups(lookups.get('fr'), 'morte', {exact:C.LANG.exactKey,fold:C.LANG.fold,blocked:()=>false});
  assert.ok(groups.some(g=>g.lemma==='mourir' && g.entry[1]==='v.死'));
  assert.ok(groups.some(g=>g.lemma==='mort' && g.entry[1].includes('n.死者') && g.entry[2]==='la'));
  assert.ok(groups.every(g=>!g.entry[1].includes('n.死亡')));
}
// 交付61：变位表补的常用不规则变位在正式词包里可查（预期值独立写下）；审核排除过的词形不因变位表回来。
for (const [lang, text, lemma, zh] of [['it', 'ha', 'avere', 'v.有'], ['it', 'ho', 'avere', 'v.有'], ['it', 'possiamo', 'potere', 'v.能够'], ['en', 'is', 'be', 'v.是'], ['en', 'am', 'be', 'v.是'], ['en', 'were', 'be', 'v.是'], ['en', 'has', 'have', 'v.有'], ['de', 'hat', 'haben', 'v.有'], ['es', 'hay', 'haber', 'v.有'], ['es', 'he', 'haber', 'v.有'], ['fr', 'soit', 'être', 'v.是'], ['la', 'est', 'sum', 'v.是'], ['la', 'esse', 'sum', 'v.是'], ['la', 'dixit', 'dīcō', 'v.说'], ['la', 'noli', 'nōlō', 'v.不愿']])
  assert.equal(ask(lang, text)[1], zh, lang + ' ' + text + ' → ' + lemma); // 候选显示用户打的词形，释义取自原形
for (const [lang, text] of [['es', 'dicho'], ['it', 'dai'], ['la', 'latum']]) { const g = ask(lang, text); assert.ok(!g || !['v.说', 'v.给', 'v.携带', 'v.忍受'].includes(g[1]), lang + ' ' + text + ' 已被审核排除'); }
// V003-B4-R9（正式词包上复核，2026-11-12）：分解编码（字母 + 组合变音符）与预组编码查到同一个词；西文词框把两种编码规整成同一个写法，28 个字全收、第 29 个标出超限；v00.03.01 R07 起英语同样收变音符。
for (const [lang, pre, dec] of [['fr', 'été', 'e\u0301te\u0301'], ['es', 'niño', 'nin\u0303o'], ['de', 'schön', 'scho\u0308n']]) { assert.ok(ask(lang, pre)); assert.deepEqual(ask(lang, dec).slice(1), ask(lang, pre).slice(1), lang + ' ' + pre + ' 两种编码同一义项'); }
{ C.useLang('fr'); assert.equal(C.rewriteWord('e\u0301cole').value, C.rewriteWord('\u00e9cole').value); assert.equal(C.rewriteWord('e\u0301cole').value, '\u00c9cole');
  assert.equal(C.rewriteWord('e\u0301'.repeat(28)).value.length, 28); assert.deepEqual([C.rewriteWord('e\u0301'.repeat(29)).value.length, C.rewriteWord('e\u0301'.repeat(29)).over], [28, true]);
  C.useLang('en'); assert.equal(C.rewriteWord('e\u0301cole').value, '\u00c9cole', '英语也收变音符（v00.03.01 R07）'); }
// V003-B4-R10（正式词包上复核，2026-11-12）：变形只挂到「原形 + 词性」对得上的词；代词、介词、连词的变形不借同形名词的释义；变形不继承原形的冠词。
for (const [lang, text, zh] of [['de', 'bist', 'v.是'], ['de', 'ist', 'v.是'], ['de', 'war', 'v.是'], ['de', 'sein', 'v.是'], ['de', 'seins', 'n.存在'], ['fr', 'suis', 'v.是'], ['fr', 'livres', 'n.书|n.磅'], ['it', 'sono', 'v.是'], ['es', 'libros', 'n.书'], ['es', 'veces', 'n.次'], ['fr', 'vu', 'v.看见']]) assert.equal(ask(lang, text)[1], zh, lang + ' ' + text);
assert.equal(ask('de', 'ging')[1].split('|')[0], 'v.走路');
assert.deepEqual(ask('de', 'Sein').slice(1, 3), ['n.存在', 'das'], '名词 Sein 按原形仍可查，带冠词');
for (const [lang, text] of [['de', 'seins'], ['fr', 'livres'], ['es', 'libros'], ['es', 'veces']]) assert.equal(ask(lang, text)[2], '', lang + ' ' + text + ' 变形不继承冠词');
for (const [lang, text] of [['de', 'mich'], ['de', 'dich'], ['de', 'mir'], ['de', 'ihn'], ['de', 'weil'], ['de', 'wegen'], ['de', 'am'], ['fr', 'tous'], ['fr', 'de'], ['fr', 'dans'], ['es', 'se'], ['es', 'con']]) assert.equal(ask(lang, text), null, lang + ' ' + text + ' 是功能词，不借别的词的释义');
// 交付61：副词可查，且不带来源里的错拼与缩写。
for (const [lang, text, zh] of [['en', 'always', 'adv.总是'], ['de', 'immer', 'adv.总是'], ['es', 'siempre', 'adv.总是'], ['it', 'sempre', 'adv.总是'], ['la', 'semper', 'adv.总是'], ['la', 'olim', 'adv.从前'], ['la', 'nunquam', 'adv.从不']]) assert.equal(ask(lang, text)[1], zh, lang + ' ' + text);
assert.deepEqual(ask('fr','toujours')[1].split('|').sort(), ['adv.仍然','adv.总是'].sort(), 'toujours 保留两个独立义');
for (const [lang, text] of [['fr', 'tjr'], ['fr', 'mtn'], ['de', 'vllt'], ['es', 'dps'], ['es', 'aki']]) assert.equal(ask(lang, text), null, lang + ' ' + text + ' 不应查到');
// T19-R56-3：同词异写及其正常屈折在正式词包里也能查到（预期值独立写下）；负例保持。
for (const [lang, text, zh] of [['es', 'quioscos', 'n.售货亭'], ['es', 'quiosco', 'n.售货亭'], ['de', 'Xylofone', 'n.木琴'], ['de', 'Xylofons', 'n.木琴'], ['de', 'Xylofonen', 'n.木琴'], ['de', 'Xylofon', 'n.木琴'], ['fr', 'yogourts', 'n.酸奶'], ['fr', 'yogourt', 'n.酸奶'], ['fr', 'wagons', 'n.车厢']]) assert.equal(ask(lang, text)[1], zh, lang + ' ' + text);
for (const [lang, text] of [['es', 'unas'], ['es', 'kiosko'], ['es', 'kco'], ['la', 'zephirum']]) assert.equal(ask(lang, text), null, lang + ' ' + text + ' 不应查到');
assert.deepEqual(ask('fr', 'wagon'), ['wagon', 'n.车厢', 'le', '火车的车厢；严格说 wagon 指货车车厢，客车车厢叫 voiture，口语常混用。']); assert.equal(ask('es', 'yacer')[1], 'v.躺卧|v.长眠');
C.useLang('la'); for (const w of ['xenium', 'kalendae']) { assert.ok(!Object.values(P.get('la', 'words')).flat().some(r => r[0] === w), w + ' 不进默认候选'); assert.ok(Object.values(P.get('la', 'more')).flat().some(r => r[0] === w && r[4] === 'hist'), w + ' 在展开候选里'); }
assert.deepEqual(ask('fr', 'lumieres').slice(0, 3), ['lumières', 'n.光', ''], '漏音符候选显示带音符的拼写');
assert.equal(ask('fr', "age d'or")[0], 'âge d’or'); assert.equal(ask('fr', 'agedor')[0], 'âge d’or', '词组可不带空格与撇号输入');
assert.equal(ask('en', 'goldenage')[0], 'golden age'); assert.equal(ask('en', 'Golden Age')[0], 'golden age');
assert.deepEqual(ask('fr', 'Alexandrie').slice(0, 3), ['Alexandrie', 'n.亚历山大城', '']);
assert.equal(ask('la', 'alba')[1], 'adj.白色', '可推荐的白色义排在孤例黎明义之前');
for (const [text, zh] of [['cubitus', '卧榻'], ['papa', '食物'], ['harpa', '竖琴'], ['legit', '阅读'], ['Olympus', '奥林匹斯山']]) { C.useLang('la'); assert.ok(store.packLookups(lookups.get('la'), text, {exact:C.LANG.exactKey,fold:C.LANG.fold,blocked:()=>false}).some(g=>g.entry[1].includes(zh)), text); }
assert.equal(ask('fr', 'Antoine')[1], 'n.安托万', '人名只在精确输入时查到'); assert.equal(ask('fr', 'Antoin'), null);
assert.equal(ask('fr', 'deux')[1], 'num.二');
for (const w of ['cubitus', 'pāpa', 'alba']) assert.ok(!Object.values(P.get('la', 'more')).flat().some(r => r[0] === w), w + ' 孤例不进展开候选'); assert.ok(P.get('la', 'more').h.some(r => r[0] === 'harpa' && r[4] === 'hist'));
C.useLang('la'); for (const w of ['cubitus', 'pāpa', 'animātus', 'asserviō', 'alba', 'harpa', 'albus']) assert.ok(!Object.values(P.get('la', 'words')).flat().some(r => r[0] === w), w + ' 不进拉丁默认候选');
C.useLang('fr'); for (const w of ['Antoine', 'deux', 'genre']) assert.ok(!(P.get('fr', 'words')[C.LANG.fold(w)[0]] || []).some(r => r[0] === w && /安托万|num\.|生物分类/.test(r[1])), w);
console.log(`T19 packs ok: ${senses} 条义项与编译包一致，${formChecks} 个词形可查（其中 ${compared} 个与全量查询逐项比对）、${rowCount} 条候选词条、${moreCount} 条展开词条、${nameRows.length} 条人名四列负载通过；重新生成逐字节相同；负例与点名回归通过。`);

await import('../review/t19-batches/device-20261117/check.mjs');
await import('../review/t19-batches/device-20261117/test-editor.mjs');
