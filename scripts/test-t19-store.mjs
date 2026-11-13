import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import vm from 'node:vm';
import store from '../app/assets/lexicon-store.js';
import {compileRecords} from './t19/compile.mjs';
import {id} from './t19/schema.mjs';
const read=async file=>{const bytes=fs.readFileSync(file);return {value:JSON.parse(bytes),sha256:crypto.createHash('sha256').update(bytes).digest('hex')};};
for(const lang of ['en','fr','de','es','it','la']){
 const records=await store.load('review/t19-batches/t19-batch5-20261111/compiled',lang,read);
 assert.equal(records.length,lang==='la'?0:4);
}
const opts={exact:s=>s.normalize('NFC').toLowerCase(),fold:s=>s.normalize('NFD').replace(/\p{M}/gu,'').toLowerCase(),blocked:s=>s==='secret'};
const make=(word,category='daily',extra={})=>({entry_id:id('e',[word]),sense_id:id('s',[word,category]),language:'en',display:word,pos:'noun',zh:'词义',category,theme:'D01',concept_ids:[],legacy_refs:[],article:'',note:'',evidence:{sources:[{path:'fixture',sha256:'a'.repeat(64)}]},review:{state:'approved',reviewer:'fixture',evidence:'fixture'},adverb_relation:{state:'not-applicable'},latin_use:{state:'not-applicable'},name_payload:null,...extra});
const daily=make('day'),creative=make('light','creative'),human=make('metaphor','professional-humanities'),natural=make('entropy','professional-natural'),history=make('Rome','historical-cultural'),name=make('Antoine','names',{pos:'name',name_payload:['Antoine','词义','m','fr'],evidence:{sources:[{path:'fixture',sha256:'a'.repeat(64)}],name_origin:'fixture'}}),num=make('one','numerals',{pos:'num'}),pending=make('pending','daily',{review:{state:'pending'}}),blocked=make('secret');
const all=[daily,creative,human,natural,history,name,num,pending,blocked];
assert.deepEqual(store.select(all,opts).map(m=>m.record.display).sort(),['day','light','secret']);
assert.equal(store.select(all,opts).find(m=>m.record.display==='secret').blocked,true);
assert.equal(store.select(all,{...opts,mode:'expanded',expanded:['professional-natural']}).some(m=>m.record===natural),true);
assert.equal(store.select(all,{...opts,mode:'expanded',expanded:['professional-natural']}).some(m=>m.record===human),false);
assert.deepEqual(store.select([natural,human],{...opts,mode:'expanded',expanded:['professional-natural','professional-humanities']}).map(m=>m.record.category),['professional-humanities','professional-natural']);
const accented=make('lumière');const professionalExact=make('lumiere','professional-natural');
assert.equal(store.select([accented,professionalExact],{...opts,mode:'query',query:'lumiere'})[0].record,professionalExact,'exact match outranks default category weight');
for(const r of [name,num]){assert.equal(store.select(all,{...opts,mode:'query',query:r.display})[0].record,r);assert.equal(store.select(all,{...opts,mode:'query',query:r.display.slice(0,-1)}).length,0);}
assert.equal(store.select([daily],{...opts,mode:'query',query:'days',forms:{day:'days'}})[0].tier,1);
assert.equal(store.select([make('lumière')],{...opts,mode:'query',query:'lumiere'})[0].tier,2);
const noun=make('Versprechen','creative',{language:'de'}),verb=make('versprechen','daily',{language:'de',pos:'verb'});
assert.equal(store.select([verb,noun],{...opts,mode:'query',query:'Versprechen'})[0].record,noun,'German exact case precedes category weight');
assert.equal(store.select([noun,verb],{...opts,mode:'query',query:'versprechen'})[0].record,verb);
assert.equal(store.select([noun],{...opts,mode:'query',query:'versprechen'})[0].record,noun,'case-insensitive fallback remains available');
assert.throws(()=>store.select(all,{...opts,blocked:null}),/blocker required/);
const en=await store.load('review/t19-batches/t19-batch5-20261111/compiled','en',read);
assert.equal(store.select(en,{...opts,mode:'query',query:'moon'})[0].record.zh,'月亮');
await assert.rejects(store.load('review/t19-batches/t19-batch5-20261111/compiled','en',async f=>{const r=await read(f);if(f.endsWith('/daily.json'))r.sha256='0'.repeat(64);return r;}),/checksum/);
await assert.rejects(store.load('review/t19-batches/t19-batch5-20261111/compiled','en',async f=>{const r=await read(f);if(f.endsWith('index.json'))r.value.bundles[0].path='../outside.json';return r;}),/path/);
assert.equal(Object.values(compileRecords(all).bundles).flatMap(b=>b.records).length,8);
const sampling=all.map(record=>({record,tier:0,blocked:record===blocked}));
const original=sampling.slice();
const sample=store.sample(sampling,99,{random:()=>0.5});
assert.deepEqual(sample.map(m=>m.record.category),['daily','creative','historical-cultural','professional-humanities','professional-natural'],'equal draws favor greater weight, with stable ties');
assert.deepEqual(sampling,original,'sampling does not reorder input');
assert.equal(store.sample([...sampling,...sampling],99).length,5,'sample is unique and excludes blocked, pending and query-only');
assert.equal(store.sample(sampling,99,{includeBlocked:true}).length,6);
assert.deepEqual(store.sample(sampling,0),[]);
assert.throws(()=>store.sample(sampling,-1),/count/);
assert.throws(()=>store.sample(sampling,1,{random:()=>1}),/random value/);
assert.throws(()=>store.sample(sampling,1,{random:()=>NaN}),/random value/);
let seed=17,wins=0;
const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/2**32;};
for(let i=0;i<20000;i++)if(store.sample([{record:daily},{record:natural}],1,{random})[0].record===daily)wins++;
assert.ok(Math.abs(wins/20000-100/155)<0.02,`weighted first-draw probability: ${wins}/20000`);
const current=await store.load('review/t19-batches/t19-batch11-20261111/compiled','en',read);
const actualPool=store.select(current,{...opts,mode:'expanded',expanded:['professional-humanities','professional-natural','historical-cultural']});
const actualSample=store.sample(actualPool,24,{random});
assert.equal(actualSample.length,24);
assert.equal(new Set(actualSample.map(m=>m.record.sense_id)).size,24);
assert.ok(actualSample.every(m=>!['names','numerals'].includes(m.record.category)&&!m.blocked));
const browserContext=vm.createContext({window:{},globalThis:undefined});
for(const file of ['lexicon-policy.js','lexicon-store.js'])vm.runInContext(fs.readFileSync('app/assets/'+file,'utf8'),browserContext,{filename:file});
assert.equal(browserContext.window.LEXICON_STORE.select([daily],opts)[0].record,daily,'classic browser exports do not need globalThis');
console.log('T19 store passed: category bundles, integrity, selection gates, lookup tiers, blocker and weighted sampling');

