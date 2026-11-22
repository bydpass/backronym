#!/usr/bin/env node
// 界面文案表自检（v00.04.00 批 0）。`npm test`
// 管四件事：① 代码里写的编号都在表里，表里的编号都有人用；② 句子里的占位与代码给的值对得上；
// ③ index.html 留着的中文与表里逐字相同，页面上没有漏编号的中文；④ 脚本里不再有散落的中文界面字。
import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const root = new URL("../", import.meta.url);
const read = rel => fs.readFileSync(new URL(rel, root), "utf8");
const HAN = /[㐀-鿿]/;
const VOID = new Set(["meta", "link", "input", "br", "img", "hr", "source", "col", "area", "base", "embed", "track", "wbr"]);
const RAW = new Set(["script", "style", "svg"]); // 里面不找界面文字
const squash = s => s.replace(/\s+/g, " ").trim();
const decode = s => s.replace(/&(amp|lt|gt|quot|nbsp|#\d+|#x[0-9a-f]+);/gi, (m, k) => {
  k = k.toLowerCase();
  if (k === "amp") return "&"; if (k === "lt") return "<"; if (k === "gt") return ">"; if (k === "quot") return "\""; if (k === "nbsp") return " ";
  return String.fromCodePoint(k[1] === "x" ? parseInt(k.slice(2), 16) : parseInt(k.slice(1), 10));
});

