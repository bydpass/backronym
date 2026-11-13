import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const [input, output] = process.argv.slice(2);
assert.ok(input && output && !fs.existsSync(output), 'usage: scan-forms <lang-root> <new-output>');
const result = {}, tables = {};
for (const lang of ['fr','de','es','it','la']) {
  const packs = {}; const env = { window: { LANGPACK: { put: (l,k,v) => { packs[k] = v; } } } };
  vm.runInNewContext(fs.readFileSync(path.join(input,lang,'words.js'),'utf8'),env);
  const inverse = new Map();
  for (const [lemma, forms] of Object.entries(packs.forms)) for (const form of new Set(forms.split(' ').filter(Boolean))) {
    if (!inverse.has(form)) inverse.set(form,new Set()); inverse.get(form).add(lemma);
  }
  const rows = [...inverse].map(([form,lemmas])=>({form,degree:lemmas.size,lemmas:[...lemmas].sort()})).sort((a,b)=>b.degree-a.degree||a.form.localeCompare(b.form));
  const degrees = rows.map(r=>r.degree).sort((a,b)=>a-b);
  const quantile = p => degrees[Math.max(0,Math.ceil(degrees.length*p)-1)] || 0;
  const histogram = {}; for(const degree of degrees) histogram[degree]=(histogram[degree]||0)+1;
  result[lang]={forms:rows.length,edges:degrees.reduce((a,b)=>a+b,0),p50:quantile(.5),p95:quantile(.95),p99:quantile(.99),max:quantile(1),histogram,tail:rows.slice(0,20),above20:rows.filter(r=>r.degree>20),note:'degree >20 is a diagnostic flag, not automatic rejection'};
  tables[lang]='form\tdegree\tlemmas\n'+rows.map(r=>r.form+'\t'+r.degree+'\t'+JSON.stringify(r.lemmas)).join('\n')+'\n';
}
fs.mkdirSync(output); for(const [lang,table] of Object.entries(tables))fs.writeFileSync(path.join(output,lang+'.tsv'),table,{flag:'wx'});
fs.writeFileSync(path.join(output,'summary.json'),JSON.stringify(result,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify(Object.fromEntries(Object.entries(result).map(([l,r])=>[l,{forms:r.forms,edges:r.edges,p99:r.p99,max:r.max,above20:r.above20.map(x=>[x.form,x.degree])}]))));