// Scoped morphology must retain POS identity and cannot inherit an old display-key relation.
const {senseForms}=await import('./t19/forms.mjs');
const seinN=make('Sein','creative',{language:'de',pos:'noun'});
const dream=make('Traum','creative',{language:'de',pos:'noun'});
const dreamV=make('träumen','creative',{language:'de',pos:'verb'});
const fixtureStage={lemmas:[{w:'Sein',pos:'noun'},{w:'sein',pos:'verb'},{w:'Traum',pos:'noun'},{w:'träumen',pos:'verb'},{w:'tu',pos:'pron'}],form2pos:{bist:['sein|verb'],träume:['traum|noun','träumen|verb'],träumtest:['träumen|verb'],tu:['träumen|verb'],indirect:['middle|verb'],middle:['träumen|verb'],cycle:['cycle|verb']}};
const morphology=senseForms([seinN,dream,dreamV,pending,name,num],fixtureStage);
assert.deepEqual(morphology.get(seinN.sense_id),[],'verb sein must not attach to noun Sein');
assert.deepEqual(morphology.get(dream.sense_id),['träume']);
assert.ok(morphology.get(dreamV.sense_id).includes('indirect'),'same-POS intermediate form is followed');
assert.ok(!morphology.get(dreamV.sense_id).includes('tu'),'functional homograph requires explicit allow');
assert.ok(senseForms([dreamV],fixtureStage,new Set(['tu'])).get(dreamV.sense_id).includes('tu'));
assert.ok(!morphology.has(pending.sense_id));
assert.deepEqual(morphology.get(name.sense_id),[]);assert.deepEqual(morphology.get(num.sense_id),[]);
const born=make('naître','creative',{language:'fr',pos:'verb'});
const spellingStage={lemmas:[{w:'naître',pos:'verb'},{w:'naitre',pos:'verb'}],form2pos:{naitre:['naître|verb'],naitrai:['naitre|verb'],naîtrai:['naître|verb'],naitres:['naitre|noun']}};
assert.ok(!senseForms([born],spellingStage).get(born.sense_id).includes('naitrai'),'known lemma is not automatically an alias');
const bornAlias={...born,evidence:{...born.evidence,spelling_aliases:[{spelling:'naitre',source:'fixture dictionary',evidence:'reviewed alternate spelling',reviewer:'fixture'}]}};
assert.deepEqual(senseForms([bornAlias],spellingStage).get(born.sense_id),['naitrai','naitre','naîtrai']);
assert.equal(senseForms([bornAlias],spellingStage).size,1,'spelling alias does not create another admitted sense');
for(const alias of [{spelling:'NAITRE'},{source:''},{spelling:'naître'}]){
 const bad={...bornAlias,evidence:{...bornAlias.evidence,spelling_aliases:[{...bornAlias.evidence.spelling_aliases[0],...alias}]}};
 assert.throws(()=>senseForms([bad],spellingStage),/spelling alias/);
}
assert.throws(()=>senseForms([bornAlias],{...spellingStage,form2pos:{naitre:['naître|noun'],naitrai:['naitre|verb']}}),/source relation/,'same spelling with wrong POS is not evidence');
const unreviewedSpelling={...bornAlias,review:{state:'pending'}};
assert.equal(senseForms([unreviewedSpelling],spellingStage).size,0,'pending sense cannot activate alias');
const scopedRows=[seinN,dream,dreamV];
Object.defineProperty(scopedRows,'formsBySense',{value:Object.fromEntries(morphology)});
assert.equal(store.select(scopedRows,{...opts,mode:'query',query:'bist',forms:{Sein:'bist'}}).length,0,'new bundles must not fall back to old display-key forms');
assert.deepEqual(store.select(scopedRows,{...opts,mode:'query',query:'träumtest'}).map(m=>m.record.pos),['verb']);
assert.equal(store.select(scopedRows,{...opts,mode:'query',query:'Träume'}).length,2,'genuine noun/verb ambiguity retains both admitted targets');
for(const [language,query,display] of [['de','Träume','Traum'],['fr','histoires','histoire']]){
 const rows=await store.load('review/t19-batches/t19-batch20-20261111/compiled',language,read);
 const found=store.select(rows,{...opts,mode:'query',query});
 assert.ok(found.some(m=>m.record.display===display&&m.record.pos==='noun'&&m.tier===1));
 assert.ok(!store.select(rows,opts).some(m=>m.record.display===query),'pure plural stays out of recommendation');
}
await assert.rejects(store.load('review/t19-batches/t19-batch20-20261111/compiled','de',async f=>{
 const r=await read(f);if(f.endsWith('/creative.json'))r.value.records[0].forms=null;return r;
}),/invalid sense forms/);
console.log('T19 sense morphology passed: POS separation, recursion, guards, query-only tables and real plural lookup');

