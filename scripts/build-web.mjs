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
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const MARK = ".backronym-web-build";
const MARK_TEXT = "由 scripts/build-web.mjs 生成；再次构建会整体替换本目录。\n";
const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const src = path.join(root, "app");
const at = process.argv.indexOf("--out");
if (at > 0 && !process.argv[at + 1]) fail("--out 后面要给一个目录");
const out = at > 0 ? path.resolve(process.argv[at + 1]) : path.join(root, "dist/web");
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
// 还不存在的路径：取最近一级已存在的上级的真实路径，再接上剩下的部分
function realOf(p) {
  let head = p;
  const rest = [];
  while (!fs.existsSync(head)) { rest.unshift(path.basename(head)); const up = path.dirname(head); if (up === head) break; head = up; }
  return path.join(fs.realpathSync(head), ...rest);
}
// 目录下全部文件的相对路径（递归，不跟进符号链接；遇到链接交给 onLink）
function listFiles(dir, onLink, base = "") {
  const out = [];
  for (const e of fs.readdirSync(path.join(dir, base), { withFileTypes: true })) {
    const rel = path.join(base, e.name);
    if (e.isSymbolicLink()) { if (onLink) onLink(rel); }
    else if (e.isDirectory()) out.push(...listFiles(dir, onLink, rel));
    else out.push(rel);
  }
  return out;
}
const within = (a, b) => a === b || a.startsWith(b + path.sep); // a 在 b 里（含相等）

function checkOut() {
  const realSrc = fs.realpathSync(src), realRoot = fs.realpathSync(root);
  if (fs.lstatSync(out, {throwIfNoEntry: false})?.isSymbolicLink()) fail(out + " 是符号链接");
  const real = realOf(out);
  if (within(real, realSrc)) fail(out + " 是源码 app/ 或在它里面");
  if (within(realSrc, real)) fail(out + " 是源码 app/ 的上级（含项目根）");
  if (within(realRoot, real)) fail(out + " 是项目根或它的上级");
  if (!fs.existsSync(out)) return;
  if (!fs.statSync(out).isDirectory()) fail(out + " 已存在且不是目录");
  const names = fs.readdirSync(out);
  if (!names.length) return;
  if (names.includes(MARK)) {
    const marker = path.join(out, MARK);
    if (fs.lstatSync(marker).isFile() && fs.readFileSync(marker, "utf8") === MARK_TEXT) return;
    fail(out + " 的构建标记无效，请检查目录内容");
  }
  if (at > 0) fail(out + " 已存在、不是空目录，也不是本构建器生成的；不删除，请换一个空目录或新路径");
  // 默认的 dist/web：兼容加标记之前构建的旧产物。逐个检查整棵树（B4-R1 复审）：每个文件在 app/ 里都有同路径的文件才认作旧产物
  // （内容可以不同——那是旧版本的构建）；里面有符号链接、或任何一个 app/ 里没有的文件（如 assets/author.txt），就无法证明是产物，拒绝、不删
  const known = new Set(listFiles(src));
  const unknown = [];
  listFiles(out, (rel) => unknown.push(rel + "（符号链接）")).forEach((rel) => { if (!known.has(rel)) unknown.push(rel); });
  if (unknown.length) fail(out + " 里有无法确认是构建产物的内容（" + unknown.slice(0, 5).join("、") + (unknown.length > 5 ? " 等" : "") + "），不删除；请自行处理后再构建");
}

assertBlocker(src, "app/（小红书版）");
assertLicenses(src, "app/");
checkOut();
fs.rmSync(out, { recursive: true, force: true });
fs.cpSync(src, out, { recursive: true, filter: (p) => !path.basename(p).startsWith(".") && path.basename(p) !== "_recovery" });
fs.writeFileSync(path.join(out, MARK), MARK_TEXT);
assertBlocker(out, "网页版");
assertLicenses(out, "网页版");
console.log("网页版 → " + path.relative(root, out) + "（含屏蔽器）");
