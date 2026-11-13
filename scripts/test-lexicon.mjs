// v00.03.00 第 2 批（T13 / T15 / T16）：冠词规则、各语言规则对象、生成的西文词库结构。`npm test`
// 冠词用例用仿 kaikki 字段的夹具（不依赖本地 4.6 GB 原始数据）；词库结构检查读仓库里已生成的 app/assets/lang/<xx>/words.js。
import assert from "node:assert/strict";
import fs from "node:fs";
import { legacyDir } from "./legacy-packs.mjs";
const LEGACY = legacyDir(); // 旧管线词包：T19 接入后不再随包，从固定提交取出（见 legacy-packs.mjs）
import vm from "node:vm";
import { articleOf, genderOf } from "./lexicon/article.mjs";
import { zhFor, loadCedict } from "./lexicon/zh.mjs";
import { loadReview, keyOf, normFlags, mergeEntry, groupByDisplay, reviewedDisplay } from "./lexicon/review.mjs";
import os from "node:os";
import path from "node:path";
{
  const e = {disp:"ō̆he",pos:"intj",flags:["字符待审","长音待审"],zh:["喂"]};
  assert.equal(mergeEntry("la", structuredClone(e), {显示:"ŏhē"}).disp, "ŏhē");
  assert.deepEqual(mergeEntry("la", structuredClone(e), {显示:"ŏhē"}).flags, []);
  assert.throws(() => mergeEntry("la", structuredClone(e), {显示:"alius"}), /显示订正/);
  assert.throws(() => mergeEntry("la", structuredClone(e), {显示:"o he"}), /显示订正/);
  assert.equal(mergeEntry("la", structuredClone(e), {标记:"存疑：变形条目"}).formOnly, true);
}

// ---------- T13：冠词（PLAN T13 列出的验收用例）----------
const n = (w, extra = {}) => ({ w, pos: "noun", tags: [], head: [w], ...extra });
const art = (lang, rec) => articleOf(lang, rec);
// 西语：先定重音，再按性别类别定冠词
assert.equal(art("es", n("agua", { tags: ["feminine"], ipa: ["/ˈaɡwa/"] })).art, "el", "agua → el（首音节重读的阴性词）");
assert.equal(art("es", n("abeja", { tags: ["feminine"], ipa: ["/aˈbexa/"] })).art, "la", "abeja → la");
const arnica = art("es", n("árnica", { tags: ["feminine"] }));
assert.equal(arnica.art, "el", "árnica 缺 IPA：拼写规则补判 → el"); assert.equal(arnica.via, "spell");
assert.equal(art("es", n("árabe", { tags: ["by-personal-gender", "feminine", "masculine"], ipa: ["/ˈaɾabe/"] })).art, "el / la", "la árabe：人称两性不得固定为 el");
assert.equal(art("es", n("ácrata", { head: ["ácrata m or f by sense"], ipa: ["/ˈakɾata/"] })).art, "el / la", "la ácrata");
assert.equal(art("es", n("árabe", { tags: ["masculine"], ipa: ["/ˈaɾabe/"] })).art, "el", "阿拉伯语义（纯阳性）仍是 el，不被改成 la");
assert.match(art("es", n("arte", { tags: ["feminine", "masculine"], ipa: ["/ˈaɾte/"] })).state, /^unknown:stressed_mixed_gender/, "arte 进队列");
assert.match(art("es", n("amish", { tags: ["feminine"], ipa: ["/ˈamiʃ/"] })).state, /^unknown/, "amish（IPA 与拼写不一致）进队列");
assert.match(art("es", n("attendant", { tags: ["feminine"] })).state, /^unknown:no_ipa_foreign_shape/, "attendant（外来拼写）进队列");
assert.equal(art("es", n("hache", { tags: ["feminine"], ipa: ["/ˈat͡ʃe/"] })).art, "la", "la hache（字母名例外）");
assert.equal(art("es", n("libro", { tags: ["masculine"] })).art, "el");
// 法语：嘘音 h 看分类标记；没标的不猜
assert.equal(art("fr", n("homme", { tags: ["masculine"], h: "mute" })).art, "l’");
assert.equal(art("fr", n("héros", { tags: ["masculine"], h: "asp" })).art, "le");
assert.equal(art("fr", n("hache", { tags: ["feminine"], h: "" })).state, "unknown:h_unmarked", "hache 漏标：进队列，不显示冠词");
assert.equal(art("fr", n("hache", { tags: ["feminine"], h: "" })).art, "");
assert.equal(art("fr", n("école", { tags: ["feminine"] })).art, "l’");
assert.equal(art("fr", n("maison", { tags: ["feminine"] })).art, "la");
assert.equal(art("fr", n("élève", { tags: ["by-personal-gender", "masculine", "feminine"] })).art, "l’");
assert.equal(art("fr", n("enfant", { head: ["enfant m or f by sense"] })).art, "l’");
assert.equal(art("fr", n("gens", { tags: ["masculine", "plural", "plural-only"], head: ["gens m pl (plural only)"] })).art, "les");
// 意语：正字法规则
for (const [w, g, a] of [["zio", "masculine", "lo"], ["sport", "masculine", "lo"], ["psicologo", "masculine", "lo"], ["gnomo", "masculine", "lo"], ["pneumatico", "masculine", "lo"], ["xilofono", "masculine", "lo"], ["iato", "masculine", "lo"],
  ["iena", "feminine", "la"], ["amico", "masculine", "l’"], ["libro", "masculine", "il"], ["scuola", "feminine", "la"], ["amica", "feminine", "l’"]])
  assert.equal(art("it", n(w, { tags: [g] })).art, a, `${a} ${w}`);
