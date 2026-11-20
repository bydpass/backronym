// 批 P1：打开耗时的分段量测（开发工具，不进发布包，不上报）。不在 app/ 里埋点：用浏览器的性能时间线与跟踪事件从外面量。
//   PLAYWRIGHT_MODULE=… CHROMIUM_PATH=… node scripts/perf-startup.mjs [app 目录] [--runs 5] [--cpu 1,4,6] [--json]
// 量的是桌面 Chromium；--cpu 是 CDP 的 CPU 降速倍数，用来粗略模拟慢设备，不等于真机。文件走本机回环，传输时间约等于读盘，接近容器读本地包。
// 场景：fresh = 没有草稿，进入场页（英语随页面加载）；draft-fr = 有一份法语草稿，要另读法语词包再恢复。
// 「可用」= 入场页的单词框可输入，且草稿语言的词包已注册。每格报多次运行的中位数。
import { createRequire } from "node:module";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const args = process.argv.slice(2), opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const root = path.resolve(args[0] && !args[0].startsWith("--") ? args[0] : fileURLToPath(new URL("../app", import.meta.url)));
const RUNS = +opt("--runs", 5), CPUS = String(opt("--cpu", "1,4,6")).split(",").map(Number), KEY = "backronym-draft-v2";
const server = createServer(async (req, res) => {
  const file = path.resolve(root, "." + (req.url === "/" ? "/index.html" : req.url.split("?")[0]));
  if (!file.startsWith(root)) { res.writeHead(403).end(); return; }
  try {
    res.setHeader("Content-Type", { ".js": "text/javascript", ".css": "text/css", ".html": "text/html", ".woff2": "font/woff2" }[path.extname(file)] || "application/octet-stream");
    res.setHeader("Cache-Control", "no-store"); res.end(await readFile(file));
  } catch { res.writeHead(404).end(); }
});
await new Promise(r => server.listen(0, "127.0.0.1", r));
const url = "http://127.0.0.1:" + server.address().port + "/";
const D = (lang, word) => ({ v: 2, lang, word, filler: "", view: "single", titleRuns: null, picks: [...word].map(() => null),
  glosses: [...word].map(() => ""), glossAuto: [...word].map(() => true), captions: [...word].map(() => ""), keys: [...word].map(() => 0) });
