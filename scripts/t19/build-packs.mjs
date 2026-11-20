// T19 正式词包：从已复审的编译包生成 app/assets/lang/<语种>/{words,inflections}.js（英语另含 phrases.js）。
//   node scripts/t19/build-packs.mjs [编译包目录] [输出的 lang 目录]
// 每个词包两部分：
//   words   旧四列格式 [显示词, 释义组, 冠词, 说明]，按首字母分组；只含可默认推荐的义项（日用、创作，且未标只供查询）。候选与随机用它。
//   more    同样的四列词条再加第五列类别标注（专业 / 历史文化）：默认不进候选、用户在候选栏打开开关后才出的词；显示词已在 words 里的不重复收。
//   lexicon 全部准入义项、中文反查、防误借与人名元数据；词形和名词性数另存 inflections.js。手动查词用它（app-model.js 经 LEXICON_STORE 查）。
// 排序：同一首字母内先按类别权重，再按混合频率，旧语料快照仅作回退，最后按显示词。
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
const require=createRequire(import.meta.url);
const store=require('../../app/assets/lexicon-store.js'),policy=require('../../app/assets/lexicon-policy.js');
export const DEFAULT_COMPILED='review/t19-batches/rebuild-20261119/compiled';
const EXPAND=['professional-humanities','professional-natural','historical-cultural'],TAG={'professional-humanities':'专业','professional-natural':'专业','historical-cultural':'历史文化'};
const LANGS=['en','fr','de','es','it','la'],NAMES={en:'English',fr:'French',de:'German',es:'Spanish',it:'Italian',la:'Latin'};
const fold=s=>String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/ß/g,'ss').replace(/œ/g,'oe').replace(/æ/g,'ae');
const exact=s=>String(s).normalize('NFC').toLowerCase();
const read=async file=>{const bytes=fs.readFileSync(file);return {value:JSON.parse(bytes),sha256:crypto.createHash('sha256').update(bytes).digest('hex')};};
// 文件头：这门语言的数据来源与许可（与借物页一致；许可逐个对过本地缓存里的原文，2026-11-12）。
const KAIKKI=l=>`- 维基词典（经 kaikki.org 抽取），CC BY-SA 4.0（来源是双许可，这里按 CC BY-SA 4.0 使用）：kaikki.org/dictionary/${NAMES[l]}/ —— 词头、词性、变格变位与英文释义的依据`;
const FREQ='- FrequencyWords（选词用的词频，仅用于筛选，未随包分发其内容），数据 CC BY-SA 4.0，Hermit Dave：github.com/hermitdave/FrequencyWords';
const MIXED_SOURCES='- Universal Dependencies PUD r2.16 百科选句（CC BY-SA 3.0，universaldependencies.org）：仅用于原形频次统计；具体树库见 corpora.json';
// 第三次重建（2026-11-19）选词来源：法语 Lexique，西意德英用 ParlaMint 的原形与词性占比
const LEXIQUE='- Lexique 4.10（法语按原形与词性分开的字幕频次，仅用于筛选，未随包分发其内容），CC BY-SA 4.0，Boris New、Christophe Pallier 等：www.lexique.org';
const PARLAMINT=part=>`- ParlaMint 4.1 带标注议会语料 ${part} 分库（把词频按原形与词性拆分，仅用于筛选，未随包分发其内容），CC BY 4.0，Tomaž Erjavec 等 ParlaMint 项目，CLARIN.SI：hdl.handle.net/11356/1911`;
const NAMES_SRC='- ECDICT（人名的中文译写），MIT，© 2025 Linwei：github.com/skywind3000/ECDICT';
const HYPH={fr:'Daniel Flipo、Bernard Gaulle、Arthur Reutenauer',de:'2013-2024 Stephan Hennig, Werner Lemberg, Günter Milde, Sander van Geloven, Georg Pfeiffer, Gisbert W. Selke, Tobias Wendorf, Keno Wehr（作者署名：Deutschsprachige Trennmustermannschaft）',es:'Javier Bezos、CervanTeX',it:'Claudio Beccari',la:'Claudio Beccari'};
const SOURCES={
 en:['- 断词点：hyph-en-us（TeX hyph-utf8），© 1990, 2004, 2005 Gerard D.C. Kuiken，github.com/hyphenation/tex-hyphen。Copying and distribution of this file, with or without modification, are permitted in any medium without royalty provided the copyright notice and this notice are preserved.', '- ECDICT，MIT，© 2025 Linwei：github.com/skywind3000/ECDICT —— 选词、词形与释义的依据',PARLAMINT('GB（英国）')],
 fr:[NAMES_SRC,FREQ,LEXIQUE,'- CFDICT（早期选词与释义的参考），CC BY-SA 3.0，David Houstin 创办、Chine Informations：chine.in'],
 de:[NAMES_SRC,FREQ,PARLAMINT('AT（奥地利）'),'- HanDeDict（早期选词与释义的参考），CC BY-SA 3.0，Gábor L Ugray 与原始团队：handedict.zydeo.net'],
 es:[NAMES_SRC,FREQ,PARLAMINT('ES')],
 it:[NAMES_SRC,FREQ,PARLAMINT('IT')],
 la:['- Dickinson College Commentaries 拉丁语核心词表（选词用的频序，仅用于筛选），CC BY-SA 3.0 Unported，Dickinson College（Christopher Francese 主持）：dcc.dickinson.edu','- Whitaker\'s Words（早期选词的参考，仅用于筛选，未随包分发其内容），William A. Whitaker，作者的许可原句「Permission is hereby freely given for any and all use of program and data. You can sell it as your own, but at least tell me.」：github.com/mk270/whitakers-words'],
};
function header(file,lang,source){
 const lines=(lang==='en'?[]:[KAIKKI(lang)]).concat(SOURCES[lang]);
 if (['fr','de','es','it'].includes(lang) && source.includes('rebuild')) lines.push(MIXED_SOURCES);
 if(HYPH[lang])lines.push(`- 断词点：TeX hyph-utf8 的 hyph-${lang==='de'?'de-1996':lang} 连字符模式，MIT${lang==='it'?'（来源是 MIT 或 LPPL 1.3 及更高版本双许可，这里取 MIT）':lang==='la'?'（来源是 MIT 或 LPPL 1 及更高版本双许可，这里取 MIT）':''}，© ${HYPH[lang]}：github.com/hyphenation/tex-hyphen`);
 return `/* 词库由 scripts/t19/build-packs.mjs 从 ${source} 生成（T19 新范围），勿手改。语种：${NAMES[lang]}\n数据来源与许可（与借物页一致；来源地址为纯文本）：\n${lines.join('\n')}\n改编说明：已改编——据上述数据选词、合并词形、去掉不属于本词的词形${lang==='en'?'；中文释义与用法说明逐条核写':'，翻译为中文并人工审核；中文释义、冠词与用法说明逐条核写'}${lang==='en'?'。本文件随来源按 MIT 许可':'（核对时查阅过别的词典，未收录其文字）。改编后的本文件整体按 CC BY-SA 4.0 发布，许可原文：creativecommons.org/licenses/by-sa/4.0/legalcode'}。\n*/\n`;
}
// 候选行只包含同写法的原形义项。提前分组，避免逐词扫描所有词形。
function byDisplay(records) {
 const groups = new Map();
 for (const record of records) {
  if (!groups.has(record.display)) groups.set(record.display, []);
  groups.get(record.display).push(record);
 }
 return groups;
}
export async function buildPack(compiled,lang,ranks){
 const records=await store.load(compiled,lang,read),opts={exact,fold,blocked:()=>false};
 const weight=r=>policy.weightOf(r),rank=d=>ranks[d]||0;
 // 可默认推荐的义项 → 旧四列词条（同一显示词合成一条，义项与冠词对齐由 queryEntries 负责）
 const pool=records.filter(r=>policy.eligible(r,{mode:'default'}));
 const rows=new Map();
 for(const [display,senses] of byDisplay(pool)){
  const [group]=store.queryEntries(senses,display,opts);
  rows.set(display,{entry:group.entry,weight:Math.max(...group.matches.map(m=>weight(m.record))),frequencyRank:Math.min(...senses.map(r=>r.evidence.frequency_rank||Infinity)),rank:rank(display)});
 }
 const words={};
 for(const [display,row] of rows){const c=fold(display).charAt(0);assert.ok(/[a-z]/.test(c),display);(words[c]||(words[c]=[])).push(row);}
 for(const c of Object.keys(words))words[c]=words[c].sort((a,b)=>b.weight-a.weight||a.frequencyRank-b.frequencyRank||b.rank-a.rank||a.entry[0].localeCompare(b.entry[0])).map(x=>x.entry);
 const sorted=Object.fromEntries(Object.keys(words).sort().map(c=>[c,words[c]]));
 // 主动展开才出的词：专业（人文、自然）与历史文化。只供查询的孤例、人名、数词不在其中（policy.eligible 已排除）。
 const extraPool=records.filter(r=>!rows.has(r.display)&&policy.eligible(r,{mode:'expanded',expanded:EXPAND}));
 const extra=new Map();
 for(const [display,senses] of byDisplay(extraPool)){
  const [group]=store.queryEntries(senses,display,opts);
  const top=group.matches.map(m=>m.record).sort((a,b)=>weight(b)-weight(a))[0];
  extra.set(display,{entry:group.entry.concat(TAG[top.category]),weight:weight(top),frequencyRank:Math.min(...senses.map(r=>r.evidence.frequency_rank||Infinity)),rank:rank(display)});
 }
 const more={};
 for(const [display,row] of extra){const c=fold(display).charAt(0);assert.ok(/[a-z]/.test(c),display);(more[c]||(more[c]=[])).push(row);}
 for(const c of Object.keys(more))more[c]=more[c].sort((a,b)=>b.weight-a.weight||a.frequencyRank-b.frequencyRank||b.rank-a.rank||a.entry[0].localeCompare(b.entry[0])).map(x=>x.entry);
 const sortedMore=Object.fromEntries(Object.keys(more).sort().map(c=>[c,more[c]]));
 // 全部准入义项：[义项ID, 显示词, 词性, 中文, 冠词, 说明, 类别, 词形, 标记（0 普通 / 1 只供查询 / 2 降权）, 已排除的同形词形]
 // 同一显示词的义项按 evidence.sense_order 排（2026-11-19 返工）：词包不另加列，运行时 fromPack 用行号还原先后
 const byOrder=new Map(records.map(r=>[r.sense_id,r.evidence.sense_order||0]));
 const senses=records.map(r=>{
  const forms=records.formsBySense[r.sense_id]||[],excluded=r.evidence.form_homographs?r.evidence.form_homographs.excluded:[];
  for(const f of forms.concat(excluded))assert.ok(f&&!/\s/.test(f),r.display+' 词形含空白');
  assert.ok(!(policy.queryOnly(r)&&policy.demoted(r)),r.display+' 只供查询与降权不能同时标（第 9 列只记一种）');
  return [r.sense_id,r.display,r.pos,r.zh,r.article||'',r.note||'',r.category,forms.join(' '),r.evidence.exact_query?3:policy.queryOnly(r)?1:policy.demoted(r)?2:0,excluded.join(' ')];
 }).sort((a,b)=>a[1]<b[1]?-1:a[1]>b[1]?1:(byOrder.get(a[0])-byOrder.get(b[0]))||(a[0]<b[0]?-1:1));
 // 人名专表 [原拼写, 中文译名, m/f, 来源语言]：前两列就是显示词与中文，只另存后两列。来源语言是名字本身的语种，不是词包的语种。
 const names=records.filter(r=>r.category==='names').map(r=>{
  const p=r.name_payload;assert.ok(Array.isArray(p)&&p.length===4&&p[0]===r.display&&p[1]===r.zh,r.display+' 人名负载');
  return [r.sense_id,p[2],p[3]];
 }).sort((a,b)=>a[0]<b[0]?-1:1);
 // 词形按义项 ID 分开存；在原形包里只留判定是否要加载它的小型过滤表。
 const aliases=JSON.parse(fs.readFileSync(new URL('../../review/lexicon-rebuild-20261118/zh-aliases.json',import.meta.url),'utf8'));
 const reverse=Object.create(null), entries=[], formKeys=new Set(),byId=new Map(records.map(r=>[r.sense_id,r]));
 for(const [i,row] of senses.entries()){
  const [id,display,,zh]=row;
  const key=aliases[zh]||zh;
  (reverse[key]||(reverse[key]=[])).push(i);
  const source=byId.get(id),list=row[7],morphology=source.evidence.noun_forms;
  if(list){
   const allowed=new Set(list.split(' '));
   const details=morphology&&Object.fromEntries(Object.entries(morphology).filter(([form])=>allowed.has(form)));
   entries.push(details&&Object.keys(details).length?[id,list,details]:[id,list]);
   for(const form of list.split(' '))if(exact(form)!==exact(display))formKeys.add(fold(form.replace(/[’ʼ‘`´]/g,"'")));
  }
  row[7]=source.evidence.frequency_rank||0;
 }
 const formGate=store.buildFormGate(formKeys);
 // 义项阴阳性（11-19，候选栏与义项栏的词性缩写用）：与 senses 逐行对齐的字符串，m 阳 / f 阴 / b 两性同形 / - 不标。只有法西意带
 const G={m:'m',f:'f',mf:'b'},genders=['fr','es','it'].includes(lang)?senses.map(row=>G[byId.get(row[0]).evidence.gender?.g]||'-').join(''):undefined;
 return {words:sorted,more:sortedMore,inflections:{v:1,entries},lexicon:Object.assign({v:2,senses,names,guards:Object.keys(records.guards||{}).sort(),formGate,reverse,aliases},genders?{genders}:{}),count:{words:rows.size,more:extra.size,senses:senses.length}};
}
export async function buildAll(compiled=DEFAULT_COMPILED,out='app/assets/lang'){
 const batchPoints=path.join(path.dirname(compiled),'pack-hyphenation.json');
 const points=JSON.parse(fs.readFileSync(fs.existsSync(batchPoints)?batchPoints:new URL('./pack-hyphenation.json',import.meta.url),'utf8'));
 const customRanks=path.join(path.dirname(compiled),'pack-ranks.json');
 const ranks=JSON.parse(fs.readFileSync(fs.existsSync(customRanks)?customRanks:path.join(path.dirname(fileURLToPath(import.meta.url)),'pack-ranks.json'),'utf8')),source=path.relative('.',compiled),report={};
 for(const lang of LANGS){
  const file=path.join(out,lang,'words.js'),pack=await buildPack(compiled,lang,ranks[lang]||{});
  fs.mkdirSync(path.dirname(file),{recursive:true});
  const shown=new Set(pack.lexicon.senses.map(s=>s[1].toLowerCase())),hyph=Object.fromEntries(Object.entries(points[lang]).filter(([w])=>shown.has(w.toLowerCase())).sort());
  const J=JSON.stringify,L=J(lang);
  const body=lang==='en'
   ?`window.WORDS=${J(pack.words)};\nwindow.WORDS_MORE=${J(pack.more)};\nwindow.HYPH=${J(hyph)};\nwindow.LEXICON_EN=${J(pack.lexicon)};\n`
   :`window.LANGPACK.put(${L},"words",${J(pack.words)});\nwindow.LANGPACK.put(${L},"more",${J(pack.more)});\nwindow.LANGPACK.put(${L},"lexicon",${J(pack.lexicon)});\nwindow.LANGPACK.put(${L},"hyph",${J(hyph)});\n`;
  fs.writeFileSync(file,header(file,lang,source)+body);
  const formFile=path.join(out,lang,'inflections.js');
  fs.writeFileSync(formFile,header(formFile,lang,source)+`window.LANGPACK.put(${L},\"inflections\",${J(pack.inflections)});\n`);
  report[lang]={...pack.count,guards:pack.lexicon.guards.length,hyph:Object.keys(hyph).length,bytes:fs.statSync(file).size};
 }
 // 旧的英语短语补充表不在新范围内；词组已作为普通义项收在 lexicon 里。保留空表以维持加载约定。
 const phrases=path.join(out,'en','phrases.js');
 fs.writeFileSync(phrases,`/* 由 scripts/t19/build-packs.mjs 生成，勿手改。T19 新范围不再使用旧短语补充表；词组作为普通义项收在 words.js 的 lexicon 里。 */\nwindow.PHRASES={};\n`);
 return report;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const report=await buildAll(process.argv[2]||DEFAULT_COMPILED,process.argv[3]||'app/assets/lang');
 for(const [lang,r] of Object.entries(report))console.log(`${lang} 推荐词条${r.words} 展开词条${r.more} 义项${r.senses} 防误借${r.guards} 断词${r.hyph} ${(r.bytes/1024).toFixed(0)}KB`);
}