assert.match(art("it", n("whisky", { tags: ["masculine"] })).state, /^unknown:foreign_initial/, "whisky 用法有分歧：进队列");
assert.match(art("it", n("yogurt", { tags: ["masculine"] })).state, /^unknown/);
// 德语
assert.equal(art("de", n("Haus", { tags: ["neuter"] })).art, "das");
assert.equal(art("de", n("Mann", { head: ["Mann m (strong, genitive Mannes)"] })).art, "der", "性别从 head 展开里取");
assert.equal(art("de", n("Frau", { tags: ["feminine"] })).art, "die");
assert.equal(art("de", n("Leute", { tags: ["plural", "plural-only"], head: ["Leute pl (plural only, diminutive Leutchen n)"] })).art, "die");
assert.equal(art("de", n("Teil", { tags: ["masculine", "neuter"] })).art, "der / das");
// V003-B2-R2：带性别的复数专用名词用复数冠词（真实 kaikki 字段：词头写 pl，或全部义项标 plural-only）；元音前复数不省音
const PL = (w, g, head, senses = 1) => n(w, { tags: [g, "plural", "plural-only"].filter(Boolean), head: [head], gl: Array.from({ length: senses }, () => ({ g: "x", t: ["plural-only"] })) });
assert.equal(art("fr", PL("affaires", "feminine", "affaires f", 2)).art, "les", "les affaires（词头没写 pl，但两个义项都是复数专用）");
assert.equal(art("fr", PL("lunettes", "feminine", "lunettes f")).art, "les", "les lunettes");
assert.equal(art("de", PL("Daten", "neuter", "Daten n pl (plural only)")).art, "die", "die Daten，不是 das");
assert.equal(art("es", PL("pantalones", "masculine", "pantalones m pl (plural only)")).art, "los");
assert.equal(art("es", PL("gafas", "feminine", "gafas f pl (plural only)")).art, "las");
assert.equal(art("es", PL("aguas", "feminine", "aguas f pl (plural only)")).art, "las", "复数不用 el：las aguas");
assert.equal(art("it", PL("pantaloni", "masculine", "pantaloni m pl (plural only)")).art, "i");
assert.equal(art("it", PL("affari", "masculine", "affari m pl (plural only)")).art, "gli", "元音前复数是 gli，不省音");
assert.equal(art("it", PL("forbici", "feminine", "forbici f pl (plural only)")).art, "le");
// 反例：information 只有 news 一个义项是复数，整词仍是单数（extract 会把该义项的标签提到整词）
const information = n("information", { tags: ["feminine", "plural", "plural-only"], head: ["information f (plural informations)"], gl: [{ g: "a", t: [] }, { g: "news", t: ["plural-only"] }, { g: "b", t: [] }] });
assert.equal(art("fr", information).art, "l’", "information 仍按单数：l’information");
// V003-B2-R5：法语 œ 开头按元音，省音
for (const [w, g] of [["œil", "masculine"], ["œuf", "masculine"], ["œuvre", "feminine"]]) assert.equal(art("fr", n(w, { tags: [g] })).art, "l’", w + " → l’");
assert.equal(art("fr", PL("œufs", "masculine", "œufs m pl (plural only)")).art, "les", "œ 开头的复数仍是 les");

// V003-B2-R1：CFDICT 反查只去有词边界的冠词，不吃 lait / lettre / lever 的字母
{
  const f = path.join(os.tmpdir(), "cfdict-r1-" + process.pid + ".u8");
  fs.writeFileSync(f, ["# test", "奶 奶 [nai3] /lait/", "信 信 [xin4] /lettre/", "举 举 [ju3] /lever/", "洗 洗 [xi3] /laver/", "虫 虫 [chong2] /ver/",
    "猫 猫 [mao1] /le chat (m)/", "房子 房子 [fang2 zi5] /la maison/", "眼镜 眼镜 [yan3 jing4] /les lunettes/", "眼睛 眼睛 [yan3 jing5] /l'œil/", "目 目 [mu4] /l’œil/"].join("\n") + "\n");
  const inv = loadCedict(f, "fr");
  fs.rmSync(f);
  const zh = (w) => (inv.get(w) || []).map((h) => h.zh);
  assert.deepEqual(zh("lait"), ["奶"]); assert.deepEqual(zh("lettre"), ["信"]); assert.deepEqual(zh("lever"), ["举"]); assert.deepEqual(zh("laver"), ["洗"]);
  assert.deepEqual(zh("ver"), ["虫"], "ver 不借入 lever / laver 的中文");
  assert.equal(inv.has("it"), false); assert.equal(inv.has("ttre"), false);
  assert.deepEqual(zh("chat"), ["猫"]); assert.deepEqual(zh("maison"), ["房子"]); assert.deepEqual(zh("lunettes"), ["眼镜"], "les 整个去掉，不是只去 le");
  assert.deepEqual(zh("œil"), ["眼睛", "目"], "省音 l' 与 l’ 都去掉");
}

// 无性别不显示冠词；拉丁语不写冠词
assert.equal(art("fr", n("truc")).state, "unknown:no_gender"); assert.equal(art("fr", n("truc")).art, "");
assert.equal(art("la", n("rosa", { tags: ["feminine"] })).art, "");
assert.deepEqual(genderOf(n("Haus", { head: ["Haus n (strong, genitive Hauses)"] })), { g: "n", pl: false, person: false, mixed: false });

// ---------- T12：释义挑选（直出优先选英语中转也认的常用说法；没标词性的直出只给第一个词性）----------
{
  const ec = new Map([["house", { "n.": ["房子", "住宅"] }], ["one", { "num.": ["一"] }], ["she", { "pron.": ["她"] }]]);
  const zhFreq = new Map([["房子", 9], ["住宅", 3], ["一", 50], ["她", 20]]);
  const direct = new Map([["maison", [{ zh: "宅", pos: "", first: true }, { zh: "住宅", pos: "", first: true }]], ["un", [{ zh: "壹", pos: "", first: true }, { zh: "一", pos: "", first: true }]], ["elle", [{ zh: "她", pos: "", first: true }]]]);
  const src = { ec, zhFreq, direct, directName: "cfdict" };
  assert.deepEqual(zhFor("maison", "noun", ["house"], src, true).zh, ["住宅"], "直出里英语中转也有的、常用的排前；偏字「宅」（常用度 0）不用");
  assert.deepEqual(zhFor("un", "num", ["one"], src, true).zh, ["一"], "un → 一，不是「壹」");
  const elleNoun = zhFor("elle", "noun", ["The name of the Latin script letter L/l."], src, false);
  assert.deepEqual(elleNoun.zh, [], "没标词性的直出不套到第二个词性上（elle 名词不拿「她」）");
  assert.deepEqual(zhFor("casa", "noun", ["house (building)"], { ec, zhFreq }, true), { zh: ["房子"], via: "en" }, "没有直出时走英语中转，括注去掉");
}

