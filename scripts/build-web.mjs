// 外链网页版：复制 app/ 到 dist/web/。`npm run pack:web`
// T40（第七批批次 4）起网页版也启用屏蔽器，并断言两版都带着它（文件在、index.html 里加载）。v00.03.00 T02 起屏蔽器拆成
// 公共部分 assets/block/core.js 与英语词表 assets/lang/en/block.js，两个都要在。
// 可选参数 `--out <目录>`：输出到别处（开发侧核验用，不覆盖正式 dist）。
// B4-R1：删任何东西之前先核对输出目录——
//   · 不能是源码 app/ 本身、它里面的路径、它的上级（含项目根与更上层）；路径按真实路径比较（相对路径、符号链接别名都算进去）；
//   · 输出目录本身不能是符号链接；
//   · 已存在的目录只有这些情况可以覆盖：空目录、带本构建器标记文件（上次由这里构建）；
//     默认的 dist/web 另外兼容加标记之前的旧产物：整棵树里每个文件在 app/ 都有同路径文件、且没有符号链接。其余一律拒绝，不删、不覆盖。
// 构建完写标记文件，之后重建可识别。
// 站点图标（用户 2026-11-23 定）：取品牌定稿的 design/brand/icon-512.png，只进网页版——复制到输出目录并在输出的 index.html 里加两行 <link>；
// app/ 与小红书包都不动。源图不在（如只拿到 app/ 的场合）就不带图标，照常构建。
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { checkBuildOutput } from "./build-output.mjs";

const MARK = ".backronym-web-build";
const MARK_TEXT = "由 scripts/build-web.mjs 生成；再次构建会整体替换本目录。\n";
const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const src = path.join(root, "app");
const at = process.argv.indexOf("--out");
if (at > 0 && !process.argv[at + 1]) fail("--out 后面要给一个目录");
const out = at > 0 ? path.resolve(process.argv[at + 1]) : path.join(root, "dist/web");
const ICON_SRC = path.join(root, "design/brand/icon-512.png"), ICON = "icon-512.png";
const BLOCKERS = ["assets/block/core.js", "assets/lang/en/block.js"];
const tagOf = (f) => new RegExp("^\\s*<script src=\"\\./" + f.replace(/[./]/g, "\\$&") + "\"><\\/script>$", "m");

function fail(msg) { console.error("拒绝构建：" + msg); process.exit(1); }
function assertBlocker(dir, name) {
  const html = fs.readFileSync(path.join(dir, "index.html"), "utf8");
  for (const f of BLOCKERS) {
    if (!fs.existsSync(path.join(dir, f))) throw new Error(name + " 缺 " + f + "：屏蔽器两版都要有");
    if (!tagOf(f).test(html)) throw new Error(name + " 的 index.html 没加载 " + f);
  }
}
// 许可全文（T07）：app/ 与网页版里都要有这六份独立文件。小红书的 zip 不带（容器只许一个 html、不收 txt，打包时排除），全文在借物页里展开可读
const LICENSE_FILES = ["GPL-3.0", "CC-BY-SA-4.0", "CC-BY-SA-3.0", "CC-BY-4.0", "MIT", "OFL-1.1"].map((k) => "LICENSES/" + k + ".html");
function assertLicenses(dir, name) {
  for (const f of LICENSE_FILES) if (!fs.existsSync(path.join(dir, f)) || !fs.statSync(path.join(dir, f)).size) throw new Error(name + " 缺许可全文 " + f);
}
assertBlocker(src, "app/（小红书版）");
assertLicenses(src, "app/");
try {
  checkBuildOutput({ out, root, sources: [src], marker: MARK, markerText: MARK_TEXT, legacySource: at < 0 ? src : undefined });
} catch (error) {
  fail(error.message);
}
fs.rmSync(out, { recursive: true, force: true });
fs.cpSync(src, out, { recursive: true, filter: (p) => !path.basename(p).startsWith(".") && path.basename(p) !== "_recovery" });
fs.writeFileSync(path.join(out, MARK), MARK_TEXT);
if (fs.existsSync(ICON_SRC)) {
  const page = path.join(out, "index.html"), html = fs.readFileSync(page, "utf8");
  if (fs.existsSync(path.join(out, ICON))) fail("app/ 里已有 " + ICON + "，和站点图标重名");
  if (!html.includes("</head>")) fail("index.html 里没有 </head>，放不进站点图标");
  fs.copyFileSync(ICON_SRC, path.join(out, ICON));
  fs.writeFileSync(page, html.replace("</head>", '  <link rel="icon" type="image/png" href="./' + ICON + '">\n  <link rel="apple-touch-icon" href="./' + ICON + '">\n</head>'));
} else console.warn("没找到 design/brand/icon-512.png，网页版不带站点图标");
assertBlocker(out, "网页版");
assertLicenses(out, "网页版");
console.log("网页版 → " + path.relative(root, out) + "（含屏蔽器）");
