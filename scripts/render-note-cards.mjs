#!/usr/bin/env node
// 首发笔记（宣发 G5）的教程图：把门户第 5 部分的 GIOCO 五步做成一份藏头，用工具自己导出五张单图。
// 用法：PLAYWRIGHT_MODULE=… CHROMIUM_PATH=… node scripts/render-note-cards.mjs <输出目录>
// 做法：开着真的应用（app/），植入只有词与配文的草稿，冠词与释义由应用到词库里查；默认义项不是门户用的那条时，
// 像用户一样到义项栏点选；最后点「完成」，取完成面板里导出的图。不自己画，成品就是工具的导出图。
// 词、释义、配文照 site/backronymsite/PLAN.md 第 5 部分定稿；定稿里配文分两行写（「／」），工具的配文不认手动换行，这里用空格连成一句，放不下时由工具折行。改文案只改下面的 CELLS。
import { createRequire } from "node:module";
import { createServer } from "node:http";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";

const WORD = "GIOCO", LANG = "it";
// sense：义项栏里要点的那一条（留空 = 用词库默认的首义）；shown：卡上应当出现的冠词、词、释义，对不上就报错退出
const CELLS = [
  { word: "guida", sense: "", shown: "la Guida 指南", caption: "先起一个单词 再选一门语言" },
  { word: "iniziale", sense: "初始字母", shown: "l’ Iniziale 初始字母", caption: "每个字母，填一个以它开头的词 词库会给你候选" },
  { word: "opera", sense: "", shown: "l’ Opera 作品", caption: "释义、配文、配图 一格一格填上" },
  { word: "composizione", sense: "排版", shown: "la Composizione 排版", caption: "对开、居中，或者自己调 主题也随你换" },
  { word: "omaggio", sense: "", shown: "l’ Omaggio 敬意", caption: "点「完成」 存进相册，或直接发成笔记" },
];

const out = process.argv[2];
if (!out) { console.error("用法：node scripts/render-note-cards.mjs <输出目录>"); process.exit(2); }
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const root = fileURLToPath(new URL("../app/", import.meta.url));
const server = createServer(async (req, res) => {
  const file = path.resolve(root, "." + (req.url === "/" ? "/index.html" : req.url.split("?")[0]));
  if (!file.startsWith(root)) { res.writeHead(403).end(); return; }
  try {
    const type = { ".js": "text/javascript", ".css": "text/css", ".html": "text/html", ".woff2": "font/woff2" }[path.extname(file)];
    res.setHeader("Content-Type", type || "application/octet-stream"); res.end(await readFile(file));
  } catch { res.writeHead(404).end(); }
});
await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
const url = "http://127.0.0.1:" + server.address().port, KEY = "backronym-draft-v2", n = CELLS.length;
const draft = { v: 2, word: WORD, filler: "", view: "single", titleRuns: null, lang: LANG, langs: [LANG],
  picks: CELLS.map(c => [c.word, ""]), pickLangs: CELLS.map(() => LANG), glosses: CELLS.map(() => ""), glossAuto: CELLS.map(() => true),
  captions: CELLS.map(c => c.caption), keys: CELLS.map(() => 0) };

const browser = await chromium.launch({ headless: true, ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}) });
try {
  const context = await browser.newContext({ viewport: { width: 375, height: 812 }, locale: "zh-CN" });
  await context.addInitScript(({ draft, KEY }) => {
    if (sessionStorage.getItem("seeded")) return;
    localStorage.setItem(KEY, JSON.stringify({ ...draft, t: Date.now() - 5000 })); localStorage.setItem("backronym-tip-seen", "1"); sessionStorage.setItem("seeded", "1");
  }, { draft, KEY });
  const page = await context.newPage(), errors = [];
  page.on("pageerror", e => errors.push(String(e)));
  await page.goto(url, { waitUntil: "load" });
  await page.waitForFunction(n => document.getElementById("pagerLetters").children.length === n, n, { timeout: 15000 });
  const cell = i => page.evaluate(i => document.querySelectorAll("#pagerLetters button")[i].click(), i);
  const card = () => page.evaluate(() => document.getElementById("mirror").innerText.replace(/\s+/g, " ").trim());
  for (let i = 0; i < n; i++) {
    const c = CELLS[i];
    await cell(i);
    if (c.sense) { // 到义项栏点门户用的那条义项
      await page.evaluate(() => document.getElementById("glossCtl").focus());
      await page.waitForFunction(s => Array.from(document.querySelectorAll("#senseList button")).some(b => b.textContent.trim() === s), c.sense, { timeout: 15000 });
      await page.evaluate(s => Array.from(document.querySelectorAll("#senseList button")).find(b => b.textContent.trim() === s).click(), c.sense);
      await page.evaluate(() => document.activeElement && document.activeElement.blur()); // 释义框还聚焦时，卡上的字不是成品的样子
    }
    // 卡上的字等词库查完才齐，等到与定稿一致为止；等不到就是词库或定稿变了
    // 比对时去掉空白：配文放不下一行时由工具自己折行，折在哪里不由这里定
    const want = (WORD[i] + c.shown + c.caption).replace(/\s+/g, "");
    await page.waitForFunction(w => document.getElementById("mirror").innerText.replace(/\s+/g, "") === w, want, { timeout: 15000 })
      .catch(async () => { throw new Error("第 " + (i + 1) + " 格与定稿不符：\n  卡上：" + await card() + "\n  定稿：" + want); });
  }
  await page.evaluate(() => document.activeElement && document.activeElement.blur());
  await page.waitForFunction(() => !document.getElementById("finish").disabled, null, { timeout: 15000 });
  await page.click("#finish");
  await page.waitForFunction(n => document.querySelectorAll("#finThumbs img").length === n && !document.getElementById("exportView").disabled, n, { timeout: 60000 });
  const shots = await page.evaluate(() => Promise.all([...document.querySelectorAll("#finThumbs img")].map(im => new Promise(ok => {
    const done = () => ok({ src: im.src, w: im.naturalWidth, h: im.naturalHeight }); if (im.complete) done(); else im.onload = done;
  }))));
  assert.deepEqual(errors, [], "页面报错");
  await mkdir(out, { recursive: true });
  for (let i = 0; i < n; i++) {
    const m = /^data:image\/(png|jpeg);base64,(.+)$/.exec(shots[i].src);
    assert.ok(m, "第 " + (i + 1) + " 张不是导出的图");
    assert.deepEqual([shots[i].w, shots[i].h], [1620, 2160], "第 " + (i + 1) + " 张尺寸");
    const name = "gioco-" + (i + 1) + "-" + WORD[i].toLowerCase() + "." + (m[1] === "jpeg" ? "jpg" : "png");
    await writeFile(path.join(out, name), Buffer.from(m[2], "base64"));
    console.log(name, shots[i].w + "×" + shots[i].h);
  }
} finally { await browser.close(); server.close(); }