const {englishForms,exchangePairs,csvRow}=await import('./t19/english-forms.mjs');
assert.deepEqual(csvRow('"a,b","say ""yes""",x'),['a,b','say "yes"','x']);
assert.throws(()=>csvRow('"unfinished'),/unterminated/);
assert.deepEqual(exchangePairs('dream','s:dreams/p:dreamed/i:dreaming').map(p=>p.pos),['noun','verb','verb']);
assert.deepEqual(exchangePairs('better','0:good/1:r'),[],'reverse hints require independent evidence');
assert.deepEqual(exchangePairs('went','0:go'),[],'untyped lemma reference must not infer POS');
assert.deepEqual(exchangePairs('gone','0:go/1:dp'),[]);
assert.deepEqual(exchangePairs('test','x:bad/s:two words/p:a,b/0:root/1:x'),[],'unknown and compound encodings are not guessed');
const english=await store.load('review/t19-batches/t19-batch21-20261111/compiled','en',read);
for(const [query,word,pos] of [['children','child','noun'],['stories','story','noun'],['chose','choose','verb'],['chosen','choose','verb'],['sought','seek','verb'],['people','person','noun']]){
 assert.ok(store.select(english,{...opts,mode:'query',query}).some(m=>m.tier===1&&m.record.display===word&&m.record.pos===pos));
}
for(const query of ['dreaming','lit','ones','libertys','symmetrys','echos'])assert.equal(store.select(english,{...opts,mode:'query',query}).length,0);
const englishMap=await englishForms([daily,name,num,pending,make('good','daily',{pos:'adj'}),make('dream','daily')],'scripts/.cache/ecdict.csv');
assert.ok(englishMap.get(daily.sense_id).includes('days'));
assert.deepEqual(englishMap.get(name.sense_id),[]);assert.deepEqual(englishMap.get(num.sense_id),[]);assert.ok(!englishMap.has(pending.sense_id));
assert.ok(englishMap.get(make('good','daily',{pos:'adj'}).sense_id).includes('better'));
assert.ok(!englishMap.get(make('dream','daily').sense_id).includes('dreaming'));
console.log('T19 English morphology passed: ECDICT typed relations, untrusted reverse hints, irregular forms and POS/query-only isolation');
const reviewedForm={sense_id:daily.sense_id,lemma:'day',pos:'noun',form:'days',source:'fixture',evidence:'fixture',reviewer:'fixture'};
await assert.rejects(englishForms([daily],'scripts/.cache/ecdict.csv',[{...reviewedForm,lemma:'different'}]),/identity mismatch/);
await assert.rejects(englishForms([name],'scripts/.cache/ecdict.csv',[{...reviewedForm,sense_id:name.sense_id,lemma:name.display,pos:name.pos}]),/identity mismatch/);