// ---------- T19：审核结果的读取与合并规则（临时目录夹具，不碰 review/lexicon/）----------
{
  const base = fs.mkdtempSync(path.join(os.tmpdir(), "lex-review-")), dir = path.join(base, "fr");
  fs.mkdirSync(dir);
  const T = (rows) => rows.map((r) => r.join("\t")).join("\n") + "\n";
  fs.writeFileSync(path.join(dir, "dsh-001.tsv"), T([["词", "显示", "词性", "字段", "原值", "新值", "理由"],
    ["savoir", "savoir", "verb", "中文释义", "学问", "知道，会", "常用义"], ["tout", "tout", "adv", "中文释义", "举", "完全", "错义"],
    ["elle", "elle", "noun", "性别", "m", "f", "une elle"], ["hache", "hache", "noun", "冠词", "", "la", "嘘音 h"], ["rose", "rose", "noun", "性别", "", "f|pl", "复数专用"], ["bon", "bon", "adj", "标记", "不雅候选", "（清除）", "常用词"]]));
  fs.writeFileSync(path.join(dir, "codex-001.tsv"), T([["词", "显示", "词性", "字段", "结论", "建议值", "理由"],
    ["savoir", "savoir", "verb", "中文释义", "通过", "", ""], ["tout", "tout", "adv", "中文释义", "驳回", "完全，全然", "补义"],
    ["elle", "elle", "noun", "性别", "存疑", "", "待核"], ["hache", "hache", "noun", "冠词", "通过", "", ""], ["rose", "rose", "noun", "性别", "通过", "", ""],
    ["pas", "pas", "adv", "中文释义", "驳回", "不", "抽查发现"]])); // bon 的修订漏判
  fs.writeFileSync(path.join(dir, "dsh-002.tsv"), T([["词", "显示", "词性", "字段", "原值", "新值", "理由"], ["voir", "voir", "verb", "中文释义", "", "看见", ""]])); // 没有 Codex：不写入
  const cand = new Set(["savoir|savoir|verb", "tout|tout|adv", "elle|elle|noun", "hache|hache|noun", "rose|rose|noun", "bon|bon|adj", "pas|pas|adv", "voir|voir|verb"].map((s) => keyOf(...s.split("|"))));
  const r = loadReview("fr", cand, base);
  const A = (w, d, p) => r.apply.get(keyOf(w, d, p));
  assert.deepEqual(A("savoir", "savoir", "verb"), { "中文释义": "知道，会" }, "通过 → DSH 新值");
  assert.deepEqual(A("tout", "tout", "adv"), { "中文释义": "完全，全然" }, "驳回 → 建议值");
  assert.equal(A("elle", "elle", "noun"), undefined, "存疑 → 不写入"); assert.equal(r.doubts.length, 1);
  assert.deepEqual(A("hache", "hache", "noun"), { "冠词": "la" });
  assert.deepEqual(A("pas", "pas", "adv"), { "中文释义": "不" }, "Codex 抽查未修订行的驳回也写入");
  assert.equal(A("bon", "bon", "adj"), undefined, "漏判的不写入"); assert.ok(r.problems.some((p) => /漏判/.test(p)), "漏判要报出来");
  assert.equal(A("voir", "voir", "verb"), undefined, "只有 DSH 的分片不写入"); assert.equal(r.stats.pending_no_codex, 2);
  fs.writeFileSync(path.join(dir, "codex-002.tsv"), T([["词", "显示", "词性", "字段", "结论"], ["voir", "voir", "verb", "中文释义", "行"]]));
  const bad = loadReview("fr", cand, base);
  assert.ok(bad.problems.some((p) => /表头/.test(p)) && bad.problems.some((p) => /应有 7 列/.test(p)), "表头 / 列数错误要报出来");
  fs.rmSync(base, { recursive: true });
  // 合并规则（mergeEntry，build-lexicon.mjs 的 applyReview 只调它）：V003-B2-R2 剩余路径 + 改成非名词清空
  const E = (o) => Object.assign({ rec: { w: o.w, pos: "noun", tags: o.tags || [], head: o.head || [o.w], gl: o.gl || [{ g: "x", t: [] }], h: o.h, ipa: [] }, pos: "noun", gender: "", art: "", artState: "known", zh: ["x"], flags: [] }, o.e);
  const M = (lang, o, ov) => mergeEntry(lang, E(o), ov);
  { const e = M("fr", { w: "rose", e: { artState: "unknown:no_gender", flags: ["冠词待审"] } }, A("rose", "rose", "noun")); // TSV → 合并：R2 的验收夹具
    assert.deepEqual([e.gender, e.art, e.artState, e.rec.w, e.flags], ["f|pl", "les", "known", "rose", []], "dsh / codex 文件里只改性别 f|pl：读入并合并后冠词 les，词本体不变"); }
  assert.equal(M("fr", { w: "ciseau", tags: ["masculine"] }, { "性别": "m|pl" }).art, "les", "只改性别为复数：冠词跟着变 les（R2）");
  assert.equal(M("de", { w: "daten", tags: ["neuter"] }, { "性别": "n|pl" }).art, "die", "德语复数 die");
  assert.equal(M("es", { w: "gafas", tags: ["masculine"] }, { "性别": "f|pl" }).art, "las", "性别与单复数都取审核值");
  assert.equal(M("it", { w: "occhiali", tags: ["feminine"] }, { "性别": "m|pl" }).art, "gli");
  assert.equal(M("fr", { w: "chips", tags: ["feminine"] }, { "性别": "mf|pl" }).art, "les", "两性复数也是 les");
  assert.equal(M("fr", { w: "ciseaux", tags: ["masculine"], head: ["ciseaux m pl"], gl: [{ g: "x", t: ["plural-only"] }] }, { "性别": "m" }).art, "le", "审核改回单数：原词头和义项的复数记号不能盖过人工结论");
  assert.equal(M("fr", { w: "hache", tags: ["masculine"], h: "asp" }, { "性别": "f" }).art, "la", "法语 h 标记沿用原条目");
  assert.equal(M("fr", { w: "maison", tags: ["masculine"] }, { "性别": "f", "冠词": "la" }).artState, "reviewed", "同时给了冠词：用审核的冠词");
  { const e = M("it", { w: "passa", tags: ["feminine"], e: { gender: "f", art: "la", flags: ["冠词待审"] } }, { "词性": "adv" });
    assert.deepEqual([e.pos, e.gender, e.art, e.flags], ["adv", "", "", []], "名词改成副词：性别、冠词清空"); }
  { const e = M("it", { w: "squarciagola", tags: ["feminine"], e: { gender: "f", art: "la" } }, { "冠词": "（清除）" });
    assert.deepEqual([e.gender, e.art, e.artState], ["f", "", "none"], "冠词写（清除）：清空冠词"); }
  { const e = M("es", { w: "veces", tags: ["feminine"], e: { gender: "f|pl", art: "las" } }, { "性别": "（清除）" });
    assert.deepEqual([e.gender, e.art], ["", ""], "性别写（清除）：性别、冠词都清空"); }
  // 二轮报告的两项阻断：旧待审标记残留（135 条被误排除）、词性改正后的键冲突（4 条）
  assert.deepEqual(M("la", { w: "arma", e: { flags: ["长音待审"] } }, { "标记": "清除" }).flags, [], "审核清除标记：长音待审撤掉");
  assert.deepEqual(M("la", { w: "nox", e: { flags: ["长音待审"] } }, { "标记": "古旧词" }).flags, ["古旧词"], "审核改标古旧词：长音待审也撤掉");
  assert.deepEqual(M("la", { w: "arma", e: { flags: ["长音待审"] } }, { "中文释义": "武器" }).flags, ["长音待审"], "审核没对标记下结论：待审标记保留");
  { const e = M("la", { w: "ego", e: { disp: "ego\u0304\u0306", flags: ["字符待审"] } }, { "标记": "清除" });
    assert.deepEqual([e.disp, e.flags], ["eg\u014d", []], "长短两可的叠加符去掉后收：egō"); }
  { const e = M("la", { w: "habet", e: { disp: "hab\ua76b", flags: ["字符待审"] } }, { "标记": "清除" });
    assert.deepEqual([e.disp, e.flags], ["hab\ua76b", ["字符待审"]], "抄写缩写的合字去不掉：仍待审"); }
  assert.equal(reviewedDisplay("de\u0361inde"), "deinde"); assert.equal(reviewedDisplay("m\u1d52\u016b"), "");
  { // SCOPE-R4：词性改正后撞上已有条目，按最终词性归并义项，不丢整条
    const ok = (e) => e.zh.length && !e.flags.includes("存疑"); // 调用方先判入库资格（build-lexicon 的 lexOk）
    const Z = (w, pos, zh, ov, extra) => mergeEntry("fr", E({ w, e: Object.assign({ disp: w, lemma: w, pos, zh }, extra) }), ov || {});
    const G = (list) => groupByDisplay(list.filter(ok), (p) => ({ noun: "n.", adj: "adj.", verb: "v." })[p]);
    let r = G([Z("évolué", "adj", ["先进的", "开明的"]), Z("évolué", "verb", ["先进的", "发达的"], { "词性": "adj" }), Z("évolué", "noun", ["有教养的人"])]);
    assert.deepEqual(r[0].groups.map((g) => g.pos + g.zh.join("，")), ["adj.先进的，开明的，发达的", "n.有教养的人"], "évolué：已审的三个义项都在，同义项去重，只有一组 adj");
    assert.deepEqual(r[0].merges[0].added, ["发达的"]);
    r = G([Z("truc", "noun", ["东西"], null, { flags: ["存疑"] }), Z("truc", "adj", ["花招"], { "词性": "noun" })]);
    assert.deepEqual(r[0].groups.map((g) => g.zh), [["花招"]], "原条目存疑不可入库：改词性过来的有效条目照收，不被它挡掉");
    r = G([Z("x", "adj", ["甲"], { "词性": "noun" }), Z("x", "verb", ["乙"], { "词性": "noun" })]);
    assert.deepEqual(r[0].groups.map((g) => g.pos + g.zh.join("，")), ["n.甲，乙"], "两条都改到同一词性：归并");
    r = G([Z("y", "noun", ["甲"], { "词性": "adj" }), Z("y", "verb", ["乙"], { "词性": "noun" })]);
    assert.deepEqual(r[0].groups.map((g) => g.pos + g.zh.join("，")), ["adj.甲", "n.乙"], "目标词性的原条目也被改走：各归各的，不互相吞");
    r = G([Z("z", "noun", ["一", "二", "三"]), Z("z", "adj", ["三", "四", "五"], { "词性": "noun" })]);
    assert.deepEqual([r[0].groups[0].zh, r[0].merges[0].over_limit], [["一", "二", "三", "四"], ["五"]], "并集最多 4 个，放不下的记进报告");
    r = G([Z("w", "noun", ["甲"], null, { art: "le" }), Z("w", "adj", ["乙"], { "词性": "noun", "冠词": "la" })]);
    assert.deepEqual([r[0].art, r[0].conflicts.length], ["le", 1], "归并时冠词不一致：留先出现的，列出待裁定"); }
  assert.deepEqual(normFlags("存疑：中古词"), ["古旧词", "中古词"], "中古词是年代，不排除，另记年代"); assert.deepEqual(normFlags("存疑：中古词，词形存疑"), ["存疑", "古旧词", "中古词"]);
  assert.deepEqual(normFlags("（清除）"), []); assert.deepEqual(normFlags("古旧词，建议复核"), ["古旧词"]); assert.deepEqual(normFlags("存疑：非标准法语"), ["存疑"]); assert.deepEqual(normFlags("不雅"), ["不雅"]);
}

