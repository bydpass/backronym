// 界面语言回归（v00.04.00 批 1）：使用现有 Playwright，新端口、新上下文，不碰用户预览的存储。
// PLAYWRIGHT_MODULE=/absolute/path/to/playwright CHROMIUM_PATH=/path/to/chromium node scripts/test-uilang-browser.mjs
// 覆盖：环境语言是英文时界面出英文、中文环境仍是中文；英文界面各状态在 320 / 360 宽不横滚、没有页面报错；
// 界面文字里不剩中文（批 2 起释义、预设词释义、专业词标注也换成英文；卡面释义是用户写的、借物页保留字体名那一格与许可本体除外）；
// 设置页「界面语言」三档、主题英文名；换成中文后页面重新载入、草稿还在；换回跟随系统。
// 英文顶栏不比中文高（设置只留图标）、借物表不出现单个字母一行、版式页 Top / Bottom；冠词另选（只能点定冠词单数）。
// 软键盘、容器给的语言只能真机看。
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
  const p = req.url.split("?")[0], file = path.resolve(root, "." + (p === "/" ? "/index.html" : p));
  if (!file.startsWith(root)) { res.writeHead(403).end(); return; }
  try {
    res.setHeader("Content-Type", { ".js": "text/javascript", ".css": "text/css", ".html": "text/html", ".woff2": "font/woff2" }[path.extname(file)] || "application/octet-stream");
    res.setHeader("Cache-Control", "no-store"); res.end(await readFile(file));
  } catch { res.writeHead(404).end(); }
});
await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
const url = "http://127.0.0.1:" + server.address().port + "/";
const KEY = "backronym-draft-v2";
const LIFE = { v: 2, word: "LIFE", filler: "Mia", view: "single", titleRuns: null, picks: [["love", ""], null, ["fire", ""], ["earth", ""]], glosses: ["爱", "", "火", ""], glossAuto: [false, true, false, true], captions: ["a caption", "", "", ""], keys: [0, 0, 0, 0] };
// 页面上看得见的文字与读屏属性里还剩的中文；DATA 里的是用户写的卡面释义或有意保留的
const scan = () => {
  const han = /[㐀-鿿]/, DATA = ".b-gloss, [data-i18n-skip], [data-i18n-html='h.credits.td17'], .sr-only, #live, #editTitle";
  const vis = el => { for (let p = el; p && p.nodeType === 1; p = p.parentElement) { if (p.hidden) return false; const cs = getComputedStyle(p); if (cs.display === "none" || cs.visibility === "hidden") return false; } return true; };
  const left = [], w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT); let n;
  while ((n = w.nextNode())) { const p = n.parentElement; if (n.nodeValue.trim() && han.test(n.nodeValue) && vis(p) && !p.closest(DATA)) left.push((p.id || p.className || p.tagName) + ":" + n.nodeValue.trim().slice(0, 20)); }
  for (const el of document.querySelectorAll("[aria-label],[placeholder]")) for (const a of ["aria-label", "placeholder"]) {
    if (el.hasAttribute(a) && han.test(el.getAttribute(a)) && vis(el) && !el.closest("#pagerLetters, #mirror, #gridMirror, #finThumbs, #resList")) left.push("@" + a + ":" + el.getAttribute(a).slice(0, 20));
  }
  return { left, wide: document.documentElement.scrollWidth - window.innerWidth };
};
let browser;
try {
  browser = await chromium.launch({ headless: true, ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}) });
  const open = async (locale, width, draft, prepare) => {
    const context = await browser.newContext({ viewport: { width, height: 720 }, locale });
    await context.addInitScript(({ draft, KEY }) => { if (draft && !sessionStorage.getItem("seeded")) { localStorage.setItem(KEY, JSON.stringify({ ...draft, t: Date.now() - 5000 })); sessionStorage.setItem("seeded", "1"); } }, { draft, KEY });
    const page = await context.newPage(), errors = [];
    page.on("pageerror", e => errors.push(String(e)));
    if (prepare) await prepare(page);
    await page.goto(url, { waitUntil: "load" });
    await page.waitForFunction(() => !document.getElementById("wordInput").disabled, null, { timeout: 8000 });
    return { context, page, errors };
  };
  const click = (page, id) => page.evaluate(i => document.getElementById(i).click(), id);
  const type = (page, id, v) => page.evaluate(([i, v]) => { const c = document.getElementById(i); c.focus(); c.value = v; c.dispatchEvent(new Event("input", { bubbles: true })); }, [id, v]);

  // ---- 中文环境：不变 ----
  {
    const { context, page, errors } = await open("zh-CN", 375, null);
    assert.deepEqual(await page.evaluate(() => [document.documentElement.lang, window.I18N.lang(), document.getElementById("entryTitle").textContent, document.getElementById("entryStart").textContent.trim()]), ["zh-CN", "zh", "起一个单词", "开始填充"]);
    assert.deepEqual(errors, []);
    await context.close();
  }
  // ---- 英文环境：入场页 ----
  {
    const { context, page, errors } = await open("en-US", 320, null);
    assert.deepEqual(await page.evaluate(() => [document.documentElement.lang, window.I18N.lang(), document.getElementById("entryTitle").textContent, document.getElementById("entryStart").textContent.trim(), document.getElementById("wordInput").placeholder, document.title]), ["en", "en", "Pick a word", "Start filling", "English word", "Backronym"]);
    await click(page, "langMore");
    assert.deepEqual(await page.locator("#langList .lang-name").allInnerTexts(), ["English", "French Français", "German Deutsch", "Spanish Español", "Italian Italiano", "Latin Latina"], "英语的名字与原文相同，只写一遍");
    for (const code of ["fr", "de"]) await page.locator('#langList label:has(input[value="' + code + '"])').click();
    await page.waitForFunction(() => /ready/.test(document.getElementById("langNow").innerText), null, { timeout: 15000 });
    assert.equal(await page.locator("#langNow [aria-hidden=true]").innerText(), "En Fr De", "真机第一轮 D3：多选摘要写语言代码，不写英文名首字母 E F G");
    assert.equal(await page.locator("#langNow .sr-only").textContent(), "English, French, German", "全名仍交给读屏");
    const r = await page.evaluate(scan);
    assert.deepEqual(r.left, [], "入场页没有剩下的中文界面字"); assert.ok(r.wide <= 0, "320 宽不横滚");
    assert.deepEqual(errors, []);
    await context.close();
  }
  // ---- 英文环境：编辑面各状态，320 与 360 ----
  for (const width of [320, 360]) {
    const { context, page, errors } = await open("en-US", width, LIFE);
    await page.waitForFunction(() => document.getElementById("pagerLetters").children.length === 4, null, { timeout: 8000 });
    const check = async name => { await page.waitForTimeout(250); const r = await page.evaluate(scan); assert.deepEqual(r.left, [], width + " " + name + "：没有剩下的中文界面字"); assert.ok(r.wide <= 0, width + " " + name + "：不横滚"); };
    await check("编辑面");
    assert.equal(await page.locator("#hint").textContent(), "1 to go");
    assert.deepEqual(await page.evaluate(() => [document.getElementById("toEntry").textContent.trim(), document.getElementById("finishText").textContent]), ["Change word", "Done"]);
    await page.evaluate(() => document.querySelectorAll("#pagerLetters button")[1].click()); await type(page, "wordCtl", "in"); await check("候选栏");
    assert.equal(await page.locator("#wordCtl").getAttribute("aria-label"), "Word for cell 2, I (must start with I)");
    assert.match(await page.locator("#candLab").textContent(), /^Starts with I · set 1 of \d+/);
    await type(page, "wordCtl", "zz"); await check("词不合规");
    assert.equal(await page.locator("#candLab").textContent(), "The word in cell I must start with I");
    await type(page, "wordCtl", "idea");
    await page.evaluate(() => document.querySelectorAll("#pagerLetters button")[0].click()); await click(page, "plateHit"); await check("配图面板");
    assert.equal(await page.locator("#imgTitle").textContent(), "Image for this cell (L)"); await click(page, "imgClose");
    await click(page, "viewGrid"); await check("列阵"); await click(page, "viewSingle");
    await click(page, "toLayout"); await check("版式页");
    assert.deepEqual(await page.locator("#layBase .set-opt").allInnerTexts(), ["Folio", "Centered"]); await click(page, "layoutClose");
    await click(page, "settingsOpen"); await check("设置页");
    assert.deepEqual(await page.locator("#skinGroup .set-th-n").allInnerTexts(), ["fandom", "Dansaek", "Monet", "Vienna", "Table"]);
    assert.deepEqual(await page.locator("#uiLangGroup .set-opt").allInnerTexts(), ["System", "中文", "English"], "选项名不随界面语言变");
    assert.equal(await page.locator("#uiLangGroup input:checked").getAttribute("value"), "auto");
    assert.equal(await page.locator("#modeWhy").count(), 0, "主题只有一套的那行说明已去掉");
    assert.ok(await page.evaluate(() => parseFloat(getComputedStyle(document.querySelector("#skinGroup label:nth-child(2) .set-th-n")).fontSize) < parseFloat(getComputedStyle(document.querySelector("#skinGroup label:nth-child(1) .set-th-n")).fontSize)), "四个主题的英文名比 fandom 略小");
    await click(page, "setCredits"); await check("借物页");
    assert.equal(await page.locator("#creditsTitle").textContent(), "Credits");
    await page.locator("#creditsClose").click(); await page.locator("#settingsClose").click();
    await click(page, "toEntry"); await check("改单词页"); assert.equal(await page.locator("#entryTitle").textContent(), "Change word · Maker Name"); await click(page, "entryBack");
    await click(page, "finish"); await page.waitForFunction(() => !document.getElementById("finishPanel").hidden, null, { timeout: 15000 }); await check("完成面板");
    assert.match(await page.locator("#finTitle").textContent(), /^Export 4 single images/);
    assert.deepEqual(await page.evaluate(() => [window.I18N.t("core.cells", { n: 4 }), window.I18N.t("core.cells", { n: 1 })]), ["4 cells", "1 cell"], "导出图上的格数跟界面语言走");
    assert.deepEqual(errors, [], width + "：没有页面报错");
    await context.close();
  }
  // 换界面语言前，刚编辑的内容写不进任何存储时，留在当前页面。
  {
    const { context, page } = await open("en-US", 375, LIFE);
    await page.evaluate(k => {
      const set = Storage.prototype.setItem;
      Storage.prototype.setItem = function (key, value) {
        if (key === k) throw new Error("draft storage unavailable");
        return set.call(this, key, value);
      };
      document.querySelectorAll("#pagerLetters button")[1].click();
    }, KEY);
    await type(page, "wordCtl", "idea");
    await page.locator("#settingsOpen").click();
    await page.locator("#uiLangGroup label").nth(1).click();
    await page.waitForFunction(() => document.getElementById("settings").hidden || window.I18N.lang() !== "en");
    assert.deepEqual(await page.evaluate(() => [window.I18N.lang(), window.I18N.pref(), document.getElementById("live").textContent]), ["en", "auto", "Saving couldn't be confirmed. Export soon."]);
    assert.equal((await page.locator("#wordCtl").inputValue()).toLowerCase(), "idea");
    await context.close();
  }
  // 草稿文字能写，但新图无法落盘时同样不得重载。
  {
    const { context, page } = await open("en-US", 375, LIFE, p =>
      p.addInitScript(() => Object.defineProperty(window, "indexedDB", { value: undefined })));
    const png = await page.evaluate(() => {
      const canvas = document.createElement("canvas");
      canvas.width = canvas.height = 24;
      canvas.getContext("2d").fillRect(0, 0, 24, 24);
      return canvas.toDataURL().split(",")[1];
    });
    await click(page, "plateHit");
    await page.locator("#photo").setInputFiles({ name: "draft-photo.png", mimeType: "image/png", buffer: Buffer.from(png, "base64") });
    await page.locator("#cropApply").click();
    await page.locator("#imgClose").click();
    await page.waitForSelector("#mirror canvas.b-image");
    await page.locator("#settingsOpen").click();
    await page.locator("#uiLangGroup label").nth(1).click();
    await page.waitForFunction(() => document.getElementById("settings").hidden);
    assert.equal(await page.evaluate(() => window.I18N.lang()), "en");
    assert.equal(await page.locator("#mirror canvas.b-image").count(), 1);
    // 这台设备存不了图（没有任何图片后端）：等也没用，提示要说明为什么没换（用户 2026-11-21 定），不再用「未确认保存成功」那句
    assert.deepEqual(await page.evaluate(() => [document.getElementById("toast").textContent, document.getElementById("live").textContent]), Array(2).fill("Can't switch: this device can't save images. Export first, or remove them."));
    await context.close();
  }
  // 同一情形在 320 宽、中英文各看一遍：提示条在页面内、字不出框、不横滚，卡面位置和大小不变
  for (const [locale, to, msg] of [["zh-CN", 2, "这台设备存不了配图，换语言会丢图。请先导出，或去掉配图再换。"], ["en-US", 1, "Can't switch: this device can't save images. Export first, or remove them."]]) {
    const { context, page, errors } = await open(locale, 320, LIFE, p =>
      p.addInitScript(() => Object.defineProperty(window, "indexedDB", { value: undefined })));
    const png = await page.evaluate(() => { const c = document.createElement("canvas"); c.width = c.height = 24; c.getContext("2d").fillRect(0, 0, 24, 24); return c.toDataURL().split(",")[1]; });
    await click(page, "plateHit");
    await page.locator("#photo").setInputFiles({ name: "draft-photo.png", mimeType: "image/png", buffer: Buffer.from(png, "base64") });
    await page.locator("#cropApply").click();
    await page.locator("#imgClose").click();
    await page.waitForSelector("#mirror canvas.b-image");
    const box = () => page.evaluate(() => { const r = document.getElementById("mirror").getBoundingClientRect(); return [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)]; });
    const before = await box();
    await page.locator("#settingsOpen").click();
    await page.locator("#uiLangGroup label").nth(to).click();
    await page.waitForFunction(() => document.getElementById("settings").hidden && document.getElementById("toast").textContent);
    const t = await page.evaluate(() => { const e = document.getElementById("toast"), r = e.getBoundingClientRect(); return { text: e.textContent, left: r.left, right: r.right, top: r.top, bottom: r.bottom, clipped: e.scrollWidth > e.clientWidth, w: innerWidth, h: innerHeight, sw: document.documentElement.scrollWidth, lang: window.I18N.lang(), pref: window.I18N.pref() }; });
    assert.equal(t.text, msg, locale + " 存不了图时换语言的提示");
    assert.ok(t.left >= 0 && t.right <= t.w && t.top >= 0 && t.bottom <= t.h && !t.clipped && t.sw <= t.w, locale + " 提示条在页面内、字不出框、不横滚：" + JSON.stringify(t));
    assert.deepEqual([t.lang, t.pref], [locale === "zh-CN" ? "zh" : "en", "auto"], locale + " 语言没换，偏好没写");
    assert.deepEqual(await box(), before, locale + " 卡面位置和大小不变");
    assert.equal(await page.locator("#mirror canvas.b-image").count(), 1, locale + " 图还在");
    assert.deepEqual(errors, []);
    await context.close();
  }
  // ---- 设置页换语言：重新载入、记在本机、草稿还在 ----
  {
    const { context, page, errors } = await open("en-US", 375, LIFE);
    await page.waitForFunction(() => document.getElementById("pagerLetters").children.length === 4, null, { timeout: 8000 });
    await page.evaluate(() => document.querySelectorAll("#pagerLetters button")[1].click()); await type(page, "wordCtl", "idea"); // 刚填的词还没到自动保存的时刻：换语言前要先落盘
    await click(page, "settingsOpen");
    await Promise.all([page.waitForNavigation({ waitUntil: "load" }), page.locator("#uiLangGroup label").nth(1).click()]);
    await page.waitForFunction(() => document.getElementById("pagerLetters").children.length === 4, null, { timeout: 8000 });
    assert.deepEqual(await page.evaluate(() => [window.I18N.lang(), document.documentElement.lang, localStorage.getItem("backronym-ui-lang"), document.getElementById("finishText").textContent, document.getElementById("toEntry").textContent.trim()]), ["zh", "zh-CN", "zh", "完成", "改单词"], "换成中文：重新载入后是中文，记在本机");
    assert.equal(String((JSON.parse(await page.evaluate(k => localStorage.getItem(k), KEY)).picks[1] || [])[0]).toLowerCase(), "idea", "换语言前刚填的词已落盘");
    await click(page, "settingsOpen");
    assert.equal(await page.locator("#uiLangGroup input:checked").getAttribute("value"), "zh");
    await Promise.all([page.waitForNavigation({ waitUntil: "load" }), page.locator("#uiLangGroup label").nth(0).click()]);
    await page.waitForFunction(() => document.getElementById("pagerLetters").children.length === 4, null, { timeout: 8000 });
    assert.deepEqual(await page.evaluate(() => [window.I18N.lang(), localStorage.getItem("backronym-ui-lang")]), ["en", null], "换回跟随系统：不再记，跟环境走");
    assert.deepEqual(errors, []);
    await context.close();
  }
  // ---- 顶栏：英文界面下「设置」只留图标，顶栏不再比中文多出一行（用户 11-21 定） ----
  for (const width of [320, 360, 390]) {
    const tops = {};
    for (const locale of ["zh-CN", "en-US"]) {
      const { context, page } = await open(locale, width, LIFE);
      await page.waitForFunction(() => document.getElementById("pagerLetters").children.length === 4, null, { timeout: 8000 });
      const edit = await page.evaluate(() => Math.round(document.querySelector(".top").getBoundingClientRect().height));
      const gear = await page.evaluate(() => { const b = document.getElementById("settingsOpen"), s = b.querySelector("span").getBoundingClientRect(), i = b.querySelector(".ic").getBoundingClientRect(); return { text: s.width, icon: i.width, name: b.textContent.trim(), w: b.getBoundingClientRect().width }; });
      await click(page, "toEntry"); await page.waitForTimeout(250);
      tops[locale] = { edit, reword: await page.evaluate(() => Math.round(document.querySelector(".top").getBoundingClientRect().height)), gear };
      await context.close();
    }
    assert.ok(tops["en-US"].edit <= tops["zh-CN"].edit && tops["en-US"].reword <= tops["zh-CN"].reword, width + "：英文顶栏不比中文高 " + JSON.stringify(tops));
    assert.ok(tops["en-US"].gear.text <= 1 && tops["en-US"].gear.icon >= 16 && tops["en-US"].gear.name === "Settings" && tops["en-US"].gear.w >= 36, width + "：英文的设置按钮只见图标，名字还在");
    if (width >= 360) assert.ok(tops["zh-CN"].gear.text > 10, "中文的设置按钮照旧带字");
  }
  // ---- 借物页来源表：英文不再一个字母占一行 ----
  for (const width of [320, 360]) {
    const { context, page } = await open("en-US", width, LIFE);
    await page.waitForFunction(() => document.getElementById("pagerLetters").children.length === 4, null, { timeout: 8000 });
    await click(page, "settingsOpen"); await click(page, "setCredits"); await page.waitForTimeout(300);
    // 逐格把每个字母按所在的行归拢：一行里只有一个字母、而这一格不止一行，就是被单独挤下来的（网址另算：它们不加连字符，可以断在任何地方）
    const lone = await page.evaluate(() => { const out = [];
      for (const cell of document.querySelectorAll("#credits .credits-table th, #credits .credits-table td")) {
        const lines = new Map(), w = document.createTreeWalker(cell, NodeFilter.SHOW_TEXT); let n;
        while ((n = w.nextNode())) { if (n.parentElement.closest("span[lang], code")) continue; const t = n.nodeValue;
          for (let k = 0; k < t.length; k++) { if (!/[A-Za-z0-9]/.test(t[k])) continue; const r = document.createRange(); r.setStart(n, k); r.setEnd(n, k + 1); const top = Math.round(r.getBoundingClientRect().top); lines.set(top, (lines.get(top) || "") + t[k]); } }
        if (lines.size > 1) for (const [, text] of lines) if (text.length === 1) out.push(cell.textContent.trim().slice(0, 24) + " → " + text);
      } return out; });
    assert.deepEqual(lone, [], width + "：来源表里没有被单独挤到一行的字母");
    assert.deepEqual(await page.locator("#credits .credits-table tbody th").first().allInnerTexts(), ["This tool"]);
    await context.close();
  }
  // ---- 版式页：英文的上下两项是 Top / Bottom，不出框 ----
  {
    const { context, page } = await open("en-US", 320, LIFE);
    await page.waitForFunction(() => document.getElementById("pagerLetters").children.length === 4, null, { timeout: 8000 });
    await click(page, "toLayout"); await page.waitForTimeout(250);
    const order = await page.evaluate(() => Array.from(document.querySelectorAll('#layoutPage input[name="lay-order"]'), r => { const s = r.parentElement.querySelector("span"); return [s.textContent.trim(), s.scrollWidth <= s.clientWidth + 1]; }));
    assert.deepEqual(order, [["Top", true], ["Bottom", true]]);
    await context.close();
  }
  // ---- 冠词另选（v00.04.00，用户定：只能点这门语言的定冠词单数，不让自己写）：选了盖过词库的，再点取消，随草稿保存 ----
  {
    const FR = { v: 2, lang: "fr", word: "MER", filler: "", view: "single", titleRuns: null, picks: [["mer", ""], null, null], glosses: ["", "", ""], glossAuto: [true, true, true], captions: ["", "", ""], keys: [0, 0, 0], artOwn: ["une", "", ""] };
    const { context, page, errors } = await open("zh-CN", 375, FR);
    await page.waitForFunction(() => document.getElementById("pagerLetters").children.length === 3, null, { timeout: 8000 });
    const art = () => page.evaluate(() => { const a = document.querySelector("#mirror .b-article"); return a ? a.textContent : ""; });
    const bar = async () => { await page.evaluate(() => { document.querySelectorAll("#pagerLetters button")[0].click(); document.getElementById("glossCtl").focus(); }); await page.waitForSelector("#senseList .art-row button", { timeout: 8000 }); }; // 义项栏在点到释义时出
    const btns = () => page.evaluate(() => Array.from(document.querySelectorAll("#senseList .art-row button"), b => b.textContent + (b.getAttribute("aria-pressed") === "true" ? "*" : "")));
    await page.evaluate(() => document.querySelectorAll("#pagerLetters button")[0].click());
    await page.waitForFunction(() => /^la$/.test((document.querySelector("#mirror .b-article") || {}).textContent || ""), null, { timeout: 15000 }); // 旧稿里自己写的 une 不在表里：不认，照词库的
    await bar();
    assert.deepEqual(await btns(), ["la*", "le", "l’"], "词库给的排第一并亮着，后面是法语其余的定冠词单数");
    assert.equal(await page.locator("#senseList .art-row input").count(), 0, "没有输入框");
    await page.locator("#senseList .art-row button", { hasText: /^le$/ }).click(); await page.waitForTimeout(300);
    assert.equal(await art(), "le", "另选的盖过词库给的");
    await bar(); assert.deepEqual(await btns(), ["la", "le*", "l’"]);
    await page.waitForFunction(k => { const d = JSON.parse(localStorage.getItem(k) || "{}"); return d.artOwn && d.artOwn[0] === "le"; }, KEY, { timeout: 8000 });
    await page.reload({ waitUntil: "load" });
    await page.waitForFunction(() => document.getElementById("pagerLetters").children.length === 3, null, { timeout: 8000 });
    await page.evaluate(() => document.querySelectorAll("#pagerLetters button")[0].click());
    await page.waitForFunction(() => /^le$/.test((document.querySelector("#mirror .b-article") || {}).textContent || ""), null, { timeout: 15000 });
    await bar();
    await page.locator("#senseList .art-row button", { hasText: /^le$/ }).click(); await page.waitForTimeout(300);
    assert.equal(await art(), "la", "再点一次亮着的：取消，回到词库给的");
    await page.waitForFunction(k => !JSON.parse(localStorage.getItem(k) || "{}").artOwn, KEY, { timeout: 8000 });
    await bar(); await page.locator("#senseList .art-row button", { hasText: /^l’$/ }).click(); await page.waitForTimeout(300);
    assert.equal(await art(), "l’"); await bar();
    await page.locator("#senseList .art-row button", { hasText: /^la$/ }).click(); await page.waitForTimeout(300);
    assert.equal(await art(), "la", "点词库给的那个也回到词库");
    assert.deepEqual(errors, []);
    await context.close();
    const en = await open("zh-CN", 375, LIFE);
    await en.page.waitForFunction(() => document.getElementById("pagerLetters").children.length === 4, null, { timeout: 8000 });
    await en.page.evaluate(() => { document.querySelectorAll("#pagerLetters button")[0].click(); document.getElementById("glossCtl").focus(); }); await en.page.waitForTimeout(500);
    assert.ok(await en.page.locator("#senseList .sense").count() > 0, "英语的词照旧有义项栏");
    assert.equal(await en.page.locator("#senseList .art-row").count(), 0, "英语的词没有冠词一行");
    await en.context.close();
  }
  // ---- 真机第一轮 D4、D5（用户 11-21 定）：冠词范围按作品已选的外语；固定排法 la le el il l’ lo，德语的 der die das 另起一行 ----
  {
    const base = { v: 2, filler: "", view: "single", titleRuns: null, glosses: ["", ""], glossAuto: [true, true], captions: ["", ""], keys: [0, 0] };
    const btns = page => page.evaluate(() => Array.from(document.querySelectorAll("#senseList .art-row button"), b => b.textContent + (b.getAttribute("aria-pressed") === "true" ? "*" : "")));
    const bar = async page => { await page.evaluate(() => { document.querySelectorAll("#pagerLetters button")[0].click(); document.getElementById("glossCtl").focus(); }); await page.waitForSelector("#senseList .art-row button", { timeout: 15000 }); };
    // 西、意两门，ira 只在西语词库里：意语的 il / lo / l’ 也能选，点了画到卡上
    const es = await open("zh-CN", 375, { ...base, lang: "es", langs: ["es", "it"], word: "IA", picks: [["ira", ""], null], pickLangs: ["es", ""] });
    await es.page.waitForFunction(() => document.getElementById("pagerLetters").children.length === 2, null, { timeout: 8000 });
    await es.page.evaluate(() => document.querySelectorAll("#pagerLetters button")[0].click());
    await es.page.waitForFunction(() => /^la$/.test((document.querySelector("#mirror .b-article") || {}).textContent || ""), null, { timeout: 15000 });
    await bar(es.page);
    assert.deepEqual(await btns(es.page), ["la*", "el", "il", "l’", "lo"], "西语词也能选意语的冠词，按固定排法");
    assert.equal(await es.page.locator("#senseList .art-br").count(), 0, "没有德语就不另起一行");
    await es.page.locator("#senseList .art-row button", { hasText: /^il$/ }).click(); await es.page.waitForTimeout(300);
    assert.equal(await es.page.evaluate(() => document.querySelector("#mirror .b-article").textContent), "il", "选了意语的 il 画到卡上");
    // Sol 复审 D4/D5：取消意语时另选的 il 一并清掉（草稿里也清），中途重开、再勾回意语都不恢复
    await es.page.waitForFunction(k => (JSON.parse(localStorage.getItem(k)).artOwn || [])[0] === "il", KEY, { timeout: 8000 });
    const itBox = async on => { await es.page.locator("#toEntry").click(); if (!(await es.page.locator("#langList").isVisible())) await es.page.locator("#langMore").click(); await es.page.locator('#langList label:has(input[value="it"])').click(); await es.page.waitForFunction(on => window.CORE.activeLangs().indexOf("it") >= 0 === on, on); await es.page.locator("#entrySave").click(); await es.page.locator("#entryBack").click(); await es.page.waitForFunction(() => document.getElementById("entry").hidden); };
    await itBox(false);
    await es.page.waitForFunction(k => !(JSON.parse(localStorage.getItem(k)).artOwn || [])[0], KEY, { timeout: 8000 });
    await es.page.reload(); await es.page.waitForFunction(() => !document.getElementById("wordInput").disabled, null, { timeout: 8000 });
    await itBox(true);
    await es.page.evaluate(() => document.querySelectorAll("#pagerLetters button")[0].click());
    await es.page.waitForFunction(() => (document.querySelector("#mirror .b-article") || {}).textContent === "la", null, { timeout: 15000 });
    await bar(es.page);
    assert.deepEqual(await btns(es.page), ["la*", "el", "il", "l’", "lo"], "再勾回意语：il 不恢复，仍是词库给的 la");
    assert.deepEqual(es.errors, []);
    await es.context.close();
    // 旧稿里另选的冠词已不在已选外语里（只剩西语却记着 il）：重开即清，加回意语也不带回
    const old = await open("zh-CN", 375, { ...base, lang: "es", word: "IA", picks: [["ira", ""], null], artOwn: ["il", ""] });
    await old.page.waitForFunction(() => document.getElementById("pagerLetters").children.length === 2, null, { timeout: 8000 });
    await old.page.locator("#toEntry").click(); await old.page.locator("#langMore").click(); await old.page.locator('#langList label:has(input[value="it"])').click();
    await old.page.waitForFunction(() => window.CORE.activeLangs().join() === "es,it"); await old.page.locator("#entrySave").click(); await old.page.locator("#entryBack").click(); await old.page.waitForFunction(() => document.getElementById("entry").hidden);
    await old.page.evaluate(() => document.querySelectorAll("#pagerLetters button")[0].click());
    await old.page.waitForFunction(() => (document.querySelector("#mirror .b-article") || {}).textContent === "la", null, { timeout: 15000 });
    assert.deepEqual(old.errors, []);
    await old.context.close();
    // Sol 复核：旧稿只选西法，自填词却记着意语归属与 il。恢复时不认未选语言的归属，il 随之清掉，义项栏也不列意语冠词
    const stray = await open("zh-CN", 375, { ...base, lang: "es", langs: ["es", "fr"], word: "MX", picks: [["motzu", ""], null], pickLangs: ["it", ""], artOwn: ["il", ""] });
    await stray.page.waitForFunction(() => document.getElementById("pagerLetters").children.length === 2, null, { timeout: 8000 });
    await bar(stray.page);
    assert.deepEqual(await btns(stray.page), ["la", "le", "el", "l’"], "只列西法两门的冠词，没有意语的，il 不亮");
    assert.equal(await stray.page.evaluate(() => (document.querySelector("#mirror .b-article") || {}).textContent || ""), "", "卡上不画 il");
    assert.deepEqual(stray.errors, []);
    await stray.context.close();
    // Sol 最终复审：法西意三门，意语 ragazzo 的词库冠词是 il；取消意语后法西都查不到它，词和释义留着，il 不再画、义项栏也不列；保存重开同样
    const rg = await open("zh-CN", 375, { ...base, lang: "fr", langs: ["fr", "es", "it"], word: "RX", picks: [["ragazzo", ""], null], pickLangs: ["it", ""], glosses: ["男孩", ""] });
    await rg.page.waitForFunction(() => document.getElementById("pagerLetters").children.length === 2, null, { timeout: 8000 });
    await rg.page.evaluate(() => document.querySelectorAll("#pagerLetters button")[0].click());
    await rg.page.waitForFunction(() => (document.querySelector("#mirror .b-article") || {}).textContent === "il", null, { timeout: 15000 });
    await rg.page.locator("#toEntry").click(); await rg.page.locator("#langMore").click(); await rg.page.locator('#langList label:has(input[value="it"])').click();
    await rg.page.waitForFunction(() => window.CORE.activeLangs().join() === "fr,es"); await rg.page.locator("#entrySave").click(); await rg.page.locator("#entryBack").click(); await rg.page.waitForFunction(() => document.getElementById("entry").hidden);
    const rgCheck = async label => {
      await bar(rg.page);
      assert.deepEqual(await btns(rg.page), ["la", "le", "el", "l’"], label + "：义项栏只列法西两门的冠词，没有 il");
      assert.deepEqual(await rg.page.evaluate(() => [(document.querySelector("#mirror .b-article") || {}).textContent || "", (document.querySelector("#mirror .b-gloss") || {}).textContent || ""]), ["", "男孩"], label + "：卡上不画 il，释义照留");
    };
    await rgCheck("取消意语后");
    await rg.page.waitForFunction(k => { const d = JSON.parse(localStorage.getItem(k)); return d.picks[0][0].toLowerCase() === "ragazzo" && !d.picks[0][2]; }, KEY, { timeout: 8000 });
    await rg.page.reload(); await rg.page.waitForFunction(() => !document.getElementById("wordInput").disabled, null, { timeout: 8000 });
    await rg.page.waitForFunction(() => document.getElementById("pagerLetters").children.length === 2, null, { timeout: 8000 });
    await rgCheck("保存重开后");
    assert.deepEqual(rg.errors, []);
    await rg.context.close();
    // 旧稿：只选法西，ragazzo 却记着意语归属并带着 il 的冠词列——重开即去掉
    const rgOld = await open("zh-CN", 375, { ...base, lang: "fr", langs: ["fr", "es"], word: "RX", picks: [["Ragazzo", "n.男孩|n.男朋友", "il|il", ""], null], pickLangs: ["it", ""], glosses: ["男孩", ""] });
    await rgOld.page.waitForFunction(() => document.getElementById("pagerLetters").children.length === 2, null, { timeout: 8000 });
    await bar(rgOld.page);
    assert.deepEqual(await btns(rgOld.page), ["la", "le", "el", "l’"], "旧稿重开：义项栏没有 il");
    assert.equal(await rgOld.page.evaluate(() => (document.querySelector("#mirror .b-article") || {}).textContent || ""), "", "旧稿重开：卡上不画 il");
    assert.deepEqual(rgOld.errors, []);
    await rgOld.context.close();
    // Sol 本体复审：旧版（第三轮预览 26f8c015）取消意语后存下的草稿（第一格的数据是用那版代码实际存出来的）——法西两门、第一格归属已空、词条仍带 il|il；新版重开要去掉。
    // 同一份草稿里西语 sangre 的 la 仍有效（归属 es），释义与配文照留
    const leg = await open("zh-CN", 375, { v: 2, filler: "", view: "single", titleRuns: null, lang: "fr", langs: ["fr", "es"], word: "RSX", picks: [["Ragazzo", "n.男孩|n.男朋友", "il|il", ""], ["sangre", ""], null], pickLangs: ["", "es", ""], glosses: ["男孩", "", ""], glossAuto: [true, true, true], poss: ["n.", "", ""], captions: ["配文一", "", ""], keys: [0, 0, 0] });
    await leg.page.waitForFunction(() => document.getElementById("pagerLetters").children.length === 3, null, { timeout: 8000 });
    await bar(leg.page);
    assert.deepEqual(await btns(leg.page), ["la", "le", "el", "l’"], "旧版草稿重开：义项栏没有 il");
    assert.deepEqual(await leg.page.evaluate(() => [(document.querySelector("#mirror .b-article") || {}).textContent || "", (document.querySelector("#mirror .b-gloss") || {}).textContent || ""]), ["", "男孩"], "旧版草稿重开：卡上不画 il，释义照留");
    assert.equal(await leg.page.evaluate(k => JSON.parse(localStorage.getItem(k)).captions[0], KEY), "配文一", "配文照留");
    await leg.page.evaluate(() => document.querySelectorAll("#pagerLetters button")[1].click());
    await leg.page.waitForFunction(() => (document.querySelector("#mirror .b-article") || {}).textContent === "la", null, { timeout: 15000 });
    assert.deepEqual(leg.errors, []);
    await leg.context.close();
    // 法德两门，词库里没有的词：法语一行、德语另起一行，起初都不亮
    const fd = await open("zh-CN", 375, { ...base, lang: "fr", langs: ["fr", "de"], word: "MX", picks: [["motzu", ""], null], pickLangs: ["", ""] });
    await fd.page.waitForFunction(() => document.getElementById("pagerLetters").children.length === 2, null, { timeout: 8000 });
    await bar(fd.page);
    assert.deepEqual(await btns(fd.page), ["la", "le", "l’", "der", "die", "das"], "词库里没有的词列全部已选外语的冠词，都不亮");
    const rows = await fd.page.evaluate(() => { const bs = Array.from(document.querySelectorAll("#senseList .art-row button")); return [bs[0].getBoundingClientRect().top, bs[3].getBoundingClientRect().top, bs[0].getBoundingClientRect().left, bs[3].getBoundingClientRect().left]; });
    assert.ok(rows[1] > rows[0] + 5 && Math.abs(rows[2] - rows[3]) <= 1, "德语冠词另起一行并与上一行左端对齐：" + JSON.stringify(rows));
    assert.deepEqual(fd.errors, []);
    await fd.context.close();
  }
  // ---- 批 2 英文释义（用户 11-21 定）：英文界面下外语的词显示英文、卡面自动填英文短写；英语的词只标词性、卡面留空 ----
  {
    const saved = { ...LIFE, lang: "fr", word: "AL", picks: [["automobile", ""], ["livre", "n.书|n.磅", "le|la"]], glosses: ["", "磅"], glossAuto: [true, true], captions: ["", ""], poss: ["", "n.#2"], keys: [0, 0] };
    const { context, page, errors } = await open("en-US", 360, saved, async p => {
      await p.route("**/assets/lang/fr/words.js", async route => {
        await new Promise(resolve => setTimeout(resolve, 300));
        await route.continue();
      });
    });
    await page.locator("#pagerLetters button").nth(0).click();
    await page.waitForFunction(() => document.querySelector("#mirror .b-gloss")?.textContent === "automotive");
    await page.locator("#glossCtl").focus();
    await page.waitForSelector("#senseList .sense-row:not(.art-row) .sense");
    assert.deepEqual(await page.locator("#senseList .sense-row:not(.art-row) .sense").allTextContents(), ["automotive", "automobile"], "法语同词同中文译名，英文按词性分开");
    const senses = page.locator("#senseList .sense-row:not(.art-row) .sense");
    await senses.nth(1).click();
    await page.locator("#glossCtl").focus();
    await page.locator("#senseList .art-row button", { hasText: /^le$/ }).click();
    assert.equal(await page.locator("#mirror .b-article").textContent(), "le");
    await page.locator("#glossCtl").focus();
    await senses.nth(0).click();
    assert.equal(await page.locator("#mirror .b-article").count(), 0, "改选形容词后，名词的另选冠词不画到卡面");
    await page.locator("#pagerLetters button").nth(1).click();
    assert.equal(await page.locator("#mirror .b-gloss").textContent(), "pound", "法语主包迟到时保留已存的非默认自动义项");
    assert.deepEqual(errors, []);
    await context.close();
  }
  // 真机第二轮 E1、E2（用户 11-21 定）：英文界面点 Done 被拦下时提示句不再一个词一行地折（两个入口整组挪到下一行靠右）；编辑面的释义与配文占位字带虚线
  {
    const saved = { v: 2, lang: "en", word: "SIXSEPT", filler: "", view: "single", titleRuns: null, picks: Array(7).fill(null), glosses: Array(7).fill(""), glossAuto: Array(7).fill(true), captions: Array(7).fill(""), keys: Array(7).fill(0) };
    const { context, page, errors } = await open("en-US", 375, saved);
    await page.waitForFunction(() => document.getElementById("pagerLetters").children.length === 7, null, { timeout: 8000 });
    await page.locator("#finish").click(); await page.waitForTimeout(400);
    const r = await page.evaluate(() => { const h = document.getElementById("hint"), lay = document.getElementById("toEntry"); const lh = parseFloat(getComputedStyle(h).lineHeight); return { text: h.textContent, w: h.getBoundingClientRect().width, lines: Math.round(h.getBoundingClientRect().height / lh), below: lay.getBoundingClientRect().top >= h.getBoundingClientRect().bottom - 1, right: Math.abs(lay.getBoundingClientRect().right - document.getElementById("hintRow").getBoundingClientRect().right) <= 1 }; });
    assert.match(r.text, /Cell 1 has no word yet/);
    assert.ok(r.w > 250 && r.lines <= 2 && r.below && r.right, "提示句占满一行、最多两行，两个入口在下一行靠右：" + JSON.stringify(r));
    assert.deepEqual(errors, []);
    await context.close();
    const fr = await open("zh-CN", 375, { v: 2, lang: "fr", word: "MER", filler: "", view: "single", titleRuns: null, picks: [["mer", ""], null, null], glosses: ["", "", ""], glossAuto: [true, true, true], captions: ["", "", ""], keys: [0, 0, 0] });
    await fr.page.waitForFunction(() => document.getElementById("pagerLetters").children.length === 3, null, { timeout: 8000 });
    await fr.page.evaluate(() => document.querySelectorAll("#pagerLetters button")[0].click());
    await fr.page.waitForSelector("#mirror .b-gloss", { timeout: 15000 });
    assert.deepEqual(await fr.page.evaluate(() => ["#mirror .b-gloss", "#mirror .b-caption-ph"].map(q => getComputedStyle(document.querySelector(q)).borderBottomStyle)), ["dashed", "dashed"], "编辑面的释义与配文占位字带虚线");
    assert.deepEqual(fr.errors, []);
    await fr.context.close();
  }
  // 真机第一轮 D6（用户 11-21 定本版做）：英语的专业、历史文化词在英文界面也给英文，卡面填短写、按钮是完整英文；英语常用词照旧留空
  {
    const saved = { ...LIFE, lang: "en", word: "EL", picks: [["entropy", ""], ["love", ""]], glosses: ["", ""], glossAuto: [true, true], captions: ["", ""], keys: [0, 0] };
    const { context, page, errors } = await open("en-US", 360, saved);
    await page.locator("#pagerLetters button").nth(0).click();
    await page.waitForFunction(() => document.querySelector("#mirror .b-gloss")?.textContent === "measure of disorder", null, { timeout: 8000 });
    await page.locator("#glossCtl").focus();
    await page.waitForSelector("#senseList .sense-row .sense");
    assert.deepEqual(await page.locator("#senseList .sense-row .sense").allTextContents(), ["measure of disorder (physics)"], "entropy 的义项按钮是完整英文");
    await page.locator("#pagerLetters button").nth(1).click();
    await page.waitForTimeout(300);
    assert.equal(await page.evaluate(() => (document.querySelector("#mirror .b-gloss") || {}).textContent || ""), "", "英语常用词 love 卡面仍留空");
    assert.deepEqual(errors, []);
    await context.close();
  }
  {
    const saved = { ...LIFE, lang: "fr", langs: ["fr"], word: "JEU", picks: [["jouer", ""], null, null], glosses: ["", "", ""], glossAuto: [true, true, true], captions: ["", "", ""], keys: [0, 0, 0] };
    const { context, page, errors } = await open("en-US", 360, saved);
    await page.locator("#pagerLetters button").first().click();
    const pairs = [
      ["to play (produce music from a musical instrument)", "to play music"],
      ["to play (a role)", "to play a role"],
    ];
    for (const [full, short] of pairs) {
      await page.locator("#glossCtl").focus();
      await page.getByRole("button", { name: full, exact: true }).click();
      assert.equal(await page.locator("#mirror .b-gloss").textContent(), short, full);
    }
    assert.deepEqual(errors, []);
    await context.close();
  }
  {
    const FRL = { v: 2, lang: "fr", langs: ["fr"], word: "LOI", filler: "", view: "single", titleRuns: null, picks: [["livre", ""], null, null], glosses: ["", "", ""], glossAuto: [true, true, true], captions: ["", "", ""], keys: [0, 0, 0] };
    const han = /[㐀-鿿]/;
    const { context, page, errors } = await open("en-US", 360, FRL);
    await page.waitForFunction(() => document.getElementById("pagerLetters").children.length === 3, null, { timeout: 8000 });
    await page.evaluate(() => document.querySelectorAll("#pagerLetters button")[0].click());
    await page.waitForFunction(() => ((document.querySelector("#mirror .b-gloss") || {}).textContent || "") === "book", null, { timeout: 15000 }); // 自动释义：livre 的默认义项「书」→ book
    let r = await page.evaluate(scan); assert.deepEqual(r.left, [], "法语草稿的编辑面没有中文"); assert.ok(r.wide <= 0);
    // 义项栏：按钮是完整英文，亮着的是卡上那一个；没有中文
    await page.evaluate(() => document.getElementById("glossCtl").focus());
    await page.waitForSelector("#senseList .sense-row:not(.art-row) .sense", { timeout: 8000 });
    const senses = await page.evaluate(() => Array.from(document.querySelectorAll("#senseList .sense-row:not(.art-row) .sense"), b => b.textContent + (b.getAttribute("aria-pressed") === "true" ? "*" : "")));
    assert.ok(senses.includes("book*") && senses.some(s => /pound/.test(s)) && !senses.some(s => han.test(s)), "义项栏是英文：" + senses.join(" | "));
    assert.ok(!han.test(await page.evaluate(() => Array.from(document.querySelectorAll("#senseList [aria-label]"), e => e.getAttribute("aria-label")).join(""))), "义项栏读屏名没有中文");
    await page.locator("#senseList .sense", { hasText: /pound/ }).first().click(); await page.waitForTimeout(300);
    assert.equal(await page.evaluate(() => document.querySelector("#mirror .b-gloss").textContent), "pound", "点义项填英文短写");
    // 候选栏：外语的词第二行是英文
    await page.evaluate(() => document.querySelectorAll("#pagerLetters button")[1].click()); await type(page, "wordCtl", "o");
    await page.waitForSelector("#candList .cand-it", { timeout: 8000 });
    const g = await page.evaluate(() => Array.from(document.querySelectorAll("#candList .cand-g"), e => e.textContent));
    assert.ok(g.length && g.every(t => !han.test(t)) && g.some(t => /[a-z]{3}/.test(t)), "候选栏第二行是英文：" + g.slice(0, 3).join(" | "));
    r = await page.evaluate(scan); assert.deepEqual(r.left, [], "候选栏没有中文"); assert.ok(r.wide <= 0, "候选栏不横滚");
    // 开关加进来的词标 Tec / HisCul
    await page.evaluate(() => document.querySelectorAll("#pagerLetters button")[0].click()); await type(page, "wordCtl", "l");
    await page.waitForSelector("#candList .cand-it", { timeout: 8000 }); await click(page, "candMore"); await page.waitForTimeout(300);
    const tags = await page.evaluate(() => Array.from(document.querySelectorAll("#candList .cand-tag"), e => e.textContent));
    assert.ok(tags.length && tags.every(t => /^(Tec|HisCul) · $/.test(t)), "类别标注是 Tec / HisCul：" + tags.join(" | "));
    assert.equal(await page.locator("#candMore .cand-more-t").textContent(), "Tec & HisCul");
    await type(page, "wordCtl", "livre"); await page.waitForTimeout(300);
    // 入场页：单词框下一行与预设都是英文
    await click(page, "toEntry"); await page.waitForTimeout(400);
    const sense = await page.locator("#wordSense").textContent();
    assert.ok(/^LOI: \S/.test(sense) && !han.test(sense), "入场页那一行是英文：" + sense);
    const presets = await page.evaluate(() => Array.from(document.querySelectorAll("#presets .preset"), b => b.textContent));
    assert.ok(presets.length && presets.every(t => !han.test(t)), "预设没有中文：" + presets.join(" | "));
    assert.deepEqual(errors, []);
    // 英文界面写下的自动释义，回到中文界面换成中文
    const saved = await page.evaluate(k => localStorage.getItem(k), KEY);
    await context.close();
    const back = JSON.parse(saved); back.glosses[0] = "book"; back.glossAuto[0] = true; back.picks[0] = ["livre", ""];
    const zh = await open("zh-CN", 360, back);
    await zh.page.waitForFunction(() => document.getElementById("pagerLetters").children.length === 3, null, { timeout: 8000 });
    await zh.page.evaluate(() => document.querySelectorAll("#pagerLetters button")[0].click());
    await zh.page.waitForFunction(() => ((document.querySelector("#mirror .b-gloss") || {}).textContent || "") === "书", null, { timeout: 15000 });
    assert.deepEqual(zh.errors, []);
    await zh.context.close();
    // 英语的词：候选只标词性，卡面自动释义留空，入场页那行写词性
    const enw = await open("en-US", 360, { ...LIFE, glosses: ["", "", "", ""], glossAuto: [true, true, true, true] });
    await enw.page.waitForFunction(() => document.getElementById("pagerLetters").children.length === 4, null, { timeout: 8000 });
    await enw.page.evaluate(() => document.querySelectorAll("#pagerLetters button")[0].click()); await enw.page.waitForTimeout(500);
    assert.equal(await enw.page.evaluate(() => (document.querySelector("#mirror .b-gloss") || {}).textContent || ""), "", "英语的词卡面释义留空（空的不画这一行）");
    await enw.page.evaluate(() => document.getElementById("glossCtl").focus()); await enw.page.waitForTimeout(400);
    assert.equal(await enw.page.locator("#senseList .sense").count(), 0, "英语的词没有义项按钮");
    await type(enw.page, "wordCtl", "l"); await enw.page.waitForSelector("#candList .cand-it", { timeout: 8000 });
    const eg = await enw.page.evaluate(() => Array.from(document.querySelectorAll("#candList .cand-g"), e => e.textContent));
    assert.ok(eg.every(t => /^[a-z. ;]*$/.test(t)), "英语的词候选只有词性缩写：" + eg.slice(0, 4).join(" | "));
    await type(enw.page, "wordCtl", "love"); await enw.page.waitForTimeout(300);
    await click(enw.page, "toEntry"); await enw.page.waitForTimeout(400);
    assert.match(await enw.page.locator("#wordSense").textContent(), /^LIFE: [a-z.]+(, [a-z.]+)*$/, "英语的词入场页写词性");
    assert.deepEqual(enw.errors, []);
    await enw.context.close();
  }
  console.log("ui language regressions ok");
} finally {
  if (browser) await browser.close();
  server.close();
}
