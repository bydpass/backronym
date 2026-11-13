/* 藏头 - Backronym：配图、取景与配图面板。ES2017 经典脚本。 */
(function (app) {
  "use strict";
  app.media = {};
  var CORE = app.model.CORE, state = app.model.state, el = app.model.el;

  // ---------- 图片 ----------

  // 每个配图目标（默认图 "def"、每一格 "cell:" + 下标）各有一个请求序号：每次选图、每次移除都递增，
  // 解码回调序号不符就是被后来的选图或移除作废了，直接丢弃。不同目标互不影响
  var imgSeq = {};
  function bumpImg(key) { imgSeq[key] = (imgSeq[key] || 0) + 1; }

  // 读成已解码的图；解码完就释放 blob URL，之后 drawImage 和插入页面都不受影响
  function loadImage(input, key, done) {
    var file = input.files && input.files[0];
    input.value = ""; // 允许重复选同一张
    if (!file) return;
    bumpImg(key);
    var epoch = app.draft.draftEpoch, seq = imgSeq[key], url = URL.createObjectURL(file);
    var img = new Image();
    img.onload = function () {
      URL.revokeObjectURL(url);
      if (seq !== imgSeq[key]) return; // 在缩图前丢弃：被新选的图或移除作废
      if (epoch === app.draft.draftEpoch && !app.draft.checkDraftExpiry()) done(shrink(img), file);
    };
    img.onerror = function () {
      URL.revokeObjectURL(url);
      if (seq !== imgSeq[key] || epoch !== app.draft.draftEpoch || app.draft.checkDraftExpiry()) return;
      alert("这张图片读不出来，换一张试试");
    };
    img.src = url;
  }

  // 手机原图 12MP 解码后约 48MB，10 格全配原图低端机会被杀；画框最大 920×640，缩到长边 1200 足够
  // ponytail: 不处理 EXIF 旋转，靠 WebView 自带（Chrome 81+/iOS 13.4+）；更老内核上竖拍照可能横着
  var MAX_SIDE = 1200;
  function shrink(img) {
    var w = img.naturalWidth, h = img.naturalHeight, k = MAX_SIDE / Math.max(w, h);
    if (k >= 1) return img;
    var c = document.createElement("canvas");
    c.width = Math.round(w * k);
    c.height = Math.round(h * k);
    c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
    return c;
  }

  // T45：存图前编码。含透明像素 → PNG（保留透明度）；不透明 → JPEG 0.92（不加底色，按原尺寸，取景参数不受影响）。
  // 老内核不支持 JPEG 编码时 toDataURL 会退回 PNG，按实际前缀定扩展名。返回 { b64, ext }
  function encodeImage(img) {
    var w = img.naturalWidth || img.width, h = img.naturalHeight || img.height, c = document.createElement("canvas");
    c.width = w; c.height = h;
    var ctx = c.getContext("2d"), alpha = false;
    ctx.drawImage(img, 0, 0);
    try {
      var d = ctx.getImageData(0, 0, w, h).data;
      for (var k = 3; k < d.length; k += 4) if (d[k] < 255) { alpha = true; break; }
    } catch (e) { alpha = true; } // 读不了像素就按透明处理，宁可大一点也不丢透明度
    var url = alpha ? c.toDataURL("image/png") : c.toDataURL("image/jpeg", 0.92);
    c.width = c.height = 0;
    return { b64: url.slice(url.indexOf(",") + 1), ext: url.indexOf("data:image/png") === 0 ? "png" : "jpg" };
  }

  // 恢复时把存好的 base64 解回图片；解不出为 null。name 记在图上：再保存时直接用原名，不因重新压缩换名、重复写
  function decodeImage(b64, name) {
    return new Promise(function (resolve) {
      var img = new Image();
      img.onload = function () { img.bkName = name; resolve(img); };
      img.onerror = function () { resolve(null); };
      img.src = "data:image/" + (/\.png$/.test(name) ? "png" : "jpeg") + ";base64," + b64;
    });
  }

  // 默认图移除了，用默认图的格子取景作废
  function resetDefaultCrops() {
    state.crops = state.crops.map(function (c, i) { return state.images[i] ? c : null; });
  }

  // T44：选好图先进取景（工作副本），点「应用」才写进作品。解码完成时配图面板已关或换了格，就不再弹出取景
  function onPhoto() {
    var i = state.imgIndex;
    loadImage(el.photo, "def", function (img) {
      if (i < 0 || state.imgIndex !== i) return;
      openCropper(i, "def", img);
    });
  }

  function clearPhoto() {
    bumpImg("def"); // 作废进行中的解码
    state.image = null;
    resetDefaultCrops();
    renderImgPanel();
    app.model.changed();
  }

  // ---------- 取景（缩放 + 拖动裁剪） ----------
  // 取景存成比例 {z 放大倍数, x/y 可见区域中心在原图的位置 0..1}，与画框尺寸无关，两种视图共用

  // 取景只在单图的配图面板里做（列阵只预览），框比例 = 图版 920:600（D14，§3-⑪）
  var FRAME = { single: [920, 600] };

  // 算出原图上要截取的矩形，并把中心夹在合法范围内（不露出图外的空白）
  function cropRect(img, w, h, crop) {
    var iw = img.naturalWidth || img.width, ih = img.naturalHeight || img.height; // <img> 或缩小后的 <canvas>
    var c = crop || { z: 1, x: 0.5, y: 0.5 };
    var s = Math.max(w / iw, h / ih) * c.z;
    var vw = w / s, vh = h / s;
    var cx = Math.min(Math.max(c.x * iw, vw / 2), iw - vw / 2);
    var cy = Math.min(Math.max(c.y * ih, vh / 2), ih - vh / 2);
    return { sx: cx - vw / 2, sy: cy - vh / 2, vw: vw, vh: vh, x: cx / iw, y: cy / ih, iw: iw, ih: ih };
  }

  function drawCover(ctx, img, x, y, w, h, crop) {
    var r = cropRect(img, w, h, crop);
    ctx.drawImage(img, r.sx, r.sy, r.vw, r.vh, x, y, w, h);
  }

  // T44：取景面板只改工作副本 work = { i 格, kind, img 图, crop 取景, epoch 草稿世代 }。
  // kind："cell" 这一格新选的图；"def" 新选的默认图；"adjust" 调整已有图的取景。应用前作品里的图与取景都不动
  var work = null;
  function blankCrop() { return { z: 1, x: 0.5, y: 0.5 }; }
  function copyCrop(c) { return c ? { z: c.z, x: c.x, y: c.y } : blankCrop(); }
  function workImage() { return work ? work.img : null; }

  function currentCrop() {
    if (!work) work = { i: state.cropIndex, kind: "adjust", img: null, crop: blankCrop(), epoch: -1 };
    return work.crop;
  }

  // 预览画布含外围；内框与导出使用同一比例，坐标仍以原图为准。
  function cropPreviewFrame() {
    var w = 312, h = w * FRAME.single[1] / FRAME.single[0];
    return { width: 360, height: 300, x: 24, y: (300 - h) / 2, w: w, h: h };
  }

  function drawCropPreview() {
    var img = workImage();
    if (!img) return;
    var f = cropPreviewFrame(), c = el.cropCanvas;
    if (c.width !== f.width) c.width = f.width;
    if (c.height !== f.height) c.height = f.height;
    var r = cropRect(img, FRAME.single[0], FRAME.single[1], currentCrop());
    var ctx = c.getContext("2d"), scale = f.w / r.vw;
    ctx.fillStyle = CORE.PALETTE.dark.bg;
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.drawImage(img, f.x - r.sx * scale, f.y - r.sy * scale, r.iw * scale, r.ih * scale);
    ctx.fillStyle = "rgba(0,0,0,0.6)";
    ctx.fillRect(0, 0, c.width, f.y);
    ctx.fillRect(0, f.y + f.h, c.width, c.height - f.y - f.h);
    ctx.fillRect(0, f.y, f.x, f.h);
    ctx.fillRect(f.x + f.w, f.y, c.width - f.x - f.w, f.h);
    ctx.strokeStyle = CORE.PALETTE.dark.ink;
    ctx.lineWidth = 1;
    ctx.strokeRect(f.x, f.y, f.w, f.h);
  }

  // 只在用户操作时夹边界；绘制和打开面板不把默认取景变成已编辑。
  function clampCrop() {
    var img = workImage();
    if (!img) return;
    var crop = currentCrop(), r = cropRect(img, FRAME.single[0], FRAME.single[1], crop);
    crop.x = r.x;
    crop.y = r.y;
  }

  // 按预览画布像素平移图片；缩放基于内框，不能用含外围的画布尺寸。
  function panCrop(dx, dy) {
    var img = workImage(), crop = currentCrop(), f = cropPreviewFrame();
    if (!img) return;
    var r = cropRect(img, FRAME.single[0], FRAME.single[1], crop);
    crop.x = (r.x * r.iw - dx * r.vw / f.w) / r.iw;
    crop.y = (r.y * r.ih - dy * r.vh / f.h) / r.ih;
    clampCrop();
    drawCropPreview();
  }

  function setZoom(z) {
    currentCrop().z = Math.min(3, Math.max(1, z));
    el.cropZoom.value = String(currentCrop().z);
    clampCrop();
    drawCropPreview();
  }

  function moveCrop(key) {
    var step = cropPreviewFrame().w * 0.05;
    var moves = { ArrowLeft: [step, 0], ArrowRight: [-step, 0], ArrowUp: [0, step], ArrowDown: [0, -step] };
    if (!moves[key]) return false;
    panCrop(moves[key][0], moves[key][1]);
    return true;
  }

  // 取景面板盖在配图面板上：从配图面板进，「取消｜还原｜应用」（U18）。取消 / Esc / 点外面 = 丢掉工作副本；应用 = 写进作品并保存。
  // 都回到配图面板。img 不传 = 调整这一格现有的图（本格的或默认图）
  function openCropper(i, kind, img) {
    kind = kind || "adjust";
    var src = img || app.model.cellImage(i);
    if (!src) return;
    work = { i: i, kind: kind, img: src, crop: kind === "adjust" ? copyCrop(state.crops[i]) : blankCrop(), epoch: app.draft.draftEpoch };
    state.cropIndex = i;
    var pos = (i + 1) + state.letters[i]; // U6：该格在单词里的位置 + 字母，如 LIFE 第 1 格「1L」
    el.cropTitle.textContent = "调整取景 · " + (kind === "def" ? "默认图（以 " + pos + " 格为例）" : pos);
    el.cropScope.hidden = kind !== "def"; // 默认图写明影响范围
    el.imgPanel.hidden = true;
    el.cropper.hidden = false;
    el.cropZoom.value = String(work.crop.z);
    drawCropPreview();
    el.cropCanvas.focus();
  }

  // 应用：草稿世代没变（期间没有 18h 到期重载）才写入。默认图的取景作用于所有没有单独配图的格
  function applyCrop() {
    var w = work;
    work = null;
    if (!w || !w.img || w.epoch !== app.draft.draftEpoch || app.draft.checkDraftExpiry()) { leaveCropper(); return; }
    if (w.kind === "cell") { state.images[w.i] = w.img; state.crops[w.i] = copyCrop(w.crop); app.draft.releaseHeld(w.i); }
    else if (w.kind === "def") {
      state.image = w.img; app.draft.releaseHeld(-1);
      state.crops = state.letters.map(function (l, j) { return state.images[j] ? state.crops[j] || null : copyCrop(w.crop); });
    } else state.crops[w.i] = copyCrop(w.crop);
    leaveCropper();
    app.model.changed();
  }

  function cancelCrop() {
    work = null;
    leaveCropper();
  }

  // 还原：工作副本回到居中、1 倍，不关面板
  function resetCrop() {
    if (!work) return;
    work.crop = blankCrop();
    el.cropZoom.value = "1";
    drawCropPreview();
  }

  function leaveCropper() {
    el.cropper.hidden = true;
    state.cropIndex = -1;
    if (state.imgIndex < 0) return;
    el.imgPanel.hidden = false;
    renderImgPanel();
    (el.imgAdjust.hidden ? el.imgPick : el.imgAdjust).focus();
  }

  // 拖动：有 Pointer Events 用它，老 iOS WebView 退回 touch。两根手指时交给 bindPinch（pinchOn），不平移
  var pinchOn = false;
  function bindDrag(node) {
    var last = null;
    var scale = function () { return node.width / node.getBoundingClientRect().width; };
    var start = function (x, y) { last = [x, y]; };
    var move = function (x, y) {
      if (!last || pinchOn) return;
      var k = scale();
      panCrop((x - last[0]) * k, (y - last[1]) * k);
      last = [x, y];
    };
    var end = function () { last = null; };
    if (window.PointerEvent) {
      node.addEventListener("pointerdown", function (e) { try { node.setPointerCapture(e.pointerId); } catch (err) { /* 合成事件没有活动触点，真触摸不会走到这里 */ } if (pinchOn) last = null; else start(e.clientX, e.clientY); });
      node.addEventListener("pointermove", function (e) { move(e.clientX, e.clientY); });
      node.addEventListener("pointerup", end);
      node.addEventListener("pointercancel", end);
    } else {
      node.addEventListener("touchstart", function (e) { start(e.touches[0].clientX, e.touches[0].clientY); });
      node.addEventListener("touchmove", function (e) { e.preventDefault(); move(e.touches[0].clientX, e.touches[0].clientY); });
      node.addEventListener("touchend", end);
    }
  }

  // 双指缩放（§3-⑪）：Pointer Events 里数触点，两个触点时缩放 = 开始时的缩放 × 两点距离之比；没有 Pointer Events 就只用滑条
  function bindPinch(node, onZoom) {
    if (!window.PointerEvent) return;
    var pts = {}, d0 = 0, z0 = 1;
    var ids = function () { return Object.keys(pts); };
    var dist = function () {
      var a = pts[ids()[0]], b = pts[ids()[1]];
      return Math.sqrt(Math.pow(a[0] - b[0], 2) + Math.pow(a[1] - b[1], 2));
    };
    node.addEventListener("pointerdown", function (e) {
      pts[e.pointerId] = [e.clientX, e.clientY];
      if (ids().length === 2) { pinchOn = true; d0 = dist(); z0 = currentCrop().z; }
    });
    node.addEventListener("pointermove", function (e) {
      if (!pts[e.pointerId]) return;
      pts[e.pointerId] = [e.clientX, e.clientY];
      if (pinchOn && ids().length === 2 && d0 > 0) onZoom(z0 * dist() / d0);
    });
    var up = function (e) {
      delete pts[e.pointerId];
      if (ids().length < 2) pinchOn = false;
    };
    node.addEventListener("pointerup", up);
    node.addEventListener("pointercancel", up);
  }

  // 键盘：方向键平移、+/- 缩放（读屏和键盘用户也能调）
  function onCropKey(e) {
    if (moveCrop(e.key)) e.preventDefault();
    else if (e.key === "+" || e.key === "=") { e.preventDefault(); setZoom(currentCrop().z + 0.1); }
    else if (e.key === "-") { e.preventDefault(); setZoom(currentCrop().z - 0.1); }
  }


  // ---- 配图面板（§3-③，T15） ----
  // 点图版 → 底部平直面板：上半「这一格的配图」（选择 / 调整取景 / 移除），下半「所有格共用的默认图」（选择 · 移除）。取景见上面的取景段（盖在这个面板上）
  function openImagePanel(i) {
    state.imgIndex = i;
    renderImgPanel();
    el.imgPanel.hidden = false;
    el.imgPick.focus();
  }

  function closeImagePanel() {
    el.imgPanel.hidden = true;
    state.imgIndex = -1;
    el.plateHit.focus();
  }

  function renderImgPanel() {
    var i = state.imgIndex;
    if (i < 0) return;
    var own = state.images[i];
    el.imgTitle.textContent = "这一格（" + state.letters[i] + "）的配图";
    el.imgPick.textContent = own ? "更换图片" : "选择图片";
    el.imgPick.setAttribute("aria-label", own ? "更换图片，这一格" : "选择图片，这一格"); // 可访问名以可见文字开头（WCAG 2.5.3），后缀与默认图那组区分
    el.imgAdjust.hidden = !app.model.cellImage(i); // 有图（本格的或默认图）才能调取景
    el.imgRemove.hidden = !own;
    el.defPick.textContent = state.image ? "更换图片" : "选择图片";
    el.defPick.setAttribute("aria-label", state.image ? "更换图片，默认图" : "选择图片，默认图");
    el.defRemove.hidden = !state.image;
  }

  function onCellPhoto() {
    var i = state.imgIndex;
    loadImage(el.cellPhoto, "cell:" + i, function (img) {
      if (i < 0 || i >= state.letters.length || state.imgIndex !== i) return;
      openCropper(i, "cell", img);
    });
  }

  function removeCellPhoto() {
    var i = state.imgIndex;
    bumpImg("cell:" + i); // 作废进行中的解码
    state.images[i] = null;
    state.crops[i] = null;
    renderImgPanel();
    app.model.changed();
    el.imgPick.focus();
  }


  // 跨模块接口；其余函数与缓存保留在本文件闭包中。
  Object.assign(app.media, {
    drawCover: drawCover,
    cropRect: cropRect,
    bumpImg: bumpImg,
    openImagePanel: openImagePanel,
    closeImagePanel: closeImagePanel,
    openCropper: openCropper,
    removeCellPhoto: removeCellPhoto,
    onCellPhoto: onCellPhoto,
    clearPhoto: clearPhoto,
    onPhoto: onPhoto,
    encodeImage: encodeImage,
    decodeImage: decodeImage,
    applyCrop: applyCrop,
    cancelCrop: cancelCrop,
    resetCrop: resetCrop,
    drawCropPreview: drawCropPreview,
    moveCrop: moveCrop,
    setZoom: setZoom,
    currentCrop: currentCrop,
    onCropKey: onCropKey,
    bindDrag: bindDrag,
    bindPinch: bindPinch
  });
})(window.Backronym);
