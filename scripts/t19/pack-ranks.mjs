// One-off snapshot: corpus ranks of the words that the T19 lexicon keeps, read from the
// packs of the old pipeline before they are replaced. Used only to order candidates
// inside one initial letter; higher means more common. `node scripts/t19/pack-ranks.mjs <compiled> <out.json>`
import fs from 'node:fs';
import assert from 'node:assert/strict';
const [compiled,out]=process.argv.slice(2);assert.ok(compiled&&out&&!fs.existsSync(out),'Usage: pack-ranks.mjs <compiled-dir> <new-file.json>');
const ranks={};
for(const lang of ['en','fr','de','es','it','la']){
 const w={LANGPACK:{put(l,p,v){this[p]=v;}}};new Function('window',fs.readFileSync(`app/assets/lang/${lang}/words.js`,'utf8'))(w);
 const words=lang==='en'?w.WORDS:w.LANGPACK.words,scores=w.LANGPACK.formRanks||null;
 assert.ok(words&&(lang==='en'||scores),lang+' 不是旧管线词包，无法取词频');
 const old=new Map();for(const list of Object.values(words))list.forEach((it,i)=>old.set(it[0],scores?scores[it[0]]||0:list.length-i));
 const kept={};
 for(const f of fs.readdirSync(`${compiled}/${lang}`))for(const r of JSON.parse(fs.readFileSync(`${compiled}/${lang}/${f}`)).records){
  const d=r.metadata.display,v=old.has(d)?old.get(d):old.get(d.toLowerCase());if(v)kept[d]=v;}
 ranks[lang]=Object.fromEntries(Object.entries(kept).sort((a,b)=>a[0].localeCompare(b[0])));
}
fs.writeFileSync(out,JSON.stringify(ranks,null,0).replace(/("(?:en|fr|de|es|it|la)":)/g,'\n$1')+'\n');
console.log(Object.entries(ranks).map(([l,r])=>l+':'+Object.keys(r).length).join(' '));
