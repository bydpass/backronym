// 第七批批次 2 回归（T29 / T31a / T32），批次 4 起加 T43 缩略图与大图、T31b 深色近黑：使用现有 Playwright，不安装依赖；新端口、新上下文，绝不操作用户预览存储。
// PLAYWRIGHT_MODULE=/absolute/path/to/playwright CHROMIUM_PATH=/path/to/chromium node scripts/test-shell-browser.mjs
// 覆盖：固定顶栏（滚到底仍在顶、仍可点；全屏页关闭同理；按钮图标 + 文字、图标 20px、点按区高 44px；设置页深浅三档；一行放不下时版式切换落到第二行；焦点不被栏盖住）、
// 320 / 360 / 375 / 414 宽无横向滚动、界面字号 +1.5px、横滑扩到字母栏与提示行（按钮上起手、有选区、放大时不切）。
// 真实软键盘下 sticky 的表现、系统字体缩放只能真机看。
import { createRequire } from "node:module";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const root = fileURLToPath(new URL("../app/", import.meta.url));
const server = createServer(async (req, res) => {
  const file = path.resolve(root, "." + (req.url === "/" ? "/index.html" : req.url.split("?")[0]));
  if (!file.startsWith(root)) { res.writeHead(403).end(); return; }
  try {
    const type = { ".js": "text/javascript", ".css": "text/css", ".html": "text/html", ".woff2": "font/woff2" }[path.extname(file)];
    res.setHeader("Content-Type", type || "application/octet-stream");
    res.setHeader("Cache-Control", "no-store"); res.end(await readFile(file));
  } catch { res.writeHead(404).end(); }
});
await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
const url = "http://127.0.0.1:" + server.address().port;
const KEY = "backronym-draft-v2";
// 合成草稿：第 2 格空着，其余格词都以该字母开头
const mk = (word) => ({ v: 2, word, filler: "小满", view: "single", titleRuns: null,
  picks: word.split("").map((l, i) => i === 1 ? null : [l.toLowerCase() + "ove", ""]), glosses: word.split("").map(() => ""), glossAuto: word.split("").map(() => true),
  captions: word.split("").map(() => "配文"), keys: word.split("").map(() => 0) });
