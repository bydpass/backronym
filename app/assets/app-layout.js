/* 藏头 - Backronym：版式页（v00.03.03 L2）。ES2017 经典脚本。 */
(function (app) {
  "use strict";
  var STR = window.I18N.t; // 界面文案到 i18n.js 取，代码里只写编号（v00.04.00 批 0）
  app.layout = {};
  var CORE = app.model.CORE, state = app.model.state, el = app.model.el;

  // 这份作品的卡怎么排：两个预设 + 三组开关。版式存在 state.layout（跟草稿走），排版全在 CORE.layoutCard / layoutGrid；
  // 这里只管页面：把当前取值显示成单选、改了就写回 state.layout 并重摆卡、顶上的小样跟着重画。改动立刻生效，没有「应用 / 取消」（同设置页）。
  // 取值必须与 CORE.LAYOUT_VALUES 一致（scripts/test-app.mjs 核对）。
  var PRESETS = [["folio", STR("lay.preset.folio")], ["center", STR("lay.preset.center")]];
  var SIDES = [["left", STR("lay.side.left")], ["center", STR("lay.side.center")], ["right", STR("lay.side.right")]], SHOW = [[true, STR("lay.show")], [false, STR("lay.hide")]];
  var G_PLATE = STR("lay.g.plate");
  var GROUPS = [
    [STR("lay.g.text"), [["text", STR("lay.r.text"), SIDES], ["cap", STR("lay.r.cap"), SIDES], ["title", STR("lay.r.title"), [["left", STR("lay.side.left")], ["center", STR("lay.side.center")]]]]],
    [G_PLATE, [["ratio", STR("lay.r.ratio"), [["3:2", "3:2"], ["1:1", "1:1"], ["3:4", "3:4"]]], ["plateX", STR("lay.r.plateX"), [["left", STR("lay.px.left")], ["center", STR("lay.px.center")], ["right", STR("lay.px.right")]]], ["order", STR("lay.r.order"), [["plate", STR("lay.order.plate")], ["text", STR("lay.order.text")]]]]],
    [STR("lay.g.show"), [["prog", STR("lay.r.prog"), SHOW], ["filler", STR("lay.r.filler"), SHOW], ["deco", STR("lay.r.deco"), SHOW], ["quote", STR("lay.r.quote"), [[true, STR("lay.quote.on")], [false, STR("lay.quote.off")]]]]],
  ];
  var CHECK = '<svg class="ic set-ck" width="16" height="16" aria-hidden="true" focusable="false"><use xlink:href="#i-check"/></svg>';
  var PREV = { W: 108, GRID_W: 150, H: 144 }; // 小样最大占多大（CSS 像素）：单图 108 宽；列阵宽一些，高不超过单图

  function rowOf(key) {
    for (var g = 0; g < GROUPS.length; g++) for (var r = 0; r < GROUPS[g][1].length; r++) if (GROUPS[g][1][r][0] === key) return GROUPS[g][1][r];
    return null;
  }
  // 一个选项：原生单选（键盘与读屏照常）+ 自己画的外观，写法同设置页的深浅三档。文字都是这里写死的，不含用户内容
  function option(name, value, text) {
    return '<label class="set-opt"><input type="radio" name="' + name + '" value="' + value + '" /><span>' + CHECK + text + "</span></label>";
  }
  function build() {
    el.layBase.innerHTML = PRESETS.map(function (p) { return option("lay-base", p[0], p[1]); }).join("");
    var html = '<h3 class="lay-custom">' + STR("lay.custom") + '</h3>';
    GROUPS.forEach(function (g) {
      html += '<h3 class="set-lab lay-group">' + g[0] + "</h3>";
      if (g[0] === G_PLATE) html += '<p class="lay-tip">' + STR("lay.tip") + '</p>';
      g[1].forEach(function (row) {
        var id = "lay-" + row[0]; // 选项的 value 是它在这一行里的序号（取值里有布尔，不能直接当字符串写进去）
        html += '<div class="lay-row"><span id="' + id + '-n" class="lay-n">' + row[1] + '</span><div id="' + id + '" class="set-seg" role="radiogroup" aria-labelledby="' + id + '-n"' + (row[0] === "plateX" ? ' aria-describedby="layWhy"' : "") + ">";
        html += row[2].map(function (o, k) { return option(id, k, o[1]); }).join("") + "</div></div>";
        if (row[0] === "plateX") html += '<p id="layWhy" class="ent-help lay-why" hidden>' + STR("lay.why32") + '</p>';
      });
    });
    el.layRows.innerHTML = html;
  }

  // 顶上的小样：当前这一格，或它所在的那一张列阵；用导出的同一套画法按小尺寸画一遍。
  // 看单图还是列阵由小样下面那一对按钮定（prevGrid），开页时跟编辑面的视图一致；它只换小样，不换编辑面的视图（真机反馈 F7）
  var prevGrid = false;
  function drawPreview() {
    el.layViewSingle.setAttribute("aria-pressed", String(!prevGrid));
    el.layViewGrid.setAttribute("aria-pressed", String(prevGrid));
    var old = el.layPrev.firstChild;
    if (old && old.tagName === "CANVAS") old.width = old.height = 0; // 换下来的画布立即归零，不等回收
    el.layPrev.textContent = "";
    var n = state.letters.length;
    if (!n) return;
    var grid = prevGrid, cur = Math.min(state.focus, n - 1), sh = grid ? app.model.sheets()[app.model.sheetOf(cur)] : null;
    var size = grid ? CORE.gridShape(sh[1] - sh[0]) : CORE.CARD, fit = Math.min((grid ? PREV.GRID_W : PREV.W) / size.W, PREV.H / size.H);
    var dpr = Math.min(window.devicePixelRatio || 1, 2), pal = app.view.currentPalette(), c;
    try { c = grid ? app.view.drawGrid(pal, sh, fit * dpr) : app.view.drawCard(cur, pal, fit * dpr); } catch (e) { return; } // 画不出来就不放小样，开关照常可用
    c.style.width = Math.round(size.W * fit) + "px";
    c.style.height = Math.round(size.H * fit) + "px";
    el.layPrev.appendChild(c);
  }

  // 页面跟 state.layout 对齐：各行选中哪一个、预设那一行给读屏的说明（不显示：它一变页面就下移）、图版 3:2 时「左右」停用并写明原因
  function sync() {
    var lay = CORE.layoutOf(state.layout), baseName = "";
    PRESETS.forEach(function (p) { if (p[0] === lay.base) baseName = p[1]; });
    Array.prototype.forEach.call(el.layBase.querySelectorAll("input"), function (r) { r.checked = r.value === lay.base; });
    el.layBaseWhy.textContent = CORE.sameLayout(lay, lay.base) ? STR("lay.baseHint") : STR("lay.baseChanged", { name: baseName });
    GROUPS.forEach(function (g) {
      g[1].forEach(function (row) {
        var box = document.getElementById("lay-" + row[0]), off = row[0] === "plateX" && lay.ratio === "3:2";
        Array.prototype.forEach.call(box.querySelectorAll("input"), function (r) { r.checked = row[2][Number(r.value)][0] === lay[row[0]]; r.disabled = off; });
        if (row[0] !== "plateX") return;
        box.classList.toggle("off", off);
        if (off) box.setAttribute("aria-disabled", "true"); else box.removeAttribute("aria-disabled");
        document.getElementById("layWhy").hidden = !off;
      });
    });
    drawPreview();
  }

  // 写回并重摆：卡、草稿、小样、读屏播报
  function apply(next, say) {
    state.layout = CORE.layoutOf(next);
    app.model.changed();
    sync();
    el.live.textContent = say;
  }

  function open() {
    if (!state.letters.length) return;
    prevGrid = state.view === "grid";
    sync();
    app.model.showToast("", 0); // 正在显示的提示不带进这一页（同设置页）
    el.layoutPage.hidden = false;
    el.layoutPage.scrollTop = 0;
    el.layoutClose.focus();
  }
  // 只收起、不动焦点：作品被换掉时用（草稿到期重载，见 app-draft.js 的 clearDraftView）。这一页是这份作品的，不像设置页可以留着
  function dismiss() {
    if (el.layoutPage.hidden) return;
    el.layoutPage.hidden = true;
    var old = el.layPrev.firstChild;
    if (old && old.tagName === "CANVAS") old.width = old.height = 0; // 页面关着时不留小样的画布
    el.layPrev.textContent = "";
  }
  function close() {
    dismiss();
    el.toLayout.focus();
    app.model.flushToast();
  }

  function init() {
    build();
    el.toLayout.addEventListener("click", open);
    el.layoutClose.addEventListener("click", close);
    el.layViewSingle.addEventListener("click", function () { prevGrid = false; drawPreview(); });
    el.layViewGrid.addEventListener("click", function () { prevGrid = true; drawPreview(); });
    app.model.trapKeys(el.layoutPage, close);
    // 预设用 click 不用 change：已经选中的预设再点一次也要生效（把调过的开关恢复成预设）。点标签时浏览器会再给里面的单选补一次 click，只认单选自己的那一次
    var preset = function (r) {
      var name = "";
      PRESETS.forEach(function (p) { if (p[0] === r.value) name = p[1]; });
      if (name) apply(CORE.layoutOf(r.value), STR("lay.said", { name: name }));
    };
    el.layBase.addEventListener("click", function (e) { if (e.target && e.target.tagName === "INPUT") preset(e.target); });
    // 键盘：在已经选中的预设上按空格或回车，浏览器不给 click，这里补上（没选中的那个按空格会选中并给 click，走上面）
    el.layBase.addEventListener("keydown", function (e) {
      var r = e.target, k = e.key;
      if (!r || r.tagName !== "INPUT" || !r.checked || (k !== " " && k !== "Spacebar" && k !== "Enter")) return;
      e.preventDefault();
      preset(r);
    });
    el.layRows.addEventListener("change", function (e) {
      var r = e.target, row = r && r.tagName === "INPUT" && r.checked ? rowOf(r.name.replace(/^lay-/, "")) : null, o = row ? row[2][Number(r.value)] : null;
      if (!o) return;
      var next = CORE.layoutOf(state.layout);
      next[row[0]] = o[0];
      apply(next, row[1] + "：" + o[1]);
    });
  }

  Object.assign(app.layout, { init: init, open: open, close: close, dismiss: dismiss, GROUPS: GROUPS, PRESETS: PRESETS });
})(window.Backronym);
