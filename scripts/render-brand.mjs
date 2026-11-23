#!/usr/bin/env node
// 把 design/brand/brand.html 里的画板出成图标与封面（G1）。不在 npm test 里，改了定稿页后手动跑：
// PLAYWRIGHT_MODULE=/absolute/path/to/playwright CHROMIUM_PATH=/path/to/chromium node scripts/render-brand.mjs [自查图目录]
// 成品写到 design/brand/：icon-1024.png、icon-512.png（1:1，须小于 5 MB）、cover-1242x1656.png（3:4，须小于 10 MB）。
// 给了自查图目录，就把缩小与裁切的自查图写到那里（不进仓库）。字体要 scripts/.cache/fonts/ 里的原字体，没载入就报错退出。
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const dir = fileURLToPath(new URL("../design/brand/", import.meta.url));
const checkDir = process.argv[2];
const LIMIT = { icon: 5e6, cover: 10e6 }, SIZE = { icon: [1024, 1024], cover: [1242, 1656] };

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH });
async function open(scale) {
  const page = await browser.newPage({ viewport: { width: 1400, height: 1800 }, deviceScaleFactor: scale });
  await page.goto("file://" + path.join(dir, "brand.html"));
  await page.evaluate(() => document.fonts.ready);
  const bad = await page.evaluate(() => [...document.fonts].filter(f => f.status !== "loaded").map(f => f.family + " " + f.weight));
  assert.deepEqual(bad, [], "字体没载入（scripts/.cache/fonts/ 里要有原字体）");
  return page;
}
async function shot(page, sel, file, limit) {
  await (await page.$(sel)).screenshot({ path: file });
  const bytes = fs.statSync(file).size;
  if (limit) assert.ok(bytes < limit, file + " 超过上限：" + bytes + " B");
  console.log(path.basename(file) + "  " + bytes + " B");
}

const full = await open(1);
for (const name of Object.keys(SIZE)) {
  const box = await (await full.$('[data-out="' + name + '"]')).boundingBox();
  assert.deepEqual([box.width, box.height], SIZE[name], name + " 画板尺寸不对");
  await shot(full, '[data-out="' + name + '"]', path.join(dir, name + "-" + (name === "icon" ? "1024" : SIZE[name].join("x")) + ".png"), LIMIT[name]);
}
// 字块四角要落在内切圆里，平台把图标裁成圆也不伤字
const far = await full.evaluate(() => {
  const b = document.querySelector('[data-out="icon"]').getBoundingClientRect(), r = document.createRange();
  r.selectNodeContents(document.querySelector('[data-out="icon"] .rows'));
  return Math.max(...[...r.getClientRects()].map(q => Math.max(...[[q.left, q.top], [q.right, q.top], [q.left, q.bottom], [q.right, q.bottom]]
    .map(([x, y]) => Math.hypot(x - b.left - 512, y - b.top - 512)))));
});
console.log("图标字块行框最远角离中心 " + Math.round(far) + " px（内切圆半径 512；行框比字形大，以自查图为准）");
if (checkDir) { fs.mkdirSync(checkDir, { recursive: true }); await shot(full, "[data-check]", path.join(checkDir, "icon-check.png")); }
await shot(await open(0.5), '[data-out="icon"]', path.join(dir, "icon-512.png"), LIMIT.icon);
await browser.close();
