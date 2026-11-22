// 第七批批次 1 回归（T27 / T28 / T33）：使用现有 Playwright，不安装依赖；新端口、新上下文，绝不操作用户预览存储。
// PLAYWRIGHT_MODULE=/absolute/path/to/playwright CHROMIUM_PATH=/path/to/chromium node scripts/test-input-browser.mjs
// 覆盖：320 / 360 / 375 / 414 宽下所有可聚焦输入框的计算字号 ≥ 16px（iOS 聚焦不自动放大）、缩放后的透明输入框仍与镜像对齐、
// DOM 卡与版式一致（scripts/check-dom-layout.js）、滚到底后逐字输入时滚动位置不被夹回（页面只许变高）。真实软键盘与 iOS 缩放只能真机看。
import { createRequire } from "node:module";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const root = fileURLToPath(new URL("../app/", import.meta.url));
const layoutCheck = await readFile(fileURLToPath(new URL("./check-dom-layout.js", import.meta.url)), "utf8");
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
try {
  browser = await chromium.launch({ headless: true, ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}) });
  { const make = browser.newContext.bind(browser); browser.newContext = options => make({ locale: "zh-CN", ...options }); } // v00.04.00 批 1：界面语言跟随环境，无头浏览器默认报英文；本脚本测的是中文界面
  async function pageFor({ draft = LIFE, width = 375, height = 812 } = {}) {
    const context = await browser.newContext({ viewport: { width, height } });
    await context.addInitScript(({ draft, KEY }) => {
      if (!sessionStorage.getItem("seeded")) {
        if (draft) localStorage.setItem(KEY, JSON.stringify({ ...draft, t: Date.now() - 5000 }));
        localStorage.setItem("backronym-tip-seen", "1");
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
  const fontPx = (page, sel) => page.locator(sel).evaluate(n => parseFloat(getComputedStyle(n).fontSize));

  // T27：四个宽度下，可聚焦输入框的计算字号 ≥ 16px；透明输入框缩放后与镜像同宽、左端对齐；DOM 卡与版式一致
  for (const width of [320, 360, 375, 414]) {
    const { page, context, errors } = await pageFor({ width });
    for (const sel of ["#wordCtl", "#glossCtl", "#capCtl", "#title", "#tcolorCustom"]) {
      assert.ok(await fontPx(page, sel) >= 16, width + " 宽 " + sel + " 字号 ≥ 16px");
    }
    for (const [ctl, role] of [["#glossCtl", "gloss"], ["#capCtl", "caption"], ["#wordCtl", "word"]]) {
      const r = await page.evaluate(([ctl, role]) => {
        const c = document.querySelector(ctl).getBoundingClientRect(), m = document.querySelector('#mirror [data-role="' + role + '"]').getBoundingClientRect();
        const k = Number(document.getElementById("card").getAttribute("data-k"));
        return { dl: Math.abs(c.left - m.left), w: c.width, cw: 920 * k };
      }, [ctl, role]);
      assert.ok(r.dl < 1, width + " 宽 " + ctl + " 左端与镜像对齐");
      assert.ok(Math.abs(r.w - r.cw) < 1, width + " 宽 " + ctl + " 缩放后可视宽 = 版式宽");
    }
    const logs = []; page.on("console", m => logs.push(m.text()));
    await page.evaluate(layoutCheck);
    assert.ok(logs.some(t => /dom layout ok/.test(t)), width + " 宽 DOM 卡与版式一致：" + logs.join(" | "));
    await page.locator("#toEntry").click();
    for (const sel of ["#wordInput", "#fillerCtl"]) assert.ok(await fontPx(page, sel) >= 16, width + " 宽 " + sel + " 字号 ≥ 16px");
    assert.deepEqual(errors, []); await context.close();
  }

  // T28：滚到页面底部再逐字输入，候选栏 / 提示行变矮时页面不缩短、滚动位置不被夹回；离开输入框后放开
  {
    const { page, context, errors } = await pageFor({ width: 375, height: 520, draft: { ...LIFE, picks: [null, ["ice", ""], ["fire", ""], ["echo", ""]], glosses: ["", "冰", "火", "回声"] } });
    await page.locator("#wordCtl").click();
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    const ys = [await page.evaluate(() => scrollY)];
    for (const ch of ["l", "o", "v", "e", "l", "y", "z"]) { await page.keyboard.type(ch); await page.waitForTimeout(30); ys.push(await page.evaluate(() => scrollY)); }
    for (let i = 0; i < 4; i++) { await page.keyboard.press("Backspace"); await page.waitForTimeout(30); ys.push(await page.evaluate(() => scrollY)); }
    assert.ok(ys.every(y => y === ys[0]), "逐字输入时滚动位置不变：" + ys.join(","));
    assert.notEqual(await page.locator("#app").evaluate(n => n.style.minHeight), "", "输入期间锁住页面高度");
    await page.locator("#wordCtl").blur(); await page.waitForTimeout(500);
    assert.equal(await page.locator("#app").evaluate(n => n.style.minHeight), "", "离开输入框后放开");
    // 配文框同样：滚到底、输入、删光，不跳
    await page.locator("#capCtl").click();
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    const y0 = await page.evaluate(() => scrollY);
    await page.keyboard.type("一二三"); await page.keyboard.press("Control+A"); await page.keyboard.press("Backspace");
    assert.equal(await page.evaluate(() => scrollY), y0, "配文输入删光不跳");
    assert.deepEqual(errors, []); await context.close();
  }

  // T28：入场页打第一个字母时，下方的填表人框不往下推
  {
    const { page, context, errors } = await pageFor({ draft: null });
    const before = await page.locator("#fillerCtl").evaluate(n => n.getBoundingClientRect().top);
    await page.locator("#wordInput").type("L");
    const after = await page.locator("#fillerCtl").evaluate(n => n.getBoundingClientRect().top);
    assert.ok(Math.abs(after - before) < 1, "打第一个字母时填表人框不移位：" + before + " → " + after);
    assert.deepEqual(errors, []); await context.close();
  }
  const held = page => page.evaluate(() => { // 当前 minHeight 与去掉它之后的自然高度
    const a = document.getElementById("app"), m = a.style.minHeight; a.style.minHeight = ""; const n = a.offsetHeight; a.style.minHeight = m;
    return { m: parseFloat(m) || 0, n };
  });
  const snap = page => page.evaluate(() => ({ y: scrollY, h: document.documentElement.scrollHeight, v: document.getElementById("wordCtl").value, cand: !document.getElementById("cand").hidden, list: !document.getElementById("candList").hidden && !document.getElementById("candRow").hidden, act: document.activeElement.id }));
  const FIRST_L = { ...LIFE, picks: [["l", ""], ["ice", ""], ["fire", ""], ["echo", ""]], glosses: ["", "冰", "火", "回声"] };

  // 返工 R1：候选展开、滚到底后开始组字——候选收起但页面不缩短、不跳；组字中回车不提交；组字结束照常继续输入；普通回车收键盘、失焦放开
  for (const pick of ["l", "lo"]) {
    const { page, context, errors } = await pageFor({ width: 320, height: 560, draft: { ...FIRST_L, picks: [[pick, ""], ...FIRST_L.picks.slice(1)] } }); // 560：候选栏头固定两行后栏高了约 38px，滚到底时单词框仍要整个在视口内（否则继续输入时浏览器会把它滚回来，与本用例要测的「不跳」无关）
    await page.locator("#wordCtl").click();
    await page.waitForFunction(() => !document.getElementById("cand").hidden);
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    const a = await snap(page);
    assert.ok(a.y > 0 && a.cand, pick + "：候选已展开且滚到底 " + JSON.stringify(a));
    await page.locator("#wordCtl").dispatchEvent("compositionstart");
    const b = await snap(page);
    assert.deepEqual([b.cand, b.list], [true, false], pick + "：组字开始收起候选列表，只留提示行（v00.03.01 E6：计数器组字期间也看得到）");
    assert.equal(b.y, a.y, pick + "：组字开始不跳 " + a.y + " → " + b.y);
    assert.ok(b.h >= a.h, pick + "：页面不缩短 " + a.h + " → " + b.h);
    assert.equal(b.v, a.v, pick + "：组字开始不改写输入");
    for (const init of [{ isComposing: true }, { keyCode: 229 }]) {
      await page.evaluate(init => {
        const e = new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true, isComposing: !!init.isComposing });
        if (init.keyCode) Object.defineProperty(e, "keyCode", { get: () => init.keyCode });
        document.getElementById("wordCtl").dispatchEvent(e);
      }, init);
      assert.equal((await snap(page)).act, "wordCtl", pick + "：组字中的回车不提交、不收键盘 " + JSON.stringify(init));
    }
    await page.locator("#wordCtl").dispatchEvent("compositionend");
    await page.keyboard.type("ve");
    const c = await snap(page);
    assert.match(c.v, new RegExp("^" + pick + "ve$", "i"), pick + "：组字结束后照常输入 " + c.v);
    assert.equal(c.y, a.y, pick + "：组字结束、继续输入不跳");
    await page.keyboard.press("Enter");
    const d = await snap(page);
    assert.notEqual(d.act, "wordCtl", pick + "：普通回车收键盘"); assert.equal(d.cand, false);
    await page.waitForTimeout(500);
    assert.equal(await page.locator("#app").evaluate(n => n.style.minHeight), "", pick + "：失焦后放开锁高");
    assert.deepEqual(errors, []); await context.close();
  }

  // 返工 R1：切格、切视图、进出入场页不留无效 minHeight
  {
    const { page, context, errors } = await pageFor({ width: 320, height: 520, draft: FIRST_L });
    await page.locator("#wordCtl").click(); await page.waitForFunction(() => !document.getElementById("cand").hidden);
    assert.ok((await held(page)).m > 0, "输入中锁住高度");
    await page.locator("#pl-1").click(); // 点第 2 格字母：切格
    assert.equal((await held(page)).m, 0, "切格后立即放开（不等 400ms）");
    await page.locator("#wordCtl").click(); await page.waitForFunction(() => !document.getElementById("cand").hidden);
    await page.locator("#viewGrid").click();
    assert.equal((await held(page)).m, 0, "切到列阵后放开");
    await page.locator("#viewSingle").click();
    await page.locator("#wordCtl").click(); await page.waitForFunction(() => !document.getElementById("cand").hidden);
    await page.locator("#toEntry").click(); await page.waitForFunction(() => !document.getElementById("entry").hidden);
    let h = await held(page);
    assert.equal(await page.evaluate(() => document.activeElement.id), "wordInput");
    assert.ok(h.m <= h.n + 1, "进入场页：锁高按入场页自身高度，不带编辑页的 " + JSON.stringify(h));
    await page.locator("#entryBack").click(); await page.waitForFunction(() => document.getElementById("entry").hidden);
    h = await held(page);
    assert.ok(h.m <= h.n + 1, "回编辑页：不带入场页的锁高 " + JSON.stringify(h));
    await page.locator("#wordCtl").blur(); await page.waitForTimeout(500);
    assert.equal((await held(page)).m, 0, "离开后放开");
    assert.deepEqual(errors, []); await context.close();
  }

  // 返工 R2：入场页报错 / 清错时后续字段不移位；错误文字、aria-invalid 正确；窄屏错误换行不重叠
  for (const width of [320, 375]) {
    const { page, context, errors } = await pageFor({ draft: null, width });
    const tops = () => page.evaluate(() => ["fillerCtl", "entryStart"].map(id => document.getElementById(id).getBoundingClientRect().top));
    const t0 = await tops();
    await page.locator("#wordInput").focus(); await page.keyboard.press("Enter");
    assert.equal(await page.locator("#wordErr").innerText(), "先输入一个单词");
    assert.equal(await page.locator("#wordInput").getAttribute("aria-invalid"), "true");
    assert.deepEqual(await page.locator("#wordInput").getAttribute("aria-describedby"), "wordSense wordErr", "错误仍关联到输入框（U4 删了 wordHelp，T36 加了义项行）");
    const t1 = await tops();
    await page.keyboard.type("L");
    assert.equal(await page.locator("#wordErr").innerText(), ""); assert.equal(await page.locator("#wordInput").getAttribute("aria-invalid"), null);
    const t2 = await tops();
    t0.forEach((t, i) => { assert.ok(Math.abs(t1[i] - t) < 1 && Math.abs(t2[i] - t) < 1, width + " 宽：报错 / 清错时下方字段不移位 " + [t, t1[i], t2[i]]); });
    // 屏蔽词说明（较长）：就算换行也不压住下一个元素
    for (const [input, val, err] of [["#wordInput", "SEX", "#wordErr"], ["#fillerCtl", "加微信", "#fillerErr"]]) {
      await page.locator("#wordInput").fill(input === "#wordInput" ? val : "LIFE"); await page.locator("#fillerCtl").fill(input === "#fillerCtl" ? val : "");
      await page.locator(input).press("Enter");
      assert.match(await page.locator(err).innerText(), /不适合/, width + " 宽 " + err + " 显示");
      const gap = await page.evaluate(sel => { const e = document.querySelector(sel); let n = e.nextElementSibling || e.parentNode.nextElementSibling; while (n && !n.getClientRects().length) n = n.nextElementSibling; /* 空着不显示的行（如语言没就绪的说明）跳过 */ return n.getBoundingClientRect().top - e.getBoundingClientRect().bottom; }, err);
      assert.ok(gap >= -0.5, width + " 宽 " + err + " 不与下一元素重叠：" + gap);
    }
    assert.deepEqual(errors, []); await context.close();
  }

  // 返工 R3：软键盘可视区（模拟 visualViewport 的 offsetTop / height）——控件和候选都在可视区内就不滚；被盖住才滚，且只滚盖住的那段
  {
    const { page, context, errors } = await pageFor({ width: 375, height: 520, draft: FIRST_L });
    await page.evaluate(() => {
      const fake = { offsetTop: 0, height: innerHeight, width: innerWidth, scale: 1, addEventListener() {}, removeEventListener() {} };
      window.__vv = fake; Object.defineProperty(window, "visualViewport", { configurable: true, get: () => fake });
    });
    const region = () => page.evaluate(() => ({ t: document.getElementById("wordCtl").getBoundingClientRect().top, b: document.getElementById("cand").getBoundingClientRect().bottom, y: scrollY }));
    await page.locator("#wordCtl").click(); await page.waitForFunction(() => !document.getElementById("cand").hidden);
    let r = await region();
    assert.ok(r.t > 40, "词框不在顶边：" + JSON.stringify(r));
    await page.evaluate(r => { __vv.offsetTop = r.t - 20; __vv.height = r.b + 8 - (r.t - 20) + 10; }, r); // 可视区下移（iOS 先自己滚了一段）但控件与候选都在里面
    await page.waitForTimeout(450);
    assert.equal((await region()).y, r.y, "可视区已含控件与候选：不再滚（计入 offsetTop）");
    await page.locator("#wordCtl").blur(); await page.waitForTimeout(500);
    await page.locator("#wordCtl").click(); await page.waitForFunction(() => !document.getElementById("cand").hidden);
    r = await region();
    await page.evaluate(r => { __vv.offsetTop = 0; __vv.height = r.b + 8 - 60; }, r); // 候选下沿被盖住 60px
    await page.waitForTimeout(450);
    const dy = (await region()).y - r.y;
    assert.ok(Math.abs(dy - 60) <= 2, "被盖住才滚，只滚盖住的那段：" + dy);
    assert.deepEqual(errors, []); await context.close();
  }

  console.log("browser input ok: inputs ≥ 16px at 320/360/375/414 + mirror alignment + dom layout, no scroll clamp while typing, entry preview reserved, compositionstart hold + IME Enter, no stale minHeight on cell/view/entry switch, entry errors reserved, visualViewport reveal");
} finally {
  if (browser) await browser.close();
  server.close();
}
