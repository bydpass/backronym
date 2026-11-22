/* 藏头 - Backronym：打开耗时诊断。ES2017 经典脚本，只进诊断包（scripts/pack-diag.mjs 把它放进包里、在 <head> 里样式表之前引用），不进发布包。
   不上报，不联网；数据只显示在这台设备的页面上，另在 localStorage 里留最近几次的摘要，方便连开几次后一张截图看全。
   做什么：记下页面自己看得到的几个时间点（从页面开始加载算起），在角落显示。用户另行掐表记「扫码到能打字」的总时间，两者相减就是页面之外的那几段
   （容器启动、取包与解压、WebView 初始化）。计划见 plans/v00.03.03/PLAN.md「从 v00.03.02 转入」P1 续。
   不改产品的任何脚本：只听事件、读公开状态。全部包在 try 里，出错也不影响产品本身。 */
(function () {
  "use strict";
  try {
    var KEY = "backronym-diag-v1", KEEP = 8;
    var perf = window.performance || {}, born = Date.now();
    // 时间一律是「从页面开始加载算起的毫秒」：performance.now() 的零点就是导航开始；老内核没有它时退回到本脚本开始执行的那一刻
    var now = function () { return perf.now ? perf.now() : Date.now() - born; };
    var mark = { head: now() }, files = [], added = {}, usableAs = "", hiddenEarly = false, saved = false, box = null, open = false;
    var run = { n: 1, gap: null };

    var short = function (u) { u = String(u || ""); var i = u.indexOf("/assets/"); return (i >= 0 ? u.slice(i + 8) : u.split("/").pop()).split("?")[0]; };
    var ms = function (v) { return v == null || isNaN(v) ? "—" : String(Math.round(v)); };
    var two = function (v) { return (v < 10 ? "0" : "") + v; };

    // 每个脚本、样式表：什么时候进页面、什么时候执行完。load 事件不冒泡，在文档上用捕获阶段听得到。
    // 不依赖资源计时接口：容器里走本地文件时它不一定给数据
    if (window.MutationObserver) {
      new MutationObserver(function (list) {
        var t = now();
        for (var i = 0; i < list.length; i++) for (var j = 0; j < list[i].addedNodes.length; j++) {
          var n = list[i].addedNodes[j], src = n.tagName === "SCRIPT" ? n.src : (n.tagName === "LINK" ? n.href : "");
          if (src && added[src] == null) added[src] = t;
        }
      }).observe(document.documentElement, { childList: true, subtree: true });
    }
    var seen = function (e) {
      var n = e.target, src = n && (n.tagName === "SCRIPT" ? n.src : (n.tagName === "LINK" && n.rel === "stylesheet" ? n.href : ""));
      if (!src || short(src) === "diag.js") return; // 自己不算
      var t = now(), prev = files.length ? files[files.length - 1].at : mark.head;
      // 等待 + 执行：从它进页面（没记到就从上一个文件执行完）到它自己执行完。之后才加载的（别的语言的词包、词形表）另外标出来
      files.push({ name: short(src), at: t, dur: t - (added[src] != null ? added[src] : prev), late: mark.scripts != null, bad: e.type === "error" });
      if (open) render();
    };
    document.addEventListener("load", seen, true);
    document.addEventListener("error", seen, true);

    document.addEventListener("DOMContentLoaded", function () { mark.scripts = now(); build(); settle(); }); // 页面里写着的脚本到这时都执行完了
    window.addEventListener("load", function () { mark.load = now(); settle(); });
    document.addEventListener("visibilitychange", function () { if (document.hidden && mark.usable == null) hiddenEarly = true; });
    if (document.fonts && document.fonts.ready && document.fonts.ready.then) document.fonts.ready.then(function () { mark.fonts = now(); settle(); });

    // 「可用」：入场页的单词框能打字了，或者（有草稿时直接进编辑面）编辑面的字母栏排出来了
    var tries = 0;
    var poll = function () {
      var w = document.getElementById("wordInput"), en = document.getElementById("entry"), p = document.getElementById("pagerLetters");
      if (p && p.children.length) usableAs = "编辑面";
      else if (w && !w.disabled && en && !en.hidden) usableAs = "入场页";
      if (usableAs) { mark.usable = now(); settle(); return; }
      if (++tries < 7500) setTimeout(poll, 16); // 最多等两分钟
    };
    poll();

    var paint = function (name) {
      try { var l = perf.getEntriesByType ? perf.getEntriesByType("paint") : []; for (var i = 0; i < l.length; i++) if (l[i].name === name) return l[i].startTime; } catch (e) { /* 没有这个接口 */ }
      return null;
    };
    var clock = function () { // 页面开始加载时的钟点（时:分:秒.毫秒），对照录屏或另一块表用
      var t = perf.timing && perf.timing.navigationStart ? perf.timing.navigationStart : born, d = new Date(t), m = d.getMilliseconds();
      return two(d.getHours()) + ":" + two(d.getMinutes()) + ":" + two(d.getSeconds()) + "." + (m < 100 ? "0" : "") + (m < 10 ? "0" : "") + m;
    };
    var history = function () { try { var a = JSON.parse(localStorage.getItem(KEY) || "[]"); return Array.isArray(a) ? a : []; } catch (e) { return []; } };
    var keep = function (a) { try { localStorage.setItem(KEY, JSON.stringify(a.slice(0, KEEP))); return true; } catch (e) { return false; } };

    // 这是第几次打开、距上次多久：分得出「第一次扫码」和「关掉再开」
    (function () {
      var h = history(), last = h[0];
      if (last) { run.n = (last.n || 0) + 1; if (last.end) run.gap = Math.round((born - last.end) / 1000); }
    })();

    // 可用和 load 都到了就记一笔；字体晚到再补进同一笔
    function settle() {
      if (mark.usable != null && mark.load != null) {
        var h = history(), fcp = paint("first-contentful-paint");
        var row = { n: run.n, at: clock().slice(0, 8), gap: run.gap, end: Date.now(), as: usableAs, hid: hiddenEarly,
          usable: Math.round(mark.usable), scripts: mark.scripts == null ? null : Math.round(mark.scripts), load: Math.round(mark.load),
          fonts: mark.fonts == null ? null : Math.round(mark.fonts), fcp: fcp == null ? null : Math.round(fcp) };
        if (saved) h[0] = row; else h.unshift(row);
        saved = true; run.stored = keep(h);
      }
      render();
    }

    function el(tag, css, text) { var n = document.createElement(tag); if (css) n.style.cssText = css; if (text != null) n.textContent = text; return n; }
    function build() {
      if (box || !document.body) return;
      // 放在顶栏正下方的左边：屏幕四个角在真机上不是圆角就是手势条，底边还有主按钮和键盘上方的工具栏
      box = el("div", "position:fixed;left:8px;top:56px;max-width:calc(100vw - 16px);font:11px/1.45 Menlo,Consolas,monospace;color:#fff;-webkit-text-size-adjust:100%;");
      box.setAttribute("data-diag", "1");
      box.addEventListener("click", function (e) {
        var a = e.target && e.target.getAttribute && e.target.getAttribute("data-act");
        if (a === "clear") { try { localStorage.removeItem(KEY); } catch (err) { /* 存不了就算了 */ } saved = false; render(); return; }
        if (a === "toggle" || !open) { open = !open; render(); }
      });
      document.body.appendChild(box);
      window.addEventListener("resize", render);
      render();
    }
    function line(k, v) { var r = el("div", "display:flex;justify-content:space-between;"); r.appendChild(el("span", "margin-right:14px;", k)); r.appendChild(el("span", "", v)); return r; }
    function head(t) { return el("div", "margin-top:7px;color:#ffd866;", t); }
    function render() {
      if (!box) return;
      box.textContent = "";
      var bar = document.querySelector(".top"), top = bar ? Math.round(bar.getBoundingClientRect().bottom) : 0;
      if (top < 1) top = 52; // 顶栏还没排出来
      box.style.top = top + 4 + "px";
      box.style.zIndex = open ? "2147483000" : "25"; // 收起时压在全屏页上面、统一提示（30）下面：提示出来时不挡它的字；展开时盖住一切
      if (!open) { // 收起：一个小牌子，点开看全
        box.appendChild(el("div", "padding:5px 9px;background:rgba(0,0,0,0.82);border:1px solid #ffd866;cursor:pointer;", "诊 " + (mark.usable == null ? "…" : ms(mark.usable) + "ms") + " #" + run.n));
        return;
      }
      var p = el("div", "padding:9px 11px;background:#141414;border:1px solid #ffd866;max-height:" + Math.max(120, window.innerHeight - top - 12) + "px;overflow:auto;-webkit-overflow-scrolling:touch;");
      p.appendChild(el("div", "color:#ffd866;font-weight:700;", "诊断包 · 第 " + run.n + " 次打开"));
      p.appendChild(el("div", "", clock() + " 开始加载" + (run.gap == null ? "" : "，距上次 " + run.gap + " 秒")));
      if (hiddenEarly) p.appendChild(el("div", "color:#ff8a80;", "可用之前页面被切到后台过，这一次的数不准"));
      p.appendChild(head("页面内（毫秒，从页面开始加载算起）"));
      p.appendChild(line("读到页面开头", ms(mark.head)));
      p.appendChild(line("首次画出内容", ms(paint("first-contentful-paint"))));
      p.appendChild(line("脚本全部执行完", ms(mark.scripts)));
      p.appendChild(line("可用" + (usableAs ? "（" + usableAs + "）" : ""), ms(mark.usable)));
      p.appendChild(line("页面 load", ms(mark.load)));
      p.appendChild(line("字体就绪", ms(mark.fonts)));
      var first = files.filter(function (f) { return !f.late; }).sort(function (a, b) { return b.dur - a.dur; }).slice(0, 5);
      if (first.length) { p.appendChild(head("最慢的文件（等待 + 执行）")); first.forEach(function (f) { p.appendChild(line(f.name + (f.bad ? " ✕" : ""), ms(f.dur))); }); }
      var late = files.filter(function (f) { return f.late; });
      if (late.length) { p.appendChild(head("之后才加载的（词包、词形表）")); late.forEach(function (f) { p.appendChild(line(f.name + (f.bad ? " ✕" : ""), ms(f.dur) + " @" + ms(f.at))); }); }
      p.appendChild(head("设备"));
      var ua = navigator.userAgent || "", cr = /Chrome\/[\d.]+/.exec(ua) || /AppleWebKit\/[\d.]+/.exec(ua), os = /Android [\d.]+|HarmonyOS[ \d.]*|OS [\d_]+ like Mac OS X/.exec(ua);
      p.appendChild(el("div", "", (cr ? cr[0] : "内核未知") + (os ? " · " + os[0] : "") + " · " + window.innerWidth + "×" + window.innerHeight + " · dpr " + (window.devicePixelRatio || 1)));
      p.appendChild(el("div", "color:#bbb;word-break:break-all;", ua)); // 完整的标识串：容器和内核的版本以它为准
      var h = history();
      if (h.length) {
        p.appendChild(head("最近几次（毫秒）" + (run.stored === false ? " · 这台设备存不了记录" : "")));
        var t = el("table", "border-collapse:collapse;"), tr = el("tr");
        ["#", "时刻", "距上次", "可用", "脚本", "load", "字体", "首画"].forEach(function (c) { tr.appendChild(el("th", "padding:0 9px 0 0;text-align:right;font-weight:400;color:#bbb;", c)); });
        t.appendChild(tr);
        h.forEach(function (r) {
          var row = el("tr", r.hid ? "color:#ff8a80;" : "");
          [r.n, r.at, r.gap == null ? "—" : r.gap + "s", ms(r.usable), ms(r.scripts), ms(r.load), ms(r.fonts), ms(r.fcp)].forEach(function (v) { row.appendChild(el("td", "padding:0 9px 0 0;text-align:right;", String(v))); });
          t.appendChild(row);
        });
        p.appendChild(t);
      }
      var acts = el("div", "margin-top:9px;"), btn = "display:inline-block;margin-right:8px;padding:6px 12px;border:1px solid #fff;background:none;color:#fff;font:inherit;";
      var b1 = el("button", btn, "收起"); b1.type = "button"; b1.setAttribute("data-act", "toggle"); acts.appendChild(b1);
      var b2 = el("button", btn, "清空记录"); b2.type = "button"; b2.setAttribute("data-act", "clear"); acts.appendChild(b2);
      p.appendChild(acts);
      box.appendChild(p);
    }

    // 给本机回归脚本读（scripts/test-diag-browser.mjs）
    window.__backronymDiag = { mark: mark, files: files, run: run, history: history };
  } catch (e) { /* 诊断出错不影响产品 */ }
})();