// Latin length marks require explicit same-POS source canon, not broad folding.
const aquatic=make('aquātilis','professional-natural',{language:'la',pos:'adj',latin_use:{state:'binomial',evidence:'fixture'}});
const latinN=make('aquātilis','creative',{language:'la',pos:'noun',sense_id:id('s',['latin noun']),latin_use:{state:'literary',evidence:'fixture'}});
const latinStage={lemmas:[{w:'aquatilis',pos:'adj',canon:['aquātilis','other','no passive']},{w:'aquatile',pos:'pron'}],form2pos:{aquātile:['aquatilis|adj'],aquātilia:['aquatilis|adj'],wrong:['other|adj']}};
const latinForms=senseForms([aquatic,latinN],latinStage);
assert.ok(latinForms.get(aquatic.sense_id).includes('aquātile'));
assert.ok(!latinForms.get(aquatic.sense_id).includes('aquatile'),'unmarked functional homograph remains guarded');
assert.ok(latinForms.get(aquatic.sense_id).includes('aquatilia'));
assert.ok(!latinForms.get(aquatic.sense_id).includes('wrong'),'descriptive canon or unrelated canonical word is not an alias');
assert.deepEqual(latinForms.get(latinN.sense_id),[],'same spelling does not bypass source POS');
assert.ok(senseForms([aquatic],latinStage,new Set(['aquatile'])).get(aquatic.sense_id).includes('aquatile'));
const noCanon={...latinStage,lemmas:[{w:'aquatilis',pos:'adj'}]};
assert.deepEqual(senseForms([aquatic],noCanon).get(aquatic.sense_id),[],'without source canon no accent-based lemma association');
assert.deepEqual(senseForms([{...aquatic,language:'fr'}],latinStage).get(aquatic.sense_id),[],'Latin normalization never leaks to modern-language lookup');
const acute=make('áqua','creative',{language:'la',pos:'noun',latin_use:{state:'literary',evidence:'fixture'}});
assert.deepEqual(senseForms([acute],{lemmas:[{w:'aqua',pos:'noun',canon:['áqua']}],form2pos:{aquae:['aqua|noun']}}).get(acute.sense_id),[],'only macrons may differ, not arbitrary marks');
console.log('T19 Latin morphology passed: source-canon, POS, macron-only spelling and functional guards');