const SCENARIOS = { fresh: null, "draft-fr": D("fr", "LIVRE") };
const median = xs => { const s = xs.filter(x => x != null && !Number.isNaN(x)).sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)] : NaN; };
const short = u => { try { return new URL(u).pathname.replace(/^\/assets\//, ""); } catch { return u; } };
const browser = await chromium.launch({ headless: true, ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}) });
async function once(cpu, draft) {
  const context = await browser.newContext({ viewport: { width: 375, height: 812 } });
  await context.addInitScript(({ draft, KEY }) => {
    if (draft && !sessionStorage.getItem("seeded")) { localStorage.setItem(KEY, JSON.stringify({ ...draft, t: Date.now() - 5000 })); sessionStorage.setItem("seeded", "1"); }
    localStorage.setItem("backronym-tip-seen", "1");
    const want = draft ? draft.lang : "en";
    const tick = () => {
      const el = document.getElementById("wordInput"), P = window.LANGPACK;
      if (el && !el.disabled && P && P.get(want, "lexicon") && P.has(want, "words")) window.__usable = performance.now(); else requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }, { draft, KEY });
  const page = await context.newPage(), cdp = await context.newCDPSession(page);
  if (cpu > 1) await cdp.send("Emulation.setCPUThrottlingRate", { rate: cpu });
  await browser.startTracing(page, { categories: ["devtools.timeline", "v8", "disabled-by-default-v8.compile"] });
  await page.goto(url, { waitUntil: "load" });
  await page.waitForFunction(() => window.__usable > 0, null, { timeout: 120000 });
  const fontsAt = await page.evaluate(() => document.fonts.ready.then(() => performance.now()));
  const inside = await page.evaluate(() => {
    const nav = performance.getEntriesByType("navigation")[0], paint = performance.getEntriesByType("paint").find(p => p.name === "first-contentful-paint");
    const res = performance.getEntriesByType("resource").map(r => ({ name: r.name, start: r.startTime, dur: r.duration, size: r.decodedBodySize }));
    return { dcl: nav.domContentLoadedEventEnd, load: nav.loadEventEnd, fcp: paint ? paint.startTime : NaN, usable: window.__usable, res };
  });
  const trace = JSON.parse((await browser.stopTracing()).toString()), events = trace.traceEvents || trace;
  await context.close();
  const byScript = {}, cat = { script: 0, compile: 0, html: 0, style: 0, layout: 0, paint: 0 };
  for (const e of events) {
    if (e.ph !== "X" || !e.dur) continue;
    const ms = e.dur / 1000, d = (e.args && e.args.data) || {};
    if (e.name === "EvaluateScript") { cat.script += ms; if (d.url) byScript[short(d.url)] = (byScript[short(d.url)] || 0) + ms; }
    else if (e.name === "v8.compile") { cat.compile += ms; }   // 已含在 EvaluateScript 里，单列只为看占比
    else if (e.name === "ParseHTML") cat.html += ms;
    else if (e.name === "UpdateLayoutTree" || e.name === "ParseAuthorStyleSheet") cat.style += ms;
    else if (e.name === "Layout") cat.layout += ms;
    else if (e.name === "Paint" || e.name === "PaintImage" || e.name === "RasterTask") cat.paint += ms;
  }
  const fonts = inside.res.filter(r => /\.woff2$/.test(r.name));
  return { ...inside, fontsAt, cat, byScript, fontCount: fonts.length, fontBytes: fonts.reduce((n, r) => n + r.size, 0), fontLast: fonts.length ? Math.max(...fonts.map(r => r.start + r.dur)) : NaN,
    fontNames: fonts.map(r => short(r.name).replace(/^fonts\//, "")) };
}
const out = [];
try {
  for (const cpu of CPUS) for (const [name, draft] of Object.entries(SCENARIOS)) {
    const runs = []; for (let i = 0; i < RUNS; i++) runs.push(await once(cpu, draft));
    const m = f => Math.round(median(runs.map(f)));
    const scripts = {}; for (const k of new Set(runs.flatMap(r => Object.keys(r.byScript)))) scripts[k] = Math.round(median(runs.map(r => r.byScript[k] || 0)));
    out.push({ cpu, scenario: name, runs: RUNS, usable: m(r => r.usable), fcp: m(r => r.fcp), dcl: m(r => r.dcl), load: m(r => r.load), fontsReady: m(r => r.fontsAt), fontLast: m(r => r.fontLast),
      fontCount: m(r => r.fontCount), fontBytes: m(r => r.fontBytes), fontNames: runs[0].fontNames, script: m(r => r.cat.script), compile: m(r => r.cat.compile), html: m(r => r.cat.html), style: m(r => r.cat.style), layout: m(r => r.cat.layout), paint: m(r => r.cat.paint),
      spread: [Math.round(Math.min(...runs.map(r => r.usable))), Math.round(Math.max(...runs.map(r => r.usable)))],
      top: Object.entries(scripts).sort((a, b) => b[1] - a[1]).slice(0, 6) });
  }
} finally { await browser.close(); server.close(); }
if (args.includes("--json")) console.log(JSON.stringify(out));
else {
  console.log("app 目录：" + root + "；每格 " + RUNS + " 次取中位数，单位毫秒");
  for (const r of out) {
    console.log(`\nCPU ×${r.cpu} · ${r.scenario}：可用 ${r.usable}（${r.spread[0]}～${r.spread[1]}）｜首次内容绘制 ${r.fcp}｜DOMContentLoaded ${r.dcl}｜load ${r.load}｜字体就绪 ${r.fontsReady}`);
    console.log(`  主线程：脚本求值 ${r.script}（其中编译 ${r.compile}）｜HTML 解析 ${r.html}｜样式 ${r.style}｜布局 ${r.layout}｜绘制 ${r.paint}`);
    console.log(`  字体：读了 ${r.fontCount} 个、${r.fontBytes} B，最后一个读完在 ${r.fontLast}：${r.fontNames.join("、")}`);
    console.log("  脚本求值前六：" + r.top.map(([k, v]) => k + " " + v).join("；"));
  }
}
