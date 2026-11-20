// 从固定的旧管线词包提取当前准入词已有的排序和断词数据。正常打包只读提取好的 JSON。
// node scripts/t19/pack-ranks.mjs <编译包目录> <新词频文件> [新断词文件]
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {legacyDir} from '../legacy-packs.mjs';

const [compiled, out, hyphOut] = process.argv.slice(2);
assert.ok(compiled && out, '需要编译包目录与新的输出路径');
assert.ok(!fs.existsSync(out), '词频输出已存在');
if (hyphOut) assert.ok(!fs.existsSync(hyphOut) && path.resolve(hyphOut) !== path.resolve(out), '断词输出需要单独的新路径');

const ranks = {}, hyphenation = {};
const dir = legacyDir();
for (const lang of ['en', 'fr', 'de', 'es', 'it', 'la']) {
  const parts = {}, w = {LANGPACK: {put(language, key, value) { parts[key] = value; }}};
  new Function('window', fs.readFileSync(path.join(dir, lang, 'words.js'), 'utf8'))(w);
  const words = lang === 'en' ? w.WORDS : parts.words;
  const scores = parts.formRanks;
  assert.ok(words && (lang === 'en' || scores), lang + ' 缺少旧词频来源');
  const old = new Map();
  for (const list of Object.values(words)) {
    list.forEach(([word], index) => old.set(word, scores ? scores[word] || 0 : list.length - index));
  }

  const kept = new Map(), shown = new Set();
  const langDir = path.join(compiled, lang);
  for (const file of fs.readdirSync(langDir)) {
    for (const row of JSON.parse(fs.readFileSync(path.join(langDir, file), 'utf8')).records) {
      const display = row.metadata.display, lower = display.toLowerCase();
      shown.add(lower);
      const rank = old.has(display) ? old.get(display) : old.get(lower);
      if (rank) kept.set(display, rank);
    }
  }
  ranks[lang] = Object.fromEntries([...kept].sort(([a], [b]) => a.localeCompare(b)));
  const points = w.HYPH || parts.hyph || {};
  hyphenation[lang] = Object.fromEntries(Object.entries(points).filter(([key]) => shown.has(key.toLowerCase())).sort());
}
fs.writeFileSync(out, JSON.stringify(ranks).replace(/("(?:en|fr|de|es|it|la)":)/g, '\n$1') + '\n', {flag: 'wx'});
if (hyphOut) fs.writeFileSync(hyphOut, JSON.stringify(hyphenation, null, 2) + '\n', {flag: 'wx'});
console.log(Object.entries(ranks).map(([lang, rows]) => lang + ':' + Object.keys(rows).length).join(' '));
