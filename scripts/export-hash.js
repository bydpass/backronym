/* 导出像素哈希：给「纯重构」任务前后对照用（T06 旧 S2 版式一套；T07 起为第六稿版式，浅 / 深两套）。不进 app 包，在预览控制台粘贴运行。
   用法：
     1. 打开 http://127.0.0.1:5173（不要用 localhost，那是用户自己的草稿所在的源；本脚本只 setItem 草稿键，不清空存储）
     2. 控制台粘贴本文件运行；脚本每写入一份固定草稿就会刷新页面，刷新后（sessionStorage 里留了进度）再粘贴运行同一份脚本，
        共 3 次：写 LIFE → 测 LIFE 并写 BACKRON → 测 BACKRON，最后一次输出全部 {fixture, scene, theme, view, index, length, sha1}
     3. 复测：再来一组 3 次
   （T18 起不再有「生成图片」按钮：脚本点顶部栏「完成」→ 完成面板导出 → 点「导出图片」→ 读结果页的图，仍走真实绘制路径，像素参考值不变）
   固定输入：LIFE（4 格，自定富文本标题）与 BACKRON（7 格，标题留空 → 导出用单词，列阵分两行 4 + 3）；词 / 释义 / 配文 / 填表人都固定，不含随机、时间戳。
   场景：A = 带默认图（渐变测试图），B = 不配图（图版画大字母）。每个场景：单图 n 张 + 列阵 1 张。
   主题（T07 起）：每个场景浅、深各跑一遍——脚本设 <html data-theme>，THEME.isDark() 据此选色板；跑完还原原来的 data-theme。输出多一列 theme。
   总共 LIFE 20 张 + BACKRON 32 张 = 52 张。
   脚本是浏览器控制台里的临时脚本，不打包、不联网。 */