// Shared loading controller: ordering, failure isolation, retry and timeout.
const deferred=()=>{let resolve;const promise=new Promise(r=>{resolve=r;});return {promise,resolve};};
const first=deferred(),second=deferred();
const controlled=store.createLoader({base:'review/t19-batches/t19-batch5-20261111/compiled',read,prepare:code=>(code==='en'?first:second).promise,ready:()=>true});
const slow=controlled.load('en'),fast=controlled.load('fr');
second.resolve({ok:true});assert.equal((await fast).code,'fr');
first.resolve({ok:true});const obsolete=await slow;assert.equal(obsolete.stale,true);assert.equal(obsolete.records,null);
const canceled=deferred();const cancelLoader=store.createLoader({base:'review/t19-batches/t19-batch5-20261111/compiled',read,prepare:()=>canceled.promise,ready:()=>true});
const canceledRequest=cancelLoader.load('en');cancelLoader.cancel();canceled.resolve({ok:true});assert.equal((await canceledRequest).stale,true);
let available=false;
const retryLoader=store.createLoader({base:'review/t19-batches/t19-batch5-20261111/compiled',read,prepare:async()=>({ok:true}),ready:()=>available});
const failure=await retryLoader.load('en');assert.equal(failure.ok,false);assert.equal(failure.records,null);
available=true;assert.equal((await retryLoader.load('en')).records.length,4);
const late=deferred();let calls=0;
const timeoutLoader=store.createLoader({base:'review/t19-batches/t19-batch5-20261111/compiled',read,prepare:()=>++calls===1?late.promise:Promise.resolve({ok:true}),ready:()=>true,timeout:30});
const timed=await timeoutLoader.load('en');assert.equal(timed.ok,false);assert.match(timed.error.message,/超时/);assert.equal(timed.records,null);
assert.equal((await timeoutLoader.load('fr')).code,'fr');late.resolve({ok:true});
assert.equal(timed.records,null,'late completion cannot modify a failed result');
const browserEnvironment={fetch:async()=>({ok:true,arrayBuffer:async()=>new TextEncoder().encode('{"ok":true}').buffer}),TextDecoder,crypto:crypto.webcrypto};
const browserRead=store.browserReader(browserEnvironment);assert.equal((await browserRead('fixture')).value.ok,true);
for(const key of ['fetch','TextDecoder','crypto'])await assert.rejects(store.browserReader({...browserEnvironment,[key]:null})('fixture'),/不支持安全读取/);
await assert.rejects(store.browserReader({...browserEnvironment,fetch:async()=>({ok:false})})('fixture'),/无法读取/);
assert.throws(()=>store.createLoader({read,prepare:()=>{},ready:()=>true,timeout:0}),/timeout/);
console.log('T19 shared loader passed: stale/cancel, fail-closed, same-language retry, timeout and browser capabilities');

// A reviewed functional-homograph form opens exactly the named sense.
const reviewedStage={lemmas:[{w:'shared',pos:'conj'},{w:'day',pos:'noun'},{w:'light',pos:'noun'}],form2pos:{shared:['day|noun','light|noun']}};
const scopedAddition={sense_id:daily.sense_id,lemma:'day',pos:'noun',form:'shared',source:'fixture',evidence:'fixture',reviewer:'fixture'};
const scopedForms=senseForms([daily,creative],reviewedStage,new Set(),[scopedAddition]);
assert.deepEqual(scopedForms.get(daily.sense_id),['shared']);
assert.deepEqual(scopedForms.get(creative.sense_id),[],'same spelling does not open an unreviewed target');
for(const change of [{sense_id:'unknown'},{lemma:'light'},{pos:'verb'},{form:'missing'},{evidence:''}])assert.throws(()=>senseForms([daily,creative],reviewedStage,new Set(),[{...scopedAddition,...change}]));
assert.throws(()=>senseForms([{...daily,review:{state:'pending'}}],reviewedStage,new Set(),[scopedAddition]),/identity/);
console.log('T19 scoped form evidence passed: exact sense binding and source relation, unrelated homographs remain guarded');

