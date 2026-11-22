// 诊断包回归（v00.03.03 P1 续）：scripts/pack-diag.mjs 生成的包只比 app/ 多一个诊断脚本和一行引用；诊断牌子显示页面内的几个时间点，不妨碍产品本身。
// PLAYWRIGHT_MODULE=/absolute/path/to/playwright CHROMIUM_PATH=/path/to/chromium node scripts/test-diag-browser.mjs
// 新端口、新上下文，诊断包生成在系统临时目录里，用完删掉；绝不操作用户预览存储，也不写 dist/。
// 量出来的毫秒数是桌面的，这里只核对「记到了、先后顺序对、显示出来了」；真机上的数只能真机看。
import { createRequire } from "node:module";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
import { buildDiag, DIAG_TAG } from "./pack-diag.mjs";
import { checkZip, zipRelease } from "./check-zip.mjs";
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const APP = fileURLToPath(new URL("../app/", import.meta.url));
const temp = fs.mkdtempSync(path.join(os.tmpdir(), "backronym-diag-"));
const root = path.join(temp, "app") + path.sep;
let browser, server;
try {
  // ---- 包的内容：只多一个文件、一行引用；app/ 没被动过 ----
  buildDiag(root);
  const walk = (dir, base = dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap(d => d.isDirectory() ? walk(path.join(dir, d.name), base) : [path.relative(base, path.join(dir, d.name))]);
  const skip = (f) => f.split(path.sep)[0] === "LICENSES" || f.split(path.sep).some(p => p.startsWith(".") || p === "_recovery");
  const src = walk(APP).filter(f => !skip(f)).sort(), out = walk(root).sort();
  assert.deepEqual(out.filter(f => f !== path.join("assets", "diag.js")), src, "诊断包里的文件 = app/ 的文件（去掉正式包也不带的）+ 诊断脚本");
  for (const f of src) if (f !== "index.html") assert.ok(fs.readFileSync(path.join(APP, f)).equals(fs.readFileSync(path.join(root, f))), "产品文件原样：" + f);
  const page = fs.readFileSync(path.join(root, "index.html"), "utf8");
  assert.equal(page.replace(DIAG_TAG + "\n  ", ""), fs.readFileSync(path.join(APP, "index.html"), "utf8"), "index.html 只多一行引用");
  assert.ok(page.indexOf(DIAG_TAG) > 0 && page.indexOf(DIAG_TAG) < page.indexOf("<link rel=\"stylesheet\"") && page.indexOf(DIAG_TAG) < page.indexOf("<script src=\"./assets/theme.js\">"), "诊断脚本排在样式表和第一个脚本前面");
  assert.equal(fs.existsSync(path.join(APP, "assets", "diag.js")), false, "app/ 里没有诊断脚本");
  assert.doesNotMatch(fs.readFileSync(path.join(APP, "index.html"), "utf8"), /diag/, "app/ 的页面不引用诊断脚本");
  assert.throws(() => buildDiag(root), /须不存在或为空/, "不往已有内容的目录里生成");
  const zip = path.join(temp, "diag.zip");
  zipRelease(root, zip); checkZip(zip); // 过容器的收包规则：十二种文件类型、只有根目录一个 index.html、小于一千万字节

  server = createServer(async (req, res) => {
    const file = path.resolve(root, "." + (req.url === "/" ? "/index.html" : req.url.split("?")[0]));
    if (!file.startsWith(root)) { res.writeHead(403).end(); return; }
    try {
      const type = { ".js": "text/javascript", ".css": "text/css", ".html": "text/html", ".woff2": "font/woff2" }[path.extname(file)];
      res.setHeader("Content-Type", type || "application/octet-stream");
      res.setHeader("Cache-Control", "no-store"); res.end(await readFile(file));
    } catch { res.writeHead(404).end(); }
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const url = "http://127.0.0.1:" + server.address().port, KEY = "backronym-draft-v2", DIAG = "backronym-diag-v1";
  browser = await chromium.launch({ headless: true, ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}) });
  { const make = browser.newContext.bind(browser); browser.newContext = options => make({ locale: "zh-CN", ...options }); } // v00.04.00 批 1：界面语言跟随环境，无头浏览器默认报英文；本脚本测的是中文界面
  const settled = (page) => page.waitForFunction(() => { const d = window.__backronymDiag; return d && d.mark.usable > 0 && d.mark.load > 0 && d.mark.fonts > 0; }, null, { timeout: 30000 });
  const panel = (page) => page.locator("[data-diag]").innerText();

  // ---- 没有草稿：进入场页 ----
  {
    const context = await browser.newContext({ viewport: { width: 375, height: 700 } });
    const page = await context.newPage(), errors = [];
    page.on("pageerror", e => errors.push(e.message));
    await page.goto(url); await settled(page);
    assert.match(await panel(page), /^诊 \d+ms #1$/, "收起时是一个小牌子：可用的毫秒数和第几次打开");
    const m = await page.evaluate(() => Object.assign({}, window.__backronymDiag.mark));
    assert.ok(m.head > 0 && m.head <= m.scripts && m.scripts <= m.load, "先后顺序：读到页面开头 ≤ 脚本执行完 ≤ load：" + JSON.stringify(m));
    assert.ok(m.usable >= m.head && m.fonts > 0, "可用与字体就绪都记到了：" + JSON.stringify(m));
    const files = await page.evaluate(() => window.__backronymDiag.files.map(f => f.name));
    for (const f of ["theme.js", "style.css", "lang/en/words.js", "core.js", "app.js"]) assert.ok(files.includes(f), "记到了 " + f + "：" + files.join("、"));
    assert.equal(files.includes("diag.js"), false, "诊断脚本自己不算在里面");
    await page.click("[data-diag]");
    const text = await panel(page);
    for (const s of ["诊断包 · 第 1 次打开", "页面内（毫秒，从页面开始加载算起）", "读到页面开头", "首次画出内容", "脚本全部执行完", "可用（入场页）", "页面 load", "字体就绪", "最慢的文件（等待 + 执行）", "设备", "Chrome/", "375×700", "最近几次（毫秒）", "收起", "清空记录"]) assert.ok(text.includes(s), "展开后有「" + s + "」：\n" + text);
    assert.equal(await page.evaluate(k => JSON.parse(localStorage.getItem(k)).length, DIAG), 1, "这一次记了一笔");
    assert.equal(await page.evaluate(k => localStorage.getItem(k), KEY), null, "诊断不碰草稿");
    // 牌子不妨碍产品：收起后照常填词、进编辑面
    await page.click('[data-diag] [data-act="toggle"]');
    assert.match(await panel(page), /^诊 \d+ms #1$/);
    const box = await page.locator("[data-diag]").boundingBox();
    const barBottom = await page.evaluate(() => document.querySelector(".top").getBoundingClientRect().bottom);
    assert.ok(box.width < 140 && box.height < 40 && box.x < 20 && box.y >= barBottom && box.y < barBottom + 12, "收起的牌子很小，在顶栏正下方的左边：" + JSON.stringify(box) + " 顶栏底 " + barBottom);
    assert.equal(await page.locator("[data-diag]").evaluate(n => getComputedStyle(n).zIndex), "25", "收起时在统一提示下面，不挡提示的字");
    await page.fill("#wordInput", "LIFE"); await page.click("#entryStart");
    await page.waitForFunction(() => document.getElementById("pagerLetters").children.length === 4);
    await page.waitForFunction(k => { const d = JSON.parse(localStorage.getItem(k) || "null"); return !!d && d.word === "LIFE"; }, KEY);
    // 再开一次：第 2 次，记了两笔，带着「距上次」；这回有草稿，直接进编辑面
    await page.reload(); await settled(page);
    assert.match(await panel(page), /^诊 \d+ms #2$/);
    await page.click("[data-diag]");
    const again = await panel(page);
    assert.ok(again.includes("诊断包 · 第 2 次打开") && /距上次 \d+ 秒/.test(again) && again.includes("可用（编辑面）"), "第二次打开：\n" + again);
    assert.equal(await page.locator("[data-diag] table tr").count(), 3, "最近几次：表头加两行");
    // 清空记录
    await page.click('[data-diag] [data-act="clear"]');
    assert.equal(await page.evaluate(k => localStorage.getItem(k), DIAG), null, "清空后记录没了");
    assert.ok(await page.evaluate(k => !!localStorage.getItem(k), KEY), "清空诊断记录不碰草稿");
    assert.deepEqual(errors, []);
    await context.close();
  }

  // ---- 有一份法语草稿：别的语言的词包是页面自己后加载的，也要记到 ----
  {
    const context = await browser.newContext({ viewport: { width: 375, height: 700 } });
    await context.addInitScript(({ KEY }) => {
      if (sessionStorage.getItem("seeded")) return;
      const word = "LIVRE";
      localStorage.setItem(KEY, JSON.stringify({ v: 2, lang: "fr", word, filler: "", view: "single", titleRuns: null, picks: [...word].map(() => null), glosses: [...word].map(() => ""), glossAuto: [...word].map(() => true), captions: [...word].map(() => ""), keys: [...word].map(() => 0), t: Date.now() - 5000 }));
      sessionStorage.setItem("seeded", "1");
    }, { KEY });
    const page = await context.newPage(), errors = [];
    page.on("pageerror", e => errors.push(e.message));
    await page.goto(url); await settled(page);
    await page.waitForFunction(() => window.__backronymDiag.files.some(f => f.name === "lang/fr/words.js"), null, { timeout: 15000 });
    const fr = await page.evaluate(() => window.__backronymDiag.files.find(f => f.name === "lang/fr/words.js"));
    assert.ok(fr.dur >= 0 && fr.at > 0 && !fr.bad, "法语词包的加载记到了：" + JSON.stringify(fr));
    await page.click("[data-diag]");
    assert.ok((await panel(page)).includes("lang/fr/words.js"), "展开后看得到法语词包");
    assert.deepEqual(errors, []);
    await context.close();
  }

  // ---- 窄屏：展开的面板不撑出屏幕 ----
  {
    const context = await browser.newContext({ viewport: { width: 320, height: 568 } });
    const page = await context.newPage();
    await page.goto(url); await settled(page);
    await page.click("[data-diag]");
    const box = await page.locator("[data-diag]").boundingBox();
    assert.ok(box.x >= 0 && box.x + box.width <= 320 && box.y >= 0 && box.y + box.height <= 568, "320 宽下面板在屏幕里：" + JSON.stringify(box));
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), "不横滚");
    await context.close();
  }
  console.log("browser diag ok: package = app + one script + one line, zip rules, pill + panel, marks order, per-file timings, history across reloads, late language pack, 320 width");
} finally {
  if (browser) await browser.close();
  if (server) server.close();
  fs.rmSync(temp, { recursive: true, force: true });
}
