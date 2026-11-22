// v00.04.00 批 2：英文界面的英文释义。`npm test`
// 1. 正式词包：五门外语的 lexicon.en 与义项逐行对齐，非人名义项都有英文、人名没有；英语词包不带（英语的词只标词性）。
// 2. 英文释义表 review/en-gloss/<语言>.tsv：逐义项对照正式包的完整英文和卡面短写，核对方式、机翻备注和返工覆盖。
// 3. lexicon-store 拒收对不齐、写法不对的英文数组。
// 4. 预设：外语预设都有英文命题释义，英语预设没有。
// 5. core 的释义钩子：没装时原样（中文界面不变）；装上后默认释义换成英文；恢复草稿时中英两种写法都认得出自动释义。
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import {methodOk, readRepairs, readTable, sameCard, sameCardKey, SAME_CARD, stripEditorialNote} from './t19/en-gloss.mjs';
import {shortIds} from './t19/build-packs.mjs';
const require = createRequire(import.meta.url);
const store = require('../app/assets/lexicon-store.js');
const LANGS = ['en', 'fr', 'de', 'es', 'it', 'la'], FOREIGN = LANGS.slice(1);
const HAN = /[㐀-鿿]/;

assert.equal(stripEditorialNote('operational (all meanings)'), 'operational');
assert.equal(stripEditorialNote('limit (mathematics)'), 'limit (mathematics)');

const env = {window: {}, setTimeout, clearTimeout}; vm.createContext(env);
const run = f => vm.runInContext(fs.readFileSync('app/assets/' + f, 'utf8'), env, {filename: f});
run('lang/en/words.js'); run('block/core.js'); run('lang/en/block.js'); run('i18n.js'); run('core.js'); run('lang/packs.js');
for (const l of FOREIGN) { run(`lang/${l}/rules.js`); run(`lang/${l}/block.js`); run(`lang/${l}/words.js`); }
run('lang/presets.js');
const {CORE: C, LANGPACK: P} = env.window;

// 1. 词包
// 英语（真机第一轮 D6，用户 2026-11-21 定）：只有专业、历史文化词带英文，条数与 review/en-gloss/en.tsv 相同，其余记 0
{
  const lx = env.window.LEXICON_EN, enRows = fs.readFileSync('review/en-gloss/en.tsv', 'utf8').trim().split('\n').length - 1;
  assert.ok(Array.isArray(lx.en) && lx.en.length === lx.senses.length, 'en 英文数组与义项对齐');
  const given = lx.en.filter(Boolean);
  assert.equal(given.length, enRows, '英语只有专业、历史文化词带英文：' + given.length + ' / ' + enRows);
  assert.ok(given.every(e => !HAN.test(String(e))), '英语的英文释义里没有中文');
  const more = new Set(Object.values(env.window.WORDS_MORE).flat().map(r => r[0]));
  const shown = store.fromPack(lx, 'en', s => String(s).toLowerCase()).records.filter(r => r.en).map(r => r.display);
  assert.ok([...more].every(w => shown.includes(w)), '展开候选里的英语词都有英文');
  assert.ok(!shown.includes('love') && !shown.includes('life'), '英语常用词仍不带英文');
}
let total = 0;
for (const lang of FOREIGN) {
  const lx = P.get(lang, 'lexicon');
  assert.ok(Array.isArray(lx.en) && lx.en.length === lx.senses.length, lang + ' 英文数组与义项对齐');
  lx.senses.forEach((s, i) => {
    const e = lx.en[i];
    if (s[6] === 'names') { assert.equal(e, 0, lang + ' 人名不给英文：' + s[1]); return; }
    assert.ok(e, lang + ' 缺英文：' + s[1] + '「' + s[3] + '」');
    const [full, short] = typeof e === 'string' ? [e, e] : e;
    assert.ok(!HAN.test(full) && !HAN.test(short), lang + ' 英文里夹了中文：' + s[1]);
    assert.ok(short.length <= full.length && short !== '', lang + ' 短写不对：' + s[1]);
    total++;
  });
}