await (async function () {
  var KEY = "backronym-draft-v2", FLAG = "export-hash-step", ROWS = "export-hash-rows";
  var $ = function (id) { return document.getElementById(id); };
  var sleep = function (ms) { return new Promise(function (ok) { setTimeout(ok, ms); }); };
  async function until(fn, ms, what) {
    for (var t = 0; t < ms; t += 50) { if (fn()) return; await sleep(50); }
    throw new Error("等待超时：" + what);
  }

  var TITLE = [
    { t: "总之 这里有", b: true, i: false, c: null },
    { t: "四种", b: true, i: true, c: "red" }, // 旧格式存十六进制朱，T23 前由迁移换成 "red"；新格式直接存 "red"，导出像素不变
    { t: "情况", b: false, i: false, c: "#2a6fb0" },
  ];
  var LONG_CAP = "这是一段很长的配文用来测试折行与省略号，需要超过两行才能触发末尾的截断逻辑，所以再多写一些字让它够长够长够长够长够长";
  var LONG_GLOSS = "国际化，使国际化的一个相当长的释义用来测试截断省略号功能";
  var FIXTURES = [
    { name: "LIFE", word: "LIFE", title: TITLE,
      picks: ["lake", "internationalization", "fire", "echo"],
      glosses: ["湖泊，池塘", LONG_GLOSS, "火，火焰", ""],
      captions: ["", LONG_CAP, "短配文", "hello english caption that wraps in the middle of words because wrapping is by char ok"] },
    { name: "BACKRON", word: "BACKRON", title: null, // 标题留空
      picks: ["bold", "apple", "cat", "king", "river", "ocean", "nest"],
      glosses: ["大胆的", "苹果", LONG_GLOSS, "国王", "", "海洋，大洋", "巢"],
      captions: ["", "短", LONG_CAP, "", "第五格的配文", "", "x y z"] },
  ];
  function writeFixture(k) {
    var f = FIXTURES[k];
    // 存储时间用当前值，避免被18h规则清理；时间不参与绘图，像素仍固定。
    // T23 起只认 v: 2 的新格式（旧格式不再迁移）：glossAuto 空释义为 true，keys 全 0（词都以该格字母开头）
    localStorage.setItem(KEY, JSON.stringify({
      v: 2, t: Date.now(), word: f.word, view: "single", filler: "小满", titleRuns: f.title,
      picks: f.picks.map(function (w) { return [w, ""]; }), glosses: f.glosses, captions: f.captions,
      glossAuto: f.glosses.map(function (g) { return !g; }), keys: f.glosses.map(function () { return 0; }),
    }));
  }

  // 进度存在 sessionStorage：none → 写 LIFE 刷新；ready0 → 测 LIFE，写 BACKRON 刷新；ready1 → 测 BACKRON，输出全部
  var step = sessionStorage.getItem(FLAG);
  if (step !== "ready0" && step !== "ready1") {
    sessionStorage.removeItem(ROWS);
    await sleep(800); // 等应用自己的草稿防抖写完，否则刷新时它会把固定草稿覆盖掉
    writeFixture(0);
    sessionStorage.setItem(FLAG, "ready0");
    location.reload();
    return "已写入固定草稿 LIFE 并刷新，请再运行一次本脚本（共 3 次）";
  }
  var fx = step === "ready0" ? 0 : 1;
  sessionStorage.removeItem(FLAG);

  // 固定光栅化路径：Chrome 会按历史在 GPU / CPU 画布间切换，文字抗锯齿不同，同一份输入的 JPEG 会随之变化（实测 7 格列阵）。
  // 只改本测试页的 getContext，强制软件画布；不改 app 行为
  var rawGetContext = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function (type, attrs) {
    return type === "2d" ? rawGetContext.call(this, type, Object.assign({ willReadFrequently: true }, attrs)) : rawGetContext.apply(this, arguments);
  };

  // 草稿恢复完成（卡下字母栏出现全部字母）、字体就绪
  await until(function () { return $("pagerLetters").children.length === FIXTURES[fx].word.length; }, 8000, "草稿恢复");
  await Promise.all(["400", "700"].map(function (w) {
    return Promise.all(["Noto Sans", "Noto Sans SC"].map(function (f) { return document.fonts.load(w + " 20px \"" + f + "\"", "Aa字"); }));
  }));
  await document.fonts.ready;
  await sleep(300);

  async function sha1(s) {
    var buf = await crypto.subtle.digest("SHA-1", new TextEncoder().encode(s));
    return Array.prototype.map.call(new Uint8Array(buf), function (b) { return ("0" + b.toString(16)).slice(-2); }).join("");
  }

  async function setDefaultImage() {
    var c = document.createElement("canvas");
    c.width = 1600; c.height = 1000;
    var g = c.getContext("2d"), grad = g.createLinearGradient(0, 0, 1600, 1000);
    grad.addColorStop(0, "#d86b3a"); grad.addColorStop(0.5, "#3a8fd8"); grad.addColorStop(1, "#1f2a44");
    g.fillStyle = grad; g.fillRect(0, 0, 1600, 1000);
    g.fillStyle = "#ffffff"; g.fillRect(200, 150, 300, 200); // 一块白，方便看取景
    var blob = await new Promise(function (ok) { c.toBlob(ok, "image/png"); });
    var dt = new DataTransfer();
    dt.items.add(new File([blob], "gradient.png", { type: "image/png" }));
    $("plateHit").click();
    $("photo").files = dt.files;
    $("photo").dispatchEvent(new Event("change", { bubbles: true }));
    await until(function () { return !$("cropper").hidden; }, 5000, "默认图取景");
    $("cropApply").click();
    $("imgClose").click();
    await until(function () { return !!document.querySelector("#mirror canvas.b-image"); }, 5000, "默认图载入"); // T15 起默认图在配图面板里；载入后卡上图版出现小画布
    await sleep(200);
  }

  async function run(scene, theme) {
    var out = [];
    document.documentElement.setAttribute("data-theme", theme);
    for (var view of ["single", "grid"]) {
      $(view === "single" ? "viewSingle" : "viewGrid").click(); // T10 起版式切换在顶部栏按钮（原为 name=view 的单选）
      await sleep(100);
      // T18 起走真实的完成流程：点「完成」→ 面板自动逐张导出 → 浏览器里点「导出图片」→ 结果页的 <img> 就是导出的 data URL
      $("finish").click();
      await until(function () { return /失败/.test($("finMsg").textContent) || (!$("finishPanel").hidden && !$("finish").disabled && !$("exportView").hidden && !$("exportView").disabled); }, 20000, "导出 " + view);
      if (/失败/.test($("finMsg").textContent)) throw new Error("导出失败：" + view);
      $("exportView").click();
      var imgs = document.querySelectorAll("#resList img");
      for (var i = 0; i < imgs.length; i++) {
        out.push({ fixture: FIXTURES[fx].name, scene: scene, theme: theme, view: view, index: i, length: imgs[i].src.length, sha1: await sha1(imgs[i].src) });
      }
      $("resClose").click();
      $("finishPanel").click(); // 点遮罩关闭面板
      await sleep(100);
    }
    return out;
  }

  var rows = [], theme0 = document.documentElement.getAttribute("data-theme");
  await setDefaultImage();
  for (var theme of ["light", "dark"]) rows = rows.concat(await run("A-默认图", theme));
  $("defRemove").click(); // T15 起「移除默认图」在配图面板里（面板没开时 click() 照样触发）
  await sleep(200);
  for (var theme of ["light", "dark"]) rows = rows.concat(await run("B-无图", theme));
  if (theme0) document.documentElement.setAttribute("data-theme", theme0); else document.documentElement.removeAttribute("data-theme");
  var all = JSON.parse(sessionStorage.getItem(ROWS) || "[]").concat(rows);
  if (fx === 0) {
    sessionStorage.setItem(ROWS, JSON.stringify(all));
    await sleep(800);
    writeFixture(1);
    sessionStorage.setItem(FLAG, "ready1");
    location.reload();
    return "LIFE 已测完并写入 BACKRON 草稿，刷新中，请再运行一次本脚本";
  }
  sessionStorage.removeItem(ROWS);
  console.table(all);
  return all.map(function (r) { return [r.fixture, r.scene, r.theme, r.view, r.index, r.length, r.sha1].join(" "); }).join("\n");
})();