// ---------- 第 3 批审核工具（audit-review.mjs，临时目录夹具）----------
{
  const { auditLang, expectedArticle, glossProblems } = await import("./lexicon/audit-review.mjs");
  const base = fs.mkdtempSync(path.join(os.tmpdir(), "lex-audit-")), dir = path.join(base, "fr");
  fs.mkdirSync(dir);
  const T = (rows) => rows.map((r) => r.join("\t")).join("\n") + "\n";
  const C = (w, pos, g, art, zh, flags = "") => [w, w, pos, g, art, art ? "known" : "none", "spell", "x", zh, "en", flags, "1"];
  fs.writeFileSync(path.join(dir, "candidates.tsv"), T([["词", "显示", "词性", "性别", "冠词", "冠词判定", "判定来源", "英文释义", "中文释义", "释义来源", "标记", "得分"],
    C("savoir", "verb", "", "", "学问"), C("lunettes", "noun", "f", "la", "眼镜"), C("œil", "noun", "m", "le", "眼睛"), C("voir", "verb", "", "", "see的过去分词"),
    C("maison", "noun", "f", "la", "房子"), C("truc", "noun", "m", "le", "东西"), C("bof", "intj", "", "", "", "待普查")]));
  fs.writeFileSync(path.join(dir, "dsh-001.tsv"), T([["词", "显示", "词性", "字段", "原值", "新值", "理由"],
    ["savoir", "savoir", "verb", "中文释义", "学问", "知道，会", "r"], ["lunettes", "lunettes", "noun", "性别", "f", "f|pl", "复数专用"],
    ["maison", "maison", "noun", "冠词", "la", "le", "故意改错"], ["truc", "truc", "noun", "标记", "", "存疑：方言", "r"], ["bof", "bof", "intj", "中文释义", "", "", "空修订"]]));
  fs.writeFileSync(path.join(dir, "codex-001.tsv"), T([["词", "显示", "词性", "字段", "结论", "建议值", "理由"],
    ["savoir", "savoir", "verb", "中文释义", "通过", "", ""], ["lunettes", "lunettes", "noun", "性别", "通过", "", ""],
    ["maison", "maison", "noun", "冠词", "通过", "", "Codex 也没发现"], ["truc", "truc", "noun", "标记", "通过", "", ""], ["bof", "bof", "intj", "中文释义", "存疑", "", "空"]]));
  const r = auditLang("fr", { base, dryRun: true, samples: true, noStage: true });
  assert.equal(r.review_stats.approved, 4); assert.equal(r.doubts, 1); assert.equal(r.empty_revisions, 1, "空修订计数");
  assert.deepEqual(r.verdicts_by_field["中文释义"], { dsh: 2, 通过: 1, 驳回: 0, 存疑: 1, 未判: 0 });
  assert.ok(r.rule_violations["释义格式"].examples.some((x) => /voir.*夹外文/.test(x)), "自动释义里的英文残片要报出来");
  assert.ok(r.rule_violations["冠词与性别不一致"].examples.some((x) => /maison.*应为 la/.test(x)), "复审都通过了也要独立核对：maison 改成 le 被抓到");
  assert.equal(r.final.in_lexicon, 5, "truc（存疑）与 bof（无中文）不进词库");
  assert.equal(expectedArticle("fr", "lunettes", "f|pl").art, "les", "只改性别为 f|pl：显式按复数重算（R2 的预期行为）");
  assert.equal(expectedArticle("fr", "œil", "m").art, "l’"); assert.equal(expectedArticle("de", "Daten", "n|pl").art, "die"); assert.equal(expectedArticle("it", "affari", "m|pl").art, "gli");
  assert.deepEqual(glossProblems("知道，会"), []); assert.equal(glossProblems("一，二，三，四，五").length, 1); assert.ok(glossProblems("房子,家").length);
  assert.deepEqual(glossProblems("㹴，䴓"), [], "扩展区汉字不是外文残片");
  assert.ok(/夹外文/.test(glossProblems("see的过去分词")[0]) && /夹外文/.test(glossProblems("vt. 邻近")[0])); assert.ok(/^含拉丁字母/.test(glossProblems("唱名 mi")[0]), "音名、字母名另列，不算格式错");
  assert.equal(expectedArticle("fr", "chips", "mf|pl").art, "les", "两性复数");
  // 抽样可复算：同一输入两次结果相同；样本数不超过可抽的条目
  const r2 = auditLang("fr", { base, dryRun: true, samples: true, noStage: true });
  assert.deepEqual(r2.samples.q4_keys, r.samples.q4_keys); assert.equal(r.samples.q4, 5); assert.equal(r.samples.main_revised, 3, "修订过且进词库的 savoir、lunettes、maison");
  // 合并后核对：words.js 里没写进复审值、该排除的没排除，都要报出来
  const wf = path.join(base, "words.js");
  fs.writeFileSync(wf, 'window.LANGPACK.put("fr","words",' + JSON.stringify({ s: [["savoir", "v.学问"]], l: [["lunettes", "n.眼镜", "la"]], m: [["maison", "n.房子", "le"]], t: [["truc", "n.东西", "le"]] }) + ");");
  const ab = auditLang("fr", { base, dryRun: true, afterBuild: true, noStage: true, wordsFile: wf }).after_build;
  assert.equal(ab.wrong_gloss, 1, "savoir 没写进「知道，会」"); assert.equal(ab.wrong_article, 1, "lunettes 应为 les"); assert.equal(ab.excluded_but_present, 1, "truc 存疑却还在词库");
  fs.rmSync(base, { recursive: true });
}

