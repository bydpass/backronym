// v00.03.00 T10 第一步：把 kaikki 按语种的 JSONL（约 0.6–1.2 GB）抽成只含需要字段的中间文件，供 build-lexicon.mjs 反复用。
// 用法：node scripts/lexicon/extract.mjs <语种>   （fr / de / es / it / la）
// 输入 scripts/.cache/v003/kaikki-<语种>/*.jsonl（只读，不可信数据，只解析不执行）；输出 scripts/.cache/v003/stage/<语种>.json
// 口径与 plans/v00.03.00/t01/coverage.py 一致：
//   原形 = 非 form-of 的单词条目（不含空格、纯字母），排除 SKIP_POS；pos=name 另记专名集合
//   变形 → 原形 = form_of / alt_of 的目标 + 原形条目 forms[] 里的单词形式
import fs from "node:fs";
import { isSurfaceForm } from "../t19/surface-forms.mjs";
import path from "node:path";
import readline from "node:readline";
import { fileURLToPath } from "node:url";
import { isInflectionSense } from "./sense-kind.mjs";

const root = path.dirname(path.dirname(path.dirname(fileURLToPath(import.meta.url))));
const LANGS = { fr: "French", de: "German", es: "Spanish", it: "Italian", la: "Latin" };
const lang = process.argv[2];
if (!LANGS[lang]) { console.error("用法：node scripts/lexicon/extract.mjs <fr|de|es|it|la>"); process.exit(2); }
const SRC = path.join(root, "scripts/.cache/v003/kaikki-" + lang, "kaikki.org-dictionary-" + LANGS[lang] + ".jsonl");
const OUT_DIR = process.env.BACKRONYM_STAGE_OUT || path.join(root, "scripts/.cache/v003/stage");
const ALPHA = /^\p{L}+$/u;
const SKIP_POS = new Set(["name", "character", "symbol", "punct", "prefix", "suffix", "infix", "interfix", "affix", "circumfix"]); // 与 t01/coverage.py 的 SKIP_POS 同一份（覆盖率口径一致）
const ABBR = new Set(["abbreviation", "acronym", "initialism", "clipping"]);
const GENDER_TAGS = ["masculine", "feminine", "neuter", "plural-only", "plural", "by-personal-gender", "common"];
const KEEP_TAG = /^(obsolete|archaic|rare|vulgar|offensive|derogatory|slang|dated|proper-noun)$/;
const catName = (c) => (typeof c === "string" ? c : c && c.name) || "";

