// Apply explicit per-sense decisions to a fresh working copy. Never edits source shards.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { appendProposals } from './append.mjs';
import { readShards } from './compile.mjs';
import { LANGS, decode, encode, validate, admission } from './schema.mjs';
import { fingerprint } from '../lexicon/baseline.mjs';
export const recordHash = record => crypto.createHash('sha256').update(JSON.stringify(record)).digest('hex');
export async function applyReviews(source, decisions, output) {
  const records=await readShards(source),byId=new Map(records.map(r=>[r.sense_id,r])),patches=new Map();
  for(const d of decisions){
    assert.ok(!patches.has(d.sense_id),'duplicate decision');
    const old=byId.get(d.sense_id);assert.ok(old,'unknown sense');
    assert.equal(recordHash(old),d.expected_sha256,'stale decision');
    assert.ok(d.review?.reviewer && d.review?.evidence && d.review?.reason,'explicit review evidence required');
    assert.ok(Object.keys(d).every(k=>['sense_id','expected_sha256','review','latin_use','adverb_relation'].includes(k)),'unsupported decision field');
    const next={...old,review:{...old.review,...d.review}};
    for(const field of ['latin_use','adverb_relation'])if(d[field])next[field]={...old[field],...d[field]};
    validate(next);if(next.review.state==='approved')assert.equal(admission(next),null,'approved decision fails scope');
    patches.set(d.sense_id,next);
  }
  // Copies all old shards and author metadata; no additions or reshuffling.
  await appendProposals(source,[],output);
  const copied = new Map((await readShards(output)).map(r=>[r.sense_id,r]));
  for (const d of decisions) assert.equal(recordHash(copied.get(d.sense_id)), d.expected_sha256, 'source changed during review copy');
  for(const lang of LANGS){
    const indexFile=path.join(output,lang,'index.json'),index=JSON.parse(fs.readFileSync(indexFile,'utf8'));
    for(const shard of index.shards){
      const file=path.join(output,lang,shard.path),parsed=decode(fs.readFileSync(file,'utf8'));
      if(!parsed.records.some(r=>patches.has(r.sense_id)))continue;
      fs.writeFileSync(file,encode(parsed.records.map(r=>patches.get(r.sense_id)||r),parsed.columns));
      shard.sha256=(await fingerprint(file)).sha256;
    }
    fs.writeFileSync(indexFile,JSON.stringify(index,null,2)+'\n');
  }
  await readShards(output);return {decisions:decisions.length,records:records.length};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  assert.equal(process.argv.length,5,'Usage: review.mjs <source-lexicon> <decisions.json> <new-lexicon>');
  console.log(JSON.stringify(await applyReviews(process.argv[2],JSON.parse(fs.readFileSync(process.argv[3],'utf8')),process.argv[4])));
}
