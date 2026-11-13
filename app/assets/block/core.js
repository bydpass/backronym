/* 屏蔽器公共部分（v00.03.00 T02）：依据《小红书社区公约 2.0》（色情擦边、网暴辱骂、煽动对立、违规导流）
   及违法违禁（毒品、自伤）整理；描述赌博本身的词按用户决定放行（2026-10-06）。两版都带（第七批 T40 起网页版也启用）。
   这里放归一化、中文词、导流规则和命中接口；各语言的整词 / 词中 / 前缀词表在 lang/<语种>/block.js，经 BLOCK.add 注册。
   core.js 检测不到 window.BLOCK 就不屏蔽。
   ponytail: 手写词表，只覆盖明确违规的说法；政治敏感词未收录，交给平台审核。漏网就往对应数组里加。 */
window.BLOCK = (function () {
  var LISTS = {}; // 语种 → { words: 整词, any: 词中任意位置, prefix: 前缀 }
  // 中文：子串命中，只放意思明确的多字词（“操”会误伤“操作”所以不放单字）
  // ponytail: “大麻”会顺带拦掉义项“大麻哈鱼”(salmon)，可接受
  var ZH = ["色情", "情色", "性交", "性爱", "性欲", "做爱", "约炮", "裸体", "裸照", "乳房", "阴茎", "阴道",
    "勃起", "手淫", "淫", "猥亵", "下流", "妓", "嫖", "卖淫", "强奸", "诱奸", "奸污", "通奸", "色欲", "情欲",
    "鸡奸", "生殖器", "阴部", "射精", "阴蒂",
    "毒品", "吸毒", "海洛因", "可卡因", "冰毒", "大麻", "鸦片",
    "自杀", "自残", "屠杀", "残杀", "恐怖分子",
    "杂种", "婊", "傻逼", "傻b", "操你", "肏", "草泥马", "他妈的", "贱人", "去死"];
  // 导流：联系方式、7 位以上数字（手机号 / QQ 号）
  var CONTACT = /微信|vx|wx|v信|加v|加微|qq号|qq群|扣扣|私聊|私信我|\d{7,}/i;

  // 先统一写法再比对，堵住常见绕过：
  //   全角转半角（ｓｅｘ、１３８…）；逐个字母隔开的并回去（s e x、f.u.c.k）；
  //   汉字和数字之间的空格、装饰符号去掉（傻 逼、微·信、138 1234 5678）；
  //   T02（有意变化）：去变音符（NFD 后删 U+0300–036F；ß→ss、œ→oe、æ→ae），sëx 与 sex 同样拦
  // ponytail: 不去 - . / :，否则日期 2024-10-06 会被当成号码；138-1234-5678 这种写法因此仍会漏
  var SPLIT_LETTERS = /\b([a-z])[\s.\-_*]+(?=[a-z]\b)/g;
  var SPLIT_OTHERS = /([^a-z])[\s·_*~'"“”‘’]+(?=[^a-z])/g; // 不去逗号句号：释义“逝去，死”不能并成“去死”
  // 切词：去变音符后仍留着的拉丁字母（ø、ł、đ、ı 等不分解的）也算词内。Chrome 61 不支持 \p{…}，用显式区间
  var TOKEN = /[a-zß-öø-ÿĀ-ɏ]+/g;
  function fold(t) {
    if (t.normalize) t = t.normalize("NFD");
    return t.replace(/[̀-ͯ]/g, "").replace(/ß/g, "ss").replace(/œ/g, "oe").replace(/æ/g, "ae");
  }
  function normalize(text) {
    var t = String(text || "");
    if (t.normalize) t = t.normalize("NFKC");
    t = fold(t.toLowerCase()).replace(SPLIT_LETTERS, "$1");
    return t.replace(SPLIT_OTHERS, "$1");
  }

  // 注册一门语言的词表（lang/<语种>/block.js 调用）；同一语种再注册就替换
  function add(lang, lists) {
    LISTS[lang] = { words: lists.words || [], any: lists.any || [], prefix: lists.prefix || [] };
  }
  function has(lang) { return !!LISTS[lang || "en"]; }

  // lang 缺省为 en。该语种词表没注册时只查中文和导流（调用方用 has() 判断能不能导出 / 发布，T05）
  function hit(text, lang) {
    var t = normalize(text), L = LISTS[lang || "en"];
    if (L) {
      var tokens = t.match(TOKEN) || [];
      for (var i = 0; i < tokens.length; i++) {
        var w = tokens[i];
        if (L.words.indexOf(w) >= 0) return true;
        for (var j = 0; j < L.any.length; j++) if (w.indexOf(L.any[j]) >= 0) return true;
        for (var p = 0; p < L.prefix.length; p++) if (w.indexOf(L.prefix[p]) === 0) return true;
      }
    }
    for (var k = 0; k < ZH.length; k++) if (t.indexOf(ZH[k]) >= 0) return true;
    return CONTACT.test(t);
  }

  return { hit: hit, add: add, has: has, normalize: normalize };
})();
