// 可选浏览器回归：T19 新范围词包接进主编辑器后的端到端行为（用包内真实词包，不替换请求）。
// PLAYWRIGHT_MODULE=/absolute/path/to/playwright CHROMIUM_PATH=/path/to/chromium node scripts/test-t19-app-browser.mjs
import { createRequire } from "node:module";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const root = fileURLToPath(new URL("../app", import.meta.url));
const server = createServer(async (req, res) => {
  const file = path.resolve(root, "." + (req.url === "/" ? "/index.html" : req.url.split("?")[0]));
  if (!file.startsWith(root)) { res.writeHead(403).end(); return; }
  try {
    res.setHeader("Content-Type", { ".js": "text/javascript", ".css": "text/css", ".html": "text/html", ".woff2": "font/woff2" }[path.extname(file)] || "application/octet-stream");
    res.setHeader("Cache-Control", "no-store"); res.end(await readFile(file));
  } catch { res.writeHead(404).end(); }
});
await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
const url = "http://127.0.0.1:" + server.address().port, KEY = "backronym-draft-v2";
const D = (lang, word, picks) => ({ v: 2, lang, word, filler: "", view: "single", titleRuns: null, picks: picks || [...word].map(() => null),
  glosses: [...word].map(() => ""), glossAuto: [...word].map(() => true), captions: [...word].map(() => ""), keys: [...word].map(() => 0) });
