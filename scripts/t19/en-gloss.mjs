// v00.04.00 批 2：给五门外语的每条进包义项配英文释义（英文界面用），写 review/en-gloss/<语言>.tsv。
//   node --max-old-space-size=12000 scripts/t19/en-gloss.mjs [语言...]
// 依据（用户 2026-11-21 定，见 plans/v00.04.00/PLAN.md 批 2）：
//   1. 英文取 kaikki 抽取（scripts/.cache/v003/stage3/<语言>.json）里这个词、这个词性的英文 gloss，原文照抄，不改写。
//      义项记录的 evidence.source_records 存了核义时读的那条记录的，以它为准。
//   2. 只有一条 gloss → 直接用（single）；多条 → 用 ECDICT 把每条译回中文，恰好一条命中这条义项中文的用它（ecdict）。
//   3. 其余要人挑：review/en-gloss/picks/<语言>.tsv 一行一条（sense_id、方式、英文、备注），优先于自动结果：
//      pick = 从候选 gloss 里挑的（英文必须与某条候选逐字相同）；dict:<词典> = 外部词典查到的（只许 DICTS 里列的，见下）；mt = Claude 把中文义项译成英文（机翻）。
//   4. 还没着落的写进 scripts/.cache/en-gloss/pending-<语言>.json（被忽略的缓存），供挑选。
//   5. V0400-A5 的逐义裁决在 repairs.tsv。可替换完整英文、单独修正卡面短写，或仅记录保留理由。
// 英语的词一般不给释义（用户定），人名不给。例外（真机第一轮 D6，用户 2026-11-21 定）：英语的专业、历史文化词（EN_MORE 三类）给英文，
// 只取 picks/en.tsv（Claude 按中文义项写，标 mt），不走候选池与回译；英语的其余义项不进 en.tsv。输出列：sense_id display pos zh en short method；short 是卡面短写（机器裁剪），与 en 相同时留空。
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {loadEcdict} from '../lexicon/zh.mjs';
import {DEFAULT_COMPILED} from './build-packs.mjs';

const require = createRequire(import.meta.url);
const store = require('../../app/assets/lexicon-store.js');
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const OUT = path.join(ROOT, 'review/en-gloss');
const PENDING = path.join(ROOT, 'scripts/.cache/en-gloss');
export const LANGS = ['fr', 'de', 'es', 'it', 'la'];
export const EN_MORE = ['professional-humanities', 'professional-natural', 'historical-cultural']; // 英语只有这三类给英文（D6）
export const COLUMNS = ['sense_id', 'display', 'pos', 'zh', 'en', 'short', 'method'];
// 补充词典只许许可能并进 CC BY-SA 4.0 词包的（V0400-A6）：现在只有 FreeDict 意英（CC BY-SA 3.0）。GPL 的 Ding、FreeDict 法西拉英不得再用
const DICTS = ['freedict-ita-eng'];
const METHOD = new RegExp('^(single|ecdict|pick|mt|dict:(' + DICTS.join('|') + '))$');
// 每本补充词典只许用在它自己那门语言上（复审：德语行标成意英词典以前拦不住）
const DICT_LANG = {'freedict-ita-eng': 'it'};
export const methodOk = (lang, method) => METHOD.test(method) && (!method.startsWith('dict:') || DICT_LANG[method.slice(5)] === lang);

const fold = s => String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ß/g, 'ss').replace(/œ/g, 'oe').replace(/æ/g, 'ae');
const clean = s => String(s).replace(/[\t\r\n]+/g, ' ').trim();

// 词典来源仍按原文校验，只有释义显示去掉不区分义项的编辑注。
export function stripEditorialNote(en) {
  return en.replace(/\s*\((?:all (?:biological )?(?:meanings|senses)|in all senses|in most of its senses|various meanings)\)/gi, '').trim();
}

// 卡面短写（用户定：机器裁剪）：去括注，取第一个分号、逗号前的一段，去掉打头的 a / an / the。裁空了就用原文。
export function shortOf(en) {
  let s = String(en).replace(/\s*\([^()]*\)/g, '').replace(/\s*\[[^\]]*\]/g, '');
  s = s.split(/\s*[;,]\s*/)[0].replace(/\.$/, '').replace(/^(a|an|the)\s+/i, '').replace(/\s+/g, ' ').trim();
  return s || clean(en);
}

