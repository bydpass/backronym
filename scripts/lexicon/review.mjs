// v00.03.00 第 3 批：读审核目录里的 DSH 普查（dsh-NNN.tsv）与 Codex 复审（codex-NNN.tsv），
// 给 build-lexicon.mjs 合并用（T19），也可单独检查格式：`npm run lexicon:check [-- fr de]`。格式与流程见 review/lexicon/README.md。
// 合并规则：Codex「通过」→ 用 DSH 新值；「驳回」→ 用建议值；「存疑」→ 不写入（登记 AUDIT）；只有 DSH、没有 Codex 结论 → 不写入。
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { articleOf } from "./article.mjs";

const root = path.dirname(path.dirname(path.dirname(fileURLToPath(import.meta.url))));
export const FIELDS = ["中文释义", "词性", "性别", "冠词", "标记", "显示"];
const DSH_HEAD = "词\t显示\t词性\t字段\t原值\t新值\t理由";
const CODEX_HEAD = "词\t显示\t词性\t字段\t结论\t建议值\t理由";
const VERDICTS = ["通过", "驳回", "存疑"];
const POS_OK = /^(noun|verb|adj|adv|pron|prep|conj|det|article|intj|num|particle|contraction|postp)$/;
export const keyOf = (w, d, p) => w + "\u0001" + d + "\u0001" + p;

function readTsv(file, head) {
  const lines = fs.readFileSync(file, "utf8").replace(/\r/g, "").split("\n").filter((l) => l.trim());
  const problems = [];
  if (lines[0] !== head) problems.push(`${path.basename(file)}：表头应为「${head.replace(/\t/g, " | ")}」`);
  const rows = [];
  lines.slice(1).forEach((l, i) => {
    const c = l.split("\t");
    if (c.length !== 7) { problems.push(`${path.basename(file)} 第 ${i + 2} 行：应有 7 列，实有 ${c.length} 列`); return; }
    rows.push({ line: i + 2, w: c[0], d: c[1], p: c[2], field: c[3], a: c[4], b: c[5], why: c[6] });
  });
  return { rows, problems };
}

// 「标记」字段的自由写法归一：（清除）/ 空 = 撤掉审核类标记；含 不雅 / 存疑 / 古旧 / 罕见 的归成对应标记
export function normFlags(v) {
  const s = String(v || "").trim();
  if (!s || /清除|^无$|^-$/.test(s)) return [];
  const out = [];
  if (/不雅|侮辱|色情|粗俗/.test(s)) out.push("不雅");
  // 「存疑：中古词」说的是年代，不是词条存疑：归古旧词、留在词库（11-09 用户同意）
  if (/非标准|误收/.test(s) || /存疑/.test(s.replace(/存疑[:：]\s*中古词?/g, ""))) out.push("存疑");
  if (/古旧|古语|过时|中古/.test(s)) out.push("古旧词");
  if (/罕见|生僻/.test(s)) out.push("罕见词");
  if (/中古/.test(s)) out.push("中古词"); // 年代记录：成品第 4 列（注释）写「中古」（11-10 用户定：保留已批准的中古词并记录年代）
  return out.length ? out : ["备注:" + s.slice(0, 40)];
}

