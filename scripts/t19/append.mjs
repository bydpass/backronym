// Append proposals to a NEW working lexicon. Existing bytes, paths, metadata and review decisions win.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { readShards } from './compile.mjs';
import { partition, encode, LANGS, CATEGORIES } from './schema.mjs';
import { fingerprint } from '../lexicon/baseline.mjs';
export async function appendProposals(source, proposed, output) {
  source=path.resolve(source); output=path.resolve(output);
  assert.ok(!fs.existsSync(output),'output exists; refusing overwrite');
  assert.ok(!output.startsWith(source+path.sep),'output inside source');
  const old=await readShards(source), oldIds=new Set(old.map(r=>r.sense_id));
  assert.equal(old.length,oldIds.size,'duplicate existing identity');
  const seen=new Set();
  for(const r of proposed){assert.ok(!seen.has(r.sense_id),'duplicate proposal identity');seen.add(r.sense_id);}
  const additions=proposed.filter(r=>!oldIds.has(r.sense_id));
  const shards=partition(additions), files=[];
  function walk(dir,relative=''){
    for(const name of fs.readdirSync(dir).sort()){
      if(name==='_recovery')continue;
      const rel=path.join(relative,name),abs=path.join(dir,name),stat=fs.lstatSync(abs);
      assert.ok(!stat.isSymbolicLink(),'symlink source forbidden');
      if(stat.isDirectory())walk(abs,rel);else {assert.ok(stat.isFile(),'unsupported source node');files.push(rel);}
    }
  }
  walk(source);
  const snapshots=new Map();for(const f of files)snapshots.set(f,await fingerprint(path.join(source,f)));
  const indexes=Object.fromEntries(LANGS.map(l=>[l,JSON.parse(fs.readFileSync(path.join(source,l,'index.json'),'utf8'))]));
  const planned=[],used=new Set(files);
  for(const shard of shards){
    const stem=shard.path.replace(/-\d+\.tsv$/,''),lang=shard.records[0].language,category=shard.records[0].category;
    let n=1;while(used.has(stem+'-'+String(n).padStart(3,'0')+'.tsv'))n++;
    const rel=stem+'-'+String(n).padStart(3,'0')+'.tsv';used.add(rel);
    const content=encode(shard.records,[...new Set(shard.records.flatMap(r=>Object.keys(r)))]);planned.push({rel,content});
    indexes[lang].shards.push({path:rel.slice(lang.length+1),category,...CATEGORIES[category],rows:shard.records.length,
      sources:[...new Set(shard.records.flatMap(r=>r.evidence.sources.map(s=>s.path)))].sort()});
  }
  // Inputs may be edited by another reviewer; detect drift before creating output.
  for(const [f,hash] of snapshots)assert.deepEqual(await fingerprint(path.join(source,f)),hash,'source changed: '+f);
  fs.mkdirSync(output);
  for(const f of files){const dest=path.join(output,f);fs.mkdirSync(path.dirname(dest),{recursive:true});fs.copyFileSync(path.join(source,f),dest,fs.constants.COPYFILE_EXCL);assert.deepEqual(await fingerprint(dest),snapshots.get(f));}
  for(const {rel,content} of planned){const dest=path.join(output,rel);fs.mkdirSync(path.dirname(dest),{recursive:true});fs.writeFileSync(dest,content,{flag:'wx'});const l=rel.split('/')[0];indexes[l].shards.find(s=>l+'/'+s.path===rel).sha256=(await fingerprint(dest)).sha256;}
  for(const l of LANGS)fs.writeFileSync(path.join(output,l,'index.json'),JSON.stringify(indexes[l],null,2)+'\n');
  const result={preserved:old.length,appended:additions.length,retained_existing_ids:proposed.filter(r=>oldIds.has(r.sense_id)).map(r=>r.sense_id),new_shards:planned.map(p=>p.rel)};
  assert.equal((await readShards(output)).length,old.length+additions.length);
  return result;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  assert.equal(process.argv.length,5,'Usage: append.mjs <old-lexicon> <proposal-lexicon> <new-lexicon>');
  console.log(JSON.stringify(await appendProposals(process.argv[2],await readShards(process.argv[3]),process.argv[4]),null,2));
}
