/* 藏头 - Backronym：卡上输入、候选与释义栏。ES2017 经典脚本。 */
(function (app) {
  "use strict";
  app.editor = {};
  var CORE = app.model.CORE, state = app.model.state, el = app.model.el, blocked = app.model.blocked, senseGroups = app.model.senseGroups, defaultGloss = app.model.defaultGloss;

  // ---- 卡上编辑·单词 / 释义 / 配文（T12 / T13 / T15） ----
  // 三个透明文字的 <input>（#wordCtl / #glossCtl / #capCtl，在控件层 #ctl 里）叠在镜像（卡上对应的文字框）上：位置、字号、字距都取自版式框（renderCtl），
  // 所以光标落在镜像字母之间。需要区分大小写时输入框保留原样，与镜像不同时由输入框自己显示。
  // 重摆卡只重建镜像层，输入框本身不动（焦点、光标、输入法状态都保住）。
  app.editor.focusKind = ""; // 焦点在哪个卡上控件："word" / "gloss" / "cap" / ""
  app.editor.wordComposing = false;
  app.editor.overNote = false; // 刚有一次输入因为超过格内上限没收：候选栏上方写明上限
  app.editor.lineComposing = false;
  var ctlK = 0;
  app.editor.lastSwipeAt = 0;

  // 折了行的词：透明的单行输入框对不上多行镜像。正在打这个词时改由输入框自己显示（单行、可横向滚动），镜像里的词先藏起来；离开后镜像按折行显示
  var wordWrapped = false;
  // 配文框是多行 textarea，透明叠在镜像上，镜像实时折行（不再像折行的词那样改由输入框自己显示）。capDy = 词折行后配文下移的量
  var capDy = 0;
  function syncOwn() {
    var value = el.wordCtl.value;
    // 框里的字和镜像不一样（如德语保留大小写前后）时由输入框自己显示；组字期间除外：镜像已在画正在组的字（composePreview），
    // 改由输入框显示会回到安卓带候选输入法「选定前卡上一片空白」的老问题
    var own = app.editor.focusKind === "word" && (wordWrapped || (!app.editor.wordComposing && value !== app.model.displayWord(curCell())));
    el.wordCtl.classList.toggle("own", own);
    el.card.classList.toggle("word-own", own);
  }

  // 组字预览：组字期间不校验、不写数据，但把框里正在组的字交给镜像先画出来（app-view.js 的 layoutData 读它）。
  // 安卓带候选的输入法打西文时，每个词在选定候选前都处在组字中；iOS 西文键盘不组字，本来就所见即所得
  var preview = null;
  function composePreview(i) {
    if (!preview || preview.i !== i) return null;
    return (preview.kind === "word" ? app.editor.wordComposing : app.editor.lineComposing) ? preview : null;
  }
  function showComposing(kind, input) {
    if (!state.letters.length) return;
    preview = { kind: kind, i: curCell(), value: input.value };
    if (app.model.editingNow()) app.model.holdHeight(true);
    app.view.renderShell();
  }
  // 组字结束：先按定稿处理；被拒收（超长、写满）时数据没变、不会重绘，这里补一次，把预览的字撤掉
  function endComposing(handle) {
    var had = !!preview;
    preview = null;
    handle();
    if (had) app.view.renderShell();
  }

  function curCell() { return Math.min(state.focus, Math.max(0, state.letters.length - 1)); }

  // 词库归正后的显示值和作者实际打的词分开记，同一格继续编辑时只替换被改动的部分。
  var lastTyping = null, editRange = null;
  // 单词框里放存下的拼写（pick[0]），不放卡面写法：R04 起卡面把 pierre 显示成 Pierre，框里若也是 Pierre，
  // 回到这格改一个字就会按大写重查，石头变成人名皮埃尔（v00.03.01 批 A 复审）。卡面仍由镜像按 displayWord 画
  function cellWord(i) { var p = state.picks[i]; return p ? p[0] : ""; }
  // app-model refreshPicks 重核时换了这一格的词条对象（词形索引迟到）：正在打的记录跟着指向新对象（2026-11-19 返工）
  app.editor.repick = function (i, before, after) { if (lastTyping && lastTyping.cell === i && lastTyping.pick === before) lastTyping.pick = after; };

  function bindWordControl(input) {
    input.addEventListener("beforeinput", function () {
      editRange = {value: input.value, start: input.selectionStart, end: input.selectionEnd};
    });
    input.addEventListener("input", function (event) { // 用户亲手打字：候选恢复显示
      if (app.editor.wordComposing) { showComposing("word", input); return; }
      app.model.retryForms(); app.editor.candQuiet = false; onWordCtl(event);
    });
    // 组字期间（拼音、日文、安卓带候选的西文输入法）不校验、不改写；镜像先画正在组的字（composePreview）。组字结束再统一处理
    input.addEventListener("compositionstart", function () { app.editor.wordComposing = true; input.classList.add("ime"); renderCand(); });
    input.addEventListener("compositionend", function () { app.editor.wordComposing = false; input.classList.remove("ime"); app.editor.candQuiet = false; endComposing(onWordCtl); });
    input.addEventListener("focus", function () { app.model.retryForms(); app.editor.focusKind = "word"; syncOwn(); app.model.holdHeight(true); renderCand(); revealCtl(350); });
    input.addEventListener("blur", function (e) {
      if (e.relatedTarget && el.cand.contains(e.relatedTarget)) return; // Tab 进候选栏：栏留着，离开候选栏时再收（见绑定段 #cand focusout）
      leaveWordCtl(input);
    });
    input.addEventListener("keydown", function (e) { if (e.key === "Enter" && !e.isComposing && e.keyCode !== 229) { e.preventDefault(); input.blur(); } });
  }

  // 离开单词框（T15：输入框失焦与焦点离开候选栏共用，不再合成 blur 事件）：收栏，去掉末尾空格
  function leaveWordCtl(input) {
    if (lastTyping && lastTyping.cell === curCell() && lastTyping.pick === state.picks[lastTyping.cell] && input.value === lastTyping.shown) {
      input.value = lastTyping.shown = lastTyping.pick[0];
    }
    editRange = null;
    app.editor.focusKind = ""; syncOwn();
    app.model.holdHeight(false);
    var t = input.value.replace(/\s+$/, ""); // 离开时去掉末尾空格
    if (t !== input.value) { input.value = t; onWordCtl(); } else renderCand();
  }

  function onWordCtl(event) {
    if (app.editor.wordComposing || !state.letters.length) return;
    var i = curCell(), c = el.wordCtl;
    var value = c.value, start = c.selectionStart, end = c.selectionEnd;
    var prev = lastTyping, range = editRange;
    editRange = null;
    if (prev && prev.cell === i && prev.pick === state.picks[i] && prev.raw !== prev.shown) {
      // 有 beforeinput 时用原选区区分重复字母；旧 WebView 用改完后的光标界定保留的后缀。
      var left = 0, right = 0, caret = start == null ? value.length : start;
      var limit = range && range.value === prev.shown ? Math.min(range.start, caret) : caret;
      if (!range && event && typeof event.data === "string") limit = Math.max(0, caret - event.data.length);
      while (left < limit && left < value.length && value[left] === prev.shown[left]) left++;
      var suffix = range && range.value === prev.shown && range.end > range.start ? prev.shown.length - range.end : value.length - caret;
      while (right < suffix && right < value.length - left && right < prev.shown.length - left &&
             value[value.length - right - 1] === prev.shown[prev.shown.length - right - 1]) right++;
      // 首字母大写可把 ß 展开为 SS。保留完整首字母才还原它，只保留半个时沿用框里的 S。
      var extra = prev.shown.length - prev.raw.length;
      var prefix = left <= extra ? prev.shown.slice(0, left) : prev.raw.slice(0, left - extra);
      var tail = right === prev.shown.length ? prev.raw : prev.shown.length - right <= extra
        ? prev.shown.slice(prev.shown.length - right) : prev.raw.slice(prev.raw.length - right);
      value = prefix + value.slice(left, value.length - right) + tail;
      start += prefix.length - left;
      end += prefix.length - left;
    }
    var r = CORE.rewriteWord(value, start, end, true), raw = r.value;
    var item = raw && app.model.itemFor(raw);
    if (item && raw !== item[0]) {
      r.value = app.model.typingWord(raw, item);
      var extraUnits = r.value.length - raw.length;
      if (r.start) r.start += extraUnits;
      if (r.end) r.end += extraUnits;
    }
    // 超过格内上限（R9）：这一次输入不收，恢复成输入前的词（原来由原生 maxlength 挡下；不从尾巴上截掉已有的字）。空格里粘贴超长内容没有「之前」，才截短
    var before = prev && prev.cell === i && prev.pick === state.picks[i] ? prev.shown : cellWord(i);
    app.editor.overNote = r.over;
    if (r.over && before) {
      var at = Math.max(0, Math.min(before.length, (c.selectionStart || 0) - (c.value.length - before.length)));
      c.value = before;
      try { c.setSelectionRange(at, at); } catch (e) { /* 取不到选区就算了 */ }
      renderCand();
      return;
    }
    if (r.value !== c.value) {
      c.value = r.value;
      try { c.setSelectionRange(r.start, r.end); } catch (e) { /* 取不到选区就算了 */ }
    }
    if (!r.value) { // 清空 = 回到空格占位；自动带出的释义属于旧词，一起清掉（D7）
      state.picks[i] = null;
      state.keys[i] = 0;
      state.arts[i] = state.poss[i] = state.pickLangs[i] = "";
      if (state.glossAuto[i]) state.glosses[i] = "";
    } else {
      app.model.setPick(i, item);
    }
    lastTyping = item ? {cell: i, pick: item, raw: raw, shown: r.value} : null;
    app.model.changed();
  }

  // 释义 / 配文：同一套做法。组字期间输入框自己显示（.ime）、不写数据，结束再写；开头的空白去掉（镜像按去空白后的字画）
  // 释义 / 配文框这次输入前的值与选区（配文粘贴截短时据此认出新加的那段）。组字从开始组字时算起；没有 beforeinput 的内核记不到，onLineCtl 退回逐字比
  var lineRange = null;
  function bindLineControl(input, kind) {
    var mark = function () { lineRange = { value: input.value, start: input.selectionStart, end: input.selectionEnd }; };
    input.addEventListener("beforeinput", function () { if (!app.editor.lineComposing) mark(); });
    input.addEventListener("input", function () { if (app.editor.lineComposing) showComposing(kind, input); else onLineCtl(kind); });
    input.addEventListener("compositionstart", function () { mark(); app.editor.lineComposing = true; input.classList.add("ime"); });
    input.addEventListener("compositionend", function () { app.editor.lineComposing = false; input.classList.remove("ime"); endComposing(function () { onLineCtl(kind); }); });
    input.addEventListener("focus", function () { app.editor.focusKind = kind; syncOwn(); app.model.holdHeight(true); renderCand(); revealCtl(350); });
    input.addEventListener("blur", function (e) {
      if (e.relatedTarget && el.cand.contains(e.relatedTarget)) return; // Tab 进义项栏：同单词框
      leaveLineCtl();
    });
    input.addEventListener("keydown", function (e) { if (e.key === "Enter" && !e.isComposing && e.keyCode !== 229) { e.preventDefault(); input.blur(); } });
    // 配文框高度正好放下镜像的行数。浏览器折行偶尔比镜像多一行（中文标点避头：镜像把「，」排在行首，浏览器把前一个字带下去），
    // 光标走到多出的那行时浏览器会把框内容整体上卷一行，之后每行都和镜像错开。不许卷：多出那行的光标看不见，其余各行仍对齐
    if (kind === "cap") input.addEventListener("scroll", function () { if (input.scrollTop) input.scrollTop = 0; });
  }

  // 离开释义 / 配文框（T15，同 leaveWordCtl）：收栏
  function leaveLineCtl() {
    app.editor.focusKind = ""; syncOwn(); app.model.holdHeight(false); renderCand();
  }

  function onLineCtl(kind) {
    if (app.editor.lineComposing) return;
    var rec = lineRange;
    lineRange = null;
    if (!state.letters.length) return;
    // 配文框是 textarea：回车已拦成「离开」，粘贴进来的换行换成空格（版式只认自动折行）
    var i = curCell(), c = kind === "gloss" ? el.glossCtl : el.capCtl, v = c.value.replace(/^\s+/, "").replace(/[\r\n]+/g, " ");
    if (v !== c.value) {
      var at = Math.max(0, (c.selectionStart || 0) - (c.value.length - v.length));
      c.value = v;
      try { c.setSelectionRange(at, at); } catch (e) { /* 同上 */ }
    }
    if (kind === "gloss") { state.glosses[i] = v; state.glossAuto[i] = false; } // 用户一动就不再是自动带出的（D7）
    else {
      // 配文写满配文框为止：再打就排不下的这一次输入不收，恢复成输入前的配文（同单词框的 R9，不从尾巴上截字）
      // full：排不下；末尾是空格时看它后面还能不能再放一个字（排版会去掉行尾空格，不这样查，写满后还能一直打进看不见的空格直到 maxlength）。
      // 只放过「没变长、原来就排不下」的修改（超长旧稿删字、等长替换），同字数换成更宽的字照样不收
      var before = state.captions[i] || "";
      var full = function (s) { return CORE.wrapCaption(app.view.measure, /\s$/.test(s) ? s + "i" : s, capDy).cut; };
      if (full(v) && !(v.length <= before.length && full(before))) {
        // 这次新加的那段（粘贴或输入法一次上屏）只收放得下的前段（v00.03.01 R01，同标题的 pasteTitle）；一个字也放不下才整次不收
        // 新加的那段按输入前记下的选区定（lineRange）：只比字的话，在「甲乙」中间粘贴「乙…」会把粘贴的乙认成原有的，截短时丢掉原来的乙（复审）。
        // 改完后的光标不可靠（maxlength 截过的粘贴，光标会落在末尾），记不到选区或对不上时才退回逐字比
        var pre = 0, suf = 0, rs = rec && rec.value === before && typeof rec.start === "number" && typeof rec.end === "number" ? rec.start : -1, rt = rs >= 0 ? before.length - rec.end : -1;
        if (rs >= 0 && rt >= 0 && rs + rt <= v.length && v.slice(0, rs) === before.slice(0, rs) && v.slice(v.length - rt) === before.slice(before.length - rt)) { pre = rs; suf = rt; }
        else {
          while (pre < before.length && pre < v.length && before.charAt(pre) === v.charAt(pre)) pre++;
          while (suf < before.length - pre && suf < v.length - pre && before.charAt(before.length - 1 - suf) === v.charAt(v.length - 1 - suf)) suf++;
        }
        if (pre && /[\ud800-\udbff]/.test(v.charAt(pre - 1))) pre--; // 不从代理对中间切开（emoji 与旧字共用前半）
        if (suf && /[\udc00-\udfff]/.test(v.charAt(v.length - suf))) suf--;
        var units = CORE.textUnits(v.slice(pre, v.length - suf)), tail = v.slice(v.length - suf);
        var withK = function (k) { return v.slice(0, pre) + units.slice(0, k).join(""); };
        var n = CORE.pasteFitLength(units.length, function (k) { return !full(withK(k) + tail); });
        var head = n ? withK(n) : "";
        var keep = n ? head.length : Math.max(0, Math.min(before.length, (c.selectionStart || 0) - (v.length - before.length))); // 先按改值前的光标算（改值会把光标挪到末尾）
        c.value = n ? head + tail : before;
        try { c.setSelectionRange(keep, keep); } catch (e2) { /* 同上 */ }
        app.model.showToast("配文写满了", 2000); // v00.03.01 E4：截短与否都是这一句
        if (!n) return;
        v = c.value;
      }
      state.captions[i] = v;
    }
    app.model.changed();
  }

  // 软键盘弹起后把正在编辑的控件和它下面的栏滚进可视区。ponytail: 假设 F（T21 真机）——Android 通常缩小可视区，iOS 靠 visualViewport；都量不到就不动
  function revealCtl(delay) {
    setTimeout(function () {
      var c = app.editor.focusKind === "word" ? el.wordCtl : app.editor.focusKind === "gloss" ? el.glossCtl : app.editor.focusKind === "cap" ? el.capCtl : null;
      if (!c) return;
      // T28：可视区上下沿要加上 visualViewport.offsetTop（iOS 弹键盘后会先自己滚一段，只拿 height 比会多滚一次）
      var vv = window.visualViewport, top = vv ? vv.offsetTop : 0, bottom = top + (vv ? vv.height : window.innerHeight), r = c.getBoundingClientRect();
      var need = (el.cand.hidden ? r.bottom + 20 : el.cand.getBoundingClientRect().bottom + 8) - bottom;
      var barB = el.top.getBoundingClientRect().bottom; // T29：固定顶栏下沿；滚动后控件不能钻到栏下面
      if (need > 0 && r.top - need > Math.max(top, barB) + 8) window.scrollBy(0, need);
    }, delay);
  }

  // 一个卡上输入框对准镜像里的一行：top 往上 pad、高度多 2 × pad，把点按区撑到母版 §3-⑩ 的可点区域（pad 用 1080 坐标，× k）
  function placeLine(c, spec, weight, pad, k, ratio, on, dy) {
    c.hidden = !on;
    if (!on) return;
    var st = c.style;
    st.left = CORE.CARD.M * k + "px";
    st.top = (spec.base + (dy || 0) - ratio * spec.size - pad) * k + "px";
    st.fontWeight = String(weight);
    fitInput(c, spec.size * k, CORE.CARD.CW * k, (spec.size + 2 * pad) * k, pad * k, 0);
  }

  // 配文框（textarea）对准镜像里的几行配文：首行同 placeLine，行高 = 版式行距，高度够放这格最多能排的行数
  // （行数算法同 CORE.wrapCaption：末行基线不超过 CAPTION.last）。内边距减去半个行距差，首行的字仍落在原位
  function placeCaption(c, k, ratio, on, dy) {
    c.hidden = !on;
    if (!on) return;
    var S = CORE.CARD.CAPTION, pad = 13, half = (S.lead - S.size) / 2, st = c.style;
    var max = Math.max(1, Math.floor((S.last - (S.base + (dy || 0))) / S.lead) + 1);
    st.left = CORE.CARD.M * k + "px";
    st.top = (S.base + (dy || 0) - ratio * S.size - pad) * k + "px";
    st.fontWeight = "700"; // v00.03.01 U04：配文粗体，框与卡面同字重，光标才对得上
    fitInput(c, S.size * k, CORE.CARD.CW * k, (S.size + (max - 1) * S.lead + 2 * pad) * k, (pad - half) * k, 0);
    st.lineHeight = S.lead * k / Math.min(1, S.size * k / MIN_INPUT_PX) + "px"; // 和 fitInput 同一个缩放
  }

  // T27：iOS 聚焦字号 < 16px 的输入框会自动放大、失焦不复原。卡上透明输入框的视觉字号 = 版式字号 × k，窄屏下配文只有 11–15px：
  // 小于 16px 时按 16px 排，再用 transform: scale 缩回视觉尺寸（宽、高、内边距、字距同比放大后再缩），所以光标仍落在镜像字之间。
  // 视觉字号 ≥ 16px 不缩放。缩放只影响这个透明框，镜像与导出不受影响
  var MIN_INPUT_PX = 16;
  function fitInput(c, px, w, h, padY, track) {
    var s = px < MIN_INPUT_PX ? px / MIN_INPUT_PX : 1, st = c.style;
    st.fontSize = px / s + "px";
    st.width = w / s + "px";
    st.height = h / s + "px";
    if (padY != null) st.paddingTop = st.paddingBottom = padY / s + "px";
    st.letterSpacing = track / s + "px";
    st.transformOrigin = "0 0";
    st.transform = s < 1 ? "scale(" + s + ")" : "";
  }

  // 输入中（焦点在这个框、同一格）值归用户，别的时候跟数据走
  function syncValue(c, i, value, composing) {
    if (!(document.activeElement === c && c.getAttribute("data-i") === String(i)) && !composing && c.value !== value) c.value = value;
    c.setAttribute("data-i", String(i));
  }

  // 控件层：单词输入框对准镜像里的单词 / 占位框；有词的格再摆释义 / 配文输入框，整块图版上摆一个透明按钮；词下方的栏。列阵只预览（无控件）
  function renderCtl(L, grid, k, ratio) {
    var n = state.letters.length, i = Math.min(state.focus, n - 1), c = el.wordCtl, b = null;
    ctlK = k;
    app.title.renderTopCtl(L, grid, k, ratio);
    if (grid || n < 1) { c.hidden = el.glossCtl.hidden = el.capCtl.hidden = el.plateHit.hidden = true; renderCand(); return; }
    var dy = 0, wrapped = false; // dy = 词折行后词下面各行下移的量；wrapped = 词排了不止一行
    L.boxes.forEach(function (x) {
      if (x.i === i && (x.role === "empty" || (x.role === "word" && !x.line))) b = x; // 输入框对准第一行（冠词块之后）
      if (x.i === i && x.role === "word" && x.line) wrapped = true;
      if (x.role === "bar") dy = x.y - CORE.CARD.BAR.y;
    });
    c.hidden = false;
    var st = c.style;
    st.left = b.x * k + "px";
    st.top = (b.baseline - ratio * b.size) * k + "px";
    st.fontWeight = String(b.weight);
    fitInput(c, b.size * k, (CORE.CARD.CW - (b.x - CORE.CARD.M)) * k, b.size * k, null, (b.track || 0) * k);
    syncValue(c, i, cellWord(i), app.editor.wordComposing);
    wordWrapped = wrapped; capDy = dy; syncOwn();
    c.setAttribute("aria-label", "第 " + (i + 1) + " 格 " + state.letters[i] + " 的词（要以 " + CORE.startSpoken(state.letters[i]) + " 开头）");
    // 释义 / 配文：有词才有（母版 §2-④ 空格只有词位占位）
    var hasWord = b.role === "word", C = CORE.CARD;
    placeLine(el.glossCtl, C.GLOSS, 400, 8, k, ratio, hasWord, dy); // U04：释义常规
    placeCaption(el.capCtl, k, ratio, hasWord, dy);
    if (hasWord) {
      syncValue(el.glossCtl, i, state.glosses[i] || "", app.editor.lineComposing);
      syncValue(el.capCtl, i, state.captions[i] || "", app.editor.lineComposing);
      el.glossCtl.setAttribute("aria-label", "第 " + (i + 1) + " 格的释义（最多 16 字）");
      el.capCtl.setAttribute("aria-label", "第 " + (i + 1) + " 格的配文（选填，写满配文框为止）");
    }
    // 图版：整块是一个透明按钮，点了出配图面板（不加 .ctl：触点起于控件内不算横滑，图版是最大的横滑起点）
    var ph = el.plateHit.style;
    el.plateHit.hidden = false;
    ph.left = C.M * k + "px";
    ph.top = C.PLATE.y * k + "px";
    ph.width = C.CW * k + "px";
    ph.height = C.PLATE.h * k + "px";
    el.plateHit.setAttribute("aria-label", "第 " + (i + 1) + " 格 " + state.letters[i] + " 的配图：点此选择、调整或移除");
    renderCand();
  }

  // ---- 词下方的栏（D6 / D16，T13）与义项栏（§3-⑦，T15） ----
  // 同一个 #cand：焦点在单词框 → 候选栏（墨底提示 + 标签行 + 8 个一批的 2 列 × 4 行）；焦点在释义框 → 义项栏。其余时候收起。
  // 候选 = CORE.candidates（关键词 = 词框里的字）；候选表按「格字母 + 关键词」缓存，翻页 / 重摆只重取一页（屏蔽在取页时过滤）
  app.editor.candPage = 0;
  app.editor.candKey = "";
  app.editor.candQuiet = false;
  app.editor.more = false; // 候选栏开关：也看专业、历史文化词。只在本次编辑里有效，不进草稿
  var candMemo = { key: "", list: [] };

  function renderCand() {
    // T28：候选 / 义项栏的开合会改页面高度。所有开合都走这里（打字、组字开始、切格、收栏），所以在这里先记下当前（可能已展开的）高度，
    // 再收起也不缩短页面；只在有输入框在用时锁，离开后由 holdHeight(false) 放开
    if (app.model.editingNow()) app.model.holdHeight(true);
    var n = state.letters.length, i = Math.min(state.focus, n - 1), show = false, mode = "";
    var had = el.cand.contains(document.activeElement); // 键盘用户的焦点在栏里的按钮上：重建列表会把它删掉
    if (n > 0 && state.view === "single") mode = app.editor.focusKind === "word" ? (app.editor.wordComposing ? "compose" : "word") : app.editor.focusKind === "gloss" ? "gloss" : "";
    if (mode === "word") show = renderWordBar(i);
    else if (mode === "compose") show = renderComposeBar(i);
    else if (mode === "gloss") show = renderSenseBar(i);
    el.cand.hidden = !show;
    el.wordCtl.setAttribute("aria-invalid", String(n > 0 && !app.editor.wordComposing && app.model.cellState(i) === "bad"));
    if (show && mode !== "gloss" && el.candMsg.textContent) el.wordCtl.setAttribute("aria-describedby", "candMsg");
    else el.wordCtl.removeAttribute("aria-describedby");
    // T02 / D2：义项栏开着时盖在配文位置上——配文镜像与配文框一起隐藏（不可见也不可点），栏收起后原样恢复。
    // T09：候选 / 义项栏开着时，栏下方的首次提示虚框不画（否则下沿被栏压住）
    el.card.classList.toggle("sense-open", show && mode === "gloss");
    el.card.classList.toggle("cand-open", show);
    if (show) el.cand.style.top = (mode === "gloss" ? 1180 : 1082) * ctlK + "px"; // 母版 §2-②：词下方 1082 × k；§3-⑦：释义下方 1180 × k
    // 栏是绝对定位，DOM 位置不影响显示：挪到所属输入框紧后，Tab 与读屏顺序都是「输入框 → 它的候选」
    var anchor = mode === "gloss" ? el.glossCtl : el.wordCtl;
    if (show && !had && anchor.nextSibling !== el.cand) anchor.parentNode.insertBefore(el.cand, anchor.nextSibling);
    // 栏伸出卡外时把卡下内容（字母栏、提示）往下推，不让栏盖住字母栏：盖着时点字母会点中候选词
    var over = show ? el.cand.getBoundingClientRect().bottom - el.card.getBoundingClientRect().bottom : 0;
    el.card.style.marginBottom = over > 0 ? Math.ceil(over) + "px" : "";
    if (show && had && !el.cand.contains(document.activeElement)) (mode === "gloss" ? el.glossCtl : el.wordCtl).focus(); // 按钮被重建：焦点回到输入框，不掉到页面开头
  }

  function candItem(item, L, i) {
    // 两行（T27）：第一行「冠词 + 词」，第二行释义——只放两个最常用的义项（词库里排最前的两个），其余的选中后在义项栏换
    var from = app.model.itemLang(item) || state.lang, many = state.langs.length > 1;
    var w = app.model.candidateWord(item, from), at = CORE.resolveKeyAt(w, L), art = CORE.articleOf(item, "", CORE.defaultSense(item)).text; // 候选显示的是第一组义项，冠词也取它的（形容词在前的 jeune 不带；livre 写 le，不写 le|la）
    // 释义行只放前两个义项（T27），每段前标词性缩写（第六轮真机建议，用户 11-19 定）：「v. 离开，遗落」「n. m. 书；n. f. 磅」；
    // 缩写按这门语言的词典写法、名词带这组义项的阴阳性（app.model.posAbbr）；相邻两段缩写相同就并成一段。领域标签组（[计]）不标
    var parts = [], left = 2;
    senseGroups(item).forEach(function (g) {
      if (left <= 0) return;
      var take = g.senses.slice(0, left), plain = !g.pos || g.pos.charAt(0) === "[", gen = plain ? "" : app.model.senseGender(item, from, g);
      var abbr = plain ? "" : app.model.posAbbr(from, g.pos, gen), last = parts[parts.length - 1];
      left -= take.length;
      if (last && last.abbr === abbr) last.senses = last.senses.concat(take);
      else parts.push({ abbr: abbr, spoken: plain ? "" : app.model.posSpoken(g.pos, gen), senses: take });
    });
    var gloss = parts.map(function (pt) { return pt.senses.join("，"); }).join("；");
    var li = app.model.make("li"), btn = app.model.make("button", "cand-it"), line = app.model.make("span", "cand-w"), b = app.model.make("b");
    btn.type = "button";
    b.lang = from;
    var elided = /['\u2019]$/.test(art); // l’ 这类省音冠词与词之间不留空
    if (art) line.appendChild(app.model.make("span", "cand-art" + (elided ? " tight" : ""), art)); // 冠词只显示：不加粗、不着色、不参与首字母判定
    if (at >= 0) { // 关键字母朱红
      b.appendChild(document.createTextNode(w.slice(0, at)));
      b.appendChild(app.model.make("i", "k", w.charAt(at)));
      b.appendChild(document.createTextNode(w.slice(at + 1)));
    } else {
      b.textContent = w;
    }
    line.appendChild(b);
    btn.appendChild(line);
    var g = app.model.make("span", "cand-g"), tag = item[4] || ""; // 开关加进来的词：释义前标「专业」「历史文化」（只在候选栏显示，不进卡上的释义）
    // 选了不止一门语言：释义前标语言「[法] 战争」（v00.03.01 U05，用户 11-18 定甲：只在候选栏、义项栏标，卡面与导出不标）；
    // 同时是开关加进来的词写成「[德] 专业 · 感染」。只选一门时不标
    var mark = many ? app.model.langName(from).charAt(0) : "";
    if (mark) g.appendChild(app.model.make("span", "cand-tag cand-lang", "[" + mark + "] "));
    if (tag) g.appendChild(app.model.make("span", "cand-tag", tag + " · "));
    parts.forEach(function (pt, k) {
      if (k) g.appendChild(document.createTextNode("；"));
      if (pt.abbr) { g.appendChild(app.model.make("i", "cand-pos", pt.abbr)); g.appendChild(document.createTextNode(" ")); }
      g.appendChild(document.createTextNode(pt.senses.join("，")));
    });
    btn.appendChild(g);
    var said = parts.map(function (pt) { return [pt.spoken, pt.senses.join("，")].filter(Boolean).join("，"); }).join("；");
    btn.setAttribute("aria-label", [(art ? art + (elided ? "" : " ") : "") + w, many ? app.model.langName(from) : "", tag, said].filter(Boolean).join("，")); // 截断只在视觉上，读屏名是完整的
    btn.addEventListener("click", function () { chooseCand(i, item); });
    li.appendChild(btn);
    return li;
  }

  // 点候选：替换这格的词（释义按 D7），收键盘
  function chooseCand(i, item) {
    var kb = el.cand.contains(document.activeElement); // 键盘选的（触屏点按不会让焦点离开单词框）
    var from = app.model.itemLang(item);
    item = item.slice(0, 4); // 类别标注（第五列）不进作品
    app.model.setPick(i, item, from);
    el.wordCtl.value = cellWord(i);
    app.editor.candQuiet = false;
    app.model.changed();
    el.live.textContent = "第 " + (i + 1) + " 格已选 " + app.model.displayWord(i);
    if (kb) el.wordCtl.focus(); else el.wordCtl.blur(); // 触屏收键盘；键盘用户留在单词框，接着 Tab 去释义
  }

  // 「随机一个」：池里随机挑，避开所有格当前用着的词和被屏蔽的词；挑完候选先收起（想换就接着打字），栏留着可以再随机
  function randomOne(i) {
    var used = state.picks.map(function (p) { return p && CORE.LANG.fold(p[0]); });
    // 从所有选中的语言里挑：各门各自的池子合在一起，条目记着来自哪门
    var pool = [], total = 0;
    state.langs.forEach(function (c) {
      app.model.inLang(c, function () {
        var one = app.model.randomWords(app.model.words(), state.letters[i]);
        if (app.editor.more) one = one.concat(app.model.randomWords(app.model.moreWords(), state.letters[i]));
        one.forEach(function (row) {
          var word = row.item[0];
          if (used.indexOf(CORE.LANG.fold(word)) >= 0 || blocked(word)) return;
          total += row.weight;
          pool.push({item: app.model.tagLang(row.item.slice(0, 4), c), end: total});
        });
      });
    });
    if (!pool.length) { el.live.textContent = "这个字母没有可换的词了"; return; }
    var draw = Math.random() * total;
    var p = pool.find(function (row) { return draw < row.end; }).item;
    app.model.setPick(i, p, app.model.itemLang(p));
    el.wordCtl.value = cellWord(i);
    app.editor.candQuiet = true;
    app.editor.candKey = "";
    app.model.changed();
    el.live.textContent = "第 " + (i + 1) + " 格随机换成 " + app.model.displayWord(i);
  }

  // 栏头位置固定：操作行在词栏里始终都在，用不上的操作停用（disabled）而不拿掉；义项栏没有操作行。
  // extra = 这一格开关还能多出来的词数（开着时 = 已加进来的词数）
  // count：单词框计数器的字数（v00.03.01 E6，同填表人计数：差 7 字到上限起墨色粗体、写满朱色）；不传或小于 0 = 不显示
  function showBar(msg, lab, acts, more, extra, count) {
    var max = CORE.LANG.wordMax, counted = count >= 0;
    el.candCount.hidden = !counted;
    el.candCount.textContent = counted ? count + " / " + max : "";
    el.candCount.classList.toggle("hot", counted && count >= max - 7 && count < max);
    el.candCount.classList.toggle("full", counted && count >= max);
    el.candMsg.hidden = !msg;
    if (el.candMsg.textContent !== msg) el.candMsg.textContent = msg; // 相同提示不反复触发状态播报
    el.candLab.textContent = lab;
    el.candRow.hidden = !acts;
    el.candNext.disabled = !more;
    var on = !!app.editor.more, n = extra || 0;
    el.candMore.disabled = !on && !n; // 没有可加的词：停用；开着时始终能关
    el.candMore.setAttribute("aria-pressed", String(on));
    el.candMoreN.textContent = (on ? "已加 " : "+") + n;
    el.candMore.setAttribute("aria-label", on ? "已包含专业、历史文化词，这一格 " + n + " 个，点按收起" : "也看专业、历史文化词，这一格多 " + n + " 个");
  }

  function renderWordBar(i) {
    var L = state.letters[i], p = state.picks[i], word = (p && p[0] ? p[0] : "").replace(/\s+$/, ""), st = app.model.cellState(i), han = CORE.uniqueHan(word).length > 0; // 打词时末尾的空格不进提示和关键词
    var msg = "", lab = "", items = [], pages = 0, extraN = -1;
    // 语言多选：候选来自所有选中语言的词库，按语言轮流排（各自词库里的先后不变）；开关对所有选中语言一起生效，「+N」是合计
    var each = function (fn) { return state.langs.map(function (c) { return app.model.inLang(c, function () { return fn(c).map(function (it) { return app.model.tagLang(it, c); }); }); }); };
    var weave = function (lists) { var out = [], n = Math.max.apply(null, lists.map(function (l) { return l.length; }).concat([0])); for (var k = 0; k < n; k++) lists.forEach(function (l) { if (k < l.length) out.push(l[k]); }); return out; };
    var packs = state.langs.map(function (c) { return app.model.inLang(c, function () { return [app.model.words(), app.model.moreWords()]; }); });
    var extraOf = function (q) { return weave(each(function () { return CORE.candidates(app.model.moreWords(), L, q, null, app.model.langData("lexicon")).filter(function (it) { return !blocked(it[0]); }); })); };
    // T41 / U19：数字格的词以读法首字母或数字本身开头都算对；提示只列读法首字母（v00.03.01 R03）。E3：格首提示与占位同一写法「T 开头」
    var LS = CORE.startText(L), say = LS + " 开头"; // 格首提示把算对的写法全列出来（CORE.startText，与校验同一条规则）
    if (word && blocked(word)) {
      msg = CORE.BLOCKED_MSG; // T40 / U14：不复述被拦的词
      lab = say;
    } else {
      if (st === "bad") msg = han ? "先打一个以 " + LS + " 开头的" + (state.langs.length > 1 ? "" : state.lang === "en" ? "英文" : app.model.langName(state.lang)) + "词" : word + " 不是以 " + LS + " 开头";
      if (!word || (app.editor.candQuiet && st !== "bad")) lab = say; // D6-3：关键词框为空不出候选；T49：「打几个字母…」「想换就接着打字」不再说
      else {
        var key = state.langs.join(",") + "|" + L + "|" + word + (app.editor.more ? "|+" : ""); // T05：候选缓存按语言隔离；开关换了算另一份、翻页回到第 1 批
        var same = candMemo.key === key && candMemo.packs && candMemo.packs.length === packs.length && candMemo.packs.every(function (pk, k) { return pk[0] === packs[k][0] && pk[1] === packs[k][1]; }); // 词库迟到：对象换了，缓存失效
        if (!same) { var extra = extraOf(word); candMemo = { key: key, packs: packs, extra: extra.length, list: (app.editor.more ? extra : []).concat(weave(each(function () { return CORE.candidates(app.model.words(), L, word, null, app.model.langData("lexicon")); }))) }; } // 开着：新加入的词排最前
        if (st !== "bad") extraN = candMemo.extra;
        if (app.editor.candKey !== key) { app.editor.candKey = key; app.editor.candPage = 0; }
        // 先合并查词命中再分页，否则插在首页的命中会把页尾的候选挤掉。
        var hits = st === "bad" ? [] : app.model.lookupAll(word).filter(function (h) { return !blocked(h.entry[0]) && CORE.containsLetter(h.entry[0], L); });
        var ph = hits.length ? hits[0].entry : null;
        var list = candMemo.list;
        if (hits.length) {
          var lead = [], rest = list.slice();
          hits.forEach(function (h) {
            var spelling = function (w) { return w.normalize("NFC"); };
            var index = rest.findIndex(function (it) { return (app.model.itemLang(it) || state.lang) === h.lang && spelling(it[0]) === spelling(h.entry[0]); });
            // 使用查词的完整义项与冠词；同写法推荐行只提供类别标注。
            var entry = h.entry, tag = index < 0 ? "" : rest.splice(index, 1)[0][4];
            if (tag) { entry = entry.slice(0, 4); entry[4] = tag; }
            lead.push(app.model.tagLang(entry, h.lang));
          });
          list = lead.concat(rest);
        }
        var r = CORE.pageOf(list, app.editor.candPage, CORE.PAGE_SIZE, function (it) { return blocked(it[0]); });
        items = r.items;
        app.editor.candPage = r.page;
        pages = r.pages;
        // 打的是变形：写明释义取自哪个原形（suis → être），免得用户以为词库里就有这个词
        var lemma = ph ? app.model.formOf(word, hits[0].lang) : "";
        var status = !han && st !== "bad" ? app.model.formStatus(word) : "";
        lab = items.length ? say + " · " + (app.editor.candPage + 1) + " / " + pages + " 批" + (lemma ? " · " + word + " 是 " + lemma + " 的变形" + (state.langs.length > 1 ? "（" + app.model.langName(hits[0].lang) + "）" : "") : "") + (status ? " · " + status : "") // 多选时写明是哪门语言的变形（R02） // 提示只有一行：批数紧跟格首提示，放不下时省略的是后面的补充
          : st === "bad" ? L + " 格的词要以 " + LS + " 开头"
          : status || "词库里没有输入的词"; // 用户 11-19 第六轮真机：不复述输入，免得长词把提示挤出一行
      }
    }
    // T28：到了格内上限就写明（词框不再接收，不静默截断）
    var count = CORE.wordUnits(word);
    if (!msg && (app.editor.overNote || count >= CORE.LANG.wordMax)) msg = "这一格最多 " + CORE.LANG.wordMax + " 个字符";
    // 这次没出候选（还没打字、打错、刚随机过）：按这一格能拿到的展开词数。数字格按读法首字母取（2 → T），不能拿「2」当关键词去匹配（交付57复审）
    if (extraN < 0) extraN = each(function () { return CORE.letterTiers(app.model.moreWords(), L).head.filter(function (it) { return !blocked(it[0]); }); }).reduce(function (n, l) { return n + l.length; }, 0);
    showBar(msg, lab, true, pages > 1, extraN, word ? count : -1);
    el.senseList.hidden = true;
    el.candList.hidden = !items.length;
    el.candList.textContent = "";
    var frag = document.createDocumentFragment();
    items.forEach(function (it) { frag.appendChild(candItem(it, L, i)); });
    el.candList.appendChild(frag);
    return true;
  }

  // v00.03.01 E6：组字期间（安卓 / 鸿蒙带候选的西文输入法每个词都在组字）只留提示行：格首提示与计数器，按框里正在打的字计。
  // 候选列表与按钮仍收起（它们对应的是组字前的词，组字中点下去会落空）；超过上限先写明，免得一上屏超出的字就消失而不知为何
  function renderComposeBar(i) {
    var count = CORE.wordUnits(el.wordCtl.value), max = CORE.LANG.wordMax;
    showBar(count > max ? "最多打 " + max + " 个字符" : "" /* 用户 11-19 定的文案 */, CORE.startText(state.letters[i]) + " 开头", false, false, 0, count || -1); // 还没打字（空格里刚开始组字）同词栏：不显示「0 / 28」
    el.candList.hidden = el.senseList.hidden = true;
    return true;
  }

  // 义项栏：按词性分行列出义项，朱色 = 当前释义里有的；点一个 = 换成它（D7：手改过，换词时保留）。自填词没有义项，不出栏
  function renderSenseBar(i) {
    var p = state.picks[i], groups = p ? senseGroups(p[1] ? p : app.model.itemFor(p[0])) : []; // 恢复时补充表还没加载完的短语：显示时再查一次
    var art = p ? CORE.articleOf(p, state.arts[i], state.poss[i]) : { options: [] }, pickArt = art.options.length > 1; // 选的是名词义项才有冠词可选（R7）
    if (!groups.length && !pickArt) return false;
    showBar("", app.model.displayWord(i) + " 的义项", false, false);
    el.candList.hidden = true;
    el.senseList.hidden = false;
    el.senseList.textContent = "";
    var now = (state.glosses[i] || "").split("，"), frag = document.createDocumentFragment();
    var pressed = function (g, sn) {
      if (now.indexOf(sn) < 0) return false;
      var owners = groups.filter(function (h) { return h.senses.indexOf(sn) >= 0; }), mine = owners.filter(function (h) { return state.poss && CORE.senseId(h) === state.poss[i]; });
      return owners.length < 2 || !mine.length || mine[0] === g;
    };
    if (pickArt) { // 两性名词：冠词由用户二选一，不预选（T22）；没选时卡上写全，点「完成」会被拦下。有推荐冠词的（el (la)，R3-19）没选就按推荐的亮
      var arow = app.model.make("div", "sense-row art-row");
      arow.setAttribute("role", "group");
      arow.setAttribute("aria-label", "冠词" + (art.pending ? "（还没选）" : ""));
      var atag = app.model.make("span", "pos", "冠词");
      atag.setAttribute("aria-hidden", "true");
      arow.appendChild(atag);
      art.options.forEach(function (a) {
        var ab = app.model.make("button", "sense", a);
        ab.type = "button"; ab.lang = state.pickLangs[i] || state.lang;
        ab.setAttribute("aria-pressed", String(!art.pending && art.text === a));
        ab.addEventListener("click", function () { state.arts[i] = a; app.model.changed(); });
        arow.appendChild(ab);
      });
      frag.appendChild(arow);
    }
    var multiNoun = groups.filter(function (g) { return g.pos === "n."; }).length > 1;
    var langFull = state.langs.length > 1 && p ? app.model.langName(state.pickLangs[i] || app.model.itemLang(p) || state.lang) : "";
    var langMark = langFull ? "[" + langFull.charAt(0) + "] " : ""; // U05：多选时义项行首标语言；行首标记对读屏隐藏，组名写全称（同候选的读屏名「法语，动词」）
    groups.forEach(function (g) {
      var row = app.model.make("div", "sense-row");
      row.setAttribute("role", "group");
      if (g.pos) {
        // 行首词性按这门语言的缩写（用户 11-19 定，同候选栏）；名词知道阴阳性就写进缩写（n. m. / n. f.），不知道时几组名词义项仍写冠词好分辨（Subst. der / Subst. die）
        var code = state.pickLangs[i] || app.model.itemLang(p) || state.lang, gen = g.pos.charAt(0) === "[" ? "" : app.model.senseGender(p, code, g);
        var own = multiNoun && g.pos === "n." && !gen ? CORE.articleOptions(p, CORE.senseId(g)).join(" / ") : "";
        row.setAttribute("aria-label", (langFull ? langFull + "，" : "") + app.model.posSpoken(g.pos, gen) + (own ? "，" + own : ""));
        var tag = app.model.make("span", "pos", langMark + app.model.posAbbr(code, g.pos, gen) + (own ? " " + own : ""));
        tag.setAttribute("aria-hidden", "true");
        row.appendChild(tag);
      }
      g.senses.forEach(function (sn) {
        var btn = app.model.make("button", "sense", sn);
        btn.type = "button";
        btn.setAttribute("aria-pressed", String(pressed(g, sn)));
        btn.addEventListener("click", function () {
          state.glosses[i] = sn;
          state.glossAuto[i] = false;
          state.poss[i] = CORE.senseId(g); // 记下选的是哪一组义项：冠词跟着它走（R7；同形不同性别的名词各是一组）
          el.glossCtl.value = sn;
          app.model.changed();
        });
        row.appendChild(btn);
      });
      frag.appendChild(row);
    });
    el.senseList.appendChild(frag);
    return true;
  }


  // 跨模块接口；其余函数与缓存保留在本文件闭包中。
  Object.assign(app.editor, {
    composePreview: composePreview,
    renderCtl: renderCtl,
    bindWordControl: bindWordControl,
    bindLineControl: bindLineControl,
    randomOne: randomOne,
    curCell: curCell,
    renderCand: renderCand,
    leaveWordCtl: leaveWordCtl,
    leaveLineCtl: leaveLineCtl
  });
})(window.Backronym);
