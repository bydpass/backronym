import fs from 'node:fs';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE + '/index.js').then(m => m.default || m);
const [A, out, ...names] = process.argv.slice(2);
const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_PATH });
for (const n of names) {
  const src = fs.readFileSync(`${A}/components/${n}/preview.html`, 'utf8');
  const m = src.match(/width=(\d+)/), h = src.match(/height=(\d+)/);
  const html = src.replace('<head>', `<head><link rel="stylesheet" href="file://${A}/tokens.css"><link rel="stylesheet" href="file://${A}/components/bundle.css"><script src="file://${A}/components/bundle.js"></script>`);
  fs.writeFileSync(`${out}/${n}.html`, html);
  const page = await browser.newPage({ viewport: { width: m ? +m[1] : 800, height: h ? +h[1] : 700 } }); const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.goto(`file://${out}/${n}.html`); await page.waitForTimeout(700);
  await page.screenshot({ path: `${out}/${n}.png`, fullPage: false });
  console.log(n, 'errors:', errs.length ? errs.slice(0, 2) : 'none', 'scrollW', await page.evaluate(() => document.documentElement.scrollWidth));
  await page.close();
}
await browser.close();