// 把一个词条的审核结论（ov = { 字段: 值 }）写进词条 e（build-lexicon.mjs 的 makeEntries 产物），T19 合并的唯一实现。
// - 只改性别：按审核后的性别与单复数显式重算冠词（V003-B2-R2）。词头只留「pl」记号、不带原条目的义项，
//   所以原词头或旧义项标签里的单复数不会盖过人工结论；法语 h 标记、西语 IPA 沿用原条目。
// - 最终词性不是名词：性别、冠词一律清空（改成副词 / 形容词后不能留着 la）。
// - 性别 / 冠词写「（清除）」：清空该字段（名词只用于无冠词短语时，如 a squarciagola）。
const G2TAGS = { m: ["masculine"], f: ["feminine"], n: ["neuter"], mf: ["masculine", "feminine"], mn: ["masculine", "neuter"], fn: ["feminine", "neuter"], person: ["by-personal-gender"] };
const CLEAR = /清除/;
export function mergeEntry(lang, e, ov) {
  if (!ov) return e;
  // 显式词典订正显示写法，审核键仍用原始三列；不改冻结输入。
  if (ov["显示"] != null) {
    const d = String(ov["显示"]).normalize("NFC");
    if (!DISPLAY_OK.test(d) || foldForReview(d) !== foldForReview(e.disp)) throw new Error("显示订正必须是同一词的合法写法：" + e.disp);
    e.disp = d;
    e.flags = e.flags.filter(f => !["字符待审", "长音待审"].includes(f));
  }
  if (ov["词性"] && ov["词性"] !== e.pos) { e.posFrom = e.pos; e.pos = ov["词性"]; }
  if (ov["中文释义"] != null) { e.zh = ov["中文释义"].split(/[，,]/).map((s) => s.trim()).filter(Boolean).slice(0, 4); e.zhVia = "review"; e.flags = e.flags.filter((f) => f !== "待普查"); }
  const noArt = () => { Object.assign(e, { art: "", artState: "none", artVia: "review" }); e.flags = e.flags.filter((f) => f !== "冠词待审"); };
  if (ov["性别"]) {
    if (CLEAR.test(ov["性别"])) { e.gender = ""; if (ov["冠词"] == null) noArt(); }
    else {
      e.gender = ov["性别"];
      if (ov["冠词"] == null && e.pos === "noun") {
        const [g, pl] = ov["性别"].split("|");
        const a = articleOf(lang, Object.assign({}, e.rec, { pos: "noun", tags: G2TAGS[g] || [], head: [pl ? "x pl" : "x"], gl: [{ g: "x", t: [] }] }));
        Object.assign(e, { art: a.art, artState: a.state, artVia: "review+" + a.via });
        if (a.state === "known") e.flags = e.flags.filter((f) => f !== "冠词待审");
      }
    }
  }
  if (ov["冠词"] != null) {
    if (ov["冠词"] === "存疑") Object.assign(e, { art: "", artState: "unknown:review_doubt" });
    else if (CLEAR.test(ov["冠词"])) noArt();
    else { Object.assign(e, { art: ov["冠词"], artState: "reviewed", artVia: "review" }); e.flags = e.flags.filter((f) => f !== "冠词待审"); }
  }
  if (e.pos !== "noun") { e.gender = ""; noArt(); }
  if (ov["标记"] != null) {
    if (/变形条目/.test(ov["标记"])) e.formOnly = true;
    // 审核对标记下了结论：程序自己挂的待审类标记不能再留着把词条挡在词库外（二轮报告：135 条因此被误排除）
    e.flags = e.flags.filter((f) => !["不雅候选", "LDNOOBW待判", "长音待审"].includes(f));
    if (e.flags.includes("字符待审")) { // 长短两可的叠加音符（egō̆）不是乱码：去掉叠加符后写法合规就收；合字、上标（habꝫ、mᵒū）仍待审
      const d = reviewedDisplay(e.disp);
      if (d) { e.disp = d; e.flags = e.flags.filter((f) => f !== "字符待审"); }
    }
    e.flags = e.flags.concat(normFlags(ov["标记"]));
  }
  e.reviewed = true;
  return e;
}
const DISPLAY_OK = /^[A-Za-z\u00c0-\u00d6\u00d8-\u00f6\u00f8-\u024f]+$/; // 与 build-lexicon.mjs 同一口径
const foldForReview = s => String(s).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
export function reviewedDisplay(disp) {
  const d = String(disp).normalize("NFC").replace(/[\u0300-\u036f]/g, "");
  return DISPLAY_OK.test(d) ? d : "";
}
// 成品里同一写法合成一条、每个词性一组。传入**已通过入库资格**的词条（lexOk、命名范围都判过），按出现顺序归并：
// 同一写法、同一最终词性的多条（多半是审核把词性改正后撞上已有条目：évolué verb → adj）义项取并集、去重、最多 4 个，
// 不整条丢弃（SCOPE-R4）。先判资格再归并，所以带存疑标记的原条目挡不住有效的改词性条目。
// 返回 [{ disp, lemma, score, groups: [{ pos, zh }], art, merges, conflicts }]；merges / conflicts 写进报告供人工看。
export const GROUP_MAX = 4;
export function groupByDisplay(entries, labelOf = (p) => p) { // labelOf：词性 → 成品里的词性标签（两种词性同一标签时也归并）
  const out = new Map();
  for (const e of entries) {
    const o = out.get(e.disp) || { disp: e.disp, lemma: e.lemma, score: e.score, groups: [], art: "", merges: [], conflicts: [] };
    out.set(e.disp, o);
    const zh = e.zh.slice(0, GROUP_MAX);
    const pos = labelOf(e.pos), g = o.groups.find((x) => x.pos === pos);
    if (!g) o.groups.push({ pos, zh: zh.slice(), n: 1 });
    else {
      g.n++;
      const add = zh.filter((z) => !g.zh.includes(z)), room = GROUP_MAX - g.zh.length;
      g.zh.push(...add.slice(0, Math.max(0, room)));
      o.merges.push({ disp: e.disp, pos, from: e.posFrom || e.pos, added: add.slice(0, Math.max(0, room)), over_limit: add.slice(Math.max(0, room)) });
    }
    if (e.pos === "noun" && e.art) {
      if (!o.art) o.art = e.art;
      else if (o.art !== e.art) o.conflicts.push({ disp: e.disp, field: "冠词", kept: o.art, other: e.art });
    }
  }
  return [...out.values()];
}

