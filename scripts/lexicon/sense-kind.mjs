// Wiktionary 的 form_of 也用于派生关系；施事名词不是动词的屈折形式。
// 仅修已普查的德语 noun + agent；其他语言、分词、复数和拼写变体沿用旧口径。
export function isInflectionSense(lang, pos, sense) {
  const agent = lang === 'de' && pos === 'noun' &&
    (sense.tags || []).includes('agent') &&
    (sense.glosses || []).some(g => /^agent noun of\b/i.test(g));
  return !!(sense.form_of || sense.alt_of) && !agent;
}
