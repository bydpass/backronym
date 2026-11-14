// 从运行中的产品按状态截取真实页面结构，供设计系统预览使用
import fs from 'node:fs';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE + '/index.js').then(m => m.default || m);
const out = process.argv[2]; const shots = {};
const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_PATH });
const SNAP = `(sel) => { const src = document.querySelector(sel), n = src.cloneNode(true);
  const a = src.querySelectorAll('input,textarea'), b = n.querySelectorAll('input,textarea');
  a.forEach((x, i) => { if (x.type === 'checkbox' || x.type === 'radio') { x.checked ? b[i].setAttribute('checked', '') : b[i].removeAttribute('checked'); } else if (x.type !== 'file') { b[i].setAttribute('value', x.value); if (x.tagName === 'TEXTAREA') b[i].textContent = x.value; } });
  n.querySelectorAll('use').forEach(u => { const sym = document.getElementById((u.getAttribute('xlink:href') || u.getAttribute('href')).slice(1)), svg = u.parentNode; svg.setAttribute('viewBox', sym.getAttribute('viewBox')); svg.innerHTML = sym.innerHTML; });
  n.querySelectorAll('img').forEach(i => i.setAttribute('src', ''));
  if (n.id === 'app') { n.removeAttribute('id'); n.classList.add('ds-app'); }
  const cs = getComputedStyle(document.documentElement);
  return { html: n.outerHTML, k: cs.getPropertyValue('--k').trim(), u: cs.getPropertyValue('--u').trim(), w: innerWidth }; }`;
async function fresh(width, skin = 'dansaekhwa') {
  const ctx = await browser.newContext({ viewport: { width, height: 800 } }); const page = await ctx.newPage();
  await page.goto('http://localhost:5173/'); await page.evaluate(s => { localStorage.clear(); localStorage.setItem('backronym-skin', s); }, skin); await page.reload(); await page.waitForSelector('#entryStart'); await page.waitForTimeout(400);
  return page;
}
const snap = async (page, key, sel = '#app') => { shots[key] = await page.evaluate('(' + SNAP + ')(' + JSON.stringify(sel) + ')'); };
const type = async (page, i, text) => { await page.evaluate(n => document.getElementById('pl-' + n).click(), i); await page.locator('#wordCtl').click(); await page.locator('#wordCtl').fill(text); await page.waitForTimeout(250); };
const pick = (page, code) => page.locator('#langList label:has(input[value="' + code + '"])').click();
const openLang = async page => { if (!(await page.locator('#langList').isVisible())) await page.locator('#langMore').click(); await page.waitForTimeout(200); };
for (const width of [360, 320]) {
  let page = await fresh(width);
  if (width === 360) console.log('top ids', await page.evaluate(() => [...document.querySelectorAll('#top [id]')].map(n => n.id + (n.hidden ? '(h)' : '')).join(' ')));
  await snap(page, 'entry-first-' + width);
  await openLang(page); await snap(page, 'entry-langopen-' + width);
  await pick(page, 'fr'); await pick(page, 'de'); await page.waitForTimeout(1500); await snap(page, 'entry-multi-' + width);
  await page.close();
  page = await fresh(width);
  await page.locator('#wordInput').fill('DEVELOPMENT'); await page.locator('#fillerCtl').fill('小满'); await page.waitForTimeout(400); await snap(page, 'entry-long-' + width);
  await page.locator('#wordInput').fill('LIFE'); await page.waitForTimeout(400); await snap(page, 'entry-word-' + width);
  await page.locator('#entryStart').click(); await page.waitForSelector('#pl-0'); await page.waitForTimeout(500);
  await snap(page, 'editor-empty-' + width);
  await type(page, 0, 'L'); await page.waitForTimeout(400); await snap(page, 'cand-letter-' + width); // 候选要打了首字母才列出来
  const W = ['Love', 'Ice', 'Fire', 'Echo']; for (let i = 0; i < 2; i++) await type(page, i, W[i]);
  await snap(page, 'editor-partial-' + width);
  for (let i = 2; i < 4; i++) await type(page, i, W[i]);
  await type(page, 0, 'Love'); await snap(page, 'editor-full-' + width);
  await type(page, 0, 'light'); await snap(page, 'editor-sense-' + width); await type(page, 0, 'Love');
  if (width === 360) console.log('grid switch candidates', await page.evaluate(() => [...document.querySelectorAll('#top button, #top input, #top label')].map(n => (n.id || n.className) + ':' + n.textContent.trim().slice(0, 6)).join(' | ')));
  await page.locator('#viewGrid').click(); await page.waitForTimeout(500); await snap(page, 'editor-grid-' + width); await page.locator('#viewSingle').click(); await page.waitForTimeout(300);
  await page.locator('#toEntry').click(); await page.waitForTimeout(400); await snap(page, 'entry-edit-' + width);
  await page.locator('#wordInput').fill('LIFT'); await page.waitForTimeout(300); await snap(page, 'entry-edit-dirty-' + width);
  await page.close();
}
{ // 多语言时的候选栏：英 + 法，候选按语言轮流并标语言
  const page = await fresh(360); await openLang(page); await pick(page, 'fr'); await page.waitForTimeout(1500);
  await page.locator('#wordInput').fill('LIFE'); await page.locator('#entryStart').click(); await page.waitForSelector('#pl-0'); await page.waitForTimeout(800);
  await type(page, 0, 'L'); await page.waitForTimeout(600); await snap(page, 'cand-letter-multi-360'); await page.close(); }
await browser.close(); fs.writeFileSync(out, JSON.stringify(shots)); console.log(Object.entries(shots).map(([k, v]) => k + ' ' + v.html.length + ' k=' + v.k + ' u=' + v.u).join('\n'));
