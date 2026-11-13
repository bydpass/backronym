// v00.03.00 T13：名词的性别与冠词，生成时就写好，运行时不再推断。规则来源：PLAN T13、RESEARCH 第 8 节 ③④（证据脚本 plans/v00.03.00/t01/）。
// 每个结果：{ g: 性别类别, art: 显示的冠词（"" = 不显示）, state: "known" | "unknown:<原因>", via: 判定来源 }
// 未知的不猜：不写冠词、进审核队列（第 3 批确认后再写入）。

// 性别：先看义项标签，没有再看 head 展开里紧跟词后的性别记号（「Haus n (…)」「hache f (…)」「árabe m or f by sense」）
export function genderOf(rec) {
  const t = new Set(rec.tags || []);
  const head = (rec.head || []).join(" ; ");
  const after = (rec.head || []).map((h) => h.replace(/^\S+\s*/, "")).join(" ; ");
  const person = t.has("by-personal-gender") || /\bm or f by sense\b/.test(head);
  const m = t.has("masculine") || /^(m|m or f|f or m|mf|m or n|n or m)\b/.test(after);
  const f = t.has("feminine") || /^(f|m or f|f or m|mf|f pl)\b/.test(after);
  const n = t.has("neuter") || /^(n|n pl|m or n|n or m)\b/.test(after);
  // 复数专用（V003-B2-R2）：词头写 pl / plural only，或全部义项都标 plural-only；整词标签不作数（extract 会把单个复数义项的标签提到整词，information 即如此）
  const gl = rec.gl || [];
  const pl = /^(m |f |n )?pl\b/.test(after) || /\bplural only\b/.test(head) || (gl.length > 0 && gl.every((s) => (s.t || []).includes("plural-only")));
  const mixed = (m && f) || (m && n) || (f && n);
  let g = person ? "person" : mixed ? (m && f ? "mf" : m && n ? "mn" : "fn") : m ? "m" : f ? "f" : n ? "n" : "";
  return { g, pl, person, mixed: mixed && !person };
}

// 与 build-lexicon.mjs、rules.js 同一口径（V003-B2-R4 / R5）：先转小写，再去变音符、展开 ß / œ / æ；œil 由此按元音开头
export const fold = (s) => String(s).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\u00df/g, "ss").replace(/\u0153/g, "oe").replace(/\u00e6/g, "ae");
const VOWEL = /^[aeiou]/;