// ---------- SCOPE-R3：审核预期、抽样池、合并后核对都按复审后词性的命名范围 ----------
{
  const { auditLang } = await import("./lexicon/audit-review.mjs");
  const base = fs.mkdtempSync(path.join(os.tmpdir(), "lex-scope-")), dir = path.join(base, "fr");
  fs.mkdirSync(dir);
  const T = (rows) => rows.map((r) => r.join("\t")).join("\n") + "\n";
  const C = (w, pos, g, art, zh) => [w, w, pos, g, art, art ? "known" : "none", "", "x", zh, "en", "", "1"];
  fs.writeFileSync(path.join(dir, "candidates.tsv"), T([["词", "显示", "词性", "性别", "冠词", "冠词判定", "判定来源", "英文释义", "中文释义", "释义来源", "标记", "得分"],
    C("le", "article", "", "", "这"), C("lait", "noun", "m", "le", "奶"), C("pas", "noun", "m", "le", "步"), C("la", "noun", "m", "le", "A 音"), C("la", "article", "", "", "这")]));
  fs.writeFileSync(path.join(dir, "dsh-001.tsv"), T([["词", "显示", "词性", "字段", "原值", "新值", "理由"],
    ["le", "le", "article", "中文释义", "这", "定冠词", "r"], ["pas", "pas", "noun", "词性", "noun", "particle", "否定小品词"], ["la", "la", "noun", "中文释义", "A 音", "音名", "r"]]));
  fs.writeFileSync(path.join(dir, "codex-001.tsv"), T([["词", "显示", "词性", "字段", "结论", "建议值", "理由"],
    ["le", "le", "article", "中文释义", "通过", "", ""], ["pas", "pas", "noun", "词性", "通过", "", ""], ["la", "la", "noun", "中文释义", "通过", "", ""]]));
  const wf = path.join(base, "words.js");
  fs.writeFileSync(wf, 'window.LANGPACK.put("fr","words",' + JSON.stringify({ l: [["lait", "n.奶", "le", ""], ["la", "n.音名", "le", ""]] }) + ");\n");
  const r = auditLang("fr", { base, dryRun: true, samples: true, afterBuild: true, noStage: true, wordsFile: wf });
  assert.equal(r.final.in_lexicon, 2, "le（冠词）、pas（改成小品词）、la（冠词）不进词库；lait 与同拼写的名词 la 留下");
  assert.equal(r.final.out_of_scope_function_words, 3);
  assert.deepEqual(r.samples.q4_keys.slice().sort(), ["la/noun", "lait/noun"], "抽样池不含范围外的词");
  assert.equal(r.after_build.missing, 0, "正确排除的功能词不能报成漏词");
  assert.equal(r.after_build.excluded_but_present, 0, "同拼写的名词在库，不算功能词泄漏");
  fs.writeFileSync(wf, 'window.LANGPACK.put("fr","words",' + JSON.stringify({ l: [["lait", "n.奶", "le", ""], ["la", "n.音名", "le", ""], ["le", "art.定冠词", "", ""], ["pas", "part.不", "", ""]] }) + ");\n");
  const leak = auditLang("fr", { base, dryRun: true, afterBuild: true, noStage: true, wordsFile: wf });
  assert.equal(leak.after_build.excluded_but_present, 2, "范围外的功能词出现在成品里要报出来（le、pas）");
  { // SCOPE-R4：改词性后同词性两条，成品必须是并集；漏合并要被抓到
    const C2 = (w, pos, zh) => [w, w, pos, "", "", "none", "", "x", zh, "en", "", "1"];
    fs.writeFileSync(path.join(dir, "candidates.tsv"), T([["词", "显示", "词性", "性别", "冠词", "冠词判定", "判定来源", "英文释义", "中文释义", "释义来源", "标记", "得分"],
      C2("évolué", "adj", "先进的，开明的"), C2("évolué", "verb", "进化")]));
    fs.writeFileSync(path.join(dir, "dsh-001.tsv"), T([["词", "显示", "词性", "字段", "原值", "新值", "理由"], ["évolué", "évolué", "verb", "词性", "verb", "adj", "r"], ["évolué", "évolué", "verb", "中文释义", "进化", "先进的，发达的", "r"]]));
    fs.writeFileSync(path.join(dir, "codex-001.tsv"), T([["词", "显示", "词性", "字段", "结论", "建议值", "理由"], ["évolué", "évolué", "verb", "词性", "通过", "", ""], ["évolué", "évolué", "verb", "中文释义", "通过", "", ""]]));
    const W = (g) => { fs.writeFileSync(wf, 'window.LANGPACK.put("fr","words",' + JSON.stringify({ e: [["évolué", g, "", ""]] }) + ");\n"); return auditLang("fr", { base, dryRun: true, afterBuild: true, noStage: true, wordsFile: wf }); };
    const good = W("adj.先进的，开明的，发达的");
    assert.deepEqual([good.final.in_lexicon, good.after_build.merge_missing, good.after_build.missing, good.after_build.wrong_gloss], [2, 0, 0, 0], "两条都算进词库，并集齐全");
    assert.equal(W("adj.先进的，开明的").after_build.merge_missing, 1, "漏合并「发达的」被抓到");
    assert.equal(W("adj.先进的，开明的，发达的|adj.先进的").after_build.merge_missing, 1, "同词性出现两组也报");
  }
  { // Q4-R1：候选表「形态」列标了变形条目的，不算进词库、不进抽样，出现在成品里要报
    const HEAD = ["词", "显示", "词性", "性别", "冠词", "冠词判定", "判定来源", "英文释义", "中文释义", "释义来源", "标记", "得分", "原始依据", "形态"];
    const R = (w, pos, zh, form) => [w, w, pos, "", "", "none", "", "x", zh, "en", "", "1", "", form || ""];
    fs.writeFileSync(path.join(dir, "candidates.tsv"), T([HEAD, R("porle", "verb", "放置它们", "变形条目"), R("porre", "verb", "放置"), R("testo", "verb", "织成的", "变形条目"), R("testo", "noun", "文本")]));
    for (const f of ["dsh-001.tsv", "codex-001.tsv"]) fs.writeFileSync(path.join(dir, f), T([f[0] === "d" ? ["词", "显示", "词性", "字段", "原值", "新值", "理由"] : ["词", "显示", "词性", "字段", "结论", "建议值", "理由"]]));
    const W = (rows) => { fs.writeFileSync(wf, 'window.LANGPACK.put("fr","words",' + JSON.stringify({ p: rows }) + ");\n"); return auditLang("fr", { base, dryRun: true, samples: true, afterBuild: true, noStage: true, wordsFile: wf }); };
    const ok = W([["porre", "v.放置", "", ""], ["testo", "n.文本", "", ""]]);
    assert.deepEqual([ok.final.in_lexicon, ok.final.form_entries_excluded, ok.after_build.form_entries_present, ok.samples.q4_keys.slice().sort()], [2, 2, 0, ["porre/verb", "testo/noun"]], "变形条目不进词库、不进抽样；同写法的名词 testo 留下且不算泄漏");
    assert.equal(W([["porre", "v.放置", "", ""], ["testo", "n.文本", "", ""], ["porle", "v.放置它们", "", ""]]).after_build.form_entries_present, 1, "没审过的变形条目出现在成品里也要报");
  }
  fs.rmSync(base, { recursive: true });
}

