// 第五批面板回归（T19/T20/T21a/T22）：使用现有 Playwright，不安装依赖；新端口、新上下文，绝不操作用户预览存储。
// PLAYWRIGHT_MODULE=/absolute/path/to/playwright CHROMIUM_PATH=/path/to/chromium node scripts/test-entry-browser.mjs
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
const LIFE = { v: 2, word: "LIFE", filler: "小满", view: "single", titleRuns: null,
  picks: [["love", ""], ["ice", ""], ["fire", ""], ["echo", ""]], glosses: ["爱", "冰", "火", "回声"], glossAuto: [false, false, false, false],
  captions: ["一段配文", "冰的配文", "", "回声配文"], keys: [0, 0, 0, 0] };
let browser;
const word = (raw) => JSON.parse(raw).word;
try {
  browser = await chromium.launch({ headless: true, ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}) });
  // draft：植入的草稿（null = 没有草稿）；slowRead：端存储读取延迟毫秒（模拟慢读取，T14）；width：视口宽；tipSeen：首次提示是否已看过
  async function pageFor({ draft = null, slowRead = 0, width = 375, height = 812, tipSeen = true } = {}) {
    const context = await browser.newContext({ viewport: { width, height } });
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
    if (!slowRead) assert.equal(await page.evaluate(() => typeof window.Backronym), "undefined", "启动后不把模块接口留在 window 上");
    return { page, context, errors };
  }
  const visible = (page, sel) => page.locator(sel).isVisible();
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

  const shot = async (page, name) => { if (process.env.EVIDENCE_DIR) await page.screenshot({ path: path.join(process.env.EVIDENCE_DIR, name + ".png"), fullPage: false }); };
  // T20：保留表格语义和原生许可折叠；原文已在交付时对照。
  {
    const { page, context, errors } = await pageFor({ width: 320 });
    await page.locator("#settingsOpen").click(); await page.locator("#setCredits").click(); // v00.03.00：借物页入口在设置页底行
    await shot(page, "credits-320");
    assert.equal(await page.locator('.credits-table th[scope="col"]').count(), 3);
    assert.equal(await page.locator('.credits-table th[scope="row"]').count(), 15); // 主题字体两行 // 2026-11-12 借物页修订：加屏蔽词表来源与主题颜色出处两行；此前：词库一行拆成六行（六语来源、辅助数据、词频、断词点、改编说明）
    assert.match(await page.locator(".credits-table").innerText(), /维基词典[\s\S]*CC BY-SA 4\.0[\s\S]*FrequencyWords[\s\S]*CFDICT[\s\S]*HanDeDict[\s\S]*LDNOOBW/, "借物页列全六语词库和屏蔽词表的来源");
    await page.locator("#credits summary").first().focus(); await page.keyboard.press("Enter");
    assert.equal(await page.locator("#credits details").first().getAttribute("open"), "");
    // T07：第一项是 GPL，全文展开时才读（assets/licenses.js）；开头的本项目许可段与省流三行在表格之前
    await page.waitForFunction(() => /GNU GENERAL PUBLIC LICENSE/.test(document.querySelector('#credits details[data-license="GPL-3.0"] pre').textContent));
    await page.locator('#credits details[data-license="CC-BY-SA-4.0"] summary').click();
    await page.waitForFunction(() => /Attribution-ShareAlike 4\.0 International/.test(document.querySelector('#credits details[data-license="CC-BY-SA-4.0"] pre').textContent));
    assert.equal(await page.locator("#credits .credits-tldr li").count(), 3);
    assert.match(await page.locator("#credits .credits-own").innerText(), /第 3 版，或由你选择的任一更新版本[\s\S]*不提供任何担保[\s\S]*github\.com\/bydpass\/backronym/);
    assert.equal(await page.evaluate(() => document.getElementById("credits").scrollWidth <= innerWidth), true);
    await page.keyboard.press("Escape"); assert.equal(await page.evaluate(() => document.activeElement.id), "setCredits");
    assert.deepEqual(errors, []); await context.close();
  }
  // T22：窄屏十字母一行；最宽字母重复也不得溢出。四字母继续使用原字号与间距。
  for (const width of [320, 360, 375]) {
    for (const word of ["BACKRONYMS", "BACKRONYM", "WWWWWWWWWW", "LIFE"]) {
      const { page, context, errors } = await pageFor({ draft: { ...LIFE, word }, width });
      await page.evaluate(() => document.fonts.ready);
      const boxes = await page.locator(".pl").evaluateAll(nodes => nodes.map(n => { const r = n.getBoundingClientRect(); return { top: r.top, width: r.width, height: r.height }; }));
      const glyphsFit = await page.locator(".pl").evaluateAll(nodes => nodes.every(n => {
        const range = document.createRange(); range.selectNodeContents(n.querySelector("span"));
        const glyph = range.getBoundingClientRect(), button = n.getBoundingClientRect();
        return glyph.left >= button.left - .1 && glyph.right <= button.right + .1;
      }));
      assert.ok(glyphsFit, "字形必须留在自身按钮内，不能互相挤压");
      assert.equal(boxes.length, word.length);
      assert.equal(new Set(boxes.map(b => Math.round(b.top))).size, 1, width + " " + word + " 单行");
      if (word.length > 8) {
        assert.ok(boxes.every(b => b.width >= 24 && b.height >= 24), "点按区至少 24×24");
        const compact = await page.locator("#pagerLetters").evaluate(n => {
          const buttons = n.querySelectorAll("button");
          return { spare: n.getBoundingClientRect().right - buttons[buttons.length - 1].getBoundingClientRect().right,
            underlines: Array.from(buttons).every(b => { const span = b.querySelector("span"), r = document.createRange(); r.selectNodeContents(span); return Math.abs(span.getBoundingClientRect().width - r.getBoundingClientRect().width) < .1; }) };
        });
        assert.ok(compact.spare > 10, "紧凑字母应左对齐，不能撑满整行");
        assert.equal(compact.underlines, true, "下划线跟字宽");
        if (word === "BACKRONYMS" && width === 360) await shot(page, "pager-360");
      }
      else {
        assert.equal(await page.locator("#pagerLetters").evaluate(n => n.classList.contains("tight")), false);
        const style = await page.locator(".pl").first().evaluate(n => ({ font: parseFloat(getComputedStyle(n).fontSize), u: document.getElementById("card").clientWidth / 300 }));
        assert.ok(Math.abs(style.font - 20 * style.u) < .05);
      }
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      assert.deepEqual(errors, []); await context.close();
    }
  }
  // T19：按钮与键盘均可完成；记录真实 drawImage 的源矩形，核对预览内框与卡面裁剪。
  {
    const { page, context, errors } = await pageFor({ draft: LIFE, width: 375 });
    await page.evaluate(() => {
      window.cropDraws = []; const real = CanvasRenderingContext2D.prototype.drawImage;
      CanvasRenderingContext2D.prototype.drawImage = function () {
        const a = Array.from(arguments);
        if (a[0] instanceof HTMLImageElement) window.cropDraws.push({ preview: this.canvas.id === "cropCanvas", args: a.slice(1), iw: a[0].naturalWidth, ih: a[0].naturalHeight });
        return real.apply(this, arguments);
      };
    });
    await addPhoto(page, 0, await png(page));
    await page.locator("#plateHit").click(); await page.locator("#imgAdjust").click();
    assert.equal(await page.evaluate(() => document.activeElement.id), "cropCanvas");
    assert.equal(await page.locator("#cropTitle").innerText(), "调整取景 · 1L", "U6：标题写出格位与字母");
    assert.equal(await page.locator("#cropper .sheet-hint").count(), 0, "T49：不再写「拖动画面 · 双指缩放」");
    const visited = new Set();
    for (let i = 0; i < 12; i++) {
      await page.keyboard.press("Tab");
      const target = await page.evaluate(() => ({ inside: !!document.activeElement.closest("#cropper"), key: document.activeElement.id || document.activeElement.dataset.move }));
      assert.equal(target.inside, true, "Tab 不离开取景面板"); visited.add(target.key);
    }
    for (const key of ["ArrowLeft", "ArrowUp", "ArrowRight", "ArrowDown", "cropMinus", "cropPlus", "cropZoom", "cropCancel", "cropReset", "cropApply"]) assert.ok(visited.has(key), "Tab 可达 " + key);
    assert.deepEqual(await page.locator(".crop-arrow").allTextContents(), ["→", "→", "→", "→"], "四方向共用包内箭头字形");
    const turns = await page.locator(".crop-arrow").evaluateAll(ns => ns.map(n => getComputedStyle(n).transform));
    assert.deepEqual(turns, ["matrix(-1, 0, 0, -1, 0, 0)", "matrix(0, -1, 1, 0, 0, 0)", "matrix(0, 1, -1, 0, 0, 0)", "none"]);
    const targetBoxes = await page.locator("#cropMoves button, #cropMinus, #cropPlus").evaluateAll(ns => ns.map(n => ({ w: n.getBoundingClientRect().width, h: n.getBoundingClientRect().height })));
    assert.ok(targetBoxes.every(b => b.w >= 24 && b.h >= 24));
    for (const name of ["向左移动", "向上移动", "向右移动", "向下移动", "放大", "缩小"]) assert.ok(await page.getByRole("button", { name, exact: true }).isVisible());
    assert.equal(await page.getByRole("button", { name: "居中", exact: true }).count(), 0, "T49：「居中」删去，回中靠「还原」");
    await page.getByRole("button", { name: "放大", exact: true }).click();
    assert.equal(await page.locator("#cropZoom").inputValue(), "1.1");
    await page.getByRole("button", { name: "缩小", exact: true }).click();
    assert.equal(await page.locator("#cropZoom").inputValue(), "1");
    await page.locator("#cropZoom").fill("2");
    await page.getByRole("button", { name: "向右移动", exact: true }).focus(); await page.keyboard.press("Enter");
    const right = await page.evaluate(() => window.cropDraws.filter(d => d.preview).slice(-1)[0]);
    await page.getByRole("button", { name: "向左移动", exact: true }).click();
    const centered = await page.evaluate(() => window.cropDraws.filter(d => d.preview).slice(-1)[0]);
    assert.ok(right.args[0] < centered.args[0], "向右移动取景，图片向左");
    assert.equal(await page.locator("#cropZoom").inputValue(), "2", "移动不重置缩放");
    await page.locator("#cropCanvas").focus(); await page.keyboard.press("ArrowRight");
    const keyboard = await page.evaluate(() => window.cropDraws.filter(d => d.preview).slice(-1)[0]);
    assert.deepEqual(keyboard.args, right.args, "键盘与按钮移动量一致");
    await page.keyboard.press("+"); assert.equal(await page.locator("#cropZoom").inputValue(), "2.1");
    await page.keyboard.press("-"); assert.equal(await page.locator("#cropZoom").inputValue(), "2");
    const shade = await page.locator("#cropCanvas").evaluate(c => {
      const x = c.getContext("2d"); return { inner: x.getImageData(180, 150, 1, 1).data[0], outer: x.getImageData(12, 150, 1, 1).data[0] };
    });
    assert.ok(shade.inner > shade.outer * 2, "取景框外围确实压暗");
    await page.getByRole("button", { name: "向左移动", exact: true }).click(); // 回到中间（键盘那一下向右）
    const dragBefore = await page.evaluate(() => window.cropDraws.filter(d => d.preview).slice(-1)[0]);
    const box = await page.locator("#cropCanvas").boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2); await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + 20, box.y + box.height / 2); await page.mouse.up();
    const dragAfter = await page.evaluate(() => window.cropDraws.filter(d => d.preview).slice(-1)[0]);
    assert.ok(Math.abs(dragAfter.args[0] - dragBefore.args[0] - 20 * 360 / box.width) < 1e-6, "拖动坐标按画布比例换算");
    await page.locator("#cropCanvas").evaluate(c => {
      const fire = (type, id, x) => c.dispatchEvent(new PointerEvent(type, { pointerId: id, pointerType: "touch", clientX: x, clientY: 100, bubbles: true }));
      fire("pointerdown", 11, 100); fire("pointerdown", 12, 200); fire("pointermove", 12, 250);
      fire("pointerup", 11, 100); fire("pointerup", 12, 250);
    });
    assert.equal(await page.locator("#cropZoom").inputValue(), "3", "双指距离增加一半，缩放从 2 到 3");
    const preview = await page.evaluate(() => window.cropDraws.filter(d => d.preview).slice(-1)[0]);
    await shot(page, "crop-375");
    await page.locator("#cropApply").click();
    assert.equal(await page.evaluate(() => document.activeElement.id), "imgAdjust");
    const card = await page.evaluate(() => window.cropDraws.filter(d => !d.preview && d.args.length === 8).slice(-1)[0]);
    const scale = preview.args[2] / preview.iw, fy = (300 - 312 * 600 / 920) / 2;
    const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-8);
    near((24 - preview.args[0]) / scale, card.args[0]); near((fy - preview.args[1]) / scale, card.args[1]);
    near(312 / scale, card.args[2]); near(312 * 600 / 920 / scale, card.args[3]);
    await page.locator("#imgClose").click(); await page.locator("#finish").click();
    await page.waitForFunction(() => !document.getElementById("exportView").hidden && !document.getElementById("exportView").disabled);
    const exported = await page.evaluate(() => window.cropDraws.filter(d => !d.preview && d.args.length === 8).slice(-1)[0]);
    assert.deepEqual(exported.args.slice(0, 4), card.args.slice(0, 4), "实际导出与预览使用同一源矩形");
    await page.keyboard.press("Escape");
    await page.locator("#plateHit").click(); await page.locator("#imgAdjust").click(); await page.locator("#cropReset").click();
    assert.equal(await page.locator("#cropZoom").inputValue(), "1");
    await page.keyboard.press("Escape"); assert.ok(await page.locator("#imgPanel").isVisible());
    assert.deepEqual(errors, []); await context.close();
  }
  // T44：选图后先在工作副本上取景，背后的卡不变；取消 / Esc = 原图原取景都在；应用才落入作品并保存。按钮「取消｜还原｜应用」，应用在最右、实心、44px 高
  {
    const { page, context, errors } = await pageFor({ draft: LIFE, width: 375 });
    const buffer = await png(page), hasImg = () => page.evaluate(() => !!document.querySelector("#mirror canvas"));
    await page.evaluate(() => document.getElementById("pl-0").click()); await page.locator("#plateHit").click();
    await page.locator("#cellPhoto").setInputFiles({ name: "a.png", mimeType: "image/png", buffer });
    await page.waitForFunction(() => !document.getElementById("cropper").hidden);
    assert.equal(await hasImg(), false, "取景期间背后的卡还没有这张图");
    assert.deepEqual(await page.locator("#cropper .btns button").allInnerTexts(), ["取消", "还原", "应用"], "U18：按钮顺序");
    const st = await page.locator("#cropApply").evaluate(n => ({ h: n.getBoundingClientRect().height, solid: n.classList.contains("solid") }));
    assert.ok(st.solid && st.h >= 44, "应用实心、44px 高");
    assert.equal(await page.locator("#cropScope").isVisible(), false, "单格取景不写影响范围");
    await page.locator("#cropZoom").fill("2"); await page.locator("#cropCancel").click();
    assert.equal(await hasImg(), false, "取消：没有图落入作品"); assert.equal(await page.locator("#imgAdjust").isVisible(), false);
    assert.equal(await page.evaluate(() => document.activeElement.id), "imgPick", "取消后焦点回配图面板");
    await page.locator("#cellPhoto").setInputFiles({ name: "a.png", mimeType: "image/png", buffer });
    await page.waitForFunction(() => !document.getElementById("cropper").hidden);
    assert.equal(await page.locator("#cropZoom").inputValue(), "1", "新图从默认取景开始，不带上次取消的副本");
    await page.locator("#cropZoom").fill("2"); await page.locator("#cropApply").click();
    await page.waitForFunction(() => !!document.querySelector("#mirror canvas"));
    assert.equal(await page.evaluate(() => document.activeElement.id), "imgAdjust", "应用后焦点在「调整取景」");
    // 调整已有图：Esc 取消，取景不变；还原只改副本
    await page.locator("#imgAdjust").click(); assert.equal(await page.locator("#cropZoom").inputValue(), "2");
    await page.locator("#cropReset").click(); assert.equal(await page.locator("#cropZoom").inputValue(), "1");
    await page.keyboard.press("Escape"); await page.locator("#imgAdjust").click();
    assert.equal(await page.locator("#cropZoom").inputValue(), "2", "还原后取消：作品里的取景仍是 2 倍"); await page.locator("#cropCancel").click();
    // 默认图：标题与影响范围，应用后没有单独配图的格都用它
    await page.locator("#photo").setInputFiles({ name: "d.png", mimeType: "image/png", buffer });
    await page.waitForFunction(() => !document.getElementById("cropper").hidden);
    assert.equal(await page.locator("#cropTitle").innerText(), "调整取景 · 默认图（以 1L 格为例）");
    assert.equal(await page.locator("#cropScope").innerText(), "应用后，所有没有单独配图的格都用它");
    await page.locator("#cropZoom").fill("1.5"); await page.locator("#cropApply").click(); await page.locator("#imgClose").click();
    const zoomOf = async (i) => { await page.evaluate(i => document.getElementById("pl-" + i).click(), i); await page.locator("#plateHit").click(); await page.locator("#imgAdjust").click(); const z = await page.locator("#cropZoom").inputValue(); await page.locator("#cropCancel").click(); await page.locator("#imgClose").click(); return z; };
    const zs = []; for (const i of [0, 1, 2, 3]) zs.push(await zoomOf(i));
    assert.deepEqual(zs, ["2", "1.5", "1.5", "1.5"], "默认图取景给没有单独配图的格，第 1 格自己的取景不动");
    assert.deepEqual(errors, []); await context.close();
  }
  // T45：配图随草稿保存（浏览器走 IndexedDB）。透明 PNG 存成 PNG、重开后透明度与取景不变；不透明图存 JPEG、不加底色；
  // 页脚只剩一句固定说明，结果写在同一条状态行；缺图那格留空并写明；启动清扫删掉没人引用的文件、保住被引用的
  {
    const { page, context, errors } = await pageFor({ draft: LIFE, width: 375 });
    const pngOf = (transparent) => page.evaluate((t) => { const c = document.createElement("canvas"); c.width = 64; c.height = 48; const x = c.getContext("2d");
      if (t) { x.clearRect(0, 0, 64, 48); x.fillStyle = "#2a6"; x.beginPath(); x.arc(32, 24, 16, 0, 7); x.fill(); } else { x.fillStyle = "#c33"; x.fillRect(0, 0, 64, 48); x.fillStyle = "#36c"; x.fillRect(0, 0, 20, 48); }
      return c.toDataURL("image/png").split(",")[1]; }, transparent).then(b => Buffer.from(b, "base64"));
    const idbFiles = () => page.evaluate(() => new Promise((ok, no) => { const r = indexedDB.open("backronym-media", 1); r.onsuccess = () => { const db = r.result, st = db.transaction("files").objectStore("files"), k = st.getAllKeys(), v = st.getAll();
      v.onsuccess = () => { db.close(); ok(k.result.map((n, i) => [String(n), v.result[i]])); }; }; r.onerror = () => no(String(r.error)); }));
    const draft = () => page.evaluate(() => JSON.parse(localStorage.getItem("backronym-draft-v2")));
    const plateSample = (i) => page.evaluate((i) => { document.getElementById("pl-" + i).click(); const c = document.querySelector("#mirror canvas"); if (!c) return null;
      const d = c.getContext("2d").getImageData(0, 0, c.width, c.height).data; return { w: c.width, h: c.height, px: Array.from(d) }; }, i); // B7-S2：全画布逐像素
    assert.equal(await page.locator(".draft-note p").first().innerText(), "草稿存在本设备，18 小时未改动自动清除", "T49 ⑭：页脚只剩一句");
    // 第 1 格透明 PNG，取景 1.5 倍；默认图不透明，取景 1 倍
    await page.evaluate(() => document.getElementById("pl-0").click()); await page.locator("#plateHit").click();
    await page.locator("#cellPhoto").setInputFiles({ name: "t.png", mimeType: "image/png", buffer: await pngOf(true) });
    await page.waitForFunction(() => !document.getElementById("cropper").hidden); await page.locator("#cropZoom").fill("1.5"); await page.locator("#cropApply").click();
    await page.locator("#photo").setInputFiles({ name: "o.png", mimeType: "image/png", buffer: await pngOf(false) });
    await page.waitForFunction(() => !document.getElementById("cropper").hidden); await page.locator("#cropApply").click(); await page.locator("#imgClose").click();
    await page.waitForFunction(() => { try { const d = JSON.parse(localStorage.getItem("backronym-draft-v2")); return d.media && d.media.def && d.media.cells[0] && /^草稿和配图已保存。/.test(document.getElementById("draftStatus").textContent); } catch (e) { return false; } });
    let d = await draft();
    assert.match(d.media.cells[0], /\.png$/, "透明图存 PNG"); assert.match(d.media.def, /\.jpg$/, "不透明图存 JPEG");
    assert.equal(d.crops[0].z, 1.5); assert.equal(d.media.cells[1], null, "没有单独配图的格不记独立图");
    const files = Object.fromEntries(await idbFiles());
    assert.ok(files[d.media.cells[0]].startsWith("iVBOR") && files[d.media.def].startsWith("/9j/"), "存的就是 PNG / JPEG 字节");
    const alpha = await page.evaluate((b64) => new Promise(ok => { const im = new Image(); im.onload = () => { const c = document.createElement("canvas"); c.width = im.width; c.height = im.height; const x = c.getContext("2d"); x.drawImage(im, 0, 0); ok([x.getImageData(1, 1, 1, 1).data[3], x.getImageData(32, 24, 1, 1).data[3]]); }; im.src = "data:image/png;base64," + b64; }), files[d.media.cells[0]]);
    assert.deepEqual(alpha, [0, 255], "存下的 PNG 圆外仍透明、圆内不透明");
    const before0 = await plateSample(0), before1 = await plateSample(1);
    // 重开：图、取景、透明度都回来；文字草稿也照常
    await page.reload(); await page.waitForFunction(() => !document.getElementById("wordInput").disabled && document.getElementById("entry").hidden);
    const after0 = await plateSample(0), after1 = await plateSample(1);
    assert.ok(after0.w === before0.w && after0.px.length === before0.px.length && after0.px.every((v, k) => v === before0.px[k]), "透明 PNG：重开后卡上全画布逐像素一致（透明处仍露出图版底色，取景不变）");
    // JPEG 有损：硬边附近个别像素会差几十，取平均差衡量；底色变了或取景移了，平均差会大得多
    const diff = after1.px.reduce((m, v, k) => m + Math.abs(v - before1.px[k]), 0) / after1.px.length;
    assert.ok(after1.w === before1.w && diff < 2, "不透明图：JPEG 重开后无底色、取景变化（平均像素差 " + diff.toFixed(2) + "）");
    await page.evaluate(() => document.getElementById("pl-0").click()); await page.locator("#plateHit").click(); await page.locator("#imgAdjust").click();
    assert.equal(await page.locator("#cropZoom").inputValue(), "1.5", "取景恢复"); await page.locator("#cropCancel").click(); await page.locator("#imgClose").click();
    assert.equal((await page.locator("#draftStatus").innerText()).trim(), "", "只是打开：不改写、不另报状态");
    assert.equal(JSON.stringify(await draft()), JSON.stringify(d), "恢复不改写草稿（同图不重复写、不换名）");
    assert.equal((await idbFiles()).length, 2, "没有多写文件");
    // 缺席后端：塞孤儿并删除第1格PNG；来源未知，缺图回落默认图并保留引用，暂停清扫。
    const orphan = "m4-0123456789abcdef.jpg";
    await page.evaluate(([orphan, gone]) => new Promise(ok => { const r = indexedDB.open("backronym-media", 1); r.onsuccess = () => { const db = r.result, tx = db.transaction("files", "readwrite"), st = tx.objectStore("files"); st.put("QUFB", orphan); st.delete(gone); tx.oncomplete = () => { db.close(); ok(); }; }; }), [orphan, d.media.cells[0]]);
    await page.reload(); await page.waitForFunction(() => !document.getElementById("wordInput").disabled && document.getElementById("entry").hidden);
    assert.match(await page.locator("#draftStatus").innerText(), /^有 1 张配图暂时读不出来（第 1 格），缺图的格先用默认图，请及时导出或稍后重开再试。\s*$/, "B7-S1：有默认图时照实说回落");
    assert.deepEqual((await idbFiles()).map(f => f[0]).sort(), [orphan, d.media.def].sort(), "来源未知且后端缺席：暂停清扫，保留原文件");
    // B7-S2：取消（按钮 / 点外面）零副作用：草稿字符串与 IndexedDB 文件数都不变
    const snap = async () => [await page.evaluate(k => localStorage.getItem(k), KEY), (await idbFiles()).length];
    const before = await snap();
    await page.evaluate(() => document.getElementById("pl-2").click()); await page.locator("#plateHit").click();
    await page.locator("#cellPhoto").setInputFiles({ name: "x.png", mimeType: "image/png", buffer: await pngOf(true) });
    await page.waitForFunction(() => !document.getElementById("cropper").hidden); await page.locator("#cropZoom").fill("2");
    await page.locator("#cropper").click({ position: { x: 5, y: 5 } }); // 点面板外面（遮罩）
    assert.equal(await page.locator("#cropper").isVisible(), false, "点外面 = 取消");
    await page.waitForTimeout(700); assert.deepEqual(await snap(), before, "取消后草稿与配图文件都没变");
    await page.locator("#imgClose").click();
    // 缺图的格回落默认图；只改文字不释放可能仍在缺席后端的引用。
    await page.evaluate(() => document.getElementById("pl-1").click()); await page.locator("#capCtl").click(); await page.keyboard.type("新");
    await savedWhere(page, 'd.captions[1].includes("新")');
    d = await draft(); assert.ok(d.media.cells[0], "缺席后端来源未知，保留旧引用"); assert.ok(d.media.def);
    assert.deepEqual(errors, []); await context.close();
  }
  // B7-R1：18h 到期稿 / 无图稿启动，本次启动内就清掉没人引用的配图；有效含图稿保住引用、清掉孤儿。B7-R5：换图落盘后本次会话内清掉旧图
  {
    const seedFiles = (page, files) => page.evaluate((files) => new Promise((ok) => { const r = indexedDB.open("backronym-media", 1);
      r.onupgradeneeded = () => r.result.createObjectStore("files");
      r.onsuccess = () => { const db = r.result, tx = db.transaction("files", "readwrite"), st = tx.objectStore("files"); files.forEach(([k, v]) => st.put(v, k)); tx.oncomplete = () => { db.close(); ok(); }; }; }), files);
    const keysNow = (page) => page.evaluate(() => new Promise((ok) => { const r = indexedDB.open("backronym-media", 1);
      r.onupgradeneeded = () => r.result.createObjectStore("files");
      r.onsuccess = () => { const db = r.result, q = db.transaction("files").objectStore("files").getAllKeys(); q.onsuccess = () => { db.close(); ok(q.result.map(String).sort()); }; }; }));
    const A = "m4-aaaaaaaaaaaaaaaa.jpg", B = "m4-bbbbbbbbbbbbbbbb.jpg", O = "m4-cccccccccccccccc.jpg";
    for (const [label, draftOf, keep] of [
      ["到期稿", () => ({ ...LIFE, media: { def: A, cells: [B, null, null, null] }, crops: [null, null, null, null], t: Date.now() - 19 * 3600e3 }), []],
      ["无图稿", () => ({ ...LIFE, t: Date.now() - 5000 }), []],
      ["没有草稿", null, []],
    ]) {
      const context = await browser.newContext({ viewport: { width: 375, height: 812 } });
      await context.addInitScript(({ d, KEY }) => { if (!sessionStorage.getItem("s")) { if (d) localStorage.setItem(KEY, JSON.stringify(d)); else localStorage.removeItem(KEY); sessionStorage.setItem("s", "1"); } }, { d: draftOf ? draftOf() : null, KEY });
      const page = await context.newPage(); const errors = []; page.on("pageerror", e => errors.push(e.message));
      await page.goto(url + "/assets/style.css"); // 先进同源页面把文件放进 IndexedDB（还没加载应用）
      await seedFiles(page, [[A, "QUFB"], [B, "QkJC"], [O, "Q0ND"]]);
      await page.goto(url); await page.waitForFunction(() => !document.getElementById("wordInput").disabled);
      await page.waitForFunction(async () => true);
      const t0 = Date.now(); let left;
      while (Date.now() - t0 < 3000) { left = await keysNow(page); if (left.length === keep.length) break; await page.waitForTimeout(100); }
      assert.deepEqual(left, keep, label + "：启动 3 秒内无人引用的配图被清掉，不等切前台");
      assert.deepEqual(errors, []); await context.close();
    }
    // 有效含图稿：引用的 A、B 保住，孤儿 O 清掉；之后把第 1 格的图换成别的，落盘后本次会话内 B 被清掉（B7-R5）
    const context = await browser.newContext({ viewport: { width: 375, height: 812 } });
    const real = await (async () => { const p = await context.newPage(); await p.goto(url + "/assets/style.css");
      const v = await p.evaluate(() => { const c = document.createElement("canvas"); c.width = 8; c.height = 8; const x = c.getContext("2d"); x.fillStyle = "#c33"; x.fillRect(0, 0, 8, 8); return c.toDataURL("image/jpeg", 0.92).split(",")[1]; });
      await p.close(); return v; })();
    const live = { ...LIFE, media: { def: A, cells: [B, null, null, null] }, crops: [null, null, null, null], t: Date.now() - 5000 };
    await context.addInitScript(({ d, KEY }) => { if (!sessionStorage.getItem("s")) { localStorage.setItem(KEY, JSON.stringify(d)); sessionStorage.setItem("s", "1"); } }, { d: live, KEY });
    const page = await context.newPage(); const errors = []; page.on("pageerror", e => errors.push(e.message));
    await page.goto(url + "/assets/style.css");
    await seedFiles(page, [[A, real], [B, real], [O, "Q0ND"]]);
    await page.goto(url); await page.waitForFunction(() => !document.getElementById("wordInput").disabled && document.getElementById("entry").hidden);
    const t0 = Date.now(); let left;
    while (Date.now() - t0 < 3000) { left = await keysNow(page); if (left.length === 2) break; await page.waitForTimeout(100); }
    assert.deepEqual(left, [A, B].sort(), "有效含图稿：引用保住、孤儿清掉");
    await page.evaluate(() => document.getElementById("pl-0").click()); await page.locator("#plateHit").click();
    await page.locator("#cellPhoto").setInputFiles({ name: "z.png", mimeType: "image/png", buffer: await png(page) });
    await page.waitForFunction(() => !document.getElementById("cropper").hidden); await page.locator("#cropApply").click(); await page.locator("#imgClose").click();
    await page.waitForFunction((B) => { try { const x = JSON.parse(localStorage.getItem("backronym-draft-v2")); return x.media.cells[0] && x.media.cells[0] !== B; } catch (e) { return false; } }, B);
    const t1 = Date.now();
    while (Date.now() - t1 < 3000) { left = await keysNow(page); if (left.indexOf(B) < 0) break; await page.waitForTimeout(100); }
    assert.ok(left.indexOf(B) < 0 && left.indexOf(A) >= 0 && left.length === 2, "换图落盘后本次会话内旧图被清掉，默认图保住：" + left.join(","));
    assert.deepEqual(errors, []); await context.close();
  }
  // B7-R2（复审）：存图后端暂不可用 → 恢复时图读不出来，只改填表人并保存，草稿仍引用原图与取景；后端恢复后重开，图与取景都回来；之后明确移除仍生效
  {
    const context = await browser.newContext({ viewport: { width: 375, height: 812 } });
    await context.addInitScript(() => { if (sessionStorage.getItem("noidb") === "1") Object.defineProperty(window, "indexedDB", { value: undefined }); });
    const page = await context.newPage(); const errors = []; page.on("pageerror", e => errors.push(e.message));
    await page.goto(url + "/assets/style.css");
    const D = "m4-dddddddddddddddd.jpg", C = "m4-eeeeeeeeeeeeeeee.png";
    const seeded = { ...LIFE, media: { def: D, cells: [C, null, null, null] }, crops: [{ z: 2, x: 0.5, y: 0.5 }, { z: 1.5, x: 0.5, y: 0.5 }, null, null] };
    await page.evaluate(({ D, C, seeded, KEY }) => new Promise((ok) => {
      const pic = (t) => { const c = document.createElement("canvas"); c.width = 40; c.height = 30; const x = c.getContext("2d"); x.fillStyle = t === "png" ? "#2a6" : "#c33"; x.fillRect(0, 0, 40, 30); return c.toDataURL(t === "png" ? "image/png" : "image/jpeg", 0.92).split(",")[1]; };
      localStorage.setItem(KEY, JSON.stringify({ ...seeded, t: Date.now() - 5000 })); sessionStorage.setItem("noidb", "1");
      const r = indexedDB.open("backronym-media", 1); r.onupgradeneeded = () => r.result.createObjectStore("files");
      r.onsuccess = () => { const db = r.result, tx = db.transaction("files", "readwrite"), st = tx.objectStore("files"); st.put(pic("jpg"), D); st.put(pic("png"), C); tx.oncomplete = () => { db.close(); ok(); }; };
    }), { D, C, seeded, KEY });
    await page.goto(url); await page.waitForFunction(() => !document.getElementById("wordInput").disabled && document.getElementById("entry").hidden);
    assert.match(await page.locator("#draftStatus").innerText(), /^有 2 张配图暂时读不出来（默认图、第 1 格），已留空，请及时导出或稍后重开再试。/);
    await page.locator("#toEntry").click(); await page.locator("#fillerCtl").fill("新人");
    await page.locator("#entryBack").click(); if (await page.locator("#leavePop").isVisible()) await page.locator("#leaveSave").click();
    await page.waitForFunction((k) => { try { return JSON.parse(localStorage.getItem(k)).filler === "新人"; } catch (e) { return false; } }, KEY);
    let d = JSON.parse(await page.evaluate(k => localStorage.getItem(k), KEY));
    assert.deepEqual(d.media, seeded.media, "只改文字：暂未读回的图照旧引用"); assert.deepEqual(d.crops, seeded.crops, "取景一起保留");
    // 后端恢复 → 重开：图与取景都回来
    await page.evaluate(() => sessionStorage.setItem("noidb", "0")); await page.reload();
    await page.waitForFunction(() => !document.getElementById("wordInput").disabled && document.getElementById("entry").hidden);
    assert.doesNotMatch(await page.locator("#draftStatus").innerText(), /暂时读不出来|没能找回/);
    const zoomOf = async (i) => { await page.evaluate(i => document.getElementById("pl-" + i).click(), i); const has = await page.evaluate(() => !!document.querySelector("#mirror canvas")); await page.locator("#plateHit").click(); await page.locator("#imgAdjust").click(); const z = await page.locator("#cropZoom").inputValue(); await page.locator("#cropCancel").click(); await page.locator("#imgClose").click(); return [has, z]; };
    assert.deepEqual(await zoomOf(0), [true, "2"], "第 1 格独立图与取景恢复"); assert.deepEqual(await zoomOf(1), [true, "1.5"], "默认图与那格取景恢复");
    // 明确移除第 1 格的图：生效
    await page.evaluate(() => document.getElementById("pl-0").click()); await page.locator("#plateHit").click(); await page.locator("#imgRemove").click(); await page.locator("#imgClose").click();
    await page.waitForFunction((k) => { try { const x = JSON.parse(localStorage.getItem(k)); return x.media.cells[0] === null && !!x.media.def; } catch (e) { return false; } }, KEY);
    assert.deepEqual(errors, []); await context.close();
  }
  // T45：没有可用的存图后端（IndexedDB 打不开）→ 状态行写明不支持；页脚固定说明不变
  {
    const context = await browser.newContext({ viewport: { width: 375, height: 812 } });
    await context.addInitScript(({ draft, KEY }) => {
      if (!sessionStorage.getItem("seeded")) { localStorage.setItem(KEY, JSON.stringify({ ...draft, t: Date.now() - 5000 })); sessionStorage.setItem("seeded", "1"); }
      Object.defineProperty(window, "indexedDB", { value: undefined });
    }, { draft: LIFE, KEY });
    const page = await context.newPage(); const errors = []; page.on("pageerror", e => errors.push(e.message));
    await page.goto(url); await page.waitForFunction(() => !document.getElementById("wordInput").disabled);
    await page.evaluate(() => document.getElementById("pl-0").click()); await page.locator("#plateHit").click();
    await page.locator("#cellPhoto").setInputFiles({ name: "a.png", mimeType: "image/png", buffer: await png(page) });
    await page.waitForFunction(() => !document.getElementById("cropper").hidden); await page.locator("#cropApply").click();
    await page.waitForFunction(() => /^这台设备不支持保存配图，重开后需要重新选图；文字草稿已保存，请及时导出。/.test(document.getElementById("draftStatus").textContent));
    assert.equal(await page.locator(".draft-note p").first().innerText(), "草稿存在本设备，18 小时未改动自动清除");
    assert.equal(JSON.parse(await page.evaluate(k => localStorage.getItem(k), KEY)).media, undefined, "没存成的图不进草稿");
    assert.deepEqual(errors, []); await context.close();
  }
  // T21a：选色仍立即应用，深浅均检查；提示可见五秒且不拦操作；原生取色器保留焦点。
  {
    const { page, context, errors } = await pageFor({ draft: LIFE });
    await page.locator("#title").fill("我的标题");
    const input = page.locator("#tcolorCustom");
    await input.focus();
    assert.equal(await input.evaluate(n => n.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true }))), true);
    assert.equal(await page.evaluate(() => document.activeElement.id), "tcolorCustom");
    await input.evaluate(n => { n.value = "#d9c27a"; n.dispatchEvent(new Event("change", { bubbles: true })); });
    assert.equal(await page.locator("#title").evaluate(n => getComputedStyle(n.querySelector("[style]") || n).color), "rgb(217, 194, 122)");
    const toast = page.locator("#toast");
    assert.equal(await toast.getAttribute("role"), "status"); assert.ok(await toast.isVisible());
    // T33：统一 Toast 在卡顶标题之下、在可视区内（含模拟 iOS 软键盘），与键盘行不重叠
    const assertBelowTitle = async () => {
      const r = await page.evaluate(() => ({ toast: document.getElementById("toast").getBoundingClientRect().toJSON(), title: document.getElementById("title").getBoundingClientRect().toJSON(), kb: document.getElementById("kbRow").getBoundingClientRect().toJSON(), vv: (window.visualViewport || {}).height || innerHeight }));
      assert.ok(r.toast.top >= Math.min(r.title.bottom, r.vv) - 1 || r.title.bottom < 0, "提示在标题之下");
      assert.ok(r.toast.top >= 0 && r.toast.bottom <= r.vv + 1, "提示在可视区内");
      assert.ok(r.toast.bottom <= r.kb.top + 1, "不压在键盘行上");
    };
    await assertBelowTitle();
    await shot(page, "color-toast");
    await page.evaluate(() => {
      window.realViewport = window.visualViewport;
      Object.defineProperty(window, "visualViewport", { configurable: true, value: { height: innerHeight - 300, offsetTop: 0 } });
      window.realViewport.dispatchEvent(new Event("resize"));
    });
    await page.waitForTimeout(50);
    await assertBelowTitle(); await shot(page, "color-toast-keyboard");
    const keyboardGap = await page.locator("#kbRow").evaluate(n => innerHeight - n.getBoundingClientRect().bottom);
    assert.equal(keyboardGap, 300, "模拟 iOS 软键盘时键盘行上移");
    await page.evaluate(() => {
      Object.defineProperty(window, "visualViewport", { configurable: true, value: window.realViewport });
      window.realViewport.dispatchEvent(new Event("resize"));
    });
    await page.waitForTimeout(2600); assert.match(await toast.innerText(), /容易看不清/, "颜色提醒停 3 秒（U1）");
    await page.waitForFunction(() => document.getElementById("toast").textContent === "", null, { timeout: 1500 });
    await input.evaluate(n => { n.value = "#000000"; n.dispatchEvent(new Event("change", { bubbles: true })); });
    assert.equal(await toast.innerText(), "", "浅底黑色不警告");
    await input.evaluate(n => { n.value = "#808080"; n.dispatchEvent(new Event("change", { bubbles: true })); });
    assert.equal(await toast.innerText(), "");
    // DEVICE-R2 / B8-R3：只按当前档底色判断；切深浅后对已用的自选色重判（走真实的深浅按钮，触发 rethemeTitle）
    await page.evaluate(() => window.THEME.setSkin("dansaekhwa")); // 四个主题（2026-11-12）：默认的 fandom 只有浅色，切深浅用单色画测
    const toTheme = async (t) => { await page.locator("#settingsOpen").click(); await page.locator("#modeGroup label").nth(t === "dark" ? 2 : 1).click(); await page.locator("#settingsClose").click(); await page.waitForTimeout(80); }; // v00.03.00：深浅在设置页
    await toTheme("dark");
    await input.evaluate(n => { n.value = "#ffffff"; n.dispatchEvent(new Event("change", { bubbles: true })); });
    assert.equal(await toast.innerText(), "", "深底白色不警告（真机误报）");
    await toTheme("light");
    assert.match(await toast.innerText(), /容易看不清/, "切到浅色后白字重判为看不清");
    await toTheme("dark");
    assert.equal(await toast.innerText(), "", "切回深色后清掉这条提醒");
    for (const theme of ["light", "dark"]) {
      await page.evaluate(t => document.documentElement.setAttribute("data-theme", t), theme);
      assert.equal(await page.locator(".custom-mark").evaluate(n => getComputedStyle(n).borderStyle), "dashed");
      assert.equal(await input.evaluate(n => getComputedStyle(n).opacity), "0");
    }
    assert.deepEqual(errors, []); await context.close();
  }
  console.log("browser panels ok: credits semantics + keyboard, narrow pager, crop buttons + keyboard + mapping, T44 work copy cancel / reset / apply + default scope, T45 IndexedDB transparent PNG + JPEG + reopen + missing + sweep + no backend, custom color + three-second toast below title");
} finally {
  if (browser) await browser.close();
  await new Promise(resolve => server.close(resolve));
}
