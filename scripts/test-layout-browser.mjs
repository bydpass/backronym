// v00.03.03 批 L2 / L3 回归：版式页与「表格」主题。使用现有 Playwright，不安装依赖；新端口、新上下文，绝不操作用户预览存储。
// PLAYWRIGHT_MODULE=/absolute/path/to/playwright CHROMIUM_PATH=/path/to/chromium node scripts/test-layout-browser.mjs
// 覆盖：提示行「版式」入口；版式页（预设、三组开关、3:2 时「左右」停用、小样、320 宽不横滚、点按区 44px、Esc 关闭还焦点）；
// 改了版式卡立刻跟着变（居中、靠右、图版比例与左右、图在下、隐去线饰与格子进度、配文引号）；版式随草稿保存、刷新后还在；没动过版式的作品不写这个字段；
// 配文框在开了引号时自己显示；非默认版式能导出；列阵跟「词与释义」走；
// 「表格」主题：固定深色、深浅停用并写明原因、白图框与浅灰大字母、换回别的主题恢复。
// 自查后补：键盘（Tab 圈在页内、已选中的预设上按空格或回车恢复预设）；版式页开着时草稿到期（页面收起、新作品回对开）；
// 标题颜色（点过「墨色」的字换主题跟着走；自选的白字换深浅、经过表格再回来都还是白）。
// 真机测试后补：自选色等于墨色也不跟主题变；「图在下」时候选栏跟着词与释义上移；改单词后默认图的取景沿用到新格。
// 外部复审返工后补：图版三档比例下取景框、拖动边界、卡面与导出取同一块（L2-A1）；表格里自选纯白与点回墨色按选区分开，换主题、重开不混（L3-A1）。
// L3 第二次返工后补：跨粗斜体的选区只改选区、原生撤销重做（L3-A2）；任意自选色留得住（L3-A3）；白、朱、墨混排，带记号的颜色，空标题先选色再打字。
// L4（真机第一轮的界面修改）后补：带框的小按钮与点按区、「改单词」、main 与一级标题、版式页的结构文案与小样切换、默认图调取景、窄屏顶栏只留字。
// 真机上的软键盘、输入法、保存相册只能真机看。
import { createRequire } from "node:module";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
// 网页版「导出图片」下载的 zip（只存不压）：按中央目录逐条取出 [{ name, data }]
function unzipStored(zip) {
  const out = [];
  for (let p = zip.readUInt32LE(zip.length - 6), k = 0; k < zip.readUInt16LE(zip.length - 12); k++) {
    const len = zip.readUInt16LE(p + 28), size = zip.readUInt32LE(p + 20), at = zip.readUInt32LE(p + 42), body = at + 30 + zip.readUInt16LE(at + 26);
    out.push({ name: zip.toString("utf8", p + 46, p + 46 + len), data: zip.subarray(body, body + size) });
    p += 46 + len;
  }
  return out;
}
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
// 合成草稿：四格都有词、释义、配文，没有配图
const WORDS = ["lake", "ice", "fire", "echo"];
const LIFE = { v: 2, word: "LIFE", filler: "小满", view: "single", titleRuns: null,
  picks: WORDS.map(w => [w, ""]), glosses: ["湖泊", "冰", "火", "回声"], glossAuto: WORDS.map(() => false),
  captions: WORDS.map(() => "短配文"), keys: WORDS.map(() => 0) };
