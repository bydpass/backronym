/* 藏头 - Backronym：绘制、测量、DOM 卡与外壳。ES2017 经典脚本。 */
(function (app) {
  "use strict";
  app.view = {};
  var CORE = app.model.CORE, state = app.model.state, el = app.model.el, capitalize = app.model.capitalize;

  // ---------- 画图 ----------

  function newCanvas(W, H, palette) {
    var canvas = document.createElement("canvas");
    canvas.width = W;
    canvas.height = H;
    var ctx = canvas.getContext("2d");
    ctx.fillStyle = palette.bg;
    ctx.fillRect(0, 0, W, H);
    ctx.textBaseline = "alphabetic";
    return { canvas: canvas, ctx: ctx };
  }

  // 列阵视图：图版阵列；坐标全在 CORE.layoutGrid（D14），这里只按框画
  function drawGrid(palette, sheet) { // T42：sheet = [起, 止)，超过 10 格时每张单独导出
    var L = CORE.layoutGrid(layoutData(0), measure, sheet);
    var cv = newCanvas(L.W, L.H, palette);
    paintBoxes(cv.ctx, L, palette);
    return cv.canvas;
  }

  // 单图视图：1080×1440，信息栏 - 墨线 - 标题 - 图版 - 单词 - 墨条 - 释义 - 配文；坐标全在 CORE.layoutCard（D14）
  function drawCard(i, palette) {
    var L = CORE.layoutCard(layoutData(i), measure);
    var cv = newCanvas(L.W, L.H, palette);
    paintBoxes(cv.ctx, L, palette);
    return cv.canvas;
  }

  // 版式的输入：只放纯数据，版式函数不碰 state / DOM
  function layoutData(i, edit) {
    return {
      edit: !!edit, // 编辑面：空释义 / 空配文画灰色占位（CORE.layoutCard）；导出不传
      letters: state.letters, i: i, picks: state.picks, glosses: state.glosses, captions: state.captions,
      // 标题框没字 = 留空，导出时用单词（D17）
      titleRuns: app.title.hasTitle() ? app.title.titleRuns() : [], word: state.letters.join(""),
      filler: state.filler, hasImage: function (k) { return !!app.model.cellImage(k); },
      articles: state.letters.map(function (l, k) { return app.model.articleText(k); }), hyph: app.model.hyphOf, // v00.03.00：冠词块与长词折行
    };
  }

  // 给读屏用的图片描述
  function caseText(i) {
    var g = (state.glosses[i] || "").trim();
    var c = state.view === "single" ? (state.captions[i] || "").trim() : "";
    var a = app.model.articleText(i);
    return (a ? a + (/[\u2019']$/.test(a) ? "" : " ") : "") + capitalize(state.picks[i][0]) + (g ? "（" + g + "）" : "") + (c ? "，配文：" + c : "");
  }

  // canvas 不会等 @font-face 下载，画之前必须先把要用的字体加载好，否则第一次生成会用系统字体
  function ensureFonts() {
    if (!document.fonts || !document.fonts.load) return Promise.resolve();
    var faces = ["400 20px \"Noto Sans\"", "700 20px \"Noto Sans\"", "400 20px \"Noto Sans SC\"", "700 20px \"Noto Sans SC\""];
    // 当前主题的字体也要到位（卡和导出图跟主题走）
    var sf = window.THEME && window.THEME.skin ? CORE.SKIN_FONTS[window.THEME.skin()] : null;
    if (sf) [sf.latin, sf.cjk].forEach(function (n) { if (n) faces.push("400 20px \"" + n + "\"", "700 20px \"" + n + "\""); });
    return app.draft.within(Promise.all(faces.map(function (f) { return document.fonts.load(f, "Aa字"); })), 3000).catch(function () {});
  }


  // 按当前主题换字体串：卡（DOM）与导出共用。先用新字体串画一遍（字体没到时是兜底字体），字体到位后作废基线实测、再画一遍
  function applySkinFont() {
    CORE.useSkinFont(window.THEME && window.THEME.skin ? window.THEME.skin() : "");
    el.card.style.fontFamily = CORE.FONT;
    app.view.baseRatio = null;
    return ensureFonts().then(function () { app.view.baseRatio = null; renderShell(); });
  }

  // ---------- 版式测量、导出画法、DOM 卡、外壳 ----------

  // 版式测量：离屏 canvas 的 measureText，注入 CORE.layoutCard / layoutGrid（D5）
  var measureCtx = null;
  function measure(font, text) {
    if (!measureCtx) measureCtx = document.createElement("canvas").getContext("2d");
    measureCtx.font = font;
    return measureCtx.measureText(text).width;
  }

  // 按版式框画到 ctx：导出唯一的画法，不再自己量字。palette 里没有的颜色名当十六进制用（标题自选色）
  function paintBoxes(ctx, layout, palette) {
    var col = function (c) { return palette[c] || c; };
    layout.boxes.forEach(function (b) {
      if (b.role === "plate" || b.role === "bar" || b.role === "rule" || b.role === "ul") {
        ctx.fillStyle = col(b.color);
        ctx.fillRect(b.x, b.y, b.w, b.h);
      } else if (b.role === "image") {
        app.media.drawCover(ctx, app.model.cellImage(b.i), b.x, b.y, b.w, b.h, state.crops[b.i]);
      } else {
        ctx.font = CORE.fontOf(b.weight, b.size, b.italic);
        ctx.save();
        if (b.clip) { ctx.beginPath(); ctx.rect(b.clip[0], b.clip[1], b.clip[2], b.clip[3]); ctx.clip(); }
        if (!b.track && !(b.keyAt >= 0)) {
          ctx.fillStyle = col(b.color);
          ctx.textAlign = b.align || "left";
          ctx.fillText(b.text, b.x, b.baseline);
        } else {
          // 字距 / 关键字母：逐字画（Chrome 61 的 canvas 没有 letterSpacing）。第 j 个字的 x 见 core.js 版式段注释
          var font = ctx.font, track = b.track || 0, chars = CORE.textUnits(b.text);
          ctx.textAlign = "left";
          for (var j = 0; j < chars.length; j++) {
            ctx.fillStyle = col(j === b.keyAt ? "red" : b.color);
            ctx.fillText(chars[j], b.x + CORE.charX(measure, font, b.text, j, track), b.baseline);
          }
        }
        ctx.restore();
      }
    });
  }

  // 导出用哪套色板（D19）：点「完成」时取一次，整批同一套
  function currentPalette() {
    // 卡和导出图跟主题走（2026-11-12）：当前主题、当前深浅对应的那一套；没有主题脚本时落回石白 / 墨
    if (window.THEME && window.THEME.skin) return CORE.paletteOf(window.THEME.skin(), window.THEME.isDark());
    return window.THEME && window.THEME.isDark() ? CORE.PALETTE.dark : CORE.PALETTE.light;
  }

  // ---- DOM 卡（D4 / D5，T09） ----
  // 只读：把 CORE.layoutCard / layoutGrid 的框原样摆成 DOM。位置、字号、字距都是 CORE.domBox 算好的数值，这里不排版。
  app.view.baseRatio = null; // 基线距行顶 / 字号（line-height: 1），字体到位后重量一次

  // k = 卡显示宽 / 版式宽（单图 1080，列阵 W）。
  // ponytail: 按 D5 默认「直接按屏宽算尺寸」。T03 真机结果出来后若需要 iOS 聚焦放大的退路（聚焦控件 16px + 局部 scale）或整张卡改 transform: scale(k)，
  // 只改这里和 renderDom 里写样式的地方，版式数值不受影响。列阵只预览，若 Android WebView 的最小字号（默认 8px）把格内小字撑大，列阵可单独改 transform
  function cardScale(cardWidthPx, layoutWidth) {
    return cardWidthPx / layoutWidth;
  }

  // 实测「基线距行顶 / 字号」：line-height: 1 的一行里放一个零尺寸 inline-block（vertical-align: baseline），它的底边就是基线。
  // 不硬编码字体度量；回退字体下量出的值会在字体到位后作废重量（init 里 baseRatio = null）
  function probeBaseline() {
    if (app.view.baseRatio !== null) return app.view.baseRatio;
    var box = document.createElement("div"), mark = document.createElement("span");
    box.style.cssText = "position:absolute;left:-9999px;top:0;visibility:hidden;white-space:pre;font:700 200px " + CORE.FONT + ";line-height:1"; // font 简写会把 line-height 重置为 normal，必须写在它前面
    box.textContent = "Hg字";
    mark.style.cssText = "display:inline-block;width:0;height:0;vertical-align:baseline";
    box.appendChild(mark);
    document.body.appendChild(box);
    app.view.baseRatio = (mark.getBoundingClientRect().bottom - box.getBoundingClientRect().top) / 200;
    document.body.removeChild(box);
    return app.view.baseRatio;
  }

  // 清空镜像层之前先把图版小画布归零，低端机不等垃圾回收。控件层（#ctl）不动：重摆时输入框保住焦点、光标和输入法状态
  // 图版画布按格缓存（第 4 批资源审查）：原图、显示尺寸、dpr、取景都没变时直接复用上次画好的画布，只改配文 / 释义 / 词时照片重画 0 次。
  // 每次重摆后清掉这一轮没用到的（换格、切列阵、移除配图），画布立即释放，不在后台占内存
  var plateCache = {};

  function releaseCard() {
    var keep = [];
    Object.keys(plateCache).forEach(function (i) { keep.push(plateCache[i].c); plateCache[i].used = false; });
    Array.prototype.forEach.call(el.mirror.querySelectorAll("canvas"), function (c) { if (keep.indexOf(c) < 0) c.width = c.height = 0; });
    el.mirror.textContent = "";
  }

  function dropUnusedPlates() {
    Object.keys(plateCache).forEach(function (i) {
      if (plateCache[i].used) return;
      plateCache[i].c.width = plateCache[i].c.height = 0;
      delete plateCache[i];
    });
  }

  // 图版小画布：显示尺寸 × min(dpr, 2)，取景数据与导出同一份（cropRect）
  function imageCanvas(b, d) {
    var img = app.model.cellImage(b.i);
    if (!img) return null;
    var dpr = Math.min(window.devicePixelRatio || 1, 2), crop = state.crops[b.i];
    var key = [d.width, d.height, dpr, b.w, b.h, crop ? crop.z + "," + crop.x + "," + crop.y : ""].join("|"), hit = plateCache[b.i];
    if (hit && hit.img === img && hit.key === key) { hit.used = true; return hit.c; }
    if (hit) hit.c.width = hit.c.height = 0;
    var c = document.createElement("canvas");
    c.width = Math.max(1, Math.round(d.width * dpr));
    c.height = Math.max(1, Math.round(d.height * dpr));
    var ctx = c.getContext("2d"), r = app.media.cropRect(img, b.w, b.h, state.crops[b.i]);
    if ("imageSmoothingQuality" in ctx) ctx.imageSmoothingQuality = "high";
    ctx.drawImage(img, r.sx, r.sy, r.vw, r.vh, 0, 0, c.width, c.height);
    plateCache[b.i] = { img: img, key: key, c: c, used: true };
    return c;
  }

  // 一个版式框 → 一个 DOM 节点（带 clip 的超大字母外面套一层裁切框）。data-* 是 1080（列阵为 W）坐标，scripts/check-dom-layout.js 比对用
  function domNode(b, k, ratio, W) {
    var d = CORE.domBox(b, k, ratio, W), n, st;
    if (b.role === "image") {
      n = imageCanvas(b, d);
      if (!n) return null;
    } else {
      n = document.createElement("div");
    }
    n.className = "b b-" + b.role + (b.invalid ? " invalid" : "");
    st = n.style;
    if (d.kind === "rect") {
      if (b.role !== "image") st.backgroundColor = d.color;
      st.width = d.width + "px";
      st.height = d.height + "px";
      n.setAttribute("data-y", String(b.y));
      n.setAttribute("data-h", String(b.h));
    } else {
      st.fontSize = d.fontSize + "px";
      st.fontWeight = String(d.weight);
      st.fontStyle = d.italic ? "italic" : "normal";
      st.letterSpacing = d.letterSpacing + "px";
      st.color = d.color;
      n.setAttribute("data-size", String(b.size));
      n.setAttribute("data-baseline", String(b.baseline));
      if (b.keyAt >= 0) { // 关键字母朱红
        n.appendChild(document.createTextNode(b.text.slice(0, b.keyAt)));
        var key = document.createElement("span");
        key.className = "key";
        key.textContent = b.text.charAt(b.keyAt);
        n.appendChild(key);
        n.appendChild(document.createTextNode(b.text.slice(b.keyAt + 1)));
      } else {
        n.textContent = b.text;
      }
    }
    if (d.right !== undefined) st.right = d.right + "px"; else st.left = d.left + "px";
    st.top = d.top + "px";
    n.setAttribute("data-role", b.role);
    n.setAttribute("data-x", String(d.lx));
    if (d.lw !== undefined) n.setAttribute("data-w", String(d.lw));
    if (!d.clip) return n;
    var wrap = document.createElement("div");
    wrap.className = "clip";
    wrap.style.left = d.clip.left + "px";
    wrap.style.top = d.clip.top + "px";
    wrap.style.width = d.clip.width + "px";
    wrap.style.height = d.clip.height + "px";
    wrap.appendChild(n);
    return wrap;
  }

  // 摆一张卡：L = layoutCard / layoutGrid 的结果；列阵每格再盖一个透明按钮，点了跳到该字母的单图（D16）
  function renderDom(L, grid) {
    var host = el.card, k = cardScale(host.clientWidth, L.W), ratio = probeBaseline();
    releaseCard();
    host.className = grid ? "card grid" : "card"; // 列阵的卡在母版里比单图低一截（§2-⑤）
    var height = L.H * k;
    if (grid) app.model.sheets().forEach(function (sh) {
      var size = CORE.gridShape(sh[1] - sh[0]);
      height = Math.max(height, size.H * cardScale(host.clientWidth, size.W));
    });
    host.style.height = height + "px";
    host.setAttribute("data-k", String(k));
    var frag = document.createDocumentFragment(), plates = [];
    L.boxes.forEach(function (b) {
      if (!grid && b.role === "title") return; // 单图编辑面：标题是卡顶的真控件（renderTopCtl），镜像不画；填表人只显示（T18 / D3），照画
      var n = domNode(b, k, ratio, L.W);
      if (n) frag.appendChild(n);
      if (grid && b.role === "plate") plates.push(b);
    });
    // 透明按钮最后插，排在该格的字母、配图、单词、释义之上（DOM 顺序即层叠顺序），点格才命中
    plates.forEach(function (b) {
      var hit = document.createElement("button");
      hit.type = "button";
      hit.className = "cell-hit";
      hit.style.left = b.x * k + "px";
      hit.style.top = b.y * k + "px";
      hit.style.width = b.w * k + "px";
      hit.style.height = (CORE.GRID.GLOSS.dbase + 30) * k + "px"; // 图版 + 单词 + 释义
      hit.setAttribute("aria-label", "编辑第 " + (b.i + 1) + " 格 " + state.letters[b.i]);
      hit.addEventListener("click", function () { openSingle(b.i); });
      frag.appendChild(hit);
    });
    el.mirror.appendChild(frag);
    dropUnusedPlates();
    app.editor.renderCtl(L, grid, k, ratio);
  }

  // 单图：只摆第 i 格这一张
  function renderDomCard(i) {
    renderDom(CORE.layoutCard(layoutData(i, true), measure), false);
  }

  // 列阵：整张摆出来，只预览
  function renderDomGrid() { // T42：只摆当前格所在的那一张
    renderDom(CORE.layoutGrid(layoutData(0), measure, app.model.sheets()[app.model.sheetOf(state.focus)]), true);
  }

  // ---- 满版外壳与手势（D16，T10） ----
  app.view.resizeRaf = 0;
  app.view.cardW = 0; // cardW：上次摆卡时的卡显示宽

  function syncViews() {
    el.viewSingle.setAttribute("aria-pressed", String(state.view === "single"));
    el.viewGrid.setAttribute("aria-pressed", String(state.view === "grid"));
    el.viewGrid.disabled = !state.letters.length; // 没有单词时列阵没有可预览的，也没有输入入口（单词输入在单图里），先置灰
  }

  function setView(v) {
    if (state.view === v || (v === "grid" && !state.letters.length)) return;
    state.view = v;
    syncViews();
    app.model.changed();
    app.model.rebaseHeight(); // T28：换了视图，旧的锁高不再有效
  }

  // 列阵里点某格：回到单图并停在该格
  function openSingle(i) {
    state.view = "single";
    state.focus = i;
    syncViews();
    app.model.changed();
    app.model.rebaseHeight();
    window.scrollTo(0, 0);
  }

  // 卡下字母栏 + 页码 + 提示行；列阵时只留提示行
  function renderPager() {
    var n = state.letters.length, grid = state.view === "grid" && n > 0, cur = Math.min(state.focus, Math.max(0, n - 1));
    el.pagerLetters.textContent = "";
    var sh = app.model.sheets(), split = n > 0 && sh.length > 1, two = function (k) { return (k < 10 ? "0" : "") + k; };
    el.pagerLetters.classList.toggle("tight", n > 8);
    el.pagerLetters.classList.toggle("rows", split); // T42：超过 10 格按分图分两行，行末标起止格（320 宽单行放不下 14 个 24px 点按区）
    el.pager.hidden = grid || !n;
    // T42：列阵分图时的页签（换张入口，横滑也可以）
    el.sheetTabs.textContent = "";
    el.sheetTabs.hidden = !(grid && split);
    if (grid && split) {
      var on = app.model.sheetOf(state.focus);
      sh.forEach(function (r, k) {
        var t = app.model.make("button", "sheet-tab", two(r[0] + 1) + "–" + two(r[1]) + " 第 " + (k + 1) + " 张");
        t.type = "button"; t.id = "sheet-" + k;
        t.setAttribute("role", "tab"); t.setAttribute("aria-selected", String(k === on));
        t.addEventListener("click", function () { // 换张：停在那一张的第一格；焦点交给重画后的同一个页签（不走 focusId：它会把列阵切回单图）
          app.model.setFocus(r[0]);
          var again = document.getElementById("sheet-" + k);
          if (again) again.focus();
        });
        el.sheetTabs.appendChild(t);
      });
    }
    var row = null;
    state.letters.forEach(function (letter, i) {
      if (split && sh.some(function (r) { return r[0] === i; })) { row = app.model.make("span", "pl-row"); el.pagerLetters.appendChild(row); }
      var st = app.model.cellState(i), b = app.model.make("button", "pl" + (st === "ok" ? "" : " todo") + (i === cur ? " on" : ""));
      b.appendChild(app.model.make("span", null, letter));
      b.type = "button";
      b.id = "pl-" + i;
      b.setAttribute("aria-label", "第 " + (i + 1) + " 格 " + letter + "，" + (st === "ok" ? "已选 " + capitalize(state.picks[i][0]) : st === "bad" ? "词不是以 " + CORE.startText(letter) + " 开头" : "还没选"));
      if (i === cur) b.setAttribute("aria-current", "step");
      b.addEventListener("click", function () { app.model.setFocus(i, "pl-" + i); });
      (row || el.pagerLetters).appendChild(b);
      if (split) sh.forEach(function (r) { if (r[1] === i + 1) row.appendChild(app.model.make("span", "pl-range", two(r[0] + 1) + "–" + two(r[1]))); });
    });
    var sts = state.letters.map(function (l, i) { return app.model.cellState(i); });
    // T49：只留下一步要做的事。「左右滑动…」「先打一个…候选才会出现」不再说（字母栏可点、卡上占位已说明）；没填的格与首字母不对的格并成「还差 N 格」，
    // 具体哪一格由字母栏的虚线与读屏名、点「完成」被拦下时的定位说明（finishNote）给出
    var left = sts.filter(function (t) { return t !== "ok"; }).length;
    el.hint.textContent = app.publish.finishNote ? app.publish.finishNote : !n || grid ? "" : left ? "还差 " + left + " 格" : ""; // 2026-11-12：列阵的「点一格编辑」删去
  }

  // 把 <html> 上的 --k 设成卡显示宽 / 1080：界面尺寸（--u）和左边距（--m = 80 × k）跟着变，与卡的网格线对齐
  function applyScale() {
    var w = el.card.clientWidth || el.app.clientWidth;
    app.view.cardW = el.card.clientWidth;
    if (w) document.documentElement.style.setProperty("--k", String(w / CORE.CARD.W));
  }

  function renderShell() {
    applyScale();
    syncViews();
    var n = state.letters.length;
    if (state.view === "grid" && n) renderDomGrid(); else renderDomCard(Math.min(state.focus, Math.max(0, n - 1)));
    renderPager();
    app.title.renderKbRow();
  }

  // ---- 左右滑动（D16 手势规则，T11） ----
  // 卡区域 touch-action: pan-y（style.css）：竖滑交给浏览器滚页面，横滑由这里收。判断全在 CORE.swipeDir / swipeAllowed / swipeTarget（有测试）。
  // 松手后直接换卡。ponytail: 不做跟手拖动动画，要跟手再加 transform 跟随
  // 有字段在编辑 = 焦点在文字输入框 / 可编辑区（键盘弹起）；面板 = 取景弹层或借物页
  function isEditing() {
    var a = document.activeElement;
    return !!a && (a.tagName === "TEXTAREA" || !!a.isContentEditable || (a.tagName === "INPUT" && !/^(file|range|color|checkbox|radio|button)$/.test(a.type)));
  }
  function panelOpen() { return !el.imgPanel.hidden || !el.cropper.hidden || !el.credits.hidden || !el.finishPanel.hidden || !el.results.hidden || !el.viewer.hidden || !el.settings.hidden; }

  // T32：卡之外，字母栏与提示行也收横滑（opts.blockOn = 起点在这些元素里不算：字母按钮 U3、「改单词 / 填表人」入口）。
  // 这些区域不设 pan-y（放大后的用户要能横向平移），有 touch 事件就用 touch——不因浏览器接手滚动而被 pointercancel 取消；没有 touch 才用 pointer（电脑鼠标）
  function zoomed() { var vv = window.visualViewport; return !!vv && vv.scale > 1.01; }
  function selecting() { var s = window.getSelection && window.getSelection(); return !!s && !s.isCollapsed && String(s).length > 0; }
  function bindSwipe(node, onSwipe, opts) {
    var from = null, blockOn = (opts && opts.blockOn) || ".ctl", touchFirst = !!(opts && opts.touchFirst) && "ontouchstart" in window;
    // 列阵只预览、只有一格没处可换：不收手势
    var begin = function (x, y, target) {
      from = null;
      if (state.view !== "single" ? app.model.sheets().length < 2 : state.letters.length < 2) return; // 列阵：分图时横滑换张（T42）
      if (!CORE.swipeAllowed({ editing: isEditing(), panelOpen: panelOpen(), inControl: !!(target && target.closest && target.closest(blockOn)), zoomed: zoomed(), selecting: selecting() })) return;
      from = [x, y];
    };
    var end = function (x, y) {
      var f = from, dir = f ? CORE.swipeDir(x - f[0], y - f[1]) : 0;
      from = null;
      if (dir) onSwipe(dir);
    };
    if (window.PointerEvent && !touchFirst) { // 鼠标也算（电脑上拖一下也能换，方便预览）
      node.addEventListener("pointerdown", function (e) {
        if (!e.isPrimary || (e.pointerType === "mouse" && e.button !== 0)) { from = null; return; } // 第二根手指（双指缩放）取消
        begin(e.clientX, e.clientY, e.target);
      });
      node.addEventListener("pointerup", function (e) { if (e.isPrimary) end(e.clientX, e.clientY); });
      node.addEventListener("pointercancel", function () { from = null; }); // 浏览器接手竖向滚动时会取消
    } else { // 老 iOS WebView、以及卡外区域在触屏上（T32）用 touch
      node.addEventListener("touchstart", function (e) {
        if (e.touches.length !== 1) { from = null; return; }
        begin(e.touches[0].clientX, e.touches[0].clientY, e.target);
      });
      node.addEventListener("touchend", function (e) { if (e.changedTouches.length) end(e.changedTouches[0].clientX, e.changedTouches[0].clientY); });
      node.addEventListener("touchcancel", function () { from = null; });
    }
  }

  function swipeCard(dir) {
    var n = state.letters.length, cur = Math.min(state.focus, Math.max(0, n - 1)), t = CORE.swipeTarget(cur, n, dir);
    app.editor.lastSwipeAt = Date.now(); // 鼠标横拖松手后图版按钮还会收到 click，这一下不算点击
    if (state.view === "grid") { // T42：列阵分图时换张（停在那一张的第一格）
      var sh = app.model.sheets(), k = CORE.swipeTarget(app.model.sheetOf(cur), sh.length, dir);
      if (sh[k][0] !== sh[app.model.sheetOf(cur)][0]) app.model.setFocus(sh[k][0]);
      return;
    }
    if (t !== cur) app.model.setFocus(t);
  }


  // 跨模块接口；其余函数与缓存保留在本文件闭包中。
  Object.assign(app.view, {
    renderShell: renderShell,
    setView: setView,
    measure: measure,
    currentPalette: currentPalette,
    syncViews: syncViews,
    renderPager: renderPager,
    drawCard: drawCard,
    drawGrid: drawGrid,
    ensureFonts: ensureFonts, applySkinFont: applySkinFont,
    caseText: caseText,
    bindSwipe: bindSwipe,
    swipeCard: swipeCard
  });
})(window.Backronym);
