// 从 ECDICT (MIT, github.com/skywind3000/ECDICT) 生成内置词库 app/assets/lang/en/words.js
// 用法：先下载 ecdict.csv 到 scripts/.cache/，再 `npm run dict`
import fs from "node:fs";
import { excludedPos } from "./lexicon/scope.mjs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { brotliDecompressSync } from "node:zlib";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const SRC = path.join(root, "scripts/.cache/ecdict.csv");
// BACKRONYM_DICT_OUT：输出到别的目录（隔离核对用，不碰正式成品）
// T19（2026-11-11）：包内的英语词包改由 scripts/t19/build-packs.mjs 从已复审的新范围词库生成。
// 本脚本是旧管线，只保留作隔离核对；不带输出目录直接运行会覆盖正式词包，所以拒绝。
if (!process.env.BACKRONYM_DICT_OUT) throw new Error("旧管线不再写入正式词包：正式词包用 node scripts/t19/build-packs.mjs 生成；隔离核对请设 BACKRONYM_DICT_OUT=<目录>");
const OUT_DIR = process.env.BACKRONYM_DICT_OUT;
const OUT = path.join(OUT_DIR, "words.js");
const OUT_PHRASES = path.join(OUT_DIR, "phrases.js");
// 收录：考纲词（中考/高考/四六级/考研/托福/雅思）∪ 柯林斯星级词 ∪ 牛津 3000 ∪ 词频前 2 万，约 2.2 万词
// ponytail: 范围扩大后不雅词也多了，靠 屏蔽器（app/assets/block/core.js + lang/en/block.js）隐藏；再放宽到前 5 万词约翻倍体积（会超 2MB 建议值）
const TAGS = ["zk", "gk", "cet4", "cet6", "ky", "toefl", "ielts"];
const RANK_LIMIT = 20000;
// x 开头的考纲词只有 xerox，手动补几个；ECDICT 里其余高频 x 词多是罗马数字和人名
// 另外：ECDICT 收了但没有词频排名的网络常用词（按词频规则会被漏掉）
const EXTRA = new Set(["xenon", "xenophobia", "xenophobic", "xylophone",
  "selfie", "emoji", "meme", "blog", "vlog", "wifi", "lol"]);

// 一行 CSV → 字段数组（ECDICT 的换行已转义成字面量 \n，所以一行就是一条）
function parseLine(line) {
  const out = [];
  let cur = "", q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) {
      if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (c === '"') q = false;
      else cur += c;
    } else if (c === '"') q = true;
    else if (c === ",") { out.push(cur); cur = ""; }
    else cur += c;
  }
  out.push(cur);
  return out;
}

// 义项按词性分组：形容词优先，名词次之，其余按原顺序。每组最多 4 个，全词最多 10 个
const PER_POS = 4;
const MAX_SENSES = 10;
// ECDICT 的词性写法归一：a. → adj.，vt./vi. 合并成 v.，interj. → int.
const POS = { a: "adj.", adj: "adj.", n: "n.", v: "v.", vt: "v.", vi: "v.", adv: "adv.", prep: "prep.",
  conj: "conj.", pron: "pron.", int: "int.", interj: "int.", num: "num.", art: "art.", aux: "aux.", abbr: "abbr." };
const POS_RANK = { "adj.": 0, "n.": 1 };
const rankOf = (pos, verbFirst) => (pos[0] === "[" ? 10 : verbFirst && pos === "v." ? -1 : POS_RANK[pos] ?? 5);
// 主要当动词用的词（let/leave/take…）例外：动词义排第一。判定（任一成立）：
//   ECDICT 中文释义第一行是动词；英文释义里动词义项多于名词义项；或在下面的手工名单里（两种信号都漏掉的常见词）
const VERB_FIRST = new Set(["leave", "look"]);
function isVerbFirst(word, translation, definition) {
  if (VERB_FIRST.has(word)) return true;
  if (/^v[ti]?\.\s/i.test(translation)) return true;
  const lines = definition.split("\\n");
  const count = (re) => lines.filter((l) => re.test(l)).length;
  return count(/^v\.\s/) > count(/^n\.\s/);
}
// 虚词单独当“一种情况”读着别扭（L=Lot 可以，I=In 不行），排到候选末尾，搜索仍可找到
const STOP = new Set(("i me my mine myself we us our ours ourselves you your yours yourself yourselves " +
  "he him his himself she her hers herself it its itself they them their theirs themselves " +
  "who whom whose which what that this these those whoever anyone anybody anything someone somebody " +
  "a an the each every either neither any some such both several another " +
  "of at by for with about against between into through during before after above below to from " +
  "up down in out on off over under upon onto toward towards within without among across along " +
  "around behind beyond beside besides near via per since until till than as " +
  "and but if or nor because while although though unless whether so yet " +
  "am is are was were be been being have has had having do does did doing " +
  "can could will would shall should may might must also too etc").split(" "));
