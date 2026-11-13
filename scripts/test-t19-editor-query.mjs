import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import vm from 'node:vm';
import store from '../app/assets/lexicon-store.js';
const context={window:{},console};vm.createContext(context);
vm.runInContext(fs.readFileSync('app/assets/core.js','utf8'),context);
const C=context.window.CORE;
const opts={exact:s=>s.normalize('NFC').toLowerCase(),fold:s=>s.normalize('NFD').replace(/\p{M}/gu,'').toLowerCase(),blocked:()=>false};
const read=async file=>{const bytes=fs.readFileSync(file);return {value:JSON.parse(bytes),sha256:crypto.createHash('sha256').update(bytes).digest('hex')};};
const base='review/t19-batches/t19-batch63-20261112/compiled';
let checked=0;
for(const lang of ['en','fr','de','es','it','la']){
 const records=await store.load(base,lang,read);
 for(const record of records){
  const groups=store.queryEntries(records,record.display,opts);
  const group=groups.find(g=>g.lemma===record.display&&g.tier===0);
  assert.ok(group,record.sense_id);
  const slot=Object.keys(group.senseIds).find(k=>group.senseIds[k]===record.sense_id);
  assert.ok(slot,record.sense_id+' keeps stable identity');
  const sense=C.senseGroups(group.entry).find(g=>C.senseId(g)===slot);
  assert.equal(sense.senses.join('，'),record.zh,record.display);
  const expected=record.pos==='noun'?(record.article||''):'';
  assert.equal(C.articleOf(group.entry,'',slot).text,expected,record.display+' article alignment');
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

assert.throws(()=>store.queryEntries(fixture,'livre',{...opts,blocked:null}),/blocker required/);
assert.deepEqual(store.queryEntries(fixture,'',opts),[]);
console.log(checked+'条真实义项通过编辑器释义/冠词/稳定身份转换；歧义、词形和屏蔽隔离通过。');
