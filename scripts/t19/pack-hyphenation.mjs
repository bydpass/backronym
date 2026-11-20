// 冻结已准入长词的断词点。npm run packs 使用批次快照，干净检出无需原始 TeX 数据。
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

export function buildHyphenation(compiled) {
  const result = {};
  const old = JSON.parse(fs.readFileSync(new URL('./pack-hyphenation.json',import.meta.url)));
  const index = JSON.parse(fs.readFileSync(path.join(compiled,'index.json')));
  for (const lang of ['en','fr','de','es','it','la']) {
    const stem = lang === 'en' ? 'scripts/.cache/hyph/hyph-en-us' :
      'scripts/.cache/v003/tex-hyphen/hyph-' + (lang === 'de' ? 'de-1996' : lang);
    const patterns = new Map(), exceptions = new Map();
    for (const pattern of fs.readFileSync(stem+'.pat.txt','utf8').trim().split(/\s+/)) {
      let letters = '', values = [0];
      for (const ch of pattern) {
        if (/\d/.test(ch)) values[values.length-1] = Number(ch);
        else { letters += ch; values.push(0); }
      }
      patterns.set(letters,values);
    }
    if (lang === 'en') for (const example of fs.readFileSync(stem+'.hyp.txt','utf8').trim().split(/\s+/)) {
      let length = 0;
      const parts = example.split('-');
      exceptions.set(parts.join(''),parts.slice(0,-1).map(piece => length += piece.length));
    }
    const points = result[lang] = {};
    for (const bundle of index.bundles.filter(b=>b.language===lang)) {
      for (const {metadata} of JSON.parse(fs.readFileSync(path.join(compiled,bundle.path))).records) {
        const word = metadata.display.normalize('NFC').toLowerCase();
        if ([...word].length <= 10 || !/^\p{L}+$/u.test(word) || points[word]) continue;
        const key = lang === 'la' ? word.normalize('NFD').replace(/\p{M}/gu,'') : word;
        const prior = old[lang][word] || old[lang][key] || exceptions.get(key);
        if (prior) { points[word] = prior; continue; }
        // TeX 的奇数权重给出许可断点。en-US 右边保留三个字符，其余与旧生成器一致。
        const chars = ['.', ...key, '.'], scores = new Array(chars.length+1).fill(0);
        for (let start=0;start<chars.length;start++) for (let end=start+1;end<=chars.length;end++) {
          const values = patterns.get(chars.slice(start,end).join(''));
          if (values) values.forEach((v,k)=>{scores[start+k]=Math.max(scores[start+k],v);});
        }
        const breaks = [];
        for (let n=2;n<=[...key].length-(lang==='en'?3:2);n++) if (scores[n+1]%2) breaks.push(n);
        points[word] = breaks;
      }
    }
  }
  return result;
}
if(process.argv[1] && path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const [compiled,out]=process.argv.slice(2);
  fs.writeFileSync(out,JSON.stringify(buildHyphenation(compiled))+'\n');
}
