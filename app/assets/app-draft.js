/* 藏头 - Backronym：草稿控制、恢复闸门与期限调度。ES2017 经典脚本。 */
(function (app) {
  "use strict";
  app.draft = {};
  var CORE = app.model.CORE, state = app.model.state, el = app.model.el;

  // ---------- 草稿 ----------
  // 文字、选词、样式自动存；配图（T45）另存为文件（容器文件系统或 IndexedDB），草稿里只记文件名与取景
  // 小红书 9.46+ 用 setStorage，同时写 localStorage 兜底，读的时候取较新的一份

  // 键名与旧稿清理、恢复副本都在 draft.js（T23）：主键 backronym-draft-v2，旧版两个键只删不读。
  // 访问 localStorage 本身也可能抛错，延迟到带异常处理的存储函数里。
  var draftStore = window.DRAFT.create({
    getItem: function (key) { return localStorage.getItem(key); },
    setItem: function (key, value) { localStorage.setItem(key, value); },
    removeItem: function (key) { localStorage.removeItem(key); },
  }, app.publish.miniTool);
  var saveTimer = 0;
  var expiryTimer = 0;
  app.draft.draftLoaded = false;
  var draftExtra = {};
  var draftSavedAt = 0;
  var draftContent = "";
  app.draft.draftEpoch = 0;
  var draftWrite = 0;
  var draftAcceptedWrite = 0;
  // draftTarget = 最近一次发出的写入内容（B2-R1）。还有写入在途时（draftWrite > draftAcceptedWrite），可能落盘的是它而不是 draftContent：
  // 去重、「已保存」判断都要对它比——否则 A→B（在途）→ 改回 A 时会被当成「没改」，B 落盘后存储与界面不一致。最近一次写入失败时清空，好让同样内容能重试
  var draftTarget = null;
  function writesPending() { return draftWrite > draftAcceptedWrite; }
  var draftNotice = "", cleanupFailed = false;
  // 提示的状态码（T13）：noticeTag = { text, retire, readFail }，retire = 清理成功后可替换的期限 / 清理类提示，readFail = 带「部分存储读取失败」后缀。
  // 只在 text 仍等于当前 draftNotice 时有效：提示被别的回调改写后自动作废。改文案不会再改坏判断
  var noticeTag = null, READ_FAIL_NOTICE = "读取失败，暂不保存，请及时导出。";
  function tagNotice(retire, readFail) {
    noticeTag = { text: draftNotice, retire: retire, readFail: readFail };
  }
  // 覆盖主键之前的闸门（T23）：null = 放行；{ raw } = 读到了原文但没套用上，须先存进恢复副本；{ unread: true } = 没读到原文，须先重读确认。
  // guardEpoch = 正在跑闸门检查的那一轮恢复（-1 无），换了一轮恢复就不再等旧的
  var draftGuard = null, guardEpoch = -1;
  // 读到了稿、但主键有一侧读失败（T23）：那一侧可能有更新的稿。覆盖它之前先重读核实：{ remote, local } 为真的是还没核实的一侧；null = 无。
  // 没核实前这一侧不写（另一侧照常写）；sideEpoch 同 guardEpoch。
  // 两侧都读到了、但某一侧主键存着与恢复稿不同的未到期原文，也挂侧闸门（先保全再覆盖）：sideRead = 是否有一侧读失败（决定提示），
  // sideKeep = 恢复时选中的那份原文，核实时与它同字节的不重复保全
  // sideMsg = 侧闸门最近一次核实失败的提示；闸门没解除前，迟到的保存确认不能把它改成「正在保存」或另一条提示
  var sideGuard = null, sideEpoch = -1, sideKeep = "", sideRead = false, sideMsg = "";
  // guardMsg = 整体闸门最近一次检查失败的提示（同 sideMsg：清理等别的回调不能把它说成「已保存」）
  var guardMsg = "";
  // T30：等某一版真正写进本设备的调用方（改词页「保存」）。write = 等的是第几次写入（含之后的写入：更新的一版写成也算这一版写成）；
  // 结果只在该次或更新的写入被确认 / 确认失败时给出，迟到的旧确认不会替更新的修改说「已保存」
  var saveWaiters = [];
  function settleWaiters(upto, res) {
    saveWaiters = saveWaiters.filter(function (w) {
      if (w.write > upto) return true;
      w.resolve(res);
      return false;
    });
  }

  function draftPayload() {
    var p = Object.assign({}, draftExtra, {
      // T04：lang = 作品的语言，跟着草稿走
      v: 2, lang: state.lang, word: state.letters.join(""), titleRuns: app.title.hasTitle() ? app.title.titleRuns() : null,
      filler: state.filler, view: state.view,
      picks: state.picks, glosses: state.glosses, glossAuto: state.glossAuto, captions: state.captions, keys: state.keys, split: state.split,
    });
    var m = draftMedia(); // 没有任何配图时不写这两个字段：无图旧稿打开后内容不变、不会被无故改写
    if (m) { p.media = m.media; p.crops = m.crops; }
    // 词条带冠词的作品才记各格义项的词性（冠词有没有、要不要选都看它）；英语作品没有这个字段
    if ((state.poss || []).length && state.picks.some(function (x) { return CORE.articleOptions(x).length > 0; })) p.poss = state.letters.map(function (l, i) { return state.poss[i] || ""; }); else delete p.poss;
    if ((state.arts || []).some(Boolean)) p.arts = state.letters.map(function (l, i) { return state.arts[i] || ""; }); else delete p.arts; // 没人选过冠词就不写这个字段：旧稿打开后内容不变
    // 语言多选（2026-11-12）：选了不止一门才写 langs 和各格的词来自哪门；只选一门的作品不写这两个字段（旧稿打开后内容不变）。lang 仍写定字母规则的那一门，旧版本读得懂
    if (state.langs.length > 1) { p.langs = state.langs.slice(); p.pickLangs = state.letters.map(function (l, i) { return state.pickLangs[i] || ""; }); } else { delete p.langs; delete p.pickLangs; }
    return p;
  }

  // ---------- 配图持久化（T45） ----------
  // 后端：容器文件系统 → IndexedDB → 都没有（状态行写明不支持）。mediaStores 按优先级列出本次能用的全部后端，mediaStore = 第一个（主后端）。
  // 新图存主后端，主后端写失败退到下一个（B7-R4）；读图各后端都找（B7-R2：客户端升级或文件系统偶发不可用会让主后端换掉，旧图在另一端），
  // 在别的后端找到就迁移进主后端；清扫兼顾各后端，已迁进主后端的旧副本随之清掉。
  // mediaPartial = 任一后端缺席或初始化失败：来源未知的旧引用可能在该端，缺图按「暂时读不出来」处理、不清理。
  // 图片对象上的标记：bkName = 已写入并回读核对的文件名；bkBusy = 正在存；bkFail = 上次没存成的原因（"write" / "space" / "none"），bkFailAt = 何时（30 秒后再试，"none" 不再试）
  var mediaStores = [], mediaStore = null, mediaPartial = false, mediaReady = initMedia();
  // prevMedia = 上一次确认写进本设备（或恢复出来）的配图引用与取景，word 记当时的单词。
  // 某格的图还没确认时，草稿里那一格沿用这里的「文件名 + 取景」——图与取景配对，不让旧图套新取景（T45）
  var prevMedia = emptyMedia();
  var mediaMissing = "";   // 恢复时没找回的图的说明（状态行）；下一次保存成功后由新状态替换（还有暂未读回的图时保留）
  // mediaHeld = 恢复时「暂时读不出来」的图（后端不可用 / 读失败，不能断定已丢）：{ word, def, cells, crops }。
  // 这些格在用户换图之前，草稿照旧引用原文件名与取景——只改文字也不会把引用写掉，后端恢复后重开还能读回（B7-R2）
  var mediaHeld = emptyMedia();
  var mediaUnsure = false; // 恢复时有图读失败（判断不了它在不在）：本次打开不清理配图
  var mediaQueue = Promise.resolve(), mediaJobs = 0, sweeping = false;
  var SAVED = "草稿已保存。";
  var MEDIA_MSG = {
    write: "配图没能保存：草稿仍保留上一次的配图和取景；这次换的图只在本次打开期间有效，请及时导出。",
    space: "设备空间不够，配图没有保存；文字草稿已保存，请及时导出。",
    none: "这台设备不支持保存配图，重开后需要重新选图；文字草稿已保存，请及时导出。",
  };
  function emptyMedia() { return { word: "", def: null, cells: [], crops: [] }; }

  async function initMedia() {
    var M = window.MEDIA, mt = app.publish.miniTool, stores = [], partial = false;
    if (!M) return null;
    if (["writeFile", "appendFile", "readFile", "readDir", "unlink", "mkdir", "getFileStorageInfo"].every(function (n) { return mt(n); })) {
      try {
        var lo = window.xhs && window.xhs.launchOptions, dir = lo && lo.miniToolEnv && lo.miniToolEnv.userDataPath;
        if (!dir && mt("getLaunchOptions")) {
          var got = await M.within(mt("getLaunchOptions").getLaunchOptions(), 3000);
          dir = got && got.miniToolEnv && got.miniToolEnv.userDataPath;
        }
        if (!dir) throw new Error("no userDataPath");
        var fsb = M.fsBackend(mt, dir + "/" + M.DIR);
        await M.within(fsb.ready(), 3000);
        stores.push(M.create(fsb));
      } catch (e) { partial = true; } // 文件系统这次不可用：IndexedDB 顶上，存在文件系统里的图本次读不到
    } else partial = true; // 后端缺席不能证明旧稿引用的图不存在（来源未知的旧稿也保守保留）
    try {
      if (window.indexedDB) {
        var est = window.navigator && navigator.storage && navigator.storage.estimate ? function () { return navigator.storage.estimate(); } : null;
        var idb = M.idbBackend(window.indexedDB, est);
        await M.within(idb.ready(), 3000);
        stores.push(M.create(idb));
      } else partial = true;
    } catch (e) { partial = true; } // IndexedDB 存在却打不开：同样是「暂不可用」，存在里面的图本次读不到（B7-R2）
    mediaStores = stores; mediaStore = stores[0] || null; mediaPartial = partial;
    return mediaStore;
  }

  // 当前作品里的图（默认图 + 各格独立图，同一对象只算一次）
  function liveImages() {
    var out = [];
    [state.image].concat(state.images).forEach(function (im) { if (im && out.indexOf(im) < 0) out.push(im); });
    return out;
  }

  // 草稿里的 media / crops：只引用已确认的文件；没确认的格沿用 prevMedia 那一格（单词那一位的字母没变才沿用）。没有任何配图返回 null
  function draftMedia() {
    var prev = prevMedia, held = mediaHeld;
    var same = function (i) { return prev.word.charAt(i) === state.letters[i]; }, sameH = function (i) { return held.word.charAt(i) === state.letters[i]; };
    var defOk = !!(state.image && state.image.bkName), defHeld = !state.image && !!held.def;
    var def = !state.image ? held.def : defOk ? state.image.bkName : prev.def;
    var cells = [], crops = [], any = !!def;
    for (var i = 0; i < state.letters.length; i++) {
      var own = state.images[i], ownOk = !!(own && own.bkName);
      var heldName = !own && sameH(i) ? held.cells[i] || null : null; // 暂未读回、用户也没换的那一格：照旧引用
      var name = own ? (ownOk ? own.bkName : (same(i) && prev.cells[i]) || null) : heldName;
      var live = own ? ownOk : !heldName && !defHeld && defOk; // 这一格实际用的图已确认：取景用当前的；否则用落盘时配对的那一份
      var fromHeld = !own && (heldName || defHeld);
      var crop = !(name || def) ? null : live ? state.crops[i] : fromHeld ? (sameH(i) ? held.crops[i] : null) : same(i) ? prev.crops[i] : null;
      cells.push(name);
      crops.push(CORE.cropOf(crop));
      if (name) any = true;
    }
    if (!any) return null;
    var media = { def: def, cells: cells };
    // 只有独立图遮住默认图时才额外存一份；按已落盘的默认图配对。
    if (def) {
      var previous = defHeld ? held : prev;
      var covered = cells.map(function (name, i) {
        if (!name || !(defOk || (defHeld ? sameH(i) : same(i)))) return null;
        if (defOk) return CORE.cropOf(state.defaultCrops && state.defaultCrops[i]);
        var previousCrop = previous.cells[i] ? (previous.defaultCrops || [])[i] : previous.crops[i];
        return CORE.cropOf(previousCrop);
      });
      if (covered.some(Boolean)) media.defaultCrops = covered;
    }
    return { media: media, crops: crops };
  }
  function heldAny() { return !!mediaHeld.def || mediaHeld.cells.some(Boolean); }
  // 某格暂未读回、草稿仍引用着的配图与取景（V003-B4-R5 复审）：看得见的图是空的，不等于这一格没有作者内容。
  // 判断与 draftMedia 的 fromHeld 同一套：这一格没换上新图、字母对得上才算；默认图暂未读回时，这一格配对的取景也算
  function heldAt(i) {
    var h = mediaHeld, ok = !state.images[i] && h.word.charAt(i) === state.letters[i];
    var name = ok ? h.cells[i] || null : null;
    return { img: !!name, crop: ok && (name || (!state.image && h.def)) ? h.crops[i] || null : null };
  }
  // 用户在某格（i）或默认图（i < 0）换上新图（取景面板「应用」）：那里暂未读回的旧引用不再沿用（明确的操作优先）。
  // 移除按钮只在当前有图时出现，那时这一格没有暂存引用（读回的图本就不在 held 里，换上的图已在应用时释放），所以移除不需要再释放
  function releaseHeld(i) {
    if (i < 0) mediaHeld.def = null; else mediaHeld.cells[i] = null;
  }
  // 换语言时格的对应变了（V003-B4-R5）：from[j] = 新第 j 格承接的旧格（-1 = 没有）。上次落盘的引用与暂未读回的引用跟着格走；
  // 原来「字母对得上」才沿用的判断照旧——对得上的格记成新字母，对不上或没有承接的格记成对不上
  function remapMedia(from, oldLetters, newLetters) {
    [prevMedia, mediaHeld].forEach(function (m) {
      var word = "", cells = [], crops = [];
      from.forEach(function (o, j) {
        var ok = o >= 0 && m.word.charAt(o) === oldLetters[o];
        word += ok ? newLetters[j] : "\u0000";
        cells.push(ok ? m.cells[o] || null : null);
        crops.push(ok ? m.crops[o] || null : null);
      });
      if (m.defaultCrops) m.defaultCrops = from.map(function (o, j) { return o >= 0 && m.word.charAt(o) === oldLetters[o] ? m.defaultCrops[o] || null : null; });
      m.word = word; m.cells = cells; m.crops = crops;
    });
  }
  function snapMedia(p) {
    return p && p.media ? { word: p.word, def: p.media.def, defaultCrops: p.media.defaultCrops, cells: p.media.cells.slice(), crops: (p.crops || []).slice() } : emptyMedia();
  }

  // 存图：每张还没确认的图排进队列，依次「编码 → 看空间 → 写入 → 读回核对」。确认后重新保存草稿（这时草稿才引用它：先写图片，再写草稿 JSON）
  function syncMedia() {
    liveImages().forEach(function (img) {
      if (img.bkName || img.bkBusy || (img.bkFail && Date.now() - (img.bkFailAt || 0) < 30000)) return;
      img.bkBusy = true;
      mediaJobs++;
      var epoch = app.draft.draftEpoch;
      mediaQueue = mediaQueue.then(function () { return storeImage(img, epoch); }).then(function () { mediaJobs--; }, function () { mediaJobs--; });
    });
  }

  async function storeImage(img, epoch) {
    var res = "", name = "";
    try {
      if (epoch === app.draft.draftEpoch && liveImages().indexOf(img) >= 0) { // 排队期间被换掉 / 移除的图不存
        await mediaReady;
        if (!mediaStores.length) res = "none";
        else {
          var enc = app.media.encodeImage(img);
          name = window.MEDIA.nameFor(enc.b64, enc.ext);
          for (var k = 0; k < mediaStores.length && res !== "ok"; k++) { // 主后端没存成就试下一个；都不成时报主后端的原因
            var r = await mediaStores[k].save(name, enc.b64);
            if (r === "ok" || !res) res = r;
          }
        }
      }
    } catch (e) { res = "write"; }
    img.bkBusy = false;
    if (res === "ok") { img.bkName = name; img.bkFail = ""; }
    else if (res) { img.bkFail = res; img.bkFailAt = res === "none" ? Infinity : Date.now(); }
    if (!res || epoch !== app.draft.draftEpoch) return;
    renderDraftStatus();
    if (res === "ok") saveDraft();
    if (res === "ok" && liveImages().indexOf(img) < 0) setTimeout(sweepMedia, 0); // 存的途中被换掉：这张成了孤儿，等队列空了清（B7-R5）
  }

  // 恢复时读回草稿引用的图：{ def, cells: [图 | null], lost: 说明 | ""，unsure }。同一文件只读一次，几格共用同一张图
  // 各后端都找：在非主后端找到的先迁进主后端（写入并读回核对；迁移失败也照常用这张，旧副本因仍被引用而保留）。
  // 有后端列不出目录、读失败、或文件系统这次没初始化成功时，找不到的图算「暂时读不出来」（unsure：本次不清理）
  async function loadMedia(d) {
    var out = { def: null, cells: [], lost: "", unsure: false, held: emptyMedia() }, media = d.media;
    if (!media) return out;
    await mediaReady;
    var stores = mediaStores, cache = {}, lostDef = false, lostCells = [], dark = mediaPartial || !stores.length, unknown = {};
    out.held = { word: d.word, def: null, defaultCrops: media.defaultCrops, cells: [], crops: (d.crops || []).slice() };
    var lists = await Promise.all(stores.map(function (st) { return st.list(); }));
    if (lists.some(function (l) { return !l; })) out.unsure = true;
    var get = function (name) {
      if (!cache[name]) cache[name] = (async function () {
        for (var k = 0; k < stores.length; k++) {
          var r = await stores[k].load(name, lists[k]);
          if (r.error) { out.unsure = true; unknown[name] = true; }
          if (!r.b64) continue;
          if (k > 0) await stores[0].save(name, r.b64);
          return app.media.decodeImage(r.b64, name);
        }
        if (dark) { out.unsure = true; unknown[name] = true; }
        return null;
      })();
      return cache[name];
    };
    if (media.def) { out.def = await get(media.def); lostDef = !out.def; if (lostDef && unknown[media.def]) out.held.def = media.def; }
    for (var i = 0; i < media.cells.length; i++) {
      out.cells[i] = media.cells[i] ? await get(media.cells[i]) : null;
      if (media.cells[i] && !out.cells[i]) { lostCells.push(i + 1); if (unknown[media.cells[i]]) out.held.cells[i] = media.cells[i]; }
    }
    // D3：默认图暂未读回时，held.crops 是它在各格的取景。草稿 crops 在有独立图的格存的是独立图的取景，
    // 这些格（独立图读回了或确实丢了）改用落盘时配对的默认图取景；旧稿没记的从居中开始
    if (out.held.def) media.cells.forEach(function (n, i) { if (n && !out.held.cells[i]) out.held.crops[i] = (media.defaultCrops || [])[i] || null; });
    // B7-S1：有默认图时，缺图的格实际显示默认图，文案照实说；读失败（unsure）不说「找不回」，提示稍后重开再试
    var n = (lostDef ? 1 : 0) + lostCells.length, parts = [];
    if (lostDef) parts.push("默认图");
    if (lostCells.length) parts.push("第 " + lostCells.join("、") + " 格");
    if (n) out.lost = "有 " + n + " 张配图" + (out.unsure ? "暂时读不出来" : "没能找回") + "（" + parts.join("、") + "），" +
      (lostCells.length && out.def ? "缺图的格先用默认图" : "已留空") + "，" + (out.unsure ? "请及时导出或稍后重开再试。" : "请重新选图。");
    return out;
  }

  // 清理没被引用的配图（T45）：前提是草稿已读完、没有写入在途、原稿已保全（两道闸门都放行）、没有图在存、恢复时没有读失败的图；
  // 引用 = 两侧主稿 + 全部恢复副本（任一侧读不全就不删）+ 内存里正在用的。删除前 media.js 会再读一遍引用复核
  function keepMedia(n) {
    return liveImages().some(function (im) { return im.bkName === n; }) || prevMedia.def === n || prevMedia.cells.indexOf(n) >= 0 ||
      mediaHeld.def === n || mediaHeld.cells.indexOf(n) >= 0;
  }
  function sweepReady() {
    return !!mediaStore && !mediaUnsure && app.draft.draftLoaded && !writesPending() && !draftGuard && !sideGuard && !mediaJobs;
  }
  // 先等后端初始化完（B7-R1：到期 / 无图稿启动时没走读图，后端可能还没就绪，不能因此静默跳过）。
  // 主后端按引用清；其余后端里已在主后端存好（迁移过）的副本即使仍被引用也清掉，没迁走的照常按引用保留
  async function sweepMedia() {
    await mediaReady;
    if (sweeping || !sweepReady()) return;
    sweeping = true;
    var epoch = app.draft.draftEpoch, main = mediaStore;
    var refs = function () { return epoch === app.draft.draftEpoch && sweepReady() ? draftStore.refs() : { ok: false }; };
    var notMain = function () {
      return Promise.resolve(refs()).then(function (r) {
        if (!r || !r.ok) return r;
        var names = Object.create(null);
        Object.keys(r.names).forEach(function (n) { if (!main.has(n)) names[n] = true; });
        return { ok: true, names: names };
      });
    };
    try {
      await main.sweep(refs, keepMedia);
      for (var k = 1; k < mediaStores.length; k++) await mediaStores[k].sweep(notMain, function (n) { return keepMedia(n) && !main.has(n); });
    } catch (e) { /* 下次清理再判定 */ } finally { sweeping = false; }
  }

  // 状态行只有一条（U8）：文字草稿正常保存时，配图的结果替换「草稿已保存。」；文字草稿本身有警告时先说那条
  function mediaNote() {
    var imgs = liveImages(), rank = { write: 1, space: 2, none: 3 }, fail = "";
    imgs.forEach(function (im) { if (!im.bkName && im.bkFail && (!fail || rank[im.bkFail] > rank[fail])) fail = im.bkFail; });
    if (fail) return MEDIA_MSG[fail];
    if (mediaMissing) return mediaMissing;
    return imgs.length && imgs.every(function (im) { return im.bkName; }) ? "ok" : "";
  }

  function renderDraftStatus() {
    var note = mediaNote(), text = draftNotice;
    if (note === "ok") { if (draftNotice === SAVED) text = "草稿和配图已保存。"; }
    else if (note && (draftNotice === SAVED || !draftNotice)) text = note;
    el.draftStatus.textContent = text; // 2026-11-12：「预计清除：时间」删去，和页脚固定说明重复
    if (app.entry.entryFrom === "edit") app.entry.renderSave(); // T30：保存状态变了，改词页的保存按钮跟着变
  }

  function scheduleExpiry() {
    clearTimeout(expiryTimer);
    expiryTimer = 0;
    var due = draftStore.rescueDue ? draftStore.rescueDue() : 0;
    if (!draftSavedAt && !due && !cleanupFailed && !draftGuard && !sideGuard) return;
    var remaining = draftSavedAt ? window.DRAFT.deadline({ t: draftSavedAt }) - Date.now() : 60000;
    // 恢复副本各有自己的期限：到了就在前台清掉，不等刷新或回前台（P2）
    if (due > Date.now()) remaining = Math.min(remaining, due - Date.now()); // 已过期的等这一轮清理更新，不能把定时器缩成 1ms 反复触发
    // 分钟级复核系统时间；精确到期仍按剩余毫秒唤醒。
    expiryTimer = setTimeout(function () {
      if (!checkDraftExpiry()) {
        var rescueDue = draftStore.rescueDue ? draftStore.rescueDue() : 0;
        if (cleanupFailed || !draftSavedAt || (rescueDue && rescueDue <= Date.now())) cleanExpiredDrafts();
        scheduleExpiry();
      }
    }, Math.max(1, Math.min(remaining, 60000)));
  }

  function writeDraft() {
    clearTimeout(saveTimer);
    saveTimer = 0;
    if (!app.draft.draftLoaded || checkDraftExpiry()) return;
    var payload = draftPayload(), content = JSON.stringify(payload);
    if (content === (writesPending() ? draftTarget : draftContent)) return; // 打开、切主题、重复渲染不续期；有写入在途时对比在途目标（B2-R1）
    if (draftGuard) { releaseGuard(); return; } // 原稿还没保住：编辑先留在内存里
    var epoch = app.draft.draftEpoch, write = ++draftWrite, skip = sideGuard, ticket = draftStore.write(payload, skip);
    draftTarget = content;
    var accept = function () {
      if (epoch !== app.draft.draftEpoch || write < draftAcceptedWrite) return;
      if (window.DRAFT.deadline(ticket.data) <= Date.now()) { reloadDraft(); return; }
      draftAcceptedWrite = write;
      draftSavedAt = ticket.data.t;
      draftContent = content;
      var was = JSON.stringify([prevMedia.def, prevMedia.cells]);
      prevMedia = snapMedia(payload); if (!heldAny()) mediaMissing = ""; // T45：这一版的配图引用已落盘；恢复时缺图的说明由新状态替换（还有暂未读回的图时保留）
      if (JSON.stringify([prevMedia.def, prevMedia.cells]) !== was) setTimeout(sweepMedia, 0); // 换图 / 移除已落盘：旧图可能没人引用了，本次就清（B7-R5）
      settleWaiters(write, { ok: true });
      draftNotice = sideGuard ? (sideMsg || (sideRead ? sideNotice(false) : "正在保存草稿…")) : cleanupFailed ? "部分存储清理未完成，将重试。" : write === draftWrite ? "草稿已保存。" : "新修改尚未确认保存。";
      if (!sideGuard && cleanupFailed) tagNotice(true, false);
      renderDraftStatus();
      scheduleExpiry();
    };
    if (ticket.localOK) accept();
    else { draftNotice = "正在保存草稿…"; renderDraftStatus(); }
    ticket.remote.then(function (ok) {
      if (epoch !== app.draft.draftEpoch) return;
      if (ok) accept();
      else if (!ticket.localOK && write === draftWrite) {
        draftNotice = "未确认保存成功，请及时导出。";
        draftTarget = null; // 最新一次没写进：同样内容下次要重写，不能被去重挡掉
        renderDraftStatus();
        settleWaiters(write, { ok: false, reason: "write" });
      }
    });
    if (skip && sideGuard) releaseSides();
  }

  // 闸门检查（T23）：原稿保全了 / 确认主键本来就空，才放行覆盖；否则说明原因，编辑只留在内存里，下次编辑再试
  // 重读读到了原文、但还有一侧仍读失败：那一侧转交侧闸门继续保护（与已有侧闸门合并），读到的一侧照常写
  function badSides(bad) {
    return bad && (bad.remote || bad.local) ? { remote: !!bad.remote, local: !!bad.local } : null;
  }

  async function guardCheck(g) {
    try {
      var raws = g.raw ? [g.raw] : null, bad = null;
      if (!raws) {
        var r = await draftStore.recheck();
        if (r.failed) return { ok: false, notice: READ_FAIL_NOTICE };
        if (r.empty) return { ok: true };
        raws = r.raws || [r.raw]; bad = badSides(r.bad); // 重读时读到了原文：每一份都走保全流程
      }
      for (var i = 0; i < raws.length; i++) if (!(await draftStore.preserve(raws[i]))) return { ok: false, notice: "原稿无法保全，暂不保存，请及时导出。" };
      return { ok: true, bad: bad };
    } catch (e) {
      return { ok: false, notice: "原稿无法保全，暂不保存，请及时导出。" };
    }
  }

  function releaseGuard() {
    if (guardEpoch === app.draft.draftEpoch) return;
    var epoch = guardEpoch = app.draft.draftEpoch;
    guardCheck(draftGuard).then(function (res) {
      if (guardEpoch === epoch) guardEpoch = -1;
      if (epoch !== app.draft.draftEpoch) return;
      if (res.ok) {
        draftGuard = null; guardMsg = "";
        if (res.bad) {
          var s = sideGuard || { remote: false, local: false };
          sideGuard = { remote: s.remote || res.bad.remote, local: s.local || res.bad.local }; sideRead = true;
        }
        writeDraft(); return;
      }
      draftNotice = guardMsg = res.notice;
      renderDraftStatus();
      settleWaiters(Infinity, { ok: false, reason: "guard" }); // 原稿还没保住：这次不写，等的人都得到「没保存」
    });
  }

  // 侧闸门检查（T23）：重读此前读失败、或存着不同原文的那一侧。读到的每份未到期原文（与恢复稿同字节的除外）都先存进恢复副本再放行；
  // 仍读失败或保全失败 → 这一侧不覆盖，另一侧照常写
  function sideNotice(unsaved) {
    return unsaved ? "有一处存储里的原稿无法保全，暂不覆盖它，请及时导出。" : "有一处存储读取失败，暂不覆盖它，请及时导出。";
  }

  async function sideCheck(sides) {
    try {
      var r = await draftStore.recheck(sides);
      if (r.failed) return { ok: false, notice: sideNotice(false) };
      if (r.empty) return { ok: true };
      var raws = (r.raws || [r.raw]).filter(function (raw) { return raw !== sideKeep; });
      for (var i = 0; i < raws.length; i++) if (!(await draftStore.preserve(raws[i]))) return { ok: false, notice: sideNotice(true) };
      return { ok: true, bad: badSides(r.bad) }; // 同时核实两侧时，仍读失败的一侧不能跟着放行
    } catch (e) {
      return { ok: false, notice: sideNotice(true) };
    }
  }

  function releaseSides() {
    if (sideEpoch === app.draft.draftEpoch) return;
    var epoch = sideEpoch = app.draft.draftEpoch;
    sideCheck(sideGuard).then(function (res) {
      if (sideEpoch === epoch) sideEpoch = -1;
      if (epoch !== app.draft.draftEpoch) return;
      // 内容没变也要把当前稿补写进刚核实的那一侧；仍读失败的一侧留在侧闸门里（下一次写入时再核实）
      if (res.ok) {
        sideGuard = res.bad; sideRead = !!res.bad; sideMsg = "";
        draftContent = ""; draftTarget = null; writeDraft(); return;
      }
      draftNotice = sideMsg = res.notice;
      renderDraftStatus();
    });
  }

  function saveDraft() {
    if (!app.draft.draftLoaded || checkDraftExpiry()) return;
    syncMedia(); // T45：新选 / 刚应用的图排进存图队列；存好后会再调一次 saveDraft
    clearTimeout(saveTimer);
    if (draftSavedAt && window.DRAFT.deadline({ t: draftSavedAt }) - Date.now() <= 400) writeDraft();
    else saveTimer = setTimeout(writeDraft, 400);
  }
  function flushDraft() { if (saveTimer) writeDraft(); }

  // T30：马上写当前作品，并等这一版的写入结果：{ ok: true } / { ok: false, reason: "write" | "guard" | "expired" }。
  // 已经写过同样的内容就直接成功；原稿闸门拦着就等闸门检查的结果（不另起一套写入）
  function persistNow() {
    return new Promise(function (resolve) {
      if (!app.draft.draftLoaded || checkDraftExpiry()) { resolve({ ok: false, reason: "expired" }); return; }
      var content = JSON.stringify(draftPayload());
      if (content === draftContent && !writesPending()) { clearTimeout(saveTimer); saveTimer = 0; resolve({ ok: true }); return; }
      // 同样内容已在途：等那一次（及之后）的结果；否则等下一次写入（B2-R1：在途的是别的内容时，当前内容要另写一次并确认）
      saveWaiters.push({ write: writesPending() && content === draftTarget ? draftWrite : draftWrite + 1, resolve: resolve });
      writeDraft();
    });
  }
  // 当前作品是否还有没确认写进本设备的修改（T30：改词页「保存」按钮的「未保存」状态）
  // 程序自己对数据做的整理（词库迟到后补齐词条）不算编辑：整理前没有未保存的改动，整理后也不算有——不触发保存、不续期、离开时不问
  function quietly(fn) {
    var clean = false;
    try { clean = app.draft.draftLoaded && !writesPending() && JSON.stringify(draftPayload()) === draftContent; } catch (e) { /* 取不到就当有改动 */ }
    fn();
    if (clean) { try { draftContent = JSON.stringify(draftPayload()); } catch (e) { /* 同上 */ } }
  }

  function unsavedNow() {
    try { return app.draft.draftLoaded && (writesPending() || JSON.stringify(draftPayload()) !== draftContent); } catch (e) { return true; } // 有写入在途也算未保存（B2-R1）
  }

  // 作品现在能不能改？未读完草稿、已过期（顺带重载）都算不能。保存、导出、选图等所有改作品的入口都问它
  function checkDraftExpiry() {
    if (!app.draft.draftLoaded) return true;
    if (!draftSavedAt || window.DRAFT.deadline({ t: draftSavedAt }) > Date.now()) return false;
    reloadDraft();
    return true;
  }

  // 捕获阶段的输入守卫（绑定段里挂到各事件上）。读草稿期间只拦修改作品的操作，主题切换和 Tab 移焦点照常（T14）；
  // 读完后仍按 checkDraftExpiry：已过期的作品连主题切换也拦，等重载完
  function editableTarget(t) {
    return !!t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName || ""));
  }
  function guardDraftEvent(e) {
    if (el.credits.contains(e.target)) return;
    var blocked;
    if (app.draft.draftLoaded) blocked = checkDraftExpiry();
    // 读取期间：可编辑控件上的按键拦；别处的按键（PageDown、方向键、Tab）只滚动 / 移焦点，放行。
    // 在按钮上按 Enter / 空格真正生效的是随后的 click，click 仍在拦截范围内。
    else blocked = !el.settingsOpen.contains(e.target) && !el.settings.contains(e.target) && !(e.type === "keydown" && (e.key === "Tab" || !editableTarget(e.target))); // 读取期间仍可进设置页换深浅（原来顶栏上的深浅按钮同理）
    if (blocked) { if (e.cancelable) e.preventDefault(); e.stopImmediatePropagation(); }
  }

  function clearDraftView() {
    app.draft.draftLoaded = false;
    app.draft.draftEpoch++;
    settleWaiters(Infinity, { ok: false, reason: "expired" }); // 换了一轮作品：旧的等待一律作废
    clearTimeout(saveTimer);
    clearTimeout(expiryTimer);
    saveTimer = 0;
    draftExtra = {};
    draftSavedAt = 0;
    draftContent = "";
    draftAcceptedWrite = draftWrite; draftTarget = null; // 换了一轮作品：上一轮在途的写入不再计入（其确认已按 epoch 作废）
    draftGuard = null; guardMsg = "";
    sideGuard = null; sideKeep = ""; sideRead = false; sideMsg = "";
    prevMedia = emptyMedia(); mediaHeld = emptyMedia(); mediaMissing = ""; mediaUnsure = false;
    state.letters = []; state.picks = []; state.glosses = []; state.glossAuto = [];
    state.captions = []; state.keys = []; state.arts = []; state.poss = []; state.pickLangs = []; state.images = []; state.crops = []; state.defaultCrops = [];
    app.model.setLang("en"); // 新作品回到默认语言
    state.image = null; state.outputs = []; state.filler = ""; state.focus = 0;
    state.view = "single"; state.imgIndex = state.cropIndex = -1; state.split = null; state.retitle = false;
    el.title.textContent = "";
    [el.wordInput, el.wordCtl, el.glossCtl, el.capCtl, el.fillerCtl].forEach(function (c) { c.value = ""; c.classList.remove("ime"); });
    [el.finishPanel, el.results, el.imgPanel, el.cropper].forEach(function (p) { p.hidden = true; });
    app.publish.resetPreview(); // T43 / B4-S2：缩略图、大图与预览状态不留
    el.resList.textContent = "";
    el.cropCanvas.width = el.cropCanvas.height = 0;
    app.title.titleSnap = app.title.savedRange = null;
    app.title.titleComposing = app.editor.wordComposing = app.editor.lineComposing = app.entry.entryComposing = false;
    app.entry.entryFrom = "boot"; app.entry.hideConfirm(); // 重载（如 18h 到期）后先回入场界面，读完草稿再决定去哪（focusEntry）
    app.editor.focusKind = app.title.topFocus = "";
    app.editor.candQuiet = false; app.editor.candKey = ""; app.editor.candPage = 0;
    app.title.noteText = app.publish.finishNote = "";
    app.publish.setBusy(false);
    el.wordInput.disabled = el.finish.disabled = true;
    app.entry.renderEntry();
    app.view.renderShell();
  }

  function reloadDraft() {
    clearDraftView();
    restoreDraft();
  }

  // 当前仍未落盘 / 被闸门拦住的警告（无则 ""）。清理回调只管清理状态，不能据此推断当前稿已保存
  function pendingWarning() {
    if (draftGuard && guardMsg) return guardMsg;
    if (sideGuard && sideMsg) return sideMsg;
    return unsavedNow() ? "新修改尚未确认保存。" : ""; // 有写入在途也算（B2-R1）
  }

  async function cleanExpiredDrafts() {
    var epoch = app.draft.draftEpoch, ok = await draftStore.purge();
    if (epoch !== app.draft.draftEpoch) return;
    cleanupFailed = !ok;
    if (ok) sweepMedia(); // T45：草稿键清理干净后再判定哪些配图没人引用（18h 到期与启动清扫走同一条路）
    var pending = pendingWarning();
    var tag = noticeTag && noticeTag.text === draftNotice ? noticeTag : null;
    if (!ok) {
      draftNotice = pending ? pending + " 部分存储清理未完成，将重试。" : "部分存储清理未完成，将重试。";
      tagNotice(true, !!(tag && tag.readFail) || pending === READ_FAIL_NOTICE || pending === sideNotice(false)); // 清理成功不代表恢复时的读取失败已解决，保留其状态。
    }
    // 空稿清理成功不另外提示（11-04 用户定）。只替换期限 / 清理类提示；读取失败是另一回事，保留它，不能说成「已清除」。有未落盘的警告时恢复那条警告
    else if (tag && tag.retire) draftNotice = (pending || (draftSavedAt ? "草稿已保存。" : "")) + (tag.readFail ? " 部分存储读取失败。" : "");
    renderDraftStatus();
    scheduleExpiry(); // 清理完成后重算：空稿可停，失败/未到期副本继续。
  }

  // 端能力或字体迟迟不返回时不能把界面卡死：最多等 ms 毫秒，超时当作 undefined
  function within(promise, ms) {
    return Promise.race([promise, new Promise(function (ok) { setTimeout(ok, ms); })]);
  }

  async function readDraft() {
    return draftStore.read();
  }

  // 读完草稿后去哪（T18 / Q2）：有单词 → 编辑界面；没有（第一次进入、恢复失败、18h 清理后）→ 入场界面，光标在单词框。
  // 手机上没有用户手势的 focus 可能不弹键盘，点一下单词框即可
  function focusEntry() {
    if (state.letters.length) { if (app.entry.entryFrom) app.entry.closeEntry(); return; }
    if (app.entry.entryFrom !== "boot") { app.entry.openEntry("boot"); return; }
    // 启动时已在入场界面（读草稿期间输入框禁用，用户还没打字）：把恢复出来的单词与填表人同步进输入框。
    // 否则空单词但有填表人的草稿，提交时会用空输入框把恢复的填表人盖掉（Astra 第 4 批复验 CRITICAL）
    el.wordInput.value = state.letters.join("");
    el.fillerCtl.value = state.filler || "";
    app.entry.renderEntry();
    app.model.focusBehind(el.wordInput); // 设置页 / 借物页开着时不抢焦点（V003-B4-R6）
  }

  // 恢复出错（读取或套用都算）：整页回到空白并放开输入，不删、不改写存储里的原草稿（下次打开仍会重试）。
  // 不管编辑前后：读到了原文的，第一次覆盖主键前先存进恢复副本；没读到原文的，覆盖前先重读确认（draftGuard，T23）。
  // 到期清理照常排上（只删已过期的键，到期前原文不动）
  function guardFor(ctx) {
    return ctx.raw ? { raw: ctx.raw } : ctx.unread ? { unread: true } : null;
  }

  function abandonRestore(ctx) {
    try { clearDraftView(); } catch (e) { /* 重绘失败也要往下解锁 */ }
    app.draft.draftLoaded = true;
    draftGuard = guardFor(ctx); guardMsg = "";
    sideGuard = ctx.sides || null; sideKeep = ctx.keep || ""; sideRead = !!ctx.sideRead; sideMsg = "";
    draftNotice = "草稿无法恢复，已从空白开始。";
    try { draftContent = JSON.stringify(draftPayload()); } catch (e) { /* 取不到就留空：只是编辑前不会误判成无改动 */ }
    el.wordInput.disabled = false;
    el.finish.disabled = false;
    try { app.view.renderShell(); renderDraftStatus(); focusEntry(); } catch (e) { /* 同上 */ }
    scheduleExpiry(); // 读不出的原稿仍可能到期：照常定时清理
    cleanExpiredDrafts(); // 顺带清旧版草稿键（只删旧键与已过期的键）
  }

  async function restoreDraft() {
    var epoch = app.draft.draftEpoch, failed = false;
    var ctx = { raw: "", unread: true }; // 读取本身抛错时保持「没拿到原文」；读到之后由 applyDraft 更新
    try {
      await applyDraft(epoch, ctx);
    } catch (e) {
      failed = epoch === app.draft.draftEpoch; // 已被更新的一次恢复取代就不管它
    } finally {
      if (failed) abandonRestore(ctx);
    }
  }

  async function applyDraft(epoch, ctx) {
    var result = await readDraft();
    if (epoch !== app.draft.draftEpoch) return;
    var got = result.entry, d = got && got.draft;
    // T45：先读回配图再放开编辑（读图期间作品仍不可改）：否则用户抢先改一下，草稿就会写掉还没读回的图的引用
    var media = d ? await loadMedia(d) : null;
    if (epoch !== app.draft.draftEpoch) return;
    ctx.raw = got ? got.raw : "";
    // 端侧只是没有读能力（blind）、本地读成功且为空：不挂整体闸门（否则这种设备上永远存不了），改由侧闸门挡住端侧，本地照常保存
    var fl = result.failed || {}, df = result.differ || {}, blindOnly = !got && !!result.blind && !fl.local;
    ctx.unread = !!result.error && !got && !blindOnly; // 有一侧读失败又没拿到任何原文：不能当空稿回写
    // 拿到了稿，但主键有一侧读失败、或有一侧存着不同的未到期原文：那一侧覆盖前要先核实并保全（先保全，T23）
    var rem = !!(fl.remote || df.remote), loc = !!(fl.local || df.local);
    ctx.sides = (got || blindOnly) && (rem || loc) ? { remote: rem, local: loc } : null;
    ctx.keep = ctx.raw; ctx.sideRead = !!(fl.remote || fl.local);
    sideGuard = ctx.sides; sideKeep = ctx.keep; sideRead = ctx.sideRead; sideMsg = "";
    draftNotice = result.expired ? "超过 18 小时或时间无效的草稿已失效。" : "";
    if (result.error) draftNotice += " 部分存储读取失败。";
    tagNotice(!!result.expired, !!result.error);
    if (d) Object.keys(d).forEach(function (k) { if (CORE.DRAFT_FIELDS.indexOf(k) < 0) draftExtra[k] = d[k]; });
    app.draft.draftLoaded = true;
    el.wordInput.disabled = false;
    el.finish.disabled = false;
    if (!d) {
      draftGuard = guardFor(ctx); // 读到却不能用的原文，或没读到：覆盖主键前先保全 / 先重读
      draftContent = JSON.stringify(draftPayload());
      app.view.renderShell(); renderDraftStatus(); scheduleExpiry(); cleanExpiredDrafts(); focusEntry(); return;
    }
    draftSavedAt = d.t;
    app.model.setLangs(d.langs); // T04：按草稿的语言恢复（migrateDraft 已确认这些语言的规则已注册；旧稿的 langs = [lang]）
    d.langs.forEach(function (c) { if (c !== "en") app.entry.loadLang(c); }); // T20：西文的词库与屏蔽词表按需加载（规则随页面已在）；到了会重画，没到只影响候选与导出
    // 标题和填表人与单词分开存（D18）：旧草稿可能清空了单词却留着它们，照样放回界面，不然约 400ms 后主键会被空值覆盖。
    // 没有单词时处于 first 模式，这两样等输入单词后才显示
    state.filler = d.filler;
    if (d.titleRuns) app.title.setTitleRuns(d.titleRuns);
    state.image = media.def;
    mediaMissing = media.lost; mediaUnsure = media.unsure; mediaHeld = media.held || emptyMedia();
    if (!d.word) { finishRestore(); focusEntry(); return; }
    state.view = d.view;
    state.split = d.split; // T42：手动分界（migrateDraft 已校验范围，不合法为 null）
    app.view.syncViews();
    app.model.setLetters(d.word);
    // 迁移后各数组都与单词等长（CORE.migrateDraft）：词库词换成当前格式的条目（卡上打的词首字母大写，词库全小写，所以不分大小写），未命中的自定义词保留原条目与元数据；
    // 不是以该字母开头的词也保留，由 cellState 标成不合法（D8）。keys 恒为 0，glossAuto 缺了的迁移时已补齐
    // 每格的词来自哪门语言：草稿记了就用；只选一门的作品（含旧稿）就是那一门；其余留空，itemFor 按选中语言的先后去找
    state.pickLangs = state.letters.map(function (l, i) { return d.picks[i] ? (d.pickLangs && d.pickLangs[i]) || (d.langs.length === 1 ? d.langs[0] : "") : ""; });
    state.picks = d.picks.map(function (p, i) { return p ? app.model.itemFor(p[0], p, i) : null; });
    state.keys = d.keys.slice();
    var wordsHere = !window.LANGPACK || d.langs.every(function (c) { return window.LANGPACK.has(c, "words"); });
    state.poss = state.letters.map(function (l, i) { var q = d.poss && d.poss[i]; return CORE.savedSense(d.picks[i], state.picks[i], q) || (d.glossAuto[i] && state.picks[i] ? CORE.defaultSense(state.picks[i]) : ""); }); // 没记：自动带出的释义按词条第一个词性，自己写的不猜
    state.arts = state.letters.map(function (l, i) { var a = d.arts && d.arts[i]; return a && (!wordsHere || CORE.articleOptions(state.picks[i]).indexOf(a) >= 0) ? a : ""; }); // 选项里已经没有的旧选择不沿用；词库还没到时先留着，到了由 refreshPicks 再核（R8）
    state.glosses = d.glosses.map(function (g, i) {
      return d.glossAuto[i] && state.picks[i] ? CORE.savedAutoGloss(state.picks[i],g) : g;
    });
    state.glossAuto = d.glossAuto.slice();
    state.captions = d.captions.slice();
    state.images = state.letters.map(function (l, i) { return media.cells[i] || null; });
    state.defaultCrops = state.letters.map(function (l, i) {
      if (!d.media || !d.media.def) return null;
      return d.media.cells[i] ? (d.media.defaultCrops || [])[i] || null : (d.crops || [])[i] || null;
    });
    state.crops = state.letters.map(function (l, i) {
      if (state.images[i]) return (d.crops || [])[i] || null;
      return state.image ? state.defaultCrops[i] : null;
    }); // 缺图的格不带取景
    state.focus = app.model.firstOpen(0); // 没选的格保持为空（D6）
    finishRestore();
  }

  function finishRestore() {
    prevMedia = snapMedia(draftPayload()); // 恢复出来的图都带着原文件名（已确认），这就是「上一次落盘」的配图
    draftContent = JSON.stringify(draftPayload());
    app.view.renderShell(); // 恢复不算编辑，不改写原稿及其时间戳
    renderDraftStatus();
    scheduleExpiry();
    cleanExpiredDrafts();
    focusEntry(); // 有单词进编辑界面，没有留在入场界面
  }


  // 跨模块接口；其余函数与缓存保留在本文件闭包中。
  Object.assign(app.draft, {
    saveDraft: saveDraft,
    checkDraftExpiry: checkDraftExpiry,
    within: within,
    focusEntry: focusEntry,
    guardDraftEvent: guardDraftEvent,
    flushDraft: flushDraft,
    persistNow: persistNow,
    releaseHeld: releaseHeld,
    quietly: quietly,
    heldAt: heldAt,
    remapMedia: remapMedia,
    unsavedNow: unsavedNow,
    cleanExpiredDrafts: cleanExpiredDrafts,
    restoreDraft: restoreDraft
  });
})(window.Backronym);
