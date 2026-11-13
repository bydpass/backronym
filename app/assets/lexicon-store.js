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
      check(spec&&item.path===language+'/'+item.category+'.json','invalid bundle path/category');
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
      let tier=0;
      if(q){
        const forms=records.formsBySense ? records.formsBySense[record.sense_id]||[] : String((options.forms||{})[record.display]||'').split(' ');
        if(ex(record.display)===eq)tier=0;
        else if(forms.some(f=>f&&ex(f)===eq))tier=1;
        // Another admitted sense may legitimately own this exact spelling,
        // so the global guard can be absent. A reviewed exclusion still bars
        // this particular sense from borrowing it through either folded tier.
        else if(guarded||(record.evidence.form_homographs&&record.evidence.form_homographs.excluded.some(f=>ex(f)===eq)))continue;
        else if(fo(record.display)===fq)tier=2;
        else if(forms.some(f=>f&&fo(f)===fq))tier=3;
        else continue;
      }
      // German capitalization can distinguish noun and verb identities. Keep
      // case-insensitive alternatives, but prefer the requested spelling.
      const caseRank=q&&record.language==='de'&&record.display.normalize('NFC')!==q.normalize('NFC')?1:0;
      matches.push({record,tier,caseRank});
    }
    return P.rankMatches(matches,{mode,expanded,query:q}).map(m=>Object.assign({},m,{blocked:!!((q&&blocked(q))||blocked(m.record.display)||blocked(m.record.zh))}));
  }
  // Query results for the editor's four-column row contract. Keep distinct
  // lemmas/match tiers separate; only matched senses may contribute glosses.
  // senseIds maps legacy UI group IDs to authoritative, persistent sense IDs.
  function queryEntries(records,query,options){
    const matches=select(records,Object.assign({},options,{mode:'query',query}));
    const groups=[],byKey=new Map();
    const pos={noun:'n.',name:'n.',verb:'v.',adj:'adj.',adv:'adv.',num:'num.'};
    for(const match of matches){
      if(match.blocked)continue;
      const r=match.record,key=JSON.stringify([r.language,r.display,match.tier,match.caseRank]);
      let group=byKey.get(key);
      if(!group){group={lemma:r.display,tier:match.tier,matches:[]};byKey.set(key,group);groups.push(group);}
      group.matches.push(match);
    }
    return groups.map(group=>{
      const counts=Object.create(null),senseIds=Object.create(null),glosses=[],articles=[],notes=[];
      for(const match of group.matches){
        const r=match.record,tag=pos[r.pos],n=(counts[tag]||0)+1;counts[tag]=n;
        senseIds[tag+(n>1?'#'+n:'')]=r.sense_id;
        glosses.push(tag+r.zh);
        if(tag==='n.')articles.push(r.pos==='name'?'':r.article||'');
        if(r.note&&notes.indexOf(r.note)<0)notes.push(r.note);
      }
      // Inflected input retains its spelling but never borrows the lemma's
      // article, also when it was reached by folding. Metadata stays in matches.
      const inflected=group.tier===1||group.tier===3;
      return {entry:[inflected?query.trim():group.lemma,glosses.join('|'),inflected?'':articles.join('|'),notes.join('；')],
        lemma:group.lemma,tier:group.tier,senseIds,matches:group.matches};
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
      pool.push({match,key:-Math.log1p(-u)/spec.weight});
    }
    return pool.sort((a,b)=>a.key-b.key||a.match.record.sense_id.localeCompare(b.match.record.sense_id)).slice(0,count).map(item=>item.match);
  }
  // ---- Runtime packs (scripts/t19/build-packs.mjs) ----
  // A pack carries every admitted sense as a compact row and nothing else: review
  // evidence stays in the source lexicon. fromPack restores records the policy layer
  // accepts; the constant review fields only say "this row came from a compiled pack".
  // Row: [sense_id, display, pos, zh, article, note, category, forms, queryOnly, excludedForms]
  // names: [sense_id, m/f, source language] for every sense in the names category; with display and zh
  // it restores the four-field name payload. The source language belongs to the name, not to the pack.
  const COMPILED={state:'approved',reviewer:'compiled',evidence:'compiled'};
  const QUERY_ONLY={reason:'compiled',source:'compiled',reviewer:'compiled'};
  const apostrophes=s=>String(s).replace(/[\u2019\u02BC\u2018\u0060\u00B4]/g,"'");
  function fromPack(pack,language,fold){
    check(/^(en|fr|de|es|it|la)$/.test(language),'unknown language');
    check(pack&&pack.v===1&&Array.isArray(pack.senses)&&Array.isArray(pack.names)&&Array.isArray(pack.guards)&&typeof fold==='function','invalid lexicon pack');
    const named=Object.create(null);
    for(const n of pack.names){check(Array.isArray(n)&&n.length===3&&typeof n[0]==='string'&&(n[1]==='m'||n[1]==='f')&&/^[a-z]{2,3}$/.test(n[2])&&!named[n[0]],'invalid pack name');named[n[0]]=n;}
    let nameCount=0;
    const key=s=>fold(apostrophes(s)),records=[],forms=Object.create(null),index=Object.create(null),compact=Object.create(null),guards=Object.create(null),seen=new Set();
    const note=(k,i)=>{const a=index[k]||(index[k]=[]);if(a[a.length-1]!==i)a.push(i);};
    pack.senses.forEach((s,i)=>{
      check(Array.isArray(s)&&s.length===10&&s.slice(0,8).every(v=>typeof v==='string')&&s[0]&&s[1]&&P.CATEGORIES[s[6]],'invalid pack sense');
      check(!seen.has(s[0]),'duplicate pack sense');seen.add(s[0]);
      const evidence={};
      if(s[8])evidence.query_only=QUERY_ONLY;
      if(s[9])evidence.form_homographs={excluded:s[9].split(' ')};
      let payload=null;
      if(s[6]==='names'){const n=named[s[0]];check(n,'pack name lacks payload');evidence.name_origin='compiled';payload=[s[1],s[3],n[1],n[2]];nameCount++;}
      const record={sense_id:s[0],language,display:s[1],pos:s[2],zh:s[3],article:s[4],note:s[5],category:s[6],evidence,
        review:COMPILED,adverb_relation:{state:'no-adjective',evidence:'compiled'},latin_use:{state:'literary',evidence:'compiled'},name_payload:payload};
      check(!P.admission(record),'pack sense fails admission');
      records.push(record);
      const list=forms[s[0]]=s[7]?s[7].split(' '):[];
      note(key(s[1]),i);for(const f of list)note(key(f),i);
      const c=key(s[1]).replace(/[\s'\-]/g,'');
      if(c!==key(s[1])&&!compact[c])compact[c]=s[1];
    });
    check(nameCount===pack.names.length,'pack name without sense');
    for(const g of pack.guards)guards[g]=true;
    Object.defineProperty(records,'formsBySense',{value:forms});Object.defineProperty(records,'guards',{value:guards});
    return {records,forms,index,compact,guards,key};
  }
  // One typed spelling → the best group of queryEntries, or null. Only senses whose
  // folded lemma or form equals the input are handed to select; tiers, per-sense
  // exclusions and guards are still decided there. A phrase may be typed without its
  // spaces, hyphens or apostrophes (goldenage → golden age).
  function packLookup(lx,text,options){
    const typed=String(text==null?'':text).trim().replace(/\s+/g,' ');
    if(!typed)return null;
    const ask=q=>{
      const hit=lx.index[lx.key(q)];if(!hit)return null;
      const subset=hit.map(i=>lx.records[i]);
      Object.defineProperty(subset,'formsBySense',{value:lx.forms});Object.defineProperty(subset,'guards',{value:lx.guards});
      const groups=queryEntries(subset,q,options);return groups.length?groups[0]:null;
    };
    const direct=ask(typed);if(direct)return direct;
    const alt=lx.compact[lx.key(typed).replace(/[\s'\-]/g,'')];
    return alt?ask(alt):null;
  }
  const api={load,browserReader,createLoader,select,sample,queryEntries,fromPack,packLookup};if(typeof module==='object'&&module.exports)module.exports=api;else root.LEXICON_STORE=api;
})(typeof window!=='undefined'?window:this);
