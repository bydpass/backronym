// v00.03.00 T12：中文释义。释义链（PLAN D3）：外 → 英（kaikki 的英文释义）→ ECDICT 英 → 中；
// 德语先用 HanDeDict 直出（德 → 中，反查），法语先用 CFDICT 直出（法 → 中，反查），直出没有命中再走英语中转。
// 对不上的义项不硬凑：整条没有中文就标「待普查」，交第 3 批。
import fs from "node:fs";
import zlib from "node:zlib";

// kaikki 词性 → 词库词性写法（沿用英文词库：adj. n. v. adv. …）
export const POS = { noun: "n.", verb: "v.", adj: "adj.", adv: "adv.", pron: "pron.", prep: "prep.", conj: "conj.", intj: "int.", num: "num.", det: "det.", article: "art.", particle: "part.", postp: "prep.", adj_noun: "adj.", contraction: "prep." }; // 缩合词（du、del、dal、zum）按介词列
const ECPOS = { a: "adj.", adj: "adj.", n: "n.", v: "v.", vt: "v.", vi: "v.", adv: "adv.", prep: "prep.", conj: "conj.", pron: "pron.", int: "int.", interj: "int.", num: "num.", art: "art.", aux: "v.", det: "det." };

function parseCsvLine(line) {
  const out = []; let cur = "", q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) { if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; } else if (c === '"') q = false; else cur += c; }
    else if (c === '"') q = true; else if (c === ",") { out.push(cur); cur = ""; } else cur += c;
  }
  out.push(cur); return out;
}
// 中文义项清理：去掉【】[] 领域标签与括注，过长的不要（与 build-dict.mjs 的 ≤10 字同一口径）
function cleanZh(s) {
  s = s.replace(/\[[^\]]*\]|【[^】]*】|〔[^〕]*〕/g, "").replace(/（[^）]*）|\([^)]*\)/g, "").replace(/\.\.\./g, "…").trim();
  return s && s.length <= 10 && /[一-鿿]/.test(s) ? s : "";
}

// ECDICT：英文词 / 词组 → { 词性: [中文义项…] }；另给英语词集合（覆盖率 r3 口径的排除清单用）
export function loadEcdict(file) {
  const map = new Map(), en = new Set(), zhFreq = new Map(), alias = new Map(); // zhFreq：中文义项在常用英语词（词频前 3 万）释义里出现的次数，用来挑常用说法
  const lines = fs.readFileSync(file, "utf8").split("\n");
  for (let k = 1; k < lines.length; k++) {
    const line = lines[k]; if (!line) continue;
    const r = parseCsvLine(line), word = r[0], tr = r[3] || "";
    const rank = Math.min(Number(r[9]) || 1e9, Number(r[8]) || 1e9);
    if (word && /^[A-Za-z]+$/.test(word)) en.add(word.toLowerCase());
    if (!word || !tr) continue;
    const groups = {};
    for (const l of tr.split("\\n")) {
      const m = l.match(/^([a-z]+)\.\s*(.*)$/i);
      const pos = m ? ECPOS[m[1].toLowerCase()] : "?";
      const body = m ? m[2] : l;
      const list = groups[pos] || (groups[pos] = []);
      for (const s of body.split(/[,，;；]/)) {
        const z = cleanZh(s);
        if (!z) continue;
        if (!list.includes(z)) list.push(z);
        if (rank <= 30000) zhFreq.set(z, (zhFreq.get(z) || 0) + 1);
      }
    }
    const key = word.toLowerCase();
    // 屈折形式（forgotten：「forget的过去分词」）没有自己的中文：按 exchange 列的「0:原形」借原形的释义
    const lem = (r[10] || "").match(/(?:^|\/)0:([a-z]+)/);
    if (lem && !Object.values(groups).some((l) => l.length)) { alias.set(key, lem[1]); continue; }
    if (!map.has(key)) map.set(key, groups);
  }
  for (const [k, l] of alias) if (!map.has(k) && map.has(l)) map.set(k, map.get(l));
  return { map, en, zhFreq };
}

