// Render a read-only, offline concept/candidate workbench from the actual shards.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { readShards } from './compile.mjs';
import { LANGS, CATEGORIES, parseTsv, admission } from './schema.mjs';
const directory = path.resolve(process.argv[2] || '');
const rootHref = path.relative(directory, fileURLToPath(new URL('../../', import.meta.url))).split(path.sep).join('/') + '/';
assert.ok(process.argv.length === 3 || process.argv.length === 4, 'Usage: render-review.mjs <batch-directory> [filename.html]');
const filename = process.argv[3] || 'index.html';
assert.ok(/^[a-zA-Z0-9_-]+\.html$/.test(filename), 'invalid output filename');
const target = path.join(directory, filename); assert.ok(!fs.existsSync(target), 'review page exists; refusing overwrite');
const concepts = JSON.parse(fs.readFileSync(path.join(directory, 'concepts.json'), 'utf8'));
const records = await readShards(path.join(directory, 'lexicon'));
const byId = new Map(records.map(r => [r.sense_id, r]));
const paths = {};
for (const lang of LANGS) {
  const index = JSON.parse(fs.readFileSync(path.join(directory, 'lexicon', lang, 'index.json'), 'utf8'));
  for (const shard of index.shards) {
    const parsed = parseTsv(fs.readFileSync(path.join(directory, 'lexicon', lang, shard.path), 'utf8'));
    for (const row of parsed.rows) paths[row.sense_id] = `lexicon/${lang}/${shard.path}`;
  }
}
const mapping = [];
for (const lang of LANGS) for (const theme of [...new Set(concepts.map(c => c.theme))]) {
  for (const row of parseTsv(fs.readFileSync(path.join(directory, 'mapping', lang, theme + '.tsv'), 'utf8')).rows) {
    const ids = JSON.parse(row.candidate_ids);
    assert.ok(ids.every(id => byId.has(id)), 'dangling candidate reference');
    mapping.push({ ...row, candidate_ids: ids });
  }
}
assert.equal(mapping.length, concepts.length * LANGS.length);
assert.equal(new Set(mapping.map(row => row.language + '/' + row.concept_id)).size, mapping.length);
for (const r of records) for (const concept of r.concept_ids)
  assert.ok(mapping.some(m => m.language === r.language && m.concept_id === concept && m.candidate_ids.includes(r.sense_id)), 'missing reverse mapping');
