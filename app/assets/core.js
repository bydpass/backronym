/* 藏头 - Backronym 纯逻辑 —— 不碰 DOM，浏览器与 Node 测试共用。经典脚本，ES2017，无 import/export（容器要求）。
   浏览器：index.html 里在 app.js 之前 <script src>，暴露 window.CORE。
   Node：scripts/test-core.mjs 用 new Function 加载（容器 CSP 只管浏览器，测试不受影响）。
   版式规则由 DOM 预览与 Canvas 导出共用。 */
(function (root) {
  "use strict";

  // app.js 的 FONT 取自这里
  var FONT_BASE = '"Noto Sans","Noto Sans SC","PingFang SC","Microsoft YaHei",sans-serif';
  var FONT = FONT_BASE;
  // 四个主题的字体（2026-11-12）：西文用在卡上的词、冠词、标题、图版大字母，候选栏里的词，作品页的单词和预设词；中文用在卡上的标题、释义、配文和页面大标题。
  // 字体文件在 app/assets/fonts/（scripts/build-fonts.mjs 生成的子集，全部 SIL OFL 1.1）。"BK …" 是 Libre Baskerville、Federo、霞鹜文楷裁剪后的名字（原名是保留字体名，裁剪版不能沿用）。
  // 印象派的中文沿用 Noto Sans SC。卡和导出图用同一个字体串：主题西文 → 主题中文 → Noto 兜底
  var SKIN_FONTS = {
    fandom: { latin: "BK Fandom Serif", cjk: "Noto Serif SC" },
    dansaekhwa: { latin: "Gowun Batang", cjk: "BK Dansaekhwa Kai" },
    impressionism: { latin: "Cormorant Garamond", cjk: "" },
    secession: { latin: "BK Secession Display", cjk: "Noto Serif SC" }
  };
  function useSkinFont(skin) {
    var f = Object.prototype.hasOwnProperty.call(SKIN_FONTS, skin) ? SKIN_FONTS[skin] : null;
    FONT = f ? '"' + f.latin + '",' + (f.cjk ? '"' + f.cjk + '",' : "") + FONT_BASE : FONT_BASE;
    return FONT;
  }

  // D19：卡 / 导出图两套色板（取自 design/folio-swiss.html 的 .card / .card.dark）。ph 只用于编辑面占位
  // T40 / U14：所有屏蔽词触发的提示统一成这一句（入场页单词 / 填表人、义项行、候选栏、点「完成」被拦）；不复述被拦的词，不点名平台（网页版也有屏蔽器）
  var BLOCKED_MSG = "填入内容不适合发布，换一个吧";

  var PALETTE = {
    light: { bg: "#e9e8e4", ink: "#1c1c1b", red: "#b0301c", plate: "#dfded9", mute: "#5f5d58", soft: "#3b3a38", ph: "#69665f" },
    dark: { bg: "#0b0b0a", ink: "#e7e5e0", red: "#e5674f", plate: "#1a1a19", mute: "#a09d97", soft: "#cfccc6", ph: "#88857f" },
  };

  // 四个主题（2026-11-12）：每个主题的浅 / 深两套色板，与 style.css 的 :root[data-skin] 同值（npm test 核对）。fandom 只有浅色。
  // 上面的 PALETTE（石白 / 墨）只作没有主题脚本时的回退，产品里选不到；卡和导出图用 paletteOf(当前主题, 是否深色)。
  var PALETTES = {
    fandom: { light: { bg: "#ffffff", ink: "#2a2a2a", red: "#990000", plate: "#dddddd", mute: "#606060", soft: "#444444", ph: "#666666" } },
    dansaekhwa: { light: { bg: "#e9e6df", ink: "#2b2b2b", red: "#7a4f2a", plate: "#dcd8ce", mute: "#605d56", soft: "#44423e", ph: "#69655d" }, dark: { bg: "#1e1d1b", ink: "#e9e6df", red: "#d2a273", plate: "#2f2d2a", mute: "#a39e93", soft: "#cfcac0", ph: "#938e85" } },
    impressionism: { light: { bg: "#eef0ea", ink: "#2a3350", red: "#a34732", plate: "#dfe4e4", mute: "#5a6280", soft: "#3f4867", ph: "#626a85" }, dark: { bg: "#171b2b", ink: "#eef0ea", red: "#e99a8a", plate: "#272d45", mute: "#9aa3bd", soft: "#cdd2e0", ph: "#838cab" } },
    secession: { light: { bg: "#f3efe2", ink: "#151515", red: "#8f1d1d", plate: "#e6e0cf", mute: "#62625d", soft: "#3a3936", ph: "#6b6b66" }, dark: { bg: "#131312", ink: "#f3efe2", red: "#c6a24a", plate: "#242320", mute: "#a7a294", soft: "#d6d1c2", ph: "#8d887b" } },
  };
  var SKINS = [["fandom", "fandom"], ["dansaekhwa", "单色画"], ["impressionism", "印象派"], ["secession", "分离派"]]; // [id, 设置页里的名字]
  function paletteOf(skin, dark) {
    var p = Object.prototype.hasOwnProperty.call(PALETTES, skin) ? PALETTES[skin] : PALETTE;
    return dark && p.dark ? p.dark : p.light;
  }

  // WCAG 相对亮度；原生选色器提供六位 sRGB 十六进制色值。
  function contrastRatio(a, b) {
    function luminance(hex) {
      var rgb = [1, 3, 5].map(function (i) {
        var v = parseInt(hex.slice(i, i + 2), 16) / 255;
        return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
      });
      return rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
    }
    var x = luminance(a), y = luminance(b);
    return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
  }

  // D14：单图版式（1080×1440 坐标；base = 文字基线，y = 块的上沿）
  var CARD = {
    W: 1080, H: 1440, M: 80, CW: 920,
    INFO: { base: 96, size: 50, minFiller: 26 },                       // 左页码、右填表人（右对齐到 M + CW）；2026-11-17 真机反馈后 26 → 34；v00.03.01 U01（用户 11-18 定）34 → 50
    RULE: { y: 120, h: 3 },
    TITLE: { base: 236, size: 76, track: -1, size2: 60, base2: [204, 274] }, // 76 → 60 单行 → 60 两行
    PLATE: { y: 290, h: 600 },
    GIANT: { dx: 48, base: 834, size: 620, track: -8 },  // 无配图时图版里的超大关键字母
    WORD: { base: 1036, size: 120, track: -2, min: 56, step: 4, lead: 64, artMin: 26 }, // lead = 折行后的行距；artMin = 冠词字号下限（v00.03.00）
    BAR: { y: 1068, w: 140, h: 10 },
    GLOSS: { base: 1158, size: 40 }, // v00.03.01 U04（用户 11-18 定乙）：释义次要，48 粗体墨色 → 40 常规灰色；配文改粗体墨色
    CAPTION: { base: 1228, size: 48, lead: 62, last: 1356 }, // 2026-11-17 真机反馈：38 → 48，可折行；末行基线不超过 last（词没折行时 3 行，词每多折一行少一行）
    EMPTY: { size: 72, firstSize: 44, lineY: 1062, lineW: 560 }, // 仅编辑面
  };

  // D14：列阵版式（n = 1..10；W / H 由 gridShape 算）
  var GRID = {
    M: 100, PW: 300, PH: 400, GAP: 48, ROW: 620, TOP: 300, FOOT: 40, PER_ROW: 5, MIN_W: 1080,
    INFO: { base: 80, size: 34 }, RULE: { y: 104, h: 3 },
    TITLE: { base: 230, size: 96, track: -1.5, min: 20 },
    GIANT: { dx: 22, dbase: 370, size: 300 },
    WORD: { dbase: 490, size: 56, track: -1, min: 20, lead: 24, artMin: 16 },
    BAR: { dy: 508, w: 60, h: 6 },
    GLOSS: { dbase: 560, size: 28 },
  };

  var PAGE_SIZE = 8;   // 候选每批 8 个（D16，2 列 × 4 行）
  var POOL_SIZE = 200; // 随机一个的池子大小（D6）

  // ---------- 字母规则（T12：写死的 A–Z / 大小写判断都收在这里；其余代码只调 LANG） ----------
  // v00.03.00 T04：RULES 是注册表，键 = 语种代码。英语内置；西文各语言的规则由语言包经 CORE.addLang 注册（第 4 批）。
  // LANG = 当前规则，CORE.useLang(code) 切换；CORE.LANG 是读当前规则的取值器
  var RULES = {
    en: {
      code: "en",
      // v00.03.01 R07（用户 11-18 定：输入框兼容重音符，不论选的语言用不用得上，照原样保留拼写）：英语也收带变音符的字母（être、émail、café），
      // 字符范围、比对去变音符与西文五门一致；纯 A–Z 的输入结果不变
      fold: function (s) { return String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/ß/g, "ss").replace(/œ/g, "oe").replace(/æ/g, "ae"); }, // 比较、查询、查词库用的写法
      exactKey: function (s) { return String(s || "").normalize("NFC").toLowerCase(); }, // 保留变音符的精确查词键；西文沿用
      letters: function (text) { return String(text || "").normalize("NFC").replace(/[ßẞ]/g, "SS").toUpperCase().replace(/[^A-ZÀ-ÖØ-ÞĀ-ɏ0-9]/g, ""); }, // T41（R4）：数字自成一格；单词 → 格字母（转大写，带变音符的字母照留）
      bare: function (w) { return RULES.en.fold(w).replace(/[^a-z]/g, ""); },  // 只留字母（词族比词干用）
      display: function (w) { return w.charAt(0).toUpperCase() + w.slice(1); },            // 卡上显示：首字母大写，其余照打
      wordChar: /[A-Za-zÀ-ÖØ-öø-ɏ0-9'’ \-一-鿿]/,  // 单词框允许的字符（汉字只用来检索；T41 起含数字：2nd、4ever；R07 起含带变音符的字母）
      customWord: /^[a-zß-öø-ɏ0-9][a-zß-öø-ɏ0-9'’ -]{0,27}$/i, // 词典外自定义词的写法（上限同 wordMax）
      compose: true, // 格里的词先把「字母 + 组合变音符」合成一个字（NFC）再过滤、计数（V003-B4-R9；R07 起英语同西文）
      wordMax: 28, // 格里的词最多几个字符（v00.03.00 T28 放进各语言规则；v00.03.01 E2 起英语也是 28，六门一致，只剩英语时不会再有放不下的词）
      // 词库释义里的名字说明（T37 / B3-R2，只用于显示层）：别名「等于Arabella」、外文残片「Isabella」、义项上挂的别名括号「（等于Diana」、英文括号人名标签「(Sethe)人名」
      // T41 / U16 / U19：数字格按英文读法取首字母（0 读作 oh → O）；词以读法首字母或该数字本身开头都算对
      digitNames: ["oh", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine"],
      // T31：数字格的读音别名前缀（2026-11-08 用户批准的英文表）。词以其中之一开头就算对、也进候选；跨首字母的只有 zero、won、ate。
      // 西文五门本版用标准数字读法、不加谐音别名（11-10 用户定），各自的 digitSounds 为空
      digitSounds: [["oh", "zero"], ["one", "won"], ["to", "too", "two"], ["three"], ["for", "fore", "four"], ["five"], ["six"], ["seven"], ["eight", "ate"], ["nine"]],
      isDigit: /^[0-9]$/,
      // T42 / U17 / U21：长词分图。第 1 档「已核对的常见词切点」（前一张的格数）；第 2 档的词缀表（词干 = 主词库里的词）
      commonSplits: { photographer: 5, anniversary: 4, mathematics: 8 },
      prefixes: ["inter", "under", "over", "extra", "infra", "super", "trans", "mis", "dis", "counter", "multi", "micro", "macro", "semi", "anti", "auto", "hyper", "post", "fore", "out"],
      suffixes: ["ment", "ments", "ation", "ations", "ition", "tion", "sion", "ion", "ship", "ships", "ing", "ings", "istic", "istics", "ically", "ical", "ity", "ness", "able", "ible", "ably", "ibly", "ful", "fully", "less", "lessly", "ous", "ously", "ive", "ively", "al", "ally", "ly", "ics", "ism", "ist", "ists", "ence", "ance", "ency", "ancy", "ant", "ent", "ward", "wards", "wise", "hood", "dom"],
      // B6-R1：「词 + 词」切点的两条反证。① 派生词尾：整词 = 词库里的词 + 这些后缀（容许去 e、双写辅音、多 k），切点落在词干最后 3 个字母里或后缀里时，
      // 那是偶然拼接（traffic|king、regret|table、horizon|tally），除非落下的那截词干本身是词（shop|lift+ing）。② 拉丁词尾：右段以这些结尾时，
      // 左段得是拉丁前缀才算构词（con|sequence、pre|occupation 对；male|diction、rein|carnation、gene|rational 不对）
      derivSuffixes: ["ing", "ed", "er", "able", "ible", "ly", "al", "ation", "ion", "ment", "ance", "ence", "ity", "ous", "ness", "ist", "ism"],
      latinTails: ["tion", "sion", "ional", "ive", "ate", "ine", "ence", "ance", "ent", "ant"],
      latinPrefixes: ["pre", "pro", "con", "com", "cor", "per", "sub", "non", "para", "inter", "trans", "super", "counter", "post", "anti", "multi", "semi", "extra", "under", "over",
        "radio", "retro", "photo", "bio", "psycho", "geo", "thermo", "hydro", "electro", "neuro", "tele", "micro", "macro", "mono", "poly", "eco", "chemo", "cosmo", "stereo", "theo", "aqua"],
      commonRank: 100, // 两段都在各自首字母组的前 100 个常用词里：是普通复合词（work|station），不套拉丁词尾的反证
      nameAlias: /^等于[A-Za-z]/,
      nameLatin: /^[A-Za-z][A-Za-z .'\-]*$/,
      aliasMark: /[（〔]等于[A-Za-z][^（）〔〕]*(?:[）〕]|$)/g,
      nameTag: /^\([A-Za-z][^()]*\)\s*(?:人名|男子名|女子名|姓氏|姓)$/
    }
  };
  var LANG = RULES.en;
  var ACTIVE = [RULES.en];
  function hasLang(code) { return typeof code === "string" && Object.prototype.hasOwnProperty.call(RULES, code); }
  // 切换当前规则：没注册的语种不切、返回 false（调用方先等语言包的规则就绪，T05）
  function useLang(code) { if (!hasLang(code)) return false; LANG = RULES[code]; ACTIVE = [LANG]; return true; }
  // 语言多选（2026-11-12）：作品可以同时用几门语言，一律平等。ACTIVE = 选中的各门规则；LANG = 定字母规则的那一门：
  // 五门西文的字母规则是同一套，只有英语不同，所以只要选了任何一门西文就按西文的规则，只选英语才按英语的。
  // 数字格的读法、屏蔽词表、预设词按 ACTIVE 合起来算；候选、查词由调用方逐门语言取（withLang）。
  function useLangs(codes) {
    if (!Array.isArray(codes) || !codes.length || !codes.every(hasLang)) return false;
    var list = codes.filter(function (c, k) { return codes.indexOf(c) === k; });
    ACTIVE = list.map(function (c) { return RULES[c]; });
    LANG = ACTIVE.filter(function (r) { return r.code !== "en"; })[0] || ACTIVE[0];
    return true;
  }
  // 暂时按某一门语言的规则跑一段（取它的候选、查它的词库），不动 ACTIVE；出来后恢复
  function withLang(code, fn) {
    if (!hasLang(code)) return undefined;
    var cur = LANG;
    LANG = RULES[code];
    try { return fn(); } finally { LANG = cur; }
  }
  function activeLangs() { return ACTIVE.map(function (r) { return r.code; }); }
  // 注册一门语言的规则（语言包调用）。缺的字段沿用英语的（只覆盖需要不同的部分）；code 以注册的键为准
  function addLang(code, rules) {
    var r = {};
    Object.keys(RULES.en).forEach(function (k) { r[k] = RULES.en[k]; });
    Object.keys(rules || {}).forEach(function (k) { r[k] = rules[k]; });
    if (!rules || rules.compose === undefined) r.compose = true; // 注册进来的都是带变音符的语言
    if (!rules || !rules.presets) r.presets = []; // 预设词与释义不沿用英语的（见 setPresets）
    if (!rules || !rules.presetGloss) r.presetGloss = {};
    r.code = code;
    RULES[code] = r;
    return r;
  }

  // ---------- 入场界面的预设单词（T18 / 闸口 A · A1） ----------
  // 「文学艺术命题」高频词 60 个：ECDICT frq ≤ 3000、不被屏蔽、按「只认首字母」每个字母可选词 ≥ 67（11-04 核对）。每次打开入场界面随机抽 6 个
  var PRESETS = ("time life child world family night home mother story friend father power city body art war love music death heart light mind hope road " +
    "fire blood nature lie loss truth dark memory spring peace fear sea dream freedom winter identity faith river youth justice hate earth desire soul dance " +
    "beauty silence secret honor self journey wealth darkness pride joy fate").split(" ");
  // 不重复地抽 n 个（部分 Fisher–Yates），转成格字母写法；rand 可注入（测试用），缺省 Math.random。被屏蔽的跳过（词表本来就都放行，防以后改表）
  // avoid（T39「换一组」）：要避开的上一组；剩下的不够 n 个时才放宽，不让预设变少
  // 预设词表与文学命题释义（人工审定的小表，app/assets/lang/presets.js 由 scripts/build-presets.mjs 生成后调用）。
  // pairs = [[词, 释义], …]。英语的词固定用上面的 PRESETS，这里只收释义；其余语言的词也取自这张表。
  // 每门语言各存各的（addLang 会把英语规则抄给新语言，所以没有表的语言要显式置空，不沿用英语的释义）
  function setPresets(code, pairs) {
    var r = RULES[code];
    if (!r || !Array.isArray(pairs)) return false;
    var gloss = {};
    pairs.forEach(function (p) { gloss[r.fold(r.letters(p[0]))] = p[1]; });
    r.presets = code === "en" ? undefined : pairs.map(function (p) { return p[0]; });
    r.presetGloss = gloss;
    return true;
  }
  function pickPresets(n, rand, avoid) {
    // v00.03.00：预设词随语言换一组。英语用上面这张表；其余语言取 setPresets 给的词（没有就不出预设）。
    // 选了几门语言：各门各自洗牌，再轮流各取一个，凑够 n 个（2026-11-12 语言多选）
    var r = rand || Math.random, out = [];
    var pools = ACTIVE.map(function (R) {
      var pool = (R.code === "en" ? PRESETS : R.presets || []).filter(function (w) { return !blocked(w); });
      var fresh = avoid ? pool.filter(function (w) { return avoid.indexOf(LANG.letters(w)) < 0; }) : pool;
      if (fresh.length >= Math.ceil(n / ACTIVE.length)) pool = fresh;
      pool = pool.slice();
      for (var k = 0; k < n && k < pool.length; k++) {
        var j = k + Math.floor(r() * (pool.length - k)), t = pool[k];
        pool[k] = pool[j]; pool[j] = t;
      }
      return pool.slice(0, n);
    });
    for (var round = 0; out.length < n && pools.some(function (q) { return round < q.length; }); round++) {
      for (var a = 0; a < pools.length && out.length < n; a++) {
        if (round >= pools[a].length) continue;
        var cells = LANG.letters(pools[a][round]);
        if (out.indexOf(cells) < 0) out.push(cells);
      }
    }
    return out;
  }
  // 一个预设词（格字母写法）的释义和它来自哪门语言；选中的语言里都没有就为 null
  function presetInfo(cells) {
    for (var k = 0; k < ACTIVE.length; k++) {
      var g = (ACTIVE[k].presetGloss || {})[ACTIVE[k].fold(cells)];
      if (g) return { gloss: g, lang: ACTIVE[k].code };
    }
    return null;
  }

  // 屏蔽器只在小红书版存在；没有就放行（与 app.js 的 blocked() 同规则）
  function blocked(text) { return !!root.BLOCK && ACTIVE.some(function (R) { return root.BLOCK.hit(text, R.code); }); } // T02：按语言的词表查；选了几门语言取并集

  // ---------- 选词（从 app.js 搬来，行为不变） ----------

  // 排序：英文前缀命中 > 中文义项完全命中 > 英文包含 / 中文释义包含（部分命中）> 中文模糊（字重合多的在前）；同档保持词频顺序
  // 义项完全命中（T06 / D1）：某个义项（词性组内以「，」分、组间以「|」分）恰好等于查询，“生活”先出 life（生命，生活）、后出 lifestyle（生活方式）
  // 中文模糊：查询里至少一半的汉字出现在该词的义项里，“脸庞”能找到 face（脸，面容）
  function filterWords(list, query) {
    if (!LANG.fold(query)) return list;
    return [].concat.apply([], filterTiers(list, query));
  }

  // 同上，但按命中档分开返回 [英文前缀, 义项完全命中, 部分命中, 模糊]（候选首屏要在档内整理、不跨档，T25）
  // R3-12：输入里已有的音符要在候选的同一位置保留（打 farò 不列 faro，打 publicó 不列 público）；没打音符的输入照旧去音符比（ete → été）。
  // markUnits 把文字拆成「字母 + 它的音符」；marksKept 看 word 从第 at 个字母起，输入里带音符的每个字母在 word 里是否带着同样的音符
  function markUnits(text) {
    var out = [];
    LANG.exactKey(text).normalize("NFD").split("").forEach(function (ch) {
      if (/[\u0300-\u036f]/.test(ch) && out.length) out[out.length - 1].m += ch; else out.push({ b: ch, m: "" });
    });
    return out;
  }
  function marksKept(typed, word, at) {
    var a = markUnits(typed), b = markUnits(word);
    for (var k = 0; k < a.length; k++) {
      var u = b[at + k];
      if (!u || u.b !== a[k].b || (a[k].m && a[k].m !== u.m)) return false;
    }
    return true;
  }
  function filterTiers(list, query) {
    var q = LANG.fold(query);
    var han = uniqueHan(query);
    var marked = /[\u0300-\u036f]/.test(String(query).normalize("NFD"));
    var head = [], exact = [], mid = [], fuzzy = [];
    list.forEach(function (it, idx) {
      var at = LANG.fold(it[0]).indexOf(q);
      if (marked && at >= 0 && !marksKept(query, it[0], at)) at = -1;
      // T21：词也按比较写法比（去变音符、不分大小写）：打 ete 找到 été，打 lie 找到德语名词 Liebe；英语词库全小写，结果不变
      // 只在查询含汉字时比中文，且去掉词性标记，免得搜 "ad" 命中所有 "adj."
      var zh = han.length ? senseList(it).join("|") : "";
      if (at === 0) head.push(it);
      else if (han.length && ("|" + zh.replace(/，/g, "|") + "|").indexOf("|" + query + "|") >= 0) exact.push(it);
      else if (at > 0 || (han.length && zh.indexOf(query) >= 0)) mid.push(it);
      else if (han.length > 1) {
        var n = 0;
        han.forEach(function (c) { if (zh.indexOf(c) >= 0) n++; });
        if (n * 2 >= han.length) fuzzy.push([n, idx, it]);
      }
    });
    // Chrome 61 的 sort 不稳定，用原下标兜底
    fuzzy.sort(function (a, b) { return b[0] - a[0] || a[1] - b[1]; });
    return [head, exact, mid, fuzzy.map(function (f) { return f[2]; })];
  }

  function uniqueHan(text) {
    var out = [];
    (text.match(/[一-鿿]/g) || []).forEach(function (c) { if (out.indexOf(c) < 0) out.push(c); });
    return out;
  }

  // 词典外的自定义词：字母开头，可含空格 ' -；首字母等于该格字母才合法（T17，containsLetter）
  function customWord(query, letter) {
    var ok = LANG.customWord.test(String(query).replace(/ /g, "")) && containsLetter(query, letter);
    return ok ? [query, ""] : null;
  }

  // [word, "adj.相似的，同样的|n.爱好|[计]…"] → [{pos:"adj.", senses:["相似的","同样的"]}, …]
  // 组已按 形容词 → 名词 → 其余 → 领域义项 排好；去掉被屏蔽的义项（love 的“性爱”）和因此变空的组
  // id = 这一组义项的身份：词性；同一词性有几组时（同形、性别不同的名词：le livre 书 / la livre 磅）第 2 组起带序号「n.#2」。
  // 每格选中的是哪一组记这个 id（state.poss），冠词据此取
  function senseGroups(item) {
    var seen = {};
    return (item[1] || "").split("|").map(function (g) {
      var m = g.match(/^([a-z]+\.|\[[^\]]+\])(.*)$/);
      var pos = m ? m[1] : "", body = m ? m[2] : g, k = (seen[pos] = (seen[pos] || 0) + 1);
      var o = { pos: pos, senses: body.split("，").filter(function (s) { return s && !blocked(s); }) };
      if (k > 1) o.id = pos + "#" + k; // 第一组的 id 就是词性本身，不另写（senseId）
      return o;
    }).filter(function (g) { return g.senses.length; });
  }

  // T37 / U11：显示层去掉人名 / 地名类括号标注（含带地点、身份信息的，如（美国城市）（英国作家）（喜剧演员））。词库原文、搜索与随机池的专名判断（properName）不动。
  // 规则按 words.js 全量括号内容核对过：去掉 …名 / 姓氏 / 名称、…城市 / 港市 / 首都 / 郡名 / 地名 / 公司、…作家 / 诗人 / …家 / 演员 / 先知 / 之子 等；
  // 「河、湖、海的」「德国货币」「国家代码」「家畜」「（手）」这类说明保留。词库有一处用「〔」开括号（lindsay「琳赛〔女子名）」），一并认
  var NAME_LABEL = /^(?!音名$)(?:.{0,6}(?:名|姓|姓氏|姓氏名|姓名|名称|名字)|.{0,6}(?:城市|成市|港市|港口|首都|郡名|邦名|地名|城市名|市名|州名|国名|公司)|.{0,6}(?:作家|诗人|剧作家|哲学家|化学家|数学家|神学家|政治家|工程师|先知|族长|修女|前总统|演员|之子)|位于.{1,6}|国家或地区)$/;
  var LABEL_RE = /[（〔]([^（）〔〕]*)(?:[）〕]|$)/g;
  function stripNameLabel(s) {
    var raw = String(s || ""), out = raw.replace(LABEL_RE, function (m, t) { return NAME_LABEL.test(t) ? "" : m; });
    var half = out.match(/^([^（〔]*)[）〕]$/); // 被「，」切开的后半截：「姓氏）」
    if (half && NAME_LABEL.test(half[1])) out = "";
    if (LANG.nameTag.test(out)) out = ""; // 英文括号写法：sethe「(Sethe)人名」——标签本身，不是译名
    return out.replace(/\s+$/, "");
  }
  // 词库按「，」切义项时把括号劈开了：一条名字说明（「亚瑟（男子名，圆桌骑士团的首领）」）会剩下落单的后半截（「圆桌骑士团的首领）」）或年份（「1865-1936」）。
  // 同一组里只要去掉过名字标注，这类残片就是那条名字说明的一部分，一并不显示。
  // ponytail: 不属名字说明的残片（「讨厌等）」）是 build-dict.mjs 切括号造成的，不在 T37 范围，留给生成器修
  // 还有被切成三段时的中段别名（bella「等于Arabella，Isabella），贝拉（女子名」里的「等于Arabella」）。只在去过名字标注的组里认，普通词里的「等于」不动
  function nameFragment(x) { return /^[^（〔]*[）〕]$/.test(x) || /^[\d\s\-–—~～]+$/.test(x) || LANG.nameAlias.test(x) || LANG.nameLatin.test(x); }
  // 名字组里义项上挂的别名括号（diane「黛安（等于Diana」）：去掉括号，保留名字
  function stripAlias(x) { return x.replace(LANG.aliasMark, "").replace(/\s+$/, ""); }

  // 给人看的义项（候选、义项栏、默认释义、入场页释义行）：去掉名字 / 地名标注与其残片后为空的义项不留，重复的合并。
  // 整个词条只有标签（wes「男子名）」、salisbury「原罗得西亚首都）」）时就是空的：没有可用的中文释义，不拿标签冒充译名（B3-R2），
  // 入场页照实说「词库里没有…的释义」、卡上释义留空待用户填
  function displayGroups(item) {
    return senseGroups(item).map(function (g) {
      var named = g.senses.some(function (x) { return stripNameLabel(x) !== x.replace(/\s+$/, ""); });
      var seen = {}, senses = g.senses.filter(function (x) { return !(named && nameFragment(x)); }).map(function (x) { var y = stripNameLabel(x); y = named ? stripAlias(y) : y; return y; })
        .filter(function (x) { if (!x || seen[x]) return false; seen[x] = 1; return true; });
      var o = { pos: g.pos, senses: senses };
      if (g.id) o.id = g.id;
      return o;
    }).filter(function (g) { return g.senses.length; });
  }

  // 只在还原旧稿时识别原形容词写法（含尾注）；卡面显示直接使用词库中文。
  function sameSavedAdj(old, current) {
    return old !== current && old.replace(/的((?:[（(][^（）()]*[）)])*)$/, "$1") === current;
  }
  // 旧稿按词性组序号储存选择。同词性的义项增删后，按保存的中文与冠词找回所属的新组。
  function savedSense(previous, item, slot) {
    if (!slot || !previous || !item || previous[1] === item[1] && previous[2] === item[2]) return slot;
    var old = senseGroups(previous).find(function (g) { return senseId(g) === slot; });
    if (!old) return slot;
    var candidates = senseGroups(item).filter(function (g) {
      return g.pos === old.pos && g.senses.some(function (sn) {
        return old.senses.indexOf(sn) >= 0 || g.pos === "adj." && old.senses.some(function (text) { return sameSavedAdj(text, sn); });
      });
    });
    if (candidates.length > 1 && old.pos === "n.") {
      var article = articleOf(previous, "", slot).text;
      var same = candidates.filter(function (g) { return articleOf(item, "", senseId(g)).text === article; });
      if (same.length) candidates = same;
    }
    return candidates.length === 1 ? senseId(candidates[0]) : slot;
  }

  // 恢复自动释义时认回旧词库形容词。用户手填的释义保持原样。
  function savedAutoGloss(item, old) {
    if (!old) return defaultGloss(item);
    var groups = displayGroups(item);
    if (groups.some(function (g) { return g.senses.indexOf(old) >= 0; })) return old;
    var matched = "";
    groups.forEach(function (g) {
      if (g.pos === "adj.") g.senses.forEach(function (sn) { if (sameSavedAdj(old, sn)) matched = sn; });
    });
    return matched || old;
  }

  function senseList(item) {
    return senseGroups(item).reduce(function (all, g) { return all.concat(g.senses); }, []);
  }

  // 默认释义：第一组（通常是形容词或名词）的第一个义项（T35 / U9：默认一个，要两个就手输；只影响新选的词，已存草稿原样）
  function defaultGloss(item) {
    var g = displayGroups(item)[0];
    return g ? g.senses[0] : "";
  }

  // 统一词条视图：旧两/三列兼容；冠词不参与拼写、搜索或藏头匹配。
  function entryData(item, code) {
    code = code || LANG.code;
    return { spelling: item[0], meaning: item[1] || "",
      article: /^(fr|de|es|it)$/.test(code) && /(^|\|)n\./.test(item[1] || "") ? (item[2] || "") : "",
      note: item[3] == null ? "" : item[3] };
  }

  function defaultPos(item) {
    var g = displayGroups(item)[0];
    return g ? g.pos : "";
  }
  // 自动带出的释义属于哪一组义项（id，见 senseGroups）
  function defaultSense(item) {
    var g = displayGroups(item)[0];
    return g ? senseId(g) : "";
  }
  function senseId(g) { return g.id || g.pos; }

  function capitalize(w) { return LANG.display(w); }

  // ---------- 关键字母（D6，T17 起只认首字母） ----------

  // 合法 = 词的首字母等于该格字母，不分大小写（T17：词中含该字母不再算）
  function containsLetter(word, letter) {
    if (!word || !letter) return false;
    var f = LANG.fold(String(word).charAt(0)).charAt(0); // T21：连字展开后取第一个（œuvre → oe → o，算 O 格）；英语的 fold 不增字，行为不变
    if (LANG.isDigit.test(letter)) return f === letter || digitInitials(letter).indexOf(f) >= 0 || soundHit(word, letter); // U19：2 格 → 2nd 或 two / time…；T31：读音别名；选了几门语言时各门的读法都算对
    return f === cellInitial(letter);
  }
  // T31：词是不是以该数字格的某个读音别名开头（0 → zero…、1 → won…、8 → ate…）。候选、手填校验、导出检查都经 containsLetter 用这同一条
  function soundHit(word, letter) {
    var w = LANG.fold(String(word));
    return ACTIVE.some(function (R) {
      var list = (R.digitSounds || [])[+letter] || [];
      for (var k = 0; k < list.length; k++) if (w.indexOf(list[k]) === 0) return true;
      return false;
    });
  }
  // 数字格在各门选中语言里的读法首字母（去重）：英语 2 → t，法语 2（deux）→ d
  function digitInitials(letter) {
    var out = [];
    ACTIVE.forEach(function (R) { var c = R.fold(R.digitNames[+letter]).charAt(0); if (out.indexOf(c) < 0) out.push(c); });
    return out;
  }
  // 提示里「X 开头」的 X：把算对的写法全列出来（v00.03.00，2026-11-10 定），与 containsLetter 同一条规则：
  // 字母格「I」；带变音符的字母格「É/E」；数字格只列读法首字母「T」，多选「T/D/Z」，首字母另起的读音别名照写整词「O/zero」。
  // v00.03.01 E3（用户 11-19 定）：斜线两边不留空格，占位只写「X 开头」，全选六门时数字 1 是「O/U/E/won 开头」
  function startText(letter) {
    var low = cellInitial(letter), init = LANG.display(low); // 大小写一律经 LANG（本文件 RULES 之外不直接转大小写）
    if (!LANG.isDigit.test(letter)) return init && init !== letter ? letter + "/" + init : letter;
    // 选了几门语言：只列首字母，相同的只写一次（v00.03.01 R03：deux、dos 都是 D）。
    // 不写括号读法与数字本身，免得多选时提示放不下；首字母另起的读音别名（英语 0 的 zero、8 的 ate）只认整个别名，照写整词
    var heads = [], words = [];
    ACTIVE.forEach(function (R) {
      var lo = R.fold(R.digitNames[+letter]).charAt(0);
      if (heads.indexOf(R.display(lo)) < 0) heads.push(R.display(lo));
      ((R.digitSounds || [])[+letter] || []).forEach(function (x) { if (R.fold(x).charAt(0) !== lo && words.indexOf(x) < 0) words.push(x); });
    });
    words = words.filter(function (x) { return heads.indexOf(LANG.display(LANG.fold(x).charAt(0))) < 0; }); // 别名的首字母已在列里（选了法语时的 zero）就不重复写
    return heads.concat(words).join("/");
  }
  // 读屏用的写法（用户 11-19 定）：屏幕上的斜线读屏软件会念成「斜线」，读屏名改用「或」——「É 或 E」「O 或 U 或 E 或 won」
  function startSpoken(letter) { return startText(letter).split("/").join(" 或 "); }
  // 一格的「首字母」：字母格就是它自己；数字格是读法的首字母（2 → t，0 → o）。候选、随机池按它取词
  function cellInitial(letter) {
    return LANG.fold(LANG.isDigit.test(letter) ? LANG.digitNames[+letter] : letter).charAt(0); // T21：É → e、Œ → o；数字格读法也去变音符
  }

  // 朱红的关键字母恒为词首（下标 0）；词不合法为 -1
  function resolveKeyAt(word, letter) {
    return containsLetter(word, letter) ? 0 : -1;
  }

  // 卡上单词控件的就地改写（D5.7 / D14）：只留 A–Z a–z 空格 ' - 与汉字（汉字只用来检索，T13）；去掉开头空白；
  // 最多 LANG.wordMax 个字符（六门都是 28，v00.03.01 E2）；首字母大写，其余照打。只会删字、不会增字（大写不改长度），所以光标 / 选区按「被删掉的字数」平移就不会跳。
  // start / end 缺省 = 末尾。区分大小写的编辑入口传 preserveCase。返回 { value, start, end }
  var WORD_MAX = 28;
  // 格里的词算几个字（与 rewriteWord 计数同一口径：组合变音符并进前一个字、空格与单词框不收的字不算，不封顶）。
  // v00.03.01 E6：单词框计数器用它，组字期间也按框里正在打的字算
  function wordUnits(text) {
    var n = 0, str = String(text || "");
    if (LANG.compose) str = str.normalize("NFC");
    for (var j = 0; j < str.length; j++) {
      var ch = str.charAt(j);
      if (ch === "\u2019") ch = "'";
      if (ch !== " " && !COMBINING.test(ch) && LANG.wordChar.test(ch)) n++;
    }
    return n;
  }
  var FILLER_MAX = 16; // 填表人上限（index.html 的 maxlength 同值；计数按 textUnits）
  var COMBINING = /[\u0300-\u036f]/;
  function rewriteWord(value, start, end, preserveCase) {
    var str = String(value || ""), out = "", s = null, e = null;
    if (start == null) start = str.length;
    if (end == null) end = start;
    var max = LANG.wordMax || WORD_MAX, over = false, counted = 0;
    for (var j = 0; ; ) {
      if (j === start) s = out.length;
      if (j === end) e = out.length;
      if (j >= str.length) break;
      // V003-B4-R9：西文把「字母 + 后面的组合变音符」当一个字（e + ◌́ → é）再过滤和计数，
      // 否则分解编码的 école 会丢重音、28 个字只进得来 14 个。光标落在这一组中间的，算在它后面
      var k = j + 1;
      if (LANG.compose) while (k < str.length && COMBINING.test(str.charAt(k))) k++;
      var seg = k - j > 1 ? str.slice(j, k).normalize("NFC") : str.charAt(j);
      for (var q = 0; q < seg.length; q++) {
        var ch = seg.charAt(q);
        if (ch === "\u2019") ch = "'"; // iOS 智能标点的弯撇号
        if (!LANG.wordChar.test(ch) || (ch === " " && (!out || out.endsWith(" ")))) continue;
        if (ch !== " " && ++counted > max) { over = true; continue; }
        out += ch;
      }
      for (var m = j + 1; m < k; m++) { if (m === start) s = out.length; if (m === end) e = out.length; }
      j = k;
    }
    if (s === null) s = out.length;
    if (e === null) e = out.length;
    var res = { value: preserveCase ? out : LANG.display(out), start: s, end: e };
    if (over) res.over = true; // 有合规的字因为超过上限没进来
    return res;
  }

  // ---------- 左右滑动（D16 手势规则） ----------
  // 横向位移 > 40px 且 > 1.5 × 纵向位移才算滑动；返回 1（手指向左 = 下一格）/ -1（向右 = 上一格）/ 0（不算）
  var SWIPE = { MIN: 40, RATIO: 1.5 };
  function swipeDir(dx, dy) {
    var ax = Math.abs(dx), ay = Math.abs(dy);
    if (!(ax > SWIPE.MIN) || !(ax > SWIPE.RATIO * ay)) return 0;
    return dx < 0 ? 1 : -1;
  }

  // 手势冲突规则：① 有字段在编辑 ② 面板打开 ③ 触点起于控件内（拖光标 / 拖选文字；卡外还包括字母等按钮，U3）
  // ④ 页面放大中（横向平移归浏览器，T32）⑤ 有选中文字（拖选区手柄）→ 都不响应滑动
  function swipeAllowed(s) { return !s.editing && !s.panelOpen && !s.inControl && !s.zoomed && !s.selecting; }

  // 滑到哪一格：首格右滑 / 末格左滑不越界（停在原格）
  function swipeTarget(cur, n, dir) {
    var t = cur + dir;
    return dir === 0 || t < 0 || t >= n ? cur : t;
  }

  // ---------- 版式（D5 / D14） ----------
  // measure(font, text) → 宽度（px，1080 坐标）。浏览器里由 app.js 用离屏 canvas 的 measureText 注入，Node 里用假测量。
  // data：{ letters, i, picks, glosses, captions, titleRuns, word, filler, hasImage(i), edit? }  edit = 编辑面（DOM 卡）：空释义 / 空配文多出 gloss-ph / caption-ph 灰色占位框，导出不传
  //   titleRuns 为空 / null = 标题留空 → 标题位用 word（D17，exportTitleRuns）；关键字母恒为词首（T17，keyAt 0 / 不合法 -1）
  // 框（1080 坐标）：矩形类（plate image rule bar ul）用 x y w h；文字类 x 是锚点（align left 为左端 / right 为右端 / center 为中心），
  //   baseline 是基线，w 是排好后的宽，size / weight / italic / color / text / track（字距）；word 的 keyAt 是朱红字母下标（-1 无）。
  //   color：色板角色名（ink red mute soft plate ph）或十六进制（标题自选色），画的时候用 palette[c] || c。
  //   单图出的 role：info-folio / info-filler / rule / title（每段一框）/ plate / image | giant / word / bar / gloss / caption；
  //   格子没词出 empty + ul（占位）；词里没有该字母（不合法）照样出 word，keyAt = -1、invalid = true（编辑面画波浪线）。
  //   带 track 或 keyAt 的文字要逐字画（Chrome 61 的 canvas 没有 letterSpacing）：第 j 个字的 x = 起点 + charX(…)
  //   （比 D14 写的“前 j 个字”多算了与前一个字的字偶间距，和 DOM 的 letter-spacing 更接近）。

  // 把常见组合字符一起测量、截断和绘制，避免拆开 emoji 的肤色、旗帜和 ZWJ 序列。
  // shortcut: 覆盖拉丁组合标记与 emoji；若支持复杂文字分词，改用完整 Unicode 字素分段。
  function textUnits(text) {
    var units = [], regional = 0;
    Array.from(text).forEach(function (ch) {
      var cp = ch.codePointAt(0), last = units[units.length - 1];
      var flag = cp >= 0x1f1e6 && cp <= 0x1f1ff;
      var mark = /[\u0300-\u036f\u1ab0-\u1aff\u1dc0-\u1dff\u20d0-\u20ff\ufe00-\ufe0f\ufe20-\ufe2f]/.test(ch);
      var attach = mark || cp === 0x200d || (cp >= 0x1f3fb && cp <= 0x1f3ff) || (cp >= 0xe0020 && cp <= 0xe007f);
      if (last && (attach || last.charAt(last.length - 1) === "\u200d" || (flag && regional % 2))) units[units.length - 1] += ch;
      else units.push(ch);
      regional = flag ? regional + 1 : 0;
    });
    return units;
  }

  // 带字距的宽度：measure(文字) + (字数 − 1) × 字距（与母版 width() 相同，DOM / Canvas 共用）
  function trackedWidth(measure, font, text, track) {
    if (!text) return 0;
    return measure(font, text) + (textUnits(text).length - 1) * (track || 0);
  }

  // 逐字画时第 j 个字相对起点的 x：measure(前 j+1 个字) − measure(第 j 个字) + j × 字距（Canvas 与 T09 的 DOM 校验共用）
  function charX(measure, font, text, j, track) {
    var chars = textUnits(text);
    return measure(font, chars.slice(0, j + 1).join("")) - measure(font, chars[j]) + j * (track || 0);
  }

  function runFont(r, size) { return fontOf(r.b ? 700 : 400, size, r.i); }

  // runs 里第 from..to 个字（按字计，跨段）→ 新的 runs，样式照旧
  function sliceRuns(runs, from, to) {
    var out = [], at = 0;
    runs.forEach(function (r) {
      var chars = textUnits(r.t), a = Math.max(from - at, 0), b = Math.min(to - at, chars.length);
      if (b > a) out.push({ t: chars.slice(a, b).join(""), b: r.b, i: r.i, c: r.c });
      at += chars.length;
    });
    return out;
  }

  function runsLength(runs) { return runs.reduce(function (n, r) { return n + textUnits(r.t).length; }, 0); }

  // 一行 runs 在 size 下的宽：各段 measure 之和 + (总字数 − 1) × 字距
  function runsWidth(measure, runs, size, track) {
    var n = runsLength(runs);
    return runs.reduce(function (w, r) { return w + measure(runFont(r, size), r.t); }, 0) + (n ? (n - 1) * track : 0);
  }

  // 标题适配：76 放得下用 76；否则 60 单行；60 仍放不下折两行，第二行末尾加「…」→ { size, lines: [[runs...]...], cut? }（cut 只在两行时有：true = 有字被省略）
  function fitTitle(measure, runs, maxW) {
    var T = CARD.TITLE;
    if (runsWidth(measure, runs, T.size, T.track) <= maxW) return { size: T.size, lines: [runs] };
    if (runsWidth(measure, runs, T.size2, T.track) <= maxW) return { size: T.size2, lines: [runs] };
    var n = runsLength(runs), w60 = function (rs) { return runsWidth(measure, rs, T.size2, T.track); };
    var i = 0; // 第一行：放得下的最长前缀
    while (i < n && w60(sliceRuns(runs, 0, i + 1)) <= maxW) i++;
    var rest = sliceRuns(runs, i, n), m = runsLength(rest);
    var tail = rest.length ? rest[rest.length - 1] : runs[runs.length - 1];
    var ell = function (k) { // 「…」并进末段（样式相同时），免得多出一个框
      var rs = sliceRuns(rest, 0, k), last = rs[rs.length - 1];
      if (last && last.b === tail.b && last.i === tail.i && last.c === tail.c) last.t += "…";
      else rs.push({ t: "…", b: tail.b, i: tail.i, c: tail.c });
      return rs;
    };
    // 与母版同一规则：第二行连「…」一起放得下才原样保留；否则砍到放得下并加「…」（整行刚好放得下、加了「…」放不下时也会被砍一个字）
    var all = m;
    while (m > 0 && w60(ell(m)) > maxW) m--;
    var second = m === all ? rest : ell(m);
    return { size: T.size2, lines: [sliceRuns(runs, 0, i), second], cut: m !== all }; // cut：第二行被截断加了「…」（卡上标题框据此不让再往后打字，T16）
  }

  // 单词适配：从 size 起每次 −4，直到带字距宽度 ≤ maxW，下限 min → 字号
  function fitWord(measure, text, size, min, maxW, track) {
    for (var s = size; s > min; s -= 4) {
      if (trackedWidth(measure, fontOf(700, s), text, track) <= maxW) return s;
    }
    return min;
  }

  // ---------- 冠词块与长词折行（v00.03.00 T22 / T28） ----------
  // 词条第三项是冠词（西文名词才有）：「le」「l’」「der / die」。带「 / 」的是二选一，由用户在义项栏里选（state.arts），不预选
  var ART = { drop: 10, ref: ["der", "die", "das"], gap: 0.22, lines: 3, left: /^(?:der|die|das)(?:\s|$)/ }; // right：冠词在块内右对齐（贴着词）的语言；德语左对齐（2026-11-12）
  // 冠词列按名词组的顺序用 | 对齐：["livre", "n.书|n.磅", "le|la"]；只有一个冠词时所有名词组共用。
  // 给了义项 id 取那一组的选项；不给 = 这个词所有可能的冠词（核对旧选择还在不在用）
  function articleOptions(item, id) {
    var a = item && item[2], parts = a ? String(a).split("|") : [], out = [];
    if (id !== undefined) {
      var k = /#(\d+)$/.test(id) ? +id.slice(id.lastIndexOf("#") + 1) - 1 : 0, one = parts.length > 1 ? parts[k] : parts[0];
      return one ? one.split(" / ") : [];
    }
    parts.forEach(function (p) { p.split(" / ").forEach(function (x) { if (x && out.indexOf(x) < 0) out.push(x); }); });
    return out;
  }
  // 卡上冠词位写什么：单一冠词原样；二选一选了写选中的，没选写全（pending，点「完成」会被拦下）
  // pos = 这一格选中的义项的词性（state.poss）：冠词只属于名词义项——选的是形容词、动词义项就没有冠词，也不用选（V003-B4-R7）
  function articleOf(item, choice, pos) {
    var sp = sensePos(item, pos), opts = sp === "" || /^n\./.test(sp || "") ? articleOptions(item, sp) : [], ok = opts.indexOf(choice) >= 0; // "" = 词条的释义没标词性（只有一组）：带着冠词的就按名词
    if (opts.length < 2) return { text: opts[0] || "", pending: false, options: opts };
    return { text: ok ? choice : opts.join(" / "), pending: !ok, options: opts };
  }
  // 选中的义项属于哪个词性：pos 在词条的词性组里就是它；没记（旧稿、自己写的释义）时，词条只有一种词性就是那一种，
  // 有几种就不确定（null）——不确定时不套整词的冠词，不靠释义文字猜
  function sensePos(item, pos) {
    var tags = [];
    senseGroups(item || ["", ""]).forEach(function (g) { if (tags.indexOf(senseId(g)) < 0) tags.push(senseId(g)); });
    if (pos && tags.indexOf(pos) >= 0) return pos;
    return tags.length <= 1 ? tags[0] || "" : null;
  }
  // 省音冠词（l’）和词之间不留空
  function elided(article) { return /[’']$/.test(article); }

  // 一个词按宽度折成几行（最多 maxLines 行）。折点依次取：空格（去掉空格，不加连字符）、词里原有的连字符之后、标准断词点 points（行尾加连字符）；
  // 这些都放不下才在字母之间断（行尾加连字符，两边各留至少 3 个字）。显示用的连字符不进词本身。
  // ponytail: points 只认整词的断词表（词库里 11 个字母以上的词才有）；短语里各个词的断词点没接，短语先按空格折
  function wrapWord(measure, font, text, maxW, track, points, maxLines) {
    var units = textUnits(text), n = units.length, lines = [], start = 0, soft = {};
    var w = function (t) { return trackedWidth(measure, font, t, track); };
    (points || []).forEach(function (p) { soft[p] = 1; });
    while (lines.length < maxLines - 1 && w(units.slice(start).join("")) > maxW) {
      var best = null, any = null;
      for (var c = start + 1; c < n; c++) {
        var head = units.slice(start, c).join(""), cut;
        if (units[c] === " ") cut = { text: head, next: c + 1, natural: true };
        else if (units[c - 1] === " ") continue;
        else if (units[c - 1] === "-") cut = { text: head, next: c, natural: true };
        else cut = { text: head + "-", next: c, natural: !!soft[c] };
        if (w(cut.text) > maxW) continue;
        if (cut.natural) best = cut; else if (c - start >= 3 && n - c >= 3) any = cut;
      }
      var use = best || any || { text: units[start], next: start + 1 };
      lines.push(use.text);
      start = use.next;
    }
    lines.push(units.slice(start).join(""));
    return lines;
  }

  // 词块：冠词（可无）+ 词。S = 版式里的 WORD（size / min / track / lead / artMin）。
  // 放不下先缩词（每次 −4，冠词跟着缩，始终小 ART.drop），到下限仍放不下才折行。
  // 冠词块宽 = 当前冠词字号下 der / die / das 最宽的那个（有冠词的词从同一条竖线起排）；更宽的冠词把词往右顶；省音冠词紧贴词
  // → { size, artSize, col（词相对左端的偏移，无冠词为 0）, artW, lines }
  function wordBlock(measure, word, article, S, maxW, points) {
    var artOf = function (s) { return Math.max(s - ART.drop, S.artMin); };
    var colOf = function (s) {
      if (!article) return 0;
      var f = fontOf(400, artOf(s)), aw = measure(f, article);
      if (elided(article)) return aw;
      var col = 0;
      ART.ref.forEach(function (r) { col = Math.max(col, measure(f, r)); });
      return Math.max(col, aw) + Math.round(artOf(s) * ART.gap);
    };
    var fits = function (s) { return colOf(s) + trackedWidth(measure, fontOf(700, s), word, S.track) <= maxW; };
    var size = S.min;
    for (var s = S.size; s > S.min; s -= 4) if (fits(s)) { size = s; break; }
    var col = colOf(size);
    var lines = fits(size) ? [word] : wrapWord(measure, fontOf(700, size), word, maxW - col, S.track, points, ART.lines);
    return { size: size, artSize: artOf(size), col: col, artW: article ? measure(fontOf(400, artOf(size)), article) : 0, lines: lines };
  }
  // 词块 → 框：冠词一框（mute、不加粗、与词共用基线），词每行一框（第一行带关键字母；后面的行带 line）
  function wordBoxes(measure, blk, o) {
    var out = [];
    // 法、西、意：冠词贴着词（块内右对齐）；德语从块的左端起。省音冠词（l’）本来就紧贴词，块宽就是它自己
    // 按冠词本身判断（语言多选后一张卡上可以有几门语言的词）：der / die / das 是德语的，其余带冠词的是法、西、意
    var artX = o.article && !ART.left.test(o.article) && !elided(o.article) ? o.x + blk.col - Math.round(blk.artSize * ART.gap) - blk.artW : o.x;
    if (o.article) out.push({ role: "article", i: o.i, x: artX, baseline: o.base, w: blk.artW, size: blk.artSize, weight: 400, color: "mute", text: o.article, align: "left" });
    blk.lines.forEach(function (t, k) {
      var wb = {
        role: "word", i: o.i, x: o.x + blk.col, baseline: o.base + k * o.lead, w: trackedWidth(measure, fontOf(700, blk.size), t, o.track), size: blk.size, weight: 700, color: "ink", text: t, track: o.track, align: "left",
        keyAt: o.ok && !k ? 0 : -1,
      };
      if (!o.ok) wb.invalid = true;
      if (k) wb.line = k;
      out.push(wb);
    });
    return out;
  }

  // 标题留空时用单词（D17）：返回导出 / 编辑面实际要排的 runs
  function exportTitleRuns(titleRuns, word) {
    if (titleRuns && titleRuns.length) return titleRuns;
    return word ? [{ t: word, b: true, i: false, c: null }] : [];
  }

  // 标题自定颜色（D19）：语义值 ink / red 按色板取色，十六进制原样，null = ink
  function runColor(c, palette) {
    if (c === "ink" || c === "red") return palette[c];
    return c || palette.ink;
  }

  // Canvas 与 DOM 共用的字体串：italic? 字重 字号px 字体族
  function fontOf(weight, size, italic) { return (italic ? "italic " : "") + weight + " " + size + "px " + FONT; }

  function ellipsize(measure, font, text, maxW) {
    if (measure(font, text) <= maxW) return text;
    while (text && measure(font, text + "…") > maxW) text = textUnits(text).slice(0, -1).join("");
    return text.replace(/\s+$/, "") + "…"; // 截在词间空格上时不留「ut …」（v00.03.01 复审：配文截断补回空格后才会遇到）
  }

  // 配文折行（2026-11-17）：按字贪心排，西文单词尽量不拆（比一行还宽才拆）；超过 maxLines 时末行加「…」，cut = 真的截掉了字。
  // 输入框据 cut 拒收再往后打的字，所以正常稿子不会被截；只有改了单词使可用行数变少的旧稿会看到「…」
  function wrapText(measure, font, text, maxW, maxLines) {
    var units = textUnits(text), toks = [], cur = "";
    var wordy = function (u) { return /^[0-9A-Za-z\u00C0-\u024F'’\-]/.test(u); }; // 只看首个字符：textUnits 把 e + 组合变音符算一个字，它照样属于单词
    units.forEach(function (u) {
      if (wordy(u)) { cur += u; return; }
      if (cur) { toks.push(cur); cur = ""; }
      toks.push(u);
    });
    if (cur) toks.push(cur);
    // gaps[k] = 第 k 行与下一行之间折掉的是不是空格：截断时把后面几行拼回一行要按它补回空格（v00.03.01，原来「ut labore」会拼成「utlabo…」）
    var lines = [], gaps = [], line = "";
    var brk = function (next) { gaps.push(/\s$/.test(line) || /^\s+$/.test(next) ? " " : ""); lines.push(line.replace(/\s+$/, "")); };
    var push = function (t) {
      if (measure(font, line + t) <= maxW) { line += t; return; }
      if (line && measure(font, t) <= maxW) { brk(t); line = /^\s+$/.test(t) ? "" : t; return; }
      textUnits(t).forEach(function (u) { // 一个词比一行还宽：逐字拆
        if (line && measure(font, line + u) > maxW) { brk(u); line = ""; }
        if (line || !/^\s+$/.test(u)) line += u;
      });
    };
    toks.forEach(push);
    if (line.replace(/\s+$/, "")) lines.push(line.replace(/\s+$/, ""));
    if (lines.length <= maxLines) return { lines: lines, cut: false };
    var rest = lines.slice(maxLines - 1).reduce(function (a, l, k) { return k ? a + gaps[maxLines - 2 + k] + l : l; }, ""), keep = lines.slice(0, maxLines - 1);
    keep.push(ellipsize(measure, font, rest, maxW));
    return { lines: keep, cut: true };
  }
  // dy = 词折行后下移的量。返回 { lines, cut }；编辑器用它判断还放不放得下
  function wrapCaption(measure, text, dy) {
    var S = CARD.CAPTION, max = Math.max(1, Math.floor((S.last - (S.base + (dy || 0))) / S.lead) + 1);
    return wrapText(measure, fontOf(700, S.size), (text || "").trim(), CARD.CW, max); // U04：配文粗体，按粗体量宽折行
  }

  function pad2(n) { return (n < 10 ? "0" : "") + n; }

  function wordForLayout(data, i) {
    if (data.displayWords) return data.displayWords[i];
    var pick = data.picks[i];
    return pick && pick[0] ? capitalize(pick[0]) : "";
  }

  function layoutCard(data, measure) {
    var C = CARD, i = data.i, n = data.letters.length, letter = data.letters[i];
    var boxes = [];
    if (!n) { // 首次进入还没有单词（D18 first）：只出空卡骨架给 DOM 卡用；导出按钮在没单词时不可用，走不到这里
      boxes.push({ role: "rule", x: C.M, y: C.RULE.y, w: C.CW, h: C.RULE.h, color: "ink" });
      boxes.push({ role: "plate", i: 0, x: C.M, y: C.PLATE.y, w: C.CW, h: C.PLATE.h, color: "plate" });
      boxes.push({ role: "empty", i: 0, x: C.M, baseline: C.WORD.base, size: C.EMPTY.firstSize, weight: 400, color: "ph", text: "格子会在你输入单词后出现", align: "left" });
      boxes.push({ role: "ul", x: C.M, y: C.EMPTY.lineY, w: C.EMPTY.lineW, h: 3, color: "ph" });
      return { W: C.W, H: C.H, boxes: boxes };
    }
    var label = function (role, x, align, text, size) {
      size = size || C.INFO.size;
      return { role: role, x: x, baseline: C.INFO.base, w: measure(fontOf(400, size), text), size: size, weight: 400, color: "mute", text: text, align: align };
    };
    // 信息栏：左页码、右填表人（留空不画）；墨线
    var folio = label("info-folio", C.M, "left", pad2(i + 1) + " / " + pad2(n));
    boxes.push(folio);
    var filler = (data.filler || "").trim();
    if (filler) {
      // v00.03.01（用户 11-18 定）：信息行 50 后长的填表人放不下时只给它缩字号（每次减 2，下限 INFO.minFiller），页码不变；到下限仍放不下才截断
      var fw = C.CW - folio.w - C.INFO.size, fs = C.INFO.size, ft = "填表人 " + filler;
      while (fs > C.INFO.minFiller && measure(fontOf(400, fs), ft) > fw) fs -= 2;
      boxes.push(label("info-filler", C.M + C.CW, "right", ellipsize(measure, fontOf(400, fs), ft, fw), fs));
    }
    boxes.push({ role: "rule", x: C.M, y: C.RULE.y, w: C.CW, h: C.RULE.h, color: "ink" });

    // 标题：留空用单词；放不下缩字号 / 折两行，图版位置不动
    var T = C.TITLE, fit = fitTitle(measure, exportTitleRuns(data.titleRuns, data.word || data.letters.join("")), C.CW);
    fit.lines.forEach(function (line, k) {
      var x = C.M, base = fit.lines.length > 1 ? T.base2[k] : T.base;
      line.forEach(function (r) {
        var font = runFont(r, fit.size), w = measure(font, r.t) + textUnits(r.t).length * T.track; // 前进宽度：CSS letter-spacing 每字之后都加
        boxes.push({ role: "title", x: x, baseline: base, w: w, size: fit.size, weight: r.b ? 700 : 400, italic: !!r.i, color: r.c || "ink", text: r.t, track: T.track, align: "left" });
        x += w;
      });
    });

    // 图版：有图 = 图；没图 = 超大关键字母（左 48、基线在图版底上 56）
    var P = C.PLATE;
    boxes.push({ role: "plate", i: i, x: C.M, y: P.y, w: C.CW, h: P.h, color: "plate" });
    if (data.hasImage(i)) boxes.push({ role: "image", i: i, x: C.M, y: P.y, w: C.CW, h: P.h });
    else boxes.push({ role: "giant", i: i, x: C.M + C.GIANT.dx, baseline: C.GIANT.base, size: C.GIANT.size, weight: 700, color: "ink", text: letter, track: C.GIANT.track, align: "left", clip: [C.M, P.y, C.CW, P.h] });

    var word = wordForLayout(data, i);
    if (!word) { // 没打词：占位文字 + 灰线
      boxes.push({ role: "empty", i: i, x: C.M, baseline: C.WORD.base, size: C.EMPTY.size, weight: 400, color: "ph", text: startText(letter) + " 开头", align: "left" }); // v00.03.01 E3：占位只写「X 开头」
      boxes.push({ role: "ul", x: C.M, y: C.EMPTY.lineY, w: C.EMPTY.lineW, h: 3, color: "ph" });
      return { W: C.W, H: C.H, boxes: boxes };
    }
    // 词里没有该字母（D6 不合法）：照样排出用户打的字，不高亮、带 invalid 标记（编辑面画波浪线；导出前会被拦下）
    // v00.03.00：词前可有冠词块；缩到下限仍放不下折行（最多三行），词下面的墨条、释义、配文跟着下移，图版不动
    var W = C.WORD, ok = containsLetter(word, letter), article = (data.articles && data.articles[i]) || "";
    var blk = wordBlock(measure, word, article, W, C.CW, data.hyph ? data.hyph(word, i) : null), dy = (blk.lines.length - 1) * W.lead;
    wordBoxes(measure, blk, { i: i, x: C.M, base: W.base, lead: W.lead, track: W.track, ok: ok, article: article }).forEach(function (b) { boxes.push(b); });
    boxes.push({ role: "bar", x: C.M, y: C.BAR.y + dy, w: C.BAR.w, h: C.BAR.h, color: "ink" });
    // 释义单行；输入框限长后放得下，超长的旧草稿保险起见加「…」。配文可折行（wrapCaption）
    var gloss = (data.glosses[i] || "").trim();
    if (gloss) {
      var gf = fontOf(400, C.GLOSS.size), gt = ellipsize(measure, gf, gloss, C.CW);
      boxes.push({ role: "gloss", i: i, x: C.M, baseline: C.GLOSS.base + dy, w: measure(gf, gt), size: C.GLOSS.size, weight: 400, color: "soft", text: gt, align: "left" });
    } else if (data.edit) { // 仅编辑面（data.edit）：空释义 / 空配文画灰色占位；导出不传 edit，不出这两个框
      boxes.push({ role: "gloss-ph", i: i, x: C.M, baseline: C.GLOSS.base + dy, w: measure(fontOf(400, C.GLOSS.size), "释义"), size: C.GLOSS.size, weight: 400, color: "ph", text: "释义", align: "left" });
    }
    var cap = (data.captions[i] || "").trim();
    if (cap) {
      var cf = fontOf(700, C.CAPTION.size), cw = wrapCaption(measure, cap, dy);
      cw.lines.forEach(function (ct, ln) {
        boxes.push({ role: "caption", i: i, line: ln, x: C.M, baseline: C.CAPTION.base + dy + ln * C.CAPTION.lead, w: measure(cf, ct), size: C.CAPTION.size, weight: 700, color: "ink", text: ct, align: "left" });
      });
    } else if (data.edit) {
      boxes.push({ role: "caption-ph", i: i, x: C.M, baseline: C.CAPTION.base + dy, w: measure(fontOf(400, C.CAPTION.size), "配文（选填）"), size: C.CAPTION.size, weight: 400, color: "ph", text: "配文（选填）", align: "left" });
    }
    return { W: C.W, H: C.H, boxes: boxes };
  }

  // ---------- T42 长词分图（R5 / U17 / U20–U22） ----------
  // 超过 10 格的单词分两张（14 以内最多两张），每张 3～10 格。cut = 前一张的格数。合法范围 splitRange(n)；n ≤ 10 不分图（null）
  var SPLIT = { MIN: 3, MAX: 10 };
  function splitRange(n) {
    if (n <= SPLIT.MAX) return null;
    return { lo: Math.max(SPLIT.MIN, n - SPLIT.MAX), hi: Math.min(SPLIT.MAX, n - SPLIT.MIN) };
  }
  // 一组候选切点里取最均衡的；同分时较长的部分放前图（cut 大的那个）
  function balancedCut(cuts, n) {
    var best = -1;
    cuts.forEach(function (c) { if (best < 0 || Math.abs(2 * c - n) < Math.abs(2 * best - n) || (Math.abs(2 * c - n) === Math.abs(2 * best - n) && c > best)) best = c; });
    return best;
  }
  // 自动切点。isWord(w) = 主词库里有没有；hyph = 预算好的标准排版断词点（build-dict 用 TeX hyph-en-us 算，只给词库里的长词）
  //   ① 已核对的常见词切点 ② 词干 / 词缀（两侧至少一侧是词库里的词，另一侧是词或词缀表里的前后缀）③ 标准排版断词点 ④ 均衡；
  //   不在词库里的词（含纯数字）跳过 ①～③。字母与数字混排：交界优先（U22），交界都不合规再均衡
  // rankOf(w)（可选）= 该词在词库首字母组里的位置（词库按词频排）；不给就不认「常用复合词」豁免
  function autoSplit(word, isWord, hyph, rankOf) {
    var w = LANG.fold(word), n = w.length, r = splitRange(n);
    if (!r) return null;
    var ok = function (c) { return c >= r.lo && c <= r.hi; }, all = [];
    for (var c = r.lo; c <= r.hi; c++) all.push(c);
    var mixed = /[0-9]/.test(w) && /[a-z]/.test(w);
    if (mixed) {
      var edges = all.filter(function (c) { return /[0-9]/.test(w.charAt(c - 1)) !== /[0-9]/.test(w.charAt(c)); });
      if (edges.length) return balancedCut(edges, n);
      return balancedCut(all, n);
    }
    if (isWord && isWord(w)) {
      var common = LANG.commonSplits[w];
      if (common && ok(common)) return common;
      var tier2 = all.filter(function (c) {
        var a = w.slice(0, c), b = w.slice(c), wa = isWord(a), wb = isWord(b);
        if ((wa && LANG.suffixes.indexOf(b) >= 0) || (wb && LANG.prefixes.indexOf(a) >= 0)) return true; // 词 + 词缀：照旧
        return wa && wb && !chanceJoin(w, c, isWord, rankOf); // 词 + 词：排除偶然拼接（B6-R1）
      });
      if (tier2.length) return balancedCut(tier2, n);
      var tier3 = (hyph && hyph[w] || []).filter(ok);
      if (tier3.length) return balancedCut(tier3, n);
    }
    return balancedCut(all, n);
  }
  // B6-R1：「词 + 词」切点是不是偶然拼接（见 RULES.en 的 derivSuffixes / latinTails）
  function chanceJoin(w, c, isWord, rankOf) {
    var n = w.length, b = w.slice(c);
    for (var k = 0; k < LANG.derivSuffixes.length; k++) {
      var sx = LANG.derivSuffixes[k];
      if (w.length <= sx.length + 2 || w.slice(-sx.length) !== sx) continue;
      var e = n - sx.length, stem = w.slice(0, e);
      var known = isWord(stem) || isWord(stem + "e") || (stem.charAt(e - 1) === stem.charAt(e - 2) && isWord(stem.slice(0, -1))) || (/ck$/.test(stem) && isWord(stem.slice(0, -1)));
      if (!known) continue;
      if (c > e) return true; // 切在后缀里
      if (c < e && c >= e - 3 && !isWord(w.slice(c, e))) return true; // 切在词干最后几个字母里
    }
    var common = rankOf && rankOf(w.slice(0, c)) < LANG.commonRank && rankOf(b) < LANG.commonRank;
    for (var t = 0; t < LANG.latinTails.length; t++) {
      var tl = LANG.latinTails[t];
      if (!common && b.slice(-tl.length) === tl && LANG.latinPrefixes.indexOf(w.slice(0, c)) < 0) return true;
    }
    return false;
  }

  // 分张：[[起, 止), …]；cut 不合法（缺、越界）时按均衡切（B6 附注：原注释写「用自动值」但没校验）
  // 合法分界：有限整数且在 splitRange 内（NaN、Infinity、小数 % 1 都不等于 0）。sheetsOf 与 migrateDraft 共用（B6-S1）
  function cutOk(r, cut) { return !!r && typeof cut === "number" && cut % 1 === 0 && cut >= r.lo && cut <= r.hi; }
  function sheetsOf(n, cut) {
    var r = splitRange(n);
    if (!r) return [[0, n]];
    if (!cutOk(r, cut)) cut = Math.max(r.lo, Math.min(r.hi, Math.ceil(n / 2)));
    return [[0, cut], [cut, n]];
  }

  // 列阵行列与尺寸（D14）：n ≤ 5 一行；6–10 两行、每行 ⌈n/2⌉ 格；W = max(列宽和 + 2M, 1080)，H = TOP + 行数 × ROW + FOOT
  function gridShape(n) {
    var G = GRID;
    if (!n) return { cols: 0, rows: 0, W: G.MIN_W, H: G.TOP + G.FOOT };
    var cols = n > G.PER_ROW ? Math.ceil(n / 2) : n, rows = Math.ceil(n / cols);
    return { cols: cols, rows: rows, W: Math.max(cols * G.PW + (cols - 1) * G.GAP + 2 * G.M, G.MIN_W), H: G.TOP + rows * G.ROW + G.FOOT };
  }

  // 列阵：信息栏（「N 格」+ 右上填表人，留空不画）、墨线、标题（留空用单词）、n 个格；每行一律从左起排
  // 框的 role：info-count / info-filler / rule / title（每段一框）/ plate / image | giant / word / bar / gloss（没词的格只出图版与超大字母；不合法词同单图：照排、keyAt = -1、invalid）
  // T42：sheet = [起, 止)（分图时只排这一张的格；格的 i 仍是在整个单词里的位置）；缺省 = 全部格。分图时信息栏写「01–07 / 11」
  function layoutGrid(data, measure, sheet) {
    var total = data.letters.length, from = sheet ? sheet[0] : 0, to = sheet ? sheet[1] : total;
    var G = GRID, n = to - from, sh = gridShape(n);
    if (!n) return { W: sh.W, H: sh.H, boxes: [] };
    var boxes = [];
    var label = function (role, x, align, text) {
      return { role: role, x: x, baseline: G.INFO.base, w: measure(fontOf(400, G.INFO.size), text), size: G.INFO.size, weight: 400, color: "mute", text: text, align: align };
    };
    var two = function (k) { return (k < 10 ? "0" : "") + k; };
    var count = label("info-count", G.M, "left", n === total ? n + " 格" : two(from + 1) + "–" + two(to) + " / " + total);
    boxes.push(count);
    var filler = (data.filler || "").trim();
    if (filler) boxes.push(label("info-filler", sh.W - G.M, "right", ellipsize(measure, fontOf(400, G.INFO.size), "填表人 " + filler, sh.W - 2 * G.M - count.w - G.INFO.size)));
    boxes.push({ role: "rule", x: G.M, y: G.RULE.y, w: sh.W - 2 * G.M, h: G.RULE.h, color: "ink" });

    // 标题：单行，放不下每次 −4、下限 20。ponytail: 母版没画列阵长标题，要两行再补
    var T = G.TITLE, runs = exportTitleRuns(data.titleRuns, data.word || data.letters.join("")), size = T.size;
    while (size > T.min && runsWidth(measure, runs, size, T.track) > sh.W - 2 * G.M) size -= 4;
    var x = G.M;
    runs.forEach(function (r) {
      var w = measure(runFont(r, size), r.t) + textUnits(r.t).length * T.track; // 前进宽度：CSS letter-spacing 每字之后都加
      boxes.push({ role: "title", x: x, baseline: T.base, w: w, size: size, weight: r.b ? 700 : 400, italic: !!r.i, color: r.c || "ink", text: r.t, track: T.track, align: "left" });
      x += w;
    });

    data.letters.slice(from, to).forEach(function (letter, j) {
      var i = from + j, cx = G.M + (j % sh.cols) * (G.PW + G.GAP), cy = G.TOP + Math.floor(j / sh.cols) * G.ROW;
      boxes.push({ role: "plate", i: i, x: cx, y: cy, w: G.PW, h: G.PH, color: "plate" });
      if (data.hasImage(i)) boxes.push({ role: "image", i: i, x: cx, y: cy, w: G.PW, h: G.PH });
      else boxes.push({ role: "giant", i: i, x: cx + G.GIANT.dx, baseline: cy + G.GIANT.dbase, size: G.GIANT.size, weight: 700, color: "ink", text: letter, align: "left", clip: [cx, cy, G.PW, G.PH] });
      var word = wordForLayout(data, i);
      if (!word) return;
      var W = G.WORD, ok = containsLetter(word, letter), article = (data.articles && data.articles[i]) || ""; // 同单图：不合法词照排、不高亮；冠词块与折行同一套
      var blk = wordBlock(measure, word, article, W, G.PW, data.hyph ? data.hyph(word, i) : null), dy = (blk.lines.length - 1) * W.lead;
      wordBoxes(measure, blk, { i: i, x: cx, base: cy + W.dbase, lead: W.lead, track: W.track, ok: ok, article: article }).forEach(function (b) { boxes.push(b); });
      boxes.push({ role: "bar", x: cx, y: cy + G.BAR.dy + dy, w: G.BAR.w, h: G.BAR.h, color: "ink" });
      var gf = fontOf(400, G.GLOSS.size), gt = ellipsize(measure, gf, (data.glosses[i] || "").trim(), G.PW);
      if (gt) boxes.push({ role: "gloss", i: i, x: cx, baseline: cy + G.GLOSS.dbase + dy, w: measure(gf, gt), size: G.GLOSS.size, weight: 400, color: "soft", text: gt, align: "left" });
    });
    return { W: sh.W, H: sh.H, boxes: boxes };
  }

  // ---------- DOM 卡（D5） ----------
  // 版式框 → DOM 样式数值（px）。DOM 不自己排版：位置、字号、字距都是框里的 1080（列阵为 W）坐标乘 k，顶边按基线探针比例换算。
  //   k = 卡显示宽 / 版式宽；ratio = 基线距行顶 / 字号（line-height: 1 时 app.js 用探针实测）；W = 版式宽（右对齐用）。
  //   kind "rect"：left top width height color（rule / ul 至少 1px 高，否则小 k 下线会消失）；
  //   kind "text"：left（或 right）top fontSize letterSpacing weight italic color；带 clip（超大字母）时 left / top 改为相对 clip 框。
  //   lx / lw 是版式坐标下的左端与宽（app.js 写进 data-x / data-w，check-dom-layout.js 用）；文字的 lw = DOM 元素应有的前进宽。
  var CSS_VAR = { bg: "paper", ink: "ink", red: "red", plate: "plate", mute: "mute", soft: "soft", ph: "ph" };

  // 色板角色名 → CSS 变量（style.css 里按界面深浅规则取值，与 PALETTE 同值）；十六进制（标题自选色）原样
  function domColor(c) { return CSS_VAR[c] ? "var(--" + CSS_VAR[c] + ")" : c; }

  function domBox(b, k, ratio, W) {
    if (b.h !== undefined) {
      var thin = b.role === "rule" || b.role === "ul";
      return { kind: "rect", left: b.x * k, top: b.y * k, width: b.w * k, height: thin ? Math.max(b.h * k, 1) : b.h * k, color: b.color ? domColor(b.color) : "", lx: b.x, lw: b.w };
    }
    var track = b.track || 0;
    var d = { kind: "text", top: (b.baseline - ratio * b.size) * k, fontSize: b.size * k, letterSpacing: track * k, weight: b.weight, italic: !!b.italic, color: domColor(b.color) };
    // DOM 的 letter-spacing 每个字之后都加（含最后一个）：title 的版式宽已按此算，word 的版式宽少算了最后一个字距
    if (b.w !== undefined) d.lw = b.w + (b.role === "word" ? track : 0);
    if (b.align === "right") { d.right = (W - b.x) * k; d.lx = b.x - d.lw; } else { d.left = b.x * k; d.lx = b.x; }
    if (b.clip) {
      d.clip = { left: b.clip[0] * k, top: b.clip[1] * k, width: b.clip[2] * k, height: b.clip[3] * k };
      d.left -= d.clip.left;
      d.top -= d.clip.top;
    }
    return d;
  }

  // ---------- 候选（D6，T17 起只认词首） ----------

  // 格字母 c 的候选来源：只有词首档 = words[c] 原顺序（T17：词中含 c 的词不再是候选）
  var tierCache = {};
  function letterTiers(words, letter) {
    var c = cellInitial(letter); // T41：数字格按读法首字母取词
    var own = (c && words && words[c]) || [];
    var sounds = LANG.isDigit.test(letter) ? (LANG.digitSounds || [])[+letter] || [] : [];
    if (!sounds.length) return { head: own };
    // T31：数字格——以读音别名开头的词排最前（含别的首字母组里的 zero… / won… / ate…），其余读法首字母的词照原顺序跟在后面
    var key = LANG.code + letter, hit = tierCache[key];
    if (hit && hit.words === words) return { head: hit.head };
    var first = [], rest = [], k, seen = {};
    for (var s = 0; s < sounds.length; s++) {
      var g = sounds[s].charAt(0);
      if (g === c || seen[g]) continue;
      seen[g] = 1;
      var other = (words && words[g]) || [];
      for (k = 0; k < other.length; k++) if (soundHit(other[k][0], letter)) first.push(other[k]);
    }
    var mine = [];
    for (k = 0; k < own.length; k++) (soundHit(own[k][0], letter) ? mine : rest).push(own[k]);
    var head = mine.concat(first, rest);
    tierCache[key] = { words: words, head: head };
    return { head: head };
  }

  // ---------- 候选去同根扎堆（T25 / F4） ----------

  // 词族：去常见派生后缀后比词干（happy / happiness / happily → happy；love / lover / lovely / loving → lov）。
  // ponytail: 纯启发式，不查词族表。误判上限：词干碰巧相同的无关词会被当一族（car / care / cars、ear / early），
  // 后果只是首屏少给它们一个位置，词仍可翻页看到、精确输入照样排第一；漏判：词干不规则变形的（hunger / hungry、free / freedom）合不到一起，等于不处理。
  // 升级路径：build-dict.mjs 用词族表（词根表 / WordNet 一类）给每条产物加 family 字段，这里直接读，删掉后缀表
  var FAMILY_SUFFIX = [["iness", "y"], ["ily", "y"], ["ingly", ""], ["edly", ""], ["fully", ""], ["ably", ""], ["ness", ""], ["ful", ""], ["less", ""],
    ["able", ""], ["ible", ""], ["ing", ""], ["ers", ""], ["est", ""], ["ed", ""], ["er", ""], ["ly", ""], ["es", ""], ["s", ""]];
  function familyOf(word) {
    var w = LANG.bare(word);
    for (var round = 0; round < 2; round++) {
      var hit = false;
      for (var k = 0; k < FAMILY_SUFFIX.length; k++) {
        var suf = FAMILY_SUFFIX[k][0];
        if (w.length - suf.length >= 3 && w.slice(-suf.length) === suf) { w = w.slice(0, -suf.length) + FAMILY_SUFFIX[k][1]; hit = true; break; }
      }
      if (!hit) break;
    }
    if (w.length > 3 && w.charAt(w.length - 1) === "e") w = w.slice(0, -1);                    // love → lov
    if (w.length > 3 && w.charAt(w.length - 1) === w.charAt(w.length - 2) && "aeiou".indexOf(w.charAt(w.length - 1)) < 0) w = w.slice(0, -1); // runn → run
    return w;
  }

  var FAMILY_CAP = 2;       // 首轮挑选里同一词族最多几个
  var FAMILY_LOOK = 3 * PAGE_SIZE; // 找「该族的形容词」只看该档前这么多个候选，免得把很靠后的词拉到前面

  // 整理首屏（前 PAGE_SIZE 个）。tiers 是 filterTiers 的结果（命中档从高到低），skip(item) 为真的（被屏蔽）先剔除，不占位。
  // 档与档之间不换位：高档的可见词先填，填满为止。每一档内分两轮：
  //   首轮 = 按原序挑，同一词族最多 FAMILY_CAP 个、其中至多 1 个形容词且形容词排在该族最靠前的那个位置（族内别的词性给它留位），
  //          副词推迟、近义形容词推迟；精确输入的词（query 恰好等于某个词，只会在第一档）固定第一位；
  //   补回 = 首轮挑完还有空位，就按该档原序补回被推迟的词（含副词，不再限族），然后才进下一档。
  // 所以只要有 PAGE_SIZE 个可见词，首屏就是满的。返回新数组：首屏在最前，其余按原档原序（含被屏蔽的，取页时 pageOf 再过滤）；不改传入的
  function spreadFirstScreen(tiers, q, skip) {
    var lq = LANG.fold(q), room = PAGE_SIZE, shown = [], picked = tiers.map(function () { return []; });
    tiers.forEach(function (tier, ti) {
      if (room <= 0) return;
      // 词族 / 词性 / 可见与否只在用到的下标上算（单字母查询的一档有两千多条）。
      // 以词族为键的表用无原型对象：词干可能恰好是 constructor 之类的 Object.prototype 名字
      var n = tier.length, famMemo = [], clsMemo = [], visMemo = [], k;
      var fam = function (x) { return x in famMemo ? famMemo[x] : (famMemo[x] = familyOf(tier[x][0])); };
      var cls = function (x) {
        if (x in clsMemo) return clsMemo[x];
        var pos = defaultPos(tier[x]);
        return (clsMemo[x] = pos === "adj." ? 1 : pos === "adv." ? 2 : 0); // 0 其他 / 1 形容词 / 2 副词
      };
      var vis = function (x) { return x in visMemo ? visMemo[x] : (visMemo[x] = !skip(tier[x])); };
      var look = Object.create(null), total = Object.create(null), adjPicked = Object.create(null), picks = [], exactAt = -1;
      var take = function (x) { var f = fam(x); total[f] = (total[f] || 0) + 1; if (cls(x) === 1) adjPicked[f] = true; picked[ti][x] = true; picks.push(x); };
      if (ti === 0) for (k = 0; k < n; k++) if (LANG.fold(tier[k][0]) === lq && vis(k)) { exactAt = k; break; }
      for (k = 0; k < n && k < FAMILY_LOOK; k++) if (cls(k) === 1 && vis(k)) look[fam(k)] = true; // 该族在这一档的前几批里有形容词：留一个位置给它
      if (exactAt >= 0) take(exactAt);
      for (k = 0; k < n && picks.length < room; k++) {
        if (k === exactAt || cls(k) === 2 || !vis(k)) continue;
        var f = fam(k), t = total[f] || 0, ok;
        if (t >= FAMILY_CAP) ok = false;
        else if (cls(k) === 1) ok = !adjPicked[f];
        else ok = !(look[f] && !adjPicked[f] && t >= 1);
        if (ok) take(k);
      }
      // 同族的几个位置里，形容词占最靠前的那个（精确输入固定的第一位不参与；只在本档内换位）
      var order = picks.slice(exactAt >= 0 ? 1 : 0), slots = Object.create(null);
      order.forEach(function (x, j) { var g = fam(x); (slots[g] = slots[g] || []).push(j); });
      var placed = order.slice();
      Object.keys(slots).forEach(function (g) {
        var js = slots[g], ks = js.map(function (j) { return order[j]; });
        ks.sort(function (a, b) { return (cls(a) === 1 ? 0 : 1) - (cls(b) === 1 ? 0 : 1) || a - b; }); // 带下标兜底：Chrome 61 的 sort 不稳定
        js.forEach(function (j, m) { placed[j] = ks[m]; });
      });
      var line = (exactAt >= 0 ? [exactAt] : []).concat(placed);
      for (k = 0; k < n && line.length < room; k++) if (!picked[ti][k] && vis(k)) { picked[ti][k] = true; line.push(k); } // 补回
      line.forEach(function (x) { shown.push(tier[x]); });
      room -= line.length;
    });
    var out = shown;
    tiers.forEach(function (tier, ti) { tier.forEach(function (it, x) { if (!picked[ti][x]) out.push(it); }); });
    return out;
  }

  // 关键词 query 下的候选：词首档内按 filterTiers 的匹配档（英文前缀 > 中文义项完全命中 > 英文包含 / 中文释义包含 > 中文模糊）、再按词频，
  // 首屏先剔除被屏蔽的词、按档从高到低填（spreadFirstScreen），首屏之后保持原顺序。skip 缺省 = 屏蔽器（app.js 取页时也用同一个）。
  // 空 query 返回空（D6：关键词框为空不出候选）。首屏之后的屏蔽词不在这里全量过（单字母查询两千多条），取页时边取边过滤（pageOf）
  // 反查表的数字是当前语言包内的义项行号。先按释义取词，再按当前候选池的可见义项和原有顺序输出。
  function reverseTiers(list, query, pack) {
    var canonical = pack.aliases[query] || query, han = uniqueHan(query), matched = new Map();
    Object.keys(pack.reverse).forEach(function (gloss) {
      var score = gloss === canonical ? 1000 : gloss.indexOf(query) >= 0 ? 900 : 0;
      if (!score && han.length > 1) {
        var count = han.filter(function (c) { return gloss.indexOf(c) >= 0; }).length;
        if (count * 2 >= han.length) score = count;
      }
      if (!score) return;
      pack.reverse[gloss].forEach(function (i) {
        var sense = pack.senses[i];
        if (sense[8] === 1 || sense[8] === 3) return;
        var key = sense[1], byGloss = matched.get(key);
        if (!byGloss) matched.set(key, byGloss = new Map());
        byGloss.set(sense[3], Math.max(byGloss.get(sense[3]) || 0, score));
      });
    });
    var tiers = [];
    list.forEach(function (item) {
      var glosses = matched.get(item[0]);
      if (!glosses) return;
      var score = 0;
      senseGroups(item).forEach(function (group) { group.senses.forEach(function (g) { score = Math.max(score, glosses.get(g) || 0); }); });
      if (score) (tiers[score] || (tiers[score] = [])).push(item);
    });
    return tiers.reverse().filter(Boolean);
  }
  function candidates(words, letter, query, skip, pack) {
    var q = String(query || "").trim();
    if (!q) return [];
    var list = letterTiers(words, letter).head;
    var tiers = pack && pack.reverse && uniqueHan(q).length ? reverseTiers(list, q, pack) : filterTiers(list, q).filter(function (t) { return t.length; });
    return tiers.length ? spreadFirstScreen(tiers, q, skip || function (it) { return blocked(it[0]); }) : [];
  }

  // 取一页：从头数，skip(item) 为真（被屏蔽）的不算，凑够 size 个；page 越过末尾回到第 0 页。
  // pages 按未过滤的长度估（屏蔽词极少，最多差一页）→ { items, page, pages }
  // 页数与取页都按过滤后可见的候选算（Astra 复审 P3：按原始长度估页数会报出不存在的下一批，点「换一批」回到同一屏）
  // T38：短语与合成词补充表（window.PHRASES，phrases.js 启动后异步加载；没加载完就当查不到）。每个首字母一串「词^释义~…」，
  // 第一次查某个字母时才拆成索引。查找顺序：原样 → 去空格 → 空格换连字符（about face → about-face、super intelligence → superintelligence）。
  // 命中 → [词库里的写法, 释义]；否则 null
  var phraseIndex = { src: null, maps: {} }, wordIndex = { src: null, maps: {} };
  function spellings(text) { // 格里打的字 → 依次要试的写法：原样 → 去空格 → 空格换连字符
    var t = LANG.fold(text).replace(/^\s+|\s+$/g, "").replace(/\s+/g, " ");
    return t ? [t, t.replace(/ /g, ""), t.replace(/ /g, "-")] : [];
  }
  function phraseEntry(phrases, w) {
    if (!phrases || !w) return null;
    if (phraseIndex.src !== phrases) phraseIndex = { src: phrases, maps: {} };
    var c = w.charAt(0), m = phraseIndex.maps[c];
    if (!m) {
      m = phraseIndex.maps[c] = Object.create(null);
      (phrases[c] || "").split("~").forEach(function (e) { var k = e.indexOf("^"); if (k > 0) m[e.slice(0, k)] = e.slice(k + 1); });
    }
    return m[w] !== undefined ? [w, m[w]] : null;
  }
  function wordEntry(words, w, exact, exactOnly, caseExact) { // 原样优先；德语保留大小写身份，其余同键优先小写普通词；可禁用去变音符回退
    if (!words || !w) return null;
    if (wordIndex.src !== words) wordIndex = { src: words, maps: {} };
    var c = w.charAt(0), m = wordIndex.maps[c];
    if (!m) {
      m = wordIndex.maps[c] = Object.create(null);
      (words[c] || []).forEach(function (it) {
        var raw = "=" + LANG.exactKey(it[0]), folded = "~" + LANG.fold(it[0]);
        m["!" + it[0].normalize("NFC")] = it;
        if (!m[raw] || (it[0] === LANG.exactKey(it[0]) && m[raw][0] !== LANG.exactKey(m[raw][0]))) m[raw] = it;
        if (!m[folded] || (it[0] === LANG.exactKey(it[0]) && m[folded][0] !== LANG.exactKey(m[folded][0]))) m[folded] = it;
      });
    }
    return (caseExact ? m["!" + caseExact] : null) || (exact ? m["=" + exact] : null) || (!exactOnly && m["~" + w]) || null; // 不传 exact 时不能查 "=undefined"（英语词库真有 undefined）
  }
  // 只查补充表（测试与旧调用保留）
  function phraseHit(phrases, text) {
    var tries = spellings(text);
    for (var i = 0; i < tries.length; i++) { var p = phraseEntry(phrases, tries[i]); if (p) return p; }
    return null;
  }
  // B5-R1：完整词库查找。每种写法先查主词库、再查补充表，写法按「原样 → 去空格 → 连字符」——原样命中永远优先；
  // sun flower → 主词库的 sunflower（向日葵），super intelligence → 补充表的 superintelligence
  function lookupEntry(words, phrases, text, exactOnly) {
    var tries = spellings(text);
    var raw = LANG.exactKey(text).trim().replace(/\s+/g, " ");
    var exact = [raw, raw.replace(/ /g, ""), raw.replace(/ /g, "-")];
    var cased = String(text).normalize("NFC").trim().replace(/\s+/g, " ");
    var cases = [cased, cased.replace(/ /g, ""), cased.replace(/ /g, "-")];
    for (var i = 0; i < tries.length; i++) {
      var hit = wordEntry(words, tries[i], exact[i], exactOnly, LANG.code === "de" ? cases[i] : null) || phraseEntry(phrases, exactOnly ? exact[i] : tries[i]);
      if (hit) return hit;
    }
    return null;
  }

  // ---------- 变形索引（v00.03.00 Q10 / T26）：格里打的是变形（suis、ging、livres）也能查到原形的释义 ----------
  // 语言包的 forms 是 { 原形: "变形 变形 …" }；第一次用时反建成「变形 → 原形」，按 forms 对象缓存（换语言、词库替换就重建）。
  // 先按原样（保留变音符）找，找不到再按去变音符的写法找。一个变形对着几个原形时，先取更常用的原形（rankOf：跨原形可比较的排序值，越小越常用；产品传全局词频的负值；
  // suis → être 而不是 suivre），一样常用再取写法最像的（公共词头最长），还一样取索引里靠前的。
  // ponytail: 一个变形只给一个原形。真正两可的（法语 suis = être / suivre）只能得到其中一个，用户可以直接打原形或自己改释义；
  // 全局词频随语言包加载；并列原形选择仍是后续界面工作
  var formIndex = { src: null, exact: null, folded: null };
  function formLemma(forms, text, rankOf, exactOnly) {
    if (!forms || !text) return "";
    if (formIndex.src !== forms) {
      var ex = Object.create(null), fo = Object.create(null);
      var add = function (m, k, lemma) { if (!m[k]) m[k] = lemma; else if (typeof m[k] === "string") { if (m[k] !== lemma) m[k] = [m[k], lemma]; } else if (m[k].indexOf(lemma) < 0) m[k].push(lemma); };
      Object.keys(forms).forEach(function (lemma) {
        String(forms[lemma]).split(" ").forEach(function (f) { if (f) { add(ex, LANG.exactKey(f), lemma); add(fo, LANG.fold(f), lemma); } });
      });
      formIndex = { src: forms, exact: ex, folded: fo };
    }
    var raw = LANG.exactKey(text).trim(), hit = formIndex.exact[raw] || (!exactOnly && formIndex.folded[LANG.fold(raw)]);
    if (!hit || typeof hit === "string") return hit || "";
    var w = LANG.fold(raw), best = "", score = -1, top = Infinity;
    hit.forEach(function (lemma) {
      var l = LANG.fold(lemma), n = 0, r = rankOf ? rankOf(lemma) : 0;
      while (n < l.length && n < w.length && l.charAt(n) === w.charAt(n)) n++;
      if (r < top || (r === top && n > score)) { top = r; score = n; best = lemma; }
    });
    return best;
  }
  // 变形 → 词条：拼写用用户打的，释义来源与注释用原形的；冠词不带（原形的冠词对变形不一定对：le livre / les livres）
  function formEntry(words, forms, text, rankOf, exactOnly) {
    var lemma = formLemma(forms, text, rankOf, exactOnly);
    if (!lemma) return null;
    // 原形按显示词原样找（区分大小写）：德语动词 sein 与名词 Sein 是两条，索引里记的是哪条就取哪条（V003-B4-R10）
    var hit = null, group = (words && words[LANG.fold(lemma).charAt(0)]) || [];
    for (var k = 0; k < group.length; k++) if (group[k][0] === lemma) { hit = group[k]; break; }
    if (!hit) hit = wordEntry(words, LANG.fold(lemma), LANG.exactKey(lemma));
    return hit ? [LANG.exactKey(text).trim(), hit[1], "", hit[3] == null ? "" : hit[3]] : null;
  }

  // One shared application lookup path. Scores are global corpus counts, never initial-group positions.
  function resolveEntry(words, phrases, forms, text, scores, guards) {
    var rank = function (lemma) { return scores && typeof scores[lemma] === "number" ? -scores[lemma] : 0; };
    var hit = lookupEntry(words, phrases, text, true);
    if (hit) return { entry: hit, kind: "word", lemma: "", match: "exact" };
    hit = formEntry(words, forms, text, rank, true);
    if (hit) return { entry: hit, kind: "form", lemma: formLemma(forms, text, rank, true), match: "exact" };
    if (guards && guards[LANG.exactKey(text).trim()] === true) return null;
    hit = lookupEntry(words, phrases, text);
    if (hit) return { entry: hit, kind: "word", lemma: "", match: "folded" };
    hit = formEntry(words, forms, text, rank);
    return hit ? { entry: hit, kind: "form", lemma: formLemma(forms, text, rank), match: "folded" } : null;
  }

  function pageOf(list, page, size, skip) {
    var vis = skip ? list.filter(function (it) { return !skip(it); }) : list;
    var pages = Math.ceil(vis.length / size), p = pages ? Math.max(0, page) % pages : 0;
    return { items: vis.slice(p * size, p * size + size), page: p, pages: pages };
  }

  // 人名 / 姓氏 / 地名词条（T07 / D4）：第一个词性组里带括号的名字标注，如「埃文斯（姓氏）」「安东尼（人名）」「金斯敦（牙买加首都）」。
  // 括号可能不闭合（词库按「，」切义项时把括号劈开了：「安迪（男子名」），所以只认「（」后出现的标注词。
  // ponytail: 靠标注词的启发式，只管随机池。没有括号标注的专名（hampshire「汉普郡」）认不出来，会漏；词典里的普通词若释义带这类标注会被误排除，只是少一个随机候选，
  // 候选与搜索不受影响。升级路径：build-dict.mjs 在产物里给专名条目打标记，这里直接读
  var NAME_TAG = /[（(][^（）()]*(姓氏|姓|人名|男子名|女子名|男名|女名|女性名|男人名|女人名|地名|港市|城市|首都|成市|市名|州名|国名)/;
  function properName(item) {
    return NAME_TAG.test(String((item && item[1]) || "").split("|")[0]);
  }

  // 「随机一个」的池：词首档前 POOL_SIZE 个 ≤10 字母的 adj / n / v，不含人名 / 姓氏 / 地名词条（T07；候选与搜索照旧保留它们）。
  // T17 起没有词中档补足；X 格词首档本来就只有 9 个
  var poolCache = {};
  function randomPool(words, letter) {
    var c = LANG.fold(letter);
    var hit = poolCache[c];
    if (hit && hit.words === words) return hit.pool;
    var list = letterTiers(words, letter).head, out = [];
    for (var k = 0; k < list.length && out.length < POOL_SIZE; k++) {
      if (list[k][0].length <= 10 && /^(adj|n|v)\.$/.test(defaultPos(list[k])) && !properName(list[k])) out.push(list[k]);
    }
    poolCache[c] = { words: words, pool: out };
    return out;
  }

  // ---------- 释义来源（D7） ----------

  // 用户写过的释义（非空且不是自动带出的）不动；其余（空、仍是上次自动带出的值）换成新词条的默认释义，自填词无释义则为空。返回 { gloss, auto }
  function nextGloss(prev, prevAuto, item) {
    if (prev && !prevAuto) return { gloss: prev, auto: false };
    return { gloss: defaultGloss(item), auto: true };
  }

  // ---------- 草稿（D8） ----------

  // 草稿里已知的字段；其余是「未知字段」，迁移时原样带过去（app.js 写草稿时也原样写回），不丢作者的数据
  var DRAFT_FIELDS = ["v", "t", "word", "titleRuns", "filler", "view", "picks", "glosses", "glossAuto", "captions", "keys", "split", "media", "crops", "lang", "arts", "poss", "langs", "pickLangs"];

  // T45：配图文件名 = 「m + 编码长度（36 进制）- 16 位十六进制内容哈希 . png / jpg」（media.js 生成）。草稿只引用这种名字；清理也只删这种名字
  var MEDIA_NAME = /^m[0-9a-z]{1,10}-[0-9a-f]{16}\.(png|jpg)$/;
  function mediaName(n) { return typeof n === "string" && MEDIA_NAME.test(n) ? n : null; }
  // 一份草稿对象（不论能否迁移）引用的全部配图文件名：清理时要保住它们
  function mediaNames(obj) {
    var m = obj && typeof obj === "object" ? obj.media : null, out = [];
    if (!m || typeof m !== "object") return out;
    [m.def].concat(Array.isArray(m.cells) ? m.cells : []).forEach(function (n) { if (mediaName(n) && out.indexOf(n) < 0) out.push(n); });
    return out;
  }
  // 取景 {z 1～3, x/y 0～1}；不合法为 null（= 居中、不放大）
  function cropOf(c) {
    var ok = function (v, lo, hi) { return typeof v === "number" && isFinite(v) && v >= lo && v <= hi; };
    return c && typeof c === "object" && ok(c.z, 1, 3) && ok(c.x, 0, 1) && ok(c.y, 0, 1) ? { z: c.z, x: c.x, y: c.y } : null;
  }

  // 解析后的草稿对象 → 规范化的 v2 对象；坏数据（不是对象 / 不是 v: 2 / 没有字符串单词）返回 null，不抛错，也不改传入的对象。
  // 新键 backronym-draft-v2 里只会有 v: 2 的草稿（旧版草稿已于 T23 整体删除、不再读取），所以这里只做字段合法性校验：
  // 词（含词里没有该字母的不合法词）、释义、配文、填表人、视图、标题段原样保留；数组按单词长度对齐；类型不对的字段规整；未知字段原样带过去。
  // glossAuto 不是布尔时按释义推（空 = 自动）；keys 恒为 0（T17）
  // v00.03.00 T04：按草稿自身的 lang（缺省 en）规整，不看全局当前语言——法语 ÉTÉ 不能被英语规则规整成一格。
  // lang 不认识、或该语言的规则还没注册：返回 null（当作不能套用的原文），交给 draft.js / app-draft.js 现有的保全闸门，不覆盖
  function migrateDraft(obj) {
    if (!obj || typeof obj !== "object" || Array.isArray(obj) || obj.v !== 2 || typeof obj.word !== "string") return null;
    var lang = obj.lang == null ? "en" : obj.lang;
    if (!hasLang(lang)) return null;
    // 语言多选（2026-11-12）：langs = 选中的各门语言。旧稿只有 lang，读作只选了那一门；langs 里有没注册的语言时整份不认（与 lang 同样处理）
    var langs = Array.isArray(obj.langs) && obj.langs.length ? obj.langs.filter(function (c, k) { return obj.langs.indexOf(c) === k; }) : [lang];
    if (!langs.every(hasLang)) return null;
    var cur = LANG, act = ACTIVE;
    useLangs(langs);
    try { var out = migrateWith(obj, LANG.code); out.langs = langs; return out; } finally { LANG = cur; ACTIVE = act; }
  }
  function migrateWith(obj, lang) {
    var out = {};
    Object.keys(obj).forEach(function (k) { out[k] = obj[k]; });
    var word = normalizeWord(obj.word), letters = word.split("").filter(Boolean);
    var arr = function (a) { return Array.isArray(a) ? a : []; };
    out.t = typeof obj.t === "number" && isFinite(obj.t) ? obj.t : 0;
    out.lang = lang;
    out.word = word;
    out.view = obj.view === "grid" ? "grid" : "single";
    // 填表人：输入框 maxlength 16（2026-11-17 起），恢复时同样留 16 个 UTF-16 单元；原来截到 12，13～16 字的填表人一刷新就丢尾巴（v00.03.01 批 B 复审）。不从代理对中间切开
    out.filler = String(obj.filler == null ? "" : obj.filler).slice(0, FILLER_MAX).replace(/[\ud800-\udbff]$/, "");
    out.picks = letters.map(function (l, i) {
      var p = arr(obj.picks)[i];
      return Array.isArray(p) && typeof p[0] === "string" && p[0] ? p.slice() : null; // 不合法词也留着，由 cellState 标出
    });
    out.glosses = letters.map(function (l, i) { var g = arr(obj.glosses)[i]; return g == null ? "" : String(g); });
    out.captions = letters.map(function (l, i) { var c = arr(obj.captions)[i]; return c == null ? "" : String(c); });
    out.glossAuto = letters.map(function (l, i) {
      var a = arr(obj.glossAuto)[i];
      return typeof a === "boolean" ? a : !out.glosses[i];
    });
    // v00.03.00 T22：用户给两性名词选的冠词（每格一个字符串，没选为空）。旧稿没有这个字段：不猜，保持没有
    if (Array.isArray(obj.arts)) out.arts = letters.map(function (l, i) { var a = obj.arts[i]; return typeof a === "string" ? a.slice(0, 8) : ""; });
    else delete out.arts;
    // V003-B4-R7：每格选中的义项的词性（"n." / "adj." …，没记为空）。同样是可选字段
    if (Array.isArray(obj.poss)) out.poss = letters.map(function (l, i) { var q = obj.poss[i]; return typeof q === "string" ? q.slice(0, 12) : ""; });
    else delete out.poss;
    // 语言多选：每格的词来自哪门语言（决定去哪个词库重新查、用哪张断词表）。没记或不认识的为空，由恢复时按选中的语言去找
    if (Array.isArray(obj.pickLangs)) out.pickLangs = letters.map(function (l, i) { var c = obj.pickLangs[i]; return hasLang(c) ? c : ""; });
    else delete out.pickLangs;
    out.keys = letters.map(function () { return 0; }); // T17：关键字母恒为词首，字段保留、不再读存储里的值
    // T42：手动分界（前一张的格数）；没有、不在合法范围、或单词不需要分图时为 null（= 自动）
    var sr = splitRange(letters.length);
    out.split = cutOk(sr, obj.split) ? obj.split : null;
    // T45：配图引用（默认图 + 每格独立图的文件名）与每格取景。没有这两个字段的旧稿照读（都为 null）；名字不合法的一格当没有配图
    var media = obj.media && typeof obj.media === "object" ? obj.media : {}, cells = arr(media.cells);
    out.media = { def: mediaName(media.def), cells: letters.map(function (l, i) { return mediaName(cells[i]); }) };
    if (out.media.def && Array.isArray(media.defaultCrops)) {
      out.media.defaultCrops = letters.map(function (l, i) { return out.media.cells[i] ? cropOf(media.defaultCrops[i]) : null; });
    }
    if (!out.media.def && !out.media.cells.some(Boolean)) out.media = null;
    out.crops = out.media ? letters.map(function (l, i) { return cropOf(arr(obj.crops)[i]); }) : null;
    var runs = arr(obj.titleRuns).filter(function (r) { return r && typeof r === "object" && typeof r.t === "string" && r.t; }).map(function (r) {
      var o = {};
      Object.keys(r).forEach(function (k) { o[k] = r[k]; });
      o.b = !!r.b;
      o.i = !!r.i;
      o.c = typeof r.c === "string" ? r.c : null;
      return o;
    });
    out.titleRuns = runs.length ? runs : null;
    return out;
  }

  // ---------- 标题框模式（D18） ----------

  // 有单词 → "title"，没有 → "first"；"word" 只由用户点「修改单词」进入，不从数据推出（app.js 的 state.wordMode）
  function titleModeOf(letters) {
    return letters && letters.length ? "title" : "first";
  }

  // 入场页敲的单词 → 格字母用的字符串：只收 A–Z 与 0–9，自动转大写，最多 MAX_LETTERS 个（D18 / T41）
  var MAX_LETTERS = 14; // T41（R3）：最多 14 格（字母或数字）；每格的词另算，最多 WORD_MAX = 28 个字符
  function normalizeWord(text) {
    return LANG.letters(text).slice(0, MAX_LETTERS);
  }

  // 标题最多排两行：一次编辑后要不要保留（只拒绝这次新增，不删已有的字）。cutNow = 编辑后第二行被省略；len / snapLen = 编辑后 / 编辑前的字数；
  // snapCut = 编辑前就已经超了（旧草稿）。没超 → 保留；超了：编辑前没超（这次编辑造成的），或字数变多了（继续往超长的标题里加字）→ 拒绝；
  // 字数没增加且编辑前就超（删字、在超长标题上改格式）→ 保留，绝不因此删字
  function titleEditKept(cutNow, len, snapLen, snapCut) {
    return !cutNow || (snapCut && len <= snapLen);
  }

  // 粘贴放得下多少字：fits(n) = 插入前 n 个字后标题没超两行（对 n 单调）。二分，返回最大的 n（0..total）；全放得下就返回 total
  function pasteFitLength(total, fits) {
    if (fits(total)) return total;
    var lo = 0, hi = total - 1;
    while (lo < hi) {
      var mid = Math.ceil((lo + hi) / 2);
      if (fits(mid)) lo = mid; else hi = mid - 1;
    }
    return lo;
  }

  // 标题或单词（D17）：标题留空（或只有空白）用单词，否则用标题纯文字。导出图描述和发布笔记标题共用这一条规则
  function titleOrWord(title, word) {
    return String(title == null ? "" : title).replace(/\s+/g, " ").trim() || String(word || "");
  }

  // 发布笔记的标题：上面的结果最多 20 个字，按码点截（不把 emoji 劈成两半）
  function noteTitle(title, word) {
    return Array.from(titleOrWord(title, word)).slice(0, 20).join("");
  }

  // 改单词后按位置保留（D18）：同一位置字母没变就保留该位置的数据，其余用 empty。prev / next = 改前 / 改后的字母数组
  function keepSame(prev, next, arr, empty) {
    return next.map(function (l, i) { return prev[i] === l && i in arr ? arr[i] : empty; });
  }

  root.CORE = {
    SKIN_FONTS: SKIN_FONTS, useSkinFont: useSkinFont, BLOCKED_MSG: BLOCKED_MSG, PALETTE: PALETTE, PALETTES: PALETTES, SKINS: SKINS, paletteOf: paletteOf, contrastRatio: contrastRatio, CARD: CARD, GRID: GRID, PAGE_SIZE: PAGE_SIZE, POOL_SIZE: POOL_SIZE,
    resolveEntry: resolveEntry,
    blocked: blocked,
    filterWords: filterWords, filterTiers: filterTiers, uniqueHan: uniqueHan, customWord: customWord, wordUnits: wordUnits,
    entryData: entryData, senseGroups: senseGroups, senseList: senseList, defaultGloss: defaultGloss, defaultPos: defaultPos, defaultSense: defaultSense, senseId: senseId, capitalize: capitalize,
    containsLetter: containsLetter, resolveKeyAt: resolveKeyAt, rewriteWord: rewriteWord, useLang: useLang, useLangs: useLangs, withLang: withLang, activeLangs: activeLangs, presetInfo: presetInfo, digitInitials: digitInitials, addLang: addLang, hasLang: hasLang, PRESETS: PRESETS, pickPresets: pickPresets, setPresets: setPresets,
    wrapCaption: wrapCaption, FILLER_MAX: FILLER_MAX, CAPTION_MAX: 160, swipeDir: swipeDir, swipeAllowed: swipeAllowed, swipeTarget: swipeTarget, SWIPE: SWIPE, WORD_MAX: WORD_MAX,
    domColor: domColor, domBox: domBox,
    textUnits: textUnits, fontOf: fontOf, trackedWidth: trackedWidth, charX: charX, fitTitle: fitTitle, fitWord: fitWord, exportTitleRuns: exportTitleRuns, runColor: runColor,
    layoutCard: layoutCard, gridShape: gridShape, layoutGrid: layoutGrid,
    cellInitial: cellInitial, startText: startText, startSpoken: startSpoken, SPLIT: SPLIT, splitRange: splitRange, autoSplit: autoSplit, sheetsOf: sheetsOf,
    letterTiers: letterTiers, candidates: candidates, pageOf: pageOf, randomPool: randomPool, familyOf: familyOf, properName: properName,
    displayGroups: displayGroups, stripNameLabel: stripNameLabel,
    phraseHit: phraseHit, lookupEntry: lookupEntry, formLemma: formLemma, formEntry: formEntry,
    articleOptions: articleOptions, articleOf: articleOf, sensePos: sensePos, wrapWord: wrapWord, wordBlock: wordBlock, wordBoxes: wordBoxes,
    nextGloss: nextGloss, savedAutoGloss: savedAutoGloss, savedSense: savedSense, migrateDraft: migrateDraft, DRAFT_FIELDS: DRAFT_FIELDS, mediaName: mediaName, mediaNames: mediaNames, cropOf: cropOf, titleOrWord: titleOrWord, noteTitle: noteTitle, titleModeOf: titleModeOf, normalizeWord: normalizeWord, keepSame: keepSame, titleEditKept: titleEditKept, pasteFitLength: pasteFitLength, MAX_LETTERS: MAX_LETTERS,
  };
  // CORE.LANG 读当前规则（useLang 之后跟着变；不能是加载时的快照）
  Object.defineProperty(root.CORE, "LANG", { get: function () { return LANG; }, enumerable: true });
  // CORE.FONT 读当前字体串（useSkinFont 之后跟着变）
  Object.defineProperty(root.CORE, "FONT", { get: function () { return FONT; }, enumerable: true });
})(window);
