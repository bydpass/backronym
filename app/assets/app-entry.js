/* 藏头 - Backronym：入场与改单词确认。ES2017 经典脚本。 */
(function (app) {
  "use strict";
  app.entry = {};
  var CORE = app.model.CORE, state = app.model.state, el = app.model.el, blocked = app.model.blocked, capitalize = app.model.capitalize;

  // ---- 入场界面（T18，闸口 A 第 1 节；含 D3 填表人、Q2–Q6） ----
  // entryFrom：""（不在入场页）/ "boot"（没有草稿，第一次进入：主按钮「开始填充」，没有返回箭头）/ "edit"（从编辑界面进来：返回箭头 = 应用并返回）。
  // 输入只暂存在本页（#wordInput / #fillerCtl），点「开始填充」或返回箭头时统一校验（submitEntry）；通过后按最终单词调用一次 setLetters（keepSame）并保存，
  // 失败就地说明、留在本页。读草稿期间 #wordInput 是禁用的，预设和主按钮的点击由捕获阶段守卫拦下（T14）
  app.entry.entryFrom = "";
  var entryPresets = [];
  var presetsLang = ""; // 这组预设是按哪几门语言抽的：语言变了（草稿恢复、新作品回英语、换语言）就重抽，不拿上一门语言的词
  function pickEntryPresets(prev) { presetsLang = state.langs.join(","); entryPresets = prev ? CORE.pickPresets(6, null, prev) : CORE.pickPresets(6); }
  app.entry.entryComposing = false;
  var confirmCtx = null;
  app.entry.BLOCKED_WORD = CORE.BLOCKED_MSG; // T40 / U14
  var BLOCKED_HINT = CORE.BLOCKED_MSG; // U14：义项行里的屏蔽提示（不复述原词）
  // T30（R2 / U2）：改词页的显式保存。saving = 正在等的那次写入（Promise）；saveFail = 上次保存没成："write" 写入失败 / "guard" 原稿保护拦住；
  // backAfterSave = 保存成功后要返回编辑页（「保存并返回」、保存中又点返回、回车）；lastField = 上次所在的输入框（「继续编辑」把焦点还给它）
  var saving = null, saveFail = "", backAfterSave = false, lastField = null;
  // T42 / B6-R2：入场页上的分界按单词记（单词 → 前一张的格数，null = 自动），只在确认 / 保存时写进作品。
  // 打开时放入作品当前单词的已存分界；改成别的词不清掉它，打回原词（多打一个字母再删、点预设再打回、改词后取消）就还是原来的分界
  var splits = Object.create(null);
  function splitFor(w) { return w in splits ? splits[w] : null; }
  function resetSplits() { splits = Object.create(null); splits[state.letters.join("")] = state.split; }
  var SAVE_FAIL = { write: "没能保存到本设备，你的修改还在。点「重试保存」再试一次。", guard: "原稿暂时无法保全，先不保存；修改还在，可以稍后重试。" };
  app.entry.BLOCKED_FILLER = CORE.BLOCKED_MSG; // 「填入内容」对名字也通顺（U14）
  // ---- 语言栏（T20；2026-11-12 起多选）----
  // 语言属于作品，可以选几门，一律平等：候选、查词、预设词、屏蔽词表、数字格读法都按选中的各门语言合起来算（CORE.useLangs）。
  // 勾上就算选中（规则随页面已在），语言包随后加载，行内写状态；有一门没就绪就不能开始 / 保存。勾选和取消都不清空已填的内容。
  // langBusy / langFail = 正在加载 / 上次没加载成功的语言；langNote = 这次取消没做成的原因
  var langOpen = false, langBusy = Object.create(null), langFail = Object.create(null), langNote = "";
  var LANG_RULE = { de: "ß 会占两格（SS）" }; // 2026-11-12：法、西、意的「可以打 É、Ç 这类字母」删去，只留输入前必须知道的

  function openEntry(from, focusField) {
    app.entry.entryFrom = from;
    resetSplits();
    saveFail = ""; backAfterSave = false; lastField = null;
    app.draft.flushDraft(); // 编辑页还在防抖里的修改先写掉：进改词页时「保存」按钮只反映真正没写进本设备的修改
    el.wordInput.value = state.letters.join("");
    el.fillerCtl.value = state.filler || "";
    pickEntryPresets();
    langOpen = false; langNote = "";
    setEntryErr("word", ""); setEntryErr("filler", "");
    renderEntry();
    app.model.rebaseHeight(); // T28：编辑页的锁高不带进入场页
    var f = focusField === "fillerCtl" ? el.fillerCtl : el.wordInput;
    if (!f.disabled) app.model.focusBehind(f);
  }

  function closeEntry() {
    app.entry.entryFrom = "";
    saveFail = ""; backAfterSave = false;
    closeLeave();
    hideConfirm();
    renderEntry();
    app.view.renderShell();
    app.model.rebaseHeight(); // 入场页的锁高不带回编辑页
  }

  function setEntryErr(field, msg) {
    var p = field === "word" ? el.wordErr : el.fillerErr, c = field === "word" ? el.wordInput : el.fillerCtl;
    p.textContent = msg; // T28：错误行始终占一行（CSS min-height），出现 / 清除都不推动下方字段；role="alert" 区域常驻，读屏照常播报
    if (field === "word") el.wordSense.hidden = !!msg; // U10：单词的错误说明出现时，义项行让位，只留一处
    if (msg) c.setAttribute("aria-invalid", "true"); else c.removeAttribute("aria-invalid");
  }

  // 取景是否被实际改过：打开取景面板时 currentCrop 会先建默认值 { z: 1, x: 0.5, y: 0.5 }，那不算改过
  function cropEdited(c) {
    return !!c && (c.z !== 1 || c.x !== 0.5 || c.y !== 0.5);
  }

  // 改成 w 会被清空、且已经有内容的格：[{ i, letter, word, parts }]（同位置字母没变的格由 keepSame 保留，不在其中）。
  // 只调过默认图取景、没填词的格也算有内容（Astra 第 4 批验收 P2：否则缩放被静默清掉）
  function lostCells(w) {
    var out = [];
    state.letters.forEach(function (l, i) {
      if (w.charAt(i) === l) return;
      var parts = [];
      if (state.picks[i]) parts.push("词");
      if (state.glosses[i]) parts.push("释义");
      if (state.captions[i]) parts.push("配文");
      if (state.images[i]) parts.push("配图");
      if (cropEdited(state.crops[i])) parts.push("取景");
      if (parts.length) out.push({ i: i, letter: l, word: state.picks[i] ? capitalize(state.picks[i][0]) : "", parts: parts });
    });
    return out;
  }

  function renderEntry() {
    var on = !!app.entry.entryFrom, edit = app.entry.entryFrom === "edit";
    el.entry.hidden = !on;
    el.app.classList.toggle("entering", on);
    el.brand.hidden = !on || edit;
    el.entryBack.hidden = !edit;
    el.entrySave.hidden = !edit;
    if (!on) return;
    if (!entryPresets.length || presetsLang !== state.langs.join(",")) pickEntryPresets(); // 启动、18h 重载直接进来时也要有预设；按草稿恢复成别的语言后重抽
    renderLang();
    el.entryTitle.textContent = edit ? "改单词 · 填表人" : "起一个单词";
    el.entryNote.textContent = ""; // 2026-11-12：页标题下的玩法说明删去（界面本身看得出来） // T49：改词页的「返回时自动保存」说明删去，由保存按钮与返回确认表达
    el.entryStart.hidden = edit; // 从编辑界面进来：返回箭头即「应用并返回」，不再放第二个按钮做同一件事
    var w = CORE.normalizeWord(el.wordInput.value), f = el.fillerCtl.value;
    if (!app.entry.entryComposing) renderSense(w); // 组字结束后才更新，拼音阶段不闪
    el.wordCount.textContent = w.length + " / " + CORE.MAX_LETTERS + " 个字符"; // T41：含数字时「个字母」不准确
    el.fillerCount.textContent = CORE.textUnits(f).length + " / 12";
    el.fillerCtl.disabled = el.wordInput.disabled;
    // 预览将得到的格：虚下划线 = 未填；从编辑界面进来时同位置字母没变、已有词的格是实下划线（会保留）
    el.wordPreview.textContent = "";
    var cut = app.model.cutOf(w, splitFor(w)); // 没调过的单词：自动切点
    w.split("").forEach(function (l, i) { // T49：「将得到 N 格 / 已填 k / N 格」删去，实 / 虚下划线就是进度
      var keep = edit && state.letters[i] === l && !!state.picks[i];
      el.wordPreview.appendChild(app.model.make("span", "pv" + (keep ? " kept" : "") + (i === cut ? " cut" : ""), l)); // T42：切点处画竖线
    });
    renderSplit(w, cut);
    // 预设词：两行，上原词、下释义（2026-11-12 起不写连字符，见 style.css .preset），释义是这个词作为文学命题时的意思（LANG.presetGloss，人工定的小表；没有就只写词）。这门语言没有预设词表时整栏不出
    el.presetField.hidden = !entryPresets.length;
    el.presets.textContent = "";
    entryPresets.forEach(function (p) {
      var info = CORE.presetInfo(p), b = app.model.make("button", "preset"), g = info ? info.gloss : "", pw = app.model.make("b", null, p);
      pw.lang = info ? info.lang : state.lang;
      b.appendChild(pw);
      if (g) { b.appendChild(app.model.make("span", null, g)); b.setAttribute("aria-label", p + "，" + g); }
      b.type = "button";
      b.setAttribute("aria-pressed", String(p === w)); // 与单词一致的预设：实心 + aria-pressed，不只靠颜色（WCAG 1.4.1 / 4.1.2）
      b.addEventListener("click", function () { el.wordInput.value = p; setEntryErr("word", ""); renderEntry(); el.wordInput.focus(); });
      el.presets.appendChild(b);
    });
    renderSave();
  }

  // ---- 语言栏 ----
  // 一门语言的状态：ready 已就绪 / loading 正在加载 / failed 没加载成功 / ""（没选、没碰过）。选中的语言没就绪又没在加载，也算没成（给「重试」）
  function langStatus(code) {
    if (app.model.langReady(code)) return "ready";
    if (langBusy[code]) return "loading";
    return langFail[code] || state.langs.indexOf(code) >= 0 ? "failed" : "";
  }
  var LANG_ST = { ready: "已就绪", loading: "正在加载", failed: "没加载成功" };
  // 选中的语言里第一门没就绪的（没有为 ""）
  function langWaiting() { for (var k = 0; k < state.langs.length; k++) if (langStatus(state.langs[k]) !== "ready") return state.langs[k]; return ""; }
  // 语言没就绪时不能开始 / 保存：返回要写在按钮上方的原因（没有就是 ""），写明是哪一门
  function langBlock() {
    var code = langWaiting();
    if (!code) return "";
    var name = app.model.langName(code);
    return langStatus(code) === "failed" ? name + "词库没加载成功，点语言栏里的「重试」" : name + "词库还在加载，加载完就能开始";
  }
  function nameNodes(row, parent) { // 「中文 + 原文」，原文带各自的 lang
    parent.appendChild(document.createTextNode(row[1] + " "));
    var o = app.model.make("span", "lang-orig", row[2]);
    o.lang = row[0];
    parent.appendChild(o);
  }
  function renderLang() {
    var had = el.langList.contains(document.activeElement) ? document.activeElement : null;
    var hadCode = had ? had.value || had.getAttribute("data-code") : "", multi = state.langs.length > 1, wait = langWaiting();
    el.langNow.textContent = "";
    app.model.LANGS.forEach(function (row) { // 摘要行并列写出选中的语言，放不下由样式省略
      if (state.langs.indexOf(row[0]) < 0) return;
      if (el.langNow.childNodes.length) el.langNow.appendChild(document.createTextNode("、"));
      nameNodes(row, el.langNow);
    });
    // 状态：只选英语且就绪不写（随包加载）；有没就绪的写明是哪一门（多选时）；都就绪写「已就绪」
    if (wait) el.langNow.appendChild(app.model.make("span", "lang-st", " · " + (multi ? app.model.langName(wait) : "") + LANG_ST[langStatus(wait)]));
    else if (multi || state.langs[0] !== "en") el.langNow.appendChild(app.model.make("span", "lang-st", " · " + LANG_ST.ready));
    el.langMore.setAttribute("aria-expanded", String(langOpen));
    el.langMore.textContent = langOpen ? "收起" : "更多语言……";
    el.langList.hidden = !langOpen;
    el.langList.textContent = "";
    if (langOpen) app.model.LANGS.forEach(function (row) {
      var code = row[0], on = state.langs.indexOf(code) >= 0, s = langStatus(code), line = app.model.make("div", "lang-row"), lab = app.model.make("label", "lang-opt"), r = app.model.make("input");
      r.type = "checkbox"; r.value = code; r.checked = on;
      r.disabled = el.wordInput.disabled || (on && !multi); // 读草稿期间与单词框一起禁用；至少留一门
      r.addEventListener("change", function () { toggleOne(code, r.checked); });
      lab.appendChild(r);
      lab.appendChild(app.model.make("span", "ck"));
      var name = app.model.make("span", "lang-name");
      nameNodes(row, name);
      lab.appendChild(name);
      line.appendChild(lab);
      if (s && (code !== "en")) line.appendChild(app.model.make("span", "lang-st", LANG_ST[s]));
      if (s === "failed") {
        var again = app.model.make("button", "lang-retry", "重试");
        again.type = "button";
        again.setAttribute("data-code", code);
        again.setAttribute("aria-label", "重试加载" + row[1]);
        again.addEventListener("click", function () { loadLang(code); });
        line.appendChild(again);
      }
      el.langList.appendChild(line);
    });
    if (hadCode) { // 列表重建后把焦点放回原来那一项（没有了就放到它的多选框上）
      var back = el.langList.querySelector(had.type === "checkbox" ? 'input[value="' + hadCode + '"]' : '.lang-retry[data-code="' + hadCode + '"]') || el.langList.querySelector('input[value="' + hadCode + '"]');
      if (back && !back.disabled) back.focus(); else if (back) el.langMore.focus();
    }
    el.langRule.textContent = langNote || (state.langs.indexOf("de") >= 0 ? LANG_RULE.de : "");
    el.wordInput.lang = state.lang;
    el.wordInput.placeholder = multi ? "输入一个单词" : "输入一个" + app.model.langName(state.langs[0]) + "单词";
    var why = langBlock();
    el.langWait.textContent = why;
    el.entryStart.disabled = !!why;
  }
  function toggleLang() { langOpen = !langOpen; renderLang(); if (langOpen) { var c = el.langList.querySelector("input:checked:not(:disabled)") || el.langList.querySelector("input:not(:disabled)"); if (c) c.focus(); } }

  // 加载一门语言的语言包（词库、屏蔽词表；规则随页面已在）。每门语言各自加载，互不作废；done 只在成功时调用
  function loadLang(code, done) {
    langBusy[code] = true; delete langFail[code];
    if (app.entry.entryFrom) renderEntry();
    return app.model.prepareLang(code).then(function (r) {
      if (r.stale) return;
      delete langBusy[code];
      if (!r.ok) langFail[code] = true;
      if (app.entry.entryFrom) renderEntry();
      if (r.ok && done) done();
    });
  }

  // 只剩英语时英语规则不收的内容：单词里的变音字母、格里超过 20 个字符或带变音符的词。返回要写给用户的原因（没有就是 ""）
  function englishOnlyBlock() {
    var typed = el.wordInput.value, now = CORE.normalizeWord(typed);
    var why = CORE.withLang("en", function () {
      if (state.letters.some(function (c) { return CORE.normalizeWord(c) !== c; }) || CORE.normalizeWord(typed) !== now) return "单词里有英语没有的字母";
      for (var i = 0; i < state.picks.length; i++) {
        var w = state.picks[i] && state.picks[i][0];
        if (w && (CORE.textUnits(w).length > CORE.LANG.wordMax || CORE.LANG.exactKey(CORE.rewriteWord(w).value) !== CORE.LANG.exactKey(w))) return "第 " + (i + 1) + " 格的词（" + capitalize(w) + "）英语的规则放不下";
      }
      return "";
    });
    return why ? why + "，所以至少要留一门别的语言" : "";
  }

  // 勾上 / 取消一门语言。都不清空已填的内容：词和释义是已经写下的文字，只是候选里多了或少了这门语言的词。
  // 唯一拦下的情况：取消后只剩英语，而单词或某一格的词英语规则放不下
  function toggleOne(code, on) {
    if (!app.entry.entryFrom || !app.draft.draftLoaded || app.draft.checkDraftExpiry()) return;
    var next = on ? state.langs.concat([code]) : state.langs.filter(function (c) { return c !== code; });
    langNote = "";
    if (!next.length || (on && state.langs.indexOf(code) >= 0)) { renderEntry(); return; }
    if (!on && next.length === 1 && next[0] === "en") {
      langNote = englishOnlyBlock();
      if (langNote) { renderEntry(); el.live.textContent = langNote; return; }
    }
    if (!app.model.setLangs(next)) { renderEntry(); return; }
    if (on && !app.model.langReady(code)) loadLang(code);
    else if (!on) app.model.cancelLang(code);
    app.draft.quietly(function () { state.picks.forEach(function (p, i) { if (!on && state.pickLangs[i] === code) state.pickLangs[i] = ""; }); });
    pickEntryPresets();
    setEntryErr("word", "");
    app.model.changed();
    renderEntry();
    el.live.textContent = (on ? "已加上" : "已去掉") + app.model.langName(code);
  }

  // T36：单词框下的义项行。查到 → 「LIFE：生活」（与卡上默认释义同一个义项，已去名字标注）；查不到 → 明说；屏蔽词 → U14 提示，不复述原词。
  // 不设 aria-live（逐字母播报太吵），由单词框的 aria-describedby 在聚焦时读出
  function renderSense(w) {
    var t = "";
    if (w) {
      if (blocked(w)) t = BLOCKED_HINT;
      else if (/^[0-9]+$/.test(w)) { // T41 / U16：全是数字——写明每格按读法取的首字母（替代义项行）
        t = "按读法取首字母：" + w.split("").map(function (d) { return CORE.startText(d).charAt(0) + "（" + CORE.LANG.digitNames[+d] + "）"; }).join(" · ");
      } else {
        var g = CORE.defaultGloss(app.model.itemFor(w)); // itemFor 查词不分大小写
        t = g ? w + "：" + g : "词库里没有 " + w + " 的释义";
      }
    }
    el.wordSense.textContent = t;
  }

  // T42：分图说明与「调整分图」。超过 10 格才出现；手动调过就写「已手动调整」，到 3 / 10 格边界的那一侧按钮不可用
  function renderSplit(w, cut) {
    var r = CORE.splitRange(w.length), on = !!r;
    el.splitInfo.hidden = el.splitAdjust.hidden = !on;
    if (!on) { el.splitInfo.textContent = ""; return; }
    var manual = splitFor(w) != null && splitFor(w) !== app.model.autoCut(w), lw = CORE.LANG.fold(w);
    el.splitInfo.textContent = "分 2 张（" + cut + " + " + (w.length - cut) + "）· " + (manual ? "已手动调整" : "切点 " + lw.slice(0, cut) + " | " + lw.slice(cut) /* 全角「｜」不在字体子集里，用半角 */);
    el.splitLeft.disabled = cut <= r.lo;
    el.splitRight.disabled = cut >= r.hi;
    el.splitAuto.disabled = !manual;
  }
  function moveSplit(d) {
    var w = CORE.normalizeWord(el.wordInput.value), r = CORE.splitRange(w.length);
    if (!r) return;
    var c = app.model.cutOf(w, splitFor(w)) + d;
    if (c < r.lo || c > r.hi) return;
    splits[w] = c === app.model.autoCut(w) ? null : c; // 回到自动切点就记作自动
    renderEntry();
  }
  function autoSplitAgain() { splits[CORE.normalizeWord(el.wordInput.value)] = null; renderEntry(); el.splitLeft.focus(); }

  // T39：「换一组」——重抽 6 个、避开当前这组；不动单词框，焦点留在按钮上（不弹软键盘），读屏播报
  function morePresets() {
    pickEntryPresets(entryPresets);
    renderEntry();
    el.live.textContent = "已换一组预设";
  }

  // ---- T30：保存按钮与返回确认 ----
  function entryValues() { return { w: CORE.normalizeWord(el.wordInput.value), f: el.fillerCtl.value.replace(/^\s+|\s+$/g, "") }; }
  // 待应用：本页的单词 / 填表人与作品不同
  function entryDirty() {
    if (app.entry.entryFrom !== "edit") return false;
    var v = entryValues();
    return v.w !== state.letters.join("") || v.f !== (state.filler || "") || (v.w === state.letters.join("") && splitFor(v.w) !== state.split); // T42：只调了分界也算修改
  }
  // 有待应用或尚未写进本设备的修改（不能因为「输入 = 内存里的作品」就当成已保存）
  function entryPending() { return entryDirty() || app.draft.unsavedNow(); }

  // 保存按钮五态：无修改（aria-disabled，虚线框）/ 有修改（实心）/ 保存中…（aria-busy）/ 失败或阻塞 → 「重试保存」；已保存 = 回到无修改 + Toast
  function renderSave() {
    var edit = app.entry.entryFrom === "edit";
    el.entrySave.hidden = !edit;
    if (!edit) { el.entrySaveMsg.textContent = el.entryWait.textContent = ""; return; }
    var busy = !!saving, can = !busy && entryPending() && !langBlock(); // 语言没就绪不能保存（原因写在语言栏与按钮上方）
    el.entrySaveText.textContent = busy ? "保存中…" : saveFail && can ? "重试保存" : "保存";
    el.entrySave.setAttribute("aria-disabled", String(!can));
    el.entrySave.setAttribute("aria-busy", String(busy));
    el.entrySave.classList.toggle("on", can);
    el.entrySaveMsg.textContent = saveFail && can ? SAVE_FAIL[saveFail] : "";
    el.entryWait.textContent = busy && backAfterSave ? "正在保存，保存好就返回" : "";
  }

  // 校验（与「开始填充」同一套）：失败就地说明并把焦点交给出错字段，返回 null
  function validateEntry() {
    var v = entryValues();
    setEntryErr("word", ""); setEntryErr("filler", "");
    if (!v.w) { setEntryErr("word", "先输入一个单词"); el.wordInput.focus(); return null; }
    if (blocked(v.w)) { setEntryErr("word", app.entry.BLOCKED_WORD); el.wordInput.focus(); return null; } // 说明不复述被拦的词
    if (blocked(v.f)) { setEntryErr("filler", app.entry.BLOCKED_FILLER); el.fillerCtl.focus(); return null; }
    return v;
  }

  // 「保存」/「保存并返回」/ 回车（back = 成功后返回编辑页）。保存中再按：只记下「成功后返回」，不重复提交（U2）
  function saveEntry(back) {
    if (app.entry.entryFrom !== "edit" || !app.draft.draftLoaded || app.draft.checkDraftExpiry()) return;
    if (langBlock()) return;
    if (saving) { if (back) { backAfterSave = true; renderSave(); } return; }
    if (entryDirty()) {
      var v = validateEntry();
      if (!v) return;
      var lost = lostCells(v.w);
      if (lost.length) { showConfirm(v.w, v.f, lost, back ? "saveBack" : "save"); return; } // 会清空已填格：照旧先确认，确认后才进入保存中
      commitEntry(v.w, v.f);
    } else if (!app.draft.unsavedNow()) { if (back) leaveEntry(); return; } // 没什么可存
    persist(back);
  }

  // 等这一版真正写进本设备。成功：留在本页 + Toast「已保存」（或按要求返回）；失败 / 阻塞：修改保留，按钮变「重试保存」，页内说明原因。
  // 等待期间又改了本页：结果只确认它自己那一版——不说「已保存」，按钮回到「有修改」（迟到结果不替新修改作证）
  function persist(back) {
    backAfterSave = back; saveFail = "";
    var p = saving = app.draft.persistNow();
    renderSave();
    p.then(function (r) {
      if (saving !== p) return;
      saving = null;
      if (app.entry.entryFrom !== "edit") return; // 期间作品过期重载：已回入场界面
      var go = backAfterSave;
      backAfterSave = false;
      if (r.ok) {
        saveFail = "";
        var dirty = entryDirty();
        if (go && !dirty) { leaveEntry(); return; }
        if (!dirty) app.model.showToast("已保存", 2500); // U1
        renderSave();
        if (go) openLeave(); // 保存期间又改了：还有没存的，返回前照样问
        return;
      }
      saveFail = r.reason === "guard" ? "guard" : "write";
      renderSave();
      if (!el.entrySave.contains(document.activeElement)) el.entrySave.focus(); // 「保存并返回」没成：焦点交给可重试的按钮，说明由 role="alert" 读出
    });
  }

  function commitEntry(w, f) {
    var prev = state.letters;
    if (w !== prev.join("")) {
      for (var i = 0; i < Math.max(prev.length, w.length); i++) if (prev[i] !== w.charAt(i)) app.media.bumpImg("cell:" + i);
      app.model.setLetters(w);
    }
    state.filler = f;
    state.split = splitFor(w); // T42：入场页上这个单词的分界随确认写入作品（没调过 = 自动）
    app.model.changed();
    renderEntry();
  }

  function leaveEntry() {
    closeEntry();
    el.toEntry.focus(); // 回到入口，键盘用户不迷路
  }

  // 返回箭头：保存中 → 等结果再走（U2，不弹确认）；没有待应用也没有未写入的修改 → 直接回；否则向下展开三选一
  function onEntryBack() {
    if (app.entry.entryFrom !== "edit") return;
    if (!el.leavePop.hidden) { stayEntry(); return; }
    if (saving) { backAfterSave = true; renderSave(); return; }
    if (!entryPending()) { leaveEntry(); return; }
    openLeave();
  }

  function openLeave() {
    var v = entryValues(), oldW = state.letters.join(""), oldF = state.filler || "";
    el.leaveDiff.textContent = "";
    [["单词", oldW, v.w], ["填表人", oldF, v.f]].forEach(function (r) {
      var shown = function (t) { return t || "（空）"; };
      el.leaveDiff.appendChild(app.model.make("li", null, r[0] + " " + (r[1] === r[2] ? shown(r[1]) + "（未改）" : shown(r[1]) + " → " + shown(r[2]))));
    });
    if (!entryDirty()) el.leaveDiff.appendChild(app.model.make("li", null, "已应用的修改还没写进本设备"));
    app.model.showToast(""); // B2-R2：做决定时旧提示（如刚才的「已保存」）已过时，先清掉，不遮确认层；保存失败的说明在页内 #entrySaveMsg，不受影响
    el.leavePop.hidden = false;
    el.entryBack.setAttribute("aria-expanded", "true");
    el.leaveStay.focus(); // 初始焦点在最安全的「继续编辑」；视觉主按钮是实心的「保存并返回」（U2）
  }

  function closeLeave() {
    el.leavePop.hidden = true;
    el.entryBack.setAttribute("aria-expanded", "false");
  }

  // 「继续编辑」/ Esc / 点弹层外：收起，焦点回上次所在的输入框（U2），没有就回返回按钮
  function stayEntry() {
    if (el.leavePop.hidden) return;
    closeLeave();
    (lastField || el.entryBack).focus();
  }

  // 「放弃修改」：本页回到作品当前值后返回（弹层本身就是确认）。已应用、只是还没写进本设备的修改仍在作品里，草稿照常重试
  function dropEntry() {
    closeLeave();
    el.wordInput.value = state.letters.join("");
    el.fillerCtl.value = state.filler || "";
    resetSplits(); // 分界也回到作品已存的值
    setEntryErr("word", ""); setEntryErr("filler", "");
    leaveEntry();
  }

  function leaveSave() { closeLeave(); saveEntry(true); }

  function onEntryWord() {
    if (app.entry.entryComposing) return;
    var c = el.wordInput, raw = c.value, v = CORE.normalizeWord(raw);
    if (v !== raw) { // 就地改写，光标按「光标前被留下的字数」放回去，不跳到末尾
      var at = Math.min(CORE.normalizeWord(raw.slice(0, c.selectionStart)).length, v.length);
      c.value = v;
      try { c.setSelectionRange(at, at); } catch (e) { /* 取不到就算了 */ }
    }
    setEntryErr("word", "");
    renderEntry();
  }

  function bindEntryInput(c, field) {
    c.addEventListener("focus", function () { lastField = c; });
    c.addEventListener("input", function () { if (field === "word") onEntryWord(); else { setEntryErr("filler", ""); renderEntry(); } });
    c.addEventListener("compositionstart", function () { app.entry.entryComposing = true; });
    c.addEventListener("compositionend", function () { app.entry.entryComposing = false; if (field === "word") onEntryWord(); else renderEntry(); });
    c.addEventListener("keydown", function (e) {
      if (e.key !== "Enter" || e.isComposing || e.keyCode === 229) return; // 输入法选词的回车不算
      e.preventDefault();
      submitEntry();
    });
  }

  // 「开始填充」/ 回车：统一校验。单词不能为空、两样都过屏蔽器（Q6，网页版没有屏蔽器照旧放行）；新单词会清空已有内容的格时先确认（A4）。
  // 改词页（T30）里回车 = 「保存并返回」：校验、写进本设备确认后才回编辑页
  function submitEntry() {
    if (!app.entry.entryFrom || !app.draft.draftLoaded || app.draft.checkDraftExpiry()) return;
    if (app.entry.entryFrom === "edit") { saveEntry(true); return; }
    if (langBlock()) return;
    var v = validateEntry();
    if (!v) return;
    var lost = lostCells(v.w);
    if (lost.length) { showConfirm(v.w, v.f, lost, "apply"); return; }
    applyEntry(v.w, v.f);
  }

  // 一次性更新作品并保存。字母变了的位置把配图请求序号递增：还在解码的图不会落到新字母的格上（T24 观察项）
  function applyEntry(w, f) {
    var prev = state.letters, from = app.entry.entryFrom, wordChanged = w !== prev.join("");
    if (wordChanged) {
      for (var i = 0; i < Math.max(prev.length, w.length); i++) if (prev[i] !== w.charAt(i)) app.media.bumpImg("cell:" + i);
      app.model.setLetters(w);
    }
    state.filler = f;
    state.split = splitFor(w); // T42
    closeEntry();
    app.model.changed();
    if (from === "boot" || !prev.length) app.model.setFocus(state.focus, "wordCtl"); // 第一次进来：焦点交给第 1 个没填的格
    else el.toEntry.focus(); // 从编辑界面来：回到入口，键盘用户不迷路
  }

  // mode：apply = 应用并离开（首次进入）/ save = 改词页「保存」（留在本页）/ saveBack = 「保存并返回」
  function showConfirm(w, f, lost, mode) {
    var old = state.letters.join("");
    confirmCtx = { w: w, f: f, mode: mode || "apply" };
    el.confTitle.textContent = "改成 " + w + " 会清空以下 " + lost.length + " 格，不可撤销"; // U5：标题与说明并成一句，哪几格由下面的列表写明
    el.confList.textContent = "";
    lost.forEach(function (c) { el.confList.appendChild(lostRow(c)); });
    el.confClear.textContent = "清空 " + lost.length + " 格，改成 " + w;
    el.confKeep.textContent = "保留 " + old;
    el.wordConfirm.hidden = false;
    el.confKeep.focus(); // 初始焦点在安全选项（ATAG A.4.1.1 / WCAG 3.3.4）
  }

  function lostRow(c) {
    var li = app.model.make("li");
    li.appendChild(app.model.make("b", null, c.letter));
    li.appendChild(document.createTextNode(" " + (c.word ? c.word + " · " : "") + c.parts.join(" · ")));
    return li;
  }

  function hideConfirm() {
    confirmCtx = null;
    el.wordConfirm.hidden = true;
  }

  // 「保留原单词」：放弃这次改单词，单词框回到原单词，填表人的改动仍在本页，焦点回单词框
  function keepWord() {
    if (!confirmCtx) return;
    hideConfirm();
    el.wordInput.value = state.letters.join("");
    renderEntry();
    el.wordInput.focus();
  }

  function clearAndApply() {
    var c = confirmCtx;
    if (!c) return;
    hideConfirm();
    if (c.mode === "apply") { applyEntry(c.w, c.f); return; }
    commitEntry(c.w, c.f);
    persist(c.mode === "saveBack");
  }


  // 跨模块接口；其余函数与缓存保留在本文件闭包中。
  Object.assign(app.entry, {
    openEntry: openEntry,
    setEntryErr: setEntryErr,
    hideConfirm: hideConfirm,
    renderEntry: renderEntry,
    closeEntry: closeEntry,
    bindEntryInput: bindEntryInput,
    submitEntry: submitEntry,
    keepWord: keepWord,
    clearAndApply: clearAndApply,
    morePresets: morePresets,
    moveSplit: moveSplit,
    autoSplitAgain: autoSplitAgain,
    renderSave: renderSave,
    saveEntry: saveEntry,
    onEntryBack: onEntryBack,
    stayEntry: stayEntry,
    dropEntry: dropEntry,
    leaveSave: leaveSave,
    toggleLang: toggleLang,
    loadLang: loadLang
  });
})(window.Backronym);
