// 变位表字段（交付61）：结构校验、读写往返、编译时并入可查词形。
import assert from 'node:assert/strict';
import {readShards, compileRecords, cleanForms} from './t19/compile.mjs';
import {validate, encode, decode, conjugationForms, CONJUGATION_SLOT} from './t19/schema.mjs';
const records = await readShards('review/t19-batches/t19-batch61-20261112/lexicon');
const avere = records.find(r => r.language === 'it' && r.display === 'avere' && r.pos === 'verb');
assert.ok(avere.conjugation && avere.conjugation.forms['pres.3s'] === 'ha');
assert.ok(conjugationForms(avere).includes('hanno'));
assert.deepEqual(conjugationForms(records.find(r => !r.conjugation)), []);
// 位置写法
for (const ok of ['pres', 'pres.1s', 'past.3p', 'subj.2s', 'imp.2p', 'perf.1s', 'past.p', 'inf', 'pp', 'ger', 'sup', 'pres.3s.impersonal']) assert.ok(CONJUGATION_SLOT.test(ok), ok);
for (const bad of ['present', 'pres.4s', 'pres.1', 'pp.1s.', 'Pres', 'pres.3s.Impersonal', '']) assert.ok(!CONJUGATION_SLOT.test(bad), bad);
// 校验：只有动词能带；位置与词形合法；证据三项齐全
const withTable = c => ({...avere, conjugation: c});
const good = avere.conjugation;
validate(withTable(good));
assert.throws(() => validate({...withTable(good), pos: 'noun'}));
assert.throws(() => validate(withTable({...good, forms: {}})));
assert.throws(() => validate(withTable({...good, forms: {present: 'ha'}})));
assert.throws(() => validate(withTable({...good, forms: {'pres.3s': 'Ha'}})));
assert.throws(() => validate(withTable({...good, forms: {'pres.3s': 'ha ha'}})));
assert.throws(() => validate(withTable({...good, forms: ['ha']})));
for (const field of ['source', 'evidence', 'reviewer']) assert.throws(() => validate(withTable({...good, [field]: ''})));
// 读写往返：有表的原样回来；没表的不多出这个键；旧分片（没有这一列）照常读
const plainRecord = records.find(r => r.language === 'it' && !r.conjugation);
const back = decode(encode([avere, plainRecord], ['conjugation'])).records;
assert.deepEqual(back[0], avere); assert.deepEqual(back[1], plainRecord); assert.ok(!('conjugation' in back[1]));
assert.deepEqual(decode(encode([plainRecord])).records[0], plainRecord);
// 编译：变位表里的词形不受允许表限制；表外的照旧受限
const limited = {...avere, evidence: {...avere.evidence, form_restriction: {allowed: ['avendo'], source: 'x', evidence: 'x', reviewer: 'x'}}};
const out = compileRecords([limited], new Map([[limited.sense_id, ['avendo', 'avuta', 'ha', 'hanno']]]));
assert.deepEqual(out.bundles['it/daily'].records[0].forms, ['avendo', 'ha', 'hanno']);
// 审核排除过的词形不得经变位表加回（结构校验）
assert.throws(() => validate({...avere, evidence: {...avere.evidence, form_homographs: {excluded: ['ha'], source: 'x', evidence: 'x', reviewer: 'x'}}}), /re-adds a reviewed exclusion/);
// 来源词形图通则（T19-R60-1）：非 a–z、无出处的一两个字母、解析残渣不收；允许表写明的短词形与同词干的术语同形词保留
{
  const noRule = {...plainRecord, language: 'it', display: 'essere', evidence: {...plainRecord.evidence}}; delete noRule.evidence.form_restriction;
  assert.deepEqual(cleanForms(noRule, ['sono', 'm', 'sn', 'imperative', 'ɛm', 'tʁuv', 'ȼ', 'è', 'essendo', 'été', 'größe']), ['sono', 'essendo', 'été', 'größe']);
  const withAllow = {...noRule, evidence: {...noRule.evidence, form_restriction: {allowed: ['è', 'fu'], source: 'x', evidence: 'x', reviewer: 'x'}}};
  assert.deepEqual(cleanForms(withAllow, ['è', 'fu', 'm', 'sono']), ['è', 'fu', 'sono']);
  assert.deepEqual(cleanForms({...noRule, display: 'futuro'}, ['future', 'futuri', 'plural']), ['future', 'futuri']);
  assert.deepEqual(cleanForms({...noRule, language: 'en', display: 'form'}, ['forms', 'formed']), ['forms', 'formed']);
}
console.log('T19 conjugation passed: slot grammar, verb-only validation, optional column round-trip, forms bypass restriction, exclusions stay excluded, source-form hygiene rules');