// T19-A01: one spelling and POS with several source headwords. Forms stay only after a per-sense review.
{
 const guard=make('Hut','creative',{language:'de',pos:'noun',article:'die'});
 const hutStage={lemmas:[{w:'Hut',pos:'noun',head:['Hut m (plural Hüte)']},{w:'Hut',pos:'noun',head:['Hut f (no plural)']},{w:'Buch',pos:'noun',head:['Buch n (plural Bücher)']},{w:'Buch',pos:'noun',head:['Buch n (plural Bücher)']}],form2pos:{hüte:['hut|noun'],hutes:['hut|noun'],bücher:['buch|noun']}};
 assert.deepEqual(senseForms([guard],hutStage).get(guard.sense_id),[],'unreviewed homograph headword fails closed');
 const review=excluded=>({...guard,evidence:{...guard.evidence,form_homographs:{excluded,source:'fixture',evidence:'fixture',reviewer:'fixture'}}});
 assert.deepEqual(senseForms([review(['hüte','hutes'])],hutStage).get(guard.sense_id),[]);
 assert.deepEqual(senseForms([review(['hüte'])],hutStage).get(guard.sense_id),['hutes'],'only reviewed exclusions are removed');
 assert.throws(()=>senseForms([review(['mütze'])],hutStage),/not a source form/);
 assert.throws(()=>senseForms([{...guard,evidence:{...guard.evidence,form_homographs:{excluded:['hüte']}}}],hutStage),/evidence required/);
 const restricted={...guard,evidence:{...guard.evidence,form_restriction:{allowed:['hutes'],source:'fixture',evidence:'fixture',reviewer:'fixture'}}};
 assert.deepEqual(senseForms([restricted],hutStage).get(guard.sense_id),['hutes','hüte'],'form_restriction is a review too; compileRecords applies its list');
 const book=make('Buch','daily',{language:'de',pos:'noun'});
 assert.deepEqual(senseForms([book],hutStage).get(book.sense_id),['bücher'],'identical inflection lines are not homographs');
 // T19-A06: plural-only headword borrows forms from the reviewed source lemma, narrowed by restriction.
 const mortals=make('hūmānī','creative',{language:'la',pos:'noun',latin_use:{state:'literary',evidence:'fixture'}});
 const linked={...mortals,evidence:{...mortals.evidence,form_source_lemma:{lemma:'humanus',pos:'noun',source:'fixture',evidence:'fixture',reviewer:'fixture'},form_restriction:{allowed:['humanos'],source:'fixture',evidence:'fixture',reviewer:'fixture'}}};
 const humanStage={lemmas:[{w:'humanus',pos:'noun',head:['hūmānus m']}],form2pos:{humanos:['humanus|noun'],humanum:['humanus|noun']}};
 assert.deepEqual(senseForms([mortals],humanStage).get(mortals.sense_id),[]);
 assert.deepEqual(senseForms([linked],humanStage).get(mortals.sense_id),['humanos','humanum']);
 assert.deepEqual(compileRecords([linked],senseForms([linked],humanStage)).bundles['la/creative'].records[0].forms,['humanos']);
 assert.throws(()=>senseForms([{...linked,evidence:{...linked.evidence,form_restriction:undefined}}],humanStage),/requires form_restriction/);
 assert.throws(()=>senseForms([{...linked,evidence:{...linked.evidence,form_source_lemma:{...linked.evidence.form_source_lemma,lemma:'absent'}}}],humanStage),/missing from source/);
 console.log('T19 homograph morphology passed: fail-closed headwords, reviewed exclusions and plural headword source');
}
// T19-A02/A03: known separate words never borrow by folding; folded forms and typed apostrophes resolve.
{
 const {lookupGuards}=await import('./t19/compile.mjs');
 const fair=make('schön','daily',{language:'de',pos:'adj'}),lightN=make('lumière','daily',{language:'fr',pos:'noun',article:'la'}),golden=make('âge d’or','creative',{language:'fr',pos:'noun',article:'l’'});
 const formsOf=new Map([[fair.sense_id,['schöne']],[lightN.sense_id,['lumières']],[golden.sense_id,[]]]);
 const known=new Map([['schon',new Set(['schon|adv'])],['schone',new Set(['schonen|verb'])],['schön',new Set(['schön|adj'])],['schöné',new Set(['schön|adj'])],['unrelated',new Set(['unrelated|noun'])]]);
 assert.deepEqual(lookupGuards([fair],formsOf,known,'de'),['schon','schone'],'own spellings, same-headword variants and non-colliding words are not guarded');
 assert.deepEqual(lookupGuards([fair,pending],formsOf,known,'fr'),[]);
 const withExcluded={...fair,evidence:{...fair.evidence,form_homographs:{excluded:['schoné'],source:'f',evidence:'f',reviewer:'f'}}};
 assert.ok(lookupGuards([withExcluded],new Map([[fair.sense_id,['schoné'.normalize('NFC').replace('é','è')]]]),new Map(),'de').includes('schoné'),'reviewed other-homograph forms are guarded when they collide');
 const rows=[fair,lightN,golden];
 Object.defineProperty(rows,'formsBySense',{value:Object.fromEntries(formsOf)});
 Object.defineProperty(rows,'guards',{value:{schon:true,schone:true}});
 const ask=query=>store.queryEntries(rows,query,opts);
 assert.deepEqual(ask('schon'),[]);assert.deepEqual(ask('schone'),[]);assert.equal(ask('schön')[0].tier,0);assert.equal(ask('schöne')[0].tier,1);
 assert.deepEqual(ask('lumiere').map(g=>[g.tier,g.entry[0],g.entry[2]]),[[2,'lumière','la']]);
 assert.deepEqual(ask('lumieres').map(g=>[g.tier,g.entry[0],g.entry[2],g.lemma]),[[3,'lumieres','','lumière']],'folded form keeps typed spelling and no lemma article');
 assert.deepEqual(ask('lumières').map(g=>[g.tier,g.entry[0],g.entry[2]]),[[1,'lumières','']]);
 for(const typed of ["age d'or","âge d'or","Âge d`or","âge dʼor"])assert.equal(ask(typed)[0].lemma,'âge d’or',typed);
 assert.equal(ask("âge d'or")[0].tier,0,'apostrophe variants are the same exact spelling');
 for(const part of ['age','âge','or',"d'or"])assert.deepEqual(ask(part),[],'a word of a phrase does not match the phrase');
 const unguarded=[fair];Object.defineProperty(unguarded,'formsBySense',{value:Object.fromEntries(formsOf)});
 assert.equal(store.queryEntries(unguarded,'schon',opts)[0].tier,2,'schema 2 bundles without guards keep the old fallback');
 await assert.rejects(store.load('review/t19-batches/t19-batch50-20261111/compiled','de',async f=>{const r=await read(f);if(f.endsWith('/index.json'))delete r.value.guards;return r;}),/invalid lookup guards/);
 console.log('T19 lookup guards passed: no borrowing by folding, folded forms, apostrophes and phrase isolation');
}

