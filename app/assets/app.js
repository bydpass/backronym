/* 藏头 - Backronym：事件绑定与启动。ES2017 经典脚本。 */
(function (app) {
  "use strict";
  var STR = window.I18N.t; // 界面文案到 i18n.js 取，代码里只写编号（v00.04.00 批 0）
  var state = app.model.state, el = app.model.el, CORE = app.model.CORE;

  // ---------- 绑定 ----------

  // T29：固定顶栏（及全屏页的顶栏）盖住了刚获得焦点的元素时，只滚出被盖住的那一段（WCAG 2.4.11）；没被盖住不动，打字不触发
  document.addEventListener("focusin", function (e) {
    var t = e.target, page = t.closest && t.closest(".page"), bar = page ? page.querySelector(".page-top") : el.top;
    if (!bar || bar.contains(t) || el.leavePop.contains(t) || !t.getBoundingClientRect) return;
    var over = bar.getBoundingClientRect().bottom + 8 - t.getBoundingClientRect().top;
    if (over > 0) { if (page) page.scrollTop -= over; else window.scrollBy(0, -over); }
  });
  // 焦点框只在键盘操作时显示（配合 style.css 的 .kbd）；点击/触摸立刻关掉
  document.addEventListener("keydown", function (e) {
    if (e.key === "Tab") document.documentElement.classList.add("kbd");
  });
  ["mousedown", "touchstart"].forEach(function (type) {
    document.addEventListener(type, function () { document.documentElement.classList.remove("kbd"); }, true);
  });

  // 标题框（T16）：没字时清空到底，免得删光后残留的格式（比如朱红）带进下一次输入；留空由占位显示单词，不预填任何默认句
  el.title.addEventListener("input", function () {
    if (!app.title.hasTitle() && el.title.firstChild) el.title.textContent = "";
    if (app.title.titlePasting) return;
    if (!app.title.titleComposing && app.title.rejectTitleEdit()) return;
    app.model.changed();
  });
  // 每次编辑前（beforeinput，Chrome 60+）记快照；组字从 compositionstart 记，整个组字过程共用这一份
  el.title.addEventListener("beforeinput", function () { if (!app.title.titleComposing && !app.title.titlePasting) app.title.takeTitleSnap(); });
  el.title.addEventListener("compositionstart", function () { app.title.takeTitleSnap(); app.title.titleComposing = true; });
  el.title.addEventListener("compositionend", function () { app.title.titleComposing = false; if (!app.title.rejectTitleEdit()) app.model.changed(); });
  el.title.addEventListener("focus", function () { app.title.topFocus = "title"; app.model.holdHeight(true); app.title.renderKbRow(); });
  el.title.addEventListener("blur", function (e) {
    if (e.relatedTarget && el.kbRow.contains(e.relatedTarget)) return; // 去点键盘上方一行里的自选色：那一行要留着
    // T27：iOS 点自选色时 relatedTarget 常是 null，焦点下一刻才落到取色框；晚一帧再判断，免得取色器打开时工具行先被收走
    setTimeout(function () {
      var a = document.activeElement;
      if (a === el.title || el.kbRow.contains(a)) return;
      app.title.topFocus = "";
      app.model.holdHeight(false);
      app.title.renderKbRow();
    }, 0);
  });
  // 单行标题：回车收键盘、不换行；粘贴只要纯文字（不带外部样式和图片）
  el.title.addEventListener("keydown", function (e) { if (e.key === "Enter" && !app.title.titleComposing && !e.isComposing && e.keyCode !== 229) { e.preventDefault(); el.title.blur(); } });
  el.title.addEventListener("paste", function (e) {
    e.preventDefault();
    app.title.pasteTitle((e.clipboardData || window.clipboardData).getData("text").replace(/\s+/g, " "));
  });
  document.addEventListener("selectionchange", function () {
    var sel = window.getSelection();
    if (sel.rangeCount && app.title.inTitle(sel.anchorNode)) { app.title.savedRange = sel.getRangeAt(0).cloneRange(); app.title.syncTools(); }
  });
  Array.prototype.forEach.call(el.kbTools.querySelectorAll("button.tool"), function (b) {
    b.addEventListener("click", function () {
      if (b.dataset.cmd) app.title.formatTitle(b.dataset.cmd);
      else app.title.formatTitle("foreColor", b.dataset.color === "red" ? app.view.currentPalette().red : b.dataset.color); // 「朱」随当前色板（D19），导出时存成语义值 red
    });
  });
  el.tcolorCustom.addEventListener("change", app.title.applyCustomColor);
  el.tcolorCustom.addEventListener("blur", function () {
    setTimeout(function () { if (document.activeElement !== el.title && app.title.topFocus === "title") { app.title.topFocus = ""; app.model.holdHeight(false); app.title.renderKbRow(); } }, 0);
  });
  // 键盘上方一行：按下时不抢走输入框的焦点（自选色要靠焦点打开取色器，除外）
  el.kbRow.addEventListener("mousedown", function (e) { if (e.target !== el.tcolorCustom && !el.tcolorCustom.parentNode.contains(e.target)) e.preventDefault(); });
  // 入场界面（T18）
  app.entry.bindEntryInput(el.wordInput, "word");
  app.entry.bindEntryInput(el.fillerCtl, "filler");
  el.entryStart.addEventListener("click", app.entry.submitEntry);
  el.presetMore.addEventListener("click", app.entry.morePresets);
  el.splitLeft.addEventListener("click", function () { app.entry.moveSplit(-1); }); // T42：调整分图
  el.splitRight.addEventListener("click", function () { app.entry.moveSplit(1); });
  el.splitAuto.addEventListener("click", app.entry.autoSplitAgain);
  // T30（R2）：返回箭头——无修改直接回，有修改向下展开「保存并返回 / 放弃修改 / 继续编辑」；保存按钮只在可点时生效（aria-disabled 仍可聚焦，读屏听得到）
  el.entryBack.addEventListener("click", app.entry.onEntryBack);
  el.entrySave.addEventListener("click", function () { if (el.entrySave.getAttribute("aria-disabled") !== "true") app.entry.saveEntry(false); });
  el.leaveSave.addEventListener("click", app.entry.leaveSave);
  el.leaveDrop.addEventListener("click", app.entry.dropEntry);
  el.leaveStay.addEventListener("click", app.entry.stayEntry);
  app.model.trapKeys(el.leavePop, app.entry.stayEntry); // Esc = 继续编辑，Tab 不跑出弹层
  ["mousedown", "touchstart"].forEach(function (type) { // 点弹层外 = 继续编辑（点返回箭头本身由它的 click 收起）
    document.addEventListener(type, function (e) { if (!el.leavePop.hidden && !el.leavePop.contains(e.target) && !el.entryBack.contains(e.target)) app.entry.stayEntry(); }, true);
  });
  el.toEntry.addEventListener("click", function () { app.entry.openEntry("edit"); });
  app.layout.init(); // 版式页（v00.03.03 L2）：提示行「版式」进，绑定都在 app-layout.js
  el.confKeep.addEventListener("click", app.entry.keepWord);
  el.confClear.addEventListener("click", app.entry.clearAndApply);
  app.model.trapKeys(el.wordConfirm, app.entry.keepWord);
  el.langMore.addEventListener("click", app.entry.toggleLang); // 语言栏（T20）：展开 / 收起六个单选
  // 设置页（v00.03.00）：顶栏「设置」进，关闭后焦点还给「设置」；深浅三档立刻生效并存到本设备，标题的色值跟着重建
  var modeRadios = Array.prototype.slice.call(el.modeGroup.querySelectorAll("input")), skinRadios = Array.prototype.slice.call(el.skinGroup.querySelectorAll("input"));
  var uiLangRadios = Array.prototype.slice.call(el.uiLangGroup.querySelectorAll("input"));
  var closeSettings = function () { el.settings.hidden = true; el.settingsOpen.focus(); app.model.flushToast(); };
  // 主题五选一 + 深浅三档。只有一套的主题（fandom 只有浅色、表格只有深色）选着时深浅这一组停用（原因由主题格里的「仅浅色」「仅深色」说明，用户 11-21 定去掉下面那行字）；换回别的主题恢复原来的档位
  var syncSettings = function () {
    var only = window.THEME.only(), off = !!only;
    skinRadios.forEach(function (r) { r.checked = r.value === window.THEME.skin(); });
    modeRadios.forEach(function (r) { r.checked = r.value === window.THEME.mode(); r.disabled = off; });
    el.modeGroup.classList.toggle("off", off);
    if (off) el.modeGroup.setAttribute("aria-disabled", "true"); else el.modeGroup.removeAttribute("aria-disabled");
    uiLangRadios.forEach(function (r) { r.checked = r.value === window.I18N.pref(); });
  };
  var reskin = function () { app.title.rethemeTitle(); app.view.renderShell(); app.view.applySkinFont(); };
  el.settingsOpen.addEventListener("click", function () {
    syncSettings();
    app.model.showToast("", 0); // 正在显示的提示不带进设置页（2026-11-17）
    el.settings.hidden = false;
    el.settingsClose.focus();
  });
  el.settingsClose.addEventListener("click", closeSettings);
  app.model.trapKeys(el.settings, closeSettings);
  modeRadios.forEach(function (r) {
    r.addEventListener("change", function () { if (!r.checked) return; window.THEME.setMode(r.value); reskin(); el.live.textContent = STR("set.modeSaid", { name: STR(window.THEME.LABEL[r.value]) }); });
  });
  // 界面语言（v00.04.00 批 1）：跟随系统 / 中文 / English，只存本机。各模块的字是载入时取好的，所以换语言后先把草稿落盘、再重新载入页面。
  // 等落盘最多 8 秒（真机第一轮 D1，华为 Mate 60 Pro：原来 2.5 秒不够，第一次点总报没改成、第二次才切过去；容器每次存储调用最多等 1.5 秒，一次落盘要好几次）
  var changingUiLang = false;
  uiLangRadios.forEach(function (r) {
    r.addEventListener("change", function () {
      if (!r.checked || changingUiLang) return;
      changingUiLang = true;
      uiLangRadios.forEach(function (opt) { opt.disabled = true; });
      var done = function (saved) {
        changingUiLang = false;
        uiLangRadios.forEach(function (opt) { opt.disabled = false; });
        if (saved === true && !el.settings.hidden) {
          window.I18N.setPref(r.value);
          if (window.I18N.pref() === r.value) { window.location.reload(); return; }
        }
        syncSettings();
        if (saved !== true) {
          if (!el.settings.hidden) closeSettings();
          var msg = STR(saved === "none" ? "set.langNeedsNoImage" : "draft.unconfirmedExport"); // 存不了图的设备：等也没用，说明为什么没换
          app.model.showToast(msg, 5000);
          el.live.textContent = msg;
        }
      };
      app.draft.within(app.draft.persistForReload(), 8000).then(done, function () { done(false); });
    });
  });
  skinRadios.forEach(function (r) {
    r.addEventListener("change", function () {
      if (!r.checked) return;
      window.THEME.setSkin(r.value); syncSettings(); reskin();
      for (var k = 0; k < CORE.SKINS.length; k++) if (CORE.SKINS[k][0] === r.value) el.live.textContent = STR("set.skinSaid", { name: CORE.SKINS[k][1] });
    });
  });
  var darkMq = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)");
  if (darkMq && darkMq.addListener) darkMq.addListener(app.title.rethemeTitle); // 跟随系统档下系统深浅变了
  if (window.visualViewport) {
    window.visualViewport.addEventListener("resize", app.title.placeKbRow); window.visualViewport.addEventListener("scroll", app.title.placeKbRow);
    window.visualViewport.addEventListener("resize", app.model.followToast); window.visualViewport.addEventListener("scroll", app.model.followToast);
  }
  window.addEventListener("scroll", app.model.followToast); // Toast 跟着顶栏走（T33；2026-11-17 起固定在顶栏下方）
  // 入场页两个输入框：输入期间页面同样只许变高（T28）
  [el.wordInput, el.fillerCtl].forEach(function (c) {
    c.addEventListener("focus", function () { app.model.holdHeight(true); });
    c.addEventListener("blur", function () { app.model.holdHeight(false); });
  });
  el.viewSingle.addEventListener("click", function () { app.view.setView("single"); });
  el.viewGrid.addEventListener("click", function () { app.view.setView("grid"); });
  el.finish.addEventListener("click", app.publish.onFinish);
  window.addEventListener("resize", function () {
    if (app.view.resizeRaf) return;
    // 只在宽度变了才重摆：软键盘弹出 / 收起也会触发 resize（高度变），那时不该重建卡
    app.view.resizeRaf = requestAnimationFrame(function () { app.view.resizeRaf = 0; if (el.card.clientWidth !== app.view.cardW) app.view.renderShell(); if (app.entry.entryFrom) app.entry.fitWordInput(); }); // U02：入场单词框按新宽度重算字号
  });
  app.editor.bindWordControl(el.wordCtl);
  app.editor.bindLineControl(el.glossCtl, "gloss");
  app.editor.bindLineControl(el.capCtl, "cap");
  app.view.bindSwipe(el.card, app.view.swipeCard);
  // T32：横滑有效区扩到卡下的字母栏与提示行；字母等按钮上起手不切（U3），按钮之间的空白照常可切
  [el.pager, el.hintRow].forEach(function (n) { app.view.bindSwipe(n, app.view.swipeCard, { blockOn: ".ctl, button, a, input, label", touchFirst: true }); });
  // 词下方的栏：点里面的按钮不收键盘（mousedown 默认行为是把焦点从输入框抢走）
  el.cand.addEventListener("mousedown", function (e) { e.preventDefault(); });
  el.candRandom.addEventListener("click", function () { app.editor.randomOne(app.editor.curCell()); });
  el.candNext.addEventListener("click", function () { app.editor.candPage++; app.editor.renderCand(); });
  el.candMore.addEventListener("click", function () { app.editor.more = !app.editor.more; app.editor.renderCand(); }); // 只在本次编辑里有效，不进草稿
  // 焦点从栏里离开到别处（不是回输入框）：按原输入框的离开处理收栏（单词框还要去末尾空格）
  el.cand.addEventListener("focusout", function (e) {
    var to = e.relatedTarget, ctl = app.editor.focusKind === "word" ? el.wordCtl : app.editor.focusKind === "gloss" ? el.glossCtl : null;
    if (!ctl || (to && (el.cand.contains(to) || to === ctl))) return;
    if (ctl === el.wordCtl) app.editor.leaveWordCtl(ctl); else app.editor.leaveLineCtl();
  });
  // 配图面板
  el.plateHit.addEventListener("click", function () { if (Date.now() - app.editor.lastSwipeAt > 500) app.media.openImagePanel(app.editor.curCell()); });
  el.imgClose.addEventListener("click", app.media.closeImagePanel);
  el.imgPick.addEventListener("click", function () { app.media.syncPickAccept(); el.cellPhoto.click(); });
  el.imgAdjust.addEventListener("click", function () { app.media.openCropper(state.imgIndex); });
  el.imgRemove.addEventListener("click", app.media.removeCellPhoto);
  el.cellPhoto.addEventListener("change", app.media.onCellPhoto);
  el.defPick.addEventListener("click", function () { app.media.syncPickAccept(); el.photo.click(); });
  el.defAdjust.addEventListener("click", function () { app.media.openCropper(state.imgIndex, "def", state.image, state.defaultCrops[state.imgIndex]); });
  el.defRemove.addEventListener("click", app.media.clearPhoto);
  el.photo.addEventListener("change", app.media.onPhoto);
  app.model.trapKeys(el.imgPanel, app.media.closeImagePanel);
  el.save.addEventListener("click", app.publish.onSave);
  el.post.addEventListener("click", app.publish.onPost);
  el.exportView.addEventListener("click", function () { if (!app.publish.busy && state.outputs.length) app.publish.showBrowserResults(state.outputs); });
  app.model.trapKeys(el.finishPanel, app.publish.closeFinishPanel);
  el.resClose.addEventListener("click", app.publish.closeResults);
  // T43：大图查看——按钮、方向键、左右滑动换张；Esc / 关闭回缩略图
  el.viewClose.addEventListener("click", app.publish.closeViewer);
  el.viewPrev.addEventListener("click", function () { app.publish.stepShot(-1); });
  el.viewNext.addEventListener("click", function () { app.publish.stepShot(1); });
  el.viewer.addEventListener("keydown", function (e) { if (e.key === "ArrowLeft") app.publish.stepShot(-1); else if (e.key === "ArrowRight") app.publish.stepShot(1); });
  app.model.trapKeys(el.viewer, app.publish.closeViewer);
  (function () { // 大图上横滑换张：判断沿用 CORE.swipeDir（手指向左 = 下一张）
    var from = null, start = function (x, y) { from = [x, y]; }, end = function (x, y) { if (!from) return; var d = app.model.CORE.swipeDir(x - from[0], y - from[1]); from = null; if (d) app.publish.stepShot(d); };
    if ("ontouchstart" in window) {
      el.viewImg.addEventListener("touchstart", function (e) { if (e.touches.length === 1) start(e.touches[0].clientX, e.touches[0].clientY); else from = null; });
      el.viewImg.addEventListener("touchend", function (e) { if (e.changedTouches.length) end(e.changedTouches[0].clientX, e.changedTouches[0].clientY); });
    } else {
      el.viewImg.addEventListener("pointerdown", function (e) { start(e.clientX, e.clientY); });
      el.viewImg.addEventListener("pointerup", function (e) { end(e.clientX, e.clientY); });
      el.viewImg.addEventListener("pointercancel", function () { from = null; });
    }
  })();
  app.model.trapKeys(el.results, app.publish.closeResults);
  el.cropApply.addEventListener("click", app.media.applyCrop);
  el.cropCancel.addEventListener("click", app.media.cancelCrop);
  el.cropReset.addEventListener("click", app.media.resetCrop);
  Array.prototype.forEach.call(el.cropMoves.querySelectorAll("button[data-move]"), function (b) {
    b.addEventListener("click", function () { app.media.moveCrop(b.dataset.move); });
  });
  el.cropMinus.addEventListener("click", function () { app.media.setZoom(app.media.currentCrop().z - 0.1); });
  el.cropPlus.addEventListener("click", function () { app.media.setZoom(app.media.currentCrop().z + 0.1); });
  el.cropZoom.addEventListener("input", function () { app.media.setZoom(Number(el.cropZoom.value)); });
  el.cropCanvas.addEventListener("keydown", app.media.onCropKey);
  app.media.bindDrag(el.cropCanvas);
  app.media.bindPinch(el.cropCanvas, app.media.setZoom);
  app.model.trapKeys(el.cropper, app.media.cancelCrop); // T44：Esc / 点外面 = 取消
  var creditsFrom = el.creditsOpen; // 关掉借物页后焦点回到打开它的那个按钮（完成面板底行或设置页底行）
  var closeCredits = function () { el.credits.hidden = true; creditsFrom.focus(); app.model.flushToast(); };
  [el.creditsOpen, el.setCredits].forEach(function (b) {
    b.addEventListener("click", function () { creditsFrom = b; app.model.showToast("", 0); el.credits.hidden = false; el.creditsClose.focus(); });
  });
  el.creditsClose.addEventListener("click", closeCredits);
  // 许可全文（T07）：GPL 与三份 CC 许可共约 96 KB，不写进 index.html；展开某一项时才插一个 <script> 读 assets/licenses.js（与语言包同一种读法，离线容器里可用）。
  // 读不到（出错，或 15 秒没到）时明说，并给出许可的纯文本网址——容器里的用户打不开包内文件；收起再展开会再读一次。
  // ponytail: 请求一直挂着时，浏览器可能把再读的那次并到同一个卡住的请求上，所以提示不承诺重试能成；没给地址加参数去绕，容器的本地地址带不带得了查询串没验证过
  var LICENSE_URL = { "GPL-3.0": "gnu.org/licenses/gpl-3.0.txt", "CC-BY-SA-4.0": "creativecommons.org/licenses/by-sa/4.0/legalcode", "CC-BY-SA-3.0": "creativecommons.org/licenses/by-sa/3.0/legalcode", "CC-BY-4.0": "creativecommons.org/licenses/by/4.0/legalcode" };
  var licenseWait = null, licenseTimer = 0;
  var eachLicense = function (fn) { Array.prototype.forEach.call(el.credits.querySelectorAll("details[data-license]"), fn); };
  var fillLicenses = function () {
    eachLicense(function (d) {
      var text = window.LICENSES && window.LICENSES[d.getAttribute("data-license")], pre = d.querySelector("pre");
      if (text && d.open) { pre.lang = "en"; pre.textContent = text; }
    });
  };
  var endLicenseLoad = function () {
    clearTimeout(licenseTimer);
    if (licenseWait && licenseWait.parentNode) licenseWait.parentNode.removeChild(licenseWait);
    licenseWait = null;
    if (window.LICENSES) return fillLicenses(); // 超时那一刻全文其实已经到了也算读到
    eachLicense(function (d) {
      if (!d.open) return;
      var pre = d.querySelector("pre");
      pre.lang = "zh-CN";
      pre.textContent = STR("lic.failed", { url: LICENSE_URL[d.getAttribute("data-license")] });
    });
  };
  eachLicense(function (d) {
    d.addEventListener("toggle", function () {
      if (!d.open) return;
      if (window.LICENSES) return fillLicenses();
      if (licenseWait) return;
      eachLicense(function (o) { if (o.open) { var pre = o.querySelector("pre"); pre.lang = "zh-CN"; pre.textContent = STR("lic.loading"); } });
      var s = licenseWait = document.createElement("script");
      s.src = "assets/licenses.js";
      s.onload = function () { if (licenseWait === s) endLicenseLoad(); else fillLicenses(); }; // 超时之后才到：已经报过失败，这里把全文补上
      s.onerror = function () { if (licenseWait === s) endLicenseLoad(); };
      licenseTimer = setTimeout(function () { if (licenseWait === s) endLicenseLoad(); }, 15000);
      document.head.appendChild(s);
    });
  });
  app.model.trapKeys(el.credits, closeCredits);

  // 捕获阶段先检查，挂起后第一下输入不能把过期作品复活。
  ["beforeinput", "keydown", "pointerdown", "touchstart", "mousedown", "click", "compositionstart"].forEach(function (type) {
    document.addEventListener(type, app.draft.guardDraftEvent, true);
  });
  document.addEventListener("visibilitychange", function () {
    if (document.hidden) app.draft.flushDraft();
    else if (!app.draft.checkDraftExpiry()) app.draft.cleanExpiredDrafts();
  });
  window.addEventListener("focus", function () { if (!app.draft.checkDraftExpiry()) app.draft.cleanExpiredDrafts(); });
  window.addEventListener("storage", function (e) {
    if (e.key === window.DRAFT.KEY && app.draft.draftLoaded) app.draft.checkDraftExpiry();
  });
  window.addEventListener("pagehide", app.draft.flushDraft);

  var fontsUp = app.view.applySkinFont(); // 卡与导出用同一个字体串（D5.4），跟当前主题走
  app.entry.entryFrom = "boot"; app.entry.renderEntry(); // 先到入场界面（读草稿期间单词框禁用）；读完有单词就进编辑界面（focusEntry）
  app.model.changed();
  // 字体到位后重排一次：此前用的是回退字体的字宽和基线比例
  fontsUp.then(function () { /* applySkinFont 里已在字体到位后重画 */ });
  app.draft.restoreDraft();
  app.model.warmForms(); // 英语词包随页面就到：空闲时预读它的词形表（别的语言在词包到时各自预读，见 prepareLang）
  // T38：短语 / 合成词补充表（约 1.7 MiB）在首屏之后才加载，不拖慢启动；加载完若正在打词或在入场页，按新数据刷新一次
  // T05 起经语言包加载器（lang/en/phrases.js）；失败不重试也不提示，没加载完时 phraseHit 当查不到（与原来一致）
  setTimeout(function () {
    window.LANGPACK.loader().load("en", ["phrases"]).then(function (r) {
      // B5-R2：正在用的候选栏 / 义项栏都按新数据重画（renderCand 只读当前焦点与状态，不动输入框的值与组字；没在编辑就不画、不恢复已离开的界面）
      if (!r.ok) return;
      if (app.editor.focusKind) app.editor.renderCand(); if (app.entry.entryFrom) app.entry.renderEntry();
    });
  }, 300);

  // 各模块闭包已持有上下文；加载用入口不长期暴露在 window 上。
  delete window.Backronym;
})(window.Backronym);