const data = { concepts, mapping, categories: CATEGORIES, records: Object.fromEntries(records.map(r => [r.sense_id, {
  id: r.sense_id, entry: r.entry_id, display: r.display, pos: r.pos, zh: r.zh, article: r.article, category: r.category,
  path: paths[r.sense_id], original_group: r.evidence.original_group, reason: r.review.reason,
  sources: r.evidence.source_records.map(s => ({ path: s.path, location: s.line ? '行 ' + s.line : s.pointer,
    evidence: s.record ? s.record.gl.map(g => g.g).join(' ; ') : s.definition + ' / ' + s.translation })),
  legacy: r.legacy_refs.map(ref => ({ path: ref.path, line: ref.line, key: ref.key, kind: ref.kind })),
  adverb: r.adverb_relation.state, latin: r.latin_use.state,
}])) };
const payload = JSON.stringify(data).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
const html = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>T19 第二批 · 六语概念映射</title>
<style>:root{font:15px/1.65 system-ui,sans-serif;color:#202b30;background:#f3f4f6}*{box-sizing:border-box}body{max-width:1200px;margin:auto;padding:32px 24px}a{color:#245b50}h1{font-size:30px;margin:8px 0}header{border-top:4px solid #245b50;padding-top:20px}p{color:#52616b}.controls{display:flex;gap:16px;flex-wrap:wrap;margin:24px 0}label{display:flex;flex-direction:column;font-size:13px}input,select{font:inherit;padding:9px;border:1px solid #bcc5cb;background:white;border-radius:4px}input{min-width:260px}table{width:100%;border-collapse:collapse;background:white}th,td{text-align:left;vertical-align:top;padding:13px;border-bottom:1px solid #dae0e3}th{font-size:13px;color:#52616b}th:first-child{width:95px}th:nth-child(2){width:130px}.scroll{overflow-x:auto}details{margin:7px 0}summary{cursor:pointer;color:#245b50}.evidence{padding:12px;background:#f3f4f6;overflow-wrap:anywhere}.evidence p{margin:4px 0;font-size:13px}.muted{font-size:12px;color:#65747d}#status{padding:12px;background:#e8eef0}footer{font-size:13px;margin-top:25px}a:focus-visible,input:focus-visible,select:focus-visible,summary:focus-visible{outline:3px solid #548b7f;outline-offset:3px}@media(max-width:650px){body{padding:20px 12px}th,td{padding:9px}th:first-child{width:75px}th:nth-child(2){width:90px}input{min-width:200px}}</style></head><body>
<header><a href="${rootHref}plans/v00.03.00/road.html">← 施工计划</a> · <a href="REPORT.md">本批报告</a><h1>六语概念映射</h1><p>250 个概念 × 六语，每格均有状态与理由。候选来自中文释义与显式搜索词匹配，未匹配不等于原词典缺词。</p><p>共 ${records.length} 条候选；待核义 ${records.filter(r=>r.review.state === 'pending').length} 条，符合准入 ${records.filter(r=>!admission(r)).length} 条；这里用于查看证据，不能代替选词器或审核通过记录。</p></header>
<div class="controls"><label>语言<select id="language"><option value="en">英语 en</option><option value="fr">法语 fr</option><option value="de">德语 de</option><option value="es">西语 es</option><option value="it">意语 it</option><option value="la">拉丁语 la</option></select></label><label>类别<select id="category"><option value="">全部</option><option value="daily">日用</option><option value="creative">创作</option><option value="professional-humanities">专业人文</option><option value="professional-natural">专业自然</option><option value="historical-cultural">历史文化</option></select></label><label>进度<select id="state"><option value="">全部</option><option value="leads">有候选，待核义</option><option value="empty">未匹配到线索</option><option value="na">范围不适用</option></select></label><label>查找概念或词形<input id="search" type="search" placeholder="月亮、moon、D03-03"></label></div>
<p id="status" role="status" aria-live="polite"></p><div class="scroll"><table><thead><tr><th>概念 ID</th><th>目标</th><th>候选与出处</th></tr></thead><tbody id="rows"></tbody></table></div><footer>只读本地页面，不保存、不上传。点击候选展开原始义项组、来源证据和旧审核键；正式修改须保留稳定ID与旧字段，更新分片指纹后再编译。</footer>
<script>var DATA=${payload};
(function(){'use strict';var $=function(id){return document.getElementById(id);};function add(parent,tag,value){var e=document.createElement(tag);e.textContent=value;parent.appendChild(e);return e;}
function render(){var lang=$('language').value,cat=$('category').value,state=$('state').value,q=$('search').value.trim().toLocaleLowerCase();var matches=DATA.mapping.filter(function(m){var ids=m.candidate_ids;return m.language===lang&&(!cat||m.category===cat)&&(!state||(state==='leads'&&ids.length)||(state==='empty'&&!ids.length&&m.status!=='范围不适用')||(state==='na'&&m.status==='范围不适用'))&&(!q||(m.concept_id+' '+m.target+' '+ids.map(function(id){return DATA.records[id].display;}).join(' ')).toLocaleLowerCase().includes(q));});$('rows').textContent='';
matches.forEach(function(m){var tr=add($('rows'),'tr','');add(tr,'td',m.concept_id);add(tr,'td',m.target);var cell=add(tr,'td','');add(cell,'span',m.status+' · '+m.candidate_ids.length+' 条候选');add(cell,'p',m.reason).className='muted';m.candidate_ids.forEach(function(id){var r=DATA.records[id],details=add(cell,'details','');add(details,'summary',[r.display,r.pos,r.zh,r.article].filter(Boolean).join(' · '));var box=add(details,'div','');box.className='evidence';add(box,'p','稳定ID：'+id+'；初始主类：'+r.category);add(box,'p','旧义项组：'+r.original_group);add(box,'p','待核：'+r.reason);if(r.adverb!=='not-applicable')add(box,'p','副词对应形容词：'+r.adverb);if(r.latin!=='not-applicable')add(box,'p','拉丁用途：'+r.latin);r.sources.forEach(function(s){add(box,'p',s.path+' · '+s.location);add(box,'p',s.evidence);});r.legacy.forEach(function(s){add(box,'p','旧审核键：'+JSON.stringify(s.key)+' · '+s.path+':'+s.line+' · '+s.kind);});var a=add(box,'a','打开权威候选分片');a.href=r.path;});});$('status').textContent=lang+' · 显示 '+matches.length+' / 250 个概念；待核义不等于已收录';}
['language','category','state'].forEach(function(id){$(id).addEventListener('change',render);});$('search').addEventListener('input',render);render();})();</script></body></html>`;
fs.writeFileSync(target, html, { flag: 'wx' });
console.log('Rendered', mapping.length, 'mapping cells and', records.length, 'candidate references; all bidirectional links checked');
