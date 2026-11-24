#!/usr/bin/env node
// 把 design/brand/slogan.html 里的两块画板出成 README 顶部的七语简介长图。不在 npm test 里，改了源稿后手动跑：
// PLAYWRIGHT_MODULE=/absolute/path/to/playwright CHROMIUM_PATH=/path/to/chromium node scripts/render-slogan.mjs
// 成品写到 design/brand/：slogan-desktop.png（宽 1520）、slogan-mobile.png（宽 780）。高度随内容，不写死。
// 字体要 scripts/.cache/fonts/ 里的原字体，没载入就报错退出；电脑端有一句折行也报错（每句应当一行）。
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const dir = fileURLToPath(new URL("../design/brand/", import.meta.url));
const WIDTH = { desktop: 1520, mobile: 780 };

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH });
try {
  const page = await browser.newPage({ viewport: { width: 1900, height: 2400 }, deviceScaleFactor: 1 });
  await page.goto("file://" + path.join(dir, "slogan.html"));
  await page.evaluate(() => document.fonts.ready);
  const bad = await page.evaluate(() => [...document.fonts].filter(f => f.status !== "loaded").map(f => f.family + " " + f.weight));
  assert.deepEqual(bad, [], "字体没载入（scripts/.cache/fonts/ 里要有原字体）");
  // 电脑端每句一行：句子不许比它的一栏宽
  const wide = await page.evaluate(() => [...document.querySelectorAll(".desktop .txt")].filter(t => t.scrollWidth > t.parentElement.clientWidth).map(t => t.textContent));
  assert.deepEqual(wide, [], "电脑端这几句放不下一行");
  for (const name of Object.keys(WIDTH)) {
    const el = await page.$('[data-out="' + name + '"]'), box = await el.boundingBox();
    assert.equal(box.width, WIDTH[name], name + " 画板宽度不对");
    const file = path.join(dir, "slogan-" + name + ".png");
    await el.screenshot({ path: file });
    console.log(path.basename(file) + "  " + box.width + "×" + Math.round(box.height) + "  " + fs.statSync(file).size + " B");
  }
} finally { await browser.close(); }
