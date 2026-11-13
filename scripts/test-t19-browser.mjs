// Isolated local server and fresh browser; never touches the user's preview storage.
import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const root=process.cwd();
const server=createServer(async(req,res)=>{
 const file=path.resolve(root,'.'+req.url.split('?')[0]);
 if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}
 try{res.setHeader('Content-Type',({'.js':'text/javascript','.html':'text/html','.css':'text/css'})[path.extname(file)]||'application/octet-stream');res.end(await readFile(file));}catch{res.writeHead(404).end();}
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
let browser;
try{
 browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{})});
 const page=await browser.newPage({viewport:{width:375,height:800}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.goto(`http://127.0.0.1:${server.address().port}/plans/v00.03.00/picker.html`);
 for(const [lang,query,expected] of [['es','tenía','原形：tener'],['fr','vais','原形：aller'],['it','è','原形：essere'],['de','Zahler',null],['de','weak',null],['de','strong',null],['de','habens','原形：Haben']]){
  await page.selectOption('#language',lang);
  await page.waitForFunction(()=>!document.getElementById('lookup').disabled);
  await page.fill('#query',query);await page.click('#lookup');
  const text=await page.locator('#results').innerText();
  if(expected) assert.ok(text.includes(expected),`${lang}/${query}: ${text}`);else { assert.equal(await page.locator('#results .card').count(),0); assert.ok(text.includes('没有可显示的结果')); }
 }
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));assert.deepEqual(errors,[]);
 console.log('T19 browser passed: picker exact forms, omitted lemma guard, label pollution regressions, valid habens, 375px and no page errors');
}finally{await browser?.close();await new Promise(r=>server.close(r));}
