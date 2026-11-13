// v00.03.00 第 2 批（T10–T15）：西文词库管线。读 scripts/.cache/v003/（原始数据不进仓库），生成：
//   app/assets/lang/<xx>/words.js   词库（LANGPACK.put words / forms / hyph），未经第 3 批审核的版本
//   review/lexicon/<xx>/candidates.tsv  审核候选表（分片原表，不进 git，Q3）
//   review/lexicon/<xx>/report.json     覆盖报告（规模、覆盖率、性别 / 冠词三态、中转率、待普查条数、输入指纹）
// 用法：npm run lexicon [-- fr de]   （先跑 node scripts/lexicon/extract.mjs <语种> 生成 stage/<语种>.json）
// 口径：PLAN「覆盖率统计规则」（r3：英语词与专名移出分母、查询忽略变音符）与 t01/coverage.py 一致；门槛 Q12。
import fs from "node:fs";
import { excludedPos, formOnly, SCOPE_VERSION } from "./lexicon/scope.mjs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { articleOf, genderOf, fold } from "./lexicon/article.mjs"; // fold：先小写再展开连字（V003-B2-R4），与 rules.js 同口径
import { loadEcdict, loadCedict, zhFor, POS } from "./lexicon/zh.mjs";
import { loadReview, keyOf, mergeEntry, groupByDisplay } from "./lexicon/review.mjs";
import { loadGermanSelection } from "./lexicon/german-selection.mjs";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const C = (...p) => path.join(root, "scripts/.cache", ...p);
const V3 = (...p) => C("v003", ...p);
// 门槛（Q12）：2σ = 95.45% 达标线，2.5σ = 98.76% 目标；德语 2.5σ 不可达（上限 98.32%），按 2σ
const CFG = {
  fr: { name: "French", freq: "freq-fr/fr_full.txt", target: 0.9876, direct: ["cfdict/cfdict.u8", "cfdict"], ldnoobw: "ldnoobw_fr", hyph: "hyph-fr" },
  de: { name: "German", freq: "freq-de/de_full.txt", target: 0.9545, direct: ["handedict/handedict.u8.gz", "handedict"], ldnoobw: "ldnoobw_de", hyph: "hyph-de-1996" },
  es: { name: "Spanish", freq: "freq-es/es_full.txt", target: 0.9876, ldnoobw: "ldnoobw_es", hyph: "hyph-es" },
  it: { name: "Italian", freq: "freq-it/it_full.txt", target: 0.9876, ldnoobw: "ldnoobw_it", hyph: "hyph-it" },
  la: { name: "Latin", whitaker: true, hyph: "hyph-la" },
};
const WORD_MAX = 28; // Q11 / T28：西文格内上限
const MIN_FORM_COUNT = Number(process.env.MIN_FORM_COUNT || 5); // 变形索引的最低语料频次（体积与可查率的取舍，报告里给对照）
const DOMAIN_MAX = 600; // 领域种子（T01⑤：只能当种子，人工清单另做）
const args = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const langs = args.length ? args : Object.keys(CFG);
const ALPHA = /^\p{L}+$/u;
// 显示词只用规则支持的字符（与 rules.js 的 wordChar 同范围，V003-B2-R3）：拉丁字母含 Latin-1、扩展 A / B（ȳ）；组合音标（egō̆）、IPA 字母（ləi）不支持
const DISPLAY_OK = /^[A-Za-z\u00c0-\u00d6\u00d8-\u00f6\u00f8-\u024f]+$/;
const sha = (f) => crypto.createHash("sha256").update(fs.readFileSync(f)).digest("hex");

console.log("读 ECDICT …");
const EC = loadEcdict(C("ecdict.csv"));