// A spelling owned by one admitted sense must not reopen another sense's
// explicitly excluded homograph through a folded lemma or folded form.
{
 const {lookupGuards}=await import('./t19/compile.mjs');
 const latin=extra=>({language:'la',latin_use:{state:'literary',evidence:'fixture'},...extra});
 const walk=make('vādō','creative',latin({pos:'verb'}));
 const eat=make('edō','daily',latin({pos:'verb'}));
 const excluded=(r,form)=>({...r,evidence:{...r.evidence,form_homographs:{excluded:[form],source:'fixture',evidence:'other headword',reviewer:'fixture'}}});
 const shore=make('vadum','daily',latin({pos:'noun'})),temple=make('aedis','historical-cultural',latin({pos:'noun'}));
 const records=[excluded(walk,'vadō'),excluded(eat,'ēdis'),shore,temple];
 const forms=new Map([[walk.sense_id,['vādere']],[eat.sense_id,['edis']],[shore.sense_id,['vadō']],[temple.sense_id,['ēdis']]]);
 const guards=lookupGuards(records,forms,new Map(),'la');
 assert.ok(!guards.includes('vadō')&&!guards.includes('ēdis'),'legitimate exact owners must remain queryable');
 Object.defineProperty(records,'formsBySense',{value:Object.fromEntries(forms)});
 Object.defineProperty(records,'guards',{value:Object.fromEntries(guards.map(g=>[g,true]))});
 const query=text=>store.queryEntries(records,text,opts);
 assert.deepEqual(query('vadō').map(g=>[g.lemma,g.tier]),[['vadum',1]],'excluded lemma fallback stays closed');
 assert.deepEqual(query('ēdis').map(g=>[g.lemma,g.tier]),[['aedis',1]],'excluded form fallback stays closed');
 assert.ok(query('vādō').some(g=>g.lemma==='vādō'&&g.tier===0),'the admitted lemma is unchanged');
 assert.ok(query('edis').some(g=>g.lemma==='edō'&&g.tier===1),'legitimate unmarked form remains');
 assert.ok(query('vadere').some(g=>g.lemma==='vādō'&&g.tier===3),'unexcluded folded form remains');
 console.log('T19 per-sense lookup guards passed: other exact owners survive without reopening excluded homographs');
}

