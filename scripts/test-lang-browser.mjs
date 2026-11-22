// v00.03.00 界面重构 · 结构（T20 / T27 / T31 的界面部分）：语言栏、换语言确认、候选两行与冠词、格首提示。
// 使用现有 Playwright，不安装依赖；新端口、新上下文，绝不操作用户预览存储。
// PLAYWRIGHT_MODULE=/absolute/path/to/playwright CHROMIUM_PATH=/path/to/chromium node scripts/test-lang-browser.mjs
// 覆盖：语言栏默认折叠、六个单选「中文 + 原文」带 lang；选中才加载、行内状态、失败可重试、没就绪不能开始；
// 没填内容直接换、填过先确认（保留 / 清空）、清的是词 / 释义 / 配文与标题，配图与填表人留着；标题占位字；
// 西文单词保留变音字母、格首提示「É 或 E」「Z」；候选项两行、冠词、省略号截断、读屏名完整、点按区 ≥ 44px；刷新后按草稿语言恢复。
// 真机上的加载耗时、软键盘与读屏只能真机看。
import { createRequire } from "node:module";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
import { legacyDir } from "./legacy-packs.mjs";
// 本脚本测的是界面行为（多义项、名字标注、短语、冠词二选一等），例子取自旧管线词包；T19 新范围词包接入后，
// 这里的词包请求改由旧词包应答（应用走旧查词路径）。新词包的端到端行为另见 scripts/test-t19-app-browser.mjs。
const LEGACY = legacyDir();
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const root = fileURLToPath(new URL("../app", import.meta.url));
const server = createServer(async (req, res) => {
  let file = path.resolve(root, "." + (req.url === "/" ? "/index.html" : req.url.split("?")[0]));
  if (!file.startsWith(root)) { res.writeHead(403).end(); return; }
  const legacy = /^\/assets\/lang\/([a-z]{2})\/(words|phrases)\.js$/.exec(req.url.split("?")[0]);
  if (legacy) file = path.join(LEGACY, legacy[1], legacy[2] + ".js");
  try {
    const type = { ".js": "text/javascript", ".css": "text/css", ".html": "text/html", ".woff2": "font/woff2" }[path.extname(file)];
    res.setHeader("Content-Type", type || "application/octet-stream");
    res.setHeader("Cache-Control", "no-store"); res.end(await readFile(file));
  } catch { res.writeHead(404).end(); }
});
await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
const url = "http://127.0.0.1:" + server.address().port;
const KEY = "backronym-draft-v2";
let browser;
try {
  browser = await chromium.launch({ headless: true, ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}) });
  { const make = browser.newContext.bind(browser); browser.newContext = options => make({ locale: "zh-CN", ...options }); } // v00.04.00 批 1：界面语言跟随环境，无头浏览器默认报英文；本脚本测的是中文界面
  async function pageFor({ draft = null, width = 360, height = 720, noMedia = false, setup = null } = {}) {
    const context = await browser.newContext({ viewport: { width, height } });
    await context.addInitScript(({ draft, KEY }) => {
      if (!sessionStorage.getItem("seeded")) {
        if (draft) localStorage.setItem(KEY, JSON.stringify({ ...draft, t: Date.now() - 5000 }));
        sessionStorage.setItem("seeded", "1");
      }
    }, { draft, KEY });
    if (noMedia) await context.addInitScript(() => { Object.defineProperty(window, "indexedDB", { get() { return undefined; } }); }); // 配图后端暂缺：草稿里的引用读不回来
    if (setup) await setup(context); // 进页面前挂路由等
    const page = await context.newPage(); const errors = [];
    page.on("pageerror", e => errors.push(e.message));
    await page.goto(url);
    await page.waitForFunction(() => !document.getElementById("wordInput").disabled);
    await page.evaluate(() => document.fonts && document.fonts.ready);
    return { page, context, errors };
  }
  const lang = (page) => page.evaluate(() => window.CORE.LANG.code);
  const stored = (page) => page.evaluate(k => JSON.parse(localStorage.getItem(k) || "null"), KEY);
  const pick = (page, code) => page.locator('#langList label:has(input[value="' + code + '"])').click();
  const ready = (page, code) => page.waitForFunction(c => window.CORE.LANG.code === c && /已就绪/.test(document.getElementById("langNow").innerText), code);
  // 语言多选（2026-11-12）：pick = 勾上 / 取消一门；only = 只留这一门（先勾上它、等就绪，再取消其余的）
  const langsOf = (page) => page.evaluate(() => window.CORE.activeLangs());
  const loaded = (page, code) => page.waitForFunction(c => window.LANGPACK.has(c, "words") && window.LANGPACK.has(c, "block"), code);
  const only = async (page, code) => {
    if (!(await langsOf(page)).includes(code)) await pick(page, code);
    await loaded(page, code);
    for (const c of await langsOf(page)) if (c !== code) await pick(page, c);
    await page.waitForFunction(c => { const a = window.CORE.activeLangs(); return a.length === 1 && a[0] === c; }, code);
  };

  // 1 首次进入：默认英语、折叠；展开六个单选；选法语 → 加载 → 没填内容直接换
  {
    const { page, context, errors } = await pageFor();
    assert.equal(await page.locator("#langNow").innerText(), "英语 English");
    assert.equal(await page.locator("#langList").isVisible(), false, "默认折叠");
    assert.equal(await page.locator("#langMore").getAttribute("aria-expanded"), "false");
    assert.equal(await page.locator("#presetLab").innerText(), "选一个单词作为主题：");
    assert.equal(await page.locator("#presets .preset").count(), 6);
    const cols = await page.locator("#presets .preset").evaluateAll(ns => new Set(ns.map(n => Math.round(n.getBoundingClientRect().left))).size);
    assert.equal(cols, 2, "预设词两列");
    await page.locator("#langMore").click();
    assert.equal(await page.locator("#langMore").getAttribute("aria-expanded"), "true");
    assert.equal(await page.locator("#langList").getAttribute("role"), "group");
    assert.deepEqual(await page.locator("#langList input").evaluateAll(ns => [...new Set(ns.map(n => n.type))]), ["checkbox"], "六个多选框");
    assert.equal(await page.locator('#langList input[value="en"]').isDisabled(), true, "只选了一门：它的框停用（至少留一门）");
    const rows = await page.locator("#langList .lang-row").evaluateAll(ns => ns.map(n => ({ text: n.querySelector(".lang-name").innerText, code: n.querySelector("input").value, olang: n.querySelector(".lang-orig").lang, checked: n.querySelector("input").checked, h: n.getBoundingClientRect().height })));
    assert.deepEqual(rows.map(r => r.text), ["英语 English", "法语 Français", "德语 Deutsch", "西班牙语 Español", "意大利语 Italiano", "拉丁语 Latina"]);
    assert.ok(rows.every(r => r.code === r.olang && r.h >= 44), "原文带各自的 lang，每行 ≥ 44px");
    assert.deepEqual(rows.filter(r => r.checked).map(r => r.code), ["en"]);
    assert.equal(await page.evaluate(() => !!window.LANGPACK.get("fr", "words")), false, "没选之前不加载法语词库");
    await pick(page, "fr"); await ready(page, "fr");
    assert.equal(await page.locator("#wordConfirm").isVisible(), false, "勾语言不弹确认");
    assert.deepEqual(await langsOf(page), ["en", "fr"], "勾上法语：两门都选中");
    assert.equal(await page.locator("#langNow [aria-hidden=true]").innerText(), "英 法", "选了多门：摘要只写首字（2026-11-17）");
    assert.match(await page.locator("#langNow .lang-st").innerText(), /^\s*· 已就绪$/);
    assert.equal(await page.locator("#langNow .sr-only").textContent(), "英语、法语", "全名交给读屏（隐藏文字，不用 span 上的 aria-label）");
    assert.equal(await page.locator("#langNow").getAttribute("aria-label"), null);
    assert.equal(await page.locator("#wordInput").getAttribute("placeholder"), "输入一个单词");
    assert.equal(await page.locator('#langList input[value="en"]').isDisabled(), false);
    { // 预设词从两门语言里轮流取，各带自己的 lang
      const from = await page.locator("#presets button b").evaluateAll(ns => ns.map(n => n.lang));
      assert.equal(from.length, 6); assert.ok(from.filter(c => c === "en").length >= 2 && from.filter(c => c === "fr").length >= 2 && from[0] === "en" && from[1] === "fr", "预设词英、法轮流（两门里拼写相同的词只出一次）：" + from.join()); }
    await pick(page, "en"); // 取消英语：只留法语
    await page.waitForFunction(() => window.CORE.activeLangs().join() === "fr");
    assert.equal(await page.locator('#langList input[value="fr"]').isDisabled(), true);
    assert.equal(await page.locator("#langNow").innerText(), "法语 Français · 已就绪");
    assert.equal(await page.locator("#langRule").innerText(), "", "2026-11-12：法语不再写规则提示");
    assert.equal(await page.locator("#wordInput").getAttribute("placeholder"), "输入一个法语单词");
    assert.equal(await page.locator("#wordInput").getAttribute("lang"), "fr");
    // 2026-11-12 释义表审定后：法语有自己的预设词，写「原词 - 释义」，原词标 lang=fr。
    assert.equal(await page.locator("#presetField").isVisible(), true, "法语有预设词表");
    { const fr = await page.locator("#presets button").allTextContents(); assert.equal(fr.length, 6); for (const t of fr) assert.ok(/^\p{Lu}+[一-鿿]{1,6}$/u.test(t), "法语预设：原词一行、释义一行：" + t);
      assert.equal(await page.locator("#presets button b").first().getAttribute("lang"), "fr"); }
    // 2026-11-12：只选了语言、还没填词就刷新（另开一页，同一份存储）：预设词按草稿的语言重抽，不能留着英语的词。
    { await page.waitForFunction(() => /"lang":"fr"/.test(localStorage.getItem("backronym-draft-v2") || ""));
      const p2 = await context.newPage(); await p2.goto(page.url()); await p2.waitForFunction(() => !document.getElementById("wordInput").disabled && document.getElementById("wordInput").lang === "fr");
      await p2.waitForFunction(() => window.LANGPACK.has("fr", "words"));
      const got = await p2.evaluate(() => { const set = new Set((CORE.LANG.presets || []).map(w => CORE.LANG.fold(w))); return [...document.querySelectorAll("#presets button")].map(b => [set.has(CORE.LANG.fold(b.querySelector("b").textContent)), !!(b.querySelector("span") && b.querySelector("span").textContent)]); });
      assert.equal(got.length, 6); assert.ok(got.every(g => g[0] && g[1]), "刷新后预设词是法语的词并带释义：" + JSON.stringify(got));
      await p2.close(); }
    assert.equal(await page.locator("#entryStart").isDisabled(), false);
    // 单词保留变音字母；数字格的提示写出读法
    await page.locator("#wordInput").fill("été0");
    assert.equal(await page.locator("#wordInput").inputValue(), "ÉTÉ0");
    await page.locator("#entryStart").click();
    assert.equal(await page.locator("#wordCtl").getAttribute("aria-label"), "第 1 格 É 的词（要以 É 或 E 开头）", "读屏名用「或」，不念「斜线」（用户 11-19 定）");
    assert.equal(await page.locator("#wordCtl").getAttribute("maxlength"), null, "按合成后的非空格字符计数");
    await page.locator("#wordCtl").click(); await page.keyboard.type("ef");
    assert.match(await page.locator("#candLab").innerText(), /^É\/E 开头 · 1 \/ \d+ 批$/);
    const items = await page.locator("#candList .cand-it").evaluateAll(ns => ns.map(n => ({ w: n.querySelector(".cand-w").innerText, art: (n.querySelector(".cand-art") || {}).innerText || "", g: n.querySelector(".cand-g").innerText, label: n.getAttribute("aria-label"), h: n.getBoundingClientRect().height,
      oneLine: [".cand-w", ".cand-g"].every(s => { const e = n.querySelector(s), cs = getComputedStyle(e); return cs.whiteSpace === "nowrap" && cs.textOverflow === "ellipsis" && e.getBoundingClientRect().height < parseFloat(cs.fontSize) * 1.8; }), wlang: n.querySelector("b").lang })));
    assert.equal(items.length, 8, "每批 8 个");
    assert.ok(items.every(it => it.h >= 44 && it.oneLine && it.wlang === "fr"), "两行各自不换行、点按区 ≥ 44px：" + JSON.stringify(items.map(it => it.h)));
    assert.ok(new Set(items.map(it => it.h)).size === 1, "同批等高（没有释义也占一行）");
    const withArt = items.find(it => it.art);
    assert.ok(withArt, "法语名词带冠词");
    assert.ok(withArt.label.indexOf(withArt.art) === 0 && withArt.label.indexOf("，") > 0, "读屏名：冠词 词，词性，释义：" + withArt.label);
    assert.ok(items.every(it => it.g.split("，").length <= 2), "释义行最多两个义项");
    const art = await page.locator("#candList .cand-art").first().evaluate(n => { const cs = getComputedStyle(n), w = getComputedStyle(n.parentNode); return { weight: cs.fontWeight, smaller: parseFloat(cs.fontSize) < parseFloat(w.fontSize) }; });
    assert.deepEqual(art, { weight: "400", smaller: true }, "冠词不加粗、比词小一号");
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), "无横向滚动");
    const bar = await page.evaluate(() => ({ cand: document.getElementById("cand").getBoundingClientRect().bottom, pager: document.getElementById("pager").getBoundingClientRect().top }));
    assert.ok(bar.pager >= bar.cand - 0.5, "候选栏变高后不盖住字母栏：" + JSON.stringify(bar));
    await page.locator("#candList .cand-it").first().click();
    await page.waitForFunction(k => { const d = JSON.parse(localStorage.getItem(k) || "null"); return d && d.lang === "fr" && d.picks[0]; }, KEY);
    // 数字格
    await page.evaluate(() => document.getElementById("pl-3").click());
    await page.locator("#wordCtl").click();
    assert.equal(await page.locator("#candLab").innerText(), "Z 开头");
    await page.keyboard.type("li"); // 首字母不对：说明里把算对的写法写全
    assert.equal(await page.locator("#candMsg").innerText(), "Li 不是以 Z 开头");
    assert.deepEqual(errors, []); await context.close();
  }

  // 2 已有内容时换语言：先确认；保留 → 原样；清空 → 词 / 释义 / 配文与标题清掉，填表人留着；标题占位字；刷新后按草稿语言恢复
  {
    const LIFE = { v: 2, word: "LIFE", filler: "小满", view: "single", titleRuns: [{ t: "我的标题", b: true }],
      picks: [["love", ""], null, ["fire", ""], ["echo", ""]], glosses: ["爱", "", "火", "回声"], glossAuto: [false, true, false, false], captions: ["配文一", "", "", ""], keys: [0, 0, 0, 0] };
    const { page, context, errors } = await pageFor({ draft: LIFE });
    await page.locator("#toEntry").click();
    await page.locator("#langMore").click();
    // 语言多选（2026-11-12）：勾上德语不弹确认、不清空任何东西；草稿记下两门语言和各格的词来自哪门
    await pick(page, "de"); await ready(page, "de");
    assert.equal(await page.locator("#wordConfirm").isVisible(), false, "加一门语言：不确认、不清空");
    assert.equal(await page.locator("#langRule").innerText(), "ß 会占两格（SS）");
    assert.equal(await page.locator("#wordInput").inputValue(), "LIFE", "单词留着");
    await page.waitForFunction(k => { const d = JSON.parse(localStorage.getItem(k) || "null"); return d && d.langs && d.langs.length === 2; }, KEY);
    let d = await stored(page);
    assert.deepEqual([d.lang, d.langs, d.pickLangs, d.word, d.filler, d.titleRuns.map(r => r.t).join(""), d.picks.map(p => p && p[0]), d.glosses, d.captions],
      ["de", ["en", "de"], ["en", "", "en", "en"], "LIFE", "小满", "我的标题", ["Love", null, "Fire", "Echo"], ["爱", "", "火", "回声"], ["配文一", "", "", ""]], "词、释义、配文、标题、填表人都留着；lang 写定字母规则的那一门");
    // 取消英语、只留德语：同样不清空（词和释义是已经写下的文字）
    await pick(page, "en");
    await page.waitForFunction(k => { const x = JSON.parse(localStorage.getItem(k) || "null"); return x && !x.langs && x.lang === "de"; }, KEY);
    d = await stored(page);
    assert.deepEqual([d.picks.map(p => p && p[0]), d.glosses, d.titleRuns.map(r => r.t).join(""), "pickLangs" in d], [["Love", null, "Fire", "Echo"], ["爱", "", "火", "回声"], "我的标题", false], "去掉一门语言也不清空；只剩一门时草稿不写 langs / pickLangs");
    assert.equal(await page.locator('#langList input[value="de"]').isDisabled(), true, "只剩一门：不能再取消");
    await page.locator("#entryBack").click();
    if (await page.locator("#leavePop").isVisible()) await page.locator("#leaveSave").click();
    await page.locator("#title").waitFor({ state: "visible" });
    // 刷新：按草稿语言恢复，词库按需再加载
    await page.reload(); await page.waitForFunction(() => !document.getElementById("wordInput").disabled);
    assert.equal(await lang(page), "de"); assert.equal(await page.locator("#entry").isVisible(), false, "德语草稿直接进编辑面");
    await page.waitForFunction(() => !!window.LANGPACK.get("de", "words"));
    await page.evaluate(() => document.getElementById("pl-0").click()); // 刷新后焦点在第一个空格（I），回到 L 格
    await page.locator("#wordCtl").click(); await page.locator("#wordCtl").fill("lied"); // 格里还留着原来的 love（去掉语言不清空）：换成 lied。小写打字也找得到大写开头的德语名词（比对不分大小写）
    await page.locator("#candList .cand-it").first().waitFor();
    assert.equal(await page.locator("#candList .cand-it").first().getAttribute("aria-label"), "das Lied，名词，歌，曲", "德语候选带冠词，读屏名完整");
    assert.equal(await page.locator("#candList .cand-art").first().innerText(), "das");
    assert.deepEqual(errors, []); await context.close();
  }

  // 3 加载失败：行内「没加载成功」+「重试」，这门语言仍算选中、不能开始并写明是哪一门；取消它就能开始；重试成功后就绪。加载中：开始不可用并写明原因
  {
    const { page, context, errors } = await pageFor();
    let fail = true;
    await page.route("**/lang/es/words.js", r => fail ? r.abort() : r.continue());
    await page.locator("#langMore").click();
    await pick(page, "es");
    await page.locator(".lang-retry").waitFor();
    assert.deepEqual(await langsOf(page), ["en", "es"], "勾上就算选中，语言包随后加载");
    assert.match(await page.locator('#langList .lang-row:has(input[value="es"])').innerText(), /没加载成功\s*重试/);
    assert.equal(await page.locator("#entryStart").isDisabled(), true, "选中的语言有一门没就绪：不能开始");
    assert.equal(await page.locator("#langWait").innerText(), "西班牙语词库没加载成功，点语言栏里的「重试」");
    assert.match(await page.locator("#langNow").innerText(), /西班牙语没加载成功/, "摘要写明是哪一门");
    await pick(page, "es"); // 取消它：回到只有英语，可以开始
    await page.waitForFunction(() => window.CORE.activeLangs().join() === "en");
    assert.equal(await page.locator("#entryStart").isDisabled(), false); assert.equal(await page.locator("#langWait").innerText(), "");
    await pick(page, "es"); await page.locator(".lang-retry").waitFor();
    fail = false;
    await page.locator(".lang-retry").click();
    await ready(page, "es");
    assert.equal(await page.locator("#entryStart").isDisabled(), false);
    assert.equal(await page.locator("#langRule").innerText(), "", "2026-11-12：西语不再写规则提示");
    let release; const gate = new Promise(r => { release = r; });
    await page.route("**/lang/it/words.js", async r => { await gate; r.continue(); });
    await pick(page, "it");
    await page.waitForFunction(() => /意大利语正在加载/.test(document.getElementById("langNow").innerText));
    assert.equal(await page.locator("#entryStart").isDisabled(), true);
    assert.equal(await page.locator("#langWait").innerText(), "意大利语词库正在加载");
    assert.deepEqual(await langsOf(page), ["en", "es", "it"]);
    release(); await loaded(page, "it"); await page.waitForFunction(() => !document.getElementById("entryStart").disabled);
    assert.equal(await page.locator("#langWait").innerText(), "");
    assert.deepEqual(errors, []); await context.close();
  }
  // 3b 只剩英语（v00.03.01 R07，用户 11-18 定：输入框兼容重音符、照原样保留拼写）：法语作品单词里有 É、格里有 école，取消法语只剩英语也照常，拼写不变；
  //    v00.03.01 E2（用户 11-19 定）：英语上限也是 28，格里有 21～28 字的词时取消法语也不再拦
  {
    const E = { v: 2, lang: "fr", word: "ÉTÉ", filler: "", view: "single", titleRuns: null, picks: [["école", ""], null, null], glosses: ["学校", "", ""], glossAuto: [false, true, true], captions: ["", "", ""], keys: [0, 0, 0] };
    const { page, context, errors } = await pageFor({ draft: E });
    await loaded(page, "fr");
    await page.locator("#toEntry").click(); await page.locator("#langMore").click();
    await pick(page, "en"); await page.waitForFunction(() => window.CORE.activeLangs().join() === "en,fr");
    assert.equal(await lang(page), "fr", "选了英语和法语：字母规则按西文");
    await pick(page, "fr"); await page.waitForFunction(() => window.CORE.activeLangs().join() === "en");
    assert.equal(await page.locator("#langRule").innerText(), "", "带重音的单词与格里的词不拦");
    assert.equal(await page.locator("#wordInput").inputValue(), "ÉTÉ", "单词照原样");
    assert.deepEqual(errors, []); await context.close();
  }
  {
    const long = "d".repeat(28); // 第四轮真机问题 27：28 个 d，原先英语上限 20 放不下而被拦
    const E = { v: 2, lang: "fr", word: "ÉTÉ", filler: "", view: "single", titleRuns: null, picks: [[long, ""], null, null], glosses: ["", "", ""], glossAuto: [false, true, true], captions: ["", "", ""], keys: [0, 0, 0] };
    const { page, context, errors } = await pageFor({ draft: E });
    await loaded(page, "fr");
    await page.locator("#toEntry").click(); await page.locator("#langMore").click();
    await pick(page, "en"); await page.waitForFunction(() => window.CORE.activeLangs().join() === "en,fr");
    await pick(page, "fr");
    await page.waitForFunction(() => window.CORE.activeLangs().join() === "en");
    assert.equal(await page.locator("#langRule").innerText(), "", "不拦、不写说明");
    assert.equal((await stored(page)).picks[0][0], long, "格里的词 28 个字照原样");
    assert.deepEqual(errors, []); await context.close();
  }

  // 4 320 宽：语言栏展开、候选栏都不横向溢出；ß 占两格
  {
    const { page, context, errors } = await pageFor({ width: 320 });
    await page.locator("#langMore").click(); await only(page, "de"); await ready(page, "de");
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), "320 宽语言栏无横向滚动");
    // 2026-11-12 方案 A：六门语言全部预设词在 320 宽下两行都不被截（用按钮副本逐词量）。四个主题各量一遍：主题的西文字体宽窄不同（fandom 的衬线体最宽）
    for (const skinId of ["fandom", "dansaekhwa", "impressionism", "secession"]) {
      await page.evaluate(k => window.THEME.setSkin(k), skinId);
      await page.evaluate(() => Promise.all([400, 700].map(w => document.fonts.load(w + " 16px " + getComputedStyle(document.querySelector(".preset b")).fontFamily.split(",")[0], "Aa"))));
      await page.waitForTimeout(150);
      const cut = await page.evaluate(() => { const src = document.querySelector("#presets button"), b = src.cloneNode(true), bad = []; let n = 0; src.parentNode.appendChild(b);
        for (const l of ["en", "fr", "de", "es", "it", "la"]) CORE.withLang(l, () => {
          for (const p of CORE.LANG.presets || CORE.PRESETS) { const w = b.querySelector("b"), g = b.querySelector("span"); w.textContent = String(p).toUpperCase(); g.textContent = CORE.LANG.presetGloss[CORE.LANG.fold(p)] || ""; n++;
            if (!g.textContent || w.scrollWidth > w.clientWidth + 1 || g.scrollWidth > g.clientWidth + 1) bad.push(l + " " + p + " +" + (w.scrollWidth - w.clientWidth)); } });
        b.remove(); return { n, bad, family: getComputedStyle(src.querySelector("b")).fontFamily.split(",")[0] }; });
      assert.equal(cut.n, 330, "六语预设词总数"); assert.deepEqual(cut.bad, [], skinId + "（" + cut.family + "）：320 宽下预设词不被截");
    }
    await page.evaluate(() => window.THEME.setSkin("fandom"));
    await page.locator("#wordInput").fill("straße");
    assert.equal(await page.locator("#wordInput").inputValue(), "STRASSE", "ß 占两格（SS）");
    await page.locator("#entryStart").click();
    await page.locator("#wordCtl").click(); await page.keyboard.type("sch");
    await page.locator("#candList .cand-it").first().waitFor();
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth && [...document.querySelectorAll(".cand-it")].every(n => n.getBoundingClientRect().right <= innerWidth)), "320 宽候选栏不溢出");
    assert.deepEqual(errors, []); await context.close();
  }
  // 5 语言多选（2026-11-12）取代了 V003-B4-R5 的「换语言重排格」：加减语言都不动格，配图、取景、单词原样。
  //   v00.03.01 R07 起英语也收带变音符的字母，只留英语时单词照原样（见 3b），所以不再有「É → E」「Þ 格去掉」这类重排，也就没有图跟着格走的问题
  {
    const addPhoto = async (page, input) => {
      await page.evaluate(async (id) => {
        const c = document.createElement("canvas"); c.width = 80; c.height = 60; c.getContext("2d").fillRect(0, 0, 80, 60);
        const blob = await new Promise(r => c.toBlob(r, "image/png")); const dt = new DataTransfer(); dt.items.add(new File([blob], "fixture.png", { type: "image/png" }));
        const n = document.getElementById(id); n.files = dt.files; n.dispatchEvent(new Event("change", { bubbles: true }));
      }, input);
      await page.locator("#cropper").waitFor({ state: "visible" });
    };
    const FR = (word) => ({ v: 2, lang: "fr", word, filler: "小满", view: "single", titleRuns: null, picks: word.split("").map(() => null), glosses: word.split("").map(() => ""), glossAuto: word.split("").map(() => true), captions: word.split("").map(() => ""), keys: word.split("").map(() => 0) });
    const { page, context, errors } = await pageFor({ draft: FR("ÉTÉ") });
    await page.waitForFunction(() => window.LANGPACK.has("fr", "words"));
    await page.locator("#plateHit").click(); await addPhoto(page, "cellPhoto");
    await page.locator("#cropPlus").click(); await page.locator("#cropPlus").click(); await page.locator("#cropApply").click(); await page.locator("#imgClose").click();
    await page.waitForFunction(k => { const d = JSON.parse(localStorage.getItem(k) || "null"); return d && d.media && d.media.cells[0]; }, KEY);
    // 第 3 格：默认图 + 单独调过的取景
    await page.evaluate(() => document.getElementById("pl-2").click());
    await page.locator("#plateHit").click(); await page.locator("#defPick").waitFor(); await addPhoto(page, "photo");
    await page.locator("#cropPlus").click(); await page.locator("#cropApply").click(); await page.locator("#imgClose").click();
    await page.waitForFunction(k => { const d = JSON.parse(localStorage.getItem(k) || "null"); return d && d.media && d.media.def && d.crops[2]; }, KEY);
    const before = await stored(page);
    assert.ok(before.media.cells[0] && before.crops[0].z > 1 && before.media.def && before.crops[2], "夹具：第 1 格独立图 + 取景，默认图 + 第 3 格取景");
    await page.locator("#toEntry").click(); await page.locator("#langMore").click(); await pick(page, "en");
    await page.waitForFunction(k => { const d = JSON.parse(localStorage.getItem(k) || "null"); return d && d.langs && d.langs.join() === "en,fr"; }, KEY);
    let after = await stored(page);
    assert.deepEqual([after.word, after.media, after.crops], ["ÉTÉ", before.media, before.crops], "加一门语言：单词、独立图、默认图、各格取景原样");
    await pick(page, "fr"); // 只留英语（v00.03.01 R07 起允许）：单词带 É 照原样，格、配图、取景都不动
    await page.waitForFunction(k => { const d = JSON.parse(localStorage.getItem(k) || "null"); return d && !d.langs && d.lang === "en"; }, KEY);
    assert.equal(await page.locator("#langRule").innerText(), "");
    after = await stored(page);
    assert.deepEqual([after.word, after.media, after.crops], ["ÉTÉ", before.media, before.crops], "只剩英语：单词、配图、取景原样");
    await pick(page, "fr"); await page.waitForFunction(k => { const d = JSON.parse(localStorage.getItem(k) || "null"); return d && d.langs && d.langs.join() === "en,fr"; }, KEY);
    await pick(page, "en"); // 去掉英语、回到只有法语
    await page.waitForFunction(k => { const d = JSON.parse(localStorage.getItem(k) || "null"); return d && !d.langs && d.lang === "fr"; }, KEY);
    await page.reload(); await page.waitForFunction(() => !document.getElementById("wordInput").disabled);
    assert.equal(await lang(page), "fr");
    assert.ok(await page.locator("#mirror canvas.b-image").count(), "刷新后第 1 格的图还在");
    await page.locator("#title").click(); await page.keyboard.type("x"); await page.keyboard.press("Enter"); // 再保存一次：引用不被写掉
    await page.waitForFunction(k => { const d = JSON.parse(localStorage.getItem(k) || "null"); return d && d.titleRuns; }, KEY);
    const again = await stored(page);
    assert.deepEqual([again.word, again.media, again.crops], ["ÉTÉ", before.media, before.crops], "刷新、再编辑保存后，配图引用与取景仍在");
    assert.deepEqual(errors, []); await context.close();
  }
  // 6 第二步「卡面版式」（T22 / T28）：卡上的冠词块、两性名词二选一与「完成」拦下、长词折行、格内上限说明；DOM 卡与版式数值一致
  {
    const { readFileSync } = await import("node:fs");
    const checker = readFileSync(new URL("./check-dom-layout.js", import.meta.url), "utf8");
    const domOk = async (page) => {
      const logs = []; const on = m => logs.push(m.text()); page.on("console", on);
      await page.evaluate(checker); page.off("console", on);
      return logs.some(t => /dom layout ok/.test(t)) ? "" : logs.join(" | ");
    };
    const D = (lang, word, picks, over) => ({ v: 2, lang, word, filler: "", view: "single", titleRuns: null, picks, glosses: picks.map(p => p[1]), glossAuto: picks.map(() => true), captions: picks.map(() => ""), keys: picks.map(() => 0), ...over });
    const boxes = (page, role) => page.locator('#mirror [data-role="' + role + '"]');
    {
      const { page, context, errors } = await pageFor({ draft: D("es", "AL", [["artista", "艺术家", "el / la"], ["libro", "书", "el"]]) });
      await page.waitForFunction(() => window.LANGPACK.has("es", "words") && window.LANGPACK.has("es", "block"));
      assert.equal(await boxes(page, "article").innerText(), "el / la", "两性名词没选：冠词位写全");
      assert.equal(await boxes(page, "word").innerText(), "Artista");
      assert.equal(await domOk(page), "", "DOM 卡与版式一致（冠词块）");
      assert.match(await page.locator("#pl-0").getAttribute("class"), /todo/, "没选冠词的格算没完成");
      const raw0 = await page.evaluate(k => localStorage.getItem(k), KEY);
      await page.locator("#finish").click();
      assert.match(await page.locator("#hint").innerText(), /第 1 格的冠词还没选/, "点完成被拦下并写明");
      assert.equal(await page.locator("#finishPanel").isVisible(), false);
      assert.equal(await page.evaluate(() => document.activeElement.id), "glossCtl", "焦点落到释义框，义项栏打开");
      const row = page.locator("#senseList .art-row");
      assert.equal(await row.getAttribute("aria-label"), "冠词（还没选）");
      assert.deepEqual(await row.locator("button").evaluateAll(ns => ns.map(n => [n.textContent, n.getAttribute("aria-pressed")])), [["la", "false"], ["el", "false"]], "两个选项，不预选；按固定排法 la 在 el 前（真机第一轮 D4、D5）");
      assert.equal(await page.evaluate(k => localStorage.getItem(k), KEY), raw0, "没选之前草稿不变");
      await row.locator("button", { hasText: "la" }).click();
      assert.equal(await boxes(page, "article").innerText(), "la", "选了：冠词位只写选中的");
      await page.waitForFunction(k => { const d = JSON.parse(localStorage.getItem(k) || "null"); return d && d.arts; }, KEY);
      assert.deepEqual((await stored(page)).arts, ["la", ""], "选择存进草稿");
      const x0 = await boxes(page, "word").getAttribute("data-x");
      await page.evaluate(() => document.getElementById("pl-1").click());
      assert.equal(await boxes(page, "article").innerText(), "el");
      assert.equal(await boxes(page, "word").getAttribute("data-x"), x0, "有冠词的词从同一条竖线起排");
      await page.reload(); await page.waitForFunction(() => !document.getElementById("wordInput").disabled);
      await page.waitForFunction(() => window.LANGPACK.has("es", "words") && window.LANGPACK.has("es", "block"));
      assert.equal(await boxes(page, "article").innerText(), "la", "刷新后选择还在");
      await page.locator("#finish").click(); await page.locator("#finishPanel").waitFor({ state: "visible" }); // 选了冠词：能完成
      await page.waitForFunction(() => /已导出 2 张/.test(document.getElementById("finMsg").innerText)); // 等导出结束再关（导出中不能关）
      await page.keyboard.press("Escape"); await page.waitForFunction(() => document.getElementById("finishPanel").hidden);
      // 换词：选择清掉
      await page.locator("#wordCtl").click(); await page.locator("#wordCtl").fill("Amor"); await page.keyboard.press("Enter");
      await page.waitForFunction(k => { const d = JSON.parse(localStorage.getItem(k) || "null"); return d && d.picks[0][0] === "Amor"; }, KEY);
      assert.equal("arts" in (await stored(page)), false, "换了词：旧选择不留");
      assert.deepEqual(errors, []); await context.close();
    }
    {
      // 长词：缩到下限仍放不下 → 折行，词下面的元素下移；正在打这个词时由输入框自己显示；到上限写明
      const long = "m".repeat(28);
      const { page, context, errors } = await pageFor({ draft: D("de", "MH", [[long, "很长的词", "die"], ["Haus", "房子", "das"]]) });
      await page.waitForFunction(() => window.LANGPACK.has("de", "words"));
      const lines = await boxes(page, "word").evaluateAll(ns => ns.map(n => [n.textContent, n.getAttribute("data-x"), +n.getAttribute("data-baseline")]));
      assert.ok(lines.length >= 2 && lines.length <= 3, "折成两到三行");
      assert.ok(lines.every(l => l[1] === lines[0][1]), "各行和第一行的词对齐");
      assert.ok(lines.slice(0, -1).every(l => /-$/.test(l[0])), "折行处行尾加连字符");
      assert.equal(lines.map(l => l[0].replace(/-$/, "")).join(""), long, "连字符只是显示，词不变（德语保留用户打的大小写）");
      const dy = (lines.length - 1) * 64;
      assert.deepEqual([+(await boxes(page, "bar").getAttribute("data-y")), +(await boxes(page, "gloss").getAttribute("data-baseline"))], [1068 + dy, 1158 + dy], "墨条与释义下移");
      assert.equal(+(await boxes(page, "plate").getAttribute("data-y")), 290, "图版不动");
      assert.equal(await domOk(page), "", "DOM 卡与版式一致（折行）");
      assert.ok(await page.evaluate(() => { const c = document.getElementById("card").getBoundingClientRect(); return [...document.querySelectorAll("#mirror .b")].every(n => n.getBoundingClientRect().bottom <= c.bottom + 1); }), "下移后仍在卡内");
      const g = await page.evaluate(() => { const a = document.getElementById("glossCtl").getBoundingClientRect(), b = document.querySelector('#mirror [data-role="gloss"]').getBoundingClientRect(); return Math.abs(a.left - b.left) + Math.abs((a.top + a.height / 2) - (b.top + b.height / 2)); });
      assert.ok(g < 3, "释义输入框跟着下移，仍对准镜像");
      await page.locator("#wordCtl").focus();
      assert.deepEqual(await page.evaluate(() => [document.getElementById("wordCtl").classList.contains("own"), document.getElementById("card").classList.contains("word-own"), getComputedStyle(document.querySelector('#mirror [data-role="word"]')).visibility]), [true, true, "hidden"], "编辑折行的词：输入框自己显示，镜像先藏");
      assert.equal(await page.locator("#candMsg").innerText(), "这一格最多 28 个字符", "到上限写明");
      await page.keyboard.press("End"); await page.keyboard.type("x");
      assert.equal((await page.locator("#wordCtl").inputValue()).length, 28, "不再接收，也不截掉已有的字");
      await page.keyboard.press("Enter");
      assert.deepEqual(await page.evaluate(() => [document.getElementById("wordCtl").classList.contains("own"), document.getElementById("card").classList.contains("word-own")]), [false, false], "离开后镜像按折行显示");
      // 列阵：同一套，折行后仍在格内
      await page.locator("#viewGrid").click();
      assert.ok(await boxes(page, "word").count() >= 3 && await boxes(page, "article").count() === 2, "列阵：冠词与折行");
      assert.equal(await domOk(page), "", "DOM 卡与版式一致（列阵）");
      assert.deepEqual(errors, []); await context.close();
    }
    {
      // 英语 28 个字（v00.03.01 E2）：和德语一样折行、DOM 卡与版式一致、不出卡
      const { page, context, errors } = await pageFor({ draft: D("en", "MH", [["m".repeat(28), "很长的词"], ["house", "房子"]]) });
      const lines = await boxes(page, "word").evaluateAll(ns => ns.map(n => n.textContent));
      assert.ok(lines.length >= 2 && lines.length <= 3, "英语 28 字折成两到三行");
      assert.equal(lines.map(l => l.replace(/-$/, "")).join(""), "M" + "m".repeat(27), "折行不丢字（卡面首字母大写）");
      assert.equal(await domOk(page), "", "DOM 卡与版式一致（英语 28 字）");
      assert.ok(await page.evaluate(() => { const c = document.getElementById("card").getBoundingClientRect(); return [...document.querySelectorAll("#mirror .b")].every(n => n.getBoundingClientRect().right <= c.right + 1 && n.getBoundingClientRect().bottom <= c.bottom + 1); }), "英语 28 字不出卡");
      assert.deepEqual(errors, []); await context.close();
    }
    {
      // 英语：没有冠词块，20 个字符照旧一行
      const { page, context, errors } = await pageFor({ draft: D("en", "LI", [["love", "爱"], ["internationalization", "国际化"]]) });
      assert.equal(await boxes(page, "article").count(), 0); assert.equal(await boxes(page, "word").count(), 1);
      assert.equal(await domOk(page), "");
      assert.deepEqual(errors, []); await context.close();
    }
  }
  // 7 V003-B4-R7 / R8：冠词跟着选中义项的词性走；词库迟到后旧稿的词条按词库补齐
  {
    const D = (lang, word, picks, over) => ({ v: 2, lang, word, filler: "", view: "single", titleRuns: null, picks, glosses: picks.map(() => ""), glossAuto: picks.map(() => true), captions: picks.map(() => ""), keys: picks.map(() => 0), ...over });
    const art = (page) => page.locator('#mirror [data-role="article"]').allInnerTexts();
    const rawOf = (page) => page.evaluate(k => localStorage.getItem(k), KEY);
    const savedLang = (page, test) => page.waitForFunction(({ k, t }) => { const d = JSON.parse(localStorage.getItem(k) || "null"); return d && new Function("d", "return " + t)(d); }, { k: KEY, t: test });
    const done = async (page) => { await page.locator("#finish").click(); await page.waitForFunction(() => /已导出/.test(document.getElementById("finMsg").innerText)); await page.keyboard.press("Escape"); await page.waitForFunction(() => document.getElementById("finishPanel").hidden); };
    {
      // R7：jeune（形容词在前、名词在后，整词冠词 le / la）。形容词义项没有冠词、不用选、能完成；名词义项二选一
      const { page, context, errors } = await pageFor({ draft: D("fr", "J", [["jeune", "", ""]]) });
      await page.waitForFunction(() => window.LANGPACK.has("fr", "words") && window.LANGPACK.has("fr", "block"));
      await page.locator("#wordCtl").click(); await page.locator("#wordCtl").fill("Jeune"); await page.keyboard.press("Enter");
      assert.equal(await page.locator("#glossCtl").inputValue(), "年轻的", "自动带出旧词包夹具里的形容词义项");
      assert.deepEqual(await art(page), [], "形容词义项：没有冠词");
      await page.locator("#glossCtl").click();
      assert.equal(await page.locator("#senseList .art-row").count(), 0, "形容词义项：不出冠词一行");
      await page.keyboard.press("Enter"); await done(page);
      await page.locator("#glossCtl").click(); await page.locator("#senseList button", { hasText: "年轻人" }).click();
      assert.deepEqual(await art(page), ["le / la"], "换成名词义项：冠词位写全");
      assert.equal(await page.locator("#senseList .art-row").getAttribute("aria-label"), "冠词（还没选）");
      await page.locator("#glossCtl").blur(); await page.locator("#finish").click();
      assert.match(await page.locator("#hint").innerText(), /第 1 格的冠词还没选/, "名词义项没选冠词：拦下");
      await page.locator("#senseList .art-row button", { hasText: "la" }).click();
      assert.deepEqual(await art(page), ["la"]);
      await page.locator("#senseList button", { hasText: "年少" }).click();
      assert.deepEqual(await art(page), [], "换回形容词义项：冠词不显示");
      await page.locator("#senseList button", { hasText: "青年" }).click();
      assert.deepEqual(await art(page), ["la"], "再回名词义项：原来的选择还在");
      await page.locator("#glossCtl").fill("后生"); // 自己写释义：不改词性，也不改冠词
      assert.deepEqual(await art(page), ["la"], "自己改释义不动冠词");
      await savedLang(page, 'd.glosses[0] === "后生"');
      const d = await stored(page);
      assert.deepEqual([d.poss, d.arts], [["n."], ["la"]], "义项的词性与冠词选择存进草稿");
      await page.reload(); await page.waitForFunction(() => !document.getElementById("wordInput").disabled);
      await page.waitForFunction(() => window.LANGPACK.has("fr", "words") && window.LANGPACK.has("fr", "block"));
      assert.deepEqual(await art(page), ["la"], "刷新后仍是名词义项加选中的冠词");
      assert.equal(await page.locator("#glossCtl").inputValue(), "后生", "自己写的释义还在");
      await done(page);
      assert.deepEqual(errors, []); await context.close();
    }
    {
      // R8：旧稿的词条没有冠词列。词库到了以后补齐：出冠词选项、完成被拦下、可补选；补齐不写草稿、不续期
      const old = D("es", "AS", [["artista", "n.艺术家"], ["sangre", "n.血", "el"]], { glosses: ["艺术家", "血"], glossAuto: [false, true] });
      const { page, context, errors } = await pageFor({ draft: old });
      const raw = await rawOf(page);
      await page.waitForFunction(() => window.LANGPACK.has("es", "words") && window.LANGPACK.has("es", "block"));
      await page.waitForFunction(() => document.querySelector('#mirror [data-role="article"]'));
      assert.deepEqual(await art(page), ["el / la"], "词库到了：缺的冠词补上");
      assert.equal(await page.locator("#glossCtl").inputValue(), "艺术家", "用户的释义不动");
      assert.equal(await rawOf(page), raw, "补齐不写草稿、不续期");
      await page.locator("#toEntry").click();
      assert.equal(await page.locator("#leavePop").isVisible(), false);
      await page.locator("#entryBack").click();
      assert.equal(await page.locator("#leavePop").isVisible(), false, "补齐不算未保存的修改：返回不问");
      await page.locator("#finish").click();
      assert.match(await page.locator("#hint").innerText(), /第 1 格的冠词还没选/, "与新输入同一条规则：拦下");
      await page.locator("#senseList .art-row button", { hasText: "el" }).first().click();
      assert.deepEqual(await art(page), ["el"]);
      await page.evaluate(() => document.getElementById("pl-1").click());
      assert.deepEqual(await art(page), ["la"], "过时的冠词（el sangre）按词库更正为 la");
      await done(page);
      assert.deepEqual(errors, []); await context.close();
    }
    {
      // R8：已经选好的冠词在补齐后留着
      const { page, context, errors } = await pageFor({ draft: D("es", "A", [["artista", "n.艺术家"]], { arts: ["la"], poss: ["n."] }) });
      await page.waitForFunction(() => window.LANGPACK.has("es", "words") && window.LANGPACK.has("es", "block"));
      await page.waitForFunction(() => document.querySelector('#mirror [data-role="article"]'));
      assert.deepEqual(await art(page), ["la"], "有效的选择不丢");
      await done(page);
      assert.deepEqual(errors, []); await context.close();
    }
    {
      // R8：词库没加载成功——不知道哪些词要选冠词，完成先不放行；重试成功后补齐并拦下
      let fail = true;
      const { page, context, errors } = await pageFor({ draft: D("es", "A", [["artista", "n.艺术家"]]), setup: (c) => c.route("**/lang/es/words.js", r => fail ? r.abort() : r.continue()) });
      await page.waitForFunction(() => window.LANGPACK.has("es", "block") || true);
      await page.waitForTimeout(300);
      assert.deepEqual(await art(page), []);
      await page.locator("#finish").click();
      assert.match(await page.locator("#hint").innerText(), /西班牙语的词库还没加载好/, "词库没到：不放行并说明");
      assert.equal(await page.locator("#finishPanel").isVisible(), false);
      fail = false;
      await page.locator("#finish").click(); // 再点会重试加载
      await page.waitForFunction(() => window.LANGPACK.has("es", "words"));
      await page.waitForFunction(() => document.querySelector('#mirror [data-role="article"]'));
      assert.deepEqual(await art(page), ["el / la"], "重试成功后补齐");
      await page.locator("#finish").click();
      assert.match(await page.locator("#hint").innerText(), /冠词还没选/);
      assert.deepEqual(errors, []); await context.close();
    }
  }
  // 8 变形索引（Q10 / T26）：格里打变形，释义取自原形并写明；不带原形的冠词；词库里本来就有的写法不受影响
  {
    const E = { v: 2, lang: "fr", word: "SLE", filler: "", view: "single", titleRuns: null, picks: [null, null, null], glosses: ["", "", ""], glossAuto: [true, true, true], captions: ["", "", ""], keys: [0, 0, 0] };
    const { page, context, errors } = await pageFor({ draft: E });
    await page.waitForFunction(() => window.LANGPACK.has("fr", "words") && window.LANGPACK.has("fr", "block"));
    await page.locator("#wordCtl").click(); await page.keyboard.type("suis");
    await page.locator("#candList .cand-it").first().waitFor();
    assert.match(await page.locator("#candLab").innerText(), /Suis 是 être 的变形/, "写明释义取自哪个原形");
    assert.equal(await page.locator("#candList .cand-it").first().locator(".cand-w").innerText(), "Suis", "变形排在候选第一个，拼写用打的");
    await page.keyboard.press("Enter");
    assert.equal(await page.locator("#glossCtl").inputValue(), "是", "释义取自 être");
    assert.equal(await page.locator("#pl-0").getAttribute("class").then(c => /todo/.test(c)), false, "S 格的 Suis 算填好（首字母按打的词算）");
    await page.evaluate(() => document.getElementById("pl-1").click());
    await page.locator("#wordCtl").click(); await page.keyboard.type("livres"); await page.keyboard.press("Enter");
    assert.equal(await page.locator("#glossCtl").inputValue(), "书");
    assert.equal(await page.locator('#mirror [data-role="article"]').count(), 0, "变形不带原形的冠词（le livre / les livres）");
    await page.evaluate(() => document.getElementById("pl-2").click());
    await page.locator("#wordCtl").click(); await page.keyboard.type("est");
    await page.locator("#candList .cand-it").first().waitFor();
    assert.doesNotMatch(await page.locator("#candLab").innerText(), /的变形/, "词库里本来就有的写法：不提变形");
    await page.keyboard.press("Enter");
    await page.waitForFunction(k => { const d = JSON.parse(localStorage.getItem(k) || "null"); return d && d.picks[2]; }, KEY);
    const d = await stored(page);
    assert.deepEqual([d.picks[0][0], d.glosses[0], d.picks[1][0], d.picks[1][2]], ["Suis", "是", "Livres", ""], "草稿里存的是打的拼写");
    await page.reload(); await page.waitForFunction(() => !document.getElementById("wordInput").disabled);
    await page.waitForFunction(() => window.LANGPACK.has("fr", "words") && window.LANGPACK.has("fr", "block"));
    await page.locator("#glossCtl").click();
    assert.ok(await page.locator("#senseList button", { hasText: "存在" }).count(), "刷新后义项栏仍是 être 的义项");
    await page.keyboard.press("Enter");
    await page.locator("#finish").click(); await page.waitForFunction(() => /已导出 3 张/.test(document.getElementById("finMsg").innerText));
    assert.deepEqual(errors, []); await context.close();
  }
  // 9 按义项带出冠词（同形、性别不同的名词）；V003-B4-R9 组合重音输入；V003-B4-R10 变形按「原形 + 词性」对
  {
    const E = (lang, word) => ({ v: 2, lang, word, filler: "", view: "single", titleRuns: null, picks: word.split("").map(() => null), glosses: word.split("").map(() => ""), glossAuto: word.split("").map(() => true), captions: word.split("").map(() => ""), keys: word.split("").map(() => 0) });
    const art = (page) => page.locator('#mirror [data-role="article"]').allInnerTexts();
    const type = async (page, i, text) => { await page.evaluate(n => document.getElementById("pl-" + n).click(), i); await page.locator("#wordCtl").click(); await page.locator("#wordCtl").fill(text); };
    {
      const { page, context, errors } = await pageFor({ draft: E("fr", "LP") });
      await page.waitForFunction(() => window.LANGPACK.has("fr", "words") && window.LANGPACK.has("fr", "block"));
      await type(page, 0, "livre");
      assert.equal(await page.locator("#candList .cand-it").first().locator(".cand-art").innerText(), "le", "候选里写第一组义项的冠词，不写 le|la");
      await page.keyboard.press("Enter");
      assert.deepEqual([await art(page), await page.locator("#glossCtl").inputValue()], [["le"], "书"], "默认：书，le");
      await page.locator("#glossCtl").click();
      assert.deepEqual(await page.locator("#senseList .sense-row:not(.art-row) .pos").allInnerTexts(), ["n. le", "n. la"], "两组名词义项，行首各写冠词");
      // v00.04.00：冠词一行现在总有；这一组只有一个冠词，所以它排第一、已亮着，后面是法语其余的定冠词单数（可另选，不让自己写）
      assert.deepEqual(await page.evaluate(() => [Array.from(document.querySelectorAll("#senseList .art-row .sense"), b => b.textContent + ":" + b.getAttribute("aria-pressed")), document.querySelectorAll("#senseList .art-row input").length, document.querySelector("#senseList .art-row").getAttribute("aria-label")]), [["la:false", "le:true", "l’:false"], 0, "冠词"], "这一组只有一个冠词：不用选，已亮着（按固定排法 la le l’）");
      await page.locator("#senseList button", { hasText: "磅" }).click();
      assert.deepEqual(await art(page), ["la"], "选「磅」：冠词跟着变成 la");
      await page.locator("#senseList button", { hasText: "书籍" }).click();
      assert.deepEqual(await art(page), ["le"], "换回「书籍」：le");
      await page.locator("#senseList button", { hasText: "镑" }).click();
      await page.waitForFunction(k => { const d = JSON.parse(localStorage.getItem(k) || "null"); return d && d.poss && d.poss[0] === "n.#2"; }, KEY);
      await page.reload(); await page.waitForFunction(() => !document.getElementById("wordInput").disabled);
      await page.waitForFunction(() => window.LANGPACK.has("fr", "words") && window.LANGPACK.has("fr", "block"));
      await page.evaluate(() => document.getElementById("pl-0").click()); // 刷新后停在第一个空格，回到第 1 格看
      assert.deepEqual([await art(page), await page.locator("#glossCtl").inputValue()], [["la"], "镑"], "刷新后仍是第二组义项与它的冠词");
      // 第二组名词是两性通用（politique：政治 la｜政治家 le / la）：选到它才要二选一
      await type(page, 1, "politique"); await page.keyboard.press("Enter");
      assert.deepEqual(await art(page), [], "politique 默认是形容词义项：没有冠词");
      await page.locator("#glossCtl").click(); await page.locator("#senseList button", { hasText: "政治家" }).click();
      assert.deepEqual(await art(page), ["le / la"]);
      await page.locator("#glossCtl").blur(); await page.locator("#finish").click();
      assert.match(await page.locator("#hint").innerText(), /第 2 格的冠词还没选/);
      await page.locator("#senseList .art-row button", { hasText: "le" }).first().click();
      await page.locator("#finish").click(); await page.waitForFunction(() => /已导出 2 张/.test(document.getElementById("finMsg").innerText));
      assert.deepEqual(errors, []); await context.close();
    }
    {
      // R9：分解编码（e + 组合重音）与预组编码得到同一个词；28 个字都进得来，第 29 个不收且不截掉已有的字
      const { page, context, errors } = await pageFor({ draft: E("fr", "EE") });
      await page.waitForFunction(() => window.LANGPACK.has("fr", "words") && window.LANGPACK.has("fr", "block"));
      await type(page, 0, "école");
      assert.equal(await page.locator("#wordCtl").inputValue(), "École", "分解编码不丢重音");
      await page.keyboard.press("Enter");
      await type(page, 1, "école"); await page.keyboard.press("Enter");
      await page.waitForFunction(k => { const d = JSON.parse(localStorage.getItem(k) || "null"); return d && d.picks[1]; }, KEY);
      const d = await stored(page);
      assert.deepEqual([d.picks[0][0], d.glosses[0]], [d.picks[1][0], d.glosses[1]], "两种编码保存成同一个词、同一个释义");
      await type(page, 0, "é".repeat(28));
      assert.equal(await page.locator("#wordCtl").inputValue(), "É" + "é".repeat(27), "28 个分解编码的字全部保留");
      assert.equal(await page.locator("#candMsg").innerText(), "这一格最多 28 个字符");
      await page.keyboard.press("Home"); await page.keyboard.press("ArrowRight"); await page.keyboard.type("x"); // 在词中间再打一个
      assert.equal(await page.locator("#wordCtl").inputValue(), "É" + "é".repeat(27), "超限：这一次输入不收，已有的字一个不少");
      assert.equal(await page.evaluate(() => document.getElementById("wordCtl").selectionStart), 1, "光标留在原处");
      await page.keyboard.press("End"); await page.keyboard.press("Backspace"); await page.keyboard.press("Home"); await page.keyboard.press("ArrowRight"); await page.keyboard.type("x");
      assert.equal(await page.locator("#wordCtl").inputValue(), "Éx" + "é".repeat(26), "删掉一个后，词中间能再打");
      await page.keyboard.press("Enter");
      await page.reload(); await page.waitForFunction(() => !document.getElementById("wordInput").disabled);
      assert.equal((await stored(page)).picks[0][0], "Éx" + "é".repeat(26), "保存的是合成后的写法");
      assert.deepEqual(errors, []); await context.close();
      // 英语上限也是 28（v00.03.01 E2；不用原生 maxlength）
      const en = await pageFor({ draft: E("en", "A") });
      assert.equal(await en.page.locator("#wordCtl").getAttribute("maxlength"), null);
      await type(en.page, 0, "a".repeat(30));
      assert.equal((await en.page.locator("#wordCtl").inputValue()).length, 28);
      assert.deepEqual(en.errors, []); await en.context.close();
    }
    {
      // R10：动词 sein 的变形取动词的释义；代词变形查不到（按自定义词用），不借同形名词的释义
      const { page, context, errors } = await pageFor({ draft: E("de", "BIWMG") });
      await page.waitForFunction(() => window.LANGPACK.has("de", "words") && window.LANGPACK.has("de", "block"));
      const glossOf = async (i, w) => { await type(page, i, w); await page.locator("#candLab").waitFor(); const lab = await page.locator("#candLab").innerText(); await page.keyboard.press("Enter"); return [await page.locator("#glossCtl").inputValue(), lab]; };
      for (const [i, w] of [[0, "bist"], [1, "ist"], [2, "war"]]) {
        const [g, lab] = await glossOf(i, w);
        assert.notEqual(g, "存在", w + " 不再得到名词 Sein 的释义");
        assert.match(lab, /是 sein 的变形/, w + "：写明是动词 sein 的变形");
      }
      const [gm, labm] = await glossOf(3, "mich");
      assert.equal(gm, "", "mich：查不到，不借别的词的释义");
      assert.doesNotMatch(labm, /的变形/, "mich：不标成任何词的变形");
      assert.equal((await glossOf(4, "ging"))[0], "走", "ging → gehen 照常");
      assert.deepEqual(errors, []); await context.close();
    }
  }
  console.log("browser lang ok: language field (collapsed, six checkboxes, multi-select, lazy load per language, status, retry, start gate), add / remove keeps content + English-only guard, diacritics + start hints, two-row candidates with articles, restore by draft lang, 320 width, B4-R5 media follows cells on language switch (incl. held refs), card articles + article choice + finish gate, long-word wrap + limit note, B4-R7 article follows sense POS, B4-R8 late lexicon reconciles old drafts, inflected forms resolve to lemma gloss, per-sense articles for gender homographs, B4-R9 combining marks + limit, B4-R10 forms matched by lemma + POS");
} finally {
  if (browser) await browser.close();
  server.close();
}
