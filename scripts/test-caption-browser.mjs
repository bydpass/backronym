// 2026-11-17 真机反馈后的界面改动：配文可折行、写满为止；填表人上限 16；信息行字号；深浅三档的选中样式；语言摘要首字；保存结果用 Toast 的位置。
// 使用现有 Playwright，不安装依赖；新端口、新上下文，绝不操作用户预览存储。
// PLAYWRIGHT_MODULE=/absolute/path/to/playwright CHROMIUM_PATH=/path/to/chromium node scripts/test-caption-browser.mjs
// 真机上的软键盘、输入法与导出图只能真机看；导出的折行与编辑面同出 CORE.layoutCard，折行算法本身在 test-core.mjs 里测。
import { createRequire } from "node:module";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const root = fileURLToPath(new URL("../app", import.meta.url));
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
const SHOTS = process.env.SHOT_DIR || "";
let browser;
try {
  browser = await chromium.launch({ headless: true, ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}) });
  { const make = browser.newContext.bind(browser); browser.newContext = options => make({ locale: "zh-CN", ...options }); } // v00.04.00 批 1：界面语言跟随环境，无头浏览器默认报英文；本脚本测的是中文界面
  for (const width of [320, 393]) {
    const context = await browser.newContext({ viewport: { width, height: 852 } });
    const page = await context.newPage();
    const errors = []; page.on("pageerror", e => errors.push(String(e)));
    await page.goto(url, { waitUntil: "load" });
    const shot = async name => { if (SHOTS) await page.screenshot({ path: path.join(SHOTS, name + "-" + width + ".png") }); };

    // 填表人上限 16
    assert.equal(await page.locator("#fillerCtl").getAttribute("maxlength"), "16");
    await page.locator("#fillerCtl").fill("小".repeat(20));
    assert.equal((await page.locator("#fillerCtl").inputValue()).length, 16, "填表人最多 16 字");
    assert.match(await page.locator("#fillerCount").innerText(), /16 \/ 16/);
    // v00.03.01 U03：12 字起计数墨色粗体（hot），写满朱色（full）；11 字照旧
    const cnt = () => page.locator("#fillerCount").evaluate(n => n.className);
    assert.match(await cnt(), /\bfull\b/, "写满：朱色");
    await page.locator("#fillerCtl").fill("小".repeat(12)); assert.match(await cnt(), /\bhot\b/, "12 字：标出"); assert.doesNotMatch(await cnt(), /full/);
    await page.locator("#fillerCtl").fill("小".repeat(11)); assert.doesNotMatch(await cnt(), /hot|full/, "11 字：照旧");
    await page.locator("#fillerCtl").fill("小".repeat(16));
    // v00.03.01 U02（真机 B7）：14 个宽字母放不下时字号逐级缩小（下限 16px），框内不再横向滚动；短词回到原字号
    await page.locator("#wordInput").fill("AAAAAAAAAAAAAA");
    const fit = await page.locator("#wordInput").evaluate(n => ({ fs: parseFloat(getComputedStyle(n).fontSize), over: n.scrollWidth > n.clientWidth, inline: n.style.fontSize }));
    assert.ok(!fit.over && fit.fs >= 16 && fit.inline, "14 个 A 放得下：" + JSON.stringify(fit));
    // 复审：窗口变宽（转屏、分屏）时不等打字就长回去（app.js 的 resize 调 fitWordInput）
    await page.setViewportSize({ width: 768, height: 852 });
    await page.waitForFunction(fs0 => parseFloat(getComputedStyle(document.getElementById("wordInput")).fontSize) > fs0 + 2, fit.fs, { timeout: 2000 });
    await page.setViewportSize({ width, height: 852 });
    await page.waitForFunction(() => { const n = document.getElementById("wordInput"); return n.scrollWidth <= n.clientWidth; }, null, { timeout: 2000 });
    await page.locator("#wordInput").fill("LIFE");
    assert.equal(await page.locator("#wordInput").evaluate(n => n.style.fontSize), "", "放得下就回到样式表的字号");
    // 全数字：入场页不写读法
    await page.locator("#wordInput").fill("2666");
    assert.equal(await page.locator("#wordSense").innerText(), "");

    await page.locator("#wordInput").fill("LIFE");
    await page.locator("#entryStart").click();
    await page.locator("#wordCtl").waitFor({ state: "visible" });
    await page.locator("#wordCtl").fill("Lake");
    await page.locator("#capCtl").waitFor({ state: "visible" });
    const caps = () => page.evaluate(() => [...document.querySelectorAll("#mirror .b-caption")].map(n => { const r = n.getBoundingClientRect(); return { t: n.textContent, top: r.top, right: r.right, h: r.height }; }));
    const cardBox = () => page.evaluate(() => document.getElementById("card").getBoundingClientRect().toJSON());

    // 信息行字号 50（× k；v00.03.01 U01 用户定 34 → 50）：页码与填表人不重叠
    // v00.03.03 F4 起格子进度默认隐藏：先在版式页拨成显示，再量
    await page.click("#toLayout"); await page.locator("#lay-prog label").first().click(); await page.keyboard.press("Escape");
    await page.waitForFunction(() => document.querySelector("#mirror .b-info-folio"));
    const info = await page.evaluate(() => { const k = document.getElementById("card").getBoundingClientRect().width / 1080; const f = document.querySelector("#mirror .b-info-folio"), g = document.querySelector("#mirror .b-info-filler"); return { size: parseFloat(getComputedStyle(f).fontSize) / k, fr: f.getBoundingClientRect().right, gl: g.getBoundingClientRect().left, gr: g.getBoundingClientRect().right, card: document.getElementById("card").getBoundingClientRect().right }; });
    assert.ok(Math.abs(info.size - 50) < 0.6, "信息行字号 50：" + info.size);
    assert.ok(info.fr < info.gl && info.gr <= info.card + 1, "16 字填表人不压页码、不出卡：" + JSON.stringify(info));

    // 短配文：一行，字号 48（× k）
    await page.locator("#capCtl").focus(); // 候选栏此时盖在配文上方，真实用户是先收起键盘再点；这里直接给焦点
    await page.keyboard.type("她看人从不绕弯");
    let c = await caps();
    assert.equal(c.length, 1);
    const size = await page.evaluate(() => parseFloat(getComputedStyle(document.querySelector("#mirror .b-caption")).fontSize) / (document.getElementById("card").getBoundingClientRect().width / 1080));
    assert.ok(Math.abs(size - 48) < 0.6, "配文字号 48：" + size);
    // v00.03.01 U04（用户定乙）：配文粗体墨色、配文框同字重（光标才对得上）；释义 40 常规
    const st = await page.evaluate(() => { const k = document.getElementById("card").getBoundingClientRect().width / 1080, c = getComputedStyle(document.querySelector("#mirror .b-caption")), g = document.querySelector("#mirror .b-gloss, #mirror .b-gloss-ph"), t = getComputedStyle(document.getElementById("capCtl")), gc = getComputedStyle(document.getElementById("glossCtl")); return { cw: c.fontWeight, tw: t.fontWeight, gs: g ? parseFloat(getComputedStyle(g).fontSize) / k : 0, gw: gc.fontWeight }; });
    assert.deepEqual([st.cw, st.tw, Math.round(st.gs), st.gw], ["700", "700", 40, "400"], "配文与配文框粗体；释义 40、释义框常规：" + JSON.stringify(st));
    assert.equal(await page.locator("#capCtl").evaluate(n => n.tagName + getComputedStyle(n).color), "TEXTAREArgba(0, 0, 0, 0)", "配文框是透明的多行框，叠在镜像上");

    // 一直打到写满：折行，最多 3 行，之后不再接收
    let typed = "她看人从不绕弯";
    for (let k = 0; k < 150; k++) { await page.keyboard.type("字"); typed += "字"; }
    const kept = await page.locator("#capCtl").inputValue();
    assert.ok(kept.length > 30 && kept.length < typed.length, "写满后不再接收：收了 " + kept.length + " 字");
    assert.equal(typed.startsWith(kept), true, "收下的是前面的字，不从尾巴上截也不乱序");
    assert.equal(await page.locator("#toast").innerText(), "配文写满了");
    // 写满后再打空格也不收（排版去掉行尾空格，以前会一直收进看不见的空格直到 maxlength）
    await page.keyboard.type("   ");
    assert.equal(await page.locator("#capCtl").inputValue(), kept, "写满后空格也不收");
    c = await caps();
    const card = await cardBox();
    assert.equal(c.length, 3, "写满是 3 行");
    assert.equal(c.map(x => x.t).join(""), kept, "镜像里一个字不丢、没有省略号");
    assert.ok(c.every(x => x.right <= card.right + 1) && c[2].top + c[2].h <= card.bottom + 1, "三行都在卡内");
    assert.ok(c[1].top > c[0].top && c[2].top > c[1].top, "自上而下三行");
    // 2026-11-17 真机反馈：正在编辑时就按折行显示——镜像三行都看得见，透明的多行框盖住这三行（点哪行光标落哪行）
    assert.equal(await page.evaluate(() => document.activeElement.id), "capCtl", "仍在编辑");
    assert.ok((await page.evaluate(() => [...document.querySelectorAll("#mirror .b-caption")].map(n => getComputedStyle(n).visibility))).every(v => v === "visible"), "编辑中镜像折行可见");
    const ta = await page.locator("#capCtl").boundingBox();
    assert.ok(ta.y <= c[0].top + 1 && ta.y + ta.height >= c[2].top + c[2].h - 1, "多行框盖住三行：" + JSON.stringify({ ta, c }));
    // 输入框自己的折行和镜像一样是三行（光标按行走）
    const taLines = await page.locator("#capCtl").evaluate(n => Math.round(n.scrollHeight / parseFloat(getComputedStyle(n).lineHeight)));
    assert.equal(taLines, 3, "输入框里也是三行");
    // textarea 默认不继承字体（浏览器给 monospace）：和镜像不同字体时西文配文的折行、光标全错
    assert.equal(await page.locator("#capCtl").evaluate(n => getComputedStyle(n).fontFamily), await page.evaluate(() => getComputedStyle(document.querySelector("#mirror .b-caption")).fontFamily), "配文框字体同镜像");
    await shot("caption-editing");
    // 删字后还能再打
    await page.keyboard.press("Backspace"); await page.keyboard.type("末");
    assert.equal((await page.locator("#capCtl").inputValue()).slice(-1), "末", "删掉一个字后能再打一个");
    // 离开：镜像按折行显示
    await page.locator("#capCtl").evaluate(n => n.blur());
    assert.equal(await page.evaluate(() => getComputedStyle(document.querySelector("#mirror .b-caption")).visibility), "visible");
    await shot("caption-wrapped");

    // v00.03.01 R01（真机 C15）：粘贴超长文本——截到排得下为止放进去，不是一个字都不进；换行照旧变空格
    await page.locator("#capCtl").evaluate(n => { n.focus(); n.value = ""; n.dispatchEvent(new Event("input", { bubbles: true })); });
    const pasted = "开头一句\n" + "粘".repeat(200);
    await page.keyboard.insertText(pasted);
    const got = await page.locator("#capCtl").inputValue();
    assert.ok(got.length > 30 && pasted.replace(/\n/g, " ").startsWith(got), "粘贴超长：收下能放下的前段（" + got.length + " 字）");
    assert.equal(await page.locator("#toast").innerText(), "配文写满了");
    assert.equal((await caps()).length, 3, "截短后正好写满 3 行");
    await page.keyboard.type("再");
    assert.equal(await page.locator("#capCtl").inputValue(), got, "写满后逐字输入仍整次不收");
    // 复审补（批 A）：在原有文字中间粘贴，粘贴内容的头一个字恰好等于光标后的原字——原有的后半段不能丢，光标落在收下那段的末尾
    await page.locator("#capCtl").evaluate(n => { n.focus(); n.value = "甲乙"; n.dispatchEvent(new Event("input", { bubbles: true })); n.setSelectionRange(1, 1); });
    await page.keyboard.insertText("乙" + "粘".repeat(200));
    const mid = await page.locator("#capCtl").inputValue();
    assert.ok(mid.startsWith("甲乙粘") && mid.endsWith("粘乙"), "中间粘贴截短：原有的「乙」留在末尾：" + mid);
    assert.equal(await page.locator("#capCtl").evaluate(n => n.selectionStart), mid.length - 1, "光标在收下那段之后、原有的「乙」之前");
    // emoji（代理对）截短时整个留或整个不留
    await page.locator("#capCtl").evaluate(n => { n.value = ""; n.dispatchEvent(new Event("input", { bubbles: true })); });
    await page.keyboard.insertText("\u{1F600}".repeat(200));
    const emo = await page.locator("#capCtl").inputValue();
    assert.ok(emo.length > 10 && /^(\u{1F600})+$/u.test(emo), "emoji 不被切开：" + emo.length);
    await page.locator("#capCtl").evaluate(n => n.blur());

    // 西文配文：点镜像第 2、3 行中间，光标落在该行的字里（框与镜像同字体、同行距、同折行）
    const setCap = s => page.locator("#capCtl").evaluate((n, s) => { n.focus(); n.value = s; n.setSelectionRange(s.length, s.length); n.dispatchEvent(new Event("input", { bubbles: true })); }, s);
    await setCap("The quick brown fox jumps over the lazy dog and keeps running far away from home");
    c = await caps();
    for (let k = 1; k < c.length; k++) {
      const r = await page.evaluate(k => { const b = document.querySelectorAll("#mirror .b-caption")[k].getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2 }; }, k);
      await page.mouse.click(r.x, r.y);
      const at = await page.locator("#capCtl").evaluate(n => n.selectionStart), from = c.slice(0, k).reduce((a, x) => a + x.t.length + 1, 0);
      assert.ok(at > from && at < from + c[k].t.length, "点第 " + (k + 1) + " 行，光标落在这一行：" + at + " / " + from);
    }
    // 中文标点落在折行处并写满：浏览器的避头规则让框里比镜像多一行，光标走到那行时框不许上卷（否则各行都和镜像错一行）
    const pat = "字".repeat(19) + "，" + "字".repeat(19) + "。" + "字".repeat(40);
    for (let n = 1; n <= pat.length; n++) { await setCap(pat.slice(0, n)); if ((await page.locator("#capCtl").inputValue()).length < n) break; }
    await page.keyboard.press("End"); await page.keyboard.press("Backspace"); await page.keyboard.type("字");
    await page.waitForTimeout(100);
    assert.equal(await page.locator("#capCtl").evaluate(n => n.scrollTop), 0, "配文框不上卷");
    await page.locator("#capCtl").evaluate(n => n.blur());

    // 设置页：深浅三档选中不靠反色——选中项有勾、2px 墨框，底色不是墨色
    await page.locator("#capCtl").focus(); await page.keyboard.type("字"); // 再触发一次「配文写满了」
    assert.equal(await page.locator("#toast").innerText(), "配文写满了");
    await page.locator("#capCtl").evaluate(n => n.blur());
    await page.locator("#settingsOpen").click();
    assert.equal(await page.locator("#toast").innerText(), "", "正在显示的提示不带进设置页");
    await page.locator('input[name="skin"][value="dansaekhwa"]').check({ force: true });
    await page.locator('input[name="mode"][value="dark"]').check({ force: true });
    const seg = await page.evaluate(() => [...document.querySelectorAll('input[name="mode"]')].map(i => { const s = i.nextElementSibling, cs = getComputedStyle(s), ck = s.querySelector(".set-ck"); return { on: i.checked, bg: cs.backgroundColor, color: cs.color, bw: cs.borderTopWidth, fw: cs.fontWeight, ck: getComputedStyle(ck).display !== "none", h: s.getBoundingClientRect().height }; }));
    const on = seg.filter(x => x.on), off = seg.filter(x => !x.on);
    assert.equal(on.length, 1);
    assert.ok(on[0].ck && off.every(x => !x.ck), "只有选中项显示勾");
    assert.equal(on[0].bw, "2px"); assert.ok(off.every(x => x.bw === "1px"));
    assert.ok(Number(on[0].fw) >= 700 && off.every(x => Number(x.fw) < 700));
    assert.notEqual(on[0].bg, on[0].color, "选中项不是整块反色");
    assert.ok(seg.every(x => x.h >= 44), "点按区不小于 44px");
    await shot("settings-mode");
    await page.locator("#settingsClose").click();

    // 安卓带候选的输入法：选定候选前一直在组字。组字中的字要先画到卡上（以前要等选定才显示），选定后按定稿处理
    const cdp = await context.newCDPSession(page);
    const mirrorText = cls => page.evaluate(c => [...document.querySelectorAll("#mirror ." + c)].map(n => n.textContent).join(""), cls);
    await page.locator("#wordCtl").focus(); await page.locator("#wordCtl").evaluate(n => n.select());
    await cdp.send("Input.imeSetComposition", { text: "lea", selectionStart: 3, selectionEnd: 3 });
    await page.waitForTimeout(50);
    assert.match(await mirrorText("b-word"), /^lea$/i, "组字中的词先画到卡上");
    assert.equal(await page.locator("#wordCtl").evaluate(n => getComputedStyle(n).color), "rgba(0, 0, 0, 0)", "组字时输入框仍透明，不盖住卡面");
    await cdp.send("Input.insertText", { text: "leaf" });
    await page.waitForTimeout(50);
    assert.equal(await mirrorText("b-word"), "Leaf", "选定后按定稿（首字母大写）");
    await page.locator("#capCtl").focus(); await page.locator("#capCtl").fill("");
    await cdp.send("Input.imeSetComposition", { text: "bonjour", selectionStart: 7, selectionEnd: 7 });
    await page.waitForTimeout(50);
    assert.equal(await mirrorText("b-caption"), "bonjour", "配文组字中也先画");
    await cdp.send("Input.insertText", { text: "bonjour" });
    await page.waitForTimeout(50);
    assert.equal(await mirrorText("b-caption"), "bonjour", "选定后照样显示");
    await page.locator("#capCtl").evaluate(n => n.blur());
    assert.equal(await mirrorText("b-caption"), "bonjour", "离开后仍在：定稿写进了数据");
    // 写满后再组字：组字中照样先画，选定时被拒收（数据没变、不会自己重画），预览的字要撤掉
    for (let n = 1; n <= 80; n++) { await setCap("字".repeat(n)); if ((await page.locator("#capCtl").inputValue()).length < n) break; }
    const fullCap = await mirrorText("b-caption");
    await cdp.send("Input.imeSetComposition", { text: "zz", selectionStart: 2, selectionEnd: 2 });
    await page.waitForTimeout(50);
    assert.notEqual(await mirrorText("b-caption"), fullCap, "组字中的字先画（排不下时末行带省略号）");
    await cdp.send("Input.insertText", { text: "zz" });
    await page.waitForTimeout(50);
    assert.equal(await mirrorText("b-caption"), fullCap, "拒收后卡面回到原配文");
    await page.locator("#capCtl").evaluate(n => n.blur());

    assert.deepEqual(errors, [], "没有脚本报错");
    await context.close();
  }
  console.log("browser caption ok: filler 16 + count highlight, entry word fit, info 50, gloss 40 regular + caption 48 bold + wrap to 3 lines + full-stop + live wrap while editing, IME composing preview, digit hint removed, mode radios without inversion, at 320 / 393");
} finally {
  if (browser) await browser.close();
  server.close();
}
