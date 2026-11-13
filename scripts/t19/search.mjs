// Search expansions only: never evidence of sense equivalence or admission.
export const SEARCH_ALIASES = {
  '窗': ['窗户'], '月亮': ['月'], '影': ['影子'], '晨曦': ['黎明'], '追寻': ['追求'],
};
export function searchTerms(label) {
  return [...new Set([label, ...(SEARCH_ALIASES[label] || [])])];
}
export function glossTerms(gloss, pos) {
  const text = gloss.replace(/（[^）]*）|\([^)]*\)/g, '').trim();
  return [...new Set([text, ...(pos === 'adj' && text.endsWith('的') && text.length > 1 ? [text.slice(0,-1)] : [])])];
}