const FUNCTION_POS = /^(prep|conj|pron|art|aux)\./i;
// 义项里带 … 或括号的（在…期间、同样的人(或物)）读着别扭，排到后面
const awkwardSense = (s) => /[…(（]/.test(s);
// "a. 相似的, 同样的\nvt. 喜欢\nn. 爱好\n[计] 偶数" → [["adj.",[…]],["n.",[…]],["v.",[…]],["[计]",["偶数"]]]
// 同词性合并、跨词性去重；领域专有义项（[计][医][经]…）单独成组排在最后；跳过“xx的过去式”这类行和过长义项
// all = true：不按命名范围筛（短语的释义、判断一个词算不算「词汇」用）。
// 命名范围（SCOPE-R2）：功能词性的行在去重之前就跳过，所以 below 的副词「在下面」不会被同译文的介词行压掉；
// 只有功能词性、另带领域义项的词（concerning「prep. 关于 / [法] 关于」）整词不收，领域标签不当实义词性用。
function senses(translation, verbFirst, all) {
  const groups = new Map();
  const seen = new Set();
  let functionOnly = false, real = false;
  for (const line of translation.split("\\n")) {
    const m = line.match(/^([a-z]+)\.\s*(.*)$/i) || line.match(/^(\[[^\]]{1,4}\])\s*(.*)$/);
    const pos = m && (m[1][0] === "[" ? m[1] : POS[m[1].toLowerCase()]);
    if (!pos) continue;
    if (!all && excludedPos(pos)) { functionOnly = true; continue; }
    const list = groups.get(pos) || [];
    for (let s of m[2].split(/[,，;；]/)) {
      s = s.trim().replace(/\.\.\./g, "…");
      if (s.length > 10) s = s.replace(/（[^）]*）|\([^)]*\)/g, "").trim(); // “大声笑（Laugh Out Loud）”→“大声笑”
      if (s && s.length <= 10 && !seen.has(s)) { seen.add(s); list.push(s); }
    }
    if (list.length) { groups.set(pos, list); if (pos[0] !== "[") real = true; }
  }
  if (functionOnly && !real) return [];
  if (groups.has("adj.")) verbFirst = false; // 形容词优先仍然最高：clean/free/close 保持“干净的/自由的/靠近的”
  const sorted = [...groups.entries()]
    // 稳定排序：adj. → n. → 其余词性（原顺序）→ 领域义项；动词为主的词 v. 提到最前
    .sort((a, b) => rankOf(a[0], verbFirst) - rankOf(b[0], verbFirst))
    .map(([pos, list]) => [pos, list.filter((s) => !awkwardSense(s)).concat(list.filter(awkwardSense))]);
  // 名额分配：先保证每个词性至少 1 个（even 的副词“甚至”不会被挤掉），再按顺序补到每组 PER_POS 个
  const take = sorted.map(() => 1);
  let left = MAX_SENSES - sorted.length;
  for (let round = 1; round < PER_POS && left > 0; round++) {
    sorted.forEach(([, list], k) => { if (left > 0 && list.length > take[k]) { take[k]++; left--; } });
  }
  return sorted.map(([pos, list], k) => [pos, list.slice(0, take[k])]);
}

