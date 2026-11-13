// 入场页预设词与文学命题释义：从人工审定的 TSV 生成 app/assets/lang/presets.js。
//   node scripts/build-presets.mjs [TSV 目录] [输出文件]
// 不给目录（或目录里没有某门语言的表）时，那门语言不出表：英语只显示词，其余语言不出预设栏。
// TSV 表头：词  释义  在新词库  最少候选字母  依据  备注。备注含「不可用」的行不收。只收用户审过的表（APPROVED 所指的目录）。
import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
const LANGS = ["en", "fr", "de", "es", "it", "la"];
// 用户审定后的表放在哪：没有这个文件就生成空表（产品里不显示释义，也不出其余语言的预设）。
export const APPROVED = "review/presets-approved.txt";
export function approvedDir() { return fs.existsSync(APPROVED) ? fs.readFileSync(APPROVED, "utf8").trim() : ""; }
export function readTable(dir, lang) {
  const file = path.join(dir, lang + ".tsv");
  if (!dir || !fs.existsSync(file)) return [];
  const rows = fs.readFileSync(file, "utf8").split(/\r?\n/).filter(Boolean).map(l => l.split("\t"));
  assert.deepEqual(rows[0].slice(0, 2), ["词", "释义"], file + " 表头");
  const note = rows[0].indexOf("备注"), out = [], seen = new Set();
  for (const r of rows.slice(1)) {
    if (note >= 0 && /不可用/.test(r[note] || "")) continue;
    const [word, gloss] = r.map(s => (s || "").trim());
    assert.ok(word && /^\p{L}+$/u.test(word.normalize("NFC")), file + " 词：" + word);
    assert.ok(gloss && /^[一-鿿]{1,6}$/.test(gloss), file + " 释义只能是 1～6 个汉字：" + word + " " + gloss);
    assert.ok(!seen.has(word.toLowerCase()), file + " 重复：" + word); seen.add(word.toLowerCase());
    out.push([word.normalize("NFC"), gloss]);
  }
  return out;
}
export function build(dir = approvedDir(), out = "app/assets/lang/presets.js") {
  const table = {};
  for (const l of LANGS) { const t = readTable(dir, l); if (t.length) table[l] = t; }
  const src = dir ? dir.replace(/\\/g, "/") : "（还没有审定的表）";
  fs.writeFileSync(out, `/* 入场页预设词与文学命题释义。由 scripts/build-presets.mjs 从 ${src} 生成，勿手改；表由人工审定。\n   在 core.js 与各语言 rules.js 之后加载：没有表的语言不出预设（英语只显示词）。 */\n(function (root) {\n  "use strict";\n  var T = ${JSON.stringify(table)};\n  Object.keys(T).forEach(function (code) { root.CORE.setPresets(code, T[code]); });\n})(window);\n`);
  return Object.fromEntries(LANGS.map(l => [l, (table[l] || []).length]));
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) console.log(JSON.stringify(build(process.argv[2] === undefined ? approvedDir() : process.argv[2], process.argv[3] || "app/assets/lang/presets.js")));
