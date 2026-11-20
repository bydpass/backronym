import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import vm from 'node:vm';
import {sourceSubset} from './t19/source-lookup-fixture.mjs';
import store from '../app/assets/lexicon-store.js';
const context={window:{},console};vm.createContext(context);
vm.runInContext(fs.readFileSync('app/assets/core.js','utf8'),context);
const C=context.window.CORE;
const opts={exact:s=>s.normalize('NFC').toLowerCase(),fold:s=>s.normalize('NFD').replace(/\p{M}/gu,'').toLowerCase(),blocked:()=>false};
const read=async file=>{const bytes=fs.readFileSync(file);return {value:JSON.parse(bytes),sha256:crypto.createHash('sha256').update(bytes).digest('hex')};};
import {DEFAULT_COMPILED as base} from './t19/build-packs.mjs';
let checked=0;
for(const lang of ['en','fr','de','es','it','la']){
 const records=await store.load(base,lang,read);
 const subset=sourceSubset(records,opts.fold);
 for(const record of records){
  const groups=store.queryEntries(subset(record.display),record.display,opts);
  const group=groups.find(g=>g.lemma===record.display&&g.tier===0);
  assert.ok(group,record.sense_id);
  const slot=Object.keys(group.senseIds).find(k=>group.senseIds[k]===record.sense_id);
  assert.ok(slot,record.sense_id+' keeps stable identity');
  const sense=C.senseGroups(group.entry).find(g=>C.senseId(g)===slot);
  assert.equal(sense.senses.join('，'),record.zh,record.display);
  // 「el (la)」（复审 R3-19）：卡面没选时写推荐的 el，la 仍在可选冠词里
  const recommended=/^(.+?) \((.+)\)$/.exec(record.article||'');
  const expected=record.pos==='noun'?(recommended?recommended[1]:record.article||''):'';
  assert.equal(C.articleOf(group.entry,'',slot).text,expected,record.display+' article alignment');
  if(record.pos==='noun'&&recommended)assert.ok(C.articleOf(group.entry,recommended[2],slot).text===recommended[2],record.display+' 括号里的冠词可选');
  checked++;
 }
 if(lang==='fr'){
  const result=store.queryEntries(records,'histoires',opts);
  assert.ok(result.length);assert.ok(result.every(g=>g.tier===1&&g.lemma==='histoire'));
  assert.ok(result.every(g=>g.entry[0]==='histoires'&&g.entry[2]===''));
 }
 if(lang==='de'){
  assert.equal(store.queryEntries(records,'Versprechen',opts)[0].lemma,'Versprechen');
  assert.equal(store.queryEntries(records,'versprechen',opts)[0].lemma,'versprechen');
 }
 if(lang==='en'){
  const result=store.queryEntries(records,'fractures',opts);
  assert.ok(result.some(g=>g.matches.some(m=>m.record.pos==='noun')));
  assert.ok(result.some(g=>g.matches.some(m=>m.record.pos==='verb')));
  assert.deepEqual(store.queryEntries(records,'secret',{...opts,blocked:s=>s==='secret'}),[]);
  assert.equal(store.queryEntries(records,'Antoine',opts).length,1);
  assert.deepEqual(store.queryEntries(records,'Antoin',opts),[]);
 }
}
// Same spelling, distinct noun genders; non-noun groups do not shift articles.
const records=await store.load(base,'fr',read),seed=records[0];
const fixture=[['adj','书面的',''],['noun','书','le'],['noun','磅','la']].map(([pos,zh,article],i)=>({...seed,display:'livre',pos,zh,article,sense_id:'fixture-'+i,category:'daily'}));
const before=JSON.stringify(fixture),result=store.queryEntries(fixture,'livre',opts)[0];
assert.equal(C.articleOf(result.entry,'','adj.').text,'');
assert.equal(C.articleOf(result.entry,'','n.').text,'le');
assert.equal(C.articleOf(result.entry,'','n.#2').text,'la');
assert.equal(JSON.stringify(fixture),before,'does not rewrite source records');
const ambiguous=[{...seed,display:'alpha',sense_id:'a',pos:'noun',article:'le'}, {...seed,display:'beta',sense_id:'b',pos:'verb',article:''}];
Object.defineProperty(ambiguous,'formsBySense',{value:{a:['shared'],b:['shared']}});
const alternatives=store.queryEntries(ambiguous,'shared',opts);
assert.equal(alternatives.length,2,'distinct lemmas remain selectable alternatives');
assert.deepEqual(alternatives.map(g=>g.lemma).sort(),['alpha','beta']);
assert.ok(alternatives.every(g=>g.matches.length===1&&g.entry[2]===''));
assert.equal(store.queryEntries(ambiguous,'shared',{...opts,blocked:s=>s==='alpha'}).length,1);
assert.deepEqual(store.queryEntries(ambiguous,'shared',{...opts,blocked:s=>s==='shared'}),[]);

