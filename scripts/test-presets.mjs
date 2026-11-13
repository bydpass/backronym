// 入场页预设词与文学命题释义：生成产物没被手改；表经 CORE.setPresets 进产品；每门语言各存各的；有审定的表时，表里的每个词都填得了。
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import vm from "node:vm";
import { build, approvedDir, readTable } from "./build-presets.mjs";
const LANGS = ["en", "fr", "de", "es", "it", "la"];
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "presets-"));
// 1. 重新生成与包内文件相同
build(approvedDir(), path.join(tmp, "presets.js"));
assert.equal(fs.readFileSync(path.join(tmp, "presets.js"), "utf8"), fs.readFileSync("app/assets/lang/presets.js", "utf8"), "presets.js 与重新生成的结果不一致：重跑 node scripts/build-presets.mjs");
// 2. 按产品的加载顺序装入
function load(presetsFile) {
  const env = { window: {}, setTimeout, clearTimeout }; vm.createContext(env);
  const run = f => vm.runInContext(fs.readFileSync(f, "utf8"), env, { filename: f });
  run("app/assets/lang/en/words.js"); run("app/assets/block/core.js"); run("app/assets/lang/en/block.js"); run("app/assets/core.js"); run("app/assets/lang/packs.js");
  for (const l of LANGS.slice(1)) { run(`app/assets/lang/${l}/rules.js`); run(`app/assets/lang/${l}/block.js`); run(`app/assets/lang/${l}/words.js`); }
  run(presetsFile);
  return env.window;
}
// 3. 机制：用一张临时小表验证（不依赖表是否已审定）
{
  const dir = path.join(tmp, "fx"); fs.mkdirSync(dir);
  fs.writeFileSync(path.join(dir, "en.tsv"), "词\t释义\t在新词库\t最少候选字母\t依据\t备注\ndark\t黑暗\t是\td=9\t\t\nlife\t人生\t是\tl=9\t\t\n");
  fs.writeFileSync(path.join(dir, "fr.tsv"), "词\t释义\t在新词库\t最少候选字母\t依据\t备注\nmémoire\t记忆\t是\tm=9\t\t\nexil\t流亡\t是\tx=0\t\t不可用：X 没有候选\n");
  assert.deepEqual(build(dir, path.join(tmp, "fx.js")), { en: 2, fr: 1, de: 0, es: 0, it: 0, la: 0 }, "备注含「不可用」的行不收");
  const w = load(path.join(tmp, "fx.js")), C = w.CORE;
  assert.equal(C.pickPresets(6).length, 6, "英语的词仍是固定的 60 个"); assert.equal(C.LANG.presetGloss[C.LANG.fold("DARK")], "黑暗");
  assert.ok(C.useLang("fr")); assert.deepEqual(Array.from(C.pickPresets(6)), ["MÉMOIRE"], "法语的词取自表，按格字母写法给出");
  assert.equal(C.LANG.presetGloss[C.LANG.fold("MÉMOIRE")], "记忆", "释义按界面的查法（fold 后的格字母）能取到");
  assert.ok(C.useLang("de")); assert.equal(C.pickPresets(6).length, 0, "没有表的语言不出预设"); assert.equal(Object.keys(C.LANG.presetGloss).length, 0, "不沿用英语的释义");
  for (const bad of ["词\t释义\nmot\tn.词\n", "词\t释义\nmot\t词，语\n", "词\t释义\nmot\t词\nMot\t话\n", "词\t释义\nle mot\t词\n"]) { fs.writeFileSync(path.join(dir, "it.tsv"), bad); assert.throws(() => readTable(dir, "it"), "不合格的表被拒绝：" + JSON.stringify(bad)); }
}
// 4. 包内的表（审定后才有内容）：英语的词与 CORE.PRESETS 一致；每个词每一格都有默认候选；释义都取得到
const W = load("app/assets/lang/presets.js"), C = W.CORE, dir = approvedDir();
let total = 0;
for (const l of LANGS) {
  const table = dir ? readTable(dir, l) : []; assert.ok(C.useLang(l));
  if (!table.length) { if (l !== "en") assert.equal(C.pickPresets(6).length, 0, l + " 没有审定的表：不出预设"); continue; }
  if (l === "en") assert.deepEqual(table.map(r => r[0]).sort(), [...C.PRESETS].sort(), "英语的词与 CORE.PRESETS 一致");
  else assert.ok(table.length >= 30, l + " 预设词太少");
  const words = W.LANGPACK.get(l, "words");
  for (const [word, gloss] of table) {
    const cells = C.LANG.letters(word); assert.ok(cells.length >= 2 && cells.length <= 10, l + " " + word + " 格数");
    assert.equal(C.LANG.presetGloss[C.LANG.fold(cells)], gloss, l + " " + word + " 释义取得到");
    for (const ch of cells) assert.ok(C.candidates(words, ch, C.LANG.fold(ch)).length > 0, `${l} ${word}：${ch} 格没有默认候选`);
    assert.ok(!C.blocked(word), l + " " + word + " 被屏蔽");
    total++;
  }
  assert.equal(C.pickPresets(6).length, 6);
}
fs.rmSync(tmp, { recursive: true });
console.log(dir ? `presets ok: 审定的表 ${dir}，${total} 个预设词的释义与可填性通过` : "presets ok: 机制通过；还没有审定的释义表（presets.js 为空表）");