const zhKey = z => z.replace(/（[^）]*）|\([^)]*\)/g, '').trim();
function ecdictZh(ec, gloss) {
  const out = new Set();
  const parts = gloss.replace(/\([^)]*\)/g, ' ').split(/[;,.]/).map(s => s.trim().toLowerCase()
    .replace(/^(to|a|an|the|one's|someone's)\s+/, '').replace(/^(to|a|an|the)\s+/, '').trim()).filter(Boolean);
  for (const p of parts) { const hit = ec.get(p); if (hit) for (const list of Object.values(hit)) for (const z of list) out.add(z); }
  return out;
}
const hits = (zh, set) => { for (const z of set) if (z === zh || (zh.length >= 2 && z.length >= 2 && (z.includes(zh) || zh.includes(z)))) return true; return false; };

export function readTable(file) {
  if (!fs.existsSync(file)) return [];
  const [head, ...lines] = fs.readFileSync(file, 'utf8').replace(/\n+$/, '').split('\n');
  const cols = head.split('\t');
  return lines.filter(Boolean).map((line, i) => {
    const cells = line.split('\t'); assert.equal(cells.length, cols.length, `${file} 第 ${i + 2} 行列数不对`);
    return Object.fromEntries(cols.map((c, j) => [c, cells[j]]));
  });
}

