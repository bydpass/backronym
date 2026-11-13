// 独立 Ding 词典的全量单词候选普查；不把单词数量当成用户覆盖率。
// 用法：node scripts/lexicon/census-de.mjs <输出目录> [words.js]
// 不改词库；输出 gzip TSV，保留全部候选（包括专名、术语、变形和屏蔽词）供复审。
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import vm from 'node:vm';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const output = process.argv[2];
if (!output) throw new Error('需要独立输出目录');
const wordsFile = process.argv[3] || path.join(root, 'app/assets/lang/de/words.js');
const stage = JSON.parse(fs.readFileSync(path.join(root, 'scripts/.cache/v003/stage/de.json'), 'utf8'));
const stageWords = new Set(stage.lemmas.map(r => r.w));
const names = new Set(stage.names);
const source = zlib.gunzipSync(fs.readFileSync(path.join(root, 'scripts/.cache/v003/ding/de-en.txt.gz'))).toString('utf8');
const candidates = new Map();
source.split('\n').forEach((line, i) => {
  if (line.startsWith('#') || !line.includes(' :: ')) return;
  const [left, right] = line.split(' :: ');
  // 只认第一组（后续 | 通常是复数或例句），去标注后仍必须是一个纯字母词。
  for (const part of left.split(' | ')[0].split(';')) {
    const w = part.replace(/\([^)]*\)|\[[^\]]*\]|\{[^}]*\}|<[^>]*>/g, '').trim();
    if (!/^[A-Za-zÄÖÜäöüß]+$/.test(w)) continue;
    const old = candidates.get(w);
    if (old) { old.lines.push(i + 1); continue; }
    candidates.set(w, { lines: [i + 1], en: right.split(' | ')[0].slice(0, 300) });
  }
});
const env = { window: {}, setTimeout, clearTimeout };
vm.createContext(env);
for (const f of ['block/core.js', 'core.js', 'lang/packs.js', 'lang/de/rules.js', 'lang/de/block.js'])
  vm.runInContext(fs.readFileSync(path.join(root, 'app/assets', f), 'utf8'), env);
vm.runInContext(fs.readFileSync(wordsFile, 'utf8'), env);
const { CORE, LANGPACK } = env.window;
CORE.useLang('de');
const words = LANGPACK.get('de', 'words'), forms = LANGPACK.get('de', 'forms');
const stats = {}, lines = ['词\t查询状态\t原形或命中写法\t释义\t源数据位置\tDing行号\t英文参考（首条，非选义结论）'];
for (const [w, evidence] of candidates) {
  const direct = CORE.lookupEntry(words, null, w);
  const form = direct ? null : CORE.formEntry(words, forms, w);
  const result = direct || form;
  const status = CORE.blocked(w) ? '被屏蔽' : direct ? '原形可查' : form ? '变形可查' : '查不到';
  stats[status] = (stats[status] || 0) + 1;
  const where = stageWords.has(w) ? '中间原形有记录' : names.has(w.toLowerCase()) ? '中间专名有记录' : '中间原形无同显示记录';
  lines.push([w, status, result?.[0] || '', result?.[1] || '', where, evidence.lines.join(','), evidence.en]
    .map(v => String(v).replace(/[\t\r\n]/g, ' ')).join('\t'));
}
fs.mkdirSync(output, { recursive: true });
// 不覆盖之前的普查。
fs.writeFileSync(path.join(output, 'census.tsv.gz'), zlib.gzipSync(lines.join('\n') + '\n'), { flag: 'wx' });
const summary = { sourceVersion: source.split('\n')[0], candidates: candidates.size, stats,
  method: 'Ding 第一组纯字母候选；运行端 lookupEntry / formEntry / blocked 全量查询。未逐条核对语义；查不到含专名、旧拼写、术语等，不等同应补词数。', wordsFile,
  wordsSha256: crypto.createHash('sha256').update(fs.readFileSync(wordsFile)).digest('hex') };
fs.writeFileSync(path.join(output, 'census.json'), JSON.stringify(summary, null, 2) + '\n', { flag: 'wx' });
console.log(JSON.stringify(summary, null, 2));