for (const lang of langs) {
  const cfg = CFG[lang];
  if (!cfg) throw new Error("未知语种 " + lang);
  const t0 = Date.now();
  const stageFile = process.env.BACKRONYM_STAGE_IN ? path.join(process.env.BACKRONYM_STAGE_IN, lang + ".json") : V3("stage", lang + ".json");
  const stage = JSON.parse(fs.readFileSync(stageFile, "utf8"));
  const inputs = [stageFile, C("ecdict.csv")];
  const german = lang === "de" ? loadGermanSelection(path.join(root, "review/lexicon/de")) : null;
  if (german) {
    inputs.push(...german.files);
    // 独立词典补入、Kaikki 中没有的原形：只接受逐条人工定稿的释义与冠词。
    for (const e of german.supplements.values()) if (!stage.lemmas.some(r => r.w === e.display && r.pos === e.pos)) {
      stage.lemmas.push({ w: e.display, pos: e.pos, gl: [{ g: e.en, t: [] }],
        tags: [{ der: "masculine", die: "feminine", das: "neuter" }[e.art]], head: [], topics: [] });
    }
  }
  const src = { ec: EC.map, zhFreq: EC.zhFreq };
  if (cfg.direct) { src.direct = loadCedict(V3(cfg.direct[0]), lang); src.directName = cfg.direct[1]; inputs.push(V3(cfg.direct[0])); }
  const ldn = new Set(), bad = new Set();
  if (cfg.ldnoobw) { for (const l of fs.readFileSync(V3("ldnoobw", cfg.ldnoobw), "utf8").split("\n")) if (l.trim() && !/\s/.test(l.trim())) ldn.add(fold(l.trim())); inputs.push(V3("ldnoobw", cfg.ldnoobw)); }

  // 同一写法（小写）的所有原形条目
  const byLower = new Map();
  for (const r of stage.lemmas) { const k = r.w.toLowerCase(); (byLower.get(k) || byLower.set(k, []).get(k)).push(r); }
  const lemmas = new Set(byLower.keys());
  const vulgarTag = (r) => (r.tags || []).some((t) => /vulgar|offensive|derogatory/.test(t));
  for (const [k, recs] of byLower) if (ldn.has(fold(k)) && recs.some(vulgarTag)) bad.add(fold(k)); // 两个来源都认定才排除
  const names = new Set(stage.names);

  let queryScores = null;
  let order, auditOrder = [], score = new Map(), cover = null, freqRep = null, accepted = new Set(), rows = [], total = 0, excl = 0;
  const pendingZh = new Set();
  // ---------- T12–T14：一个原形 → 逐条（写法 + 词性）的释义、性别、冠词。选词与输出共用这一份结果（带缓存）----------
  const made = new Map();
  function makeEntries(x) {
    if (made.has(x)) return made.get(x);
    const groups = new Map(); // 写法|词性 → 合并的条目
    for (const r of byLower.get(x) || []) {
      if (!POS[r.pos]) continue;
      let disp = r.w;
      const flags = [];
      if (lang === "la") { // T14：显示词取 head 展开的第一个词，与 canonical 交叉核对；不一致 / 多个 head / 解析失败 → 待审，不写进词库
        const h = (r.head || [])[0] || "";
        const hw = (h.match(/^[^\s(;,]+/) || [""])[0];
        const ok = r.head.length === 1 && hw && fold(hw) === fold(r.w) && (!r.canon.length || r.canon.includes(hw));
        if (ok) disp = hw; else flags.push("长音待审");
      }
      const k = disp + "|" + r.pos;
      const g = groups.get(k) || { disp, pos: r.pos, recs: [], flags: new Set() };
      g.recs.push(r); flags.forEach((f) => g.flags.add(f));
      groups.set(k, g);
    }
    const list = [];
    let first = true;
    for (const g of groups.values()) {
      if (german && !german.includes(x, g.disp, g.pos)) continue;
      const gl = g.recs.flatMap((r) => r.gl.map((s) => s.g));
      if (!gl.length) continue;
      const isForm = formOnly(gl); // Q4-R1：在借原形释义之前判；非独立形式不作独立候选（只在成品阶段排除，不影响选词）
      let formTarget = null;
      // 「apocopic form of suyo」「compound of fare and lo」「contraction of de el」「plural of capello」这类指向别的词的释义：借所指原形的英文释义（只跳一次，不跟链）
      for (const s of gl.slice()) {
        // of 后面跳过 the / infinitive 这类词，取第一个查得到的原形（「compound of the infinitive fare with lo」→ fare）
        const m = s.match(/\b(?:form|spelling|variant|clipping|diminutive|augmentative|synonym|feminine|masculine|plural|contraction|compound)\s+of\s+((?:\p{L}+[\s-]*){1,4})/u);
        const SKIPW = new Set(["the", "a", "an", "infinitive", "gerund", "imperative", "participle", "present", "past", "second", "person", "singular", "plural", "informal", "formal"]);
        const tw = m ? m[1].toLowerCase().split(/[\s-]+/).find((x) => x && !SKIPW.has(x) && byLower.has(x)) : null;
        const tg = tw && tw !== x ? byLower.get(tw) : null;
        if (tg && !formTarget) formTarget = tw;
        if (tg) for (const r of tg) for (const x of r.gl) if (!/\bof\s+\p{L}+$/u.test(x.g) && !gl.includes(x.g)) gl.push(x.g);
      }
      if (isForm && !formTarget) { // 上面的句式没认出原形时（拉丁语的格、人称说明）：取 of 后面第一个查得到的词
        for (const s of gl) { const t = (s.split(/\bof\b/i).slice(1).join(" ").toLowerCase().match(/\p{L}+/gu) || []).find((w) => w !== x && byLower.has(w)); if (t) { formTarget = t; break; } }
      }
      const z = zhFor(g.disp, g.pos, gl, src, first);
      first = false;
      const tags = new Set(g.recs.flatMap((r) => r.tags || []));
      // evidence：原始证据，合并审核不动它（V003-B4-R1）；flags 里的两个临时标记会被审核结论撤掉，不能当依据的长期来源
      g.evidence = [];
      if ([...tags].some((t) => /vulgar|offensive|derogatory/.test(t))) { g.flags.add("不雅候选"); g.evidence.push("维基词典标签"); }
      if (ldn.has(fold(g.disp))) { g.flags.add("LDNOOBW待判"); g.evidence.push("LDNOOBW"); }
      let art = { g: "", art: "", state: "none", via: "" };
      if (g.pos === "noun") {
        art = articleOf(lang, g.recs[0]);
        if (lang !== "la" && art.state.startsWith("unknown")) g.flags.add("冠词待审");
      }
      if (!z.zh.length) g.flags.add("待普查");
      if (!DISPLAY_OK.test(g.disp.normalize("NFC"))) g.flags.add("字符待审"); // 不收进来再被输入清理删字
      // 同形、性别不同的名词（le livre 书 / la livre 磅）：维基词典里是分开的条目，这里合成了一个「写法 + 词性」。
      // 主义项沿用第一条（审核的中文也是按它定的）；冠词和它不同的其余条目记成「另一性别的义项」，带各自的英文释义与机器中文。
      // 机器中文未经审核：只有 review/lexicon/<语种>/gender-senses.tsv 里定了稿的才进成品（见输出段）
      const alts = [];
      if (g.pos === "noun" && lang !== "la" && art.art) {
        const byArt = new Map();
        for (const r of g.recs.slice(1)) {
          const a = articleOf(lang, r);
          if (a.state !== "known" || !a.art || a.art === art.art) continue;
          (byArt.get(a.art) || byArt.set(a.art, []).get(a.art)).push(r);
        }
        for (const [a, recs] of byArt) {
          const en = recs.flatMap((r) => r.gl.map((x) => x.g));
          if (!en.length || formOnly(en)) continue;
          alts.push({ art: a, en: en.slice(0, 4).join(" ; "), zh: zhFor(g.disp, g.pos, en, src, false).zh });
        }
      }
      const G = g.pos === "noun" ? genderOf(g.recs[0]) : null;
      list.push({ rec: g.recs[0], lemma: x, disp: g.disp, pos: g.pos, gender: art.g, hasGender: !!(G && (G.g || G.pl)), art: art.art, artState: art.state, artVia: art.via, en: gl.slice(0, 4).join(" ; "), zh: z.zh, zhVia: z.via, flags: [...g.flags], evidence: g.evidence, formOnly: isForm, formTarget, alts });
    }
    made.set(x, list);
    return list;
  }
  // 审核判为不雅、存疑（词条是否真实存在都不确定）的不进词库；不雅的列进报告，作 T23 屏蔽词表的种子
  const lexOk = (e) => e.zh.length && !e.flags.includes("长音待审") && !e.flags.includes("字符待审") && !e.flags.includes("不雅") && !e.flags.includes("存疑") && /[a-z]/.test(fold(e.disp)[0]);
  // ---------- T19：合并第 3 批审核（review/lexicon/<语种>/dsh-*.tsv + codex-*.tsv；规则见 review/lexicon/README.md）----------
  const review = loadReview(lang, null);
  const usedReview = new Set();
  function applyReview(e) { // 合并规则在 review.mjs 的 mergeEntry（可单测）
    const supplement = german && german.get(e.lemma, e.disp, e.pos);
    if (supplement) return Object.assign({}, e, { zh: supplement.zh, zhVia: "manual-supplement", art: supplement.art,
      gender: { der: "m", die: "f", das: "n" }[supplement.art], hasGender: true,
      artState: "reviewed", artVia: supplement.source, flags: e.flags.filter(f => f !== "待普查" && f !== "冠词待审"),
      formOnly: false });
    const k = keyOf(e.lemma, e.disp, e.pos), ov = review.apply.get(k);
    if (!ov) return e;
    usedReview.add(k);
    return mergeEntry(lang, e, ov);
  }
  const usable = (x) => makeEntries(x).some(lexOk);
  if (!cfg.whitaker) {
    // ---------- T11：选词（与 coverage.py 同口径）----------
    const form2raw = stage.form2;
    const resolve = (w, depth = 0, seen = new Set()) => {
      const out = new Set();
      for (const t of form2raw[w] || []) {
        if (lemmas.has(t)) out.add(t);
        else if (depth < 2 && !seen.has(t)) { seen.add(t); for (const x of resolve(t, depth + 1, seen)) out.add(x); }
      }
      return out;
    };
    const form2 = new Map();
    for (const k of Object.keys(form2raw)) form2.set(k, resolve(k));
    const fl = new Map(), ff = new Map();
    for (const x of lemmas) { const k = fold(x); (fl.get(k) || fl.set(k, new Set()).get(k)).add(x); }
    for (const [k, v] of form2) { const kk = fold(k); const s = ff.get(kk) || ff.set(kk, new Set()).get(kk); for (const x of v) s.add(x); }
    const freqFile = V3(cfg.freq); inputs.push(freqFile);
    for (const line of fs.readFileSync(freqFile, "utf8").split("\n")) {
      const i = line.lastIndexOf(" "); if (i < 0) continue;
      const w = line.slice(0, i).toLowerCase(), c = Number(line.slice(i + 1));
      if (!c) continue;
      if (!ALPHA.test(w) || [...w].length < 2) { excl += c; continue; }
      total += c;
      let cand = new Set(form2.get(w) || []);
      if (lemmas.has(w)) cand.add(w);
      if (!cand.size) { const k = fold(w); cand = new Set([...(ff.get(k) || []), ...(fl.get(k) || [])]); }
      if (!cand.size && (EC.en.has(w) || names.has(w))) { total -= c; excl += c; continue; }
      rows.push({ w, c, cand: [...cand] });
    }
    for (const r of rows) for (const x of r.cand) score.set(x, (score.get(x) || 0) + r.c);
    queryScores = new Map(score); // globally comparable counts before historical selection overrides
    order = [...score.keys()].sort((a, b) => score.get(b) - score.get(a) || (a < b ? -1 : a > b ? 1 : 0));
    auditOrder = order.slice(); // 全量扩词上限模拟不能被人工选词边界截断。
    // 按名次逐个收；跳过：LDNOOBW 屏蔽种子、超长、只有缩写义的条目。达到门槛即停
    const rowsOf = new Map();
    rows.forEach((r, i) => { for (const x of r.cand) (rowsOf.get(x) || rowsOf.set(x, []).get(x)).push(i); });
    const covered = new Uint8Array(rows.length);
    let cum = 0, stop = "target";
    const skipped = { blocked: 0, toolong: 0, abbr: 0, no_zh: 0 };
    // 成品里达不到目标时（屏蔽词、无中文的词扣掉后上限变低）：每多收 1,000 个原形可查率涨不到 0.05 个百分点就停，曲线写进报告由用户定规模
    const curve = [], STEP = 1000, MIN_GAIN = 0.0005;
    let lastCum = 0;
    if (german) {
      // 旧循环用 form2 把 Fahrer 算成 fahren 的覆盖；不再拿这份旧分数决定德语停止线。
      // 基线保留已审核条目和待审记录的历史排序，补词取当前频次；全量缺口另交普查表。
      for (const [x, s] of german.scores) score.set(x, s);
      order = [...new Set([...german.scores.keys(), ...[...german.supplements.values()].map(e => e.lemma)])];
      accepted = new Set(order);
      freqRep = { rule: "冻结历史审核基线 + 逐条人工补词；不按旧 form2 覆盖率提前停止", stop: "review_boundary",
        baseline_lemmas: german.scores.size, supplemental_entries: german.supplements.size,
        note: "基线包含历史待审记录；实际入库仍须通过词性、释义、标记过滤。不是全部源词典已完成语义审查。" };
    } else {
    for (const x of order) {
      if (cum / total >= cfg.target) break;
      if (accepted.size && accepted.size % STEP === 0 && !curve.some((p) => p.n === accepted.size)) {
        curve.push({ n: accepted.size, cov: +(cum / total).toFixed(4) });
        if (cum / total >= 0.9545 && (cum - lastCum) / total < MIN_GAIN) { stop = "diminishing"; break; }
        lastCum = cum;
      }
      if (bad.has(fold(x))) { skipped.blocked++; continue; }
      if ([...x].length > WORD_MAX) { skipped.toolong++; continue; }
      const recs = byLower.get(x);
      if (recs.every((r) => (r.tags || []).some((t) => /abbreviation|acronym|initialism/.test(t)))) { skipped.abbr++; continue; }
      if (!usable(x)) { skipped.no_zh++; pendingZh.add(x); continue; } // 进审核表标「待普查」，不占名额
      accepted.add(x);
      for (const i of rowsOf.get(x) || []) if (!covered[i]) { covered[i] = 1; cum += rows[i].c; }
    }
    const coreN = accepted.size;
    // 领域种子（T01⑤）：kaikki 领域分类或 philosophy / music 话题、语料里出现过、还没收的，按得分取前 DOMAIN_MAX
    const dom = order.filter((x) => !accepted.has(x) && !bad.has(fold(x)) && byLower.get(x).some((r) => r.dom || (r.topics || []).some((t) => /philosophy|music|literature|art/.test(t)))).slice(0, DOMAIN_MAX);
    for (const x of dom) accepted.add(x);
    freqRep = { target: cfg.target, stop, core_lemmas: coreN, core_coverage_in_loop: +(cum / total).toFixed(4), domain_seed_added: dom.length, skipped, curve };
    }
    cover = true;
  } else {
    // ---------- 拉丁语：Whitaker FREQ（T01②）+ DCC 核心词表作种子；不套 σ 门槛 ----------
    const wf = V3("whitakers/DICTLINE.GEN"), dcc = V3("dcc/latin-core-list.csv"); inputs.push(wf, dcc);
    const WPOS = { N: "noun", V: "verb", ADJ: "adj", ADV: "adv", PREP: "prep", CONJ: "conj", PRON: "pron", INTERJ: "intj", NUM: "num" };
    const RANK = { A: 0, B: 1, C: 2, D: 3, E: 4, F: 5 };
    const stem = new Map(); // stem|pos → 最好的 FREQ
    for (const l of fs.readFileSync(wf, "utf8").split("\n")) {
      if (l.length < 110) continue;
      const s1 = fold(l.slice(0, 19).trim()), p = WPOS[l.slice(76, 100).trim().split(/\s+/)[0]], fq = l.slice(100, 109).trim().split(/\s+/)[3];
      if (!s1 || !p || RANK[fq] == null) continue;
      const k = s1 + "|" + p;
      if (!stem.has(k) || RANK[fq] < RANK[stem.get(k)]) stem.set(k, fq);
    }
    const dccRank = new Map();
    for (const l of fs.readFileSync(dcc, "utf8").split("\n").slice(1)) {
      const m = l.match(/^"([^"]*)"|^([^,]*)/); if (!m) continue;
      const head = fold((m[1] || m[2] || "").split(/\s+/)[0].replace(/[,;]/g, ""));
      const rk = Number(l.split(",").pop());
      if (head && rk && !dccRank.has(head)) dccRank.set(head, rk);
    }
    // 原形 ↔ Whitaker：原形去长音后以词干开头、长出的部分 ≤ 2 个字母、词性相同（rosa ← ros，amo ← am，liber ← liber）
    const wfreq = new Map();
    for (const [lw, recs] of byLower) {
      const f = fold(lw);
      for (const r of recs) {
        for (let k = Math.max(1, f.length - 2); k <= f.length; k++) {
          const fq = stem.get(f.slice(0, k) + "|" + r.pos);
          if (fq && (!wfreq.has(lw) || RANK[fq] < RANK[wfreq.get(lw)])) wfreq.set(lw, fq);
        }
      }
    }
    const keyOf = (x) => [RANK[wfreq.get(x)] ?? 9, dccRank.get(fold(x)) ?? 1e6];
    for (const x of lemmas) if (["A", "B", "C"].includes(wfreq.get(x)) || dccRank.has(fold(x))) accepted.add(x);
    order = [...accepted].sort((a, b) => { const ka = keyOf(a), kb = keyOf(b); return ka[0] - kb[0] || ka[1] - kb[1] || (a < b ? -1 : 1); });
    order.forEach((x, i) => score.set(x, order.length - i));
    const byFreq = {}; for (const x of accepted) { const f = wfreq.get(x) || "DCC"; byFreq[f] = (byFreq[f] || 0) + 1; }
    const accFold = new Set([...accepted].map(fold));
    const dccHit = [...dccRank.keys()].filter((h) => accFold.has(h)).length;
    freqRep = { rule: "Whitaker FREQ A–C ∪ DCC 核心词表（线待用户定，T11）", lemmas_by_freq: byFreq, whitaker_stems: stem.size, dcc_headwords: dccRank.size, dcc_matched: dccHit };
  }

  // Query-only repair builds retain the historical candidate selection, while recomputing morphology/scores.
  // This is an explicit baseline mode, not the new T19 admission policy.
  if (process.env.BACKRONYM_SELECTION_BASELINE && !german) {
    const selectionFile = path.join(process.env.BACKRONYM_SELECTION_BASELINE, lang, "candidates.tsv");
    inputs.push(selectionFile);
    const keys = fs.readFileSync(selectionFile, "utf8").split("\n").slice(1).filter(Boolean).map(line => line.split("\t")[0]);
    order = [...new Set(keys)]; accepted = new Set(order);
    freqRep = { ...freqRep, stop: "query_repair_frozen_candidates" };
  }

  // 扩词只读显式审核名单；不降低原收录线，不重新分片或自动收模拟候选。
  const extraFile = path.join(root, "review/lexicon", lang, "extra-lemmas.json");
  let extraN = 0;
  if (fs.existsSync(extraFile)) {
    inputs.push(extraFile);
    const extra = JSON.parse(fs.readFileSync(extraFile, "utf8"));
    if (!Array.isArray(extra) || new Set(extra).size !== extra.length) throw new Error("扩词名单须为不重复的原形数组");
    for (const x of extra) {
      if (!byLower.has(x) || !order.includes(x)) throw new Error("扩词原形不在冻结语料候选内：" + x);
      for (const e of makeEntries(x)) {
        const ov = review.apply.get(keyOf(e.lemma, e.disp, e.pos));
        if (!excludedPos(e.pos) && !e.formOnly && !(ov && (ov["中文释义"] || /存疑|误收|变形条目/.test(ov["标记"] || ""))))
          throw new Error("扩词未完成逐词审核：" + x + " / " + e.pos);
      }
      if (!accepted.has(x)) { accepted.add(x); extraN++; }
    }
  }

  // ---------- 汇总（条目来自 makeEntries，与选词时同一份）----------
  const entries = [], queue = [], sourceEntries = []; // sourceEntries：合并审核之前的词条（候选表写它）
  const tally = { art: {}, via: {}, nouns: 0, nouns_gender: 0, no_zh: 0, latin_pending: 0, vulgar_flag: 0 };
  for (const x of order.filter((y) => accepted.has(y) || pendingZh.has(y))) {
    for (const e0 of makeEntries(x)) {
      sourceEntries.push(Object.assign({}, e0, { score: score.get(x) || 0 }));
      const e = applyReview(Object.assign({}, e0, { score: score.get(x) || 0 }));
      if (e.pos === "noun") { tally.nouns++; if (e.hasGender) tally.nouns_gender++; if (lang !== "la") tally.art[e.artState] = (tally.art[e.artState] || 0) + 1; }
      if (e.flags.includes("不雅候选")) tally.vulgar_flag++;
      if (e.flags.includes("待普查")) tally.no_zh++;
      if (e.flags.includes("长音待审")) tally.latin_pending++;
      tally.via[e.zhVia || "none"] = (tally.via[e.zhVia || "none"] || 0) + 1;
      entries.push(e);
      if (e.flags.length && !excludedPos(e.pos) && !e.formOnly) queue.push(e);
    }
  }

  // ---------- T15：输出 ----------
  // 词库只收能用的：有中文、不待审长音。同一写法多个词性合成一条（与英文词库一致：词性组用 |，组内义项用全角逗号）
  // 先判入库资格，再按最终词性归并（SCOPE-R4）：同词性的多条义项取并集，不丢整条
  const grouped = groupByDisplay(entries.filter((e) => lexOk(e) && !excludedPos(e.pos) && !e.formOnly), (p) => POS[p]);
  // 另一性别的义项（T22 的数据契约）：定了稿的追加成新的名词组，冠词列按名词组的顺序用 | 对齐——
  //   ["livre", "n.书，书籍|n.磅", "le|la", ""]。只有一个名词组的词照旧只写一个冠词。
  // 定稿表 gender-senses.tsv：词 显示 冠词 中文 状态（状态 = 通过 才用）；候选表 gender-senses.candidates.tsv 每次重写，供定稿与审核用
  const gsFile = path.join(root, "review/lexicon", lang, "gender-senses.tsv");
  const gsOk = new Map();
  if (fs.existsSync(gsFile)) {
    inputs.push(gsFile);
    fs.readFileSync(gsFile, "utf8").split("\n").slice(1).forEach((line, n) => {
      if (!line.trim()) return;
      const c = line.split("\t");
      if (c.length < 5) throw new Error(`gender-senses.tsv 第 ${n + 2} 行不是 5 列`);
      if (c[4].trim() !== "通过") return;
      const zh = c[3].split(/[，,]/).map((x) => x.trim()).filter(Boolean).slice(0, 4);
      if (!zh.length) throw new Error(`gender-senses.tsv 第 ${n + 2} 行状态是通过但没有中文`);
      gsOk.set(c[1] + "\u0001" + c[2], zh);
    });
  }
  const altCands = [], gsUsed = new Set();
  const altOf = new Map(); // 显示词 → [{ art, zh }]
  for (const e of entries) {
    if (e.pos !== "noun" || !e.alts || !e.alts.length || !lexOk(e) || excludedPos(e.pos) || e.formOnly) continue;
    for (const a of e.alts) {
      if (a.art === e.art) continue; // 审核改过主义项的冠词后可能变成同一个
      const k = e.disp + "\u0001" + a.art, zh = gsOk.get(k);
      altCands.push([e.lemma, e.disp, e.art, e.zh.join("，"), a.art, a.en, a.zh.join("，"), zh ? zh.join("，") : "", e.score]);
      if (zh) { gsUsed.add(k); (altOf.get(e.disp) || altOf.set(e.disp, []).get(e.disp)).push({ art: a.art, zh }); }
    }
  }
  const gsUnused = [...gsOk.keys()].filter((k) => !gsUsed.has(k)).map((k) => k.split("\u0001").join(" / "));
  for (const o of grouped) {
    const extra = (altOf.get(o.disp) || []).filter((a) => o.art && a.art !== o.art);
    o.groups = o.groups.map((g) => g.pos + g.zh.join("，"));
    if (extra.length && o.groups.some((g) => g.startsWith("n."))) {
      for (const a of extra) o.groups.push("n." + a.zh.join("，"));
      o.art = [o.art].concat(extra.map((a) => a.art)).join("|");
      o.genderSenses = extra.length;
    }
  }
  const out = new Map(grouped.map((o) => [o.disp, o]));
  const eraNote = new Map(entries.filter((e) => e.flags.includes("中古词") && lexOk(e) && !excludedPos(e.pos) && !e.formOnly).map((e) => [e.disp, "中古"]));
  const RANKPOS = { "adj.": 0, "n.": 1 };
  const posOf = (s) => s.slice(0, s.indexOf(".") + 1);
  const words = {};
  const list = [...out.values()].sort((a, b) => b.score - a.score || (a.disp < b.disp ? -1 : 1));
  const dispOfLemma = new Map();
  for (const o of list) {
    const letter = fold(o.disp)[0];
    if (!/[a-z]/.test(letter)) continue;
    if (!dispOfLemma.has(o.lemma)) dispOfLemma.set(o.lemma, o.disp);
    // 与英文词库同一规则：形容词 > 名词 > 其余；以动词为主的词（kaikki 第一个词性是动词，如 savoir）动词义排第一
    const verbFirst = posOf(o.groups[0]) === "v.";
    const rk = (g) => (verbFirst && posOf(g) === "v." ? -1 : RANKPOS[posOf(g)] ?? 5);
    o.groups.sort((a, b) => rk(a) - rk(b));
    const row = [o.disp, o.groups.join("|"), lang === "la" ? "" : o.art, eraNote.get(o.disp) || ""]; // 第 4 列注释：目前只记年代（中古）
    (words[letter] || (words[letter] = [])).push(row);
  }
  // 变形 → 原形索引（Q10）：只收语料里出现过、本身不是词库词、指向词库原形的词形（拉丁语没有语料，先不建，见报告）
  // 格式：{ 原形显示: "变形 变形 …" }（按原形分组，比逐个「变形: 原形」省一半；运行时反建成 变形 → 原形）
  const formsBy = new Map(), formSet = new Set();
  let formsN = 0;
  // V003-B4-R10：变形要对上「原形 + 词性」才进索引。stage.form2pos 记着每个变形是哪个原形、哪个词性的变形（bist → sein｜动词，mich → ich｜代词）；
  // 只有那一条（原形 + 原始词性）真的进了词库，才把变形挂到它的显示词下。原来只按原形写法找显示词，动词 sein 不在词库时 bist 就挂到了名词 Sein 上。
  // 对不上的变形不进索引（查不到），不借同形词的释义。
  const keptDisp = new Map(); // 原形|原始词性 → 显示词
  for (const e of entries) {
    if (!lexOk(e) || excludedPos(e.pos) || e.formOnly) continue;
    const k = e.lemma + "|" + (e.posFrom || e.pos);
    if (!keptDisp.has(k) && out.has(e.disp)) keptDisp.set(k, e.disp);
  }
  const form2posRaw = stage.form2pos || {};
  const form2pos = new Proxy({}, { get: (_, w) => (typeof w === "string" && Object.hasOwn(form2posRaw, w) ? form2posRaw[w] : undefined) }); // 词形可能叫 constructor：只认自己的键

  const foldedForms = new Map(); // 语料里没带变音符的写法 → 索引里的写法
  for (const k of Object.keys(form2posRaw)) { const f = fold(k); (foldedForms.get(f) || foldedForms.set(f, []).get(f)).push(k); }
  // 变形 → 显示词：直接的「原形|词性」；指向的还是变形时再跟一层（与选词时的 resolve 同样只跟两层）
  const hasRec = (t, pos) => (byLower.get(t) || []).some((r) => r.pos === pos);
  const dispsOf = (w, depth = 0, seen = new Set(), requiredPos = null) => {
    const res = new Set();
    for (const pair of form2pos[w] || []) {
      const pairPos = pair.slice(pair.lastIndexOf("|") + 1);
      if (!POS[pairPos] || excludedPos(pairPos) || (requiredPos && pairPos !== requiredPos)) continue;
      const t = pair.slice(0, pair.lastIndexOf("|"));
      if (keptDisp.has(pair)) res.add(keptDisp.get(pair));
      // 指向的「写法 + 词性」不是一个原形条目（touchée → touché｜动词，而 touché 只有形容词、名词条目）：它自己还是别的词的变形，再跟一层（→ toucher）。
      // 是原形条目但没进词库的（功能词、被审核排除的）不跟：那是真的查不到
      else if (!hasRec(t, pair.slice(pair.lastIndexOf("|") + 1)) && depth < 2 && !seen.has(t)) { seen.add(t); for (const d of dispsOf(t, depth + 1, new Set(seen), pairPos)) res.add(d); }
    }
    return res;
  };
  const allowFile = path.join(root, "review/lexicon", lang, "form-allow.tsv"); // 两列：写法、说明；# 开头是注释
  const formAllow = new Set(fs.existsSync(allowFile) ? fs.readFileSync(allowFile, "utf8").split("\n").filter((x) => x.trim() && !x.startsWith("#")).map((x) => x.split("\t")[0].trim().toLowerCase()) : []);
  const funcOwn = (w) => (byLower.get(w) || []).some((x) => excludedPos(x.pos)) && !formAllow.has(w);
  let formsDroppedIdentity = 0;
  for (const r of rows) {
    if (dispOfLemma.has(r.w) || r.c < MIN_FORM_COUNT) continue; // 语料里出现不到 MIN_FORM_COUNT 次的变形不进索引（体积，见报告）
    if (!r.cand.some((x) => dispOfLemma.has(x))) continue;
    // 这个写法自己就是功能词（法语 de、德语 mich 这类有自己的介词 / 代词条目）：范围外，查不到，不借别的词的释义（de 另被记成 dame 的缩写）
    // 例外：form-allow.tsv 里人工放行的写法（vu 既是介词也是 voir 的分词，veces 是 vez 的复数）——实词读法常见，照「原形 + 词性」进索引
    if (funcOwn(r.w)) { formsDroppedIdentity++; continue; }
    let tg = dispsOf(r.w);
    if (!tg.size && !form2pos[r.w]) for (const k of foldedForms.get(fold(r.w)) || []) if (!funcOwn(k)) for (const d of dispsOf(k)) tg.add(d); // 语料写法少了变音符；补回去的写法是功能词（nós → nos）同样不借
    if (!tg.size) { formsDroppedIdentity++; continue; }
    for (const d of tg) (formsBy.get(d) || formsBy.set(d, []).get(d)).push(r.w);
    formSet.add(r.w); formsN++;
  }
  // Q4-R1：不再独立收录的变形条目，指得出原形且原形在词库里的，补进变形索引（打 porle 仍能找到 porre）
  let formsFromEntries = 0;
  const formCounts = new Map(rows.map(r => [r.w, r.c]));
  for (const e of entries) {
    if (!e.formOnly || dispOfLemma.has(e.lemma)) continue;
    if (lang !== "la" && (formCounts.get(e.lemma) || 0) < MIN_FORM_COUNT) continue;
    if (funcOwn(e.lemma)) continue; // 与上面同一条守卫：西语 nos（代词）不借名词 no 的复数
    // 同样按「原形 + 词性」对：索引里记着的，加上释义里指出的原形（按这个变形条目自己的词性）
    const targets = dispsOf(e.lemma);
    const own = e.formTarget && keptDisp.get(e.formTarget + "|" + (e.posFrom || e.pos));
    if (own) targets.add(own);
    if (!targets.size) continue;
    for (const d of targets) {
      const a = formsBy.get(d) || formsBy.set(d, []).get(d);
      if (!a.includes(e.lemma)) a.push(e.lemma);
    }
    if (!formSet.has(e.lemma)) { formSet.add(e.lemma); formsN++; formsFromEntries++; }
  }
  // One-letter accented forms (e.g. è) were excluded by the selection corpus filter.
  // Admit only source-attested, POS-resolved forms of retained lexical lemmas.
  for (const w of Object.keys(form2posRaw)) {
    if (lang === "la" || [...w].length !== 1 || dispOfLemma.has(w) || funcOwn(w)) continue;
    const targets = dispsOf(w);
    for (const d of targets) {
      const a = formsBy.get(d) || formsBy.set(d, []).get(d);
      if (!a.includes(w)) a.push(w);
    }
    if (targets.size && !formSet.has(w)) { formSet.add(w); formsN++; }
  }
  // A known but omitted lexical lemma must not silently borrow a different accented lemma's meaning.
  const lookupGuards = Object.create(null), outputFold = new Set([...out.keys()].map(fold));
  for (const [lw, recs] of byLower) if (!dispOfLemma.has(lw) && outputFold.has(fold(lw)) &&
      recs.some(r => !excludedPos(r.pos) && POS[r.pos] && !formOnly(r.gl.map(g => g.g)))) lookupGuards[lw] = true;
  const formRanks = Object.create(null);
  for (const e of entries) if (out.has(e.disp)) formRanks[e.disp] = Math.max(formRanks[e.disp] || 0, (queryScores ? queryScores.get(e.lemma) : e.score) || 0);
  const forms = Object.fromEntries([...formsBy].map(([d, fs_]) => [d, fs_.join(" ")]));
  // ---------- 覆盖率按当前收录范围重算（11-10 用户定）----------
  // 分母去掉范围外的词形：它的全部候选原形都只有功能词性或变形条目（le、de、que 这类不再是命名候选，不该算作「查不到」）。
  // 分子：成品原形或实际变形索引可命中（包含频次下限）。另按新停止规则模拟继续扩词：达到基本线 95.45% 之后，连续两批（每批 1,000 个原形）收益都低于 0.05 个百分点才停。
  // 只报告、不自动扩词：新增的原形没经过第 3 批审核，要扩得另走审核（「领域补充另审」「已审核的有效词不裁」）。
  let scopeCov = null;
  if (cover) {
    const fo = new Map();
    const funcOnly = (x) => { if (!fo.has(x)) { const recs = byLower.get(x) || []; fo.set(x, recs.length > 0 && recs.every((r) => excludedPos(r.pos) || formOnly(r.gl.map((s) => s.g)))); } return fo.get(x); };
    const actualLookup = new Set([...list.map(o => fold(o.disp)), ...[...formSet].map(fold)]);
    let tot = 0, cov = 0, out_scope = 0;
    // V003-B4-R10：另算一份按「原形 + 词性」定范围的口径。一个词形如果索引里记着的全是功能词性的变形（les → le｜冠词、mich → ich｜代词），
    // 它就在范围外——即使同写法有个实义词（音符 la、名词 Ich）。原口径把这类词形算在范围内，过去靠错误映射「命中」，映射改对以后会显得掉了一截
    const pairsOf = (w, depth = 0, seen = new Set([w])) => (form2pos[w] || []).flatMap((pair) => { const t = pair.slice(0, pair.lastIndexOf("|")); if (lemmas.has(t) || depth >= 2 || seen.has(t)) return [pair]; seen.add(t); return pairsOf(t, depth + 1, seen); });
    const funcForm = (w) => { // 这个写法自己的条目、它作为变形指向的条目，全是功能词性（或只是变形说明）
      const ps = pairsOf(w), own = byLower.get(w) || [];
      return own.length + ps.length > 0 && own.every((r) => excludedPos(r.pos) || formOnly(r.gl.map((x) => x.g))) && ps.every((pair) => excludedPos(pair.slice(pair.lastIndexOf("|") + 1)));
    };
    let tot2 = 0, cov2 = 0;
    const open = []; // 还没覆盖的范围内词形
    rows.forEach((r, i) => {
      if (r.cand.length && r.cand.every(funcOnly)) { out_scope += r.c; return; }
      tot += r.c;
      const hit = actualLookup.has(fold(r.w));
      if (hit) cov += r.c; else open.push(i);
      if (!funcForm(r.w)) { tot2 += r.c; if (hit) cov2 += r.c; }
    });
    const rowsOfOpen = new Map();
    for (const i of open) for (const x of rows[i].cand) (rowsOfOpen.get(x) || rowsOfOpen.set(x, []).get(x)).push(i);
    const done = new Uint8Array(rows.length);
    let cum = cov, added = 0, last = cov, low = 0, stopAt = null;
    const sim = [];
    for (const x of auditOrder) {
      if (dispOfLemma.has(x) || funcOnly(x) || bad.has(fold(x)) || [...x].length > WORD_MAX || !rowsOfOpen.has(x)) continue;
      for (const i of rowsOfOpen.get(x)) if (!done[i]) { done[i] = 1; cum += rows[i].c; }
      added++;
      if (added % 1000 === 0) {
        const gain = (cum - last) / tot; last = cum;
        sim.push({ added, cov: +(cum / tot).toFixed(4), gain: +gain.toFixed(5) });
        low = gain < 0.0005 ? low + 1 : 0;
        if (!stopAt && cum / tot >= 0.9545 && low >= 2) stopAt = { added, cov: +(cum / tot).toFixed(4) };
      }
    }
    scopeCov = { note: "分母去掉范围外的词形（功能词、变形条目）；模拟部分是上限估计（没核中文是否可用），且新增原形未经审核，只报告不自动扩词",
      measurement: "成品 words + forms 去变音符精确查询；非界面验收", tokens_hit: cov, tokens_in_scope: tot, tokens_out_of_scope: out_scope, coverage_now: +(cov / tot).toFixed(4), coverage_now_by_lemma_pos: +(cov2 / tot2).toFixed(4), tokens_in_scope_by_lemma_pos: tot2, note_by_lemma_pos: "分母再去掉「索引里只记为功能词变形」的词形（R10）；未经用户确认为验收口径", baseline: 0.9545, target: cfg.target,
      baseline_reached_now: cov / tot >= 0.9545, target_reached_now: cov / tot >= cfg.target,
      ceiling_if_all_lemmas_added: +(cum / tot).toFixed(4), lemmas_addable: added,
      stop_rule: "达到基本线后连续两批收益 < 0.05 个百分点", simulated_stop: stopAt, first_batches: sim.slice(0, 6) };
  }
  // 断词点（T16 / T42 同法）：10 个字母以上的词，用该语种的 TeX 模式（hyphenmins 左右各 2）
  const hyph = {};
  const patFile = V3("tex-hyphen", cfg.hyph + ".pat.txt"); inputs.push(patFile);
  const tree = new Map();
  for (const pat of fs.readFileSync(patFile, "utf8").split(/\s+/).filter(Boolean)) {
    const letters = pat.replace(/[0-9]/g, ""), vals = new Array([...letters].length + 1).fill(0);
    let k = 0; for (const ch of pat) { if (/[0-9]/.test(ch)) vals[k] = Number(ch); else k++; }
    tree.set(letters, vals);
  }
  const hyphenate = (word) => {
    const w = [".", ...word, "."], vals = new Array(w.length + 1).fill(0);
    for (let i = 0; i < w.length; i++) for (let j = i + 1; j <= w.length; j++) {
      const v = tree.get(w.slice(i, j).join("")); if (v) v.forEach((x, k) => { if (x > vals[i + k]) vals[i + k] = x; });
    }
    const res = []; const n = w.length - 2;
    for (let c = 2; c <= n - 2; c++) if (vals[c + 1] % 2) res.push(c);
    return res;
  };
  for (const o of list) {
    const lw = o.disp.toLowerCase().normalize("NFC");
    const key = lang === "la" ? fold(lw) : lw; // 拉丁语模式不带长音
    if ([...key].length > 10) hyph[key] = hyphenate(key);
  }

  // ---------- 覆盖报告（②：对冻结全量表逐个词形到成品里实际查询，按频次加权）----------
  let rep2 = null;
  if (cover) {
    const lexFold = new Set(list.map((o) => fold(o.disp)));
    const formFold = new Set([...formSet].map(fold));
    let hit = 0, hitLemmaOnly = 0;
    const missBy = {}, miss = [];
    for (const r of rows) {
      const f = fold(r.w);
      if (lexFold.has(f) || formFold.has(f)) hit += r.c;
      else {
        // 没覆盖的原因：kaikki 查不到原形 / 原形被屏蔽种子拦下 / 原形没有中文（待普查）/ 排在收录线之后 / 变形频次低于索引下限
        const why = !r.cand.length ? "无原形" : r.cand.some((x) => bad.has(fold(x))) ? "屏蔽" : r.cand.some((x) => pendingZh.has(x)) ? "无中文" : r.cand.some((x) => dispOfLemma.has(x)) ? "索引下限" : "收录线外";
        missBy[why] = (missBy[why] || 0) + r.c;
        if (miss.length < 400) miss.push([r.w, r.c, why]);
      }
      if (lexFold.has(f)) hitLemmaOnly += r.c;
    }
    var uncovered = { share_by_reason: Object.fromEntries(Object.entries(missBy).map(([k, v]) => [k, +(v / total).toFixed(4)])), top: miss.slice(0, 40) };
    rep2 = { "②成品可查率（带变形索引）": +(hit / total).toFixed(4), "只靠原形的可查率": +(hitLemmaOnly / total).toFixed(4), "达标 2σ 95.45%": hit / total >= 0.9545, "目标 2.5σ 98.76%": hit / total >= 0.9876, corpus_tokens: total, excluded_tokens: excl, uncovered };
  }
  const nouns = entries.filter((e) => e.pos === "noun");
  const header = `/* 词库由 scripts/build-lexicon.mjs 生成（v00.03.00 管线生成，已应用审核文件），勿手改。语种：${cfg.name}
数据来源（许可整理见发布前 T07；来源地址为纯文本）：
- 维基词典（经 kaikki.org 抽取），CC BY-SA 4.0 / GFDL：kaikki.org/dictionary/${cfg.name}/
- ECDICT（英 → 中），MIT，© 2025 Linwei：github.com/skywind3000/ECDICT
${cfg.direct ? (lang === "de" ? "- HanDeDict（德 → 中，反查），CC BY-SA 3.0，Gábor L Ugray 与原始团队：handedict.zydeo.net\n" : "- CFDICT（法 → 中，反查），CC BY-SA 3.0：chine.in\n") : ""}${cfg.freq ? "- FrequencyWords（选词频次），CC BY-SA 4.0，Hermit Dave：github.com/hermitdave/FrequencyWords\n" : ""}${cfg.whitaker ? "- Whitaker's Words（FREQ 等级），William Whitaker：github.com/mk270/whitakers-words\n- Dickinson College Commentaries 拉丁语核心词表，CC BY-SA 3.0：dcc.dickinson.edu\n" : ""}- 断词点：TeX ${cfg.hyph} 连字符模式（hyph-utf8，github.com/hyphenation/tex-hyphen）
改编说明：据上述数据筛选原形、合并变形、把英文释义经 ECDICT 转为中文、按规则生成冠词。
*/
`;
  // BACKRONYM_LEXICON_OUT：成品、候选表、报告都写到别的目录（隔离核对用；输入仍读正式的缓存与审核文件，不碰正式成品）
  const OUT_ROOT = process.env.BACKRONYM_LEXICON_OUT;
  // T19（2026-11-11）：包内西文词包改由 scripts/t19/build-packs.mjs 从已复审的新范围词库生成；本脚本是旧管线，只作隔离核对。
  if (!OUT_ROOT) throw new Error("旧管线不再写入正式词包：正式词包用 node scripts/t19/build-packs.mjs 生成；隔离核对请设 BACKRONYM_LEXICON_OUT=<目录>");
  const outDir = OUT_ROOT ? path.join(OUT_ROOT, "lang", lang) : path.join(root, "app/assets/lang", lang);
  fs.mkdirSync(outDir, { recursive: true });
  const L = JSON.stringify(lang);
  const js = header + `window.LANGPACK.put(${L},"words",${JSON.stringify(words)});\nwindow.LANGPACK.put(${L},"forms",${JSON.stringify(forms)});\nwindow.LANGPACK.put(${L},"formRanks",${JSON.stringify(formRanks)});\nwindow.LANGPACK.put(${L},"lookupGuards",${JSON.stringify(lookupGuards)});\nwindow.LANGPACK.put(${L},"hyph",${JSON.stringify(hyph)});\n`;
  fs.writeFileSync(path.join(outDir, "words.js"), js);

  const revDir = OUT_ROOT ? path.join(OUT_ROOT, "review", lang) : path.join(root, "review/lexicon", lang);
  fs.mkdirSync(revDir, { recursive: true });
  const tsvCols = ["词", "显示", "词性", "性别", "冠词", "冠词判定", "判定来源", "英文释义", "中文释义", "释义来源", "标记", "得分", "原始依据", "形态"]; // 原始依据：屏蔽词表的第二依据（build-block.mjs），合并前后不变
  const toTsv = (list) => [tsvCols.join("\t")].concat(list.map((e) => [e.lemma, e.disp, e.pos, e.gender, e.art, e.artState, e.artVia, e.en, e.zh.join("，"), e.zhVia, e.flags.join(" "), e.score, (e.evidence || []).join(" "), e.formOnly ? "变形条目" : ""].map((v) => String(v).replace(/[\t\n\r]/g, " ")).join("\t"))).join("\n") + "\n";
  // candidates.tsv 是**合并审核之前**的候选表：审核文件的键（词 + 显示 + 词性）、分片、格式检查、审核工具、屏蔽词生成都以它为准，
  // 合并不能改写它（否则改过词性或写法的词条键就对不上了）。合并后的逐条结果另写 merged.tsv，供人工查看。
  fs.writeFileSync(path.join(revDir, "candidates.tsv"), toTsv(sourceEntries));
  fs.writeFileSync(path.join(revDir, "merged.tsv"), toTsv(entries));
  fs.writeFileSync(path.join(revDir, "gender-senses.candidates.tsv"), ["词\t显示\t主义项冠词\t主义项中文\t冠词\t英文释义\t机器中文\t定稿中文\t得分"].concat(altCands.sort((x, y) => y[8] - x[8]).map((r) => r.map((v) => String(v).replace(/[\t\n\r]/g, " ")).join("\t"))).join("\n") + "\n");
  const report = {
    lang, generated_by: "scripts/build-lexicon.mjs", note: "已应用审核文件；语义验收状态见 Q4 报告；②是字幕语料上的代理指标，不等于真实用户概率（PLAN 覆盖率统计规则）",
    scope: { version: SCOPE_VERSION, excluded_word_pos: entries.filter(e => excludedPos(e.pos)).length, excluded_form_entries: entries.filter((e) => e.formOnly && !excludedPos(e.pos)).length, form_entries_to_forms_index: formsFromEntries, forms_dropped_no_matching_pos: formsDroppedIdentity, note: "按复审后词性过滤；原始候选与历史修订保留。旧语料覆盖率不作为新命名范围的验收线。" },
    selection: freqRep, reviewed_extra_lemmas: extraN, coverage_in_current_scope: scopeCov,
    lemmas_selected: accepted.size, entries_word_pos: entries.length, lexicon_rows: list.length, forms_index: formsN, hyph_words: Object.keys(hyph).length,
    coverage: rep2,
    "③领域清单覆盖率": "待人工清单（文学 / 哲学 / 艺术各 200 词，T01⑤：标签只能当种子）",
    nouns: nouns.length, gender_coverage: nouns.length ? +(tally.nouns_gender / tally.nouns).toFixed(4) : null,
    article_states: tally.art,
    gloss_via: tally.via, "中转率（经英语）": +((tally.via.en || 0) / entries.length).toFixed(4),
    "待普查（无中文）": tally.no_zh, "冠词待审": queue.filter((e) => e.flags.includes("冠词待审")).length, "长音待审": tally.latin_pending, "字符待审": entries.filter((e) => e.flags.includes("字符待审")).length, "不雅候选（标签）": tally.vulgar_flag, review_queue: queue.length,
    review: Object.assign({}, review.stats, { applied_entries: usedReview.size, unmatched: [...review.apply.keys()].filter((k) => !usedReview.has(k)).map((k) => k.split("\u0001").join(" / ")).slice(0, 50), doubts: review.doubts.length, format_problems: review.problems.length }),
    reviewed_vulgar: entries.filter((e) => e.flags.includes("不雅")).map((e) => e.disp),
    gender_senses: { candidates: altCands.length, approved_in_lexicon: [...altOf.values()].reduce((n, v) => n + v.length, 0), approved_unmatched: gsUnused, note: "同形、性别不同的名词义项；机器中文未经审核，只收 gender-senses.tsv 里定稿的" },
        same_pos_merges: grouped.flatMap((o) => o.merges), // 同一写法、同一最终词性的多条已归并义项（over_limit：超过 4 个没放进去的，供人工看）
    merge_conflicts: grouped.flatMap((o) => o.conflicts), // 归并时冠词不一致的，留用先出现的那个，需人工裁定
    longest: list.map((o) => o.disp).sort((a, b) => [...b].length - [...a].length).slice(0, 5),
    words_js_bytes: Buffer.byteLength(js),
    inputs_sha256: Object.fromEntries(inputs.map((f) => [path.relative(C(), f), sha(f)])),
  };
  fs.writeFileSync(path.join(revDir, "report.json"), JSON.stringify(report, null, 1) + "\n");
  console.log(lang, `词库 ${list.length} 条 / 原形 ${accepted.size} / 变形索引 ${formsN} / ${(report.words_js_bytes / 1048576).toFixed(2)} MB`, rep2 ? rep2["②成品可查率（带变形索引）"] : "", `${((Date.now() - t0) / 1000).toFixed(0)}s`);
}