// 2. 英文释义表
const METHODS = new Set(['single', 'ecdict', 'pick', 'mt']);
const repairs = readRepairs();
const toShortId = await shortIds();
for (const lang of FOREIGN) {
  const rows = readTable(`review/en-gloss/${lang}.tsv`), picks = new Map(readTable(`review/en-gloss/picks/${lang}.tsv`).map(r => [r.sense_id, r]));
  const fixes = repairs.get(lang);
  const {senses, en} = P.get(lang, 'lexicon');
  const packed = new Map(senses.map((sense, i) => [sense[0], en[i]]).filter(([, gloss]) => gloss));
  assert.equal(new Set(rows.map(r => r.sense_id)).size, rows.length, lang + ' 表里义项不重复');
  assert.equal(rows.length, packed.size, lang + ' 词包中每条英文都应来自表格');
  let applied = 0;
  for (const r of rows) {
    const gloss = packed.get(toShortId.get(r.sense_id));
    const actual = typeof gloss === 'string' ? [gloss, gloss] : gloss && Array.from(gloss);
    assert.deepEqual(actual, [r.en, r.short || r.en], lang + ' 完整英文或卡面短写与词包不符：' + r.sense_id);
    assert.equal(stripEditorialNote(r.en), r.en, lang + ' 完整英文含词典编辑注：' + r.sense_id);
    assert.equal(stripEditorialNote(r.short), r.short, lang + ' 卡面短写含词典编辑注：' + r.sense_id);
    assert.ok(METHODS.has(r.method) || (r.method === 'dict:freedict-ita-eng' && lang === 'it'), lang + ' 方式不对（V0400-A6：补充词典只许意英一本、只用在意语上，GPL 词典不得用）：' + r.method);
    const fix = fixes.get(r.sense_id);
    if (r.method === 'mt') assert.ok((fix?.en ? fix : picks.get(r.sense_id))?.note, lang + ' 机翻要带备注：' + r.display);
    if (!fix) continue;
    applied++;
    if (fix.en) assert.deepEqual([r.method, r.en], [fix.method, fix.en], lang + ' 完整英文返工未生效：' + r.display);
    if (fix.short) assert.equal(r.short || r.en, fix.short, lang + ' 卡面短写返工未生效：' + r.display);
  }
  assert.equal(applied, fixes.size, lang + ' 英文返工条目全部在词包范围内');
  // 输入表的来源标签也要对（复审：以前只查成品表，挑选表写进别的词典要到重新生成才报错）
  for (const p of picks.values()) assert.ok(methodOk(lang, p.method), lang + ' 挑选表方式不对：' + p.sense_id + ' ' + p.method);
  for (const f of fixes.values()) if (f.en) assert.ok(methodOk(lang, f.method), lang + ' 返工表方式不对：' + f.sense_id + ' ' + f.method);
}

