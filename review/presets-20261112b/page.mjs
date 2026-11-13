// 预设词释义表（草稿）→ 审阅页。按产品的加载方式逐词复核：每一格都有默认候选、不被屏蔽、格数合适、释义取得到。
//   node review/presets-20261112b/page.mjs
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import vm from "node:vm";
import { build, readTable } from "../../scripts/build-presets.mjs";
const DIR = "review/presets-20261112b", OUT = "plans/v00.03.00/presets-review.html";
const LANGS = ["en", "fr", "de", "es", "it", "la"], NAME = { en: "英语", fr: "法语", de: "德语", es: "西班牙语", it: "意大利语", la: "拉丁语" };
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "presets-page-")), js = path.join(tmp, "presets.js");
build(DIR, js);
const env = { window: {}, setTimeout, clearTimeout }; vm.createContext(env);
const run = f => vm.runInContext(fs.readFileSync(f, "utf8"), env, { filename: f });
run("app/assets/lang/en/words.js"); run("app/assets/block/core.js"); run("app/assets/lang/en/block.js"); run("app/assets/core.js"); run("app/assets/lang/packs.js");
for (const l of LANGS.slice(1)) { run(`app/assets/lang/${l}/rules.js`); run(`app/assets/lang/${l}/block.js`); run(`app/assets/lang/${l}/words.js`); }
run(js);
const W = env.window, C = W.CORE, esc = s => String(s).replace(/[&<>]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
let html = "", total = 0; const sum = [];
for (const l of LANGS) {
  assert.ok(C.useLang(l));
  const table = readTable(DIR, l), raw = fs.readFileSync(path.join(DIR, l + ".tsv"), "utf8").split(/\r?\n/).filter(Boolean).map(r => r.split("\t")), head = raw[0], notes = new Map(raw.slice(1).map(r => [r[0].normalize("NFC"), r]));
  if (l === "en") assert.deepEqual(table.map(r => r[0]).sort(), [...C.PRESETS].sort(), "英语的词与产品里固定的 60 个一致");
  const words = W.LANGPACK.get(l, "words"); let rows = "", tight = 99;
  for (const [word, gloss] of table) {
    const cells = C.LANG.letters(word); assert.ok(cells.length >= 2 && cells.length <= 10, l + " " + word + " 格数");
    assert.equal(C.LANG.presetGloss[C.LANG.fold(cells)], gloss, l + " " + word); assert.ok(!C.blocked(word), l + " " + word + " 被屏蔽");
    let min = null; for (const ch of cells) { const n = C.candidates(words, ch, C.LANG.fold(ch)).length; assert.ok(n > 0, `${l} ${word}：${ch} 格没有默认候选`); if (!min || n < min[1]) min = [ch, n]; }
    tight = Math.min(tight, min[1]);
    const r = notes.get(word), note = (r[head.indexOf("备注")] || "").replace(/^来自第[一二]版[；;]?/, "").trim(), basis = r[head.indexOf("依据")] || "";
    rows += `<tr${min[1] < 5 ? ' class="low"' : ""}><td>${esc(word)}</td><td class="g">${esc(gloss)}</td><td class="n">${esc(min[0])} = ${min[1]}</td><td class="note">${esc(note)}${note && basis ? "<br>" : ""}<span class="b">${esc(basis)}</span></td></tr>`;
    total++;
  }
  sum.push(`${NAME[l]} ${table.length}`);
  html += `<h2 id="${l}">${NAME[l]}<small>${table.length} 个词；最吃紧的一格有 ${tight} 个候选</small></h2><div class="tw"><table><thead><tr><th>词</th><th>释义</th><th>最吃紧的一格<br>（字母 = 候选数）</th><th>说明与依据</th></tr></thead><tbody>${rows}</tbody></table></div>`;
}
fs.rmSync(tmp, { recursive: true });
const css = `body{margin:0;background:#f3f2ee;color:#1c1c1b;font:15px/1.6 -apple-system,"PingFang SC","Noto Sans SC",sans-serif}main{max-width:980px;margin:0 auto;padding:24px 16px 80px}h1{font-size:26px;margin:0 0 6px}h2{font-size:19px;margin:36px 0 8px;padding-top:10px;border-top:3px solid #1c1c1b}h2 small{font-weight:400;font-size:13px;color:#5f5d58;margin-left:8px}.lead{color:#5f5d58;max-width:48em}nav{position:sticky;top:0;background:#f3f2ee;padding:8px 0;border-bottom:1px solid #d3d1cc;display:flex;gap:16px;font-weight:700;font-size:14px;flex-wrap:wrap}nav a{color:#1c1c1b;text-decoration:none}.tw{overflow-x:auto}table{border-collapse:collapse;width:100%;min-width:560px;font-size:14px}th,td{padding:5px 10px;border-bottom:1px solid #d3d1cc;text-align:left;vertical-align:top}th{font-weight:400;font-size:12.5px;color:#5f5d58;border-bottom:2px solid #1c1c1b}td.g{font-weight:700;white-space:nowrap}td.n{font-variant-numeric:tabular-nums;white-space:nowrap}td.note{font-size:12.5px;color:#5f5d58}.b{opacity:.75}tr.low td.n{color:#b0301c;font-weight:700}.legend{font-size:13px;color:#5f5d58}.box{border:1px solid #d3d1cc;padding:10px 14px;margin:14px 0;max-width:48em;font-size:14px}
@media (prefers-color-scheme:dark){body,nav{background:#121211;color:#e7e5e0}h2{border-color:#e7e5e0}th{border-color:#e7e5e0}td,th,nav,.box{border-color:#34322f}nav a{color:#e7e5e0}.lead,.legend,td.note,th,h2 small{color:#a5a29b}tr.low td.n{color:#ff8a70}}`;
fs.writeFileSync(OUT, `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>预设词释义表 · 已审定</title><style>${css}</style></head><body><main>
<h1>预设词释义表 · 已审定</h1>
<p class="lead">入场页的预设词会显示成「原词 - 中文释义」。用户 2026-11-12 审定（life 一类的词显示「生命」，其余照批），已生成进产品。六门语言共 ${total} 个词（${sum.join("、")}）。按交付62的词库重做：英语是产品里固定的 60 个词；其余五门优先用最早一版的自然选词，现在这些词都在词库里了。</p>
<div class="box"><b>「最吃紧的一格」是什么意思</b><br>选了一个预设词，用户要给它的每个字母各填一个词。这一列写的是其中候选最少的那一格：比如 <i>i = 13</i> 表示这个词里 i 那一格最难填，默认候选有 13 个词可选。数字越小越容易卡住，少于 5 个的标红（现在没有）。每个词的每一格都至少有 1 个候选，这一点脚本逐词验过。</div>
<p class="legend">以后要删、要换、要改释义：改 TSV 后运行 node scripts/build-presets.mjs，再重出字体。</p>
<nav>${LANGS.map(l => `<a href="#${l}">${NAME[l]}</a>`).join("")}</nav>
${html}
</main></body></html>
`);
console.log(`审阅页 ${OUT}：${total} 个词（${sum.join("、")}），逐词可填、未被屏蔽、释义可取。`);
