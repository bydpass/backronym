// v00.03.00 第 3 批：主会话审核普查（DSH）与复审（Codex）结果。只读源表，不改 shard / dsh / codex / 词库。
// 用法：
//   npm run lexicon:audit [-- fr de]                 统计 + 规则核对，写 review/lexicon/<语种>/audit.json
//   npm run lexicon:audit -- --samples [fr …]        另写抽样表：sample-q4.tsv（Q4 每语 200 条）与 sample-main.tsv（主会话独立复看 30 条）
//   npm run lexicon:audit -- --after-build [fr …]    T19 重新生成词库后：逐条核对 words.js 里实际写入的值是否等于预期最终值
// 「另一个模型的赞同不等于验证」（PLAN 第六节）：这里按规则独立核对最终值，并用固定种子抽样，结果可复算。
import { excludedPos } from "./scope.mjs";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { loadReview, keyOf, normFlags, reviewedDisplay } from "./review.mjs";
import { articleOf, fold } from "./article.mjs";

const root = path.dirname(path.dirname(path.dirname(fileURLToPath(import.meta.url))));
const LANGS = ["fr", "de", "es", "it", "la"];
const GENDERS = /^(m|f|n|mf|mn|fn|person)?(\|pl)?$/;
const POS_OK = /^(noun|verb|adj|adv|pron|prep|conj|det|article|intj|num|particle|contraction|postp)$/;
// 冠词允许写法（与 test-lexicon.mjs 的 ARTS 一致）
const ARTS = { fr: /^(le|la|l’|les|le \/ la)$/, de: /^(der|die|das|der \/ die|der \/ das|die \/ das)$/, es: /^(el|la|el \/ la|los|las|los \/ las)$/, it: /^(il|lo|la|l’|il \/ la|lo \/ la|l’ \/ la|i|gli|le|i \/ le|gli \/ le)$/, la: /^$/ };
const G2TAGS = { m: ["masculine"], f: ["feminine"], n: ["neuter"], mf: ["masculine", "feminine"], mn: ["masculine", "neuter"], fn: ["feminine", "neuter"], person: ["by-personal-gender"] };
const EXCLUDE = ["长音待审", "字符待审", "不雅", "存疑"]; // 与 build-lexicon.mjs 的 lexOk 同一口径
const POSLABEL = { noun: "n.", verb: "v.", adj: "adj.", adv: "adv." };

// 主会话逐条判过、规则判不出的冠词例外（11-09）：数词名词与 ouistiti 不省音；io / IA 省音；ts、pt 开头用 lo；ale 是外来词读 /eil/
const ART_OK = { fr: { un: "le", une: "la", "onzième": "le", ouistiti: "le", halloween: "l\u2019" }, es: { ale: "la" }, it: { io: "l\u2019", ia: "l\u2019", tsunami: "lo", pterodattilo: "lo" } };

// 可复算的伪随机（mulberry32，种子来自字符串）
function rng(seed) {
  let h = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i++) { h = Math.imul(h ^ seed.charCodeAt(i), 3432918353); h = (h << 13) | (h >>> 19); }
  let a = h >>> 0;
  return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
function pick(list, n, r) { const a = list.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a.slice(0, n); }

// 按复审后的性别（含 |pl）显式算冠词：性别、单复数都取人工结论，不让词头或旧义项标签覆盖（V003-B2-R2 的预期行为）
export function expectedArticle(lang, w, gender, rec) {
  const [g, pl] = String(gender || "").split("|");
  // 复数用词头「… pl」表示（genderOf 认词头与全部义项，不认整词标签）
  return articleOf(lang, Object.assign({ ipa: [] }, rec || {}, { w, pos: "noun", tags: G2TAGS[g] || [], head: [pl ? "x pl" : "x"], gl: [{ g: "x", t: [] }] }));
}

