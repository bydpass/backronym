// Verify every changed and unchanged record against an explicit per-sense decision ledger.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {readShards,compileRecords} from './compile.mjs';
import {recordHash} from './review.mjs';
assert.equal(process.argv.length,5,'Usage: verify-decisions.mjs <before-lexicon> <decisions.json> <after-lexicon>');
const [beforePath,decisionFile,afterPath]=process.argv.slice(2);
const before=await readShards(beforePath),after=await readShards(afterPath),decisions=JSON.parse(fs.readFileSync(decisionFile,'utf8'));
const old=new Map(before.map(r=>[r.sense_id,r])),changes=new Map(decisions.map(d=>[d.sense_id,d]));
assert.equal(old.size,before.length);assert.equal(changes.size,decisions.length);assert.equal(after.length,before.length);
const seen=new Set();
for(const r of after){
 assert.ok(!seen.has(r.sense_id),'duplicate after identity');seen.add(r.sense_id);
 const previous=old.get(r.sense_id);assert.ok(previous,'added identity');const d=changes.get(r.sense_id);
 if(!d){assert.deepEqual(r,previous,'unlogged edit');continue;}
 assert.equal(recordHash(previous),d.expected_sha256,'decision preimage mismatch');
 const expected={...previous,review:{...previous.review,...d.review}};
 for(const f of ['latin_use','adverb_relation'])if(d[f])expected[f]={...previous[f],...d[f]};
 assert.deepEqual(r,expected,'change exceeds decision');
}
for(const d of decisions)assert.ok(seen.has(d.sense_id),'decision target missing');
const compiled=compileRecords(after);
console.log(JSON.stringify({records:after.length,explicit_decisions:decisions.length,unchanged:after.length-decisions.length,admitted:Object.values(compiled.bundles).reduce((n,b)=>n+b.records.length,0),pending:after.filter(r=>r.review.state==='pending').length,rejected:after.filter(r=>r.review.state==='rejected').length},null,2));
