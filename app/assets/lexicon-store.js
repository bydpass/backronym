/* Category bundles remain separate. No pending senses or missing blocker can be displayed. */
(function(root){
  'use strict';
  const P=typeof module==='object'&&module.exports?require('./lexicon-policy.js'):root.LEXICON_POLICY;
  function check(ok,message){if(!ok)throw new Error(message);}
  async function load(base,language,read){
    check(/^(en|fr|de|es|it|la)$/.test(language),'unknown language');
    const index=(await read(base+'/index.json')).value;
    check((index.schema===1||index.schema===2||index.schema===3)&&Array.isArray(index.bundles),'invalid bundle index');
    const formsBySense=index.schema>=2?Object.create(null):null;
    // Schema 3: source spellings that are other words and must not be accent-folded.
    let guards=null;
    if(index.schema===3){
      const list=index.guards&&index.guards[language];
      check(Array.isArray(list)&&list.every(s=>typeof s==='string'&&s.length>0),'invalid lookup guards');
      guards=Object.create(null);for(const s of list)guards[s]=true;
    }
    const selected=index.bundles.filter(b=>b.language===language),seen=new Set(),records=[];
    for(const item of selected){
      const spec=P.CATEGORIES[item.category];
      check(spec&&(item.path===language+'/'+item.category+'.json'||new RegExp('^'+language+'/'+item.category+'-\\d{3}\\.json$').test(item.path)),'invalid bundle path/category'); // 大类别分成 -001、-002… 几个文件（compile.mjs）
      check(!seen.has(item.path),'duplicate bundle');seen.add(item.path);
      check(item.weight===spec.weight&&item.visibility===spec.visibility,'index scope mismatch');
      const result=await read(base+'/'+item.path);
      check(result.sha256===item.sha256,'bundle checksum mismatch');
      const b=result.value;
      check(b.language===language&&b.category===item.category&&b.weight===spec.weight&&b.visibility===spec.visibility,'bundle scope mismatch');
      check(Array.isArray(b.records)&&b.records.length===item.rows,'bundle count mismatch');
      for(const r of b.records){
        const m=r.metadata;
        check(m&&m.language===language&&m.category===item.category&&r.sense_id===m.sense_id,'sense identity mismatch');
        check(!P.admission(m),'bundle contains unadmitted sense');
        check(Array.isArray(r.row)&&r.row.length===4&&r.row[0]===m.display,'invalid compatibility row');
        if(formsBySense){check(Array.isArray(r.forms)&&r.forms.every(f=>typeof f==='string'&&f.length>0),'invalid sense forms');formsBySense[m.sense_id]=r.forms.slice();}
        check(!seen.has(m.sense_id),'duplicate sense');seen.add(m.sense_id);records.push(m);
      }
    }
    if(formsBySense)Object.defineProperty(records,'formsBySense',{value:formsBySense});
    if(guards)Object.defineProperty(records,'guards',{value:guards});
    return records;
  }
  function browserReader(environment){
    return async function(url){
      const e=environment;
      check(e&&typeof e.fetch==='function'&&typeof e.TextDecoder==='function'&&e.crypto&&e.crypto.subtle&&typeof e.crypto.subtle.digest==='function',
        '当前环境不支持安全读取词库，请在本机 localhost 或 HTTPS 浏览器中打开');
      const response=await e.fetch(url,{cache:'no-store'});
      check(response.ok,'无法读取类别包');
      const bytes=await response.arrayBuffer(),hash=await e.crypto.subtle.digest('SHA-256',bytes);
      return {value:JSON.parse(new e.TextDecoder().decode(bytes)),sha256:Array.from(new Uint8Array(hash),v=>v.toString(16).padStart(2,'0')).join('')};
    };
  }
  // One controller per consumer. No global language selection or persistent
  // cache: a failed/new load cannot expose records from the previous language.
  function createLoader({base,read,prepare,ready,timeout=15000}){
    check(typeof read==='function'&&typeof prepare==='function'&&typeof ready==='function','loader dependencies required');
    check(Number.isFinite(timeout)&&timeout>0,'invalid load timeout');
    let serial=0;
    async function request(code){
      const mine=++serial;let timer;
      try{
        const result=await Promise.race([
          Promise.all([prepare(code),load(base,code,read)]),
          new Promise((resolve,reject)=>{timer=setTimeout(()=>reject(Error('词库加载超时')),timeout);})
        ]);
        if(mine!==serial||result[0].stale)return {code,ok:false,stale:true,records:null};
        check(result[0].ok&&ready(code),'语言包或屏蔽器未就绪');
        return {code,ok:true,stale:false,records:result[1]};
      }catch(error){return {code,ok:false,stale:mine!==serial,records:null,error};}
      finally{clearTimeout(timer);}
    }
    return {load:request,cancel:()=>{serial++;}};
  }
  function select(records,options){
    const {mode='default',expanded=[],query='',exact,fold,blocked}=options;
    check(typeof blocked==='function'&&typeof exact==='function'&&typeof fold==='function','language and blocker required');
    // Typed apostrophes are one character for lookup: age d'or finds âge d’or.
    const plain=s=>String(s).replace(/[\u2019\u02BC\u2018\u0060\u00B4]/g,"'");
    const ex=s=>exact(plain(s)),fo=s=>fold(plain(s));
    const q=query.trim(),matches=[],eq=q?ex(q):'',fq=q?fo(q):'';
    // A known separate word never borrows another word's meaning by folding.
    const guarded=!!(q&&records.guards&&records.guards[eq]===true);
    for(const record of records){
      let tier=0, matchedForm, matchedForms;
      if(q){
        const forms=records.formsBySense ? records.formsBySense[record.sense_id]||[] : String((options.forms||{})[record.display]||'').split(' ');
        if(ex(record.display)===eq)tier=0;
        else if(forms.some(f=>f&&ex(f)===eq)){tier=1;matchedForm=forms.find(f=>f&&ex(f)===eq);}
        // Another admitted sense may legitimately own this exact spelling,
        // so the global guard can be absent. A reviewed exclusion still bars
        // this particular sense from borrowing it through either folded tier.
        else if(guarded||(record.evidence.form_homographs&&record.evidence.form_homographs.excluded.some(f=>ex(f)===eq)))continue;
        else if(fo(record.display)===fq)tier=2;
        else if(forms.some(f=>f&&fo(f)===fq)){
          tier=3;
          const variants=forms.filter(f=>f&&fo(f)===fq);
          if(variants.length===1)matchedForm=variants[0];
          matchedForms=variants;
        }
        else continue;
      }
      // Headwords can differ only in case (sein/Sein, pierre/Pierre). Keep
      // case-insensitive alternatives, but prefer the requested spelling.
      const caseRank=q&&tier===0&&record.display.normalize('NFC')!==q.normalize('NFC')?1:0;
      matches.push({record,tier,caseRank,matchedForm,matchedForms});
    }
    return P.rankMatches(matches,{mode,expanded,query:q}).map(m=>Object.assign({},m,{blocked:!!((q&&blocked(q))||blocked(m.record.display)||blocked(m.record.zh))}));
  }
  // 漏音符：输入只缺音符时（publico → público）候选才可以补上。输入里已有的音符必须原样出现在候选里，
  // 所以 publicó 不会变成 público。字符数对不上（strasse → straße）时，输入里不能带任何音符。
  const MARK=/[\u0300-\u036f]/;
  function letterUnits(text){
    const out=[];
    for(const ch of String(text).replace(/[\u2019\u02BC\u2018\u0060\u00B4]/g,"'").normalize('NFD').toLowerCase()){
      if(MARK.test(ch)&&out.length)out[out.length-1].marks+=ch;else out.push({base:ch,marks:''});
    }
    return out;
  }
  function onlyAddsMarks(typed,spelling){
    const a=letterUnits(typed),b=letterUnits(spelling);
    if(a.length!==b.length)return a.every(u=>!u.marks);
    return a.every((u,i)=>u.base===b[i].base&&(u.marks===''||u.marks===b[i].marks));
  }
  // Query results for the editor's four-column row contract. Keep distinct
  // lemmas/match tiers separate; only matched senses may contribute glosses.
  // senseIds maps legacy UI group IDs to authoritative, persistent sense IDs.
  // options.completion（运行时查词用）：去音符才撞上的写法（tier 2/3）只留下「补上缺失音符」的拼写，
  // 每个拼写各成一组、显示带音符的拼写，结果上标 leak；精确命中（tier 0/1）不受影响。
  function queryEntries(records,query,options){
    const matches=select(records,Object.assign({},options,{mode:'query',query}));
    const completion=!!(options&&options.completion),typed=String(query).trim();
    const groups=[],byKey=new Map();
    const pos={noun:'n.',name:'n.',verb:'v.',adj:'adj.',adv:'adv.',num:'num.',pron:'pron.'}; // pron：v00.03.01 L05 代词类别
    for(const match of matches){
      if(match.blocked)continue;
      const r=match.record;
      if(completion&&match.tier>=2){
        const spellings=(match.tier===2?[r.display]:match.matchedForms||[]).filter(f=>onlyAddsMarks(typed,f));
        for(const spelling of spellings){
          const leakKey=JSON.stringify([r.language,r.display,match.tier,match.caseRank,spelling]);
          let leakGroup=byKey.get(leakKey);
          if(!leakGroup){leakGroup={lemma:r.display,tier:match.tier,spelling,leak:true,matches:[]};byKey.set(leakKey,leakGroup);groups.push(leakGroup);}
          leakGroup.matches.push(match.tier===2?match:Object.assign({},match,{matchedForm:spelling}));
        }
        continue;
      }
      const key=JSON.stringify([r.language,r.display,match.tier,match.caseRank]);
      let group=byKey.get(key);
      if(!group){group={lemma:r.display,tier:match.tier,matches:[]};byKey.set(key,group);groups.push(group);}
      group.matches.push(match);
    }
    return groups.map(group=>{
      const inflected=group.tier===1||group.tier===3;
      const counts=Object.create(null),senseIds=Object.create(null),glosses=[],articles=[],notes=[];
      for(const match of group.matches){
        const r=match.record,tag=pos[r.pos],n=(counts[tag]||0)+1;counts[tag]=n;
        senseIds[tag+(n>1?'#'+n:'')]=r.sense_id;
        glosses.push(tag+r.zh);
        if(tag==='n.'){
          let article=r.pos==='name'?'':r.article||'';
          if(inflected){
            const form=match.matchedForm&&match.matchedForm.normalize('NFC').toLowerCase();
            const forms=r.evidence.noun_forms;
            const variant=forms&&Object.prototype.hasOwnProperty.call(forms,form)&&forms[form];
            article=variant&&variant.number==='sg'?variant.article:'';
          }
          articles.push(article);
        }
        if(r.note&&notes.indexOf(r.note)<0)notes.push(r.note);
      }
      let display=group.lemma;
      if(inflected){
        display=(group.leak?group.spelling:query.trim()).toLowerCase();
        if(group.lemma[0]!==group.lemma[0].toLowerCase())display=display[0].toUpperCase()+display.slice(1);
      }
      const result={entry:[display,glosses.join('|'),articles.some(Boolean)?articles.join('|'):'',notes.join('；')],
        lemma:group.lemma,tier:group.tier,senseIds,matches:group.matches};
      if(group.leak)result.leak=true;
      return result;
    });
  }
  // Exponential races give weighted sampling without replacement. Select gates
  // the candidate pool first; query-only records never enter a random sample.
  function sample(matches,count,{random=Math.random,includeBlocked=false}={}){
    check(Number.isSafeInteger(count)&&count>=0,'invalid sample count');
    check(typeof random==='function','random source required');
    const seen=new Set(),pool=[];
    if(!count)return [];
    for(const match of matches){
      const r=match.record,spec=P.CATEGORIES[r.category];
      if(!spec||spec.visibility==='query'||P.queryOnly(r)||P.admission(r)||(!includeBlocked&&match.blocked)||seen.has(r.sense_id))continue;
      seen.add(r.sense_id);
      const u=random();check(Number.isFinite(u)&&u>=0&&u<1,'invalid random value');
      pool.push({match,key:-Math.log1p(-u)/P.weightOf(r)}); // 降权义项按降后的权重抽
    }
    return pool.sort((a,b)=>a.key-b.key||a.match.record.sense_id.localeCompare(b.match.record.sense_id)).slice(0,count).map(item=>item.match);
  }
  // ---- Runtime packs (scripts/t19/build-packs.mjs) ----
  // A pack carries every admitted sense as a compact row and nothing else: review
  // evidence stays in the source lexicon. fromPack restores records the policy layer
  // accepts; the constant review fields only say "this row came from a compiled pack".
  // [sense_id, display, pos, zh, article, note, category, rank, flag, excludedForms]。v1 的 rank 栏为词形串。
  // v3（v00.03.02 批 S1）结构同 v2，sense_id 是 3 位 base36 短 ID（六语统一名次，先后同原哈希）；配套的词形包 v2 每行引用义项下标。v4（批 S3）不再带 reverse，中文反查表由 core.js 现建。
  // flag 0 普通、1 只供查询、2 降权、3 只供精确查询。v2 词形在 sidecar。
  // names: [sense_id, m/f, source language] for every sense in the names category; with display and zh
  // it restores the four-field name payload. The source language belongs to the name, not to the pack.
  const COMPILED={state:'approved',reviewer:'compiled',evidence:'compiled'};
  const QUERY_ONLY={reason:'compiled',source:'compiled',reviewer:'compiled'},DEMOTED=QUERY_ONLY;
  const apostrophes=s=>String(s).replace(/[\u2019\u02BC\u2018\u0060\u00B4]/g,"'");
  // 每个去重词形约 16 bit，两次散列；允许偶尔提前加载，真正的词形始终命中。
  const alphabet='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  function formBits(text,size){
    let a=2166136261,b=5381;
    for(let i=0;i<text.length;i++){a=Math.imul(a^text.charCodeAt(i),16777619);b=Math.imul(b,33)^text.charCodeAt(i);}
    return [(a>>>0)%size,(b>>>0)%size];
  }
  function buildFormGate(keys){
    if(!keys.size)return '';
    const bits=new Uint8Array(Math.ceil(keys.size*16/6));
    for(const key of keys)for(const bit of formBits(key,bits.length*6))bits[Math.floor(bit/6)]|=1<<(bit%6);
    return Array.from(bits,n=>alphabet[n]).join('');
  }
  function mayHaveForm(gate,key){
    return !!gate&&formBits(key,gate.length*6).every(bit=>(alphabet.indexOf(gate[Math.floor(bit/6)])&(1<<(bit%6)))!==0);
  }
  // 词形包一行里的词形表（v00.03.02 批 S2）。v3 把词形多的行拆成「词干 + 词尾串」，相同的词尾串在 sidecar.tails 里只存一份：
  // [义项下标, 词干, 词尾串下标, 名词性数?]；没拆的行仍是 [义项下标, "词形 词形 …", 名词性数?]。先后与拆前相同
  function rowForms(sidecar,row){
    if(sidecar.v===3&&typeof row[2]==='number'){
      const tail=sidecar.tails[row[2]];
      check(typeof row[1]==='string'&&row[1]&&!/\s/.test(row[1])&&Number.isSafeInteger(row[2])&&typeof tail==='string','invalid inflected sense');
      const list=tail.split(' ').map(t=>row[1]+t);
      check(list.every(f=>!/\s/.test(f)),'invalid inflected sense');
      return {list,morphology:row[3],extra:row.length===4};
    }
    check(typeof row[1]==='string'&&/^\S+( \S+)*$/.test(row[1]),'invalid inflected sense');
    return {list:row[1].split(' '),morphology:row[2],extra:row.length===3};
  }
  function attachForms(lx,sidecar){
    check(sidecar&&(sidecar.v===1||sidecar.v===2||sidecar.v===3)&&Array.isArray(sidecar.entries),'invalid inflections pack');
    check(sidecar.v!==3||(Array.isArray(sidecar.tails)&&sidecar.tails.every(t=>typeof t==='string')),'invalid inflections pack');
    const byIndex=sidecar.v>=2; // v2：行首是义项在词包 senses 里的下标；v1：行首是义项 ID
    const ids=new Map(),index=Object.create(null),forms=Object.create(null),meta=new Map();
    function note(k,i){const bucket=index[k]||(index[k]=[]);if(bucket.indexOf(i)<0)bucket.push(i);}
    lx.records.forEach((r,i)=>{ids.set(r.sense_id,i);note(lx.key(r.display),i);});
    for(const row of sidecar.entries){
      check(Array.isArray(row)&&row.length>=2&&row.length<=4,'invalid inflection row');
      const ref=row[0],{list,morphology,extra}=rowForms(sidecar,row);
      check(row.length===(typeof row[2]==='number'&&sidecar.v===3?3:2)+(extra?1:0),'invalid inflection row');
      check(byIndex?Number.isSafeInteger(ref)&&ref>=0&&ref<lx.records.length:ids.has(ref),'invalid inflected sense');
      const i=byIndex?ref:ids.get(ref),id=lx.records[i].sense_id;
      check(!forms[id],'invalid inflected sense');
      forms[id]=list;
      if(extra){
        check(lx.records[i].pos==='noun'&&morphology&&typeof morphology==='object'&&!Array.isArray(morphology),'invalid noun forms');
        for(const f of Object.keys(morphology)){
          const m=morphology[f];
          check(list.indexOf(f)>=0&&m&&['m','f','n'].indexOf(m.gender)>=0&&['sg','pl'].indexOf(m.number)>=0&&typeof m.article==='string'&&(m.number==='sg'||!m.article),'invalid noun form');
        }
        meta.set(i,morphology);
      }
      for(const k of new Set(list.map(lx.key)))note(k,i);
    }
    // 校验整张表后一次性换索引；保存了 records 引用的查询也看到同一版词形。
    lx.records.forEach((r,i)=>{
      lx.forms[r.sense_id]=forms[r.sense_id]||[];
      if(meta.has(i))r.evidence.noun_forms=meta.get(i);else delete r.evidence.noun_forms;
    });
    lx.index=index;
    return lx;
  }
  function fromPack(pack,language,fold){
    check(/^(en|fr|de|es|it|la)$/.test(language),'unknown language');
    check(pack&&(pack.v===1||pack.v===2||pack.v===3||pack.v===4)&&Array.isArray(pack.senses)&&Array.isArray(pack.names)&&Array.isArray(pack.guards)&&typeof fold==='function','invalid lexicon pack');
    const named=Object.create(null),order=Object.create(null);
    for(const n of pack.names){check(Array.isArray(n)&&n.length===3&&typeof n[0]==='string'&&(n[1]==='m'||n[1]==='f')&&/^[a-z]{2,3}$/.test(n[2])&&!named[n[0]],'invalid pack name');named[n[0]]=n;}
    // 可选的义项阴阳性（11-19，法西意）：与 senses 逐行对齐，m 阳 / f 阴 / b 两性同形 / - 不标；只给候选栏、义项栏的词性缩写用
    check(pack.genders===undefined||(typeof pack.genders==='string'&&pack.genders.length===pack.senses.length&&/^[mfb-]*$/.test(pack.genders)),'invalid pack genders');
    let nameCount=0;
    const key=s=>fold(apostrophes(s)),records=[],forms=Object.create(null),index=Object.create(null),compact=Object.create(null),guards=Object.create(null),seen=new Set();
    const note=(k,i)=>{const a=index[k]||(index[k]=[]);if(a[a.length-1]!==i)a.push(i);};
    pack.senses.forEach((s,i)=>{
      check(Array.isArray(s)&&s.length===10&&s.slice(0,pack.v>=2?7:8).every(v=>typeof v==='string')&&s[0]&&s[1]&&P.CATEGORIES[s[6]],'invalid pack sense');
      check(!seen.has(s[0]),'duplicate pack sense');seen.add(s[0]);
      const evidence={};
      check(s[8]===0||s[8]===1||s[8]===2||(pack.v>=2&&s[8]===3),'invalid pack flag');
      if(pack.v>=2){check(Number.isSafeInteger(s[7])&&s[7]>=0,'invalid frequency rank');if(s[7])evidence.frequency_rank=s[7];}
      if(s[8]===1||s[8]===3)evidence.query_only=QUERY_ONLY;
      if(s[8]===3)evidence.exact_query=true;
      evidence.sense_order=order[s[1]]=(order[s[1]]||0)+1; // 词包按「显示词、义项先后」排行：同一显示词内第几行即先后（2026-11-19 返工）
      if(s[8]===2)evidence.demoted=DEMOTED;
      if(s[9])evidence.form_homographs={excluded:s[9].split(' ')};
      let payload=null;
      if(s[6]==='names'){const n=named[s[0]];check(n,'pack name lacks payload');evidence.name_origin='compiled';payload=[s[1],s[3],n[1],n[2]];nameCount++;}
      const record={sense_id:s[0],language,display:s[1],pos:s[2],zh:s[3],article:s[4],note:s[5],category:s[6],evidence,
        review:COMPILED,adverb_relation:{state:'no-adjective',evidence:'compiled'},latin_use:{state:'literary',evidence:'compiled'},name_payload:payload};
      if(pack.genders&&pack.genders[i]!=='-')record.gender=pack.genders[i];
      check(!P.admission(record),'pack sense fails admission');
      records.push(record);
      const list=forms[s[0]]=pack.v===1&&s[7]?s[7].split(' '):[];
      note(key(s[1]),i);for(const f of list)note(key(f),i);
      const c=key(s[1]).replace(/[\s'\-]/g,'');
      if(c!==key(s[1])&&!compact[c])compact[c]=s[1];
    });
    check(nameCount===pack.names.length,'pack name without sense');
    for(const g of pack.guards)guards[g]=true;
    Object.defineProperty(records,'formsBySense',{value:forms});Object.defineProperty(records,'guards',{value:guards});
    return {records,forms,index,compact,guards,key};
  }
  // 同形原词和词形均可选；单结果接口继续返回排序首项。Only senses whose
  // folded lemma or form equals the input are handed to select; tiers, per-sense
  // exclusions and guards are still decided there. A phrase may be typed without its
  // spaces, hyphens or apostrophes (goldenage → golden age).
  function packLookups(lx,text,options){
    const typed=String(text==null?'':text).trim().replace(/\s+/g,' ');
    if(!typed)return [];
    const ask=q=>{
      const hit=lx.index[lx.key(q)];if(!hit)return [];
      const subset=hit.map(i=>lx.records[i]);
      Object.defineProperty(subset,'formsBySense',{value:lx.forms});Object.defineProperty(subset,'guards',{value:lx.guards});
      return queryEntries(subset,q,Object.assign({},options,{completion:true}));
    };
    const direct=ask(typed);if(direct.length)return direct;
    const alt=lx.compact[lx.key(typed).replace(/[\s'\-]/g,'')];
    return alt?ask(alt):[];
  }
  function packLookup(lx,text,options){
    return packLookups(lx,text,options)[0]||null;
  }
  const api={load,browserReader,createLoader,select,sample,queryEntries,buildFormGate,mayHaveForm,attachForms,rowForms,fromPack,packLookup,packLookups};if(typeof module==='object'&&module.exports)module.exports=api;else root.LEXICON_STORE=api;
})(typeof window!=='undefined'?window:this);