const lemmas = [], names = new Set(), form2 = new Map(), form2pos = new Map();
// 第三次重建（2026-11-19，规格第 3、6 节）：只加字段、不改已有字段——ety 词源编号、gl_more 第 9 条起的义项、formTags 词形的语法标签。
// 旧字段逐字节不变，现有选词与编译不受影响；新管线读 BACKRONYM_STAGE_OUT 指定的目录（scripts/.cache/v003/stage3）
const formTags = new Map();
const addTags = (f, t, pos, tags) => {
  const k = t + "|" + (pos || "") + "|" + [...new Set(tags || [])].sort().join(",");
  let s = formTags.get(f); if (!s) formTags.set(f, (s = new Set())); s.add(k);
};
// form2pos（V003-B4-R10）：变形 → 「原形 + 词性」。form2 只记原形写法，分不清 bist 是动词 sein 的变形还是名词 Sein 的；
// 词性取变形条目自己的词性（form-of 条目）或原形条目的词性（forms[]）。form2 原样保留，选词与覆盖率口径不变
const addForm = (f, t, pos) => {
  let s = form2.get(f); if (!s) form2.set(f, (s = new Set())); s.add(t);
  if (pos === null) return; // 多词目标拆出来的单词（缩写 me = « muerte encefálica »）：不是「谁的变形」，不进带词性的索引
  let p = form2pos.get(f); if (!p) form2pos.set(f, (p = new Set())); p.add(t + "|" + (pos || ""));
};
let lines = 0;
const rl = readline.createInterface({ input: fs.createReadStream(SRC, { highWaterMark: 1 << 20 }), crlfDelay: Infinity });
for await (const line of rl) {
  lines++;
  let d;
  try { d = JSON.parse(line); } catch { continue; }
  const w = d.word || "", pos = d.pos, senses = d.senses || [];
  if (!w || w.includes(" ")) continue;
  const lw = w.toLowerCase();
  const formof = senses.length > 0 && senses.every((s) => isInflectionSense(lang, pos, s));
  if (formof) {
    for (const s of senses) for (const t of [...(s.form_of || []), ...(s.alt_of || [])])
      { const parts = String(t.word || "").toLowerCase().split(/\s+/).filter(Boolean); for (const tw of parts) if (ALPHA.test(tw)) { addForm(lw, tw, parts.length === 1 ? pos : null); if (parts.length === 1) addTags(lw, tw, pos, s.tags); } }
    continue;
  }
  if (pos === "name") { names.add(lw); continue; }
  if (SKIP_POS.has(pos) || !ALPHA.test(w)) continue;
  const real = senses.filter((s) => !isInflectionSense(lang, pos, s)); // 原形条目里也可能夹着 form-of 义项（liber 名词）
  const stags = new Set(), topics = new Set(), cats = new Set();
  for (const s of real) {
    for (const t of s.tags || []) stags.add(t);
    for (const t of s.topics || []) topics.add(t);
    for (const c of s.categories || []) cats.add(catName(c));
  }
  for (const c of d.categories || []) cats.add(catName(c));
  const keep = (t) => GENDER_TAGS.includes(t) || ABBR.has(t) || KEEP_TAG.test(t);
  const gl = [], glMore = [];
  // 子义项的 glosses 是「上级标题, …, 本义」：取最后一项（venir 的 glosses[0] 是「Senses relating to literal movement.」）；重复的不要
  for (const s of real) {
    const gs = s.glosses || [], g = gs[gs.length - 1];
    if (g && gl.length < 8 && !gl.some((x) => x.g === g)) gl.push({ g, t: (s.tags || []).filter(keep) });
    else if (g && gl.length >= 8 && !gl.some((x) => x.g === g) && !glMore.some((x) => x.g === g)) glMore.push({ g, t: (s.tags || []).filter(keep) });
  }
  const rec = {
    w, pos,
    tags: [...stags].filter(keep),
    head: (d.head_templates || []).map((h) => String(h.expansion || "").slice(0, 240)),
    gl,
    topics: [...topics],
  };
  // 法语嘘音 h（T01③）：标记在 senses[].categories
  if (lang === "fr") {
    const cs = [...cats];
    const either = cs.some((c) => /either aspirated or mute h/.test(c));
    const asp = cs.some((c) => /aspirated h/.test(c) && !/either/.test(c)), mute = cs.some((c) => /mute h/.test(c) && !/either/.test(c));
    rec.h = either || (asp && mute) ? "both" : asp ? "asp" : mute ? "mute" : "";
  }
  // 领域分类（T01⑤ 种子）
  const dom = [...cats].filter((c) => /\b(Literature|Philosophy|Art|Arts|Music|Painting|Sculpture|Theater|Theatre|Poetry|Rhetoric|Architecture|Mythology)\b/.test(c));
  if (dom.length) rec.dom = dom.slice(0, 4);
  if (lang === "es") rec.ipa = (d.sounds || []).map((s) => s.ipa).filter(Boolean).slice(0, 6);
  if (d.etymology_number) rec.ety = d.etymology_number;
  if (glMore.length) rec.gl_more = glMore;
  if (lang === "la") rec.canon = (d.forms || []).filter((f) => (f.tags || []).includes("canonical")).map((f) => f.form);
  lemmas.push(rec);
  for (const f of d.forms || []) {
    if (!isSurfaceForm(f)) continue;
    const fw = String(f.form || "").toLowerCase();
    if (fw && !fw.includes(" ") && ALPHA.test(fw) && fw !== lw) { addForm(fw, lw, pos); addTags(fw, lw, pos, f.tags); }
  }
}
fs.mkdirSync(OUT_DIR, { recursive: true });
const out = { lang, src: path.basename(SRC), lines, lemmas, names: [...names], form2: Object.fromEntries([...form2].map(([k, v]) => [k, [...v]])), form2pos: Object.fromEntries([...form2pos].map(([k, v]) => [k, [...v]])),
  formTags: Object.fromEntries([...formTags].map(([k, v]) => [k, [...v]])) };
fs.writeFileSync(path.join(OUT_DIR, lang + ".json"), JSON.stringify(out));
console.log(lang, "lines", lines, "lemmas", lemmas.length, "names", names.size, "forms", form2.size);