const rows = [];
const vocab = new Set(), scopedOut = []; // scopedOut：因命名范围不作独立候选的词（纯功能词）
const lines = fs.readFileSync(SRC, "utf8").split("\n").slice(1);
for (const line of lines) {
  if (!line) continue;
  const [word, , definition, translation, , collins, oxford, tag, bnc, frq] = parseLine(line);
  if (!/^[a-z]{2,14}$/.test(word)) continue; // 去掉专有名词、词组、缩写
  const rank = Math.min(Number(frq) || 1e9, Number(bnc) || 1e9);
  const keep = (tag && tag.split(" ").some((t) => TAGS.includes(t))) || Number(collins) > 0 ||
    oxford === "1" || rank <= RANK_LIMIT || EXTRA.has(word);
  if (!keep) continue;
  const verbFirst = isVerbFirst(word, translation || "", definition || "");
  if (senses(translation || "", verbFirst, true).length) vocab.add(word); // 词汇：含功能词（for / with / the），只用来认短语的组成词（SCOPE-R1）
  const groups = senses(translation || "", verbFirst);
  if (!groups.length) {
    if (vocab.has(word)) scopedOut.push({ word, domain: senses(translation || "", verbFirst, true).filter(([pos]) => pos[0] === "[").map(([pos, list]) => pos + list.join("，")).join("|") });
    continue;
  }
  const demote = STOP.has(word) || FUNCTION_POS.test(translation);
  rows.push({ word, groups, demote, rank: Number(frq) || Number(bnc) || 1e9 });
}
rows.sort((a, b) => a.demote - b.demote || a.rank - b.rank);

// 每条：[词, "adj.相似的，同样的|n.爱好|v.喜欢，愿意"]（词性组用 | 分隔，组内义项用全角逗号）
const words = {};
for (const r of rows) {
  const entry = [r.word, r.groups.map(([pos, list]) => pos + list.join("，")).join("|"), "", ""];
  (words[r.word[0]] = words[r.word[0]] || []).push(entry);
}

// 自检：26 个字母都有词，且每个词的首字母和分组一致
for (const letter of "abcdefghijklmnopqrstuvwxyz") {
  if (!words[letter] || !words[letter].length) throw new Error(`字母 ${letter} 没有词`);
  for (const [w] of words[letter]) if (w[0] !== letter) throw new Error(`${w} 分组错误`);
}