// T19-R51-H1: a reviewed sense can be query-only. It keeps lemma and form lookup
// but never enters default, expanded or random selection, and ranks after recommendable senses.
{
 const P=(await import('../app/assets/lexicon-policy.js')).default;
 const latin=extra=>({language:'la',latin_use:{state:'literary',evidence:'fixture'},...extra});
 const white=make('albus','daily',latin({pos:'adj'})),dawnBase=make('alba','creative',latin({pos:'noun'})),harp=make('harpa','historical-cultural',latin({pos:'noun'}));
 const only=r=>({...r,evidence:{...r.evidence,query_only:{reason:'single citation',source:'user decision',reviewer:'fixture'}}});
 const dawn=only(dawnBase),rows=[white,dawn,only(harp)];
 Object.defineProperty(rows,'formsBySense',{value:{[white.sense_id]:['alba','albam'],[dawn.sense_id]:['albam'],[harp.sense_id]:[]}});
 assert.equal(P.queryOnly(dawn),true);assert.equal(P.queryOnly(white),false);
 assert.deepEqual(store.select(rows,opts).map(m=>m.record.display),['albus']);
 assert.deepEqual(store.select(rows,{...opts,mode:'expanded',expanded:['historical-cultural']}).map(m=>m.record.display),['albus'],'expanding its category does not reveal a query-only sense');
 assert.deepEqual(store.queryEntries(rows,'alba',opts).map(g=>[g.lemma,g.tier]),[['albus',1],['alba',0]],'recommendable form match precedes query-only exact lemma');
 assert.deepEqual(store.queryEntries(rows,'albam',opts).map(g=>g.lemma),['albus','alba'],'forms of a query-only sense stay queryable');
 assert.equal(store.queryEntries(rows,'harpa',opts).length,1);
 const everything=rows.map(record=>({record,tier:0,blocked:false}));
 assert.deepEqual(store.sample(everything,3,{random:()=>0.5}).map(m=>m.record.display),['albus'],'sampling rejects query-only senses even when handed to it');
 assert.throws(()=>store.select([{...dawnBase,evidence:{...dawnBase.evidence,query_only:{reason:'x'}}}],opts),/requires reason, source and reviewer/);
 assert.equal(store.select([{...dawn,review:{state:'pending'}}],{...opts,mode:'query',query:'alba'}).length,0,'the mark never admits an unreviewed sense');
 console.log('T19 query-only senses passed: hidden from default/expanded/random, lemma and forms queryable, ranked last');
}
