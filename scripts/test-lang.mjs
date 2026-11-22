// v00.03.00 第 1 批（T02 / T04 / T05 / T06）：屏蔽器按语言注册、语言规则注册表与按草稿语言迁移、草稿 lang 字段、语言包加载契约。
// 只用替身与内存存储，不碰用户存储；法语 / 德语等规则与数据都是测试里临时注册的假语言包。`npm test`
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { loadAppFunctions } from "./app-source.mjs";

const now = 2000000000000;
const env = { window: {}, Date: { now: () => now }, setTimeout, clearTimeout, Promise };
vm.createContext(env);
for (const f of ["block/core.js", "lang/en/block.js", "core.js", "lang/packs.js", "draft.js"]) vm.runInContext(fs.readFileSync(new URL("../app/assets/" + f, import.meta.url), "utf8"), env, { filename: f });
const { BLOCK, CORE, LANGPACK, DRAFT } = env.window;
const plain = (x) => JSON.parse(JSON.stringify(x));
const flush = async (n = 6) => { for (let i = 0; i < n; i++) await new Promise((r) => setImmediate(r)); };

// ---------- T02：屏蔽器按语言注册 ----------
{
  assert.equal(BLOCK.has("en"), true); assert.equal(BLOCK.has(), true, "缺省 = en"); assert.equal(BLOCK.has("fr"), false);
  assert.equal(BLOCK.hit("sex"), true); assert.equal(BLOCK.hit("sex", "en"), true);
  // 没注册词表的语言：只查中文与导流（能否导出由调用方用 has() 判断）
  assert.equal(BLOCK.hit("sex", "fr"), false, "fr 词表没注册：英文整词不查");
  assert.equal(BLOCK.hit("傻逼", "fr"), true); assert.equal(BLOCK.hit("加我微信", "fr"), true);
  BLOCK.add("fr", { words: ["merde"] });
  assert.equal(BLOCK.has("fr"), true); assert.equal(BLOCK.hit("Merdé", "fr"), true, "注册后按 fr 词表查（含去变音符）");
  assert.equal(BLOCK.hit("merde", "en"), false, "英语不查 fr 的词");
  // 有意变化：归一化去变音符（以前 sëx 拆成 s / x 两段、不拦）
  for (const s of ["sëx", "SËX", "fück", "pórn", "ｓëｘ", "s ë x", "bïtch", "nazí"]) assert.equal(BLOCK.hit(s), true, "去变音符后应拦：" + s);
  assert.equal(BLOCK.normalize("Straße Œuvre Æsir"), "strasse oeuvre aesir");
  // 去变音符不误伤
  for (const s of ["naïve", "café", "déjà vu", "Ærø", "Zoë", "señor", "über", "façade", "Øresund", "cliché", "rosé", "piñata", "Ægir", "Sëxtus"]) assert.equal(BLOCK.hit(s), false, "不应拦：" + s);
}

// ---------- T04：语言规则注册表 ----------
const fr = { letters: (t) => String(t || "").toUpperCase().replace(/[^A-ZÀ-ÖØ-Þ0-9]/g, "") }; // 假法语规则：格字母保留带变音符的大写字母
{
  assert.equal(CORE.LANG.code, "en"); assert.equal(CORE.hasLang("en"), true); assert.equal(CORE.hasLang("fr"), false);
  assert.equal(CORE.hasLang("toString"), false, "原型上的名字不算语种");
  assert.equal(CORE.useLang("fr"), false, "没注册不切"); assert.equal(CORE.LANG.code, "en");
  CORE.addLang("fr", fr);
  assert.equal(CORE.hasLang("fr"), true); assert.equal(CORE.normalizeWord("āb"), "ĀB", "全局仍是英语规则（R07 起英语也留带变音符的字母，假法语规则不收 Ā）");
  assert.equal(CORE.useLang("fr"), true); assert.equal(CORE.LANG.code, "fr", "CORE.LANG 跟着当前规则变");
  { // 2026-11-12：法、西、意的冠词在块内右对齐（贴着词），其余（德语）左对齐；省音冠词本来就紧贴词。这里不另注册语言（后面的加载器用例要求它们未注册）：右对齐用法语测，左对齐那条路径用当前不在名单里的英语规则测
    const m = (font, t) => String(t).length * 10, W = CORE.CARD.WORD, at = (lang, art) => { const was = CORE.LANG.code; CORE.useLang(lang);
      const blk = CORE.wordBlock(m, "Maison", art, W, 920, null), bx = CORE.wordBoxes(m, blk, { i: 0, x: 80, base: W.base, lead: W.lead, track: W.track, article: art, ok: true }); CORE.useLang(was);
      return { a: bx.find(b => b.role === "article"), w: bx.find(b => b.role === "word"), gap: Math.round(blk.artSize * 0.22) }; };
    const r = at("fr", "la"); assert.equal(r.a.x + r.a.w + r.gap, r.w.x, "法语：冠词右缘贴着词（留一个冠词间距）"); assert.ok(r.a.x > 80, "la 比 das 窄，所以不在块的左端");
    const left = at("en", "die"); assert.equal(left.a.x, 80, "不在右对齐名单里的语言（德语）：冠词从块的左端起"); assert.equal(r.w.x, left.w.x, "词仍从同一条竖线起排");
    const el = at("fr", "l’"); assert.equal(el.a.x, 80); assert.equal(el.a.x + el.a.w, el.w.x, "省音冠词紧贴词，不受对齐影响");
    // 语言多选（2026-11-12）起按冠词本身判断，不看当前语言：一张卡上可以有几门语言的词。der / die / das（含「der / die」二选一）左对齐，其余右对齐
    for (const lang of ["fr", "en"]) { for (const d of ["der", "die", "das", "der / die"]) assert.equal(at(lang, d).a.x, 80, lang + " 规则下 " + d + " 仍左对齐"); for (const a of ["le", "la", "el", "il", "lo"]) assert.ok(at(lang, a).a.x > 80, lang + " 规则下 " + a + " 右对齐"); }
  }
  assert.equal(CORE.normalizeWord("été"), "ÉTÉ"); assert.equal(CORE.LANG.fold("ABC"), "abc", "没给的字段沿用英语的");
  assert.equal(CORE.blocked("merde"), true, "blocked 按当前语言的词表查"); assert.equal(CORE.blocked("sex"), false);
  CORE.useLang("en"); assert.equal(CORE.blocked("sex"), true);
  assert.ok(CORE.DRAFT_FIELDS.includes("lang"), "lang 是已知字段，不进 draftExtra");
}

