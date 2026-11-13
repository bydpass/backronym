// Compile admitted senses into category bundles. Pending/rejected records never enter runtime output.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { fingerprint } from '../lexicon/baseline.mjs';
import { LANGS, CATEGORIES, decode, admission, conjugationForms } from './schema.mjs';
import {senseForms} from './forms.mjs';
import {englishForms} from './english-forms.mjs';
const POS = { noun: 'n.', verb: 'v.', adj: 'adj.', adv: 'adv.', num: 'num.', name: 'n.' };
export function compileRecords(records, formsBySense=null) {
  const seen = new Set(), bundles = {}, excluded = [];
  for (const record of records) {
    assert.ok(!seen.has(record.sense_id), 'duplicate authoritative sense: ' + record.sense_id); seen.add(record.sense_id);
    const reason = admission(record);
    if (reason) { excluded.push({ sense_id: record.sense_id, reason }); continue; }
    const key = record.language + '/' + record.category;
    if (!bundles[key]) bundles[key] = { language: record.language, category: record.category,
      weight: CATEGORIES[record.category].weight, visibility: CATEGORIES[record.category].visibility, records: [] };
    // Four-column compatibility payload; complete record retained as metadata, including unknown fields.
    bundles[key].records.push({ sense_id: record.sense_id,
      row: record.category === 'names' ? record.name_payload : [record.display, POS[record.pos] + record.zh, record.article, record.note],
      metadata: record, ...(formsBySense ? {forms: (formsBySense.get(record.sense_id) || []).filter(form =>
        !record.evidence.form_restriction || record.evidence.form_restriction.allowed.includes(form) || conjugationForms(record).includes(form))} : {}) });
  }
  for (const bundle of Object.values(bundles)) bundle.records.sort((a, b) => a.sense_id.localeCompare(b.sense_id));
  return { bundles, excluded };
}
function localFile(base, relative) {
  assert.ok(relative && !path.isAbsolute(relative) && !relative.split('/').some(p => ['', '.', '..'].includes(p)), 'invalid shard path');
  let current = base;
  for (const part of relative.split('/')) { current = path.join(current, part); assert.ok(!fs.lstatSync(current).isSymbolicLink(), 'symlink not allowed'); }
  return current;
}
export async function readShards(directory) {
  assert.ok(!fs.lstatSync(directory).isSymbolicLink(), 'symlink root not allowed');
  const records = [], paths = new Set();
  for (const lang of LANGS) {
    const index = JSON.parse(fs.readFileSync(localFile(directory, lang + '/index.json'), 'utf8'));
    assert.equal(index.schema, 1); assert.equal(index.language, lang);
    for (const shard of index.shards) {
      const relative = lang + '/' + shard.path;
      assert.ok(!paths.has(relative), 'duplicate shard path'); paths.add(relative);
      const file = localFile(directory, relative);
      assert.equal((await fingerprint(file)).sha256, shard.sha256, 'shard checksum: ' + relative);
      const parsed = decode(fs.readFileSync(file, 'utf8')).records;
      assert.equal(parsed.length, shard.rows); assert.ok(parsed.length > 0 && parsed.length <= 300, 'invalid shard size');
      assert.ok(CATEGORIES[shard.category]);
      assert.equal(shard.weight, CATEGORIES[shard.category].weight); assert.equal(shard.visibility, CATEGORIES[shard.category].visibility);
      for (const record of parsed) { assert.equal(record.language, lang); assert.equal(record.category, shard.category); }
      records.push(...parsed);
    }
  }
  return records;
}
// Compile-time fold is at least as coarse as every runtime language fold, so the
// guard list can only be a superset of the spellings that really collide.
const exactKey=s=>String(s).normalize('NFC').toLowerCase().replace(/[\u2019\u02BC\u2018\u0060\u00B4]/g,"'");
const foldKey=s=>exactKey(s).normalize('NFD').replace(/\p{M}/gu,'').replace(/\u00df/g,'ss').replace(/\u0153/g,'oe').replace(/\u00e6/g,'ae');
const plainLatin=s=>s.normalize('NFD').replace(/\u0304/g,'').normalize('NFC');
// A spelling the source knows as its own word or form must not borrow the
// meaning of a different admitted word through accent folding (T19-04).
export function lookupGuards(records, formsBySense, known, lang) {
  const exact=new Set(),folded=new Map();
  for(const r of records){
    if(r.language!==lang||admission(r))continue;
    const link=r.evidence.form_source_lemma,owners=[exactKey(r.display)+'|'+r.pos,exactKey(plainLatin(r.display))+'|'+r.pos];
    if(link)owners.push(exactKey(link.lemma)+'|'+link.pos);
    for(const s of [r.display,...(formsBySense.get(r.sense_id)||[])]){
      exact.add(exactKey(s));
      // Latin input normally omits length marks: same word, not a borrowing.
      if(lang==='la')exact.add(exactKey(plainLatin(s)));
      const f=foldKey(s);if(!folded.has(f))folded.set(f,new Set());
      for(const o of owners)folded.get(f).add(o);
    }
  }
  const guards=new Set();
  // known: spelling -> source headwords (lemma|pos) it belongs to. A marked
  // variant of the admitted word itself (stress or length marks) is not guarded.
  for(const [spelling,heads] of known){
    const k=exactKey(spelling),owners=folded.get(foldKey(k));
    if(!k||exact.has(k)||!owners||[...heads].some(h=>owners.has(exactKey(h))))continue;
    if(lang==='la'&&exact.has(exactKey(plainLatin(k))))continue;
    guards.add(k);
  }
  // Forms reviewed as belonging to the other homograph are that word's spellings.
  // "exact" above is built from unrestricted source forms; a reviewed exclusion is only
  // skipped when the spelling is still a served display/form of some admitted sense
  // (after form_restriction and form_homographs), otherwise folding would borrow it back.
  const served=new Set();
  for(const r of records){
    if(r.language!==lang||admission(r))continue;
    const allow=r.evidence.form_restriction?new Set(r.evidence.form_restriction.allowed):null,drop=new Set(r.evidence.form_homographs?r.evidence.form_homographs.excluded:[]);
    served.add(exactKey(r.display));if(lang==='la')served.add(exactKey(plainLatin(r.display)));
    const conj=new Set(conjugationForms(r));
    for(const s of formsBySense.get(r.sense_id)||[]){if(!conj.has(s)&&((allow&&!allow.has(s))||drop.has(s)))continue;served.add(exactKey(s));if(lang==='la')served.add(exactKey(plainLatin(s)));}
  }
  for(const r of records){
    if(r.language!==lang||admission(r)||!r.evidence.form_homographs)continue;
    for(const f of r.evidence.form_homographs.excluded){const k=exactKey(f);if(!served.has(k)&&folded.has(foldKey(k)))guards.add(k);}
  }
  return [...guards].sort();
}
// 来源词形图（维基词典抽取）里混着不是屈折形式的东西，三条机械通则（T19-R60-1，2026-11-12）：
//  1. 去掉变音符后不是纯 a–z 的不收（音标 ɛm、tʁuv，怪字符 ȼ）；
//  2. 一两个字母的词形只收允许表里写明的（缩写 p、pp、rr、rx；残渣 m、l）；动词的短变位写进变位表；
//  3. 英语语法术语是解析残渣（imperative、declension…），除非它与原形同词干（意语 future 之于 futuro）。
const RESIDUE=new Set('imperative infinitive subjunctive indicative conditional future present past perfect imperfect participle gerund supine first second third singular plural declension conjugation masculine feminine neuter nominative genitive dative accusative ablative vocative comparative superlative positive strong weak mixed definite indefinite form forms table'.split(' '));
export function cleanForms(record,forms){
  const allow=record.evidence.form_restriction?new Set(record.evidence.form_restriction.allowed):null,stem=foldKey(record.display).slice(0,2);
  return forms.filter(f=>{
    const k=foldKey(f);
    if(!/^[a-z]+$/.test(k))return false;
    if([...f].length<=2&&!(allow&&allow.has(f)))return false;
    if(record.language!=='en'&&RESIDUE.has(k)&&k.slice(0,2)!==stem)return false;
    return true;
  });
}
export async function compile(directory, output, stageDirectory=null, englishCsv=null) {
  assert.ok(!fs.existsSync(output), 'output exists; refusing overwrite');
  assert.ok(!path.resolve(output).startsWith(path.resolve(directory) + path.sep), 'output cannot be inside source shards');
  const records=await readShards(directory), formsBySense=(stageDirectory||englishCsv)?new Map():null, known={};
  if(stageDirectory)for(const lang of LANGS.filter(l=>l!=='en')){
    const stage=JSON.parse(fs.readFileSync(path.join(stageDirectory,lang+'.json'),'utf8'));
    assert.equal(stage.lang,lang);assert.ok(stage.form2pos&&Array.isArray(stage.lemmas));
    const allowFile=path.resolve('review/lexicon',lang,'form-allow.tsv');
    const allow=new Set(fs.existsSync(allowFile)?fs.readFileSync(allowFile,'utf8').split(/\r?\n/).filter(s=>s.trim()&&!s.startsWith('#')).map(s=>s.split('\t')[0].trim().toLowerCase()):[]);
    const additionsFile=path.resolve('review/lexicon',lang,'form-additions.json');
    const additions=fs.existsSync(additionsFile)?JSON.parse(fs.readFileSync(additionsFile,'utf8')):[];
    for(const [id,forms] of senseForms(records.filter(r=>r.language===lang),stage,allow,additions))formsBySense.set(id,forms);
    const spellings=known[lang]=new Map(),note=(w,head)=>{if(!spellings.has(w))spellings.set(w,new Set());spellings.get(w).add(head);};
    for(const l of stage.lemmas)note(l.w,l.w+'|'+l.pos);
    for(const w of Object.keys(stage.form2pos))for(const head of stage.form2pos[w])note(w,head);
  }
  if(englishCsv){
    const additionsFile=path.resolve('review/lexicon/en/form-additions.json');
    const additions=fs.existsSync(additionsFile)?JSON.parse(fs.readFileSync(additionsFile,'utf8')):[];
    for(const [id,forms] of await englishForms(records,englishCsv,additions))formsBySense.set(id,forms);
    // Every source word is a candidate; lookupGuards keeps only real collisions.
    known.en=fs.readFileSync(englishCsv,'utf8').split(/\r?\n/).slice(1).map(line=>line[0]==='"'?line.slice(1,line.indexOf('"',1)):line.slice(0,line.indexOf(','))).filter(Boolean).map(w=>[w,new Set()]);
  }
  // 来源词形图的通则清理（T19-R60-1）：见 cleanForms。在并入变位表之前做，变位表里的词形不受它影响。
  if(formsBySense)for(const r of records){const f=formsBySense.get(r.sense_id);if(f&&f.length)formsBySense.set(r.sense_id,cleanForms(r,f));}
  // 变位表里的词形是逐个审过的：并入该义项的可查词形，不受来源词形图、功能词同形过滤和允许表限制。
  if(formsBySense)for(const r of records){
    if(!r.conjugation||admission(r))continue;
    formsBySense.set(r.sense_id,[...new Set([...(formsBySense.get(r.sense_id)||[]),...conjugationForms(r)])].sort());
  }
  const result = compileRecords(records,formsBySense);
  fs.mkdirSync(output);
  const guards = {};
  if (formsBySense && stageDirectory && englishCsv) for (const lang of LANGS) guards[lang] = lookupGuards(records, formsBySense, known[lang] || [], lang);
  const index = { schema: formsBySense?(stageDirectory&&englishCsv?3:2):1, state: Object.keys(result.bundles).length ? 'needs-runtime-integration' : 'no-admitted-senses', bundles: [] };
  for (const [key, bundle] of Object.entries(result.bundles)) {
    const relative = key + '.json', absolute = path.join(output, relative);
    fs.mkdirSync(path.dirname(absolute), { recursive: true });
    fs.writeFileSync(absolute, JSON.stringify(bundle) + '\n', { flag: 'wx' });
    index.bundles.push({ path: relative, language: bundle.language, category: bundle.category,
      weight: bundle.weight, visibility: bundle.visibility, rows: bundle.records.length, ...await fingerprint(absolute) });
  }
  if (index.schema === 3) index.guards = guards;
  fs.writeFileSync(path.join(output, 'index.json'), JSON.stringify(index, null, 2) + '\n', { flag: 'wx' });
  fs.writeFileSync(path.join(output, 'excluded.json'), JSON.stringify(result.excluded, null, 2) + '\n', { flag: 'wx' });
  return { admitted: Object.values(result.bundles).reduce((sum, bundle) => sum + bundle.records.length, 0), excluded: result.excluded.length };
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    assert.ok([4,5,6].includes(process.argv.length), 'Usage: compile.mjs <lexicon-directory> <new-output-directory> [stage-directory] [ecdict-csv]');
    console.log(JSON.stringify(await compile(path.resolve(process.argv[2]), path.resolve(process.argv[3]),process.argv[4]||null,process.argv[5]||null)));
  } catch (error) { console.error(error.stack); process.exitCode = 1; }
}
