// 从发布使用的词包验证已审设备例词、词形和默认候选。
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import store from '../../../app/assets/lexicon-store.js';

const readBatch = file => JSON.parse(fs.readFileSync(new URL(file, import.meta.url)));
const proposals = ['proposals.json', 'colors.json'].flatMap(readBatch);
// 简报 Q6：形容词去「的」，去掉后只剩一个字的保留（长的、大的；2026-11-19 返工）
const canonical = (p) => { if (p.pos !== 'adj') return p.zh; const stem = p.zh.replace(/的$/,''); return /^(?:.|我们|你们|他们|她们|它们|自己|他人|别人)$/u.test(stem) ? stem + '的' : stem; }; // 单字与物主词（我们的、自己的）保留「的」
const extensions = ['common.json', 'proper.json'].flatMap(readBatch);
const env = vm.createContext({window: {}});
function load(file) {
  vm.runInContext(fs.readFileSync(new URL('../../../app/assets/' + file, import.meta.url), 'utf8'), env);
}
load('core.js');
load('lang/en/words.js');
load('lang/packs.js');
for (const lang of ['fr','de','es','it']) {
  load('lang/' + lang + '/rules.js');
  load('lang/' + lang + '/words.js');
}
const {CORE, LANGPACK} = env.window;
for (const lang of ['en', 'fr', 'de', 'es', 'it']) {
  CORE.useLang(lang);
  const current = LANGPACK.get(lang, 'lexicon');
  const rows = proposals.filter(p => p.language === lang);
  const index = store.fromPack(current, lang, CORE.LANG.fold);
  if (current.v >= 2) { // v2 起词形在 inflections.js（v3 = 短 ID，批 S1）
    load('lang/' + lang + '/inflections.js');
    store.attachForms(index, LANGPACK.get(lang, 'inflections'));
  }
  const words = LANGPACK.get(lang, 'words');
  const recommended = [words, LANGPACK.get(lang, 'more')].flatMap(group => Object.values(group).flat());
  const opts = {exact: CORE.LANG.exactKey, fold: CORE.LANG.fold, blocked: () => false};
  for (const p of rows) {
    assert.ok(CORE.candidates(words, p.display[0].toUpperCase(), p.display).some(row => row[0] === p.display && CORE.senseList(row).includes(canonical(p))));
    for (const spelling of [p.display, ...p.forms]) {
      const hit = store.packLookup(index, spelling, opts);
      assert.equal(hit.lemma, p.display);
      assert.ok(CORE.senseList(hit.entry).includes(canonical(p)), lang + " " + spelling);
      const own=hit.matches.find(m=>m.record.zh===canonical(p)&&m.record.pos===p.pos);
      assert.ok(own,lang+' '+spelling+' '+p.pos);
      const slot=Object.keys(hit.senseIds).find(k=>hit.senseIds[k]===own.record.sense_id);
      const meta=own && (own.record.evidence.noun_forms || {})[own.matchedForm];
      assert.equal(CORE.articleOf(hit.entry,'',slot).text, spelling===p.display ? p.article : meta && meta.number==='sg' ? meta.article : '', lang+' '+spelling);
    }
  }
  for (const p of extensions.filter(p => p.language === lang)) {
    const matches = store.packLookups(index, p.display, opts).flatMap(hit => hit.matches.map(m => m.record));
    const own = matches.find(r => r.display === p.display && r.pos === p.pos && r.zh === canonical(p));
    assert.ok(own, lang + ' ' + p.display + ' ' + p.zh);
    assert.equal(own.article, p.article);
    for (const form of p.forms || []) {
      const groups = store.packLookups(index, form, opts);
      assert.ok(groups.some(group => group.matches.some(m => m.record.sense_id === own.sense_id)), lang + ' ' + form + ' → ' + p.display);
    }
    if (p.category !== 'daily') {
      assert.ok(!recommended.some(row => row[0] === p.display && CORE.senseList(row).includes(canonical(p))));
      if (p.nameOrigin) {
        assert.deepEqual(Array.from(own.name_payload), [p.display, p.zh, p.gender, p.nameOrigin.language]);
        const prefix = store.packLookups(index, p.display.slice(0, -1), opts);
        assert.ok(!prefix.some(hit => hit.matches.some(m => m.record.sense_id === own.sense_id)));
      }
    }
  }
  const rejected = {fr: [['oranges','orange'], ['att','attendre'], ['keus','sec']], de: [['hoh','hoch'], ['höchst','hoch'], ['rosae','rosa'], ['öhrchen','Ohr']], es: [['orejón','oreja'], ['pay','pie']], it: [['scarpino','scarpa'], ['testona','testa']]};
  for (const [form, lemma] of rejected[lang] || []) {
    assert.ok(!store.packLookups(index, form, opts).some(hit => hit.lemma === lemma), lang + ' ' + form);
  }
  if (lang === 'de') {
    const senses = store.packLookups(index, 'weiß', opts).flatMap(hit => hit.matches.map(m => m.record.zh));
    assert.ok(senses.includes('白色') && senses.includes('知道'));
  }
  if (lang === 'en') {
    for (const spelling of ['lust', 'lusts', 'lusted', 'lusting']) {
      const groups = CORE.senseGroups(store.packLookup(index, spelling, opts).entry);
      assert.ok(groups.some(g => g.pos === 'v.' && g.senses.includes('渴望')));
      assert.equal(groups.some(g => g.pos === 'n.' && g.senses.includes('色欲')), ['lust', 'lusts'].includes(spelling));
    }
    for (const spelling of ['green', 'greener', 'greenest']) {
      const senses = CORE.senseList(store.packLookup(index, spelling, opts).entry);
      assert.ok(senses.includes('绿色') && senses.includes('青春'), spelling);
    }
  }
  for (const typo of ['rendervous', 'solement']) assert.equal(store.packLookup(index, typo, opts), null);
}
console.log('设备缺词提案的原形、词形、冠词和误拼回归通过');
