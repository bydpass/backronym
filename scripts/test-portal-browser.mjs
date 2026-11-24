// G8 浏览器回归。用已有 Playwright，在隔离上下文内从本地文件应答所有资源。
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const website = fileURLToPath(new URL("../site/backronymsite/", import.meta.url));
const portal = process.argv[2] ? path.resolve(process.argv[2]) : path.join(website, "portal");
const demo = path.join(website, "design/portal");
const clock = await readFile(path.join(demo, "test/manual-clock.js"), "utf8");
const simulator = await readFile(path.join(demo, "test/scroll-sim.js"), "utf8");
const css = await readFile(path.join(portal, "portal.css"), "utf8");
// 样稿仍引用 Google Fonts。仅在夹具里给样稿同一份本地字体，比较交互而不请求外站。
const referenceFonts = css.match(/@font-face\s*\{[^}]+\}/g).join("\n")
  .replaceAll("./fonts/", "/fonts/").replaceAll("BK Fandom Serif", "Libre Baskerville");
const reference = (await readFile(path.join(demo, "buergil-demo.html"), "utf8"))
  .replace(/<meta name="claude:viewport-fit-sides"[^>]*>/, '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">')
  .replace(/<link[^>]+fonts\.googleapis\.com[^>]*>/, '<link rel="stylesheet" href="/reference-fonts.css">');
const types = { ".html": "text/html", ".css": "text/css", ".js": "text/javascript", ".woff2": "font/woff2", ".jpg": "image/jpeg", ".png": "image/png" };
const parts = ["0", "1", "2", "3.0", "3.1", "3.2", "3.3", "3.4", "4.0", "4.1", "4.2", "4.3", "4.4", "5", "6", "7"];
const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_PATH });

async function withPage(options, fn) {
  const { host = "portal.test", sample = false, js = true, mobile = false, icp = "", calm = false } = options;
  const origin = "https://" + host;
  const context = await browser.newContext({
    viewport: mobile ? { width: 375, height: 667 } : { width: 1280, height: 800 },
    javaScriptEnabled: js, isMobile: mobile, hasTouch: mobile,
    reducedMotion: calm ? "reduce" : "no-preference",
  });
  const problems = [];
  try {
    if (js) await context.addInitScript({ content: clock });
    await context.route("**/*", async route => {
      const url = new URL(route.request().url());
      if (url.origin !== origin) {
        problems.push("外部资源 " + url.href);
        return route.abort();
      }
      if (sample && url.pathname === "/reference-fonts.css") {
        return route.fulfill({ body: referenceFonts, contentType: "text/css" });
      }
      if (sample && url.pathname === "/") {
        return route.fulfill({ body: "<!doctype html>\n" + reference, contentType: "text/html; charset=utf-8" });
      }
      const dir = sample && url.pathname.startsWith("/cards/") ? demo : portal;
      const file = path.resolve(dir, "." + (url.pathname === "/" ? "/index.html" : url.pathname));
      if (!file.startsWith(dir + path.sep)) return route.abort();
      try {
        let body = await readFile(file);
        const extension = path.extname(file);
        if (icp && url.pathname === "/") {
          body = body.toString().replace('name="backronym-icp" content=""', 'name="backronym-icp" content="' + icp + '"');
        }
        return route.fulfill({ body, contentType: types[extension] + ([".html", ".js", ".css"].includes(extension) ? "; charset=utf-8" : "") });
      } catch (error) {
        problems.push(url.pathname + "：" + error.message);
        return route.abort();
      }
    });
    const page = await context.newPage();
    page.on("pageerror", error => problems.push(String(error)));
    await page.goto(origin + "/", { waitUntil: "load" });
    if (js) await page.evaluate(() => document.fonts.ready.then(() => undefined));
    const result = await fn(page);
    assert.deepEqual(problems, []);
    return result;
  } finally {
    await context.close();
  }
}

try {
  for (const rhythm of "ABCDEFKT") {
    const run = sample => withPage({ sample }, async page => {
      await page.addScriptTag({ content: simulator });
      const result = await page.evaluate(rhythm => { __S.start(); return __S.run(rhythm); }, rhythm);
      assert.equal(result.end, "到结束页");
      assert.equal(result.err, null);
      assert.deepEqual(result.bad, []);
      const visited = [...result.seq.matchAll(/([\d.]+)\([^,]+,(\d+)%/g)]
        .filter(([, stage]) => parts.includes(stage));
      assert.deepEqual(visited.map(([, stage]) => stage), parts, result.seq);
      assert.ok(visited.every(([, , completion]) => completion === "100"), result.seq);
      return result.total;
    });
    const referenceTime = await run(true);
    const portalTime = await run(false);
    console.log(`滚动 ${rhythm}：样稿 ${referenceTime}，门户 ${portalTime}，各段和子页均完整`);
  }

  await withPage({ mobile: true, calm: true }, async page => {
    assert.equal(await page.title(), "藏头 - Backronym");
    assert.equal(await page.locator("#quick a").getAttribute("href"), "./app/");
    assert.ok((await page.locator("#quick a").boundingBox()).height >= 44);
    await page.evaluate(() => {
      document.querySelector("#btn-en").click();
      window.dispatchEvent(new Event("scroll"));
      __tick(2000);
    });
    assert.equal(await page.locator("html").getAttribute("lang"), "en");
    assert.equal(await page.locator(".stage.rail").count(), 1);
    await page.evaluate(() => { document.querySelector("#word").children[6].click(); __tick(2000); });
    assert.equal(await page.locator("#label .w").textContent(), "Licentia");
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), 375);
  });
  await withPage({ js: false }, async page => {
    assert.equal(await page.locator(".portal-static section").count(), 7);
    assert.equal(await page.locator(".portal-static a[href='./app/']").isVisible(), true);
    assert.equal(await page.locator(".stage").isVisible(), false);
  });

  // 在本地夹具注入虚拟号码，检查精确域名匹配。正式文件保持空白。
  for (const [host, icp, expected] of [
    ["bydpass.cn", "", false], ["bydpass.cn", "TEST-ICP-123", true],
    ["www.bydpass.cn", "TEST-ICP-123", true], ["bydpass.com", "TEST-ICP-123", false],
    ["other.cn", "TEST-ICP-123", false], ["bydpass.cn.test", "TEST-ICP-123", false],
  ]) {
    await withPage({ host, icp, calm: true }, async page => {
      await page.evaluate(() => {
        document.querySelector("#btn-zh").click();
        window.dispatchEvent(new Event("scroll"));
        __tick(2000);
        document.querySelector("#word").children[6].click();
        __tick(2000);
        window.scrollTo(0, document.documentElement.scrollHeight);
        window.dispatchEvent(new Event("scroll"));
        __tick(2000);
      });
      assert.equal(await page.locator("#fin .fgo a").getAttribute("href"), "./app/");
      assert.equal(await page.locator("#fin a[href='https://beian.miit.gov.cn/']").count(), Number(expected), host);
      if (expected) assert.equal(await page.locator("#fin .ffoot a").textContent(), icp);
    });
  }
  console.log("门户浏览器回归通过：无外站资源请求；移动端、无脚本、备案域名均正常");
} finally {
  await browser.close();
}
