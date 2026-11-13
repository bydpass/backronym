/* T03 真机试验脚本。经典脚本，ES2017，容器 CSP 下可运行（不内联、不 eval）。 */
(function () {
  "use strict";
  var $ = function (id) { return document.getElementById(id); };
  var t0 = Date.now();
  var lines = [];
  var vv = window.visualViewport || null;

  // ---------- 日志 + 黑条 ----------
  function vvText() {
    var w = document.documentElement.clientWidth;
    if (!vv) return "vv:无 inner=" + window.innerWidth + "x" + window.innerHeight + " cw=" + w;
    return "vv.scale=" + vv.scale.toFixed(2) + " w=" + Math.round(vv.width) + " h=" + Math.round(vv.height) +
      " top=" + Math.round(vv.offsetTop) + " | inner=" + window.innerWidth + "x" + window.innerHeight + " cw=" + w +
      " sy=" + Math.round(window.pageYOffset);
  }
  function log(msg) {
    var s = "[" + ((Date.now() - t0) / 1000).toFixed(1) + "s] " + msg;
    lines.push(s);
    if (lines.length > 80) lines.shift();
    $("log").textContent = lines.slice().reverse().join("\n");
    $("bar2").textContent = s;
  }
  function bar() { $("bar1").textContent = vvText(); }
  bar();
  if (vv) { vv.addEventListener("resize", bar); vv.addEventListener("scroll", bar); }
  window.addEventListener("resize", bar);
  window.addEventListener("scroll", bar);

  // ---------- 一个可编辑字段 ----------
  // kind: input | textarea | ce ；mode: direct | scaled | retreat ；size：1080 坐标系字号；hu：1080 坐标系高度
  var CARD_W = 1000;                       // 卡内字段宽（1080 坐标系，左右各留 40）
  var cardPx = Math.min(document.documentElement.clientWidth, 560) - 32;
  var K = cardPx / 1080;
  var current = null;                      // 正在组字 / 聚焦的控件标签

  function setBox(el, x, y, w, h) {
    el.style.left = x + "px"; el.style.top = y + "px"; el.style.width = w + "px"; el.style.height = h + "px";
  }

  function field(host, label, kind, mode, size, hu, y, init, cap) {
    var f = document.createElement("div");
    f.className = "fld";
    var inner = document.createElement("div");
    inner.className = "in";
    var fs, w, h, u = mode === "scaled" ? 1 : K;
    if (mode === "retreat") {
      var S = size * K, f16 = 16 / S;                  // 目标像素字号 S → 控件内用 16px，再缩回去
      fs = 16; w = CARD_W * K * f16; h = hu * K * f16;
      inner.style.webkitTransform = inner.style.transform = "scale(" + (1 / f16) + ")";
    } else { fs = size * u; w = CARD_W * u; h = hu * u; }
    setBox(f, 40 * u, y * u, CARD_W * u, hu * u);
    setBox(inner, 0, 0, w, h);
    inner.style.fontSize = fs + "px";
    inner.style.fontFamily = "sans-serif";
    inner.style.lineHeight = kind === "textarea" ? "1.4" : h + "px";
    f.appendChild(inner);

    var ctl, mir = null;
    if (kind === "ce") {
      ctl = document.createElement("div");
      ctl.className = "ce"; ctl.contentEditable = "true"; ctl.textContent = init;
      inner.appendChild(ctl);
    } else {
      mir = document.createElement("div");
      mir.className = "mir" + (kind === "textarea" ? " wrap" : "");
      ctl = document.createElement(kind === "textarea" ? "textarea" : "input");
      ctl.className = "ctl"; ctl.value = init;
      if (kind === "input") ctl.type = "text";
      ctl.setAttribute("autocomplete", "off"); ctl.setAttribute("autocorrect", "off");
      ctl.setAttribute("spellcheck", "false");
      inner.appendChild(mir); inner.appendChild(ctl);
    }
    var c = document.createElement("span");
    c.className = "cap"; c.style.fontSize = 9 / u + "px"; c.textContent = label + " " + (Math.round(fs * 10) / 10) + "px" + (mode === "retreat" ? "→" + (Math.round(size * K * 10) / 10) : "");
    f.appendChild(c);
    host.appendChild(f);

    function paint() {
      if (!mir) return;
      var v = ctl.value;
      mir.textContent = "";
      if (cap && v) {
        var b = document.createElement("b");
        b.textContent = v.charAt(0);
        mir.appendChild(b); mir.appendChild(document.createTextNode(v.slice(1)));
      } else mir.textContent = v;
      if (kind === "textarea") mir.scrollTop = ctl.scrollTop;
    }
    paint();
    wire(ctl, label, kind, cap, paint);
    return f;
  }

  // ---------- 事件日志 / 聚焦观察 / 重写 ----------
  function selText(ctl, kind) {
    if (kind === "ce") {
      var s = window.getSelection();
      return s && s.rangeCount ? "anchor=" + s.anchorOffset + " focus=" + s.focusOffset : "无选区";
    }
    return ctl.selectionStart + "-" + ctl.selectionEnd;
  }
  function inView(el) {
    var r = el.getBoundingClientRect();
    var top = vv ? vv.offsetTop : 0, hh = vv ? vv.height : window.innerHeight;
    return r.top >= top - 1 && r.bottom <= top + hh + 1;
  }

  function wire(ctl, label, kind, cap, paint) {
    var composing = false, lastSel = "";
    function rewrite(why) {
      if (kind === "ce" || !$("rewrite").checked) return;
      var v = ctl.value, nv = cap ? v.charAt(0).toUpperCase() + v.slice(1) : v;
      var s = ctl.selectionStart, e = ctl.selectionEnd;
      ctl.value = nv;                                   // 就算内容没变也重写一次，这正是要试的
      var s2 = ctl.selectionStart + "-" + ctl.selectionEnd;
      ctl.setSelectionRange(s, e);
      log(label + " 重写(" + why + ") 选区 " + s + "-" + e + " → 赋值后 " + s2 + " → 恢复后 " + ctl.selectionStart + "-" + ctl.selectionEnd);
    }
    ctl.addEventListener("focus", function () {
      current = label;
      log(label + " focus " + vvText());
      var tries = [400, 1000];
      tries.forEach(function (ms) {
        setTimeout(function () {
          if (document.activeElement !== ctl) return;
          log(label + " focus+" + ms + "ms " + vvText() + " 控件在可视区内=" + inView(ctl) +
            (vv && vv.scale > 1.01 ? " ★页面被放大" : ""));
        }, ms);
      });
    });
    ctl.addEventListener("blur", function () {
      log(label + " blur " + vvText() + (vv && vv.scale > 1.01 ? " ★仍处于放大" : ""));
    });
    ctl.addEventListener("compositionstart", function () { composing = true; log(label + " compositionstart"); });
    ctl.addEventListener("compositionupdate", function (e) { log(label + " compositionupdate '" + e.data + "'"); });
    ctl.addEventListener("compositionend", function (e) {
      composing = false;
      log(label + " compositionend '" + e.data + "' 选区 " + selText(ctl, kind));
      rewrite("compositionend");
      paint();
    });
    ctl.addEventListener("input", function (e) {
      log(label + " input " + (e.inputType || "") + " isComposing=" + (e.isComposing === undefined ? "?" : e.isComposing) +
        " 自记composing=" + composing + " 值长=" + (kind === "ce" ? ctl.textContent.length : ctl.value.length));
      if (!composing) rewrite("input");
      paint();
    });
    ctl.addEventListener("scroll", paint);
    document.addEventListener("selectionchange", function () {
      if (document.activeElement !== ctl) return;
      var s = selText(ctl, kind);
      if (s !== lastSel) { lastSel = s; log(label + " 选区 " + s); }
    });
  }

  // ---------- 三张卡 ----------
  function fillCard(host, mode, tagEl) {
    var u = mode === "scaled" ? 1 : K, prefix = mode === "direct" ? "一" : mode === "scaled" ? "二" : "三";
    var H = 540;                                       // 1080 坐标系卡高
    var box = host;
    if (mode === "scaled") {
      host.style.width = cardPx + "px"; host.style.height = H * K + "px";
      box = document.createElement("div");
      box.className = "box";
      box.style.width = "1080px"; box.style.height = H + "px";
      box.style.webkitTransformOrigin = box.style.transformOrigin = "0 0";
      box.style.webkitTransform = box.style.transform = "scale(" + K + ")";
      host.appendChild(box);
    } else { host.style.width = cardPx + "px"; host.style.height = H * K + "px"; }
    tagEl.textContent = "卡宽 " + Math.round(cardPx) + "px，k = " + K.toFixed(4) +
      "；词 " + (96 * K).toFixed(1) + "px，释义 " + (44 * K).toFixed(1) + "px，配文 " + (36 * K).toFixed(1) + "px，标题 " + (40 * K).toFixed(1) + "px";
    field(box, prefix + "词", "input", mode, 96, 130, 40, "life", true);
    field(box, prefix + "释", "input", mode, 44, 64, 190, "活的，逼真的", false);
    field(box, prefix + "配", "textarea", mode, 36, 101, 274, "她看人从不绕弯，说话很少，但句句都算数，一旦答应的事就一定做到，从来不食言", false);
    field(box, prefix + "标", "ce", mode, 40, 64, 395, "总之 这里有四种情况", false);
    field(box, prefix + "底", "input", mode, 30, 50, 470, "tail 30px 下限测试", false);
  }
  fillCard($("card1"), "direct", $("tag1"));
  fillCard($("card2"), "scaled", $("tag2"));
  fillCard($("card3"), "retreat", $("tag3"));

  // ---------- 环境 / 字体缩放 / 深浅色 ----------
  var mq = window.matchMedia ? window.matchMedia("(prefers-color-scheme: dark)") : null;
  function textZoom(style) {
    var sample = "MMMMMMMMMMWWWWWWWWWW活的，逼真的";
    var s = document.createElement("span");
    s.textContent = sample;
    s.style.cssText = "font:100px sans-serif;" + style;
    $("probes").appendChild(s);
    var domW = s.getBoundingClientRect().width, fsz = getComputedStyle(s).fontSize;
    $("probes").removeChild(s);
    var cv = document.createElement("canvas").getContext("2d");
    cv.font = "100px sans-serif";
    var cw = cv.measureText(sample).width;
    return "DOM " + domW.toFixed(1) + " / Canvas " + cw.toFixed(1) + " = " + (domW / cw).toFixed(3) + "（computed " + fsz + "）";
  }
  function env() {
    $("env").textContent = [
      "UA: " + navigator.userAgent,
      "devicePixelRatio: " + window.devicePixelRatio,
      "屏宽 innerWidth × innerHeight: " + window.innerWidth + " × " + window.innerHeight + "；卡宽 " + Math.round(cardPx) + "px，k=" + K.toFixed(4),
      "深色 prefers-color-scheme: dark = " + !!(mq && mq.matches) + "（matchMedia " + (mq ? "可用" : "不可用") + "）",
      "visualViewport: " + !!vv + "，PointerEvent: " + !!window.PointerEvent + "，caret-color: " +
        (window.CSS && CSS.supports ? CSS.supports("caret-color", "red") : "未知") + "，touch-action: pan-y: " +
        (window.CSS && CSS.supports ? CSS.supports("touch-action", "pan-y") : "未知"),
      "文字缩放比（text-size-adjust:100%，页面默认）: " + textZoom("-webkit-text-size-adjust:100%;text-size-adjust:100%;"),
      "文字缩放比（text-size-adjust:auto）: " + textZoom("-webkit-text-size-adjust:auto;text-size-adjust:auto;"),
      "  （默认字体下也可能不是 1.000（DOM 与 Canvas 的英文回退字体可能不同，桌面 Chrome 实测 1.015）；先记默认字体下的值，调大系统字体后重开本页明显变大，才说明 DOM 字被放大而 Canvas 没有）"
    ].join("\n");
  }
  env();
  $("remeasure").addEventListener("click", env);
  if (mq) {
    var onMq = function () { log("深浅色变化: dark=" + mq.matches); env(); };
    if (mq.addEventListener) mq.addEventListener("change", onMq); else if (mq.addListener) mq.addListener(onMq);
  }

  // ---------- 横滑区 ----------
  (function () {
    var track = $("track"), idx = 0, st = $("swst");
    var n = { start: 0, move: 0, end: 0, cancel: 0 };
    var x0 = 0, y0 = 0, dx = 0, dy = 0, dir = "", on = false, from = "";
    var passive = false;
    try {
      var o = Object.defineProperty({}, "passive", { get: function () { passive = true; } });
      window.addEventListener("t", null, o);
    } catch (e) {}
    for (var i = 0; i < 3; i++) {
      var p = document.createElement("div");
      p.className = "pane";
      p.innerHTML = "<b>第 " + (i + 1) + " 页</b><input type=\"text\" value=\"页内输入框，长按拖选试试\" /><textarea rows=\"2\">页内文本框</textarea>";
      track.appendChild(p);
    }
    Array.prototype.forEach.call(track.querySelectorAll("input,textarea"), function (c, j) { wire(c, "S" + (j + 1), c.tagName === "INPUT" ? "input" : "textarea", false, function () {}); });
    function show() {
      st.textContent = "touchstart " + n.start + " / move " + n.move + " / end " + n.end + " / cancel " + n.cancel +
        "｜页 " + (idx + 1) + "/3｜dx=" + Math.round(dx) + " dy=" + Math.round(dy) + " 方向=" + (dir || "-") + "｜起点=" + from;
    }
    function put(extra) {
      var tx = -idx * (track.parentNode.clientWidth) + (extra || 0);
      track.style.webkitTransform = track.style.transform = "translateX(" + tx + "px)";
    }
    function down(x, y, target) {
      n.start++; on = true; x0 = x; y0 = y; dx = dy = 0; dir = "";
      from = target.tagName.toLowerCase() + (x < 20 ? "（左边缘）" : "");
      track.style.webkitTransition = track.style.transition = "none";
      log("swipe touchstart x=" + Math.round(x) + " y=" + Math.round(y) + " 起点=" + from);
      show();
    }
    function move(x, y, ev) {
      if (!on) return;
      n.move++; dx = x - x0; dy = y - y0;
      if (!dir && (Math.abs(dx) > 8 || Math.abs(dy) > 8)) {
        dir = Math.abs(dx) > Math.abs(dy) ? "横" : "竖";
        log("swipe 判定方向=" + dir + " dx=" + Math.round(dx) + " dy=" + Math.round(dy));
      }
      if (dir === "横") {
        put(dx);
        if (ev && ev.cancelable && $("pd").checked) ev.preventDefault();
      }
      show();
    }
    function up(kind) {
      if (!on) return;
      on = false;
      if (kind === "cancel") { n.cancel++; log("swipe ★touchcancel dx=" + Math.round(dx) + " dy=" + Math.round(dy) + "（被系统 / 容器接走？）"); }
      else { n.end++; log("swipe touchend dx=" + Math.round(dx) + " dy=" + Math.round(dy) + " 方向=" + (dir || "-")); }
      if (dir === "横" && Math.abs(dx) > 50 && kind !== "cancel") idx = Math.max(0, Math.min(2, idx + (dx < 0 ? 1 : -1)));
      track.style.webkitTransition = track.style.transition = "";
      put(0); show();
    }
    var sw = $("sw");
    if ("ontouchstart" in window) {
      sw.addEventListener("touchstart", function (e) { var t = e.touches[0]; down(t.clientX, t.clientY, e.target); }, passive ? { passive: true } : false);
      sw.addEventListener("touchmove", function (e) { var t = e.touches[0]; move(t.clientX, t.clientY, e); }, passive ? { passive: false } : false);
      sw.addEventListener("touchend", function () { up("end"); });
      sw.addEventListener("touchcancel", function () { up("cancel"); });
    } else {                                           // 电脑浏览器用鼠标顶一下，方便自测
      sw.addEventListener("mousedown", function (e) { if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA") return; down(e.clientX, e.clientY, e.target); });
      document.addEventListener("mousemove", function (e) { move(e.clientX, e.clientY, e); });
      document.addEventListener("mouseup", function () { up("end"); });
    }
    window.addEventListener("resize", function () { put(0); });
    $("swclr").addEventListener("click", function () { n.start = n.move = n.end = n.cancel = 0; dx = dy = 0; dir = ""; from = ""; show(); });
    put(0); show();
  })();

  // ---------- 记录区 ----------
  var ITEMS = [
    ["A", "光标 / 选区 / 候选条位置：方式一正常、方式二是否错位", "方式一 vs 方式二，每个框点一下、拼音输入、长按选字"],
    ["B", "iOS 聚焦字号 < 16px 是否放大页面；方式三是否避免", "iOS：看黑条 vv.scale 与日志「★页面被放大」"],
    ["C", "透明文字 + caret-color：光标可见、可选中", "三张卡的输入框与文本框"],
    ["D", "Android 系统大字体：DOM 字被放大而 Canvas 不放大", "「1 环境」文字缩放比；卡内字是否比镜像大"],
    ["E", "中文输入法 compositionstart/end 正常；重写 + setSelectionRange 不打断", "勾「重写」，日志里 composition 事件是否成对、光标是否跳"],
    ["F", "（早期读数）键盘弹起后控件是否在可视区内", "日志 focus+400ms 的「控件在可视区内」"],
    ["J", "pan-y 横滑能收到、不被容器手势吞掉，与输入互不干扰", "「5 横滑区」touchcancel 计数、边缘侧滑、框内拖选"],
    ["L", "prefers-color-scheme 跟随系统深浅", "「1 环境」深色一行；系统切深色后日志「深浅色变化」"]
  ];
  var rec = $("rec"), picks = [];
  ITEMS.forEach(function (it) {
    var tr = document.createElement("tr");
    var td = document.createElement("td");
    td.innerHTML = "<b>假设 " + it[0] + "</b><br>" + it[1] + "<br><span class=\"dim\">看：" + it[2] + "</span>";
    var td2 = document.createElement("td");
    var sel = document.createElement("select");
    ["未测", "通过", "不通过", "不确定"].forEach(function (t) { var o = document.createElement("option"); o.textContent = t; sel.appendChild(o); });
    var note = document.createElement("input");
    note.type = "text"; note.placeholder = "一句话（现象 / 机型 / 方式几）";
    td2.appendChild(sel); td2.appendChild(note);
    tr.appendChild(td); tr.appendChild(td2); rec.appendChild(tr);
    picks.push({ k: it[0], sel: sel, note: note });
  });
  $("mk").addEventListener("click", function () {
    var out = ["UA: " + navigator.userAgent, "dpr " + window.devicePixelRatio + "，屏宽 " + window.innerWidth + "，dark=" + !!(mq && mq.matches), vvText(), ""];
    picks.forEach(function (p) { out.push("假设" + p.k + "：" + p.sel.value + (p.note.value ? " — " + p.note.value : "")); });
    out.push("", "—— 最近日志 ——");
    $("out").value = out.concat(lines.slice(-30)).join("\n");
  });
  $("clr").addEventListener("click", function () { lines = []; $("log").textContent = ""; $("bar2").textContent = "日志已清空"; });

  log("页面就绪 k=" + K.toFixed(4) + " " + vvText());
})();