{ // R3-12 漏音符：completion 模式只补上缺失的音符，输入里已有的音符必须保留；屏蔽、逐义词形排除、防误借、只供精确查询照旧
  const sense=(display,zh,id,evidence={})=>({...seed,display,zh,pos:'noun',article:'',note:'',sense_id:id,category:'daily',evidence:{sense_order:1,...evidence}});
  const lex=[sense('café','咖啡','r-cafe'),sense('sûr','确定','r-sur'),sense('pêche','桃子','r-peche'),sense('péché','罪恶','r-peche2'),sense('rené','人名甲','r-rene',{exact_query:true})];
  const completion={...opts,completion:true},ask=(q,extra={},list=lex)=>store.queryEntries(list,q,{...completion,...extra}).map(g=>g.entry[0]+(g.leak?'*':''));
  assert.deepEqual(ask('cafe'),['café*'],'缺音符补上，候选显示带音符的拼写');
  assert.deepEqual(ask('café'),['café'],'精确命中不标 leak');
  assert.deepEqual(ask('cafè'),[],'输入里已有的音符不能换成别的');
  assert.deepEqual(ask('peche').sort(),['péché*','pêche*'],'两个都缺音符：都留作候选，由用户选');
  assert.deepEqual(ask('pêche'),['pêche'],'输入已带 ê：不再提示 péché');
  assert.deepEqual(ask('péche'),['péché*'],'已有的 é 保留，只补第二个 é');
  assert.deepEqual(ask('cafe',{blocked:s=>s==='café'}),[],'屏蔽器照旧：候选拼写被拦');
  assert.deepEqual(ask('cafe',{blocked:s=>s==='咖啡'}),[],'屏蔽器照旧：释义被拦');
  assert.deepEqual(ask('rene'),[],'只供精确查询的词不进漏音符候选');
  assert.deepEqual(ask('rené'),['rené'],'只供精确查询的词精确输入仍可查');
  const guarded=lex.slice();Object.defineProperty(guarded,'guards',{value:{sur:true}});
  assert.deepEqual(ask('sur'),['sûr*'],'没有防误借标记时补音符是合格候选');
  assert.deepEqual(ask('sur',{},guarded),[],'sur 是已知独立词：不借 sûr，也不进候选');
  assert.deepEqual(ask('cafe',{},[sense('café','咖啡','r-cafe2',{form_homographs:{excluded:['cafe']}})]),[],'逐义排除的拼写不借道补音符');
  assert.deepEqual(store.queryEntries(lex,'cafe',opts).map(g=>g.entry[0]),['café'],'不带 completion 的旧调用方不变');
  // 词形：词形里缺的音符同样补；每个带音符的写法各成一个候选，写法本身进入显示
  const verb={...sense('pêcher','捕鱼','r-pecher'),pos:'verb'};  const formed=[verb];Object.defineProperty(formed,'formsBySense',{value:{'r-pecher':['pêche','pêché','pêchons']}});
  assert.deepEqual(ask('peche',{},formed).sort(),['pêche*','pêché*'],'词形各成候选');
  assert.deepEqual(ask('pêchons',{},formed),['pêchons'],'精确词形不受影响');
  assert.deepEqual(store.queryEntries(formed,'peche',completion).map(g=>g.tier),[3,3]);
}
assert.throws(()=>store.queryEntries(fixture,'livre',{...opts,blocked:null}),/blocker required/);
assert.deepEqual(store.queryEntries(fixture,'',opts),[]);
console.log(checked+'条真实义项通过编辑器释义/冠词/稳定身份转换；歧义、词形和屏蔽隔离通过。');
