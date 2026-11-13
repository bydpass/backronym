// ECDICT exchange codes: https://github.com/skywind3000/ECDICT#词形变化
// Use lemma-side typed forms only. Generated reverse entries can contain misspellings.
import fs from 'node:fs';
import readline from 'node:readline';
import assert from 'node:assert/strict';
import {admission} from './schema.mjs';
const POS={p:'verb',d:'verb',i:'verb','3':'verb',s:'noun',r:'adj',t:'adj'};
export function csvRow(line){
 const out=[];let value='',quoted=false;
 for(let i=0;i<line.length;i++){
  const c=line[i];
  if(c==='"'){if(quoted&&line[i+1]==='"'){value+='"';i++;}else quoted=!quoted;}
  else if(c===','&&!quoted){out.push(value);value='';}else value+=c;
 }
 assert.ok(!quoted,'unterminated ECDICT CSV field');out.push(value);return out;
}
export function exchangePairs(word,exchange){
 const fields=exchange.split('/').map(x=>{const i=x.indexOf(':');return i<0?['','']:[x.slice(0,i),x.slice(i+1)];});
 const pairs=[];
 for(const [code,form] of fields)if(POS[code])pairs.push({lemma:word,pos:POS[code],form});
 // 0/1 reverse hints are deliberately not admitted without separate review.
 return pairs.filter(p=>/^[a-z]+$/.test(p.lemma)&&/^[a-z]+$/.test(p.form)&&p.form!==p.lemma);
}
export async function englishForms(records,file,additions=[]){
 const targets=new Map(),result=new Map();
 for(const r of records){
  if(r.language!=='en'||admission(r))continue;
  result.set(r.sense_id,new Set());
  if(['names','numerals'].includes(r.category))continue;
  const k=r.display+'|'+r.pos;if(!targets.has(k))targets.set(k,[]);targets.get(k).push(r.sense_id);
 }
 let columns=null;
 const lines=readline.createInterface({input:fs.createReadStream(file),crlfDelay:Infinity});
 for await(const line of lines){
  if(!line)continue;
  const row=csvRow(line);
  if(!columns){columns=row;assert.ok(['word','exchange'].every(k=>columns.includes(k)),'missing ECDICT columns');continue;}
  assert.equal(row.length,columns.length,'ECDICT column count');
  const word=row[columns.indexOf('word')],exchange=row[columns.indexOf('exchange')];
  for(const p of exchangePairs(word,exchange))for(const id of targets.get(p.lemma+'|'+p.pos)||[])result.get(id).add(p.form);
 }
 assert.ok(columns,'empty ECDICT source');
 for(const a of additions){
  assert.ok(a.source&&a.evidence&&a.reviewer&&/^[a-z]+$/.test(a.form),'invalid reviewed form addition');
  const r=records.find(r=>r.sense_id===a.sense_id);
  if(!r||!result.has(r.sense_id))continue;
  assert.ok(r.language==='en'&&r.display===a.lemma&&r.pos===a.pos&&!['names','numerals'].includes(r.category),'form addition identity mismatch');
  result.get(r.sense_id).add(a.form);
 }
 return new Map([...result].map(([id,forms])=>[id,[...forms].sort()]));
}
