import { appSource } from "./app-source.mjs";
// core.js 自检：纯逻辑（选词、候选、版式、释义、草稿迁移）。`npm test`
import assert from "node:assert/strict";
import fs from "node:fs";
import { legacyDir } from "./legacy-packs.mjs";
const LEGACY = legacyDir(); // 旧管线词包：T19 接入后不再随包，从固定提交取出（见 legacy-packs.mjs）

globalThis.window = {};
const load = (rel) => new Function(fs.readFileSync(new URL(rel, import.meta.url), "utf8"))();
load("../app/assets/block/core.js"); load("../app/assets/lang/en/block.js"); // core.js 的 blocked() 经 window.BLOCK；先装上，和小红书版一致
load("../app/assets/i18n.js"); // 界面文案表（v00.04.00 批 0）：core.js 版式里的字经 window.I18N 取
load("../app/assets/core.js");
const C = window.CORE;
assert.ok(C, "core.js 没有暴露 window.CORE");

// 导出结构：函数都在
for (const name of ["blocked", "filterWords", "uniqueHan", "customWord", "senseGroups", "senseList", "defaultGloss", "defaultPos",
  "capitalize", "containsLetter", "resolveKeyAt", "rewriteWord", "swipeDir", "swipeAllowed", "swipeTarget", "trackedWidth", "charX", "fitTitle", "fitWord", "exportTitleRuns", "runColor",
  "layoutCard", "gridShape", "layoutGrid", "filterTiers", "letterTiers", "candidates", "pageOf", "randomPool", "nextGloss", "migrateDraft", "titleOrWord", "noteTitle", "titleModeOf", "normalizeWord", "keepSame", "titleEditKept", "pasteFitLength"])
  assert.equal(typeof C[name], "function", `CORE.${name} 应是函数`);

// 已定的常量（D14 / D16 / D19）
assert.equal(C.PAGE_SIZE, 8);
assert.deepEqual(C.PALETTE.light, { bg: "#e9e8e4", ink: "#1c1c1b", red: "#b0301c", plate: "#dfded9", mute: "#5f5d58", soft: "#3b3a38", ph: "#69665f" }); // ph 2026-10-22 无障碍审查加深（原 #a3a09a 2.13:1）
assert.deepEqual(C.PALETTE.dark, { bg: "#0b0b0a", ink: "#e7e5e0", red: "#e5674f", plate: "#1a1a19", mute: "#a09d97", soft: "#cfccc6", ph: "#88857f" }); // T31b（U13）底 / 图版改近黑；
// T31b：深色文字色对底 / 图版 / 面板（#151514）都 ≥ 4.5:1（WCAG 1.4.3）
for (const t of ["ink", "soft", "mute", "ph", "red"]) for (const b of [C.PALETTE.dark.bg, C.PALETTE.dark.plate, "#151514"]) assert.ok(C.contrastRatio(C.PALETTE.dark[t], b) >= 4.5, "深色 " + t + " 对 " + b + "：" + C.contrastRatio(C.PALETTE.dark[t], b).toFixed(2)); // ph 原 #6f6c66 3.43:1
assert.equal(C.CARD.M + C.CARD.CW + C.CARD.M, C.CARD.W, "单图左右页边距 + 内容宽 = 1080");
assert.equal(C.CARD.WORD.base, 1036);
assert.equal(C.CARD.BAR.y, 1068);
assert.equal(C.GRID.M, 100);
assert.equal(C.blocked("sex"), true, "core 的 blocked 应经 window.BLOCK");

// T04：选词 / 释义（从 app.js 搬来，行为不变）
const W = [["image", "adj.想象的|n.图像"], ["face", "n.脸，面容|v.面对"], ["magic", "n.魔法"], ["imagine", "v.想象"], ["fine", "adj.好的"]];
const names = (list) => list.map((x) => x[0]);
assert.deepEqual(names(C.filterWords(W, "")), names(W), "空查询原样返回");
assert.deepEqual(names(C.filterWords(W, "ima")), ["image", "imagine"], "前缀词按原顺序");
assert.deepEqual(names(C.filterWords(W, "ag")), ["image", "magic", "imagine"], "包含档保持原顺序");
assert.deepEqual(names(C.filterWords(W, "i")), ["image", "imagine", "magic", "fine"], "前缀在前、包含在后，同档保持原顺序");
assert.deepEqual(names(C.filterWords(W, "脸庞")), ["face"], "中文模糊：脸庞 → face（脸，面容）");
assert.deepEqual(names(C.filterWords(W, "想象")), ["imagine", "image"], "T06：imagine 的义项恰为「想象」（完全命中）排在 image 的「想象的」（部分命中）前面，虽然 image 在原列表更靠前");
assert.deepEqual(names(C.filterWords(W, "ad")), [], "搜 ad 不命中词性标记 adj.");
assert.deepEqual(C.uniqueHan("脸脸庞a庞"), ["脸", "庞"]);

// T06 / D1：中文查询按义项命中程度排序——义项完全命中 > 部分命中（义项包含）> 模糊，同分保持原序。
// 构造样本：同一首字母 l，部分命中项（lifestyle / lodging）都排在输入列表前面
{
  const FL = { l: [["lifestyle", "n.生活方式"], ["lodging", "n.生活费"], ["lazy", "adj.生动的"], ["life", "n.生命，生活"], ["livelihood", "n.生计，生活|v.营生"]] };
  const nmL = (list) => list.map((x) => x[0]);
  assert.deepEqual(nmL(C.filterWords(FL.l, "生活")), ["life", "livelihood", "lifestyle", "lodging", "lazy"], "完全命中（life / livelihood）在前、同分保持原序；部分命中（lifestyle / lodging）居中、同分保持原序；模糊（lazy 只有「生」）垫底");
  assert.deepEqual(nmL(C.candidates(FL, "L", "生活")), ["life", "livelihood", "lifestyle", "lodging", "lazy"], "候选走同一套排序");
  // 同分保序要用输入顺序证明：把同分的两个调个头，结果跟着调头
  const swapped = [FL.l[0], FL.l[1], FL.l[2], FL.l[4], FL.l[3]];
  assert.deepEqual(nmL(C.filterWords(swapped, "生活")), ["livelihood", "life", "lifestyle", "lodging", "lazy"], "同为完全命中，保持输入列表里的先后");
  assert.deepEqual(nmL(C.filterWords([FL.l[1], FL.l[0], FL.l[2], FL.l[3], FL.l[4]], "生活")), ["life", "livelihood", "lodging", "lifestyle", "lazy"], "同为部分命中，保持输入列表里的先后");
  // 义项边界：「生活」不等于「生活方式」的一部分，也不被「生」「活」两个单字义项凑成
  assert.deepEqual(nmL(C.filterWords([["a1", "n.生，活"], ["a2", "n.生活"]], "生活")), ["a2", "a1"], "义项必须整个等于查询：生，活 只是模糊");
  // 跨词性组：任何一组里有这个义项都算完全命中
  assert.deepEqual(nmL(C.filterWords([["b1", "n.生活方式"], ["b2", "adj.好的|n.生活"]], "生活")), ["b2", "b1"], "第二组里的义项也算");
  // 英文前缀仍然最前（混合查询不改变英文规则）；纯英文查询不受影响
  assert.deepEqual(nmL(C.filterWords([["xlife", "n.生活"], ["life", "n.人生"], ["lifeline", "n.生命线"]], "life")), ["life", "lifeline", "xlife"], "英文：前缀 > 包含，与 T06 无关");
}
assert.deepEqual(C.customWord("Lime", "l"), ["Lime", ""]);
assert.equal(C.customWord("Lime", "i"), null, "T17：词里含 i 但不以 i 开头不再合法");
assert.deepEqual(C.customWord("Idea", "i"), ["Idea", ""], "以 i 开头合法");
assert.deepEqual(C.customWord("Initial", "I"), ["Initial", ""], "不分大小写");
assert.equal(C.customWord("Bold", "i"), null, "词里没有 i");
assert.equal(C.customWord("Live", "I"), null, "i 只在词中");
assert.deepEqual(C.customWord("1ab", "1"), ["1ab", ""], "T41：数字格可以打以该数字开头的自定义词"); assert.equal(C.customWord("-ab", "a"), null, "必须字母或数字开头");
// T41 / U16 / U19：数字格——读法首字母或数字本身开头都算对；候选按读法首字母；提示写「T」（v00.03.01 R03）
assert.equal(C.cellInitial("2"), "t"); assert.equal(C.cellInitial("0"), "o", "0 读作 oh"); assert.equal(C.cellInitial("B"), "b");
assert.ok(C.containsLetter("two", "2") && C.containsLetter("2nd", "2") && C.containsLetter("Time", "2"), "2 格：two / Time / 2nd 都对");
assert.ok(!C.containsLetter("one", "2") && !C.containsLetter("3rd", "2"), "2 格：别的读法或别的数字不对");
// T31：数字格的读音别名（用户批准的英文表）——候选可选即合法，候选与校验同一条规则
{
  for (const [w, d] of [["zero", "0"], ["Zeroth", "0"], ["won", "1"], ["wonder", "1"], ["ate", "8"], ["for", "4"], ["forest", "4"], ["too", "2"], ["oh", "0"], ["one", "1"], ["eight", "8"], ["4ever", "4"]]) assert.ok(C.containsLetter(w, d), `${d} 格接受 ${w}`);
  for (const [w, d] of [["zebra", "0"], ["water", "1"], ["apple", "8"], ["zero", "1"], ["won", "2"], ["ate", "4"], ["atone", "1"], ["before", "4"], ["late", "8"]]) assert.ok(!C.containsLetter(w, d), `${d} 格不接受 ${w}：别名是精确前缀，不放开整组字母`);
  assert.ok(C.containsLetter("orange", "0") && C.containsLetter("east", "8") && C.containsLetter("time", "2"), "原有读法首字母规则不回归");
  const W = { o: [["old", "adj.老的"], ["oh", "int.哦"], ["one", "num.一"]], z: [["zebra", "n.斑马"], ["zero", "n.零"]], w: [["water", "n.水"], ["won", "v.赢了"]], e: [["east", "n.东"], ["eight", "num.八"]], a: [["apple", "n.苹果"], ["ate", "v.吃了"]] };
  const head = (d) => C.letterTiers(W, d).head.map((x) => x[0]);
  assert.deepEqual(head("0"), ["oh", "zero", "old", "one"], "0 格：别名开头的排最前（本组的 oh、别组的 zero），其余 O 开头的照原顺序");
  assert.deepEqual(head("1"), ["one", "won", "old", "oh"]); assert.deepEqual(head("8"), ["eight", "ate", "east"]);
  assert.deepEqual(head("o"), ["old", "oh", "one"], "字母格不变");
  assert.deepEqual(C.candidates(W, "0", "zero", null).map((x) => x[0]).slice(0, 1), ["zero"], "0 格里查 zero：出现在候选");
  assert.equal(C.customWord("zeroes", "0")[0], "zeroes", "手填别名开头的词典外词也合法");
  assert.deepEqual(C.LANG.digitSounds[4], ["for", "fore", "four"]);
}
assert.ok(C.containsLetter("oak", "0") && C.containsLetter("0day", "0"));
assert.equal(C.startText("2"), "T"); assert.equal(C.startText("L"), "L");
// v00.03.00：格首提示把算对的写法全列出来——有跨首字母的读音别名时写出别名（zero / won / ate），与 containsLetter 同一条规则
assert.equal(["0", "1", "4", "8", "9"].map(d => C.startText(d)).join(" | "), "O/zero | O/won | F | E/ate | N");
assert.equal(C.startSpoken("0") + " | " + C.startSpoken("L"), "O 或 zero | L", "读屏写法：斜线换成「或」");
for (const [d, w] of [["0", "zero"], ["0", "oh"], ["0", "0th"], ["1", "won"], ["8", "ate"], ["8", "eight"]]) assert.equal(C.containsLetter(w, d), true, "提示里列出的写法都算对：" + d + " " + w);
assert.equal(C.customWord("a".repeat(29), "a"), null, "最长 28 字符"); assert.equal(C.customWord("a".repeat(28), "a")[0], "a".repeat(28), "28 个字符的词典外词合法（E2）");
assert.deepEqual(C.senseGroups(["image", "adj.想象的，虚拟的|n.图像|[计]映像"]),
  [{ pos: "adj.", senses: ["想象的", "虚拟的"] }, { pos: "n.", senses: ["图像"] }, { pos: "[计]", senses: ["映像"] }]);
assert.deepEqual(C.senseList(["image", "adj.想象的，虚拟的|n.图像"]), ["想象的", "虚拟的", "图像"]);
assert.equal(C.defaultGloss(["image", "adj.想象，虚拟|n.图像"]), "想象", "默认取数据层第一组的第一义");
assert.deepEqual(C.displayGroups(["red", "adj.红色，脆弱（书），大的|n.目的"]), [{ pos:"adj.", senses:["红色","脆弱（书）","大的"] },{ pos:"n.", senses:["目的"] }]);
// v00.03.01：配文截断时把后面几行拼回一行，折行处原有的空格要补回（原来「ut labore」会拼成「utlabo…」）
{ const cw = C.wrapCaption((f, t) => t.length * 60, "lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod", 0);
  assert.equal(cw.cut, true); assert.match(cw.lines[cw.lines.length - 1], /^consectetur ad/, "截断行保留词间空格：" + JSON.stringify(cw.lines));
  // 复审补：原文没有空格的折行处（中文、逐字拆开的长词）拼回时不能多出空格
  const m60 = (f, t) => [...t].length * 60;
  // 每行 15 字、2 行：第 2 行只有一个「春」，后面 15 个 b 的词整个换行（折行处原文无空格），截断拼回应是「春bbb…」
  const r = C.wrapCaption(m60, "春".repeat(16) + "b".repeat(15) + "春".repeat(20), 64);
  assert.deepEqual(r.lines, ["春".repeat(15), "春" + "b".repeat(13) + "…"], "原文无空格的折行处不插空格");
  // 截在补回的空格上：省略号紧跟词尾，不留空格
  const r2 = C.wrapCaption(m60, "x".repeat(15) + " " + "y".repeat(15) + " " + "a".repeat(13) + " " + "b".repeat(15) + " c", 0);
  assert.equal(r2.lines[2], "a".repeat(13) + "…", "省略号前不留空格：" + JSON.stringify(r2.lines)); }
// T37 / U11：显示层去掉人名 / 地名类括号标注（闭合、不闭合、被「，」劈开的残片），其余括号说明保留；词库原文与专名判断不动
assert.equal(C.stripNameLabel("戴维（男子名）"), "戴维");
assert.equal(C.stripNameLabel("凯特（女子名"), "凯特", "不闭合写法");
assert.equal(C.stripNameLabel("姓氏）"), "", "被切开的后半截");
assert.equal(C.stripNameLabel("金斯敦（牙买加首都）"), "金斯敦", "带地点信息的也去掉");
assert.equal(C.stripNameLabel("狄更斯（英国作家）"), "狄更斯");
assert.equal(C.stripNameLabel("马克（德国货币）"), "马克（德国货币）", "非名字 / 地名说明保留");
assert.equal(C.stripNameLabel("水的（河、湖、海的）"), "水的（河、湖、海的）");
assert.deepEqual(C.displayGroups(["david", "n.大卫，戴维（男子名）"]), [{ pos: "n.", senses: ["大卫", "戴维"] }]);
assert.deepEqual(C.displayGroups(["andy", "n.安迪（男子名，姓氏）"]), [{ pos: "n.", senses: ["安迪"] }], "残片去掉后为空的义项不留");
assert.deepEqual(C.displayGroups(["x", "n.甲（人名），甲（姓氏）"]), [{ pos: "n.", senses: ["甲"] }], "去标签后重复的义项合并");
assert.deepEqual(C.displayGroups(["andy", "n.等于Andrew），安迪（男子名"]), [{ pos: "n.", senses: ["安迪"] }], "名字说明被切开的后半截一并去掉");
assert.deepEqual(C.displayGroups(["x", "v.讨厌等），嫌"]), [{ pos: "v.", senses: ["讨厌等）", "嫌"] }], "非名字残片不在 T37 范围，原样保留");
// T39：「换一组」避开上一组；剩下不够时才放宽
{
  const fixed = () => 0, a = C.pickPresets(6, fixed), b = C.pickPresets(6, fixed, a); // 同一随机源：不避开就会抽到同一组
  assert.deepEqual(C.pickPresets(6, fixed), a, "对照：同一随机源不避开时结果相同");
  assert.equal(b.length, 6); assert.equal(b.filter(w => a.includes(w)).length, 0, "换一组：与上一组不重复");
}
assert.equal(C.defaultGloss(["david", "n.戴维（男子名），大卫"]), "戴维", "默认释义不带标签");
assert.equal(C.properName(["david", "n.大卫，戴维（男子名）"]), true, "随机池的专名判断仍看词库原文");
assert.equal(C.defaultPos(["image", "adj.想象的"]), "adj.");
assert.equal(C.defaultGloss(["x", ""]), "");
assert.equal(C.capitalize("image"), "Image");
// 义项过屏蔽器：整组都被拦则该组消失（屏蔽器在，窗口里有 BLOCK）
assert.deepEqual(C.displayGroups(["drug", "n.药物|n.毒品"]), [{pos: "n.", senses: ["药物"]}]);
assert.deepEqual(C.filterWords([["drug", "n.药物|n.毒品"]], "毒品"), []);
assert.deepEqual(C.senseGroups(["sex", "n.性爱"]), [], "被屏蔽的义项和变空的组都去掉");
assert.equal(C.FONT.indexOf("Noto Sans"), 1);
// 没有屏蔽器（window.BLOCK）时放行（用一个没有 BLOCK 的 window 重新加载）
{
  const saved = globalThis.window;
  globalThis.window = {};
  load("../app/assets/core.js");
  const N = window.CORE;
  assert.equal(N.blocked("sex"), false, "没有 window.BLOCK 就放行");
  assert.deepEqual(N.senseGroups(["sex", "n.性爱"]), [{ pos: "n.", senses: ["性爱"] }]);
  globalThis.window = saved;
}
// T06 / T07：layoutCard（D14 单图）/ layoutGrid（D14，T08）。假测量：拉丁 0.55 倍字号、其余 1 倍字号（中文放不下才会触发缩字号 / 省略 / 折行）
const plainOf = (v) => JSON.parse(JSON.stringify(v)); // 跨上下文的数组 / 对象按值比
const fm = (font, text) => {
  const size = parseFloat(String(font).match(/(\d+(?:\.\d+)?)px/)[1]);
  return [...String(text)].reduce((w, ch) => w + (/[ -~]/.test(ch) ? 0.55 : 1) * size, 0);
};
const LONG_CAP = "这是一段很长的配文用来测试折行与省略号，需要超过两行才能触发末尾的截断逻辑，所以再多写一些字让它够长够长够长够长够长";
const LONG_GLOSS = "国际化，使国际化的一个相当长的释义用来测试截断省略号功能";
const WORDS = ["lake", "internationalization", "fire", "echo", "bold", "apple", "cat", "king", "river", "ocean"];
// v00.03.03 真机反馈 F4：对开默认不再画格子进度。这里的旧断言量的是「画格子进度时」的几何，所以没写 prog 的一律补成显示；
// 默认隐藏另有断言（见「缺省 = 对开」那一段）。写了预设名的（"center"、"folio"）不动
const withProg = (d) => {
  if (d.layout === undefined) d.layout = { prog: true };
  else if (d.layout && typeof d.layout === "object" && !("prog" in d.layout)) d.layout = Object.assign({ prog: true }, d.layout);
  return d;
};
const ldata = (n, withImage, over) => withProg(Object.assign({
  letters: "ABCDEFGHIJ".slice(0, n).split(""), i: 0,
  picks: WORDS.slice(0, n).map((w) => [w, ""]),
  glosses: WORDS.slice(0, n).map((w, k) => (k % 3 === 1 ? LONG_GLOSS : k % 3 === 2 ? "" : "湖泊，池塘")),
  captions: WORDS.slice(0, n).map((w, k) => (k % 3 === 1 ? LONG_CAP : k % 3 === 2 ? "" : "短配文")),
  titleRuns: [{ t: "总之 这里有", b: true, i: false, c: null }, { t: "几种", b: true, i: true, c: "#b0301c" }, { t: "情况", b: false, i: false, c: null }],
  filler: "小满", hasImage: () => withImage,
}, over));
// 框的外接矩形：矩形类直接取；文字类取 [基线 − 0.86 字号, 基线 + 0.25 字号]（与母版 top = 基线 − 0.86 × 字号 同口径）；center / right 按锚点换算
const rectOf = (b) => {
  if (b.h !== undefined) return [b.x, b.y, b.x + b.w, b.y + b.h];
  const w = b.w !== undefined ? b.w : fm(C.fontOf(b.weight, b.size, b.italic), b.text); // giant 没有 w
  const x0 = b.align === "center" ? b.x - w / 2 : b.align === "right" ? b.x - w : b.x;
  const r = [x0, b.baseline - 0.86 * b.size, x0 + w, b.baseline + 0.25 * b.size];
  // 带 clip 的框（图版里的超大字母）只画裁切框以内的部分
  return b.clip ? [Math.max(r[0], b.clip[0]), Math.max(r[1], b.clip[1]), Math.min(r[2], b.clip[0] + b.clip[2]), Math.min(r[3], b.clip[1] + b.clip[3])] : r;
};
const OVERLAY = new Set(["image", "giant"]); // 叠在图版上，本来就和 plate 重叠
const checkLayout = (L, what) => {
  const flow = [];
  for (const b of L.boxes) {
    const [x0, y0, x1, y1] = rectOf(b);
    assert.ok(x0 >= 0 && y0 >= 0 && x1 <= L.W && y1 <= L.H, `${what}：${b.role} 超出画布 ${[x0, y0, x1, y1]} / ${L.W}×${L.H}`);
    if (!OVERLAY.has(b.role)) flow.push([b.role, [x0, y0, x1, y1]]);
  }
  for (let a = 0; a < flow.length; a++) for (let c = a + 1; c < flow.length; c++) {
    const [, p] = flow[a], [, q] = flow[c];
    const hit = p[0] < q[2] - 1e-6 && q[0] < p[2] - 1e-6 && p[1] < q[3] - 1e-6 && q[1] < p[3] - 1e-6;
    assert.ok(!hit, `${what}：${flow[a][0]} 与 ${flow[c][0]} 重叠 ${p} / ${q}`);
  }
};
for (let n = 1; n <= 10; n++) {
  for (const img of [true, false]) {
    checkLayout(C.layoutGrid(ldata(n, img), fm), `列阵 n=${n} 图=${img}`);
    for (let i = 0; i < n; i++) checkLayout(C.layoutCard(ldata(n, img, { i }), fm), `单图 n=${n} i=${i} 图=${img}`);
  }
}