// ---------- T04：草稿按自身 lang 迁移 ----------
{
  const old = CORE.migrateDraft({ v: 2, t: now, word: "life" });
  assert.equal(old.lang, "en", "旧英文稿没有 lang：当 en"); assert.equal(old.word, "LIFE");
  const f = CORE.migrateDraft({ v: 2, t: now, lang: "fr", word: "été", picks: [["Éclat", ""]] });
  assert.equal(f.lang, "fr"); assert.equal(f.word, "ÉTÉ", "法语稿按法语规则规整，不被英语规则压成一格"); assert.equal(f.picks.length, 3);
  assert.equal(CORE.LANG.code, "en", "迁移不改全局当前语言");
  CORE.useLang("fr"); assert.equal(CORE.migrateDraft({ v: 2, t: now, word: "āb" }).word, "ĀB", "英文稿在法语当前语言下仍按英语规整（假法语规则会丢掉 Ā）"); CORE.useLang("en");
  for (const lang of ["xx", 3, "", "toString"]) assert.equal(CORE.migrateDraft({ v: 2, t: now, lang, word: "life" }), null, "不认识的 lang：当不能套用的原文（" + lang + "）");
  // 迁移中途抛错：全局当前语言照样还原
  assert.throws(() => CORE.migrateDraft({ v: 2, t: now, lang: "fr", word: "été", get titleRuns() { throw new Error("坏字段"); } }));
  assert.equal(CORE.LANG.code, "en", "抛错后全局语言还原");
}

// ---------- T04 / T06：draft.js 读稿——主稿与副本语言不同、未知 lang、配图引用 ----------
{
  const memory = () => { const m = new Map(); return { m, getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, v), removeItem: (k) => m.delete(k) }; };
  const local = memory(), remote = memory();
  const tools = { getStorage: async ({ key }) => ({ data: remote.getItem(key) }), setStorage: async ({ key, data }) => remote.setItem(key, data), removeStorage: async ({ key }) => remote.removeItem(key) };
  const store = DRAFT.create(local, (n) => (tools[n] ? tools : null));
  const K = DRAFT.KEY, R = DRAFT.RESCUE;
  const img = "m1a-0123456789abcdef.jpg";
  // 法语重音稿（带配图与取景）在主键，较旧的英文稿在副本：取较新的法语稿，按法语规则恢复
  const frRaw = JSON.stringify({ v: 2, t: now, lang: "fr", word: "ÉTÉ", media: { def: img, cells: [null, null, null] }, crops: [{ z: 2, x: 0.3, y: 0.4 }, null, null] });
  local.setItem(K, frRaw); remote.setItem(K, frRaw); local.setItem(R, JSON.stringify([JSON.stringify({ v: 2, t: now - 5, word: "LIFE" })]));
  let r = await store.read();
  assert.equal(r.entry.draft.lang, "fr"); assert.equal(r.entry.draft.word, "ÉTÉ");
  assert.deepEqual(plain(r.entry.draft.media), { def: img, cells: [null, null, null] }); assert.equal(r.entry.draft.crops[0].z, 2, "取景随稿恢复");
  // 主键是未知语言的较新稿、副本有旧英文稿：取英文稿，但主键那份记为 differ（覆盖前先保全），引用的配图照样算被引用
  const xxRaw = JSON.stringify({ v: 2, t: now, lang: "xx", word: "QQ", media: { def: img, cells: [null, null] } });
  local.setItem(K, xxRaw); remote.setItem(K, xxRaw);
  r = await store.read();
  assert.equal(r.entry.draft.word, "LIFE", "未知 lang 的稿不能套用，不淘汰有效稿");
  assert.deepEqual(plain(r.differ), { remote: true, local: true }, "未知 lang 原文所在两侧都要先保全再覆盖");
  const refs = await store.refs();
  assert.equal(refs.ok, true); assert.equal(refs.names[img], true, "未知 lang 稿引用的配图不被清理");
  // 只有未知 lang 的稿：entry.draft 为 null、原文原样交给保全闸门
  local.removeItem(R);
  r = await store.read();
  assert.equal(r.entry.draft, null); assert.equal(r.entry.raw, xxRaw, "原文字节原样保留");
  assert.equal(await store.preserve(r.entry.raw), true, "能存进恢复副本");
  assert.ok(JSON.parse(local.getItem(R)).includes(xxRaw));
}