// MIT 要求随“实质部分”附上原版权与许可声明，所以写进产物文件头
const ECDICT_NOTICE = `ECDICT https://github.com/skywind3000/ECDICT
MIT License. Copyright (c) 2025 Linwei

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and
associated documentation files (the "Software"), to deal in the Software without restriction, including
without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the
following conditions: The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.
THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT
LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO
EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER
IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR
THE USE OR OTHER DEALINGS IN THE SOFTWARE.`;
// ---------- T42（第七批批次 6 / U20）：长词的标准排版断词点 → 与词库同文件的 window.HYPH ----------
// 只给词库里 11～14 个字母的词算（超过 10 格才分图）；用 TeX 的 en-US 连字符模式（Knuth–Liang 算法），模式文件只在本地缓存里、不进包。
// 结果：{ 词: [可断开的位置（前一段的字母数）, …] }，应用的 CORE.autoSplit 把它当第 3 档。模式文件缺失时整段跳过（第 3 档不生效）
const HYPH_DIR = path.join(root, "scripts/.cache/hyph");
let HYPH_NOTICE = "", hyphText = "{}";
if (fs.existsSync(path.join(HYPH_DIR, "hyph-en-us.pat.txt"))) {
  const tree = new Map(); // 模式：字母串 → 各位置的数值
  for (const pat of fs.readFileSync(path.join(HYPH_DIR, "hyph-en-us.pat.txt"), "utf8").split(/\s+/).filter(Boolean)) {
    const letters = pat.replace(/[0-9]/g, ""), vals = new Array(letters.length + 1).fill(0);
    let k = 0;
    for (const ch of pat) { if (/[0-9]/.test(ch)) vals[k] = Number(ch); else k++; }
    tree.set(letters, vals);
  }
  const exceptions = new Map();
  for (const e of fs.readFileSync(path.join(HYPH_DIR, "hyph-en-us.hyp.txt"), "utf8").split(/\s+/).filter(Boolean)) {
    const pts = []; let len = 0;
    for (const part of e.split("-")) { len += part.length; pts.push(len); }
    pts.pop(); exceptions.set(e.replace(/-/g, ""), pts);
  }
  const LEFT = 2, RIGHT = 3; // en-US 的 lefthyphenmin / righthyphenmin（hyph-en-us.tex 文件头）
  const hyphenate = (word) => {
    if (exceptions.has(word)) return exceptions.get(word);
    const w = "." + word + ".", vals = new Array(w.length + 1).fill(0);
    for (let i = 0; i < w.length; i++) for (let j = i + 1; j <= w.length; j++) {
      const v = tree.get(w.slice(i, j));
      if (v) v.forEach((x, k) => { if (x > vals[i + k]) vals[i + k] = x; });
    }
    const out = [];
    for (let c = LEFT; c <= word.length - RIGHT; c++) if (vals[c + 1] % 2) out.push(c); // w 前面多了一个「.」
    return out;
  };
  const hyph = {};
  for (const list of Object.values(words)) for (const [w] of list) if (w.length > 10) hyph[w] = hyphenate(w);
  hyphText = JSON.stringify(hyph);
  const tex = fs.readFileSync(path.join(HYPH_DIR, "hyph-en-us.tex"), "utf8").split("\n");
  const from = tex.findIndex((l) => /copyright:/.test(l)), lic = tex.findIndex((l) => /are preserved/.test(l)) - 5; // 版权行到许可正文最后一句
  HYPH_NOTICE = "\n\n长词的排版断词点（window.HYPH）由 TeX hyph-en-us 连字符模式算出（hyph-utf8，github.com/hyphenation/tex-hyphen）：\n" +
    tex.slice(from, lic + 6).map((l) => l.replace(/^%\s?/, "")).join("\n");
  console.log(`排版断词点：${Object.keys(hyph).length} 个长词`);
}
const js = "/* 词库由 scripts/build-dict.mjs 从 ECDICT 生成，勿手改。\n\n" + ECDICT_NOTICE + HYPH_NOTICE + "\n*/\nwindow.WORDS=" + JSON.stringify(words) + ";\nwindow.HYPH=" + hyphText + ";\n";
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, js);
console.log(`${rows.length} 词，${(Buffer.byteLength(js) / 1024).toFixed(0)} KiB → ${path.relative(root, OUT)}`);
console.log(`命名范围：${scopedOut.length} 个纯功能词不作独立候选（${scopedOut.slice(0, 12).map((x) => x.word).join(" ")} …）`);
// 这些词除功能词性外只剩领域义项，一并不收；列出来供人工裁定（SCOPE-R2：领域标签不等于实义词性，也不整类恢复）
console.log("其中带领域义项、待裁定的：" + scopedOut.filter((x) => x.domain).map((x) => x.word + "=" + x.domain).join("；"));
console.log("各字母词数：", Object.entries(words).map(([k, v]) => k + v.length).join(" "));

