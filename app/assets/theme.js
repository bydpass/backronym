// 主题（四选一）与深浅（跟随系统 / 浅 / 深）。
// 在 <head> 里同步执行，页面画出来之前就定好 <html data-theme>，手动选了深色的人不会先闪一下浅色。
// 容器 CSP 禁止内联脚本，所以单独一个文件。颜色本身全在 style.css。
// ponytail: 选择只存 localStorage（换设备不同步）；要跟草稿一起走再接 setStorage
(function () {
  var KEY = "acronym-meme-theme"; // 旧项目名，保留不改：改了已存的深浅设置会读不到
  var LABEL = { auto: "跟随系统", light: "浅色", dark: "深色" };
  // 四个主题（2026-11-11 用户批准）：fandom 是默认，只有浅色；另外三个深浅兼备。颜色在 style.css 的 :root[data-skin]，导出色板在 core.js 的 PALETTES
  var SKIN_KEY = "backronym-skin", SKINS = { fandom: { lightOnly: true }, dansaekhwa: {}, impressionism: {}, secession: {} };
  var root = document.documentElement;
  // 容器全屏时返回 / 分享浮在页顶两侧（DEVICE-R1），没有查询其位置或屏幕模式的已知接口，
  // 屏幕模式参数也没有证据会传进页面地址（B8-R1），所以一律预留两侧空间；宽度见 style.css 的 --container-gutter，以真机为准。
  root.setAttribute("data-container-full", "true");

  // 顶部安全区兜底（2026-11-17 鸿蒙真机 U0）：安卓 / 鸿蒙的容器把网页铺到状态栏底下，env(safe-area-inset-*) 却全报 0，
  // 顶栏整条压进状态栏、按钮点不到（Mate 60 Pro、HarmonyOS 4.2.0、小红书 9.53.3 实测）。iOS 报的是真实值。
  // 容器在 launchOptions.miniToolEnv.windowInfo 里给了 statusBarHeight（该机实测 40），优先用它；
  // 同一对象里还有 safeArea、menuButtons，miniTool 上有 getWindowInfo / onWindowResize，本地容器文档没记，暂未用。
  // ponytail: 读不到 windowInfo 时，只在小红书里的安卓 / 鸿蒙上按 40px 留白；PC 模拟器自己注入 --safe-area-inset-top，不走这里。
  var TOP_FALLBACK = 40;
  function measuredTop() {
    var p = document.createElement("div");
    p.style.cssText = "position:fixed;top:0;left:0;width:0;height:0;visibility:hidden;padding-top:env(safe-area-inset-top,0px)";
    root.appendChild(p);
    var v = parseFloat(window.getComputedStyle(p).paddingTop) || 0;
    root.removeChild(p);
    return v;
  }
  function statusBar() {
    var lo = window.xhs && window.xhs.launchOptions, wi = lo && lo.miniToolEnv && lo.miniToolEnv.windowInfo;
    if (!wi) return null; // 容器没给：走按平台的估值
    if (Number(wi.screenTop) > 0) return 0; // 网页本来就排在状态栏下面，不用补
    var h = Number(wi.statusBarHeight);
    return h > 0 && h < 200 ? h : null;
  }
  var topFixed = false;
  function fixTopInset() {
    if (!root.appendChild || !window.getComputedStyle || !root.style || !root.style.setProperty || !root.style.getPropertyValue) return;
    if (root.style.getPropertyValue("--safe-area-inset-top") && !topFixed) return; // 别人（PC 模拟器）已经设了
    var ua = (window.navigator && window.navigator.userAgent) || "", bar = statusBar(), want = 0;
    if (bar !== null) want = bar; // 容器给了准数：任何平台都以它为准
    else if (/android|harmony/i.test(ua) && (window.xhs || /xhs|xiaohongshu|discover/i.test(ua))) want = TOP_FALLBACK;
    if (!want) return;
    if (topFixed) root.style.removeProperty("--safe-area-inset-top"); // 先撤掉自己上次补的，量系统真实值
    if (measuredTop() < Math.min(want, 24)) { root.style.setProperty("--safe-area-inset-top", want + "px"); topFixed = true; }
    else topFixed = false;
  }
  fixTopInset(); // window.xhs 可能晚于这里注入，所以后面再查两次
  if (document.addEventListener) document.addEventListener("DOMContentLoaded", fixTopInset);
  if (window.addEventListener) window.addEventListener("load", fixTopInset);

  function systemDark() {
    return !!(window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches);
  }

  // 只有浅色的主题：不管选的是哪一档、系统是不是深色，界面一律浅色（固定写 data-theme="light"）；换回别的主题时恢复原来的档位
  function apply() {
    root.setAttribute("data-skin", skin);
    var m = SKINS[skin].lightOnly ? "light" : mode;
    if (m === "light" || m === "dark") root.setAttribute("data-theme", m);
    else root.removeAttribute("data-theme");
  }

  var mode = "auto", skin = "fandom";
  try { mode = localStorage.getItem(KEY) || "auto"; skin = localStorage.getItem(SKIN_KEY) || "fandom"; } catch (e) { /* 隐私模式等读不到，就用默认 */ }
  if (!LABEL[mode]) mode = "auto";
  if (!Object.prototype.hasOwnProperty.call(SKINS, skin)) skin = "fandom";
  apply();

  // D19：卡和导出图用哪套色板由这里判断（只写一处）。app.js 导出时取一次，整批同一套。
  // v00.03.00：顶栏的深浅图标收进设置页（三个单选，app.js 绑定）：mode() 读当前档，setMode() 换档并存到本设备
  window.THEME = {
    LABEL: LABEL,
    isDark: function () {
      var t = root.getAttribute("data-theme");
      return t === "dark" || (t !== "light" && systemDark());
    },
    mode: function () { return mode; },
    setMode: function (m) {
      if (!LABEL[m]) m = "auto";
      mode = m;
      apply();
      try { localStorage.setItem(KEY, mode); } catch (e) { /* 存不了就只管这一次 */ }
    },
    skin: function () { return skin; },
    lightOnly: function () { return !!SKINS[skin].lightOnly; },
    setSkin: function (k) {
      if (!Object.prototype.hasOwnProperty.call(SKINS, k)) k = "fandom";
      skin = k;
      apply();
      try { localStorage.setItem(SKIN_KEY, skin); } catch (e) { /* 存不了就只管这一次 */ }
    },
  };
})();