let browser;
try {
  browser = await chromium.launch({ headless: true, ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}) });
  { const make = browser.newContext.bind(browser); browser.newContext = options => make({ locale: "zh-CN", ...options }); } // v00.04.00 批 1：界面语言跟随环境，无头浏览器默认报英文；本脚本测的是中文界面
  async function pageFor({ draft = LIFE, width = 375, height = 700, age = 5000 } = {}) {
    const context = await browser.newContext({ viewport: { width, height } });
    await context.addInitScript(({ draft, KEY, age }) => {
      if (!sessionStorage.getItem("seeded")) {
        if (draft) localStorage.setItem(KEY, JSON.stringify({ ...draft, t: Date.now() - age }));
        sessionStorage.setItem("seeded", "1");
      }
    }, { draft, KEY, age });
    // 记下每次画照片的参数（取景预览与卡面、导出各画在哪一块），供图版比例那一组核对
    await context.addInitScript(() => {
      window.cropDraws = []; const real = CanvasRenderingContext2D.prototype.drawImage;
      CanvasRenderingContext2D.prototype.drawImage = function (...a) {
        if (a[0] instanceof HTMLImageElement) window.cropDraws.push({ preview: this.canvas.id === "cropCanvas", args: a.slice(1), iw: a[0].naturalWidth, ih: a[0].naturalHeight });
        return real.apply(this, a);
      };
    });
    const page = await context.newPage(); const errors = [];
    page.on("pageerror", e => errors.push(e.message));
    await page.goto(url);
    await ready(page);
    return { page, context, errors };
  }
  const ready9 = async (page) => { await page.waitForFunction(() => document.getElementById("pagerLetters").children.length === 9); await page.evaluate(() => document.fonts && document.fonts.ready); };
  const ready = async (page) => {
    await page.waitForFunction(() => document.getElementById("pagerLetters").children.length === 4);
    await page.evaluate(() => document.fonts && document.fonts.ready);
  };
  // 卡上某类框的版式坐标（1080 制，app-view.js 写在 data-* 上）与文字
  const boxes = (page, role) => page.evaluate(role => Array.from(document.querySelectorAll("#mirror .b-" + role), n => ({ x: +n.getAttribute("data-x"), w: +n.getAttribute("data-w"), y: +n.getAttribute("data-y"), text: n.textContent })), role);
  const count = (page, role) => page.locator("#mirror .b-" + role).count();
  const saved = (page) => page.evaluate(KEY => JSON.parse(localStorage.getItem(KEY) || "null"), KEY);
  const savedLayout = async (page, test, what) => {
    await page.waitForFunction(({ KEY, src }) => { const d = JSON.parse(localStorage.getItem(KEY) || "null"); return !!d && new Function("l", "return " + src)(d.layout); }, { KEY, src: test }, { timeout: 5000 }).catch(() => { throw new Error("草稿里的版式没等到：" + what); });
  };
  const pick = (page, key, nth) => page.click(`#lay-${key} label:nth-child(${nth})`);
  const near = (a, b, tol = 2) => Math.abs(a - b) <= tol;
  const noHScroll = (page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);

  // ---- 版式页：入口、预设、开关，卡立刻跟着变 ----
  {
    const { page, context, errors } = await pageFor();
    assert.equal(await page.locator("#toLayout").isHidden(), false, "有单词时提示行有「版式」");
    assert.equal(await page.locator(".views").getAttribute("aria-label"), "视图", "顶栏「单图 / 列阵」的读屏名改叫视图");
    for (const r of ["rule", "bar"]) assert.equal(await count(page, r), 1, "默认对开：画 " + r);
    assert.equal(await count(page, "info-folio"), 0, "默认对开：不画格子进度（真机反馈 F4）");
    assert.equal((await boxes(page, "caption"))[0].text, "短配文", "默认不加引号");

    await page.click("#toLayout");
    assert.equal(await page.locator("#layoutPage").isHidden(), false);
    assert.equal(await page.evaluate(() => document.activeElement.id), "layoutClose", "打开后焦点在关闭");
    assert.equal(await page.locator('input[name="lay-base"]:checked').getAttribute("value"), "folio");
    assert.equal(await page.locator("#lay-plateX").getAttribute("aria-disabled"), "true", "图版 3:2 时「左右」停用");
    assert.equal(await page.locator("#layWhy").isHidden(), false, "并写明原因");
    assert.ok(await page.evaluate(() => { const c = document.querySelector("#layPrev canvas"); return !!c && c.width > 0 && c.getBoundingClientRect().width > 80; }), "顶上有小样");
    assert.equal(await page.locator("#layRows .lay-row").count(), 10, "十个开关");

    // 预设「居中」
    await page.click("#layBase label:nth-child(2)");
    for (const r of ["info-folio", "rule", "bar"]) assert.equal(await count(page, r), 0, "居中预设：不画 " + r);
    assert.equal(await count(page, "info-filler"), 1, "填表人保留");
    assert.equal((await boxes(page, "caption"))[0].text, "“短配文”", "居中预设配文带引号");
    for (const r of ["word", "gloss", "caption"]) { const b = (await boxes(page, r))[0]; assert.ok(near(b.x + b.w / 2, 540), r + " 居中：" + JSON.stringify(b)); }
    assert.equal(await page.locator("#live").textContent(), "版式：居中");
    assert.match(await page.locator("#layBaseWhy").textContent(), /^选了预设/);
    await savedLayout(page, 'l && l.base === "center" && l.text === "center" && l.quote === true && l.prog === false', "居中预设");

    // 图版比例与左右
    await pick(page, "ratio", 2);
    assert.equal(await page.locator("#lay-plateX").getAttribute("aria-disabled"), null, "1:1 时「左右」可用");
    assert.equal(await page.locator("#layWhy").isHidden(), true);
    let p = (await boxes(page, "plate"))[0];
    assert.deepEqual([p.x, p.w], [240, 600], "1:1 居中");
    assert.match(await page.locator("#layBaseWhy").textContent(), /^已调整。再点一次「居中」/);
    await pick(page, "plateX", 3);
    assert.equal((await boxes(page, "plate"))[0].x, 400, "1:1 靠右");
    // 图版上的透明按钮跟着图版走
    assert.ok(await page.evaluate(() => { const k = +document.getElementById("card").getAttribute("data-k"), h = document.getElementById("plateHit"); return Math.abs(parseFloat(h.style.left) - 400 * k) < 0.5 && Math.abs(parseFloat(h.style.width) - 600 * k) < 0.5; }), "配图按钮跟着图版");
    // 图在下
    await pick(page, "order", 2);
    p = (await boxes(page, "plate"))[0];
    assert.equal(p.y, 780, "图在下：图版放到 780");
    assert.ok(await page.evaluate(() => document.getElementById("glossCtl").getBoundingClientRect().bottom < document.querySelector("#mirror .b-plate").getBoundingClientRect().top), "图在下：释义框在图版上面");
    assert.ok(await page.evaluate(() => { const c = document.getElementById("capCtl").getBoundingClientRect(), m = document.querySelector("#mirror .b-caption").getBoundingClientRect(); return Math.abs(c.top - m.top) < 14; }), "图在下：配文框跟着配文");
    // 文字与配文是两个开关
    await pick(page, "text", 3);
    for (const r of ["word", "gloss"]) { const b = (await boxes(page, r))[0]; assert.ok(near(b.x + b.w, 1000), r + " 靠右：" + JSON.stringify(b)); }
    { const b = (await boxes(page, "caption"))[0]; assert.ok(near(b.x + b.w / 2, 540), "配文仍居中"); }
    assert.equal(await page.evaluate(() => document.getElementById("glossCtl").style.textAlign), "right", "释义框里的字也靠右");
    assert.equal(await page.evaluate(() => document.getElementById("capCtl").style.textAlign), "center", "配文框里的字居中");
    await pick(page, "cap", 1);
    assert.equal((await boxes(page, "caption"))[0].x, 80, "配文靠左");
    // 标题
    await pick(page, "title", 2);
    assert.equal(await page.evaluate(() => document.getElementById("title").style.textAlign), "center", "标题框居中");
    // 显示
    await pick(page, "prog", 1); assert.equal(await count(page, "info-folio"), 1, "格子进度：显示");
    await pick(page, "filler", 2); assert.equal(await count(page, "info-filler"), 0, "填表人：隐藏");
    await pick(page, "deco", 1); assert.equal(await count(page, "rule") + await count(page, "bar"), 2, "线饰：显示");
    await pick(page, "quote", 2); assert.equal((await boxes(page, "caption"))[0].text, "短配文", "配文引号：不加");
    await savedLayout(page, 'l && l.base === "center" && l.ratio === "1:1" && l.plateX === "right" && l.order === "text" && l.text === "right" && l.cap === "left" && l.title === "center" && l.prog === true && l.filler === false && l.deco === true && l.quote === false', "逐项拨过的开关");

    // 再点一次预设：恢复
    await page.click("#layBase label:nth-child(2)");
    p = (await boxes(page, "plate"))[0];
    assert.deepEqual([p.x, p.y, p.w], [80, 290, 920], "再点预设恢复：图版 3:2 占满");
    assert.equal((await boxes(page, "caption"))[0].text, "“短配文”");
    assert.equal(await page.locator('#lay-plateX input:disabled').count(), 3, "恢复成 3:2 后「左右」又停用");
    assert.equal(await page.locator("#layWhy").isHidden(), false);

    // 键盘：Tab 圈在这一页里。居中预设下最后一组（配文引号）选中的是第一个「加」，Tab 停在它上面，再按要回到「关闭」而不是漏到背后的页面
    const active = () => page.evaluate(() => { const a = document.activeElement; return a.id || (a.name ? a.name + ":" + a.value : a.tagName); });
    await page.focus('input[name="lay-quote"]:checked');
    assert.equal(await active(), "lay-quote:0", "居中预设：配文引号选着第一个");
    await page.keyboard.press("Tab");
    assert.equal(await active(), "layoutClose", "最后一组按 Tab 回到「关闭」");
    await page.keyboard.press("Shift+Tab");
    assert.equal(await active(), "lay-quote:0", "「关闭」上按 Shift+Tab 回到最后一组选中的那个");
    // 键盘：在已选中的预设上按空格 / 回车也能恢复成预设（浏览器这时不给 click）
    for (const key of ["Space", "Enter"]) {
      await pick(page, "deco", 1);
      assert.match(await page.locator("#layBaseWhy").textContent(), /^已调整/);
      await page.focus('input[name="lay-base"]:checked');
      await page.keyboard.press(key);
      assert.match(await page.locator("#layBaseWhy").textContent(), /^选了预设/, "已选中的预设上按 " + key + "：恢复成预设");
      assert.equal(await count(page, "rule") + await count(page, "bar"), 0, key + " 恢复后线饰又隐去");
    }

    // 页面本身：每格点按区 44px、不横滚、Esc 关闭后焦点还给入口
    assert.ok(await page.evaluate(() => Array.from(document.querySelectorAll("#layoutPage .set-opt span")).every(s => s.getBoundingClientRect().height >= 44)), "每个选项高 44px");
    assert.ok(await noHScroll(page), "375 宽版式页不横滚");
    await page.keyboard.press("Escape");
    assert.equal(await page.locator("#layoutPage").isHidden(), true);
    assert.equal(await page.evaluate(() => document.activeElement.id), "toLayout", "关闭后焦点还给「版式」");
    assert.equal(await page.locator("#layPrev canvas").count(), 0, "关着时不留小样画布");

    // 配文框：开了引号时，写配文期间自己显示，镜像先藏；离开后恢复
    await page.focus("#capCtl");
    assert.ok(await page.evaluate(() => document.getElementById("capCtl").classList.contains("own") && document.getElementById("card").classList.contains("cap-own") && getComputedStyle(document.querySelector("#mirror .b-caption")).visibility === "hidden"), "写配文时由配文框自己显示");
    await page.evaluate(() => document.getElementById("capCtl").blur());
    assert.ok(await page.evaluate(() => !document.getElementById("capCtl").classList.contains("own") && !document.getElementById("card").classList.contains("cap-own")), "离开后镜像带着引号回来");

    // 刷新后版式还在（随草稿走）
    await page.reload(); await ready(page);
    for (const r of ["info-folio", "rule", "bar"]) assert.equal(await count(page, r), 0, "刷新后仍是居中：不画 " + r);
    assert.equal((await boxes(page, "caption"))[0].text, "“短配文”", "刷新后配文仍带引号");
    await page.click("#toLayout");
    assert.equal(await page.locator('input[name="lay-base"]:checked').getAttribute("value"), "center", "刷新后版式页选着居中");
    await page.keyboard.press("Escape");

    // 列阵跟「词与释义」走；非默认版式能导出
    await page.click("#viewGrid");
    assert.equal(await count(page, "info-count") + await count(page, "rule") + await count(page, "bar"), 0, "居中的列阵不画格数、墨线、墨条");
    { const pl = await boxes(page, "plate"), w = await boxes(page, "word"); assert.ok(pl.length === 4 && near(w[0].x + w[0].w / 2, pl[0].x + 150), "列阵每格的词在图框下居中"); }
    await page.click("#toLayout");
    assert.ok(await page.evaluate(() => { const c = document.querySelector("#layPrev canvas"); return !!c && c.width > c.height; }), "列阵视图下小样是这一张列阵（横图）");
    await page.keyboard.press("Escape");
    await page.click("#viewSingle");
    await page.click("#finish");
    await page.waitForFunction(() => /失败/.test(document.getElementById("finMsg").textContent) || (!document.getElementById("exportView").hidden && !document.getElementById("exportView").disabled), null, { timeout: 20000 });
    assert.ok(!/失败/.test(await page.locator("#finMsg").textContent()), "居中版式能导出");
    // 11-23：网页版点「导出图片」直接下载一个 zip（不再开长按 / 右键保存页）
    const [dl] = await Promise.all([page.waitForEvent("download"), page.click("#exportView")]);
    assert.equal(dl.suggestedFilename(), "LIFE.zip", "包以单词命名");
    const names = unzipStored(await readFile(await dl.path())).map(f => f.name);
    assert.deepEqual(names, ["LIFE1.jpg", "LIFE2.jpg", "LIFE3.jpg", "LIFE4.jpg"], "包里四张单图，单词加序号");
    assert.equal(await page.locator("#results").isVisible(), false, "不再弹导出结果页");
    assert.deepEqual(errors, [], "页面没有报错");
    await context.close();
  }

  // ---- 没动过版式的作品：草稿里不写这个字段（旧稿打开后内容不变）----
  {
    const { page, context, errors } = await pageFor();
    await page.click("#viewGrid"); // 换一下视图，触发一次保存（内容没变的话不会重写）
    await page.waitForFunction(({ KEY }) => { const d = JSON.parse(localStorage.getItem(KEY) || "null"); return !!d && d.view === "grid"; }, { KEY }, { timeout: 5000 });
    assert.ok(!("layout" in (await saved(page))), "没动过版式：草稿没有 layout 字段");
    await page.click("#viewSingle");
    // 选了居中再点回对开：字段也不留
    await page.click("#toLayout"); await page.click("#layBase label:nth-child(2)");
    await savedLayout(page, 'l && l.base === "center"', "先选居中");
    await page.click("#layBase label:nth-child(1)");
    await page.waitForFunction(({ KEY }) => !("layout" in JSON.parse(localStorage.getItem(KEY))), { KEY }, { timeout: 5000 });
    assert.deepEqual(errors, []);
    await context.close();
  }

  // ---- 损坏的版式字段：落回对开，不报错 ----
  for (const bad of ["center", 7, null, { text: "sideways", ratio: "16:9", quote: "yes" }]) {
    const { page, context, errors } = await pageFor({ draft: { ...LIFE, layout: bad } });
    for (const r of ["rule", "bar"]) assert.equal(await count(page, r), 1, "损坏的版式字段落回对开：" + JSON.stringify(bad));
    assert.equal(await count(page, "info-folio"), 0, "落回的对开不画格子进度：" + JSON.stringify(bad));
    assert.equal((await boxes(page, "caption"))[0].text, "短配文");
    assert.deepEqual(errors, []);
    await context.close();
  }

  // ---- 320 宽：版式页与设置页（五个主题）不横滚 ----
  {
    const { page, context, errors } = await pageFor({ width: 320, height: 640 });
    await page.click("#toLayout");
    assert.ok(await noHScroll(page), "320 宽版式页不横滚");
    assert.ok(await page.evaluate(() => Array.from(document.querySelectorAll("#layoutPage .set-opt span")).every(s => s.scrollWidth <= s.clientWidth + 1)), "320 宽选项文字不溢出");
    // 往下滚：标题栏和小样那一块仍钉在顶上
    await page.evaluate(() => { document.getElementById("layoutPage").scrollTop = 400; });
    assert.ok(await page.evaluate(() => { const t = document.querySelector("#layoutPage .lay-top").getBoundingClientRect(), b = document.querySelector("#layoutPage .page-top").getBoundingClientRect(); return Math.abs(b.top) < 1 && Math.abs(t.top - b.bottom) < 1; }), "往下滚时小样与预设钉在标题栏下面");
    await page.keyboard.press("Escape");
    await page.click("#settingsOpen");
    assert.equal(await page.locator('#skinGroup input[name="skin"]').count(), 5, "五个主题");
    assert.ok(await noHScroll(page), "320 宽设置页不横滚");
    // 五个主题挤在一行：换到每个主题（界面字体跟着换）后，五个主题名和「仅浅色 / 仅深色」都放得下、不出省略号
    for (let k = 1; k <= 5; k++) {
      await page.click(`#skinGroup label:nth-child(${k})`); await page.evaluate(() => document.fonts.ready); await page.waitForTimeout(250);
      assert.ok(await page.evaluate(() => Array.from(document.querySelectorAll("#skinGroup .set-th-n, #skinGroup .set-th-x")).every(n => n.scrollWidth <= n.clientWidth)), "320 宽：选着第 " + k + " 个主题时主题名都放得下");
    }
    assert.deepEqual(errors, []);
    await context.close();
  }

  // ---- 「表格」主题：只有深色 ----
  {
    const { page, context, errors } = await pageFor();
    await page.click("#settingsOpen");
    await page.click("#skinGroup label:nth-child(5)");
    assert.deepEqual(await page.evaluate(() => [document.documentElement.getAttribute("data-skin"), document.documentElement.getAttribute("data-theme")]), ["table", "dark"], "选表格：固定深色");
    assert.equal(await page.locator("#modeGroup").getAttribute("aria-disabled"), "true", "深浅停用");
    assert.equal(await page.locator("#skinGroup label:nth-child(5) .set-th-x").textContent(), "仅深色", "原因写在主题格里（下面那行说明 11-21 去掉）");
    assert.equal(await page.locator("#live").textContent(), "主题：表格");
    assert.equal(await page.evaluate(() => getComputedStyle(document.body).backgroundColor), "rgb(0, 0, 0)", "界面黑底");
    assert.equal(await page.evaluate(() => getComputedStyle(document.querySelector("#mirror .b-plate")).backgroundColor), "rgb(255, 255, 255)", "没配图的图版是白框");
    assert.equal(await page.evaluate(() => getComputedStyle(document.querySelector("#mirror .b-giant")).color), "rgb(227, 227, 227)", "白框里的大字母是浅灰");
    assert.equal(await page.evaluate(() => getComputedStyle(document.querySelector("#mirror .b-word .key")).color), "rgb(229, 96, 79)", "首字母用强调色");
    // 系统是浅色、刷新后仍是深色
    await page.emulateMedia({ colorScheme: "light" });
    await page.reload(); await ready(page);
    assert.deepEqual(await page.evaluate(() => [document.documentElement.getAttribute("data-skin"), document.documentElement.getAttribute("data-theme")]), ["table", "dark"], "刷新后仍是表格、深色");
    // 换回分离派：恢复「跟随系统」；换成 fandom：固定浅色，原因换成只有浅色
    await page.click("#settingsOpen");
    await page.click("#skinGroup label:nth-child(4)");
    assert.deepEqual(await page.evaluate(() => [document.documentElement.getAttribute("data-skin"), document.documentElement.getAttribute("data-theme")]), ["secession", null], "换回分离派：恢复跟随系统");
    assert.equal(await page.locator("#modeGroup").getAttribute("aria-disabled"), null);
    assert.equal(await page.evaluate(() => getComputedStyle(document.querySelector("#mirror .b-plate")).backgroundColor), "rgb(230, 224, 207)", "别的主题图版仍是图版色");
    await page.click("#skinGroup label:nth-child(1)");
    assert.equal(await page.evaluate(() => document.documentElement.getAttribute("data-theme")), "light");
    assert.equal(await page.locator("#skinGroup label:nth-child(1) .set-th-x").textContent(), "仅浅色"); assert.equal(await page.locator("#modeWhy").count(), 0);
    assert.deepEqual(errors, []);
    await context.close();
  }

  // ---- 表格的墨色是纯白：标题里「点了墨色」的字换主题后要跟着走，别的主题里自选的白字不能被当成墨色 ----
  {
    const { page, context, errors } = await pageFor();
    // 标题框自己的颜色带墨色记号（不透明度 254/255，见 app-title.js 的 markInk）：比颜色时去掉它，另用 marked 看是不是跟墨色走
    const titleColors = () => page.evaluate(() => Array.from(document.querySelectorAll("#title *")).map(n => getComputedStyle(n).color).concat(getComputedStyle(document.getElementById("title")).color).map(c => c.replace(/^rgba\((\d+), (\d+), (\d+), [\d.]+\)$/, "rgb($1, $2, $3)")));
    const setSkin = async (nth) => { await page.click("#settingsOpen"); await page.click(`#skinGroup label:nth-child(${nth})`); await page.keyboard.press("Escape"); };
    await page.locator("#title").fill("Color");
    // 外部复审 L3-A1～A3：表格的墨色就是纯白。「跟墨色走」和「自选的纯白」要按选区分得开，换主题、保存、重开、撤销重做都不混
    const mod = process.platform === "darwin" ? "Meta" : "Control";
    const selectAll = async () => { await page.locator("#title").focus(); await page.keyboard.press(mod + "+A"); await page.waitForTimeout(100); }; // 选区变化是异步记下来的
    const select = async (a, b) => { // 选中标题里第 a 到 b 个字（不管它们落在哪几个 span 里）
      await page.locator("#title").focus();
      await page.evaluate(([a, b]) => {
        const w = document.createTreeWalker(document.getElementById("title"), NodeFilter.SHOW_TEXT), r = document.createRange(); let at = 0, on = false;
        for (let n = w.nextNode(); n; n = w.nextNode()) { const end = at + n.nodeValue.length; if (!on && a < end) { r.setStart(n, a - at); on = true; } if (on && b <= end) { r.setEnd(n, b - at); break; } at = end; }
        const s = getSelection(); s.removeAllRanges(); s.addRange(r);
      }, [a, b]);
      await page.waitForTimeout(100); // 选区变化是异步记下来的
    };
    const custom = (c) => page.locator("#tcolorCustom").evaluate((n, c) => { n.value = c; n.dispatchEvent(new Event("change", { bubbles: true })); }, c);
    const tool = (q) => page.click("#kbTools " + q);
    // 每个字现在的样子：字、粗、斜、看上去的颜色、是不是跟墨色走（带墨色记号）
    const chars = () => page.evaluate(() => { const out = [], w = document.createTreeWalker(document.getElementById("title"), NodeFilter.SHOW_TEXT);
      for (let n = w.nextNode(); n; n = w.nextNode()) { const cs = getComputedStyle(n.parentNode), m = cs.color.match(/[\d.]+/g), ink = m.length > 3 && +m[3] < 1;
        for (const ch of n.nodeValue) out.push(ch + (parseInt(cs.fontWeight, 10) >= 600 ? "b" : "") + (cs.fontStyle !== "normal" ? "i" : "") + " " + (ink ? "ink" : "#" + m.slice(0, 3).map(v => ("0" + (+v).toString(16)).slice(-2)).join(""))); }
      return out; });
    const savedRuns = (want) => page.waitForFunction(({ KEY, want }) => { const d = JSON.parse(localStorage.getItem(KEY) || "null"); return !!d && JSON.stringify((d.titleRuns || []).map(r => [r.t, r.c])) === want; }, { KEY, want: JSON.stringify(want) }, { timeout: 5000 }).catch(async () => { throw new Error("草稿里的标题没等到：" + JSON.stringify(want) + "，实际 " + JSON.stringify(((await saved(page)) || {}).titleRuns)); });
    const W = "rgb(255, 255, 255)", INK = "rgb(42, 42, 42)"; // 纯白；fandom 的墨色
    await setSkin(5);
    // ① 表格里给跟墨色走的标题自选纯白：草稿记成自选色（内核原本会当成「已经是白的」而不写）
    await selectAll(); await custom("#ffffff");
    assert.deepEqual(await chars(), ["Cb #ffffff", "ob #ffffff", "lb #ffffff", "ob #ffffff", "rb #ffffff"], "表格里自选纯白：每个字都是自选的白");
    await savedRuns([["Color", "#ffffff"]]);
    // ② 再点「墨色」：回到跟墨色走；换到 fandom 跟着变成 fandom 的墨色，不留白字压白底
    await selectAll(); await tool('[data-color="default"]');
    assert.ok((await chars()).every(c => / ink$/.test(c)), "点「墨色」：每个字都跟墨色走：" + await chars());
    assert.ok((await titleColors()).every(c => c === W), "表格里标题是白字");
    await savedRuns([["Color", null]]);
    await setSkin(1);
    assert.ok((await titleColors()).every(c => c === INK), "换到 fandom：点过墨色的标题跟着变成墨色：" + await titleColors());
    // ③ 同一个标题里混排：整段自选纯白，再把前两个字点回墨色。各记各的，换主题、重开后都还分得开
    await setSkin(5);
    await selectAll(); await custom("#ffffff");
    await select(0, 2); await tool('[data-color="default"]');
    await savedRuns([["Co", null], ["lor", "#ffffff"]]);
    assert.ok((await titleColors()).every(c => c === W), "表格里两段看上去都是白的");
    await setSkin(1);
    assert.deepEqual(await chars(), ["Cb ink", "ob ink", "lb #ffffff", "ob #ffffff", "rb #ffffff"], "换到 fandom：前两个字跟墨色走，后面仍是自选的白");
    assert.match(await page.locator("#toast").innerText(), /容易看不清/, "自选的白在浅底上有提醒");
    await page.reload(); await ready(page);
    assert.deepEqual(await chars(), ["Cb ink", "ob ink", "lb #ffffff", "ob #ffffff", "rb #ffffff"], "重开后还是这样");
    await savedRuns([["Co", null], ["lor", "#ffffff"]]);
    // ④ L3-A2：跨粗体、斜体的选区。AB 去粗、CD 斜体，整段自选纯白，再只把 BC 点回墨色：
    //    选区外的 A、D、E 仍是自选的白，粗斜格式一个不变；原生撤销回到整段白，重做又回来；换主题、重开后不变
    await setSkin(5);
    await page.locator("#title").fill("ABCDE");
    await select(0, 2); await tool('[data-cmd="bold"]');
    await select(2, 4); await tool('[data-cmd="italic"]');
    await selectAll(); await custom("#ffffff");
    const allWhite = ["A #ffffff", "B #ffffff", "Cbi #ffffff", "Dbi #ffffff", "Eb #ffffff"], mixed = ["A #ffffff", "B ink", "Cbi ink", "Dbi #ffffff", "Eb #ffffff"];
    assert.deepEqual(await chars(), allWhite, "整段自选纯白，格式不变");
    await select(1, 3); await tool('[data-color="default"]');
    assert.deepEqual(await chars(), mixed, "只把 BC 点回墨色：选区外的白与粗斜格式都在");
    await savedRuns([["A", "#ffffff"], ["B", null], ["C", null], ["D", "#ffffff"], ["E", "#ffffff"]]); // 草稿里的分段还按粗斜体切开
    await page.locator("#title").focus(); await page.keyboard.press(mod + "+z");
    assert.deepEqual(await chars(), allWhite, "撤销：回到整段白");
    await page.keyboard.press(mod + "+Shift+z");
    assert.deepEqual(await chars(), mixed, "重做：又是 BC 墨色、其余白");
    await savedRuns([["A", "#ffffff"], ["B", null], ["C", null], ["D", "#ffffff"], ["E", "#ffffff"]]); // 草稿里的分段还按粗斜体切开
    await setSkin(1);
    assert.deepEqual(await chars(), mixed, "换到 fandom：还是这样");
    await page.reload(); await ready(page);
    assert.deepEqual(await chars(), mixed, "重开后还是这样");
    // ⑤ L3-A3：任意合法的自选色都留得住。首字自选 #010203，再只改末字，首字不动；撤销只退末字
    await setSkin(5);
    await page.locator("#title").fill("ABCDE"); // 新填的字沿用原来第一个字的格式和颜色：先整段点回墨色，下面只比颜色
    await selectAll(); await tool('[data-color="default"]');
    const colors = async () => (await chars()).map(c => c[0] + c.slice(c.indexOf(" ")));
    await select(0, 1); await custom("#010203");
    await select(4, 5); await custom("#ea4444");
    assert.deepEqual(await colors(), ["A #010203", "B ink", "C ink", "D ink", "E #ea4444"], "改末字的颜色不碰首字");
    await savedRuns([["A", "#010203"], ["BCD", null], ["E", "#ea4444"]]);
    await page.locator("#title").focus(); await page.keyboard.press(mod + "+z");
    assert.deepEqual(await colors(), ["A #010203", "B ink", "C ink", "D ink", "E ink"], "撤销：只退末字，首字的颜色还在");
    await selectAll(); await tool('[data-color="default"]');
    // ⑥ 自我复审补：白、朱、墨三种混排，换主题后各是各的（朱跟着换成新主题的强调色）
    await selectAll(); await custom("#ffffff");
    await select(1, 3); await tool('[data-color="red"]');
    await select(2, 4); await tool('[data-color="default"]');
    assert.deepEqual(await colors(), ["A #ffffff", "B #e5604f", "C ink", "D ink", "E #ffffff"], "表格里：白、朱、墨、墨、白");
    await savedRuns([["A", "#ffffff"], ["B", "red"], ["CD", null], ["E", "#ffffff"]]);
    await setSkin(1);
    assert.deepEqual(await colors(), ["A #ffffff", "B #990000", "C ink", "D ink", "E #ffffff"], "换到 fandom：朱换成 fandom 的强调色，白还是白，墨跟着走");
    // ⑦ 自我复审补：有的内核点「墨色」时会把带记号的颜色直接写到字上（这里手工写一个来模拟），也要认成跟墨色走
    await setSkin(5);
    await page.evaluate(() => { const t = document.getElementById("title"), sp = document.createElement("span"); sp.style.color = getComputedStyle(t).color; sp.textContent = "ABCDE"; t.textContent = ""; t.appendChild(sp); t.dispatchEvent(new Event("input", { bubbles: true })); });
    assert.equal(await page.evaluate(() => document.querySelector("#title span").style.color), "rgba(255, 255, 255, 0.996)", "模拟：字上写着带墨色记号的颜色");
    await savedRuns([["ABCDE", null]]);
    // ⑧ 自我复审补：空标题先选纯白再打字，打出来的是自选的白（表格里原先会被当成墨色）
    await selectAll(); await page.keyboard.press("Backspace");
    await custom("#ffffff");
    await page.keyboard.type("XY");
    assert.deepEqual(await colors(), ["X #ffffff", "Y #ffffff"], "空标题先选白再打字");
    await savedRuns([["XY", "#ffffff"]]);
    await selectAll(); await tool('[data-color="default"]');
    await page.locator("#title").fill("Color");
    // ⑨ 真机测试后用户定（11-20）：自选色正好等于某个主题的墨色，也按自选色保留，不跟主题变（fandom 的墨色 #2a2a2a，换到分离派·深仍是它）
    await setSkin(1);
    await page.locator("#title").fill("Same");
    await selectAll(); await custom("#2a2a2a");
    await savedRuns([["Same", "#2a2a2a"]]);
    await setSkin(4);
    await page.click("#settingsOpen"); await page.click("#modeGroup label:nth-child(3)"); await page.keyboard.press("Escape");
    assert.ok((await colors()).every(c => / #2a2a2a$/.test(c)), "换主题、换深浅后仍是自选的 #2a2a2a：" + await colors());
    await savedRuns([["Same", "#2a2a2a"]]);
    await page.click("#settingsOpen"); await page.click("#modeGroup label:nth-child(2)"); await page.keyboard.press("Escape");
    await page.locator("#title").fill("Color");
    // 反过来：在单色画·深里自选纯白，切到浅色后仍是白字（并提醒看不清），没有被当成墨色
    await setSkin(2);
    await page.click("#settingsOpen"); await page.click("#modeGroup label:nth-child(3)"); await page.keyboard.press("Escape");
    await page.locator("#title").focus(); await page.keyboard.press(process.platform === "darwin" ? "Meta+A" : "Control+A");
    await page.locator("#tcolorCustom").evaluate(n => { n.value = "#ffffff"; n.dispatchEvent(new Event("change", { bubbles: true })); });
    await page.click("#settingsOpen"); await page.click("#modeGroup label:nth-child(2)"); await page.keyboard.press("Escape");
    assert.ok((await titleColors()).some(c => c === "rgb(255, 255, 255)"), "别的主题里自选的白字换深浅后还是白字：" + await titleColors());
    assert.match(await page.locator("#toast").innerText(), /容易看不清/, "并提醒在浅底上看不清");
    // 自选的白字经过表格（墨色就是纯白）再换回来，仍是自选的白，不变成分离派的墨色（自查发现：原先一进表格就被当成墨色）
    await setSkin(4);
    await page.click("#settingsOpen"); await page.click("#modeGroup label:nth-child(3)"); await page.keyboard.press("Escape");
    assert.ok((await titleColors()).some(c => c === "rgb(255, 255, 255)"), "分离派·深：还是自选的白");
    await setSkin(5);
    await setSkin(4);
    assert.equal((await titleColors()).slice(-1)[0], "rgb(243, 239, 226)", "回到分离派·深（墨色不是纯白）");
    assert.ok((await titleColors()).some(c => c === "rgb(255, 255, 255)"), "经过表格再回来：自选的白还在：" + await titleColors());
    await page.waitForFunction(KEY => { const d = JSON.parse(localStorage.getItem(KEY) || "null"); return !!d && Array.isArray(d.titleRuns) && d.titleRuns.length === 1 && d.titleRuns[0].c === "#ffffff"; }, KEY, { timeout: 5000 });
    assert.deepEqual(errors, []);
    await context.close();
  }

  // ---- 真机反馈（11-20）：「图在下」时词下方的候选栏跟着词与释义上移，不落在图版下面被键盘盖住 ----
  for (const [order, ty] of [["plate", 0], ["text", -616]]) {
    const { page, context, errors } = await pageFor({ draft: { ...LIFE, layout: order === "text" ? { order: "text" } : undefined } });
    const k = await page.evaluate(() => +document.getElementById("card").getAttribute("data-k"));
    const top = async () => { const r = await page.evaluate(() => [document.getElementById("cand").getBoundingClientRect().top, document.getElementById("card").getBoundingClientRect().top]); return (r[0] - r[1]) / k; };
    await page.locator("#wordCtl").focus();
    await page.waitForFunction(() => !document.getElementById("cand").hidden);
    assert.ok(Math.abs(await top() - (1082 + ty)) < 1, order + "：候选栏在词下方 " + (1082 + ty) + "：" + await top());
    await page.locator("#glossCtl").focus();
    await page.waitForFunction(() => !document.getElementById("cand").hidden);
    assert.ok(Math.abs(await top() - (1180 + ty)) < 1, order + "：义项栏在释义下方 " + (1180 + ty) + "：" + await top());
    if (order === "text") assert.ok(await page.evaluate(() => document.getElementById("cand").getBoundingClientRect().top < document.querySelector("#mirror .b-plate").getBoundingClientRect().top), "图在下：栏在图版上面");
    assert.deepEqual(errors, []);
    await context.close();
  }

  // ---- 真机反馈（11-20，LIFE 改成 LIFTHOUSE）：改单词后，默认图的取景沿用到新出现的格和字母变了的格；本格配图的取景照旧只留在字母没变的格 ----
  {
    const { page, context, errors } = await pageFor();
    const png = Buffer.from(await page.evaluate(() => { const c = document.createElement("canvas"); c.width = 640; c.height = 480; const x = c.getContext("2d"); x.fillStyle = "#3a6"; x.fillRect(0, 0, 640, 480); return c.toDataURL("image/png").split(",")[1]; }), "base64");
    await page.click("#plateHit");
    await page.locator("#photo").setInputFiles({ name: "d.png", mimeType: "image/png", buffer: png });
    await page.waitForFunction(() => !document.getElementById("cropper").hidden);
    await page.locator("#cropZoom").fill("2"); await page.locator("#cropZoom").dispatchEvent("change");
    await page.click("#cropApply"); await page.click("#imgClose");
    const z2 = { z: 2, x: 0.5, y: 0.5 };
    await page.waitForFunction(KEY => { const d = JSON.parse(localStorage.getItem(KEY)); return d.media && d.media.def && d.crops.length === 4 && d.crops.every(c => c && c.z === 2); }, KEY);
    await page.click("#toEntry"); await page.locator("#wordInput").fill("LIFTHOUSE"); await page.click("#entrySave");
    if (await page.locator("#wordConfirm").isVisible()) await page.click("#confClear");
    await page.click("#entryBack");
    await page.waitForFunction(() => document.getElementById("pagerLetters").children.length === 9);
    await page.waitForFunction(KEY => { const d = JSON.parse(localStorage.getItem(KEY)); return d.word === "LIFTHOUSE"; }, KEY);
    const d = await saved(page);
    assert.deepEqual(d.crops, Array(9).fill(z2), "九格都沿用默认图放大 2 倍的取景：" + JSON.stringify(d.crops));
    await page.reload(); await ready9(page);
    assert.deepEqual((await saved(page)).crops, Array(9).fill(z2), "重开后还在");
    assert.deepEqual(errors, []);
    await context.close();
  }

  // ---- 版式页开着时草稿到期：页面收起，不留旧小样；新作品回到对开 ----
  {
    const center = { base: "center", text: "center", cap: "center", plateX: "center", prog: false, deco: false, quote: true };
    const { page, context, errors } = await pageFor({ draft: { ...LIFE, layout: center }, age: 64800000 - 3000 }); // 还差 3 秒满 18 小时
    assert.equal(await count(page, "rule"), 0, "这份草稿是居中版式");
    await page.click("#toLayout");
    assert.equal(await page.locator("#layPrev canvas").count(), 1);
    await page.waitForFunction(() => document.getElementById("pagerLetters").children.length === 0, null, { timeout: 15000 });
    assert.equal(await page.locator("#layoutPage").isHidden(), true, "作品到期清掉：版式页收起");
    assert.equal(await page.locator("#layPrev canvas").count(), 0, "不留旧作品的小样");
    await page.waitForFunction(() => !document.getElementById("wordInput").disabled);
    await page.fill("#wordInput", "ICE");
    await page.click("#entryStart");
    await page.waitForFunction(() => document.getElementById("pagerLetters").children.length === 3);
    assert.deepEqual([await count(page, "rule"), await count(page, "info-folio")], [1, 0], "新作品是对开：有墨线，格子进度默认不画");
    assert.equal((await saved(page) || {}).layout, undefined, "新作品的草稿不带版式字段");
    assert.deepEqual(errors, []);
    await context.close();
  }

  // ---- 外部复审 L2-A1：图版三档比例下，取景框、拖动边界、卡面与导出取的是同一块 ----
  for (const [nth, pw] of [[1, 920], [2, 600], [3, 450]]) {
    const { page, context, errors } = await pageFor();
    const tag = "图版 " + pw + ":600 ";
    const close = (a, b, m) => assert.ok(Math.abs(a - b) < 1e-6, tag + m + "：" + a + " ≠ " + b);
    // 四边带浅色标记的测试图（640 × 480）：哪一边被裁掉、裁多少，从取到的矩形上直接看得出来
    const buffer = Buffer.from(await page.evaluate(() => {
      const c = document.createElement("canvas"); c.width = 640; c.height = 480; const x = c.getContext("2d");
      x.fillStyle = "#f0f0f0"; x.fillRect(0, 0, 640, 480);
      x.fillStyle = "#ff9a9a"; x.fillRect(0, 0, 48, 480); x.fillStyle = "#ffd28a"; x.fillRect(592, 0, 48, 480);
      x.fillStyle = "#ffb0e0"; x.fillRect(0, 0, 640, 36); x.fillStyle = "#ffe9a0"; x.fillRect(0, 444, 640, 36);
      return c.toDataURL("image/png").split(",")[1];
    }), "base64");
    if (nth > 1) { await page.click("#toLayout"); await pick(page, "ratio", nth); await page.keyboard.press("Escape"); }
    assert.equal((await boxes(page, "plate"))[0].w, pw, tag + "卡上的图版宽");
    await page.click("#plateHit");
    await page.locator("#cellPhoto").setInputFiles({ name: "m.png", mimeType: "image/png", buffer });
    await page.waitForFunction(() => !document.getElementById("cropper").hidden);
    // 取景框应有的位置：与图版同比例，最宽 312、最高 252，在 360 × 300 的画布里居中
    const fw = Math.min(312, 252 * pw / 600), fh = fw * 600 / pw, fx = (360 - fw) / 2, fy = (300 - fh) / 2;
    const lastPreview = () => page.evaluate(() => window.cropDraws.filter(d => d.preview).slice(-1)[0]);
    const seen = (d) => { const k = d.args[2] / d.iw; return { sx: (fx - d.args[0]) / k, sy: (fy - d.args[1]) / k, vw: fw / k, vh: fh / k }; }; // 框里露出来的是原图的哪一块
    // 框画在那儿：框内是亮的图，框外被压暗
    const lum = (x, y) => page.locator("#cropCanvas").evaluate((c, p) => c.getContext("2d").getImageData(p[0], p[1], 1, 1).data[0], [Math.round(x), Math.round(y)]);
    assert.ok(await lum(fx + 5, 150) > 2 * await lum(fx - 5, 150), tag + "取景框左边线的位置");
    assert.ok(await lum(180, fy + 5) > 2 * await lum(180, fy - 5), tag + "取景框上边线的位置");
    assert.ok(await lum(fx + fw - 5, 150) > 2 * await lum(fx + fw + 5, 150), tag + "取景框右边线的位置");
    // 拖到头：框里正好贴着图的左上角 / 右下角，不露出图外，也不提前停住
    await page.locator("#cropZoom").fill("2");
    const box = await page.locator("#cropCanvas").boundingBox(), cx = box.x + box.width / 2, cy = box.y + box.height / 2;
    const drag = async (dx, dy) => { for (let i = 0; i < 5; i++) { await page.mouse.move(cx, cy); await page.mouse.down(); await page.mouse.move(cx + dx, cy + dy, { steps: 3 }); await page.mouse.up(); } };
    await drag(110, 100);
    let v = seen(await lastPreview());
    close(v.sx, 0, "向右下拖到头：左边贴图边"); close(v.sy, 0, "向右下拖到头：上边贴图边");
    await drag(-110, -100);
    v = seen(await lastPreview());
    close(v.sx + v.vw, 640, "向左上拖到头：右边贴图边"); close(v.sy + v.vh, 480, "向左上拖到头：下边贴图边");
    close(v.vw / v.vh, pw / 600, "露出来的这一块与图版同比例");
    // 应用：卡上画的就是框里那一块
    await page.click("#cropApply");
    await page.waitForFunction(() => !document.getElementById("imgAdjust").hidden && document.querySelector("#mirror canvas"));
    const card = await page.evaluate(() => window.cropDraws.filter(d => !d.preview && d.args.length === 8).slice(-1)[0]);
    close(card.args[0], v.sx, "卡面取的左边"); close(card.args[1], v.sy, "卡面取的上边"); close(card.args[2], v.vw, "卡面取的宽"); close(card.args[3], v.vh, "卡面取的高");
    const about = (a, b, m) => assert.ok(Math.abs(a / b - 1) < 0.01, tag + m + "：" + a + " ≠ " + b); // 画布按整像素取整，比例只能近似
    about(card.args[6] / card.args[7], pw / 600, "卡面画成图版的比例");
    // 导出：同一块
    await page.click("#imgClose"); await page.click("#finish");
    await page.waitForFunction(() => /失败/.test(document.getElementById("finMsg").textContent) || (!document.getElementById("exportView").hidden && !document.getElementById("exportView").disabled), null, { timeout: 20000 });
    const exported = await page.evaluate(() => window.cropDraws.filter(d => !d.preview && d.args.length === 8).slice(-1)[0]);
    assert.deepEqual(exported.args.slice(0, 4), card.args.slice(0, 4), tag + "导出与卡面取同一块");
    about(exported.args[6] / exported.args[7], pw / 600, "导出画成图版的比例");
    assert.deepEqual(errors, []);
    await context.close();
  }

  // ---- 表格 × 居中：导出图的底是黑的、没配图的图版是白的 ----
  {
    const { page, context, errors } = await pageFor();
    await page.click("#settingsOpen"); await page.click("#skinGroup label:nth-child(5)"); await page.keyboard.press("Escape");
    await page.click("#toLayout"); await page.click("#layBase label:nth-child(2)"); await page.keyboard.press("Escape");
    await page.click("#finish");
    await page.waitForFunction(() => /失败/.test(document.getElementById("finMsg").textContent) || (!document.getElementById("exportView").hidden && !document.getElementById("exportView").disabled), null, { timeout: 20000 });
    const [dl] = await Promise.all([page.waitForEvent("download"), page.click("#exportView")]); // 网页版点按钮是下载 zip：取包里第一张
    const first = unzipStored(await readFile(await dl.path()))[0].data.toString("base64");
    const px = await page.evaluate(async (b64) => {
      const img = new Image(), c = document.createElement("canvas");
      img.src = "data:image/jpeg;base64," + b64;
      await img.decode();
      c.width = img.naturalWidth; c.height = img.naturalHeight;
      const x = c.getContext("2d"); x.drawImage(img, 0, 0);
      const at = (u, v) => Array.from(x.getImageData(Math.round(u * c.width / 1080), Math.round(v * c.height / 1440), 1, 1).data.slice(0, 3));
      return { w: c.width, h: c.height, corner: at(20, 20), plate: at(900, 320) }; // 图版右上角一带没有大字母
    }, first);
    assert.equal(px.w / px.h, 0.75, "导出仍是 3:4");
    assert.ok(px.corner.every(v => v < 12), "表格导出图的底是黑的：" + px.corner);
    assert.ok(px.plate.every(v => v > 243), "表格导出图里没配图的图版是白的：" + px.plate);
    assert.deepEqual(errors, []);
    await context.close();
  }

  // ---- v00.03.03 L4（真机第一轮的界面修改）：按钮带框、版式页的结构与文案、小样切单图 / 列阵、默认图调取景、地标与标题、窄屏顶栏 ----
  {
    const { page, context, errors } = await pageFor();
    // 入口：带框的小按钮，文字缩成「改单词」，读屏名仍写明填表人也在这里改；页面有 main 与一级标题
    const framed = (sel) => page.locator(sel).evaluate(n => { const cs = getComputedStyle(n), r = n.getBoundingClientRect(), x = r.left + r.width / 2; return parseFloat(cs.borderTopWidth) >= 1 && cs.borderTopStyle === "solid" && r.height === 36 && document.elementFromPoint(x, r.top - 3) === n && !!n.querySelector("svg"); });
    for (const sel of ["#toLayout", "#toEntry", "#settingsOpen", "#finish"]) assert.ok(await framed(sel), sel + "：带框、框高 36、框外 3px 仍点得到、带图标");
    assert.equal((await page.locator("#toEntry").innerText()).trim(), "改单词");
    assert.match(await page.locator("#toEntry").getAttribute("aria-label"), /^改单词.*填表人/, "读屏名以可见文字开头，并写明填表人");
    assert.equal(await page.evaluate(() => getComputedStyle(document.getElementById("viewSingle")).backgroundColor === getComputedStyle(document.getElementById("finish")).backgroundColor && getComputedStyle(document.getElementById("viewGrid")).backgroundColor === "rgba(0, 0, 0, 0)"), true, "相连的两格：当前格实心");
    assert.deepEqual(await page.evaluate(() => [document.querySelectorAll("main").length, document.querySelector("main h1.sr-only").textContent, !!document.querySelector("main #card")]), [1, "编辑卡片", true], "编辑面有 main 地标和一级标题");
    assert.equal(await boxes(page, "info-filler").then(b => b[0].text), "小满", "右上只写名字，不带「填表人」三字");

    // 版式页：没有会把页面往下推的说明；组名加粗；「自定义」；「单图比例」与提示
    await page.click("#toLayout");
    assert.equal(await page.locator("#layBaseWhy").evaluate(n => n.getBoundingClientRect().height <= 1), true, "预设下面的说明只给读屏，不占位置");
    const y0 = await page.locator("#lay-text").evaluate(n => n.getBoundingClientRect().top);
    await page.locator("#lay-text label").nth(1).click();
    assert.equal(await page.locator("#lay-text").evaluate(n => n.getBoundingClientRect().top), y0, "拨开关后下面的行不下移");
    await page.locator("#layBase label").first().click();
    assert.deepEqual(await page.locator("#layRows h3").allInnerTexts(), ["自定义", "文字", "图版", "显示"]);
    assert.ok(await page.locator("#layRows h3.lay-group").first().evaluate(n => Number(getComputedStyle(n).fontWeight) >= 700), "组名加粗");
    assert.equal(await page.locator("#lay-ratio-n").innerText(), "单图比例");
    assert.equal(await page.locator("#layRows .lay-tip").innerText(), "此设置仅影响单图模式的视觉效果");
    assert.equal(await page.locator('#lay-prog input:checked').evaluate(n => n.parentNode.innerText.trim()), "隐藏", "格子进度默认隐藏");
    // 小样下的「单图｜列阵」只换小样
    const size = () => page.locator("#layPrev canvas").evaluate(c => [c.style.width, c.style.height]);
    const one = await size();
    assert.deepEqual([await page.locator("#layViewSingle").getAttribute("aria-pressed"), await page.locator("#layViewGrid").getAttribute("aria-pressed")], ["true", "false"], "开页时跟编辑面的视图一致");
    await page.click("#layViewGrid");
    const grid = await size();
    assert.notDeepEqual(grid, one, "小样换成列阵");
    assert.ok(parseFloat(grid[0]) > parseFloat(one[0]), "列阵小样更宽：" + grid + " / " + one);
    assert.equal(await page.locator("#viewSingle").getAttribute("aria-pressed"), "true", "编辑面的视图不变");
    await page.locator("#lay-deco label").nth(1).click();
    assert.equal(await page.locator("#layViewGrid").getAttribute("aria-pressed"), "true", "拨开关后小样仍是列阵");
    await page.locator("#lay-deco label").first().click();
    await page.keyboard.press("Escape");
    assert.equal(await page.locator("#card").evaluate(n => n.classList.contains("grid")), false, "关页后编辑面仍是单图");
    await page.click("#toLayout");
    assert.equal(await page.locator("#layViewSingle").getAttribute("aria-pressed"), "true", "再开页回到编辑面的视图");
    await page.keyboard.press("Escape");

    // 配图面板：行是带框的按钮；默认图一组有「调整取景」，调的是所有没有单独配图的格
    const png = Buffer.from(await page.evaluate(() => { const c = document.createElement("canvas"); c.width = 640; c.height = 480; const x = c.getContext("2d"); x.fillStyle = "#3a6"; x.fillRect(0, 0, 640, 480); return c.toDataURL("image/png").split(",")[1]; }), "base64");
    await page.click("#plateHit");
    assert.equal(await page.locator("#defAdjust").isHidden(), true, "没有默认图时不出「调整取景」");
    assert.ok(await page.locator("#imgPick").evaluate(n => { const cs = getComputedStyle(n); return parseFloat(cs.borderTopWidth) >= 1 && n.getBoundingClientRect().height >= 44; }), "行式按钮带框、高 44");
    await page.locator("#photo").setInputFiles({ name: "d.png", mimeType: "image/png", buffer: png });
    await page.waitForFunction(() => !document.getElementById("cropper").hidden);
    await page.click("#cropApply");
    await page.waitForFunction(KEY => { const d = JSON.parse(localStorage.getItem(KEY)); return d.media && d.media.def && d.crops.every(c => c && c.z === 1); }, KEY);
    assert.equal(await page.locator("#defAdjust").isVisible(), true, "有默认图：出「调整取景」");
    assert.equal(await page.locator("#defAdjust").getAttribute("aria-label"), "调整取景，默认图");
    await page.click("#defAdjust");
    await page.waitForFunction(() => !document.getElementById("cropper").hidden);
    assert.match(await page.locator("#cropTitle").innerText(), /默认图/);
    assert.equal(await page.locator("#cropScope").isVisible(), true, "写明影响所有没有单独配图的格");
    await page.locator("#cropZoom").fill("2.5"); await page.locator("#cropZoom").dispatchEvent("change");
    await page.click("#cropApply");
    await page.waitForFunction(KEY => JSON.parse(localStorage.getItem(KEY)).crops.every(c => c && c.z === 2.5), KEY);
    assert.equal(await page.evaluate(() => document.activeElement.id), "defAdjust", "应用后焦点回到「调整取景（默认图）」");
    // 再进一次：从上次的取景接着调，不是从头
    await page.click("#defAdjust");
    assert.equal(await page.locator("#cropZoom").inputValue(), "2.5", "接着上次的取景调");
    await page.click("#cropCancel");
    assert.equal((await saved(page)).crops.every(c => c.z === 2.5), true, "取消不改");
    await page.click("#imgClose");
    assert.deepEqual(errors, []);
    await context.close();
  }
  // 复审 L4-A1：改单词的清空确认不再把「各格共用的默认图取景」算成会丢（它会沿用）；这一格单独调过、与共用那份不同的取景仍要提示
  {
    const bare = { ...LIFE, picks: [["lake", ""], ["ice", ""], ["fire", ""], null], glosses: ["湖泊", "冰", "火", ""], captions: ["短配文", "短配文", "短配文", ""] };
    const { page, context, errors } = await pageFor({ draft: bare });
    const png = Buffer.from(await page.evaluate(() => { const c = document.createElement("canvas"); c.width = 640; c.height = 480; const x = c.getContext("2d"); x.fillStyle = "#3a6"; x.fillRect(0, 0, 640, 480); return c.toDataURL("image/png").split(",")[1]; }), "base64");
    await page.click("#plateHit");
    await page.locator("#photo").setInputFiles({ name: "d.png", mimeType: "image/png", buffer: png });
    await page.waitForFunction(() => !document.getElementById("cropper").hidden);
    await page.locator("#cropZoom").fill("2"); await page.locator("#cropZoom").dispatchEvent("change");
    await page.click("#cropApply"); await page.click("#imgClose");
    await page.waitForFunction(KEY => { const d = JSON.parse(localStorage.getItem(KEY)); return d.media && d.media.def && d.crops.every(c => c && c.z === 2); }, KEY);
    // E 格只有共用的默认图取景：LIFE → LIFT 不弹确认，直接保存，四格取景照旧
    await page.click("#toEntry"); await page.locator("#wordInput").fill("LIFT"); await page.click("#entrySave");
    await page.waitForFunction(KEY => JSON.parse(localStorage.getItem(KEY)).word === "LIFT", KEY);
    assert.equal(await page.locator("#wordConfirm").isHidden(), true, "只有共用取景的格变了字母：不弹清空确认");
    assert.deepEqual((await saved(page)).crops, Array(4).fill({ z: 2, x: 0.5, y: 0.5 }), "新格沿用默认图的取景");
    await page.click("#entryBack");
    // 在第 4 格上单独把默认图的取景调成 3 倍：再改这一格的字母，确认框要列出「取景」
    await page.evaluate(() => document.getElementById("pl-3").click());
    await page.click("#plateHit"); await page.click("#imgAdjust");
    await page.waitForFunction(() => !document.getElementById("cropper").hidden);
    await page.locator("#cropZoom").fill("3"); await page.locator("#cropZoom").dispatchEvent("change");
    await page.click("#cropApply"); await page.click("#imgClose");
    await page.waitForFunction(KEY => JSON.parse(localStorage.getItem(KEY)).crops[3].z === 3, KEY);
    await page.click("#toEntry"); await page.locator("#wordInput").fill("LIFE"); await page.click("#entrySave");
    await page.locator("#wordConfirm").waitFor({ state: "visible" });
    assert.match(await page.locator("#confList").innerText(), /T[\s\S]*取景/, "这一格单独调过的取景会丢：确认框列出");
    assert.deepEqual(errors, []);
    await context.close();
  }
  // 入场页：两个小按钮
  {
    const { page, context, errors } = await pageFor();
    await page.click("#toEntry");
    assert.ok(await page.locator("#presetMore").evaluate(n => parseFloat(getComputedStyle(n).borderTopWidth) >= 1 && n.getBoundingClientRect().height === 36 && getComputedStyle(n).textDecorationLine === "none"), "换一组：带框，不再是带下划线的字");
    // 第二轮真机反馈：「更多语言」加框后不好看，回滚成带下划线的字
    assert.ok(await page.locator("#langMore").evaluate(n => getComputedStyle(n).borderTopStyle === "none" && getComputedStyle(n).textDecorationLine === "underline" && n.getBoundingClientRect().height >= 44), "更多语言：带下划线的字，点按区高 44");
    assert.equal(await page.locator("#langMore").innerText(), "更多语言……");
    assert.deepEqual(errors, []);
    await context.close();
  }
  // 窄屏：容器按钮让位（左 48、右 96，2026-11-23）后屏宽不到 375，「完成」只留字；「设置」始终只是齿轮。不横滚，最右不进右侧 96 的让位；
  // 约 350 起一行（界线随字体差几 px，不在界线上断言），320 时「单图｜列阵」落到第二行（右边那组仍在第一行）
  for (const [width, icon, row] of [[320, false, false], [360, false, true], [374, false, true], [375, true, true], [402, true, true], [414, true, true]]) {
    const { page, context, errors } = await pageFor({ width });
    await page.evaluate(() => document.documentElement.setAttribute("data-container-full", "true"));
    const r = await page.evaluate(() => { const g = (id) => document.getElementById(id).getBoundingClientRect(), v = g("viewSingle"), s = g("settingsOpen"), f = g("finish"), t = document.querySelector(".top"), cs = getComputedStyle(t), tr = t.getBoundingClientRect();
      return { gear: getComputedStyle(document.querySelector("#settingsOpen svg")).display !== "none" && s.width === 36, icon: getComputedStyle(document.querySelector("#finish svg")).display !== "none", row: Math.abs(v.top - s.top) < 1 && Math.abs(s.top - f.top) < 1, left: v.left >= tr.left + parseFloat(cs.paddingLeft) - 0.5, right: f.right <= tr.right - parseFloat(cs.paddingRight) + 0.5, fits: document.documentElement.scrollWidth <= innerWidth, text: document.getElementById("settingsOpen").innerText.trim() + document.getElementById("finish").innerText.trim() }; });
    assert.deepEqual(r, { gear: true, icon, row, left: true, right: true, fits: true, text: "设置完成" }, width + " 宽的顶栏：" + JSON.stringify(r));
    assert.deepEqual(errors, []);
    await context.close();
  }

  console.log("browser layout ok: entry + layout page (presets, ten switches, disabled plateX, preview, 44px, 320 width, Esc + focus), card follows layout, draft round trip + absent field + damaged field, caption own with quotes, grid follows text, export, table skin (dark only, white frame, restore other skins)");
} finally {
  if (browser) await browser.close();
  server.close();
}
