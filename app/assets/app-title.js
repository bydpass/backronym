/* 藏头 - Backronym：标题富文本与工具栏。ES2017 经典脚本。 */
(function (app) {
  "use strict";
  app.title = {};
  var CORE = app.model.CORE, state = app.model.state, el = app.model.el;

  // ---------- 标题：Word 式富文本 ----------
  // contenteditable + execCommand 改选中文字的粗细/斜体/颜色；画图时按“计算后样式”拆成若干段，
  // 不依赖 execCommand 生成的具体标签，也不把 HTML 存进草稿（存的是纯数据段，恢复时用 textContent 重建）

  app.title.savedRange = null; // 点工具栏时编辑框会失焦，先记住选区

  // 导出图描述 / 笔记标题的标题文字：写了标题用标题，留空用单词（D17）。有没有标题只看编辑框里的字，没有别的标志位（卡上不再预填默认句）。
  // 笔记标题再经 CORE.noteTitle 截 20 字；两处取标题只有这一套规则
  function titleOrWord() { return CORE.titleOrWord(el.title.textContent, state.letters.join("")); }
  function titleText() { return el.title.textContent.replace(/\s+/g, " ").trim(); }
  function hasTitle() { return titleText() !== ""; }

  function inTitle(node) { return node && (node === el.title || el.title.contains(node)); }

  function rgbToHex(rgb) {
    var m = String(rgb).match(/\d+/g) || [255, 255, 255];
    return "#" + m.slice(0, 3).map(function (v) { return ("0" + Number(v).toString(16)).slice(-2); }).join("");
  }

  // [{t 文字, b 粗体, i 斜体, c 颜色或 null}]，相邻同样式合并
  // 没单独设色的文字 c = null，导出时按色板取墨色（编辑框随系统明暗，不能直接搬编辑框的颜色）；
  // 朱红（浅 / 深两档的朱）存语义值 "red"，导出深色图时自动换成亮朱（D19）；两档的墨色一律当「没单独设色」；其余颜色存十六进制原值
  // （点过「墨」「朱」后切了深浅，编辑框里留着旧档的色值，这样识别后重建才不会黑字压黑底，见 rethemeTitle）
  function titleRuns() {
    var runs = [];
    // 各主题、各深浅档的强调色都认作「朱」（语义值），墨色都认作没单独设色：换了主题或深浅后标题才跟得上
    var reds = [CORE.PALETTE.light.red, CORE.PALETTE.dark.red], inks = [CORE.PALETTE.light.ink, CORE.PALETTE.dark.ink];
    Object.keys(CORE.PALETTES).forEach(function (k) { ["light", "dark"].forEach(function (m) { var q = CORE.PALETTES[k][m]; if (q) { reds.push(q.red); inks.push(q.ink); } }); });
    var base = rgbToHex(getComputedStyle(el.title).color);
    var walker = document.createTreeWalker(el.title, NodeFilter.SHOW_TEXT, null, false);
    for (var n = walker.nextNode(); n; n = walker.nextNode()) {
      var t = n.nodeValue.replace(/\s+/g, " ");
      if (!t) continue;
      var cs = getComputedStyle(n.parentNode);
      var w = cs.fontWeight === "bold" ? 700 : parseInt(cs.fontWeight, 10);
      var hex = rgbToHex(cs.color);
      var r = { t: t, b: w >= 600, i: cs.fontStyle !== "normal", c: hex === base || inks.indexOf(hex) >= 0 ? null : (reds.indexOf(hex) >= 0 ? "red" : hex) };
      var last = runs[runs.length - 1];
      if (last && last.b === r.b && last.i === r.i && last.c === r.c) last.t += t;
      else runs.push(r);
    }
    if (runs.length) {
      runs[0].t = runs[0].t.replace(/^\s+/, "");
      runs[runs.length - 1].t = runs[runs.length - 1].t.replace(/\s+$/, "");
    }
    runs = runs.filter(function (r) { return r.t; });
    return runs; // 留空返回 []，导出时由 CORE.exportTitleRuns 用单词（D17）
  }

  // 标题最多排两行（CARD.TITLE）：再多的字导出时会被「…」省略，所以输入时拒绝「这一次新增」，所见即所得（像 maxlength，按宽度算）。
  // 规则只有一条：绝不删作者已有的字（CORE.titleEditKept）。每次编辑前记一份快照（内容 + 光标），编辑后超了就整体还原到快照并提示；
  // 旧草稿本来就超的标题原样保留，继续输入照样拒绝新增，改格式 / 删字不受影响。输入法组字期间不处理，compositionend 后再判断
  app.title.titleComposing = false;
  app.title.titlePasting = false; // titlePasting：程序自己在改标题（粘贴 / 格式命令）
  app.title.titleSnap = null;
  app.title.noteText = "";
  var noteTimer = 0;

  function titleCut() { return hasTitle() && !!CORE.fitTitle(app.view.measure, titleRuns(), CORE.CARD.CW).cut; }

  // 选区在标题里的字符偏移 [起, 止]；不在标题里返回 null
  function titleOffsets() {
    var sel = window.getSelection();
    if (!sel.rangeCount || !inTitle(sel.anchorNode)) return null;
    var r = sel.getRangeAt(0), pre = document.createRange();
    pre.selectNodeContents(el.title);
    pre.setEnd(r.startContainer, r.startOffset);
    var a = pre.toString().length;
    return [a, a + r.toString().length];
  }

  function setTitleOffsets(off) {
    var total = el.title.textContent.length, a = off ? Math.min(off[0], total) : total, b = off ? Math.min(off[1], total) : total;
    var walker = document.createTreeWalker(el.title, NodeFilter.SHOW_TEXT, null, false), at = 0, range = document.createRange(), sa = false, sb = false;
    range.selectNodeContents(el.title);
    range.collapse(false); // 找不到就落在末尾
    for (var n = walker.nextNode(); n && !(sa && sb); n = walker.nextNode()) {
      var end = at + n.nodeValue.length;
      if (!sa && a <= end) { range.setStart(n, a - at); sa = true; if (!sb && b <= end) { range.setEnd(n, b - at); sb = true; } }
      else if (sa && !sb && b <= end) { range.setEnd(n, b - at); sb = true; }
      at = end;
    }
    if (sa && !sb) range.collapse(true);
    var sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
  }

  function takeTitleSnap() {
    app.title.titleSnap = { html: el.title.innerHTML, sel: titleOffsets(), len: el.title.textContent.length, cut: titleCut() };
  }

  function restoreTitleSnap() {
    el.title.innerHTML = app.title.titleSnap.html;
    el.title.focus();
    setTitleOffsets(app.title.titleSnap.sel);
  }

  // 键盘上方一行里的短暂提示（同时写进状态文字给读屏）
  function titleNotice(msg) {
    app.title.noteText = msg;
    el.live.textContent = msg;
    clearTimeout(noteTimer);
    noteTimer = setTimeout(function () { app.title.noteText = ""; renderKbRow(); }, 2500);
    renderKbRow();
  }

  // 编辑之后调用：超出两行且不该保留 → 还原并提示，返回 true
  // 这次编辑被接受时顺手把它记成下一次的「编辑前」：不依赖 beforeinput（老 WebView 没有它时，不会还原到更早的快照、吞掉中间已接受的字）
  function rejectTitleEdit() {
    if (app.title.titleComposing) return false;
    var cut = titleCut();
    if (!app.title.titleSnap || CORE.titleEditKept(cut, el.title.textContent.length, app.title.titleSnap.len, app.title.titleSnap.cut)) {
      app.title.titleSnap = { html: el.title.innerHTML, sel: titleOffsets(), len: el.title.textContent.length, cut: cut };
      return false;
    }
    restoreTitleSnap();
    titleNotice("标题最多两行");
    app.model.changed();
    return true;
  }

  // 粘贴：只插入放得下的前段，其余丢弃（丢的是刚粘贴的新内容，不是已有的字）并提示
  function pasteTitle(text) {
    takeTitleSnap();
    app.title.titlePasting = true;
    var chars = CORE.textUnits(text);
    var put = function (n) { restoreTitleSnap(); if (n) document.execCommand("insertText", false, chars.slice(0, n).join("")); };
    var n = CORE.pasteFitLength(chars.length, function (k) { put(k); return !titleCut(); });
    put(n);
    app.title.titlePasting = false;
    takeTitleSnap(); // 同 rejectTitleEdit：粘贴结果就是下一次的「编辑前」
    if (n < chars.length) titleNotice("标题最多两行，粘贴内容已截短");
    app.model.changed();
  }

  // 切深浅后把标题按当前色板重建：编辑框里的「朱」「墨」是写死的色值，不随主题变（theme.js 只换 CSS 变量）
  function rethemeTitle() {
    if (hasTitle()) setTitleRuns(titleRuns());
    app.view.renderShell();
    colorNotice(titleRuns().some(function (r) { return /^#[0-9a-f]{6}$/i.test(r.c) && CORE.contrastRatio(r.c, app.view.currentPalette().bg) < 3; }));
    app.draft.saveDraft();
  }

  // 从草稿数据重建，只用 textContent 和 style 属性，不拼 HTML
  function setTitleRuns(runs) {
    el.title.textContent = "";
    runs.forEach(function (r) {
      if (!r || typeof r.t !== "string") return;
      var s = document.createElement("span");
      s.textContent = r.t;
      s.style.fontWeight = r.b ? "700" : "400";
      s.style.fontStyle = r.i ? "italic" : "normal";
      // 自选色原值保留，包括白色；默认墨色使用 null，随主题变化。
      if (r.c === "red") s.style.color = app.view.currentPalette().red;
      else if (/^#[0-9a-f]{6}$/i.test(r.c)) s.style.color = r.c;
      el.title.appendChild(s);
    });
    takeTitleSnap(); // 内容整份换掉了（恢复草稿 / 切深浅），旧快照作废
  }

  // 先应用再提示（只提醒、不拦截）；提示走统一的 Toast（T33），停 3 秒（U1）。颜色够清楚时清掉上一条颜色提醒
  function applyCustomColor() {
    var color = el.tcolorCustom.value;
    formatTitle("foreColor", color);
    colorNotice(CORE.contrastRatio(color, app.view.currentPalette().bg) < 3);
  }

  function colorNotice(weak) {
    var msg = "这个颜色在导出图上容易看不清";
    if (weak) app.model.showToast(msg, 3000);
    else if (el.toast.textContent === msg) app.model.showToast("", 0); // 只清自己的提醒，不吞掉别的消息
  }

  // 有选区用选区，没有就全选，再执行格式命令
  function formatTitle(cmd, value) {
    takeTitleSnap();
    el.title.focus();
    var sel = window.getSelection();
    var range = document.createRange();
    if (app.title.savedRange && !app.title.savedRange.collapsed && inTitle(app.title.savedRange.commonAncestorContainer)) range = app.title.savedRange;
    else range.selectNodeContents(el.title);
    sel.removeAllRanges();
    sel.addRange(range);
    document.execCommand("styleWithCSS", false, true);
    // “默认墨色”= 设成编辑框本身的颜色，titleRuns 会把它认成 null
    if (value === "default") value = getComputedStyle(el.title).color;
    app.title.titlePasting = true; // 程序自己的编辑：execCommand 触发的 beforeinput / input 不再各记快照、各判一次
    document.execCommand(cmd, false, value);
    app.title.titlePasting = false;
    app.title.savedRange = sel.rangeCount ? sel.getRangeAt(0).cloneRange() : null;
    syncTools();
    if (rejectTitleEdit()) return; // 粗体 / 斜体会改字宽，可能把标题挤过两行：这次格式不生效（不删字）
    app.model.changed();
  }

  // 工具栏按钮的按下状态跟随当前选区
  function syncTools() {
    var sel = window.getSelection();
    var here = sel.rangeCount && inTitle(sel.anchorNode);
    ["bold", "italic"].forEach(function (cmd) {
      var b = document.querySelector(".tool[data-cmd='" + cmd + "']");
      var on = here ? document.queryCommandState(cmd) : (cmd === "bold");
      b.setAttribute("aria-pressed", String(!!on));
    });
  }


  // ---- 卡顶：标题框（D18 T16） ----
  // 单图编辑面卡顶只有标题富文本 #title 一个真控件：没字时灰色占位 = 单词（导出时用单词作标题，D17）；键盘上方一行给单词说明，有字时换成标题工具栏。
  // T18 起单词与填表人在入场界面改：标题框不再有「首次」「改单词」两种模式，填表人在卡上只显示（镜像画出来，D3）。
  // 位置、字号取自版式（CORE.CARD）和 layoutCard 排出的标题框；单图编辑面的镜像不画标题（renderDom）。
  app.title.topFocus = ""; // 焦点在卡顶标题框时为 "title"；键盘上方一行据此显示

  // 单图编辑面里标题的几何：layoutCard 已按内容排好（76 / 60 单行 / 60 两行），编辑框照它定字号和行高，让输入时所见 = 导出所得
  function titleGeom(L) {
    var C = CORE.CARD, T = C.TITLE, tb = L.boxes.filter(function (b) { return b.role === "title"; }), size = tb.length ? tb[0].size : T.size;
    var two = tb.some(function (b) { return b.baseline !== tb[0].baseline; });
    return { size: size, lh: two ? T.base2[1] - T.base2[0] : size, base: two ? T.base2[0] : T.base, last: two ? T.base2[1] : T.base };
  }

  function renderTopCtl(L, grid, k, ratio) {
    var C = CORE.CARD, T = C.TITLE, pad = 16, word = state.letters.join("");
    var showTitle = !grid && state.letters.length > 0;
    el.title.hidden = !showTitle;
    if (showTitle) { // 标题框：点按区上下各多 pad，文字位置不变
      var g = titleGeom(L), st = el.title.style;
      st.left = C.M * k + "px";
      st.width = C.CW * k + 4 + "px"; // 比版式宽多一点，免得字宽差一两个像素就多折一行
      st.top = (g.base - ratio * g.size - (g.lh - g.size) / 2 - pad) * k + "px";
      st.minHeight = (g.lh + 2 * pad) * k + "px";
      st.paddingTop = st.paddingBottom = pad * k + "px";
      st.fontSize = g.size * k + "px";
      st.lineHeight = g.lh * k + "px";
      st.letterSpacing = T.track * k + "px";
      if (state.retitle && hasTitle()) state.retitle = false; // 填了标题：不再提醒
      el.title.setAttribute("data-ph", state.retitle ? "重新起一个标题" : word); // 换语言清掉标题后提醒重新起；留空导出仍用单词本身
      el.title.classList.toggle("empty", !hasTitle());
      el.title.setAttribute("data-role", "ctl-title"); // scripts/check-dom-layout.js 校验用
      el.title.setAttribute("data-x", String(C.M));
      el.title.setAttribute("data-baseline", String(g.last)); // 末行基线：check-dom-layout 的探针放在内容末尾
      el.title.setAttribute("data-size", String(g.size));
    } else {
      ["data-role", "data-x", "data-baseline", "data-size"].forEach(function (a) { el.title.removeAttribute(a); });
    }
  }


  // 键盘上方一行（D18 / 母版 §3-①④）：焦点在标题框时出现。标题没字：「单词 LIFE · 标题留空 …」；有字：标题工具栏；标题超长等提示时显示提示
  function kbMode() {
    if (app.title.topFocus === "title") return app.title.noteText ? "note" : "tools"; // T49：标题空着也直接给工具栏（卡上灰色占位已显示留空时用的单词）
    return "";
  }

  function renderKbRow() {
    var mode = kbMode();
    el.kbRow.hidden = !mode;
    if (mode) {
      el.kbText.textContent = "";
      if (mode === "note") el.kbText.textContent = app.title.noteText;
      el.kbText.hidden = mode === "tools";
      el.kbTools.hidden = mode !== "tools";
      el.kbNote.hidden = true;
    }
    placeKbRow();
  }

  // 贴在可视区底边：Android 弹键盘时布局视口会缩小（底边 0 就在键盘上方）；iOS 不缩，要按 visualViewport 算出键盘高度。
  // ponytail: 假设 F（T21 真机）——量不到 visualViewport 就贴底边 0
  // T08：这一行连同它下面的软键盘（iOS 不缩布局视口，b = 键盘高度）都盖在页面底部之上——给页面底部留出等高空白，滚到底能完整看到草稿状态行。
  // 软键盘高度变化时 visualViewport 的 resize / scroll 会再调这里，留白跟着变
  function placeKbRow() {
    if (el.kbRow.hidden) { el.app.style.paddingBottom = ""; return; }
    var vv = window.visualViewport, b = vv ? Math.max(0, window.innerHeight - vv.height - vv.offsetTop) : 0;
    el.kbRow.style.bottom = b + "px";
    el.app.style.paddingBottom = "calc(40px + " + (el.kbRow.offsetHeight + b) + "px)"; // 40px = .app 原有的底部留白
  }


  // 跨模块接口；其余函数与缓存保留在本文件闭包中。
  Object.assign(app.title, {
    titleText: titleText,
    hasTitle: hasTitle,
    titleRuns: titleRuns,
    setTitleRuns: setTitleRuns,
    renderKbRow: renderKbRow,
    renderTopCtl: renderTopCtl,
    titleOrWord: titleOrWord,
    rejectTitleEdit: rejectTitleEdit,
    takeTitleSnap: takeTitleSnap,
    pasteTitle: pasteTitle,
    inTitle: inTitle,
    syncTools: syncTools,
    formatTitle: formatTitle,
    applyCustomColor: applyCustomColor,
    rethemeTitle: rethemeTitle,
    placeKbRow: placeKbRow
  });
})(window.Backronym);
