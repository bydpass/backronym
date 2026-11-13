// 可选浏览器回归：使用现有 Playwright，不安装依赖；新端口、新上下文，绝不操作用户预览存储。
// PLAYWRIGHT_MODULE=/absolute/path/to/playwright CHROMIUM_PATH=/path/to/chromium node scripts/test-draft-browser.mjs
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
let browser;
const TTL = 64800000, KEY = "backronym-draft-v2", OLD = "acronym-draft-v1", OLD_BAK = OLD + "-bak"; // 旧键只用于核对被删除
try {
  browser = await chromium.launch({ headless: true, ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}) });
  async function pageFor(age, settings = {}) {
    const context = await browser.newContext({ viewport: { width: 375, height: 812 } });
    await context.addInitScript(({ age, settings, KEY, OLD, OLD_BAK }) => {
      const realNow = Date.now.bind(Date); window.testOffset = 0;
      Date.now = () => realNow() + window.testOffset;
      // 一次植入，刷新用实际存储，避免夹具把已删除草稿写回来。
      if (!sessionStorage.getItem("seeded")) {
        const d = { v: 2, t: Date.now() - age, word: "LIFE", titleRuns: [{t:"标题",b:true}], filler:"作者", picks: [["love",""],["ice",""],["fire",""],["echo",""]] };
        if (settings.noTime) delete d.t;
        if (settings.breakApply) { sessionStorage.setItem("break", "1"); d.future = { x: [1, 2] }; } // 未知字段
        localStorage.setItem(KEY, settings.breakApply ? JSON.stringify(d, null, 1) : JSON.stringify(d)); // 带缩进：副本必须逐字节相同
        // 旧版草稿（含备份）：升级后必须被删掉，不论是否过期
        localStorage.setItem(OLD, JSON.stringify({ ...d, t: Date.now() })); localStorage.setItem(OLD_BAK, JSON.stringify({ ...d, t: Date.now() }));
        localStorage.setItem("theme-control", "keep"); sessionStorage.setItem("seeded", "1");
        // 端存储里有更新的 LOVE（本地是 LIFE）：fakeRemote 用 sessionStorage 模拟端存储，刷新后还在
        if (settings.fakeRemote) {
          sessionStorage.setItem("fakeRemote", JSON.stringify({ [KEY]: JSON.stringify({ ...d, word: "LOVE", t: d.t + 3000, future: { x: [1, 2] } }) }));
          sessionStorage.setItem("remoteFail", "1");
        }
        // 一份 rescueIn 毫秒后到期的副本（主稿仍有效）：用来验证前台定时清理（P2）
        if (settings.rescueIn) localStorage.setItem(KEY + "-rescue", JSON.stringify([JSON.stringify({ ...d, word: "OLD", t: Date.now() - 64800000 + settings.rescueIn })]));
      }
      if (settings.fakeRemote) {
        const mem = () => JSON.parse(sessionStorage.getItem("fakeRemote") || "{}");
        window.xhs = { miniTool: {
          getStorage: async ({ key }) => { if (sessionStorage.getItem("remoteFail") === "1") throw new Error("端存储读取失败"); return { data: mem()[key] ?? null }; },
          setStorage: async ({ key, data }) => { const m = mem(); m[key] = data; sessionStorage.setItem("fakeRemote", JSON.stringify(m)); },
          removeStorage: async ({ key }) => { const m = mem(); delete m[key]; sessionStorage.setItem("fakeRemote", JSON.stringify(m)); },
        } };
        if (settings.noGet) delete window.xhs.miniTool.getStorage; // 端侧写得进、没有读能力（P1）
      }
      // 让真实的 applyDraft 套用时抛错：迁移结果的 picks 换成 null（d.picks.map 抛 TypeError）。flag 在 sessionStorage，可在测试中途拿掉
      if (sessionStorage.getItem("break")) {
        let core;
        Object.defineProperty(window, "CORE", { configurable: true, get() { return core; }, set(v) {
          core = v; const real = v.migrateDraft;
          v.migrateDraft = function (o) { const r = real(o); if (r && sessionStorage.getItem("break")) r.picks = null; return r; };
        } });
      }
      if (settings.failDelete) {
        const remove = Storage.prototype.removeItem;
        Storage.prototype.removeItem = function (key) {
          if (this === localStorage && (key === KEY || key === OLD || key === OLD_BAK) && !window.allowDelete) throw Error("denied");
          return remove.call(this, key);
        };
      }
    }, { age, settings, KEY, OLD, OLD_BAK });
    const page = await context.newPage(); const errors = [];
    page.on("pageerror", e => errors.push(e.message));
    await page.goto(url); await page.waitForFunction(() => !document.getElementById("finish").disabled);
    return { page, context, errors };
  }
  // T18：改单词走入场界面——点「改单词 / 填表人」→ 填单词 → 回车（= 返回箭头，应用并返回）；会清空已填格时有确认框，点「清空」。返回是否弹过确认框
  async function changeWord(page, w) {
    await page.locator("#toEntry").click();
    await page.locator("#wordInput").fill(w); await page.locator("#wordInput").press("Enter");
    const asked = await page.locator("#wordConfirm").isVisible();
    if (asked) await page.locator("#confClear").click();
    return asked;
  }
  // 到期首次打开不显示旧稿，删除主稿和备份；刷新仍为空。
  for (const settings of [{}, { noTime: true }]) {
    const { page, context, errors } = await pageFor(TTL + 1000, settings);
    await page.waitForFunction(() => !localStorage.getItem("backronym-draft-v2"));
    assert.equal(await page.locator("#pagerLetters button").count(), 0);
    assert.equal(await page.evaluate(k => localStorage.getItem(k), OLD), null);
    assert.equal(await page.evaluate(k => localStorage.getItem(k), OLD_BAK), null);
    assert.equal(await page.evaluate(() => localStorage.getItem("theme-control")), "keep");
    await page.reload(); await page.waitForTimeout(450);
    assert.equal(await page.evaluate(k => localStorage.getItem(k), KEY), null);
    assert.deepEqual(errors, []); await context.close();
  }
  // 有效草稿：恢复/主题切换/导出不续期；实际编辑保存才改变时间。
  {
    const { page, context, errors } = await pageFor(10000);
    const original = await page.evaluate(k => JSON.parse(localStorage.getItem(k)).t, KEY);
    await page.waitForFunction(() => !localStorage.getItem("acronym-draft-v1") && !localStorage.getItem("acronym-draft-v1-bak"));
    assert.equal(await page.evaluate(() => localStorage.getItem("theme-control")), "keep", "旧稿清理不碰无关键");
    assert.equal(await page.locator("#pagerLetters button").count(), 4, "有效新稿照常恢复，旧稿内容不参与");
    assert.doesNotMatch(await page.locator("#draftStatus").innerText(), /预计清除/, "2026-11-12：状态行不再写预计清除时间（页脚固定说明已说 18 小时）");
    await page.locator("#settingsOpen").click(); await page.locator("#skinGroup label").nth(1).click(); await page.locator("#modeGroup label").nth(2).click(); await page.locator("#settingsClose").click(); await page.waitForTimeout(450); // 换主题、换深浅（设置页）不算编辑。四个主题（2026-11-12）：默认的 fandom 只有浅色，先换成单色画再切深色
    assert.equal(await page.evaluate(k => JSON.parse(localStorage.getItem(k)).t, KEY), original);
    await page.click("#finish"); await page.waitForFunction(() => !document.getElementById("exportView").disabled);
    assert.equal(await page.evaluate(k => JSON.parse(localStorage.getItem(k)).t, KEY), original);
    await page.evaluate(() => document.getElementById("finishPanel").click());
    await page.locator("#toEntry").click(); await page.locator("#fillerCtl").fill("新作者"); await page.locator("#fillerCtl").press("Enter"); await page.waitForTimeout(450); // 填表人在入场界面改（T18）
    assert((await page.evaluate(k => JSON.parse(localStorage.getItem(k)).t, KEY)) > original);
    // 挂起超过18h：恢复事件先清空，随后旧的输入/保存不能复活。
    await page.evaluate(ttl => { window.testOffset = ttl + 1000; document.dispatchEvent(new Event("visibilitychange")); }, TTL);
    await page.waitForFunction(() => !localStorage.getItem("backronym-draft-v2"));
    await page.waitForTimeout(450);
    assert.equal(await page.locator("#pagerLetters button").count(), 0);
    assert.equal(await page.locator("#title").textContent(), "");
    assert.equal(await page.locator("#fillerCtl").inputValue(), "");
    assert.equal(await page.evaluate(k => localStorage.getItem(k), OLD_BAK), null);
    assert(!/预计清除/.test(await page.locator("#draftStatus").innerText()));
    await page.locator("#wordInput").fill("NEW"); await page.locator("#wordInput").press("Enter");
    await page.waitForTimeout(450);
    assert.equal(await page.evaluate(k => JSON.parse(localStorage.getItem(k)).word, KEY), "NEW", "销毁后可以开始新作品");
    assert.deepEqual(errors, []); await context.close();
  }
  // 导出等待期间到期：旧异步结果不得重新填回输出面板。
  {
    const { page, context, errors } = await pageFor(1000);
    await page.click("#finish");
    await page.evaluate(ttl => { window.testOffset = ttl + 1000; document.dispatchEvent(new Event("visibilitychange")); }, TTL);
    await page.waitForFunction(() => !localStorage.getItem("backronym-draft-v2"));
    await page.waitForTimeout(500);
    assert.equal(await page.locator("#resList img").count(), 0);
    assert.equal(await page.locator("#finishPanel").isVisible(), false);
    assert.equal(await page.locator("#pagerLetters button").count(), 0);
    assert.deepEqual(errors, []); await context.close();
  }
  // 活跃页面到期自动清空，不需要下一次点击。
  {
    const { page, context, errors } = await pageFor(TTL - 1200);
    await page.waitForFunction(() => !localStorage.getItem("backronym-draft-v2"));
    assert.equal(await page.locator("#pagerLetters button").count(), 0);
    assert.deepEqual(errors, []); await context.close();
  }
  // 删除失败须提示；过期内容仍不恢复，恢复权限后重试。
  {
    const { page, context, errors } = await pageFor(TTL + 1, { failDelete: true });
    await page.waitForFunction(() => document.getElementById("draftStatus").textContent.includes("清理未完成"));
    assert.equal(await page.locator("#pagerLetters button").count(), 0);
    await page.evaluate(() => { window.allowDelete = true; window.dispatchEvent(new Event("focus")); });
    await page.waitForFunction(() => !localStorage.getItem("backronym-draft-v2") && !localStorage.getItem("acronym-draft-v1") && !localStorage.getItem("acronym-draft-v1-bak"));
    assert.deepEqual(errors, []); await context.close();
  }
  // T23：读到新版原文但套用抛错 → 编辑前原稿不动；第一次覆盖主键前先存恢复副本（原始字节、原 t），之后主键是新稿；副本不续期、到期被清
  {
    const { page, context, errors } = await pageFor(60000, { breakApply: true });
    const original = await page.evaluate(k => localStorage.getItem(k), KEY), t0 = JSON.parse(original).t;
    await page.waitForFunction(() => /草稿无法恢复/.test(document.getElementById("draftStatus").textContent));
    assert.equal(await page.evaluate(k => localStorage.getItem(k), KEY), original, "套用失败不动原稿");
    assert.equal(await page.evaluate(k => localStorage.getItem(k), KEY + "-rescue"), null, "编辑前不写副本");
    await page.waitForTimeout(500);
    assert.equal(await page.evaluate(k => localStorage.getItem(k), KEY + "-rescue"), null, "未经编辑也不写副本");
    await page.locator("#wordInput").fill("GO"); await page.locator("#wordInput").press("Enter");
    await page.waitForFunction(k => { try { return JSON.parse(localStorage.getItem(k)).word === "GO"; } catch (e) { return false; } }, KEY);
    assert.equal(await page.evaluate(k => localStorage.getItem(k), KEY + "-rescue"), JSON.stringify([original]), "副本（数组）里是原稿的原始字节（含缩进与未知字段）");
    assert.equal(JSON.parse(JSON.parse(await page.evaluate(k => localStorage.getItem(k), KEY + "-rescue"))[0]).t, t0, "副本保留原 t");
    // 继续编辑不再改动副本；重开后取较新的主键，副本不续期
    await page.evaluate(() => sessionStorage.removeItem("break")); await page.reload(); await page.waitForFunction(() => !document.getElementById("finish").disabled);
    assert.equal(await page.locator("#pagerLetters button").count(), 2, "重开恢复较新的 GO");
    assert.equal(await page.evaluate(k => localStorage.getItem(k), KEY + "-rescue"), JSON.stringify([original]), "重开后副本仍是原样");
    // 越过原稿的 18 小时：副本被清，主键（较新）还在
    await page.evaluate(ttl => { window.testOffset = ttl - 30000; document.dispatchEvent(new Event("visibilitychange")); }, TTL);
    await page.waitForFunction(k => !localStorage.getItem(k), KEY + "-rescue", { timeout: 10000 });
    assert.equal(JSON.parse(await page.evaluate(k => localStorage.getItem(k), KEY)).word, "GO", "较新的主键不被清");
    assert.deepEqual(errors, []); await context.close();
  }
  // T23 补充：本地 LIFE 可读，端存储里较新的 LOVE 读取失败但可写；用户在界面里把 LIFE 改成 LIVE
  for (const recovers of [false, true]) {
    const { page, context, errors } = await pageFor(60000, { fakeRemote: true });
    const remote = () => page.evaluate(() => JSON.parse(sessionStorage.getItem("fakeRemote") || "{}"));
    const loveRaw = (await remote())[KEY];
    assert.equal(await page.locator("#pagerLetters button").count(), 4, "读到本地的 LIFE");
    if (recovers) await page.evaluate(() => sessionStorage.setItem("remoteFail", "0")); // 端存储恢复可读
    assert.equal(await changeWord(page, "LIVE"), true, "LIFE → LIVE 会清空已填的 F 格：先确认"); // 修改单词（T18 入场界面）
    await page.waitForFunction(k => { try { return JSON.parse(localStorage.getItem(k)).word === "LIVE"; } catch (e) { return false; } }, KEY);
    if (!recovers) {
      await page.waitForFunction(() => /暂不覆盖它/.test(document.getElementById("draftStatus").textContent));
      assert.equal((await remote())[KEY], loveRaw, "端侧持续读失败：端上 LOVE 逐字节不变");
      assert.equal((await remote())[KEY + "-rescue"], undefined, "没读到就没有可保全的");
      // 跨会话（T23 先保全）：下次打开端侧可读，两侧都读到但不同 → 恢复较新的 LIVE；再编辑时 LOVE 先进副本、后被覆盖
      await page.evaluate(() => sessionStorage.setItem("remoteFail", "0"));
      await page.reload(); await page.waitForFunction(() => !document.getElementById("finish").disabled);
      assert.equal(await page.locator("#pagerLetters button").count(), 4, "重开恢复较新的 LIVE");
      assert.equal((await remote())[KEY], loveRaw, "未经编辑不动端上 LOVE");
      await changeWord(page, "LIVEN");
      await page.waitForFunction(k => { try { return JSON.parse(JSON.parse(sessionStorage.getItem("fakeRemote"))[k]).word === "LIVEN"; } catch (e) { return false; } }, KEY);
      assert.equal((await remote())[KEY + "-rescue"], JSON.stringify([loveRaw]), "覆盖端上主键前，LOVE 已原样进端存储副本");
      assert.equal(await page.evaluate(k => localStorage.getItem(k), KEY + "-rescue"), JSON.stringify([loveRaw]), "本地副本也有 LOVE");
    } else {
      await page.waitForFunction(async k => JSON.parse(JSON.parse(sessionStorage.getItem("fakeRemote"))[k]).word === "LIVE", KEY);
      const m = await remote();
      assert.equal(m[KEY + "-rescue"], JSON.stringify([loveRaw]), "覆盖前先把 LOVE 原样存进端存储副本");
      assert.equal(await page.evaluate(k => localStorage.getItem(k), KEY + "-rescue"), JSON.stringify([loveRaw]), "本地副本也是 LOVE 原样（含原时间戳）");
      assert.doesNotMatch(await page.locator("#draftStatus").innerText(), /暂不覆盖它/, "核实并保全后不再提示"); // （启动清理在端存储读失败时留下的「部分存储清理未完成」是另一回事，不在此断言）
    }
    assert.deepEqual(errors, []); await context.close();
  }
  // Astra 复审 P1：端侧有 setStorage、没有 getStorage。从页面把 LIFE 改成 LIVE：本地变 LIVE，端上 LOVE 原文不动、不写副本
  {
    const { page, context, errors } = await pageFor(60000, { fakeRemote: true, noGet: true });
    const remote = () => page.evaluate(() => JSON.parse(sessionStorage.getItem("fakeRemote") || "{}"));
    const loveRaw = (await remote())[KEY];
    assert.equal(await page.locator("#pagerLetters button").count(), 4, "读到本地的 LIFE");
    await changeWord(page, "LIVE");
    await page.waitForFunction(k => { try { return JSON.parse(localStorage.getItem(k)).word === "LIVE"; } catch (e) { return false; } }, KEY);
    await page.waitForTimeout(500);
    assert.equal((await remote())[KEY], loveRaw, "端上 LOVE 原文不动");
    assert.equal((await remote())[KEY + "-rescue"], undefined, "端侧没写副本");
    assert.match(await page.locator("#draftStatus").innerText(), /暂不覆盖它/);
    assert.deepEqual(errors, []); await context.close();
  }
  // Astra 复审 P2：主稿有效、副本 3 秒后到期；页面一直在前台，不刷新、不切前后台 → 定时器清掉副本，主稿仍在
  {
    const { page, context, errors } = await pageFor(60000, { rescueIn: 3000 });
    assert.ok(await page.evaluate(k => localStorage.getItem(k), KEY + "-rescue"), "副本起初在");
    await page.waitForFunction(k => !localStorage.getItem(k), KEY + "-rescue", { timeout: 15000 });
    assert.equal(JSON.parse(await page.evaluate(k => localStorage.getItem(k), KEY)).word, "LIFE", "较新的主稿还在");
    assert.equal(await page.locator("#pagerLetters button").count(), 4, "界面上的作品不受影响");
    assert.deepEqual(errors, []); await context.close();
  }
  console.log("browser draft expiry ok: startup, deadline timer, resume, edit renewal, no renewal on theme/export, deletion retry, fresh start, rescue copy, one-side read failure, cross-session preserve, write-only remote, foreground rescue expiry");
} finally {
  if (browser) await browser.close();
  await new Promise(resolve => server.close(resolve));
}
