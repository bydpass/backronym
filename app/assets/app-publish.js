/* 藏头 - Backronym：端能力、完成面板与导出。ES2017 经典脚本。 */
(function (app) {
  "use strict";
  var STR = window.I18N.t; // 界面文案到 i18n.js 取，代码里只写编号（v00.04.00 批 0）
  app.publish = {};
  var CORE = app.model.CORE, state = app.model.state, el = app.model.el;

  // ---------- 小红书端能力 ----------

  function miniTool(name) {
    var m = window.xhs && window.xhs.miniTool;
    return m && typeof m[name] === "function" ? m : null;
  }

  // 端能力调用都加超时（within）：超时按失败抛出，界面不会卡在「保存中…」。超时后那次调用若迟到完成，不再理会
  async function viaTool(promise, ms) {
    var settled = false;
    var r = await app.draft.within(Promise.resolve(promise).then(function (v) { settled = true; return v; }), ms);
    if (!settled) throw { errMsg: STR("pub.timeout") };
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

  // 保存到相册 / 发布笔记的结果用统一的 Toast 报（2026-11-17 真机反馈：按钮下的注文不够醒目）。失败多停一会儿
  // 读屏仍走常驻的 #live（原先 say() 的路径）：#toast 空着时是 display:none，有的读屏不播报刚出现的提示区
  function result(msg) { app.model.showToast(msg, /失败|没能/.test(msg) ? 5000 : 3000); el.live.textContent = msg; }

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
      result(STR("pub.saved", { n: done }));
    } catch (e) {
      if (epoch !== app.draft.draftEpoch) return;
      result(STR("pub.savedPartial", { n: done, why: (e && e.errMsg) || STR("pub.checkPerm") }));
    }
    setBusy(false);
  }

  async function onPost() {
    var m = miniTool("postNote");
    if (!m || app.publish.busy || !state.outputs.length) return;
    setBusy(true);
    var epoch = app.draft.draftEpoch;
    var words = state.picks.map(function (p, i) { return app.model.displayWord(i); }).join(" · "); // 与卡面同一套大小写（德语等保留）
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
      result(STR("pub.postFail", { why: (e && e.errMsg) || STR("pub.later") }));
    }
    if (epoch === app.draft.draftEpoch) setBusy(false);
  }


  // ---- 完成面板与导出（D9 / D16，T18） ----
  // 顶部栏「完成」→ 先检查（有问题就跳到那一格那一个字段，不弹面板）→ 通过后弹底部面板，自动开始逐张导出；导出完才有「保存到相册」「发布笔记」
  // （浏览器里没有端能力，换成「导出图片」→ 直接下载 zip，下载不可用才开全屏导出结果页）。导出的色板在点「完成」那一刻取一次（D19）；面板盖住整个页面（透明遮罩），
  // 导出 / 保存中不接受任何编辑，所以图和卡一致。导出、保存、发布共用一个 busy：顶部栏「完成」禁用并显示「保存中…」，面板按钮禁用，面板不可关，不会重入
  app.publish.busy = false;
  app.publish.finishLag = ""; // finishNote 说的是哪门语言还没加载好（别的原因为空）；那门语言到了，prepareLang 据此清掉提示（V003-B4-R11）
  app.publish.finishNote = ""; // 点「完成」被拦下的原因，写在卡下提示行；任何一次编辑（changed）清掉

  // 给读屏播报 + 显示在面板消息行
  function say(node, msg) {
    node.textContent = msg;
    el.live.textContent = msg;
  }

  function setBusy(on) {
    app.publish.busy = on;
    el.finish.disabled = on;
    el.finishText.textContent = on ? STR("common.saving") : STR("pub.finish");
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
    if (!n) why = STR("common.needWord");
    for (var i = 0; i < n; i++) {
      var st = app.model.cellState(i);
      if (st === "ok") continue;
      left++;
      if (at < 0 && st === "art") { at = i; art = true; why = STR("pub.artPending", { n: i + 1 }); }
      if (at < 0) { at = i; why = STR(st === "empty" ? "pub.cellEmpty" : "pub.cellBad", { n: i + 1, s: CORE.startText(state.letters[i]) }); }
    }
    if (left > 1) why += STR("pub.leftMore", { n: left }); // 一次说清总数，先带去第一格
    if (at >= 0) { app.model.setFocus(at); app.model.focusId(art ? "glossCtl" : "wordCtl"); } // 冠词在义项栏里选：焦点落到释义框，栏随之打开
    else if (!n) app.draft.focusEntry();
    else if (window.LANGPACK && state.langs.some(function (c) { return !(window.LANGPACK.has(c, "block") && window.LANGPACK.has(c, "words")); })) { // 加载契约 ①：屏蔽词表没就绪不能导出 / 发布；词库没到时不知道哪些词要选冠词，同样先不放行（R8）
      var lag = state.langs.filter(function (c) { return !(window.LANGPACK.has(c, "block") && window.LANGPACK.has(c, "words")); })[0]; // 选了几门语言：有一门没就绪就先不放行，写明是哪一门
      why = STR(window.LANGPACK.has(lag, "words") ? "pub.blockNotReady" : "pub.wordsNotReady", { lang: app.model.langName(lag) });
      app.entry.loadLang(lag);
    } else {
      var bad = app.model.findBlocked();
      if (bad) {
        if (bad[3] >= 0 && bad[3] !== state.focus) app.model.setFocus(bad[3]); // 只有当前格的输入框在页面上
        app.model.focusId(bad[2]); // 先跳过去（列阵会切回单图，changed() 会清提示），再写原因
        why = CORE.BLOCKED_MSG; // T40 / U14：焦点已跳到出问题的框，提示不复述内容、不点名字段
      }
    }
    app.publish.finishLag = why && lag ? lag : ""; // 提示说的是哪门语言还没加载好（其余原因为空）：它到了由 prepareLang 清掉这句提示
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
    el.finTitle.textContent = STR("fin.title", { what: single ? STR("fin.singles", { n: n }) : sheets > 1 ? STR("fin.gridN", { n: sheets }) : STR("fin.grid"), dark: window.THEME && window.THEME.isDark() ? STR("fin.dark") : "" });
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
      say(el.finMsg, STR("pub.exported", { n: urls.length })); // T43（U15：不强制先看）；浏览器里点「导出图片」直接下载 zip（11-23）
    } catch (e) {
      if (epoch !== app.draft.draftEpoch) return;
      state.outputs = [];
      say(el.finMsg, STR("pub.exportFail"));
    }
    setBusy(false);
    if (urls.length) (el.save.hidden ? el.exportView.hidden ? el.post : el.exportView : el.save).focus(); // 导出完把焦点交给第一个可用的按钮
  }

  // 导出倍率（v00.03.01 R06，用户 11-18 定）：1080 制版式按 1.5 倍画（单图 1620×2160）。取证：3 倍屏 393 宽的手机上卡占 1179 物理像素，
  // 1080 宽的导出图显示时被放大约 9%，看着比编辑面糊；JPEG 0.92 与 PNG 对比几乎无差，原因在分辨率不在压缩
  var EXPORT_SCALE = 1.5;
  // 逐张画布（1080 制 × EXPORT_SCALE）→ paintBoxes → toDataURL → 立即释放，10 张单图不会同时占着内存。onProgress(已画完几张, 共几张)
  async function exportAll(palette, onProgress) {
    var n = state.letters.length, epoch = app.draft.draftEpoch;
    var jobs = state.view === "single"
      ? state.letters.map(function (l, i) { return function (scale) { return app.view.drawCard(i, palette, scale); }; })
      : app.model.sheets().map(function (sh) { return function (scale) { return app.view.drawGrid(palette, sh, scale); }; }); // T42：每张一个任务，顺序固定；scale 由下面的循环给
    var urls = [];
    onProgress(0, jobs.length);
    await app.view.ensureFonts();
    for (var k = 0; k < jobs.length; k++) {
      await new Promise(function (ok) { setTimeout(ok, 20); }); // 让进度先画出来再开始下一张
      if (epoch !== app.draft.draftEpoch || app.draft.checkDraftExpiry()) throw new Error(STR("pub.errExpired"));
      // 先按 EXPORT_SCALE 画；内存不够（抛错，或 toDataURL 只返回 "data:," 这类空图）时自动、静默退回 1 倍再画这一张（用户 11-18 定）
      var url = "";
      for (var s = 0; s < 2 && url.length < 1000; s++) {
        var canvas = null;
        try { canvas = jobs[k](s ? 1 : EXPORT_SCALE); url = canvas.toDataURL("image/jpeg", 0.92); } catch (e) { url = ""; if (s) throw e; }
        if (canvas) canvas.width = canvas.height = 0;
      }
      if (url.length < 1000) throw new Error(STR("pub.errBlank")); // 1 倍也画不出来：照旧报错
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
    if (state.view === "single") return STR("alt.sheet", { title: app.title.titleOrWord(), k: k + 1, n: n, text: app.view.caseText(k) });
    var sh = app.model.sheets(), r = sh[k] || [0, n], cells = [];
    for (var j = r[0]; j < r[1]; j++) cells.push(app.view.caseText(j));
    return sh.length > 1 ? STR("alt.sheet", { title: app.title.titleOrWord(), k: k + 1, n: sh.length, text: cells.join(STR("sep.semi")) }) : STR("alt.one", { title: app.title.titleOrWord(), text: cells.join(STR("sep.semi")) });
  }
  // 缩略图下的字：单图写字母；列阵写「列阵」，分图时写起止格（T42：「01–07」）
  function shotName(k) {
    if (state.view === "single") return state.letters[k];
    var sh = app.model.sheets(), two = function (x) { return (x < 10 ? "0" : "") + x; };
    return sh.length > 1 ? two(sh[k][0] + 1) + "–" + two(sh[k][1]) : STR("fin.grid");
  }

  // T43：导出完成后的缩略图条。直接用 state.outputs 里的 data URL（不另画一遍），CSS 缩小显示
  var viewAt = -1, viewFrom = null;
  function renderThumbs(urls) {
    el.finThumbs.textContent = "";
    urls.forEach(function (url, k) {
      var li = app.model.make("li"), b = app.model.make("button", "thumb"), img = document.createElement("img");
      b.type = "button";
      b.setAttribute("aria-label", STR("thumb.label", { k: k + 1, what: state.view === "single" ? STR("thumb.letter", { letter: state.letters[k] }) : shotName(k) === STR("fin.grid") ? STR("fin.grid") : STR("thumb.gridRange", { range: shotName(k) }) }));
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
    el.viewTitle.textContent = STR("viewer.title", { k: viewAt + 1, n: n, name: shotName(viewAt) });
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

  // 浏览器里点「导出图片」：把这批图打成一个 zip 直接下载（用户 11-23 定）。包以单词命名（LIFE.zip），包里的图按单词加序号（LIFE1.jpg、LIFE2.jpg…）；
  // 列阵也一样按张编号。浏览器不支持下载（无 Blob / a[download]）或打包出错时，退回下面的导出结果页
  function exportBase() { return state.letters.join("") || "backronym"; }
  function dataUrlBytes(url) {
    var bin = atob(url.slice(url.indexOf(",") + 1)), out = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }
  function zipOutputs(urls) {
    return CORE.zipStore(urls.map(function (url, k) { return { name: exportBase() + (k + 1) + ".jpg", data: dataUrlBytes(url) }; }), new Date());
  }
  function downloadOutputs(urls) {
    var a = document.createElement("a");
    if (typeof Blob !== "function" || !window.URL || !URL.createObjectURL || !("download" in a)) return showBrowserResults(urls);
    try {
      var href = URL.createObjectURL(new Blob([zipOutputs(urls)], { type: "application/zip" }));
      a.href = href;
      a.download = exportBase() + ".zip";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(function () { URL.revokeObjectURL(href); }, 60000); // 立即释放有的浏览器会下载失败；留一分钟
      result(STR("pub.downloaded", { n: urls.length }));
    } catch (e) {
      showBrowserResults(urls);
    }
  }

  // 下载不可用时的全屏「导出结果」页：逐张列出，长按或右键图片保存
  function showBrowserResults(urls) {
    el.resList.textContent = "";
    urls.forEach(function (url, k) {
      var fig = app.model.make("figure", "res-item"), img = document.createElement("img");
      img.src = url;
      img.alt = altFor(k);
      fig.appendChild(img);
      fig.appendChild(app.model.make("figcaption", null, (k + 1) + " / " + urls.length + (k === 0 && urls.length > 1 ? STR("res.scrollMore", { n: urls.length - 1 }) : "")));
      el.resList.appendChild(fig);
    });
    el.resCount.textContent = STR("res.count", { n: urls.length });
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
    downloadOutputs: downloadOutputs,
    zipOutputs: zipOutputs,
    showBrowserResults: showBrowserResults,
    closeFinishPanel: closeFinishPanel,
    closeResults: closeResults,
    stepShot: stepShot,
    closeViewer: closeViewer,
    resetPreview: resetPreview
  });
})(window.Backronym);
