// 构建器共用的输出目录检查。调用方先检查，再写入或替换产物。
import fs from "node:fs";
import path from "node:path";

function realOf(p) {
  let head = p;
  const rest = [];
  while (!fs.existsSync(head)) {
    rest.unshift(path.basename(head));
    head = path.dirname(head);
  }
  return path.join(fs.realpathSync(head), ...rest);
}

function listFiles(dir, onLink, base = "") {
  const out = [];
  for (const entry of fs.readdirSync(path.join(dir, base), { withFileTypes: true })) {
    const rel = path.join(base, entry.name);
    if (entry.isSymbolicLink()) onLink?.(rel);
    else if (entry.isDirectory()) out.push(...listFiles(dir, onLink, rel));
    else out.push(rel);
  }
  return out;
}

const within = (a, b) => {
  const rel = path.relative(b, a);
  return rel === "" || (rel !== ".." && !rel.startsWith(".." + path.sep) && !path.isAbsolute(rel));
};

export function checkBuildOutput({ out, root, sources, marker, markerText, legacySource }) {
  if (fs.lstatSync(out, { throwIfNoEntry: false })?.isSymbolicLink()) throw new Error(out + " 是符号链接");
  const real = realOf(out);
  for (const source of sources) {
    const realSource = fs.realpathSync(source);
    const name = path.relative(root, source) + "/";
    if (within(real, realSource)) throw new Error(out + " 是源码 " + name + " 或在它里面");
    if (within(realSource, real)) throw new Error(out + " 是源码 " + name + " 的上级（含项目根）");
  }
  if (within(fs.realpathSync(root), real)) throw new Error(out + " 是项目根或它的上级");
  if (!fs.existsSync(out)) return;
  if (!fs.statSync(out).isDirectory()) throw new Error(out + " 已存在且不是目录");
  const names = fs.readdirSync(out);
  if (!names.length) return;
  if (names.includes(marker)) {
    const mark = path.join(out, marker);
    if (fs.lstatSync(mark).isFile() && fs.readFileSync(mark, "utf8") === markerText) return;
    throw new Error(out + " 的构建标记无效，请检查目录内容");
  }
  if (!legacySource) throw new Error(out + " 已存在、不是空目录，也不是本构建器生成的；不删除，请换一个空目录或新路径");
  // 默认网页版兼容标记加入前的产物：每个文件都须在 app/ 有同路径文件，且不能有符号链接。
  const known = new Set(listFiles(legacySource));
  const unknown = [];
  for (const rel of listFiles(out, rel => unknown.push(rel + "（符号链接）"))) {
    if (!known.has(rel)) unknown.push(rel);
  }
  if (unknown.length) {
    throw new Error(out + " 里有无法确认是构建产物的内容（" + unknown.slice(0, 5).join("、") + (unknown.length > 5 ? " 等" : "") + "），不删除；请自行处理后再构建");
  }
}
