// 批次8回归：当前主题对比度、分图高度、全屏顶栏让位、IndexedDB缺席；使用隔离端口和上下文。
// PLAYWRIGHT_MODULE=/absolute/path/to/playwright CHROMIUM_PATH=/path/to/chromium node scripts/test-batch8-browser.mjs
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
  { const make = browser.newContext.bind(browser); browser.newContext = options => make({ locale: "zh-CN", ...options }); } // v00.04.00 批 1：界面语言跟随环境，无头浏览器默认报英文；本脚本测的是中文界面
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


  // 批次8：短第二张仍占同一展示高度，实际布局框坐标不变。
  for (const cut of [6,7,8]) {
    const {page,context,errors}=await pageFor({draft:{...LIFE,word:'DEVELOPMENT',view:'grid',split:cut},width:375});
    await page.evaluate(()=>document.fonts.ready);
    const before=await page.locator('#sheetTabs').boundingBox();
    await page.locator('#sheet-1').click();
    const after=await page.locator('#sheetTabs').boundingBox();
    assert.ok(Math.abs(before.y-after.y)<1,'第二张3/4/5格页签不移动');
    const layout=await readFile(new URL('./check-dom-layout.js',import.meta.url),'utf8');
    const result=await page.evaluate(layout);
    for(const r of result) for(const k of ['dx','dw','dy','dh','dbase']) assert.ok(+r[k]<=1.5,JSON.stringify(r));
    assert.deepEqual(errors,[]);await context.close();
  }
  {
    const {page,context}=await pageFor({draft:LIFE});
    await page.locator('#title').fill('Color');
    const color=async(c)=>page.locator('#tcolorCustom').evaluate((n,c)=>{n.value=c;n.dispatchEvent(new Event('change',{bubbles:true}));},c);
    await page.evaluate(()=>{window.THEME.setSkin('dansaekhwa');document.documentElement.setAttribute('data-theme','dark');}); // 四个主题（2026-11-12）：默认的 fandom 只有浅色，深色用单色画测
    await color('#ffffff');assert.equal(await page.locator('#toast').innerText(),'');
    await color('#222222');assert.match(await page.locator('#toast').innerText(),/容易看不清/);
    await color('#ffffff');
    // 真实的深浅单选（v00.03.00 起在设置页）触发重建与重新判断：依次进入 dark、light。
    await page.locator('#settingsOpen').click();await page.locator('#modeGroup label').nth(2).click();await page.locator('#modeGroup label').nth(1).click();await page.locator('#settingsClose').click();
    await page.waitForTimeout(100);assert.match(await page.locator('#toast').innerText(),/容易看不清/);
    await context.close();
  }

  // 原图只在 IndexedDB；它缺席但文件系统可用时仍保留引用，恢复后读回。
  {
    const {page,context}=await pageFor({draft:LIFE});
    await addPhoto(page,0,await png(page));await savedWhere(page,'d.media && d.media.cells[0]');
    const name=JSON.parse(await stored(page)).media.cells[0];
    await context.addInitScript(()=>{
      if(sessionStorage.getItem('noidb')!=='1')return;
      Object.defineProperty(window,'indexedDB',{value:undefined});
      window.xhs={launchOptions:{miniToolEnv:{userDataPath:'/u'}},miniTool:{
        getFileStorageInfo:async()=>({limitBytes:1e8,usedBytes:0}),mkdir:async()=>{},writeFile:async()=>{},appendFile:async()=>{},readFile:async()=>{throw Error('missing');},readDir:async()=>({files:[]}),unlink:async()=>{}
      }};
    });
    await page.evaluate(()=>sessionStorage.setItem('noidb','1'));await page.reload();await page.waitForFunction(()=>!document.getElementById('wordInput').disabled);
    await page.locator('#toEntry').click();await page.locator('#fillerCtl').fill('反向切换');await page.locator('#entrySave').click();await savedWhere(page,'d.filler === "反向切换"');
    assert.equal(JSON.parse(await stored(page)).media.cells[0],name);
    await page.evaluate(()=>sessionStorage.removeItem('noidb'));await page.reload();await page.waitForFunction(()=>!document.getElementById('wordInput').disabled);
    assert.ok(await page.locator('#mirror canvas.b-image').count());assert.equal(JSON.parse(await stored(page)).media.cells[0],name);
    await context.close();
  }
  for(const width of [320,375,414]) {
    const {page,context}=await pageFor({width});await page.goto(url+'/index.html?xhsMpScreenMode=full');
    const b=await page.locator('.brand').boundingBox(),t=await page.locator('#settingsOpen').boundingBox();
    assert.ok(b.x>=48 && t.x+t.width<=width-48,'全屏两侧让位');
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'无横向溢出');await context.close();
  }
  console.log('batch8 browser: split height + DOM geometry, current-theme contrast + theme switch, container gutters PASS');
}finally{if(browser)await browser.close();await new Promise(r=>server.close(r));}
