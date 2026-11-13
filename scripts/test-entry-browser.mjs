// 可选浏览器回归（第 4 批：T18 入场界面 + T02 / T08 / T09 + 只改文字不重画照片）：使用现有 Playwright，不安装依赖；新端口、新上下文，绝不操作用户预览存储。
// PLAYWRIGHT_MODULE=/absolute/path/to/playwright CHROMIUM_PATH=/path/to/chromium node scripts/test-entry-browser.mjs
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
const root = fileURLToPath(new URL("../app/", import.meta.url));
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
const LIFE = { v: 2, word: "LIFE", filler: "小满", view: "single", titleRuns: null,
  picks: [["love", ""], ["ice", ""], ["fire", ""], ["echo", ""]], glosses: ["爱", "冰", "火", "回声"], glossAuto: [false, false, false, false],
  captions: ["一段配文", "冰的配文", "", "回声配文"], keys: [0, 0, 0, 0] };
let browser;
const word = (raw) => JSON.parse(raw).word;
try {
  browser = await chromium.launch({ headless: true, ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}) });
  // draft：植入的草稿（null = 没有草稿）；slowRead：端存储读取延迟毫秒（模拟慢读取，T14）；width：视口宽；tipSeen：首次提示是否已看过
  async function pageFor({ draft = null, slowRead = 0, width = 375, height = 812, tipSeen = true, init = "", phraseDelay = 0 } = {}) {
    const context = await browser.newContext({ viewport: { width, height } });
    if (phraseDelay) await context.route("**/assets/lang/en/phrases.js", async (r) => { await new Promise((ok) => setTimeout(ok, phraseDelay)); await r.continue(); }); // 模拟慢加载
    if (init) await context.addInitScript({ content: init });
    await context.addInitScript(({ draft, slowRead, KEY, tipSeen }) => {
      if (!sessionStorage.getItem("seeded")) {
        if (draft) localStorage.setItem(KEY, JSON.stringify({ ...draft, t: Date.now() - 5000 }));
        if (tipSeen) localStorage.setItem("backronym-tip-seen", "1");
        sessionStorage.setItem("seeded", "1");
      }
      if (slowRead) window.xhs = { miniTool: {
        getStorage: ({ key }) => new Promise(ok => setTimeout(() => ok({ data: null }), slowRead)),
        setStorage: async () => {}, removeStorage: async () => {},
      } };
      // 数照片画了几次：只数从原图（img / ImageBitmap 等非画布源）画出的 drawImage
      window.photoDraws = 0;
      const real = CanvasRenderingContext2D.prototype.drawImage;
      CanvasRenderingContext2D.prototype.drawImage = function (src) { if (!(src instanceof HTMLCanvasElement)) window.photoDraws++; return real.apply(this, arguments); };
    }, { draft, slowRead, KEY, tipSeen });
    const page = await context.newPage(); const errors = [];
    page.on("pageerror", e => errors.push(e.message));
    await page.goto(url);
    if (!slowRead) await page.waitForFunction(() => !document.getElementById("wordInput").disabled);
    return { page, context, errors };
  }
  const visible = (page, sel) => page.locator(sel).isVisible();
  // T30：改词页的「返回」——有修改时会向下展开确认，选「保存并返回」（= 原来的「返回即应用」）
  const backSave = async (page) => { await page.locator("#entryBack").click(); if (await page.locator("#leavePop").isVisible()) await page.locator("#leaveSave").click(); };
  const stored = (page) => page.evaluate(k => localStorage.getItem(k), KEY);
  // 保存有约 400ms 防抖：等主键里出现满足条件的稿
  const savedWhere = (page, fn) => page.waitForFunction(([k, src]) => { try { return new Function("d", "return " + src)(JSON.parse(localStorage.getItem(k))); } catch (e) { return false; } }, [KEY, fn]);
  const png = (page) => page.evaluate(() => { const c = document.createElement("canvas"); c.width = 64; c.height = 48; const x = c.getContext("2d"); x.fillStyle = "#c33"; x.fillRect(0, 0, 64, 48); return c.toDataURL("image/png").split(",")[1]; }).then(b => Buffer.from(b, "base64"));
  async function addPhoto(page, i, buffer) { // 给第 i 格配图（经配图面板的真实选图流程）
    await page.evaluate(i => document.getElementById("pl-" + i).click(), i);
    await page.locator("#plateHit").click();
    await page.locator("#cellPhoto").setInputFiles({ name: "a.png", mimeType: "image/png", buffer });
    await page.waitForFunction(() => !document.getElementById("cropper").hidden); await page.locator("#cropApply").click(); // T44：选图先进取景，应用才落入作品
    await page.waitForFunction(() => !document.getElementById("imgAdjust").hidden && document.querySelector("#mirror canvas"));
    await page.locator("#imgClose").click();
  }
  async function setZoom(page, i, z) { // 调第 i 格的取景缩放
    await page.evaluate(i => document.getElementById("pl-" + i).click(), i);
    await page.locator("#plateHit").click(); await page.locator("#imgAdjust").click();
    await page.locator("#cropZoom").fill(String(z)); await page.locator("#cropApply").click(); await page.locator("#imgClose").click();
  }

  // 1 首次进入（无草稿）：入场界面、读屏名、6 个不重复的预设、没有返回箭头；只用键盘完成：输入 → 填表人 → 回车进编辑界面，焦点在第 1 格的词
  {
    const { page, context, errors } = await pageFor();
    assert.equal(await visible(page, "#entry"), true); assert.equal(await visible(page, "#card"), false, "入场时卡不显示");
    assert.equal(await visible(page, "#entryBack"), false, "首次进入没有返回箭头");
    assert.equal(await page.evaluate(() => document.activeElement.id), "wordInput", "光标在单词框");
    const presets = await page.locator("#presets button").allTextContents();
    assert.equal(presets.length, 6); assert.equal(new Set(presets).size, 6, "预设互不重复");
    // 2026-11-12：按钮固定两行，上原词、下释义（不写连字符），读屏名「原词，释义」；同一屏按钮一样高。
    const pairs = await page.locator("#presets button").evaluateAll(bs => bs.map(b => [b.querySelector("b").textContent, b.querySelector("span").textContent, Math.round(b.getBoundingClientRect().height), b.querySelector("span").getBoundingClientRect().top >= b.querySelector("b").getBoundingClientRect().bottom - 1]));
    for (const [w0, g0, , below] of pairs) { assert.ok(/^[A-Z]+$/.test(w0) && /^[一-鿿]{1,6}$/.test(g0), "预设按钮：原词与释义 " + w0 + " " + g0); assert.ok(below, "释义在原词下面一行：" + w0); }
    assert.equal(new Set(pairs.map(p => p[2])).size, 1, "预设按钮一样高"); assert.ok(pairs[0][2] >= 44);
    assert.ok(await page.getByRole("button", { name: pairs[0][0] + "，" + pairs[0][1], exact: true }).isVisible(), "预设按钮读屏名是「原词，释义」");
    assert.ok(await page.getByRole("textbox", { name: "单词" }).isVisible()); assert.ok(await page.getByRole("textbox", { name: "填表人（选填）" }).isVisible());
    assert.ok(await page.getByRole("button", { name: "开始填充" }).isVisible());
    await page.keyboard.press("Enter");
    assert.match(await page.locator("#wordErr").innerText(), /先输入一个单词/, "空单词：就地说明");
    assert.equal(await page.locator("#wordInput").getAttribute("aria-invalid"), "true");
    await page.keyboard.type("li fe!");
    assert.equal(await page.locator("#wordInput").inputValue(), "LIFE", "只收 A–Z 与数字、转大写（T41 起数字保留，标点照旧丢掉）");
    assert.equal(await page.locator("#wordErr").innerText(), "", "改了就清空说明（错误行常驻占位，T28）"); assert.equal(await page.locator("#wordInput").getAttribute("aria-invalid"), null);
    let guard = 0;
    while (await page.evaluate(() => document.activeElement.id) !== "fillerCtl" && guard++ < 12) await page.keyboard.press("Tab"); // 经过预设组到填表人
    assert.equal(await page.evaluate(() => document.activeElement.id), "fillerCtl", "Tab 可达填表人");
    await page.keyboard.type("小满"); await page.keyboard.press("Enter");
    await page.waitForFunction(() => document.getElementById("entry").hidden);
    assert.equal(await page.evaluate(() => document.activeElement.id), "wordCtl", "焦点交给第 1 格的词");
    await savedWhere(page, "d.word === 'LIFE'");
    assert.equal(word(await stored(page)), "LIFE"); assert.equal(JSON.parse(await stored(page)).filler, "小满");
    assert.match(await page.locator("#mirror").innerText(), /填表人 小满/, "卡顶填表人只显示（镜像画出）");
    assert.deepEqual(errors, []); await context.close();
  }
  // 2 有草稿直接进编辑界面；「改单词 / 填表人」→ 入场界面（返回箭头、预填）；屏蔽词留在本页、原稿不变；返回箭头应用并保存
  {
    const { page, context, errors } = await pageFor({ draft: LIFE });
    assert.equal(await visible(page, "#entry"), false, "有草稿直接进编辑界面"); assert.equal(await visible(page, "#card"), true);
    assert.equal(await page.locator("#pageNo").count(), 0, "字母栏不再重复页码");
    const before = await stored(page);
    await page.getByRole("button", { name: "改单词 / 填表人" }).click();
    assert.ok(await page.getByRole("button", { name: "返回编辑界面" }).isVisible(), "返回箭头的读屏名");
    assert.equal(await page.locator("#wordInput").inputValue(), "LIFE"); assert.equal(await page.locator("#fillerCtl").inputValue(), "小满", "预先填好");
    assert.equal(await visible(page, "#entryStart"), false, "从编辑界面进来没有主按钮");
    await page.locator("#wordInput").fill("SEX"); await backSave(page);
    assert.match(await page.locator("#wordErr").innerText(), /^填入内容不适合发布，换一个吧$/, "屏蔽词就地说明"); assert.doesNotMatch(await page.locator("#wordErr").innerText(), /SEX/i, "不复述被拦的词");
    assert.equal(await visible(page, "#entry"), true, "留在入场界面"); assert.equal(await stored(page), before, "原草稿不变");
    await page.locator("#wordInput").fill("LIFE"); await page.locator("#fillerCtl").fill("加微信"); await backSave(page);
    assert.match(await page.locator("#fillerErr").innerText(), /^填入内容不适合发布，换一个吧$/, "填表人也查"); assert.equal(await stored(page), before);
    assert.equal(await page.evaluate(() => document.activeElement.id), "fillerCtl", "焦点回到出错字段");
    await page.locator("#fillerCtl").fill("大寒"); await backSave(page);
    await page.waitForFunction(() => document.getElementById("entry").hidden);
    await savedWhere(page, "d.filler === '大寒'");
    assert.equal(JSON.parse(await stored(page)).filler, "大寒", "保存并返回：写入后才回编辑页"); assert.equal(word(await stored(page)), "LIFE");
    assert.equal(await page.evaluate(() => document.activeElement.id), "toEntry", "返回后焦点回入口");
    assert.deepEqual(errors, []); await context.close();
  }
  // 3 LIFE → LOVE：先确认（列出 I、F 两格，初始焦点在「保留 LIFE」）；保留不改；确认后 L、E 保留词 / 配文 / 本次会话的配图与取景，I、F 清空
  {
    const { page, context, errors } = await pageFor({ draft: LIFE });
    const buffer = await png(page);
    await addPhoto(page, 0, buffer); await addPhoto(page, 3, buffer); await setZoom(page, 3, 2);
    // T45：配图存好、草稿引用它们之后再记原稿（存图是异步的，存好会再写一次草稿）
    await page.waitForFunction(() => { try { const d = JSON.parse(localStorage.getItem("backronym-draft-v2")); return /草稿和配图已保存/.test(document.getElementById("draftStatus").textContent) && d.crops[3].z === 2; } catch (e) { return false; } });
    const before = await stored(page);
    await page.locator("#toEntry").click(); await page.locator("#wordInput").fill("LOVE"); await backSave(page);
    assert.equal(await visible(page, "#wordConfirm"), true, "会清空已填格：先确认");
    assert.equal(await page.evaluate(() => document.activeElement.id), "confKeep", "初始焦点在安全选项");
    assert.match(await page.locator("#confTitle").innerText(), /改成 LOVE 会清空以下 2 格，不可撤销/); assert.match(await page.locator("#confKeep").innerText(), /保留 LIFE/);
    assert.match(await page.locator("#confList").innerText(), /I[\s\S]*Ice[\s\S]*F[\s\S]*Fire/, "列出要清空的格");
    await page.keyboard.press("Escape"); // Esc = 保留
    assert.equal(await visible(page, "#wordConfirm"), false); assert.equal(await page.locator("#wordInput").inputValue(), "LIFE", "保留：单词框回到原单词");
    assert.equal(await stored(page), before, "保留：原稿不变");
    await page.locator("#wordInput").fill("LOVE"); await backSave(page); await page.locator("#confClear").click();
    await page.waitForFunction(() => document.getElementById("entry").hidden);
    await savedWhere(page, "d.word === 'LOVE'");
    const d = JSON.parse(await stored(page));
    assert.equal(d.word, "LOVE"); assert.deepEqual(d.picks.map(p => p && p[0]), ["love", null, null, "echo"], "L、E 保留词，O、V 清空");
    assert.deepEqual(d.captions, ["一段配文", "", "", "回声配文"], "配文同理");
    const imgs = await page.evaluate(() => [0, 1, 3].map(i => { document.getElementById("pl-" + i).click(); return !!document.querySelector("#mirror canvas"); }));
    assert.deepEqual(imgs, [true, false, true], "本次会话的配图仍在 L、E，被清空的 O 格没有");
    await page.evaluate(() => document.getElementById("pl-3").click()); await page.locator("#plateHit").click(); await page.locator("#imgAdjust").click();
    assert.equal(await page.locator("#cropZoom").inputValue(), "2", "E 格的取景仍在"); await page.locator("#cropCancel").click(); await page.locator("#imgClose").click();
    assert.deepEqual(errors, []); await context.close();
  }
  // 3b Astra 第 4 批验收 P2：只调过默认图取景、没填词的格也要先确认；取消保留单词与缩放，确认后才清空变化位置，同位置字母没变的取景保留；完全没动过的空格直接通过
  {
    const EMPTY = { v: 2, word: "LIFE", filler: "", view: "single", titleRuns: null, picks: [null, null, null, null], glosses: ["", "", "", ""], glossAuto: [true, true, true, true], captions: ["", "", "", ""], keys: [0, 0, 0, 0] };
    const { page, context, errors } = await pageFor({ draft: EMPTY });
    await page.locator("#toEntry").click(); await page.locator("#wordInput").fill("LIFT"); await backSave(page);
    assert.equal(await visible(page, "#wordConfirm"), false, "完全没动过的空格：直接通过");
    await page.waitForFunction(() => document.getElementById("entry").hidden);
    await page.locator("#toEntry").click(); await page.locator("#wordInput").fill("LIFE"); await backSave(page);
    await page.waitForFunction(() => document.getElementById("entry").hidden);
    // 默认图（所有没单独配图的格共用），I 格缩放 2 倍、L 格缩放 1.5 倍
    await page.locator("#plateHit").click(); await page.locator("#photo").setInputFiles({ name: "d.png", mimeType: "image/png", buffer: await png(page) });
    await page.waitForFunction(() => !document.getElementById("cropper").hidden); await page.locator("#cropApply").click(); // T44
    await page.waitForFunction(() => document.querySelector("#mirror canvas")); await page.locator("#imgClose").click();
    const zoomOf = async (i) => { await page.evaluate(i => document.getElementById("pl-" + i).click(), i); await page.locator("#plateHit").click(); await page.locator("#imgAdjust").click(); const z = await page.locator("#cropZoom").inputValue(); await page.locator("#cropCancel").click(); await page.locator("#imgClose").click(); return z; };
    await setZoom(page, 1, 2); await setZoom(page, 0, 1.5);
    await page.locator("#toEntry").click(); await page.locator("#wordInput").fill("LOVE"); await backSave(page);
    assert.equal(await visible(page, "#wordConfirm"), true, "只调过取景的格：先确认");
    assert.match(await page.locator("#confList").innerText(), /I[\s\S]*取景/, "列出「取景」");
    await page.locator("#confKeep").click(); await backSave(page); // 保留后单词框回到 LIFE，再返回
    await page.waitForFunction(() => document.getElementById("entry").hidden);
    assert.equal(await page.locator("#pagerLetters").innerText().then(t => t.replace(/\s/g, "")), "LIFE", "取消：保留原单词");
    assert.equal(await zoomOf(1), "2", "取消：I 格缩放仍是 2 倍");
    await page.locator("#toEntry").click(); await page.locator("#wordInput").fill("LOVE"); await backSave(page); await page.locator("#confClear").click();
    await page.waitForFunction(() => document.getElementById("entry").hidden);
    assert.equal(await zoomOf(1), "1", "确认后：变了字母的 O 格取景清空");
    assert.equal(await zoomOf(0), "1.5", "同位置字母没变的 L 格取景保留");
    assert.deepEqual(errors, []); await context.close();
  }
  // 3c Astra 第 4 批复验：空单词、但有填表人与标题的草稿 → 恢复后留在入场界面，填表人已预填；只输入单词提交，标题与填表人都保留
  {
    const NOWORD = { v: 2, word: "", filler: "作者", view: "single", titleRuns: [{ t: "我的标题", b: true }], picks: [], glosses: [], glossAuto: [], captions: [], keys: [] };
    const { page, context, errors } = await pageFor({ draft: NOWORD });
    assert.equal(await visible(page, "#entry"), true, "没有单词：留在入场界面");
    assert.equal(await page.locator("#fillerCtl").inputValue(), "作者", "恢复的填表人已在输入框里");
    await page.locator("#wordInput").fill("LIFE"); await page.locator("#entryStart").click();
    await page.waitForFunction(() => document.getElementById("entry").hidden);
    await savedWhere(page, "d.word === 'LIFE'");
    const d = JSON.parse(await stored(page));
    assert.equal(d.filler, "作者", "填表人没被清掉"); assert.equal(d.titleRuns && d.titleRuns.map(r => r.t).join(""), "我的标题", "标题保留");
    assert.deepEqual(errors, []); await context.close();
  }
  // 4 输入到一半关闭：入场界面里改了没应用就刷新 → 恢复上次有效草稿，直接进编辑界面
  {
    const { page, context, errors } = await pageFor({ draft: LIFE });
    await page.locator("#toEntry").click(); await page.locator("#wordInput").fill("XYZ"); await page.locator("#fillerCtl").fill("某某");
    await page.reload(); await page.waitForFunction(() => !document.getElementById("wordInput").disabled);
    assert.equal(await visible(page, "#entry"), false); assert.equal(word(await stored(page)), "LIFE"); assert.equal(JSON.parse(await stored(page)).filler, "小满");
    assert.deepEqual(errors, []); await context.close();
  }
  // 5 慢读取（T14 补测）：读取期间点预设、点「开始填充」都不改作品、不写盘；读完后才可用
  {
    const { page, context, errors } = await pageFor({ slowRead: 2500 });
    await page.waitForSelector("#presets button");
    assert.equal(await page.locator("#wordInput").isDisabled(), true, "读取期间单词框禁用");
    await page.locator("#presets button").first().click({ force: true }); await page.locator("#entryStart").click({ force: true });
    assert.equal(await page.locator("#wordInput").inputValue(), "", "点预设被拦"); assert.equal(await visible(page, "#entry"), true, "没进编辑界面");
    assert.equal(await stored(page), null, "没写盘");
    await page.waitForFunction(() => !document.getElementById("wordInput").disabled, null, { timeout: 8000 });
    await page.locator("#presets button").first().click();
    assert.notEqual(await page.locator("#wordInput").inputValue(), "", "读完后预设可用");
    assert.deepEqual(errors, []); await context.close();
  }
  // 6 T02：义项栏打开时配文不可见、不可点；收起后恢复。资源审查：只改配文时照片重画 0 次，改取景要重画
  {
    const { page, context, errors } = await pageFor({ draft: LIFE });
    await addPhoto(page, 0, await png(page));
    await page.locator("#glossCtl").focus();
    assert.equal(await visible(page, "#senseList"), true, "义项栏打开");
    assert.equal(await page.locator("#capCtl").evaluate(n => getComputedStyle(n).visibility), "hidden", "配文框不可见不可点");
    assert.equal(await page.locator("#mirror .b-caption").evaluate(n => getComputedStyle(n).visibility), "hidden", "配文镜像隐藏");
    await page.locator("#glossCtl").blur(); await page.waitForTimeout(100);
    assert.equal(await page.locator("#capCtl").evaluate(n => getComputedStyle(n).visibility), "visible", "栏收起后恢复");
    const draws0 = await page.evaluate(() => window.photoDraws);
    await page.locator("#capCtl").focus(); await page.keyboard.type("新的配文"); await page.waitForTimeout(200);
    assert.equal(await page.evaluate(() => window.photoDraws), draws0, "只改配文：照片重画 0 次");
    await setZoom(page, 0, 1.5);
    assert.ok(await page.evaluate(() => window.photoDraws) > draws0, "改取景后重画");
    assert.deepEqual(errors, []); await context.close();
  }
  // 7 T08：焦点在标题框时键盘上方一行出现，页面底部留出等高空白，滚到底能完整看到草稿状态行
  {
    const { page, context, errors } = await pageFor({ draft: LIFE, height: 560 }); // 矮视口：页面要滚，草稿状态行才会落到键盘上方一行的位置
    await page.locator("#title").focus();
    assert.equal(await visible(page, "#kbRow"), true);
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight)); await page.waitForTimeout(100);
    const r = await page.evaluate(() => ({ status: document.getElementById("draftStatus").getBoundingClientRect().bottom, kb: document.getElementById("kbRow").getBoundingClientRect().top }));
    assert.ok(r.status <= r.kb, "草稿状态行不被键盘上方一行盖住：" + JSON.stringify(r));
    assert.deepEqual(errors, []); await context.close();
  }
  // 8 T49：首次进入不再有墨底提示与卡上五个虚框；320 宽候选栏照常打开，提示行只写「还差 N 格」
  {
    const { page, context, errors } = await pageFor({ width: 320, tipSeen: false });
    await page.locator("#wordInput").fill("LIFE"); await page.locator("#entryStart").click();
    await page.waitForFunction(() => document.getElementById("entry").hidden);
    assert.equal(await page.locator("#tip").count(), 0, "没有首次提示"); assert.equal(await page.locator("#mirror .tap").count(), 0, "没有可点虚框");
    assert.equal(await page.locator("#hint").innerText(), "还差 4 格", "提示行只留下一步");
    await page.locator("#wordCtl").pressSequentially("lo"); await page.waitForTimeout(100);
    assert.equal(await visible(page, "#cand"), true);
    assert.match(await page.locator("#candLab").innerText(), /^以 L 开头 · 1 \/ \d+ 批$/, "候选标签只留首字母与批次");
    await page.locator("#wordCtl").fill(""); await page.waitForTimeout(50);
    assert.equal(await page.locator("#candLab").innerText(), "以 L 开头", "词框空着：不再说「打几个字母…」");
    assert.equal(await page.locator("#hint").innerText(), "还差 4 格");
    await page.locator("#wordCtl").fill("ice"); await page.waitForTimeout(50);
    assert.equal(await page.locator("#hint").innerText(), "还差 4 格", "首字母不对的格也算在「还差」里");
    assert.deepEqual(errors, []); await context.close();
  }
  // 9 T30：改词页保存按钮（无修改不可用 / 有修改 / 保存后留本页 + Toast）、返回三选一（Esc、点外面、放弃、保存并返回）、焦点归还
  {
    const { page, context, errors } = await pageFor({ draft: LIFE });
    await page.locator("#toEntry").click();
    const save = page.locator("#entrySave");
    assert.equal(await save.getAttribute("aria-disabled"), "true", "无修改：保存不可用"); assert.equal(await save.innerText(), "保存");
    assert.equal(await page.locator("#entryNote").innerText(), "", "改词页不再写「返回时自动保存」");
    await page.locator("#entryBack").click();
    assert.equal(await visible(page, "#entry"), false, "无修改：返回直接回编辑页"); assert.equal(await page.evaluate(() => document.activeElement.id), "toEntry");
    await page.locator("#toEntry").click(); await page.locator("#fillerCtl").fill("大寒");
    assert.equal(await save.getAttribute("aria-disabled"), "false", "有修改：保存可点");
    await save.click();
    await page.waitForFunction(() => document.getElementById("toast").textContent === "已保存");
    assert.equal(await visible(page, "#entry"), true, "保存后留在本页");
    const tb = await page.evaluate(() => ({ t: document.getElementById("toast").getBoundingClientRect().top, h: document.getElementById("entryTitle").getBoundingClientRect().bottom }));
    assert.ok(tb.t >= tb.h, "「已保存」在页面标题下方：" + JSON.stringify(tb));
    assert.equal(await save.getAttribute("aria-disabled"), "true", "保存后回到不可用");
    assert.equal(JSON.parse(await stored(page)).filler, "大寒", "已写进本设备");
    // 有修改点返回：向下展开，初始焦点在「继续编辑」；Esc 收起，焦点回上次的输入框
    await page.locator("#wordInput").fill("LOVE");
    await page.locator("#entryBack").click();
    assert.equal(await visible(page, "#leavePop"), true, "有修改：返回先问");
    assert.equal(await page.locator("#leavePop").getAttribute("role"), "alertdialog"); assert.equal(await page.locator("#entryBack").getAttribute("aria-expanded"), "true");
    assert.equal(await page.evaluate(() => document.activeElement.id), "leaveStay", "初始焦点在「继续编辑」");
    assert.match(await page.locator("#leaveDiff").innerText(), /单词 LIFE → LOVE[\s\S]*填表人 大寒（未改）/, "列出改了什么");
    const pop = await page.evaluate(() => ({ p: document.getElementById("leavePop").getBoundingClientRect().top, b: document.getElementById("entryBack").getBoundingClientRect().bottom }));
    assert.ok(pop.p >= pop.b - 1, "从返回按钮向下展开");
    const look = await page.evaluate(() => { const cs = id => getComputedStyle(document.getElementById(id)); return { solid: cs("leaveSave").backgroundColor, ink: cs("entryTitle").color, edge: cs("leaveDrop").borderTopWidth }; });
    assert.equal(look.solid, look.ink, "「保存并返回」是实心墨底（U2），不被顶栏按钮样式冲掉"); assert.notEqual(look.edge, "0px", "其余两项有描边");
    await page.keyboard.press("Escape");
    assert.equal(await visible(page, "#leavePop"), false); assert.equal(await page.evaluate(() => document.activeElement.id), "wordInput", "Esc = 继续编辑，焦点回单词框");
    await page.locator("#entryBack").click(); await page.mouse.click(4, 800); // 页面最下方的空白
    assert.equal(await visible(page, "#leavePop"), false, "点弹层外 = 继续编辑"); assert.equal(await visible(page, "#entry"), true);
    // 放弃修改：单词回到作品当前值后返回，原稿不变
    const before = await stored(page);
    await page.locator("#entryBack").click(); await page.locator("#leaveDrop").click();
    assert.equal(await visible(page, "#entry"), false, "放弃：回编辑页"); assert.equal(await stored(page), before, "放弃：原稿不变");
    assert.equal(await page.locator("#pagerLetters").innerText().then(t => t.replace(/\s/g, "")), "LIFE");
    // 保存并返回 + 清空确认联动：确认后才保存，写入后才返回
    await page.locator("#toEntry").click(); await page.locator("#wordInput").fill("LOVE");
    await page.locator("#entryBack").click(); await page.locator("#leaveSave").click();
    assert.equal(await visible(page, "#wordConfirm"), true, "会清空已填格：照旧先确认");
    await page.locator("#confClear").click();
    await page.waitForFunction(() => document.getElementById("entry").hidden);
    assert.equal(word(await stored(page)), "LOVE", "确认后保存并返回");
    // 键盘：改词页回车 = 保存并返回
    await page.locator("#toEntry").click(); await page.locator("#fillerCtl").fill("立春"); await page.keyboard.press("Enter");
    await page.waitForFunction(() => document.getElementById("entry").hidden);
    assert.equal(JSON.parse(await stored(page)).filler, "立春", "回车：保存并返回");
    assert.deepEqual(errors, []); await context.close();
  }
  // 10 T30：写入失败 → 修改保留、「重试保存」、页内说明；校验失败的「保存并返回」留在本页；修复后重试成功
  {
    const FAIL = "(() => { const real = Storage.prototype.setItem; Storage.prototype.setItem = function (k, v) { if (k === 'backronym-draft-v2' && window.__failLocal) throw new Error('quota'); return real.call(this, k, v); }; })();";
    const { page, context, errors } = await pageFor({ draft: LIFE, init: FAIL });
    await page.locator("#toEntry").click(); await page.locator("#fillerCtl").fill("大寒");
    await page.evaluate(() => { window.__failLocal = true; });
    await page.locator("#entrySave").click();
    await page.waitForFunction(() => document.getElementById("entrySave").textContent === "重试保存");
    assert.match(await page.locator("#entrySaveMsg").innerText(), /没能保存到本设备，你的修改还在/, "页内说明原因与下一步");
    assert.equal(await page.locator("#entrySaveMsg").getAttribute("role"), "alert");
    assert.equal(await page.locator("#entrySave").getAttribute("aria-disabled"), "false", "失败后仍可点");
    assert.notEqual(await page.locator("#toast").innerText(), "已保存", "失败不报已保存");
    assert.equal(JSON.parse(await stored(page)).filler, "小满", "存储里还是原稿");
    await page.locator("#entryBack").click(); await page.locator("#leaveSave").click();
    await page.waitForFunction(() => document.getElementById("entrySave").textContent === "重试保存");
    assert.equal(await visible(page, "#entry"), true, "保存并返回没成功：留在本页");
    await page.locator("#wordInput").fill("SEX"); await page.locator("#entryBack").click(); await page.locator("#leaveSave").click();
    assert.match(await page.locator("#wordErr").innerText(), /不适合/, "校验失败：留本页说明"); assert.equal(await visible(page, "#entry"), true);
    await page.locator("#wordInput").fill("LIFE");
    await page.evaluate(() => { window.__failLocal = false; });
    await page.locator("#entrySave").click();
    await page.waitForFunction(() => document.getElementById("toast").textContent === "已保存");
    assert.equal(JSON.parse(await stored(page)).filler, "大寒", "重试成功"); assert.equal(await page.locator("#entrySaveMsg").innerText(), "");
    assert.deepEqual(errors, []); await context.close();
  }
  // 11 T30 / U2：保存中又点返回 → 不弹确认、写明「正在保存，保存好就返回」，写进后才返回；保存中又改了 → 迟到的确认不报「已保存」
  {
    const SLOW = "(() => { const real = Storage.prototype.setItem; Storage.prototype.setItem = function (k, v) { if (k === 'backronym-draft-v2' && window.__failLocal) throw new Error('quota'); return real.call(this, k, v); }; window.__remote = {}; window.xhs = { miniTool: { getStorage: async ({ key }) => ({ data: window.__remote[key] || null }), setStorage: ({ key, data }) => new Promise(ok => setTimeout(() => { window.__remote[key] = data; ok({}); }, 600)), removeStorage: async ({ key }) => { delete window.__remote[key]; } } }; })();";
    const { page, context, errors } = await pageFor({ draft: LIFE, init: SLOW });
    await page.locator("#toEntry").click(); await page.locator("#fillerCtl").fill("大寒");
    await page.evaluate(() => { window.__failLocal = true; }); // 本地写不进，只能等端侧（600ms）
    await page.locator("#entrySave").click();
    assert.equal(await page.locator("#entrySave").innerText(), "保存中…"); assert.equal(await page.locator("#entrySave").getAttribute("aria-busy"), "true");
    await page.locator("#entryBack").click();
    assert.equal(await visible(page, "#leavePop"), false, "保存中点返回：不弹确认");
    assert.equal(await page.locator("#entryWait").innerText(), "正在保存，保存好就返回");
    assert.equal(await visible(page, "#entry"), true, "还没写进：不提前返回");
    await page.waitForFunction(() => document.getElementById("entry").hidden, null, { timeout: 3000 });
    // 迟到结果：保存期间又改了填表人
    await page.locator("#toEntry").click(); await page.locator("#fillerCtl").fill("立春");
    await page.locator("#entrySave").click(); await page.locator("#fillerCtl").fill("立夏");
    await page.waitForFunction(() => document.getElementById("entrySave").textContent !== "保存中…", null, { timeout: 3000 });
    assert.notEqual(await page.locator("#toast").innerText(), "已保存", "迟到的确认不替新修改说「已保存」");
    assert.equal(await page.locator("#entrySave").getAttribute("aria-disabled"), "false", "按钮回到「有修改」");
    assert.deepEqual(errors, []); await context.close();
  }
  // 12 B2-R1：本地写不进、端侧慢。配文 A → B（自动写入在途）→ 改回 A，进改词页：仍算未保存（保存可点、返回先问）；显式保存要等 A 写进才成功；
  // 旧 B 落盘后由 A 纠正，端存储最终是 A，重开恢复 A。700ms：A 排在 B 后仍在 1.5 秒端调用时限内，直接成功；
  // 1200ms：排队超时，如实报「重试保存」（不报已保存），重试后成功
  for (const delay of [700, 1200]) {
    const SLOW2 = "(() => { const real = Storage.prototype.setItem; Storage.prototype.setItem = function (k, v) { if (k === 'backronym-draft-v2' && window.__failLocal) throw new Error('quota'); return real.call(this, k, v); }; const R = k => 'remote:' + k; window.xhs = { miniTool: { getStorage: async ({ key }) => ({ data: sessionStorage.getItem(R(key)) }), setStorage: ({ key, data }) => new Promise(ok => setTimeout(() => { sessionStorage.setItem(R(key), data); ok({}); }, " + delay + ")), removeStorage: async ({ key }) => { sessionStorage.removeItem(R(key)); } } }; })();";
    const { page, context, errors } = await pageFor({ draft: LIFE, init: SLOW2 });
    const remoteCap = () => page.evaluate(() => { const d = sessionStorage.getItem("remote:backronym-draft-v2"); return d && JSON.parse(d).captions[0]; });
    await page.evaluate(() => { window.__failLocal = true; });
    await page.locator("#capCtl").click(); await page.locator("#capCtl").fill("改成别的");
    await page.waitForTimeout(500); // 自动写入（400ms 防抖）已发出，端侧还没完成
    await page.locator("#capCtl").fill("一段配文"); await page.locator("#capCtl").blur();
    await page.locator("#toEntry").click();
    assert.equal(await page.locator("#entrySave").getAttribute("aria-disabled"), "false", delay + "：旧写入在途、内容改回原样，仍算未保存");
    await page.locator("#entryBack").click();
    assert.equal(await visible(page, "#leavePop"), true, delay + "：返回先问，不直接走"); assert.match(await page.locator("#leaveDiff").innerText(), /还没写进本设备/);
    await page.keyboard.press("Escape");
    await page.locator("#entrySave").click();
    assert.equal(await page.locator("#entrySave").innerText(), "保存中…");
    await page.waitForFunction(() => /^(重试保存|保存)$/.test(document.getElementById("entrySave").textContent), null, { timeout: 8000 });
    if (delay > 1000) {
      assert.equal(await page.locator("#entrySave").innerText(), "重试保存", "排队超时：如实报没保存");
      assert.notEqual(await page.locator("#toast").innerText(), "已保存"); assert.doesNotMatch(await page.locator("#draftStatus").innerText(), /草稿已保存/);
      await page.waitForTimeout(1500); // 迟到的写入落定后再重试
      await page.locator("#entrySave").click();
    }
    await page.waitForFunction(() => document.getElementById("toast").textContent === "已保存", null, { timeout: 8000 });
    assert.equal(await remoteCap(), "一段配文", delay + "：旧 B 落盘后被 A 纠正，端存储是 A");
    assert.match(await page.locator("#draftStatus").innerText(), /草稿已保存/);
    await page.locator("#entryBack").click(); await page.waitForFunction(() => document.getElementById("entry").hidden);
    await page.waitForTimeout(1500); assert.equal(await remoteCap(), "一段配文", delay + "：之后没有迟到的 B 覆盖");
    await page.evaluate(() => { window.__failLocal = false; }); await page.reload(); await page.waitForFunction(() => !document.getElementById("wordInput").disabled);
    assert.equal(await page.locator('#mirror [data-role="caption"]').innerText(), "一段配文", delay + "：重开恢复为 A");
    assert.deepEqual(errors, []); await context.close();
  }
  // 13 B2-R2：保存成功后 2.5 秒内再改、点返回——旧「已保存」提示不遮确认层；320 宽与视口变化后同样；焦点与 Esc 照常
  for (const width of [320, 375]) {
    const { page, context, errors } = await pageFor({ draft: LIFE, width });
    await page.locator("#toEntry").click(); await page.locator("#fillerCtl").fill("大寒"); await page.locator("#entrySave").click();
    await page.waitForFunction(() => document.getElementById("toast").textContent === "已保存");
    await page.locator("#fillerCtl").fill("立春"); await page.locator("#entryBack").click();
    const clear = async (tag) => {
      const r = await page.evaluate(() => {
        const t = document.getElementById("toast"), tr = t.getBoundingClientRect(), shown = !!t.textContent && getComputedStyle(t).display !== "none";
        const parts = ["leaveTitle", "leaveDiff", "leaveSave", "leaveDrop", "leaveStay"].map(id => document.getElementById(id));
        const covered = parts.some(n => { const r = n.getBoundingClientRect(); return shown && r.bottom > tr.top && r.top < tr.bottom && r.right > tr.left && r.left < tr.right; });
        const hits = ["leaveSave", "leaveDrop", "leaveStay"].every(id => { const n = document.getElementById(id), r = n.getBoundingClientRect(), h = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return n.contains(h); });
        return { shown, covered, hits };
      });
      assert.equal(r.covered, false, width + " 宽" + tag + "：提示不遮确认层 " + JSON.stringify(r)); assert.equal(r.hits, true, width + " 宽" + tag + "：三个选项都露在最上面");
    };
    await clear("");
    assert.equal(await page.evaluate(() => document.activeElement.id), "leaveStay");
    await page.setViewportSize({ width, height: 520 }); await page.waitForTimeout(50); await clear("（视口变矮）");
    await page.keyboard.press("Escape");
    assert.equal(await visible(page, "#leavePop"), false); assert.equal(await page.evaluate(() => document.activeElement.id), "fillerCtl", "Esc 后焦点回填表人");
    assert.deepEqual(errors, []); await context.close();
  }
  // 14 批次 3 · T36：单词框下的义项行（查到 / 查不到 / 屏蔽词，组字结束才更新，出错时让位给错误说明，行高不变）；T39：换一组
  for (const width of [320, 375]) {
    const { page, context, errors } = await pageFor({ width });
    const sense = page.locator("#wordSense"), top = () => page.locator("#fillerCtl").evaluate(n => n.getBoundingClientRect().top);
    assert.equal(await page.locator("#wordInput").getAttribute("aria-describedby"), "wordSense wordErr", "义项行与单词框关联");
    assert.equal(await sense.getAttribute("aria-live"), null, "不逐字播报");
    const t0 = await top();
    await page.locator("#wordInput").fill("LIFE");
    assert.equal(await sense.innerText(), "LIFE：生活", "查到：第一个义项（与卡上默认一致，T35）");
    await page.locator("#wordInput").fill("QXZV");
    assert.equal(await sense.innerText(), "词库里没有 QXZV 的释义", "查不到：明说");
    await page.locator("#wordInput").fill("SEX");
    assert.equal(await sense.innerText(), "填入内容不适合发布，换一个吧", "屏蔽词：U14 提示"); assert.doesNotMatch(await sense.innerText(), /SEX/i, "不复述");
    assert.equal(await page.locator("#wordErr").innerText(), "", "输入过程中不提前弹错误说明");
    const t1 = await top();
    await page.locator("#wordInput").press("Enter");
    assert.match(await page.locator("#wordErr").innerText(), /不适合/, "提交时才出现错误说明");
    assert.equal(await sense.isVisible(), false, "出错时义项行让位（U10），只留一处");
    const t2 = await top();
    await page.locator("#wordInput").fill("LOVE");
    assert.equal(await sense.isVisible(), true, "改了输入：错误消失、义项行恢复"); assert.equal(await sense.innerText(), "LOVE：爱");
    const t3 = await top();
    [t1, t2, t3].forEach(t => assert.ok(Math.abs(t - t0) < 1, width + " 宽：义项行 / 错误切换不推动下方字段 " + [t0, t1, t2, t3]));
    // 组字期间不更新，结束后才更新
    await page.locator("#wordInput").dispatchEvent("compositionstart");
    await page.locator("#wordInput").evaluate(n => { n.value = "LIFE"; n.dispatchEvent(new Event("input", { bubbles: true })); });
    assert.equal(await sense.innerText(), "LOVE：爱", "组字中不闪");
    await page.locator("#wordInput").dispatchEvent("compositionend");
    assert.equal(await sense.innerText(), "LIFE：生活", "组字结束才更新");
    // T39：换一组——6 个新预设、与上一组不重复，单词框不动，焦点留在按钮上，读屏播报
    const names = () => page.locator("#presets button").allInnerTexts();
    const a = await names();
    await page.locator("#presetMore").click();
    const b = await names();
    assert.equal(b.length, 6); assert.equal(b.filter(w => a.includes(w)).length, 0, "换一组：与上一组不重复");
    assert.equal(await page.locator("#wordInput").inputValue(), "LIFE", "不改单词框");
    assert.equal(await page.evaluate(() => document.activeElement.id), "presetMore", "焦点留在「换一组」，不弹键盘");
    assert.equal(await page.locator("#live").innerText(), "已换一组预设");
    const h = await page.locator("#presetMore").evaluate(n => n.getBoundingClientRect().height);
    assert.ok(h >= 24, "「换一组」点按区 ≥ 24px：" + h);
    assert.deepEqual(errors, []); await context.close();
  }
  // 15 批次 3 · T35 默认一个义项、T37 名字标注不显示（候选、卡上、义项栏）、T39「下一批」；T34 守护：连续随机后释义都在、镜像与框一致
  {
    const DAVID = { v: 2, word: "DAVE", filler: "", view: "single", titleRuns: null, picks: [null, ["ace", ""], ["vow", ""], ["echo", ""]], glosses: ["", "", "", ""], glossAuto: [true, true, true, true], captions: ["", "", "", ""], keys: [0, 0, 0, 0] };
    const { page, context, errors } = await pageFor({ draft: DAVID });
    await page.locator("#wordCtl").click(); await page.keyboard.type("david");
    const first = await page.locator("#candList li").first().innerText();
    assert.match(first, /^David\s*大卫，戴维$/, "候选：两行，释义行放两个最常用的义项（v00.03.00）、没有（男子名）：" + first);
    assert.equal(await page.locator("#candNext").innerText(), "下一批", "T39：候选翻页改名「下一批」");
    await page.locator("#candList li button").first().click();
    assert.equal(await page.locator('#mirror [data-role="gloss"]').innerText(), "大卫", "卡上默认释义");
    await page.locator("#glossCtl").focus();
    assert.equal(await page.locator("#candLab").innerText(), "David 的义项");
    const senses = await page.locator("#senseList button").allInnerTexts();
    assert.deepEqual(senses, ["大卫", "戴维"], "义项栏没有名字标注");
    await page.locator("#glossCtl").blur();
    for (let i = 0; i < 6; i++) {
      await page.locator("#wordCtl").click(); await page.locator("#candRandom").click(); await page.waitForTimeout(30);
      const r = await page.evaluate(() => ({ mirror: document.querySelector('#mirror [data-role="gloss"]').textContent, ctl: document.getElementById("glossCtl").value }));
      assert.ok(r.mirror && r.mirror === r.ctl && !/，/.test(r.mirror), "T34 守护：随机后释义在、单个义项、镜像与框一致 " + JSON.stringify(r));
    }
    assert.deepEqual(errors, []); await context.close();
  }
  // 16 B3-R1 / B3-R2：真实词条 Lindsay（「琳赛〔女子名）」）、Chaplin（喜剧演员）、Arthur（名字说明后半截）——入场义项行、候选、选中后卡面、义项栏都对；
  // 旧稿里已存的释义（自动 / 手写）原样不动
  {
    const { page, context, errors } = await pageFor();
    for (const [w, g] of [["LINDSAY", "琳赛"], ["CHAPLIN", "卓别林"], ["ARTHUR", "亚瑟"], ["AARON", "亚伦"], ["BELLA", "贝拉"], ["BOBBIE", "博比"], ["RICKY", "里基"], ["JO", "乔"]]) {
      await page.locator("#wordInput").fill(w);
      assert.equal(await page.locator("#wordSense").innerText(), w + "：" + g, "入场义项行：" + w);
    }
    assert.deepEqual(errors, []); await context.close();
  }
  {
    const LCA = { v: 2, word: "LCA", filler: "", view: "single", titleRuns: null, picks: [null, null, null], glosses: ["", "", ""], glossAuto: [true, true, true], captions: ["", "", ""], keys: [0, 0, 0] };
    const { page, context, errors } = await pageFor({ draft: LCA });
    for (const [i, w, g, all] of [[0, "lindsay", "琳赛", ["琳赛"]], [1, "chaplin", "卓别林", ["卓别林"]], [2, "arthur", "亚瑟", ["亚瑟"]]]) {
      await page.evaluate(i => document.getElementById("pl-" + i).click(), i);
      await page.locator("#wordCtl").click(); await page.keyboard.type(w);
      const first = await page.locator("#candList li").first().innerText();
      assert.equal(first.replace(/\s+/g, " "), w[0].toUpperCase() + w.slice(1) + " " + g, "候选：" + first);
      await page.locator("#candList li button").first().click();
      assert.equal(await page.locator('#mirror [data-role="gloss"]').innerText(), g, "选中后卡面：" + w);
      await page.locator("#glossCtl").focus();
      assert.deepEqual(await page.locator("#senseList button").allInnerTexts(), all, "义项栏：" + w);
      await page.locator("#glossCtl").blur();
    }
    assert.deepEqual(errors, []); await context.close();
  }
  // B3-R2 复审：名字说明的中段别名不显示（Bella / Bobbie / Ricky / Jo 只留中文名）；只有标签的 Wes 释义为空、不拿「男子名」冒充
  {
    const { page, context, errors } = await pageFor();
    await page.locator("#wordInput").fill("WES");
    assert.equal(await page.locator("#wordSense").innerText(), "词库里没有 WES 的释义", "Wes：标签不当释义");
    assert.deepEqual(errors, []); await context.close();
  }
  {
    const BJRW = { v: 2, word: "BBJRW", filler: "", view: "single", titleRuns: null, picks: [null, null, null, null, null], glosses: ["", "", "", "", ""], glossAuto: [true, true, true, true, true], captions: ["", "", "", "", ""], keys: [0, 0, 0, 0, 0] };
    const { page, context, errors } = await pageFor({ draft: BJRW });
    for (const [i, w, g] of [[0, "bella", "贝拉"], [1, "bobbie", "博比"], [2, "jo", "乔"], [3, "ricky", "里基"], [4, "wes", ""]]) {
      await page.evaluate(i => document.getElementById("pl-" + i).click(), i);
      await page.locator("#wordCtl").click(); await page.keyboard.type(w);
      const first = (await page.locator("#candList li").first().innerText()).replace(/\s+/g, " ").trim();
      assert.equal(first, (w[0].toUpperCase() + w.slice(1) + " " + g).trim(), "候选：" + first);
      await page.locator("#candList li button").first().click();
      const gloss = await page.evaluate(() => { const n = document.querySelector('#mirror [data-role="gloss"]'); return n ? n.textContent : ""; });
      assert.equal(gloss, g, "选中后卡面：" + w);
      if (g) {
        await page.locator("#glossCtl").focus();
        assert.deepEqual(await page.locator("#senseList button").allInnerTexts(), [g], "义项栏：" + w);
        await page.locator("#glossCtl").blur();
      } else assert.equal(await page.locator("#glossCtl").inputValue(), "", "Wes：释义留空待填");
    }
    assert.deepEqual(errors, []); await context.close();
  }
  {
    const OLD = { v: 2, word: "LCA", filler: "", view: "single", titleRuns: null, picks: [["lindsay", ""], ["chaplin", ""], ["arthur", ""]],
      glosses: ["琳赛〔女子名）", "卓别林（喜剧演员）", "我写的"], glossAuto: [true, false, false], captions: ["", "", ""], keys: [0, 0, 0] };
    const { page, context, errors } = await pageFor({ draft: OLD });
    const got = [];
    for (const i of [0, 1, 2]) { await page.evaluate(i => document.getElementById("pl-" + i).click(), i); got.push(await page.locator('#mirror [data-role="gloss"]').innerText()); }
    assert.deepEqual(got, OLD.glosses, "旧稿释义（glossAuto true / false、手写）原样");
    assert.deepEqual(errors, []); await context.close();
  }
  // 17 批次 4 · T40（U14）：屏蔽词提示四处统一一句、不复述——入场单词 / 填表人（上面已测）、候选栏、点「完成」被拦下；拦截范围与焦点跳转不变
  {
    const { page, context, errors } = await pageFor({ draft: { ...LIFE, captions: ["加微信", "冰的配文", "", "回声配文"] } });
    const MSG = "填入内容不适合发布，换一个吧";
    await page.locator("#wordCtl").click(); await page.locator("#wordCtl").fill("sex");
    assert.equal(await page.locator("#candMsg").innerText(), MSG, "候选栏：同一句"); assert.equal(await page.locator("#candList").isVisible(), false, "仍不给该词的候选");
    await page.locator("#wordCtl").fill("love"); await page.locator("#wordCtl").blur();
    await page.locator("#pl-1").click(); await page.locator("#finish").click();
    assert.equal(await page.locator("#hint").innerText(), MSG, "点「完成」被拦下：同一句");
    assert.doesNotMatch(await page.locator("#live").innerText(), /微信|配文/, "读屏也不复述");
    assert.equal(await page.evaluate(() => document.activeElement.id), "capCtl", "焦点照旧跳到出问题的框");
    assert.equal(await page.evaluate(() => [...document.querySelectorAll("#pagerLetters .pl")].findIndex(b => b.classList.contains("on"))), 0, "跳回出问题的那一格");
    assert.deepEqual(errors, []); await context.close();
  }
  // 18 批次 5 · T38：短语 / 合成词补充表——不在首屏同步加载、启动后才有；打短语时排在候选第一个，选中后卡面带释义；
  // 去空格（super intelligence → superintelligence）与连字符（about face → about-face）也能找到；恢复的短语格在补充表加载后义项栏可用
  {
    const ISA = { v: 2, word: "ISA", filler: "", view: "single", titleRuns: null, picks: [["ice cream", ""], null, null], glosses: ["冰淇淋", "", ""], glossAuto: [true, true, true], captions: ["", "", ""], keys: [0, 0, 0] };
    const { page, context, errors } = await pageFor({ draft: ISA });
    assert.doesNotMatch(await page.evaluate(() => document.documentElement.outerHTML), /phrases\.js"><\/script>\s*<script/, "index.html 不同步加载补充表");
    await page.waitForFunction(() => !!window.PHRASES, null, { timeout: 5000 });
    await page.evaluate(() => document.getElementById("pl-0").click()); // 恢复后停在第一个空格，先回到短语那一格
    await page.locator("#glossCtl").focus();
    assert.deepEqual(await page.locator("#senseList button").allInnerTexts(), ["冰淇淋"], "恢复的短语格：义项栏可用");
    await page.locator("#glossCtl").blur();
    for (const [i, typed, first, gloss] of [[1, "super intelligence", "Superintelligence", "超智能"], [2, "about face", "About-face", "向后转"]]) {
      await page.evaluate(i => document.getElementById("pl-" + i).click(), i);
      await page.locator("#wordCtl").click(); await page.keyboard.type(typed);
      const t = (await page.locator("#candList li").first().innerText()).replace(/\s+/g, " ");
      assert.ok(t.startsWith(first + " ") && t.includes(gloss), "候选第一个：" + t);
      await page.locator("#candList li button").first().click();
      assert.match(await page.locator('#mirror [data-role="gloss"]').innerText(), new RegExp(gloss), "选中后卡面带释义：" + typed);
    }
    assert.deepEqual(errors, []); await context.close();
  }
  // 19 B5-R1：主词库已有的词换一种写法也能找到（sun flower → sunflower 向日葵、ice berg → iceberg 冰山）；原样优先（make up 是短语「弥补」，不是 makeup）
  {
    const SIM = { v: 2, word: "SIM", filler: "", view: "single", titleRuns: null, picks: [null, null, null], glosses: ["", "", ""], glossAuto: [true, true, true], captions: ["", "", ""], keys: [0, 0, 0] };
    const { page, context, errors } = await pageFor({ draft: SIM });
    await page.waitForFunction(() => !!window.PHRASES, null, { timeout: 5000 });
    for (const [i, typed, first, gloss] of [[0, "sun flower", "Sunflower", "向日葵"], [1, "ice berg", "Iceberg", "冰山"], [2, "make up", "Make up", "弥补"]]) {
      await page.evaluate(i => document.getElementById("pl-" + i).click(), i);
      await page.locator("#wordCtl").click(); await page.keyboard.type(typed);
      assert.match(await page.locator('#mirror [data-role="gloss"]').innerText(), new RegExp(gloss), "打完不选，默认释义已带出：" + typed);
      const t = (await page.locator("#candList li").first().innerText()).replace(/\s+/g, " ");
      assert.ok(t.startsWith(first + " ") && t.includes(gloss), "候选第一个：" + t);
      await page.locator("#candList li button").first().click();
      await page.locator("#glossCtl").focus();
      assert.ok((await page.locator("#senseList button").allInnerTexts()).includes(gloss), "义项栏有：" + gloss);
      await page.locator("#glossCtl").blur();
    }
    await page.evaluate(() => document.getElementById("pl-0").click());
    await page.locator("#wordCtl").click(); await page.locator("#wordCtl").fill("sqxzv blah");
    assert.match(await page.locator("#candLab").innerText(), /词库里没有/, "未知词仍按自定义词用");
    assert.deepEqual(errors, []); await context.close();
  }
  // 20 B5-R2：补充表慢加载（2.5 秒）——加载前已在旧短语格的释义框里，加载完无需失焦就出现义项，焦点与释义不变；
  // 加载前已离开编辑页 / 正在组字时，迟到的加载不恢复过期界面、不改输入
  {
    const ICE = { v: 2, word: "IS", filler: "", view: "single", titleRuns: null, picks: [["ice cream", ""], null], glosses: ["冰淇淋", ""], glossAuto: [true, true], captions: ["", ""], keys: [0, 0] };
    let { page, context, errors } = await pageFor({ draft: ICE, phraseDelay: 2500 });
    await page.evaluate(() => document.getElementById("pl-0").click()); await page.locator("#glossCtl").focus();
    assert.equal(await page.evaluate(() => !!window.PHRASES), false, "此时补充表还没到");
    assert.equal(await page.locator("#cand").isVisible(), false, "加载前没有义项可显示");
    await page.waitForFunction(() => !!window.PHRASES, null, { timeout: 8000 });
    await page.waitForFunction(() => !document.getElementById("cand").hidden);
    assert.deepEqual(await page.locator("#senseList button").allInnerTexts(), ["冰淇淋"], "加载完无需失焦就出现义项");
    assert.equal(await page.evaluate(() => document.activeElement.id), "glossCtl", "焦点不变"); assert.equal(await page.locator("#glossCtl").inputValue(), "冰淇淋", "释义不变");
    assert.deepEqual(errors, []); await context.close();
    ({ page, context, errors } = await pageFor({ draft: ICE, phraseDelay: 2500 }));
    await page.evaluate(() => document.getElementById("pl-0").click()); await page.locator("#glossCtl").focus();
    await page.locator("#glossCtl").dispatchEvent("compositionstart");
    await page.locator("#glossCtl").evaluate(n => { n.value = "冰淇淋b"; n.dispatchEvent(new Event("input", { bubbles: true })); });
    await page.waitForFunction(() => !!window.PHRASES, null, { timeout: 8000 }); await page.waitForTimeout(100);
    assert.equal(await page.locator("#glossCtl").inputValue(), "冰淇淋b", "组字中迟到加载：不改输入");
    assert.equal(await page.evaluate(() => document.activeElement.id), "glossCtl", "组字中迟到加载：焦点不动");
    await page.locator("#glossCtl").dispatchEvent("compositionend");
    assert.deepEqual(errors, []); await context.close();
    ({ page, context, errors } = await pageFor({ draft: ICE, phraseDelay: 2500 }));
    await page.evaluate(() => document.getElementById("pl-0").click()); await page.locator("#glossCtl").focus();
    await page.locator("#toEntry").click(); // 加载前离开编辑页
    await page.waitForFunction(() => !!window.PHRASES, null, { timeout: 8000 }); await page.waitForTimeout(100);
    assert.equal(await page.locator("#cand").isVisible(), false, "已离开编辑页：迟到加载不恢复义项栏");
    assert.equal(await page.locator("#entry").isVisible(), true);
    assert.deepEqual(errors, []); await context.close();
  }
  // 21 批次 6 · T41：入场页收字母与数字、最多 14 个字符；全数字写明读法；T42：长词自动分图、预览切点、「调整分图」只动分界
  {
    const { page, context, errors } = await pageFor();
    const wi = page.locator("#wordInput");
    await wi.fill("b2b"); assert.equal(await wi.inputValue(), "B2B", "数字自成一格，不再静默丢掉"); assert.equal(await page.locator("#wordCount").innerText(), "3 / 14 个字符");
    await wi.fill("2024"); assert.equal(await page.locator("#wordSense").innerText(), "按读法取首字母：T（two） · O（oh） · T（two） · F（four）", "全数字：写明读法");
    await wi.fill("abcdefghijklmnopq"); assert.equal(await wi.inputValue(), "ABCDEFGHIJKLMN", "最多 14 个");
    await wi.fill("development");
    assert.equal(await page.locator("#splitInfo").innerText(), "分 2 张（7 + 4）· 切点 develop | ment", "自动分图：develop | ment");
    assert.equal(await page.locator("#wordPreview .pv").evaluateAll(ns => ns.findIndex(n => n.classList.contains("cut"))), 7, "预览在切点画竖线");
    assert.equal(await page.locator("#splitAdjust").getAttribute("open"), null, "「调整分图」默认折叠");
    await page.locator("#splitAdjust summary").click();
    await page.locator("#splitLeft").click();
    assert.equal(await page.locator("#splitInfo").innerText(), "分 2 张（6 + 5）· 已手动调整");
    await page.locator("#splitAuto").click(); assert.match(await page.locator("#splitInfo").innerText(), /7 \+ 4/, "恢复自动");
    for (let k = 0; k < 6; k++) await page.locator("#splitLeft").click({ force: true });
    assert.match(await page.locator("#splitInfo").innerText(), /3 \+ 8/, "最少 3 格"); assert.equal(await page.locator("#splitLeft").isDisabled(), true, "到边界那一侧不可用");
    for (let k = 0; k < 3; k++) await page.locator("#splitRight").click();
    await page.locator("#entryStart").click(); await page.waitForFunction(() => document.getElementById("entry").hidden);
    await savedWhere(page, "d.word === 'DEVELOPMENT' && d.split === 6");
    assert.equal(JSON.parse(await stored(page)).split, 6, "调过的分界随作品保存");
    await page.locator("#viewGrid").click();
    assert.equal(await page.locator("#sheetTabs").isVisible(), true, "列阵分图：有页签");
    assert.deepEqual(await page.locator("#sheetTabs .sheet-tab").allInnerTexts(), ["01–06 第 1 张", "07–11 第 2 张"]);
    assert.match(await page.locator("#mirror").innerText(), /01–06 \/ 11/, "页眉写起止格");
    await page.locator("#sheet-1").click();
    assert.match(await page.locator("#mirror").innerText(), /07–11 \/ 11/, "点页签换张");
    assert.equal(await page.locator("#sheet-1").getAttribute("aria-selected"), "true");
    assert.ok((await page.locator("#sheetTabs .sheet-tab").first().boundingBox()).height >= 44, "页签 ≥ 44px 高");
    assert.deepEqual(errors, []); await context.close();
  }
  // T42：分图的列阵导出两张，缩略图按起止格标注；T41：数字格（B2B）候选按读法首字母、2nd 与 two 都算对、别的不对
  {
    const DEV = { v: 2, word: "DEVELOPMENT", filler: "", view: "grid", titleRuns: null, split: 6, // 草稿里存着手动分界：恢复后照用
      picks: "development".split("").map((l) => [l + "ove", ""]), glosses: Array(11).fill("爱"), glossAuto: Array(11).fill(false), captions: Array(11).fill(""), keys: Array(11).fill(0) };
    const { page, context, errors } = await pageFor({ draft: DEV });
    await page.locator("#finish").click();
    await page.waitForFunction(() => !document.getElementById("finThumbs").hidden, null, { timeout: 30000 });
    assert.match(await page.locator("#finTitle").innerText(), /导出 列阵（2 张）/);
    assert.deepEqual(await page.locator("#finThumbs .thumb span").allInnerTexts(), ["1 01–06", "2 07–11"], "两张，按起止格标注；恢复的手动分界照用");
    assert.deepEqual(errors, []); await context.close();
  }
  {
    const B2B = { v: 2, word: "B2B", filler: "", view: "single", titleRuns: null, picks: [["big", ""], null, ["bee", ""]], glosses: ["", "", ""], glossAuto: [true, true, true], captions: ["", "", ""], keys: [0, 0, 0] };
    const { page, context, errors } = await pageFor({ draft: B2B });
    await page.evaluate(() => document.getElementById("pl-1").click());
    await page.locator("#wordCtl").click();
    assert.equal(await page.locator("#candLab").innerText(), "以 T 或 2 开头", "格首提示把算对的写法全列出来（v00.03.00）");
    assert.equal(await page.locator("#candRandom").isVisible(), true, "数字格也有「随机一个」（按读法首字母）");
    await page.keyboard.type("t");
    assert.match((await page.locator("#candList li").first().innerText()), /^T/, "候选按读法首字母 T 给");
    for (const [w, ok] of [["2nd", true], ["two", true], ["one", false], ["3rd", false]]) {
      await page.locator("#wordCtl").fill(w);
      assert.equal(await page.locator("#wordCtl").getAttribute("aria-invalid"), String(!ok), "2 格打 " + w + "：" + (ok ? "对" : "不对"));
    }
    assert.match(await page.locator("#candMsg").innerText(), /不是以 T 或 2 开头/);
    assert.equal(await page.locator("#pl-1").innerText(), "2", "字母栏仍显示数字");
    assert.deepEqual(errors, []); await context.close();
  }
  // T42：14 个字符在 320 宽的字母栏按分图分两行，行末标起止格，点按区 ≥ 24px、不横滚
  {
    const D14 = { v: 2, word: "DISAPPOINTMENT", filler: "", view: "single", titleRuns: null, picks: Array(14).fill(null), glosses: Array(14).fill(""), glossAuto: Array(14).fill(true), captions: Array(14).fill(""), keys: Array(14).fill(0) };
    const { page, context, errors } = await pageFor({ draft: D14, width: 320 });
    assert.deepEqual(await page.locator("#pagerLetters .pl-range").allInnerTexts(), ["01–10", "11–14"], "disappoint | ment = 10 + 4");
    const r = await page.evaluate(() => ({ rows: [...document.querySelectorAll("#pagerLetters .pl-row")].map(row => row.querySelectorAll(".pl").length), min: Math.min(...[...document.querySelectorAll("#pagerLetters .pl")].map(b => Math.min(b.getBoundingClientRect().width, b.getBoundingClientRect().height))), wide: document.documentElement.scrollWidth <= innerWidth }));
    assert.deepEqual(r.rows, [10, 4]); assert.ok(r.min >= 24, "点按区 ≥ 24px：" + r.min); assert.ok(r.wide, "不横滚");
    assert.deepEqual(errors, []); await context.close();
  }
  // 22 B6-R2：分界跟着单词走——作品存着 DEVELOPMENT 的手动 6 + 5；改词页里临时改词再回到原词，分界仍是 6 + 5、保存按钮不变可用
  {
    const DEV6 = { v: 2, word: "DEVELOPMENT", filler: "小满", view: "single", titleRuns: null, split: 6,
      picks: "development".split("").map((l) => [l + "ove", ""]), glosses: Array(11).fill("爱"), glossAuto: Array(11).fill(false), captions: Array(11).fill(""), keys: Array(11).fill(0) };
    const { page, context, errors } = await pageFor({ draft: DEV6 });
    const info = () => page.locator("#splitInfo").innerText(), saveOff = () => page.locator("#entrySave").getAttribute("aria-disabled");
    await page.locator("#toEntry").click();
    assert.equal(await info(), "分 2 张（6 + 5）· 已手动调整", "打开改词页：作品的手动分界");
    assert.equal(await saveOff(), "true");
    await page.locator("#wordInput").press("End"); await page.keyboard.type("S"); await page.keyboard.press("Backspace");
    assert.equal(await info(), "分 2 张（6 + 5）· 已手动调整", "打字再删：仍是 6 + 5"); assert.equal(await saveOff(), "true", "打字再删：保存按钮不变可用");
    await page.locator("#presets button").first().click(); await page.locator("#wordInput").fill("development");
    assert.equal(await info(), "分 2 张（6 + 5）· 已手动调整", "点预设再打回原词：仍是 6 + 5"); assert.equal(await saveOff(), "true");
    await page.locator("#wordInput").fill("INFORMATION"); await page.locator("#entrySave").click();
    assert.equal(await visible(page, "#wordConfirm"), true); await page.locator("#confKeep").click();
    assert.equal(await page.locator("#wordInput").inputValue(), "DEVELOPMENT");
    assert.equal(await info(), "分 2 张（6 + 5）· 已手动调整", "改词后取消（保留原单词）：仍是 6 + 5"); assert.equal(await saveOff(), "true");
    // 只改填表人保存：分界仍是 6
    await page.locator("#fillerCtl").fill("大寒"); await page.locator("#entrySave").click();
    await page.waitForFunction(() => document.getElementById("toast").textContent === "已保存");
    assert.equal(JSON.parse(await stored(page)).split, 6, "只改填表人：分界仍是 6");
    // 放弃修改：恢复已保存的值
    await page.locator("#splitAdjust summary").click(); await page.locator("#splitRight").click();
    assert.match(await info(), /7 \+ 4/); await page.locator("#entryBack").click(); await page.locator("#leaveDrop").click();
    await page.locator("#toEntry").click();
    assert.equal(await info(), "分 2 张（6 + 5）· 已手动调整", "放弃修改：回到已保存的 6 + 5");
    // 确认改成新词：新词用自动分界
    await page.locator("#wordInput").fill("INFORMATION"); await page.locator("#entrySave").click(); await page.locator("#confClear").click();
    await page.waitForFunction(() => document.getElementById("toast").textContent === "已保存");
    assert.equal(await info(), "分 2 张（6 + 5）· 切点 inform | ation", "新词：自动分界"); assert.equal(JSON.parse(await stored(page)).split, null);
    assert.deepEqual(errors, []); await context.close();
  }
  // 第六批：错首字母提示关联、错误状态和 live region；纠正/组字/失焦时不残留描述。
  {
    const { page, context, errors } = await pageFor();
    await page.locator("#wordInput").fill("LIFE"); await page.locator("#entryStart").click();
    const word = page.locator("#wordCtl"), msg = page.locator("#candMsg");
    await word.fill("ice");
    assert.equal(await word.getAttribute("aria-invalid"), "true");
    assert.equal(await word.getAttribute("aria-describedby"), "candMsg");
    assert.match(await msg.innerText(), /不是以 L 开头/);
    assert.equal(await msg.getAttribute("role"), "status");
    assert.equal(await msg.getAttribute("aria-atomic"), "true");
    // 同一错误重复重画不能重复修改 live region 的文本。
    await page.evaluate(() => {
      window.candChanges = 0;
      new MutationObserver(ms => { window.candChanges += ms.length; }).observe(document.getElementById("candMsg"), { childList: true, characterData: true, subtree: true });
      document.getElementById("wordCtl").dispatchEvent(new Event("focus"));
    });
    await page.waitForTimeout(50); assert.equal(await page.evaluate(() => window.candChanges), 0);
    await word.dispatchEvent("compositionstart");
    assert.equal(await word.getAttribute("aria-invalid"), "false");
    assert.equal(await word.getAttribute("aria-describedby"), null);
    await word.dispatchEvent("compositionend");
    assert.equal(await word.getAttribute("aria-invalid"), "true");
    await word.fill("love");
    assert.equal(await word.getAttribute("aria-invalid"), "false");
    assert.equal(await word.getAttribute("aria-describedby"), null);
    await word.fill("ice"); await word.evaluate(el => el.blur());
    assert.equal(await word.getAttribute("aria-describedby"), null, "栏收起后不关联隐藏旧提示");
    await page.locator("#pl-1").click();
    assert.equal(await word.getAttribute("aria-invalid"), "false", "切到空格不沿用上一格错误状态");
    assert.equal(await word.getAttribute("aria-describedby"), null);
    assert.deepEqual(errors, []); await context.close();
  }
  console.log("browser entry ok: first visit + keyboard, edit entry + blocklist + back, keepSame + confirm, crop-only confirm, word-less draft keeps filler, mid-input close, slow read, T02 + no photo redraw, T08, T49 hints, T30 save + leave confirm + failure retry + save-in-progress back, B2-R1 in-flight A→B→A, B2-R2 toast vs confirm, T36 sense line + T39 presets, T35/T37 senses + T34 guard, B3 real entries Lindsay/Chaplin/Arthur/Bella/Bobbie/Ricky/Jo/Wes + old drafts, T40 unified blocked message, T38 phrases lazy-loaded + lookup order, B5-R1 main-dictionary spellings, B5-R2 late load refresh, T41 digits + 14 chars, T42 split preview + adjust + grid sheets + export + 14-letter pager, B6-R2 split bound to word, word error accessibility");
} finally {
  if (browser) await browser.close();
  await new Promise(resolve => server.close(resolve));
}
