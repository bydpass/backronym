/* 意大利语规则（v00.03.00 T16）。语言包加载器（lang/packs.js）按需插入，经 CORE.addLang 注册；没写的字段沿用英语（core.js 的 RULES.en）。
   ponytail: 第 4 批 T21 起这些规则才真正接进界面（比对去变音符、格子显示原字母、ß → SS）；分图词缀表先置空（PLAN T16），
   digitSounds（数字格的读音别名）须用户批准后再填（PLAN T31，建议表见 PLAN 第 2 批交付），批准前为空。ES2017 经典脚本。 */
(function (CORE) {
  "use strict";
  var MARKS = /[\u0300-\u036f]/g;
  // 比较、查询、查词库用的写法：去变音符（D5「比对时忽略变音符」），ß → ss，连字 œ / æ 拆开
  // 先转小写再展开连字：Œuvre 与 œuvre、ẞ 与 ß 得到同一个键（V003-B2-R4）
  function fold(s) { return String(s || "").toLowerCase().normalize("NFD").replace(MARKS, "").replace(/\u00df/g, "ss").replace(/\u0153/g, "oe").replace(/\u00e6/g, "ae"); }
  CORE.addLang("it", {
    fold: fold,
    // 单词 → 格字母：保留带变音符的大写字母（É、Ñ），ß 变 SS 占两格（D5）；数字自成一格
    letters: function (text) { return String(text || "").normalize("NFC").replace(/[\u00df\u1e9e]/g, "SS").toUpperCase().replace(/[^A-Z\u00c0-\u00d6\u00d8-\u00de\u0100-\u024f0-9]/g, ""); }, // 大写 ẞ 也是 SS（V003-B2-R4）
    bare: function (w) { return fold(w).replace(/[^a-z]/g, ""); },
    display: function (w) { return w.charAt(0).toUpperCase() + w.slice(1); },
    // 字符范围与 build-lexicon.mjs 的 DISPLAY_OK 一致：Latin-1 字母（含 ß）、扩展 A / B（ȳ）（V003-B2-R3）
    wordChar: /[A-Za-z\u00c0-\u00d6\u00d8-\u00f6\u00f8-\u024f0-9'\u2019 \-\u4e00-\u9fff]/,
    customWord: /^[a-z\u00df-\u00f6\u00f8-\u024f0-9][a-z\u00df-\u00f6\u00f8-\u024f0-9'\u2019 -]{0,27}$/i, // 格内上限 28（Q11 / T28）；含 ß 与扩展 B
    wordMax: 28,
    articles: ["il", "lo", "la", "l\u2019"], // 冠词一行能点的：定冠词单数（v00.04.00，用户定）
    digitNames: ["zero","uno","due","tre","quattro","cinque","sei","sette","otto","nove"], // Q6：0 的读法
    digitSounds: [[], [], [], [], [], [], [], [], [], []],
    commonSplits: {}, prefixes: [], suffixes: [], derivSuffixes: [], latinTails: [], latinPrefixes: []
  });
})(window.CORE);
