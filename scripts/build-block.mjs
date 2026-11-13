// v00.03.00 T23：西文五语的屏蔽词表 app/assets/lang/<语种>/block.js（BLOCK.add 注册，整词命中）。`npm run block [-- fr de]`
// 来源，都按屏蔽器的归一化写法（小写、去变音符、ß→ss、œ→oe、æ→ae）存：
//   ① 第 3 批审核判为「不雅」、且另有依据的词条（维基词典标了 vulgar / offensive / derogatory，或 LDNOOBW 收了）；
//      只有审核一家判不雅的（多是轻度贬义）不拦、只是不进候选，列在送审表里供人工定；
//   ② LDNOOBW 种子（fr / de / es / it）里**不在候选表**的单词：没人审过，照种子拦；
//   ③ 送审表 review/lexicon/block-review.tsv 里用户填的裁定（拦 / 不拦）优先于以上规则。
// LDNOOBW 里在候选表、而审核没判不雅的词（asesinato、infierno、nackt 这类）不拦——那是审过的「不该误伤」。拉丁语没有种子。
// 第二依据取自**原始证据**（V003-B4-R1）：候选表的「原始依据」列（生成时写入，合并审核不动它）；旧候选表没有这一列时
// 退回读「标记」里的 不雅候选 / LDNOOBW待判（合并前它们还在）。所以合并前后生成的词表相同，与构建顺序无关。
// 送审表归作者（V003-B4-R2）：已有的行一个字不改（含作者加的列），只在末尾追加新词；退出清单的旧行保留并在日志里报数。
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadReview, keyOf, normFlags } from "./lexicon/review.mjs";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
export const blockFold = (s) => String(s).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/ß/g, "ss").replace(/œ/g, "oe").replace(/æ/g, "ae");
const TOKEN = /^[a-zø-ÿĀ-ɏ]+$/; // 与 block/core.js 的切词一致：只收单个词，短语与带符号的写法不收

// 一行候选的原始证据：["维基词典标签", "LDNOOBW"] 的子集。有「原始依据」列就只认它，没有才读旧的临时标记
export function rawEvidence(r) {
  const src = r["原始依据"] != null ? r["原始依据"] : (/不雅候选/.test(r["标记"] || "") ? "维基词典标签 " : "") + (/LDNOOBW待判/.test(r["标记"] || "") ? "LDNOOBW" : "");
  return ["维基词典标签", "LDNOOBW"].filter((x) => src.includes(x));
}

// rows：候选表的行对象；apply：loadReview().apply；seed：LDNOOBW 的行；rulings：Map(词 → "拦" | "不拦")，用户在送审表里的裁定。
// 返回 { words, vulgar, seedOnly, cleared, reviewOnly, table, ruled }
export function blockList(rows, apply, seed, rulings) {
  const table = new Map(); // 送审表：词 → { zh, why }
  const vulgar = new Set(), known = new Set(), mild = new Set(), seedSet = new Set((seed || []).map(blockFold));
  for (const r of rows) {
    const w = blockFold(r["显示"]);
    known.add(w); known.add(blockFold(r["词"]));
    const ov = apply.get(keyOf(r["词"], r["显示"], r["词性"]));
    let flags = r["标记"] ? r["标记"].split(" ") : [];
    if (ov && ov["标记"] != null) flags = flags.filter((f) => !["不雅候选", "LDNOOBW待判"].includes(f)).concat(normFlags(ov["标记"]));
    if (!flags.includes("不雅") || !TOKEN.test(w)) continue;
    // 审核的「不雅」含侮辱、粗俗、色情三类，轻重不一（avare 吝啬鬼、stultus 蠢人也在内）。屏蔽会拦住用户自己打的词，所以要有第二个依据
    const zh = (ov && ov["中文释义"] != null ? ov["中文释义"] : r["中文释义"]) || "";
    const why = ["审核判不雅"].concat(rawEvidence(r));
    if (seedSet.has(w) && !why.includes("LDNOOBW")) why.push("LDNOOBW");
    const t = table.get(w) || { zh: [], why: new Set() }; t.zh.push(zh); why.forEach((x) => t.why.add(x)); table.set(w, t);
  }
  for (const [w, t] of table) (t.why.size > 1 ? vulgar : mild).add(w);
  const seeds = [...new Set((seed || []).map(blockFold).filter((w) => TOKEN.test(w)))];
  const seedOnly = seeds.filter((w) => !known.has(w)), cleared = seeds.filter((w) => known.has(w) && !vulgar.has(w) && !mild.has(w));
  const words = new Set([...vulgar, ...seedOnly]), ruled = { 拦: [], 不拦: [] };
  for (const [w, v] of rulings || []) {
    if (v === "拦" && TOKEN.test(w)) { if (!words.has(w)) ruled.拦.push(w); words.add(w); }
    else if (v === "不拦") { if (words.has(w)) ruled.不拦.push(w); words.delete(w); }
  }
  return { words: [...words].sort(), vulgar: [...vulgar].sort(), seedOnly, cleared, reviewOnly: [...mild].sort(), ruled,
    table: [...table].map(([w, t]) => [w, [...new Set(t.zh)].join(" / "), ["审核判不雅", "维基词典标签", "LDNOOBW"].filter((x) => t.why.has(x)).join("+"), vulgar.has(w) ? "拦" : "不拦"])
      .concat(seedOnly.map((w) => [w, "", "LDNOOBW（未审，不在候选表）", "拦"])).sort((a, b) => (a[0] < b[0] ? -1 : 1)) };
}

