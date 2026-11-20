import fs from 'node:fs';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import store from '../app/assets/lexicon-store.js';
// 对着正式词包的编译源跑（11-19 起由第三次重建生成）。人名来源两类：交付 11 的 kaikki 词条，以及设备批次（11-17）按 behindthename 补的昵称与他语形式。
const base='review/t19-batches/rebuild-20261119/compiled';
const read=async p=>{const bytes=fs.readFileSync(p);return {value:JSON.parse(bytes),sha256:crypto.createHash('sha256').update(bytes).digest('hex')};};
const opt={exact:s=>s.normalize('NFC').toLowerCase(),fold:s=>s.normalize('NFD').replace(/\p{M}/gu,'').toLowerCase(),blocked:()=>false};
let total=0;
for(const lang of ['en','fr','de','es','it','la']){
 const all=await store.load(base,lang,read),names=all.filter(r=>r.category==='names');
 assert.equal(names.length,{en:9,fr:2,de:3,es:3,it:4,la:0}[lang]);
 for(const mode of ['default','expanded'])assert.equal(store.select(all,{...opt,mode,expanded:['names','professional-natural','professional-humanities','historical-cultural']}).some(m=>m.record.category==='names'),false);
 for(const r of names){
  const result=store.select(all,{...opt,mode:'query',query:r.display}).find(m=>m.record.sense_id===r.sense_id);assert.ok(result);assert.equal(result.tier,0);
  assert.deepEqual(r.name_payload.slice(0,2),[r.display,r.zh]);assert.ok(['m','f'].includes(r.name_payload[2]));assert.equal(r.name_payload[3],r.evidence.name_origin.language);
  assert.equal(store.select(names,{...opt,mode:'query',query:r.display.slice(0,-1)}).some(m=>m.record.sense_id===r.sense_id),false);
  const origin=r.evidence.name_origin;
  if(r.evidence.source_records?.length)assert.ok(r.evidence.source_records[0].record.senses[origin.sense_index].glosses.join(' ').includes('given name'),lang+'/'+r.display);
  else{assert.ok(origin.evidence&&/^https:\/\//.test(origin.url||''),lang+'/'+r.display+' 无词典记录时须有来源说明与网址');}
  total++;
 }
}
const en=await store.load(base,'en',read),antoine=store.select(en,{...opt,mode:'query',query:'Antoine'})[0].record;
assert.deepEqual(antoine.name_payload,['Antoine','安托万','m','fr']);
const index=(await read(base+'/index.json')).value;
for(const b of index.bundles.filter(b=>b.category==='names'))for(const r of (await read(base+'/'+b.path)).value.records)assert.deepEqual(r.row,r.metadata.name_payload,'name four columns must not use ordinary POS/article meanings');
console.log(`Verified ${total} real query records: payload, source-language provenance, exact lookup, no candidate leakage, no surname/person conflation in selected senses.`);
