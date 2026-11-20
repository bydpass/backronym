// S0 基线量测（只读）：按 plans/v00.03.02/PLAN.md 第一、二档的编码在内存里重排，deflate 9 级比大小；不写解码、不改文件
const vm=require('vm'),fs=require('fs'),zlib=require('zlib');
const root=process.argv[2]+'/app/assets/';
const store={},ctx={console};ctx.window=ctx;const put=(l,p,v)=>{(store[l]=store[l]||{})[p]=v;};
ctx.LANGPACK={put};vm.createContext(ctx);
const LANGS=['en','fr','de','es','it','la'];
const z=s=>zlib.deflateRawSync(Buffer.from(s),{level:9}).length;
const raw={};
for(const l of LANGS)for(const p of ['words','inflections']){const t=fs.readFileSync(root+'lang/'+l+'/'+p+'.js','utf8');raw[l+p]=t;vm.runInContext(t,ctx);}
// 英语主包走旧全局接口
if(!store.en||!store.en.lexicon)store.en=Object.assign(store.en||{},{lexicon:ctx.LEXICON_EN});
if(process.argv[3]==='keys'){for(const l of LANGS){console.log(l,Object.keys(store[l]),store[l].lexicon&&Object.keys(store[l].lexicon),JSON.stringify(store[l].lexicon.senses[0]),JSON.stringify(store[l].inflections.entries[0]).slice(0,200));}process.exit();}
// S1 已实现后（lexicon.v >= 3）包里已是短 ID 与下标，下面的 S1 重排是恒等变换，S1 两栏等于现状，只有 S2 以后的数还有意义
const done=store.en.lexicon.v>=3;
// 短 ID：全部义项哈希六语统一排序后的名次，3 位 base36
const all=[];for(const l of LANGS)for(const s of store[l].lexicon.senses)all.push(s[0]);
all.sort();const short=new Map(all.map((id,i)=>[id,i.toString(36).padStart(3,'0')]));
let tot={base:0,s1:0,s2:0,s3:0,gate:0,senses:all.length};const rows=[];
for(const l of LANGS){
  const lex=store[l].lexicon,inf=store[l].inflections;
  const idx=new Map(lex.senses.map((s,i)=>[s[0],i]));
  let w=raw[l+'words'],f=raw[l+'inflections'];
  const bw=z(w),bf=z(f);
  // S1：words.js 里的哈希换短 ID；inflections 每行改引用义项下标
  let w1=w;if(!done)for(const s of lex.senses)w1=w1.split('"'+s[0]+'"').join('"'+short.get(s[0])+'"');
  const e1=done?inf.entries:inf.entries.map(r=>[idx.get(r[0]),...r.slice(1)]);
  const f1=done?f:f.replace(JSON.stringify(inf.entries),JSON.stringify(e1));
  const okf=done||f1!==f;
  // S2：词形 ≥4 个的行拆成词干（最长公共前缀）+ 词尾串，词尾串去重成表
  // 词形包 v3（批 S2 已实现）已经拆过干：这一栏等于现状
  const split=inf.v>=3;
  const table=new Map(),e2=split?e1:e1.map(r=>{const forms=r[1].split(' ');if(forms.length<4)return r;
    let p=forms[0];for(const x of forms){let i=0;while(i<p.length&&i<x.length&&p[i]===x[i])i++;p=p.slice(0,i);}
    const tail=forms.map(x=>x.slice(p.length)).join(' ');if(!table.has(tail))table.set(tail,table.size);
    return [r[0],p,table.get(tail),...r.slice(2)];});
  const f2=split?f:f.replace(JSON.stringify(inf.entries),JSON.stringify(e2)+','+JSON.stringify([...table.keys()]));
  // S3：去掉 reverse；S4：formGate 16→10 位（位图近随机，按比例估）
  const rev=lex.reverse?z(JSON.stringify(lex.reverse)):0, gate=lex.formGate?z(lex.formGate):0;
  const r={lang:l,senses:lex.senses.length,words:bw,infl:bf,words_s1:z(w1),infl_s1:z(f1),infl_s2:z(f2),reverse:rev,formGate:gate,replaced:okf};
  rows.push(r);tot.base+=bw+bf;tot.s1+=r.words_s1+r.infl_s1;tot.s2+=r.words_s1+r.infl_s2;tot.s3+=rev;tot.gate+=gate;
}
console.table(rows);console.log(tot,'S1省',tot.base-tot.s1,'S2再省',tot.s1-tot.s2,'S4估省',Math.round(tot.gate*6/16));