// ---------- T16：各语言规则对象 ----------
const env = { window: {} };
vm.createContext(env);
for (const f of ["block/core.js", "lang/en/block.js", "core.js", "lang/packs.js"]) vm.runInContext(fs.readFileSync(new URL("../app/assets/" + f, import.meta.url), "utf8"), env, { filename: f });
const { CORE, LANGPACK } = env.window;
const LANGS = ["fr", "de", "es", "it", "la"];
for (const l of LANGS) vm.runInContext(fs.readFileSync(new URL(`../app/assets/lang/${l}/rules.js`, import.meta.url), "utf8"), env, { filename: l + "/rules.js" });
assert.equal(CORE.LANG.code, "en", "注册规则不切当前语言");
for (const l of LANGS) assert.ok(LANGPACK.has(l, "rules"), l + " 规则已注册");
CORE.useLang("fr"); assert.equal(CORE.normalizeWord("été"), "ÉTÉ", "格子保留带变音符的大写字母"); assert.equal(CORE.LANG.fold("Été"), "ete", "比对去变音符");
CORE.useLang("de"); assert.equal(CORE.normalizeWord("Straße"), "STRASSE", "ß → SS 占两格（D5）"); assert.equal(CORE.LANG.fold("Straße"), "strasse");
CORE.useLang("la"); assert.equal(CORE.LANG.fold("amō"), "amo", "拉丁语比对去长音（Q5）"); assert.equal(CORE.LANG.digitNames[0], "nihil", "Q6：拉丁语 0 读 nihil");
CORE.useLang("es"); assert.equal(CORE.LANG.digitNames[0], "cero"); assert.equal(CORE.LANG.wordMax, 28);
assert.equal(CORE.LANG.customWord.test("x".repeat(28)), true, "28 个字符能打"); assert.equal(CORE.LANG.customWord.test("x".repeat(29)), false, "29 个超限");
assert.equal(CORE.LANG.digitSounds.every((a) => Array.isArray(a) && !a.length), true, "数字读音别名待用户批准：先为空");
// V003-B2-R4：先小写再展开连字，大小写不影响键；大写 ẞ 也是 SS
for (const l of LANGS) {
  CORE.useLang(l);
  for (const w of ["œuvre", "æther", "straße", "ẞ", "Œil"]) {
    const k = CORE.LANG.fold(w);
    assert.equal(CORE.LANG.fold(CORE.LANG.display(w)), k, `${l} fold(display(${w}))`);
    assert.equal(CORE.LANG.fold(w.toUpperCase()), k, `${l} fold(${w}.toUpperCase())`);
  }
  assert.equal(CORE.LANG.fold("Œuvre"), "oeuvre"); assert.equal(CORE.LANG.fold("ẞ"), "ss");
  assert.equal(CORE.normalizeWord("ß"), "SS"); assert.equal(CORE.normalizeWord("ẞ"), "SS", l + "：letters(ẞ) = SS");
}
// T21 / T28 / T26：比对去变音符、格内 28 个字符（V003-T01-S2 的样例；长度按 NFC 后的字符数、含空格）
CORE.useLang("fr");
assert.equal(CORE.containsLetter("école", "É"), true, "É 格：école 算对"); assert.equal(CORE.containsLetter("Ecole", "É"), true, "不带变音符的写法也算对"); assert.equal(CORE.containsLetter("ami", "É"), false);
// v00.03.00 界面重构：格首提示列全写法（带变音符的格「É 或 E」、西文数字格写出读法）；候选按比较写法匹配（去变音符、不分大小写）
assert.equal(["É", "E", "Ç", "0", "7"].map(l => CORE.startText(l)).join(" | "), "É 或 E | E | Ç 或 C | Z（zéro）或 0 | S（sept）或 7");
{
  const W = { e: [["été", "n.夏天", "l’"], ["effet", "n.效果", "l’"], ["mettre", "v.放"]], l: [["lieben", "v.爱"], ["Liebe", "n.爱", "die"]] };
  assert.equal(CORE.candidates(W, "É", "ete", () => false)[0][0], "été", "打 ete 找到 été");
  assert.equal(CORE.candidates(W, "E", "ét", () => false)[0][0], "été", "打 ét 也一样（查询同样去变音符），前缀命中排最前");
  assert.equal(Array.from(CORE.candidates(W, "L", "lieb", () => false), x => x[0]).sort().join(), "Liebe,lieben", "小写查询找到大写开头的名词");
}
assert.equal(CORE.rewriteWord("école").value, "École", "格里的词保留原样、首字母大写"); assert.equal(CORE.containsLetter("œuvre", "O"), true, "œ 按 oe 比对");
assert.equal(CORE.rewriteWord("pour un oui ou pour un non").value, "Pour un oui ou pour un non", "26 个字符的短语能打下");
assert.equal(CORE.rewriteWord("pour le meilleur et pour le pire").value.length, 28, "32 个字符：只收到 28（超限提示在界面层，T20 / T28 的界面部分）");
CORE.useLang("de");
assert.equal(CORE.containsLetter("straße", "S"), true); assert.equal(CORE.containsLetter("Über", "U"), true, "U 格：Über 算对"); assert.equal(CORE.containsLetter("über", "Ü"), true);
for (const w of ["Verteidigungsministerium", "Wohltätigkeitsorganisationen", "Über Gott und die Welt reden"]) assert.equal(CORE.rewriteWord(w).value, w, w.length + " 个字符能打下：" + w);
assert.equal(CORE.rewriteWord("x".repeat(29)).value.length, 28, "29 个字符超限");
CORE.useLang("en"); assert.equal(CORE.normalizeWord("été"), "T", "英语规则不变");
assert.equal(CORE.LANG.wordMax, 20); assert.equal(CORE.rewriteWord("x".repeat(29)).value.length, 20, "英文格内上限仍是 20");