// 同词撞名扫描（V0400-A5 复审时发现，用户 2026-11-21 定加进自检；同日复审 A7 返工后补了后三类）。一门语言的成品表里找五类：
//   clash = 同一个词、同一词性，几个中文义项不同，卡面上的英文（短写，没有短写取完整英文）却相同——自动对齐把一条英文配给了这个词的所有义项；
//   near  = 同上，但卡面只差冠词、to、介词、括注、单复数或大小写（a truth 与 truth、to travel by vehicle 与 to travel in a vehicle），卡上实际分不开；
//   en    = 同上，卡面不同而完整英文一字不差——义项栏的两个按钮会一模一样；
//   form  = 卡面短写或完整英文是词典的格式串（synonym of …、post-1990 spelling of … 之类），不是释义；
//   usage = 卡面短写或完整英文是词典的用法说明（Used as …、only used in …），或卡面整个是括注，不是释义。
// 返回 [{lang, display, pos, kind, card, zh}]，zh 是这一组的中文义项（排序后用「／」连）；near 的 card 是这一组的几种卡面，排序后用「 ≈ 」连。裁定结果记在 same-card.tsv。
const LEAD = String.raw`^(\([^)]*\)\s*)?`;   // 前面可以带一段括注
const FORM_OF = new RegExp(LEAD + String.raw`(synonym|alternative (form|spelling)|plural|feminine( singular)?|masculine|(syllabic )?abbreviation|obsolete (form|spelling)|superseded spelling|(post|pre)-\d+ spelling|misspelling|diminutive|augmentative|female equivalent|agent noun|clipping|ellipsis|initialism|contraction|combined form|compound|short form|apocopic form|inflection) of\b`, 'i');
const USAGE = new RegExp(LEAD + String.raw`(used (as|in|with|for|when|other|only|to (indicate|express|form|denote|show|refer|describe|address|mark|introduce|emphasi[sz]e))|only used|found only|indicat(es|ing)|express(es|ing)|(a )?form of address)\b`, 'i');
const NEAR_SKIP = new Set(['a', 'an', 'the', 'to', 'of', 'by', 'in', 'on', 'at', 'for', 'with', 'or', 'and']);
const nearKey = card => card.toLowerCase().replace(/\([^)]*\)/g, ' ').split(/[^a-z0-9']+/).filter(w => w && !NEAR_SKIP.has(w)).map(w => w.length > 3 && /[^s]s$/.test(w) ? w.slice(0, -1) : w).join(' ');
export function sameCard(lang, rows) {
  const out = [], by = {clash: new Map(), near: new Map(), en: new Map()};
  const put = (kind, r, k) => { const key = [r.display, r.pos, k].join('\t'); if (!by[kind].has(key)) by[kind].set(key, []); by[kind].get(key).push(r); };
  for (const r of rows) {
    const card = r.short || r.en, hit = g => ({lang, display: r.display, pos: r.pos, kind: g, card, zh: r.zh});
    if (FORM_OF.test(card) || FORM_OF.test(r.en)) out.push(hit('form'));
    else if (USAGE.test(card) || USAGE.test(r.en) || !card.replace(/\([^)]*\)/g, '').trim()) out.push(hit('usage'));
    put('clash', r, card.toLowerCase());
    if (nearKey(card)) put('near', r, nearKey(card));
    put('en', r, r.en.toLowerCase());
  }
  for (const kind of ['clash', 'near', 'en']) for (const [key, list] of by[kind]) {
    const zh = [...new Set(list.map(r => r.zh))].sort(), cards = [...new Set(list.map(r => (r.short || r.en).toLowerCase()))].sort();
    if (zh.length < 2 || (kind !== 'clash' && cards.length < 2)) continue;   // 卡面全同的归 clash，不重复报
    const [display, pos, card] = key.split('\t');
    out.push({lang, display, pos, kind, card: kind === 'near' ? cards.join(' ≈ ') : card, zh: zh.join('／')});
  }
  return out;
}
export const SAME_CARD = path.join(OUT, 'same-card.tsv');
export const sameCardKey = g => [g.lang, g.display, g.pos, g.kind, g.card, g.zh].join('\t');

export function readRepairs(file = path.join(OUT, 'repairs.tsv')) {
  assert.ok(fs.existsSync(file), `找不到英文返工表：${file}`);
  const languages = new Map([...LANGS, 'en'].map(lang => [lang, new Map()]));
  for (const row of readTable(file)) {
    const {lang, sense_id: id, method, en, short, note} = row;
    const entries = languages.get(lang);
    assert.ok(entries && id && clean(note), `英文返工缺语种、义项或依据：${lang} ${id}`);
    assert.ok(!entries.has(id), `英文返工义项重复：${lang} ${id}`);
    assert.ok(en ? methodOk(lang, method) && !['single', 'ecdict'].includes(method) : method === '', `英文返工来源不对：${lang} ${id}`);
    assert.equal(clean(en), en, `英文返工原文格式不对：${lang} ${id}`);
    assert.equal(clean(short), short, `英文返工短写格式不对：${lang} ${id}`);
    entries.set(id, row);
  }
  return languages;
}

async function readCompiled(lang) {
  const read = async f => { const b = fs.readFileSync(f); return {value: JSON.parse(b), sha256: crypto.createHash('sha256').update(b).digest('hex')}; };
  return store.load(path.join(ROOT, DEFAULT_COMPILED), lang, read);
}

async function run(langs) {
  const ec = loadEcdict(path.join(ROOT, 'scripts/.cache/ecdict.csv')).map;
  const repairs = readRepairs();
  fs.mkdirSync(OUT, {recursive: true}); fs.mkdirSync(PENDING, {recursive: true});
  for (const lang of langs) {
    if (lang === 'en') { writeEnglish(await readCompiled('en'), repairs.get('en')); continue; }
    const st = JSON.parse(fs.readFileSync(path.join(ROOT, 'scripts/.cache/v003/stage3', lang + '.json'), 'utf8'));
    const idx = new Map();
    for (const r of st.lemmas) for (const k of new Set([fold(r.w), ...(r.canon || []).map(fold)])) {
      const key = k + '\t' + r.pos; if (!idx.has(key)) idx.set(key, []); idx.get(key).push(r);
    }
    const recs = await readCompiled(lang);
    const picks = new Map(readTable(path.join(OUT, 'picks', lang + '.tsv')).map(p => [p.sense_id, p]));
    const seen = new Set(), seenRepairs = new Set(), rows = [], pending = [], count = {};
    const fixes = repairs.get(lang);
    const byWord = new Map();
    for (const r of recs) { const k = r.display + '\t' + r.pos; if (!byWord.has(k)) byWord.set(k, []); byWord.get(k).push(r.zh); }
    for (const r of recs) {
      if (r.category === 'names') continue;
      const srcG = (r.evidence.source_records || []).flatMap(s => (s.record && s.record.gl || []).map(g => clean(g.g)));
      const pool = [...new Set(srcG.length ? srcG : (idx.get(fold(r.display) + '\t' + r.pos) || []).flatMap(x => x.gl.map(g => clean(g.g))))].filter(Boolean);
      let en = '', method = '';
      const fix = fixes.get(r.sense_id);
      if (fix) seenRepairs.add(r.sense_id);
      const originalPick = picks.get(r.sense_id);
      if (originalPick) seen.add(r.sense_id);
      for (const p of [originalPick, fix?.en ? fix : null]) {
        if (!p) continue;
        assert.ok(methodOk(lang, p.method) && !['single', 'ecdict'].includes(p.method), `${lang} ${r.sense_id} 方式不对：${p.method}`);
        assert.ok(clean(p.en), `${lang} ${r.sense_id} 英文为空`);
        if (p.method === 'pick') assert.ok(pool.includes(clean(p.en)), `${lang} ${r.display}「${r.zh}」挑的英文不在候选里：${p.en}`);
        en = clean(p.en); method = p.method;
      }
      if (!en) {
        if (pool.length === 1) { en = pool[0]; method = 'single'; }
        else if (pool.length > 1) {
          const z = zhKey(r.zh), hit = pool.filter(g => hits(z, ecdictZh(ec, g)));
          if (hit.length === 1) { en = hit[0]; method = 'ecdict'; }
        }
      }
      count[method || 'pending'] = (count[method || 'pending'] || 0) + 1;
      if (!en) { pending.push({sense_id: r.sense_id, display: r.display, pos: r.pos, zh: r.zh, siblings: byWord.get(r.display + '\t' + r.pos).filter(z => z !== r.zh), candidates: pool}); continue; }
      en = stripEditorialNote(en);
      assert.ok(en, `${lang} ${r.sense_id} 去掉词典编辑注后没有释义`);
      const short = fix?.short ? stripEditorialNote(fix.short) : shortOf(en);
      assert.ok(short.length <= en.length, `${lang} ${r.display}「${r.zh}」短写比完整英文长`);
      rows.push([r.sense_id, r.display, r.pos, r.zh, en, short === en ? '' : short, method]);
    }
    const stale = [...picks.keys()].filter(id => !seen.has(id));
    assert.deepEqual(stale, [], `${lang} 补充表里有词库已没有的义项：${stale.slice(0, 5).join(' ')}`);
    const staleRepairs = [...fixes.keys()].filter(id => !seenRepairs.has(id));
    assert.deepEqual(staleRepairs, [], `${lang} 返工表里有词库已没有的义项：${staleRepairs.slice(0, 5).join(' ')}`);
    rows.sort((a, b) => a[1].localeCompare(b[1]) || a[2].localeCompare(b[2]) || a[0].localeCompare(b[0]));
    for (const row of rows) for (const cell of row) assert.ok(!/[\t\n]/.test(cell), '单元格含制表符或换行');
    fs.writeFileSync(path.join(OUT, lang + '.tsv'), COLUMNS.join('\t') + '\n' + rows.map(r => r.join('\t')).join('\n') + '\n');
    fs.writeFileSync(path.join(PENDING, 'pending-' + lang + '.json'), JSON.stringify(pending, null, 1));
    console.log(lang, JSON.stringify(count), '待挑', pending.length);
  }
}

// 英语（D6）：只给专业、历史文化三类，每条都必须在 picks/en.tsv 里，且只许 mt；返工表照样可改
function writeEnglish(recs, fixes) {
  const picks = new Map(readTable(path.join(OUT, 'picks', 'en.tsv')).map(p => [p.sense_id, p]));
  const rows = [], seen = new Set();
  for (const r of recs) {
    if (!EN_MORE.includes(r.category)) continue;
    const p = picks.get(r.sense_id), fix = fixes.get(r.sense_id);
    assert.ok(p, `en ${r.display}「${r.zh}」是专业或历史文化词，picks/en.tsv 里没有英文`);
    seen.add(r.sense_id);
    const src = fix?.en ? fix : p;
    assert.ok(['mt', 'pick'].includes(src.method) && clean(src.en), `en ${r.sense_id} 方式或英文不对：${src.method}`);
    const en = clean(src.en), short = fix?.short ? clean(fix.short) : shortOf(en);
    assert.ok(short.length <= en.length, `en ${r.display}「${r.zh}」短写比完整英文长`);
    rows.push([r.sense_id, r.display, r.pos, r.zh, en, short === en ? '' : short, src.method]);
  }
  const stale = [...picks.keys()].filter(id => !seen.has(id));
  assert.deepEqual(stale, [], `en 补充表里有不是专业或历史文化词、或词库已没有的义项：${stale.slice(0, 5).join(' ')}`);
  rows.sort((a, b) => a[1].localeCompare(b[1]) || a[2].localeCompare(b[2]) || a[0].localeCompare(b[0]));
  for (const row of rows) for (const cell of row) assert.ok(!/[\t\n]/.test(cell), '单元格含制表符或换行');
  fs.writeFileSync(path.join(OUT, 'en.tsv'), COLUMNS.join('\t') + '\n' + rows.map(r => r.join('\t')).join('\n') + '\n');
  console.log('en', rows.length, '条（专业、历史文化词）');
}

if (import.meta.url === `file://${process.argv[1]}`) await run(process.argv.slice(2).length ? process.argv.slice(2) : [...LANGS, 'en']);