// ---------- T05：语言包加载契约 ----------
{
  // 假语言包：inject(url) 模拟插脚本，按 url 决定何时到达、到达后注册什么
  const calls = [], gates = {};
  const register = {
    rules: (code) => CORE.addLang(code, fr),
    block: (code) => BLOCK.add(code, { words: ["x" + code] }),
    words: (code) => LANGPACK.put(code, "words", { a: [["a" + code, "n.测试"]] }),
    phrases: (code) => LANGPACK.put(code, "phrases", { a: "p^测试" }),
  };
  const part = (url) => url.split("/").pop().replace(".js", "");
  const codeOf = (url) => url.split("/").slice(-2)[0];
  const inject = (url) => { calls.push(url); return new Promise((ok, no) => { gates[url] = { ok: (reg = true) => { if (reg) register[part(url)](codeOf(url)); ok(); }, no: () => no(new Error("x")) }; }); };
  const L = LANGPACK.loader({ inject, ms: 40 });
  const open = (code, p) => gates["./assets/lang/" + code + "/" + p + ".js"];

  // 英语：内置规则 + 全局词库映射
  env.window.WORDS = { a: [["able", "adj.能"]] }; env.window.HYPH = { x: [1] };
  assert.equal(LANGPACK.get("en", "words"), env.window.WORDS); assert.equal(LANGPACK.get("en", "phrases"), null, "英语补充表没加载：null");
  assert.deepEqual(plain(LANGPACK.ready("en")), { rules: true, block: true, words: true });
  assert.deepEqual(plain(await L.load("en")), { code: "en", ok: true, failed: [], ready: { rules: true, block: true, words: true } }, "都就绪：不发请求");
  assert.equal(calls.length, 0);

  // 分开就绪：de 规则与屏蔽词先到、词库后到
  let p = L.load("de");
  await flush(); assert.equal(calls.length, 3, "三部分并行请求");
  open("de", "rules").ok(); open("de", "block").ok(); await flush();
  assert.deepEqual(plain(LANGPACK.ready("de")), { rules: true, block: true, words: false }, "规则 / 屏蔽词 / 词库分开报告");
  open("de", "words").ok();
  let res = await p;
  assert.equal(res.ok, true); assert.equal(CORE.LANG.code, "en", "加载器从不切当前语言（确认后才由调用方 setLang）");

  // 失败可重试：it 词库请求失败 → failed 里列出，规则照样就绪；重试只重新请求失败的那部分
  calls.length = 0;
  p = L.load("it"); await flush();
  open("it", "rules").ok(); open("it", "block").ok(); open("it", "words").no();
  res = await p;
  assert.deepEqual(plain(res.failed), ["words"]); assert.equal(res.ok, false); assert.equal(res.ready.rules, true);
  p = L.load("it"); await flush();
  assert.deepEqual(calls.slice(3), ["./assets/lang/it/words.js"], "重试只请求没就绪的部分");
  open("it", "words").ok(); assert.equal((await p).ok, true);

  // 超时：请求一直不回 → 到期算失败；迟到的文件到了也只是注册数据，不改当前语言
  res = await L.load("es", ["rules"]);
  assert.deepEqual(plain(res.failed), ["rules"], "超时按失败");
  open("es", "rules").ok(); await flush();
  assert.equal(CORE.LANG.code, "en");
  res = await L.load("es", ["rules"]); assert.equal(res.ok, true, "迟到的那次已注册：再 load 不必重新请求");
  // 超时后重试会重新请求（不复用超时的那次）
  calls.length = 0;
  await L.load("ca", ["rules"]); const again = L.load("ca", ["rules"]); await flush();
  assert.equal(calls.length, 2, "超时后重试重新插脚本"); open("ca", "rules").ok(); assert.equal((await again).ok, true);

  // 文件到了却没注册：也算失败
  p = L.load("pt", ["rules"]); await flush(); open("pt", "rules").ok(false);
  assert.deepEqual(plain((await p).failed), ["rules"], "到了没注册 = 失败");

  // 快速切换 nl → sv，nl 后到：nl 的结果标 stale，调用方丢弃
  const pn = L.load("nl", ["rules"]), ps = L.load("sv", ["rules"]); await flush();
  open("sv", "rules").ok(); const rs = await ps;
  open("nl", "rules").ok(); const rn = await pn;
  assert.equal(rs.ok, true); assert.equal(rs.stale, undefined);
  assert.deepEqual(plain(rn), { code: "nl", stale: true }, "迟到的旧语言结果作废");

  // 已作废的那次请求失败了：之后重试仍要重新请求，不能一直复用那次失败
  calls.length = 0;
  const ph = L.load("hu", ["rules"]), pcz = L.load("cs", ["rules"]); await flush();
  open("hu", "rules").no(); assert.equal((await ph).stale, true); open("cs", "rules").ok(); await pcz;
  const retry = L.load("hu", ["rules"]); await flush();
  assert.equal(calls.filter((u) => u.includes("/hu/")).length, 2, "作废且失败的请求不留着：重试重新插脚本");
  open("hu", "rules").ok(); assert.equal((await retry).ok, true);

  // 取消切换：cancel 后回来的结果作废
  const pc = L.load("da", ["rules"]); await flush(); L.cancel(); open("da", "rules").ok();
  assert.equal((await pc).stale, true, "取消后结果作废");

  // 同一文件并发只请求一次
  calls.length = 0;
  const a = L.load("fi", ["words"]), b = L.load("fi", ["words"]); await flush();
  assert.equal(calls.length, 1, "同一文件正在加载：共用一次请求");
  open("fi", "words").ok(); assert.equal((await a).stale, true); assert.equal((await b).ok, true);

  // V003-B1-R1：作废（取消）后原请求超时 / 到了没注册 / 失败，第一次重试都要重新请求并能成功；
  // 重试在途时并发同文件仍只插一次；旧请求迟到不清掉新请求
  for (const [code, how] of [["ro", "timeout"], ["bg", "unregistered"], ["hr", "reject"]]) {
    calls.length = 0;
    const old = L.load(code, ["rules"]); await flush(); const g1 = open(code, "rules");
    L.cancel();
    if (how === "unregistered") g1.ok(false); else if (how === "reject") g1.no();
    assert.equal((await old).stale, true, how + "：取消后结果作废");
    const retry = L.load(code, ["rules"]); await flush();
    assert.equal(calls.length, 2, how + "：作废后第一次重试就重新插脚本");
    const g2 = open(code, "rules");
    if (how === "timeout") { g1.ok(false); await flush(); } // 旧请求超时后才到（没注册）：不能清掉新请求
    const twin = L.load(code, ["rules"]); await flush();
    assert.equal(calls.length, 2, how + "：重试在途、旧请求迟到后，并发同文件仍共用新请求");
    g2.ok();
    assert.equal((await retry).stale, true); const r = await twin;
    assert.equal(r.ok, true, how + "：重试成功"); assert.equal(CORE.LANG.code, "en", "加载器不切当前语言");
  }

  // 只摘自己那一次：a、b 共用旧请求、先后超时；a 超时后 c 已发新请求，b 迟一步超时不能把 c 的新请求摘掉
  {
    calls.length = 0;
    const wait = (t) => new Promise((r) => setTimeout(r, t));
    const a = L.load("sk", ["rules"]); await wait(20);
    const b = L.load("sk", ["rules"]); await flush();
    assert.equal(calls.length, 1, "a、b 共用一次请求");
    await a;
    const c = L.load("sk", ["rules"]); await flush();
    assert.equal(calls.length, 2, "a 超时后重新请求");
    await b; // b 的期限到了
    const d = L.load("sk", ["rules"]); await flush();
    assert.equal(calls.length, 2, "b 迟到的超时不摘 c 的新请求：d 仍共用");
    open("sk", "rules").ok(); assert.equal((await c).stale, true); assert.equal((await d).ok, true);
  }

  // 按语言隔离：fr 的补充表不影响英语
  LANGPACK.put("fr", "phrases", { a: "x^y" });
  assert.equal(LANGPACK.get("en", "phrases"), null); assert.equal(LANGPACK.get("fr", "hyph"), null);
  env.window.PHRASES = { a: "en^英" };
  assert.equal(LANGPACK.get("en", "phrases"), env.window.PHRASES); assert.deepEqual(plain(LANGPACK.get("fr", "phrases")), { a: "x^y" });
}

