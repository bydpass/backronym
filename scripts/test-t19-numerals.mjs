import fs from 'node:fs';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import store from '../app/assets/lexicon-store.js';
const root='review/t19-batches/t19-batch10-20261111/compiled';
const read=async file=>{const bytes=fs.readFileSync(file);return {value:JSON.parse(bytes),sha256:crypto.createHash('sha256').update(bytes).digest('hex')};};
const options={exact:s=>s.normalize('NFC').toLowerCase(),fold:s=>s.normalize('NFD').replace(/\p{M}/gu,'').toLowerCase(),blocked:()=>false};
let count=0;
for(const lang of ['en','fr','de','es','it']){
 const all=await store.load(root,lang,read),nums=all.filter(r=>r.category==='numerals');assert.equal(nums.length,11);
 assert.deepEqual(nums.map(r=>Number(r.numeral_value)).sort((a,b)=>a-b),Array.from({length:11},(_,i)=>i));
 for(const mode of ['default','expanded'])assert.equal(store.select(all,{...options,mode,expanded:['professional-humanities','professional-natural','historical-cultural','numerals']}).some(m=>m.record.category==='numerals'),false,lang+' candidate leak');
 for(const r of nums){
  const hit=store.select(all,{...options,mode:'query',query:r.display}).find(m=>m.record.sense_id===r.sense_id);
  assert.ok(hit,lang+'/'+r.display);assert.equal(hit.tier,0);assert.equal(hit.record.zh,['零','一','二','三','四','五','六','七','八','九','十'][Number(r.numeral_value)]);
  assert.equal(store.select(nums,{...options,mode:'query',query:r.display+'x'}).length,0);
  const folded=options.fold(r.display);if(folded!==options.exact(r.display))assert.equal(store.select(nums,{...options,mode:'query',query:folded}).length,0,'query-only requires exact accented spelling');
  count++;
 }
}
console.log(`Verified ${count} real cardinal senses: exact query succeeds, candidate/expanded scopes exclude all, nonexact inputs fail, values and metadata retained.`);
