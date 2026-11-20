// 正式命名词库范围；按词性而非拼写排除，同形实义词保留。
import policy from '../../app/assets/lexicon-policy.js';
export const SCOPE_VERSION = 3; // 重建：按义放行代词，感叹词退出。
const FUNCTION = new Set(['prep', 'preposition', 'postp', 'conj', 'conjunction',
  'pron', 'pronoun', 'det', 'determiner', 'art', 'article', 'aux', 'auxiliary',
  'part', 'particle', 'contraction']);
export function excludedPos(pos) {
  return FUNCTION.has(String(pos || '').toLowerCase().replace(/\.$/, ''));
}
export function scopeRow(row, lang) {
  const groups = String(row[1] || '').split('|');
  const kept = groups.filter(group => {
    const pos = ((group.match(/^([a-z]+)\./i) || [])[1] || '').toLowerCase();
    if (['intj', 'interj', 'int', 'interjection'].includes(pos)) return false;
    if (pos === 'pron' || pos === 'pronoun') {
      return policy.admittedPronoun(lang, row[0], group.slice(pos.length + 1));
    }
    return !excludedPos(pos);
  });
  if (!kept.some(Boolean)) return null;
  const result = row.slice(); // 保留未来扩展位与未知元数据
  result[1] = kept.join('|');
  result[2] = ['fr', 'de', 'es', 'it'].includes(lang) && kept.some(g => /^n\./.test(g)) ? (row[2] || '') : '';
  result[3] = row[3] ?? ''; // 独立注释位；不得把审核理由或未知性别猜成注释
  return result;
}
export function scopeWords(words, lang) {
  return Object.fromEntries(Object.entries(words).map(([letter, rows]) =>
    [letter, rows.map(row => scopeRow(row, lang)).filter(Boolean)]));
}

// 非独立形式（Q4-R1）：一个词条（写法 + 词性）在维基词典里的**全部**原始义项都只是在说明它是别的词的变形或组合，
// 例如意语「compound of the infinitive porre with le」、拉丁语「genitive/locative singular of bellum」、
// 「second-person singular present active imperative of orior」、「past participle of tessere」。这类不作独立命名候选，改进变形索引。
// 只要有一个义项是真正的释义（farci「to make it」、andarsene「to go away」、同写法的名词组）就保留——已词汇化的不动。
// 不算变形的：female equivalent / feminine / plural / diminutive / synonym / variant / spelling of（多是独立的词）。
// 传入的必须是借用原形释义**之前**的义项。
const FORM_GLOSS = /^(?:used other than figuratively or idiomatically:\s*)?compound of\b|\b(?:first|second|third)-person\b[^;]*\bof\b|\b(?:nominative|accusative|genitive|dative|ablative|locative|vocative)\b[\w\/ -]*\b(?:singular|plural)\s+of\b|\b(?:participle|supine)\s+of\b|^(?:(?:nominative|accusative|genitive|dative|ablative)(?:\/(?:nominative|accusative|genitive|dative|ablative))*\s+)?gerund\s+of\b|^only used in\b.*\bgerund\s+of\b|^inflection of\b/i;
// 德语独立名词可在实义之后附“gerund of”词源说明：Kriechen（蠕变）、Abwerfen（抛下）。
// 不能只因说明中出现 gerund 就删掉独立名词义；纯“gerund of …”仍排除。
export function formOnly(glosses) {
  return glosses.length > 0 && glosses.every((g) => FORM_GLOSS.test(String(g)));
}
