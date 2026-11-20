// 核实 S3、S4（只读）：S3 反查表能否由中文栏推出；S4 词形门控 16 位与 10 位的误判、节省与多加载
const vm=require('vm'),fs=require('fs'),zlib=require('zlib'),path=require('path');
const root=process.argv[2]+'/app/assets/';
const S=require(path.resolve(process.argv[2],'app/assets/lexicon-store.js'));
const store={},ctx={console};ctx.window=ctx;ctx.LANGPACK={put:(l,p,v)=>{(store[l]=store[l]||{})[p]=v;}};vm.createContext(ctx);
const LANGS=['en','fr','de','es','it','la'],raw={};
const z=s=>zlib.deflateRawSync(Buffer.from(s),{level:9}).length;
for(const l of LANGS)for(const p of ['words','inflections']){const t=fs.readFileSync(root+'lang/'+l+'/'+p+'.js','utf8');raw[l+p]=t;vm.runInContext(t,ctx);}
store.en=Object.assign(store.en||{},{lexicon:ctx.LEXICON_EN,words:ctx.WORDS});
const fold=s=>String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/ß/g,'ss').replace(/œ/g,'oe').replace(/æ/g,'ae');
const exact=s=>String(s).normalize('NFC').toLowerCase();
const alphabet='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
function bits(text,size){let a=2166136261,b=5381;for(let i=0;i<text.length;i++){a=Math.imul(a^text.charCodeAt(i),16777619);b=Math.imul(b,33)^text.charCodeAt(i);}return [(a>>>0)%size,(b>>>0)%size];}
function gate(keys,per){const arr=new Uint8Array(Math.ceil(keys.size*per/6));for(const k of keys)for(const b of bits(k,arr.length*6))arr[Math.floor(b/6)]|=1<<(b%6);return Array.from(arr,n=>alphabet[n]).join('');}
const pct=(a,b)=>b?(100*a/b).toFixed(2)+'%':'-';
console.log('===== S3 =====');
let s3={save:0,ms:0,ok:true,aliasZ:0};const aliasJson=new Set();
for(const l of LANGS){
  const lex=store[l].lexicon,t0=process.hrtime.bigint();
  let derived;const runs=[];
  for(let r=0;r<9;r++){const a=process.hrtime.bigint();derived=Object.create(null);lex.senses.forEach((row,i)=>{const k=lex.aliases[row[3]]||row[3];(derived[k]||(derived[k]=[])).push(i);});runs.push(Number(process.hrtime.bigint()-a)/1e6);}
  runs.sort((a,b)=>a-b);
  // S3 已实现后（lexicon.v >= 4）包里没有 reverse：这一段只剩现建耗时有意义，对照与实省看 11-20 的核实记录
  const packed=Object.keys(lex).includes('reverse')?lex.reverse:null;
  const same=packed?JSON.stringify(derived)===JSON.stringify(packed):'（包里已无 reverse）';   // 键、键的先后、每个行号表都相同
  const piece=',"reverse":'+JSON.stringify(packed),has=!!packed&&raw[l+'words'].includes(piece);
  const save=has?z(raw[l+'words'])-z(raw[l+'words'].replace(piece,'')):NaN;
  const usedAlias=Object.keys(lex.aliases).filter(k=>lex.senses.some(r=>r[3]===k)).length;
  aliasJson.add(JSON.stringify(lex.aliases));
  console.log(l,'逐条相同',same,'键',Object.keys(derived).length,'实省',save,'B 重建中位',runs[4].toFixed(2),'ms；aliases 共',Object.keys(lex.aliases).length,'条，本语言用到',usedAlias,'压缩',z(JSON.stringify(lex.aliases)),'B');
  s3.save+=save;s3.ms+=runs[4];s3.ok=s3.ok&&same===true&&has;s3.aliasZ+=z(JSON.stringify(lex.aliases));
}
console.log(Object.keys(store.en.lexicon).includes('reverse')?'S3 合计：六语逐条相同 '+s3.ok+' 实省 '+s3.save+' B，重建合计':'S3 已实现，包里没有 reverse（核实时：六语逐条相同、实省 208,973 B）；现建合计',s3.ms.toFixed(1),'ms（本机 Node）；aliases 六语内容相同',aliasJson.size===1,'六份压缩合计',s3.aliasZ,'B');
console.log('===== S4 =====');
let s4={save:0};
for(const l of LANGS){
  const lex=store[l].lexicon,inf=store[l].inflections,keys=new Set(),lemmas=new Set();
  for(const row of inf.entries){const d=lex.senses[row[0]][1];for(const f of S.rowForms(inf,row).list)if(exact(f)!==exact(d))keys.add(fold(f.replace(/[’ʼ‘`´]/g,"'")));}
  for(const s of lex.senses)lemmas.add(fold(s[1].replace(/[’ʼ‘`´]/g,"'")));
  const g16=gate(keys,16),g10=gate(keys,10),rebuilt=g16===lex.formGate;
  const may=(g,k)=>!!g&&bits(k,g.length*6).every(b=>(alphabet.indexOf(g[Math.floor(b/6)])&(1<<(b%6)))!==0);
  for(const k of keys)if(!may(g10,k))throw new Error('10 位漏掉真词形 '+k);
  const fp=(g,probes)=>{let n=0,h=0;for(const k of probes){if(keys.has(k))continue;n++;if(may(g,k))h++;}return [h,n];};
  const others=new Set();for(const o of LANGS)if(o!==l)for(const s of store[o].lexicon.senses)others.add(fold(s[1]));
  const prefixes=new Set();for(const w of lemmas)for(let i=1;i<w.length;i++)prefixes.add(w.slice(0,i));
  const A16=fp(g16,lemmas),A10=fp(g10,lemmas),B16=fp(g16,others),B10=fp(g10,others),C16=fp(g16,prefixes),C10=fp(g10,prefixes);
  // 打字模拟：逐字符打出本语言每个词头，任一前缀（含整词）过了门控就会去读词形表
  let n=0,real=0,t16=0,t10=0;
  for(const w of lemmas){if(w.length<2)continue;n++;let r=false,a=false,b=false;for(let i=1;i<=w.length;i++){const p=w.slice(0,i);if(keys.has(p))r=true;if(may(g16,p))a=true;if(may(g10,p))b=true;}real+=r;t16+=a;t10+=b;}
  const piece='"formGate":'+JSON.stringify(lex.formGate),has=raw[l+'words'].includes(piece);
  const save=has?z(raw[l+'words'])-z(raw[l+'words'].replace(piece,'"formGate":'+JSON.stringify(g10))):NaN;s4.save+=save;
  console.log(l,'词形键',keys.size,'16位重算与包一致',rebuilt,'| 误判 本语词头',pct(...A16),'→',pct(...A10),' 他语词头',pct(...B16),'→',pct(...B10),' 词头前缀',pct(...C16),'→',pct(...C10),'| 打一个词头就触发加载：真词形前缀',pct(real,n),' 16位',pct(t16,n),' 10位',pct(t10,n),'| 实省',save,'B');
}
console.log('S4 合计实省',s4.save,'B');
