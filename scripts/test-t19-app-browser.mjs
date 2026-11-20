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
  const type = async (page, text) => { await page.locator("#wordCtl").click(); await page.locator("#wordCtl").fill(""); await page.keyboard.type(text); await page.waitForFunction(() => !document.getElementById("candLab").textContent.includes("词形索引加载中")); };
  const randomAt = (page, point) => page.evaluate(point => {
    const random = Math.random;
    try { Math.random = () => point; document.getElementById("candRandom").click(); }
    finally { Math.random = random; }
  }, point);
  const cands = (page) => page.locator("#candList .cand-it").evaluateAll(ns => ns.map(n => ({ w: (n.querySelector(".cand-w b") || n.querySelector(".cand-w")).innerText, art: (n.querySelector(".cand-art") || {}).innerText || "", g: (() => { const c = n.querySelector(".cand-g").cloneNode(true); c.querySelectorAll(".cand-pos").forEach(x => x.remove()); return c.textContent.replace(/(^|；|\] ) /g, "$1").replace(/；/g, "，"); })() })));
  // g = 去掉词性缩写后的释义（旧断言照用）；candsFull 另带 line = 释义行原样（「n. m. 书；n. f. 磅」）与 label = 读屏名
  const candsFull = (page) => page.locator("#candList .cand-it").evaluateAll(ns => ns.map(n => ({ w: (n.querySelector(".cand-w b") || n.querySelector(".cand-w")).innerText, art: (n.querySelector(".cand-art") || {}).innerText || "", line: n.querySelector(".cand-g").innerText, label: n.getAttribute("aria-label") })));
  const gloss = (page) => page.evaluate(() => { const n = document.querySelector('#mirror [data-role="gloss"]'); return n ? n.textContent : ""; });
  const lab = (page) => page.locator("#candLab").innerText();

  // 1 英语：新词库随页面加载；入场义项行、候选只来自可推荐的词、选中后释义、词形与变形提示、无候选字母
  {
    const { page, context, errors } = await pageFor(null);
    assert.equal(await page.evaluate(() => !!(window.LEXICON_STORE && window.LEXICON_POLICY && window.LANGPACK.get("en", "lexicon"))), true, "策略、查询与英语词包就绪");
    await page.locator("#wordInput").fill("LIFE");
    assert.equal(await page.locator("#wordSense").innerText(), "LIFE：生命", "入场义项行取新词库");
    await page.locator("#wordInput").fill("ZYGOTE");
    await page.waitForFunction(() => document.getElementById("wordSense").textContent !== "词形索引加载中"); // 词形索引按需加载，等它结束再看结论
    assert.equal(await page.locator("#wordSense").innerText(), "词库里没有 ZYGOTE 的释义", "新范围以外的词不给释义");
    await page.locator("#wordInput").fill("ZEBRA");
    assert.equal(await page.locator("#wordSense").innerText(), "ZEBRA：斑马", "交付56补的词");
    assert.deepEqual(errors, []); await context.close();
  }
  {
    const { page, context, errors } = await pageFor(null);
    let release;
    const gate = new Promise(ok => { release = ok; });
    await page.route("**/lang/en/inflections.js", async route => { await gate; await route.continue(); });
    await page.locator("#wordInput").fill("DOORS");
    await page.waitForFunction(() => document.getElementById("wordSense").textContent === "词形索引加载中");
    release();
    await page.waitForFunction(() => document.getElementById("wordSense").textContent === "DOORS：门");
    assert.deepEqual(errors, []); await context.close();
  }
  {
    const { page, context, errors } = await pageFor(D("en", "DOGZ"));
    await type(page, "d");
    assert.match(await lab(page), / · 1 \/ \d+ 批$/);
    const first = await cands(page);
    // 同拼写、同词性匹配后的重建排名中，do 排在 day 与 door 之前。
    assert.equal(first.length, 8, "每批 8 个"); assert.equal(first[0].w, "Do"); assert.equal(first[0].g, "做");
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
    assert.equal((await cands(page)).length, 0); assert.match(await lab(page), /^词库里没有输入的词$/);
    await type(page, "zygote"); assert.equal(await gloss(page), "", "新范围以外的词：释义留空待填");
    await page.locator("#wordCtl").fill(""); await page.locator("#candRandom").click(); await page.waitForTimeout(50);
    assert.match(await page.locator("#wordCtl").inputValue(), /^Z[a-z]+$/, "Z 格随机得到补的词");
    assert.deepEqual(errors, []); await context.close();
  }
  { // 词性缩写（第六轮真机建议，用户 11-19 定写法）：各语言词典写法，法西意名词按义项带阴阳性，义项栏行首同一写法
    const look = async (draft, text, w, art) => { const { page, context, errors } = await pageFor(draft); await cell(page, 0); await type(page, text);
      const c = (await candsFull(page)).find(x => x.w === w && x.art === art); assert.ok(c, w + " 在候选里"); return { page, context, errors, c }; };
    { const { page, context, errors, c } = await look(D("fr", "LIVRE"), "livre", "Livre", "le");
      assert.equal(c.line, "n. m. 书；n. f. 磅", "同一个词按义项标阴阳"); assert.match(c.label, /阳性名词，书；阴性名词，磅/);
      await page.locator("#candList .cand-it").filter({ hasText: "n. m. 书" }).first().click(); await page.locator("#glossCtl").focus();
      assert.deepEqual(await page.locator("#senseList .sense-row .pos").allInnerTexts(), ["n. m.", "n. f."], "义项栏行首也换成阴阳性，不再写 n. le / n. la");
      assert.deepEqual(errors, []); await context.close(); }
    { const { context, errors, c } = await look(D("fr", "HOMME"), "homme", "Homme", "l’"); assert.equal(c.line, "n. m. 人，男人", "l’ 看不出的阴阳性写进缩写"); assert.deepEqual(errors, []); await context.close(); }
    { const { context, errors, c } = await look(D("es", "AGUA"), "agua", "Agua", "el"); assert.equal(c.line, "s. f. 水", "el agua 是阴性"); assert.deepEqual(errors, []); await context.close(); }
    { const { context, errors, c } = await look(D("it", "AMICO"), "amico", "Amico", "l’"); assert.equal(c.line, "s. m. 朋友；agg. 友好", "意语形容词写 agg."); assert.deepEqual(errors, []); await context.close(); }
    { const { context, errors, c } = await look(D("de", "BAND"), "band", "Band", "das"); assert.match(c.line, /^Subst\. /, "德语名词写 Subst.，性由冠词表示"); assert.deepEqual(errors, []); await context.close(); }
    { const { context, errors, c } = await look({ ...D("fr", "LIVRE"), langs: ["en", "fr"] }, "livre", "Livre", "le"); assert.equal(c.line, "[法] n. m. 书；n. f. 磅", "多选时语言标记在前"); assert.deepEqual(errors, []); await context.close(); }
  }
  { // 用原生 Delete / Backspace 在词中及词首删改，再从草稿重开。
    const { page, context, errors } = await pageFor(D("de", "ES"));
    const input = page.locator("#wordCtl");
    // 词形索引在打字中途才加载完（app-model refreshPicks 换掉内容没变的词条对象，essen 删改后会被写回 Essen）：扣住 de 的 inflections.js，
    // 删成 esen（触发加载）后放行、等加载完再补回 s，保证每次都走到这个时序（2026-11-19 复审：原写法靠运气，变异检验三次只抓到一次）
    let release; const held = new Promise(r => { release = r; });
    let heldHits = 0; await page.route("**/lang/de/inflections.js", async route => { heldHits++; await held; await route.continue(); });
    await type(page, "essen");
    await input.evaluate(n => n.setSelectionRange(1, 1));
    await input.press("Delete");
    release(); await page.waitForFunction(() => window.LANGPACK.has("de", "inflections")); await page.waitForTimeout(100);
    await page.unroute("**/lang/de/inflections.js"); assert.equal(heldHits, 1, "de 词形索引确实是在打字中途才到（请求被扣住过一次；否则这段测不到时序）");
    await input.pressSequentially("s");
    assert.equal(await input.inputValue(), "essen");
    assert.equal(await gloss(page), "吃");
    await cell(page, 1);
    await type(page, "sein");
    await input.evaluate(n => n.setSelectionRange(1, 1));
    await input.press("Backspace");
    await input.pressSequentially("S");
    assert.equal(await input.inputValue(), "Sein");
    assert.equal(await gloss(page), "存在");
    await input.blur();
    await page.waitForFunction(k => {
      const d = JSON.parse(localStorage.getItem(k) || "null");
      return d && d.picks[1] && d.picks[1][0] === "Sein";
    }, KEY);
    await page.reload();
    await page.locator("#pl-0").waitFor();
    await cell(page, 0);
    assert.equal(await gloss(page), "吃");
    await cell(page, 1);
    assert.equal(await gloss(page), "存在");
    assert.deepEqual(errors, []);
    await context.close();
  }
  // 2 德语：冠词、大小写、同形词头的词形不串义、已知独立词不借义
  {
    const { page, context, errors } = await pageFor(D("de", "HSLHS"));
    const article = () => page.locator('#mirror [data-role="article"]').allInnerTexts();
    const nounSenses = async (word, senses) => {
      await type(page, word);
      assert.equal((await cands(page))[0].w, word);
      for (const [meaning, genderArticle] of senses) {
        await page.locator("#glossCtl").focus();
        await page.locator("#senseList").getByRole("button", { name: meaning, exact: true }).click();
        assert.equal(await gloss(page), meaning);
        assert.deepEqual(await article(), [genderArticle]);
      }
    };
    await nounSenses("Hut", [["守护", "die"], ["帽子", "der"]]);
    await cell(page, 3); // 新格校验自动释义，避开手选释义保留规则。
    await type(page, "Hüte");
    assert.equal(await gloss(page), "帽子", "Hüte 只指帽子义的复数");
    assert.deepEqual(await article(), [], "复数不继承单数冠词");
    assert.match(await lab(page), /Hüte 是 Hut 的变形/);
    await cell(page, 4); await nounSenses("See", [["海", "die"], ["湖", "der"]]);
    await cell(page, 1); await type(page, "schon"); assert.equal(await gloss(page), "已经", "schon 是收进来的副词（交付61），不是借到 schön"); 
    await type(page, "schön"); assert.equal(await gloss(page), "美丽"); // L01：形容词去掉末尾的「的」
    // 德语名词与动词分别按实际输入大小写取义，另一词条始终可选。
    await type(page, "sein");
    { const c = await cands(page); assert.deepEqual(c[0], { w: "sein", art: "", g: "是" });
      assert.equal(await gloss(page), "是");
      assert.equal(await page.locator('#mirror [data-role="word"]').first().textContent(), "sein");
      const noun = c.findIndex(x => x.w === "Sein" && x.art === "das" && x.g === "存在");
      assert.ok(noun > 0);
      await page.locator("#candList .cand-it").nth(noun).click();
      assert.equal(await gloss(page), "存在");
      assert.equal(await page.locator('#mirror [data-role="word"]').first().textContent(), "Sein"); }
    await type(page, "Sein");
    assert.deepEqual((await cands(page))[0], { w: "Sein", art: "das", g: "存在" });
    // 2026-11-19 复审：返工时形容词 licht（明亮）靠字幕小写 licht 的整笔频次（实为名词 Licht）进了词库，已由 rare-parent-veto.tsv 撤回；
    // 小写打 licht 仍给名词 Licht
    await cell(page, 2); await type(page, "licht");
    assert.deepEqual((await cands(page))[0], { w: "Licht", art: "das", g: "光" });
    await page.locator("#candList .cand-it").first().click();
    assert.deepEqual(await page.locator('#mirror [data-role="article"]').allInnerTexts(), ["das"], "选中名词后卡上带冠词");
    assert.deepEqual(errors, []); await context.close();
  }
  // H1/H2：法语 T 格保留未确认的自定义输入，重开后重新查 terre。
  {
    const { page, context, errors } = await pageFor(D("fr", "TERRE"));
    await type(page, "treeee");
    await page.waitForFunction(k => {
      const d = JSON.parse(localStorage.getItem(k) || "null");
      return d && d.picks[0] && d.picks[0][0] === "Treeee";
    }, KEY);
    await page.reload();
    await page.waitForFunction(() => !document.getElementById("wordInput").disabled && window.LANGPACK.has("fr", "words"));
    await cell(page, 0);
    assert.equal(await page.locator("#wordCtl").inputValue(), "Treeee");
    await type(page, "terre");
    assert.equal((await cands(page))[0].art, "la");
    assert.equal(await gloss(page), "地球", "空自动释义采用 terre 当前首义");
    await page.locator("#glossCtl").focus();
    await page.locator("#senseList").getByRole("button", { name: "大地", exact: true }).click();
    await page.waitForFunction(k => {
      const d = JSON.parse(localStorage.getItem(k) || "null");
      return d && d.glosses[0] === "大地" && d.glossAuto[0] === false;
    }, KEY);
    await page.reload();
    await page.waitForFunction(() => !document.getElementById("wordInput").disabled && window.LANGPACK.has("fr", "words"));
    await cell(page, 0);
    assert.equal(await gloss(page), "大地", "重开后仍保留用户选过的义项");
    assert.deepEqual(await page.locator('#mirror [data-role="article"]').allInnerTexts(), ["la"]);
    await page.locator("#glossCtl").focus();
    assert.equal(await page.locator("#senseList").getByRole("button", { name: "大地", exact: true }).getAttribute("aria-pressed"), "true");
    assert.deepEqual(errors, []);
    await context.close();
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
  { // Q15 轻度粗口只供精确查询，Q16 中文同义词经词包反查进入可见候选。
    const { page, context, errors } = await pageFor(D("fr", "MS"));
    await type(page, "merd");
    assert.ok(!(await cands(page)).some(c => c.w === "Merde"));
    await type(page, "merde"); assert.equal(await gloss(page), "屎");
    await type(page, "mérde"); assert.equal(await gloss(page), "");
    await cell(page, 1); await type(page, "孤单");
    assert.ok((await cands(page)).some(c => c.w === "Solitude" && c.g === "孤独"));
    assert.deepEqual(errors, []); await context.close();
  }
  // 4 拉丁语：不标长音可查；孤例只供手动查询且排在可推荐义项之后；同形动词的词形不串义
  {
    const { page, context, errors } = await pageFor(D("la", "CAL"));
    await type(page, "c"); const firstPage = await cands(page);
    for (let i = 0; i < 80 && await page.locator("#candNext").isVisible(); i++) { await page.locator("#candNext").click(); if ((await cands(page))[0].w === firstPage[0].w) break; assert.ok(!(await cands(page)).some(c => c.w === "Cubitus"), "孤例不进候选"); }
    await type(page, "cubitus"); assert.equal(await gloss(page), "卧榻", "孤例手动可查，罕用标记已移入义项注释");
    await type(page, "caelum"); assert.equal(await gloss(page), "天堂", "新增的同词性义当前排在首位");
    await page.locator("#glossCtl").focus();
    await page.locator("#senseList").getByRole("button", { name: "天空", exact: true }).click();
    assert.equal(await gloss(page), "天空", "原有的天空义仍可选择");
    await cell(page, 1); await type(page, "alba"); assert.equal(await gloss(page), "白色", "alba 先给 albus 的白色义（L01 去「的」）");
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
    const banned = await page.evaluate(() => { const P = window.LEXICON_POLICY, lx = window.LANGPACK.get("la", "lexicon"); return lx.senses.filter(s => s[8] === 1 || !["daily", "creative"].includes(s[6])).map(s => s[1].toLowerCase()); });
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
    assert.match(await lab(page), /^H 开头 · 1 \/ \d+ 批/);
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
    await randomAt(page, 0.9999);
    assert.match(await page.locator("#wordCtl").inputValue(), /^(Harp|Harmonic|Hermitage|Hereditary|Heredity|Hydrolysis)$/, "开关打开后，抽样区间末尾包含专业或历史文化词");
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
    assert.equal(all[0].w, "I", "新收的德语字母名精确命中，优先于展开候选");
    assert.deepEqual(all.slice(1, 7).map(c => c.w).sort(), ["Infektion", "Ion", "Ironie", "immunisieren", "infizieren", "ironisieren"]); assert.equal(all.length, 8);
    assert.deepEqual(errors, []); await context.close();
  }
  { // 意语 H 已有词。拉丁语 K 仍为空：没有候选，随机不填、不出错。
    const { page, context, errors } = await pageFor(D("la", "KO"));
    await type(page, "k");
    assert.equal((await cands(page)).length, 0); assert.match(await lab(page), /^词库里没有输入的词$/);
    await page.locator("#wordCtl").fill(""); await page.locator("#candRandom").click(); await page.waitForTimeout(50);
    assert.equal(await page.locator("#wordCtl").inputValue(), "", "没有可随机的词：不填");
    assert.deepEqual(errors, []); await context.close();
  }
  { // 语言多选（2026-11-12）：英语 + 意大利语。单门命中时用该语言，两门都有时轮流排；同形词每门各一条；数字格两门的读法都算对。
    const { page, context, errors } = await pageFor({ ...D("it", "HAI2"), langs: ["en", "it"] });
    await page.waitForFunction(() => window.LANGPACK.has("en", "words") && !!window.LANGPACK.get("en", "lexicon") && window.CORE.activeLangs().join() === "en,it");
    const rich = () => page.locator("#candList .cand-it").evaluateAll(ns => ns.map(n => ({ w: n.querySelector(".cand-w b").innerText, lang: n.querySelector(".cand-w b").lang, mark: ((n.querySelector(".cand-lang") || {}).innerText || "").trim(), art: (n.querySelector(".cand-art") || {}).innerText || "", label: n.getAttribute("aria-label") })));
    await type(page, "honey");
    let got = await rich();
    assert.equal(got[0].w, "Honey");
    assert.ok(got.every(c => c.lang === "en" && c.mark === "[英]"), "Honey 仅英语命中，候选标「[英]」");
    await cell(page, 1); await type(page, "a");
    got = await rich();
    assert.equal(got.length, 8);
    assert.deepEqual(got.slice(0, 4).map(c => c.lang), ["en", "it", "en", "it"], "A 格：两门语言轮流排");
    assert.ok(got.every(c => c.mark === (c.lang === "en" ? "[英]" : "[意]")), "每个候选标语言「[英]」「[意]」");
    assert.ok(got.filter(c => c.lang === "it").every(c => /，意大利语，/.test(c.label)) && got.filter(c => c.lang === "en").every(c => /，英语，/.test(c.label)), "读屏名写语言全称：" + got[1].label);
    assert.ok(got.filter(c => c.lang === "en").every(c => !c.art), "英语词不带冠词");
    await type(page, "amore");
    got = await rich();
    assert.deepEqual([got[0].w, got[0].lang, got[0].art], ["Amore", "it", "l’"], "意语词带自己的冠词");
    await page.locator("#candList .cand-it").first().click();
    await page.waitForFunction(k => { const d = JSON.parse(localStorage.getItem(k) || "null"); return d && d.picks[1] && d.pickLangs && d.pickLangs[1] === "it"; }, KEY);
    assert.equal(await page.locator('#mirror [data-role="article"]').first().innerText(), "l’", "卡上的冠词跟着词自己的语言");
    await page.locator("#glossCtl").click(); // U05：多选时义项栏行首也标语言；卡面释义不标
    assert.match(await page.locator("#senseList .sense-row .pos").first().innerText(), /^\[意\] /, "义项栏行首标「[意]」");
    assert.match(await page.locator("#senseList .sense-row").first().getAttribute("aria-label"), /^意大利语，/, "义项组的读屏名写语言全称（行首「[意]」对读屏隐藏）");
    assert.doesNotMatch(await page.evaluate(() => (document.querySelector('#mirror [data-role="gloss"]') || {}).textContent || ""), /\[/, "卡面释义不标语言");
    await page.locator("#glossCtl").blur();
    await cell(page, 2); await type(page, "idea"); // 英语、意语都有 idea：每门各出一条，排在最前
    got = await rich();
    assert.deepEqual(got.slice(0, 2).map(c => [c.w, c.lang]), [["Idea", "en"], ["Idea", "it"]], "两门都查得到：各出一条，各标语言");
    assert.equal(got.filter(c => c.w === "Idea").length, 2, "不重复");
    await page.locator("#candList .cand-it").nth(1).click();
    await page.waitForFunction(k => { const d = JSON.parse(localStorage.getItem(k) || "null"); return d && d.pickLangs && d.pickLangs[2] === "it"; }, KEY);
    await cell(page, 3); await page.locator("#wordCtl").click();
    assert.equal(await lab(page), "T/D 开头", "数字格：两门的读法首字母并列（v00.03.01 R03）");
    for (const w of ["two", "due", "2nd"]) { await type(page, w); assert.equal(await page.locator("#candMsg").innerText(), "", w + " 算对"); }
    await type(page, "zwei"); assert.match(await page.locator("#candMsg").innerText(), /不是以 T\/D 开头/, "没选的语言的读法不算");
    await cell(page, 0); await page.locator("#wordCtl").click(); await page.locator("#wordCtl").fill(""); await randomAt(page, 0);
    const rolled = await page.locator("#wordCtl").inputValue();
    assert.ok(rolled && rolled !== "Honey", "实际随机选中了别的词");
    await page.waitForFunction(({ key, rolled }) => { const d = JSON.parse(localStorage.getItem(key) || "null"); return d && d.picks[0] && d.picks[0][0] === rolled && d.pickLangs[0] === "en"; }, { key: KEY, rolled });
    const saved = await page.evaluate(k => JSON.parse(localStorage.getItem(k)), KEY);
    assert.deepEqual([saved.lang, saved.langs, saved.pickLangs.slice(0, 3)], ["it", ["en", "it"], ["en", "it", "it"]], "草稿：两门语言、各格的词来自哪门；随机从选中的语言里挑");
    await page.reload(); await page.waitForFunction(() => !document.getElementById("wordInput").disabled && window.CORE.activeLangs().join() === "en,it");
    await page.waitForFunction(() => window.LANGPACK.has("it", "words") && !!window.LANGPACK.get("it", "lexicon"));
    await cell(page, 1); assert.equal(await page.locator('#mirror [data-role="article"]').first().innerText(), "l’", "刷新后冠词仍在");
    const back = await page.evaluate(k => JSON.parse(localStorage.getItem(k)), KEY);
    assert.deepEqual([back.langs, back.picks.slice(0, 3).map(p => p[0].toLowerCase()), back.pickLangs.slice(0, 3)], [["en", "it"], [saved.picks[0][0].toLowerCase(), "amore", "idea"], ["en", "it", "it"]], "刷新后原样");
    assert.deepEqual(errors, []); await context.close();
  }
  { // L01 复审：形容词去「的」后与同形名词写成一样（secret：n. 秘密 / adj. 秘密），义项栏只按下记着的那一组；旧稿自动带出的「宁静的」认作「宁静」
    const { page, context, errors } = await pageFor({ ...D("en", "SH", [["secret", "n.秘密|adj.秘密的", "", ""], ["halcyon", "adj.宁静的", "", ""]]), glosses: ["秘密", "宁静的"] });
    const bar = () => page.locator("#senseList .sense-row").evaluateAll(rs => rs.map(r => [r.querySelector(".pos").innerText, ...[...r.querySelectorAll("button")].map(b => b.innerText + ":" + b.getAttribute("aria-pressed"))]));
    await cell(page, 0); await page.locator("#glossCtl").click();
    assert.deepEqual(await bar(page), [["n.", "秘密:true"], ["adj.", "秘密:false"]], "自动释义按第一组（名词）认");
    await page.locator("#senseList .sense-row").nth(1).locator("button").click();
    assert.deepEqual(await bar(page), [["n.", "秘密:false"], ["adj.", "秘密:true"]], "点了形容词那组：只按下形容词");
    await page.locator("#glossCtl").blur();
    await cell(page, 1); await page.locator("#glossCtl").click();
    assert.equal(await page.locator("#glossCtl").inputValue(), "宁静", "旧稿自动释义采用审定的新写法");
    assert.deepEqual(await bar(page), [["adj.", "宁静:true"]], "旧稿的「宁静的」在义项栏认作「宁静」");
    assert.deepEqual(errors, []); await context.close();
  }
  { // v00.03.01 R02（真机 C5）：去变音符才撞上的词形不说「是…的变形」（é ≠ è）；精确词形照说，多选时写明语言
    const { page, context, errors } = await pageFor({ ...D("it", "EE"), langs: ["en", "it"] });
    await page.waitForFunction(() => window.LANGPACK.has("en", "words") && !!window.LANGPACK.get("en", "lexicon") && window.CORE.activeLangs().join() === "en,it");
    await cell(page, 0); await type(page, "é"); await page.waitForTimeout(50);
    assert.doesNotMatch(await lab(page), /的变形/, "é 去掉变音符撞上 è：不标成 essere 的变形");
    await type(page, "è"); await page.waitForTimeout(50);
    assert.match(await lab(page), /È 是 essere 的变形（意大利语）/, "精确词形照说，多选写明语言");
    assert.deepEqual(errors, []); await context.close();
  }
  { // 批 A 复审（R04）：卡面 Pierre，单词框仍放存下的 pierre——回到这格改一个字再删掉，词义不能从「石头」变成人名「皮埃尔」
    const { page, context, errors } = await pageFor({ ...D("fr", "PA", [["pierre", "n.石头", "la"], null]), glosses: ["石头", ""], pickLangs: ["fr", ""] });
    await cell(page, 1); await cell(page, 0);
    assert.equal(await page.evaluate(() => [...document.querySelectorAll('#mirror [data-role="word"]')].map(n => n.textContent).join("")), "Pierre", "卡面首字母大写");
    assert.equal(await page.locator("#wordCtl").inputValue(), "pierre", "框里是存下的拼写");
    // 扣住 fr 的 inflections.js：打 s 成 pierres（触发加载），等加载完再删回，保证每次都走到「词形索引中途到达」的时序（2026-11-19 返工）
    let release; const held = new Promise(r => { release = r; });
    let heldHits = 0; await page.route("**/lang/fr/inflections.js", async route => { heldHits++; await held; await route.continue(); });
    await page.locator("#wordCtl").click(); await page.keyboard.press("End"); await page.keyboard.type("s");
    release(); await page.waitForFunction(() => window.LANGPACK.has("fr", "inflections")); await page.waitForTimeout(100);
    await page.unroute("**/lang/fr/inflections.js"); assert.equal(heldHits, 1, "fr 词形索引确实是在打字中途才到（请求被扣住过一次；否则这段测不到时序）");
    await page.keyboard.press("Backspace");
    assert.equal(await gloss(page), "石头", "改字再删回：仍是石头");
    await page.locator("#wordCtl").blur(); await page.waitForTimeout(600); // 等草稿写盘
    assert.deepEqual((await page.evaluate(k => JSON.parse(localStorage.getItem(k)).picks[0], KEY)).slice(0, 2), ["pierre", "n.石头"], "存下的仍是 pierre 石头");
    assert.deepEqual(errors, []); await context.close();
  }
  { // 西语：unas 是冠词，不借到 unir / uña（交付56审核修正）；拉丁语 zephirum 不借到西风
    const { page, context, errors } = await pageFor(D("es", "LUZ"));
    await cell(page, 1); await type(page, "unas"); assert.match(await lab(page), /^词库里没有输入的词$/);
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
  // R3-12 五语漏音符查询：候选栏里精确命中在前、带音符的拼写可选；点选采用该拼写与释义，刷新后找回，手填释义保留
  {
    const shown = async page => (await cands(page)).map(c => c.w + "/" + c.g.replace(/^\[.\] /, ""));
    const word = page => page.locator('#mirror [data-role="word"]').first().textContent();
    // 词形索引按需加载：先让它到位再查，这样看到的是索引齐全时的结果（索引迟到的时序另有一段）
    const warm = async (page, code) => { await page.evaluate(c => window.LANGPACK.loader().load(c, ["inflections"]), code); await page.waitForFunction(c => window.LANGPACK.has(c, "inflections"), code); };
    const reopen = async page => { await page.reload(); await page.waitForFunction(() => !document.getElementById("wordInput").disabled); await page.locator("#pl-0").waitFor(); };
    const saved = (page, test) => page.waitForFunction(([k, src]) => { const d = JSON.parse(localStorage.getItem(k) || "null"); return !!d && new Function("d", "return " + src)(d); }, [KEY, test]);
    { // 西语：ano 在前、año 可选；点选后采用带 ñ 的拼写与「年」，刷新找回；手填释义保留；publicó 不补成 público
      const { page, context, errors } = await pageFor(D("es", "AP")); await warm(page, "es");
      await type(page, "ano");
      { const s = await shown(page); assert.equal(s[0], "Ano/肛门", "" + " " + s); assert.ok(s.includes("Año/年"), "" + " 缺 Año/年 " + s); }
      assert.equal(await gloss(page), "肛门", "有精确命中：自动带出精确的那个");
      await page.locator("#candList .cand-it").nth(1).click();
      assert.deepEqual([await word(page), await gloss(page)], ["Año", "年"], "点选后采用带音符的拼写与释义");
      await saved(page, "d.picks[0] && d.picks[0][0] === 'Año' && d.glosses[0] === '年'");
      await reopen(page); await cell(page, 0);
      assert.deepEqual([await page.locator("#wordCtl").inputValue(), await gloss(page)], ["Año", "年"], "刷新后找回已选的词和义项");
      await page.locator("#glossCtl").fill("我的年");
      await saved(page, "d.glosses[0] === '我的年' && d.glossAuto[0] === false");
      await reopen(page); await cell(page, 0);
      assert.deepEqual([await page.locator("#wordCtl").inputValue(), await gloss(page)], ["Año", "我的年"], "手填释义保留");
      await cell(page, 1); await type(page, "publico");
      { const s = await shown(page); assert.equal(s[0], "Publico/出版", "先出 publicar 的变位，público 可选" + " " + s); assert.ok(s.includes("Público/公众，公众"), "先出 publicar 的变位，público 可选" + " 缺 Público/公众，公众 " + s); }
      await type(page, "publicó");
      assert.deepEqual(await shown(page), ["Publicó/出版"], "已输入的音符保留：publicó 仍按该变位查，不补成 público（前缀候选也一样）");
      assert.equal(await gloss(page), "出版");
      assert.deepEqual(errors, []); await context.close();
    }
    { // 法语：peche 不自动带出，点选 péché 采用「罪恶」；cafe 只有一个候选，自动带出；sur 不借 sûr
      const { page, context, errors } = await pageFor(D("fr", "PCS")); await warm(page, "fr");
      await type(page, "peche");
      { const s = await shown(page); assert.equal(s[0], "Péché/罪恶", s); assert.ok(s.includes("Pêche/桃子"), "合并新管线后有 pêche「桃子」 " + s); }
      assert.equal(await gloss(page), "", "多个候选：保留原输入，不自动带出");
      await page.locator("#candList .cand-it").first().click();
      assert.deepEqual([await word(page), await gloss(page)], ["Péché", "罪恶"]);
      await cell(page, 1); await type(page, "cafe");
      assert.equal((await shown(page))[0], "Café/咖啡，咖啡色", "漏音符候选在候选栏里带音符"); assert.equal(await gloss(page), "咖啡");
      await cell(page, 2); await type(page, "sur");
      assert.equal(await gloss(page), "", "sur 是已知独立词，不借 sûr 的释义自动带出");
      { const s = await shown(page); assert.ok(s.some(x => /^Sûr\//.test(x)), "复审 R3-14：sûr 只作普通前缀候选出现，可点选（原有行为），卡面不自动带出 " + s); }
      assert.deepEqual(errors, []); await context.close();
    }
    { // 德语 schon
      const { page, context, errors } = await pageFor(D("de", "S")); await warm(page, "de");
      await type(page, "schon");
      { const s = await shown(page); assert.equal(s[0], "schon/已经", "" + " " + s); assert.ok(s.includes("schön/美丽"), "" + " 缺 schön/美丽 " + s); } assert.equal(await gloss(page), "已经");
      await page.locator("#candList .cand-it").nth((await shown(page)).indexOf("schön/美丽")).click(); assert.equal(await gloss(page), "美丽");
      assert.deepEqual(errors, []); await context.close();
    }
    { // 意语 citta、faro、farò
      const { page, context, errors } = await pageFor(D("it", "CF")); await warm(page, "it");
      await type(page, "citta");
      { const s = await shown(page); assert.equal(s[0], "Citta/孩子", "" + " " + s); assert.ok(s.includes("Città/城市"), "" + " 缺 Città/城市 " + s); } assert.equal(await gloss(page), "孩子");
      await page.locator("#candList .cand-it").nth(1).click(); assert.deepEqual([await word(page), await gloss(page)], ["Città", "城市"]);
      await cell(page, 1); await type(page, "faro");
      { const s = await shown(page); assert.equal(s[0], "Faro/灯塔", "" + " " + s); assert.ok(s.includes("Farò/做"), "" + " 缺 Farò/做 " + s); }
      await type(page, "farò");
      assert.deepEqual(await shown(page), ["Farò/做"], "输入 farò 不反向提示 faro（前缀候选也保留已输入的音符）");
      assert.deepEqual(errors, []); await context.close();
    }
    { // 拉丁语：os 两个同形词都精确命中；occido 先出短 i，长 ī 可选
      const { page, context, errors } = await pageFor(D("la", "OO")); await warm(page, "la");
      await type(page, "os");
      { const s = await shown(page); assert.equal(s[0], "Os/骨头", "" + " " + s); assert.ok(s.includes("Os/嘴"), "" + " 缺 Os/嘴 " + s); }
      await cell(page, 1); await type(page, "occido");
      { const s = await shown(page); assert.equal(s[0], "Occido/死亡", "" + " " + s); assert.ok(s.includes("Occīdō/杀死"), "" + " 缺 Occīdō/杀死 " + s); } assert.equal(await gloss(page), "死亡");
      await page.locator("#candList .cand-it").nth(1).click(); assert.deepEqual([await word(page), await gloss(page)], ["Occīdō", "杀死"]);
      assert.deepEqual(errors, []); await context.close();
    }
    { // 多语言：法语的漏音符候选排在德语的精确命中之后；自动带出取德语
      const { page, context, errors } = await pageFor({ ...D("fr", "D"), langs: ["fr", "de"], pickLangs: [""] });
      await page.waitForFunction(() => ["fr", "de"].every(c => window.LANGPACK.has(c, "words") && window.LANGPACK.has(c, "block") && !!window.LANGPACK.get(c, "lexicon")));
      await warm(page, "fr"); await warm(page, "de");
      await type(page, "detail");
      { const s = await shown(page); assert.equal(s[0], "Detail/细节", "" + " " + s); assert.ok(s.includes("Détail/细节"), "" + " 缺 Détail/细节 " + s); }
      assert.deepEqual((await cands(page)).slice(0, 2).map(c => /^\[德\]/.test(c.g) + "," + /^\[法\]/.test(c.g)), ["true,false", "false,true"]);
      assert.equal(await gloss(page), "细节", "复审 R3-13：自动带出取德语精确命中");
      assert.deepEqual(errors, []); await context.close();
    }
    { // 复审 R3-13：法、西两门各有一个漏音符候选（cafétéria、cafetería），合起来不唯一：卡面不自动带出，两者都可点选
      const { page, context, errors } = await pageFor({ ...D("fr", "C"), langs: ["fr", "es"], pickLangs: [""] });
      await page.waitForFunction(() => ["fr", "es"].every(c => window.LANGPACK.has(c, "words") && window.LANGPACK.has(c, "block") && !!window.LANGPACK.get(c, "lexicon")));
      await warm(page, "fr"); await warm(page, "es");
      await type(page, "cafeteria");
      { const s = await shown(page); assert.ok(s.some(x => /^Cafétéria\//.test(x)) && s.some(x => /^Cafetería\//.test(x)), "两门候选都在 " + s); }
      assert.equal(await gloss(page), "", "多语漏音符候选不唯一：保留原输入");
      // 复审 R3-16：留空的 cafeteria 存进草稿，重新打开不能被重核自动填成法语「自助餐厅」；再扣住两门词形请求后放行，也不能填
      const both = () => page.waitForFunction(() => ["fr", "es"].every(c => window.LANGPACK.has(c, "words") && !!window.LANGPACK.get(c, "lexicon")));
      await page.waitForTimeout(800); await page.reload(); await page.waitForFunction(() => !document.getElementById("wordInput").disabled); await both();
      await cell(page, 0); assert.equal(await gloss(page), "", "重新打开：只存了拼写的格不算已选义项，仍留空");
      let release, heldHits = 0; const held = new Promise(r => { release = r; });
      for (const c of ["fr", "es"]) await page.route(`**/lang/${c}/inflections.js`, async route => { heldHits++; await held; await route.continue(); });
      await page.reload({ waitUntil: "domcontentloaded" }); await page.waitForFunction(() => !document.getElementById("wordInput").disabled); await both();
      await cell(page, 0); await page.waitForTimeout(300);
      assert.ok(heldHits > 0, "词形请求确被扣住（否则这段空跑）");
      release(); await page.waitForTimeout(800);
      await cell(page, 0); assert.equal(await gloss(page), "", "词形请求扣住后放行：仍留空");
      assert.deepEqual(errors, []); await context.close();
    }
    { // 词形索引迟到：先以唯一的漏音符候选带出的义项，索引到达后不被精确变位顶替；候选补齐
      const { page, context, errors } = await pageFor(D("es", "P"));
      let release; const held = new Promise(r => { release = r; });
      await page.route("**/lang/es/inflections.js", async route => { await held; await route.continue(); });
      await page.locator("#wordCtl").click(); await page.locator("#wordCtl").fill(""); await page.keyboard.type("publico");
      assert.equal(await gloss(page), "公众", "索引未到：público 是唯一候选，自动带出");
      release(); await page.waitForFunction(() => window.LANGPACK.has("es", "inflections")); await page.waitForTimeout(150);
      assert.equal(await gloss(page), "公众", "索引到了：已带出的义项不被静默替换");
      { const s = await shown(page); assert.equal(s[0], "Publico/出版", "候选补齐，精确变位在前" + " " + s); assert.ok(s.includes("Público/公众，公众"), "候选补齐，精确变位在前" + " 缺 Público/公众，公众 " + s); }
      assert.deepEqual(errors, []); await context.close();
    }
  }
  console.log("T19 主编辑器接入浏览器检查通过（英德法拉丁四语，西语、意语各一组）：词包加载、入场义项行、候选只含可推荐词、专业词与词组手动可查、词形与变形提示、同形不串义、防误借、人名数词与孤例只供查询、无候选字母、随机、草稿补齐、语言多选（英 + 意）。");
} finally { if (browser) await browser.close(); server.close(); }