// ---------- 西语：先定重音（IPA，缺 IPA 用 RAE 拼写规则补判），再按性别类别定冠词（移植自 t01/es_article.py，口径一致） ----------
const V = new Set("aeiouáéíóúü"), STRONG = new Set("aeoáéíóú"), ACC = new Set("áéíóú");
const FOREIGN = /[kwy]|sh|th|ck|tz|[^aeiouáéíóúdlnrszjx]$/;
const LETTER_NAMES = new Set(["a", "hache"]);
function ipaFirst(ipas) {
  const res = new Set();
  for (const x of ipas) {
    const s = x.trim().replace(/^[/[]+/, "").replace(/\./g, "");
    if (!s) continue;
    res.add(s.startsWith("ˈ") || !s.includes("ˈ"));
  }
  if (!res.size) return null;
  return res.size > 1 ? "conflict" : [...res][0] ? "stressed" : "unstressed";
}
function spellFirst(w) {
  let s = w.replace(/qu(?=[eéií])/g, "q").replace(/gu(?=[eéií])/g, "g").replace(/h/g, "");
  const nuc = []; let i = 0, n = -1;
  while (i < s.length) {
    if (V.has(s[i])) {
      let j = i; while (j < s.length && V.has(s[j])) j++;
      n++; let seen = false;
      for (const ch of s.slice(i, j)) { if (STRONG.has(ch)) { if (seen) n++; seen = true; } nuc.push([ch, n]); }
      i = j;
    } else i++;
  }
  const nsyl = n + 1;
  if (nsyl <= 0) return null;
  const acc = nuc.filter(([ch]) => ACC.has(ch)).map(([, k]) => k);
  const stressed = acc.length ? acc[0] : V.has(w[w.length - 1]) || /[ns]$/.test(w) ? Math.max(0, nsyl - 2) : nsyl - 1;
  return stressed === 0 ? "stressed" : "unstressed";
}
function esStress(w, ipas) {
  const ipa = ipaFirst(ipas), sp = spellFirst(w);
  if (ipa === "conflict") return ["unknown:ipa_conflict", "ipa"];
  if (ipa && sp !== ipa) return ["unknown:ipa_vs_spell", "ipa"];
  if (ipa) return [ipa, "ipa+spell"];
  if (sp == null) return ["unknown:no_vowel", "spell"];
  if (FOREIGN.test(w)) return ["unknown:no_ipa_foreign_shape", "spell"];
  return [sp, "spell"];
}

// ---------- 意语：正字法规则（RESEARCH ④）；h / w / k / j / y 开头的外来词用法有分歧，进队列 ----------
const IT_LO = /^(s[^aeiouàèéìíòóù]|z|gn|ps|pn|x|i[aeiouàèéòóù])/;

export function articleOf(lang, rec) {
  const w = rec.w, lw = w.toLowerCase(), G = genderOf(rec);
  const out = (art, state, via) => ({ g: G.g + (G.pl ? "|pl" : ""), art, state, via });
  if (lang === "la") return out("", "none", "");
  if (!G.g && !G.pl) return out("", "unknown:no_gender", "tags+head");
  if (lang === "de") {
    if (G.pl) return out("die", "known", "tags+head"); // 复数一律 die（die Daten、die Leute）
    const map = { m: "der", f: "die", n: "das", mf: "der / die", mn: "der / das", fn: "die / das", person: "der / die" };
    return map[G.g] ? out(map[G.g], "known", "tags+head") : out("", "unknown:gender", "tags+head");
  }
  if (lang === "fr") {
    const fw = fold(lw);
    let elide;
    if (/^h/.test(fw)) {
      if (rec.h === "asp") elide = false;
      else if (rec.h === "mute") elide = true;
      else return out("", rec.h === "both" ? "unknown:h_both" : "unknown:h_unmarked", "categories"); // T01③：都没标的不猜
    } else elide = VOWEL.test(fw);
    const via = /^h/.test(fw) ? "categories" : "spell";
    if (G.pl) return out("les", "known", via); // 复数不省音：les affaires、les yeux
    if (elide) return out("l’", "known", via);
    const map = { m: "le", f: "la", mf: "le / la", person: "le / la" };
    return map[G.g] ? out(map[G.g], "known", via) : out("", "unknown:gender", via);
  }
  if (lang === "es") {
    if (G.pl) { // 复数：los / las（las aguas，复数不用 el）；没有性别不猜
      const map = { m: "los", f: "las", mf: "los / las", person: "los / las" };
      return map[G.g] ? out(map[G.g], "known", "tags+head") : out("", "unknown:plural_no_gender", "tags+head");
    }
    const fem = G.g === "f" || G.g === "mf" || G.g === "person";
    if (fem && /^(a|á|ha|há)/.test(lw)) {
      if (LETTER_NAMES.has(lw)) return out("la", "known", "letter_name");
      const [st, via] = esStress(lw, rec.ipa || []);
      if (st.startsWith("unknown")) return out("", st, via);
      if (st === "stressed") {
        if (G.g === "person") return out("el / la", "known", via); // RAE DPD「el」§2.3b：指女性用 la
        if (G.g === "mf") return out("", "unknown:stressed_mixed_gender", via);
        return out("el", "known", via); // el agua
      }
    }
    const map = { m: "el", f: "la", mf: "el / la", person: "el / la" };
    return map[G.g] ? out(map[G.g], "known", "tags+head") : out("", "unknown:gender", "tags+head");
  }
  if (lang === "it") {
    const fw = fold(lw);
    if (/^[hwkjy]/.test(fw)) return out("", "unknown:foreign_initial", "spell");
    const lo = IT_LO.test(fw), vow = VOWEL.test(fw) && !lo; // i + 元音的 i 是半元音，按辅音算：lo iato、la iena，不省音
    if (G.pl) { // 复数：gli（元音、lo 的条件前）/ i；阴性 le，不省音（gli affari、i pantaloni、le forbici）
      const mp = vow || lo ? "gli" : "i";
      if (G.g === "m") return out(mp, "known", "spell");
      if (G.g === "f") return out("le", "known", "spell");
      if (G.g === "mf" || G.g === "person") return out(mp + " / le", "known", "spell");
      return out("", "unknown:plural_no_gender", "spell");
    }
    const m = vow ? "l’" : lo ? "lo" : "il", f = vow ? "l’" : "la";
    if (G.g === "m") return out(m, "known", "spell");
    if (G.g === "f") return out(f, "known", "spell");
    if (G.g === "mf" || G.g === "person") return out(m === f ? m : m + " / " + f, "known", "spell");
    return out("", "unknown:gender", "spell");
  }
  return out("", "unknown:lang", "");
}