// v00.03.03 L1：版式参数（data.layout）。不传、「对开」预设、认不得的值，排出来都和改版前一样；其余取值不越界、不重叠
{
  const F = C.LAYOUTS.folio, role = (L, r) => L.boxes.filter((b) => b.role === r), near = (a, b) => Math.abs(a - b) < 1e-6;
  assert.deepEqual(plainOf(C.layoutOf()), plainOf(F), "缺省 = 对开");
  { // F4：对开默认不画格子进度（单图的页码、列阵的格数）；F8：列阵标题听 title，不满的一行与格里的字听 text
    const raw = (over) => { const d = ldata(4, true, over); delete d.layout; return Object.assign(d, over && over.layout !== undefined ? { layout: over.layout } : {}); };
    assert.equal(F.prog, false);
    assert.equal(role(C.layoutCard(raw(), fm), "info-folio").length + role(C.layoutGrid(raw(), fm), "info-count").length, 0, "不存版式的作品不画格子进度");
    assert.equal(role(C.layoutCard(raw({ layout: { prog: true } }), fm), "info-folio").length, 1, "拨成显示就画");
    const gt = (layout) => { const L = C.layoutGrid(raw({ layout, word: "AB", titleRuns: [] }), fm), t = role(L, "title"); return [t[0].x, t[t.length - 1].x + t[t.length - 1].w - t[0].track, L.W]; };
    const a = gt({ text: "right", title: "left" }), b = gt({ text: "left", title: "center" });
    assert.equal(a[0], 100, "词与释义靠右、标题靠左：列阵标题仍从左边起");
    assert.ok(near((b[0] + b[1]) / 2, b[2] / 2), "词与释义靠左、标题居中：列阵标题居中");
  }
  assert.deepEqual(plainOf(C.layoutOf("center")), plainOf(C.LAYOUTS.center));
  assert.deepEqual(plainOf(C.layoutOf("constructor")), plainOf(F), "认不得的预设名落回对开");
  assert.deepEqual(plainOf(C.layoutOf({ text: "right", cap: "up", ratio: "16:9", prog: "no", quote: true })), plainOf(Object.assign({}, F, { text: "right", quote: true })), "认不得的值逐项落回对开");
  assert.notEqual(C.layoutOf("folio"), F, "每次给新对象，改它不动预设");
  for (const n of [1, 4, 7, 10]) for (const img of [true, false]) for (const layout of ["folio", F, {}, { text: "weird" }, null]) {
    assert.deepEqual(plainOf(C.layoutGrid(Object.assign(ldata(n, img), { layout }), fm)), plainOf(C.layoutGrid(ldata(n, img, { layout: null }), fm)), `列阵 n=${n}：缺省等价`);
    for (let i = 0; i < n; i++) assert.deepEqual(plainOf(C.layoutCard(Object.assign(ldata(n, img, { i, edit: true }), { layout }), fm)), plainOf(C.layoutCard(ldata(n, img, { i, edit: true, layout: null }), fm)), `单图 n=${n} i=${i}：缺省等价`);
  }
  // 十个开关的取值组合：都在画布内、互不重叠（i=1 是折成两行的长词，带冠词时是 la；i=2 没有释义与配文）
  const A3 = ["left", "center", "right"], ARTS = ["der", "la", "l’", "il", "das", "", "le", "", "die", ""];
  const FOLD = [["lake", ""], ["bodenseedampfschifffahrtsgesellschaftskapitaen", ""], ["fire", ""], ["echo", ""]]; // internationalization 在假测量下缩字号就放得下，不折行
  for (const text of A3) for (const cap of A3) for (const title of ["left", "center"]) for (const ratio of ["3:2", "1:1", "3:4"]) for (const plateX of A3) for (const order of ["plate", "text"]) for (const flag of [true, false]) {
    const layout = { text, cap, title, ratio, plateX, order, prog: flag, filler: flag, deco: flag, quote: !flag };
    for (let i = 0; i < 4; i++) checkLayout(C.layoutCard(ldata(4, flag, { i, layout, edit: i === 2, articles: flag ? ARTS : null, picks: FOLD }), fm), `单图 ${JSON.stringify(layout)} i=${i}`);
  }
  for (const text of A3) for (const flag of [true, false]) for (let n = 1; n <= 10; n++) {
    checkLayout(C.layoutGrid(ldata(n, flag, { layout: { text, prog: flag, filler: flag, deco: flag }, articles: flag ? ARTS : null }), fm), `列阵 ${text} n=${n}`);
  }

  // 居中预设：不画页码、墨线、墨条，填表人保留；词、释义、配文各自居中，配文带引号；单图标题仍靠左
  let L = C.layoutCard(ldata(4, true, { layout: "center" }), fm);
  for (const r of ["info-folio", "rule", "bar"]) assert.equal(role(L, r).length, 0, `居中预设不画 ${r}`);
  assert.equal(role(L, "info-filler").length, 1);
  for (const r of ["word", "gloss", "caption"]) for (const b of role(L, r)) assert.ok(near(b.x + b.w / 2, 540), `${r} 居中`);
  assert.equal(role(L, "caption")[0].text, "“短配文”");
  assert.equal(role(L, "title")[0].x, 80);
  assert.equal(role(C.layoutCard(ldata(4, true, { layout: "folio" }), fm), "caption")[0].text, "短配文", "对开不加引号");
  // 折行的长词：每一行各自居中
  L = C.layoutCard(ldata(4, true, { i: 1, layout: "center", picks: [["lake", ""], ["bodenseedampfschifffahrtsgesellschaftskapitaen", ""], ["fire", ""], ["echo", ""]] }), fm);
  assert.ok(role(L, "word").length > 1, "长词折行");
  for (const b of role(L, "word")) assert.ok(near(b.x + b.w / 2, 540), "折行后每行居中");
  // 冠词连同第一行一起对齐
  L = C.layoutCard(ldata(4, true, { articles: ["der", "", "", ""], layout: "center" }), fm);
  { const a = role(L, "article")[0], w = role(L, "word")[0]; assert.ok(a.x < w.x && near((a.x + w.x + w.w) / 2, 540), "冠词与词合起来居中"); }
  // 块内右对齐的冠词（la 比 der 窄）：按看得见的冠词左沿居中，靠右时右沿仍在 1000（QA 11-20）
  for (const art of ["la", "el (la)", "l’"]) {
    L = C.layoutCard(ldata(4, true, { articles: [art, "", "", ""], layout: "center" }), fm);
    { const a = role(L, "article")[0], w = role(L, "word")[0]; assert.ok(a.x + a.w <= w.x && near((a.x + w.x + w.w) / 2, 540), `冠词 ${art} 与词合起来居中`); }
    L = C.layoutCard(ldata(4, true, { articles: [art, "", "", ""], layout: { text: "right" } }), fm);
    assert.ok(near(role(L, "word")[0].x + role(L, "word")[0].w, 1000), `冠词 ${art} 靠右`);
  }
  // 靠右：右沿都在 1000；墨条跟着词走。文字与配文是两个开关
  L = C.layoutCard(ldata(4, true, { layout: { text: "right", cap: "right" } }), fm);
  for (const r of ["word", "gloss", "caption", "bar"]) for (const b of role(L, r)) assert.ok(near(b.x + b.w, 1000), `${r} 靠右`);
  L = C.layoutCard(ldata(4, true, { layout: { text: "center", cap: "left" } }), fm);
  assert.ok(near(role(L, "gloss")[0].x + role(L, "gloss")[0].w / 2, 540) && role(L, "caption")[0].x === 80, "词与释义居中、配文靠左");
  // 标题居中：各段合起来的一整行居中
  L = C.layoutCard(ldata(4, true, { layout: { title: "center" } }), fm);
  // 框宽是前进宽度（每个字后面都带字距），看得见的右端要减掉最后一个字距
  { const t = role(L, "title"), last = t[t.length - 1]; assert.ok(t.length === 3 && near(t[0].x + last.x + last.w - last.track, 1080), "标题整行居中"); }
  // 图版：高度不变只收宽度；1:1、3:4 分靠左、居中、靠右，3:2 占满宽度不分
  const plate = (layout) => { const p = role(C.layoutCard(ldata(4, true, { layout }), fm), "plate")[0]; return [p.x, p.y, p.w, p.h]; };
  assert.deepEqual(plate({ ratio: "1:1" }), [80, 290, 600, 600]);
  assert.deepEqual(plate({ ratio: "3:4", plateX: "center" }), [315, 290, 450, 600]);
  assert.deepEqual(plate({ ratio: "3:4", plateX: "right" }), [550, 290, 450, 600]);
  assert.deepEqual(plate({ ratio: "3:2", plateX: "right" }), [80, 290, 920, 600]);
  L = C.layoutCard(ldata(4, false, { layout: { ratio: "3:4", plateX: "right" } }), fm);
  assert.deepEqual(plainOf(role(L, "giant")[0].clip), [550, 290, 450, 600], "大字母的裁切框跟着图版");
  assert.equal(role(L, "giant")[0].x, 550 + C.CARD.GIANT.dx);
  L = C.layoutCard(ldata(4, true, { layout: { ratio: "1:1", plateX: "right" } }), fm);
  assert.deepEqual([role(L, "image")[0].x, role(L, "image")[0].w, role(L, "word")[0].x], [400, 600, 80], "图靠右、字靠左，互不牵连");
  // 图在下：图版放到 780，词、墨条、释义、配文整体上移 616，标题不动
  {
    const up = C.layoutCard(ldata(4, false, { layout: { order: "text" } }), fm), dn = C.layoutCard(ldata(4, false), fm);
    assert.equal(role(up, "plate")[0].y, 780);
    assert.equal(role(up, "giant")[0].baseline, role(dn, "giant")[0].baseline + 490);
    for (const r of ["word", "gloss", "caption"]) assert.equal(role(up, r)[0].baseline, role(dn, r)[0].baseline - 616, r + " 上移");
    assert.equal(role(up, "bar")[0].y, role(dn, "bar")[0].y - 616);
    assert.equal(role(up, "title")[0].baseline, role(dn, "title")[0].baseline);
  }
  // 页码不画时，长填表人可以用整行
  {
    const long = "一个名字特别特别特别长的填表人";
    const a = role(C.layoutCard(ldata(4, true, { filler: long }), fm), "info-filler")[0], b = role(C.layoutCard(ldata(4, true, { filler: long, layout: { prog: false } }), fm), "info-filler")[0];
    assert.ok(b.size > a.size && b.w <= 920, "不画页码时填表人字号更大、仍不越界");
  }
  // 没打词的格：占位字与灰线各自跟着 text 对齐（QA 11-20 补）
  for (const [text, at] of [["center", (b) => b.x + b.w / 2 - 540], ["right", (b) => b.x + b.w - 1000]]) {
    L = C.layoutCard(ldata(4, true, { picks: [["", ""], ["", ""], ["", ""], ["", ""]], layout: { text } }), fm);
    const e = role(L, "empty")[0];
    assert.ok(near(at({ x: e.x, w: fm(C.fontOf(e.weight, e.size), e.text) }), 0) && near(at(role(L, "ul")[0]), 0), `没打词的占位 ${text}`);
  }
  assert.equal(role(C.layoutCard(ldata(4, true, { layout: { filler: false } }), fm), "info-filler").length, 0);

  // 列阵：居中预设不画格数、墨线、墨条；标题听「标题」开关；不满的一行整体居中；每格的词与释义在图框下居中
  L = C.layoutGrid(ldata(7, true, { layout: "center" }), fm);
  assert.equal(role(L, "info-count").length + role(L, "rule").length + role(L, "bar").length, 0);
  assert.equal(role(L, "info-filler").length, 1);
  {
    const p = role(L, "plate"), t = role(L, "title"), last = t[t.length - 1];
    assert.equal(p[0].x, 100, "满的一行不动");
    assert.equal(p[4].x, (L.W - (3 * 300 + 2 * 48)) / 2, "不满的一行整体居中");
    assert.equal(t[0].x, 100, "居中预设的「标题」开关是靠左，列阵标题跟它（F8），不跟词与释义");
    for (const r of ["word", "gloss"]) for (const b of role(L, r)) assert.ok(near(b.x + b.w / 2, p.find((q) => q.i === b.i).x + 150), `列阵 ${r} 在图框下居中`);
  }
  L = C.layoutGrid(ldata(7, true, { layout: { text: "right" } }), fm);
  {
    const p = role(L, "plate"), t = role(L, "title"), last = t[t.length - 1];
    assert.equal(p[4].x, L.W - 100 - (3 * 300 + 2 * 48), "不满的一行靠右");
    assert.equal(t[0].x, 100, "词与释义靠右时列阵标题不跟着靠右（F8）");
    for (const r of ["word", "gloss"]) for (const b of role(L, r)) assert.ok(near(b.x + b.w, p.find((q) => q.i === b.i).x + 300), `列阵 ${r} 靠右`);
    for (const b of role(L, "bar")) assert.ok(p.some((q) => near(q.x + 300, b.x + b.w)), "列阵墨条靠右");
  }
  // 分两张时的「01–05 / 10」也跟格子进度走
  assert.equal(role(C.layoutGrid(ldata(10, true), fm, [0, 5]), "info-count")[0].text, "01–05 / 10");
  assert.equal(role(C.layoutGrid(ldata(10, true, { layout: { prog: false } }), fm, [0, 5]), "info-count").length, 0);
  assert.equal(role(C.layoutGrid(ldata(4, true, { layout: { filler: false } }), fm), "info-filler").length, 0);
  { // 列阵不画格数时，填表人可用整行：同一个长名字，画格数时被截断、不画时完整（QA 11-20 补）
    const long = "名".repeat(37), f = (prog) => role(C.layoutGrid(ldata(4, true, { filler: long, layout: { prog } }), fm), "info-filler")[0].text;
    assert.ok(/…$/.test(f(true)) && f(false) === long, "列阵不画格数时填表人用整行");
  }

  // v00.03.03 L2：预设名（base）、两份版式是否相同、配文实际排的字、草稿字段
  assert.equal(C.layoutOf("center").base, "center"); assert.equal(C.layoutOf({ base: "nope" }).base, "folio");
  assert.ok(C.sameLayout("folio", {}) && C.sameLayout(null, C.LAYOUTS.folio) && C.sameLayout({ base: "center" }, "folio"), "只换 base 不算改了版式");
  assert.ok(!C.sameLayout("folio", "center") && !C.sameLayout("folio", { quote: true }));
  assert.equal(C.captionText("短配文", "center"), "“短配文”"); assert.equal(C.captionText("短配文", "folio"), "短配文"); assert.equal(C.captionText("短配文"), "短配文");
  // 配文限长与排版同一份字：不加引号时刚好写满的配文，加了引号就算写过头（卡上配文框据此不再收字）
  {
    let s = "字";
    while (!C.wrapCaption(fm, s + "字", 0).cut) s += "字";
    assert.ok(!C.wrapCaption(fm, C.captionText(s, "folio"), 0).cut && C.wrapCaption(fm, C.captionText(s, "center"), 0).cut, "引号占配文的地方");
  }
  // 草稿：没有 layout 字段的旧稿不补；有就逐项规整，坏值、缺项落回对开；不是对象的整个当成没设
  const dbase = { v: 2, word: "LIFE" };
  assert.ok(!("layout" in C.migrateDraft(dbase)), "旧稿不补版式字段");
  assert.deepEqual(plainOf(C.migrateDraft(Object.assign({ layout: { text: "center", cap: "sideways", quote: true, base: "center", extra: 1 } }, dbase)).layout), plainOf(Object.assign({}, F, { text: "center", quote: true, base: "center" })));
  for (const bad of [null, 7, "center", [], true]) assert.deepEqual(plainOf(C.migrateDraft(Object.assign({ layout: bad }, dbase)).layout), plainOf(F), "损坏的版式字段落回对开：" + JSON.stringify(bad));
  assert.ok(C.DRAFT_FIELDS.indexOf("layout") >= 0);
  // 还没输入单词时的空卡骨架也读版式（复审 L1-A2）；缺省仍与改版前一样
  {
    const empty = (layout) => C.layoutCard({ letters: [], i: 0, picks: [], glosses: [], captions: [], titleRuns: [], filler: "", hasImage: () => false, layout }, fm);
    assert.deepEqual(plainOf(empty("folio")), plainOf(empty()));
    assert.deepEqual(empty().boxes.map((b) => b.role), ["rule", "plate", "ul"]); // 空卡的提示字 11-21 去掉
    const e = empty({ text: "center", deco: false, ratio: "1:1", plateX: "right", order: "text" });
    assert.deepEqual(e.boxes.map((b) => b.role), ["plate", "ul"]);
    assert.deepEqual([e.boxes[0].x, e.boxes[0].y, e.boxes[0].w], [400, 780, 600]);
    assert.ok(near(e.boxes[1].x + e.boxes[1].w / 2, 540)); // 提示字去掉后，那条线是第二个框
  }
}
// T08：列阵 D14
{
  const G = C.GRID;
  const byRole = (L, r) => L.boxes.filter((b) => b.role === r);
  // 行列 / W / H：≤5 一行，6–10 两行每行 ⌈n/2⌉ 格；W = max(列宽和 + 200, 1080)，H = 300 + 行数 × 620 + 40
  for (let n = 1; n <= 10; n++) {
    const cols = n > 5 ? Math.ceil(n / 2) : n, rows = n > 5 ? 2 : 1;
    const W = Math.max(cols * 300 + (cols - 1) * 48 + 200, 1080), H = 300 + rows * 620 + 40;
    assert.deepEqual(C.gridShape(n), { cols, rows, W, H }, `gridShape(${n})`);
    for (const img of [true, false]) {
      const L = C.layoutGrid(ldata(n, img), fm);
      assert.deepEqual([L.W, L.H], [W, H], `列阵 n=${n} 尺寸`);
      const pl = byRole(L, "plate");
      assert.equal(pl.length, n);
      // 格坐标 = D14：x = 100 + c × 348，y = 300 + r × 620；末行左起（第 c 格 x 与第一行同列相同）
      pl.forEach((b, i) => {
        const r = Math.floor(i / cols), c = i % cols;
        assert.deepEqual([b.x, b.y, b.w, b.h], [100 + c * 348, 300 + r * 620, 300, 400], `列阵 n=${n} 第 ${i} 格`);
      });
      assert.equal(byRole(L, img ? "image" : "giant").length, n);
    }
  }
  assert.deepEqual([C.gridShape(4).W, C.gridShape(4).H], [1544, 960], "4 格 = 1544 × 960");
  assert.deepEqual([C.gridShape(7).cols, C.gridShape(7).rows], [4, 2], "7 格 = 4 + 3，末行左起");
  // 信息栏 / 墨线 / 标题（标题留空用单词）
  const L4 = C.layoutGrid(ldata(4, false, { word: "ABCD", titleRuns: [] }), fm);
  const info = byRole(L4, "info-count")[0], fil = byRole(L4, "info-filler")[0];
  assert.deepEqual([info.text, info.x, info.baseline, info.size, info.color, info.align], ["4 格", 100, 80, 34, "mute", "left"]);
  assert.deepEqual([fil.text, fil.x, fil.baseline, fil.align], ["小满", 1544 - 100, 80, "right"]);
  assert.deepEqual(byRole(L4, "rule")[0], { role: "rule", x: 100, y: 104, w: 1544 - 200, h: 3, color: "ink" });
  assert.deepEqual(byRole(L4, "title").map((b) => [b.text, b.x, b.baseline, b.size, b.track, b.weight]), [["ABCD", 100, 230, 96, -1.5, 700]], "标题留空用单词");
  assert.equal(C.layoutGrid(ldata(4, false, { filler: "  " }), fm).boxes.some((b) => b.role === "info-filler"), false, "填表人留空不画");
  // 格内：超大字母 / 单词 / 墨条 / 释义（以第 1 行第 2 列 = 第 1 格为例，x = 448，y = 300）
  const Lw = C.layoutGrid(ldata(4, false, { picks: [["lake", ""], ["bold", ""], ["fire", ""], ["echo", ""]], glosses: ["", "粗体的", "", ""] }), fm);
  const gi = byRole(Lw, "giant")[1], wd = byRole(Lw, "word")[1], bar = byRole(Lw, "bar")[1], gl = byRole(Lw, "gloss")[0];
  assert.deepEqual([gi.text, gi.x, gi.baseline, gi.size, gi.weight, gi.color], ["B", 448 + 22, 300 + 370, 300, 700, "ink"]);
  assert.deepEqual(gi.clip, [448, 300, 300, 400]);
  assert.deepEqual([wd.text, wd.x, wd.baseline, wd.size, wd.track, wd.keyAt], ["Bold", 448, 300 + 490, 56, -1, 0]);
  assert.deepEqual([bar.x, bar.y, bar.w, bar.h], [448, 300 + 508, 60, 6]);
  assert.deepEqual([gl.text, gl.x, gl.baseline, gl.size, gl.weight, gl.color], ["粗体的", 448, 300 + 560, 28, 400, "soft"]);
  // 关键字母位置（T17）：恒为词首 0；不以该字母开头为 -1；传进来的 keys 被忽略
  const Lk = C.layoutGrid(ldata(4, false, { picks: [["lake", ""], ["bold", ""], ["fire", ""], ["echo", ""]], letters: ["A", "B", "F", "E"], keys: [1, 0, 0, 3] }), fm);
  assert.deepEqual(byRole(Lk, "word").map((b) => b.keyAt), [-1, 0, 0, 0], "lake 在 A 格不合法；其余恒为 0；keys 里的 1 / 3 被忽略");
  // 没词：只出图版与超大字母；词里没有该字母（不合法）：照排、不高亮、invalid（同单图）
  const Le = C.layoutGrid(ldata(2, false, { picks: [null, ["zoo", ""]] }), fm);
  assert.equal(byRole(Le, "word").length, 1);
  assert.deepEqual([byRole(Le, "word")[0].i, byRole(Le, "word")[0].keyAt, byRole(Le, "word")[0].invalid], [1, -1, true]);
  assert.equal(byRole(Le, "giant").length, 2);
  assert.equal(byRole(C.layoutGrid(ldata(2, false, { picks: [null, null] }), fm), "word").length, 0);
  // 长词在 300 宽格里每次 −4 缩，下限 20；释义超宽加「…」
  const LIFEL = { letters: ["L", "I", "F", "E"] };
  const Lg = C.layoutGrid(ldata(4, true, LIFEL), fm);
  assert.equal(byRole(Lg, "word")[1].size, 28, "Internationalization：56 起每次 −4（字距 −1），到 28 才放得下");
  assert.equal(byRole(C.layoutGrid(ldata(4, true, LIFEL), () => 1000), "word")[0].size, 20, "一直放不下停在 20");
  assert.ok(/…$/.test(byRole(Lg, "gloss").find((b) => b.i === 1).text), "长释义加省略号");
  assert.equal(byRole(Lg, "gloss").some((b) => b.i === 2), false, "空释义不画");
  // 长标题：每次 −4、单行，下限 20，宽度不超过 W − 200
  const Lt = C.layoutGrid(ldata(4, true, { titleRuns: [{ t: "总之 这里有四种以上的情况吧真的是很长很长", b: true, i: false, c: null }] }), fm);
  const ts = byRole(Lt, "title")[0];
  assert.equal(ts.size, 64, "列阵长标题：96 起每次 −4，到 64 才放得下");
  assert.ok(ts.w <= 1544 - 200);
  assert.equal(byRole(C.layoutGrid(ldata(4, true, { titleRuns: [{ t: "这是一个特别特别特别特别特别特别特别特别特别特别特别特别特别特别特别特别特别特别特别特别特别特别特别特别特别特别特别特别长的标题", b: true, i: false, c: null }] }), fm), "title")[0].size, 20, "缩到下限 20");
  // 配图上不盖印、没有页脚 / 页码
  assert.equal(L4.boxes.some((b) => b.role === "seal" || b.role === "folio"), false);
  // 深色色板：列阵框的颜色都是色板角色名，深色取 PALETTE.dark（画的时候 palette[c]）
  assert.ok(L4.boxes.every((b) => C.PALETTE.dark[b.color] !== undefined || /^#/.test(b.color)));
}

// T14：释义来源（D7）
{
  const it = ["bold", "adj.大胆，粗体|n.粗体"], other = ["brave", "adj.勇敢"], custom = ["boldly-x", ""];
  const d1 = C.defaultGloss(it), d2 = C.defaultGloss(other);
  assert.equal(d1, "大胆", "默认一个义项（T35；L01 起形容词去「的」）");
  assert.deepEqual(C.nextGloss("", true, it), { gloss: d1, auto: true }, "空 → 默认");
  assert.deepEqual(C.nextGloss("", false, it), { gloss: d1, auto: true }, "用户清空后也算空 → 默认");
  assert.deepEqual(C.nextGloss(d1, true, other), { gloss: d2, auto: true }, "自动值 → 新默认");
  assert.deepEqual(C.nextGloss("我写的", false, other), { gloss: "我写的", auto: false }, "用户改过 → 不变");
  assert.deepEqual(C.nextGloss("我写的", false, custom), { gloss: "我写的", auto: false }, "自填词（无释义）+ 用户写过 → 不变");
  assert.deepEqual(C.nextGloss("", true, custom), { gloss: "", auto: true }, "自填词（无释义）+ 空 → 仍空");
  assert.deepEqual(C.nextGloss(d1, true, custom), { gloss: "", auto: true }, "自填词：上一个词的自动释义不带过来");
}

// ---------- T07：单图 D14 ----------
{
  const fontB = (size) => C.fontOf(700, size);
  const base = (over, i) => C.layoutCard(ldata(4, true, Object.assign({
    i: i === undefined ? 1 : i, letters: ["L", "I", "F", "E"], word: "LIFE",
    picks: [["lake", ""], ["inside", ""], ["fire", ""], ["echo", ""]],
    glosses: ["", "活的，逼真的", "", ""], captions: ["", "她看人从不绕弯", "", ""],
    titleRuns: [{ t: "总之 这里有四种情况", b: true, i: false, c: null }],
  }, over)), fm);
  const pick = (L, role) => L.boxes.filter((b) => b.role === role);
  const one = (L, role) => { const r = pick(L, role); assert.equal(r.length, 1, `${role} 应有 1 个框`); return r[0]; };
  const same = (b, exp, what) => { for (const k of Object.keys(exp)) assert.deepEqual(b[k], exp[k], `${what}.${k}`); };

  // 各框坐标 = D14 单图表
  let L = base();
  assert.deepEqual([L.W, L.H], [1080, 1440]);
  same(one(L, "info-folio"), { x: 80, baseline: 96, size: 50, weight: 400, color: "mute", text: "02 / 04", align: "left" }, "页码（v00.03.01 U01：34 → 50）");
  same(one(L, "info-filler"), { x: 1000, baseline: 96, size: 50, weight: 400, color: "mute", text: "小满", align: "right" }, "填表人：只写名字，不带「填表人」三个字（F13）");
  { // v00.03.01（用户 11-18 定）：16 字的填表人放不下时只给它缩字号（下限 26），页码仍 50，16 个字都在、不截断
    const LF = base({ filler: "一二三四五六七八九十一二三四五六" }), f = one(LF, "info-filler"), fo = one(LF, "info-folio");
    assert.ok(f.size < 50 && f.size >= 26 && fo.size === 50, "填表人缩字号：" + f.size);
    assert.equal(f.text, "一二三四五六七八九十一二三四五六", "放得下，不截断");
    assert.ok(f.x - f.w > fo.x + fo.w, "不压页码"); }
  same(one(L, "rule"), { x: 80, y: 120, w: 920, h: 3, color: "ink" }, "墨线");
  same(one(L, "title"), { x: 80, baseline: 236, size: 76, weight: 700, track: -1, color: "ink", text: "总之 这里有四种情况", align: "left" }, "标题");
  same(one(L, "plate"), { x: 80, y: 290, w: 920, h: 600, color: "plate" }, "图版");
  same(one(L, "image"), { x: 80, y: 290, w: 920, h: 600 }, "图");
  assert.equal(pick(L, "giant").length, 0, "有图不出超大字母");
  same(one(L, "word"), { x: 80, baseline: 1036, size: 120, weight: 700, track: -2, color: "ink", text: "Inside", keyAt: 0, align: "left" }, "单词");
  same(one(L, "bar"), { x: 80, y: 1068, w: 140, h: 10, color: "ink" }, "墨条");
  same(one(L, "gloss"), { x: 80, baseline: 1158, size: 40, weight: 400, color: "soft", text: "活的，逼真的", align: "left" }, "释义（v00.03.01 U04 乙：40 常规灰色）");
  same(one(L, "caption"), { x: 80, baseline: 1228, size: 48, weight: 700, color: "ink", text: "她看人从不绕弯", align: "left" }, "配文（U04 乙：粗体墨色）");
  { // U04 复审：配文的折行与「写满」判断按粗体量宽（拉丁字母粗体更宽；全中文测不出来）
    const fonts = new Set(); C.wrapCaption((f, t) => { fonts.add(f.split(" ")[0]); return t.length; }, "abc def", 0);
    assert.deepEqual([...fonts], ["700"], "wrapCaption 用粗体量宽");
  }
  assert.equal(one(L, "word").w, fm(fontB(120), "Inside") - 2 * 5, "单词宽 = measure + (字数 − 1) × 字距");
  for (const gone of ["seal", "folio"]) assert.equal(L.boxes.some((b) => b.role === gone), false, `没有 ${gone}`);
  // 无配图：图版里放超大关键字母（x 128、基线 834、620、字距 −8、墨色）
  L = base({ hasImage: () => false });
  assert.equal(pick(L, "image").length, 0);
  same(one(L, "giant"), { x: 128, baseline: 834, size: 620, weight: 700, track: -8, color: "ink", text: "I", align: "left", clip: [80, 290, 920, 600] }, "超大字母");
  // 填表人留空不出框；10 格时页码 10 / 10
  assert.equal(pick(base({ filler: "  " }), "info-filler").length, 0, "填表人空白不导出");
  assert.equal(one(C.layoutCard(ldata(10, true, { i: 9 }), fm), "info-folio").text, "10 / 10");
  // 释义 / 配文没填就不出框（墨条仍在）
  L = base({ glosses: ["", "", "", ""], captions: ["", "", "", ""] });
  assert.equal(pick(L, "gloss").length + pick(L, "caption").length, 0);
  assert.equal(pick(L, "bar").length, 1);
  // 超长释义 / 配文（旧草稿）保险截断，宽度不超 920
  L = base({ glosses: ["", LONG_GLOSS.repeat(3), "", ""], captions: ["", LONG_CAP, "", ""] });
  assert.ok(one(L, "gloss").text.endsWith("…") && one(L, "gloss").w <= 920);
  // 配文可折行（2026-11-17）：词没折行时最多 3 行，行距 62，末行基线不超过 1356；超出的旧稿末行加「…」
  {
    const caps = pick(L, "caption");
    assert.equal(caps.length, 3, "超长配文排满 3 行");
    assert.deepEqual(caps.map((b) => [b.line, b.baseline, b.size]), [[0, 1228, 48], [1, 1290, 48], [2, 1352, 48]]);
    assert.ok(caps.every((b) => b.w <= 920) && caps[2].text.endsWith("…") && !caps[0].text.endsWith("…"), "每行不超宽，只有末行带省略号");
    const W3 = C.wrapCaption(fm, LONG_CAP, 0), W2 = C.wrapCaption(fm, LONG_CAP, 64), W1 = C.wrapCaption(fm, LONG_CAP, 128);
    assert.deepEqual([W3.lines.length, W2.lines.length, W1.lines.length, W3.cut, W1.cut], [3, 2, 1, true, true], "词每多折一行，配文少一行");
    const short = C.wrapCaption(fm, "她看人从不绕弯", 0);
    assert.deepEqual([short.lines, short.cut], [["她看人从不绕弯"], false]);
    // 刚好写满不算截断；折行不丢字、不重字
    const fits = C.wrapCaption(fm, "配".repeat(40), 0);
    assert.equal(fits.cut, false); assert.equal(fits.lines.join(""), "配".repeat(40)); assert.ok(fits.lines.length > 1);
    // 西文单词尽量不拆；比一行还宽的才逐字拆
    const en = C.wrapCaption(fm, "she never beats around the bush when she looks at people at all", 0);
    assert.ok(en.lines.length >= 2 && en.lines.every((l) => !/^\s|\s$/.test(l)), "行首行尾不留空格");
    assert.equal(en.lines.join(" "), "she never beats around the bush when she looks at people at all", "单词没被拆开");
    assert.equal(C.wrapCaption(fm, "x".repeat(200), 0).lines.every((l) => fm("400 48px f", l) <= 920), true, "超宽的词逐字拆，每行不超宽");
    assert.deepEqual(C.wrapCaption(fm, "   ", 0).lines, [], "只有空格不出框");
    // 复审补：分解形式的变音字母（e + U+0301）仍算单词的一部分，不在它前后断行
    for (let k = 0; k < 24; k++) { // 前面垫不同长度，让行尾落在 café 的不同位置
      const wn = C.wrapCaption(fm, "x".repeat(k) + " " + "cafe\u0301 ".repeat(8), 0);
      assert.ok(!wn.cut && wn.lines.every((l) => !/caf$/.test(l) && !/^e\u0301/.test(l)), "café 不被拆开：" + JSON.stringify(wn.lines));
    }
    assert.deepEqual([C.FILLER_MAX, C.CAPTION_MAX], [16, 160]);
  }
  // 填表人写到上限 16 字：信息行放不下时截断，不压到页码
  {
    const LF = base({ filler: "小".repeat(16) }), fo = one(LF, "info-folio"), fi = one(LF, "info-filler");
    assert.ok(fo.x + fo.w < fi.x - fi.w, "页码与填表人不重叠");
    const LX = base({ filler: "W".repeat(60) }), fx = one(LX, "info-filler"), fox = one(LX, "info-folio");
    assert.ok(fx.text.endsWith("…") && fox.x + fox.w < fx.x - fx.w, "超长的旧稿填表人截断");
  }

  // 标题留空 → 标题框文字 = 单词（墨色 76 / 700），其余框一个不动
  const custom = base(), blank = base({ titleRuns: [] });
  same(one(blank, "title"), { x: 80, baseline: 236, size: 76, weight: 700, color: "ink", text: "LIFE" }, "留空标题");
  const rest = (L) => JSON.stringify(L.boxes.filter((b) => b.role !== "title"));
  assert.equal(rest(blank), rest(custom), "标题留空时其余框坐标不变");
  assert.equal(one(base({ titleRuns: null }), "title").text, "LIFE", "titleRuns 为 null 同样用单词");
  assert.deepEqual(C.exportTitleRuns([], "LIFE"), [{ t: "LIFE", b: true, i: false, c: null }]);
  assert.deepEqual(C.exportTitleRuns(null, ""), []);
  const own = [{ t: "x", b: false, i: true, c: "red" }];
  assert.equal(C.exportTitleRuns(own, "LIFE"), own, "有标题原样返回");

  // 标题适配：76 → 60 单行 → 60 两行（基线 204 / 274），第二行放不下以「…」结尾；图版位置不动
  const titleOf = (t) => base({ titleRuns: [{ t, b: true, i: false, c: null }] });
  L = titleOf("总之 这里有四种以上的情况吧");
  assert.deepEqual(pick(L, "title").map((b) => [b.size, b.baseline]), [[60, 236]], "60 单行");
  L = titleOf("关于他的四种情况：看起来温柔其实心很硬，说话很少但句句都算数，而且从来不解释也不道歉");
  const tl = pick(L, "title");
  assert.deepEqual(tl.map((b) => [b.size, b.baseline]), [[60, 204], [60, 274]], "两行");
  assert.ok(tl[1].text.endsWith("…"), "第二行放不下 → 以…结尾");
  assert.ok(tl.every((b) => b.w <= 920 + 1e-6), "每行不超 920");
  assert.equal(one(L, "plate").y, 290, "图版位置不动");
  // 第二行连「…」一起放得下 → 原样保留、不加「…」，也不丢字
  const t2 = "关于他的四种情况：看起来温柔其实心很硬，说话很少"; // 60px 下第一行 15 字，余 7 字
  L = titleOf(t2);
  assert.deepEqual(pick(L, "title").map((b) => b.baseline), [204, 274]);
  assert.equal(pick(L, "title").map((b) => b.text).join(""), t2);
  // 母版的边角：第二行本身放得下、加上「…」就放不下 → 砍一个字并加「…」（30 字那句在真字体下就是这样，见交付记录）
  const t3 = "关于他的四种情况：看起来温柔其实心很硬，说话很少但句句都算数";
  assert.equal(pick(titleOf(t3), "title")[1].text, t3.slice(15, 29) + "…");
  // 富文本跨行：第一行末的样式保持，折到第二行的字样式不丢
  const rich = C.fitTitle(fm, [{ t: "一二三四五六七八九十一二三四五", b: true, i: false, c: null }, { t: "六七八九十一二三四五六七八九十", b: false, i: true, c: "red" }], 920);
  assert.equal(rich.size, 60);
  assert.equal(rich.lines.length, 2);
  assert.equal(rich.lines[1][0].c, "red");
  assert.equal(rich.lines.map((ln) => ln.map((r) => r.t).join("")).join("").length, 30);
  // T16：两行放得下 → cut 为假；放不下被省略 → cut 为真（卡上标题框靠它不让再往后打字）
  {
    const one = (t) => [{ t, b: true, i: false, c: null }];
    assert.ok(!C.fitTitle(fm, one("短"), 920).cut, "单行没有 cut");
    const two = C.fitTitle(fm, one("一".repeat(25)), 920);
    assert.equal(two.lines.length, 2);
    assert.ok(!two.cut, "两行放得下：cut 为假");
    const cut = C.fitTitle(fm, one("一".repeat(80)), 920);
    assert.ok(cut.cut === true && /…$/.test(cut.lines[1][cut.lines[1].length - 1].t), "放不下：cut 为真且末尾加…");
  }
  // fitTitle 直接：短标题 76
  assert.equal(C.fitTitle(fm, [{ t: "短", b: true, i: false, c: null }], 920).size, 76);

  // 单词适配：Internationalization 在 76–120 里取放得下的最大档（每次 −4，下限 56）
  L = base({ i: 1, picks: [["lake", ""], ["internationalization", ""], ["fire", ""], ["echo", ""]] });
  const iw = one(L, "word");
  assert.equal(iw.text, "Internationalization");
  assert.ok(iw.size >= 56 && iw.size < 120 && (120 - iw.size) % 4 === 0, `字号 ${iw.size}`);
  assert.ok(C.trackedWidth(fm, fontB(iw.size), iw.text, -2) <= 920, "放得下");
  assert.ok(C.trackedWidth(fm, fontB(iw.size + 4), iw.text, -2) > 920, "再大一档就放不下");
  assert.equal(iw.size, 84);
  assert.equal(C.fitWord(fm, "Ab".repeat(30), 120, 56, 920, -2), 56, "放不下停在下限");
  assert.equal(C.fitWord(fm, "Hi", 120, 56, 920, -2), 120, "短词 120");
  assert.equal(C.fitWord(fm, "Ab".repeat(30), 56, 20, 300, -1), 20, "列阵下限 20");

  // 关键字母：keyAt 对应词里的字母；x 由 charX 给出，等于前面各字宽之和 + j × 字距
  assert.equal(iw.keyAt, 0, "I 在 Internationalization 词首");
  L = base({ i: 1, picks: [["lake", ""], ["initial", ""], ["fire", ""], ["echo", ""]], keys: [0, 4, 0, 0] });
  const kw = one(L, "word");
  assert.equal(kw.keyAt, 0, "T17：朱红恒为词首，旧数据里的 keys[1] = 4 被忽略");
  const fb = fontB(kw.size), px = (j) => [...kw.text.slice(0, j)].reduce((w, ch) => w + fm(fb, ch), 0) + j * -2;
  for (let j = 0; j < kw.text.length; j++) assert.ok(Math.abs(C.charX(fm, fb, kw.text, j, -2) - px(j)) < 1e-9, `charX(${j})`);
  assert.equal(C.charX(fm, fb, kw.text, 0, -2), 0);
  // 占位：没选词 → 占位文字 + 灰线，不出单词 / 墨条 / 释义 / 配文（空串当作没选）
  for (const over of [{ picks: [["lake", ""], null, ["fire", ""], ["echo", ""]] }, { picks: [["lake", ""], ["", ""], ["fire", ""], ["echo", ""]] }]) {
    L = base(over);
    same(one(L, "empty"), { x: 80, baseline: 1036, size: 72, weight: 400, color: "ph", text: "I 开头" }, "占位");
    same(one(L, "ul"), { x: 80, y: 1062, w: 560, h: 3, color: "ph" }, "占位线");
    for (const gone of ["word", "bar", "gloss", "caption"]) assert.equal(pick(L, gone).length, 0, `占位时没有 ${gone}`);
  }
  // 词里没有该字母（D6 不合法，T12）：不再出占位，照样排出用户打的字，不高亮（keyAt -1）、带 invalid 标记，墨条 / 释义照出
  {
    L = base({ i: 1, picks: [["lake", ""], ["lovely", ""], ["fire", ""], ["echo", ""]], glosses: ["", "可爱的", "", ""] });
    assert.equal(pick(L, "empty").length, 0, "不合法词不出占位");
    const w = one(L, "word");
    assert.deepEqual([w.text, w.keyAt, w.invalid], ["Lovely", -1, true], "Lovely 在 I 格：不高亮、invalid");
    assert.equal(pick(L, "bar").length, 1);
    assert.equal(one(L, "gloss").text, "可爱的");
    assert.equal(one(base({ i: 1, picks: [["lake", ""], ["initial", ""], ["fire", ""], ["echo", ""]] }), "word").invalid, undefined, "合法词没有 invalid 字段");
    const mid = one(base({ i: 1, picks: [["lake", ""], ["living", ""], ["fire", ""], ["echo", ""]] }), "word");
    assert.deepEqual([mid.text, mid.keyAt, mid.invalid], ["Living", -1, true], "T17：i 只在词中（Living）不合法");
    // 中文检索词（T13 才出候选）：同样算不合法
    const zh = one(base({ i: 1, picks: [["lake", ""], ["脸庞", ""], ["fire", ""], ["echo", ""]] }), "word");
    assert.deepEqual([zh.text, zh.keyAt, zh.invalid], ["脸庞", -1, true]);
  }

  // containsLetter / resolveKeyAt
  assert.equal(C.containsLetter("live", "I"), false, "T17：live 里有 i 但首字母是 l");
  assert.equal(C.containsLetter("idea", "I"), true);
  assert.equal(C.containsLetter("Idea", "i"), true, "不分大小写");
  assert.equal(C.containsLetter("Living", "i"), false, "i 只在词中不算");
  assert.equal(C.containsLetter("initial", "i"), true);
  assert.equal(C.containsLetter("bold", "i"), false);
  assert.equal(C.containsLetter("", "i"), false);
  assert.equal(C.containsLetter("living", ""), false);
  assert.equal(C.resolveKeyAt("Initial", "i"), 0, "词首 → 0");
  assert.equal(C.resolveKeyAt("Initial", "I"), 0);
  assert.equal(C.resolveKeyAt("Initial", "i", 4), 0, "旧调用方传的 prev 被忽略：恒为 0");
  assert.equal(C.resolveKeyAt("living", "i"), -1, "i 只在词中 → -1");
  assert.equal(C.resolveKeyAt("bold", "i"), -1, "没有该字母 → -1");
  assert.equal(C.resolveKeyAt("", "i"), -1);
  assert.equal(typeof C.letterPositions, "undefined", "T17：点选圆点已删，letterPositions 随之删除");
  assert.equal(C.resolveKeyAt("Initial", "i", 99), 0, "越界当作重置");

  // 色板与标题自定颜色（D19）
  assert.equal(C.PALETTE.dark.bg, "#0b0b0a");
  assert.equal(C.PALETTE.light.bg, "#e9e8e4");
  assert.equal(C.runColor("red", C.PALETTE.light), "#b0301c");
  assert.equal(C.runColor("red", C.PALETTE.dark), "#e5674f", "朱红是语义值，深色档换亮朱");
  assert.equal(C.runColor("ink", C.PALETTE.dark), "#e7e5e0");
  assert.equal(C.runColor(null, C.PALETTE.dark), "#e7e5e0", "null = 墨");
  assert.equal(C.runColor("#2a6fb0", C.PALETTE.dark), "#2a6fb0", "自选色深浅都照原色");
  // 版式里标题颜色存的是色板角色名 / 十六进制，由画图时按色板取
  L = titleOf("x");
  L = base({ titleRuns: [{ t: "一", b: true, i: false, c: "red" }, { t: "二", b: false, i: false, c: "#2a6fb0" }, { t: "三", b: true, i: false, c: null }] });
  assert.deepEqual(pick(L, "title").map((b) => b.color), ["red", "#2a6fb0", "ink"]);
  const tt = pick(L, "title");
  assert.equal(tt[1].x, tt[0].x + tt[0].w, "段与段首尾相接");
  assert.equal(tt[2].x, tt[1].x + tt[1].w);
}

// ---------- T09：DOM 卡（框 → DOM 样式数值；标题字距） ----------
{
  const k = 0.3, ratio = 0.8; // 任取一个 k 与基线比例；公式对任意值都成立
  const bases = [
    ["单图有图", C.layoutCard(ldata(4, true, { i: 1, letters: ["L", "I", "F", "E"], word: "LIFE", picks: [["lake", ""], ["inside", ""], ["fire", ""], ["echo", ""]], glosses: ["", "活的，逼真的", "", ""], captions: ["", "她看人从不绕弯", "", ""] }), fm)],
    ["单图无图", C.layoutCard(ldata(4, false, { i: 1, letters: ["L", "I", "F", "E"], word: "LIFE", picks: [["lake", ""], ["initial", ""], ["fire", ""], ["echo", ""]], titleRuns: [] }), fm)],
    ["单图占位", C.layoutCard(ldata(4, false, { i: 1, letters: ["L", "I", "F", "E"], picks: [["lake", ""], null, ["fire", ""], ["echo", ""]] }), fm)],
    ["单图空卡", C.layoutCard(ldata(0, false, { letters: [], picks: [] }), fm)],
    ["列阵有图", C.layoutGrid(ldata(7, true), fm)],
    ["列阵无图", C.layoutGrid(ldata(4, false, { word: "ABCD", titleRuns: [] }), fm)],
  ];
  for (const [what, L] of bases) {
    assert.ok(L.boxes.length > 0, `${what}：有框`);
    for (const b of L.boxes) {
      const d = C.domBox(b, k, ratio, L.W), tag = `${what} ${b.role}`;
      if (b.h !== undefined) { // 矩形类：坐标 × k，rule / ul 至少 1px
        assert.equal(d.kind, "rect", tag);
        assert.deepEqual([d.left, d.top, d.width], [b.x * k, b.y * k, b.w * k], `${tag} 位置`);
        assert.equal(d.height, b.role === "rule" || b.role === "ul" ? Math.max(b.h * k, 1) : b.h * k, `${tag} 高`);
        assert.deepEqual([d.lx, d.lw], [b.x, b.w], `${tag} lx / lw`);
        assert.equal(d.color, b.color ? C.domColor(b.color) : "", `${tag} 颜色`);
        continue;
      }
      // 文字类：字号 = 字号 × k、字距 × k；顶边 + 比例 × 字号 = 基线 × k（框的基线就是 DOM 的基线）
      assert.equal(d.kind, "text", tag);
      assert.ok(Math.abs(d.fontSize - b.size * k) < 1e-9, `${tag} 字号`);
      assert.ok(Math.abs(d.letterSpacing - (b.track || 0) * k) < 1e-9, `${tag} 字距`);
      const top = b.clip ? d.top + d.clip.top : d.top;
      assert.ok(Math.abs(top + ratio * d.fontSize - b.baseline * k) < 1e-9, `${tag} 基线`);
      assert.deepEqual([d.weight, d.italic, d.color], [b.weight, !!b.italic, C.domColor(b.color)], `${tag} 字重 / 斜体 / 颜色`);
      if (b.align === "right") { // 右对齐：右边距 = (W − x) × k；左端 = x − 前进宽
        assert.equal(d.right, (L.W - b.x) * k, `${tag} 右边距`);
        assert.equal(d.left, undefined);
        assert.ok(Math.abs(d.lx + d.lw - b.x) < 1e-9, `${tag} 右端 = x`);
      } else {
        assert.ok(Math.abs(d.left + (d.clip ? d.clip.left : 0) - b.x * k) < 1e-9, `${tag} 左`);
        assert.equal(d.lx, b.x, `${tag} lx`);
      }
      if (b.clip) { // 超大字母：裁切框 = 图版，文字坐标改为相对裁切框
        assert.deepEqual([d.clip.left, d.clip.top, d.clip.width, d.clip.height], b.clip.map((v) => v * k), `${tag} clip`);
        assert.ok(Math.abs(d.left - (b.x - b.clip[0]) * k) < 1e-9);
      }
      // 前进宽：DOM 的 letter-spacing 每字之后都加，word 的版式宽少一个字距
      if (b.w !== undefined) assert.equal(d.lw, b.w + (b.role === "word" ? b.track : 0), `${tag} lw`);
    }
  }
  // 具体数值抽样（k = 1/3、ratio 取 0.5）：单词 120 → 40px、字距 −2 → −0.667px、基线 1036 → 顶边 (1036 − 60) / 3
  {
    const L = bases[0][1], w = L.boxes.find((b) => b.role === "word"), d = C.domBox(w, 1 / 3, 0.5, L.W);
    assert.ok(Math.abs(d.fontSize - 40) < 1e-9 && Math.abs(d.letterSpacing + 2 / 3) < 1e-9 && Math.abs(d.top - (1036 - 60) / 3) < 1e-9 && Math.abs(d.left - 80 / 3) < 1e-9);
    const f = L.boxes.find((b) => b.role === "info-filler"), df = C.domBox(f, 1 / 3, 0.5, L.W);
    assert.ok(Math.abs(df.right - 80 / 3) < 1e-9, "填表人右边距 = 页边距 80 × k");
  }
  assert.equal(C.domBox({ role: "rule", x: 80, y: 120, w: 920, h: 3, color: "ink" }, 0.1, 0.8, 1080).height, 1, "rule 在小 k 下仍有 1px");
  // 色板角色 → CSS 变量；十六进制原样
  assert.equal(C.domColor("ink"), "var(--ink)");
  assert.equal(C.domColor("red"), "var(--red)");
  assert.equal(C.domColor("bg"), "var(--paper)");
  assert.equal(C.domColor("ph"), "var(--ph)");
  assert.equal(C.domColor("#2a6fb0"), "#2a6fb0");
  // 空卡（首次进入）：不抛错，没有页码 / 填表人 / 标题 / 单词，占位文字 44px
  {
    const L = bases[3][1], roles = L.boxes.map((b) => b.role);
    assert.deepEqual(roles, ["rule", "plate", "ul"], "空卡不再写提示（用户 11-21 定），只留图版与一条线");
    assert.deepEqual([L.W, L.H], [1080, 1440]);
  }
  // 框数值不随 k 改变版式：同一份框列表，k 变了只有 domBox 的结果变（DOM 与 Canvas 共用同一份框）
  {
    const L = bases[0][1], before = JSON.stringify(L.boxes);
    C.domBox(L.boxes[3], 0.17, 0.7, L.W); C.domBox(L.boxes[3], 0.4, 0.7, L.W);
    assert.equal(JSON.stringify(L.boxes), before, "domBox 不改框");
  }

  // 标题字距必须进入适配（QA：去掉字距断言仍通过）。构造恰好「算字距放得下、不算就放不下」的标题——漏掉字距会缩字号
  // 单图：10 个中文（76 × 10 = 760）+ 4 个拉丁（0.55 × 76 × 4 = 167.2）= 927.2 > 920，字距 −1 × 13 = −13 → 914.2 ≤ 920，仍用 76
  {
    const t = "一二三四五六七八九十abcd", runs = [{ t, b: true, i: false, c: null }];
    assert.ok(C.fitTitle(fm, runs, 920).size === 76, "单图：靠字距才放得下，仍是 76");
    const Lt = C.layoutCard(ldata(4, true, { i: 0, titleRuns: runs }), fm);
    const tb = Lt.boxes.filter((b) => b.role === "title");
    assert.deepEqual(tb.map((b) => [b.size, b.baseline]), [[76, 236]], "layoutCard：76 单行");
    // 再加一个中文：字距也救不了，缩到 60 单行
    const t2 = "一二三四五六七八九十十abcd";
    assert.equal(C.fitTitle(fm, [{ t: t2, b: true, i: false, c: null }], 920).size, 60);
  }
  // 列阵：20 个中文，96 起每次 −4：68 × 20 = 1360 > 1344（W − 200），字距 −1.5 × 19 = −28.5 → 1331.5 ≤ 1344，停在 68；漏掉字距会得到 64
  {
    const t = "一二三四五六七八九十一二三四五六七八九十";
    const Lg = C.layoutGrid(ldata(4, true, { titleRuns: [{ t, b: true, i: false, c: null }] }), fm);
    const tb = Lg.boxes.filter((b) => b.role === "title");
    assert.deepEqual(tb.map((b) => b.size), [68], "列阵：靠字距才放得下，停在 68");
    assert.ok(tb[0].w <= 1344 + 1e-6 + 20 * 1.5, "标题前进宽不超 W − 200（含末字距）");
    // 再多一个字：1428 − 30 = 1398 > 1344 → 继续缩
    const Lg2 = C.layoutGrid(ldata(4, true, { titleRuns: [{ t: t + "一", b: true, i: false, c: null }] }), fm);
    assert.ok(Lg2.boxes.find((b) => b.role === "title").size < 68);
  }
  // 单图标题的前进宽包含字距（DOM letter-spacing 每字之后都加）：measure + 字数 × 字距
  {
    const L = bases[0][1], tb = L.boxes.find((b) => b.role === "title");
    assert.equal(tb.w, fm(C.fontOf(tb.weight, tb.size, tb.italic), tb.text) + tb.text.length * tb.track);
  }

  // 色板同源（D19）：style.css 里界面的颜色变量 = PALETTE（DOM 卡直接用这些变量）
  {
    const css = fs.readFileSync(new URL("../app/assets/style.css", import.meta.url), "utf8");
    const vars = (re, what) => {
      const m = css.match(re);
      assert.ok(m, `style.css 里找不到 ${what}`);
      const out = {};
      for (const [, name, val] of m[1].matchAll(/--([a-z-]+):\s*(#[0-9a-f]{6})\s*;/g)) out[name] = val;
      return out;
    };
    const light = vars(/:root\s*\{([^}]*)\}/, "浅色 :root");
    const sys = vars(/@media \(prefers-color-scheme: dark\)\s*\{\s*:root:not\(\[data-theme="light"\]\)\s*\{([^}]*)\}/, "系统深色块");
    const manual = vars(/:root\[data-theme="dark"\]\s*\{([^}]*)\}/, "手动深色块");
    const names = { bg: "paper", ink: "ink", red: "red", plate: "plate", mute: "mute", soft: "soft", ph: "ph" };
    for (const role of Object.keys(names)) {
      assert.equal(light[names[role]], C.PALETTE.light[role], `浅色 --${names[role]}`);
      assert.equal(sys[names[role]], C.PALETTE.dark[role], `系统深色 --${names[role]}`);
      assert.equal(manual[names[role]], C.PALETTE.dark[role], `手动深色 --${names[role]}`);
    }
    // 四个主题（2026-11-12）：:root[data-skin] 的浅色块、系统深色块、手动深色块都与 PALETTES 同值；fandom 只有浅色；每套的对比度达标
    assert.deepEqual(Object.keys(C.PALETTES), ["fandom", "dansaekhwa", "impressionism", "secession", "table"]); assert.deepEqual(C.SKINS.map(x => x[0]), Object.keys(C.PALETTES));
    assert.equal(C.PALETTES.fandom.dark, undefined, "fandom 只有浅色");
    assert.equal(C.PALETTES.table.light, undefined, "表格只有深色（v00.03.03 L3）");
    for (const skin of Object.keys(C.PALETTES)) {
      const esc = `:root\\[data-skin="${skin}"\\]`;
      // 只有一套的主题（fandom 只有浅、表格只有深）：那一套就写在不带 data-theme 的这一块里
      const one = C.PALETTES[skin].light || C.PALETTES[skin].dark;
      const lightS = vars(new RegExp(esc + "\\s*\\{([^}]*)\\}"), skin + " 基本块");
      for (const role of Object.keys(names)) assert.equal(lightS[names[role]], one[role], `${skin} 基本块 --${names[role]}`);
      // 白图框与框里的大字母：只有表格有这两个键，样式里的 --frame / --giant 与它同值；别的主题两边都没有
      for (const extra of ["frame", "giant"]) assert.equal(lightS[extra], one[extra], `${skin} --${extra} 与色板一致（没有就都没有）`);
      const veil = css.match(new RegExp(esc + "\\s*\\{[^}]*--paper-veil:\\s*rgba\\((\\d+), (\\d+), (\\d+), 0\\.86\\)"));
      assert.equal("#" + veil.slice(1, 4).map(n => (+n).toString(16).padStart(2, "0")).join(""), one.bg, skin + " 大图页的底是 paper 加透明度");
      if (C.PALETTES[skin].light && C.PALETTES[skin].dark) {
        const sysS = vars(new RegExp('@media \\(prefers-color-scheme: dark\\)\\s*\\{\\s*' + esc + ':not\\(\\[data-theme="light"\\]\\)\\s*\\{([^}]*)\\}'), skin + " 系统深色块");
        const manS = vars(new RegExp(esc + '\\[data-theme="dark"\\]\\s*\\{([^}]*)\\}'), skin + " 手动深色块");
        for (const role of Object.keys(names)) { assert.equal(sysS[names[role]], C.PALETTES[skin].dark[role], `${skin} 系统深色 --${names[role]}`); assert.equal(manS[names[role]], C.PALETTES[skin].dark[role], `${skin} 手动深色 --${names[role]}`); }
      } else assert.ok(!new RegExp(esc + '\\[data-theme="dark"\\]').test(css), skin + " 没有深色块");
      for (const m of ["light", "dark"]) { const q = C.PALETTES[skin][m]; if (!q) continue;
        for (const t of ["ink", "soft"]) for (const b of [q.bg, q.plate]) assert.ok(C.contrastRatio(q[t], b) >= 7, `${skin} ${m} ${t} 对 ${b} ≥ 7:1`);
        for (const t of ["mute", "red"]) for (const b of [q.bg, q.plate]) assert.ok(C.contrastRatio(q[t], b) >= 4.5, `${skin} ${m} ${t} 对 ${b} ≥ 4.5:1：` + C.contrastRatio(q[t], b).toFixed(2));
        assert.ok(C.contrastRatio(q.ph, q.bg) >= 4.5, `${skin} ${m} 占位字对底`); }
    }
    assert.equal(C.paletteOf("secession", true), C.PALETTES.secession.dark); assert.equal(C.paletteOf("fandom", true), C.PALETTES.fandom.light, "只有浅色的主题：深色也给浅色那套");
    assert.equal(C.paletteOf("nope", true), C.PALETTE.dark, "不认识的主题落回石白 / 墨");
    assert.equal(C.paletteOf("table", false), C.PALETTES.table.dark, "只有深色的主题：浅色也给深色那套"); assert.equal(C.paletteOf("table", true), C.PALETTES.table.dark);
    assert.ok(C.contrastRatio(C.PALETTES.table.dark.red, "#0f0f0f") >= 4.5 && C.contrastRatio(C.PALETTES.table.dark.mute, "#0f0f0f") >= 4.5, "表格的强调色与次要字在面板底上也达标");
    // 四个主题的字体（2026-11-12）：core 的字体表、样式里的 @font-face 与字体变量、包内文件三处对得上；没有主题时字体串不变
    assert.deepEqual(Object.keys(C.SKIN_FONTS), Object.keys(C.PALETTES));
    const base = C.FONT; assert.equal(base.indexOf('"Noto Sans"'), 0);
    for (const skin of Object.keys(C.SKIN_FONTS)) {
      const f = C.SKIN_FONTS[skin], stack = C.useSkinFont(skin);
      assert.equal(stack, C.FONT); assert.ok(stack.startsWith('"' + f.latin + '",' + (f.cjk ? '"' + f.cjk + '",' : "")) && stack.endsWith(base), skin + " 字体串：主题西文 → 主题中文 → Noto 兜底");
      const blk = css.match(new RegExp(`:root\\[data-skin="${skin}"\\]\\s*\\{([^}]*)\\}`))[1];
      assert.ok(blk.includes(`--font-latin: "${f.latin}";`), skin + " 样式里的西文字体"); assert.ok(blk.includes(`--font-cjk: "${f.cjk || "Noto Sans SC"}";`), skin + " 样式里的中文字体");
      for (const fam of [f.latin, f.cjk].filter(Boolean)) for (const w of [400, 700]) {
        const m = css.match(new RegExp(`@font-face \\{ font-family: "${fam}"; src: url\\("\\./fonts/([^"]+)"\\) format\\("woff2"\\); font-weight: ${w};`));
        assert.ok(m, `${fam} ${w} 有 @font-face（只有一个字重的也两个字重都声明，免得浏览器自己描粗）`);
        assert.ok(fs.existsSync(new URL("../app/assets/fonts/" + m[1], import.meta.url)), m[1] + " 在包里");
      }
    }
    assert.equal(C.useSkinFont("nope"), base, "不认识的主题：回到 Noto"); assert.equal(C.FONT, base);
    assert.ok(!/font-family: "(?:Libre Baskerville|Federo)"/.test(css), "保留字体名不作裁剪版的名字");
  }
}

// THEME.isDark（theme.js）：用假 document / matchMedia 在 Node 里跑
{
  const run = (attr, systemDark, hasMedia = true) => {
    const saved = [globalThis.window, globalThis.document];
    const root = { getAttribute: () => attr, setAttribute() {}, removeAttribute() {} };
    globalThis.document = { documentElement: root, addEventListener() {}, getElementById: () => null };
    globalThis.window = { matchMedia: hasMedia ? () => ({ matches: systemDark }) : undefined };
    globalThis.localStorage = { getItem: () => null, setItem() {} };
    new Function(fs.readFileSync(new URL("../app/assets/theme.js", import.meta.url), "utf8"))();
    const out = window.THEME.isDark();
    [globalThis.window, globalThis.document] = saved;
    return out;
  };
  assert.equal(run("dark", false), true, "手动深色");
  assert.equal(run("light", true), false, "手动浅色即使系统深色");
  assert.equal(run(null, true), true, "跟随系统 + 系统深色");
  assert.equal(run(null, false), false, "跟随系统 + 系统浅色");
  assert.equal(run(null, false, false), false, "没有 matchMedia 当浅色");
}
// 顶部安全区兜底（theme.js，2026-11-17 鸿蒙真机 U0）：env 报 0 的小红书安卓 / 鸿蒙补留白；容器给了 statusBarHeight 就用它；
// screenTop > 0、iOS 报了真实值、普通浏览器、PC 模拟器已设值时都不动
{
  const run = ({ ua, xhs, env = 0, preset = "" }) => {
    const saved = [globalThis.window, globalThis.document, globalThis.localStorage];
    const vars = preset ? { "--safe-area-inset-top": preset } : {};
    const root = {
      getAttribute: () => null, setAttribute() {}, removeAttribute() {}, appendChild() {}, removeChild() {},
      style: { setProperty: (k, v) => { vars[k] = v; }, getPropertyValue: (k) => vars[k] || "", removeProperty: (k) => { delete vars[k]; } },
    };
    globalThis.document = { documentElement: root, addEventListener() {}, createElement: () => ({ style: {} }) };
    globalThis.window = { navigator: { userAgent: ua }, xhs, matchMedia: () => ({ matches: false }), getComputedStyle: () => ({ paddingTop: env + "px" }), addEventListener() {} };
    globalThis.localStorage = { getItem: () => null, setItem() {} };
    new Function(fs.readFileSync(new URL("../app/assets/theme.js", import.meta.url), "utf8"))();
    [globalThis.window, globalThis.document, globalThis.localStorage] = saved;
    return vars["--safe-area-inset-top"] || "";
  };
  const harmony = "Mozilla/5.0 (Linux; Android 12; ALN-AL00) discovery/9.53.3 xhsminitool/1.0.0";
  const win = (wi) => ({ launchOptions: { miniToolEnv: { windowInfo: wi } } });
  assert.equal(run({ ua: harmony, xhs: win({ statusBarHeight: 40, screenTop: 0 }) }), "40px", "鸿蒙真机：用容器给的 statusBarHeight");
  assert.equal(run({ ua: harmony, xhs: win({ statusBarHeight: 32, screenTop: 0 }) }), "32px", "数值随容器");
  assert.equal(run({ ua: harmony, xhs: {} }), "40px", "容器没给 windowInfo：按 40px 估值");
  assert.equal(run({ ua: harmony, xhs: win({ statusBarHeight: 40, screenTop: 40 }) }), "", "网页本来就在状态栏下面：不补");
  assert.equal(run({ ua: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0) xhsminitool", xhs: win({ statusBarHeight: 54, screenTop: 0 }), env: 59 }), "", "iOS 报了真实安全区：不覆盖");
  assert.equal(run({ ua: "Mozilla/5.0 (Linux; Android 14) Chrome/120" }), "", "普通安卓浏览器：不动");
  assert.equal(run({ ua: harmony, xhs: {}, preset: "30px" }), "30px", "PC 模拟器已设值：不动");
}
// CSS 注释配对：注释里写了 `.focus*/` 这类字样会提前结束注释，吞掉后面的规则（402bcf1 曾因此丢了 Noto Sans 400 的 @font-face）
{
  const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(new URL(e.name + "/", dir)) : e.name.endsWith(".css") ? [new URL(e.name, dir)] : []);
  for (const f of walk(new URL("../app/", import.meta.url))) {
    const css = fs.readFileSync(f, "utf8");
    for (let i = 0; ; ) {
      const open = css.indexOf("/*", i), stray = css.indexOf("*/", i);
      assert.ok(stray === -1 || (open !== -1 && open < stray), `${f.pathname} 有多余的 */（注释外）`);
      if (open === -1) break;
      const close = css.indexOf("*/", open + 2);
      assert.ok(close !== -1, `${f.pathname} 有没闭合的 /*`);
      assert.ok(!css.slice(open + 2, close).includes("/*"), `${f.pathname} 注释里嵌了 /*`);
      i = close + 2;
    }
  }
}

// T12：卡上单词控件的就地改写（大小写 / 过滤 / 光标平移）
{
  const rw = (v, s, e) => C.rewriteWord(v, s, e);
  // 首字母大写，其余照打（关键字母保持它在词里的大小写）
  assert.deepEqual(rw("initial", 7, 7), { value: "Initial", start: 7, end: 7 });
  assert.deepEqual(rw("liV", 3, 3), { value: "LiV", start: 3, end: 3 });
  assert.equal(rw("Initial").value, "Initial");
  assert.deepEqual(rw("", 0, 0), { value: "", start: 0, end: 0 });
  // 光标不跳：改写只大写首字母，长度不变，光标原样；在中间插入也不动
  assert.deepEqual(rw("iNitial", 2, 2), { value: "INitial", start: 2, end: 2 });
  assert.deepEqual(rw("lov", 1, 3), { value: "Lov", start: 1, end: 3 }, "选区也保住");
  // 过滤：标点 / 表情删掉，光标按被删掉的字数左移；保留空格 ' - 、汉字与数字（T41：2nd、4ever）
  assert.deepEqual(rw("li!v", 3, 3), { value: "Liv", start: 2, end: 2 }, "光标前删了 1 个字");
  assert.deepEqual(rw("li!v", 4, 4), { value: "Liv", start: 3, end: 3 });
  assert.deepEqual(rw("l!iv", 1, 1), { value: "Liv", start: 1, end: 1 }, "删的字在光标后，光标不动");
  assert.deepEqual(rw("2nd", 3, 3), { value: "2nd", start: 3, end: 3 }, "数字保留（T41）");
  assert.deepEqual(rw("a  c", 3, 4), { value: "A c", start: 2, end: 3 });
  assert.equal(rw("binomial nomenclature").value, "Binomial nomenclature");
  assert.equal(rw("binomial nomenclaturexxxxxxxxx").over, true, "第 29 个字不收（空格不算字；v00.03.01 E2 起上限 28）");
  assert.equal(rw("binomial nomenclaturexxxxxxxx").over, undefined, "正好 28 个字");
  assert.equal(rw("ice cream").value, "Ice cream");
  assert.equal(rw("well-known").value, "Well-known");
  assert.equal(rw("don\u2019t").value, "Don't", "弯撇号换成直撇号");
  assert.equal(rw("脸庞").value, "脸庞", "汉字保留，只用来检索");
  assert.equal(rw("li!v?e").value, "Live");
  // 开头空白去掉；光标跟着左移
  assert.deepEqual(rw("  liv", 5, 5), { value: "Liv", start: 3, end: 3 });
  // 最多 28 个字符（v00.03.01 E2，英语同西文）
  assert.equal(rw("a".repeat(30)).value, "A" + "a".repeat(27));
  assert.equal(rw("a".repeat(30), 30, 30).start, 28, "光标夹在末尾");
  // 缺省 = 末尾
  assert.deepEqual(rw("liv"), { value: "Liv", start: 3, end: 3 });
  assert.equal(C.WORD_MAX, 28); // v00.03.01 E2：六门一致
  // v00.03.01 E6：单词框计数器的 wordUnits 与 rewriteWord 同一口径——组合变音符并进前一个字，空格与不收的字不算，弯撇号、连字符、数字、汉字各算一个；不封顶
  for (const [s, n] of [["école", 5], ["don’t", 5], ["ice cream", 8], ["well-known", 10], ["2nd", 3], ["脸庞", 2], ["li!v?e", 4], ["  liv ", 3], ["", 0]]) assert.equal(C.wordUnits(s), n, "wordUnits " + JSON.stringify(s));
  assert.equal(C.wordUnits("a".repeat(30)), 30, "不封顶：组字期间照实计");
  for (const s of ["binomial nomenclaturexxxxxxxx", "binomial nomenclaturexxxxxxxxx", "é".repeat(28), "é".repeat(29), "a b ".repeat(14), "a b ".repeat(15), "don’t".repeat(5) + "abc", "don’t".repeat(5) + "abcd"])
    assert.equal(rw(s).over === true, C.wordUnits(s) > C.WORD_MAX, "计数器与上限判断一致：" + JSON.stringify(s));
}

// T11：左右滑动判断（D16）——横向位移 > 40px 且 > 1.5 × 纵向位移；手指向左 = 下一格
{
  assert.equal(C.swipeDir(-41, 0), 1, "向左 41px = 下一格");
  assert.equal(C.swipeDir(41, 0), -1, "向右 41px = 上一格");
  assert.equal(C.swipeDir(-40, 0), 0, "刚好 40px 不算（要 > 40）");
  assert.equal(C.swipeDir(-39, 0), 0);
  assert.equal(C.swipeDir(-80, 53), 1, "纵向 53 × 1.5 = 79.5 < 80：算");
  assert.equal(C.swipeDir(-80, 54), 0, "纵向 54 × 1.5 = 81 ≥ 80：不算（斜着拖是滚页面）");
  assert.equal(C.swipeDir(-80, -54), 0, "向上斜也一样");
  assert.equal(C.swipeDir(-120, 80), 0, "刚好 1.5 倍不算（要 >）");
  assert.equal(C.swipeDir(0, 200), 0, "纯纵向不算");
  assert.equal(C.swipeDir(NaN, 0), 0, "坏数据不算");
  assert.deepEqual([C.SWIPE.MIN, C.SWIPE.RATIO], [40, 1.5]);
  // 手势冲突：编辑中 / 面板打开 / 触点起于控件内，任一为真都不响应
  const ok = { editing: false, panelOpen: false, inControl: false };
  assert.equal(C.swipeAllowed(ok), true);
  assert.equal(C.swipeAllowed({ ...ok, editing: true }), false, "① 有字段在编辑");
  assert.equal(C.swipeAllowed({ ...ok, panelOpen: true }), false, "② 面板打开");
  assert.equal(C.swipeAllowed({ ...ok, inControl: true }), false, "③ 触点起于控件内");
  assert.equal(C.swipeAllowed({ ...ok, zoomed: true }), false, "④ 页面放大中：横移归浏览器（T32）");
  assert.equal(C.swipeAllowed({ ...ok, selecting: true }), false, "⑤ 有选中文字（T32）");
  // 目标格：首格右滑 / 末格左滑不越界
  assert.equal(C.swipeTarget(1, 4, 1), 2);
  assert.equal(C.swipeTarget(1, 4, -1), 0);
  assert.equal(C.swipeTarget(0, 4, -1), 0, "首格右滑停在原格");
  assert.equal(C.swipeTarget(3, 4, 1), 3, "末格左滑停在原格");
  assert.equal(C.swipeTarget(2, 4, 0), 2);
  assert.equal(C.swipeTarget(0, 1, 1), 0, "只有一格");
}

// T13：候选（D6 严格词首优先）。先用小假词库钉死排序规则，再用真词库核对 PLAN 里点名的例子
{
  const item = (w, g) => [w, g];
  const FW = {
    i: [item("image", "n.图像"), item("information", "n.信息"), item("idea", "n.主意")],
    m: [item("magic", "n.魔法"), item("main", "adj.主要的"), item("mix", "v.混合"), item("maximum", "n.最大")],
    l: [item("live", "v.活"), item("living", "adj.活的"), item("life", "n.生活")],
    d: [item("deliver", "v.递送")],
  };
  const nm = (list) => list.map((x) => x[0]);
  // T17：候选只有词首档 = words[c] 原顺序，词中含该字母的词不再出现
  const t = C.letterTiers(FW, "i");
  assert.deepEqual(nm(t.head), ["image", "information", "idea"]);
  assert.equal("inner" in t, false, "T17：没有词中档了");
  assert.deepEqual(nm(C.letterTiers(FW, "I").head), ["image", "information", "idea"], "大小写不分");
  assert.deepEqual(C.letterTiers(FW, "").head, []);
  assert.deepEqual(C.letterTiers(FW, "z").head, [], "没有这个键就是空");
  // 打 ma → image / information 的 ma 在词中，仍是 i 开头的候选；magic / main / maximum 不以 i 开头，不出现
  assert.deepEqual(nm(C.candidates(FW, "i", "ma")), ["image", "information"]);
  assert.deepEqual(nm(C.candidates(FW, "i", "Ma")), ["image", "information"], "关键词不分大小写");
  assert.deepEqual(nm(C.candidates(FW, "i", "liv")), [], "T17：live / living 不以 i 开头，不再是 I 格的候选");
  assert.deepEqual(nm(C.candidates(FW, "i", "x")), [], "mix / maximum 的 i 在词中，不出现");
  // 档内：匹配档（前缀 > 包含）再词频。词首档里 "i" 前缀的先于包含 i 的（这里全是前缀）
  assert.deepEqual(nm(C.candidates(FW, "i", "i")), ["image", "information", "idea"]);
  assert.deepEqual(nm(C.candidates(FW, "i", "ea")), ["idea"], "包含");
  assert.deepEqual(nm(C.candidates(FW, "m", "ma")), ["magic", "main", "maximum"], "前缀同档按词频（mix 不含 ma）");
  assert.deepEqual(nm(C.candidates(FW, "m", "ax")), ["maximum"], "包含");
  assert.deepEqual(nm(C.candidates({ m: [item("amid", ""), item("mall", ""), item("small", "")] }, "m", "ma")), ["mall", "small"], "前缀（mall）先于包含（small）；amid 不含 ma");
  // 空查询 / 只有空白 → 空（D6-3）
  assert.deepEqual(C.candidates(FW, "i", ""), []);
  assert.deepEqual(C.candidates(FW, "i", "  "), []);
  assert.deepEqual(C.candidates(FW, "i", undefined), []);
  // 中文检索保留：「生活」在 L 格命中 life（义项包含）与 live / living（模糊）
  assert.deepEqual(nm(C.candidates(FW, "l", "生活")), ["life", "living", "live"], "life 完全命中在前；live / living 同族（模糊档），T25：形容词 living 排在该族最前");
  // T25 返工：不再有「试试：」建议词。首字母不对的词（Live 打在 I 格）没有候选，界面直接提示「不是以 I 开头」
  const SW = { i: [item("ice", "n.冰"), item("illness", "n.病"), item("idol", "n.偶像")], l: [item("loving", "adj.爱的")] };
  assert.deepEqual(nm(C.candidates(SW, "i", "illfated")), [], "打满的词本身没有候选");
  assert.deepEqual(nm(C.candidates(SW, "i", "Lovely")), [], "I 格里没有含 lov 的词：不拿 L 开头的词凑数");
  assert.equal(C.suggestions, undefined, "suggestions 已删");

  // 分页：屏蔽在取页时过滤、仍凑满 8 个；越过末尾回到第 0 页
  const mk = (n, bad) => Array.from({ length: n }, (_, k) => item(bad.includes(k) ? "sex" : "w" + k, ""));
  const skip = (it) => C.blocked(it[0]);
  assert.equal(C.blocked("sex"), true);
  const L20 = mk(20, []);
  assert.deepEqual([0, 1, 2].map((p) => C.pageOf(L20, p, 8).items.length), [8, 8, 4]);
  assert.deepEqual(nm(C.pageOf(L20, 1, 8).items), ["w8", "w9", "w10", "w11", "w12", "w13", "w14", "w15"]);
  assert.deepEqual([C.pageOf(L20, 1, 8).page, C.pageOf(L20, 1, 8).pages], [1, 3]);
  assert.equal(C.pageOf(L20, 3, 8).page, 0, "越过末尾回到第 0 页");
  assert.equal(C.pageOf(L20, 4, 8).page, 1, "继续翻就接着绕（按页数取模）");
  assert.deepEqual(nm(C.pageOf(L20, 3, 8).items), nm(C.pageOf(L20, 0, 8).items));
  const LB = mk(12, [1, 4]); // 12 个里 2 个被屏蔽
  const p0 = C.pageOf(LB, 0, 8, skip);
  assert.equal(p0.items.length, 8, "屏蔽的词跳过后仍凑满 8 个");
  assert.ok(p0.items.every((x) => x[0] !== "sex"));
  assert.deepEqual(nm(p0.items), ["w0", "w2", "w3", "w5", "w6", "w7", "w8", "w9"]);
  assert.deepEqual(nm(C.pageOf(LB, 1, 8, skip).items), ["w10", "w11"], "第二页接着数，不重不漏");
  assert.equal(C.pageOf(LB, 2, 8, skip).page, 0);
  assert.deepEqual(C.pageOf([], 0, 8), { items: [], page: 0, pages: 0 });
  // 页数按过滤后可见的候选算：9 个里屏蔽 1 个 → 恰好 8 个可见，只有 1 批，「换一批」不存在（Astra 复审 P3）
  const LE = mk(9, [8]);
  assert.equal(C.pageOf(LE, 0, 8, skip).pages, 1, "过滤后恰好 8 个：只报 1 批");
  assert.deepEqual([C.pageOf(LE, 1, 8, skip).page, C.pageOf(LE, 1, 8, skip).items.length], [0, 8]);
  assert.equal(C.pageOf(LB, 0, 8, skip).pages, 2, "12 个屏蔽 2 个 → 10 个可见 → 2 批");

  // 真词库（T17：候选只来自词首档）
  load(LEGACY + "/en/words.js");
  const DICT = window.WORDS;
  const pct = (w) => DICT[w[0]].findIndex((x) => x[0] === w) / DICT[w[0]].length;
  const idx = (list, w) => list.findIndex((x) => x[0] === w);
  // T38：短语 / 合成词补充表（真实 phrases.js）。查找顺序：原样 → 去空格 → 空格换连字符；不分大小写；没加载（undefined）就当查不到
  {
    load(LEGACY + "/en/phrases.js");
    const P = window.PHRASES;
    assert.ok(Object.keys(P).length >= 26 && typeof P.i === "string", "每个首字母一串");
    assert.deepEqual(C.phraseHit(P, "ice cream"), ["ice cream", "冰淇淋"], "短语原样命中");
    assert.deepEqual(C.phraseHit(P, "  ICE   Cream "), ["ice cream", "冰淇淋"], "大小写、多余空格不影响");
    assert.equal(C.phraseHit(P, "super intelligence")[0], "superintelligence", "去空格命中合成词");
    assert.match(C.phraseHit(P, "super intelligence")[1], /超智能/);
    assert.equal(C.phraseHit(P, "about face")[0], "about-face", "空格换连字符命中");
    assert.equal(C.phraseHit(P, "qxzv"), null); assert.equal(C.phraseHit(undefined, "ice cream"), null, "补充表没加载：当查不到");
    assert.equal(C.phraseHit(P, "love"), null, "主词库里的词不在补充表（不重复）");
    const all = Object.values(P).join("~").split("~");
    assert.ok(all.length > 50000, "收录 5 万条以上：" + all.length);
    assert.ok(all.every((e) => { const k = e.indexOf("^"); return k > 0 && e.slice(0, k).length <= C.WORD_MAX; }), "每条都是「词^释义」，词长 ≤ 格里能打的上限");
    assert.ok(!all.some((e) => /(^|\||\^|\.)\[(计|法|网络|医)\]/.test(e)), "义项开头不带领域标记");
  }
  // B5-R1：完整词库查找——每种写法先主词库、再补充表；原样命中优先；未知词 null（仍可自定义）
  {
    const P = window.PHRASES, L = (t) => C.lookupEntry(DICT, P, t);
    assert.deepEqual(L("sun flower"), ["sunflower", "n.向日葵", "", ""], "去空格命中主词库");
    assert.equal(L("ice berg")[0], "iceberg"); assert.match(L("ice berg")[1], /冰山/);
    assert.equal(L("make up")[0], "make up", "原样（短语 make up 弥补）优先于去空格（主词库 makeup 化妆品）");
    assert.equal(L("makeup")[0], "makeup");
    assert.equal(L("super intelligence")[0], "superintelligence"); assert.equal(L("about face")[0], "about-face");
    assert.equal(L("qxzv"), null, "未知词：查不到，仍按自定义词用");
    assert.equal(C.lookupEntry(DICT, undefined, "sun flower")[0], "sunflower", "补充表没加载时主词库的变体照样能找");
    const W2 = { m: [["makeup", "n.化妆品"]] }, P2 = { m: "make up^弥补" };
    assert.equal(C.lookupEntry(W2, P2, "make up")[1], "弥补", "合成数据：原样在补充表、去空格在主词库 → 取原样");
  }
  // T42（U17 / U20–U22）：长词分图——真实词库 + TeX 断词点，与比对图样例表（31 个词 + 3 个兜底 + 字母数字混排）逐个一致
  {
    const idx = new Set(Object.values(DICT).flat().map((x) => x[0])), isWord = (w) => idx.has(w), H = window.HYPH;
    assert.ok(H && Array.isArray(H.development), "words.js 带预算的断词点");
    assert.deepEqual(H.development, [2, 5, 7], "de-vel-op-ment");
    assert.equal(C.splitRange(10), null, "10 格以内不分图");
    assert.deepEqual(C.splitRange(11), { lo: 3, hi: 8 }); assert.deepEqual(C.splitRange(14), { lo: 4, hi: 10 }, "每张 3～10 格");
    const want = { development: 7, environment: 7, intelligent: 5, information: 6, opportunity: 5, mathematics: 8, caterpillar: 5, anniversary: 4,
      relationship: 8, intelligence: 7, unemployment: 8, photographer: 5, refrigerator: 6, championship: 8, overwhelming: 9, unbelievable: 8,
      international: 5, understanding: 5, extraordinary: 5, unfortunately: 7, communication: 7, entertainment: 9, psychological: 6, fundamentally: 8,
      misunderstand: 3, responsibility: 8, disappointment: 10, transportation: 9, characteristic: 9, democratically: 8, infrastructure: 5,
      xiaohongshu: 6, "12345678901": 6, "20241105203000": 7, covid19vaccine: 7 };
    for (const [w, c] of Object.entries(want)) assert.equal(C.autoSplit(w, isWord, H), c, w + "：应切成 " + w.slice(0, c) + " | " + w.slice(c));
    assert.equal(C.autoSplit("development"), 6, "没有词库与断词点：均衡（同分较长在前）");
    // B6-R1：「词 + 词」排除偶然拼接，退回标准断词 / 均衡；正确的复合词保留；常用复合词豁免拉丁词尾反证；样例表（上面 35 个）不变
    const rank = {}; for (const k in DICT) DICT[k].forEach((x, i) => { if (rank[x[0]] === undefined) rank[x[0]] = i; });
    const R = (x) => (rank[x] === undefined ? 1e9 : rank[x]), cut = (w) => { const c = C.autoSplit(w, isWord, H, R); return w.slice(0, c) + "|" + w.slice(c); };
    for (const [w, bad] of [["generational", "gene|rational"], ["restoration", "rest|oration"], ["celebration", "celeb|ration"], ["alliteration", "all|iteration"],
      ["trafficking", "traffic|king"], ["pronouncement", "pronoun|cement"], ["reincarnation", "rein|carnation"], ["malediction", "male|diction"],
      ["corporation", "corp|oration"], ["clandestine", "clan|destine"], ["collocation", "col|location"], ["supposition", "sup|position"]]) assert.notEqual(cut(w), bad, w + " 不再切成 " + bad);
    for (const [w, good] of [["grasshopper", "grass|hopper"], ["shareholder", "share|holder"], ["thunderstorm", "thunder|storm"], ["nonexistent", "non|existent"],
      ["shoplifting", "shop|lifting"], ["stomachache", "stomach|ache"], ["workstation", "work|station"], ["radioactive", "radio|active"], ["complainant", "complain|ant"]]) assert.equal(cut(w), good, w + " 保持 " + good);
    for (const [w, c] of Object.entries(want)) assert.equal(C.autoSplit(w, isWord, H, R), c, "带词频时样例表不变：" + w);
    const changed = Object.values(DICT).flat().map((x) => x[0]).filter((w) => w.length > 10 && C.autoSplit(w, isWord, H) !== C.autoSplit(w, isWord, H, R));
    assert.ok(changed.length <= 3, "词频豁免只影响极少数词：" + changed.join(","));
    assert.deepEqual(C.sheetsOf(11, 7), [[0, 7], [7, 11]]); assert.deepEqual(C.sheetsOf(8, null), [[0, 8]]);
    // B6-S1：非法分界一律回到均衡（12 格 → 6 + 6）；10 格以内始终单图；合法值原样
    for (const bad of [undefined, null, 2, 10, -1, NaN, Infinity, 5.5, "6"]) assert.deepEqual(C.sheetsOf(12, bad), [[0, 6], [6, 12]], "非法分界 " + String(bad) + " → 均衡");
    for (const c of [3, 9]) assert.deepEqual(C.sheetsOf(12, c), [[0, c], [c, 12]], "合法分界 " + c + " 原样");
    for (const c of [undefined, 4, NaN]) assert.deepEqual(C.sheetsOf(8, c), [[0, 8]], "8 格不分图");
    assert.equal(C.migrateDraft({ v: 2, word: "development", split: 5.5 }).split, null, "草稿里的小数分界作废");
    assert.equal(C.migrateDraft({ v: 2, word: "development", split: NaN }).split, null, "草稿里的 NaN 分界作废");
    // 列阵按张排：信息栏写「01–07 / 11」，只排这一张的格，格号仍是整个单词里的位置；不分图时与原来一样
    const ldata = (word) => ({ layout: { prog: true }, letters: word.split(""), word, picks: word.split("").map(() => null), glosses: [], captions: [], titleRuns: null, filler: "", hasImage: () => false });
    const m = (f, t) => String(t).length * 50, D = ldata("DEVELOPMENT");
    const g1 = C.layoutGrid(D, m, [0, 7]), g2 = C.layoutGrid(D, m, [7, 11]);
    assert.equal(g1.boxes.find((b) => b.role === "info-count").text, "01–07 / 11");
    assert.deepEqual(g1.boxes.filter((b) => b.role === "plate").map((b) => b.i), [0, 1, 2, 3, 4, 5, 6]);
    assert.deepEqual(g2.boxes.filter((b) => b.role === "plate").map((b) => b.i), [7, 8, 9, 10]);
    assert.equal(g2.W, C.gridShape(4).W, "第 2 张按 4 格算宽");
    assert.equal(C.layoutGrid(ldata("LIFE"), m).boxes.find((b) => b.role === "info-count").text, "4 格", "不分图：照旧");
    assert.deepEqual(JSON.stringify(C.layoutGrid(ldata("LIFE"), m)), JSON.stringify(C.layoutGrid(ldata("LIFE"), m, [0, 4])), "整张 = 不传 sheet");
    // 草稿：手动分界只在合法范围内保留
    assert.equal(C.migrateDraft({ v: 2, word: "development", split: 6 }).split, 6);
    assert.equal(C.migrateDraft({ v: 2, word: "development", split: 9 }).split, null, "超出 3～8：回到自动");
    assert.equal(C.migrateDraft({ v: 2, word: "life", split: 3 }).split, null, "不分图的单词没有分界");
    assert.equal(C.migrateDraft({ v: 2, word: "development" }).split, null, "旧稿没有这个字段：自动");
  }
  // B3-R1 / B3-R2：真实词条——混合括号的名字不误删；完整名字标注后的说明残片、身份标签、年份残片不进默认释义 / 义项栏；
  // 普通括号说明不动；没有名字标注的组一律原样；整条去完为空时退回原文（不让释义变空）
  {
    const real = (w) => DICT[w[0]].find((x) => x[0] === w), senses = (w) => C.displayGroups(real(w)).map((g) => g.senses);
    assert.equal(real("lindsay")[1], "n.琳赛〔女子名）", "词库原文不动");
    assert.equal(C.defaultGloss(real("lindsay")), "琳赛", "Lindsay：「〔」开括号也认，名字保留");
    assert.equal(C.defaultGloss(real("chaplin")), "卓别林", "Chaplin：身份标签（喜剧演员）去掉");
    assert.deepEqual(senses("arthur"), [["亚瑟"]], "Arthur：名字说明的后半截不显示");
    assert.deepEqual(senses("aaron"), [["亚伦"]]);
    assert.deepEqual(senses("miriam"), [["苦难之洋", "米里亚姆"]]);
    assert.deepEqual(senses("kipling"), [["吉卜林"]], "名字说明里切出来的年份不显示");
    assert.equal(C.defaultGloss(real("gloved")), "（手）戴着手套的", "旧测试词典按原文显示，含括号说明");
    assert.equal(C.defaultGloss(real("wes")), "", "整条只剩标签：空着，不拿「男子名」冒充译名（B3-R2 复审）");
    // B3-R2 复审：名字说明被切成三段时的中段别名（「等于Arabella」）、义项上挂的别名括号（「黛安（等于Diana」）、英文括号的人名标签
    for (const [w, g] of [["bella", "贝拉"], ["bobbie", "博比"], ["ricky", "里基"], ["jo", "乔"], ["diane", "黛安"], ["reid", "里德"]]) assert.deepEqual(senses(w), [[g]], w + "：只留名字");
    assert.deepEqual(senses("sethe"), [["(德)泽特"]], "「(Sethe)人名」是标签，不当默认释义");
    assert.deepEqual(senses("fletcher"), [], "名字说明残片（年份、身份）全去掉后为空，不退回原文");
    assert.deepEqual(senses("surname"), [["姓", "别号", "绰号"], ["呼以姓氏", "起绰号"]], "「姓」是普通词的释义，不当标签删");
    assert.equal(C.displayGroups(["x", "n.等于China"])[0].senses[0], "等于China", "普通词里的「等于」不动（只在名字组里认）");
    let empty = [], label = 0, plain = 0;
    for (const k in DICT) for (const it of DICT[k]) {
      const raw = C.senseGroups(it), d = C.displayGroups(it);
      if (raw.length && !d.length) empty.push(it[0]);
      d.forEach((g) => g.senses.forEach((x) => { if (/[（〔(](男子名|女子名|姓氏|人名|女名|男名|喜剧演员|英国作家)|^\([A-Za-z][^()]*\)人名$|^(男子名|女子名|人名|女名|男名)）?$/.test(x)) label++; }));
      raw.forEach((g) => {
        if (g.senses.some((x) => C.stripNameLabel(x) !== x.replace(/\s+$/, ""))) { // 名字组：不留别名中段、拉丁残片（martini 那种普通组的生成残片不在本项范围）
          const dg = d.find((x) => x.pos === g.pos);
          if (dg) dg.senses.forEach((x) => { if (/^等于[A-Za-z]|[A-Za-z]）$/.test(x) || !/[\u4e00-\u9fff]/.test(x)) label++; });
          return;
        }
        const dg = d.find((x) => x.pos === g.pos);
        const want = [...new Set(g.senses)]; // v00.03.01 L01：形容词组只允许去掉末尾的「的」
        if (!dg || JSON.stringify(want) !== JSON.stringify(dg.senses)) plain++;
      });
    }
    assert.deepEqual([empty.sort().join(","), label, plain], ["cornwall,emerson,fletcher,fran,mercia,salisbury,wes", 0, 0], "全词库：只有 7 个纯标签词条显示为空、残留人名标注与别名残片 0、没有名字标注的组被改动 0");
    assert.equal(C.properName(real("chaplin")), false, "随机池专名判断不变（T37 只动显示层；原规则不认「喜剧演员」）");
    assert.equal(C.properName(real("arthur")), true, "随机池专名判断不变");
  }
  {
    const r = C.filterWords(C.letterTiers(DICT, "i").head, "ma"), w = nm(r); // 档位 / 词频顺序看 filterWords；candidates 还会整理首屏（T25，下面单独测）
    assert.deepEqual(nm(C.candidates(DICT, "i", "ma")).sort(), [...w].sort(), "candidates 只重排、不增不减");
    assert.ok(w.length > 5, "I 格 ma 有候选");
    assert.ok(w.every((x) => x.startsWith("i") && x.includes("ma")), "全部以 i 开头且含 ma");
    assert.ok(idx(r, "image") >= 0 && idx(r, "imagine") >= 0, "image / imagine 在");
    assert.ok(idx(r, "magic") < 0 && idx(r, "main") < 0 && idx(r, "family") < 0, "magic / main / family 不以 i 开头，不出现");
    for (let k = 1; k < w.length; k++) assert.ok(pct(w[k - 1]) < pct(w[k]), `同档按词频：${w[k - 1]} → ${w[k]}`);
  }
  {
    const w = nm(C.filterWords(C.letterTiers(DICT, "l").head, "liv"));
    assert.ok(w.every((x) => x.startsWith("l") && x.includes("liv")), "L 格 liv 的结果都以 l 开头且含 liv");
    const pre = w.filter((x) => x.startsWith("liv")), cut = w.findIndex((x) => !x.startsWith("liv"));
    for (const x of ["live", "living", "lively"]) assert.ok(w.indexOf(x) >= 0 && w.indexOf(x) < pre.length, `${x} 在前缀块里`);
    assert.ok(w.indexOf("live") < w.indexOf("living") && w.indexOf("living") < w.indexOf("lively"), "live → living → lively（词频）");
    assert.equal(cut < 0 ? w.length : cut, pre.length, "前缀 liv 的整块在前");
    for (let k = 1; k < pre.length; k++) assert.ok(pct(pre[k - 1]) <= pct(pre[k]));
    assert.ok(!w.includes("deliver") && !w.includes("olive"), "deliver / olive 不以 l 开头");
  }
  // T17 的验收：I 格里不会出现非词首 i 的词；L 格里搜 liv 也不会出现 deliver
  for (const q of ["liv", "live", "ice", "a", "e", "生活", "爱"]) assert.ok(C.candidates(DICT, "i", q).every((x) => x[0][0] === "i"), `I 格 "${q}" 的候选都以 i 开头`);
  assert.ok(nm(C.candidates(DICT, "l", "生活")).includes("life"), "「生活」命中 life");
  // T06：真词库——义项完全命中的词排在所有非完全命中的词之前（15 个常见中文查询 × 26 个字母格）；点名样本 love 先于 like、freedom 先于 free
  {
    const exactSense = (it, q) => it[1].replace(/(^|\|)([a-z]+\.|\[[^\]]+\])/g, "$1").replace(/，/g, "|").split("|").includes(q);
    let exactTotal = 0;
    for (const q of ["快乐", "朋友", "梦想", "勇敢", "自由", "温柔", "爱", "家", "希望", "光", "时间", "孤独", "记忆", "星星", "生活"]) {
      for (const c of "abcdefghijklmnopqrstuvwxyz") {
        const flags = C.filterWords(C.letterTiers(DICT, c).head, q).map((it) => exactSense(it, q)); // 排序本身看 filterWords；T25 只整理首屏的同根扎堆，不属于这一条
        exactTotal += flags.filter(Boolean).length;
        assert.ok(!flags.some((f, k) => f && k > 0 && !flags.slice(0, k).every(Boolean)), `${c} 格「${q}」：完全命中项都在非完全命中项之前`);
      }
    }
    assert.ok(exactTotal > 10, `样本里确有完全命中项（${exactTotal}）`);
    const love = nm(C.filterWords(C.letterTiers(DICT, "l").head, "爱")), free = nm(C.filterWords(C.letterTiers(DICT, "f").head, "自由"));
    assert.ok(love.indexOf("love") === 0, "爱 → love 排第一（不再排在 like 之后）");
    assert.ok(free.indexOf("freedom") < free.indexOf("free"), "自由 → freedom 先于 free");
  }
  assert.ok(!nm(C.candidates(DICT, "i", "生活")).includes("living"), "T17：「生活」在 I 格不再命中词中含 i 的 living");
  assert.deepEqual(C.candidates(DICT, "i", ""), [], "空串不出候选");
  // 候选整体屏蔽过滤：真词库里随便一个查询，取出的一页不含被屏蔽的词，且仍满 8 个
  for (const [L, q] of [["i", "s"], ["e", "e"], ["a", "a"], ["s", "st"], ["o", "o"]]) {
    const pg = C.pageOf(C.candidates(DICT, L, q), 0, 8, skip);
    assert.equal(pg.items.length, 8, `${L} 格 "${q}" 凑满 8 个`);
    assert.ok(pg.items.every((x) => !C.blocked(x[0])));
  }
  // 随机池（T17）：只取词首档。X 格词首档只有 9 个，池子就小；都以 x 开头、≤10 字母、adj / n / v
  {
    const pool = C.randomPool(DICT, "x");
    assert.ok(pool.length > 0 && pool.length <= 9, `X 格随机池 ${pool.length} ≤ 9`);
    assert.ok(pool.every((x) => x[0].startsWith("x") && x[0].length <= 10 && /^(adj|n|v)\.$/.test(C.defaultPos(x))));
    const poolL = C.randomPool(DICT, "L");
    assert.equal(poolL.length, C.POOL_SIZE);
    assert.ok(poolL.every((x) => x[0].startsWith("l")));
    assert.equal(C.randomPool(DICT, "l"), poolL, "按字母缓存");
    assert.deepEqual(nm(C.randomPool(FW, "i")), ["image", "idea"], "换词库就重建：词首档 3 个，去掉 11 个字母的 information");
    assert.notEqual(C.randomPool(FW, "i"), poolL);
    for (const c of "abcdefghijklmnopqrstuvwxyz") assert.ok(C.randomPool(DICT, c).length >= 5, `${c} 格随机池不为空（${C.randomPool(DICT, c).length}）`);
  }
  // 编辑面占位：释义 / 配文为空时多出灰色占位框（导出不传 edit，不出）
  {
    const base = ldata(1, false, { glosses: [""], captions: [""] });
    const roles = (L) => L.boxes.map((b) => b.role);
    assert.ok(!roles(C.layoutCard(base, fm)).some((r) => /-ph$/.test(r)), "导出不出占位框");
    const E = C.layoutCard(Object.assign({}, base, { edit: true }), fm);
    const g = E.boxes.find((b) => b.role === "gloss-ph"), c = E.boxes.find((b) => b.role === "caption-ph");
    assert.deepEqual([g.text, g.x, g.baseline, g.size, g.weight, g.color], ["释义", 80, 1158, 40, 400, "ph"], "释义占位跟释义字号 40（U04）");
    assert.deepEqual([c.text, c.x, c.baseline, c.size, c.weight, c.color], ["配文（选填）", 80, 1228, 48, 400, "ph"]);
    const F = C.layoutCard(Object.assign({}, base, { edit: true, glosses: ["湖"], captions: ["短"] }), fm);
    assert.ok(!roles(F).some((r) => /-ph$/.test(r)) && roles(F).includes("gloss") && roles(F).includes("caption"), "有字就不出占位");
    const none = C.layoutCard(Object.assign({}, base, { edit: true, picks: [null] }), fm);
    assert.ok(!roles(none).some((r) => /-ph$/.test(r)), "格子没词时不出释义 / 配文占位");
    for (let n = 1; n <= 4; n++) for (let i = 0; i < n; i++) checkLayout(C.layoutCard(ldata(n, false, { i, edit: true, glosses: ldata(n).glosses.map(() => ""), captions: ldata(n).captions.map(() => "") }), fm), `编辑面占位 n=${n} i=${i}`);
  }
}
// T25 / F4（返工后）：候选首屏——先剔除屏蔽词，按命中档从高到低填；档内首轮分散词族、形容词优先、副词推迟，空位再按该档原序补回；
// 有 8 个可见词首屏就是满的；档与档之间不换位；没有 lead、没有「试试：」建议词
{
  const item = (w, g) => [w, g];
  const nm = (list) => list.map((x) => x[0]);
  const skip = (it) => C.blocked(it[0]);
  load(LEGACY + "/en/words.js");
  const DICT = window.WORDS;
  // 词族判断（启发式）
  const fam = C.familyOf;
  assert.equal(fam("happy"), fam("happiness")); assert.equal(fam("happy"), fam("happily"));
  assert.notEqual(fam("happy"), fam("happen")); assert.equal(fam("happen"), fam("happening"));
  assert.equal(fam("haphazard"), fam("haphazardly")); assert.notEqual(fam("haphazard"), fam("happy"));
  for (const w of ["lovely", "lover", "loving", "loved", "lovingly", "lovable"]) assert.equal(fam(w), fam("love"), `${w} 与 love 同族`);
  assert.equal(fam("running"), fam("run")); assert.equal(fam("Bigger"), fam("bigger"), "不分大小写");
  assert.notEqual(fam("bed"), fam("b"), "后缀去掉后不足 3 个字母就不去");
  assert.equal(typeof fam(""), "string");

  // 真词库 + 屏蔽器的页数边界（Astra 复审 P3）：放行 lust 后 L/lus 9 个可见 → 2 批；S/sl 104 个可见 → 13 批
  {
    const pg = (L, q) => C.pageOf(C.candidates(DICT, L, q), 0, C.PAGE_SIZE, skip);
    const lus = C.candidates(DICT, "L", "lus");
    assert.equal(lus.filter((it) => !skip(it)).length, 9); assert.equal(pg("L", "lus").pages, 2, "lus 的第九项可翻页");
    const sl = C.candidates(DICT, "S", "sl").filter((it) => !skip(it)).length;
    assert.equal(pg("S", "sl").pages, Math.ceil(sl / C.PAGE_SIZE), "sl 页数按可见数算");
  }
  // 界面的「换一批」：从第 0 批起每次 candPage = 上次的 page + 1，直到绕回第 0 批
  const walk = (r) => {
    const batches = [];
    let page = 0;
    for (let k = 0; k < 1000; k++) {
      const pg = C.pageOf(r, page, C.PAGE_SIZE, skip);
      if (k > 0 && pg.page === 0) return { batches: batches.map(nm), wrap: nm(pg.items) };
      batches.push(pg.items);
      page = pg.page + 1;
    }
    throw new Error("翻不到头");
  };
  const first = (L, q) => nm(C.pageOf(C.candidates(DICT, L, q), 0, C.PAGE_SIZE, skip).items);
  const visible = (L, q) => C.filterTiers(C.letterTiers(DICT, L).head, q).map((t) => nm(t).filter((w) => !C.blocked(w)));

  // PLAN 点名：L 格搜「爱」love 在 lovely、like 之前；H 格搜「时间」hour 在 hourly 之前（不被同族形容词换位推后）；精确输入 happily 排第一
  {
    const f = first("l", "爱");
    assert.equal(f[0], "love", `爱 → love 第一：${f}`);
    assert.ok(f.indexOf("love") < f.indexOf("like") && f.indexOf("love") < f.indexOf("lovely"), "love 在 like、lovely 之前");
    const h = first("h", "时间");
    assert.equal(h[0], "hour", `时间 → hour 第一：${h}`);
    assert.ok(h.includes("hourly") && h.indexOf("hour") < h.indexOf("hourly"), "hour 在 hourly 之前");
    assert.equal(first("h", "happily")[0], "happily");
    assert.equal(first("h", "Happily")[0], "happily", "不分大小写");
    assert.equal(first("l", "love")[0], "love", "精确输入固定第一位（love 的同族形容词 lovely 不能挤到它前面）");
    assert.ok(first("l", "love").slice(0, 3).includes("lovely"), "love 之后补上该族形容词");
  }
  // lov / hap / sly：首屏数量、形容词优先、副词补位
  {
    const lov = first("l", "lov");
    assert.deepEqual(lov, ["lovely", "love", "lover", "loving", "loved", "lovingly", "lovable"], "lov：lovemaking 被屏蔽，可见 7 个全上首屏；首轮 lovely + love，其余按原序补回，副词 lovingly 也在");
    assert.equal(lov.length, visible("l", "lov")[0].length);
    const hap = first("h", "hap");
    assert.deepEqual(hap, ["happen", "happy", "happiness", "happening", "hapless", "haphazard", "happily", "haphazardly"], "hap：首轮六个，副词 happily / haphazardly 补回，首屏满 8 个");
    assert.ok(hap.indexOf("happy") < hap.indexOf("happily"));
    const sly = first("s", "sly");
    assert.equal(sly.length, 8);
    assert.deepEqual(sly.slice(0, 2), ["sly", "slyly"], "sly：精确输入第一；同档的副词 slyly 先补回，再进入下一档");
  }
  // S 格搜 sl：连续「换一批」每个可见词恰好一次，末页之后回到首屏
  {
    const r = C.candidates(DICT, "s", "sl"), { batches, wrap } = walk(r), flat = batches.flat();
    const vis = visible("s", "sl").flat();
    assert.equal(new Set(flat).size, flat.length, "没有重复");
    assert.deepEqual(flat.slice().sort(), vis.slice().sort(), "每个可见词恰好一次");
    assert.ok(vis.length > 8 && batches.length > 1, `sl 有多批（${batches.length}）`);
    assert.deepEqual(wrap, batches[0], "末页之后回到首屏");
    assert.ok(batches.slice(0, -1).every((b) => b.length === 8));
    assert.ok(C.filterTiers(C.letterTiers(DICT, "s").head, "sl").flat().some((it) => C.blocked(it[0])), "sl 里确有被屏蔽词（slut 一类），用例走到了屏蔽分支");
  }
  // 全量不变量（生产词库 + 屏蔽器）：所有字母的 2~3 字母前缀、15 个常见中文查询 × 26 个字母格
  {
    let queries = 0;
    const check = (L, q) => {
      const r = C.candidates(DICT, L, q), tiers = C.filterTiers(C.letterTiers(DICT, L).head, q), tag = `${L}/${q}`;
      const vis = tiers.map((t) => nm(t).filter((w) => !C.blocked(w))), flatVis = vis.flat();
      if (!flatVis.length) { assert.deepEqual(nm(r.filter((it) => !C.blocked(it[0]))), [], tag); return; }
      queries++;
      const { batches, wrap } = walk(r), flat = batches.flat();
      assert.equal(new Set(flat).size, flat.length, `${tag} 没有重复`);
      assert.deepEqual(flat.slice().sort(), flatVis.slice().sort(), `${tag} 每个可见词恰好一次`);
      assert.equal(batches[0].length, Math.min(C.PAGE_SIZE, flatVis.length), `${tag} 有 8 个可见词就填满首屏`);
      assert.ok(batches.slice(0, -1).every((b) => b.length === C.PAGE_SIZE), `${tag} 除末批外每批 8 个`);
      assert.deepEqual(wrap, batches[0], `${tag} 末页后回到首屏`);
      assert.ok(batches[0].every((w) => !C.blocked(w)), `${tag} 首屏没有屏蔽词`);
      // 不跨档换位：整个可见序列里命中档号不递减
      const tierOf = {};
      vis.forEach((t, ti) => t.forEach((w) => { tierOf[w] = ti; }));
      for (let k = 1; k < flat.length; k++) assert.ok(tierOf[flat[k - 1]] <= tierOf[flat[k]], `${tag} 档位不倒退：${flat[k - 1]} → ${flat[k]}`);
      // 首屏之后保持（分档的）原顺序
      const head = new Set(batches[0]);
      assert.deepEqual(flat.slice(batches[0].length), flatVis.filter((w) => !head.has(w)), `${tag} 首屏之后保持原顺序`);
    };
    const before = DICT.s.length;
    for (const L of "abcdefghijklmnopqrstuvwxyz") {
      const seen = new Set();
      for (const it of DICT[L]) for (const n of [2, 3]) {
        const q = it[0].slice(0, n);
        if (q.length < n || seen.has(q)) continue;
        seen.add(q);
        check(L, q);
      }
    }
    for (const q of ["快乐", "朋友", "梦想", "勇敢", "自由", "温柔", "爱", "家", "希望", "光", "时间", "孤独", "记忆", "星星", "生活"]) for (const L of "abcdefghijklmnopqrstuvwxyz") check(L, q);
    assert.ok(queries > 2500, `样本量 ${queries}`);
    assert.equal(DICT.s.length, before, "不改词库");
  }
  // T06 在用户可见的候选序列里仍成立：中文查询时义项完全命中的词都排在非完全命中之前（经 candidates → pageOf，走屏蔽器）；点名 love 先于 like、freedom 先于 free
  {
    const exactSense = (it, q) => it[1].replace(/(^|\|)([a-z]+\.|\[[^\]]+\])/g, "$1").replace(/，/g, "|").split("|").includes(q);
    let exactTotal = 0;
    for (const q of ["快乐", "朋友", "梦想", "勇敢", "自由", "温柔", "爱", "家", "希望", "光", "时间", "孤独", "记忆", "星星", "生活"]) {
      for (const c of "abcdefghijklmnopqrstuvwxyz") {
        const r = C.candidates(DICT, c, q), { batches } = walk(r);
        const byName = {};
        C.letterTiers(DICT, c).head.forEach((it) => { byName[it[0]] = it; });
        const flags = batches.flat().map((w) => exactSense(byName[w], q));
        exactTotal += flags.filter(Boolean).length;
        assert.ok(!flags.some((f, k) => f && !flags.slice(0, k).every(Boolean)), `${c} 格「${q}」：可见序列里完全命中项都在非完全命中项之前`);
      }
    }
    assert.ok(exactTotal > 10, `样本里确有完全命中项（${exactTotal}）`);
    const free = first("f", "自由");
    assert.ok(free.indexOf("freedom") >= 0 && free.indexOf("freedom") < (free.indexOf("free") < 0 ? 99 : free.indexOf("free")), "自由 → freedom 先于 free");
  }

  // 小词库逐条钉规则（每条先用 familyOf 钉住词族假设，再断言精确的先后）
  const mk = (rows) => rows.map(([w, pos]) => item(w, pos + "释"));
  const shown = (r) => nm(C.pageOf(r, 0, C.PAGE_SIZE, skip).items);
  {
    // 首轮同族上限 + 副词推迟：hard / hardness / hardly(副词) 同族；hardness 占第二个位置，hardly 是副词，第 10 个 harden 排在后面，首屏满 8 个
    assert.ok(fam("hardness") === fam("hard") && fam("hardly") === fam("hard") && fam("hardship") !== fam("hard"));
    const D1 = { h: mk([["hard", "n."], ["hardness", "n."], ["hardly", "adv."], ["harm", "n."], ["harp", "n."], ["harvest", "n."], ["harsh", "adj."], ["harbor", "n."], ["hardship", "n."], ["harden", "v."]]) };
    const r = C.candidates(D1, "h", "har");
    assert.deepEqual(nm(r), ["hard", "hardness", "harm", "harp", "harvest", "harsh", "harbor", "hardship", "hardly", "harden"]);
    assert.deepEqual(shown(r), nm(r).slice(0, 8), "首屏 8 个：副词 hardly 在首屏之后");
  }
  {
    // 形容词排该族最前，且其他词性给它留位置：tester / tested / test / testing(形容词) 同族
    assert.ok(["tested", "test", "testing"].every((w) => fam(w) === fam("tester")));
    const D2 = { t: mk([["tester", "n."], ["tested", "v."], ["test", "n."], ["testing", "adj."], ["tab", "n."], ["tag", "n."], ["tail", "n."], ["tale", "n."], ["talk", "n."], ["tank", "n."]]) };
    const r = C.candidates(D2, "t", "t");
    assert.deepEqual(shown(r), ["testing", "tester", "tab", "tag", "tail", "tale", "talk", "tank"], "形容词 testing 占该族最靠前的位置，只留 1 个其他词性（tester）");
    assert.deepEqual(nm(r).slice(8), ["tested", "test"], "同族其余按原顺序留在后面");
  }
  {
    // 空位补回：首轮同族封顶挑出的不足 8 个时，推迟的词按该档原序补回，不再限族
    const D2b = { t: mk([["tester", "n."], ["tested", "v."], ["test", "n."], ["tab", "n."]]) };
    assert.deepEqual(nm(C.candidates(D2b, "t", "t")), ["tester", "tested", "tab", "test"], "首轮 tester / tested / tab，test 补回");
    assert.deepEqual(shown(C.candidates(D2b, "t", "t")), ["tester", "tested", "tab", "test"], "只有 4 个词，首屏就是这 4 个（没有 lead、没有阈值）");
  }
  {
    // 近义形容词：首轮只留 1 个，其余在空位上补回（首屏有空就补，不留到下一批）
    assert.ok(["lovely", "loving", "lovable", "lover"].every((w) => fam(w) === fam("love")));
    const D3 = { l: mk([["lovely", "adj."], ["loving", "adj."], ["lovable", "adj."], ["lover", "n."], ["lamp", "n."], ["lane", "n."], ["lark", "n."], ["lash", "n."], ["lawn", "n."]]) };
    const r = C.candidates(D3, "l", "l");
    assert.deepEqual(shown(r), ["lovely", "lover", "lamp", "lane", "lark", "lash", "lawn", "loving"], "首轮 7 个（loving / lovable 推迟），还差 1 个：按原序补回 loving");
    assert.deepEqual(nm(r).slice(8), ["lovable"]);
  }
  {
    // 精确输入固定第一位，且计入该族上限
    const D4 = { l: mk([["lovely", "adj."], ["love", "n."], ["lover", "n."], ["loved", "v."], ["loving", "adj."], ["lovingly", "adv."], ["lovebird", "n."], ["loveless", "adj."], ["lovesick", "adj."]]) };
    const r = C.candidates(D4, "l", "love");
    assert.ok(["lover", "loved", "loveless"].every((w) => fam(w) === fam("love")) && fam("lovebird") !== fam("love") && fam("lovesick") !== fam("love"));
    assert.deepEqual(nm(r), ["love", "lovely", "lovebird", "lovesick", "lover", "loved", "loveless"], "love 固定第一，其后是该族形容词，族内再无首轮位置；lovebird / lovesick 异族；其余补回（loving / lovingly 不含 love，不是候选）");
  }
  {
    // 补回含副词；首轮仍守每族上限
    const adv = { r: mk([["rapidly", "adv."], ["rarely", "adv."], ["rashly", "adv."], ["rightly", "adv."]]) };
    assert.deepEqual(nm(C.candidates(adv, "r", "r")), ["rapidly", "rarely", "rashly", "rightly"], "全是副词：原序，首屏就是全部");
    const few = { r: mk([["rapidly", "adv."], ["rate", "n."], ["rarely", "adv."], ["rashly", "adv."]]) };
    assert.deepEqual(nm(C.candidates(few, "r", "r")), ["rate", "rapidly", "rarely", "rashly"], "非副词先上，副词按原序补回");
    const capped = { r: mk([["rapid", "adj."], ["rapidly", "adv."], ["rapidness", "n."], ["rapidity", "n."]]) };
    assert.ok(fam("rapidly") === fam("rapid") && fam("rapidness") === fam("rapid"));
    assert.deepEqual(nm(C.candidates(capped, "r", "r")), ["rapid", "rapidness", "rapidity", "rapidly"], "首轮 rapid + rapidness 已满，异族 rapidity 照常入选，副词 rapidly 补回");
  }
  {
    // 不跨档：hour 在「完全命中」档、hourly 在「部分命中」档，原顺序里 hourly 在前；形容词换位只在同一档内，hour 不被换到 hourly 后面
    const H = { h: [item("hourly", "adj.每小时的，时间的"), item("hour", "n.小时，时间"), item("hat", "n.帽子，时间")] };
    assert.deepEqual(nm(C.filterTiers(H.h, "时间")[1]), ["hour", "hat"], "hour / hat 义项恰为「时间」");
    assert.deepEqual(nm(C.filterTiers(H.h, "时间")[2]), ["hourly"], "hourly 只是部分命中");
    assert.deepEqual(nm(C.candidates(H, "h", "时间")), ["hour", "hat", "hourly"], "完全命中档先填；hourly 虽是形容词，不能越档");
    // 同一档内形容词仍排该族最前：两个都是完全命中
    const H2 = { h: [item("hour", "n.时间"), item("hourly", "adj.时间")] };
    assert.deepEqual(nm(C.candidates(H2, "h", "时间")), ["hourly", "hour"], "同档内形容词换到该族最前");
  }
  {
    // 档内补回先于下一档：quick 档里副词 quickly 补回后，才轮到部分命中档
    const Q = { q: [item("quickly", "adv.快"), item("quick", "adj.快"), item("quest", "n.追求快"), item("quit", "v.不快")] };
    assert.deepEqual(nm(C.candidates(Q, "q", "快")), ["quick", "quickly", "quest", "quit"], "完全命中档 quick（首轮）、quickly（补回），然后才是部分命中档");
  }
  {
    // 屏蔽词先剔除、不占位：被屏蔽的 tester 不占 test 族的名额，也不占首屏；它留在首屏之后，取页时再被 pageOf 过滤
    const D5 = { t: mk([["tester", "n."], ["tested", "v."], ["test", "n."], ["testing", "adj."], ["tab", "n."], ["tag", "n."], ["tail", "n."], ["tale", "n."], ["talk", "n."], ["tank", "n."], ["tape", "n."]]) };
    const banned = (it) => it[0] === "tester";
    const r = C.candidates(D5, "t", "t", banned);
    assert.deepEqual(nm(r).slice(0, 8), ["testing", "tested", "tab", "tag", "tail", "tale", "talk", "tank"], "tester 被屏蔽：不占名额，tested 进首轮；首屏 8 个");
    assert.ok(!nm(r).slice(0, 8).includes("tester"));
    const pages = [0, 1, 2].map((p) => nm(C.pageOf(r, p, 8, banned).items));
    assert.deepEqual(pages.flat().slice(0, 10).sort(), ["tab", "tag", "tail", "tale", "talk", "tank", "tape", "test", "tested", "testing"].sort(), "其余可见词每个一次，屏蔽词不出现");
    // 默认用屏蔽器：sex 不进首屏，其余 8 个词满屏
    const S = { s: mk([["sex", "n."], ["sea", "n."], ["sad", "adj."], ["sap", "n."], ["saw", "n."], ["say", "v."], ["sat", "v."], ["sag", "v."], ["sum", "n."]]) };
    assert.equal(C.blocked("sex"), true);
    assert.deepEqual(shown(C.candidates(S, "s", "s")), ["sea", "sad", "sap", "saw", "say", "sat", "sag", "sum"], "默认屏蔽器：首屏 8 个都是可见词");
    // QA 返工复验：缺省 skip 就是屏蔽器（app.js 不传 skip）。真词库里屏蔽词会占词族名额的查询，缺省与显式传屏蔽器结果一致、与不屏蔽不同
    {
      load(LEGACY + "/en/words.js");
      const bl = (it) => C.blocked(it[0]), qs = [["h", "her"], ["w", "who"], ["r", "rap"]];
      for (const [l, q] of qs) assert.deepEqual(nm(C.candidates(window.WORDS, l, q)), nm(C.candidates(window.WORDS, l, q, bl)), `${l}/${q}：缺省 skip = 屏蔽器`);
      assert.ok(qs.some(([l, q]) => nm(C.candidates(window.WORDS, l, q)).join() !== nm(C.candidates(window.WORDS, l, q, () => false)).join()), "样本对屏蔽敏感");
    }
  }
  // pageOf：普通数组按 8 个一批，屏蔽词不计数，不再有 lead
  {
    const flat = Array.from({ length: 20 }, (_, k) => item("w" + k, ""));
    assert.deepEqual(nm(C.pageOf(flat, 1, 8).items), nm(flat.slice(8, 16)));
    assert.equal(flat.lead, undefined);
    assert.deepEqual(C.pageOf([], 0, 8), { items: [], page: 0, pages: 0 });
  }
}

// T07 / D4：随机池不含人名 / 姓氏 / 地名词条；候选与搜索不受影响
{
  load(LEGACY + "/en/words.js");
  const DICT = window.WORDS;
  const nm = (list) => list.map((x) => x[0]);
  // 该拦：带括号名字标注的词条（含括号被词库劈开、没闭合的）
  for (const [w, g] of [["evans", "n.埃文斯（姓氏）"], ["anthony", "n.安东尼（人名）"], ["herbert", "n.赫伯特（男人名）"], ["jim", "n.吉姆（人名）"],
    ["andy", "n.等于Andrew），安迪（男子名"], ["kennedy", "n.美国第35任总统），肯尼迪（姓氏"], ["windsor", "n.伦敦西方的城市），温莎（地名"], ["kate", "n.凯特（女子名）"],
    ["derek", "n.德里克（男名）"], ["thompson", "n.汤普森（姓）"], ["kingston", "n.金斯敦（牙买加首都）"], ["newcastle", "n.纽卡斯尔（英国港市）"], ["norwich", "n.诺威奇（英国城市）"],
    ["james", "n.男子名），[圣]《雅各书》，詹姆斯（姓氏"], ["karen", "n.凯伦（人名），克伦邦（缅甸邦名）"], ["george", "n.自动操纵装置，乔治（男子名）"]])
    assert.equal(C.properName([w, g]), true, `${w} 是专名词条`);
  // 不该误伤：普通词，哪怕释义里有「名」「姓」「城」「国」字或别的括号
  for (const [w, g] of [["name", "adj.姓名的，据以取名的|n.名字，名称，姓名，名义|v.命名，称呼，任命，提名"], ["initial", "adj.开始的|n.字首|v.用姓名的首字母签名"],
    ["city", "n.城市，市"], ["capital", "adj.首都的，重要的|n.首都，资本"], ["county", "n.县，郡"], ["kyle", "n.海峡，（苏）狭海峡"], ["hong", "n.商行，（中国、日本的）行"],
    ["famous", "adj.出名的，极好的"], ["foreign", "adj.外国的，外交的"], ["love", "n.爱，恋爱|v.爱"], ["dream", "n.梦，梦想|v.做梦"], ["life", "n.生命，生活"], ["fame", "n.名望，名声"],
    ["entitle", "v.取名为，给予名称"], ["island", "n.岛，岛屿"], ["x", ""], ["y", undefined]])
    assert.equal(C.properName([w, g]), false, `${w} 不是专名词条`);
  // 只看第一个词性组：后面的组里的括号标注不算（普通词的次要义项）
  assert.equal(C.properName(["john", "n.厕所|n.约翰（男子名）"]), false, "第二组里的名字标注不算");
  assert.equal(C.properName(null), false); assert.equal(C.properName([]), false);

  // 真词库：随机池里一个都不剩（用与实现无关的子串检查再核一遍），而且池没有被掏空
  let removed = 0;
  for (const L of "abcdefghijklmnopqrstuvwxyz") {
    const pool = C.randomPool(DICT, L);
    for (const it of pool) {
      const g = it[1].split("|")[0];
      assert.ok(!/姓氏|人名|男子名|女子名|地名/.test(g), `${it[0]} 不该在随机池里：${g}`); // 与实现无关的子串检查，比实现的括号规则更严
      assert.equal(C.properName(it), false);
    }
    assert.ok(pool.length >= (L === "x" ? 5 : 20), `${L} 格随机池没有被掏空（${pool.length}）`);
    removed += DICT[L].filter((it) => it[0].length <= 10 && /^(adj|n|v)\.$/.test(C.defaultPos(it))).slice(0, 400).filter(C.properName).length;
  }
  assert.ok(removed > 100, `确实排除了一批专名（原始前 400 个里 ${removed} 个）`);
  // 搜 evans 仍能找到；Anthony / Windsor 照样能当候选
  assert.deepEqual(nm(C.candidates(DICT, "e", "evans")), ["evans"], "搜 evans 仍能找到");
  assert.ok(nm(C.candidates(DICT, "a", "anthony")).includes("anthony"));
  assert.ok(nm(C.candidates(DICT, "w", "wind")).includes("windsor"), "候选里保留 windsor");
  assert.ok(!nm(C.randomPool(DICT, "e")).includes("evans"), "随机池里没有 evans");
  assert.ok(!nm(C.randomPool(DICT, "a")).includes("anthony"));
  assert.ok(C.randomPool(DICT, "d").some((x) => x[0] === "dream"), "普通词留在池里");
  // 池按字母缓存、换词库重建仍有效
  const small = { e: [["evans", "n.埃文斯（姓氏）"], ["echo", "n.回声"], ["ember", "n.余烬"]] };
  assert.deepEqual(nm(C.randomPool(small, "e")), ["echo", "ember"], "换词库重建，同样排除");
}

// T16：标题框模式（D18）
{
  assert.equal(C.titleModeOf([]), "first", "没有单词 → first");
  assert.equal(C.titleModeOf(undefined), "first");
  assert.equal(C.titleModeOf(["L", "I", "F", "E"]), "title", "有单词 → title");
  assert.equal(C.titleModeOf(["A"]), "title", "一个字母也算有单词");
  // 单词输入：只收 A–Z 与 0–9（T41：数字自成一格），转大写，最多 14 个
  assert.equal(C.normalizeWord("life"), "LIFE");
  assert.equal(C.normalizeWord(" l-i f3e!"), "LIF3E", "字母、数字之外的全部丢掉");
  assert.equal(C.normalizeWord("b2b"), "B2B"); assert.equal(C.normalizeWord("2024"), "2024");
  assert.equal(C.normalizeWord("生活life"), "LIFE", "汉字不进单词");
  assert.equal(C.normalizeWord("ｌｉｆｅ"), "", "全角字母不收");
  assert.equal(C.normalizeWord("abcdefghijklmnop"), "ABCDEFGHIJKLMN", "最多 14 个（T41）"); assert.equal(C.MAX_LETTERS, 14);
  assert.equal(C.normalizeWord(""), "");
  assert.equal(C.normalizeWord(null), "");
  // 改单词按位置保留：LIFE → LIKE，L、I 两格保留，F → K 清空，E 同位置没变也保留
  const prev = ["L", "I", "F", "E"], arr = ["lake", "image", "fire", "echo"];
  assert.deepEqual(C.keepSame(prev, ["L", "I", "K", "E"], arr, null), ["lake", "image", null, "echo"], "LIFE → LIKE");
  assert.deepEqual(C.keepSame(prev, ["L", "I", "F", "E", "S"], arr, null), ["lake", "image", "fire", "echo", null], "加长：新增位置为空");
  assert.deepEqual(C.keepSame(prev, ["L", "I"], arr, null), ["lake", "image"], "缩短：多出的位置丢掉");
  assert.deepEqual(C.keepSame(prev, ["F", "I", "L", "E"], arr, ""), ["", "image", "", "echo"], "只看同位置：换了顺序的不保留");
  assert.deepEqual(C.keepSame(prev, ["L", "I", "F", "E"], ["lake", "", "fire", "echo"], ""), ["lake", "", "fire", "echo"], "原来就空的位置仍是空值");
  assert.deepEqual(C.keepSame(prev, ["L", "I", "K", "E"], [0, 2, 1, 3], 0), [0, 2, 0, 3], "数字数据（keys）按同规则，保留值 0 即空值");
  // 标题最多两行：只拒绝这次新增，绝不删已有的字
  assert.equal(C.titleEditKept(false, 10, 9, false), true, "没超 → 保留");
  assert.equal(C.titleEditKept(true, 30, 29, false), false, "这次输入造成超出 → 拒绝");
  assert.equal(C.titleEditKept(true, 29, 29, false), false, "编辑前没超、格式使它超出 → 拒绝");
  assert.equal(C.titleEditKept(true, 40, 38, true), false, "旧草稿已超，再往里加字 → 拒绝");
  assert.equal(C.titleEditKept(true, 38, 38, true), true, "旧草稿已超，字数不变（改格式）→ 保留");
  assert.equal(C.titleEditKept(true, 30, 38, true), true, "旧草稿已超，删字 → 保留");
  // 粘贴：二分出放得下的前 n 个字
  assert.equal(C.pasteFitLength(110, (n) => n <= 29), 29, "放得下 29 个");
  assert.equal(C.pasteFitLength(20, (n) => n <= 29), 20, "全放得下");
  assert.equal(C.pasteFitLength(110, (n) => n <= 0), 0, "一个都放不下（已超长的标题）");
  assert.equal(C.pasteFitLength(5, (n) => n <= 4), 4);
  assert.equal(C.pasteFitLength(2, (n) => n <= 1), 1);
  assert.equal(C.pasteFitLength(0, () => true), 0);
  // 草稿里的单词（可能是旧草稿的小写 / 带空格）经 normalizeWord 再用，不会得到半个合法词
  assert.equal(C.normalizeWord("Life "), "LIFE");
}

// T17 / T23：草稿校验（D8）。新键 backronym-draft-v2 里只会有 v: 2 的草稿，旧格式不再转换：没有 v: 2 的一律返回 null
{
  const clone = (x) => JSON.parse(JSON.stringify(x));
  const v2 = {
    v: 2, t: 1700000000000, word: "LIFE", view: "grid", filler: "小满",
    titleRuns: [{ t: "总之 这里有", b: true, i: false, c: null }, { t: "四种", b: true, i: true, c: "red" }, { t: "情况", b: false, i: false, c: "#2A6FB0" }],
    picks: [["life", "n.生命，生活|v.活"], ["Izzy", ""], null, ["echo", "n.回声"]],
    glosses: ["生命，生活", "我自己写的", "", "回响"],
    captions: ["", "配文一", "", "配文二"],
    glossAuto: [true, false, true, false],
    keys: [0, 0, 0, 0],
    future: { nested: [1, 2, { x: "keep" }] }, // 未知字段
  };
  const before = clone(v2);
  const m = C.migrateDraft(v2);
  assert.deepEqual(v2, before, "不改传入的对象");
  assert.equal(m.v, 2);
  for (const k of ["t", "word", "view", "filler", "glosses", "captions", "glossAuto", "keys"]) assert.deepEqual(m[k], v2[k], `${k} 原样保留`);
  assert.deepEqual(m.picks, v2.picks, "picks 原样保留（含自定义词和空格）");
  assert.notEqual(m.picks[0], v2.picks[0], "picks 是副本");
  assert.deepEqual(m.titleRuns.map((r) => r.c), [null, "red", "#2A6FB0"], "颜色原样（不再把十六进制朱换成 red）");
  assert.deepEqual(m.titleRuns.map((r) => r.t), ["总之 这里有", "四种", "情况"]);
  assert.deepEqual(m.future, v2.future, "未知字段原样带过去");
  assert.deepEqual(C.migrateDraft(m), m, "再校验一次不变");
  for (const f of ["v", "t", "word", "titleRuns", "filler", "view", "picks", "glosses", "glossAuto", "captions", "keys", "split"]) assert.ok(C.DRAFT_FIELDS.includes(f), `DRAFT_FIELDS 含 ${f}`);
  assert.ok(!C.DRAFT_FIELDS.includes("future"));
  // 旧格式不转换：没有 v: 2 一律 null（v1 样本、v 不是数字 2、v: 1 / 3 / "2"）
  const v1 = { t: 1700000000000, word: "LIFE", view: "grid", picks: [["life", ""]], glosses: [""], captions: [""] };
  assert.equal(C.migrateDraft(v1), null, "v1 旧格式（没有 v）不再转换");
  for (const v of [1, 3, "2", null, true, [2]]) assert.equal(C.migrateDraft({ v, word: "AB" }), null, `v = ${JSON.stringify(v)} 不是 v: 2`);
  assert.notEqual(C.migrateDraft({ v: 2, word: "AB" }), null);
  // 旧格式的纯文字 title 不再并进 titleRuns；当作未知字段原样带过（不会复活，因为 app 只读 titleRuns）
  const legacy = C.migrateDraft({ v: 2, word: "AB", title: "旧标题" });
  assert.equal(legacy.titleRuns, null); assert.equal(legacy.title, "旧标题");
  // 标题 null / 空数组 = 留空
  assert.equal(C.migrateDraft({ v: 2, word: "AB", titleRuns: null }).titleRuns, null, "titleRuns null = 留空");
  assert.deepEqual(C.migrateDraft({ v: 2, word: "AB", titleRuns: [] }).titleRuns, null, "空数组 = 留空");
  // keys（T17）：字段保留但恒为 0，存储里的值（含 4 / 99 / 非数字）一律不读
  const k2 = C.migrateDraft({ v: 2, word: "IIIL", picks: [["initial", ""], ["initial", ""], ["initial", ""], ["Lovely", ""]], glosses: ["", "", "", ""], keys: [4, 3, 99, "x"], glossAuto: [false, true, true, true] });
  assert.deepEqual(k2.keys, [0, 0, 0, 0], "keys 恒为 0，存储里的 4 / 3 / 99 / 非数字都不读");
  assert.deepEqual(k2.glossAuto, [false, true, true, true], "自带的 glossAuto 原样");
  assert.deepEqual(C.migrateDraft({ v: 2, word: "IA", picks: [["Lovely", ""], ["apple", ""]] }).keys, [0, 0], "不合法词的 keys 也是 0（朱红由版式按词首判断，不合法为 -1）");
  assert.deepEqual(C.migrateDraft({ v: 2, word: "IA", picks: [["Lovely", ""], null] }).picks[0], ["Lovely", ""], "不合法词不丢");
  // 数组按单词长度对齐
  const short = C.migrateDraft({ v: 2, word: "LIFE", picks: [["life", ""]], glosses: ["a"], captions: [], glossAuto: [true] });
  assert.equal(short.picks.length, 4); assert.equal(short.glosses.length, 4); assert.equal(short.captions.length, 4); assert.equal(short.keys.length, 4); assert.equal(short.glossAuto.length, 4);
  assert.deepEqual(short.picks.slice(1), [null, null, null]);
  assert.equal(C.migrateDraft({ v: 2, word: "AB", picks: [["a", ""], ["b", ""], ["c", ""]] }).picks.length, 2);
  assert.equal(C.migrateDraft({ v: 2, word: "li fe1" }).word, "LIFE1", "单词经 normalizeWord（T41 起数字保留）");
  assert.equal(C.migrateDraft({ v: 2, word: "" }).word, "", "没有单词的草稿合法（恢复后处于 first 模式）");
  assert.equal(C.migrateDraft({ v: 2, word: "AB", view: "weird" }).view, "single");
  // v00.03.01 批 B 复审：输入框限 16（2026-11-17 起），恢复时原来截到 12，13～16 字的填表人刷新后丢尾巴
  assert.equal(C.migrateDraft({ v: 2, word: "AB", filler: "一二三四五六七八九十甲乙丙丁戊己" }).filler, "一二三四五六七八九十甲乙丙丁戊己", "填表人 16 字恢复后不丢");
  assert.equal(C.migrateDraft({ v: 2, word: "AB", filler: "一二三四五六七八九十甲乙丙丁戊己庚" }).filler, "一二三四五六七八九十甲乙丙丁戊己", "超过 16 的旧稿截到 16");
  assert.equal(C.migrateDraft({ v: 2, word: "AB", filler: "一二三四五六七八九十甲乙丙丁戊😀" }).filler, "一二三四五六七八九十甲乙丙丁戊", "不从代理对中间切开");
  // 坏数据返回 null，不抛错
  for (const bad of [null, undefined, 0, 5, "LIFE", true, [], [1, 2], {}, { v: 2 }, { v: 2, word: 5 }, { v: 2, word: null }, { v: 2, picks: [["a", ""]] }]) assert.equal(C.migrateDraft(bad), null, `坏数据 ${JSON.stringify(bad)} 返回 null`);
  // 字段类型乱了也不抛错，能规整就规整
  const junk = C.migrateDraft({ v: 2, word: "AB", picks: "x", glosses: { 0: "a" }, captions: [1, null], keys: "no", glossAuto: [1, "x"], titleRuns: [null, 5, { t: 3 }, { t: "" }, { t: "好", c: 7 }], filler: 12, view: 9, t: "now" });
  assert.deepEqual(junk.picks, [null, null]);
  assert.deepEqual(junk.glosses, ["", ""]);
  assert.deepEqual(junk.captions, ["1", ""]);
  assert.deepEqual(junk.keys, [0, 0]);
  assert.deepEqual(junk.glossAuto, [true, true], "不是布尔就按释义推（空 = 自动）");
  assert.deepEqual(C.migrateDraft({ v: 2, word: "A", picks: [["a", ""]], glosses: ["我写的"], glossAuto: ["x"] }).glossAuto, [false], "不是布尔且释义非空 = 用户写的");
  assert.deepEqual(junk.titleRuns, [{ t: "好", c: null, b: false, i: false }]);
  assert.equal(junk.filler, "12"); assert.equal(junk.t, 0);
  // 释义不是字符串的词条（坏数据）不抛错
  assert.doesNotThrow(() => C.migrateDraft({ v: 2, word: "A", picks: [["a", 5]], glosses: ["x"] }));
}

// T18：笔记标题（D17）——留空用单词，否则用标题纯文字；最多 20 个字，按码点截
{
  assert.equal(C.noteTitle("", "LIFE"), "LIFE", "留空用单词");
  assert.equal(C.noteTitle("   ", "LIFE"), "LIFE", "只有空白也算留空");
  assert.equal(C.noteTitle(null, "LIFE"), "LIFE");
  assert.equal(C.noteTitle("我的角色", "LIFE"), "我的角色");
  assert.equal(C.noteTitle("  总之  这里 有  ", "LIFE"), "总之 这里 有", "空白折成一个并去首尾");
  assert.equal(C.noteTitle("一二三四五六七八九十一二三四五六七八九十甲", "LIFE"), "一二三四五六七八九十一二三四五六七八九十", "超过 20 字截到 20");
  assert.equal(C.noteTitle("一二三四五六七八九十一二三四五六七八九十", "LIFE").length, 20, "正好 20 字不截");
  const emoji = C.noteTitle("😀".repeat(25), "LIFE");
  assert.equal(Array.from(emoji).length, 20); assert.equal(emoji, "😀".repeat(20), "emoji 不被劈成两半");
  assert.equal(C.noteTitle("", ""), "", "没有单词也不抛错");
  assert.equal(C.titleOrWord("", "LIFE"), "LIFE", "导出图描述同一条规则：留空用单词");
  assert.equal(C.titleOrWord(" \n ", "LIFE"), "LIFE");
  assert.equal(C.titleOrWord("  总之  这里 ", "LIFE"), "总之 这里");
  assert.equal(C.titleOrWord("一二三四五六七八九十一二三四五六七八九十甲乙", "LIFE").length, 22, "描述不截断，只有笔记标题截 20");
}

// T12：A–Z / 大小写判断只在 core.js 的 RULES 里（日语只需再加一套规则）；其余代码一律经 CORE.LANG
{
  const src = fs.readFileSync(new URL("../app/assets/core.js", import.meta.url), "utf8");
  const start = src.indexOf("  var RULES = {"), end = src.indexOf("  var LANG = RULES.en;");
  assert.ok(start > 0 && end > start, "RULES 块存在");
  const outside = src.slice(0, start) + src.slice(end);
  assert.doesNotMatch(outside, /toLowerCase|toUpperCase|\[\^?A-Z|\[A-Za-z/, "core.js 的 RULES 之外不再写死字母规则");
  const app = appSource.replace(/r\.c\.toLowerCase\(\) !== "#ffffff"/, "");
  assert.doesNotMatch(app, /toLowerCase|toUpperCase|\[\^?A-Z|\[A-Za-z/, "app.js 不写死字母规则（颜色值比较除外）");
  const L = C.LANG;
  assert.equal(L.letters("ｌｉｆｅ 1 life!"), "1LIFE", "全角不算 A–Z；半角数字保留（T41）"); assert.equal(L.fold("LoVe"), "love");
  assert.equal(L.bare("Rock-n'Roll"), "rocknroll"); assert.equal(L.display("love"), "Love");
  assert.ok(L.wordChar.test("-") && L.wordChar.test("爱") && L.wordChar.test("1") && !L.wordChar.test("!")); assert.ok(L.customWord.test("rock 'n' roll") && L.customWord.test("1st") && !L.customWord.test("-st")); // T41：数字可打
}

// T18：入场界面的预设单词（闸口 A · A1）：60 个互不相同；随机抽取可注入；抽满 60 个也不重复、全覆盖
{
  assert.equal(C.PRESETS.length, 60); assert.equal(new Set(C.PRESETS).size, 60);
  assert.ok(C.PRESETS.every((w) => !C.blocked(w) && /^[a-z]+$/.test(w)), "都放行、只含字母");
  assert.deepEqual(C.pickPresets(6, () => 0), ["TIME", "LIFE", "CHILD", "WORLD", "FAMILY", "NIGHT"], "随机数可注入，转格字母写法");
  assert.equal(C.pickPresets(6, () => 0.9999)[0], "FATE", "真的在池里随机取（不是总取前几个）");
  const all = C.pickPresets(60, () => 0.5);
  assert.equal(new Set(all).size, 60, "不重复"); assert.deepEqual([...all].sort(), C.PRESETS.map((w) => w.toUpperCase()).sort(), "全覆盖");
}

console.log("core ok");

// Unicode 边界：字距、两行折行、截断不得制造孤立代理项。
const unicodeMeasure = (_, text) => Array.from(text).length * 10;
assert.equal(C.trackedWidth(unicodeMeasure, "", "A😀B", -1), 28);
assert.equal(C.charX(unicodeMeasure, "", "A😀B", 2, -1), 18);
for (const width of [15, 25, 35]) {
  const fit = C.fitTitle(unicodeMeasure, [{ t: "😀😀😀😀😀", b: true }], width);
  for (const line of fit.lines) for (const run of line) {
    assert.ok(Array.from(run.t).every(ch => ch.length === 2 || !/[\uD800-\uDFFF]/.test(ch)), "折行与省略不拆 emoji");
  }
}
assert.deepEqual(C.keepSame(["A", "B", "C"], ["A", "B", "C"], [false, 0, ""], null), [false, 0, ""]);
assert.deepEqual(C.keepSame(["A"], ["A", "B"], [], true), [true, true]);

assert.deepEqual(C.textUnits("A😀👍🏽👨‍👩‍👧‍👦🇨🇦e\u0301B"), ["A", "😀", "👍🏽", "👨‍👩‍👧‍👦", "🇨🇦", "e\u0301", "B"]);

// QA 第 2 批：词干恰好是 Object.prototype 名字（constructor）时，词族表不能读到原型上的函数
{
  const item = (w, g) => [w, g], nm = l => l.map(x => x[0]);
  const PW = { c: [item("constructor", "n.构造者"), item("constructors", "n.构造者"), item("constructorly", "adv.构造地"), item("cat", "n.猫")] };
  const r = C.candidates(PW, "c", "c");
  assert.deepEqual(nm(r), ["constructor", "constructors", "cat", "constructorly"], "constructor 一族首轮封顶 2 个、副词补回；词族表不读到原型上的函数");
}

// T21a：独立参考值、对称性、同色，以及阈值两侧。
assert.equal(C.contrastRatio("#000000", "#ffffff"), 21);
assert.equal(C.contrastRatio("#e9e8e4", "#e9e8e4"), 1);
assert.ok(Math.abs(C.contrastRatio("#d9c27a", C.PALETTE.light.bg) - 1.4335066501364817) < 1e-10);
assert.equal(C.contrastRatio("#123456", "#abcdef"), C.contrastRatio("#abcdef", "#123456"));
assert.ok(C.contrastRatio("#949494", "#ffffff") > 3);
assert.ok(C.contrastRatio("#959595", "#ffffff") < 3);
for (const p of [C.PALETTE.light, C.PALETTE.dark]) {
  assert.ok(C.contrastRatio(p.ink, p.bg) > 3);
  assert.ok(C.contrastRatio(p.red, p.bg) > 3);
}

// ---------- v00.03.00 T22 / T28：冠词块、冠词二选一、长词折行 ----------
{
  // 冠词：单一原样；二选一没选写全并标 pending，选了只写选中的；不在选项里的旧选择不算
  assert.deepEqual(plainOf(C.articleOf(["libro", "书", "el"], "")), { text: "el", pending: false, options: ["el"] });
  assert.deepEqual(plainOf(C.articleOf(["artista", "艺术家", "el / la"], "")), { text: "el / la", pending: true, options: ["el", "la"] });
  assert.deepEqual(plainOf(C.articleOf(["artista", "艺术家", "el / la"], "la")), { text: "la", pending: false, options: ["el", "la"] });
  assert.equal(C.articleOf(["artista", "", "el / la"], "le").pending, true, "不在选项里的选择不算");
  assert.deepEqual(plainOf(C.articleOf(["run", "跑"], "")), { text: "", pending: false, options: [] }, "没有冠词");
  // V003-B4-R7：冠词只属于名词义项。pos = 选中义项的词性；没记时词条只有一种词性就按那一种，有几种就不确定——不套整词的冠词
  const JEUNE = ["jeune", "adj.年轻的，年少的|n.年轻人，青年", "le / la", ""];
  assert.deepEqual(plainOf(C.articleOf(JEUNE, "", "adj.")), { text: "", pending: false, options: [] }, "形容词义项：没有冠词、不用选");
  assert.deepEqual(plainOf(C.articleOf(JEUNE, "", "n.")), { text: "le / la", pending: true, options: ["le", "la"] }, "名词义项：二选一");
  assert.equal(C.articleOf(JEUNE, "la", "n.").text, "la"); assert.equal(C.articleOf(JEUNE, "la", "adj.").text, "", "选过冠词再换成形容词义项：不显示");
  assert.deepEqual(plainOf(C.articleOf(JEUNE, "", "")), { text: "", pending: false, options: [] }, "混合词性又没记选的是哪个：不确定，不套冠词、不拦");
  assert.equal(C.articleOf(["artista", "n.艺术家", "el / la"], "", "").pending, true, "只有名词一种词性：没记也按名词");
  assert.equal(C.articleOf(["artista", "n.艺术家", "el / la"], "", "v.").pending, true, "记的词性不在词条里：按词条唯一的词性");
  assert.deepEqual([C.sensePos(JEUNE, "n."), C.sensePos(JEUNE, "x."), C.sensePos(["a", "n.甲"], ""), C.sensePos(["a", ""], "")], ["n.", null, "n.", ""]);
  assert.deepEqual(plainOf(C.migrateDraft({ v: 2, word: "AB", poss: ["n.", 1] }).poss), ["n.", ""], "草稿 poss：可选字段，按格数规整");
  assert.equal("poss" in C.migrateDraft({ v: 2, word: "AB" }), false);
  // 同形、性别不同的名词：冠词列按名词组的顺序用 | 对齐，选中哪一组义项就取哪一个（le livre 书 / la livre 磅）
  const LIVRE = ["livre", "n.书，书籍|n.磅，镑", "le|la", ""];
  assert.deepEqual(plainOf(C.senseGroups(LIVRE)), [{ pos: "n.", senses: ["书", "书籍"] }, { pos: "n.", senses: ["磅", "镑"], id: "n.#2" }], "第二组名词带序号 id");
  assert.equal(C.defaultSense(LIVRE), "n.");
  assert.equal(C.articleOf(LIVRE, "", "n.").text, "le", "第一组名词义项");
  assert.deepEqual(plainOf(C.articleOf(LIVRE, "", "n.#2")), { text: "la", pending: false, options: ["la"] }, "第二组名词义项带出自己的冠词，不用选");
  assert.equal(C.articleOf(LIVRE, "", "").text, "", "没记选的是哪一组：不确定，不套冠词");
  assert.deepEqual(plainOf(C.articleOptions(LIVRE)), ["le", "la"], "不给义项：这个词所有可能的冠词");
  const POLI = ["politique", "adj.政治的|n.政治，政策|n.政治家", "la|le / la", ""];
  assert.equal(C.articleOf(POLI, "", "adj.").text, "", "形容词义项没有冠词");
  assert.equal(C.articleOf(POLI, "", "n.").text, "la");
  assert.deepEqual(plainOf(C.articleOf(POLI, "", "n.#2")), { text: "le / la", pending: true, options: ["le", "la"] }, "第二组名词是两性通用：仍要二选一");
  assert.equal(C.articleOf(["jeune", "adj.年轻的|n.年轻人", "le / la"], "", "n.").pending, true, "只有一个冠词时名词组共用它（原有数据不变）");
  // 复审 R3-19：「el (la)」= 通用语推荐 el、不用选；la 在同一义项上也合规（la mar），可选，旧稿选过的保留
  const MAR = ["mar", "n.海", "el (la)", ""];
  assert.deepEqual(plainOf(C.articleOf(MAR, "", "n.")), { text: "el", pending: false, options: ["el", "la"], recommended: "el" }, "有推荐冠词：没选就用推荐的，不拦");
  assert.deepEqual(plainOf(C.articleOf(MAR, "la", "n.")), { text: "la", pending: false, options: ["el", "la"], recommended: "el" }, "选过 la：保留");
  assert.equal(C.articleOf(MAR, "le", "n.").text, "el", "不在选项里的选择：回到推荐的");
  assert.deepEqual(plainOf(C.articleOptions(MAR)), ["el", "la"], "旧稿的 la 仍在这个词的可用冠词里，恢复时不丢");
  assert.deepEqual(plainOf(C.articleOptions(["médico", "n.医生", "el", ""])), ["el"], "裁定单性又没列另一冠词的：la 不在可用冠词里（la médico 照旧拦）");
  assert.deepEqual(plainOf(C.articleOf(["x", "adj.甲|n.乙|n.丙", "el (la)|le"], "", "n.#2")), { text: "le", pending: false, options: ["le"] }, "推荐写法与 | 分组共存：第二组取自己的冠词");
  // V003-B4-R9：西文把「字母 + 组合变音符」合成一个字再过滤、计数；v00.03.01 R07 起英语同样
  C.addLang("zz", { wordMax: 28, wordChar: /[A-Za-z\u00c0-\u024f0-9' \-]/ }); C.useLang("zz");
  assert.deepEqual(plainOf(C.rewriteWord("e\u0301cole")), { value: "\u00c9cole", start: 5, end: 5 }, "分解编码的 école 不丢重音");
  assert.equal(C.rewriteWord("\u00e9cole").value, C.rewriteWord("e\u0301cole").value, "两种编码得到同一个词");
  assert.equal(C.rewriteWord("e\u0301".repeat(28)).value.length, 28, "28 个分解编码的字都进得来");
  assert.equal(C.rewriteWord("e\u0301".repeat(28)).over, undefined);
  assert.deepEqual([C.rewriteWord("e\u0301".repeat(29)).value.length, C.rewriteWord("e\u0301".repeat(29)).over], [28, true], "第 29 个不收，并标出超限");
  assert.deepEqual(plainOf(C.rewriteWord("ae\u0301b", 2, 2)), { value: "A\u00e9b", start: 2, end: 2 }, "光标落在一组中间：算在它后面");
  assert.deepEqual(plainOf(C.rewriteWord("ae\u0301b", 3, 3)), { value: "A\u00e9b", start: 2, end: 2 }, "光标在这一组之后：对应合成后的位置");
  C.useLang("en");
  // v00.03.01 R07（用户 11-18 定：输入框兼容重音符，照原样保留拼写）：英语也收带变音符的字母，两种编码同一个词
  assert.equal(C.rewriteWord("e\u0301cole").value, "\u00c9cole", "英语：分解编码的 école 不丢重音");
  assert.equal(C.rewriteWord("\u00eatre").value, "\u00catre", "英语：être 照原样");
  assert.equal(C.normalizeWord("Émail"), "\u00c9MAIL", "英语：主单词里的带变音符字母自成一格");
  assert.equal(C.containsLetter("\u00e9cole", "E") && C.containsLetter("ecole", "\u00c9"), true, "英语：比对去变音符");
  assert.equal(C.normalizeWord("Hello2026"), "HELLO2026", "纯 A–Z 与数字：结果不变");
  { // R3-12：前缀候选也保留输入里已有的音符（farò 不列 faro，publicó 不列 público）；没打音符的输入照旧去音符比
    const list = [["faro", "n.灯塔"], ["far\u00f2", "v.做"], ["p\u00fablico", "adj.公众"], ["publico", "v.出版"], ["\u00e9tage", "n.楼"], ["eau", "n.水"]];
    const hit = (q) => C.filterTiers(list, q).flat().map((it) => it[0]);
    assert.deepEqual(hit("faro"), ["faro", "far\u00f2"], "没打音符：照旧，带音符的也列");
    assert.deepEqual(hit("far\u00f2"), ["far\u00f2"], "打了 ò：不再列 faro");
    assert.deepEqual(hit("public\u00f3"), [], "打了 ó：既不是 público 也不是 publico");
    assert.deepEqual(hit("publico"), ["p\u00fablico", "publico"]);
    assert.deepEqual(hit("e"), ["\u00e9tage", "eau"]); assert.deepEqual(hit("\u00e9"), ["\u00e9tage"]); assert.deepEqual(hit("\u00c9TAG"), ["\u00e9tage"], "大写、分解编码都认");
    assert.deepEqual(hit("E\u0301tag"), ["\u00e9tage"]);
  }
  assert.equal(C.rewriteWord("a".repeat(30)).value.length, 28, "英语上限 28（v00.03.01 E2）");

  const W = C.CARD.WORD, f56 = C.fontOf(700, 56);
  // 折行：空格处折不加连字符；断词点处行尾加连字符；原有连字符之后可折；都没有才在字母间断（两边至少 3 个字）
  assert.deepEqual(plainOf(C.wrapWord(fm, f56, "aaaa bbbb cccc", 9.5 * 0.55 * 56, 0, null, 3)), ["aaaa bbbb", "cccc"], "空格处折，空格不留");
  assert.deepEqual(plainOf(C.wrapWord(fm, f56, "abcdefghij", 6.5 * 0.55 * 56, 0, [3, 5, 8], 3)), ["abcde-", "fghij"], "取放得下的最后一个断词点，连字符算进行宽");
  assert.deepEqual(plainOf(C.wrapWord(fm, f56, "abc-defghi", 6.5 * 0.55 * 56, 0, null, 3)), ["abc-", "defghi"], "原有连字符之后折，不再加");
  assert.deepEqual(plainOf(C.wrapWord(fm, f56, "abcdefghij", 6.5 * 0.55 * 56, 0, null, 3)), ["abcde-", "fghij"], "没有断词点：字母间断");
  assert.equal(C.wrapWord(fm, f56, "a".repeat(40), 6.5 * 0.55 * 56, 0, null, 3).length, 3, "最多三行");
  assert.equal(C.wrapWord(fm, f56, "abcdefghij", 6.5 * 0.55 * 56, 0, [5], 3).join("").replace(/-/g, ""), "abcdefghij", "显示用的连字符不改词本身");

  // 词块：没有冠词时与原来的缩字号一致；有冠词时冠词比词小 10、块宽按 der / die / das 最宽的量，词从同一条竖线起排
  const b0 = C.wordBlock(fm, "Hi", "", W, 920, null);
  assert.deepEqual([b0.size, b0.col, plainOf(b0.lines)], [120, 0, ["Hi"]]);
  assert.equal(C.wordBlock(fm, "Ab".repeat(10), "", W, 920, null).size, C.fitWord(fm, "Ab".repeat(10), 120, 56, 920, -2), "无冠词：字号与 fitWord 相同");
  const bd = C.wordBlock(fm, "Haus", "das", W, 920, null), bl = C.wordBlock(fm, "Libro", "el", W, 920, null);
  assert.deepEqual([bd.size, bd.artSize], [120, 110], "冠词比词小 10");
  assert.equal(bd.col, bl.col, "el 比 das 窄：两个词从同一条竖线起排");
  assert.ok(C.wordBlock(fm, "Artista", "el / la", W, 920, null).col > bd.col, "比 das 宽的冠词把词往右顶");
  assert.equal(C.wordBlock(fm, "École", "l’", W, 920, null).col, fm(C.fontOf(400, 110), "l’"), "省音冠词紧贴词");
  const long = C.wordBlock(fm, "W".repeat(40), "die", W, 920, null);
  assert.deepEqual([long.size, long.artSize], [56, 46], "缩到下限，冠词跟着缩");
  assert.ok(long.lines.length > 1 && long.lines.length <= 3, "下限仍放不下：折行");

  // 单图：冠词框与词共用基线、mute、不加粗；折行后墨条、释义、配文下移，图版不动；不超出画布、互不重叠
  const one = (L, role) => L.boxes.filter((b) => b.role === role);
  const data = (word, article, over) => ldata(1, true, Object.assign({ letters: ["W"], picks: [[word, "", article]], glosses: ["释义"], captions: ["配文"], articles: [article] }, over));
  const L1 = C.layoutCard(data("wasser", "das"), fm), a1 = one(L1, "article")[0], w1 = one(L1, "word")[0];
  assert.deepEqual([a1.text, a1.x, a1.baseline, a1.weight, a1.color, a1.size], ["das", C.CARD.M, W.base, 400, "mute", 110]);
  assert.deepEqual([w1.x, w1.keyAt, w1.text], [C.CARD.M + C.wordBlock(fm, "Wasser", "das", W, 920, null).col, 0, "Wasser"], "词排在冠词块之后，关键字母仍是词首");
  assert.equal(one(C.layoutCard(data("wasser", ""), fm), "article").length, 0, "没有冠词不出框、不留位置");
  const L3 = C.layoutCard(data("w".repeat(40), "die"), fm), w3 = one(L3, "word"), n3 = w3.length;
  assert.ok(n3 > 1, "折行出多个 word 框");
  assert.deepEqual(w3.map((b) => b.baseline), w3.map((b, k) => W.base + k * W.lead), "各行按行距往下排");
  assert.ok(w3.every((b) => b.x === w3[0].x), "后面的行和第一行的词对齐，不从冠词左缘起");
  assert.deepEqual(w3.map((b) => b.keyAt), w3.map((b, k) => (k ? -1 : 0)), "只有第一行带关键字母");
  assert.deepEqual([one(L3, "bar")[0].y, one(L3, "gloss")[0].baseline, one(L3, "caption")[0].baseline], [C.CARD.BAR.y, C.CARD.GLOSS.base, C.CARD.CAPTION.base].map((v) => v + (n3 - 1) * W.lead), "词下面的元素整体下移");
  assert.deepEqual([one(L3, "plate")[0].y, one(L3, "plate")[0].h], [C.CARD.PLATE.y, C.CARD.PLATE.h], "图版位置与高度不动");
  checkLayout(L3, "单图折行"); checkLayout(L1, "单图冠词");
  // 列阵同一套；三行时仍在本行的格高之内
  const G3 = C.layoutGrid(Object.assign(data("w".repeat(28), "die"), { letters: ["W", "X"], picks: [["w".repeat(28), "", "die"], ["x".repeat(28), "", "das"]], glosses: ["释义", "释义"], captions: ["", ""], articles: ["die", "das"] }), fm);
  assert.ok(one(G3, "word").length > 2 && one(G3, "article").length === 2, "列阵：冠词与折行");
  checkLayout(G3, "列阵折行");
  // 英语场景（没有 articles / hyph）与原来逐框相同：由上面的既有断言与导出哈希保证，这里只确认不多出框
  assert.equal(one(C.layoutCard(ldata(4, true, { i: 1 }), fm), "article").length, 0);

  // 草稿：arts 是可选字段——旧稿没有就保持没有；有就按格数规整，非字符串当没选
  assert.equal("arts" in C.migrateDraft({ v: 2, word: "AB" }), false, "旧稿没有 arts：不补");
  assert.deepEqual(plainOf(C.migrateDraft({ v: 2, word: "AB", arts: ["la", 3, "x"] }).arts), ["la", ""], "按格数规整");
  assert.equal("arts" in C.migrateDraft({ v: 2, word: "AB", arts: "la" }), false, "不是数组：当没有");
}
console.log("core ok (article + wrap)");