// 中文释义格式：全角逗号分隔、1–4 个义项、每个 ≤ 10 字、含汉字、不夹两个以上连续拉丁字母（多半是没译）
export function glossProblems(v) {
  const out = [];
  if (/,/.test(v)) out.push("半角逗号");
  const items = String(v || "").split(/[，,]/).map((s) => s.trim()).filter(Boolean);
  if (!items.length) out.push("空");
  if (items.length > 4) out.push("超过 4 个义项");
  for (const s of items) {
    if ([...s].length > 10) out.push("义项超过 10 字：" + s);
    if (!/\p{Script=Han}/u.test(s)) out.push("义项没有汉字：" + s);
    // 没译干净的残片（「see的过去分词」「vt. 邻近」）才算格式问题；其余带拉丁字母的多是音名、字母名、商标、学名，另列供抽看
    else if (/^[A-Za-z]+的|(^|[^A-Za-z])(vt|vi|adj|adv|n|v|a|prep|conj|pron)\./.test(s)) out.push("义项夹外文：" + s);
    else if (/[A-Za-z]{2,}/.test(s)) out.push("含拉丁字母：" + s);
  }
  return out;
}

export function auditLang(lang, opts = {}) {
  const base = opts.base || path.join(root, "review/lexicon");
  const dir = path.join(base, lang);
  const candFile = path.join(dir, "candidates.tsv");
  if (!fs.existsSync(candFile)) return { lang, error: "没有 candidates.tsv（先跑 npm run lexicon）" };
  const cols = ["词", "显示", "词性", "性别", "冠词", "冠词判定", "判定来源", "英文释义", "中文释义", "释义来源", "标记", "得分"];
  const cand = new Map();
  const candLines = fs.readFileSync(candFile, "utf8").split("\n"), candHead = candLines[0].split("\t"); // 后加的列（原始依据、形态）按表头名读
  for (const l of candLines.slice(1)) {
    const c = l.split("\t");
    if (c.length < cols.length) continue;
    const row = Object.fromEntries(candHead.map((k, i) => [k, c[i]]));
    cand.set(keyOf(row["词"], row["显示"], row["词性"]), row);
  }
  const review = loadReview(lang, new Set(cand.keys()), base);
  const files = fs.readdirSync(dir);
  const dshN = files.filter((f) => /^dsh-\d{3}\.tsv$/.test(f)).map((f) => f.slice(4, 7)).sort();
  const codexN = new Set(files.filter((f) => /^codex-\d{3}\.tsv$/.test(f)).map((f) => f.slice(6, 9)));

  // 逐片读 DSH / Codex：结论分布（按字段）、空修订（原值 = 新值）、驳回时建议值就是原值（等于撤销修订）
  const byField = {}, emptyRev = [], revertToOrig = [];
  const bump = (f, k) => { const o = byField[f] || (byField[f] = { dsh: 0, 通过: 0, 驳回: 0, 存疑: 0, 未判: 0 }); o[k]++; };
  const readT = (f) => fs.readFileSync(path.join(dir, f), "utf8").replace(/\r/g, "").split("\n").slice(1).filter((l) => l.trim()).map((l) => l.split("\t"));
  for (const n of dshN) {
    const verdict = new Map();
    if (codexN.has(n)) for (const c of readT("codex-" + n + ".tsv")) if (c.length === 7) verdict.set(keyOf(c[0], c[1], c[2]) + "\u0001" + c[3], c);
    for (const c of readT("dsh-" + n + ".tsv")) {
      if (c.length !== 7) continue;
      bump(c[3], "dsh");
      if (c[4] === c[5]) emptyRev.push(n + " " + c[0] + " / " + c[2] + " / " + c[3]);
      const v = verdict.get(keyOf(c[0], c[1], c[2]) + "\u0001" + c[3]);
      if (!v || !["通过", "驳回", "存疑"].includes(v[4])) { bump(c[3], "未判"); continue; }
      bump(c[3], v[4]);
      if (v[4] === "驳回" && v[5] === c[4]) revertToOrig.push(n + " " + c[0] + " / " + c[2] + " / " + c[3]);
    }
  }

  // 合并后的预期最终值（与 build-lexicon.mjs 的 applyReview 同规则；只改性别时冠词按人工结论显式重算）
  let stage = null;
  const recOf = (w) => {
    if (opts.noStage) return null;
    if (!stage) {
      stage = new Map();
      const f = path.join(root, "scripts/.cache/v003/stage", lang + ".json");
      if (fs.existsSync(f)) for (const r of JSON.parse(fs.readFileSync(f, "utf8")).lemmas) if (r.pos === "noun" && !stage.has(r.w)) stage.set(r.w, { h: r.h, ipa: r.ipa });
    }
    return stage.get(w) || null;
  };
  const finals = [], viol = {};
  const add = (k, msg) => { (viol[k] || (viol[k] = [])).push(msg); };
  for (const [k, row] of cand) {
    const ov = review.apply.get(k);
    const f = { 词: row["词"], 显示: row["显示"], 词性: row["词性"], 性别: row["性别"], 冠词: row["冠词"], 中文释义: row["中文释义"], 英文释义: row["英文释义"], 标记: row["标记"] ? row["标记"].split(" ") : [], 来源: "auto", 改了: [] };
    if (ov) {
      f.来源 = "review";
      if (ov["显示"]) { f.显示 = ov["显示"].normalize("NFC"); f.标记 = f.标记.filter(x => !["字符待审", "长音待审"].includes(x)); f.改了.push("显示"); }
      if (ov["词性"]) { f.词性 = ov["词性"]; f.改了.push("词性"); }
      if (ov["中文释义"] != null) { f.中文释义 = ov["中文释义"].split(/[，,]/).map((s) => s.trim()).filter(Boolean).slice(0, 4).join("，"); f.标记 = f.标记.filter((x) => x !== "待普查"); f.改了.push("中文释义"); }
      if (ov["性别"]) {
        f.改了.push("性别");
        if (/清除/.test(ov["性别"])) { f.性别 = ""; if (ov["冠词"] == null) f.冠词 = ""; }
        else { f.性别 = ov["性别"]; if (ov["冠词"] == null && f.词性 === "noun") f.冠词 = expectedArticle(lang, f.显示, f.性别, recOf(f.显示)).art; }
      }
      if (ov["冠词"] != null) { f.冠词 = /^存疑$|清除/.test(ov["冠词"]) ? "" : ov["冠词"]; f.改了.push("冠词"); if (ov["冠词"] !== "存疑") f.标记 = f.标记.filter((x) => x !== "冠词待审"); }
      if (f.词性 !== "noun") { f.性别 = ""; f.冠词 = ""; } // 改成非名词：性别、冠词清空
      if (ov["标记"] != null) { // 审核对标记下了结论：程序挂的待审类标记撤掉；叠加音符去掉后写法合规的照收
        f.标记 = f.标记.filter((x) => !["不雅候选", "LDNOOBW待判", "长音待审"].includes(x));
        const d = f.标记.includes("字符待审") ? reviewedDisplay(f.显示) : "";
        if (d) { f.显示 = d; f.标记 = f.标记.filter((x) => x !== "字符待审"); }
        f.标记 = f.标记.concat(normFlags(ov["标记"])); f.改了.push("标记");
      }
    }
    // 命名范围（SCOPE-R3）：按复审后的词性，功能词不作独立候选；与 build-lexicon.mjs「applyReview 之后再 excludedPos」同口径
    f.outOfScope = excludedPos(f.词性);
    f.formOnly = row["形态"] === "变形条目" || !!(ov && /变形条目/.test(ov["标记"] || ""));
    f.inLex = !f.outOfScope && !f.formOnly && !!f.中文释义 && !f.标记.some((x) => EXCLUDE.includes(x)) && /[a-z]/.test(fold(f.显示)[0]);
    finals.push(f);
    if (!f.inLex) continue; // 规则只核进词库的条目
    const tag = f.显示 + " / " + f.词性 + (f.来源 === "review" ? "（复审后）" : "");
    for (const p of glossProblems(f.中文释义)) add(/^含拉丁字母/.test(p) ? "含拉丁字母（供抽看，不算错）" : "释义格式", tag + "：" + p);
    if (!POS_OK.test(f.词性)) add("词性取值", tag + "：" + f.词性);
    if (f.性别 && !GENDERS.test(f.性别)) add("性别取值", tag + "：" + f.性别);
    if (f.冠词 && !ARTS[lang].test(f.冠词)) add("冠词写法", tag + "：" + f.冠词);
    if (f.冠词 && f.词性 !== "noun") add("非名词带冠词", tag + "：" + f.冠词);
    if (f.词性 === "noun" && f.性别 && f.冠词 && lang !== "la") {
      // 规则判得出（known）却与最终冠词不同：人工可能改对了规则、也可能改错了，列出由主会话判断
      const want = expectedArticle(lang, f.显示, f.性别, recOf(f.显示));
      if (want.state === "known" && want.art !== f.冠词 && (ART_OK[lang] || {})[f.词] !== f.冠词) add("冠词与性别不一致", tag + "：性别 " + f.性别 + "，冠词 " + f.冠词 + "，按规则应为 " + want.art);
    }
  }

  const out = {
    lang, generated_by: "scripts/lexicon/audit-review.mjs",
    shards: { dsh: dshN.length, codex: codexN.size, dsh_without_codex: dshN.filter((n) => !codexN.has(n)) },
    review_stats: review.stats, format_problems: review.problems.length, format_examples: review.problems.slice(0, 20),
    verdicts_by_field: byField,
    empty_revisions: emptyRev.length, empty_examples: emptyRev.slice(0, 10),
    rejected_back_to_original: revertToOrig.length,
    doubts: review.doubts.length, doubt_examples: review.doubts.slice(0, 20),
    unmatched_revisions: review.problems.filter((p) => /候选表里没有/.test(p)).length,
    final: { candidates: cand.size, in_lexicon: finals.filter((f) => f.inLex).length, revised: finals.filter((f) => f.来源 === "review").length, revised_in_lexicon: finals.filter((f) => f.来源 === "review" && f.inLex).length, out_of_scope_function_words: finals.filter((f) => f.outOfScope).length, form_entries_excluded: finals.filter((f) => f.formOnly && !f.outOfScope).length },
    rule_violations: Object.fromEntries(Object.entries(viol).map(([k, v]) => [k, { count: v.length, examples: v.slice(0, 15) }])),
  };

  if (opts.samples) {
    // Q4：进词库的条目里每语随机 200 条（固定种子，可复算），交外部验收；主会话另抽 30 条，修订过 / 没修订各 15 条
    const lex = finals.filter((f) => f.inLex);
    const q4 = pick(lex, 200, rng("q4-" + lang + "-v00.03.00"));
    const rev = lex.filter((f) => f.来源 === "review"), auto = lex.filter((f) => f.来源 === "auto");
    const r2 = rng("main-" + lang + "-v00.03.00");
    const mainRev = pick(rev, 15, r2);
    const main = mainRev.concat(pick(auto, 30 - mainRev.length, r2));
    const head = ["词", "显示", "词性", "性别", "冠词", "中文释义", "英文释义", "来源", "改了", "判定（对 / 错 / 存疑）", "错在哪"];
    const tsv = (rows) => [head.join("\t")].concat(rows.map((f) => [f.词, f.显示, f.词性, f.性别, f.冠词, f.中文释义, f.英文释义, f.来源, f.改了.join(" "), "", ""].map((v) => String(v).replace(/[\t\n]/g, " ")).join("\t"))).join("\n") + "\n";
    if (!opts.dryRun) { fs.writeFileSync(path.join(dir, "sample-q4.tsv"), tsv(q4)); fs.writeFileSync(path.join(dir, "sample-main.tsv"), tsv(main)); }
    out.samples = { q4: q4.length, main: main.length, main_revised: mainRev.length, seed: "q4-/main-" + lang + "-v00.03.00", rule: "Q4：每语 200 条，错误率 ≤ 3% 算通过；主会话另抽 30 条独立复看", q4_keys: q4.map((f) => f.显示 + "/" + f.词性) };
  }

  if (opts.afterBuild) {
    // T19 重新生成后：words.js 里实际写入的值是否等于预期（只核复审过的条目）
    const env = { window: { LANGPACK: { put(c, p, v) { env[p] = v; } } } };
    vm.createContext(env);
    vm.runInContext(fs.readFileSync(opts.wordsFile || path.join(root, "app/assets/lang", lang, "words.js"), "utf8"), env);
    const rows = new Map(Object.values(env.words).flat().map((r) => [r[0], r]));
    const miss = [], wrongZh = [], wrongArt = [], leaked = [];
    // 同一写法、同一最终词性有多条时（词性改正后撞上已有条目），成品应是各条义项的并集（去重、最多 4 个）：按进词库的条目独立算一遍（SCOPE-R4）
    const union = new Map();
    for (const g of finals.filter((x) => x.inLex)) {
      const k = g.显示 + "\u0001" + (POSLABEL[g.词性] || g.词性), u = union.get(k) || union.set(k, []).get(k);
      for (const z of g.中文释义.split("，")) if (z && !u.includes(z) && u.length < 4) u.push(z);
    }
    const mergedMiss = [];
    for (const [k, u] of union) {
      const [d, label] = k.split("\u0001"), r = rows.get(d);
      if (!r || !/\.$/.test(label)) continue;
      const grp = r[1].split("|").filter((g) => g.startsWith(label));
      if (grp.length !== 1) { mergedMiss.push(d + " / " + label + "：成品里该词性有 " + grp.length + " 组"); continue; }
      const have = grp[0].slice(label.length).split("，"), lost = u.filter((z) => !have.includes(z));
      if (lost.length && finals.filter((x) => x.inLex && x.显示 === d && (POSLABEL[x.词性] || x.词性) === label).length > 1) mergedMiss.push(d + " / " + label + "：漏合并「" + lost.join("，") + "」，实为「" + grp[0] + "」");
    }
    for (const f of finals.filter((x) => x.来源 === "review")) {
      const r = rows.get(f.显示);
      if (!f.inLex) { if (r && !finals.some((g) => g.显示 === f.显示 && g.inLex)) leaked.push(f.显示 + "（" + f.标记.join(" ") + "）"); continue; }
      if (!r) { miss.push(f.显示 + " / " + f.词性); continue; }
      if (f.改了.includes("中文释义")) {
        const grp = r[1].split("|").find((g) => g.startsWith(POSLABEL[f.词性] || "\u0000"));
        const hay = grp || r[1];
        const same = finals.filter((x) => x.inLex && x.显示 === f.显示 && x.词性 === f.词性).length; // 同词性多条时由上面的并集核对
        if (same === 1 && !f.中文释义.split("，").every((z) => hay.includes(z))) wrongZh.push(f.显示 + " / " + f.词性 + "：应含「" + f.中文释义 + "」，实为「" + r[1] + "」");
      }
      const nounsOfDisp = finals.filter((g) => g.显示 === f.显示 && g.词性 === "noun" && g.inLex).length;
      if (f.词性 === "noun" && nounsOfDisp === 1 && (f.改了.includes("冠词") || f.改了.includes("性别")) && (r[2] || "") !== f.冠词)
        wrongArt.push(f.显示 + "：应为「" + f.冠词 + "」，实为「" + (r[2] || "") + "」");
    }
    // Q4-R1：非独立形式不论审没审过都不该单独在库（同写法另有进词库的条目除外）
    const formLeak = finals.filter((f) => f.formOnly && rows.has(f.显示) && !finals.some((g) => g.显示 === f.显示 && g.inLex)).map((f) => f.显示 + " / " + f.词性);
    out.after_build = { form_entries_present: formLeak.length, form_entries_examples: formLeak.slice(0, 15), missing: miss.length, missing_examples: miss.slice(0, 15), wrong_gloss: wrongZh.length, wrong_gloss_examples: wrongZh.slice(0, 15), wrong_article: wrongArt.length, wrong_article_examples: wrongArt.slice(0, 15), excluded_but_present: leaked.length, excluded_examples: leaked.slice(0, 15), merge_missing: mergedMiss.length, merge_missing_examples: mergedMiss.slice(0, 15) };
  }
  if (!opts.dryRun) fs.writeFileSync(path.join(dir, "audit.json"), JSON.stringify(out, null, 1) + "\n");
  return out;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const opts = { samples: args.includes("--samples"), afterBuild: args.includes("--after-build") };
  const langs = args.filter((a) => !a.startsWith("--"));
  for (const lang of langs.length ? langs : LANGS) {
    const r = auditLang(lang, opts);
    if (r.error) { console.log(lang, r.error); continue; }
    const v = Object.fromEntries(Object.entries(r.rule_violations).map(([k, x]) => [k, x.count]));
    const s = r.review_stats;
    console.log(`${lang}｜片 dsh ${r.shards.dsh} / codex ${r.shards.codex}｜修订 ${s.dsh_changes}：通过 ${s.approved}、驳回 ${s.rejected_with_value}、存疑 ${s.doubtful}、未判 ${s.pending_no_codex}｜空修订 ${r.empty_revisions}｜引用不到 ${r.unmatched_revisions}｜规则问题 ${JSON.stringify(v)}` +
      (r.after_build ? `｜合并后：缺 ${r.after_build.missing}、释义不符 ${r.after_build.wrong_gloss}、冠词不符 ${r.after_build.wrong_article}、该排除未排除 ${r.after_build.excluded_but_present}` : ""));
  }
  console.log("详情见 review/lexicon/<语种>/audit.json");
}
