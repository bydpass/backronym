// Read-only progress from authoritative shard decisions, not search-hit counts.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {readShards} from './compile.mjs';
import {LANGS,admission} from './schema.mjs';
export function summarize(records,concepts){
 const cells=[];
 for(const language of LANGS)for(const c of concepts){
  const rr=records.filter(r=>r.language===language&&r.concept_ids.includes(c.id));
  const admitted=rr.filter(r=>!admission(r));
  cells.push({language,concept_id:c.id,label:c.label,applicable:c.languages.includes(language),candidates:rr.length,
   pending:rr.filter(r=>r.review.state==='pending').length,rejected:rr.filter(r=>r.review.state==='rejected').length,
   admitted_ids:admitted.map(r=>r.sense_id),status:!c.languages.includes(language)?'范围不适用':admitted.length?'已有准入义项':rr.some(r=>r.review.state==='pending')?'候选待核':rr.length?'现有线索未准入':'缺少线索'});
 }
 return {records:records.length,admitted:records.filter(r=>!admission(r)).length,pending:records.filter(r=>r.review.state==='pending').length,rejected:records.filter(r=>r.review.state==='rejected').length,
  languages:Object.fromEntries(LANGS.map(l=>[l,{applicable:cells.filter(c=>c.language===l&&c.applicable).length,with_admitted_sense:cells.filter(c=>c.language===l&&c.admitted_ids.length).length,pending_cells:cells.filter(c=>c.language===l&&c.status==='候选待核').length,unadmitted_cells:cells.filter(c=>c.language===l&&c.status==='现有线索未准入').length,missing_cells:cells.filter(c=>c.language===l&&c.status==='缺少线索').length}])),cells};
}
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export async function writeProgress(lexicon,conceptFile,output){
 assert.ok(!fs.existsSync(output),'output exists; refusing overwrite');
 const records=await readShards(lexicon),concepts=JSON.parse(fs.readFileSync(conceptFile,'utf8')),report=summarize(records,concepts);
 fs.mkdirSync(output);
 fs.writeFileSync(path.join(output,'progress.json'),JSON.stringify(report,null,2)+'\n');
 const table=Object.entries(report.languages).map(([l,r])=>`<tr><th>${l}</th><td>${r.applicable}</td><td>${r.with_admitted_sense}</td><td>${r.pending_cells}</td><td>${r.unadmitted_cells}</td><td>${r.missing_cells}</td></tr>`).join('');
 const items=records.filter(r=>!admission(r)).map(r=>`<details><summary>${esc(r.language+' · '+r.display+' · '+r.zh+' · '+r.article)}</summary><p>${esc(r.category+' / '+r.sense_id)}</p><p>${esc(r.review.evidence)}</p><p>${esc(r.review.reason)}</p></details>`).join('');
 fs.writeFileSync(path.join(output,'index.html'),`<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>T19实际核义进度</title><style>body{max-width:960px;margin:30px auto;padding:0 20px;font:16px/1.7 system-ui;background:#f3f4f6;color:#202b36}table{border-collapse:collapse;width:100%;background:white}td,th{padding:8px;border-bottom:1px solid #ccd2d9;text-align:left}details{background:white;padding:12px;margin:10px 0;overflow-wrap:anywhere}.scroll{overflow-x:auto}</style><h1>T19实际核义进度</h1><p>${report.admitted}条符合首轮准入；${report.pending}条待核义；${report.rejected}条拒绝。已有准入义项不表示整个概念、其他同形义项或该语种全部完成。独立复审与产品接入另行验收。</p><div class="scroll"><table><thead><tr><th>语种</th><th>目标概念</th><th>已有准入义项</th><th>仅有待核线索</th><th>已核未准入</th><th>缺少线索</th></tr></thead><tbody>${table}</tbody></table></div><h2>已准入的具体义项与证据</h2>${items}<p>这是审核报告，不是候选选词器；这里不执行产品屏蔽规则。</p></html>\n`);
 return report;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 assert.equal(process.argv.length,5,'Usage: progress.mjs <lexicon> <concepts.json> <new-output>');
 const r=await writeProgress(...process.argv.slice(2));console.log(JSON.stringify({admitted:r.admitted,pending:r.pending,languages:r.languages}));
}
