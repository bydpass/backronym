/* 语言包注册表与按需加载器（v00.03.00 T05）。不碰界面，测试注入替身 inject。ES2017 经典脚本。
   一门语言分几部分，分别算就绪（加载契约 ①）：
     rules  = 字母规则，CORE.addLang 注册（英语内置在 core.js）——没就绪不能进编辑；
     block  = 屏蔽词表，BLOCK.add 注册——没就绪不能导出 / 发布；
     words  = 词库，LANGPACK.put(code, "words", …) 注册——没就绪只影响候选；
     more   = 主动展开才出的候选（专业、历史文化词；T19），与 words 同一个文件，可缺；
     phrases / hyph = 补充表与断词点，可缺（缺了当查不到）。
   每门语言的数据按语种分开存（⑤），换语言不串用 PHRASES / HYPH。 */
window.LANGPACK = (function (root) {
  "use strict";
  var data = {}; // 语种 → { words, phrases, hyph }
  // ponytail: 英语的 words.js / phrases.js 是生成产物，仍写 window.WORDS / HYPH / PHRASES（不为改名重生成 2 MB 词库）；
  // 英语没 put 过的部分映射到这三个全局。西文语言包一律用 put，不碰全局
  var EN_GLOBAL = { words: "WORDS", phrases: "PHRASES", hyph: "HYPH", lexicon: "LEXICON_EN", more: "WORDS_MORE" }; // lexicon：T19 全部准入义项（查词用），与 words 同一个文件
  var FILES = { rules: "rules.js", block: "block.js", words: "words.js", phrases: "phrases.js" };

  function put(code, part, value) { (data[code] || (data[code] = {}))[part] = value; }
  function get(code, part) {
    var d = data[code];
    if (d && d[part] != null) return d[part];
    if (code === "en" && EN_GLOBAL[part]) return root[EN_GLOBAL[part]] || null;
    return null;
  }
  function has(code, part) {
    if (part === "rules") return !!(root.CORE && root.CORE.hasLang(code));
    if (part === "block") return !!(root.BLOCK && root.BLOCK.has(code));
    return get(code, part) != null;
  }
  // 三项分开报告：调用方据此决定能否编辑 / 导出、候选栏要不要显示「词库加载中」
  function ready(code) { return { rules: has(code, "rules"), block: has(code, "block"), words: has(code, "words") }; }
  function src(code, part) { return "./assets/lang/" + code + "/" + FILES[part]; }

  // 浏览器里插 <script>（参照 app.js 原来异步加载 phrases.js 的做法）；onload 只说明文件到了，注册与否另查 has()
  function inject(url) {
    return new Promise(function (ok, no) {
      var s = root.document.createElement("script");
      s.src = url;
      var done = function () { if (s.parentNode) s.parentNode.removeChild(s); }; // 脚本执行完节点就没用了；失败重试时不留旧节点
      s.onload = function () { done(); ok(); };
      s.onerror = function () { done(); no(new Error("load failed: " + url)); };
      root.document.body.appendChild(s);
    });
  }

  // 加载器。opts.inject(url) → Promise（缺省插 <script>）；opts.ms = 单个文件的期限（缺省 15 秒）。
  // load(code, parts) → { code, stale } 或 { code, ok, failed: [部分], ready }：
  //   · 只加载还没就绪的部分；同一文件正在加载时共用一次请求，不重复插 <script>；
  //   · 每次 load 记一个序号，结果回来时已有更新的 load / cancel，就标 stale（②：迟到的旧语言结果直接丢弃，调用方不应用）；
  //   · 超时或失败的部分列在 failed，下次 load 会重新请求（③：可重试；加载器从不改当前作品）。
  // 切换语言要「确认后一次性应用」（④）：调用方先 load，拿到不 stale 且 rules 就绪的结果、用户确认后才 CORE.useLang 并改作品；取消就 cancel()
  function loader(opts) {
    opts = opts || {};
    var seq = 0, ms = opts.ms || 15000, pending = {}, fetchFile = opts.inject || inject;
    function within(p) {
      return new Promise(function (ok, no) {
        var timer = setTimeout(function () { no(new Error("load timeout")); }, ms);
        p.then(function (v) { clearTimeout(timer); ok(v); }, function (e) { clearTimeout(timer); no(e); });
      });
    }
    // 一次请求的生命周期与结果是否 stale 分开管（V003-B1-R1）：这次等待一结束（到了 / 失败 / 超时）就把它从 pending 摘掉，
    // 不管调用方是否已作废；只摘自己那一次（pending[url] === p），不误删之后同一文件的新请求。并发同文件仍共用一次
    function fetch(url, registered) {
      var p = pending[url] || (pending[url] = Promise.resolve().then(function () { return fetchFile(url); }));
      function drop() { if (pending[url] === p) delete pending[url]; }
      return within(p).then(function () {
        drop();
        if (!registered()) throw new Error("not registered: " + url); // 文件到了却没注册也算失败
      }, function (e) { drop(); throw e; });
    }
    function load(code, parts) {
      var my = ++seq;
      var need = (parts || ["rules", "block", "words"]).filter(function (p) { return FILES[p] && !has(code, p); });
      return Promise.all(need.map(function (p) {
        return fetch(src(code, p), function () { return has(code, p); }).then(function () { return null; }, function () { return p; });
      })).then(function (bad) {
        if (my !== seq) return { code: code, stale: true };
        var failed = need.filter(function (p, i) { return bad[i] || !has(code, p); });
        return { code: code, ok: !failed.length, failed: failed, ready: ready(code) };
      });
    }
    function cancel() { seq++; }
    return { load: load, cancel: cancel };
  }

  return { put: put, get: get, has: has, ready: ready, src: src, loader: loader };
})(window);