// ---------- T38（第七批批次 5）：短语与合成词补充表 → app/assets/lang/en/phrases.js ----------
// 只在格里打的内容「原样 / 去空格 / 连字符」三种写法之一恰好命中时才用（CORE.phraseHit），不进候选首屏、不进随机池；
// 应用启动后才异步加载（app.js），不拖慢首屏。只用 ECDICT 已有条目的释义，不拼接单词释义。收两类：
//   · 短语：2–3 个词、每个词都在主词库、总长 ≤ 20（如 artificial intelligence）；连字符写法同理（about-face）
//   · 合成词：主词库没有、恰好由两个主词库词拼成、两段各 ≥ 3 个字母（superintelligence = super + intelligence）
// 收录长度 ≤ 20：格里的词最多 20 个字符（CORE.WORD_MAX），更长的打不进去（artificial intelligence 23 个字符，不收）。
// 质量过滤：人名 / 姓氏、词形变化（…的过去式 / 复数…）的整条不收；只有领域标记义项（[法][计][网络]…）的，
// 仅在 ECDICT 有质量信号（柯林斯 / 牛津 / 考纲 / 词频）或在 EXTRA_PHRASES 里时收，去掉标记（artificial intelligence「[计] 人工智能」→「人工智能」）；每条最多 2 个义项；
// 选词字符边界冻结到已审核基线；字体扩容不能悄悄扩大短语词库。
// 每条最多 2 个义项，没有质量信号的只留 1 个：控制 phrases.js 在审计的单文件 2 MiB 提示线下（应用启动后才异步加载，仍要顾及低端机解析与内存）
const PHRASE_SENSES = 2;
// 没有任何质量信号、又是计划点名要收的条目（同主词库 EXTRA 的做法）
const EXTRA_PHRASES = new Set(["superintelligence"]);
function cmapOf(file) { // woff2 → 字体里有的码位（读 cmap 表；woff2 的 cmap 不做变换）
  const b = fs.readFileSync(file); let p = 48;
  const KNOWN = ["cmap","head","hhea","hmtx","maxp","name","OS/2","post","cvt ","fpgm","glyf","loca","prep","CFF ","VORG","EBDT","EBLC","gasp","hdmx","kern","LTSH","PCLT","VDMX","vhea","vmtx","BASE","GDEF","GPOS","GSUB","EBSC","JSTF","MATH","CBDT","CBLC","COLR","CPAL","SVG ","sbix"];
  const b128 = () => { let v = 0; for (let i = 0; i < 5; i++) { const c = b[p++]; v = (v << 7) | (c & 127); if (!(c & 128)) return v >>> 0; } };
  const tables = [];
  for (let i = 0, n = b.readUInt16BE(12); i < n; i++) {
    const f = b[p++]; let tag; if ((f & 63) === 63) { tag = b.toString("latin1", p, p + 4); p += 4; } else tag = KNOWN[f & 63];
    const ver = f >> 6; let len = b128(); if ((tag === "glyf" || tag === "loca") ? ver === 0 : ver !== 0) len = b128();
    tables.push({ tag, len });
  }
  const data = brotliDecompressSync(b.subarray(p, p + b.readUInt32BE(20)));
  let off = 0, c; for (const t of tables) { if (t.tag === "cmap") c = data.subarray(off, off + t.len); off += t.len; }
  const has = new Set();
  for (let i = 0, m = c.readUInt16BE(2); i < m; i++) {
    const o = c.readUInt32BE(4 + i * 8 + 4), fm = c.readUInt16BE(o);
    if (fm === 4) { const sc = c.readUInt16BE(o + 6) / 2, e = o + 14, st = e + sc * 2 + 2; for (let k = 0; k < sc; k++) { const E = c.readUInt16BE(e + k * 2), A = c.readUInt16BE(st + k * 2); for (let z = A; z <= E && z !== 0xffff; z++) has.add(z); } }
    else if (fm === 12) { for (let k = 0, g = c.readUInt32BE(o + 12); k < g; k++) { const A = c.readUInt32BE(o + 16 + k * 12), E = c.readUInt32BE(o + 20 + k * 12); for (let z = A; z <= E; z++) has.add(z); } }
  }
  return has;
}
const sc = cmapOf(path.join(root, "app/assets/fonts/NotoSansSC-Regular.woff2"));
const latin = cmapOf(path.join(root, "app/assets/fonts/NotoSans-Regular.woff2"));
const phraseChars = new Set(JSON.parse(fs.readFileSync(path.join(root, "scripts/lexicon/en-phrase-codepoints.json"), "utf8")).codepoints);
const drawable = (s) => [...s].every((ch) => phraseChars.has(ch.codePointAt(0)));
// 显示能力是校验条件，不能反向改变词库内容。字体不足须修字体，而不是静默丢义项。
const missingPhraseChars = [...phraseChars].filter(cp => !sc.has(cp) && !latin.has(cp));
// 包内字体现在按新范围词包生成，不再覆盖旧短语表；隔离核对时这项只提示。
if (missingPhraseChars.length) console.warn("旧短语表有 " + missingPhraseChars.length + " 个字符不在当前包内字体里（旧管线只作隔离核对，不影响成品）");
const main = vocab; // 短语按组成词是否属于词汇判断，不要求组成词能独立命名：account for、absence of mind 照收
const twoMain = (w) => { for (let k = 3; k <= w.length - 3; k++) if (main.has(w.slice(0, k)) && main.has(w.slice(k))) return true; return false; };
const BAD = /（(姓氏|人名|男子名|女子名)|\((?:[A-Z][a-z]+)\)人名|的(过去式|过去分词|复数|现在分词|第三人称)|^(人名|姓氏)/;
const phrases = {};
let phraseCount = 0;
for (const line of lines) {
  if (!line) continue;
  const [word, , , translation, , collins, oxford, tag, bnc, frq] = parseLine(line);
  const signal = EXTRA_PHRASES.has(word) || !!tag || Number(collins) > 0 || oxford === "1" || Number(bnc) > 0 || Number(frq) > 0;
  if (!translation || main.has(word) || word.length > 20) continue;
  const isPhrase = /^[a-z]+( [a-z]+){1,2}$/.test(word) && word.split(" ").every((t) => main.has(t));
  const isHyphen = /^[a-z]+-[a-z]+$/.test(word) && word.split("-").every((t) => main.has(t));
  const isCompound = /^[a-z]{6,20}$/.test(word) && twoMain(word);
  if (!isPhrase && !isHyphen && !isCompound) continue;
  const first = translation.split("\\n")[0] || "";
  const domainOnly = /^\s*\[/.test(first.replace(/^[a-z]+\.\s*/i, ""));
  if ((domainOnly && !signal) || BAD.test(translation)) continue;
  let left = signal ? PHRASE_SENSES : 1;
  // 短语的释义多半不带词性（「人工智能」）：没有词性的行单独成一组、词性留空（应用的 senseGroups 认空词性），其余照主词库的 senses() 处理
  const bare = [];
  for (const l of translation.split("\\n")) {
    if (/^([a-z]+)\.\s/i.test(l)) continue;
    if (/^\[/.test(l) && !domainOnly) continue; // 有普通义项时不收领域义项；只有领域义项（且有质量信号）时去掉标记收下
    for (let t of l.replace(/^\[[^\]]*\]\s*/, "").split(/[,，;；]/)) { t = t.trim().replace(/\.\.\./g, "…"); if (t && t.length <= 10 && !bare.includes(t)) bare.push(t); }
  }
  const parsed = senses(translation, false, true).concat(bare.length ? [["", bare]] : []);
  const groups = parsed.map(([pos, list]) => [pos, list.map((t) => t.replace(/^\[[^\]]*\]\s*/, "")).filter((t) => t && drawable(t))]) // 义项开头的领域标记（「[心]余像」）去掉
    .filter(([pos, list]) => (pos || "")[0] !== "[" && list.length)
    .map(([pos, list]) => { const take = list.slice(0, Math.max(0, left)); left -= take.length; return [pos, take]; })
    .filter(([, list]) => list.length);
  if (!groups.length) continue;
  (phrases[word[0]] = phrases[word[0]] || []).push([word, groups.map(([pos, list]) => pos + list.join("，")).join("|")]);
  phraseCount++;
}
// 紧凑格式（省掉每条数组的引号与括号，约 270 KB）：每个首字母一串「词^释义~词^释义…」，应用第一次查某个字母时才拆成索引
for (const [k, list] of Object.entries(phrases)) {
  for (const [w, g] of list) if (/[\^~]/.test(w + g)) throw new Error("补充表数据里出现了分隔符 ^ 或 ~：" + w);
  phrases[k] = list.map(([w, g]) => w + "^" + g).join("~");
}
const pjs = "/* 短语与合成词补充表（T38）由 scripts/build-dict.mjs 从 ECDICT 生成，勿手改；版权与许可声明见 words.js 文件头（同一来源 ECDICT，MIT）。\n" +
  "   每个首字母一串「词^释义~词^释义…」；只在格里打的内容恰好命中时查（CORE.phraseHit），应用启动后异步加载。 */\nwindow.PHRASES=" + JSON.stringify(phrases) + ";\n";
fs.writeFileSync(OUT_PHRASES, pjs);
console.log(`${phraseCount} 条短语 / 合成词，${(Buffer.byteLength(pjs) / 1024).toFixed(0)} KiB → ${path.relative(root, OUT_PHRASES)}`);