// 把页面切成标签 / 文字 / 注释，搭出元素树。不引第三方解析器：页面是自己写的，结构规整，切不动就报错
export function parseHtml(html) {
  const tokens = [], re = /<!--[\s\S]*?-->|<!doctype[^>]*>|<\/?[a-zA-Z](?:"[^"]*"|'[^']*'|[^>"'])*>/gi;
  let at = 0, m;
  while ((m = re.exec(html))) {
    if (m.index > at) tokens.push({ kind: "text", src: html.slice(at, m.index) });
    tokens.push({ kind: m[0].startsWith("<!") ? "other" : "tag", src: m[0] });
    at = re.lastIndex;
  }
  if (at < html.length) tokens.push({ kind: "text", src: html.slice(at) });
  const top = { tag: "#root", attrs: {}, kids: [], parent: null, open: -1, close: tokens.length }, elements = [];
  let cur = top, raw = 0;
  tokens.forEach((t, i) => {
    if (t.kind === "text") { if (!raw) cur.kids.push({ text: t.src, token: i }); return; }
    if (t.kind !== "tag") return;
    const name = /^<\/?([a-zA-Z][a-zA-Z0-9]*)/.exec(t.src)[1].toLowerCase();
    if (t.src[1] === "/") {
      assert.equal(cur.tag, name, "标签没配对：</" + name + "> 遇到 <" + cur.tag + ">");
      if (RAW.has(name)) raw--;
      cur.close = i; cur = cur.parent; return;
    }
    const attrs = {};
    for (const a of t.src.matchAll(/\s([a-zA-Z_:][-a-zA-Z0-9_:.]*)(?:="([^"]*)"|='([^']*)')?/g)) attrs[a[1].toLowerCase()] = a[2] != null ? a[2] : a[3] != null ? a[3] : "";
    const el = { tag: name, attrs, kids: [], parent: cur, open: i, close: i };
    if (!raw) { cur.kids.push(el); elements.push(el); }
    if (VOID.has(name) || t.src.endsWith("/>")) return;
    if (RAW.has(name)) raw++;
    cur = el;
  });
  assert.equal(cur, top, "有标签没关：<" + cur.tag + ">");
  return { tokens, elements, top };
}
export const directTexts = el => el.kids.filter(k => "text" in k && k.text.trim());
export const innerHtml = (doc, el) => doc.tokens.slice(el.open + 1, el.close).map(t => t.src).join("");
const inside = (el, anc) => { for (let p = el.parent; p; p = p.parent) if (p === anc) return true; return false; };

// 页面里每一处带编号的文字：[{ id, how: "text" | "html" | "attr:名字", value }]；另给出漏编号的中文
export function htmlEntries(html) {
  const doc = parseHtml(html), out = [], missed = [], claimed = [];
  for (const el of doc.elements) {
    if (claimed.some(c => inside(el, c))) continue; // 整段编号的元素里面不再单独编
    const a = el.attrs, texts = directTexts(el);
    if ("data-i18n-skip" in a) { claimed.push(el); continue; } // 许可本体里的版权行，不算界面文字
    if ("data-i18n-html" in a) { out.push({ id: a["data-i18n-html"], how: "html", value: squash(innerHtml(doc, el)) }); claimed.push(el); }
    else if ("data-i18n" in a) {
      assert.equal(texts.length, 1, a["data-i18n"] + "：data-i18n 的元素里只能有一段直接的文字");
      out.push({ id: a["data-i18n"], how: "text", value: decode(squash(texts[0].text)) });
    } else for (const t of texts) if (HAN.test(t.text)) missed.push("<" + el.tag + (a.id ? "#" + a.id : "") + "> " + squash(t.text).slice(0, 30));
    const named = {};
    if (a["data-i18n-attrs"]) for (const pair of a["data-i18n-attrs"].split(";")) { const k = pair.indexOf(":"); named[pair.slice(0, k)] = pair.slice(k + 1); }
    for (const name in named) { assert.ok(name in a, named[name] + "：元素上没有属性 " + name); out.push({ id: named[name], how: "attr:" + name, value: decode(a[name]) }); }
    for (const name in a) if (!name.startsWith("data-i18n") && HAN.test(a[name]) && !(name in named)) missed.push("<" + el.tag + (a.id ? "#" + a.id : "") + "> " + name + "=" + a[name].slice(0, 30));
  }
  return { entries: out, missed, doc };
}

// 取出一段脚本里的字符串字面量（先去掉注释；正则里的引号当不了字符串开头的情形在本项目代码里没有出现）
function stripComments(src) {
  let out = "", i = 0, q = null;
  while (i < src.length) {
    const c = src[i], d = src[i + 1];
    if (q) { out += c; if (c === "\\") { out += d; i += 2; continue; } if (c === q) q = null; i++; continue; }
    if (c === "\"" || c === "'" || c === "`") { q = c; out += c; i++; continue; }
    if (c === "/" && d === "/") { while (i < src.length && src[i] !== "\n") i++; continue; }
    if (c === "/" && d === "*") { i = src.indexOf("*/", i + 2) + 2; continue; }
    out += c; i++;
  }
  return out;
}
const literals = src => Array.from(src.matchAll(/'((?:\\.|[^'\\\n])*)'|"((?:\\.|[^"\\\n])*)"|`((?:\\.|[^`\\])*)`/g), m => m[1] != null ? m[1] : m[2] != null ? m[2] : m[3]);
// 从 open（"(" 或 "{" 的位置）起按括号深度切出顶层的各段（逗号分隔），返回 [各段文字, 结束位置]
function splitTop(src, open) {
  const parts = []; let depth = 0, q = null, from = open + 1;
  for (let i = open; i < src.length; i++) {
    const c = src[i];
    if (q) { if (c === "\\") i++; else if (c === q) q = null; continue; }
    if (c === "\"" || c === "'" || c === "`") { q = c; continue; }
    if (c === "(" || c === "[" || c === "{") depth++;
    else if (c === ")" || c === "]" || c === "}") { depth--; if (!depth) { parts.push(src.slice(from, i)); return [parts, i]; } }
    else if (c === "," && depth === 1) { parts.push(src.slice(from, i)); from = i + 1; }
  }
  throw new Error("括号没配对");
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const I18N = createRequire(import.meta.url)("../app/assets/i18n.js"), ZH = I18N.tables.zh, ids = Object.keys(ZH);
  const holes = s => Array.from(s.matchAll(/\{([A-Za-z]+)\}/g), m => m[1]).sort();
  assert.ok(ids.length > 300, "文案表读到了");
  for (const id of ids) assert.ok(typeof ZH[id] === "string" && ZH[id] !== "", id + "：文案不为空");

  // t()：占位替换一遍、填进去的内容不再被当成占位、表里没有的编号原样返回
  assert.equal(I18N.t("core.cells", { n: 4 }), "4 格");
  assert.equal(I18N.t("ed.notStart", { word: "{s}", s: "A" }), "{s} 不是以 A 开头");
  assert.equal(I18N.t("no.such.id"), "no.such.id");
  assert.equal(I18N.t("core.or"), " 或 ", "带空格的文案原样返回");

  // ①② 脚本
  // 代码里拼出来的编号：core.js 按主题 id 拼出 "core.skin.<id>" 去取主题名。不按前缀放行（复审 I18N-A1：那样删掉或写错一条都拦不住），
  // 而是真的装上文案表与 core.js、读一次 CORE.SKINS，记下它实际要了哪些编号
  const DYNAMIC = ["core.skin."], asked = [];
  {
    const ctx = vm.createContext({ window: {} });
    vm.runInContext(read("app/assets/i18n.js"), ctx);
    const real = ctx.window.I18N.t;
    ctx.window.I18N.t = (id, params) => { asked.push(String(id)); return real(id, params); };
    vm.runInContext(read("app/assets/core.js"), ctx);
    const skins = Array.from(ctx.window.CORE.SKINS, x => Array.from(x));
    assert.ok(skins.length >= 5 && asked.length >= 4, "读到了主题名单，且主题名确实是向文案表要的");
    for (const id of asked) assert.ok(id in ZH, "core.js：主题名的编号 " + id + " 不在文案表里（设置页会把编号念出来）");
    for (const [id, name] of skins) assert.ok(name && !/^core\./.test(name), "主题 " + id + " 取到了名字");
  }
  const files = fs.readdirSync(new URL("app/assets/", root)).filter(n => /^(app(-[a-z]+)?|core|theme|lexicon-store)\.js$/.test(n));
  const used = new Set(); let calls = 0;
  for (const f of files) {
    const src = stripComments(read("app/assets/" + f));
    for (const m of src.matchAll(/\bSTR\(/g)) {
      if (/function\s+$/.test(src.slice(0, m.index))) continue; // STR 自己的定义
      const [args] = splitTop(src, m.index + 3), names = literals(args[0]).filter(x => x.includes(".")); // 编号都带点；第一段里不带点的字面量是条件里比较用的值
      calls++;
      for (const id of names) {
        if (DYNAMIC.includes(id)) { asked.filter(x => x.startsWith(id)).forEach(x => used.add(x)); continue; } // 只算实际要过的；表里多出来的同前缀编号会落进「没人用」
        assert.ok(id in ZH, f + "：编号 " + id + " 不在文案表里");
        used.add(id);
        const arg = (args[1] || "").trim();
        if (!arg) assert.deepEqual(holes(ZH[id]), [], f + "：" + id + " 有占位，调用时没给值");
        else if (arg[0] === "{") {
          const keys = splitTop(arg, 0)[0].map(p => p.trim().split(":")[0].trim()).filter(Boolean).sort();
          assert.deepEqual(keys, Array.from(new Set(holes(ZH[id]))), f + "：" + id + " 的占位与给的值对不上");
        }
      }
    }
    // ④ 不再有散落的中文界面字。留下的两个是量字体用的探针字，不是界面文字
    const left = literals(src).filter(s => HAN.test(s) && s !== "Aa字" && s !== "Hg字");
    assert.deepEqual(left, [], f + "：还有没进文案表的中文");
  }
  assert.ok(calls > 150, "找到了取文案的调用");
  // theme.js 的 LABEL 存的是编号，由 app.js 取字
  for (const id of literals(stripComments(read("app/assets/theme.js"))).filter(s => /^theme\./.test(s))) { assert.ok(id in ZH, "theme.js：" + id); used.add(id); }

  // ③ 页面
  const page = htmlEntries(read("app/index.html"));
  assert.deepEqual(page.missed, [], "index.html 里有没编号的中文");
  const seen = new Set();
  for (const e of page.entries) {
    assert.ok(/^h\./.test(e.id), e.id + "：页面里的编号以 h. 开头");
    assert.ok(!seen.has(e.id), e.id + "：页面里的编号不重复");
    seen.add(e.id); used.add(e.id);
    assert.equal(ZH[e.id], e.value, e.id + "：index.html 与文案表不一致");
  }
  assert.ok(page.entries.length > 150, "页面里的编号读到了");

  // ⑤ 英文一列（批 1）：编号与中文逐条对应，占位相同；整段带标签的条目标签也相同；单复数写法成对；英文里不混进中文（保留字体名那一条署名除外）
  const EN = I18N.tables.en, tags = s => (s.match(/<[^>]+>/g) || []).join("");
  assert.deepEqual(Object.keys(EN), ids, "英文一列的编号与顺序同中文");
  for (const id of ids) {
    assert.ok(typeof EN[id] === "string" && EN[id] !== "", id + "：英文不为空");
    assert.deepEqual(Array.from(new Set(holes(EN[id]))), Array.from(new Set(holes(ZH[id]))), id + "：英文的占位与中文不同");
    assert.equal(tags(EN[id]), tags(ZH[id]), id + "：英文里的标签与中文不同");
    assert.equal((EN[id].match(/\[\[/g) || []).length, (EN[id].match(/\[\[[^|\]]*\|[^\]]*\]\]/g) || []).length, id + "：单复数写成 [[一个时|其余]]");
    if (id !== "h.credits.td17") assert.ok(!HAN.test(EN[id]), id + "：英文里有中文");
  }
  assert.equal(I18N.lang(), "zh", "Node 里没有环境语言，用中文");
  {
    const mk = (language, stored) => { const ctx = vm.createContext({ window: { navigator: { language }, localStorage: { getItem: () => stored, setItem() {}, removeItem() {} } } }); vm.runInContext(read("app/assets/i18n.js"), ctx); return ctx.window.I18N; };
    assert.equal(mk("zh-CN", null).lang(), "zh"); assert.equal(mk("zh-Hant-TW", null).lang(), "zh"); assert.equal(mk("en-US", null).lang(), "en"); assert.equal(mk("fr-FR", null).lang(), "en", "中文以外的环境用英文");
    assert.equal(mk("", null).lang(), "zh", "读不到环境语言用中文"); assert.equal(mk("en-US", "zh").lang(), "zh", "设置页选的优先"); assert.equal(mk("zh-CN", "en").lang(), "en"); assert.equal(mk("zh-CN", "xx").pref(), "auto", "存坏了当没选");
    const E = mk("en-US", null);
    assert.equal(E.t("core.cells", { n: 1 }), "1 cell"); assert.equal(E.t("core.cells", { n: 4 }), "4 cells"); assert.equal(E.t("conf.title", { w: "LOVE", n: 1 }), "Changing to LOVE will clear this cell. This can't be undone.");
    assert.equal(E.t("pos.gendered", { gender: E.t("gender.m"), pos: E.t("pos.n") }), "masculine noun"); assert.equal(mk("zh-CN", null).t("pos.gendered", { gender: "阳性", pos: "名词" }), "阳性名词");
  }

  const unused = ids.filter(id => !used.has(id));
  assert.deepEqual(unused, [], "文案表里有没人用的编号");
  console.log("i18n ok: " + ids.length + " 条文案（脚本 " + (ids.length - seen.size) + "、页面 " + seen.size + "），" + calls + " 处调用，页面与表逐字一致");
}