// ---------- T04 / T06：应用层——草稿带 lang；加载中保存不改语言、不丢配图引用；setLang 只认已注册语言 ----------
{
  const state = { lang: "en", letters: ["L", "I"], filler: "", view: "single", picks: [null, null], glosses: ["", ""], glossAuto: [true, true], captions: ["", ""], keys: [0, 0], split: null };
  const media = { media: { def: "m1a-0123456789abcdef.jpg", cells: [null, null] }, crops: [{ z: 2, x: 0.5, y: 0.5 }, null] };
  const wordEl = { wordCtl: { maxLength: 0, lang: "" } }; // T28：格内上限与 lang 属性随作品语言
  const e = loadAppFunctions(["draftPayload", "setLang", "setLangs", "loaderOf", "prepareLang", "cancelLang"], {
    CORE, window: env.window, state, el: wordEl, draftExtra: { extra: 1 }, hasTitle: () => false, titleRuns: () => null, draftMedia: () => media,
    LANGS: [["en"], ["fr"], ["de"], ["es"], ["it"], ["la"]],
    langLoads: { ko: LANGPACK.loader({ inject: () => new Promise(() => {}), ms: 50 }) }, // 每门语言各用一个加载器（语言多选）
  });
  let p = e.draftPayload();
  assert.equal(p.lang, "en"); assert.equal(p.extra, 1, "未知字段照写");
  assert.deepEqual(Object.keys(p).slice(0, 4), ["extra", "v", "lang", "word"]);
  assert.ok("titleRuns" in p && "filler" in p && "picks" in p, "加 lang 后其余字段照写（标题、填表人、各格）");
  e.hasTitle = () => true; e.titleRuns = () => [{ t: "我的标题", b: true }];
  assert.deepEqual(plain(e.draftPayload().titleRuns), [{ t: "我的标题", b: true }], "有标题时照写标题");
  const loading = e.prepareLang("ko"); // 加载中（50ms 后超时）
  p = e.draftPayload();
  assert.equal(p.lang, "en", "加载中保存：作品语言不变"); assert.deepEqual(plain(p.media), plain(media.media), "配图引用不丢"); assert.deepEqual(plain(p.crops), plain(media.crops));
  e.cancelLang();
  assert.equal((await loading).stale, true, "取消后迟到结果作废"); assert.equal(state.lang, "en");
  assert.equal(e.setLang("ko"), false, "规则没注册：不改"); assert.equal(state.lang, "en");
  assert.equal(e.setLang("fr"), true); assert.equal(state.lang, "fr"); assert.equal(CORE.LANG.code, "fr");
  assert.equal(wordEl.wordCtl.lang, "fr");
  assert.equal(e.draftPayload().lang, "fr");
  assert.equal("langs" in e.draftPayload(), false, "只选一门：草稿不写 langs / pickLangs，旧稿内容不变");
  // 语言多选（2026-11-12）：选了英语和法语 → 字母规则按西文（法语）；草稿写 langs 与各格的词来自哪门，lang 仍写定规则的那一门
  assert.equal(e.setLangs(["fr", "en"]), true); assert.deepEqual([plain(state.langs), state.lang, CORE.LANG.code], [["en", "fr"], "fr", "fr"], "按语言栏的顺序记；规则取西文");
  assert.deepEqual(plain(CORE.activeLangs()), ["en", "fr"]);
  state.pickLangs = ["fr", ""];
  { const q = e.draftPayload(); assert.deepEqual([q.lang, plain(q.langs), plain(q.pickLangs)], ["fr", ["en", "fr"], ["fr", ""]]); }
  assert.equal(e.setLangs(["en", "ko"]), false, "有没注册的语言：整个不改"); assert.deepEqual(plain(state.langs), ["en", "fr"]);
  assert.equal(e.setLangs([]), false, "至少一门");
  assert.equal(e.setLang("en"), true); assert.equal(wordEl.wordCtl.lang, "en"); assert.deepEqual(plain(state.langs), ["en"]);
}

