// 第三次重建 · 词形段（D5，2026-11-19）：把更正表 scripts/lexicon3/fixes/<语言>.tsv 里「写法 → 另一词头」的行，
// 登记进旧管线已有的词形补登记文件 review/lexicon/<语言>/form-additions.json（scripts/t19/compile.mjs 读它，经 forms.mjs 校验）。
// 只登记漏写重音的写法（faro ← farò → fare，relation=unaccented）。来源词形图里本来就有、只是被过滤掉的（德 lauf → laufen）不登记：
// 德语义项有逐条审过的词形白名单（form_restriction，同形时宁缺勿滥），那是审核决定，不由排名更正表推翻。口语缩写（weißte、haste）不在 D5 范围。已在该词头词形里的、目标词头不在词包里的跳过。可重复运行，不会重复写。
//   node scripts/lexicon3/forms.mjs            预览
//   node scripts/lexicon3/forms.mjs --write    写入
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {shortIds} from '../t19/build-packs.mjs';
const store = createRequire(import.meta.url)('../../app/assets/lexicon-store.js');

// 词包里的义项 ID 是短 ID（批 S1）；补登记文件是生成侧的，仍记原哈希，这里换回去
const hashOf = new Map([...await shortIds()].map(([hash, short]) => [short, hash]));

const LANGS = ['fr', 'de', 'es', 'it'];
const SKIP = new Set(['专名或外语', '功能词当名词', '形容词当名词', '动词当名词']);   // 这几类改的是排名归属，不是词形关系
const key = s => s.normalize('NFC').toLowerCase();
const strip = s => key(s).normalize('NFD').replace(/\p{M}/gu, '').normalize('NFC');
const write = process.argv.includes('--write');

function pack(lang) {
  const got = {};
  globalThis.window = {LANGPACK: {put: (l, k, v) => { got[k] = v; }}};
  for (const f of ['words', 'inflections']) {
    const file = path.resolve('app/assets/lang', lang, f + '.js');
    new Function(fs.readFileSync(file, 'utf8'))();
  }
  return got;
}

for (const lang of LANGS) {
  const fixFile = path.resolve('scripts/lexicon3/fixes', lang + '.tsv');
  if (!fs.existsSync(fixFile)) continue;
  const [head, ...lines] = fs.readFileSync(fixFile, 'utf8').trim().split('\n');
  const cols = head.split('\t');
  const rows = lines.map(l => Object.fromEntries(l.split('\t').map((v, i) => [cols[i], v])));
  const {lexicon, inflections} = pack(lang);
  const formsOf = new Map(inflections.entries.map(row => [lexicon.senses[row[0]][0], new Set(store.rowForms(inflections, row).list)])); // 词形行引用义项下标（批 S1），换回义项 ID 当键
  const stage = JSON.parse(fs.readFileSync(path.resolve('scripts/.cache/v003/stage', lang + '.json'), 'utf8'));
  const edges = stage.form2pos;
  const outFile = path.resolve('review/lexicon', lang, 'form-additions.json');
  const existing = fs.existsSync(outFile) ? JSON.parse(fs.readFileSync(outFile, 'utf8')) : [];
  const have = new Set(existing.map(a => a.sense_id + '|' + a.form));
  const added = [], skipped = [];
  for (const r of rows) {
    const form = r['写法'], target = r['改记给'];
    if (target === '-' || key(target) === key(form) || SKIP.has(r['类别'])) continue;
    const senses = lexicon.senses.filter(s => s[1] === target);
    if (!senses.length) { skipped.push(`${form}→${target}：目标不在词包`); continue; }
    const pos = senses.some(s => s[2] === 'verb') ? 'verb' : senses[0][2];
    if (senses.some(s => formsOf.get(s[0])?.has(form))) continue;   // 已是该词头的词形
    // 复审 R3-2：写法本身是已收词头（意 faro 灯塔）时不登记，否则打 faro 会被排名高的 fare 抢走卡面
    if (lexicon.senses.some(s => key(s[1]) === form)) { skipped.push(`${form}→${target}：${form} 本身是已收词头`); continue; }
    const pair = key(target) + '|' + pos;
    const direct = (edges[form] || []).map(key).includes(pair);
    const accented = Object.keys(edges).filter(g => g !== form && strip(g) === form && edges[g].map(key).includes(pair));
    if (!accented.length) { skipped.push(`${form}→${target}：${direct ? '来源词形图里已有，被审核白名单过滤，不推翻' : '不是去重音写法'}`); continue; }
    for (const s of senses.filter(s => s[2] === pos)) {
      const hash = hashOf.get(s[0]);
      if (!hash) throw new Error(`${lang} ${s[1]}：词包的短 ID ${s[0]} 对不上编译包，先重跑 npm run packs`);
      if (formsOf.get(s[0])?.has(form) || have.has(hash + '|' + form)) continue;
      added.push({
        sense_id: hash, lemma: target, pos, form,
        relation: 'unaccented',
        source: 'scripts/lexicon3/fixes/' + lang + '.tsv',
        evidence: `字幕漏写重音：${accented.join('、')} 去掉重音即 ${form}；第三次重建更正表（D5，用户 11-19 定）：${r['说明']}`,
        reviewer: 'Claude 第三次重建 D5 生成（2026-11-19），待复审',
      });
    }
  }
  console.log(lang, '新登记', added.map(a => a.form + '→' + a.lemma).join(' ') || '无', skipped.length ? '｜跳过：' + skipped.join('；') : '');
  if (write && added.length) fs.writeFileSync(outFile, JSON.stringify(existing.concat(added), null, 2) + '\n');
}
