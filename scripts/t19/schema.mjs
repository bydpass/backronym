// T19 draft sense records. Admission is independent of historical gloss approval.
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import policy from '../../app/assets/lexicon-policy.js';
export const LANGS = ['en', 'fr', 'de', 'es', 'it', 'la'];
export const CATEGORIES = policy.CATEGORIES;
export const COLUMNS = ['entry_id', 'sense_id', 'language', 'display', 'pos', 'zh', 'article', 'note',
  'category', 'theme', 'concept_ids', 'legacy_refs', 'evidence', 'review', 'adverb_relation', 'latin_use', 'name_payload'];
const JSON_COLUMNS = new Set(['concept_ids', 'legacy_refs', 'evidence', 'review', 'adverb_relation', 'latin_use', 'name_payload']);
// 变位表（交付61）：可选列，只有动词用。像一本小字典：语法位置 → 词形。
// 来源词形图缺的常用不规则变位（意语 ha、英语 am/is/are、西语 hay）写在这里，编译时并入可查词形。
// 位置写法：时态[.人称]，时态 pres/past/impf/fut/cond/subj/imp/perf，人称 1s…3p 或 s/p；另有 inf、pp、ger、sup。可再加一段小写说明（pres.3s.impersonal）。
export const OPTIONAL_JSON_COLUMNS = new Set(['conjugation']);
export const CONJUGATION_SLOT = /^(?:(?:pres|past|impf|fut|cond|subj|imp|perf)(?:\.(?:[123][sp]|s|p))?|inf|pp|ger|sup)(?:\.[a-z]+)?$/;
export const conjugationForms = r => r.conjugation ? [...new Set(Object.values(r.conjugation.forms))] : [];
export const id = (prefix, parts) => prefix + '-' + crypto.createHash('sha256').update(JSON.stringify(parts)).digest('hex').slice(0, 24);
export function parseTsv(text) {
  const [first, ...lines] = text.replace(/\r\n/g, '\n').replace(/\n+$/, '').split('\n');
  const columns = first.split('\t');
  assert.equal(new Set(columns).size, columns.length, 'duplicate columns');
  return { columns, rows: lines.map((line, i) => {
    const cells = line.split('\t'); assert.equal(cells.length, columns.length, 'column count at line ' + (i + 2));
    return Object.fromEntries(columns.map((column, j) => [column, cells[j]]));
  }) };
}
export function encode(records, extraColumns = []) {
  const columns = [...COLUMNS, ...extraColumns.filter(c => !COLUMNS.includes(c))];
  return columns.join('\t') + '\n' + records.map(record => columns.map(column => {
    const value = JSON_COLUMNS.has(column) ? JSON.stringify(record[column]) : OPTIONAL_JSON_COLUMNS.has(column) ? (record[column] === undefined ? '' : JSON.stringify(record[column])) : String(record[column] ?? '');
    assert.ok(value !== undefined && !/[\t\r\n]/.test(value), 'invalid TSV field: ' + column);
    return value;
  }).join('\t')).join('\n') + (records.length ? '\n' : '');
}
export function decode(text) {
  const parsed = parseTsv(text);
  for (const column of COLUMNS) assert.ok(parsed.columns.includes(column), 'missing column: ' + column);
  return { columns: parsed.columns, records: parsed.rows.map(row => {
    const record = { ...row };
    for (const column of JSON_COLUMNS) record[column] = JSON.parse(row[column]);
    for (const column of OPTIONAL_JSON_COLUMNS) { if (row[column]) record[column] = JSON.parse(row[column]); else delete record[column]; }
    validate(record); return record;
  }) };
}
const NOUN_ARTICLES={de:{m:['der'],f:['die'],n:['das']},fr:{m:['le','l’'],f:['la','l’']},es:{m:['el'],f:['la','el']},it:{m:['il','lo','l’'],f:['la','l’']}};
export function validate(r) {
  assert.ok(/^e-[a-f0-9]{24}$/.test(r.entry_id) && /^s-[a-f0-9]{24}$/.test(r.sense_id), 'invalid identity');
  assert.ok(LANGS.includes(r.language) && CATEGORIES[r.category], 'unknown language/category');
  for (const field of ['display', 'pos', 'zh', 'theme']) assert.ok(typeof r[field] === 'string' && r[field].trim(), 'missing ' + field);
  for (const field of ['concept_ids', 'legacy_refs']) assert.ok(Array.isArray(r[field]), 'invalid ' + field);
  assert.ok(r.evidence && Array.isArray(r.evidence.sources) && r.evidence.sources.length, 'missing source evidence');
  for (const source of r.evidence.sources) assert.ok(typeof source.path === 'string' && source.path && /^[a-f0-9]{64}$/.test(source.sha256), 'invalid source fingerprint');
  assert.ok(['pending', 'approved', 'rejected'].includes(r.review?.state), 'invalid review state');
  if (r.evidence.spelling_aliases !== undefined) {
    const aliases = r.evidence.spelling_aliases;
    assert.ok(Array.isArray(aliases), 'invalid spelling aliases');
    const seen = new Set();
    for (const alias of aliases) {
      assert.ok(alias && typeof alias.spelling === 'string' && /^\p{L}+$/u.test(alias.spelling) && alias.spelling === alias.spelling.normalize('NFC').toLowerCase(), 'invalid spelling alias');
      assert.ok(alias.spelling !== r.display.normalize('NFC').toLowerCase() && !seen.has(alias.spelling), 'duplicate spelling alias');
      seen.add(alias.spelling);
      for (const field of ['source', 'evidence', 'reviewer']) assert.ok(typeof alias[field] === 'string' && alias[field].trim(), 'spelling alias evidence required');
    }
  }
  if (r.evidence.form_restriction !== undefined) {
    const restriction = r.evidence.form_restriction;
    assert.ok(restriction && Array.isArray(restriction.allowed), 'invalid form restriction');
    assert.ok(restriction.allowed.every(f => typeof f === 'string' && /^\p{L}+$/u.test(f) && f === f.normalize('NFC').toLowerCase()), 'invalid restricted form');
    assert.equal(new Set(restriction.allowed).size, restriction.allowed.length, 'duplicate restricted form');
    for (const field of ['source', 'evidence', 'reviewer']) assert.ok(typeof restriction[field] === 'string' && restriction[field].trim(), 'form restriction evidence required');
  }
  if (r.evidence.noun_forms !== undefined) {
    assert.equal(r.pos,'noun','名词词形元数据仅用于名词');
    for (const [form, meta] of Object.entries(r.evidence.noun_forms)) {
      assert.ok(/^\p{L}+$/u.test(form) && form===form.normalize('NFC').toLowerCase(), '名词词形拼写不规范');
      assert.ok(['m','f','n'].includes(meta.gender) && ['sg','pl'].includes(meta.number), '未知名词性数');
      assert.ok(typeof meta.article === 'string' && (meta.number==='sg'||meta.article===''), '仅单数词形显示冠词');
      assert.ok(!meta.article || NOUN_ARTICLES[r.language]?.[meta.gender]?.includes(meta.article),'词形冠词与语种或性别不符');
    }
  }
  if (r.evidence.gender !== undefined) { // 词性缩写用的义项阴阳性（11-19）：法西意名词，m / f / mf（两性同形）
    assert.ok(r.pos === 'noun' && ['fr', 'es', 'it'].includes(r.language), '阴阳性仅用于法西意名词');
    assert.ok(['m', 'f', 'mf'].includes(r.evidence.gender.g) && typeof r.evidence.gender.via === 'string' && r.evidence.gender.via, '阴阳性取值或来源不对');
  }
  if (r.conjugation !== undefined) {
    const c = r.conjugation;
    assert.ok(r.pos === 'verb' && c && c.forms && typeof c.forms === 'object' && !Array.isArray(c.forms) && Object.keys(c.forms).length, 'conjugation needs a verb and a non-empty form table');
    for (const [slot, form] of Object.entries(c.forms)) assert.ok(CONJUGATION_SLOT.test(slot) && typeof form === 'string' && /^\p{L}+$/u.test(form) && form === form.normalize('NFC').toLowerCase(), 'invalid conjugation entry: ' + slot);
    for (const field of ['source', 'evidence', 'reviewer']) assert.ok(typeof c[field] === 'string' && c[field].trim(), 'conjugation evidence required');
    // 审核明确排除过的词形不得经变位表加回（复审建议，2026-11-12）。
    const dropped = r.evidence.form_homographs ? r.evidence.form_homographs.excluded : [];
    for (const form of Object.values(c.forms)) assert.ok(!dropped.includes(form), 'conjugation re-adds a reviewed exclusion: ' + form);
  }
  assert.ok(['not-applicable', 'unknown', 'has-adjective', 'no-adjective'].includes(r.adverb_relation?.state), 'invalid adverb relation');
  assert.ok(['not-applicable', 'pending', 'literary', 'binomial'].includes(r.latin_use?.state), 'invalid Latin use');
  if (r.category === 'names') {
    assert.ok(Array.isArray(r.name_payload) && r.name_payload.length === 4, 'name needs four fields');
    assert.equal(r.name_payload[0], r.display); assert.equal(r.name_payload[1], r.zh);
    assert.ok(['m', 'f'].includes(r.name_payload[2]) && /^[a-z]{2,3}$/.test(r.name_payload[3]), 'invalid name gender/source language');
  }
  return r;
}
export function admission(record) { validate(record); return policy.admission(record); }
export function eligible(record, options) { validate(record); return policy.eligible(record, options); }
export function rankMatches(matches, options) { for (const m of matches) validate(m.record); return policy.rankMatches(matches, options); }
export function partition(records, limit = 300) {
  assert.ok(Number.isInteger(limit) && limit > 0 && limit <= 300);
  const seen = new Set(), groups = new Map();
  for (const record of records) {
    validate(record); assert.ok(!seen.has(record.sense_id), 'duplicate authoritative sense'); seen.add(record.sense_id);
    assert.ok(/^[A-Z][0-9]{2}$/.test(record.theme), 'invalid theme path');
    const spec = CATEGORIES[record.category];
    const name = record.category === 'names' || record.category === 'numerals' ? record.category : record.theme;
    const key = `${record.language}/${spec.directory}/${name}`;
    if (!groups.has(key)) groups.set(key, []); groups.get(key).push(record);
  }
  const shards = [];
  for (const [key, rows] of [...groups].sort()) {
    rows.sort((a, b) => a.sense_id.localeCompare(b.sense_id));
    for (let offset = 0; offset < rows.length; offset += limit) shards.push({
      path: key + '-' + String(offset / limit + 1).padStart(3, '0') + '.tsv', records: rows.slice(offset, offset + limit),
    });
  }
  return shards;
}
