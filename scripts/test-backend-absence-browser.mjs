// 批次8：文件系统能力缺席 → 改文字保存 → 恢复能力，引用与原图均保留。隔离端口/存储。
// PLAYWRIGHT_MODULE=/absolute/path/to/playwright CHROMIUM_PATH=/path/to/chromium node scripts/test-backend-absence-browser.mjs
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
  async function pageFor({ draft = null, slowRead = 0, width = 375, height = 812, tipSeen = true, init = "", phraseDelay = 0 } = {}) {
    const context = await browser.newContext({ viewport: { width, height } });
    if (phraseDelay) await context.route("**/assets/lang/en/phrases.js", async (r) => { await new Promise((ok) => setTimeout(ok, phraseDelay)); await r.continue(); }); // 模拟慢加载
    if (init) await context.addInitScript({ content: init });
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
    return { page, context, errors };
  }
  const visible = (page, sel) => page.locator(sel).isVisible();
  // T30：改词页的「返回」——有修改时会向下展开确认，选「保存并返回」（= 原来的「返回即应用」）
  const backSave = async (page) => { await page.locator("#entryBack").click(); if (await page.locator("#leavePop").isVisible()) await page.locator("#leaveSave").click(); };
  const stored = (page) => page.evaluate(k => localStorage.getItem(k), KEY);
  // 保存有约 400ms 防抖：等主键里出现满足条件的稿
  const savedWhere = (page, fn) => page.waitForFunction(([k, src]) => { try { return new Function("d", "return " + src)(JSON.parse(localStorage.getItem(k))); } catch (e) { return false; } }, [KEY, fn]);
  const png = (page) => page.evaluate(() => { const c = document.createElement("canvas"); c.width = 64; c.height = 48; const x = c.getContext("2d"); x.fillStyle = "#c33"; x.fillRect(0, 0, 64, 48); return c.toDataURL("image/png").split(",")[1]; }).then(b => Buffer.from(b, "base64"));
  async function addPhoto(page, i, buffer) { // 给第 i 格配图（经配图面板的真实选图流程）
    await page.evaluate(i => document.getElementById("pl-" + i).click(), i);
    await page.locator("#plateHit").click();
    await page.locator("#cellPhoto").setInputFiles({ name: "a.png", mimeType: "image/png", buffer });
    await page.waitForFunction(() => !document.getElementById("imgAdjust").hidden && document.querySelector("#mirror canvas"));
    await page.locator("#imgClose").click();
  }
  async function setZoom(page, i, z) { // 调第 i 格的取景缩放
    await page.evaluate(i => document.getElementById("pl-" + i).click(), i);
    await page.locator("#plateHit").click(); await page.locator("#imgAdjust").click();
    await page.locator("#cropZoom").fill(String(z)); await page.locator("#cropDone").click(); await page.locator("#imgClose").click();
  }





const name='m2o-cf61a1882e076288.png';
const D={...LIFE,media:{def:name,cells:[null,null,null,null]},crops:[]};
const init=`
if(!sessionStorage.getItem('disk')) sessionStorage.setItem('disk',JSON.stringify({'${name}':'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII='}));
if(sessionStorage.getItem('fsOff')!=='1'){
const disk=()=>JSON.parse(sessionStorage.getItem('disk'));
const key=p=>p.split('/').pop();
window.xhs={launchOptions:{miniToolEnv:{userDataPath:'/u'}},miniTool:{
getFileStorageInfo:async()=>({usedBytes:100,limitBytes:1e8,readChunkMaxBytes:1e6,writeChunkMaxBytes:1e6}),
mkdir:async()=>{},writeFile:async()=>{},appendFile:async()=>{},
readDir:async()=>({files:Object.keys(disk())}),
readFile:async({filePath})=>{const data=disk()[key(filePath)];if(!data)throw Error('missing');return {data,bytesRead:atob(data).length,eof:true};},
unlink:async({filePath})=>{const d=disk();delete d[key(filePath)];sessionStorage.setItem('disk',JSON.stringify(d));}
}};}`;
const {page,context}=await pageFor({draft:D,init});
assert.ok(await page.evaluate(()=>window.photoDraws>0),'initial fs image decoded and drawn');
console.log('initial fs image reference',JSON.parse(await stored(page)).media.def);
await page.evaluate(()=>sessionStorage.setItem('fsOff','1'));await page.reload();await page.waitForFunction(()=>!document.getElementById('wordInput').disabled);
console.log('fs absent status',await page.locator('#draftStatus').innerText());
await page.locator('#toEntry').click();await page.locator('#fillerCtl').fill('测试');await page.locator('#entrySave').click();await page.waitForTimeout(800);
console.log('after text save',JSON.parse(await stored(page)).media);
assert.equal(JSON.parse(await stored(page)).media.def,name,'reference retained');
await page.evaluate(()=>sessionStorage.removeItem('fsOff'));await page.reload();await page.waitForFunction(()=>!document.getElementById('wordInput').disabled);await page.waitForTimeout(800);
console.log('fs restored disk',await page.evaluate(()=>sessionStorage.getItem('disk')));
assert.equal(await page.evaluate(n=>!!JSON.parse(sessionStorage.getItem('disk'))[n],name),true,'original image retained');
await context.close();}finally{if(browser)await browser.close();await new Promise(resolve=>server.close(resolve));}