// 送审表：作者的文件。读出已有内容与裁定；合并时已有行原样保留，只追加新键。
export const SHEET_HEAD = ["语种", "词（归一写法）", "中文释义", "依据", "当前处理", "用户裁定（拦 / 不拦）"];
export function readSheet(text) {
  const lines = String(text || "").replace(/\r/g, "").split("\n").filter((l) => l.length);
  if (!lines.length) return { head: SHEET_HEAD.slice(), lines: [], keys: new Set(), rulings: new Map() };
  const head = lines[0].split("\t"), iL = head.indexOf(SHEET_HEAD[0]), iW = head.indexOf(SHEET_HEAD[1]), iR = head.indexOf(SHEET_HEAD[5]);
  if (iL < 0 || iW < 0) throw new Error("送审表缺少「语种」或「词（归一写法）」列，无法对齐，不改文件");
  const keys = new Set(), rulings = new Map();
  for (const l of lines.slice(1)) {
    const c = l.split("\t"), k = c[iL] + "\t" + c[iW];
    keys.add(k);
    const v = iR >= 0 ? (c[iR] || "").trim() : "";
    if (v === "拦" || v === "不拦") rulings.set(k, v);
  }
  return { head, lines: lines.slice(1), keys, rulings };
}
// generated：{ 语种: table }。返回 { text, added, retired（表里有、这次没生成的行数，保留） }
export function mergeSheet(text, generated) {
  const old = readSheet(text), out = old.lines.slice(), gen = new Set();
  let added = 0;
  for (const [lang, table] of Object.entries(generated)) {
    for (const row of table) {
      const k = lang + "\t" + row[0];
      gen.add(k);
      if (old.keys.has(k)) continue; // 已有的行不改：中文、依据、裁定、备注、作者加的列都是作者的
      const cell = { [SHEET_HEAD[0]]: lang, [SHEET_HEAD[1]]: row[0], [SHEET_HEAD[2]]: row[1], [SHEET_HEAD[3]]: row[2], [SHEET_HEAD[4]]: row[3] };
      out.push(old.head.map((h) => cell[h] || "").join("\t")); added++;
    }
  }
  const langs = new Set(Object.keys(generated));
  const retired = [...old.keys].filter((k) => langs.has(k.split("\t")[0]) && !gen.has(k)).length;
  return { text: [old.head.join("\t")].concat(out).join("\n") + "\n", added, retired };
}

export function readCandidates(file) {
  const lines = fs.readFileSync(file, "utf8").split("\n").filter(Boolean), head = lines[0].split("\t");
  return lines.slice(1).map((l) => Object.fromEntries(l.split("\t").map((v, i) => [head[i], v])));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  // BACKRONYM_BLOCK_OUT：词表与送审表写到别的目录（隔离核对用）；BACKRONYM_BLOCK_CAND：候选表目录（缺省 review/lexicon）
  const OUT = process.env.BACKRONYM_BLOCK_OUT, CAND = process.env.BACKRONYM_BLOCK_CAND || path.join(root, "review/lexicon");
  const sheetFile = OUT ? path.join(OUT, "block-review.tsv") : path.join(root, "review/lexicon/block-review.tsv");
  const sheetText = fs.existsSync(sheetFile) ? fs.readFileSync(sheetFile, "utf8") : "";
  const sheet = readSheet(sheetText), generated = {};
  const langs = process.argv.slice(2).filter((a) => !a.startsWith("--"));
  for (const lang of langs.length ? langs : ["fr", "de", "es", "it", "la"]) {
    const rows = readCandidates(path.join(CAND, lang, "candidates.tsv"));
    const seedFile = path.join(root, "scripts/.cache/v003/ldnoobw/ldnoobw_" + lang);
    const seed = fs.existsSync(seedFile) ? fs.readFileSync(seedFile, "utf8").split("\n").map((s) => s.trim()).filter(Boolean) : [];
    const rulings = new Map([...sheet.rulings].filter(([k]) => k.startsWith(lang + "\t")).map(([k, v]) => [k.split("\t")[1], v]));
    const b = blockList(rows, loadReview(lang, null).apply, seed, rulings);
    generated[lang] = b.table;
    const js = `/* ${lang} 屏蔽词表（v00.03.00 T23）由 scripts/build-block.mjs 生成，勿手改。归一化、中文、导流与命中接口在 block/core.js，须先加载。
   来源：第 3 批审核判为不雅、且维基词典标为 vulgar / offensive / derogatory 或 LDNOOBW 收录的词条${seed.length ? "；LDNOOBW（List of Dirty, Naughty, Obscene, and Otherwise Bad Words，CC BY 4.0，Shutterstock, Inc.）里未经审核的单词" : ""}；用户在送审表里的裁定优先。整词命中，写法已归一（小写、去变音符）。 */
window.BLOCK.add(${JSON.stringify(lang)}, { words: ${JSON.stringify(b.words)} });\n`;
    const dir = OUT ? path.join(OUT, lang) : path.join(root, "app/assets/lang", lang);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "block.js"), js);
    console.log(`${lang} 屏蔽 ${b.words.length} 词（审核判不雅且有第二依据 ${b.vulgar.length}，种子未审 ${b.seedOnly.length}，只有审核判定不拦 ${b.reviewOnly.length}；用户裁定改拦 ${b.ruled.拦.length}、改不拦 ${b.ruled.不拦.length}；种子里审过放行 ${b.cleared.length}）`);
  }
  const m = mergeSheet(sheetText, generated);
  if (m.text !== sheetText) fs.writeFileSync(sheetFile, m.text);
  console.log(`送审表 ${path.relative(root, sheetFile)}：已有的行原样保留，追加 ${m.added} 行；这次没再生成、仍保留的旧行 ${m.retired} 行`);
}