// 2b. 同词撞名与非释义串（扫描见 en-gloss.mjs 的 sameCard）。裁定表里每行都要有结论和理由：
//     form 只能「已修」；clash、near、en、usage 可以「保留」，但要逐组写理由。「已修」的行留着，防止旧错配回来。
//     成品里扫出来的，必须正好是有「保留」裁定的那些：多出来 = 新问题或旧错重现，少了 = 保留行已不成立。
//     这一段的问题攒到文件末尾一起报，免得改一条才看到下一条。
const decisions = readTable(SAME_CARD), sameCardProblems = [];
assert.ok(decisions.length >= 285, '缺少 A5 逐组裁定');
const accepted = new Set(), recorded = new Set();
for (const row of decisions) {
  const key = sameCardKey(row), where = [row.lang, row.display, row.pos, row.kind, row.zh].join(' ');
  if (recorded.has(key)) sameCardProblems.push('裁定重复：' + where);
  recorded.add(key);
  if (!row.note.trim()) sameCardProblems.push('裁定缺理由：' + where);
  if (!(row.status === '已修' || (row.status === '保留' && row.kind !== 'form'))) sameCardProblems.push('尚未裁定，或保留了格式串：' + where);
  if (row.status === '保留') accepted.add(key);
}
const current = FOREIGN.flatMap(lang => sameCard(lang, readTable(`review/en-gloss/${lang}.tsv`)));
const KIND = {clash: '卡面相同', near: '卡面近似', en: '完整英文相同', form: '词典格式串', usage: '用法说明当释义'};
const currentKeys = new Set(current.map(sameCardKey));
for (const g of current) if (!accepted.has(sameCardKey(g))) sameCardProblems.push(`${KIND[g.kind]}，没有保留裁定：${g.lang} ${g.display}（${g.pos}）${g.zh} → ${g.card}`);
for (const key of accepted) if (!currentKeys.has(key)) sameCardProblems.push('有保留裁定的行已不成立，删掉或改成已修：' + key.split('\t').join(' '));
// 保留的 clash 组里，完整英文也一字不差的（义项栏两个按钮完全一样）只计数提醒，不判错
const enSame = (() => { let n = 0; for (const lang of FOREIGN) { const m = new Map(); for (const r of readTable(`review/en-gloss/${lang}.tsv`)) { const k = [r.display, r.pos, r.en.toLowerCase()].join('\t'); m.set(k, (m.get(k) || new Set()).add(r.zh)); } for (const z of m.values()) if (z.size > 1) n++; } return n; })();

// 2c. 扫描本身：每一类用造的几行各验一次认得出，再验几种不该报的
{
  const row = (display, zh, en, short = '') => ({display, pos: 'noun', zh, en, short});
  const kinds = rows => sameCard('xx', rows).map(g => g.kind + ':' + g.card).sort();
  assert.deepEqual(kinds([row('a', '甲', 'bench'), row('a', '乙', 'Bench')]), ['clash:bench'], '卡面相同（不分大小写）');
  assert.deepEqual(kinds([row('a', '甲', 'a truth'), row('a', '乙', 'truth')]), ['near:a truth ≈ truth'], '只差冠词');
  assert.deepEqual(kinds([row('a', '甲', 'to travel by vehicle'), row('a', '乙', 'to travel in a vehicle')]), ['near:to travel by vehicle ≈ to travel in a vehicle'], '只差介词');
  assert.deepEqual(kinds([row('a', '甲', 'ethics'), row('a', '乙', 'ethic')]), ['near:ethic ≈ ethics'], '只差单复数');
  assert.deepEqual(kinds([row('a', '甲', 'column; a round support', 'pillar'), row('a', '乙', 'column; a round support', 'newspaper column')]), ['en:column; a round support'], '卡面不同而完整英文相同');
  assert.deepEqual(kinds([row('a', '甲', 'post-1990 spelling of b')]), ['form:post-1990 spelling of b'], '改革拼写的指向');
  assert.deepEqual(kinds([row('a', '甲', '(dated) synonym of b', 'thing')]), ['form:thing'], '完整英文是带括注开头的格式串，卡面正常也报');
  assert.deepEqual(kinds([row('a', '甲', 'Used as a copula. to be')]), ['usage:Used as a copula. to be'], '用法说明');
  assert.deepEqual(kinds([row('a', '甲', '(to reach the boiling point)')]), ['usage:(to reach the boiling point)'], '卡面整个是括注');
  assert.deepEqual(kinds([row('a', '甲', 'used to'), row('a', '乙', 'heart (organ)'), row('a', '丙', 'inner self'), row('b', '甲', 'heart')]), [], '正常释义、不同的词之间不报');
  assert.deepEqual(kinds([row('a', '甲', 'bench'), row('a', '甲', 'bench')]), [], '中文义项相同的不算撞名');
}

