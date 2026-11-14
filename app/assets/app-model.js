/* 藏头 - Backronym：作品状态、DOM 引用与共用操作。ES2017 经典脚本。 */
window.Backronym = {};
(function (app) {
  "use strict";
  app.model = {};

  // 纯逻辑在 core.js（window.CORE，index.html 里先于本文件加载）；这里只取别名，函数体不在 app.js
  var CORE = window.CORE;

  var state = {
    lang: "en",    // 定字母规则的那门语言（= CORE.LANG.code）；取某一门的数据时由 inLang 临时换成那一门。切换只经 setLangs
    langs: ["en"], // 语言多选（2026-11-12）：作品选中的各门语言，一律平等（草稿 langs 字段）
    pickLangs: [], // 每格的词来自哪门语言（"" = 不知道 / 自定义词）；决定去哪个词库重查、用哪张断词表
    letters: [],   // ["L","I","F","E"]
    picks: [],     // 每个位置选中的 [word, zh, 其余义项?] 或 null
    glosses: [],   // 每个位置实际画到图上的释义（默认 zh，可改）
    glossAuto: [], // 每个位置的释义是否仍是自动带出的（用户一动就 false；D7，CORE.nextGloss）
    captions: [],  // 每个位置的配文（只在单图视图里用）
    poss: [],      // V003-B4-R7：每格选中的义项的词性（自动带出的释义 = 词条第一个词性；点义项栏 = 那一行的词性；自己写的释义不改它）
    arts: [],      // v00.03.00 T22：两性名词由用户选的冠词（每格一个字符串，没选为空）；换词即清
    keys: [],      // 每个位置的关键字母下标，T17 起恒为 0（朱红词首字母）；字段留着只为草稿格式不变
    split: null,   // T42：超过 10 格时手动调过的分界（前一张的格数）；null = 自动（CORE.autoSplit）
    images: [],    // 每个位置单独的配图或 null
    crops: [],     // 每个位置的取景 {z, x, y} 或 null（默认居中、不放大）
    image: null,   // 顶部上传的默认图，没单独配图的格子用它
    view: "single",  // single 单图视图（默认，1080×1440 竖图） / grid 列阵视图（5 个字母以内是横图）
    filler: "",    // 填表人（在入场界面改，卡顶右上只显示；留空不导出）
    focus: 0,      // 当前格（卡上正在编辑的那一格）
    imgIndex: -1,  // 配图面板正在改的格
    cropIndex: -1, // 正在调整配图的位置
    outputs: [],   // 完成面板导出的 JPEG data URL（面板关闭就清掉，不在后台占内存）
    retitle: false, // 换语言清掉了标题：标题框的占位字写「重新起一个标题」，填了就不再提醒。ponytail: 只在内存里，不进草稿，刷新后占位字回到单词本身
  };

  var $ = function (id) { return document.getElementById(id); };
  var el = {
    // 外壳（T10）：顶部栏、满宽卡、卡下字母栏 + 页码 + 提示行
    app: $("app"), card: $("card"), mirror: $("mirror"), wordCtl: $("wordCtl"), glossCtl: $("glossCtl"), capCtl: $("capCtl"), plateHit: $("plateHit"),
    cand: $("cand"), candMsg: $("candMsg"), candLab: $("candLab"), candRow: $("candRow"), candMore: $("candMore"), candMoreN: $("candMoreN"), candRandom: $("candRandom"), candNext: $("candNext"), candList: $("candList"), senseList: $("senseList"),
    top: $("top"), hintRow: $("hintRow"), sheetTabs: $("sheetTabs"), pager: $("pager"), pagerLetters: $("pagerLetters"), hint: $("hint"), toEntry: $("toEntry"),
    viewSingle: $("viewSingle"), viewGrid: $("viewGrid"), finish: $("finish"),
    // 配图面板 / 取景面板（T15）
    imgPanel: $("imgPanel"), imgTitle: $("imgTitle"), imgClose: $("imgClose"), cellPhoto: $("cellPhoto"), imgPick: $("imgPick"), imgAdjust: $("imgAdjust"), imgRemove: $("imgRemove"),
    photo: $("photo"), defPick: $("defPick"), defRemove: $("defRemove"),
    cropper: $("cropper"), cropTitle: $("cropTitle"), cropCanvas: $("cropCanvas"),
    cropMoves: $("cropMoves"), cropMinus: $("cropMinus"), cropPlus: $("cropPlus"), cropZoom: $("cropZoom"), cropReset: $("cropReset"), cropCancel: $("cropCancel"), cropApply: $("cropApply"), cropScope: $("cropScope"),
    // 卡顶标题框（T16），键盘上方一行
    title: $("title"), kbRow: $("kbRow"), kbText: $("kbText"), kbTools: $("kbTools"), kbNote: $("kbNote"), tcolorCustom: $("tcolorCustom"),
    // 设置页（v00.03.00）：顶栏「设置」进；深浅三档单选；底行借物与版权
    settingsOpen: $("settingsOpen"), settings: $("settings"), settingsClose: $("settingsClose"), modeGroup: $("modeGroup"), skinGroup: $("skinGroup"), modeWhy: $("modeWhy"), setCredits: $("setCredits"), entrySaveText: $("entrySaveText"), finishText: $("finishText"),
    // 语言栏（T20）
    langNow: $("langNow"), langMore: $("langMore"), langList: $("langList"), langRule: $("langRule"), langWait: $("langWait"), presetField: $("presetField"),
    // 入场界面（T18）：单词、预设、填表人、主按钮；顶部栏的品牌名 / 返回箭头；改单词清空确认
    entry: $("entry"), entryTitle: $("entryTitle"), entryNote: $("entryNote"), entryWait: $("entryWait"), entrySaveMsg: $("entrySaveMsg"), entrySave: $("entrySave"),
    leavePop: $("leavePop"), leaveDiff: $("leaveDiff"), leaveSave: $("leaveSave"), leaveDrop: $("leaveDrop"), leaveStay: $("leaveStay"), brand: $("brand"), entryBack: $("entryBack"), entryStart: $("entryStart"),
    wordInput: $("wordInput"), wordCount: $("wordCount"), wordErr: $("wordErr"), wordPreview: $("wordPreview"), presets: $("presets"), wordSense: $("wordSense"), presetMore: $("presetMore"),
    splitInfo: $("splitInfo"), splitAdjust: $("splitAdjust"), splitLeft: $("splitLeft"), splitRight: $("splitRight"), splitAuto: $("splitAuto"),
    fillerCtl: $("fillerCtl"), fillerCount: $("fillerCount"), fillerErr: $("fillerErr"),
    wordConfirm: $("wordConfirm"), confTitle: $("confTitle"), confList: $("confList"), confClear: $("confClear"), confKeep: $("confKeep"),
    // 完成面板 / 导出结果页 / 借物页（T18）；#live = 给读屏的状态播报（不显示）
    toast: $("toast"), live: $("live"), draftStatus: $("draftStatus"), finishPanel: $("finishPanel"), finTitle: $("finTitle"), finCount: $("finCount"), finBar: $("finBar"), finProg: $("finProg"),
    save: $("save"), post: $("post"), exportView: $("exportView"), finMsg: $("finMsg"),
    finThumbs: $("finThumbs"), viewer: $("viewer"), viewTitle: $("viewTitle"), viewImg: $("viewImg"), viewClose: $("viewClose"), viewPrev: $("viewPrev"), viewNext: $("viewNext"),
    results: $("results"), resCount: $("resCount"), resList: $("resList"), resClose: $("resClose"),
    credits: $("credits"), creditsOpen: $("creditsOpen"), creditsClose: $("creditsClose"),
  };

  // ---------- 选词 ----------

  // 屏蔽器两版都有（block/core.js + 各语言词表）；万一没加载就放行（判断在 CORE.blocked，按当前语言查）
  var blocked = CORE.blocked;
  var senseGroups = CORE.displayGroups; // 义项栏只给人看：用去掉名字 / 地名标注后的义项（T37）
  var defaultGloss = CORE.defaultGloss, defaultPos = CORE.defaultPos, defaultSense = CORE.defaultSense, capitalize = CORE.capitalize;

  // 同一位置字母没变就保留该位置的数据（prev = 改单词前的字母；新字母已在 state.letters）。规则在 CORE.keepSame（有测试）
  function keepSame(prev, arr, empty) { return CORE.keepSame(prev, state.letters, arr, empty); }

  // 按新单词重建格子（D18）：同位置字母没变的格保留，其余清空。首次输入、改单词、恢复草稿都走这里；调用方负责接着 changed()
  function setLetters(text) {
    var prev = state.letters;
    state.letters = CORE.normalizeWord(text).split("").filter(Boolean);
    state.picks = keepSame(prev, state.picks, null);
    state.glossAuto = keepSame(prev, state.glossAuto, true);
    state.glosses = keepSame(prev, state.glosses, "");
    state.captions = keepSame(prev, state.captions, "");
    state.keys = keepSame(prev, state.keys, 0);
    state.arts = keepSame(prev, state.arts || [], "");
    state.pickLangs = keepSame(prev, state.pickLangs || [], "");
    state.poss = keepSame(prev, state.poss || [], "");
    state.images = keepSame(prev, state.images, null);
    state.crops = keepSame(prev, state.crops, null);
    state.focus = firstOpen(0); // 格子初始为空（D6），不再随机填满
  }

  // ---- T42：分图 ----
  // 自动切点：按单词缓存（autoSplit 要查词库）；手动分界在合法范围内才用
  // T05 / V003-B1-R2：缓存记下算它时用的词库 / 断词表对象本身，对象一变（换语言、词库迟到、重试后替换）就重算，不按语言名串用旧结果
  var cutMemo = { word: "", W: null, hyph: null, cut: null }, rankIndex = null, rankSrc = null;
  function rankOf(w) { // 词在词库首字母组里的位置（词库按词频排）；B6-R1 判断「常用复合词」用，第一次用时建索引
    var W = words();
    if (!rankIndex || rankSrc !== W) {
      rankIndex = Object.create(null); rankSrc = W;
      for (var k in W) W[k].forEach(function (x, i) { if (rankIndex[x[0]] === undefined) rankIndex[x[0]] = i; });
    }
    return rankIndex[w] === undefined ? 1e9 : rankIndex[w];
  }
  function autoCut(word) {
    var W = words(), hyph = langData("hyph");
    if (cutMemo.word !== word || cutMemo.W !== W || cutMemo.hyph !== hyph) {
      cutMemo = { word: word, W: W, hyph: hyph, cut: CORE.autoSplit(word, function (w) { return !!CORE.lookupEntry(W, null, w); }, hyph, rankOf) }; // 只认主词库（单个词没有空格变体）
    }
    return cutMemo.cut;
  }
  function cutOf(word, manual) {
    var r = CORE.splitRange(word.length);
    if (!r) return null;
    return typeof manual === "number" && manual >= r.lo && manual <= r.hi ? manual : autoCut(word);
  }
  function sheets() {
    var word = state.letters.join("");
    return CORE.sheetsOf(word.length, cutOf(word, state.split));
  }
  function sheetOf(i) { // 第 i 格在哪一张
    var sh = sheets();
    for (var k = 0; k < sh.length; k++) if (i >= sh[k][0] && i < sh[k][1]) return k;
    return 0;
  }

  function cellImage(i) { return state.images[i] || state.image; }

  // 从 from 开始往后找第一个没选词的格（绕回开头）；全选完就停在 from
  function firstOpen(from) {
    var n = state.letters.length;
    for (var k = 0; k < n; k++) {
      var i = (from + k) % n;
      if (!state.picks[i]) return i;
    }
    return Math.min(from, Math.max(0, n - 1));
  }

  function make(tag, cls, text) {
    var node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text != null) node.textContent = text;
    return node;
  }

  function setFocus(i, focusTarget) {
    var moved = i !== state.focus;
    state.focus = i;
    app.view.renderShell();
    if (moved) rebaseHeight();
    if (focusTarget) focusId(focusTarget);
  }

  // 选中一个词：释义按 D7（用户写过的不覆盖）；关键字母恒为词首（T17）
  function setPick(i, item, lang) {
    var was = state.picks[i];
    if (state.pickLangs) state.pickLangs[i] = item ? lang || itemLang(item) || "" : "";
    // 冠词的选择跟着词走：换了词就清；同一个词（词库迟到后重查）且选项里还有它才留着
    if (!was || !item || was[0] !== item[0] || CORE.articleOptions(item).indexOf(state.arts[i]) < 0) state.arts[i] = "";
    state.picks[i] = item;
    var g = CORE.nextGloss(state.glosses[i], state.glossAuto[i], item);
    state.glosses[i] = g.gloss;
    state.glossAuto[i] = g.auto;
    // 释义是自动带出的：词性 = 词条第一个词性；保留着用户自己的释义：同一个词沿用原来记的，换了词就不确定
    if (state.poss) state.poss[i] = g.auto ? defaultSense(item || ["", ""]) : was && item && was[0] === item[0] ? state.poss[i] || "" : "";
    state.keys[i] = 0;
  }

  // 把焦点交给某个字段（被屏蔽器拦下后跳过去）。可编辑的控件只在单图视图里有，列阵下先回单图（当前格由调用方先 setFocus）；
  // 单词与填表人在入场界面（T18）：打开入场界面，焦点落在该字段，字段旁写明原因
  function focusId(id) {
    if (id === "wordInput" || id === "fillerCtl") {
      app.entry.openEntry("edit", id);
      if (id === "wordInput" && blocked(el.wordInput.value)) app.entry.setEntryErr("word", app.entry.BLOCKED_WORD);
      if (id === "fillerCtl" && blocked(el.fillerCtl.value)) app.entry.setEntryErr("filler", app.entry.BLOCKED_FILLER);
      return;
    }
    if (state.view === "grid") app.view.setView("single");
    var node = $(id);
    if (node) node.focus();
  }

  // 给读屏的词性全称（“adj.” 会被逐个字母念出来）
  var POS_NAME = { "adj.": "形容词", "n.": "名词", "v.": "动词", "adv.": "副词", "prep.": "介词", "conj.": "连词",
    "pron.": "代词", "int.": "感叹词", "num.": "数词", "art.": "冠词", "aux.": "助动词", "abbr.": "缩写" };
  function posName(pos) {
    if (!pos) return "";
    return POS_NAME[pos] || (pos.charAt(0) === "[" ? pos.slice(1, -1) + "领域" : pos);
  }

  // 按单词从词库里找回最新条目（草稿里存的可能是旧格式；卡上打的词首字母大写，词库全小写，所以不分大小写）；找不到就是自定义词
  // 语言多选：先在指定的语言里找（这一格记着的那门），没有再按选中语言的先后找。lookupHit 还说明是在哪门语言里找到的
  function lookupIn(word) {
    if (lexicon()) { var g = lexiconHit(word); return g ? g.entry : null; }
    var hit = CORE.resolveEntry(words(), langData("phrases"), langData("forms"), word, langData("formRanks"), langData("lookupGuards"));
    return hit ? hit.entry : null;
  }
  function lookupHit(word, prefer) {
    var order = (prefer && state.langs.indexOf(prefer) >= 0 ? [prefer] : []).concat(state.langs.filter(function (c) { return c !== prefer; }));
    for (var k = 0; k < order.length; k++) {
      var e = inLang(order[k], function () { return lookupIn(word); });
      if (e) return { entry: e, lang: order[k] };
    }
    return null;
  }
  function lookup(word, prefer) { var h = lookupHit(word, prefer); return h ? h.entry : null; }
  // 选中的各门语言里查得到这个词的全部结果（候选栏用：每门各出一条）
  function lookupAll(word) {
    var out = [];
    state.langs.forEach(function (c) { var e = inLang(c, function () { return lookupIn(word); }); if (e) out.push({ entry: e, lang: c }); });
    return out;
  }
  // 打的是变形（suis、Träume）时返回它的原形，否则空串；候选栏用来写「X 是 Y 的变形」。lang = 在哪门语言里查
  function formOf(word, lang) {
    return inLang(lang || state.lang, function () {
      if (lexicon()) { var g = lexiconHit(word); return g && (g.tier === 1 || g.tier === 3) ? g.lemma : ""; }
      return CORE.lookupEntry(words(), langData("phrases"), word) ? "" : CORE.formLemma(langData("forms"), word, rankOf);
    });
  }

  // ---- T19：新范围词库查词 ----
  // 词包的 lexicon 部分是全部准入义项的精简记录（scripts/t19/build-packs.mjs）。还原与查找在 lexicon-store.js（fromPack / packLookup）：
  // 精确原形 → 精确词形 → 去变音符的原形 → 去变音符的词形，按义项排除同形词形、遵守防误借清单。
  // ponytail: 一个写法对着几个原形时只取排在最前的一组（可推荐的义项优先）；并列原形的选择界面是后续工作
  var lexCaches = Object.create(null); // 每门语言一份（语言多选后一次查词要走几门，不能互相冲掉）
  function lexicon() {
    var pack = langData("lexicon");
    if (!pack || !window.LEXICON_STORE) return null;
    var c = lexCaches[state.lang];
    if (!c || c.pack !== pack) c = lexCaches[state.lang] = { pack: pack, lang: state.lang, lx: window.LEXICON_STORE.fromPack(pack, state.lang, CORE.LANG.fold), memo: Object.create(null) };
    return c;
  }
  function lexiconHit(word) {
    var c = lexicon(), text = String(word == null ? "" : word).trim().replace(/\s+/g, " ");
    if (!text) return null;
    if (!(text in c.memo)) c.memo[text] = window.LEXICON_STORE.packLookup(c.lx, text, { exact: CORE.LANG.exactKey, fold: CORE.LANG.fold, blocked: function () { return false; } });
    return c.memo[text];
  }

  // ---- T04 / T05：作品语言与语言包数据 ----
  // 当前语言的一部分数据（words / phrases / hyph），按语种隔离；没加载为 null
  function langData(part) { return window.LANGPACK.get(state.lang, part); }
  var NO_WORDS = {}; // 词库没就绪时当空词库（只影响候选）；固定同一个对象，词库到了对象就变，缓存据此失效（V003-B1-R2）
  function words() { return langData("words") || NO_WORDS; }
  // 候选栏开关打开后才出的词（专业、历史文化）：与 words 同形，每条多一列类别标注；没有就当空
  function moreWords() { return langData("more") || NO_WORDS; }
  // 六门作品语言：[代码, 中文名, 原文名]（语言栏、确认框、提示文案共用）
  var LANGS = [["en", "英语", "English"], ["fr", "法语", "Français"], ["de", "德语", "Deutsch"], ["es", "西班牙语", "Español"], ["it", "意大利语", "Italiano"], ["la", "拉丁语", "Latina"]];
  function langName(code) { for (var k = 0; k < LANGS.length; k++) if (LANGS[k][0] === code) return LANGS[k][1]; return code; }
  // 一门语言能不能用来填格：规则、屏蔽词表、词库都到了（英语随包加载，恒为真）
  function langReady(code) { var r = window.LANGPACK.ready(code); return r.rules && r.block && r.words; }
  // 取某一门语言的数据时用：临时把当前语言换成它（词库、词形、断词表、规则都跟着），跑完恢复。不动选中的语言
  function inLang(code, fn) {
    var keep = state.lang;
    state.lang = code;
    try { return CORE.withLang(code, fn); } finally { state.lang = keep; }
  }
  // 候选项、词条来自哪门语言（只在内存里记，条目本身是词库的行，不改它）
  var itemLangs = typeof WeakMap === "function" ? new WeakMap() : null;
  function tagLang(item, code) { if (itemLangs && item && typeof item === "object") itemLangs.set(item, code); return item; }
  function itemLang(item) { return (itemLangs && item && itemLangs.get(item)) || ""; }
  // 设作品语言（可以几门）：有没注册规则的就不改（返回 false）。草稿恢复与新作品经这里，保证 state 与 CORE 一致
  function setLang(code) { return setLangs([code]); }
  function setLangs(codes) {
    var list = LANGS.map(function (l) { return l[0]; }).filter(function (c) { return codes.indexOf(c) >= 0; }); // 固定按语言栏的顺序
    if (list.length !== codes.filter(function (c, k) { return codes.indexOf(c) === k; }).length || !CORE.useLangs(list)) return false;
    state.langs = list;
    var code = CORE.LANG.code;
    state.lang = code;
    if (el.wordCtl) { el.wordCtl.maxLength = CORE.LANG.compose ? CORE.LANG.wordMax * 4 : CORE.LANG.wordMax; el.wordCtl.lang = code; } // 西文的上限按合成后的字数由 rewriteWord 管（R9）：原生 maxlength 按码元数，分解编码的字会被提前截掉，所以放宽 // T28：格内上限随语言（英文 20、西文 28）；lang 给输入法与读屏
    return true;
  }
  // 换语言（第 4 批 T20 的界面接这三个）：prepareLang 只加载、不改作品；拿到不 stale 且 ready.rules 的结果、用户确认后才 setLang；取消用 cancelLang
  // 每门语言一个加载器（语言多选后会同时加载几门；共用一个的话，后发的请求会把先发的判成过期）。与后台补充表加载（app.js）的序号互不影响
  var langLoads = Object.create(null);
  function loaderOf(code) { return langLoads[code] || (langLoads[code] = window.LANGPACK.loader()); }
  // 加载的是正在用的语言（如词库迟到后重试成功）：按新数据重画一次——卡（分图切点）、候选栏、入场页；不动输入框的值、组字与草稿
  function prepareLang(code) {
    return loaderOf(code).load(code).then(function (r) {
      if (!r.stale && state.langs.indexOf(r.code) >= 0) {
        if (r.ok) app.draft.quietly(refreshPicks); // V003-B4-R8：词库到了，各格的词条按词库补齐（冠词等），不算编辑
        if (r.ok && app.publish.finishLag === r.code) app.publish.finishNote = app.publish.finishLag = ""; // V003-B4-R11：点「完成」时说过这门语言还没加载好，现在到了，提示清掉
        app.view.renderShell();
        if (app.editor.focusKind) app.editor.renderCand();
        if (app.entry.entryFrom) app.entry.renderEntry();
      }
      return r;
    });
  }
  function cancelLang(code) { Object.keys(langLoads).forEach(function (c) { if (!code || c === code) langLoads[c].cancel(); }); }
  // 词库迟到（恢复草稿时还没加载、失败后重试成功）：格里的词条按当前词库重新对一遍，与恢复时、打字时同一条规则（itemFor）。
  // 只动程序维护的列（释义来源、冠词、注释）；用户的拼写、释义、配文、未知扩展位不动。冠词的旧选择不在新选项里就清掉；没记词性的自动释义补上词性
  function refreshPicks() {
    state.picks = state.picks.map(function (p, i) { return p && p[0] ? itemFor(p[0], p, i) : p; });
    state.picks.forEach(function (p, i) {
      if (!p) return;
      if (state.arts[i] && CORE.articleOptions(p).indexOf(state.arts[i]) < 0) state.arts[i] = "";
      if (!state.poss[i] && state.glossAuto[i]) state.poss[i] = defaultSense(p);
    });
  }

  // 卡上打的（或草稿里的）一个词 → picks 条目：词库里有就带上它的义项，大小写照用户打的；新建且未命中时为无释义自定义词；恢复时保留原条目
  // i（可选）= 第几格：先在这一格记着的语言里查，查到了把语言记回这一格
  function itemFor(text, previous, i) {
    var known = typeof i === "number", own = known && state.langs.indexOf(state.pickLangs[i]) >= 0 ? state.pickLangs[i] : "", h = null;
    // 核对已有的词条（恢复草稿、词库迟到后重对）：不能让「谁的词库先到」决定这个词算哪门语言的——认定以后不再改，冠词也跟着变
    // V003-B4-R11：这一格记着的语言词库还没到，不去别的语言里找（同形词会顶替它），原样留着，等它到了由 refreshPicks 再核
    // V003-B4-R12：没记语言（自定义词）或记着的语言里查不到，要到别的语言里认——等选中的语言全部到齐，再按语言栏的先后找
    if (previous && known && window.LANGPACK) {
      var here = function (c) { return window.LANGPACK.has(c, "words"); };
      h = lookupHit(text, own);
      if (h && h.lang !== own && !state.langs.every(here)) h = null; // 记着的语言没到时它查不到，查到的必是别的语言，这里一并挡下
    } else h = lookupHit(text, own);
    var hit = h ? h.entry : null;
    if (known && h) state.pickLangs[i] = h.lang;
    else if (hit) tagLang(hit, h.lang);
    if (previous) {
      var restored = previous.slice();
      restored[0] = text;
      // 词库已知的三列（释义、冠词、注释）以当前词库为准：词库删掉的冠词不能被旧草稿带回；第 4 列起是未知扩展位，保留
      if (hit) { for (var k = 1; k < 4; k++) { if (k < hit.length) restored[k] = hit[k]; else if (k < restored.length) restored[k] = ""; } }
      return restored;
    }
    if (!hit) return [text, ""];
    if (hit[0] === text) return hit;
    var item = hit.slice(); // 保留冠词、年代及未来扩展位；不改词库原行
    item[0] = text;
    return tagLang(item, h.lang);
  }

  // 一格的词状态：empty 没打 / bad 打了但不是以该字母开头 / ok
  function cellState(i) {
    var p = state.picks[i];
    if (!p || !p[0]) return "empty";
    if (!CORE.containsLetter(p[0], state.letters[i])) return "bad";
    return CORE.articleOf(p, (state.arts || [])[i], (state.poss || [])[i]).pending ? "art" : "ok"; // art = 两性名词还没选冠词（草稿照存，点「完成」会被拦下）
  }
  // 卡上冠词位写什么（没有冠词为空串）；二选一没选时写全
  function articleText(i) {
    var p = state.picks[i];
    return p && p[0] ? CORE.articleOf(p, (state.arts || [])[i], (state.poss || [])[i]).text : "";
  }
  // 这个词的标准断词点（当前语言的断词表，按整词查；长度对不上的不用）。没有为 null
  function hyphOf(word) {
    if (!word) return null;
    for (var k = 0; k < state.langs.length; k++) { // 选了几门语言：哪门的断词表有这个词就用哪门的
      var h = window.LANGPACK.get(state.langs[k], "hyph");
      if (!h) continue;
      var pts = h[CORE.LANG.exactKey(word)], n = CORE.textUnits(word).length;
      if (!pts && CORE.LANG.fold(word).length === n) pts = h[CORE.LANG.fold(word)];
      if (pts) return pts;
    }
    return null;
  }

  function changed() {
    app.publish.finishNote = ""; // 点「完成」被拦下时的原因：改了东西就不再显示
    if (editingNow()) holdHeight(true); // 输入中：重摆前先记下当前高度，这次重摆只许变高（T28）
    app.view.renderShell(); // 卡和字母栏跟着数据走
    app.draft.saveDraft();
  }

  // 生成前把所有用户文字过一遍屏蔽器，返回第一个有问题的位置 [名称, 文字, 元素 id, 格序号或 -1]
  function findBlocked() {
    // 单词本身也查：它会印在海报上、写进笔记正文
    var fields = [["单词", state.letters.join(""), "wordInput", -1], ["标题", app.title.titleText(), "title", -1], ["填表人", state.filler, "fillerCtl", -1]];
    state.letters.forEach(function (l, i) { // 词 / 释义 / 配文都是卡上的控件（当前格才有，调用方先 setFocus 到那一格）
      var n = "第 " + (i + 1) + " 格";
      fields.push([n + "的词", state.picks[i] ? state.picks[i][0] : "", "wordCtl", i], [n + "的释义", state.glosses[i], "glossCtl", i]);
      if (state.view === "single") fields.push([n + "的配文", state.captions[i], "capCtl", i]);
    });
    for (var i = 0; i < fields.length; i++) if (blocked(fields[i][1])) return fields[i];
    return null;
  }

  // ---------- 统一提示（T33）：标题下方的 Toast ----------
  // 只有一个 #toast：新消息替换旧消息，到时清空（空了 CSS 不显示）。位置在「标题之下」：入场页贴页面标题，编辑页单图贴卡顶标题框，
  // 列阵贴卡上标题区（1080 坐标 250）；标题滚出可视区时夹在可视区顶边，不出可视区底边（软键盘弹起时按 visualViewport 算）。
  var toastTimer = 0, toastRaf = 0;
  function showToast(msg, ms) {
    clearTimeout(toastTimer);
    el.toast.textContent = msg || "";
    placeToast();
    if (msg) toastTimer = setTimeout(function () { el.toast.textContent = ""; }, ms);
  }

  function toastAnchorBottom() {
    if (!el.entry.hidden) return el.entryTitle.getBoundingClientRect().bottom;
    if (!el.title.hidden) return el.title.getBoundingClientRect().bottom;
    var r = el.card.getBoundingClientRect();
    var sh = sheets()[sheetOf(state.focus)];
    return r.top + 250 * r.width / (state.view === "grid" ? CORE.gridShape(sh[1] - sh[0]).W : CORE.CARD.W);
  }

  function placeToast() {
    if (!el.toast.textContent) return;
    var vv = window.visualViewport, vTop = vv ? vv.offsetTop : 0, vBottom = vTop + (vv ? vv.height : window.innerHeight);
    var box = el.app.getBoundingClientRect(), m = box.width * CORE.CARD.M / CORE.CARD.W, st = el.toast.style;
    st.left = box.left + m + "px";
    st.width = box.width - 2 * m + "px";
    var floor = Math.max(vTop, el.top.getBoundingClientRect().bottom) + 8; // T29：不盖住固定顶栏
    var top = Math.max(toastAnchorBottom() + 8, floor);
    st.top = Math.max(vTop + 8, Math.min(top, vBottom - el.toast.offsetHeight - 8)) + "px";
  }

  // 滚动 / 软键盘变化时跟着标题走（每帧最多一次）
  function followToast() {
    if (toastRaf || !el.toast.textContent) return;
    toastRaf = requestAnimationFrame(function () { toastRaf = 0; placeToast(); });
  }

  // ---------- 输入期间页面不缩短（T28） ----------
  // 输入时候选栏、提示行、键盘行留白会随每次按键变高变矮；页面一旦变短而又滚在底部，浏览器会把滚动位置夹回去，看起来就是上跳下跌。
  // 有输入框在用时只许页面变高、不许变短；离开所有输入框后（等软键盘收起）再放开，此时的回弹就是「收键盘后夹到合法范围」。
  var holdTimer = 0;
  function editingNow() {
    var a = document.activeElement;
    return !!a && (!!a.isContentEditable || a.tagName === "TEXTAREA" || (a.tagName === "INPUT" && !/^(file|range|color|checkbox|radio|button)$/.test(a.type)));
  }
  function holdHeight(on) {
    clearTimeout(holdTimer);
    if (on) {
      var h = Math.max(el.app.offsetHeight, parseFloat(el.app.style.minHeight) || 0);
      el.app.style.minHeight = h + "px";
      return;
    }
    holdTimer = setTimeout(function () { if (!editingNow()) el.app.style.minHeight = ""; }, 400);
  }
  // 换了页面内容（切格、切视图、进出入场页）：旧高度不再有效，按新内容重新起算；还在输入就从新高度开始锁
  function rebaseHeight() {
    clearTimeout(holdTimer);
    el.app.style.minHeight = "";
    if (editingNow()) holdHeight(true);
  }

  // 全屏页（设置、借物与版权）开着时，页面背后的路由（读完草稿、到期重载）不能把焦点抢到被遮住的输入框上（V003-B4-R6）：
  // 那样键盘和读屏会落到看不见的地方，Esc / Tab 也不再归这张页管。开着就不动焦点；页关闭时焦点照旧还给打开它的按钮
  function pageOpen() { return !el.settings.hidden || !el.credits.hidden; }
  function focusBehind(node) { if (node && !pageOpen()) node.focus(); }

  // ---------- 弹层通用：Esc 关闭、Tab 不跑出弹层、点遮罩关闭 ----------

  function trapKeys(sheet, close) {
    sheet.addEventListener("keydown", function (e) {
      if (e.key === "Escape" || e.key === "Esc") { e.preventDefault(); close(); return; }
      if (e.key !== "Tab") return;
      var nodes = Array.prototype.filter.call(
        sheet.querySelectorAll("button, input, [tabindex='0']"),
        function (n) { return !n.disabled && n.type !== "file" && n.offsetParent !== null; });
      if (!nodes.length) return;
      var first = nodes[0], last = nodes[nodes.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    });
    sheet.addEventListener("click", function (e) { if (e.target === sheet) close(); });
  }


  // 跨模块接口；其余函数与缓存保留在本文件闭包中。
  Object.assign(app.model, {
    CORE: CORE,
    el: el,
    state: state,
    changed: changed,
    setLetters: setLetters,
    itemFor: itemFor,
    refreshPicks: refreshPicks,
    autoCut: autoCut,
    cutOf: cutOf,
    sheets: sheets,
    sheetOf: sheetOf,
    lookup: lookup, lookupHit: lookupHit, lookupAll: lookupAll, formOf: formOf,
    inLang: inLang, tagLang: tagLang, itemLang: itemLang, setLangs: setLangs,
    words: words,
    moreWords: moreWords,
    langData: langData,
    setLang: setLang,
    LANGS: LANGS,
    langName: langName,
    langReady: langReady,
    focusBehind: focusBehind,
    prepareLang: prepareLang,
    cancelLang: cancelLang,
    firstOpen: firstOpen,
    cellImage: cellImage,
    capitalize: capitalize,
    cellState: cellState,
    rankOf: rankOf,
    articleText: articleText,
    hyphOf: hyphOf,
    make: make,
    setFocus: setFocus,
    setPick: setPick,
    defaultGloss: defaultGloss,
    posName: posName,
    defaultPos: defaultPos,
    blocked: blocked,
    senseGroups: senseGroups,
    focusId: focusId,
    findBlocked: findBlocked,
    trapKeys: trapKeys,
    showToast: showToast,
    placeToast: placeToast,
    followToast: followToast,
    editingNow: editingNow,
    holdHeight: holdHeight,
    rebaseHeight: rebaseHeight
  });
})(window.Backronym);