// CEDICT 格式（HanDeDict / CFDICT）：「繁 简 [拼音] /释义/释义/」→ 反查表：外文词 → [{ zh, pos, first }]
// 只认整段恰好等于一个外文词的释义（「maison」「Haus (S)」），带说明的长释义不拿来反查
export function loadCedict(file, lang) {
  const raw = file.endsWith(".gz") ? zlib.gunzipSync(fs.readFileSync(file)).toString("utf8") : fs.readFileSync(file, "utf8");
  const inv = new Map();
  const MARK = { S: "n.", V: "v.", Adj: "adj.", Adv: "adv.", Pron: "pron.", Präp: "prep.", Konj: "conj.", Int: "int.", Num: "num." };
  for (const line of raw.split("\n")) {
    if (!line || line[0] === "#") continue;
    const m = line.match(/^(\S+)\s+(\S+)\s+\[[^\]]*\]\s+\/(.*)\/\s*$/);
    if (!m) continue;
    const zh = m[2];
    if (zh.length > 6 || !/^[一-鿿]+$/.test(zh)) continue;
    m[3].split("/").forEach((g, i) => {
      let pos = "";
      const mk = g.match(/\(([^)]*)\)\s*$/);
      if (mk) { const first = mk[1].split(/,\s*/)[0]; pos = MARK[first] || (/adj/.test(first) ? "adj." : /^v\b|verbe/.test(first) ? "v." : /^n\b|^[mf]$|^nm$|^nf$/.test(first) ? "n." : ""); }
      let term = g.replace(/\([^)]*\)/g, "").trim();
      // 只去有明确词边界的冠词（V003-B2-R1）：le / la / les / un / une 后面要有空白，省音只认 l' / l’；lait、lettre、lever 原样保留
      if (lang === "de") term = term.replace(/^(der|die|das)\s+/, "");
      if (lang === "fr") term = term.replace(/^(?:(?:les|le|la|une|un)\s+|l['\u2019]\s*)/i, "");
      if (!term || /\s/.test(term) || term.length > 30) return;
      const list = inv.get(term) || [];
      if (list.length < 12) list.push({ zh, pos, first: i === 0 });
      inv.set(term, list);
    });
  }
  return inv;
}

const FUNC = new Set(["of", "or", "and", "with", "for", "in", "on", "at", "by", "from", "to", "as", "pertaining", "relating", "used", "being", "having", "one", "who", "which", "that", "something", "someone"]);
// 一条英文释义 → 最多 2 个中文义项。去括注；按「;」「,」切段；去掉 to / a / an / the；整段在 ECDICT 里查得到才用
function enGlossToZh(g, pos, ec) {
  const out = [];
  // 「used to express an approximate number: about, approximately」：冒号后面才是释义，先用后面
  const parts = g.replace(/\([^)]*\)/g, " ").replace(/\[[^\]]*\]/g, " ").split(/[:—]/);
  const body = parts.length > 1 && parts[parts.length - 1].trim() ? parts[parts.length - 1] : parts[0];
  for (let seg of body.split(/[;,/]|\s+or\s+/)) { // 「boy or young adult」「favor/favour」也拆开
    seg = seg.trim().toLowerCase().replace(/\s+/g, " ").replace(/[.!?]+$/, "").replace(/^(to|a|an|the)\s+/, "").replace(/^(to)\s+/, "").replace(/\s+(the|a|an)$/, ""); // 「of the」→ of
    if (!seg || seg.length > 30) continue;
    if (FUNC.has(seg) && !/^(prep|conj|pron|det|article|contraction|particle)$/.test(pos)) continue; // 「of or pertaining to」拆出的 of 不查成「的」
    const ent = ec.get(seg);
    if (!ent) continue;
    const list = ent[POS[pos]] || ent[Object.keys(ent)[0]] || [];
    if (list[0] && !out.includes(list[0])) out.push(list[0]);
    if (out.length >= 2) break;
  }
  return out;
}

// 一个原形（同一写法、同一词性的若干 kaikki 条目合并后）→ { zh: [中文义项], via: "handedict" | "cfdict" | "en" | "" }
// primary = 这是该写法的第一个词性：没标词性的直出结果只给第一个词性用，免得「elle 名词」也拿到「她」
// 排序：英语中转也能得到的直出词最先，其次按 zhFreq（常用说法），zhFreq 为 0 的偏字（壹、幺、伲）只在别无选择时用
export function zhFor(word, pos, glosses, src, primary) {
  const P = POS[pos] || "";
  const en = [];
  for (const g of glosses) {
    for (const z of enGlossToZh(g, pos, src.ec)) if (!en.includes(z)) en.push(z);
    if (en.length >= 6) break;
  }
  const f = (z) => src.zhFreq.get(z) || 0;
  if (src.direct) {
    const hits = (src.direct.get(word) || []).filter((h) => (h.pos ? h.pos === P : primary));
    const cand = [...new Set(hits.map((h) => h.zh))];
    const firstOf = (z) => hits.some((h) => h.zh === z && h.first);
    cand.sort((a, b) => en.includes(b) - en.includes(a) || (f(b) > 0) - (f(a) > 0) || firstOf(b) - firstOf(a) || f(b) - f(a) || a.length - b.length);
    const common = cand.filter((z) => f(z) > 0 || en.includes(z));
    const zh = (common.length ? common : cand).slice(0, 3);
    if (zh.length) return { zh, via: src.directName };
  }
  return { zh: en.slice(0, 4), via: en.length ? "en" : "" };
}