// 3. 解包校验
{
  const lx = P.get('la', 'lexicon'), fold = s => String(s).toLowerCase();
  assert.ok(store.fromPack(lx, 'la', fold).records.find(r => r.en), '解包后义项带英文');
  assert.throws(() => store.fromPack({...lx, en: lx.en.slice(1)}, 'la', fold), /invalid pack en/, '对不齐拒收');
  assert.throws(() => store.fromPack({...lx, en: lx.en.map((e, i) => i ? e : '')}, 'la', fold), /invalid pack en/, '空字符串拒收');
  assert.throws(() => store.fromPack({...lx, en: lx.en.map((e, i) => i ? e : ['only'])}, 'la', fold), /invalid pack en/, '数组要两项');
}

// 4. 预设
let presetCount = 0;
for (const lang of LANGS) {
  C.useLangs([lang]);
  for (const w of C.pickPresets(500)) {
    const info = C.presetInfo(w);
    assert.ok(info, lang + ' 预设有释义：' + w);
    if (lang === 'en') assert.equal(info.glossEn, '', '英语预设不给英文释义：' + w);
    else { assert.ok(info.glossEn && !HAN.test(info.glossEn), lang + ' 预设缺英文：' + w); presetCount++; }
  }
}
C.useLangs(['en']);

// 5. 释义钩子
{
  const livre = ['livre', 'n.书|n.磅', 'le|la', ''], love = ['love', 'n.爱|v.爱', '', ''];
  const EN = {书: 'book', 磅: 'pound'};
  assert.equal(C.glossText(livre, null, '书'), '书', '没装钩子原样');
  assert.equal(C.defaultGloss(livre), '书');
  // 中文界面：显示照旧，只装认字用的另一种写法
  C.setGlossText(null, (item, g, sn) => item === love ? '' : EN[sn] || '');
  assert.equal(C.defaultGloss(livre), '书', '中文界面默认释义仍是中文');
  assert.equal(C.savedAutoGloss(livre, 'book'), '书', '英文界面留下的自动释义回到中文界面换成中文');
  assert.equal(C.savedAutoGloss(livre, 'pound'), '磅');
  assert.equal(C.savedAutoGloss(livre, '自己写的'), '自己写的', '认不出的原样保留');
  assert.equal(C.savedAutoGloss(love, ''), '爱', '英文界面留空的英语词回到中文界面给中文');
  // 英文界面
  C.setGlossText((item, g, sn, full) => item === love ? '' : (full ? EN[sn] + ' (full)' : EN[sn]) || '', (item, g, sn) => sn);
  assert.equal(C.defaultGloss(livre), 'book', '英文界面默认释义是英文短写');
  assert.equal(C.glossText(livre, null, '磅', true), 'pound (full)', 'full 给原文');
  assert.equal(C.defaultGloss(love), '', '英语的词留空');
  assert.equal(C.savedAutoGloss(livre, '书'), 'book', '中文界面留下的自动释义换成英文');
  assert.equal(C.savedAutoGloss(livre, 'pound'), 'pound');
  assert.equal(C.savedAutoGloss(love, '爱'), '', '英语的词换成空');
  assert.equal(C.nextGloss('', true, livre).gloss, 'book');
  C.setGlossText(null, null);
  assert.equal(C.defaultGloss(livre), '书', '卸下后恢复原样');
}
assert.deepEqual(sameCardProblems, [], '同词撞名或非释义串没处理完（修掉，或在 review/en-gloss/same-card.tsv 登记并写明理由）');
console.log(`en-gloss ok：五门外语 ${total} 条义项都有英文，${presetCount} 个外语预设有英文命题释义；解包校验、释义钩子通过；${accepted.size} 组有保留理由（其中 ${enSame} 组完整英文也相同），格式串与用法说明 0 条`);
