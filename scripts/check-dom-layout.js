// DOM 卡 ↔ 版式数值一致性检查（D5 / T09）。不打包，不在 Node 里跑：在预览页（npm run dev）的浏览器控制台整段粘贴运行。
// 约定：DOM 卡根元素 #card 带 data-k（缩放系数 = 卡显示宽 / 版式宽），每个框带 data-role；
//   水平：data-x / data-w（版式坐标下的左端与前进宽）；矩形框另有 data-y / data-h；文字框另有 data-size（字号）/ data-baseline（基线）。
// 比对（偏差 > 1.5px 的框列出来，字号偏差 > 0.05px 也算——超出说明浏览器改了字号，比如最小字号限制）：
//   左端 dx、宽 dw、矩形的顶 dy 和高 dh、文字的基线 dbase（插一个零尺寸 inline-block 探针实测，不依赖 app.js 的比例）、字号 dsize。
// T16：单图编辑面的标题是卡顶的真控件（#title，role = ctl-title），不在镜像里；它带 data-x / data-size / data-baseline（末行基线，探针放在内容末尾），
//   同样参与比对。改单词模式 / 列阵下它是隐藏的，不会出现在汇总里。
// 输出：按 role 汇总的最大偏差表；全部通过时打印「dom layout ok」。返回汇总数组，方便拷贝。
(function () {
  "use strict";
  var LIMIT = 1.5, SIZE_LIMIT = 0.05;
  var card = document.querySelector("[data-k]");
  if (!card) { console.warn("check-dom-layout：页面上没有带 data-k 的 DOM 卡"); return; }
  var k = Number(card.getAttribute("data-k"));
  var origin = card.getBoundingClientRect();
  var bad = [], sum = {};
  var num = function (node, name) { return node.hasAttribute(name) ? Number(node.getAttribute(name)) : null; };

  Array.prototype.forEach.call(card.querySelectorAll("[data-role]"), function (node) {
    var role = node.getAttribute("data-role");
    var r = node.getBoundingClientRect();
    var row = { role: role, dx: Math.abs((r.left - origin.left) - num(node, "data-x") * k), dw: 0, dy: 0, dh: 0, dbase: 0, dsize: 0 };
    if (node.hasAttribute("data-w")) row.dw = Math.abs(r.width - num(node, "data-w") * k);
    if (node.hasAttribute("data-y")) {
      row.dy = Math.abs((r.top - origin.top) - num(node, "data-y") * k);
      row.dh = Math.abs(r.height - num(node, "data-h") * k);
    }
    if (node.hasAttribute("data-baseline")) {
      var mark = document.createElement("span"); // 零尺寸、vertical-align: baseline：底边就是这一行的基线
      mark.style.cssText = "display:inline-block;width:0;height:0;vertical-align:baseline";
      node.appendChild(mark);
      row.dbase = Math.abs((mark.getBoundingClientRect().bottom - origin.top) - num(node, "data-baseline") * k);
      node.removeChild(mark);
      row.dsize = Math.abs(parseFloat(getComputedStyle(node).fontSize) - num(node, "data-size") * k);
    }
    var s = sum[role] || (sum[role] = { role: role, n: 0, dx: 0, dw: 0, dy: 0, dh: 0, dbase: 0, dsize: 0 });
    s.n++;
    ["dx", "dw", "dy", "dh", "dbase", "dsize"].forEach(function (f) { if (row[f] > s[f]) s[f] = row[f]; });
    if (row.dx > LIMIT || row.dw > LIMIT || row.dy > LIMIT || row.dh > LIMIT || row.dbase > LIMIT || row.dsize > SIZE_LIMIT) bad.push(row);
  });

  var table = Object.keys(sum).map(function (role) {
    var s = sum[role];
    return { role: role, n: s.n, dx: s.dx.toFixed(2), dw: s.dw.toFixed(2), dy: s.dy.toFixed(2), dh: s.dh.toFixed(2), dbase: s.dbase.toFixed(2), dsize: s.dsize.toFixed(3) };
  });
  console.table(table);
  if (bad.length) console.table(bad.map(function (b) { return { role: b.role, dx: b.dx.toFixed(2), dw: b.dw.toFixed(2), dy: b.dy.toFixed(2), dh: b.dh.toFixed(2), dbase: b.dbase.toFixed(2), dsize: b.dsize.toFixed(3) }; }));
  else console.log("dom layout ok（k = " + k.toFixed(4) + "，" + card.querySelectorAll("[data-role]").length + " 个框）");
  return table;
})();