// ---------- V003-B4-R5：换语言时格的对应（去变音符同格、连字展开、没有对应字母的格）与配图引用跟着格走 ----------
{
  // 本文件的 fr 是假规则（没有 fold）；这里另注册一门带真实比较写法的（去变音符、œ → oe，同 lang/fr/rules.js）
  CORE.addLang("fx", { letters: (t) => String(t || "").toUpperCase().replace(/[^A-ZÀ-ÖØ-ÞŒ0-9]/g, ""), fold: (x) => String(x || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\u0153/g, "oe") });
  CORE.useLang("fx");
  // 语言多选（2026-11-12）起换语言不再清空、不再重排格，入场页的 langPlan 已删；remapMedia 仍在，照测
  const e = loadAppFunctions(["remapMedia"], { CORE, prevMedia: null, mediaHeld: null });
  // 上次落盘的引用、暂未读回的引用跟着格走；原来字母对不上的格仍然对不上
  e.prevMedia = { word: "ÉTÉ", def: "d.jpg", cells: ["a.jpg", null, "c.jpg"], crops: [{ z: 2, x: 0.5, y: 0.5 }, null, null] };
  e.mediaHeld = { word: "ÉXÉ", def: null, cells: ["h0.jpg", "h1.jpg", null], crops: [null, { z: 3, x: 0.1, y: 0.2 }, null] };
  e.remapMedia([0, 1, 2], ["É", "T", "É"], ["E", "T", "E"]);
  assert.deepEqual(plain(e.prevMedia), { word: "ETE", def: "d.jpg", cells: ["a.jpg", null, "c.jpg"], crops: [{ z: 2, x: 0.5, y: 0.5 }, null, null] }, "É → E：文件名与取景原位保留，记成新字母");
  assert.deepEqual(plain(e.mediaHeld), { word: "E\u0000E", def: null, cells: ["h0.jpg", null, null], crops: [null, null, null] }, "暂未读回的引用同样保留；原来就对不上的那格不沿用");
  e.prevMedia = { word: "ŒUF", def: null, cells: ["o.jpg", "u.jpg", null], crops: [null, null, null] }; e.mediaHeld = { word: "", def: null, cells: [], crops: [] };
  e.remapMedia([0, -1, 1, 2], ["Œ", "U", "F"], ["O", "E", "U", "F"]);
  assert.deepEqual([e.prevMedia.word, plain(e.prevMedia.cells)], ["O\u0000UF", ["o.jpg", null, "u.jpg", null]], "连字展开：引用跟着格顺移");
  // 复审补：某格暂未读回的图与取景（heldAt）——没换上新图、字母对得上才算；默认图暂存时这一格配对的取景也算
  {
    const st = { letters: ["A", "Þ", "B"], images: [null, null, null], image: null };
    const h = loadAppFunctions(["heldAt"], { state: st, mediaHeld: { word: "AÞB", def: null, cells: [null, "h.jpg", null], crops: [{ z: 2 }, { z: 3 }, null] } });
    assert.deepEqual([plain(h.heldAt(0)), plain(h.heldAt(1))], [{ img: false, crop: null }, { img: true, crop: { z: 3 } }], "有暂存图的格：图与配对的取景；没有图的格不带取景");
    st.images[1] = {}; assert.deepEqual(plain(h.heldAt(1)), { img: false, crop: null }, "换上了新图：暂存的不算");
    st.images[1] = null; st.letters[1] = "X"; assert.equal(h.heldAt(1).img, false, "字母对不上：不算");
    st.letters[1] = "Þ"; h.mediaHeld = { word: "AÞB", def: "d.jpg", cells: [null, null, null], crops: [null, { z: 3 }, null] };
    assert.deepEqual(plain(h.heldAt(1)), { img: false, crop: { z: 3 } }, "默认图暂存：这一格的取景算");
    st.image = {}; assert.equal(h.heldAt(1).crop, null, "默认图已换新：旧取景不算");
  }
  CORE.useLang("en");
}

