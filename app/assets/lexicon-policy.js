/* Shared T19 scope and ranking policy: compiler and inspection/runtime consumers. */
(function (root) {
  'use strict';
const CATEGORIES = {
  daily: { weight: 100, visibility: 'default', directory: 'daily' },
  creative: { weight: 90, visibility: 'default', directory: 'creative' },
  'professional-humanities': { weight: 60, visibility: 'expanded', directory: 'professional/humanities' },
  'professional-natural': { weight: 55, visibility: 'expanded', directory: 'professional/natural' },
  'historical-cultural': { weight: 60, visibility: 'expanded', directory: 'historical-cultural' },
  // 分片旧格式记录的类别值保留供校验。候选、随机与查询统一使用 weightOf。
  pronouns: { weight: 75, visibility: 'default', directory: 'pronouns' },
  names: { weight: 1, visibility: 'query', directory: 'query' },
  numerals: { weight: null, visibility: 'query', directory: 'query' },
};
const EXCLUDED = new Set(['prep', 'postp', 'conj', 'pron', 'det', 'article', 'aux', 'particle', 'contraction', 'intj']);
// 只放行已逐义裁定的代词。ihr 等同形词必须同时匹配释义。
const reviewedPronouns = {
  en: {'我':'I me', '我们':'we us', '你':'you', '某人':'someone somebody', '某物':'something', '任何人':'anyone anybody', '任何事':'anything', '每个人':'everybody everyone', '没有人':'nobody', '没有什么':'nothing', '一切':'everything', '全部':'all', '一些':'some', '许多人':'many', '任何一个':'any', '大多数':'most', '另一个':'another', '许多':'much', '少数':'few', '各自':'each', '两者':'both', '几个':'several', '足量':'enough', '两者任一':'either', '我自己':'myself', '你自己':'yourself', '一个也没有':'none', '我们自己':'ourselves', '两者皆非':'neither', '大量':'plenty', '我的':'mine', '你的':'yours', '我们的':'ours'},
  de: {'我':'ich','你':'du','我们':'wir','你们':'ihr','某人':'jemand irgendwer','人们':'man','每个人':'jeder','无人':'keiner','某物':'etwas','没有人':'niemand','没有什么':'nichts','一切':'alles'},
  fr: {'我':'je moi me','你':'tu toi te','我们':'nous','你们':'vous','您':'vous','每个人':'chacun chacune','无人':'aucun aucune','没有人':'personne','没有什么':'rien','一切':'tout'},
  es: {'我':'yo me mí', '你':'tú', '我们':'nosotros', '你们':'ustedes vosotros', '某人':'alguien alguno', '某物':'algo', '没有人':'nadie ninguno', '没有什么':'nada', '一切':'todo', '您':'usted'},
  it: {'我':'io mi', '你':'tu te ti', '我们':'noi ci', '你们':'voi vi', '某人':'qualcuno', '某物':'qualcosa', '没有人':'nessuno', '没有什么':'nulla niente', '一切':'tutto', '每个人':'ciascuno ognuno', '任何人':'chiunque'},
  la: {'我':'ego','你':'tū','我们':'nōs','你们':'vōs','某人':'aliquis quīdam','任何人':'quisquam','每个人':'quisque','没有人':'nēmō','没有什么':'nihil'}
};
function admittedPronoun(language, display, gloss) {
  const table = reviewedPronouns[language];
  return !!table && Object.prototype.hasOwnProperty.call(table, gloss) &&
    table[gloss].split(' ').includes(display.normalize('NFC'));
}
function admission(record) {

  if (EXCLUDED.has(record.pos) && !(record.pos === 'pron' && record.category === 'pronouns')) return 'excluded-use';
  if (!['noun', 'verb', 'adj', 'adv', 'num', 'name', 'pron'].includes(record.pos)) return 'unknown-pos';
  if ((record.pos === 'pron') !== (record.category === 'pronouns')) return 'pronoun-category-mismatch';
  if (record.pos === 'pron' && !admittedPronoun(record.language, record.display, record.zh)) return 'pronoun-use-excluded';
  if ((record.pos === 'num') !== (record.category === 'numerals')) return 'numeral-category-mismatch';
  if ((record.pos === 'name') !== (record.category === 'names')) return 'name-category-mismatch';
  if (record.pos === 'adv' && (record.adverb_relation.state !== 'no-adjective' || !record.adverb_relation.evidence)) return 'adjective-relation-unresolved-or-excluded';
  if (record.language === 'la' && (!['literary', 'binomial'].includes(record.latin_use.state) || !record.latin_use.evidence)) return 'Latin-use-unverified';
  if (record.category === 'names' && !record.evidence.name_origin) return 'name-origin-unverified';
  if (record.review.state !== 'approved' || !record.review.reviewer || !record.review.evidence) return 'scope-review-required';
  return null;
}
// A reviewed sense may stay queryable (lemma and forms) while never being
// recommended: single-citation Latin words (user decision 2026-11-11).
function queryOnly(record) {
  const mark = record.evidence && record.evidence.query_only;
  if (!mark) return false;
  if (!mark.reason || !mark.source || !mark.reviewer) throw new Error('query-only mark requires reason, source and reviewer');
  return true;
}
// v00.03.01（用户 11-18 定）：名词与代词同形（es nada、yo，it nulla、io，fr personne）时，名词那一义降低推荐权重，
// 查词时排在代词之后、随机抽词也少抽。标记写在 evidence.demoted（须有理由、来源、复审人），词包第 9 列记为 2。
const DEMOTED_WEIGHT = 50;
function demoted(record) {
  const mark = record.evidence && record.evidence.demoted;
  if (!mark) return false;
  if (!mark.reason || !mark.source || !mark.reviewer) throw new Error('demoted mark requires reason, source and reviewer');
  return true;
}
function weightOf(record) {
  const weight = record.category === 'creative' ? 100 : record.category === 'pronouns' ? 55 : CATEGORIES[record.category].weight || 0;
  return demoted(record) ? Math.min(weight, DEMOTED_WEIGHT) : weight;
}
function eligible(record, { mode = 'default', expanded = [], query = '' } = {}) {
  if (!['default', 'expanded', 'query'].includes(mode)) throw new Error('unknown selection mode');
  if (admission(record)) return false;
  const category = CATEGORIES[record.category];
  if (category.visibility === 'query' || record.evidence.exact_query === true) return mode === 'query' && query.trim().normalize('NFC').toLowerCase() === record.display.normalize('NFC').toLowerCase();
  if (mode === 'query') return !!query.trim();
  if (queryOnly(record)) return false;
  if (category.visibility === 'default') return true;
  return mode === 'expanded' && expanded.includes(record.category);
}
// 同一词头的义项先后：sense_order（构建时按来源词条的词性与译名先后写入；词包里是行号）。放在词频之后，只决定同一词头内的次序。
// Matching quality precedes category weights. Caller supplies 0=exact,1=form,2=folded,3=folded form.
// 先按显示词、再按 sense_order 比（全序，避免只在同词头时才比造成不可传递）；跨词头的平局原先靠 sense_id 散列，这里改按显示词，同样任意但确定
function sameWordOrder(a, b) {
  const x = a.display.normalize('NFC'), y = b.display.normalize('NFC');
  if (x !== y) return x < y ? -1 : 1;
  return (a.evidence.sense_order || 0) - (b.evidence.sense_order || 0);
}
function rankMatches(matches, options) {
  const seen = new Set();
  const caseVariants = new Map();
  for (const m of matches) if (m.tier === 0) {
    const spelling=m.record.display.normalize('NFC'), key=spelling.toLowerCase();
    if (!caseVariants.has(key)) caseVariants.set(key, new Set());
    caseVariants.get(key).add(spelling);
  }
  const requestedCase = m => m.tier === 0 && !m.caseRank && caseVariants.get(m.record.display.normalize('NFC').toLowerCase()).size > 1 ? 1 : 0;
  return matches.filter(match => {
    if (![0, 1, 2, 3].includes(match.tier)) throw new Error('invalid match tier');
    return eligible(match.record, options);
  // Recommendable senses come before query-only ones, whatever the match tier:
  // typing alba shows albus (white) before the single-citation alba (dawn).
  }).sort((a, b) => requestedCase(b) - requestedCase(a) || (queryOnly(a.record) ? 1 : 0) - (queryOnly(b.record) ? 1 : 0) || a.tier - b.tier || (a.caseRank || 0) - (b.caseRank || 0) || weightOf(b.record) - weightOf(a.record) || (a.record.evidence.frequency_rank || Infinity) - (b.record.evidence.frequency_rank || Infinity) || sameWordOrder(a.record, b.record) || a.record.sense_id.localeCompare(b.record.sense_id))
    .filter(match => { if (seen.has(match.record.sense_id)) return false; seen.add(match.record.sense_id); return true; });
}
  const api = { CATEGORIES, admittedPronoun, admission, eligible, queryOnly, demoted, weightOf, rankMatches };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.LEXICON_POLICY = api;
})(typeof window !== 'undefined' ? window : this);