const LIFE = mk("LIFE");
let browser;
try {
  browser = await chromium.launch({ headless: true, ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}) });
  async function pageFor({ draft = LIFE, width = 375, height = 640, touch = false } = {}) {
    const context = await browser.newContext({ viewport: { width, height }, hasTouch: touch });
    await context.addInitScript(({ draft, KEY }) => {
      if (!sessionStorage.getItem("seeded")) {
        if (draft) localStorage.setItem(KEY, JSON.stringify({ ...draft, t: Date.now() - 5000 }));
        sessionStorage.setItem("seeded", "1");
      }
    }, { draft, KEY });
    const page = await context.newPage(); const errors = [];
    page.on("pageerror", e => errors.push(e.message));
    await page.goto(url);
    await page.waitForFunction(() => !document.getElementById("wordInput").disabled);
    await page.evaluate(() => document.fonts && document.fonts.ready);
    return { page, context, errors };
  }
  // 点在元素中心时，最上面的是不是它自己（没被盖住、可点）
  const hittable = (page, sel) => page.evaluate(sel => { const n = document.querySelector(sel), r = n.getBoundingClientRect(); const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return !!hit && n.contains(hit); }, sel);
  const noHScroll = (page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);

  // T29：编辑页、改词页、借物页——滚到底后栏仍贴顶、按钮仍可点；四个宽度无横向滚动
  for (const width of [320, 360, 375, 414]) {
    const { page, context, errors } = await pageFor({ width, height: 560 });
    assert.ok(await noHScroll(page), width + " 宽编辑页无横向滚动");
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    assert.ok(await page.evaluate(() => scrollY) > 0, width + " 宽编辑页可滚");
    assert.equal(await page.locator("#top").evaluate(n => Math.round(n.getBoundingClientRect().top)), 0, width + " 宽：滚到底顶栏仍贴顶");
    for (const sel of ["#viewGrid", "#settingsOpen", "#finish"]) assert.ok(await hittable(page, sel), width + " 宽：滚到底 " + sel + " 仍可点");
    await page.locator("#toEntry").click();
    assert.ok(await noHScroll(page), width + " 宽改词页无横向滚动");
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    for (const sel of ["#entryBack", "#entrySave", "#settingsOpen"]) assert.ok(await hittable(page, sel), width + " 宽改词页滚到底 " + sel + " 仍可点");
    await page.locator("#settingsOpen").click(); await page.locator("#setCredits").click();
    await page.locator("#credits").evaluate(n => { n.scrollTop = n.scrollHeight; });
    assert.ok(await page.locator("#credits").evaluate(n => n.scrollTop) > 0, width + " 宽借物页可滚");
    assert.ok(await hittable(page, "#creditsClose"), width + " 宽借物页滚到底「关闭」仍可点");
    assert.ok(await page.locator("#credits").evaluate(n => n.scrollWidth <= n.clientWidth), width + " 宽借物页无横向滚动");
    await page.locator("#creditsClose").click();
    assert.equal(await page.evaluate(() => document.activeElement.id), "setCredits", "关掉借物页焦点回入口（设置页底行）");
    assert.deepEqual(errors, []); await context.close();
  }

  // v00.03.00 界面重构：顶栏与全屏页的按钮一律「图标 + 文字」（20px 图标、点按区高 44px、读屏名含可见文字）；深浅收进设置页（三档单选，立刻生效并记住）
  {
    const { page, context, errors } = await pageFor();
    const box = (sel) => page.locator(sel).evaluate(n => { const r = n.getBoundingClientRect(), ic = n.querySelector("svg").getBoundingClientRect(); return { h: r.height, iw: ic.width, ih: ic.height, text: n.innerText.trim(), hidden: n.querySelector("svg").getAttribute("aria-hidden") }; });
    assert.deepEqual(await box("#settingsOpen"), { h: 44, iw: 20, ih: 20, text: "设置", hidden: "true" }, "设置：图标 + 文字");
    assert.deepEqual(await box("#finish"), { h: 44, iw: 20, ih: 20, text: "完成", hidden: "true" }, "完成：图标 + 文字");
    assert.equal(await page.locator("#themeToggle").count(), 0, "顶栏不再有深浅按钮");
    assert.deepEqual(await page.locator("#top button").evaluateAll(ns => ns.filter(n => n.offsetParent).map(n => n.id)), ["viewSingle", "viewGrid", "settingsOpen", "finish"], "编辑页顶栏 Tab 顺序：先左后右");
    // 设置页：打开时焦点在关闭，当前档位选中；换档立刻生效、存到本设备；Esc 关闭，焦点还给「设置」
    await page.locator("#settingsOpen").click();
    assert.equal(await page.evaluate(() => document.activeElement.id), "settingsClose");
    const mode = () => page.evaluate(() => ({ checked: [...document.querySelectorAll("#modeGroup input")].filter(n => n.checked).map(n => n.value), attr: document.documentElement.getAttribute("data-theme"), dark: window.THEME.isDark(), stored: localStorage.getItem("acronym-meme-theme") }));
    assert.deepEqual((await mode()).checked, ["auto"], "默认跟随系统");
    // 四个主题（2026-11-12）：默认 fandom，只有浅色——深浅这一组停用并写明原因；换成别的主题恢复
    const skin = () => page.evaluate(() => ({ checked: [...document.querySelectorAll("#skinGroup input")].filter(n => n.checked).map(n => n.value), attr: document.documentElement.getAttribute("data-skin"), theme: document.documentElement.getAttribute("data-theme"), stored: localStorage.getItem("backronym-skin"),
      off: document.getElementById("modeGroup").classList.contains("off"), aria: document.getElementById("modeGroup").getAttribute("aria-disabled"), disabled: [...document.querySelectorAll("#modeGroup input")].every(n => n.disabled), why: document.getElementById("modeWhy").hidden ? "" : document.getElementById("modeWhy").innerText,
      paper: getComputedStyle(document.documentElement).getPropertyValue("--paper").trim(), red: getComputedStyle(document.documentElement).getPropertyValue("--red").trim() }));
    assert.equal(await page.locator("#skinGroup").getAttribute("role"), "radiogroup");
    assert.deepEqual(await page.locator("#skinGroup .set-th-n").allInnerTexts(), ["fandom", "单色画", "印象派", "分离派"]);
    assert.deepEqual(await skin(), { checked: ["fandom"], attr: "fandom", theme: "light", stored: null, off: true, aria: "true", disabled: true, why: "这个主题只有浅色。系统是深色模式时，整个界面也是浅色", paper: "#ffffff", red: "#990000" }, "默认 fandom：固定浅色，深浅停用并写明");
    await page.locator("#skinGroup label").nth(3).click();
    assert.deepEqual(await skin(), { checked: ["secession"], attr: "secession", theme: null, stored: "secession", off: false, aria: null, disabled: false, why: "", paper: "#f3efe2", red: "#8f1d1d" }, "换成分离派：立刻生效并记住，深浅恢复（跟随系统）");
    await page.locator("#skinGroup input:checked").focus(); await page.keyboard.press("ArrowLeft");
    assert.deepEqual([(await skin()).checked, (await skin()).paper], [["impressionism"], "#eef0ea"], "方向键换主题（原生单选）");
    await page.locator("#skinGroup label").nth(1).click(); // 单色画：下面换深浅
    await page.locator("#modeGroup label").nth(2).click();
    assert.deepEqual(await mode(), { checked: ["dark"], attr: "dark", dark: true, stored: "dark" }, "选深色：立刻生效并记住");
    assert.equal(await page.locator("#modeGroup").getAttribute("role"), "radiogroup");
    await page.locator("#modeGroup input:checked").focus(); await page.keyboard.press("ArrowLeft");
    assert.deepEqual(await mode(), { checked: ["light"], attr: "light", dark: false, stored: "light" }, "方向键换档（原生单选）");
    await page.keyboard.press("Escape");
    assert.equal(await page.locator("#settings").isVisible(), false); assert.equal(await page.evaluate(() => document.activeElement.id), "settingsOpen", "Esc 关闭，焦点还给「设置」");
    await page.locator("#settingsOpen").click();
    assert.deepEqual((await mode()).checked, ["light"], "再打开：选中的是当前档");
    assert.deepEqual(await box("#settingsClose"), { h: 44, iw: 20, ih: 20, text: "关闭", hidden: "true" }, "关闭：图标 + 文字");
    assert.match(await page.locator(".set-foot").innerText(), /借物与版权\s*v00\.03\.00/, "设置页底行：借物与版权、版本号");
    await page.locator("#setCredits").click();
    assert.equal(await page.locator("#creditsClose").getAttribute("aria-label"), "关闭借物与版权");
    assert.deepEqual(await box("#creditsClose"), { h: 44, iw: 20, ih: 20, text: "关闭", hidden: "true" });
    assert.ok(await hittable(page, "#creditsClose"), "借物页盖在设置页上面");
    await page.locator("#creditsClose").click(); await page.locator("#settingsClose").click();
    await page.locator("#toEntry").click();
    assert.deepEqual(await box("#entryBack"), { h: 44, iw: 20, ih: 20, text: "返回", hidden: "true" }, "返回：图标 + 文字");
    assert.equal(await page.locator("#entryBack").getAttribute("aria-label"), "返回编辑界面");
    assert.equal((await box("#entrySave")).text, "保存");
    const order = await page.locator("#top button").evaluateAll(ns => ns.filter(n => n.offsetParent).map(n => n.id));
    assert.deepEqual(order, ["entryBack", "entrySave", "settingsOpen"], "改词页顶栏：返回｜保存｜设置");
    assert.equal(await page.locator("#entryCredits").count(), 0, "入场页不再有底行");
    assert.deepEqual(errors, []); await context.close();
  }

  // T29 / WCAG 2.4.11：焦点落到被固定栏盖住的元素上时，滚出被盖住的那段；不用 scroll-padding（会让打字时每键滚动）
  {
    const { page, context, errors } = await pageFor({ height: 480 });
    await page.evaluate(() => window.scrollTo(0, 200));
    const tops = await page.evaluate(() => { const t = document.getElementById("title"); t.focus(); return { bar: document.getElementById("top").getBoundingClientRect().bottom, el: t.getBoundingClientRect().top }; });
    assert.ok(tops.el >= tops.bar, "标题框获焦后不在顶栏下面：" + JSON.stringify(tops));
    assert.equal(await page.evaluate(() => getComputedStyle(document.documentElement).scrollPaddingTop), "auto", "不用 scroll-padding-top");
    assert.deepEqual(errors, []); await context.close();
  }

  // T31a：界面文字 = 原字号 + 1.5px（u 体系与固定 px 都加）；十字母字母栏仍单行；提示行与入口不重叠
  for (const width of [320, 375]) {
    const { page, context, errors } = await pageFor({ width, draft: mk("BACKRONYMS") });
    const r = await page.evaluate(() => {
      const u = 3.6 * Number(document.getElementById("card").getAttribute("data-k")), fs = n => parseFloat(getComputedStyle(document.querySelector(n)).fontSize);
      return { u, hint: fs("#hint"), toEntry: fs("#toEntry"), top: fs("#top"), status: fs(".draft-note") };
    });
    assert.ok(Math.abs(r.hint - (10 * r.u + 1.5)) < 0.05, width + " 宽提示行 10u + 1.5px：" + JSON.stringify(r));
    assert.ok(Math.abs(r.toEntry - (10 * r.u + 1.5)) < 0.05 && Math.abs(r.top - (11 * r.u + 1.5)) < 0.05, width + " 宽入口与顶栏 +1.5px");
    assert.ok(Math.abs(r.status - 13.5) < 0.05, width + " 宽固定 12px 的草稿说明同加 1.5px");
    const ys = await page.locator("#pagerLetters .pl").evaluateAll(ns => [...new Set(ns.map(n => Math.round(n.getBoundingClientRect().top)))]);
    assert.equal(ys.length, 1, width + " 宽十字母字母栏单行");
    const apart = await page.evaluate(() => { const a = document.getElementById("hint").getBoundingClientRect(), b = document.getElementById("toEntry").getBoundingClientRect(); return a.right <= b.left + 0.5; });
    assert.ok(apart, width + " 宽提示行与入口不重叠");
    assert.ok(await noHScroll(page), width + " 宽无横向滚动");
    assert.deepEqual(errors, []); await context.close();
  }

  // T32：触屏上横滑有效区扩到字母栏与提示行；字母按钮、入口按钮上起手不切（U3）；有选中文字、页面放大时不切
  {
    const { page, context, errors } = await pageFor({ touch: true });
    const cur = () => page.evaluate(() => [...document.querySelectorAll("#pagerLetters .pl")].findIndex(b => b.classList.contains("on")));
    const swipe = (sel, dx, opts = {}) => page.evaluate(([sel, dx, opts]) => {
      const n = document.querySelector(sel), r = n.getBoundingClientRect();
      const target = opts.on ? document.querySelector(opts.on) : n, tr = target.getBoundingClientRect();
      const x = opts.on ? tr.left + tr.width / 2 : r.left + (opts.x != null ? opts.x : r.width / 2), y = opts.on ? tr.top + tr.height / 2 : r.top + r.height / 2;
      const t = (cx) => new Touch({ identifier: 1, target, clientX: cx, clientY: y });
      target.dispatchEvent(new TouchEvent("touchstart", { touches: [t(x)], changedTouches: [t(x)], bubbles: true, cancelable: true }));
      target.dispatchEvent(new TouchEvent("touchend", { touches: [], changedTouches: [t(x + dx)], bubbles: true, cancelable: true }));
    }, [sel, dx, opts]);
    assert.equal(await cur(), 1, "恢复后停在第一个没填的格（第 2 格）");
    await swipe("#hintRow", -120, { x: 4 }); assert.equal(await cur(), 2, "提示行左滑 → 下一格");
    await swipe("#pager", 120, { x: 1 }); assert.equal(await cur(), 1, "字母栏空白处右滑 → 上一格");
    await swipe("#pager", -120, { on: "#pl-0" }); assert.equal(await cur(), 1, "字母按钮上起手不切（U3）");
    await swipe("#hintRow", -120, { on: "#toEntry" }); assert.equal(await cur(), 1, "「改单词 / 填表人」上起手不切");
    await page.evaluate(() => { const s = getSelection(), r = document.createRange(); r.selectNodeContents(document.querySelector(".draft-note p")); s.removeAllRanges(); s.addRange(r); });
    await swipe("#hintRow", -120, { x: 4 }); assert.equal(await cur(), 1, "有选中文字不切");
    await page.evaluate(() => getSelection().removeAllRanges());
    await page.evaluate(() => { const fake = { scale: 2, offsetTop: 0, height: innerHeight, width: innerWidth, addEventListener() {}, removeEventListener() {} }; window.__vv = fake; Object.defineProperty(window, "visualViewport", { configurable: true, get: () => fake }); });
    await swipe("#hintRow", -120, { x: 4 }); assert.equal(await cur(), 1, "页面放大中不切（横移归浏览器）");
    await page.evaluate(() => { window.__vv.scale = 1; });
    await swipe("#hintRow", -120, { x: 4 }); assert.equal(await cur(), 2, "放大取消后照常");
    assert.equal(await page.locator("#pager").evaluate(n => getComputedStyle(n).touchAction), "auto", "卡外区域不设 pan-y（放大后能横移）");
    assert.deepEqual(errors, []); await context.close();
  }
  // 批次 4 · T43：导出完成后的缩略图条与大图查看；不强制先看（U15）
  const FULL = { v: 2, word: "LIFE", filler: "小满", view: "single", titleRuns: null, picks: [["love", ""], ["ice", ""], ["fire", ""], ["echo", ""]], glosses: ["爱", "冰", "火", "回声"], glossAuto: [false, false, false, false], captions: ["", "", "", ""], keys: [0, 0, 0, 0] };
  {
    const { page, context, errors } = await pageFor({ draft: FULL });
    await page.locator("#finish").click();
    await page.waitForFunction(() => !document.getElementById("finThumbs").hidden, null, { timeout: 20000 });
    const thumbs = page.locator("#finThumbs .thumb");
    assert.equal(await thumbs.count(), 4, "4 张单图 4 个缩略图");
    assert.deepEqual(await page.locator("#finThumbs .thumb span").allInnerTexts(), ["1 L", "2 I", "3 F", "4 E"], "按顺序：编号 + 字母");
    assert.equal(await thumbs.nth(1).getAttribute("aria-label"), "第 2 张，字母 I，点开看大图");
    assert.match(await page.locator("#finMsg").innerText(), /^已导出 4 张$/);
    assert.equal(await page.locator("#exportView").isDisabled(), false, "不强制先看：导出 / 保存可直接点（U15）");
    const box = await thumbs.first().boundingBox(); assert.ok(box.width >= 58 && box.height >= 77, "缩略图点按区 ≥ 58×77：" + JSON.stringify(box));
    await thumbs.nth(1).click();
    assert.equal(await page.locator("#viewer").isVisible(), true, "点开大图");
    assert.equal(await page.locator("#viewTitle").innerText(), "第 2 / 4 张 · I");
    const src = () => page.locator("#viewImg").getAttribute("src");
    assert.equal(await src(), await thumbs.nth(1).locator("img").getAttribute("src"), "大图就是将保存的那张");
    assert.match(await page.locator("#viewImg").getAttribute("alt"), /第 2\/4 张/, "大图有替代文字");
    await page.locator("#viewNext").click(); assert.equal(await page.locator("#viewTitle").innerText(), "第 3 / 4 张 · F");
    await page.keyboard.press("ArrowRight"); await page.keyboard.press("ArrowRight"); assert.equal(await page.locator("#viewTitle").innerText(), "第 1 / 4 张 · L", "方向键换张，末张后回到第 1 张");
    const ib = await page.locator("#viewImg").boundingBox();
    await page.mouse.move(ib.x + ib.width * 0.7, ib.y + ib.height / 2); await page.mouse.down(); await page.mouse.move(ib.x + ib.width * 0.2, ib.y + ib.height / 2); await page.mouse.up();
    assert.equal(await page.locator("#viewTitle").innerText(), "第 2 / 4 张 · I", "左滑 → 下一张");
    for (let i = 0; i < 6; i++) { await page.keyboard.press("Tab"); assert.ok(await page.evaluate(() => !!document.activeElement.closest("#viewer")), "Tab 不离开大图"); }
    await page.keyboard.press("Escape");
    assert.equal(await page.locator("#viewer").isVisible(), false, "Esc 关闭大图");
    assert.equal(await page.evaluate(() => [...document.querySelectorAll("#finThumbs .thumb")].indexOf(document.activeElement)), 1, "焦点回到当前这张的缩略图");
    assert.equal(await page.locator("#finishPanel").isVisible(), true, "完成面板还在");
    assert.deepEqual(errors, []); await context.close();
  }
  // T43：10 张、320 宽——缩略图条自己横向滚动，页面不横滚；列阵只有 1 张，写「列阵」
  {
    const ten = { ...FULL, word: "BACKRONYMS", picks: "BACKRONYMS".split("").map(l => [l.toLowerCase() + "ove", ""]), glosses: Array(10).fill("爱"), glossAuto: Array(10).fill(false), captions: Array(10).fill(""), keys: Array(10).fill(0) };
    const { page, context, errors } = await pageFor({ draft: ten, width: 320 });
    await page.locator("#finish").click();
    await page.waitForFunction(() => !document.getElementById("finThumbs").hidden, null, { timeout: 30000 });
    const r = await page.evaluate(() => { const t = document.getElementById("finThumbs"); return { inner: t.scrollWidth > t.clientWidth, page: document.documentElement.scrollWidth <= innerWidth }; });
    assert.deepEqual(r, { inner: true, page: true }, "缩略图条内部滚动、页面不横滚");
    await page.mouse.click(5, 5); await page.waitForFunction(() => document.getElementById("finishPanel").hidden); // 点遮罩关闭
    await page.locator("#viewGrid").click(); await page.locator("#finish").click();
    await page.waitForFunction(() => !document.getElementById("finThumbs").hidden, null, { timeout: 20000 });
    assert.deepEqual(await page.locator("#finThumbs .thumb span").allInnerTexts(), ["1 列阵"]);
    assert.deepEqual(errors, []); await context.close();
  }
  // T31b：深色改近黑（底 #0b0b0a、图版 #1a1a19、面板 #151514）；键盘行「已按下」除了底色还有 2px 下划线（浅深都有）
  for (const theme of ["dark", "light"]) {
    const { page, context, errors } = await pageFor({ draft: FULL });
    await page.evaluate(t => { window.THEME.setSkin("dansaekhwa"); document.documentElement.setAttribute("data-theme", t); }, theme); // 深浅兼备的主题里取单色画
    const r = await page.evaluate(() => { const cs = getComputedStyle(document.documentElement); return { paper: cs.getPropertyValue("--paper").trim(), plate: cs.getPropertyValue("--plate").trim(), panel: cs.getPropertyValue("--panel").trim(), body: getComputedStyle(document.body).backgroundColor }; });
    if (theme === "dark") assert.deepEqual(r, { paper: "#1e1d1b", plate: "#2f2d2a", panel: "#272624", body: "rgb(30, 29, 27)" }, "单色画深色：炭底");
    await page.locator("#title").focus(); await page.waitForFunction(() => !document.getElementById("kbRow").hidden);
    const shadow = await page.locator('.tool[data-cmd="bold"]').evaluate(n => [n.getAttribute("aria-pressed"), getComputedStyle(n).boxShadow]);
    assert.equal(shadow[0], "true"); assert.match(shadow[1], /0px -2px 0px( 0px)? inset/, theme + "：按下态有下划线，不只靠底色");
    if (theme === "dark") { // 深色导出图的底色同步改成 #0b0b0a（CORE.PALETTE.dark 与 CSS 同值）
      await page.locator("#title").blur(); await page.locator("#finish").click();
      await page.waitForFunction(() => !document.getElementById("finThumbs").hidden, null, { timeout: 20000 });
      const px = await page.evaluate(async () => { const img = new Image(); img.src = document.querySelector("#finThumbs img").src; await img.decode(); const c = document.createElement("canvas"); c.width = img.width; c.height = img.height; const x = c.getContext("2d"); x.drawImage(img, 0, 0); return [...x.getImageData(4, c.height - 4, 1, 1).data].slice(0, 3); });
      assert.ok(px.every((v, i) => Math.abs(v - [30, 29, 27][i]) <= 3), "导出图跟主题走：单色画深色的底 ≈ #1e1d1b：" + px);
    }
    assert.deepEqual(errors, []); await context.close();
  }
  // DEVICE-R3 / B8-R2：列阵分两张、两张格数不同（7+4、6+5、9+3）时，来回切页卡高与下方入口位置不变
  for (const [word, split] of [["DEVELOPMENT", undefined], ["DEVELOPMENT", 6], ["DEVELOPMENTS", 9]]) {
    const { page, context, errors } = await pageFor({ draft: { ...mk(word), view: "grid", ...(split ? { split } : {}) } });
    const tabs = page.locator("#sheetTabs .sheet-tab");
    assert.equal(await tabs.count(), 2, word + " 分两张");
    const at = [];
    for (const k of [0, 1, 0, 1]) {
      await tabs.nth(k).click();
      at.push(await page.evaluate(() => [document.getElementById("card").getBoundingClientRect().height, document.getElementById("toEntry").getBoundingClientRect().top].map(Math.round).join("/")));
    }
    assert.equal(new Set(at).size, 1, word + " " + (split || "默认") + "：切页不跳 " + at);
    assert.deepEqual(errors, []); await context.close();
  }
  // DEVICE-R1 / B8-R1：顶栏左右一律给容器浮动按钮让位（不依赖地址参数），320 宽不溢出、不换行
  {
    const { page, context, errors } = await pageFor({ width: 320 });
    const r = await page.evaluate(() => { const t = document.querySelector(".top"), cs = getComputedStyle(t), tg = document.getElementById("settingsOpen").getBoundingClientRect(), fin = document.getElementById("finish").getBoundingClientRect();
      return { pl: cs.paddingLeft, pr: cs.paddingRight, h: t.getBoundingClientRect().height, right: Math.max(tg.right, fin.right), sameRow: Math.abs(tg.top - fin.top) < 1, fits: document.documentElement.scrollWidth <= innerWidth }; });
    assert.deepEqual([r.pl, r.pr], ["48px", "48px"], "左右各让 48px");
    assert.ok(r.right <= 320 - 48 + 0.5 && r.sameRow && r.fits && r.h < 52, "320 宽让位后不溢出、不换行：" + JSON.stringify(r));
    // v00.03.00（2026-11-10 定）：一行放不下时「单图 / 列阵」移到下一行，「设置 · 完成」留在第一行；文字与 44px 点按区都保留，不溢出
    await page.evaluate(() => document.documentElement.style.setProperty("--container-gutter", "84px"));
    const w = await page.evaluate(() => { const g = id => document.getElementById(id).getBoundingClientRect(), v = g("viewSingle"), s = g("settingsOpen"), f = g("finish"), t = document.querySelector(".top").getBoundingClientRect();
      return { second: v.top >= s.bottom - 1, sameRow: Math.abs(s.top - f.top) < 1, left: Math.round(v.left), right: Math.round(f.right), hs: [v.height, s.height, f.height], top: t.height, fits: document.documentElement.scrollWidth <= innerWidth, text: document.getElementById("finish").innerText.trim() }; });
    assert.ok(w.second && w.sameRow && w.fits && w.left === 84 && w.right <= 320 - 84 && w.hs.every(h => h >= 44) && w.top >= 88 && w.text === "完成", "放不下：版式切换落到第二行、贴左；右边一组留在第一行：" + JSON.stringify(w));
    for (const sel of ["#viewGrid", "#settingsOpen", "#finish"]) assert.ok(await hittable(page, sel), "两行顶栏 " + sel + " 可点");
    assert.deepEqual(errors, []); await context.close();
  }
  // V003-B4-R6：读草稿还没完时进了设置页（或再进借物页），读完后焦点留在最上层的页里——不被背后的单词框抢走；Tab 不跑出去，Esc 只关最上层，背后不被输入
  for (const kind of ["empty", "draft", "fail"]) {
    const context = await browser.newContext({ viewport: { width: 375, height: 640 } });
    await context.addInitScript(({ kind, KEY, draft }) => {
      const data = kind === "draft" ? JSON.stringify({ ...draft, t: Date.now() - 5000 }) : null;
      window.xhs = { miniTool: { getStorage: async () => { await new Promise(r => setTimeout(r, 900)); if (kind === "fail") throw new Error("read failed"); return { data }; }, setStorage: async () => ({}), removeStorage: async () => ({}) } };
    }, { kind, KEY, draft: LIFE });
    const page = await context.newPage(); const errors = []; page.on("pageerror", e => errors.push(e.message));
    await page.goto(url);
    await page.locator("#settingsOpen").click();
    assert.equal(await page.evaluate(() => document.activeElement.id), "settingsClose");
    if (kind === "empty") { await page.locator("#setCredits").click(); assert.equal(await page.evaluate(() => document.activeElement.id), "creditsClose"); } // 嵌套的借物页
    const top = kind === "empty" ? "credits" : "settings";
    await page.waitForFunction(() => !document.getElementById("wordInput").disabled, null, { timeout: 15000 });
    await page.waitForTimeout(150);
    assert.ok(await page.evaluate(id => document.getElementById(id).contains(document.activeElement), top), kind + "：读完后焦点仍在最上层的页里（" + await page.evaluate(() => document.activeElement.id) + "）");
    for (let i = 0; i < 6; i++) { await page.keyboard.press("Tab"); assert.ok(await page.evaluate(id => document.getElementById(id).contains(document.activeElement), top), kind + "：Tab 不跑出最上层"); }
    const behind = () => page.evaluate(() => ["wordInput", "fillerCtl", "wordCtl", "glossCtl", "capCtl"].map(id => document.getElementById(id).value).join("|") + "|" + document.getElementById("title").textContent);
    const was = await behind();
    await page.keyboard.type("zz");
    assert.equal(await behind(), was, kind + "：背后的输入框都没有被输入");
    await page.keyboard.press("Escape");
    if (kind === "empty") {
      assert.equal(await page.locator("#credits").isVisible(), false); assert.equal(await page.locator("#settings").isVisible(), true, "Esc 只关最上层");
      assert.equal(await page.evaluate(() => document.activeElement.id), "setCredits");
      await page.keyboard.press("Escape");
    }
    assert.equal(await page.locator("#settings").isVisible(), false, kind + "：Esc 关闭设置");
    assert.equal(await page.evaluate(() => document.activeElement.id), "settingsOpen", kind + "：关闭后焦点还给「设置」");
    assert.equal(await page.locator("#entry").isVisible(), kind !== "draft", kind + "：背后的路由照常（有稿进编辑面，否则留在入场页）");
    assert.deepEqual(errors, []); await context.close();
  }
  console.log("browser shell ok: sticky bar at 320/360/375/414 + full pages, icon + text buttons 44px / 20px, settings page (mode radios, credits), two-row top bar, B4-R6 no focus steal under settings / credits, focus not obscured, UI text +1.5px + 10-letter pager, swipe zones + U3 + selection + zoom, T43 thumbs + viewer + 10-shot strip + grid, T31b near-black + pressed underline, B8 grid sheets steady + container gutter");
} finally {
  if (browser) await browser.close();
  server.close();
}
