// Build query-only morphology for admitted senses, independently of old selection cutoffs.
import assert from 'node:assert/strict';
import {admission} from './schema.mjs';
import {excludedPos} from '../lexicon/scope.mjs';
const key=s=>s.normalize('NFC').toLowerCase();
// Botanical Latin commonly omits length marks; do not strip other accents.
const withoutMacrons=s=>key(s).normalize('NFD').replace(/\u0304/g,'').normalize('NFC');
const stripAccents=s=>key(s).normalize('NFD').replace(/\p{M}/gu,'').normalize('NFC');
export function senseForms(records, stage, allow=new Set(), reviewedForms=[]) {
  const targets=new Map(), result=new Map(), lemmas=new Set(), functional=new Set(), latin=new Set(), canonicalTargets=new Map();
  for(const r of records){
    if(admission(r))continue;
    result.set(r.sense_id,[]);
    if(['names','numerals'].includes(r.category))continue;
    const k=key(r.display)+'|'+r.pos;
    if(!targets.has(k))targets.set(k,[]);
    targets.get(k).push(r.sense_id);
    if(r.language==='la'){
      if(r.evidence.quantity_source && r.evidence.original_display){
        assert.equal(withoutMacrons(r.display),withoutMacrons(r.evidence.original_display),'长音不能更换词头');
        const sourceKey=key(r.evidence.original_display)+'|'+r.pos;
        if(!targets.has(sourceKey))targets.set(sourceKey,[]);
        if(!targets.get(sourceKey).includes(r.sense_id))targets.get(sourceKey).push(r.sense_id);
      }
      latin.add(r.sense_id);
      if(!canonicalTargets.has(k))canonicalTargets.set(k,[]);
      canonicalTargets.get(k).push(r.sense_id);
    }
  }
  // Plural-only headwords take their forms from the reviewed source lemma,
  // always narrowed by form_restriction.
  for(const r of records){
    const link=r.evidence.form_source_lemma;
    if(!link||!result.has(r.sense_id)||['names','numerals'].includes(r.category))continue;
    assert.ok(link.lemma&&link.pos===r.pos&&link.source&&link.evidence&&link.reviewer,'form source lemma evidence required');
    assert.ok(r.evidence.form_restriction,'form source lemma requires form_restriction');
    assert.ok(stage.lemmas.some(l=>key(l.w)===key(link.lemma)&&l.pos===link.pos),'form source lemma missing from source');
    const k=key(link.lemma)+'|'+link.pos;
    if(!targets.has(k))targets.set(k,[]);
    targets.get(k).push(r.sense_id);
  }
  // Source homographs: one spelling and POS, several headwords with different
  // inflection lines (gender, conjugation). The form graph cannot tell them apart.
  const heads=new Map();
  for(const l of stage.lemmas){
    const k=key(l.w)+'|'+l.pos;
    if(!heads.has(k))heads.set(k,new Set());
    heads.get(k).add((l.head||[]).join('\n'));
  }
  for(const l of stage.lemmas){
    const w=key(l.w);lemmas.add(w+'|'+l.pos);
    if(excludedPos(l.pos))functional.add(w);
    // A source's canonical spelling is evidence, not a general accent fallback.
    // Match POS and permit only a change in macrons, never another word.
    for(const spelling of l.canon||[]){
      if(typeof spelling!=='string'||!/^\p{L}+$/u.test(spelling)||withoutMacrons(spelling)!==withoutMacrons(w))continue;
      const ids=canonicalTargets.get(key(spelling)+'|'+l.pos)||[];
      if(!ids.length)continue;
      const target=w+'|'+l.pos;
      if(!targets.has(target))targets.set(target,[]);
      targets.set(target,[...new Set([...targets.get(target),...ids])]);
    }
  }
  const edges=stage.form2pos;
  // Reviewed spelling variants share this sense, not its recommendation weight.
  // Require an explicit same-POS source edge; never infer aliases by accent folding.
  for(const r of records){
    if(!result.has(r.sense_id)||['names','numerals'].includes(r.category))continue;
    for(const alias of r.evidence.spelling_aliases||[]){
      const pair=key(r.display)+'|'+r.pos;
      assert.ok(Object.prototype.hasOwnProperty.call(edges,alias.spelling)&&edges[alias.spelling].includes(pair),'spelling alias source relation missing');
      const target=alias.spelling+'|'+r.pos;
      if(!targets.has(target))targets.set(target,[]);
      targets.set(target,[...new Set([...targets.get(target),r.sense_id])]);
    }
  }
  const resolve=(w,pos=null,seen=new Set(),depth=0)=>{
    const ids=new Set();
    if(seen.has(w))return ids;
    const visited=new Set(seen);visited.add(w);
    for(const pair of Object.prototype.hasOwnProperty.call(edges,w)?edges[w]:[]){
      const split=pair.lastIndexOf('|'),target=key(pair.slice(0,split)),p=pair.slice(split+1),k=target+'|'+p;
      if(!['noun','verb','adj','adv'].includes(p)||(pos&&pos!==p))continue;
      if(targets.has(k))for(const id of targets.get(k))ids.add(id);
      else if(!lemmas.has(k)&&depth<2)for(const id of resolve(target,p,visited,depth+1))ids.add(id);
    }
    return ids;
  };
  for(const spelling of Object.keys(edges)){
    const w=key(spelling);
    if(!/^\p{L}+$/u.test(w)||(functional.has(w)&&!allow.has(w)))continue;
    for(const id of resolve(spelling)){
      result.get(id).push(w);
      const plain=withoutMacrons(w);
      if(latin.has(id)&&plain!==w&&(!functional.has(plain)||allow.has(plain)))result.get(id).push(plain);
    }
  }
  // Explicit functional-homograph exceptions are bound to one admitted sense,
  // rather than opening this spelling for every target in the source graph.
  const byId=new Map(records.map(r=>[r.sense_id,r]));
  for(const addition of reviewedForms){
    const r=byId.get(addition.sense_id);
    assert.ok(r&&!admission(r)&&!['names','numerals'].includes(r.category)&&r.display===addition.lemma&&r.pos===addition.pos,'reviewed form identity mismatch');
    assert.ok(typeof addition.form==='string'&&/^\p{L}+$/u.test(addition.form)&&key(addition.form)===addition.form,'invalid reviewed form');
    assert.ok(addition.source&&addition.evidence&&addition.reviewer,'reviewed form evidence required');
    const pair=key(r.display)+'|'+r.pos;
    // 第三次重建 D5（2026-11-19）：字幕里漏写重音的写法（farò → faro）。只在它正好是该原形某个来源词形去掉重音后的样子时才认
    const unaccented=addition.relation==='unaccented'&&Object.keys(edges).some(g=>g!==addition.form&&stripAccents(g)===addition.form&&edges[g].includes(pair));
    assert.ok(unaccented||(Object.prototype.hasOwnProperty.call(edges,addition.form)&&edges[addition.form].includes(pair)),'reviewed form source relation missing');
    // 复审 R3-2：去重音写法撞上已收词头（意 faro 灯塔）时不登记。form-additions.json 新旧管线共用：verro 在旧候选里是「公猪」要跳过，
    // 新管线里不是词头照常登记，所以跳过而不是断言失败
    if(addition.relation==='unaccented'&&records.some(x=>!admission(x)&&key(x.display)===addition.form))continue;
    result.get(r.sense_id).push(addition.form);
  }
  // Fail closed: a sense on a homograph headword keeps forms only after an
  // explicit review says which of them belong to this sense.
  for(const r of records){
    if(!result.has(r.sense_id)||!result.get(r.sense_id).length)continue;
    const link=r.evidence.form_source_lemma;
    const k=key(link?link.lemma:r.display)+'|'+r.pos,plain=withoutMacrons(link?link.lemma:r.display)+'|'+r.pos;
    const variants=heads.get(k)||heads.get(plain);
    if(!variants||variants.size<2)continue;
    const review=r.evidence.form_homographs;
    if(review){
      assert.ok(Array.isArray(review.excluded)&&review.excluded.every(f=>typeof f==='string')&&review.source&&review.evidence&&review.reviewer,'homograph form review evidence required');
      const excluded=new Set(review.excluded);
      for(const f of excluded)assert.ok(result.get(r.sense_id).includes(f),'homograph exclusion is not a source form: '+r.display+' '+f);
      result.set(r.sense_id,result.get(r.sense_id).filter(f=>!excluded.has(f)));
    }else if(!r.evidence.form_restriction)result.set(r.sense_id,[]);
  }
  // ami → amie → amies。女性单数本身是独立词头，常规归并在此停止。
  // 仅给显式逐形复核清单补回同一名词的复数，要求两条来源关系都真实存在。
  for(const r of records){
    const meta=r.evidence.noun_forms,restriction=r.evidence.form_restriction,forms=result.get(r.sense_id);
    if(!meta||!restriction||!forms)continue;
    const source=key(r.display)+'|noun';
    const links=w=>Object.prototype.hasOwnProperty.call(edges,w)?edges[w]:[];
    const singular=restriction.allowed.filter(w=>meta[w]&&meta[w].number==='sg'&&links(w).includes(source));
    for(const w of restriction.allowed){
      if(meta[w]&&meta[w].number==='pl'&&singular.some(s=>meta[s].gender===meta[w].gender && links(w).includes(s+'|noun')))forms.push(w);
    }
  }
  for(const [id,forms] of result)result.set(id,[...new Set(forms)].sort());
  return result;
}
