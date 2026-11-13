/* Shared T19 scope and ranking policy: compiler and inspection/runtime consumers. */
(function (root) {
  'use strict';
const CATEGORIES = {
  daily: { weight: 100, visibility: 'default', directory: 'daily' },
  creative: { weight: 90, visibility: 'default', directory: 'creative' },
  'professional-humanities': { weight: 60, visibility: 'expanded', directory: 'professional/humanities' },
  'professional-natural': { weight: 55, visibility: 'expanded', directory: 'professional/natural' },
  'historical-cultural': { weight: 60, visibility: 'expanded', directory: 'historical-cultural' },
  names: { weight: 1, visibility: 'query', directory: 'query' },
  numerals: { weight: null, visibility: 'query', directory: 'query' },
};
const EXCLUDED = new Set(['prep', 'postp', 'conj', 'pron', 'det', 'article', 'aux', 'particle', 'contraction', 'intj']);
function admission(record) {

  if (EXCLUDED.has(record.pos)) return 'excluded-use';
  if (!['noun', 'verb', 'adj', 'adv', 'num', 'name'].includes(record.pos)) return 'unknown-pos';
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
function eligible(record, { mode = 'default', expanded = [], query = '' } = {}) {
  if (!['default', 'expanded', 'query'].includes(mode)) throw new Error('unknown selection mode');
  if (admission(record)) return false;
  const category = CATEGORIES[record.category];
  if (category.visibility === 'query') return mode === 'query' && query.trim().normalize('NFC').toLowerCase() === record.display.normalize('NFC').toLowerCase();
  if (mode === 'query') return !!query.trim();
  if (queryOnly(record)) return false;
  if (category.visibility === 'default') return true;
  return mode === 'expanded' && expanded.includes(record.category);
}
// Matching quality precedes category weights. Caller supplies 0=exact,1=form,2=folded,3=folded form.
function rankMatches(matches, options) {
  const seen = new Set();
  return matches.filter(match => {
    if (![0, 1, 2, 3].includes(match.tier)) throw new Error('invalid match tier');
    return eligible(match.record, options);
  // Recommendable senses come before query-only ones, whatever the match tier:
  // typing alba shows albus (white) before the single-citation alba (dawn).
  }).sort((a, b) => (queryOnly(a.record) ? 1 : 0) - (queryOnly(b.record) ? 1 : 0) || a.tier - b.tier || (a.caseRank || 0) - (b.caseRank || 0) || (CATEGORIES[b.record.category].weight || 0) - (CATEGORIES[a.record.category].weight || 0) || a.record.sense_id.localeCompare(b.record.sense_id))
    .filter(match => { if (seen.has(match.record.sense_id)) return false; seen.add(match.record.sense_id); return true; });
}
  const api = { CATEGORIES, admission, eligible, queryOnly, rankMatches };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.LEXICON_POLICY = api;
})(typeof window !== 'undefined' ? window : this);
