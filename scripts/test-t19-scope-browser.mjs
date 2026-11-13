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
 const oldWordRequests=[];page.on('request',r=>{if(/\/lang\/[^/]+\/words\.js/.test(r.url()))oldWordRequests.push(r.url());});
 page.on('pageerror',e=>errors.push(e.message));
 await page.goto(`http://127.0.0.1:${server.address().port}/plans/v00.03.00/scope-picker.html`);
 await page.waitForFunction(()=>!document.getElementById('lookup').disabled);
 assert.equal(await page.locator('#results article').count(),783);
 for(const [language,word,gloss,note] of [['en','off','离开','主要用于祈使'],['fr','absenter','暂离（反身）','s’absenter'],['de','entfernen','离开（反身）','sich entfernen'],['es','ausentar','离开（反身）','ausentarse'],['it','sentirci','能听见','听力能力']]){
  await page.selectOption('#language',language);await page.waitForFunction(()=>!document.getElementById('lookup').disabled);
  await page.fill('#query',word);await page.click('#lookup');
  const cards=page.locator('#results article');assert.equal(await cards.count(),1);
  assert.ok((await cards.innerText()).includes(gloss));
  assert.ok((await cards.locator(':scope > p').allTextContents()).some(t=>t.includes(note)),'用法说明必须直接可见');
 }
 await page.selectOption('#language','en');await page.waitForFunction(()=>!document.getElementById('lookup').disabled);
 for(const word of ['offed','offing','offs']){await page.fill('#query',word);await page.click('#lookup');assert.equal(await page.locator('#results article').count(),0,'不得借未核的其他义词形');}
 for(const [language,word,gloss,note] of [['en','fondle','爱抚','温柔'],['de','sehnen','渴望（反身）','sich nach'],['es','apiadar','怜悯（反身）','apiadarse'],['it','stravedere','偏爱','stravedere per']]){
  await page.selectOption('#language',language);await page.waitForFunction(()=>!document.getElementById('lookup').disabled);
  await page.fill('#query',word);await page.click('#lookup');
  assert.ok((await page.locator('#results').innerText()).includes(gloss));
  assert.ok((await page.locator('#results article > p').allTextContents()).some(t=>t.includes(note)));
 }
 await page.selectOption('#language','de');await page.waitForFunction(()=>!document.getElementById('lookup').disabled);
 for(const word of ['gelüstet','gelüstete']){await page.fill('#query',word);await page.click('#lookup');assert.ok((await page.locator('#results').innerText()).includes('非人称'));}
 for(const word of ['gelüstest','gelüsteten']){await page.fill('#query',word);await page.click('#lookup');assert.equal(await page.locator('#results article').count(),0);}
 await page.selectOption('#language','en');await page.waitForFunction(()=>!document.getElementById('lookup').disabled);
 await page.fill('#query','Antoine');await page.click('#lookup');
 assert.equal(await page.locator('#results article').count(),1);
 assert.ok((await page.locator('#results').innerText()).includes('安托万'));
 assert.ok((await page.locator('#results').innerText()).includes('性别：m · 来源语言：fr'));
 await page.click('#browse');assert.equal(await page.locator('#results article').count(),783);

 await page.fill('#query','one');await page.click('#lookup');
 assert.equal(await page.locator('#results article').count(),1);
 assert.ok((await page.locator('#results').innerText()).includes('numerals'));
 await page.click('#browse');assert.equal(await page.locator('#results article').count(),783);

 assert.equal(await page.locator('#results h2').filter({hasText:/^metaphor$/}).count(),0);
 await page.check('[name=expanded][value=professional-humanities]');
 assert.equal(await page.locator('#results article').count(),856);
 assert.equal(await page.locator('#results h2').filter({hasText:/^metaphor$/}).count(),1);
 await page.check('[name=expanded][value=professional-natural]');
 assert.equal(await page.locator('#results article').count(),919);
 await page.click('#browse');assert.equal(await page.locator('#results article').count(),783);
 await page.fill('#query','metaphor');await page.click('#lookup');
 assert.ok((await page.locator('#results').innerText()).includes('隐喻'));
 assert.ok((await page.locator('#results').innerText()).includes('professional-humanities'));

 await page.fill('#query','moon');await page.click('#lookup');assert.ok((await page.locator('#results').innerText()).includes('月亮'));
 await page.selectOption('#language','fr');await page.waitForFunction(()=>!document.getElementById('lookup').disabled);
 assert.equal(await page.inputValue('#query'),'');
 await page.fill('#query','ombres');await page.click('#lookup');assert.ok((await page.locator('#results').innerText()).includes('影子'));
 await page.locator('#results summary').click();assert.ok((await page.locator('#results').innerText()).includes('/lemmas/8487'));
 for(const [word,heading,gloss] of [['naitre','naître','诞生'],['naitrai','naître','诞生'],['renaitre','renaître','重生'],['renaîtrai','renaître','重生'],['renaitrai','renaître','重生']]){
  await page.fill('#query',word);await page.click('#lookup');
  assert.equal(await page.locator('#results article').count(),1,'拼写变体只返回一个义项');
  assert.equal(await page.locator('#results h2').innerText(),heading);
  assert.ok((await page.locator('#results').innerText()).includes(gloss));
 }
 await page.route('**/compiled/de/*.json',r=>r.abort());
 await page.selectOption('#language','de');await page.waitForFunction(()=>document.getElementById('status').textContent.includes('已停止展示'));
 assert.equal(await page.locator('#results article').count(),0);assert.ok(await page.locator('#lookup').isDisabled());
 await page.unroute('**/compiled/de/*.json');await page.click('#retry');await page.waitForFunction(()=>!document.getElementById('lookup').disabled);
 assert.equal(await page.locator('#results article').count(),560);
 await page.selectOption('#language','la');await page.waitForFunction(()=>!document.getElementById('lookup').disabled);assert.equal(await page.locator('#results article').count(),546);
 await page.selectOption('#language','es');await page.selectOption('#language','it');await page.waitForFunction(()=>!document.getElementById('lookup').disabled&&document.getElementById('status').textContent.startsWith('it'));
 assert.equal(await page.locator('#results article').count(),626);
 await page.click('#random');assert.ok((await page.locator('#status').innerText()).includes('随机样本'));
 assert.ok(!(await page.locator('#results').innerText()).includes('numerals'),'random must exclude real numerals');
 assert.ok(!(await page.locator('#results').innerText()).includes('names'),'random must exclude names');
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));assert.deepEqual(errors,[]);
 for(const [language,word,gloss,note] of [['en','lots','命运','个人一生'],['en','options','选项','行动方案'],['en','promised','承诺','承诺做'],['de','Wehr','抵抗（固定搭配）','sich zur Wehr setzen'],['de','gekoren','选择（古）','强变化'],['es','ganas','意愿','tener ganas de'],['it','voleri','意愿','独立名词'],['it','tenente','坚韧的（文学）','文学形容词']]){
  await page.selectOption('#language',language);await page.waitForFunction(()=>!document.getElementById('lookup').disabled);
  await page.fill('#query',word);await page.click('#lookup');
  const result=await page.locator('#results').innerText();assert.ok(result.includes(gloss),word);assert.ok(result.includes(note),word+' usage');
 }
 for(const [language,word,forbidden] of [['de','Wehres','抵抗（固定搭配）'],['de','kiesst','选择（古）'],['it','voglio','独立名词'],['es','ojalá','意愿']]){
  await page.selectOption('#language',language);await page.waitForFunction(()=>!document.getElementById('lookup').disabled);
  await page.fill('#query',word);await page.click('#lookup');assert.ok(!(await page.locator('#results').innerText()).includes(forbidden),word);
 }
 // 交付46：一审改正、拉丁准入与非屈折词形排除。
 for(const [language,word,gloss] of [['en','phoenix','不死鸟'],['fr','ambulant','流动的'],['la','fūnus','葬礼'],['la','funus','葬礼'],['es','ser','是'],['es','pibe','孩子（方）'],['de','Wartens','等待'],['fr','évolution','进化']]){
  await page.selectOption('#language',language);await page.waitForFunction(()=>!document.getElementById('lookup').disabled);
  await page.fill('#query',word);await page.click('#lookup');assert.ok((await page.locator('#results').innerText()).includes(gloss),word+' 交付46');
 }
 for(const [language,word] of [['it','archaic'],['it','nefastamente'],['de','frühneuhochdeutsch'],['fr','pb'],['la','rēspūblica']]){
  await page.selectOption('#language',language);await page.waitForFunction(()=>!document.getElementById('lookup').disabled);
  await page.fill('#query',word);await page.click('#lookup');assert.equal(await page.locator('#results article').count(),0,word+' 不应可查');
 }
 // 交付49：核查补上的专业义（默认不展示，手动查询可见并带说明）。
 for(const [language,word,gloss,note] of [['fr','mesure','节拍','battre la mesure'],['fr','genre','属（生物分类）','生物分类义'],['es','géneros','属（生物分类）','生物分类义'],['it','genere','属（生物分类）','生物分类义'],['es','composición','构图','美术'],['es','reducción','还原','化学义'],['it','tonalità','色调','色彩义'],['en','phoneme','音位','']]){
  await page.selectOption('#language',language);await page.waitForFunction(()=>!document.getElementById('lookup').disabled);
  await page.fill('#query',word);await page.click('#lookup');const result=await page.locator('#results').innerText();
  assert.ok(result.includes(gloss),word+' 交付49');assert.ok(result.includes(note),word+' 说明');
 }
 // 交付50：Astra累计复审T19-A01–A11返工。
 for(const [language,word,gloss,note] of [['en','phone','音素','语音学义'],['de','Laut','音素','语音学义'],['es','fono','音素','语音学义'],['fr','phonème','音位','区别意义'],['en','polymerization','聚合','化学义'],['en','reduction','还原','化学义'],
  ['en','aggregation','聚集','polymerization'],['en','revert','恢复原状','reduction'],['la','coalesco','结合','长合'],['la','humani','凡人','复数名词'],['la','edulia','食物','中性复数'],['la','lympha','水（诗）',''],['la','pontus','海（诗）',''],
  ['de','harren','等候（书）',''],['es','palmar','死去（口）',''],['fr','lumieres','光',''],['fr',"age d'or",'黄金时代',''],['de','Seen','海',''],['la','legit','阅读',''],['la','harpa','竖琴','晚期拉丁']]){
  await page.selectOption('#language',language);await page.waitForFunction(()=>!document.getElementById('lookup').disabled);
  await page.fill('#query',word);await page.click('#lookup');const result=await page.locator('#results').innerText();
  assert.ok(result.includes(gloss),word+' 交付50');assert.ok(result.includes(note),word+' 说明');
 }
 for(const [language,word] of [['de','Hüte'],['de','Hutes'],['de','Hütchen'],['de','schon'],['de','Sees'],['fr','morte'],['fr','age'],['it','dramme'],['la','legavi'],['la','edulio']]){
  await page.selectOption('#language',language);await page.waitForFunction(()=>!document.getElementById('lookup').disabled);
  await page.fill('#query',word);await page.click('#lookup');assert.equal(await page.locator('#results article').count(),0,word+' 交付50不应可查');
 }
 for(const [language,word,forbidden] of [['en','utmost','极限'],['en','phoneme','音素'],['fr','Alexandrie','l’Alexandrie'],['la','Olympus','Ōlympus']]){
  await page.selectOption('#language',language);await page.waitForFunction(()=>!document.getElementById('lookup').disabled);
  await page.fill('#query',word);await page.click('#lookup');assert.ok(!(await page.locator('#results').innerText()).includes(forbidden),word+' 不应再显示'+forbidden);
 }
 await page.selectOption('#language','fr');await page.waitForFunction(()=>!document.getElementById('lookup').disabled);
 await page.fill('#query','désirer');await page.click('#lookup');assert.equal(await page.locator('#results article').count(),1,'désirer渴望只出一条');
 // 交付48：词组、本地无词头的专名，以及近代科学拉丁。
 for(const [language,word,gloss] of [['en','golden age','黄金时代'],['fr','âge d’or','黄金时代'],['fr','age d’or','黄金时代'],['de','Wachstafel','蜡板'],['es','reloj de sol','日晷'],['it','età dell’oro','黄金时代'],['la','cellula','细胞'],['la','aurea aetas','黄金时代'],['la','Olympus','奥林匹斯山']]){
  await page.selectOption('#language',language);await page.waitForFunction(()=>!document.getElementById('lookup').disabled);
  await page.fill('#query',word);await page.click('#lookup');assert.ok((await page.locator('#results').innerText()).includes(gloss),word+' 交付48');
 }
 await page.selectOption('#language','la');await page.waitForFunction(()=>!document.getElementById('lookup').disabled);
 await page.fill('#query','cellula');await page.click('#lookup');assert.ok((await page.locator('#results').innerText()).includes('近代科学拉丁'),'科学拉丁须在说明里写明');
 // en phone 在交付48一审去掉，交付50按Astra复审T19-A05改以「音素」准入（见下方交付50断言）。
 for(const [language,word] of [['la','asthma'],['la','anaemia']]){
  await page.selectOption('#language',language);await page.waitForFunction(()=>!document.getElementById('lookup').disabled);
  await page.fill('#query',word);await page.click('#lookup');assert.equal(await page.locator('#results article').count(),0,word+' 一审去掉的不应可查');
 }
 // 交付47：教会拉丁引例准入，中文后标（教）；没有引例的中世纪词仍不可查。
 await page.selectOption('#language','la');await page.waitForFunction(()=>!document.getElementById('lookup').disabled);
 for(const [word,gloss] of [['coenobium','修道院（教）'],['paradisus','伊甸园（教）'],['dilectionis','爱（教）'],['erēmus','荒野（教）']]){
  await page.fill('#query',word);await page.click('#lookup');const result=await page.locator('#results').innerText();
  assert.ok(result.includes(gloss),word+' 教会拉丁');assert.ok(result.includes('教会拉丁语')||result.includes('武加大'),word+' 用法说明');
 }
 await page.fill('#query','panis');await page.click('#lookup');assert.ok(!(await page.locator('#results').innerText()).includes('食物'),'pānis只留面包');
 // 交付45：C01核义、用法说明与名词/动词同形隔离。
 for(const [language,word,gloss,note] of [['es','celos','醋意','爱情猜忌'],['es','celos','嫉妒','常用复数celos'],['fr','merci','怜悯（古）','sans merci'],['de','Begehren','渴望','中性名词'],['it','dolenti','悲伤的',''],['it','voglie','渴望','不借volere变位'],['en','yearning','渴望','同形形容词']]){
  await page.selectOption('#language',language);await page.waitForFunction(()=>!document.getElementById('lookup').disabled);
  await page.fill('#query',word);await page.click('#lookup');
  const result=await page.locator('#results').innerText();assert.ok(result.includes(gloss),word);assert.ok(result.includes(note),word+' usage');
 }
 for(const [language,word,forbidden] of [['fr','mercis','怜悯（古）'],['de','begehrt','中性名词，欲求'],['it','dolentemente','悲伤的'],['it','piace','名词复数piaceri'],['es','quiero','复数quereres']]){
  await page.selectOption('#language',language);await page.waitForFunction(()=>!document.getElementById('lookup').disabled);
  await page.fill('#query',word);await page.click('#lookup');assert.ok(!(await page.locator('#results').innerText()).includes(forbidden),word);
 }
 await page.selectOption('#language','en');await page.waitForFunction(()=>!document.getElementById('lookup').disabled);await page.click('#browse');
 assert.equal(await page.locator('#results h2').filter({hasText:/^karma$/}).count(),0);
 await page.check('[name=expanded][value=historical-cultural]');assert.equal(await page.locator('#results h2').filter({hasText:/^karma$/}).count(),1);
 await page.click('#browse');await page.fill('#query','karma');await page.click('#lookup');assert.ok((await page.locator('#results').innerText()).includes('业力'));
 for(const [language,word,gloss] of [['en','borders','边界'],['en','frontiers','边界'],['en','wilds','荒野'],['en','twilight','曙暮微光'],['fr','patrie','故乡'],['fr','patelin','村镇（口语）'],['de','Heim','家（住所）'],['it','brughiera','石南荒原']]){
  await page.selectOption('#language',language);await page.waitForFunction(()=>!document.getElementById('lookup').disabled);
  await page.fill('#query',word);await page.click('#lookup');assert.ok((await page.locator('#results').innerText()).includes(gloss),word);
 }
 await page.selectOption('#language','es');await page.waitForFunction(()=>!document.getElementById('lookup').disabled);
 await page.click('#browse');assert.equal(await page.locator('#results h2').filter({hasText:'lontananza'}).count(),0);
 await page.check('[name=expanded][value=professional-humanities]');assert.equal(await page.locator('#results h2').filter({hasText:'lontananza'}).count(),1);
 await page.click('#browse');await page.fill('#query','lontananza');await page.click('#lookup');assert.ok((await page.locator('#results').innerText()).includes('绘画远景'));
 for(const [language,word,gloss,note] of [['en','lasting','持久的','不保证永无终结'],['en','stricken','遭受打击的','by或with'],['fr','jouvence','青春（文学）','文学'],['es','tris','片刻','口语'],['it','morire','死亡',''],['it','rimbambito','糊涂的','贬斥']]){
  await page.selectOption('#language',language);await page.waitForFunction(()=>!document.getElementById('lookup').disabled);
  await page.fill('#query',word);await page.click('#lookup');
  const result=await page.locator('#results').innerText();assert.ok(result.includes(gloss),word);if(note)assert.ok(result.includes(note),word+' usage');
 }
 for(const [language,word,heading,gloss] of [['en','freedom','freedom','自由'],['fr','tripes','les tripes','勇气'],['de','Hut','die Hut','守护'],['es','sino','el sino','命运'],['it','fegato','il fegato','勇气']]){
  await page.selectOption('#language',language);
  await page.waitForFunction(()=>!document.getElementById('lookup').disabled);
  await page.fill('#query',word);await page.click('#lookup');
  assert.equal(await page.locator('#results h2').filter({hasText:heading}).count(),1);
  assert.ok((await page.locator('#results').innerText()).includes(gloss));
 }
 for(const [language,word,firstHeading,gloss] of [['en','choose','choose','选择'],['fr','choisir','choisir','选择'],['de','versprechen','versprechen','承诺'],['de','Versprechen','das Versprechen','承诺'],['es','velar','velar','守护'],['it','impegnarsi','impegnarsi','承诺']]){
  await page.selectOption('#language',language);
  await page.waitForFunction(()=>!document.getElementById('lookup').disabled);
  await page.fill('#query',word);await page.click('#lookup');
  assert.equal(await page.locator('#results h2').first().innerText(),firstHeading);
  assert.ok((await page.locator('#results article').first().innerText()).includes(gloss));
 }
 assert.deepEqual(errors,[]);
 await page.selectOption('#language','it');
 await page.waitForFunction(()=>!document.getElementById('lookup').disabled);
 await page.fill('#query','sogno');await page.click('#lookup');
 assert.equal(await page.locator('#results article').count(),2,'梦与希望保留两个独立义项');
 assert.ok((await page.locator('#results').innerText()).includes('梦'));
 assert.ok((await page.locator('#results').innerText()).includes('希望'));
 for(const [language,word,gloss] of [['en','echo','回声'],['fr','rêve','梦'],['de','Traum','梦'],['es','sueño','梦']]){
  await page.selectOption('#language',language);await page.waitForFunction(()=>!document.getElementById('lookup').disabled);
  await page.fill('#query',word);await page.click('#lookup');
  assert.ok((await page.locator('#results').innerText()).includes(gloss),language+' '+word+' 应能展示 '+gloss);
  if(word==='sueño'){
   assert.equal(await page.locator('#results article').count(),2);
   assert.ok((await page.locator('#results article').first().innerText()).includes('睡眠'),'同层匹配仍以日用义先于创作义');
  }
 }
 assert.deepEqual(errors,[]);
 for(const [language,word,gloss] of [['en','yarn','故事'],['en','idol','幻象'],['en','narration','故事'],['en','privacy','秘密'],['de','Vision','幻象'],['de','Mär','故事'],['de','Story','故事'],['fr','mirage','幻象'],['it','eco','回声'],['it','arcano','秘密'],['it','visione','幻象'],['de','Träume','梦'],['fr','histoires','故事']]){
  await page.selectOption('#language',language);await page.waitForFunction(()=>!document.getElementById('lookup').disabled);
  await page.fill('#query',word);await page.click('#lookup');
  assert.ok((await page.locator('#results').innerText()).includes(gloss),language+' '+word+' 补证或词形查询');
 }
 for(const word of ['scam','resonance']){
  await page.selectOption('#language','en');await page.waitForFunction(()=>!document.getElementById('lookup').disabled);
  await page.fill('#query',word);await page.click('#lookup');
  assert.equal(await page.locator('#results article').count(),0,word+' 不得显示被拒绝的映射');
 }
 await page.selectOption('#language','en');await page.waitForFunction(()=>!document.getElementById('lookup').disabled);
 for(const [word,lemma,gloss] of [['children','child','孩子'],['stories','story','故事'],['chose','choose','选择'],['chosen','choose','选择'],['sought','seek','追求'],['people','person','人']]){
  await page.fill('#query',word);await page.click('#lookup');
  assert.ok((await page.locator('#results').innerText()).includes(gloss),'英语词形 '+word);
  assert.ok((await page.locator('#results h2').allTextContents()).includes(lemma));
 }
 for(const word of ['dreaming','lit','ones','libertys','symmetrys','echos']){
  await page.fill('#query',word);await page.click('#lookup');
  assert.equal(await page.locator('#results article').count(),0,word+' 不借名词或查询专表义项');
 }
 for(const [language,word,gloss] of [['en','mystery','秘密'],['en','relation','故事'],['es','incógnita','秘密'],['es','misterio','秘密'],['it','cammino','旅程']]){
  await page.selectOption('#language',language);await page.waitForFunction(()=>!document.getElementById('lookup').disabled);
  await page.fill('#query',word);await page.click('#lookup');
  assert.ok((await page.locator('#results').innerText()).includes(gloss),language+' '+word+' 精确义项');
 }
 for(const [language,word] of [['en','secrecy'],['en','stealth'],['es','reticencia'],['es','clandestinidad'],['it','segretezza'],['it','itinerario'],['it','riecheggiare']]){
  await page.selectOption('#language',language);await page.waitForFunction(()=>!document.getElementById('lookup').disabled);
  await page.fill('#query',word);await page.click('#lookup');
  assert.equal(await page.locator('#results article').count(),0,word+' 当前候选未准入');
 }
 // 交付45准入confidenza的少用信任义；秘密义候选仍未准入。
 await page.selectOption('#language','it');await page.waitForFunction(()=>!document.getElementById('lookup').disabled);
 await page.fill('#query','confidenza');await page.click('#lookup');
 {const result=await page.locator('#results').innerText();assert.ok(result.includes('信任（少用）'));assert.equal(await page.locator('#results article').count(),1,'confidenza 秘密义仍未准入');}
 for(const [language,word,gloss] of [['en','mum','沉默的'],['fr','rencontrer','相遇'],['de','schweigen','沉默'],['es','callar','沉默'],['it','incontrarsi','相遇'],['it','silente','沉默的']]){
  await page.selectOption('#language',language);await page.waitForFunction(()=>!document.getElementById('lookup').disabled);
  await page.fill('#query',word);await page.click('#lookup');
  assert.ok((await page.locator('#results').innerText()).includes(gloss),word+' 新准入用法');
  if(word==='mum')assert.equal(await page.locator('#results article').count(),1,'仅准入形容词，不恢复被拒名词');
 }
 for(const [language,word] of [['en','secret'],['fr','secret'],['es','secreto'],['it','segreto']]){
  await page.selectOption('#language',language);await page.waitForFunction(()=>!document.getElementById('lookup').disabled);
  await page.fill('#query',word);await page.click('#lookup');
  const result=await page.locator('#results').innerText();
  assert.ok(result.includes('noun')&&result.includes('adj'),word+' 名词和形容词身份同时保留');
 }
 await page.selectOption('#language','it');await page.waitForFunction(()=>!document.getElementById('lookup').disabled);
 await page.fill('#query','subdolo');await page.click('#lookup');
 assert.equal(await page.locator('#results article').count(),0,'拒绝阴险→秘密的映射');
 await page.selectOption('#language','en');await page.waitForFunction(()=>!document.getElementById('lookup').disabled);
 for(const [word,gloss] of [['underground','秘密的'],['parting','离别的'],['closet','秘密的'],['inside','秘密的']]){
  await page.fill('#query',word);await page.click('#lookup');
  assert.ok((await page.locator('#results').innerText()).includes(gloss),word+' 独立形容词补证');
  assert.equal(await page.locator('#results article').count(),1,word+' 不混入未准入词性');
 }
 for(const word of ['innermost','secretive','intimate']){
  await page.fill('#query',word);await page.click('#lookup');
  assert.equal(await page.locator('#results article').count(),0,word+' 不显示错误或待核映射');
 }
 for(const [language,word,gloss] of [['en','itinerary','旅程的'],['de','scheiden','离别'],['en','fragility','脆弱'],['fr','errance','漂泊'],['de','Ruhe','宁静'],['es','tenacidad','坚韧'],['it','splendore','灿烂']]){
  await page.selectOption('#language',language);await page.waitForFunction(()=>!document.getElementById('lookup').disabled);
  await page.fill('#query',word);await page.click('#lookup');
  assert.ok((await page.locator('#results').innerText()).includes(gloss),word+' 本批核义');
  if(word==='itinerary')assert.equal(await page.locator('#results article').count(),1,'只准入独立形容词，不恢复旧名词误映射');
 }
 // 交付46：patience、fortezza、fragmentation、frailty 已逐义核对后准入（patience改正为耐心）；sigiloso、brillo仍未准入。
 for(const [language,word,gloss] of [['fr','patience','耐心'],['it','fortezza','坚韧'],['en','fragmentation','破碎'],['en','frailty','脆弱']]){
  await page.selectOption('#language',language);await page.waitForFunction(()=>!document.getElementById('lookup').disabled);
  await page.fill('#query',word);await page.click('#lookup');
  assert.equal(await page.locator('#results article').count(),1,word);assert.ok((await page.locator('#results').innerText()).includes(gloss),word+' 交付46准入义');
 }
 for(const [language,word] of [['es','sigiloso'],['it','brillo']]){
  await page.selectOption('#language',language);await page.waitForFunction(()=>!document.getElementById('lookup').disabled);
  await page.fill('#query',word);await page.click('#lookup');
  assert.equal(await page.locator('#results article').count(),0,word+' 未准入用法隔离');
 }
 for(const [language,word,gloss] of [['en','fracture','破碎'],['fr','éclore','绽放'],['de','vergehen','消逝'],['es','morir','消逝'],['it','sbocciare','绽放'],['it','spezzarsi','破碎']]){
  await page.selectOption('#language',language);await page.waitForFunction(()=>!document.getElementById('lookup').disabled);
  await page.fill('#query',word);await page.click('#lookup');
  assert.ok((await page.locator('#results').innerText()).includes(gloss),word+' 动词核义');
 }
 await page.selectOption('#language','de');await page.waitForFunction(()=>!document.getElementById('lookup').disabled);
 await page.fill('#query','Vergehen');await page.click('#lookup');
 assert.equal(await page.locator('#results article').count(),1);
 assert.equal(await page.locator('#results h2').first().innerText(),'vergehen','大小写回退只能命中准入动词，不准入法律名词');
 await page.selectOption('#language','en');await page.waitForFunction(()=>!document.getElementById('lookup').disabled);
 await page.fill('#query','crumbling');await page.click('#lookup');
 assert.equal(await page.locator('#results article').count(),1);
 assert.equal(await page.locator('#results h2').first().innerText(),'crumble');
 assert.ok((await page.locator('#results').innerText()).includes('碎裂'));
 await page.click('#browse');
 assert.equal(await page.locator('#results h2').filter({hasText:/^crumbling$/}).count(),0,'纯屈折不进推荐');
 assert.equal(await page.locator('#results h2').filter({hasText:/^crumble$/}).count(),1);
 for(const [language,word,gloss] of [['en','brittle','脆弱的'],['en','crystalline','透明的'],['fr','transparent','透明的'],['de','zäh','坚韧的'],['de','zerbrochen','破碎的'],['es','frágil','脆弱的'],['it','smagliante','灿烂的']]){
  await page.selectOption('#language',language);await page.waitForFunction(()=>!document.getElementById('lookup').disabled);
  await page.fill('#query',word);await page.click('#lookup');
  assert.ok((await page.locator('#results').innerText()).includes(gloss),word+' 形容词核义');
 }
 await page.selectOption('#language','en');await page.waitForFunction(()=>!document.getElementById('lookup').disabled);
 for(const word of ['translucent','dizzying','shattering']){
  await page.fill('#query',word);await page.click('#lookup');
  assert.equal(await page.locator('#results article').count(),0,word+' 拒绝或待核映射隔离');
 }
 // 交付46：transparent核义准入；sheer原「透明的」被拒，只以「薄透的」出现。
 for(const [word,gloss,forbidden] of [['transparent','透明的',''],['sheer','薄透的','透明的']]){
  await page.fill('#query',word);await page.click('#lookup');
  const result=await page.locator('#results').innerText();assert.equal(await page.locator('#results article').count(),1,word);
  assert.ok(result.includes(gloss),word);if(forbidden)assert.ok(!result.split('\n').some(line=>line.trim()===forbidden),word+' 旧映射不恢复');
 }
 for(const [lang,word,gloss] of [['en','saw','看见'],['en','spoken','说话'],['fr','cherchent','寻找'],['fr','entendent','听见'],['de','hörte','听见'],['de','gesucht','寻找'],['de','sahen','看见']]){
  await page.selectOption('#language',lang);await page.waitForFunction(()=>!document.getElementById('lookup').disabled);
  await page.fill('#query',word);await page.click('#lookup');
  assert.ok((await page.locator('#results').innerText()).includes(gloss),word+' D04 source form');
 }
 for(const [lang,word] of [['en','eats'],['fr','mange'],['de','isst'],['es','comía'],['es','como'],['it','mangia']]){
  await page.selectOption('#language',lang);await page.waitForFunction(()=>!document.getElementById('lookup').disabled);
  await page.fill('#query',word);await page.click('#lookup');
  assert.ok((await page.locator('#results').innerText()).includes('吃'),lang+' eat source form');
 }
 await page.selectOption('#language','la');await page.waitForFunction(()=>!document.getElementById('lookup').disabled);
 // 交付46起拉丁语有日用与创作类准入词，默认列表不再为空；命名用的专业词仍须主动展开。
 assert.equal(await page.locator('#results article').count(),546,'拉丁默认只含日用与创作类');
 assert.equal(await page.locator('#results h2').filter({hasText:/^albus$/}).count(),0,'命名专业词默认不展示');
 await page.check('[name=expanded][value=professional-natural]');
 assert.equal(await page.locator('#results article').count(),579,'拉丁命名词主动展开');
 assert.equal(await page.locator('#results h2').filter({hasText:/^albus$/}).count(),1,'展开后可见命名专业词');
 for(const [word,gloss] of [['albus','白色的'],['alba','白色的'],['niger','黑色的'],['nigra','黑色的'],['aureum','金色的'],['aquātilis','水生的'],['aquatilis','水生的'],['aquātile','水生的'],['aquatile','水生的'],['aquatilia','水生的'],['rubra','红色的'],['longifolia','长叶的'],['angustifolia','狭叶的'],['grandiflora','大花的'],['parviflora','小花的'],['montana','山地的']]){
  await page.fill('#query',word);await page.click('#lookup');
  assert.ok((await page.locator('#results').innerText()).includes(gloss),word+' 拉丁命名查询');
 }
 for(const word of ['frondeō','albidus']){
  await page.fill('#query',word);await page.click('#lookup');
  assert.equal(await page.locator('#results article').count(),0,word+' 拒绝错误概念或程度映射');
 }
 for(const capability of ['fetch','TextDecoder','crypto']){
  const missing=await browser.newPage(),failures=[];
  missing.on('pageerror',e=>failures.push(e.message));
  await missing.addInitScript(name=>{
   const original=window[name];
   Object.defineProperty(window,name,{configurable:true,value:undefined});
   window.restoreCapability=()=>Object.defineProperty(window,name,{configurable:true,value:original});
  },capability);
  await missing.goto(`http://127.0.0.1:${server.address().port}/plans/v00.03.00/scope-picker.html`);
  await missing.waitForFunction(()=>document.getElementById('status').textContent.includes('当前环境不支持安全读取词库'));
  assert.equal(await missing.locator('#results article').count(),0);
  assert.ok(await missing.locator('#lookup').isDisabled());
  assert.ok(await missing.locator('#random').isDisabled());
  await missing.evaluate(()=>window.restoreCapability());
  await missing.click('#retry');
  await missing.waitForFunction(()=>!document.getElementById('lookup').disabled);
  assert.equal(await missing.locator('#results article').count(),783);
  assert.deepEqual(failures,[]);
  await missing.close();
 }
 // 交付51：显式长音区分另一动词；不得从词形或去长音回退借回错义。
 await page.selectOption('#language','la');await page.waitForFunction(()=>!document.getElementById('lookup').disabled);
 for(const word of ['lēgāre','occīdere','dēcīdere','ēdere']){
  await page.fill('#query',word);await page.click('#lookup');
  assert.equal(await page.locator('#results article').count(),0,word+' 不得借另一动词的义项');
 }
 await page.fill('#query','vadō');await page.click('#lookup');
 assert.equal(await page.locator('#results h2').filter({hasText:/^vādō$/}).count(),0,'别的义项精确命中不能绕过行走义的词形排除');
 assert.ok((await page.locator('#results').innerText()).includes('浅滩'),'vadum的合法精确词形仍保留');
 for(const [word,gloss] of [['legere','阅读'],['occidere','死亡'],['dēcidere','掉落'],['edere','吃']]){
  await page.fill('#query',word);await page.click('#lookup');
  assert.ok((await page.locator('#results').innerText()).includes(gloss),word+' 本义形式仍可查');
 }
 for(const [lang,word,gloss] of [['en','slumber','睡眠（书）'],['it','dipartita','离世（书）'],['it','filarsela','溜走（口）']]){
  await page.selectOption('#language',lang);await page.waitForFunction(()=>!document.getElementById('lookup').disabled);
  await page.fill('#query',word);await page.click('#lookup');
  assert.ok((await page.locator('#results article p').first().innerText()).includes(gloss),word+' 语体落入释义，不只存在用法说明');
 }
 // 批次51内续核：实际释义、修正词头与名词/动词隔离。
 for(const [lang,word,gloss] of [['es','arcadia','田园乐土'],['es','comeres','食物（古）'],['fr','noûs','理智'],['fr','jobs','工作（口）'],['it','domi','苍穹（书）'],['la','diabetes','糖尿病'],['la','oecologia','生态学'],['la','ente','存在者（教）'],['la','laura','隐修院（教）']]){
  await page.selectOption('#language',lang);await page.waitForFunction(()=>!document.getElementById('lookup').disabled);
  await page.fill('#query',word);await page.click('#lookup');
  assert.ok((await page.locator('#results article p').allTextContents()).some(t=>t.includes(gloss)),word+' 续核释义');
 }
 for(const [lang,word,forbidden] of [['es','comiendo','食物（古）'],['fr','nous','理智'],['it','doma','苍穹（书）'],['la','entem','存在者（教）'],['la','essentiāliter','本质的（教）']]){
  await page.selectOption('#language',lang);await page.waitForFunction(()=>!document.getElementById('lookup').disabled);
  await page.fill('#query',word);await page.click('#lookup');
  assert.ok(!(await page.locator('#results article p').allTextContents()).some(t=>t.includes(forbidden)),word+' 不得串入续核义项');
 }
 // 批次51复审返工：本义正例、同形错借与待核隔离。
 for(const [language,word,gloss] of [['la','animatu','呼吸（罕）'],['la','cubitūs','卧榻（罕）'],['la','cursio','奔跑（罕）'],['la','lymphor','水（罕）'],['la','īr','手掌（罕）'],['la','papas','食物（罕）'],['la','albam','黎明（罕）'],['la','marcam','边境（教）']]){
  await page.selectOption('#language',language);await page.waitForFunction(()=>!document.getElementById('lookup').disabled);
  await page.fill('#query',word);await page.click('#lookup');assert.ok((await page.locator('#results').innerText()).includes(gloss),word+' 复审返工');
 }
 for(const [language,word,forbidden] of [['la','marcus','边境（教）'],['la','Marcus','边境（教）'],['la','cubiti','卧榻（罕）'],['la','animāta','呼吸（罕）'],['la','pāpissa','食物（罕）'],['la','lymphōr','水（罕）'],['de','beihelfen','帮助'],['de','beigeholfen','帮助']]){
  await page.selectOption('#language',language);await page.waitForFunction(()=>!document.getElementById('lookup').disabled);
  await page.fill('#query',word);await page.click('#lookup');
  assert.ok(!(await page.locator('#results').innerText()).includes(forbidden),word+' 不得误借或放行待核');
 }
 // 交付52（T19-R51-H1）：拉丁孤例只供手动查询。默认、全部展开、随机都不出现；手动查得到；可推荐的义项排在前面。
 await page.selectOption('#language','la');await page.waitForFunction(()=>!document.getElementById('lookup').disabled);
 const rareHeads=['asserviō','animātus','cubitus','cursiō','lymphor','īr','pāpa','alba'];
 const heads=async()=>(await page.locator('#results h2').allTextContents()).map(t=>t.trim());
 await page.click('#browse');
 {const shown=await heads();for(const w of rareHeads)assert.ok(!shown.includes(w),w+' 不进默认推荐');assert.ok(shown.includes('tepeō'),'非孤例的（罕）词仍在默认列表');}
 for(const value of ['professional-humanities','professional-natural','historical-cultural'])await page.check('[name=expanded][value='+value+']');
 {const shown=await heads();for(const w of rareHeads)assert.ok(!shown.includes(w),w+' 展开全部类别也不出现');assert.ok(shown.includes('tepeō'),'非孤例的（罕）词继续展示');}
 for(let i=0;i<12;i++){await page.click('#random');const shown=await heads();for(const w of rareHeads)assert.ok(!shown.includes(w),w+' 不进随机');}
 for(const [word,gloss] of [['cubitus','卧榻（罕）'],['papa','食物（罕）'],['animatus','呼吸（罕）'],['asservit','协助（罕）']]){
  await page.fill('#query',word);await page.click('#lookup');assert.ok((await page.locator('#results').innerText()).includes(gloss),word+' 手动可查');
 }
 // 交付53（T19-R52-1）：harpa不是孤例，历史文化展开后可见，不带（罕）；默认仍不可见。
 await page.click('#browse');assert.ok(!(await heads()).includes('harpa'),'harpa默认不可见');
 await page.check('[name=expanded][value=historical-cultural]');assert.ok((await heads()).includes('harpa'),'harpa在历史文化展开后可见');
 await page.fill('#query','harpa');await page.click('#lookup');assert.ok(!(await page.locator('#results').innerText()).includes('竖琴（罕）'),'harpa不再标罕');
 await page.fill('#query','alba');await page.click('#lookup');
 {const shown=await heads();assert.ok(shown.indexOf('albus')>=0&&shown.indexOf('albus')<shown.indexOf('alba'),'albus白色的排在alba黎明（罕）之前');}
 await page.click('#browse');
 assert.deepEqual(oldWordRequests,[],'new scope picker must not load legacy whole-language word packs');
 console.log('新范围选词器浏览器检查通过：实际义项、类别、词形、切语言、失败关闭与重试、随机、窄屏，以及缺少 fetch/TextDecoder/crypto 时关闭展示并能恢复。');
}finally{await browser?.close();await new Promise(r=>server.close(r));}
