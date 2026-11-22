// 测试按页面的真实加载清单读取应用模块，不另维护一份文件列表。
import fs from "node:fs";
import vm from "node:vm";
import { createRequire } from "node:module";

const page = new URL("../app/index.html", import.meta.url);
const html = fs.readFileSync(page, "utf8");
export const appSources = Array.from(html.matchAll(/<script src="(\.\/assets\/app(?:-[a-z]+)?\.js)"><\/script>/g), m => ({
  file: m[1], text: fs.readFileSync(new URL(m[1], page), "utf8"),
}));
if (!appSources.length || appSources[appSources.length - 1].file !== "./assets/app.js") throw new Error("应用模块必须先加载，app.js 最后启动");
// 界面文案表（v00.04.00 批 0）：应用函数里的 STR("编号") 经它取字。定点函数测试没自己给 STR 时补上真表
export const I18N = createRequire(import.meta.url)("../app/assets/i18n.js");
export const appSource = appSources.map(s => s.text).join("\n");
const modules = Array.from(appSource.matchAll(/app\.([a-z]+) = \{\};/g), m => m[1]);

// 定点函数测试仍注入原来的同一份替身；模块限定名直接指向替身，不改写函数源码。
export function attachModules(env) {
  env.app = Object.fromEntries(modules.map(name => [name, env]));
  return env;
}

export function loadAppFunctions(names, env) {
  // 语言多选（2026-11-12）：应用函数经这些接口逐门语言取数据、记每格的词来自哪门。测试段没自己提供时，补上「只有当前这一门语言」的默认替身
  const one = () => (env.state && env.state.lang) || "en";
  if (env.state && !env.state.langs) env.state.langs = [one()];
  if (env.state && !env.state.pickLangs) env.state.pickLangs = [];
  if (!("inLang" in env) && !names.includes("inLang")) env.inLang = (code, fn) => fn();
  if (!("tagLang" in env) && !names.includes("tagLang")) env.tagLang = x => x;
  if (!("itemLang" in env) && !names.includes("itemLang")) env.itemLang = () => "";
  if (!("lookupHit" in env) && !names.includes("lookupHit")) env.lookupHit = (w, prefer) => { const e = env.lookup ? env.lookup(w) : null; return e ? { entry: e, lang: prefer || one() } : null; };
  if (!("lookupAll" in env) && !names.includes("lookupAll")) env.lookupAll = w => { const e = env.lookup ? env.lookup(w) : null; return e ? [{ entry: e, lang: one() }] : []; };
  if (!("spellingFor" in env) && !names.includes("spellingFor")) env.spellingFor = (word, h) => h && h.entry[0].toLowerCase() === word.toLowerCase() ? h.entry[0] : word;
  if (!names.includes("langData") && !env.langData) env.langData = () => null;
  if (!names.includes("lexicon") && !env.lexicon) env.lexicon = () => null; // 复审 R3-13：lookupHit 汇总漏音符候选前先看有无新词库；替身段按旧式词包处理
  if (!names.includes("formStatus") && !env.formStatus) env.formStatus = () => "";
  if (!names.includes("retryForms") && !env.retryForms) env.retryForms = () => {};
  if (!("STR" in env)) env.STR = I18N.t;
  attachModules(env);
  vm.createContext(env);
  for (const name of names) {
    const pattern = new RegExp("(?:^|\\n)  (?:async )?function " + name + "\\(", "g");
    const matches = Array.from(appSource.matchAll(pattern));
    if (matches.length !== 1) throw new Error("函数须唯一：" + name);
    const start = matches[0].index + (matches[0][0].startsWith("\n") ? 1 : 0);
    let end = start, body;
    // 由 JS 解析器确认完整函数边界；支持单行函数、嵌套块、字符串和注释中的花括号。
    while ((end = appSource.indexOf("}", end)) !== -1) {
      end++;
      const candidate = appSource.slice(start, end);
      try { new vm.Script("(" + candidate + ")"); } catch (error) {
        if (error instanceof SyntaxError) continue;
        throw error;
      }
      body = candidate; break;
    }
    if (!body) throw new Error("函数不完整：" + name);
    vm.runInContext(body, env, { filename: "app-function:" + name });
  }
  return env;
}