// 一门语言的审核结果。cand = 候选表的键集合（keyOf），用于核对引用；返回 { apply: Map(键 → {字段: 值}), stats, problems, doubts }
export function loadReview(lang, cand, baseDir) {
  const dir = path.join(baseDir || path.join(root, "review/lexicon"), lang); // baseDir 只给测试用（临时目录）
  const stats = { dsh_files: 0, codex_files: 0, dsh_changes: 0, approved: 0, rejected_with_value: 0, doubtful: 0, pending_no_codex: 0, codex_extra: 0 };
  const problems = [], doubts = [], apply = new Map();
  if (!fs.existsSync(dir)) return { apply, stats, problems, doubts };
  const files = fs.readdirSync(dir);
  const set = (k, field, v) => { const o = apply.get(k) || {}; o[field] = v; apply.set(k, o); };
  const check = (f, r) => {
    if (!FIELDS.includes(r.field)) problems.push(`${f} 第 ${r.line} 行：字段「${r.field}」不在 ${FIELDS.join(" / ")} 里`);
    if (cand && !cand.has(keyOf(r.w, r.d, r.p))) problems.push(`${f} 第 ${r.line} 行：候选表里没有「${r.w} / ${r.d} / ${r.p}」`);
  };
  for (const f of files.filter((x) => /^dsh-\d{3}\.tsv$/.test(x)).sort()) {
    stats.dsh_files++;
    const n = f.slice(4, 7), dsh = readTsv(path.join(dir, f), DSH_HEAD);
    problems.push(...dsh.problems);
    for (const r of dsh.rows) {
      check(f, r);
      if (r.field === "词性" && !POS_OK.test(r.b)) problems.push(`${f} 第 ${r.line} 行：词性新值「${r.b}」不是 kaikki 词性写法`);
    }
    stats.dsh_changes += dsh.rows.length;
    const cf = "codex-" + n + ".tsv";
    if (!files.includes(cf)) { stats.pending_no_codex += dsh.rows.length; continue; }
    stats.codex_files++;
    const cx = readTsv(path.join(dir, cf), CODEX_HEAD);
    problems.push(...cx.problems);
    const verdict = new Map();
    for (const r of cx.rows) {
      check(cf, r);
      if (!VERDICTS.includes(r.a)) { problems.push(`${cf} 第 ${r.line} 行：结论「${r.a}」应为 通过 / 驳回 / 存疑`); continue; }
      verdict.set(keyOf(r.w, r.d, r.p) + "\u0001" + r.field, r);
    }
    const seen = new Set();
    for (const r of dsh.rows) {
      const k = keyOf(r.w, r.d, r.p), vk = k + "\u0001" + r.field, v = verdict.get(vk);
      seen.add(vk);
      if (!v) { problems.push(`${cf}：漏判 DSH 修订「${r.w} / ${r.p} / ${r.field}」`); stats.pending_no_codex++; continue; }
      if (v.a === "通过") { set(k, r.field, r.b); stats.approved++; }
      else if (v.a === "驳回") {
        if (!v.b) { problems.push(`${cf} 第 ${v.line} 行：驳回要给建议值`); continue; }
        set(k, r.field, v.b); stats.rejected_with_value++;
      } else { stats.doubtful++; doubts.push({ lang, shard: n, w: r.w, p: r.p, field: r.field, dsh: r.b, why: v.why }); }
    }
    // Codex 抽查未修订行发现的问题（驳回 + 建议值）也写入；存疑的登记
    for (const [vk, v] of verdict) {
      if (seen.has(vk)) continue;
      stats.codex_extra++;
      const k = keyOf(v.w, v.d, v.p);
      if (v.a === "驳回" && v.b) set(k, v.field, v.b);
      else if (v.a === "存疑") { stats.doubtful++; doubts.push({ lang, shard: n, w: v.w, p: v.p, field: v.field, dsh: "", why: v.why }); }
    }
  }
  return { apply, stats, problems, doubts };
}

// 命令行检查：npm run lexicon:check [-- fr de]
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const langs = process.argv.slice(2).length ? process.argv.slice(2) : ["fr", "de", "es", "it", "la"];
  let bad = 0;
  for (const lang of langs) {
    const cf = path.join(root, "review/lexicon", lang, "candidates.tsv");
    let cand = null;
    if (fs.existsSync(cf)) {
      cand = new Set();
      for (const l of fs.readFileSync(cf, "utf8").split("\n").slice(1)) { const c = l.split("\t"); if (c.length > 2) cand.add(keyOf(c[0], c[1], c[2])); }
    }
    const r = loadReview(lang, cand);
    console.log(lang, JSON.stringify(r.stats), cand ? "" : "（没有 candidates.tsv，未核对词条引用；先跑 npm run lexicon）");
    for (const p of r.problems.slice(0, 30)) console.log("  ✗ " + p);
    if (r.problems.length > 30) console.log(`  …另有 ${r.problems.length - 30} 处`);
    for (const d of r.doubts.slice(0, 10)) console.log(`  ? 存疑 ${d.shard} ${d.w} / ${d.p} / ${d.field}：${d.why}`);
    bad += r.problems.length;
  }
  if (bad) { console.log(`共 ${bad} 处格式问题`); process.exit(1); }
  console.log("lexicon review files ok");
}
