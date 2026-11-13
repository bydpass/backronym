// T19 正式词包：从已复审的编译包生成 app/assets/lang/<语种>/words.js（英语另含 phrases.js）。
//   node scripts/t19/build-packs.mjs [编译包目录] [输出的 lang 目录]
// 每个词包两部分：
//   words   旧四列格式 [显示词, 释义组, 冠词, 说明]，按首字母分组；只含可默认推荐的义项（日用、创作，且未标只供查询）。候选与随机用它。
//   more    同样的四列词条再加第五列类别标注（专业 / 历史文化）：默认不进候选、用户在候选栏打开开关后才出的词；显示词已在 words 里的不重复收。
//   lexicon 全部准入义项的精简记录、每义项的词形、防误借清单、人名专表的性别与来源语言。手动查词用它（app-model.js 经 LEXICON_STORE 查）。
// 排序：同一首字母内先按类别权重，再按旧语料词频快照（pack-ranks.json），最后按显示词。
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
const require=createRequire(import.meta.url);
const store=require('../../app/assets/lexicon-store.js'),policy=require('../../app/assets/lexicon-policy.js');
export const DEFAULT_COMPILED='review/t19-batches/t19-batch63-20261112/compiled';
const EXPAND=['professional-humanities','professional-natural','historical-cultural'],TAG={'professional-humanities':'专业','professional-natural':'专业','historical-cultural':'历史文化'};
const LANGS=['en','fr','de','es','it','la'],NAMES={en:'English',fr:'French',de:'German',es:'Spanish',it:'Italian',la:'Latin'};
const fold=s=>String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/ß/g,'ss').replace(/œ/g,'oe').replace(/æ/g,'ae');
const exact=s=>String(s).normalize('NFC').toLowerCase();
const read=async file=>{const bytes=fs.readFileSync(file);return {value:JSON.parse(bytes),sha256:crypto.createHash('sha256').update(bytes).digest('hex')};};
// 文件头：这门语言的数据来源与许可（与借物页一致；许可逐个对过本地缓存里的原文，2026-11-12）。
const KAIKKI=l=>`- 维基词典（经 kaikki.org 抽取），CC BY-SA 4.0 / GFDL：kaikki.org/dictionary/${NAMES[l]}/ —— 词头、词性、变格变位与英文释义的依据`;
const HYPH={fr:'Daniel Flipo、Bernard Gaulle、Arthur Reutenauer',de:'Deutschsprachige Trennmustermannschaft',es:'Javier Bezos、CervanTeX',it:'Claudio Beccari',la:'Claudio Beccari'};
const SOURCES={
 en:['- ECDICT，MIT，© 2025 Linwei：github.com/skywind3000/ECDICT —— 选词、词形与释义的依据'],
 fr:['- FrequencyWords（选词用的词频），数据 CC BY-SA 4.0，Hermit Dave：github.com/hermitdave/FrequencyWords','- CFDICT（早期选词与释义的参考），CC BY-SA（来源页未写版本号）：chine.in'],
 de:['- FrequencyWords（选词用的词频），数据 CC BY-SA 4.0，Hermit Dave：github.com/hermitdave/FrequencyWords','- HanDeDict（早期选词与释义的参考），CC BY-SA 3.0，Gábor L Ugray 与原始团队：handedict.zydeo.net'],
 es:['- FrequencyWords（选词用的词频），数据 CC BY-SA 4.0，Hermit Dave：github.com/hermitdave/FrequencyWords'],
 it:['- FrequencyWords（选词用的词频），数据 CC BY-SA 4.0，Hermit Dave：github.com/hermitdave/FrequencyWords'],
 la:['- Dickinson College Commentaries 拉丁语核心词表（选词用的频序），CC BY-SA（来源页未写版本号）：dcc.dickinson.edu','- Whitaker\'s Words（早期选词的参考），William A. Whitaker，作者声明可自由用于任何用途：github.com/mk270/whitakers-words'],
};
function header(file,lang,source){
 const lines=(lang==='en'?[]:[KAIKKI(lang)]).concat(SOURCES[lang]);
 if(HYPH[lang])lines.push(`- 断词点：TeX hyph-utf8 的 hyph-${lang==='de'?'de-1996':lang} 连字符模式，MIT，© ${HYPH[lang]}：github.com/hyphenation/tex-hyphen`);
 return `/* 词库由 scripts/t19/build-packs.mjs 从 ${source} 生成（T19 新范围），勿手改。语种：${NAMES[lang]}\n数据来源与许可（与借物页一致；来源地址为纯文本）：\n${lines.join('\n')}\n改编说明：据上述数据选词、合并词形、去掉不属于本词的词形；中文释义、冠词与用法说明逐条核写${lang==='en'?'':'（核对时查阅过别的词典，未收录其文字）'}。改编部分随来源许可。\n*/\n`;
}
function oldPack(file){const w={LANGPACK:{put(l,p,v){this[p]=v;}}};new Function('window',fs.readFileSync(file,'utf8'))(w);return {hyph:w.HYPH||w.LANGPACK.hyph||{}};}
export async function buildPack(compiled,lang,ranks){
 const records=await store.load(compiled,lang,read),opts={exact,fold,blocked:()=>false};
 const weight=r=>policy.CATEGORIES[r.category].weight||0,rank=d=>ranks[d]||0;
 // 可默认推荐的义项 → 旧四列词条（同一显示词合成一条，义项与冠词对齐由 queryEntries 负责）
 const pool=records.filter(r=>policy.eligible(r,{mode:'default'}));
 Object.defineProperty(pool,'formsBySense',{value:records.formsBySense});
 const rows=new Map();
 for(const r of pool){
  if(rows.has(r.display))continue;
  const group=store.queryEntries(pool,r.display,opts).find(g=>g.lemma===r.display&&g.tier===0);assert.ok(group,r.display);
  rows.set(r.display,{entry:group.entry,weight:Math.max(...group.matches.map(m=>weight(m.record))),rank:rank(r.display)});
 }
 const words={};
 for(const [display,row] of rows){const c=fold(display).charAt(0);assert.ok(/[a-z]/.test(c),display);(words[c]||(words[c]=[])).push(row);}
 for(const c of Object.keys(words))words[c]=words[c].sort((a,b)=>b.weight-a.weight||b.rank-a.rank||a.entry[0].localeCompare(b.entry[0])).map(x=>x.entry);
 const sorted=Object.fromEntries(Object.keys(words).sort().map(c=>[c,words[c]]));
 // 主动展开才出的词：专业（人文、自然）与历史文化。只供查询的孤例、人名、数词不在其中（policy.eligible 已排除）。
 const extraPool=records.filter(r=>!rows.has(r.display)&&policy.eligible(r,{mode:'expanded',expanded:EXPAND}));
 Object.defineProperty(extraPool,'formsBySense',{value:records.formsBySense});
 const extra=new Map();
 for(const r of extraPool){
  if(extra.has(r.display))continue;
  const group=store.queryEntries(extraPool,r.display,opts).find(g=>g.lemma===r.display&&g.tier===0);assert.ok(group,r.display);
  const top=group.matches.map(m=>m.record).sort((a,b)=>weight(b)-weight(a))[0];
  extra.set(r.display,{entry:group.entry.concat(TAG[top.category]),weight:weight(top),rank:rank(r.display)});
 }
 const more={};
 for(const [display,row] of extra){const c=fold(display).charAt(0);assert.ok(/[a-z]/.test(c),display);(more[c]||(more[c]=[])).push(row);}
 for(const c of Object.keys(more))more[c]=more[c].sort((a,b)=>b.weight-a.weight||b.rank-a.rank||a.entry[0].localeCompare(b.entry[0])).map(x=>x.entry);
 const sortedMore=Object.fromEntries(Object.keys(more).sort().map(c=>[c,more[c]]));
 // 全部准入义项：[义项ID, 显示词, 词性, 中文, 冠词, 说明, 类别, 词形, 只供查询, 已排除的同形词形]
 const senses=records.map(r=>{
  const forms=records.formsBySense[r.sense_id]||[],excluded=r.evidence.form_homographs?r.evidence.form_homographs.excluded:[];
  for(const f of forms.concat(excluded))assert.ok(f&&!/\s/.test(f),r.display+' 词形含空白');
  return [r.sense_id,r.display,r.pos,r.zh,r.article||'',r.note||'',r.category,forms.join(' '),policy.queryOnly(r)?1:0,excluded.join(' ')];
 }).sort((a,b)=>a[0]<b[0]?-1:1);
 // 人名专表 [原拼写, 中文译名, m/f, 来源语言]：前两列就是显示词与中文，只另存后两列。来源语言是名字本身的语种，不是词包的语种。
 const names=records.filter(r=>r.category==='names').map(r=>{
  const p=r.name_payload;assert.ok(Array.isArray(p)&&p.length===4&&p[0]===r.display&&p[1]===r.zh,r.display+' 人名负载');
  return [r.sense_id,p[2],p[3]];
 }).sort((a,b)=>a[0]<b[0]?-1:1);
 return {words:sorted,more:sortedMore,lexicon:{v:1,senses,names,guards:Object.keys(records.guards||{}).sort()},count:{words:rows.size,more:extra.size,senses:senses.length}};
}
export async function buildAll(compiled=DEFAULT_COMPILED,out='app/assets/lang'){
 const ranks=JSON.parse(fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)),'pack-ranks.json'),'utf8')),source=path.relative('.',compiled),report={};
 for(const lang of LANGS){
  const file=path.join(out,lang,'words.js'),pack=await buildPack(compiled,lang,ranks[lang]||{}),old=oldPack(file);
  const shown=new Set(pack.lexicon.senses.map(s=>s[1].toLowerCase())),hyph=Object.fromEntries(Object.entries(old.hyph).filter(([w])=>shown.has(w.toLowerCase())).sort());
  const J=JSON.stringify,L=J(lang);
  const body=lang==='en'
   ?`window.WORDS=${J(pack.words)};\nwindow.WORDS_MORE=${J(pack.more)};\nwindow.HYPH=${J(hyph)};\nwindow.LEXICON_EN=${J(pack.lexicon)};\n`
   :`window.LANGPACK.put(${L},"words",${J(pack.words)});\nwindow.LANGPACK.put(${L},"more",${J(pack.more)});\nwindow.LANGPACK.put(${L},"lexicon",${J(pack.lexicon)});\nwindow.LANGPACK.put(${L},"hyph",${J(hyph)});\n`;
  fs.writeFileSync(file,header(file,lang,source)+body);
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
