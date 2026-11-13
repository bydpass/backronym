/* 藏头 - Backronym：端能力、完成面板与导出。ES2017 经典脚本。 */
(function (app) {
  "use strict";
  app.publish = {};
  var CORE = app.model.CORE, state = app.model.state, el = app.model.el, capitalize = app.model.capitalize;

  // ---------- 小红书端能力 ----------

  function miniTool(name) {
    var m = window.xhs && window.xhs.miniTool;
    return m && typeof m[name] === "function" ? m : null;
  }

  // 端能力调用都加超时（within）：超时按失败抛出，界面不会卡在「保存中…」。超时后那次调用若迟到完成，不再理会
  async function viaTool(promise, ms) {
    var settled = false;
    var r = await app.draft.within(Promise.resolve(promise).then(function (v) { settled = true; return v; }), ms);
    if (!settled) throw { errMsg: "等了很久没有响应，请稍后再试" };
    return r;
  }

  // 大图先落成临时文件，失败（含超时）就退回 data URL
  async function toFilePath(dataUrl) {
    var m = miniTool("writeTempFile");
    if (!m) return dataUrl;
    try {
      return (await viaTool(m.writeTempFile({ data: dataUrl }), 15000)).filePath;
    } catch (e) {
      return dataUrl;
    }
  }

  async function onSave() {
    var m = miniTool("saveImageToPhotosAlbum");
    if (!m || app.publish.busy || !state.outputs.length) return;
    setBusy(true);
    var done = 0, epoch = app.draft.draftEpoch;
    try {
      for (var i = 0; i < state.outputs.length; i++) {
        var path = await toFilePath(state.outputs[i]);
        if (epoch !== app.draft.draftEpoch || app.draft.checkDraftExpiry()) return;
        await viaTool(m.saveImageToPhotosAlbum({ filePath: path }), 60000); // 首次保存要等用户点相册权限
        done++;
      }
      if (epoch !== app.draft.draftEpoch) return;
      say(el.finMsg, "已保存 " + done + " 张到相册");
    } catch (e) {
      if (epoch !== app.draft.draftEpoch) return;
      say(el.finMsg, "保存了 " + done + " 张后失败：" + ((e && e.errMsg) || "请检查相册权限"));
    }
    setBusy(false);
  }

  async function onPost() {
    var m = miniTool("postNote");
    if (!m || app.publish.busy || !state.outputs.length) return;
    setBusy(true);
    var epoch = app.draft.draftEpoch;
    var words = state.picks.map(function (p) { return capitalize(p[0]); }).join(" · ");
    try {
      var images = [];
      for (var i = 0; i < state.outputs.length; i++) {
        var path = await toFilePath(state.outputs[i]);
        if (epoch !== app.draft.draftEpoch || app.draft.checkDraftExpiry()) return;
        images.push({ url: path });
      }
      await viaTool(m.postNote({
        title: CORE.noteTitle(el.title.textContent, state.letters.join("")), // 留空用单词，否则标题纯文字截 20 字（D17）
        content: state.letters.join("") + " = " + words,
        pageType: "photo_publish",
        mediaInfo: { image_resources: images },
      }), 30000);
    } catch (e) {
      if (epoch !== app.draft.draftEpoch) return;
      say(el.finMsg, "没能打开发布页：" + ((e && e.errMsg) || "请稍后再试"));
    }
    if (epoch === app.draft.draftEpoch) setBusy(false);
  }


  // ---- 完成面板与导出（D9 / D16，T18） ----
  // 顶部栏「完成」→ 先检查（有问题就跳到那一格那一个字段，不弹面板）→ 通过后弹底部面板，自动开始逐张导出；导出完才有「保存到相册」「发布笔记」
  // （浏览器里没有端能力，换成「导出图片」→ 全屏导出结果页）。导出的色板在点「完成」那一刻取一次（D19）；面板盖住整个页面（透明遮罩），
  // 导出 / 保存中不接受任何编辑，所以图和卡一致。导出、保存、发布共用一个 busy：顶部栏「完成」禁用并显示「保存中…」，面板按钮禁用，面板不可关，不会重入
  app.publish.busy = false;
  app.publish.finishNote = ""; // 点「完成」被拦下的原因，写在卡下提示行；任何一次编辑（changed）清掉

  // 给读屏播报 + 显示在面板消息行
  function say(node, msg) {
    node.textContent = msg;
    el.live.textContent = msg;
  }

  function setBusy(on) {
    app.publish.busy = on;
    el.finish.disabled = on;
    el.finishText.textContent = on ? "保存中…" : "完成";
    el.finish.setAttribute("aria-busy", String(on));
    syncFinishBtns();
  }

  // 保存 / 发布只在小红书里有；两样都没有（浏览器）就只给「导出图片」
  function syncFinishBtns() {
    var hasSave = !!miniTool("saveImageToPhotosAlbum"), hasPost = !!miniTool("postNote"), ready = !app.publish.busy && state.outputs.length > 0;
    el.save.hidden = !hasSave;
    el.post.hidden = !hasPost;
    el.exportView.hidden = hasSave || hasPost;
    el.save.disabled = el.post.disabled = el.exportView.disabled = !ready;
  }

  // done 张已画完（共 total 张）：右上角「正在画第几张 / 共几张」，进度条按已画完的比例
  function showProgress(done, total) {
    el.finCount.textContent = Math.min(done + 1, total) + " / " + total;
    var pct = total ? Math.round(done * 100 / total) : 0;
    el.finBar.style.width = pct + "%";
    el.finProg.setAttribute("aria-valuenow", String(pct));
  }

  // 点「完成」：先合法性（每格都有词、词以该字母开头），再屏蔽词；失败跳到那一格的对应字段并写原因。通过才弹面板
  function onFinish() {
    if (app.draft.checkDraftExpiry() || app.publish.busy || !el.finishPanel.hidden) return;
    var n = state.letters.length, why = "", at = -1, left = 0, art = false;
    if (!n) why = "先输入一个单词";
    for (var i = 0; i < n; i++) {
      var st = app.model.cellState(i);
      if (st === "ok") continue;
      left++;
      if (at < 0 && st === "art") { at = i; art = true; why = "第 " + (i + 1) + " 格的冠词还没选：在下面的「冠词」一行选一个"; }
      if (at < 0) { at = i; why = "第 " + (i + 1) + " 格" + (st === "empty" ? "还没有词：打一个以 " + CORE.startText(state.letters[i]) + " 开头的词" : "的词不是以 " + CORE.startText(state.letters[i]) + " 开头，改一下再完成"); }
    }
    if (left > 1) why += "（共 " + left + " 格未完成）"; // 一次说清总数，先带去第一格
    if (at >= 0) { app.model.setFocus(at); app.model.focusId(art ? "glossCtl" : "wordCtl"); } // 冠词在义项栏里选：焦点落到释义框，栏随之打开
    else if (!n) app.draft.focusEntry();
    else if (window.LANGPACK && state.langs.some(function (c) { return !(window.LANGPACK.has(c, "block") && window.LANGPACK.has(c, "words")); })) { // 加载契约 ①：屏蔽词表没就绪不能导出 / 发布；词库没到时不知道哪些词要选冠词，同样先不放行（R8）
      var lag = state.langs.filter(function (c) { return !(window.LANGPACK.has(c, "block") && window.LANGPACK.has(c, "words")); })[0]; // 选了几门语言：有一门没就绪就先不放行，写明是哪一门
      why = app.model.langName(lag) + "的" + (window.LANGPACK.has(lag, "words") ? "屏蔽词表" : "词库") + "还没加载好，稍后再点「完成」";
      app.entry.loadLang(lag);
    } else {
      var bad = app.model.findBlocked();
      if (bad) {
        if (bad[3] >= 0 && bad[3] !== state.focus) app.model.setFocus(bad[3]); // 只有当前格的输入框在页面上
        app.model.focusId(bad[2]); // 先跳过去（列阵会切回单图，changed() 会清提示），再写原因
        why = CORE.BLOCKED_MSG; // T40 / U14：焦点已跳到出问题的框，提示不复述内容、不点名字段
      }
    }
    if (why) {
      app.publish.finishNote = why;
      el.live.textContent = why;
      app.view.renderPager();
      return;
    }
    openFinishPanel();
  }

  function openFinishPanel() {
    var palette = app.view.currentPalette(); // 点下去那一刻取一次，整批用同一套色板（D19）
    var n = state.letters.length, single = state.view === "single";
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur(); // 收键盘
    state.outputs = [];
    var sheets = app.model.sheets().length; // T42：超过 10 格的列阵分两张导出
    el.finTitle.textContent = "导出 " + (single ? n + " 张单图" : "列阵" + (sheets > 1 ? "（" + sheets + " 张）" : "")) + (window.THEME && window.THEME.isDark() ? "（深色）" : "");
    showProgress(0, single ? n : sheets);
    el.finMsg.textContent = "";
    resetPreview();
    el.finishPanel.hidden = false;
    setBusy(true);
    el.finishPanel.firstElementChild.focus();
    runExport(palette);
  }

  async function runExport(palette) {
    var urls = [], epoch = app.draft.draftEpoch;
    try {
      urls = await exportAll(palette, showProgress);
      if (epoch !== app.draft.draftEpoch) return;
      state.outputs = urls;
      renderThumbs(urls);
      say(el.finMsg, "已导出 " + urls.length + " 张"); // T43（U15：不强制先看）；T49：浏览器里的长按 / 右键说明在导出结果页
    } catch (e) {
      if (epoch !== app.draft.draftEpoch) return;
      state.outputs = [];
      say(el.finMsg, "导出失败，可能是手机内存不够：少放几张配图或换短一点的单词再试");
    }
    setBusy(false);
    if (urls.length) (el.save.hidden ? el.exportView.hidden ? el.post : el.exportView : el.save).focus(); // 导出完把焦点交给第一个可用的按钮
  }

  // 逐张 1080 画布 → paintBoxes → toDataURL → 立即释放，10 张单图不会同时占着内存。onProgress(已画完几张, 共几张)
  async function exportAll(palette, onProgress) {
    var n = state.letters.length, epoch = app.draft.draftEpoch;
    var jobs = state.view === "single"
      ? state.letters.map(function (l, i) { return function () { return app.view.drawCard(i, palette); }; })
      : app.model.sheets().map(function (sh) { return function () { return app.view.drawGrid(palette, sh); }; }); // T42：每张一个任务，顺序固定
    var urls = [];
    onProgress(0, jobs.length);
    await app.view.ensureFonts();
    for (var k = 0; k < jobs.length; k++) {
      await new Promise(function (ok) { setTimeout(ok, 20); }); // 让进度先画出来再开始下一张
      if (epoch !== app.draft.draftEpoch || app.draft.checkDraftExpiry()) throw new Error("草稿已过期");
      var canvas = jobs[k]();
      var url = canvas.toDataURL("image/jpeg", 0.92);
      canvas.width = canvas.height = 0;
      if (url.length < 1000) throw new Error("空白图"); // 内存不够时 toDataURL 可能不报错、只返回 "data:,"
      urls.push(url);
      onProgress(k + 1, jobs.length);
    }
    return urls;
  }

  function closeFinishPanel() {
    if (app.publish.busy) return;
    el.finishPanel.hidden = true;
    state.outputs = []; // 内存里的 data URL 不留
    el.resList.textContent = "";
    resetPreview();
    el.finish.focus();
  }

  // 导出图的替代文字（导出结果页、缩略图、大图共用）
  function altFor(k) {
    var n = state.letters.length;
    if (state.view === "single") return app.title.titleOrWord() + "，第 " + (k + 1) + "/" + n + " 张：" + app.view.caseText(k);
    var sh = app.model.sheets(), r = sh[k] || [0, n], cells = [];
    for (var j = r[0]; j < r[1]; j++) cells.push(app.view.caseText(j));
    return app.title.titleOrWord() + (sh.length > 1 ? "，第 " + (k + 1) + "/" + sh.length + " 张" : "") + "：" + cells.join("；");
  }
  // 缩略图下的字：单图写字母；列阵写「列阵」，分图时写起止格（T42：「01–07」）
  function shotName(k) {
    if (state.view === "single") return state.letters[k];
    var sh = app.model.sheets(), two = function (x) { return (x < 10 ? "0" : "") + x; };
    return sh.length > 1 ? two(sh[k][0] + 1) + "–" + two(sh[k][1]) : "列阵";
  }

  // T43：导出完成后的缩略图条。直接用 state.outputs 里的 data URL（不另画一遍），CSS 缩小显示
  var viewAt = -1, viewFrom = null;
  function renderThumbs(urls) {
    el.finThumbs.textContent = "";
    urls.forEach(function (url, k) {
      var li = app.model.make("li"), b = app.model.make("button", "thumb"), img = document.createElement("img");
      b.type = "button";
      b.setAttribute("aria-label", "第 " + (k + 1) + " 张" + (state.view === "single" ? "，字母 " + state.letters[k] : shotName(k) === "列阵" ? "，列阵" : "，列阵第 " + shotName(k) + " 格") + "，点开看大图");
      img.src = url; img.alt = "";
      b.appendChild(img);
      b.appendChild(app.model.make("span", null, (k + 1) + " " + shotName(k)));
      b.addEventListener("click", function () { openViewer(k, b); });
      li.appendChild(b);
      el.finThumbs.appendChild(li);
    });
    el.finThumbs.hidden = !urls.length;
  }

  function openViewer(k, from) {
    viewFrom = from || null;
    el.viewer.hidden = false;
    showShot(k);
    el.viewClose.focus();
  }
  function showShot(k) {
    var urls = state.outputs, n = urls.length;
    if (!n) return;
    viewAt = (k + n) % n;
    el.viewImg.src = urls[viewAt];
    el.viewImg.alt = altFor(viewAt);
    el.viewTitle.textContent = "第 " + (viewAt + 1) + " / " + n + " 张 · " + shotName(viewAt);
    el.viewPrev.disabled = el.viewNext.disabled = n < 2;
    Array.prototype.forEach.call(el.finThumbs.querySelectorAll(".thumb"), function (b, i) { b.classList.toggle("seen", i === viewAt); });
  }
  function stepShot(d) { if (!el.viewer.hidden) showShot(viewAt + d); }
  // 关掉大图：焦点回到当前这张的缩略图（换过张就是换到的那张），缩略图条滚到它
  function closeViewer() {
    if (el.viewer.hidden) return;
    el.viewer.hidden = true;
    el.viewImg.removeAttribute("src");
    var b = el.finThumbs.querySelectorAll(".thumb")[viewAt] || viewFrom;
    viewFrom = null; // B4-S2：焦点交回后不再持有按钮引用
    if (b) { b.focus(); if (b.scrollIntoView) b.scrollIntoView({ block: "nearest", inline: "nearest" }); }
  }

  // 预览状态一并清掉（开 / 关完成面板、草稿重载）：缩略图、大图里的 data URL、当前张号与按钮引用都不留（B4-S2）
  function resetPreview() {
    el.finThumbs.textContent = ""; el.finThumbs.hidden = true;
    el.viewer.hidden = true; el.viewImg.removeAttribute("src");
    viewAt = -1; viewFrom = null;
  }

  // 没有端能力时的全屏「导出结果」页：逐张列出，长按或右键图片保存
  function showBrowserResults(urls) {
    el.resList.textContent = "";
    urls.forEach(function (url, k) {
      var fig = app.model.make("figure", "res-item"), img = document.createElement("img");
      img.src = url;
      img.alt = altFor(k);
      fig.appendChild(img);
      fig.appendChild(app.model.make("figcaption", null, (k + 1) + " / " + urls.length + (k === 0 && urls.length > 1 ? "　向下滚动看其余 " + (urls.length - 1) + " 张" : "")));
      el.resList.appendChild(fig);
    });
    el.resCount.textContent = "　" + urls.length + " 张";
    el.results.hidden = false;
    el.results.scrollTop = 0;
    el.resClose.focus();
  }

  function closeResults() {
    el.results.hidden = true;
    el.resList.textContent = "";
    el.exportView.focus();
  }


  // 跨模块接口；其余函数与缓存保留在本文件闭包中。
  Object.assign(app.publish, {
    miniTool: miniTool,
    setBusy: setBusy,
    onFinish: onFinish,
    onSave: onSave,
    onPost: onPost,
    showBrowserResults: showBrowserResults,
    closeFinishPanel: closeFinishPanel,
    closeResults: closeResults,
    stepShot: stepShot,
    closeViewer: closeViewer,
    resetPreview: resetPreview
  });
})(window.Backronym);