// ---------- T15：生成的词库结构 ----------
const ARTS = { fr: /^(le|la|l’|les|le \/ la)$/, de: /^(der|die|das|der \/ die|der \/ das|die \/ das)$/, es: /^(el|la|el \/ la|los|las|los \/ las)$/, it: /^(il|lo|la|l’|il \/ la|lo \/ la|l’ \/ la|i|gli|le|i \/ le|gli \/ le)$/, la: /^$/ };
for (const l of LANGS) {
  const file = new URL(`${LEGACY}/${l}/words.js`, import.meta.url);
  const text = fs.readFileSync(file, "utf8");
  assert.match(text.slice(0, 600), /CC BY-SA/, l + " 文件头写明许可");
  vm.runInContext(text, env, { filename: l + "/words.js" });
  const W = LANGPACK.get(l, "words"), F = LANGPACK.get(l, "forms"), H = LANGPACK.get(l, "hyph");
  assert.ok(W && F && H, l + " 三部分都注册了");
  const disp = new Set();
  let rows = 0;
  CORE.useLang(l); // 分组按该语言的 fold（œ → oe）
  for (const [k, list] of Object.entries(W)) {
    assert.match(k, /^[a-z]$/, l + " 分组键是去变音符后的小写首字母");
    for (const row of list) {
      rows++;
      assert.equal(CORE.LANG.fold(row[0])[0], k, `${l} ${row[0]} 分组错误`);
      assert.match(row[1], /^[a-z]+\.[^|]+(\|[a-z]+\.[^|]+)*$/, `${l} ${row[0]} 释义格式（词性组用 |）`);
      assert.ok(row.length === 2 || row[2] === "" || String(row[2]).split("|").every((a) => ARTS[l].test(a)), `${l} ${row[0]} 冠词「${row[2]}」不在允许的写法里`);
      // 冠词列带 | 时：每个名词组一个，数目对得上（同形、性别不同的名词）
      if (String(row[2] || "").includes("|")) assert.equal(row[2].split("|").length, row[1].split("|").filter((g) => g.startsWith("n.")).length, `${l} ${row[0]} 冠词数与名词组数对不上`);
      assert.ok([...row[0]].length <= 28, `${l} ${row[0]} 超过格内上限`);
      // V003-B2-R3：每个字符都在规则允许范围内、符合自定义词写法，经输入清理不丢字（只做约定的首字母大写）
      assert.ok([...row[0]].every((ch) => CORE.LANG.wordChar.test(ch)), `${l} ${row[0]} 有规则不支持的字符`);
      assert.ok(CORE.LANG.customWord.test(row[0]), `${l} ${row[0]} 不符合 customWord`);
      assert.equal(CORE.rewriteWord(row[0]).value, CORE.LANG.display(row[0]), `${l} ${row[0]} 经 rewriteWord 丢字`); // T28：格内上限随语言（西文 28）
      // V003-B2-R4：显示前后查找键一致
      assert.equal(CORE.LANG.fold(CORE.LANG.display(row[0])), CORE.LANG.fold(row[0]), `${l} ${row[0]} 显示前后键不同`);
      disp.add(row[0]);
      assert.equal(CORE.lookupEntry(W, null, CORE.LANG.display(row[0]))[0].toLowerCase(), row[0].toLowerCase(), `${l} ${row[0]} 原样查询应找回词条`);
    }
  }
  assert.ok(rows > 5000, l + " 词库规模");
  for (const [lemma] of Object.entries(F).slice(0, 2000)) assert.ok(disp.has(lemma), `${l} 变形索引指向不存在的原形 ${lemma}`);
  CORE.useLang("en");
}
// 抽查：拉丁语显示长音、按词性分开存（liber 书 / līber 自由）
const la = LANGPACK.get("la", "words");
const laRows = Object.values(la).flat();
assert.ok(laRows.some((r) => r[0] === "līber") && laRows.some((r) => r[0] === "liber"), "liber（名词，书）与 līber（形容词，自由）分两条");
assert.ok(laRows.some((r) => r[0] === "amō"), "动词显示 amō（head 展开），不是变位代码");
CORE.useLang("la");
assert.equal(CORE.lookupEntry(la, null, "līber")[0], "līber", "长音原样命中优先，不能串到 liber");
assert.equal(CORE.lookupEntry(la, null, "liber")[0], "liber");
assert.equal(CORE.lookupEntry(la, null, "amo")[0], "amō", "去长音查询可回到原词");
CORE.useLang("en");
// 第 2 批返工：在成品上核对，不只测函数
const row = (l, w) => Object.values(LANGPACK.get(l, "words")).flat().find((r) => r[0] === w);
for (const w of ["œil", "œuf", "œuvre"]) assert.equal(row("fr", w)[2], "l’", "成品 " + w + " → l’（R5）");
assert.equal(row("fr", "affaires")[2], "les", "成品 les affaires（R2）"); assert.equal(row("fr", "lunettes")[2], "les");
assert.equal(row("de", "Daten")[2], "die", "成品 die Daten"); assert.equal(row("es", "pantalones")[2], "los"); assert.equal(row("it", "pantaloni")[2], "i"); assert.equal(row("it", "affari")[2], "gli");
assert.ok(row("fr", "lait") && row("fr", "lettre") && row("fr", "lever"), "成品保留 lait、lettre、lever（R1）");
assert.ok(!/举|扬|昂/.test(row("fr", "ver")[1]), "成品 ver 不带 lever 的中文（R1）");
assert.ok(laRows.some((r) => r[0] === "sȳrinx"), "拉丁扩展 B 的 ȳ 保留（R3）");
// ---------- 变形索引接进查词（Q10 / T26）：格里打变形也能查到原形的释义 ----------
{
  const rankFor = (W) => { const r = Object.create(null); for (const k in W) W[k].forEach((it, i) => { if (r[it[0]] === undefined) r[it[0]] = i; }); return (w) => (r[w] === undefined ? 1e9 : r[w]); };
  const use = (l) => { CORE.useLang(l); const W = LANGPACK.get(l, "words"), F = LANGPACK.get(l, "forms"); return { W, F, rank: rankFor(W), lemma: (t) => CORE.formLemma(F, t, rankFor(W)), entry: (t) => CORE.formEntry(W, F, t, rankFor(W)) }; };
  const fr = use("fr");
  assert.equal(fr.lemma("sont"), "être", "变形 → 原形");
  assert.equal(fr.lemma("suis"), "être", "一个变形对着几个原形（être / suivre）：取更常用的");
  assert.equal(fr.lemma("Suis"), "être", "不分大小写");
  assert.equal(fr.lemma("zzzz"), "", "索引里没有：空");
  const livres = JSON.parse(JSON.stringify(fr.entry("Livres")));
  assert.deepEqual(livres.slice(0, 3), ["livres", CORE.lookupEntry(fr.W, null, "livre")[1], ""], "词条：拼写用打的，释义用原形的，不带原形的冠词（le livre / les livres）");
  assert.equal(CORE.defaultGloss(livres), "书");
  assert.equal(fr.entry("zzzz"), null);
  assert.ok(CORE.lookupEntry(fr.W, null, "est"), "词库里本来就有的写法走词库，不走变形索引（app-model 的 lookup 先查词库）");
  assert.equal(use("it").lemma("sono"), "essere", "意语 sono：essere 而不是 suono");
  assert.equal(use("de").lemma("ging"), "gehen");
  assert.equal(use("es").lemma("libros"), "libro");
  // 去变音符的写法也能找到（手机上不好打变音符）
  const frAcc = Object.keys(fr.F).map((k) => fr.F[k].split(" ").find((f) => /[éèêàç]/.test(f) && !CORE.lookupEntry(fr.W, null, f) && !CORE.lookupEntry(fr.W, null, CORE.LANG.fold(f)))).find(Boolean);
  CORE.useLang("fr");
  assert.ok(frAcc && fr.lemma(CORE.LANG.fold(frAcc)), "去掉变音符照样命中：" + frAcc);
  // V003-B4-R10：变形要对上「原形 + 词性」。动词 sein 的变形归动词 sein，不借名词 Sein（存在）的释义；代词的变形查不到，不借名词 Ich / Du 的释义
  const de = use("de");
  for (const f of ["bist", "ist", "war"]) {
    assert.equal(de.lemma(f), "sein", f + " → 动词 sein");
    assert.match(de.entry(f)[1], /^v\./, f + " 的释义来自动词");
    assert.doesNotMatch(de.entry(f)[1], /存在，实质/, f + " 不再借名词 Sein 的释义");
  }
  for (const f of ["mich", "dich", "mir", "ihn"]) assert.equal(de.entry(f), null, f + "：代词变形在范围外，查不到");
  // 放行表（form-allow.tsv）：自己有功能词条目、实词读法常见的写法照样查得到；没放行的功能词仍查不到
  assert.equal(fr.lemma("vu"), "voir", "vu → voir"); assert.equal(de.lemma("sprich"), "sprechen");
  { const es = use("es"); assert.equal(es.lemma("veces"), "vez", "veces → vez"); assert.equal(es.lemma("cabe"), "caber"); assert.equal(es.entry("nos"), null, "nos 不借 no 的释义"); }
  { const it = use("it"); assert.equal(it.lemma("tutti"), "tutto"); assert.equal(it.entry("con"), null, "con 不借 come 的释义"); }
  CORE.useLang("fr"); assert.equal(fr.entry("tu"), null, "tu 不借 taire 的释义"); assert.equal(fr.entry("dans"), null);
  assert.equal(de.lemma("seins"), "Sein", "名词自己的变形仍归名词");
  assert.equal(de.lemma("häuser"), "Haus");
  const fr2 = use("fr");
  assert.equal(fr2.entry("tous"), null, "法语 tous：限定词 / 代词的变形，查不到");
  assert.equal(fr2.lemma("touchée"), "toucher", "变形的变形仍能跟到原形");
  assert.ok(!Object.keys(fr2.F).some((k) => (" " + fr2.F[k] + " ").includes(" de ")), "功能词写法本身不进变形索引（de 不再挂在 dame 下）");
  // 同形、性别不同的名词：成品里每个名词组一个冠词
  const livre = CORE.lookupEntry(fr2.W, null, "livre"), band = (CORE.useLang("de"), CORE.lookupEntry(de.W, null, "Band"));
  assert.deepEqual([livre[1], livre[2]], ["n.书，书籍|n.磅，镑", "le|la"], "livre：书 le｜磅 la");
  assert.deepEqual([band[1].split("|").length, band[2]], [3, "das|der|die"], "Band：带子 das｜卷 der｜乐队 die");
  CORE.useLang("en");
  assert.equal(CORE.formLemma(null, "went"), "", "英语没有变形索引：不查");
}

console.log("lexicon ok: articles (es stress + gender class, fr h marks, it spelling, de), gloss picking, rules for fr / de / es / it / la, generated words.js structure");
