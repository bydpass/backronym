import fs from 'node:fs';
import { legacyDir } from './legacy-packs.mjs';
const LEGACY = legacyDir(); // 旧管线词包：T19 接入后不再随包，从固定提交取出（见 legacy-packs.mjs）
import vm from 'node:vm';
import assert from 'node:assert/strict';
import { isSurfaceForm } from './t19/surface-forms.mjs';
const input = process.argv[2] || LEGACY;
const env = { window: {}, setTimeout, clearTimeout }; vm.createContext(env);
for (const file of ['core.js','lang/packs.js']) vm.runInContext(fs.readFileSync('app/assets/'+file,'utf8'),env);
for (const lang of ['fr','de','es','it','la']) {
  vm.runInContext(fs.readFileSync(`app/assets/lang/${lang}/rules.js`,'utf8'),env);
  vm.runInContext(fs.readFileSync(`${input}/${lang}/words.js`,'utf8'),env);
}
const {CORE:C,LANGPACK:P}=env.window;
function lookup(lang,word){C.useLang(lang);return C.resolveEntry(P.get(lang,'words'),P.get(lang,'phrases'),P.get(lang,'forms'),word,P.get(lang,'formRanks'),P.get(lang,'lookupGuards'));}
for(const [lang,word,lemma] of [['es','tenía','tener'],['es','mató','matar'],['es','tomó','tomar'],['es','irá','ir'],['fr','va','aller'],['fr','vais','aller'],['fr','suis','être'],['it','è','essere'],['de','Fahrern','Fahrer']]) {
  const hit=lookup(lang,word);assert.equal(hit?.kind,'form',word);assert.equal(hit.lemma,lemma,word);assert.equal(hit.match,'exact',word);
}
assert.equal(lookup('fr','ami').entry[0],'ami'); assert.equal(lookup('it','cosa').entry[0],'cosa');
assert.equal(lookup('de','Zahler'),null,'known omitted lemma must not borrow Zähler');
assert.equal(lookup('de','Zähler').entry[0],'Zähler');
for(const w of ['weak','strong','hamse']) assert.equal(lookup('de',w),null,w+' must not map through table headers or unrelated POS');
assert.equal(lookup('de','habens').lemma,'Haben','retain source-attested genitive of the accounting noun');
assert.equal(lookup('de','sein').entry[0],'sein'); assert.equal(lookup('de','Sein').entry[0],'Sein');
assert.equal(lookup('la','amo').entry[0],'amō','valid unaccented fallback retained');
for(const tag of ['table-tags','auxiliary','multiword-construction']) assert.equal(isSurfaceForm({form:'haben',tags:[tag]}),false);
assert.equal(isSurfaceForm({form:'strong',tags:['positive']}),true,'do not blacklist spelling');
assert.equal(isSurfaceForm({form:'èssere',tags:['infinitive']}),true);
C.useLang('es');
const W={a:[['azul','adj.蓝']],t:[['tenia','n.绦虫'],['tener','v.有']]};
const forms={tener:'tenía'},scores={tener:100};
assert.equal(C.resolveEntry(W,null,forms,'tenía',scores).lemma,'tener');
assert.equal(C.resolveEntry(W,null,forms,'tenia',scores).entry[0],'tenia','exact word before folded form');
assert.equal(C.resolveEntry(W,null,null,'tenía',scores).match,'folded','fallback without exact form');
const before=JSON.stringify(W);C.resolveEntry(W,null,forms,'tenía',scores);assert.equal(JSON.stringify(W),before);
const other={a:[['alpha','n.甲']],z:[['zeta','n.乙']]};
assert.equal(C.resolveEntry(other,null,{alpha:'shared',zeta:'shared'},'shared',{alpha:1,zeta:100}).lemma,'zeta','global scores across initials');
console.log('lookup regression passed: exact words/forms before folded fallback, homographs, global scores, source-tag filtering, POS boundaries, valid Latin fallback');