let browser;
try {
  browser = await chromium.launch({ headless: true, ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}) });
  async function pageFor(draft, width = 375) {
    const context = await browser.newContext({ viewport: { width, height: 812 } });
    await context.addInitScript(({ draft, KEY }) => {
      if (!sessionStorage.getItem("seeded")) { if (draft) localStorage.setItem(KEY, JSON.stringify({ ...draft, t: Date.now() - 5000 })); localStorage.setItem("backronym-tip-seen", "1"); sessionStorage.setItem("seeded", "1"); }
    }, { draft, KEY });
    const page = await context.newPage(), errors = [];
    page.on("pageerror", e => errors.push(e.message)); page.on("console", m => { if (m.type() === "error") errors.push(m.text()); });
    await page.goto(url);
    await page.waitForFunction(() => !document.getElementById("wordInput").disabled);
    if (draft) await page.waitForFunction(l => window.LANGPACK.has(l, "words") && window.LANGPACK.has(l, "block") && !!window.LANGPACK.get(l, "lexicon"), draft.lang);
    return { page, context, errors };
  }
  const cell = (page, i) => page.evaluate(i => document.getElementById("pl-" + i).click(), i);
  const type = async (page, text) => { await page.locator("#wordCtl").click(); await page.locator("#wordCtl").fill(""); await page.keyboard.type(text); };
  const cands = (page) => page.locator("#candList .cand-it").evaluateAll(ns => ns.map(n => ({ w: (n.querySelector(".cand-w b") || n.querySelector(".cand-w")).innerText, art: (n.querySelector(".cand-art") || {}).innerText || "", g: n.querySelector(".cand-g").innerText })));
  const gloss = (page) => page.evaluate(() => { const n = document.querySelector('#mirror [data-role="gloss"]'); return n ? n.textContent : ""; });
  const lab = (page) => page.locator("#candLab").innerText();

  // 1 英语：新词库随页面加载；入场义项行、候选只来自可推荐的词、选中后释义、词形与变形提示、无候选字母
  {
    const { page, context, errors } = await pageFor(null);
    assert.equal(await page.evaluate(() => !!(window.LEXICON_STORE && window.LEXICON_POLICY && window.LANGPACK.get("en", "lexicon"))), true, "策略、查询与英语词包就绪");
    await page.locator("#wordInput").fill("LIFE");
    assert.equal(await page.locator("#wordSense").innerText(), "LIFE：生命", "入场义项行取新词库");
    await page.locator("#wordInput").fill("ZYGOTE");
    assert.equal(await page.locator("#wordSense").innerText(), "词库里没有 ZYGOTE 的释义", "新范围以外的词不给释义");
    await page.locator("#wordInput").fill("ZEBRA");
    assert.equal(await page.locator("#wordSense").innerText(), "ZEBRA：斑马", "交付56补的词");
    assert.deepEqual(errors, []); await context.close();
  }
  {
    const { page, context, errors } = await pageFor(D("en", "DOGZ"));
    await type(page, "d");
    assert.match(await lab(page), / · 1 \/ \d+ 批$/);
    const first = await cands(page);
    assert.equal(first.length, 8, "每批 8 个"); assert.equal(first[0].w, "Door"); assert.equal(first[0].g, "门");
    await type(page, "depart");
    assert.equal((await cands(page))[0].w, "Depart", "打全了的词排第一");
    await page.locator("#candList .cand-it").first().click();
    assert.equal(await gloss(page), "离开", "选中后卡面带新词库释义");
    // 词形：按义项查回原形，并写明是谁的变形
    await type(page, "doors");
    assert.match(await lab(page), /Doors 是 door 的变形/); assert.equal(await gloss(page), "门");
    // 专业词不进候选，但手动打全能查到，带用法说明里界定的专业义
    await cell(page, 1); await type(page, "ox");
    assert.ok(!(await cands(page)).some(c => /^Oxid/.test(c.w)), "专业词不出现在默认候选");
    await type(page, "oxidation");
    assert.equal((await cands(page))[0].w, "Oxidation"); assert.equal(await gloss(page), "氧化", "手动打全可查专业词");
    // 词组：带空格、不带空格都能查
    await cell(page, 2); await type(page, "golden age"); assert.equal(await gloss(page), "黄金时代");
    await type(page, "goldenage"); assert.equal(await gloss(page), "黄金时代", "不带空格也查得到词组");
    // 交付56补过的字母有候选；打的字对不上任何词时没有候选，写明按用户打的字使用
    await cell(page, 3); await type(page, "z");
    { const z = (await cands(page)).map(c => c.w); assert.equal(z.length, 8, "Z 格有了候选"); for (const w of ["Zebra", "Zone", "Zoo"]) assert.ok(z.includes(w), w); }
    await type(page, "zq");
    assert.equal((await cands(page)).length, 0); assert.match(await lab(page), /词库里没有「Zq」· 会按你打的字使用/);
    await type(page, "zygote"); assert.equal(await gloss(page), "", "新范围以外的词：释义留空待填");
    await page.locator("#wordCtl").fill(""); await page.locator("#candRandom").click(); await page.waitForTimeout(50);
    assert.match(await page.locator("#wordCtl").inputValue(), /^Z[a-z]+$/, "Z 格随机得到补的词");
    assert.deepEqual(errors, []); await context.close();
  }
  // 2 德语：冠词、大小写、同形词头的词形不串义、已知独立词不借义
  {
    const { page, context, errors } = await pageFor(D("de", "HSL"));
    await type(page, "hut");
    assert.deepEqual((await cands(page))[0], { w: "Hut", art: "die", g: "守护" });
    await type(page, "hüte"); assert.equal(await gloss(page), "", "Hüte（帽子的复数）不指向守护"); assert.match(await lab(page), /词库里没有「Hüte」/);
    await cell(page, 1); await type(page, "schon"); assert.equal(await gloss(page), "已经", "schon 是收进来的副词（交付61），不是借到 schön"); 
    await type(page, "schön"); assert.equal(await gloss(page), "美丽的");
    // T19-P1：名词 das Sein 与动词 sein 只差大小写。卡上打的词首字母大写，自动释义取名词「存在」；候选首条必须就是这一条（原先按去大小写的写法去重，名词被当成动词的重复去掉，首条成了「是」），动词另列一条可选
    await type(page, "sein");
    { const c = await cands(page); assert.deepEqual(c[0], { w: "Sein", art: "das", g: "存在" }, "候选首条与卡上释义同一条"); assert.equal(await gloss(page), "存在");
      assert.ok(c.some(x => x.w === "Sein" && x.art === "" && x.g === "是"), "动词 sein 仍可选");
      await page.locator("#candList .cand-it").nth(c.findIndex(x => x.g === "是")).click(); assert.equal(await gloss(page), "是", "点动词：释义随之换成「是」"); }
    await cell(page, 2); await type(page, "licht");
    assert.deepEqual((await cands(page))[0], { w: "Licht", art: "das", g: "光" });
    await page.locator("#candList .cand-it").first().click();
    assert.deepEqual(await page.locator('#mirror [data-role="article"]').allInnerTexts(), ["das"], "选中名词后卡上带冠词");
    assert.deepEqual(errors, []); await context.close();
  }
  // 3 法语：去变音符的词形、直撇号词组、无冠词的城市名、人名与数词只在精确输入时查到
  {
    const { page, context, errors } = await pageFor(D("fr", "LAAD"));
    await type(page, "lumieres"); assert.equal(await gloss(page), "光", "不带重音的复数也查得到");
    assert.deepEqual(await page.locator('#mirror [data-role="article"]').allInnerTexts(), [], "变形不带原形的冠词");
    await cell(page, 1); await type(page, "age d'or"); assert.equal(await gloss(page), "黄金时代");
    await type(page, "alexandrie"); assert.equal(await gloss(page), "亚历山大城");
    assert.deepEqual(await page.locator('#mirror [data-role="article"]').allInnerTexts(), [], "城市名不带冠词");
    await cell(page, 2); await type(page, "an"); assert.ok(!(await cands(page)).some(c => c.w === "Antoine"), "人名不进候选");
    await type(page, "antoine"); assert.equal(await gloss(page), "安托万", "人名精确输入可查");
    await type(page, "antoin"); assert.equal(await gloss(page), "");
    await cell(page, 3); await type(page, "deux"); assert.equal(await gloss(page), "二", "数词精确输入可查");
    await type(page, "de"); assert.ok(!(await cands(page)).some(c => c.w === "Deux"), "数词不进候选");
    assert.deepEqual(errors, []); await context.close();
  }
  // 4 拉丁语：不标长音可查；孤例只供手动查询且排在可推荐义项之后；同形动词的词形不串义
  {
    const { page, context, errors } = await pageFor(D("la", "CAL"));
    await type(page, "c"); const firstPage = await cands(page);
    for (let i = 0; i < 80 && await page.locator("#candNext").isVisible(); i++) { await page.locator("#candNext").click(); if ((await cands(page))[0].w === firstPage[0].w) break; assert.ok(!(await cands(page)).some(c => c.w === "Cubitus"), "孤例不进候选"); }
    await type(page, "cubitus"); assert.equal(await gloss(page), "卧榻（罕）", "孤例手动可查");
    await type(page, "caelum"); assert.equal(await gloss(page), "天空");
    await cell(page, 1); await type(page, "alba"); assert.equal(await gloss(page), "白色的", "alba 先给 albus 的白色义");
    await cell(page, 2); await type(page, "legit"); assert.equal(await gloss(page), "阅读"); assert.match(await lab(page), /Legit 是 legō 的变形/);
    await type(page, "legavi"); assert.equal(await gloss(page), "", "lēgāre 的形式不指向阅读");
    assert.deepEqual(errors, []); await context.close();
  }
  // 5 随机：只从可推荐的词里出；草稿恢复后按新词库补齐义项与冠词
  {
    const { page, context, errors } = await pageFor(D("la", "PA"));
    const seen = new Set();
    for (let i = 0; i < 40; i++) { await page.locator("#wordCtl").click(); await page.locator("#candRandom").click(); await page.waitForTimeout(15); seen.add(await page.locator("#wordCtl").inputValue()); }
    assert.ok(seen.size > 5, "随机能出多个词"); for (const w of ["Pāpa", "Papa"]) assert.ok(!seen.has(w), "孤例不进随机");
    const banned = await page.evaluate(() => { const P = window.LEXICON_POLICY, lx = window.LANGPACK.get("la", "lexicon"); return lx.senses.filter(s => s[8] || !["daily", "creative"].includes(s[6])).map(s => s[1].toLowerCase()); });
    const ok = await page.evaluate(() => Object.values(window.LANGPACK.get("la", "words")).reduce((a, b) => a.concat(b), []).map(r => r[0].toLowerCase()));
    for (const w of seen) assert.ok(ok.includes(w.toLowerCase()), w + " 在可推荐的词里");
    void banned;
    assert.deepEqual(errors, []); await context.close();
  }
  {
    const { page, context, errors } = await pageFor(D("fr", "LE", [["lumière", ""], ["étoile", ""]]));
    await cell(page, 0); await page.locator("#glossCtl").focus();
    assert.deepEqual(await page.locator("#senseList button").allInnerTexts(), ["光"], "草稿里的词按新词库补齐义项（已存的释义不动）"); await page.locator("#glossCtl").blur();
    assert.deepEqual(await page.locator('#mirror [data-role="article"]').allInnerTexts(), ["la"]);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, "无横向滚动");
    assert.deepEqual(errors, []); await context.close();
  }
  // 候选栏开关与固定位置（2026-11-11 用户定）：栏头两行位置不随状态变；用不上的操作停用而不拿掉；开关只在本次编辑有效、不进草稿
  for (const width of [320, 375]) {
    const { page, context, errors } = await pageFor(D("en", "HZ"), width);
    const geo = () => page.evaluate(() => { const c = document.getElementById("cand").getBoundingClientRect(), r = id => { const b = document.getElementById(id).getBoundingClientRect(); return [Math.round(b.left - c.left), Math.round(b.top - c.top), Math.round(b.width), Math.round(b.height)]; }; return { more: r("candMore"), random: r("candRandom"), next: r("candNext"), lab: r("candLab")[1], rowH: Math.round(document.querySelector(".cand-top").getBoundingClientRect().height) }; });
    const sw = () => page.evaluate(() => ({ on: document.getElementById("candMore").getAttribute("aria-pressed"), off: document.getElementById("candMore").disabled, n: document.getElementById("candMoreN").textContent, next: document.getElementById("candNext").disabled, random: document.getElementById("candRandom").disabled, nextShown: !document.getElementById("candNext").hidden }));
    await type(page, "h");
    const g0 = await geo(), s0 = await sw();
    assert.deepEqual([s0.on, s0.off, s0.n, s0.next, s0.nextShown], ["false", false, "+6", false, true], "关：写明这一格多 6 个");
    assert.ok(g0.more[3] >= 44 && g0.random[3] >= 44 && g0.next[3] >= 44, "点按区不小于 44");
    assert.ok(!(await cands(page)).some(c => /专业|历史文化/.test(c.g)), "关着不出专业、历史文化词");
    await page.locator("#candMore").click();
    assert.deepEqual(await geo(), g0, width + "：打开后位置不变");
    assert.deepEqual([(await sw()).on, (await sw()).n], ["true", "已加 6"]);
    const opened = await cands(page);
    assert.deepEqual(opened.slice(0, 6).map(c => c.w).sort(), ["Harmonic", "Harp", "Hereditary", "Heredity", "Hermitage", "Hydrolysis"], "新加入的词排最前");
    assert.ok(opened.slice(0, 6).every(c => /^(专业|历史文化) · /.test(c.g)) && !/专业|历史文化/.test(opened[6].g), "只有新加入的词带类别标注");
    assert.match(await lab(page), /^以 H 开头 · 1 \/ \d+ 批/);
    assert.match(await page.locator("#candList .cand-it").first().getAttribute("aria-label"), /历史文化|专业/, "读屏名带类别");
    await page.locator("#candList .cand-it", { hasText: "Harp" }).click();
    assert.equal(await gloss(page), "竖琴", "类别标注不进卡上的释义");
    await page.waitForFunction(KEY => (JSON.parse(localStorage.getItem(KEY) || "{}").picks || [])[0], KEY);
    const saved = JSON.parse(await page.evaluate(KEY => localStorage.getItem(KEY), KEY));
    assert.equal(saved.picks[0].length, 4, "存进草稿的词条还是四列"); assert.ok(!("more" in saved), "开关不进草稿");
    await type(page, "love");
    assert.deepEqual(await geo(), g0, width + "：出错时位置不变（墨底说明占提示行）");
    assert.equal(await page.locator("#candMsg").innerText(), "Love 不是以 H 开头"); assert.equal((await sw()).next, true, "没有下一批：停用，不拿掉"); assert.equal((await sw()).nextShown, true);
    await type(page, "Empfindungsvermoegenxx");
    assert.deepEqual(await geo(), g0, width + "：提示很长时不换行、不挤走按钮");
    await cell(page, 1); await type(page, "z");
    assert.deepEqual(await geo(), g0, width + "：换一格位置不变");
    assert.deepEqual([(await sw()).on, (await sw()).n, (await sw()).off], ["true", "已加 0", false], "这一格没有可加的词：开着仍能关");
    await page.locator("#candMore").click();
    assert.deepEqual([(await sw()).on, (await sw()).n, (await sw()).off], ["false", "+0", true], "关着且没有可加的词：停用");
    await cell(page, 0); await type(page, "h"); await page.locator("#candMore").click();
    for (let k = 0, seen = new Set(); k < 60 && seen.size < 1; k++) { await page.locator("#candRandom").click(); const w = await page.locator("#wordCtl").inputValue(); if (/^(Harp|Harmonic|Hermitage|Hereditary|Heredity|Hydrolysis)$/.test(w)) seen.add(w); if (k === 59) assert.ok(seen.size, "开着时随机也挑新加入的词"); }
    await page.reload(); await page.waitForFunction(() => !document.getElementById("wordInput").disabled); await page.waitForSelector("#card", { state: "visible" });
    await cell(page, 0); await type(page, "h");
    assert.equal((await sw()).on, "false", "重新打开恢复为关");
    assert.deepEqual(errors, []); await context.close();
  }
  { // 德语 I 格：交付56、60补了常用词；开关再加 6 个专业词，排在最前
    const { page, context, errors } = await pageFor(D("de", "LIED"));
    await cell(page, 1); await type(page, "i");
    { const de = (await cands(page)).map(c => c.w); assert.equal(de.length, 8); for (const w of ["Idee", "Insel"]) assert.ok(de.includes(w), w); } assert.equal(await page.locator("#candMoreN").innerText(), "+6");
    await page.locator("#candMore").click();
    const all = await cands(page);
    assert.deepEqual(all.slice(0, 6).map(c => c.w).sort(), ["Immunisieren", "Infektion", "Infizieren", "Ion", "Ironie", "Ironisieren"]); assert.equal(all.length, 8);
    assert.deepEqual(errors, []); await context.close();
  }
  { // 仍然留空的字母（意语 H：本族词不以 h 开头）：没有候选，随机不填、不出错
    const { page, context, errors } = await pageFor(D("it", "HO"));
    await type(page, "h");
    assert.equal((await cands(page)).length, 0); assert.match(await lab(page), /词库里没有「H」· 会按你打的字使用/);
    await page.locator("#wordCtl").fill(""); await page.locator("#candRandom").click(); await page.waitForTimeout(50);
    assert.equal(await page.locator("#wordCtl").inputValue(), "", "没有可随机的词：不填");
    assert.deepEqual(errors, []); await context.close();
  }
  { // 语言多选（2026-11-12）：英语 + 意大利语。意语没有 H 开头的词，勾上英语就有候选；候选按语言轮流排并标语言；同一个词两门各出一条；数字格两门的读法都算对
    const { page, context, errors } = await pageFor({ ...D("it", "HAI2"), langs: ["en", "it"] });
    await page.waitForFunction(() => window.LANGPACK.has("en", "words") && !!window.LANGPACK.get("en", "lexicon") && window.CORE.activeLangs().join() === "en,it");
    const rich = () => page.locator("#candList .cand-it").evaluateAll(ns => ns.map(n => ({ w: n.querySelector(".cand-w b").innerText, lang: n.querySelector(".cand-w b").lang, mark: (n.querySelector(".cand-lang") || {}).innerText || "", art: (n.querySelector(".cand-art") || {}).innerText || "", label: n.getAttribute("aria-label") })));
    await type(page, "h");
    let got = await rich();
    assert.ok(got.length > 0 && got.every(c => c.lang === "en" && c.mark === "英 · "), "H 格：意语没有，英语补上，各标「英」：" + JSON.stringify(got.slice(0, 3)));
    await cell(page, 1); await type(page, "a");
    got = await rich();
    assert.equal(got.length, 8);
    assert.deepEqual(got.slice(0, 4).map(c => c.lang), ["en", "it", "en", "it"], "A 格：两门语言轮流排");
    assert.ok(got.every(c => c.mark === (c.lang === "en" ? "英 · " : "意 · ")), "每个候选标一个字");
    assert.ok(got.filter(c => c.lang === "it").every(c => /，意大利语，/.test(c.label)) && got.filter(c => c.lang === "en").every(c => /，英语，/.test(c.label)), "读屏名写语言全称：" + got[1].label);
    assert.ok(got.filter(c => c.lang === "en").every(c => !c.art), "英语词不带冠词");
    await type(page, "amore");
    got = await rich();
    assert.deepEqual([got[0].w, got[0].lang, got[0].art], ["Amore", "it", "l’"], "意语词带自己的冠词");
    await page.locator("#candList .cand-it").first().click();
    await page.waitForFunction(k => { const d = JSON.parse(localStorage.getItem(k) || "null"); return d && d.picks[1] && d.pickLangs && d.pickLangs[1] === "it"; }, KEY);
    assert.equal(await page.locator('#mirror [data-role="article"]').first().innerText(), "l’", "卡上的冠词跟着词自己的语言");
    await cell(page, 2); await type(page, "idea"); // 英语、意语都有 idea：每门各出一条，排在最前
    got = await rich();
    assert.deepEqual(got.slice(0, 2).map(c => [c.w, c.lang]), [["Idea", "en"], ["Idea", "it"]], "两门都查得到：各出一条，各标语言");
    assert.equal(got.filter(c => c.w === "Idea").length, 2, "不重复");
    await page.locator("#candList .cand-it").nth(1).click();
    await page.waitForFunction(k => { const d = JSON.parse(localStorage.getItem(k) || "null"); return d && d.pickLangs && d.pickLangs[2] === "it"; }, KEY);
    await cell(page, 3); await page.locator("#wordCtl").click();
    assert.equal(await lab(page), "以 T、D（due）或 2 开头", "数字格：两门的读法并列");
    for (const w of ["two", "due", "2nd"]) { await type(page, w); assert.equal(await page.locator("#candMsg").innerText(), "", w + " 算对"); }
    await type(page, "zwei"); assert.match(await page.locator("#candMsg").innerText(), /不是以 T、D（due）或 2 开头/, "没选的语言的读法不算");
    await cell(page, 0); await page.locator("#wordCtl").click(); await page.locator("#wordCtl").fill(""); await page.locator("#candRandom").click();
    await page.waitForFunction(k => { const d = JSON.parse(localStorage.getItem(k) || "null"); return d && d.picks[0] && d.pickLangs[0] === "en"; }, KEY);
    const saved = await page.evaluate(k => JSON.parse(localStorage.getItem(k)), KEY);
    assert.deepEqual([saved.lang, saved.langs, saved.pickLangs.slice(0, 3)], ["it", ["en", "it"], ["en", "it", "it"]], "草稿：两门语言、各格的词来自哪门；随机从选中的语言里挑");
    await page.reload(); await page.waitForFunction(() => !document.getElementById("wordInput").disabled && window.CORE.activeLangs().join() === "en,it");
    await page.waitForFunction(() => window.LANGPACK.has("it", "words") && !!window.LANGPACK.get("it", "lexicon"));
    await cell(page, 1); assert.equal(await page.locator('#mirror [data-role="article"]').first().innerText(), "l’", "刷新后冠词仍在");
    const back = await page.evaluate(k => JSON.parse(localStorage.getItem(k)), KEY);
    assert.deepEqual([back.langs, back.picks.slice(0, 3).map(p => p[0].toLowerCase()), back.pickLangs.slice(0, 3)], [["en", "it"], [saved.picks[0][0].toLowerCase(), "amore", "idea"], ["en", "it", "it"]], "刷新后原样");
    assert.deepEqual(errors, []); await context.close();
  }
  { // 西语：unas 是冠词，不借到 unir / uña（交付56审核修正）；拉丁语 zephirum 不借到西风
    const { page, context, errors } = await pageFor(D("es", "LUZ"));
    await cell(page, 1); await type(page, "unas"); assert.match(await lab(page), /词库里没有「Unas」/);
    await type(page, "uñas"); assert.match(await lab(page), /Uñas 是 uña 的变形/);
    await type(page, "uv"); assert.ok((await cands(page)).some(c => c.w === "Uva" && c.art === "la"));
    assert.deepEqual(errors, []); await context.close();
  }
  { // V003-B4-R11：语言多选的草稿——一格记着的语言词库还没到时，不被别的语言的同形词顶替（冠词不丢、没选冠词仍被拦）；重试成功后「还没加载好」的提示清掉
    const M = (langs, word, pick, over) => ({ ...D(langs[0], word, [pick]), langs, pickLangs: ["es"], ...over });
    const open = async (draft, setup) => {
      const context = await browser.newContext({ viewport: { width: 375, height: 812 } });
      await context.addInitScript(({ draft, KEY }) => { if (!sessionStorage.getItem("seeded")) { localStorage.setItem(KEY, JSON.stringify({ ...draft, t: Date.now() - 5000 })); localStorage.setItem("backronym-tip-seen", "1"); sessionStorage.setItem("seeded", "1"); } }, { draft, KEY });
      // 只读钩子：把应用对象另存一份到 window.__B，测试据此读每格记着的语言（界面上看不出「没认」和「认成了没有冠词的语言」的区别）
      await context.addInitScript(() => { let v; Object.defineProperty(window, "Backronym", { configurable: true, get() { return v; }, set(x) { v = x; window.__B = x; } }); });
      if (setup) await setup(context);
      const page = await context.newPage(), errors = [];
      page.on("pageerror", e => errors.push(e.message));
      // 默认的 goto 要等页面 load，而动态插入的词库脚本会把它推迟到最慢的一门到达之后；这里只等文档就绪，才能在「某门语言还没到」的时间窗里检查
      await page.goto(url, { waitUntil: "domcontentloaded" }); await page.waitForFunction(() => !document.getElementById("wordInput").disabled);
      return { page, context, errors };
    };
    const has = (page, code) => page.evaluate(c => window.LANGPACK.has(c, "words"), code);
    const langOf = (page, i) => page.evaluate(i => window.__B.model.state.pickLangs[i], i);
    const ready = (page, codes) => page.waitForFunction(cs => cs.every(c => window.LANGPACK.has(c, "words") && window.LANGPACK.has(c, "block")), codes, { timeout: 15000 });
    const slow = (code, ms) => c => c.route("**/lang/" + code + "/words.js", async r => { await new Promise(x => setTimeout(x, ms)); r.continue(); });
    const article = (page) => page.evaluate(() => { const n = document.querySelector('#mirror [data-role="article"]'); return n ? n.innerText : ""; });
    const finish = async (page) => { await page.locator("#finish").click(); await page.waitForTimeout(300); return { hint: await page.locator("#hint").innerText(), panel: await page.locator("#finishPanel").isVisible() }; };
    { // 英语 + 西语：西语的 idea（la）不变成英语的 idea。英语随页面加载，不用人为延迟
      const { page, context, errors } = await open(M(["en", "es"], "I", ["idea", "n.主意", "la"]));
      await ready(page, ["es"]); await page.waitForTimeout(300);
      assert.equal(await article(page), "la", "西语词库到后冠词仍是 la");
      assert.deepEqual(errors, []); await context.close();
    }
    { // 西语 + 意语，西语晚到：已选的 el 留着，能完成
      const { page, context, errors } = await open(M(["es", "it"], "M", ["mar", "n.海", "el / la"], { arts: ["el"], poss: ["n."] }), slow("es", 4000));
      await ready(page, ["it"]); await page.waitForTimeout(200);
      assert.equal(await has(page, "es"), false, "此刻西语确实还没到");
      assert.equal(await article(page), "el", "意语先到：这一格不被意语的同形词顶替");
      await ready(page, ["es"]); await page.waitForTimeout(300);
      assert.equal(await article(page), "el", "西语到后已选的冠词仍在");
      assert.equal((await finish(page)).panel, true, "选过冠词：可以完成");
      assert.deepEqual(errors, []); await context.close();
    }
    { // 同上但没选冠词：点「完成」被拦下
      const { page, context, errors } = await open(M(["es", "it"], "M", ["mar", "n.海", "el / la"], { poss: ["n."] }), slow("es", 1500));
      await ready(page, ["es", "it"]); await page.waitForTimeout(300);
      const r = await finish(page);
      assert.equal(r.panel, false, "两性名词没选冠词：不放行"); assert.match(r.hint, /冠词还没选/);
      assert.deepEqual(errors, []); await context.close();
    }
    { // 西语 + 法语，法语词库先失败：提示写明法语；重试成功后提示清掉
      let fail = true;
      const { page, context } = await open(M(["es", "fr"], "M", ["mar", "n.海", "el / la"], { arts: ["el"], poss: ["n."] }), c => c.route("**/lang/fr/words.js", r => fail ? r.abort() : r.continue()));
      await ready(page, ["es"]); await page.waitForTimeout(500);
      assert.match((await finish(page)).hint, /法语的词库还没加载好/);
      fail = false; await finish(page); // 再点一次触发重试
      await ready(page, ["fr"]); await page.waitForTimeout(300);
      assert.doesNotMatch(await page.locator("#hint").innerText(), /还没加载好/, "词库到了，过时的提示清掉");
      assert.equal((await finish(page)).panel, true);
      await context.close();
    }
    { // V003-B4-R12：没记语言的自定义词（英语里没有 mar；西、意都有）——意语先到不认走，到齐后按语言栏的先后认成西语
      const { page, context, errors } = await open(M(["en", "es", "it"], "M", ["mar", ""], { pickLangs: [""], glosses: ["我的海"], glossAuto: [false] }), slow("es", 4000));
      await ready(page, ["it"]); await page.waitForTimeout(200);
      assert.equal(await has(page, "es"), false, "此刻西语确实还没到");
      assert.equal(await article(page), "", "意语先到：先不认");
      assert.equal(await langOf(page, 0), "", "这一格还没记成任何语言（意语没有冠词，只看冠词分不出来）");
      await ready(page, ["es"]); await page.waitForTimeout(300);
      assert.equal(await article(page), "el / la", "到齐后认成西语（两性，待选）");
      assert.equal(await langOf(page, 0), "es");
      assert.equal(await gloss(page), "我的海", "用户自己写的释义不动");
      const r = await finish(page); assert.equal(r.panel, false); assert.match(r.hint, /冠词还没选/);
      assert.deepEqual(errors, []); await context.close();
    }
    { // R12 复审退回：等着的那门语言被去掉（这里意语一直加载失败）——剩下的语言已到齐，这一格要立刻重新核对，不能留到下次载入
      const { page, context, errors } = await open(M(["en", "es", "it"], "M", ["mar", ""], { pickLangs: [""], glosses: ["我的海"], glossAuto: [false] }), c => c.route("**/lang/it/words.js", r => r.abort()));
      await ready(page, ["es"]); await page.waitForTimeout(600);
      assert.equal(await langOf(page, 0), "", "意语没到：先不认");
      await page.evaluate(() => window.__B.entry.openEntry("edit")); await page.waitForTimeout(200);
      if (await page.locator("#langList").isHidden()) await page.locator("#langMore").click();
      await page.locator('#langList label:has(input[value="it"])').click(); await page.waitForTimeout(300);
      await page.evaluate(() => document.getElementById("entryStart").click()); await page.waitForTimeout(300);
      assert.deepEqual([await langOf(page, 0), await article(page), await gloss(page)], ["es", "el / la", "我的海"], "去掉意语后认成西语，释义不动");
      const r = await finish(page); assert.equal(r.panel, false, "两性名词没选冠词：不放行"); assert.match(r.hint, /冠词还没选/);
      assert.deepEqual(errors, []); await context.close();
    }
    { // 「还没加载好」之后换了别的拦截原因：那门语言到了也不能把新的提示清掉
      const { page, context, errors } = await open({ ...D("es", "MA", [["mar", "n.海", "el / la"], ["amor", "n.爱", "el"]]), langs: ["es", "it"], pickLangs: ["es", "es"], arts: ["el", ""], poss: ["n.", "n."] }, slow("es", 6000));
      await ready(page, ["it"]);
      assert.match((await finish(page)).hint, /西班牙语的词库还没加载好/);
      await cell(page, 1); await page.locator("#wordCtl").click(); await page.locator("#wordCtl").fill("");
      assert.match((await finish(page)).hint, /第 2 格还没有词/);
      assert.equal(await has(page, "es"), false, "此刻西语确实还没到");
      await ready(page, ["es"]); await page.waitForTimeout(300);
      assert.match(await page.locator("#hint").innerText(), /第 2 格还没有词/, "西语到了：别的原因的提示留着");
      assert.deepEqual(errors, []); await context.close();
    }
  }
  console.log("T19 主编辑器接入浏览器检查通过（英德法拉丁四语，西语、意语各一组）：词包加载、入场义项行、候选只含可推荐词、专业词与词组手动可查、词形与变形提示、同形不串义、防误借、人名数词与孤例只供查询、无候选字母、随机、草稿补齐、语言多选（英 + 意）。");
} finally { if (browser) await browser.close(); server.close(); }
