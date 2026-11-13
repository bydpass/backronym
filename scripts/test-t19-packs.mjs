// T19 正式词包（app/assets/lang/<语种>/words.js）：与编译包一致、未手改；候选只含可推荐义项；查词按义项正确。
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import crypto from 'node:crypto';
import store from '../app/assets/lexicon-store.js';
import policy from '../app/assets/lexicon-policy.js';
import {buildAll, DEFAULT_COMPILED} from './t19/build-packs.mjs';
const LANGS = ['en', 'fr', 'de', 'es', 'it', 'la'];
// 1. 重新生成的结果与包内文件逐字节相同（生成产物没有被手改，也没有落后于编译包）。
{
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 't19-packs-'));
  for (const l of LANGS) { fs.mkdirSync(path.join(out, l)); fs.copyFileSync(`app/assets/lang/${l}/words.js`, path.join(out, l, 'words.js')); }
  await buildAll(DEFAULT_COMPILED, out);
  for (const f of [...LANGS.map(l => l + '/words.js'), 'en/phrases.js'])
    assert.ok(fs.readFileSync(path.join(out, f)).equals(fs.readFileSync('app/assets/lang/' + f)), f + ' 与重新生成的结果不一致：重跑 node scripts/t19/build-packs.mjs');
  fs.rmSync(out, {recursive: true});
}
// 2. 按应用的加载顺序装入：英语随页面静态加载，其余经 LANGPACK.put。
const env = {window: {}, setTimeout, clearTimeout}; vm.createContext(env);
const run = f => vm.runInContext(fs.readFileSync('app/assets/' + f, 'utf8'), env, {filename: f});
run('lang/en/words.js'); run('block/core.js'); run('lang/en/block.js'); run('core.js'); run('lang/packs.js'); run('lang/en/phrases.js');
for (const l of LANGS.slice(1)) { run(`lang/${l}/rules.js`); run(`lang/${l}/block.js`); run(`lang/${l}/words.js`); }
const {CORE: C, LANGPACK: P} = env.window;
assert.equal(Object.keys(env.window.PHRASES).length, 0, '旧短语补充表不再使用');
const read = async file => { const bytes = fs.readFileSync(file); return {value: JSON.parse(bytes), sha256: crypto.createHash('sha256').update(bytes).digest('hex')}; };
let senses = 0, formChecks = 0, rowCount = 0, compared = 0, moreCount = 0; const nameRows = [];
for (const lang of LANGS) {
  assert.ok(C.useLang(lang));
  const words = P.get(lang, 'words'), pack = P.get(lang, 'lexicon');
  assert.ok(words && pack && P.ready(lang).words, lang + ' 词包就绪');
  assert.match(fs.readFileSync(`app/assets/lang/${lang}/words.js`, 'utf8').slice(0, 900), /build-packs\.mjs[\s\S]*(CC BY-SA|MIT)/, lang + ' 文件头写明生成脚本与许可');
  const compiled = await store.load(DEFAULT_COMPILED, lang, read), byId = new Map(compiled.map(r => [r.sense_id, r]));
  const opts = {exact: C.LANG.exactKey, fold: C.LANG.fold, blocked: () => false};
  const lx = store.fromPack(pack, lang, C.LANG.fold);
  // 义项与编译包一一对应：字段、词形、只供查询、同形排除、防误借清单。
  assert.equal(lx.records.length, compiled.length);
  for (const r of lx.records) {
    const src = byId.get(r.sense_id); assert.ok(src, r.display);
    assert.deepEqual([r.display, r.pos, r.zh, r.article, r.note, r.category], [src.display, src.pos, src.zh, src.article || '', src.note || '', src.category]);
    assert.deepEqual(lx.forms[r.sense_id], compiled.formsBySense[r.sense_id]);
    assert.equal(policy.queryOnly(r), policy.queryOnly(src)); assert.equal(policy.admission(r), null);
    assert.deepEqual(r.evidence.form_homographs ? r.evidence.form_homographs.excluded : [], src.evidence.form_homographs ? src.evidence.form_homographs.excluded : []);
    // 人名专表四列（原拼写、中文译名、性别、来源语言）逐字段往返；非人名义项不带负载。
    assert.deepEqual(r.name_payload, src.name_payload, r.display + ' 人名负载');
    if (r.category === 'names') { nameRows.push(lang + ':' + r.name_payload.join('/')); assert.ok(!policy.eligible(r, {mode: 'default'}) && !policy.eligible(r, {mode: 'expanded', expanded: ['professional-humanities', 'professional-natural', 'historical-cultural']}), r.display + ' 人名只供查询'); }
    senses++;
  }
  assert.deepEqual(Object.keys(lx.guards).sort(), Object.keys(compiled.guards).sort());
  // 查词：每个义项按原形能查到自己（释义、冠词与编译包的查询结果相同）；每个词形能查到结果。
  for (const r of compiled) {
    const g = store.packLookup(lx, r.display, opts), want = store.queryEntries(compiled, r.display, opts)[0];
    assert.ok(g, lang + ' ' + r.display); assert.deepEqual(g.entry, want.entry, r.display); assert.deepEqual(g.senseIds, want.senseIds);
    // 每个词形都能查到结果（预筛后的快速路径）；每 29 个抽一个，再加上经过同形复核的义项的全部词形，与全量查询逐项比对。
    const reviewed = !!r.evidence.form_homographs;
    for (const f of compiled.formsBySense[r.sense_id]) {
      const hit = store.packLookup(lx, f, opts);
      assert.ok(hit && (hit.tier === 0 || hit.tier === 1), lang + ' ' + f);
      if ((reviewed && lang !== 'la') || formChecks % 29 === 0) { const full = store.queryEntries(compiled, f, opts)[0]; assert.deepEqual(hit.entry, full.entry, lang + ' ' + f); assert.equal(hit.lemma, full.lemma); compared++; }
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
    const expect = compiled.filter(r => r.display === row[0] && policy.eligible(r, {mode: 'default'}));
    assert.equal(row[1].split('|').length, expect.length, row[0] + ' 只带可推荐的义项');
    for (const r of expect) assert.ok(row[1].includes(r.zh), row[0]);
    rowCount++;
  }
  assert.deepEqual([...seen].sort(), [...recommendable].sort(), lang + ' 可推荐的词都在候选里');
  // 开关打开才出的词（more）：正好是「默认不可推荐、展开后可推荐、显示词不在 words 里」的那些；第五列是类别标注；人名、数词、只供查询的孤例不在其中。
  const more = P.get(lang, 'more'), ALL = ['professional-humanities', 'professional-natural', 'historical-cultural'], TAGS = {'professional-humanities': '专业', 'professional-natural': '专业', 'historical-cultural': '历史文化'};
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
// 人名：8个名字共16条，来源语言是名字本身的语种，不随词包语种变。
assert.equal(nameRows.length, 16, '人名记录数');
for (const row of ['en:Francesca/弗朗西斯卡/f/it', 'it:Francesca/弗朗西斯卡/f/it', 'en:Antoine/安托万/m/fr', 'fr:Antoine/安托万/m/fr', 'en:Juan/胡安/m/es', 'es:Juan/胡安/m/es']) assert.ok(nameRows.includes(row), row);
assert.deepEqual([...new Set(nameRows.map(r => r.split(':')[1].split('/')[0]))].sort(), ['Antoine', 'Francesca', 'Francesco', 'Friedrich', 'Giovanni', 'Heinrich', 'Juan', 'Juana']);
{ // 缺负载、多余负载、非法性别的词包应被拒绝。
  const good = P.get('fr', 'lexicon'), bad = extra => Object.assign({}, good, extra);
  for (const names of [[], good.names.concat([['s-none', 'm', 'fr']]), good.names.map((n, i) => i ? n : [n[0], 'x', n[2]])]) assert.throws(() => store.fromPack(bad({names}), 'fr', C.LANG.fold));
}
// 3. 点名回归：独立复审查出过的负例在正式词包里同样成立。
const ask = (lang, text) => { C.useLang(lang); const lx = store.fromPack(P.get(lang, 'lexicon'), lang, C.LANG.fold); const g = store.packLookup(lx, text, {exact: C.LANG.exactKey, fold: C.LANG.fold, blocked: () => false}); return g ? g.entry : null; };
for (const [lang, text] of [['de', 'Hüte'], ['de', 'Hutes'], ['de', 'beihelfen'], ['la', 'marcus'], ['la', 'lēgāre'], ['la', 'occīdere'], ['la', 'cubiti'], ['la', 'papam'], ['fr', 'nous'], ['fr', 'age'], ['it', 'dramme'], ['en', 'zzz']])
  assert.equal(ask(lang, text), null, lang + ' ' + text + ' 不应查到');
assert.deepEqual(ask('de', 'Hut'), ['Hut', 'n.守护', 'die', '']);
// 交付61：schon 现在是收进来的副词（已经），首位是它自己，不是经去变音借到的 schön。
assert.deepEqual(ask('de', 'schon'), ['schon', 'adv.已经', '', '']);
// 交付61：morte 现在是 mourir（死）的过去分词阴性，查到的是动词，不是借到名词 mort（死亡）。
assert.equal(ask('fr', 'morte')[1], 'v.死');
// 交付61：变位表补的常用不规则变位在正式词包里可查（预期值独立写下）；审核排除过的词形不因变位表回来。
for (const [lang, text, lemma, zh] of [['it', 'ha', 'avere', 'v.有'], ['it', 'ho', 'avere', 'v.有'], ['it', 'possiamo', 'potere', 'v.能够'], ['en', 'is', 'be', 'v.是'], ['en', 'am', 'be', 'v.是'], ['en', 'were', 'be', 'v.是'], ['en', 'has', 'have', 'v.有'], ['de', 'hat', 'haben', 'v.有'], ['de', 'weiß', 'wissen', 'v.知道'], ['es', 'hay', 'haber', 'v.有'], ['es', 'he', 'haber', 'v.有'], ['fr', 'soit', 'être', 'v.是'], ['la', 'est', 'sum', 'v.是'], ['la', 'esse', 'sum', 'v.是'], ['la', 'dixit', 'dīcō', 'v.说'], ['la', 'noli', 'nōlō', 'v.不愿']])
  assert.equal(ask(lang, text)[1], zh, lang + ' ' + text + ' → ' + lemma); // 候选显示用户打的词形，释义取自原形
for (const [lang, text] of [['es', 'dicho'], ['it', 'dai'], ['la', 'latum']]) { const g = ask(lang, text); assert.ok(!g || !['v.说', 'v.给', 'v.携带', 'v.忍受'].includes(g[1]), lang + ' ' + text + ' 已被审核排除'); }
// V003-B4-R9（正式词包上复核，2026-11-12）：分解编码（字母 + 组合变音符）与预组编码查到同一个词；西文词框把两种编码规整成同一个写法，28 个字全收、第 29 个标出超限；英语照旧。
for (const [lang, pre, dec] of [['fr', 'été', 'e\u0301te\u0301'], ['es', 'niño', 'nin\u0303o'], ['de', 'schön', 'scho\u0308n']]) { assert.ok(ask(lang, pre)); assert.deepEqual(ask(lang, dec).slice(1), ask(lang, pre).slice(1), lang + ' ' + pre + ' 两种编码同一义项'); }
{ C.useLang('fr'); assert.equal(C.rewriteWord('e\u0301cole').value, C.rewriteWord('\u00e9cole').value); assert.equal(C.rewriteWord('e\u0301cole').value, '\u00c9cole');
  assert.equal(C.rewriteWord('e\u0301'.repeat(28)).value.length, 28); assert.deepEqual([C.rewriteWord('e\u0301'.repeat(29)).value.length, C.rewriteWord('e\u0301'.repeat(29)).over], [28, true]);
  C.useLang('en'); assert.equal(C.rewriteWord('e\u0301cole').value, 'Ecole', '英语不收变音符'); }
// V003-B4-R10（正式词包上复核，2026-11-12）：变形只挂到「原形 + 词性」对得上的词；代词、介词、连词的变形不借同形名词的释义；变形不继承原形的冠词。
for (const [lang, text, zh] of [['de', 'bist', 'v.是'], ['de', 'ist', 'v.是'], ['de', 'war', 'v.是'], ['de', 'sein', 'v.是'], ['de', 'seins', 'n.存在'], ['fr', 'suis', 'v.是'], ['fr', 'livres', 'n.书'], ['it', 'sono', 'v.是'], ['es', 'libros', 'n.书'], ['es', 'veces', 'n.次'], ['fr', 'vu', 'v.看见']]) assert.equal(ask(lang, text)[1], zh, lang + ' ' + text);
assert.equal(ask('de', 'ging')[1].split('|')[0], 'v.走路');
assert.deepEqual(ask('de', 'Sein').slice(1, 3), ['n.存在', 'das'], '名词 Sein 按原形仍可查，带冠词');
for (const [lang, text] of [['de', 'seins'], ['fr', 'livres'], ['es', 'libros'], ['es', 'veces']]) assert.equal(ask(lang, text)[2], '', lang + ' ' + text + ' 变形不继承冠词');
for (const [lang, text] of [['de', 'mich'], ['de', 'dich'], ['de', 'mir'], ['de', 'ihn'], ['de', 'weil'], ['de', 'wegen'], ['de', 'am'], ['fr', 'tous'], ['fr', 'de'], ['fr', 'tu'], ['fr', 'dans'], ['es', 'se'], ['es', 'con']]) assert.equal(ask(lang, text), null, lang + ' ' + text + ' 是功能词，不借别的词的释义');
// 交付61：副词可查，且不带来源里的错拼与缩写。
for (const [lang, text, zh] of [['en', 'always', 'adv.总是'], ['fr', 'toujours', 'adv.总是'], ['de', 'immer', 'adv.总是'], ['es', 'siempre', 'adv.总是'], ['it', 'sempre', 'adv.总是'], ['la', 'semper', 'adv.总是'], ['la', 'olim', 'adv.从前'], ['la', 'nunquam', 'adv.从不']]) assert.equal(ask(lang, text)[1], zh, lang + ' ' + text);
for (const [lang, text] of [['fr', 'tjr'], ['fr', 'mtn'], ['de', 'vllt'], ['es', 'dps'], ['es', 'aki']]) assert.equal(ask(lang, text), null, lang + ' ' + text + ' 不应查到');
// T19-R56-3：同词异写及其正常屈折在正式词包里也能查到（预期值独立写下）；负例保持。
for (const [lang, text, zh] of [['es', 'quioscos', 'n.售货亭'], ['es', 'quiosco', 'n.售货亭'], ['de', 'Xylofone', 'n.木琴'], ['de', 'Xylofons', 'n.木琴'], ['de', 'Xylofonen', 'n.木琴'], ['de', 'Xylofon', 'n.木琴'], ['fr', 'yogourts', 'n.酸奶'], ['fr', 'yogourt', 'n.酸奶'], ['fr', 'wagons', 'n.车厢']]) assert.equal(ask(lang, text)[1], zh, lang + ' ' + text);
for (const [lang, text] of [['es', 'unas'], ['es', 'kiosko'], ['es', 'kco'], ['la', 'zephirum']]) assert.equal(ask(lang, text), null, lang + ' ' + text + ' 不应查到');
assert.deepEqual(ask('fr', 'wagon'), ['wagon', 'n.车厢', 'le', '火车的车厢；严格说 wagon 指货车车厢，客车车厢叫 voiture，口语常混用。']); assert.equal(ask('es', 'yacer')[1], 'v.躺卧|v.长眠');
C.useLang('la'); for (const w of ['xenium', 'kalendae']) { assert.ok(!Object.values(P.get('la', 'words')).flat().some(r => r[0] === w), w + ' 不进默认候选'); assert.ok(Object.values(P.get('la', 'more')).flat().some(r => r[0] === w && r[4] === '历史文化'), w + ' 在展开候选里'); }
assert.deepEqual(ask('fr', 'lumieres').slice(0, 3), ['lumieres', 'n.光', '']);
assert.equal(ask('fr', "age d'or")[0], 'âge d’or'); assert.equal(ask('fr', 'agedor')[0], 'âge d’or', '词组可不带空格与撇号输入');
assert.equal(ask('en', 'goldenage')[0], 'golden age'); assert.equal(ask('en', 'Golden Age')[0], 'golden age');
assert.deepEqual(ask('fr', 'Alexandrie').slice(0, 3), ['Alexandrie', 'n.亚历山大城', '']);
assert.equal(ask('la', 'alba')[1], 'adj.白色的', '可推荐的白色义排在孤例黎明义之前');
for (const [text, zh] of [['cubitus', '卧榻（罕）'], ['papa', '食物（罕）'], ['harpa', '竖琴'], ['legit', '阅读'], ['Olympus', '奥林匹斯山']]) assert.ok(ask('la', text)[1].includes(zh), text);
assert.equal(ask('fr', 'Antoine')[1], 'n.安托万', '人名只在精确输入时查到'); assert.equal(ask('fr', 'Antoin'), null);
assert.equal(ask('fr', 'deux')[1], 'num.二');
for (const w of ['cubitus', 'pāpa', 'alba']) assert.ok(!Object.values(P.get('la', 'more')).flat().some(r => r[0] === w), w + ' 孤例不进展开候选'); assert.ok(P.get('la', 'more').h.some(r => r[0] === 'harpa' && r[4] === '历史文化'));
C.useLang('la'); for (const w of ['cubitus', 'pāpa', 'animātus', 'asserviō', 'alba', 'harpa', 'albus']) assert.ok(!Object.values(P.get('la', 'words')).flat().some(r => r[0] === w), w + ' 不进拉丁默认候选');
C.useLang('fr'); for (const w of ['Antoine', 'deux', 'genre']) assert.ok(!(P.get('fr', 'words')[C.LANG.fold(w)[0]] || []).some(r => r[0] === w && /安托万|num\.|生物分类/.test(r[1])), w);
console.log(`T19 packs ok: ${senses} 条义项与编译包一致，${formChecks} 个词形可查（其中 ${compared} 个与全量查询逐项比对）、${rowCount} 条候选词条、${moreCount} 条展开词条、${nameRows.length} 条人名四列负载通过；重新生成逐字节相同；负例与点名回归通过。`);