// ---------- V003-B1-R2：规则先到、词库迟到——候选 / 排名 / 自动切点按新数据重算，到了就重画，不动草稿 ----------
{
  CORE.addLang("eo", fr); CORE.useLang("eo");
  const state = { lang: "eo", letters: ["A"], picks: [["ap", ""]], glosses: [""], arts: [""], poss: [""], glossAuto: [true] };
  const listed = [], drawn = { shell: 0 };
  const hyphEo = { x: [1] };
  const inject = (url) => {
    const part = url.split("/").pop().replace(".js", "");
    if (part === "words") LANGPACK.put("eo", "words", { a: [["apple", "n.苹果"], ["apricot", "n.杏"]] });
    if (part === "block") BLOCK.add("eo", { words: ["xeo"] });
    return Promise.resolve();
  };
  let quiet = 0;
  const e = loadAppFunctions(["langData", "words", "moreWords", "rankOf", "autoCut", "renderWordBar", "cellState", "ownArticle", "prepareLang", "refreshPicks", "spellingFor", "itemFor"], {
    preserveWordCase: () => false, quietly: (fn) => { quiet++; fn(); }, defaultSense: CORE.defaultSense,
    CORE, window: env.window, state, NO_WORDS: {}, cutMemo: { word: "", W: null, hyph: null, cut: null }, rankIndex: null, rankSrc: null,
    candPage: 0, candKey: "", candQuiet: false, candMemo: { key: "", list: [] },
    capitalize: CORE.capitalize, blocked: CORE.blocked, lookup: () => null,
    showBar: () => {}, candItem: (it) => it[0],
    el: { senseList: {}, candList: { appendChild: (f) => listed.push(...f.items), set textContent(v) { listed.length = 0; } } },
    document: { createDocumentFragment: () => ({ items: [], appendChild(n) { this.items.push(n); } }) },
    loaderOf: (() => { const one = LANGPACK.loader({ inject, ms: 50 }); return () => one; })(),
    renderShell: () => drawn.shell++, focusKind: "word", entryFrom: "", renderEntry: () => {},
  });
  e.renderCand = () => e.renderWordBar(0);
  e.renderWordBar(0);
  assert.deepEqual(listed, [], "词库没到：ap 没有候选");
  assert.equal(e.rankOf("apple"), 1e9, "空词库建了排名索引");
  e.autoCut("abcdefghijkl"); const emptyCut = e.cutMemo;
  const before = plain(state.picks);
  const r = await e.prepareLang("eo");
  assert.equal(r.ok, true);
  assert.equal(drawn.shell, 1, "当前语言的数据到了：重画卡");
  assert.deepEqual(listed, ["apple", "apricot"], "不再输入，同一个 ap 就出候选");
  assert.deepEqual(plain(state.picks), before, "草稿内容不变");
  assert.equal(quiet, 1, "词条补齐走「不算编辑」的通道（不触发保存、不续期）");
  // V003-B4-R8：词库迟到——旧稿里缺冠词 / 冠词过时的词条按词库补齐；有效的冠词选择留着、失效的清掉；自动释义补上词性；用户的拼写与扩展位不动
  {
    const dict = { artista: ["artista", "n.艺术家", "el / la", ""], sangre: ["sangre", "n.血", "la", ""], joven: ["joven", "adj.年轻的|n.年轻人", "el / la", ""] };
    e.lookup = (w) => dict[String(w).toLowerCase()] || null;
    state.letters = ["A", "S", "J", "X"]; state.glossAuto = [true, false, true, true];
    state.picks = [["Artista", "n.艺术家"], ["sangre", "n.血", "el", "", { author: 1 }], ["joven", "adj.年轻的|n.年轻人"], ["xyz", ""]];
    state.glosses = ["", "", "原有释义", ""];
    state.arts = ["la", "el", "", ""]; state.poss = ["", "", "", ""];
    e.refreshPicks();
    assert.deepEqual(plain(state.picks), [["Artista", "n.艺术家", "el / la", ""], ["Sangre", "n.血", "la", "", { author: 1 }], ["Joven", "adj.年轻的|n.年轻人", "el / la", ""], ["xyz", ""]], "按词库补齐冠词、规范大小写，保留扩展位与自定义词");
    assert.deepEqual(plain(state.glosses), ["艺术家", "", "原有释义", ""], "词库迟到只填空的自动释义，手动留空与已写释义保留");
    assert.deepEqual(plain(state.arts), ["la", "", "", ""], "仍在选项里的选择留着，不在的清掉");
    assert.deepEqual(plain(state.poss), ["n.", "", "adj.", ""], "自动带出的释义补上词条第一个词性；自己写的释义不猜");
    state.arts[0] = ""; assert.deepEqual([0, 1, 2].map((i) => e.cellState(i)), ["art", "ok", "ok"], "补齐后：两性名词没选会被拦；单一冠词、形容词义项不用选");
    state.letters = ["A"]; state.picks = [["ap", ""]]; state.arts = [""]; state.poss = [""]; state.glossAuto = [true]; e.lookup = () => null;
  }
  // V003-B4-R11 / R12：语言多选——核对已有词条时不让「谁的词库先到」决定这个词算哪门语言的
  // R11：这一格记着的语言词库还没到，不退到别的语言里找（同形词会顶替它、冠词被清），原样留着，等它到了再核
  // R12：没记语言的格（自定义词）、记着的语言里查不到的格，要等选中的语言全部到齐，再按语言栏的先后找
  {
    const loaded = { en: true, es: false, it: false }; let cur = "en";
    const dict = { en: { idea: ["idea", "n.想法", "", ""] }, es: { idea: ["idea", "n.主意", "la", ""], mar: ["mar", "n.海", "el / la", ""] }, it: { mar: ["mar", "n.海（诗）", "", ""] } };
    // 五格：0、1 记着西语；2 没记语言、英语里有；3 没记语言、英语里没有（西、意都有）；4 记着英语但英语里没有
    const st = { lang: "es", langs: ["en", "es", "it"], pickLangs: ["es", "es", "", "", "en"], glosses: ["", "", "", "我的海", ""], letters: ["I", "M", "I", "M", "M"], glossAuto: [false, true, true, false, false], poss: ["", "n.", "", "", ""],
      picks: [["Idea", "n.主意", "la"], ["mar", "n.海", "el / la"], ["idea", ""], ["mar", ""], ["Mar", ""]], arts: ["", "el", "", "", ""] };
    const m = loadAppFunctions(["spellingFor", "itemFor", "lookupHit", "refreshPicks"], {
      preserveWordCase: () => false, capitalize: CORE.capitalize, CORE, state: st, defaultSense: CORE.defaultSense, tagLang: (x) => x,
      window: { LANGPACK: { has: (c, part) => part === "words" && !!loaded[c] } },
      inLang: (code, fn) => { const keep = cur; cur = code; try { return fn(); } finally { cur = keep; } },
      lookupIn: (w) => (loaded[cur] && dict[cur][String(w).toLowerCase()]) || null,
    });
    const start = plain(st.picks);
    m.refreshPicks(); // 只有英语在
    assert.deepEqual(plain(st.picks), start, "西语、意语没到：五格都原样留着（记着西语的不换成英语的同形词；没记语言的也先不认）");
    assert.deepEqual([plain(st.pickLangs), plain(st.arts)], [["es", "es", "", "", "en"], ["", "el", "", "", ""]], "各格记着的语言与已选的冠词不动");
    loaded.it = true; m.refreshPicks(); // 意语先到（西语慢）
    assert.deepEqual(plain(st.picks), start, "意语先到：仍然都不动——没记语言的 mar 不被先到的意语认走");
    assert.deepEqual(plain(st.pickLangs), ["es", "es", "", "", "en"]);
    loaded.es = true; m.refreshPicks(); // 西语到了，选中的三门到齐
    assert.deepEqual(plain(st.picks.slice(0, 2)), [["Idea", "n.主意", "la", ""], ["Mar", "n.海", "el / la", ""]], "记着的语言到了：按它的词库核对");
    assert.deepEqual([plain(st.pickLangs.slice(0, 2)), st.arts[1]], [["es", "es"], "el"]);
    assert.deepEqual([plain(st.picks[2]), st.pickLangs[2]], [["Idea", "n.想法", "", ""], "en"], "到齐后没记语言的格按语言栏的先后找：英语在前");
    assert.deepEqual([plain(st.picks[3]), st.pickLangs[3]], [["Mar", "n.海", "el / la", ""], "es"], "西语排在意语前：认成西语，与谁先到无关");
    assert.deepEqual([plain(st.picks[4]), st.pickLangs[4]], [["Mar", "n.海", "el / la", ""], "es"], "记着的语言里查不到：到齐后同样按先后找，拼写照用户的");
    st.picks[1] = ["xyzzy", ""]; m.refreshPicks();
    assert.deepEqual(plain(st.picks[1]), ["xyzzy", ""], "哪门都查不到（自定义词）：保留原条目");
    loaded.it = false; assert.deepEqual(plain(m.itemFor("mar")), ["Mar", "n.海", "el / la", ""], "新打的词不受影响：没到齐也照旧按选中语言的先后找");
    assert.deepEqual(plain(m.itemFor("idea", ["idea", "n.想法", "", ""], 2)), ["Idea", "n.想法", "", ""], "在自己记着的语言里查得到：不用等别的语言");
  }
  assert.equal(e.rankOf("apple"), 0, "排名按新词库重建");
  e.autoCut("abcdefghijkl");
  assert.notEqual(e.cutMemo, emptyCut, "自动切点按新词库重算"); assert.equal(e.cutMemo.W, LANGPACK.get("eo", "words"));
  LANGPACK.put("eo", "hyph", hyphEo); e.autoCut("abcdefghijkl");
  assert.equal(e.cutMemo.hyph, hyphEo, "断词表后到：自动切点重算");
  // 换回英语：缓存不串用；再切回 eo 用回 eo 的词库
  state.lang = "en"; CORE.useLang("en");
  assert.equal(e.rankOf("apple"), 1e9); assert.equal(e.rankOf("able"), 0);
  state.lang = "eo"; CORE.useLang("eo");
  assert.equal(e.rankOf("apple"), 0);
  // 加载的不是当前语言：不重画
  CORE.addLang("ia", fr); LANGPACK.put("ia", "words", {}); BLOCK.add("ia", { words: ["xia"] });
  await e.prepareLang("ia");
  assert.equal(drawn.shell, 1, "加载别的语言不重画当前作品");
  CORE.useLang("en");
}

console.log("lang ok: blocker per language + diacritics, rules registry, draft migrate by own lang, draft.js mixed / unknown lang, loader readiness / retry / timeout / stale / cancel / dedupe / isolation, payload lang");
