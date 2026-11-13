// app.js 的存储、输入事件与绘制回归；用替身隔离端能力，不读取用户存储。
import assert from "node:assert/strict";
import fs from "node:fs";
import { legacyDir } from "./legacy-packs.mjs";
const LEGACY = legacyDir(); // 旧管线词包：T19 接入后不再随包，从固定提交取出（见 legacy-packs.mjs）
import vm from "node:vm";

import { appSource as source, appSources, attachModules, loadAppFunctions } from "./app-source.mjs";
// T45 起草稿控制会调配图持久化：没自己提供替身的测试段一律补「没有配图」的默认替身（只补缺的名字，原对象照用）
const mediaDefaults = () => ({
  loadMedia: async () => ({ def: null, cells: [], lost: "", unsure: false }), syncMedia() {}, sweepMedia() {}, draftMedia: () => null,
  snapMedia: () => ({ word: "", def: null, cells: [], crops: [] }), emptyMedia: () => ({ word: "", def: null, cells: [], crops: [] }),
  prevMedia: { word: "", def: null, cells: [], crops: [] }, mediaMissing: "", mediaUnsure: false, mediaNote: () => "", SAVED: "草稿已保存。",
  mediaHeld: { word: "", def: null, cells: [], crops: [] }, heldAny: () => false, releaseHeld() {}, heldAt: () => ({ img: false, crop: null }),
  // T04：恢复 / 新作品经 app.model.setLang 设语言（替身照真实规则：只认已注册的语种）
  setLang(code) { if (!this.CORE || !this.CORE.useLang(code)) return false; if (this.state) this.state.lang = code; return true; },
});
// 语言多选（2026-11-12）：itemFor / setPick 经 lookupHit、tagLang、itemLang 记每格的词来自哪门语言。没自己提供的测试段补上按 lookup 推出来的默认替身
const load = (names, env) => { const d = mediaDefaults(); for (const k in d) if (!(k in env)) env[k] = d[k];
  if (!("setLangs" in env)) env.setLangs = function (codes) { if (!this.CORE || !this.CORE.useLangs(codes)) return false; if (this.state) { this.state.langs = codes.slice(); this.state.lang = this.CORE.LANG.code; } return true; };
  return loadAppFunctions(names, env); };
const core = { window: {} };
vm.runInNewContext(fs.readFileSync(new URL("../app/assets/core.js", import.meta.url), "utf8"), core);
const CORE = core.window.CORE;
{
  const sourceRow = ["sangre", "n.血", "la", "", { future: true }];
  const e = load(["itemFor"], { lookup: w => w.toLowerCase() === "sangre" ? sourceRow : null });
  const item = e.itemFor("Sangre");
  assert.deepEqual(item, ["Sangre", "n.血", "la", "", { future: true }], "改大小写不能丢冠词和扩展字段");
  assert.equal(sourceRow[0], "sangre", "不得改写词库源行");
  const old = ["Sangre", "n.旧义", "la", "", { author: true }];
  assert.deepEqual(e.itemFor("Sangre", old), ["Sangre", "n.血", "la", "", { author: true }], "恢复更新已知义项，保留未知元数据");
  const stale = ["Sangre", "n.旧义", "el", "中古", { author: true }];
  const noArt = load(["itemFor"], { lookup: () => ["sangre", "n.血"] });
  assert.deepEqual(noArt.itemFor("Sangre", stale), ["Sangre", "n.血", "", "", { author: true }], "词库已去掉的冠词 / 注释不能被旧草稿带回");
  assert.deepEqual(e.itemFor("自定义", ["自定义", "n.作者内容", "", "", 42]), ["自定义", "n.作者内容", "", "", 42]);
}
const key = "backronym-draft-v2";
const now = 2000000000000;
const good = { v: 2, t: now, word: "LIFE", filler: "作者", extra: { kept: true } };
const html = fs.readFileSync(new URL("../app/index.html", import.meta.url), "utf8");
for (const id of ["wordInput", "finish"]) assert.match(html, new RegExp('<[^>]+id="' + id + '"[^>]+disabled'));
assert.match(html, /id="draftStatus"[^>]*role="status"/);
let resolveRead;
const env = load(["readDraft", "restoreDraft", "applyDraft", "abandonRestore", "guardFor", "saveDraft", "within", "tagNotice"], { noticeTag: null, READ_FAIL_NOTICE: "读取失败，暂不保存，请及时导出。",
  CORE, draftGuard: null, sideGuard: null, sideKeep: "", sideRead: false, sideMsg: "", guardMsg: "", draftExtra: {}, draftLoaded: false,
  draftEpoch: 0, draftSavedAt: 0, draftNotice: "", draftContent: "",
  window: { DRAFT: { deadline: d => d.t + 64800000 } },
  saveTimer: 0, setTimeout, clearTimeout,
  draftStore: { read: () => new Promise(resolve => { resolveRead = resolve; }) },
  el: { wordInput: { disabled: true }, finish: { disabled: true } },
  state: { letters: [] }, renderShell() {}, focusEntry() {}, syncViews() {},
  setLetters(w) { env.state.letters = w.split(""); },
  setTitleRuns(runs) { env.title = runs; }, itemFor: w => [w, ""], firstOpen: () => 0,
  finishRestore() { env.restored = true; }, checkDraftExpiry: () => false,
  clearDraftView() { env.draftLoaded = false; env.draftEpoch++; env.state.letters = []; env.el.wordInput.disabled = env.el.finish.disabled = true; },
  draftPayload: () => ({ word: env.state.letters.join("") }), renderDraftStatus() {},
});
const restoring = env.restoreDraft();
assert.equal(env.el.wordInput.disabled, true);
env.saveDraft();
assert.equal(env.saveTimer, 0);
resolveRead({ entry: { obj: good, draft: CORE.migrateDraft(good), raw: JSON.stringify(good) } });
await restoring;
assert.equal(env.el.wordInput.disabled, false);
assert.equal(env.el.finish.disabled, false);
assert.equal(env.state.letters.join(""), "LIFE");
assert.equal(env.state.filler, "作者");
assert.equal(env.draftExtra.extra.kept, true);
assert.equal(env.draftSavedAt, now);
assert.equal(env.saveTimer, 0, "恢复不安排保存");
assert.equal(env.restored, true);
assert.doesNotMatch(env.draftNotice, /无法恢复/, "恢复成功只呈现恢复结果");
const blank = { v: 2, t: now, word: "", filler: "作者", titleRuns: [{ t: "标题" }] };
env.restored = false;
const restoringBlank = env.restoreDraft();
resolveRead({ entry: { obj: blank, draft: CORE.migrateDraft(blank), raw: JSON.stringify(blank) } });
await restoringBlank;
assert.equal(env.title[0].t, "标题");
assert.equal(env.state.filler, "作者");
assert.equal(env.restored, true, "空单词也完成恢复初始化");
assert.equal(env.saveTimer, 0);
assert.equal(await env.within(new Promise(() => {}), 5), undefined);
// T45 / B7-S2：恢复时先读回配图、再放开编辑。读图期间作品不可改（draftLoaded 为假、输入框禁用），读完图才套进作品
{
  let releaseMedia, seen = null;
  const withImg = { v: 2, t: now, word: "LI", media: { def: null, cells: ["m1-0123456789abcdef.jpg", null] }, crops: [{ z: 2, x: 0.5, y: 0.5 }, null] };
  const pic = { bkName: "m1-0123456789abcdef.jpg" };
  const m = load(["restoreDraft", "applyDraft", "abandonRestore", "guardFor", "readDraft", "tagNotice"], { noticeTag: null, READ_FAIL_NOTICE: "",
    CORE, draftGuard: null, sideGuard: null, sideKeep: "", sideRead: false, sideMsg: "", guardMsg: "", draftExtra: {}, draftLoaded: false,
    draftEpoch: 0, draftSavedAt: 0, draftNotice: "", draftContent: "", window: { DRAFT: { deadline: d => d.t + 64800000 } },
    draftStore: { read: async () => ({ entry: { obj: withImg, draft: CORE.migrateDraft(withImg), raw: JSON.stringify(withImg) } }) },
    el: { wordInput: { disabled: true }, finish: { disabled: true } }, state: { letters: [], images: [], crops: [], image: null },
    loadMedia: () => { seen = { loaded: m.draftLoaded, disabled: m.el.wordInput.disabled }; return new Promise(r => { releaseMedia = () => r({ def: null, cells: [pic, null], lost: "", unsure: false }); }); },
    renderShell() {}, focusEntry() {}, syncViews() {}, setLetters(w) { m.state.letters = w.split(""); m.state.images = m.state.letters.map(() => null); },
    setTitleRuns() {}, itemFor: w => [w, ""], firstOpen: () => 0, finishRestore() { m.restored = true; }, checkDraftExpiry: () => false,
    clearDraftView() {}, draftPayload: () => ({}), renderDraftStatus() {},
  });
  const p = m.restoreDraft();
  for (let i = 0; i < 6; i++) await new Promise(r => setImmediate(r));
  assert.deepEqual(seen, { loaded: false, disabled: true }, "读图时作品还不可改");
  assert.equal(m.draftLoaded, false, "图没读完：不放开编辑"); assert.equal(m.el.wordInput.disabled, true);
  releaseMedia(); await p;
  assert.equal(m.draftLoaded, true); assert.equal(m.state.images[0], pic, "读回的图套进那一格"); assert.equal(m.state.crops[0].z, 2, "取景一起恢复");
}

// T05 / T23：恢复出错（读取抛错 / 套用抛错）→ 提示、放开输入、从空白开始；存储里的原草稿一字不动，未经编辑也不会被写回。
// 编辑后覆盖主键之前的闸门：套用抛错（读到了原文）→ 先存恢复副本、确认至少一侧读回一致才覆盖；读取抛错（没拿到原文）→ 先重读主键
const settle = async () => { for (let i = 0; i < 6; i++) await new Promise(r => setImmediate(r)); };
function restoreEnv(mode, over = {}) {
  const raw = JSON.stringify(good), store = new Map([[key, raw]]), log = [];
  const f = load(["writesPending", "settleWaiters", "persistNow", "unsavedNow", "restoreDraft", "applyDraft", "abandonRestore", "guardFor", "badSides", "guardCheck", "releaseGuard", "writeDraft", "readDraft", "tagNotice"], { draftTarget: null, saveWaiters: [], noticeTag: null, READ_FAIL_NOTICE: "读取失败，暂不保存，请及时导出。",
    CORE, draftExtra: {}, draftLoaded: false, draftEpoch: 0, draftSavedAt: 0, draftGuard: null, guardEpoch: -1, sideGuard: null, sideEpoch: -1, sideKeep: "", sideRead: false, sideMsg: "", guardMsg: "",
    draftNotice: "", draftContent: "", draftWrite: 0, draftAcceptedWrite: 0, cleanupFailed: false, saveTimer: 0, clearTimeout,
    window: { DRAFT: { deadline: d => d.t + 64800000 } },
    draftStore: {
      read: mode === "读取抛错" ? () => Promise.reject(new Error("坏"))
        : mode === "读取一侧失败无原文" ? async () => ({ entry: null, expired: false, error: true })
        : mode === "原文不能套用" ? async () => ({ entry: { obj: {}, draft: null, raw }, expired: false, error: false })
        : async () => ({ entry: { obj: good, draft: CORE.migrateDraft(good), raw } }),
      write: p => { log.push("write"); store.set(key, JSON.stringify(p)); return { data: { ...p, t: Date.now() }, localOK: true, remote: Promise.resolve(true) }; },
      preserve: async r => { log.push("preserve:" + (r === raw ? "原始字节" : r)); return true; },
      recheck: async () => { log.push("recheck"); return { empty: true }; },
      ...over,
    },
    el: { wordInput: { disabled: true }, finish: { disabled: true } },
    state: { letters: [] }, renderShell() {}, focusEntry() {}, syncViews() {}, renderDraftStatus() {}, scheduleExpiry() { f.scheduled = (f.scheduled || 0) + 1; }, cleanExpiredDrafts() { f.cleaned = (f.cleaned || 0) + 1; },
    setLetters() { throw new Error("坏草稿"); }, setTitleRuns() {}, itemFor: w => [w, ""], firstOpen: () => 0, finishRestore() {},
    checkDraftExpiry: () => false,
    clearDraftView() { f.draftLoaded = false; f.draftEpoch++; f.draftGuard = null; f.state.letters = []; f.el.wordInput.disabled = f.el.finish.disabled = true; },
    draftPayload: () => ({ word: f.state.letters.join("") }),
  });
  return { f, raw, store, log };
}
for (const mode of ["读取抛错", "套用抛错"]) {
  const { f, raw, store, log } = restoreEnv(mode);
  await f.restoreDraft();
  assert.equal(f.draftLoaded, true, mode);
  assert.equal(f.el.wordInput.disabled, false, mode + "：单词框解锁");
  assert.equal(f.el.finish.disabled, false, mode + "：完成解锁");
  assert.match(f.draftNotice, /草稿无法恢复，已从空白开始/);
  assert.ok(f.scheduled >= 1, mode + "：失败后仍挂上到期清理定时器（原稿到期能在当前页清掉）");
  assert.ok(f.cleaned >= 1, mode + "：失败后也清旧版键");
  assert.equal(f.state.letters.length, 0, mode + "：从空白开始");
  f.writeDraft(); // 等同于未经编辑就关闭页面的 flush
  await settle();
  assert.deepEqual(log, [], mode + "：未经编辑不写盘、也不动副本");
  assert.equal(store.get(key), raw, mode + "：原稿不变");
  assert.equal(f.draftGuard && (mode === "套用抛错" ? f.draftGuard.raw === raw : f.draftGuard.unread === true), true, mode + "：覆盖主键前有闸门");
  f.draftPayload = () => ({ word: "NEW" }); f.writeDraft();
  assert.equal(log.includes("write") && log.indexOf("write") < log.length, false, mode + "：闸门检查是异步的，放行前主键不变");
  assert.equal(store.get(key), raw, mode + "：放行前原稿仍在");
  await settle();
  assert.equal(log.at(-1), "write", mode + "：闸门通过后真实编辑仍能保存");
  assert.equal(store.get(key), JSON.stringify({ word: "NEW" }));
  assert.equal(f.draftGuard, null, "放行后不再检查");
  assert.deepEqual(log, mode === "套用抛错" ? ["preserve:原始字节", "write"] : ["recheck", "write"], mode + "：顺序 = 先保全 / 先重读，再写");
  f.draftPayload = () => ({ word: "NEW2" }); f.writeDraft();
  assert.equal(log.at(-1), "write", "第二次保存不再过闸门（副本只写一次）");
  assert.equal(log.filter(x => x.startsWith("preserve")).length, mode === "套用抛错" ? 1 : 0);
}

// T23 · 套用抛错：副本写失败 → 不覆盖主键，编辑只留在内存，底部写明；之后副本可写了再放行
{
  let ok = false;
  const { f, raw, store, log } = restoreEnv("套用抛错", { preserve: async r => { log.push("preserve"); return ok; } });
  await f.restoreDraft();
  f.draftPayload = () => ({ word: "NEW" }); f.writeDraft(); await settle();
  assert.equal(store.get(key), raw, "副本没保住：原稿仍在主键");
  assert.deepEqual(log, ["preserve"], "没有写主键");
  assert.match(f.draftNotice, /原稿无法保全，暂不保存，请及时导出/);
  assert.notEqual(f.draftGuard, null, "闸门仍关着");
  f.draftPayload = () => ({ word: "NEW2" }); f.writeDraft(); await settle();
  assert.deepEqual(log, ["preserve", "preserve"], "下一次编辑再试");
  assert.equal(store.get(key), raw);
  ok = true;
  f.draftPayload = () => ({ word: "NEW3" }); f.writeDraft(); await settle();
  assert.equal(log.at(-1), "write"); assert.equal(store.get(key), JSON.stringify({ word: "NEW3" }));
  // preserve 抛错同样当失败处理
  const g = restoreEnv("套用抛错", { preserve: async () => { throw new Error("存储炸了"); } });
  await g.f.restoreDraft(); g.f.draftPayload = () => ({ word: "NEW" }); g.f.writeDraft(); await settle();
  assert.equal(g.store.get(key), g.raw); assert.match(g.f.draftNotice, /无法保全/);
}

// T30 · persistNow：等这一版真正写进才给结果。原稿闸门拦住 → { ok: false, reason: "guard" }，主键不动；闸门放行后重试 → 成功；
// 写入两侧都失败 → reason "write"；已写过同样内容 → 直接成功；迟到的旧写入确认不替更新的一版作证
{
  let ok = false;
  const { f, raw, store, log } = restoreEnv("套用抛错", { preserve: async () => { log.push("preserve"); return ok; } });
  await f.restoreDraft();
  f.draftPayload = () => ({ word: "NEW" });
  assert.equal(f.unsavedNow(), true, "闸门拦着：内存里的修改算未保存");
  assert.deepEqual(JSON.parse(JSON.stringify(await f.persistNow())), { ok: false, reason: "guard" }, "闸门拦住：保存失败（原稿保护）");
  assert.equal(store.get(key), raw, "主键不动");
  ok = true;
  assert.deepEqual(JSON.parse(JSON.stringify(await f.persistNow())), { ok: true }, "闸门放行：重试成功");
  assert.equal(store.get(key), JSON.stringify({ word: "NEW" })); assert.equal(f.unsavedNow(), false);
  assert.deepEqual(JSON.parse(JSON.stringify(await f.persistNow())), { ok: true }, "内容没变：直接成功，不再写");
  assert.equal(log.filter(x => x === "write").length, 1);
  // 写入失败：本地写不进、端侧也失败
  let remoteDone;
  f.draftStore.write = p => { log.push("write"); return { data: { ...p, t: Date.now() }, localOK: false, remote: new Promise(r => { remoteDone = r; }) }; };
  f.draftPayload = () => ({ word: "NEW2" });
  const late = f.persistNow();
  f.draftPayload = () => ({ word: "NEW3" });
  const fresh = f.persistNow(); // 等待期间又写了更新的一版
  const order = []; late.then(r => order.push(["late", r.ok])); fresh.then(r => order.push(["fresh", r.ok]));
  remoteDone(true); await settle(); // 第 2 次写入（NEW3）的端侧确认：两个等待都算写成（更新的一版包含旧的修改）
  assert.deepEqual(order, [["late", true], ["fresh", true]], "更新的一版写成：之前等的也一并确认");
  f.draftStore.write = p => ({ data: { ...p, t: Date.now() }, localOK: false, remote: Promise.resolve(false) });
  f.draftPayload = () => ({ word: "NEW4" });
  assert.deepEqual(JSON.parse(JSON.stringify(await f.persistNow())), { ok: false, reason: "write" }, "两侧都没写进：保存失败（写入）");
  assert.match(f.draftNotice, /未确认保存成功/);
}

// B2-R1 · A → B（在途）→ 改回 A：不能当成「没改」。要另写一次 A，B 落盘不算 A 已保存；A 确认后才算保存；最新一次失败后同样内容可重写
{
  const { f, log } = restoreEnv("套用抛错");
  await f.restoreDraft();
  f.draftPayload = () => ({ word: "A" }); f.writeDraft(); await settle(); // 过闸门，A 写成
  assert.equal(f.unsavedNow(), false, "A 已确认");
  const pend = [];
  f.draftStore.write = p => { log.push("write:" + p.word); return { data: { ...p, t: Date.now() }, localOK: false, remote: new Promise(r => pend.push(r)) }; };
  f.draftPayload = () => ({ word: "B" }); f.writeDraft(); // B 在途（本地写不进、端侧慢）
  f.draftPayload = () => ({ word: "A" });
  assert.equal(f.unsavedNow(), true, "B 在途：改回 A 也算未保存");
  let got; f.persistNow().then(r => { got = r; });
  assert.equal(log.filter(x => x === "write:A").length, 1, "改回 A 要另写一次（纠正 B）");
  f.writeDraft(); assert.equal(log.filter(x => x === "write:A").length, 1, "同样的 A 已在途：不重复写、不续期");
  pend[0](true); await settle(); // 旧的 B 落盘
  assert.equal(got, undefined, "B 落盘不算 A 已保存"); assert.match(f.draftNotice, /新修改尚未确认保存/, "状态行不提前说已保存");
  assert.equal(f.unsavedNow(), true);
  pend[1](true); await settle(); // A 落盘
  assert.deepEqual(JSON.parse(JSON.stringify(got)), { ok: true }, "A 确认后保存才成功"); assert.match(f.draftNotice, /草稿已保存/); assert.equal(f.unsavedNow(), false);
  // 最新一次写入失败：同样内容下次照样重写（不被去重挡掉）
  f.draftPayload = () => ({ word: "C" }); f.writeDraft(); pend[2](false); await settle();
  assert.match(f.draftNotice, /未确认保存成功/);
  f.writeDraft(); assert.equal(log.filter(x => x === "write:C").length, 2, "失败后同样内容重写");
}

// B4-S2 · 大图关闭后不再持有缩略图按钮引用；完成面板开关 / 草稿重载时预览状态清干净（换张后关闭仍把焦点交给当前这张）
{
  const focused = [], thumb = (i) => ({ focus() { focused.push(i); }, scrollIntoView() {} });
  const thumbs = [thumb(0), thumb(1), thumb(2)];
  const env = load(["closeViewer", "resetPreview"], {
    viewAt: 2, viewFrom: thumbs[0],
    el: { viewer: { hidden: false }, viewImg: { removeAttribute(n) { env.removed = n; } }, finThumbs: { textContent: "x", hidden: false, querySelectorAll: () => thumbs } },
  });
  env.closeViewer();
  assert.deepEqual(focused, [2], "换张后关闭：焦点给当前这张");
  assert.equal(env.viewFrom, null, "关闭后不再持有打开时的按钮");
  env.viewFrom = thumbs[1]; env.el.viewer.hidden = false;
  env.resetPreview();
  assert.deepEqual([env.viewAt, env.viewFrom, env.el.viewer.hidden, env.el.finThumbs.textContent, env.el.finThumbs.hidden, env.removed], [-1, null, true, "", true, "src"], "预览状态清干净");
}

// T23 · 读到的原文结构不能用（draft 为 null）：不抛错，但同样先保全再覆盖
{
  const { f, raw, store, log } = restoreEnv("原文不能套用");
  await f.restoreDraft();
  assert.equal(f.draftLoaded, true); assert.equal(f.el.wordInput.disabled, false);
  f.writeDraft(); await settle();
  assert.deepEqual(log, [], "未经编辑不写");
  f.draftPayload = () => ({ word: "NEW" }); f.writeDraft(); await settle();
  assert.deepEqual(log, ["preserve:原始字节", "write"]);
}

// T23 · 读取抛错 / 读取一侧失败又没拿到原文：不以空稿回写；覆盖前先重读
for (const mode of ["读取抛错", "读取一侧失败无原文"]) {
  // 重读仍失败 → 不写，写明
  let n = 0;
  const a = restoreEnv(mode, { recheck: async () => { n++; return { failed: true }; } });
  await a.f.restoreDraft();
  if (mode === "读取一侧失败无原文") { assert.equal(a.f.draftLoaded, true); assert.doesNotMatch(a.f.draftNotice, /无法恢复/); }
  a.f.draftPayload = () => ({ word: "NEW" }); a.f.writeDraft(); await settle();
  assert.equal(a.store.get(key), a.raw, mode + "：重读失败不覆盖"); assert.deepEqual(a.log, []);
  assert.match(a.f.draftNotice, /读取失败，暂不保存，请及时导出/);
  a.f.draftPayload = () => ({ word: "NEW2" }); a.f.writeDraft(); await settle();
  assert.equal(n, 2, "下一次编辑再重读");
  // 重读读到原文 → 走保全流程，再写
  const bRaw = JSON.stringify({ v: 2, t: now, word: "OTHER" });
  const b = restoreEnv(mode, { recheck: async () => ({ raw: bRaw }) });
  await b.f.restoreDraft(); b.f.draftPayload = () => ({ word: "NEW" }); b.f.writeDraft(); await settle();
  assert.deepEqual(b.log, ["preserve:" + bRaw, "write"], mode + "：重读到原文 → 先保全再覆盖");
  // 重读确认为空 / 已过期 → 放行（已在上面的通用用例覆盖 empty）
}
// 读取一侧失败但读到了有效稿：照常恢复（沿用「取较新的一份」），不挂闸门
{
  const entryGood = { obj: good, draft: CORE.migrateDraft(good), raw: JSON.stringify(good) };
  const h = restoreEnv("正常", { read: async () => ({ entry: entryGood, expired: false, error: true }) });
  h.f.setLetters = w => { h.f.state.letters = w.split(""); };
  await h.f.restoreDraft();
  assert.equal(h.f.draftGuard, null); assert.equal(h.f.state.letters.join(""), "LIFE");
}
// 被更新的一次恢复取代后，旧的失败不能解锁或清空新的一次
{
  const g = load(["restoreDraft", "applyDraft", "abandonRestore", "guardFor", "readDraft", "tagNotice"], { noticeTag: null, READ_FAIL_NOTICE: "读取失败，暂不保存，请及时导出。",
    draftEpoch: 0, draftLoaded: false, draftGuard: null, sideGuard: null, sideKeep: "", sideRead: false, sideMsg: "", guardMsg: "", el: { wordInput: { disabled: true }, finish: { disabled: true } },
    draftStore: { read: () => new Promise((_, reject) => { g.fail = reject; }) },
  });
  const p = g.restoreDraft(); g.draftEpoch++; g.fail(new Error("旧的")); await p;
  assert.equal(g.draftLoaded, false);
  assert.equal(g.el.wordInput.disabled, true);
  assert.equal(g.draftGuard, null);
}
// 闸门检查进行中换了一轮恢复：旧结果作废，不放行新一轮
{
  let release;
  const { f, raw, store, log } = restoreEnv("套用抛错", { preserve: () => new Promise(r => { release = () => r(true); }) });
  await f.restoreDraft();
  f.draftPayload = () => ({ word: "NEW" }); f.writeDraft();
  f.draftEpoch++; f.draftGuard = { raw: "新一轮的闸门" }; // 模拟 reloadDraft：clearDraftView 后又读到新的失败
  release(); await settle();
  assert.deepEqual(log, [], "旧一轮的保全结果不写主键");
  assert.notEqual(f.draftGuard, null, "新一轮的闸门不被旧结果拆掉");
}

// T17：逐格选词只认首字母；关键字母圆圈整套已删
{
  assert.doesNotMatch(html, /kdots/, "index.html 没有 #kdots");
  assert.doesNotMatch(source, /kdot|letterPositions|pickKeyAt|点圆圈/, "app.js 里没有圆圈高亮的残留");
  const c = load(["cellState", "setPick"], { CORE, state: { letters: ["I", "I", "E"], picks: [["idea", ""], ["live", ""], null], glosses: ["", "", ""], glossAuto: [true, true, true], keys: [0, 0, 0], arts: ["", "", ""] } });
  assert.deepEqual([0, 1, 2].map((i) => c.cellState(i)), ["ok", "bad", "empty"], "idea 在 I 格 ok；live 放在 I 格 bad（i 只在词中）；没打 empty");
  // v00.03.00 T22：两性名词的冠词由用户选——没选是 art（点「完成」会被拦下），选了 ok；换词即清，同一个词重查时选项里还有才留着
  c.setPick(0, ["idea", "观念", "el / la"]); assert.equal(c.cellState(0), "art", "二选一还没选");
  c.state.arts[0] = "la"; assert.equal(c.cellState(0), "ok", "选了");
  c.setPick(0, ["idea", "观念", "el / la"]); assert.equal(c.state.arts[0], "la", "同一个词重查：选择留着");
  c.setPick(0, ["idea", "观念", "el"]); assert.equal(c.state.arts[0], "", "选项里没有了：清掉");
  c.state.arts[0] = "la"; c.setPick(0, ["ideal", "理想", "el / la"]); assert.equal(c.state.arts[0], "", "换了词：清掉");
  c.setPick(0, ["idea", "", "la"]); assert.equal(c.cellState(0), "ok", "单一冠词不用选");
  // V003-B4-R7：setPick 记下自动带出的释义的词性；保留着用户自己的释义时，同一个词沿用、换了词不确定
  const m = load(["cellState", "setPick"], { CORE, defaultSense: CORE.defaultSense, state: { letters: ["J"], picks: [null], glosses: [""], glossAuto: [true], keys: [0], arts: [""], poss: [""] } });
  const JEUNE = ["jeune", "adj.年轻的|n.年轻人", "le / la"];
  m.setPick(0, JEUNE); assert.deepEqual([m.state.poss[0], m.cellState(0)], ["adj.", "ok"], "自动带出形容词义项：不用选冠词");
  m.state.poss[0] = "n."; m.state.glossAuto[0] = false; m.state.glosses[0] = "年轻人"; assert.equal(m.cellState(0), "art", "名词义项：要选");
  m.setPick(0, JEUNE.slice()); assert.equal(m.state.poss[0], "n.", "同一个词重查：记的词性留着");
  m.setPick(0, ["jeunesse", "n.青春", "la"]); assert.equal(m.state.poss[0], "", "换了词又留着自己的释义：不确定（只有一种词性时按那一种）");
  assert.equal(m.cellState(0), "ok");
}

// T23 补充返工：本地旧稿 LIFE 可读，端上较新的 LOVE 读取失败但仍可写；用户把 LIFE 改成 LIVE。
// 用真实的 draft.js（假时钟、内存存储）+ 真实的 app.js 草稿函数：覆盖端上那一侧之前先重读核实，LOVE 任何时候都能取回
{
  let clock = now;
  const dctx = { window: {}, Date: { now: () => clock }, setTimeout, clearTimeout };
  for (const file of ["core.js", "draft.js"]) vm.runInNewContext(fs.readFileSync(new URL("../app/assets/" + file, import.meta.url), "utf8"), dctx);
  const D = dctx.window.DRAFT, K = D.KEY, R = D.RESCUE;
  const rawOf = (word, t) => JSON.stringify({ v: 2, word, t, future: { keep: [1, 2] } }); // 带未知字段：保全必须保留原始字节
  const LIFE = rawOf("LIFE", now - 5000), LOVE = rawOf("LOVE", now - 1000);
  const pk = (...xs) => JSON.stringify(xs); // 副本键内容：原文数组（多份副本）
  function sideEnv(opts = {}) {
    const local = opts.local || new Map([[K, LIFE]]), remote = opts.remote || new Map([[K, LOVE]]), log = [];
    const ctl = { remoteRead: opts.remoteRead ?? false, localRead: opts.localRead ?? true, rescueFail: !!opts.rescueFail, localSetFail: false };
    const store = D.create({
      getItem: k => { if (!ctl.localRead) throw new Error("本地读取失败"); return local.has(k) ? local.get(k) : null; },
      setItem: (k, v) => { if (ctl.localSetFail || (ctl.rescueFail && k === R)) throw new Error("本地写不进"); local.set(k, v); log.push("本地写:" + k); },
      removeItem: k => local.delete(k),
    }, name => (opts.noGet && name === "getStorage" ? null : ({ // noGet：端侧写得进、没有读能力
      getStorage: { getStorage: async ({ key }) => { if (!ctl.remoteRead) throw new Error("端存储读取失败"); return { data: remote.get(key) ?? null }; } },
      setStorage: { setStorage: async ({ key, data }) => { if (ctl.gate && key === K) await ctl.gate; if (ctl.rescueFail && key === R) throw new Error("端存储写不进"); remote.set(key, data); log.push("端写:" + key); } },
      removeStorage: { removeStorage: async ({ key }) => { remote.delete(key); } },
    })[name]) || null);
    const f = load(["writesPending", "settleWaiters", "restoreDraft", "applyDraft", "abandonRestore", "guardFor", "badSides", "guardCheck", "releaseGuard", "sideNotice", "sideCheck", "releaseSides", "writeDraft", "readDraft", "tagNotice", ...(opts.extra || [])], { draftTarget: null, saveWaiters: [], noticeTag: null, READ_FAIL_NOTICE: "读取失败，暂不保存，请及时导出。",
      CORE, window: { DRAFT: D }, Date: { now: () => clock }, draftStore: store, draftExtra: {}, draftLoaded: false, draftEpoch: 0, draftSavedAt: 0, draftGuard: null, guardEpoch: -1, sideGuard: null, sideEpoch: -1, sideKeep: "", sideRead: false, sideMsg: "", guardMsg: "",
      draftNotice: "", draftContent: "", draftWrite: 0, draftAcceptedWrite: 0, cleanupFailed: false, saveTimer: 0, clearTimeout,
      el: { wordInput: { disabled: true }, finish: { disabled: true } }, state: { letters: [] },
      renderShell() {}, focusEntry() {}, syncViews() {}, renderDraftStatus() {}, scheduleExpiry() {}, cleanExpiredDrafts() {}, finishRestore() {}, setTitleRuns() {},
      setLetters(w) { f.state.letters = w.split(""); }, itemFor: w => [w, ""], firstOpen: () => 0, checkDraftExpiry: () => false, reloadDraft() {},
      clearDraftView() { f.draftLoaded = false; f.draftEpoch++; f.draftGuard = null; f.sideGuard = null; f.state.letters = []; f.el.wordInput.disabled = f.el.finish.disabled = true; },
      draftPayload: () => ({ v: 2, word: f.state.letters.join("") }),
    });
    return { f, local, remote, log, ctl };
  }
  const edit = async (e, word) => { e.f.state.letters = word.split(""); e.f.writeDraft(); await settle(); };
  const word = raw => JSON.parse(raw).word;

  // 路径一：端侧持续读失败（但写得进）。LIFE → LIVE 允许继续编辑，本地照常写，端上的 LOVE 一个字节都不动，提示写明
  {
    const e = sideEnv();
    await e.f.restoreDraft();
    assert.equal(e.f.state.letters.join(""), "LIFE", "读到的是本地的 LIFE");
    assert.equal(e.f.draftGuard, null, "整体不挂闸门（有稿可恢复）");
    assert.deepEqual({ ...e.f.sideGuard }, { remote: true, local: false }, "记下是端侧读失败");
    await edit(e, "LIVE");
    assert.equal(word(e.local.get(K)), "LIVE", "允许继续编辑，本地照常写");
    assert.equal(e.remote.get(K), LOVE, "端上较新的 LOVE 没被覆盖（原始字节不变）");
    assert.ok(!e.log.some(x => x.startsWith("端写")), "没有任何端存储写入（连副本也没写：没读到就没有可保全的）");
    assert.match(e.f.draftNotice, /有一处存储读取失败，暂不覆盖它，请及时导出/);
    assert.notEqual(e.f.sideGuard, null, "仍未核实");
    await edit(e, "LIVEN"); await edit(e, "LIVER");
    assert.equal(word(e.local.get(K)), "LIVER", "之后的编辑本地照常保存");
    assert.equal(e.remote.get(K), LOVE, "多次编辑后端上 LOVE 仍原样");
    // 端侧恢复可读之后重开：LOVE 还在、仍可读到
    e.ctl.remoteRead = true;
    const again = await D.create({ getItem: k => (e.local.has(k) ? e.local.get(k) : null), setItem() {}, removeItem() {} }, () => ({ getStorage: async ({ key }) => ({ data: e.remote.get(key) ?? null }) })).read();
    assert.ok(again.entry, "能读到稿");
    assert.equal(e.remote.get(K), LOVE, "LOVE 仍可取回");
  }
  // 路径二：端侧恢复可读。改成 LIVE 时先重读到 LOVE → 先存副本（原始字节、原时间戳，两侧读回确认）→ 再覆盖
  {
    const e = sideEnv();
    await e.f.restoreDraft();
    e.ctl.remoteRead = true; // 恢复可读
    await edit(e, "LIVE");
    assert.equal(e.local.get(R), pk(LOVE), "本地副本 = LOVE 原始字节（含未知字段与原时间戳）");
    assert.equal(e.remote.get(R), pk(LOVE), "端存储副本 = LOVE 原始字节");
    assert.equal(word(e.remote.get(K)), "LIVE", "核实并保全后才覆盖端上的主键");
    assert.equal(word(e.local.get(K)), "LIVE");
    assert.ok(e.log.indexOf("端写:" + R) >= 0 && e.log.indexOf("端写:" + R) < e.log.indexOf("端写:" + K), "顺序：先写副本，后覆盖端上主键");
    assert.equal(e.f.sideGuard, null, "核实后不再拦");
    assert.match(e.f.draftNotice, /草稿已保存/);
    // 第二次编辑不再重读、不再写副本
    const before = e.log.filter(x => x === "端写:" + R).length;
    await edit(e, "LIVEN");
    assert.equal(e.log.filter(x => x === "端写:" + R).length, before, "副本只写一次");
    assert.equal(word(e.remote.get(K)), "LIVEN");
    assert.equal(e.local.get(R), pk(LOVE), "副本不随之后的编辑改动");
    // 副本按 LOVE 自己的时间 + 18 小时到期（不续期）：到期前仍在，到期后被清
    const store = D.create({ getItem: k => (e.local.has(k) ? e.local.get(k) : null), setItem: (k, v) => e.local.set(k, v), removeItem: k => e.local.delete(k) },
      () => ({ getStorage: async ({ key }) => ({ data: e.remote.get(key) ?? null }), removeStorage: async ({ key }) => { e.remote.delete(key); } }));
    clock = now - 1000 + D.TTL - 1;
    assert.equal((await store.read()).entry.draft.word, "LIVEN", "到期前读到的是最新稿");
    assert.equal(e.local.get(R), pk(LOVE), "到期前一毫秒副本仍在");
    clock = now - 1000 + D.TTL;
    await store.purge();
    assert.equal(e.local.get(R) ?? null, null, "到期后副本被清"); assert.equal(e.remote.get(R) ?? null, null);
    clock = now;
  }
  // 路径三：重读到 LOVE 但副本存不下 → 不覆盖端上 LOVE（本地照常写），提示无法保全；副本恢复后下一次编辑放行
  {
    const e = sideEnv({ rescueFail: true });
    await e.f.restoreDraft();
    e.ctl.remoteRead = true;
    await edit(e, "LIVE");
    assert.equal(word(e.local.get(K)), "LIVE", "本地照常写");
    assert.equal(e.remote.get(K), LOVE, "保全失败：端上 LOVE 不动");
    assert.match(e.f.draftNotice, /原稿无法保全，暂不覆盖它/);
    assert.notEqual(e.f.sideGuard, null);
    e.ctl.rescueFail = false;
    await edit(e, "LIVEN");
    assert.equal(e.remote.get(R), pk(LOVE), "副本恢复可写后保全了 LOVE");
    assert.equal(word(e.remote.get(K)), "LIVEN", "再覆盖");
    assert.equal(e.f.sideGuard, null);
  }
  // 路径四：重读时端上那一键已是空的 → 直接放行
  {
    const e = sideEnv();
    await e.f.restoreDraft();
    e.remote.delete(K); e.ctl.remoteRead = true;
    await edit(e, "LIVE");
    assert.equal(word(e.remote.get(K)), "LIVE"); assert.equal(e.remote.get(R) ?? null, null, "没有可保全的原稿，不写副本");
  }
  // 套用抛错（读到了 LIFE，但端侧读失败）：既要先保全 LIFE，端上的 LOVE 在核实前也不能被覆盖
  {
    const e = sideEnv();
    e.f.setLetters = () => { throw new Error("坏草稿"); };
    await e.f.restoreDraft();
    assert.equal(e.f.draftGuard.raw, LIFE); assert.deepEqual({ ...e.f.sideGuard }, { remote: true, local: false }, "abandonRestore 之后侧闸门仍在");
    await edit(e, "LIVE");
    assert.equal(e.local.get(R), pk(LIFE), "先保全了读到的 LIFE"); assert.equal(word(e.local.get(K)), "LIVE");
    assert.equal(e.remote.get(K), LOVE, "端上 LOVE 没被覆盖（端侧仍读不了）");
  }
  // 重读在飞行中又换了一轮恢复：旧结果作废，不放行新一轮
  {
    const e = sideEnv();
    await e.f.restoreDraft();
    e.ctl.remoteRead = true;
    e.f.state.letters = "LIVE".split(""); e.f.writeDraft();
    e.f.draftEpoch++; e.f.sideGuard = { remote: true, local: false }; // 模拟 reloadDraft 后又读到新的失败
    await settle();
    assert.equal(e.remote.get(K), LOVE, "旧一轮的核实结果不写端上主键");
    assert.notEqual(e.f.sideGuard, null, "新一轮的侧闸门不被旧结果拆掉");
  }
  // 整体读取失败（没拿到任何原文）仍走原来的 unread 闸门，不用侧闸门
  {
    const e = sideEnv();
    e.local.delete(K);
    await e.f.restoreDraft();
    assert.deepEqual({ ...e.f.draftGuard }, { unread: true }); assert.equal(e.f.sideGuard, null);
  }
  // 读失败的一侧后来读到的正是恢复稿本身（同字节）：放行，不往副本里塞重复的恢复稿
  {
    const e = sideEnv({ remote: new Map([[K, LIFE]]) });
    await e.f.restoreDraft();
    e.ctl.remoteRead = true;
    await edit(e, "LIVE");
    assert.equal(e.remote.get(R) ?? null, null, "同字节不保全"); assert.equal(e.local.get(R) ?? null, null);
    assert.equal(word(e.remote.get(K)), "LIVE");
  }
  // Astra 复验①：启动时两侧都读失败（整体闸门），编辑前两侧都恢复且原稿不同 → LIFE、LOVE 都要先保全，再双写
  {
    const e = sideEnv({ localRead: false });
    await e.f.restoreDraft();
    assert.deepEqual({ ...e.f.draftGuard }, { unread: true }, "两侧都读失败：整体闸门");
    e.ctl.localRead = true; e.ctl.remoteRead = true;
    await edit(e, "NEW");
    assert.equal(e.local.get(R), pk(LOVE, LIFE), "本地副本两份都在"); assert.equal(e.remote.get(R), pk(LOVE, LIFE), "端存储副本两份都在");
    assert.equal(word(e.local.get(K)), "NEW"); assert.equal(word(e.remote.get(K)), "NEW");
    assert.equal(e.f.sideGuard, null); assert.match(e.f.draftNotice, /草稿已保存/);
  }
  // Astra 复验②：两侧都读失败，之后只有本地恢复 → 保全 LIFE、写本地；端侧仍读不了 → 转交侧闸门，端上 LOVE 不被覆盖；端侧恢复后先保全 LOVE 再覆盖
  {
    const e = sideEnv({ localRead: false });
    await e.f.restoreDraft();
    e.ctl.localRead = true;
    await edit(e, "NEW");
    assert.equal(e.remote.get(K), LOVE, "仍读不了的端侧：LOVE 原样"); assert.equal(word(e.local.get(K)), "NEW", "读到的本地照常写");
    assert.equal(e.local.get(R), pk(LIFE), "LIFE 先进了本地副本");
    assert.equal(e.f.draftGuard, null); assert.deepEqual({ ...e.f.sideGuard }, { remote: true, local: false }, "端侧转交侧闸门");
    assert.match(e.f.draftNotice, /有一处存储读取失败，暂不覆盖它/);
    e.ctl.remoteRead = true;
    await edit(e, "NEWER");
    assert.ok(JSON.parse(e.remote.get(R)).includes(LOVE), "端侧恢复后 LOVE 先进副本"); assert.equal(word(e.remote.get(K)), "NEWER", "再覆盖");
    assert.equal(e.f.sideGuard, null);
  }
  // Astra 复验③：从较新的副本恢复、两侧主键都要先保全（双侧侧闸门）；编辑时端侧读失败、本地成功 → 只放行本地，端上 LOVE 不动
  {
    const COPY = rawOf("COPY", now - 10);
    const e = sideEnv({ remoteRead: true, local: new Map([[K, LIFE], [R, pk(COPY)]]) });
    await e.f.restoreDraft();
    assert.equal(e.f.state.letters.join(""), "COPY");
    assert.deepEqual({ ...e.f.sideGuard }, { remote: true, local: true }, "两侧主键都与恢复稿不同");
    e.ctl.remoteRead = false;
    await edit(e, "NEW");
    assert.equal(e.remote.get(K), LOVE, "端侧没核实：LOVE 不被覆盖");
    assert.ok(JSON.parse(e.local.get(R)).includes(LIFE), "本地 LIFE 先进副本"); assert.equal(word(e.local.get(K)), "NEW", "核实过的本地放行");
    assert.deepEqual({ ...e.f.sideGuard }, { remote: true, local: false }, "端侧仍留在侧闸门");
  }
  // Astra 复验（第 2 轮）：侧闸门核实先失败、另一侧的保存确认迟到 → 失败提示不能被改成「正在保存」
  // （「无法保全」走不到这个时序：端侧副本写入与主键写入同在串行队列里，保全结果总在主键确认之后，只断言最终提示）
  for (const [name, setup, want, racy] of [
    ["读取失败", e => { e.ctl.localRead = false; }, /有一处存储读取失败，暂不覆盖它/, true],
    ["无法保全", e => { e.ctl.rescueFail = true; }, /有一处存储里的原稿无法保全，暂不覆盖它/, false],
  ]) {
    const e = sideEnv({ remoteRead: true });
    await e.f.restoreDraft();
    assert.deepEqual({ ...e.f.sideGuard }, { remote: false, local: true }); assert.equal(e.f.sideRead, false, name + "：起初两侧都读得到");
    setup(e);
    let open; e.ctl.gate = new Promise(r => { open = r; });
    await edit(e, "LOVER");
    if (racy) assert.match(e.f.draftNotice, want, name + "：核实失败先提示");
    open(); await settle();
    assert.equal(word(e.remote.get(K)), "LOVER", name + "：端侧保存迟到后成功");
    assert.match(e.f.draftNotice, want, name + "：迟到的保存确认不覆盖失败提示");
    assert.equal(e.local.get(K), LIFE, name + "：本地 LIFE 仍原样");
    // 之后核实通过：提示恢复正常
    e.ctl.localRead = true; e.ctl.rescueFail = false;
    await edit(e, "LOVERS");
    assert.equal(e.f.sideGuard, null); assert.match(e.f.draftNotice, /草稿已保存/, name + "：解除后正常提示");
    assert.ok(JSON.parse(e.local.get(R)).includes(LIFE), name + "：解除前 LIFE 已进副本");
  }
  // Astra 复验（第 3 轮）：副本已满、双侧侧闸门都拦着 → 清理先失败再重试成功，不能把没落盘的 NEW 说成「草稿已保存」
  {
    const COPY = rawOf("COPY", now - 10), A = rawOf("AAA", now - 20), B = rawOf("BBB", now - 30);
    const full = pk(COPY, A, B);
    const e = sideEnv({ remoteRead: true, local: new Map([[K, LIFE], [R, full]]), remote: new Map([[K, LOVE], [R, full]]), extra: ["cleanExpiredDrafts", "pendingWarning", "unsavedNow"] });
    await e.f.restoreDraft();
    assert.equal(e.f.state.letters.join(""), "COPY"); assert.deepEqual({ ...e.f.sideGuard }, { remote: true, local: true });
    await edit(e, "NEW");
    assert.match(e.f.draftNotice, /原稿无法保全，暂不覆盖它/, "副本满：保全失败");
    assert.equal(e.local.get(K), LIFE); assert.equal(e.remote.get(K), LOVE);
    e.ctl.remoteRead = false; await e.f.cleanExpiredDrafts();
    assert.match(e.f.draftNotice, /原稿无法保全，暂不覆盖它，请及时导出。 部分存储清理未完成/, "清理失败：保全警告还在，后面接上清理失败");
    e.ctl.remoteRead = true; await e.f.cleanExpiredDrafts();
    assert.doesNotMatch(e.f.draftNotice, /草稿已保存/, "清理重试成功不能说成已保存");
    assert.match(e.f.draftNotice, /原稿无法保全，暂不覆盖它/, "恢复保全警告");
    assert.equal(e.local.get(K), LIFE, "NEW 确实没落盘"); assert.equal(e.remote.get(K), LOVE);
  }
  // 整体闸门拦着（两侧都读不了）：清理失败再成功后，仍是「读取失败，暂不保存」
  {
    const e = sideEnv({ localRead: false, extra: ["cleanExpiredDrafts", "pendingWarning", "unsavedNow"] });
    await e.f.restoreDraft();
    await edit(e, "NEW");
    assert.match(e.f.draftNotice, /读取失败，暂不保存/);
    await e.f.cleanExpiredDrafts();
    e.ctl.localRead = true; e.ctl.remoteRead = true; await e.f.cleanExpiredDrafts();
    assert.match(e.f.draftNotice, /读取失败，暂不保存/, "整体闸门的警告不被清理改写");
    assert.equal(e.local.get(K), LIFE); assert.equal(e.remote.get(K), LOVE);
  }
  // 没有闸门、但修改没被任何一侧确认写入：清理重试成功后显示「新修改尚未确认保存」，不说已保存
  {
    const e = sideEnv({ remoteRead: true, local: new Map([[K, LOVE]]), extra: ["cleanExpiredDrafts", "pendingWarning", "unsavedNow"] });
    await e.f.restoreDraft();
    e.ctl.localSetFail = true; e.ctl.remoteRead = false;
    e.remote.set = () => { throw new Error("端存储写不进"); }; // 两侧都写不进；端侧读失败让第一次清理失败
    await edit(e, "NEW");
    await e.f.cleanExpiredDrafts();
    e.ctl.remoteRead = true; await e.f.cleanExpiredDrafts();
    assert.match(e.f.draftNotice, /新修改尚未确认保存/, "未确认写入：不说已保存");
  }
  // Astra 复审（a36dd68）P1：端侧有 setStorage、没有 getStorage（写得进、读不了）→ 当作端侧读失败，端上的 LOVE 不被覆盖，本地照常保存
  {
    const e = sideEnv({ remoteRead: true, noGet: true });
    await e.f.restoreDraft();
    assert.equal(e.f.state.letters.join(""), "LIFE"); assert.deepEqual({ ...e.f.sideGuard }, { remote: true, local: false }, "读不了的端侧挂侧闸门");
    await edit(e, "LIVE");
    assert.equal(word(e.local.get(K)), "LIVE", "本地照常写"); assert.equal(e.remote.get(K), LOVE, "端上 LOVE 原文不动");
    assert.ok(!e.log.some(x => x.startsWith("端写")), "端侧一次都没写"); assert.match(e.f.draftNotice, /有一处存储读取失败，暂不覆盖它/);
  }
  // 同上，但本地本来就空：不能挂整体闸门（这种设备上会永远存不了），本地照常保存，端侧仍不写
  {
    const e = sideEnv({ remoteRead: true, noGet: true, local: new Map() });
    await e.f.restoreDraft();
    assert.equal(e.f.draftGuard, null, "不挂整体闸门"); assert.deepEqual({ ...e.f.sideGuard }, { remote: true, local: false });
    await edit(e, "NEW");
    assert.equal(word(e.local.get(K)), "NEW", "新用户照常能存"); assert.equal(e.remote.get(K), LOVE, "端上 LOVE 原文不动");
  }
  // T13：读取时打上状态码 → 真实清理成功后替换期限提示（不靠在文案里找「失效」）
  {
    const e = sideEnv({ remoteRead: true, remote: new Map(), local: new Map([[K, rawOf("OLD", now - D.TTL - 1)]]), extra: ["cleanExpiredDrafts", "pendingWarning", "unsavedNow"] });
    await e.f.restoreDraft(); await settle();
    assert.equal(e.local.get(K) ?? null, null, "过期稿被清");
    assert.equal(e.f.draftNotice, "", "读取时的期限提示在清理成功后被替换，空稿清理成功不另外提示");
  }
  // 两侧都读到且同字节：不挂任何闸门、不写副本
  {
    const e = sideEnv({ remoteRead: true, local: new Map([[K, LOVE]]) });
    await e.f.restoreDraft();
    assert.equal(e.f.draftGuard, null); assert.equal(e.f.sideGuard, null);
    await edit(e, "LIVE");
    assert.equal(word(e.remote.get(K)), "LIVE"); assert.equal(e.remote.get(R) ?? null, null);
  }
  // 先保全：两侧都读到、但字节不同（本地较旧的 LIFE、端上较新的 LOVE）→ 覆盖本地 LIFE 之前先存进副本
  {
    const e = sideEnv({ remoteRead: true });
    await e.f.restoreDraft();
    assert.equal(e.f.state.letters.join(""), "LOVE", "恢复较新的 LOVE");
    assert.equal(e.f.draftGuard, null); assert.deepEqual({ ...e.f.sideGuard }, { remote: false, local: true }, "本地存着不同的 LIFE：先保全");
    await edit(e, "LOVER");
    assert.equal(e.local.get(R), pk(LIFE), "本地副本 = LIFE 原样"); assert.equal(e.remote.get(R), pk(LIFE), "端存储副本 = LIFE 原样");
    assert.ok(e.log.indexOf("本地写:" + R) >= 0 && e.log.indexOf("本地写:" + R) < e.log.indexOf("本地写:" + K), "顺序：先写副本，后覆盖本地主键");
    assert.equal(word(e.local.get(K)), "LOVER"); assert.equal(word(e.remote.get(K)), "LOVER");
    assert.equal(e.f.sideGuard, null); assert.match(e.f.draftNotice, /草稿已保存/);
  }
  // 先保全失败：副本两侧都写不进 → 本地 LIFE 不被覆盖，端侧照写，提示无法保全
  {
    const e = sideEnv({ remoteRead: true, rescueFail: true });
    await e.f.restoreDraft();
    await edit(e, "LOVER");
    assert.equal(e.local.get(K), LIFE, "本地 LIFE 原样"); assert.equal(word(e.remote.get(K)), "LOVER", "另一侧照写");
    assert.match(e.f.draftNotice, /原稿无法保全，暂不覆盖它/);
  }
  // 返工 QA 路径①：LIFE 套用抛错 + 端上 LOVE 读失败 → 端侧恢复后编辑：LIFE 与 LOVE 都进副本，谁也不冲掉谁
  {
    const e = sideEnv();
    e.f.setLetters = () => { throw new Error("坏草稿"); };
    await e.f.restoreDraft();
    e.ctl.remoteRead = true;
    await edit(e, "LIVE");
    assert.equal(e.local.get(R), pk(LIFE, LOVE), "本地副本两份都在"); assert.equal(e.remote.get(R), pk(LIFE, LOVE), "端存储副本两份都在");
    assert.equal(word(e.remote.get(K)), "LIVE"); assert.equal(word(e.local.get(K)), "LIVE");
    const words = JSON.parse(e.local.get(R)).map(word);
    assert.deepEqual(words, ["LIFE", "LOVE"], "到期前都能取回");
  }
  // 返工 QA 路径②（跨会话）：第一次打开端侧持续读失败、改为 LIVE；第二次打开端侧可读、恢复 LIVE 再编辑 → LOVE 先进副本再被覆盖
  {
    const first = sideEnv();
    await first.f.restoreDraft();
    await edit(first, "LIVE");
    assert.equal(first.remote.get(K), LOVE, "第一次打开：端上 LOVE 不动");
    const second = sideEnv({ remoteRead: true, local: first.local, remote: first.remote });
    await second.f.restoreDraft();
    assert.equal(second.f.state.letters.join(""), "LIVE", "第二次打开恢复较新的 LIVE");
    assert.deepEqual({ ...second.f.sideGuard }, { remote: true, local: false }, "端上存着不同的 LOVE：先保全");
    await edit(second, "LIVEN");
    assert.equal(second.remote.get(R), pk(LOVE), "LOVE 原样进了端存储副本"); assert.equal(second.local.get(R), pk(LOVE));
    assert.ok(second.log.indexOf("端写:" + R) >= 0 && second.log.indexOf("端写:" + R) < second.log.indexOf("端写:" + K), "先写副本，后覆盖端上主键");
    assert.equal(word(second.remote.get(K)), "LIVEN");
    assert.match(second.f.draftNotice, /草稿已保存/);
  }
}

// T25 返工：没有「试试：」建议词；首字母不对时候选栏直接提示「不是以 X 开头」，正常候选、手输与「随机一个」不受影响
{
  assert.doesNotMatch(source, /试试：|CORE\.suggestions|candMemo\.sugg/, "app.js 里没有建议词的残留");
  const real = { window: {} };
  for (const f of ["block/core.js", "lang/en/block.js"]) vm.runInNewContext(fs.readFileSync(new URL("../app/assets/" + f, import.meta.url), "utf8"), real);
  vm.runInNewContext(fs.readFileSync(new URL("../app/assets/core.js", import.meta.url), "utf8"), real);
  vm.runInNewContext(fs.readFileSync(new URL(LEGACY + "/en/words.js", import.meta.url), "utf8"), real);
  const RC = real.window.CORE;
  const bars = [], listed = [];
  const b = load(["renderWordBar", "cellState"], {
    CORE: RC, window: { WORDS: real.window.WORDS }, words: () => real.window.WORDS, moreWords: () => ({}), capitalize: RC.capitalize, blocked: RC.blocked,
    state: { letters: ["H", "L"], picks: [["Live", ""], ["Lov", ""]] },
    candPage: 0, candKey: "", candQuiet: false, candMemo: { key: "", list: [] },
    showBar: (msg, lab, acts, more) => bars.push({ msg, lab, acts, more }),
    el: { senseList: {}, candList: { appendChild: (f) => listed.push(...f.items), set textContent(v) {} } },
    document: { createDocumentFragment: () => ({ items: [], appendChild(n) { this.items.push(n); } }) },
    candItem: (it) => it[0],
    lookup: (w) => RC.lookupEntry(real.window.WORDS, undefined, w), // B5-R1：与 app-model 的 lookup 同一个查找（这里没有短语补充表）
  });
  b.renderWordBar(0);
  assert.equal(bars[0].msg, "Live 不是以 H 开头", "H 格打 Live：直接提示不是以 H 开头");
  assert.equal(bars[0].lab, "H 格的词要以 H 开头");
  assert.doesNotMatch(bars[0].lab, /试试/);
  assert.equal(bars[0].more, false, "没有候选就没有「换一批」");
  assert.equal(b.candMemo.sugg, undefined, "candMemo 不再有 sugg");
  assert.deepEqual(listed, [], "H 格里没有 live：不拿别的词凑数");
  b.renderWordBar(1);
  assert.equal(bars[1].msg, "", "L 格打 Lov：首字母对，没有错误提示");
  assert.match(bars[1].lab, /^以 L 开头 · 1 \/ 1 批$/);
  assert.deepEqual(listed, ["lovely", "love", "lover", "loving", "loved", "lovingly", "lovable"], "候选照常出，lovemaking 被屏蔽");
}
// 交付57复审（2026-11-12）：还没打字时，开关的「+N」按这一格能拿到的展开词数算。数字格按读法首字母（2 → two → T），不能拿「2」当关键词去匹配
{
  const cur = { window: {} };
  for (const f of ["lang/en/words.js", "block/core.js", "lang/en/block.js", "core.js"]) vm.runInNewContext(fs.readFileSync(new URL("../app/assets/" + f, import.meta.url), "utf8"), cur);
  const CC = cur.window.CORE, M = cur.window.WORDS_MORE, extras = [];
  const c = load(["renderWordBar", "cellState"], {
    CORE: CC, window: cur.window, words: () => cur.window.WORDS, moreWords: () => M, capitalize: CC.capitalize, blocked: CC.blocked,
    state: { letters: ["2", "A"], picks: [["", ""], ["", ""]] },
    candPage: 0, candKey: "", candQuiet: false, candMemo: { key: "", list: [] },
    showBar: (msg, lab, acts, more, extra) => extras.push(extra),
    el: { senseList: {}, candList: { appendChild: () => {}, set textContent(v) {} } },
    document: { createDocumentFragment: () => ({ items: [], appendChild() {} }) },
    candItem: (it) => it[0], lookup: () => null,
  });
  c.renderWordBar(0); c.renderWordBar(1);
  const want = (L) => CC.letterTiers(M, L).head.filter((it) => !CC.blocked(it[0])).length;
  assert.ok(want("2") > 0, "英语展开词里有以 T 开头的");
  assert.deepEqual(extras, [want("2"), want("A")], "数字格 2 的开关数按 T 开头的展开词算，不是 0；字母格不变");
}

// T14：读草稿期间的输入守卫只拦修改作品的操作；进设置页换深浅（v00.03.00 起深浅在设置页）、Tab 照常；已过期仍整体拦下并重载。
{
  const themeBtn = { id: "settingsOpen" }, modeRadio = { id: "mode-dark", tagName: "INPUT" }, creditsBtn = { id: "credits" }, cardInput = { id: "wordCtl", tagName: "INPUT" };
  let writes = 0, reloaded = 0;
  const g = load(["writesPending", "settleWaiters", "guardDraftEvent", "editableTarget", "checkDraftExpiry", "saveDraft", "writeDraft", "tagNotice"], { draftTarget: null, saveWaiters: [], noticeTag: null, READ_FAIL_NOTICE: "读取失败，暂不保存，请及时导出。",
    el: { settingsOpen: { contains: t => t === themeBtn }, settings: { contains: t => t === modeRadio }, credits: { contains: t => t === creditsBtn } },
    draftLoaded: false, draftSavedAt: 0, draftEpoch: 0, draftWrite: 0, draftAcceptedWrite: 0, cleanupFailed: false, draftNotice: "", draftContent: "", saveTimer: 0, clearTimeout, setTimeout, draftGuard: null, guardEpoch: -1, sideGuard: null, sideEpoch: -1, sideKeep: "", sideRead: false, sideMsg: "", guardMsg: "",
    window: { DRAFT: { deadline: d => d.t + 64800000 } }, state: { letters: [] },
    draftPayload: () => ({ word: g.state.letters.join("") }),
    draftStore: { write: p => { writes++; return { data: { ...p, t: Date.now() }, localOK: true, remote: Promise.resolve(true) }; } },
    reloadDraft() { reloaded++; }, renderDraftStatus() {}, scheduleExpiry() {},
  });
  // 模拟浏览器：守卫在捕获阶段先跑，没被 stopImmediatePropagation 才轮到页面自己的处理器
  const fire = (target, type, handler, extra) => {
    const e = { target, type, cancelable: true, prevented: false, stopped: false, preventDefault() { this.prevented = true; }, stopImmediatePropagation() { this.stopped = true; }, ...extra };
    g.guardDraftEvent(e);
    if (!e.stopped) handler();
    return e;
  };
  const edit = () => { g.state.letters.push("X"); g.saveDraft(); };
  let themed = 0;
  const toggle = () => { themed++; };
  for (const type of ["beforeinput", "keydown", "pointerdown", "touchstart", "mousedown", "click", "compositionstart"]) {
    const e = fire(cardInput, type, edit);
    assert.equal(e.stopped && e.prevented, true, "读取期间拦下 " + type);
  }
  assert.deepEqual(g.state.letters, [], "读取期间编辑不改变作品");
  g.writeDraft();
  assert.equal(writes, 0, "读取期间不写盘");
  fire(themeBtn, "click", toggle);
  fire(themeBtn, "keydown", toggle, { key: "Enter" });
  fire(modeRadio, "click", toggle);
  assert.equal(themed, 3, "读取期间能进设置页并换深浅");
  assert.equal(fire({ id: "body" }, "keydown", () => {}, { key: "Tab" }).stopped, false, "Tab 移焦点不拦");
  // 不可编辑处的按键只滚动 / 移焦点：放行（PageDown 滚页面）；可编辑控件上的按键仍拦
  for (const key of ["PageDown", "ArrowDown", " ", "a"]) assert.equal(fire({ id: "body", tagName: "BODY" }, "keydown", () => {}, { key }).stopped, false, "读取期间正文按 " + key + " 不拦");
  assert.equal(fire({ id: "title", tagName: "DIV", isContentEditable: true }, "keydown", edit, { key: "a" }).stopped, true, "标题框按键拦");
  assert.equal(fire({ id: "btn", tagName: "BUTTON" }, "click", edit).stopped, true, "按钮上 Enter 触发的 click 仍拦");
  assert.deepEqual(g.state.letters, [], "放行按键后作品仍不变");
  assert.equal(fire(creditsBtn, "click", () => {}).stopped, false, "借物页不拦");
  // 读完且未过期：全部放行
  g.draftLoaded = true; g.draftSavedAt = Date.now();
  assert.equal(fire(cardInput, "click", edit).stopped, false);
  assert.deepEqual(g.state.letters, ["X"]);
  g.writeDraft(); // 清掉 400ms 保存定时器，同时确认读完后的编辑能正常落盘
  assert.equal(writes, 1);
  // 已过期：连主题切换一起拦，并走重载
  g.draftSavedAt = Date.now() - 64800001;
  assert.equal(fire(themeBtn, "click", toggle).stopped, true);
  assert.equal(reloaded, 1);
}

// T24：配图请求序号。可控解码替身：onload 由测试手动触发，顺序随意。
{
  const imgs = [], shrinks = [], alerts = [], revoked = [], opened = [];
  class FakeImage { constructor() { imgs.push(this); } set src(v) { this.url = v; } }
  const files = { photo: { files: [], value: "" }, cellPhoto: { files: [], value: "" } };
  let locked = false;
  let L; L = load(["loadImage", "bumpImg", "onPhoto", "onCellPhoto", "clearPhoto", "removeCellPhoto"], {
    Image: FakeImage, URL: { createObjectURL: () => "blob:x", revokeObjectURL(url) { revoked.push(url); } }, alert(msg) { alerts.push(msg); },
    shrink: img => { shrinks.push(img); return img; }, checkDraftExpiry: () => locked, draftEpoch: 0, imgSeq: {},
    el: { photo: files.photo, cellPhoto: files.cellPhoto, imgPick: { focus() {} } },
    state: { letters: ["L", "I", "F"], images: [], crops: [], image: null, imgIndex: 0 },
    resetDefaultCrops() {}, renderImgPanel() {}, changed() {},
    // T44：解码完成先进取景；替身模拟用户立刻点「应用」，记下进了哪一格、哪种取景
    openCropper(i, kind, img) { opened.push([i, kind, img.name]); if (kind === "cell") L.state.images[i] = img; else L.state.image = img; },
  });
  const pickCell = name => { files.cellPhoto.files = [{ name }]; L.onCellPhoto(); const im = imgs[imgs.length - 1]; im.name = name; return im; };
  const pickDef = name => { files.photo.files = [{ name }]; L.onPhoto(); const im = imgs[imgs.length - 1]; im.name = name; return im; };
  const land = im => im.onload();
  // 同一格先选 A 后选 B，倒序完成：保留 B，A 在缩图前被丢
  const A = pickCell("A"), B = pickCell("B");
  land(B); land(A);
  assert.equal(L.state.images[0], B, "倒序完成保留 B");
  assert.deepEqual(shrinks, [B], "A 在缩图前丢弃");
  // 顺序完成：A 先到也不显示，B 到后是 B
  const A2 = pickCell("A2"), B2 = pickCell("B2");
  land(A2); assert.equal(L.state.images[0], B, "过期的 A2 先到不显示");
  land(B2); assert.equal(L.state.images[0], B2);
  // 选 C 后移除：迟到的 C 不出现，也没缩图
  const C = pickCell("C"), n = shrinks.length;
  L.removeCellPhoto();
  land(C);
  assert.equal(L.state.images[0], null, "移除后迟到的 C 不出现");
  assert.equal(shrinks.length, n);
  // 不同格互不取消：格 1 的解码在途，格 2 选图并移除，格 1 照常落下
  const D = pickCell("D");
  L.state.imgIndex = 1;
  const E = pickCell("E"); L.removeCellPhoto(); land(E);
  assert.equal(L.state.images[1], null);
  L.state.imgIndex = 0; // 回到格 1 的配图面板
  land(D);
  assert.equal(L.state.images[0], D, "格 2 的选图 / 移除不取消格 1");
  assert.deepEqual(opened[opened.length - 1], [0, "cell", "D"], "T44：解码完成进入这一格的取景");
  // T44：解码完成时配图面板已关或换到别的格：不弹取景、不落入作品
  const D2 = pickCell("D2"); L.state.imgIndex = -1; const before = opened.length; land(D2);
  assert.equal(opened.length, before, "面板已关：不弹取景"); assert.equal(L.state.images[0], D);
  const G2 = pickDef("G2"); L.state.imgIndex = 2; land(G2);
  assert.equal(opened.length, before, "换了格：默认图也不弹取景");
  // 默认图与格互不影响，默认图自己的移除也能作废
  L.state.imgIndex = 0;
  const F = pickCell("F"), G = pickDef("G");
  L.clearPhoto(); land(G);
  assert.equal(L.state.image, null, "移除后迟到的默认图不出现");
  land(F);
  assert.equal(L.state.images[0], F, "默认图的移除不取消格 1 的解码");
  const H = pickDef("H"), I = pickCell("I");
  land(I); land(H);
  assert.equal(L.state.image, H, "格的选图不取消默认图的解码");
  assert.equal(L.state.images[0], I);
  const J = pickDef("J"), K = pickDef("K");
  land(K); land(J);
  assert.equal(L.state.image, K, "默认图也是倒序保留最后一次");
  // 取消选择（没有文件）不作废在途请求
  const M = pickCell("M");
  files.cellPhoto.files = []; L.onCellPhoto();
  land(M);
  assert.equal(L.state.images[0], M, "取消选择不作废");
  // 读草稿期间（作品不可改）解码完成也不落入作品
  const N = pickCell("N"); locked = true; land(N); locked = false;
  assert.equal(L.state.images[0], M, "不可改时解码结果丢弃");
  // 第六批：失败回调也受请求序号、作品轮次和期限约束；所有失败都释放 URL。
  const fail = im => { const count = revoked.length; im.onerror(); assert.equal(revoked.length, count + 1); };
  const oldBad = pickCell("old-bad"), good = pickCell("new-good"); land(good); fail(oldBad);
  const removedBad = pickCell("removed-bad"); L.removeCellPhoto(); fail(removedBad);
  const defaultBad = pickDef("default-old"), defaultGood = pickDef("default-good"); land(defaultGood); fail(defaultBad);
  const clearedBad = pickDef("default-cleared"); L.clearPhoto(); fail(clearedBad);
  const epochBad = pickCell("epoch-old"); L.draftEpoch++; fail(epochBad);
  const expiredBad = pickCell("expired"); locked = true; fail(expiredBad); locked = false;
  assert.equal(alerts.length, 0, "失效的图片失败不弹窗");
  const currentBad = pickCell("current-bad"); fail(currentBad);
  assert.equal(alerts.length, 1, "当前有效请求失败仍提示");
  const independent = pickCell("cell-zero"); L.state.imgIndex = 1; pickCell("cell-one"); fail(independent);
  assert.equal(alerts.length, 2, "不同格不互相取消错误提示");
}

// T03：配图面板四个按钮的可访问名包含当前可见文字（WCAG 2.5.3，语音控制说可见文字就能点中），四个名称互不相同，且随当前动作变化
const panelBtn = {};
for (const id of ["imgPick", "defPick", "imgRemove", "defRemove"]) {
  const m = html.match(new RegExp('<button id="' + id + '"[^>]*aria-label="([^"]*)"[^>]*>([^<]*)</button>'));
  assert.ok(m, id + " 缺 aria-label");
  panelBtn[id] = { label: m[1], text: m[2] };
}
function checkNames(names, texts, state) {
  for (const id of Object.keys(names)) assert.ok(names[id].includes(texts[id]), state + "：" + id + " 的可访问名「" + names[id] + "」不含可见文字「" + texts[id] + "」");
  assert.equal(new Set(Object.values(names)).size, 4, state + "：四个名称互不相同");
}
const htmlNames = {}, htmlTexts = {};
for (const id of Object.keys(panelBtn)) { htmlNames[id] = panelBtn[id].label; htmlTexts[id] = panelBtn[id].text; }
checkNames(htmlNames, htmlTexts, "index.html 初始");
{
  const mk = id => ({ id, hidden: false, textContent: panelBtn[id] ? panelBtn[id].text : "", label: panelBtn[id] ? panelBtn[id].label : "", setAttribute(k, v) { this.label = v; } });
  const P = load(["renderImgPanel"], {
    el: { imgTitle: mk("imgTitle"), imgPick: mk("imgPick"), imgAdjust: mk("imgAdjust"), imgRemove: mk("imgRemove"), defPick: mk("defPick"), defRemove: mk("defRemove") },
    state: { imgIndex: 0, letters: ["L"], images: [], image: null }, cellImage: i => P.state.images[i] || P.state.image,
  });
  const snap = () => {
    const names = {}, texts = {};
    for (const id of Object.keys(panelBtn)) { names[id] = P.el[id].label; texts[id] = P.el[id].textContent; }
    return { names, texts };
  };
  P.renderImgPanel();
  let { names, texts } = snap();
  checkNames(names, texts, "无图");
  assert.equal(texts.imgPick, "选择图片");
  assert.equal(names.imgPick, htmlNames.imgPick, "无图时脚本与 index.html 的名称一致");
  assert.equal(names.defPick, htmlNames.defPick);
  P.state.images[0] = {}; P.state.image = {};
  P.renderImgPanel();
  ({ names, texts } = snap());
  checkNames(names, texts, "有图");
  assert.equal(texts.imgPick, "更换图片", "有图时可见文字为「更换图片」");
  assert.equal(texts.defPick, "更换图片");
  assert.equal(names.imgPick, "更换图片，这一格"); assert.equal(names.defPick, "更换图片，默认图");
}

// 真正保存成功才更新到期时间；同内容保存不刷新，失败和迟到响应不续期。
let writes = 0, localOK = true, clock = now, finishRemote;
const expiry = load(["writesPending", "settleWaiters", "writeDraft", "checkDraftExpiry", "tagNotice"], { draftTarget: null, saveWaiters: [], noticeTag: null, READ_FAIL_NOTICE: "读取失败，暂不保存，请及时导出。",
  Date: { now: () => clock }, window: { DRAFT: { deadline: d => d.t + 64800000 } },
  saveTimer: 0, clearTimeout, draftLoaded: true, draftContent: '{"word":"LIFE"}',
  draftEpoch: 0, draftWrite: 0, draftAcceptedWrite: 0, draftSavedAt: now, cleanupFailed: false, draftGuard: null, guardEpoch: -1, sideGuard: null, sideEpoch: -1, sideKeep: "", sideRead: false, sideMsg: "", guardMsg: "",
  draftPayload: () => ({ word: "LIFE" }), renderDraftStatus() {}, scheduleExpiry() {},
  reloadDraft() { expiry.reloaded = true; expiry.draftEpoch++; },
  draftStore: { write: p => { writes++; return { data: { ...p, t: clock }, localOK, remote: new Promise(r => { finishRemote = r; }) }; } },
});
expiry.writeDraft();
assert.equal(writes, 0);
expiry.draftPayload = () => ({ word: "LOVE" });
clock += 1000;
expiry.writeDraft();
assert.equal(expiry.draftSavedAt, clock);
assert.equal(writes, 1);
finishRemote(false); await Promise.resolve();
localOK = false; expiry.draftPayload = () => ({ word: "NEW" }); clock += 1000;
expiry.writeDraft(); finishRemote(false); await Promise.resolve();
assert.equal(expiry.draftSavedAt, clock - 1000, "失败不续期");
assert.match(expiry.draftNotice, /未确认/);
expiry.writeDraft(); expiry.draftEpoch++; finishRemote(true); await Promise.resolve();
assert.equal(expiry.draftSavedAt, clock - 1000, "销毁后的迟到确认不续期");
clock = expiry.draftSavedAt + 64800000 - 1;
assert.equal(expiry.checkDraftExpiry(), false);
clock++;
assert.equal(expiry.checkDraftExpiry(), true);
assert.equal(expiry.reloaded, true);

let edgeWrites = 0;
const edge = load(["saveDraft"], {
  draftLoaded: true, checkDraftExpiry: () => false, clearTimeout, saveTimer: 0,
  draftSavedAt: now, Date: { now: () => now + 64800000 - 200 },
  window: { DRAFT: { deadline: d => d.t + 64800000 } },
  writeDraft() { edgeWrites++; }, setTimeout() { assert.fail("临近到期不能再延迟保存"); },
});
edge.saveDraft(); assert.equal(edgeWrites, 1);

// 较早写入成功、较新写入失败：仍须保留最近一次真实成功的期限。
const pending = [];
expiry.draftStore.write = p => ({ data: { ...p, t: clock }, localOK: false, remote: new Promise(r => pending.push(r)) });
expiry.draftSavedAt = 0; expiry.reloaded = false;
expiry.draftPayload = () => ({ word: "ONE" }); expiry.writeDraft(); const firstTime = clock;
clock++;
expiry.draftPayload = () => ({ word: "TWO" }); expiry.writeDraft();
pending[0](true); pending[1](false); await Promise.resolve();
assert.equal(expiry.draftSavedAt, firstTime);
assert.equal(expiry.draftContent, '{"word":"ONE"}');
// 清理成功只改写期限类提示；单纯的读取失败不能被说成「过期草稿已清除」。
// T13：判断靠状态码（tagNotice），不靠在中文文案里找「失效」「读取失败」
let purgeOK = true;
const clean = load(["writesPending", "unsavedNow", "cleanExpiredDrafts", "pendingWarning", "tagNotice", "sideNotice"], { draftTarget: null, noticeTag: null, READ_FAIL_NOTICE: "读取失败，暂不保存，请及时导出。", draftEpoch: 0, draftSavedAt: 0, cleanupFailed: false, draftLoaded: false, draftGuard: null, sideGuard: null, guardMsg: "", sideMsg: "", draftStore: { purge: async () => purgeOK }, renderDraftStatus() {}, scheduleExpiry() {} });
const say = (text, retire, readFail) => { clean.draftNotice = text; clean.tagNotice(retire, readFail); };
say(" 部分存储读取失败。", false, true); await clean.cleanExpiredDrafts();
assert.equal(clean.draftNotice, " 部分存储读取失败。");
say("超过 18 小时或时间无效的草稿已失效。 部分存储读取失败。", true, true); await clean.cleanExpiredDrafts();
assert.equal(clean.draftNotice, " 部分存储读取失败。");
// 改文案不改判断：文字里不含「失效」也照样按状态码替换；含「失效」但没打可替换标签的不动
say("任意改过的期限文案", true, false); await clean.cleanExpiredDrafts();
assert.equal(clean.draftNotice, "", "按状态码替换，与文案无关");
say("用户自己的话里有失效二字", false, false); await clean.cleanExpiredDrafts();
assert.equal(clean.draftNotice, "用户自己的话里有失效二字", "没有可替换标签就不动");
// 标签只对打标签时的那段文字有效：提示被别的回调改写后自动作废
say("超过 18 小时或时间无效的草稿已失效。", true, false); clean.draftNotice = "草稿已保存。"; await clean.cleanExpiredDrafts();
assert.equal(clean.draftNotice, "草稿已保存。", "改写后的提示不按旧标签处理");
// 清理失败再成功：失败提示自己打可替换标签，成功后恢复
purgeOK = false; clean.draftNotice = ""; await clean.cleanExpiredDrafts();
assert.equal(clean.draftNotice, "部分存储清理未完成，将重试。");
purgeOK = true; await clean.cleanExpiredDrafts();
assert.equal(clean.draftNotice, "");
// 只有读取失败、尚未确认任何过期稿：失败清理不能声称草稿失效；重试成功仍保留读取警告。
say(" 部分存储读取失败。", false, true); purgeOK = false; await clean.cleanExpiredDrafts();
assert.doesNotMatch(clean.draftNotice, /过期|失效|已清除/);
purgeOK = true; await clean.cleanExpiredDrafts();
assert.equal(clean.draftNotice, " 部分存储读取失败。");
// 输入框组字 Enter 不得提交 / 失焦；普通 Enter 保持原行为。
// T18 入场界面：lostCells 列出会被清空且有内容的格；applyEntry 只给字母变了的格递增配图序号、按位置保留；submitEntry 统一校验；focusEntry 按有无单词路由
{
  const calls = [];
  const mkState = () => ({ letters: ["L", "I", "F", "E"], picks: [["love", ""], ["ice", ""], null, ["echo", ""]], glosses: ["爱", "", "", ""], glossAuto: [false, true, true, true],
    captions: ["", "冰的配文", "", ""], keys: [0, 0, 0, 0], images: [null, null, "img-F", null], crops: [null, null, null, null], filler: "小满", focus: 0, view: "single" });
  const env = load(["lostCells", "cropEdited", "applyEntry", "submitEntry", "validateEntry", "entryValues", "setLetters", "keepSame", "firstOpen", "bumpImg", "focusEntry", "focusBehind", "pageOpen"], {
    langBlock: () => "", // T20：语言已就绪（英语随包加载）
    CORE, state: mkState(), imgSeq: {}, entryFrom: "edit", draftLoaded: true, splits: Object.create(null), splitFor: () => null, /* T42 */ BLOCKED_WORD: "词被拦", BLOCKED_FILLER: "名被拦",
    capitalize: CORE.capitalize, blocked: (t) => /SEX|微信/i.test(t), checkDraftExpiry: () => false,
    el: { wordInput: { value: "", focus() { calls.push("focus:word"); } }, fillerCtl: { value: "", focus() { calls.push("focus:filler"); } }, toEntry: { focus() { calls.push("focus:toEntry"); } }, settings: { hidden: true }, credits: { hidden: true } },
    setEntryErr(f, m) { if (m) calls.push("err:" + f + ":" + m); }, showConfirm(w, f, lost) { calls.push("confirm:" + w + ":" + lost.map(c => c.letter).join("")); },
    saveEntry(back) { calls.push("save:" + back); },
    closeEntry() { calls.push("close"); env.entryFrom = ""; }, openEntry(from) { calls.push("open:" + from); env.entryFrom = from; }, renderEntry() {}, changed() { calls.push("changed"); },
    setFocus(i, t) { calls.push("setFocus:" + i + ":" + t); },
  });
  const j = (x) => JSON.parse(JSON.stringify(x)); // vm 里建的数组原型不同：比值前转成本环境的普通值
  const lost = j(env.lostCells("LOVE"));
  assert.deepEqual(lost.map(c => [c.letter, c.word, c.parts.join("·")]), [["I", "Ice", "词·配文"], ["F", "", "配图"]], "只列有内容、且字母变了的格及其内容");
  assert.deepEqual(j(env.lostCells("LIFE")), [], "单词没变：不清空");
  env.state.images[2] = null; // F 格什么都没有了：变了也不用确认
  assert.deepEqual(j(env.lostCells("LOVE")).map(c => c.letter), ["I"], "空格子不列入清空确认");
  env.state.images[2] = "img-F";
  // 取景：只调过默认图取景的空格也算有内容；打开过取景面板但没动（默认值）不算
  env.state.crops[2] = { z: 1, x: 0.5, y: 0.5 }; env.state.images[2] = null;
  assert.deepEqual(j(env.lostCells("LOVE")).map(c => c.letter), ["I"], "默认取景不算改过");
  env.state.crops[2] = { z: 2, x: 0.5, y: 0.5 };
  assert.deepEqual(j(env.lostCells("LOVE")).map(c => [c.letter, c.parts.join("·")]), [["I", "词·配文"], ["F", "取景"]], "改过的取景列为「取景」");
  env.state.crops[2] = { z: 1, x: 0.3, y: 0.5 }; assert.equal(j(env.lostCells("LOVE")).length, 2, "只平移也算改过");
  env.state.crops[2] = null; env.state.images[2] = "img-F";
  // submitEntry（首次进入）：空、屏蔽词（单词 / 填表人）、会清空 → 确认；否则直接应用。改词页里回车 = 保存并返回（T30）
  env.entryFrom = "boot";
  const submit = (w, f) => { calls.length = 0; env.el.wordInput.value = w; env.el.fillerCtl.value = f; env.submitEntry(); return calls.slice(); };
  assert.deepEqual(submit("", "x"), ["err:word:先输入一个单词", "focus:word"]);
  assert.deepEqual(submit("sex", "x"), ["err:word:词被拦", "focus:word"], "单词屏蔽：不复述原词");
  assert.deepEqual(submit("LIFE", "加微信"), ["err:filler:名被拦", "focus:filler"]);
  assert.deepEqual(submit("love", "小满"), ["confirm:LOVE:IF"], "会清空有内容的格：先确认");
  env.draftLoaded = false; assert.deepEqual(submit("LIFE", "大寒"), [], "读草稿期间不提交"); env.draftLoaded = true;
  env.entryFrom = "edit"; assert.deepEqual(submit("love", "小满"), ["save:true"], "改词页回车：交给保存并返回（T30）");
  // applyEntry：L、E 不变保留；I→O、F→V 变了的递增配图序号；多出的格也递增；填表人去首尾空白后写入
  calls.length = 0; env.applyEntry("LOVES", "大寒");
  assert.deepEqual(j(env.state.letters), ["L", "O", "V", "E", "S"]);
  assert.deepEqual(j(env.state.picks).map(p => p && p[0]), ["love", null, null, "echo", null], "同位置字母没变的保留");
  assert.deepEqual(j(env.state.images), [null, null, null, null, null], "F 格的配图随格清空");
  assert.deepEqual(Object.keys(env.imgSeq).sort(), ["cell:1", "cell:2", "cell:4"], "只给字母变了的格递增配图序号（T24）");
  assert.equal(env.state.filler, "大寒"); assert.deepEqual(calls, ["close", "changed", "focus:toEntry"], "从编辑界面来：应用后焦点回入口");
  env.state = mkState(); env.state.letters = []; env.state.picks = []; env.entryFrom = "boot"; env.imgSeq = {};
  calls.length = 0; env.applyEntry("SEA", "");
  assert.deepEqual(calls, ["close", "changed", "setFocus:0:wordCtl"], "第一次进来：焦点交给第 1 格的词");
  // focusEntry：有单词 → 关入场；没有 → 开入场（boot）
  calls.length = 0; env.entryFrom = "boot"; env.focusEntry(); assert.deepEqual(calls, ["close"], "读完有单词：进编辑界面");
  env.state.letters = []; calls.length = 0; env.entryFrom = ""; env.focusEntry(); assert.deepEqual(calls, ["open:boot"], "没有单词：去入场界面");
  // 启动时已在入场界面：恢复出空单词、但有填表人的草稿 → 填表人同步进输入框（否则提交时被空输入框盖掉）
  env.entryFrom = "boot"; env.state.filler = "作者"; env.el.fillerCtl.value = ""; env.el.wordInput.value = "x"; calls.length = 0;
  env.focusEntry();
  assert.equal(env.el.fillerCtl.value, "作者", "恢复的填表人同步进输入框"); assert.equal(env.el.wordInput.value, "", "单词框同步为恢复的（空）单词");
  assert.deepEqual(calls, ["focus:word"]);
  // V003-B4-R6：设置页或借物页开着时，读完草稿不把焦点抢到背后的单词框；内容照样同步
  for (const page of ["settings", "credits"]) {
    env.el[page].hidden = false; env.el.fillerCtl.value = ""; calls.length = 0;
    env.focusEntry();
    assert.deepEqual(calls, [], page + " 开着：不抢焦点"); assert.equal(env.el.fillerCtl.value, "作者", "后台内容照常同步");
    env.el[page].hidden = true;
  }
  calls.length = 0; env.focusEntry(); assert.deepEqual(calls, ["focus:word"], "全屏页关了：照常给焦点");
}

// T08：键盘上方一行（连同 iOS 上它下面的软键盘）盖住页面底部时，页面底部留出「这一行高 + 键盘高」的空白；收起后去掉
{
  const app = { style: { paddingBottom: "" } }, kbRow = { hidden: false, offsetHeight: 47, style: {} };
  const k = load(["placeKbRow"], { el: { app, kbRow }, window: { innerHeight: 700, visualViewport: { height: 400, offsetTop: 0 } } });
  k.placeKbRow();
  assert.equal(kbRow.style.bottom, "300px", "贴在键盘上方"); assert.equal(app.style.paddingBottom, "calc(40px + 347px)", "页面底部留出这一行 + 键盘的高度");
  k.window.visualViewport = undefined; k.placeKbRow(); assert.equal(app.style.paddingBottom, "calc(40px + 47px)", "量不到可视区：只留这一行的高度");
  kbRow.hidden = true; k.placeKbRow(); assert.equal(app.style.paddingBottom, "", "收起后去掉留白");
}

// T15：离开单词框 / 释义框是具名函数，输入框失焦与焦点离开候选栏共用；不再合成 blur 事件
{
  assert.doesNotMatch(source, /FocusEvent|dispatchEvent/, "app.js 不再合成事件");
  const calls = [];
  const lv = load(["leaveWordCtl", "leaveLineCtl"], { holdHeight() {}, syncOwn() {}, focusKind: "word", onWordCtl() { calls.push("onWordCtl"); }, renderCand() { calls.push("renderCand"); } });
  const inp = { value: "Love  " };
  lv.leaveWordCtl(inp);
  assert.equal(inp.value, "Love", "去掉末尾空格"); assert.equal(lv.focusKind, ""); assert.deepEqual(calls, ["onWordCtl"], "值变了走 onWordCtl");
  calls.length = 0; lv.focusKind = "word"; lv.leaveWordCtl(inp);
  assert.deepEqual(calls, ["renderCand"], "值没变只收栏");
  calls.length = 0; lv.focusKind = "gloss"; lv.leaveLineCtl();
  assert.equal(lv.focusKind, ""); assert.deepEqual(calls, ["renderCand"]);
  // 输入框失焦：Tab 进候选栏时不离开，去别处才离开
  const h = {}, cand = { contains: (t) => t === "candBtn" };
  const bw = load(["bindWordControl", "leaveWordCtl"], { holdHeight() {}, syncOwn() {}, el: { cand }, focusKind: "word", candQuiet: false, onWordCtl() {}, renderCand() { calls.push("renderCand"); }, revealCtl() {} });
  const box = { value: "Love", classList: { add() {}, remove() {} }, addEventListener: (n, fn) => { h[n] = fn; } };
  bw.bindWordControl(box);
  calls.length = 0; h.blur({ relatedTarget: "candBtn" }); assert.deepEqual(calls, [], "Tab 进候选栏：不收栏");
  h.blur({ relatedTarget: null }); assert.deepEqual(calls, ["renderCand"], "去别处：收栏"); assert.equal(bw.focusKind, "");
}
for (const name of ["bindWordControl", "bindLineControl"]) {
  const handlers = {};
  let blur = 0;
  const input = { addEventListener: (name, fn) => { handlers[name] = fn; }, blur: () => blur++ };
  const e = load([name], { el: {} });
  e[name](input, "gloss");
  for (const composing of [{ isComposing: true }, { keyCode: 229 }]) {
    handlers.keydown({ key: "Enter", preventDefault: () => assert.fail("组字不能拦截"), ...composing });
    assert.equal(blur, 0);
  }
  handlers.keydown({ key: "Enter", preventDefault() {} });
  assert.equal(blur, 1);
}
// 入场界面的单词 / 填表人（T18）：组字中的回车不拦截、不提交；普通回车提交（统一校验）
for (const field of ["word", "filler"]) {
  const handlers = {};
  let submits = 0;
  const input = { addEventListener: (name, fn) => { handlers[name] = fn; } };
  const e = load(["bindEntryInput"], { submitEntry() { submits++; }, onEntryWord() {}, setEntryErr() {}, renderEntry() {}, entryComposing: false });
  e.bindEntryInput(input, field);
  for (const composing of [{ isComposing: true }, { keyCode: 229 }]) handlers.keydown({ key: "Enter", preventDefault: () => assert.fail("组字不能拦截"), ...composing });
  assert.equal(submits, 0, field + "：组字回车不提交");
  handlers.keydown({ key: "Enter", preventDefault() {} });
  assert.equal(submits, 1, field + "：普通回车提交");
}
const titleLine = source.split("\n").find(line => line.includes('el.title.addEventListener("keydown"'));
let titleKey, titleBlur = 0;
const titleEnv = { titleComposing: false, el: { title: { addEventListener: (_, fn) => { titleKey = fn; }, blur: () => titleBlur++ } } };
vm.runInNewContext(titleLine, attachModules(titleEnv));
for (const composing of [{ isComposing: true }, { keyCode: 229 }]) titleKey({ key: "Enter", ...composing, preventDefault: () => assert.fail("组字不能拦截") });
titleEnv.titleComposing = true;
titleKey({ key: "Enter", preventDefault: () => assert.fail("组字状态不能拦截") });
assert.equal(titleBlur, 0);
titleEnv.titleComposing = false;
titleKey({ key: "Enter", preventDefault() {} });
assert.equal(titleBlur, 1);

const draws = [];
const paint = load(["paintBoxes"], { CORE, measure: (_, text) => Array.from(text).length * 10 });
paint.paintBoxes({ save() {}, restore() {}, fillText: (text, x) => draws.push([text, x]) }, {
  boxes: [{ role: "title", text: "A😀B", track: -1, x: 0, baseline: 0, color: "ink", size: 76, weight: 700 }],
}, { ink: "#000" });
assert.deepEqual(draws, [["A", 0], ["😀", 9], ["B", 18]], "绘制与测量按完整码点前进");
const inserts = [];
const paste = load(["pasteTitle"], {
  CORE, takeTitleSnap() {}, restoreTitleSnap() { inserts.length = 0; },
  document: { execCommand: (_, __, text) => inserts.push(text) },
  titleCut: () => CORE.textUnits(inserts[0] || "").length > 1,
  titleNotice() {}, changed() {},
});
paste.pasteTitle("👨‍👩‍👧‍👦😀");
assert.deepEqual(inserts, ["👨‍👩‍👧‍👦"], "截短粘贴保留完整组合 emoji");
// 第五批：直接加载生产函数，验证预览变换与导出裁剪共享同一区域。
{
  let w = 0, h = 0, sizeWrites = 0, drawn;
  const ctx = { clearRect() {}, fillRect() {}, strokeRect() {}, drawImage(...args) { drawn = args; } };
  const canvas = { get width() { return w; }, set width(v) { w = v; sizeWrites++; }, get height() { return h; }, set height(v) { h = v; sizeWrites++; }, getContext: () => ctx, focus() {} };
  let img = { width: 1600, height: 1000 };
  const focused = []; let saves = 0;
  const node = (id) => ({ id, hidden: false, focus() { focused.push(id); } });
  const e = load(["cropRect", "blankCrop", "copyCrop", "workImage", "currentCrop", "cropPreviewFrame", "drawCropPreview", "clampCrop", "panCrop", "setZoom", "moveCrop", "onCropKey", "cropEdited",
    "openCropper", "applyCrop", "cancelCrop", "resetCrop", "leaveCropper"], {
    CORE, FRAME: { single: [920, 600] }, state: { crops: [], letters: ["L"], cropIndex: 0, imgIndex: 0, images: [], image: null }, work: null,
    el: { cropCanvas: canvas, cropZoom: {}, cropTitle: {}, cropScope: {}, imgPanel: node("imgPanel"), cropper: node("cropper"), imgAdjust: node("imgAdjust"), imgPick: node("imgPick") },
    cellImage: () => img, draftEpoch: 0, checkDraftExpiry: () => false, renderImgPanel() {}, changed() { saves++; },
  });
  const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} ~= ${b}`);
  for (const dims of [[1600, 1000], [400, 1800], [2000, 300]]) {
    img = { width: dims[0], height: dims[1] }; e.state.crops = [];
    e.openCropper(0); assert.equal(e.cropEdited(e.currentCrop()), false, "只打开不能算改过");
    const before = JSON.stringify(e.currentCrop());
    for (let i = 0; i < 60; i++) e.drawCropPreview();
    assert.equal(JSON.stringify(e.currentCrop()), before, "绘制无取景副作用");
    e.setZoom(2); e.moveCrop("ArrowRight");
    const f = e.cropPreviewFrame(), r = e.cropRect(img, 920, 600, e.currentCrop());
    near((f.x - drawn[1]) / (drawn[3] / img.width), r.sx);
    near((f.y - drawn[2]) / (drawn[4] / img.height), r.sy);
    near(f.w / (drawn[3] / img.width), r.vw);
    near(f.h / (drawn[4] / img.height), r.vh);
    Object.assign(e.currentCrop(), { x: 0.5, y: 0.5 }); near(e.currentCrop().x, 0.5); near(e.currentCrop().y, 0.5); near(e.currentCrop().z, 2);
    const initial = e.cropRect(img, 920, 600, e.currentCrop());
    e.moveCrop("ArrowRight"); near(e.currentCrop().x, 0.5 + 0.05 * initial.vw / img.width);
    e.moveCrop("ArrowLeft"); near(e.currentCrop().x, 0.5);
    e.moveCrop("ArrowDown"); near(e.currentCrop().y, 0.5 + 0.05 * initial.vw / img.height);
    e.moveCrop("ArrowUp"); near(e.currentCrop().y, 0.5);
    e.panCrop(100000, -100000); e.panCrop(-1, 1); // 夹边界后反向移动立即生效
    assert.ok(e.currentCrop().x > initial.vw / 2 / img.width);
    assert.ok(e.currentCrop().y < 1 - initial.vh / 2 / img.height);
    e.setZoom(99); assert.equal(e.currentCrop().z, 3);
    e.setZoom(-99); assert.equal(e.currentCrop().z, 1);
    let stopped = false; e.onCropKey({ key: "+", preventDefault() { stopped = true; } });
    assert.equal(stopped, true); near(e.currentCrop().z, 1.1);
  }
  assert.equal(sizeWrites, 2, "预览反复绘制，只首次设置宽高");
  // T44：取景只改工作副本。取消 = 作品里的图与取景都不动；应用才写入并保存
  const A = { width: 1600, height: 1000, name: "A" }, B = { width: 1200, height: 900, name: "B" }, Dimg = { width: 900, height: 1200, name: "D" };
  e.state.letters = ["L", "I", "F", "E"]; e.state.images = [A, null, null, null]; e.state.image = null; e.state.crops = [{ z: 2, x: 0.4, y: 0.5 }, null, null, null];
  img = A; saves = 0;
  e.openCropper(0); assert.equal(e.currentCrop().z, 2, "调整已有图：从现有取景开始"); assert.equal(e.el.cropTitle.textContent, "调整取景 · 1L");
  assert.equal(e.el.cropScope.hidden, true, "单格取景不写影响范围");
  e.setZoom(3); e.moveCrop("ArrowLeft");
  assert.deepEqual(e.state.crops[0], { z: 2, x: 0.4, y: 0.5 }, "面板里拖动缩放不改作品");
  e.cancelCrop();
  assert.deepEqual(e.state.crops[0], { z: 2, x: 0.4, y: 0.5 }, "取消：原取景保留"); assert.equal(saves, 0, "取消不保存");
  assert.equal(e.el.cropper.hidden, true); assert.equal(e.el.imgPanel.hidden, false); assert.equal(focused[focused.length - 1], "imgAdjust", "取消后焦点回配图面板");
  e.openCropper(0); e.setZoom(2.5); e.applyCrop();
  assert.equal(e.state.crops[0].z, 2.5, "应用：写入"); assert.equal(saves, 1, "应用后保存");
  e.openCropper(0); e.resetCrop(); assert.equal(JSON.stringify(e.currentCrop()), JSON.stringify({ z: 1, x: 0.5, y: 0.5 }), "还原：副本回居中 1 倍"); assert.equal(e.state.crops[0].z, 2.5, "还原不改作品"); e.cancelCrop();
  // 新选这一格的图：取消 = 原图原取景都在；应用 = 换图并带上取景
  e.openCropper(0, "cell", B); e.setZoom(2); e.cancelCrop();
  assert.equal(e.state.images[0], A, "取消新图：原图保留"); assert.equal(e.state.crops[0].z, 2.5, "取消新图：原取景保留");
  e.openCropper(0, "cell", B); assert.equal(e.currentCrop().z, 1, "新图从默认取景开始"); e.setZoom(1.5); e.applyCrop();
  assert.equal(e.state.images[0], B); assert.equal(e.state.crops[0].z, 1.5);
  // 默认图：标题与影响范围；应用后作用于所有没有单独配图的格，有单独配图的格不动
  e.state.crops[2] = { z: 2, x: 0.5, y: 0.5 }; e.state.images[2] = A;
  e.openCropper(1, "def", Dimg); assert.equal(e.el.cropTitle.textContent, "调整取景 · 默认图（以 2I 格为例）"); assert.equal(e.el.cropScope.hidden, false);
  e.setZoom(1.8); e.cancelCrop(); assert.equal(e.state.image, null, "取消默认图：不落入作品");
  e.openCropper(1, "def", Dimg); e.setZoom(1.8); e.applyCrop();
  assert.equal(e.state.image, Dimg);
  assert.equal(JSON.stringify(e.state.crops.map((c) => c && c.z)), "[1.5,1.8,2,1.8]", "默认图取景只给没有单独配图的格");
  assert.notEqual(e.state.crops[1], e.state.crops[3], "各格取景各是一份，之后单独调不互相牵连");
  // 打开后草稿换了一轮（18h 到期重载）：应用作废
  e.openCropper(0, "cell", A); e.draftEpoch++; e.applyCrop(); assert.equal(e.state.images[0], B, "世代变了：应用不落入作品");
  // 配图面板已关时离开取景：不强行打开面板
  e.state.imgIndex = -1; e.el.imgPanel.hidden = true; e.openCropper(0); e.cancelCrop(); assert.equal(e.el.imgPanel.hidden, true);
}
// T21a / T33：先应用，再提示；只按当前底色判断。提示走统一 Toast（停 3 秒，U1）；颜色够清楚时只清掉自己的提醒。
{
  let applied; const toasts = [];
  const MSG = "这个颜色在导出图上容易看不清";
  const e = load(["applyCustomColor", "colorNotice"], { CORE,
    currentPalette: () => CORE.PALETTE.light,
    el: { tcolorCustom: { value: "#d9c27a" }, toast: { textContent: "" } },
    formatTitle(cmd, value) { applied = [cmd, value]; },
    showToast(msg, ms) { toasts.push([msg, ms]); e.el.toast.textContent = msg; },
  });
  for (const color of ["#d9c27a", "#ffffff"]) {
    e.el.tcolorCustom.value = color; e.applyCustomColor();
    assert.deepEqual(applied, ["foreColor", color]);
    assert.deepEqual(toasts.at(-1), [MSG, 3000]);
  }
  e.el.tcolorCustom.value = "#808080"; e.applyCustomColor();
  assert.deepEqual(toasts.at(-1), ["", 0], "颜色够清楚：清掉颜色提醒");
  e.el.toast.textContent = "已保存"; const n = toasts.length;
  e.applyCustomColor(); assert.equal(toasts.length, n, "不吞掉别的消息");
  e.currentPalette = () => CORE.PALETTE.dark;
  e.el.tcolorCustom.value = "#ffffff"; e.applyCustomColor();
  assert.equal(e.el.toast.textContent, "已保存", "深底白色不警告也不吞其他提示");
  e.el.tcolorCustom.value = "#222222"; e.applyCustomColor();
  assert.equal(e.el.toast.textContent, MSG, "深底深灰警告");
  assert.match(html, /id="toast"[^>]*role="status"/);
  assert.doesNotMatch(html, /id="colorToast"/);
}
// T20：保留语义表头。版权原文对照已作为一次性交付核对完成。
assert.equal((html.match(/scope="col"/g) || []).length, 3);
assert.equal((html.match(/scope="row"/g) || []).length, 15); // 主题字体两行（西文、中文）// 2026-11-12 借物页修订：加屏蔽词表来源（LDNOOBW）与主题颜色的出处两行 // 此前：词库来源拆成六行 // v00.03.00：借物表加了「图标」一行（Phosphor Icons，MIT）
assert.match(html, /Phosphor Icons/); assert.match(html, /Copyright \(c\) 2023 Phosphor Icons/);
// 2026-11-12 借物页修订：许可逐个对过来源原文。屏蔽词表的外部词表要署名（CC BY 4.0）；断词模式写明 MIT 与各语言的版权人；没写版本号的不替来源补
assert.match(html, /LDNOOBW[\s\S]*Shutterstock, Inc\.[\s\S]*CC BY 4\.0/); assert.match(html, /creativecommons\.org\/licenses\/by\/4\.0/);
for (const who of ["Daniel Flipo", "Deutschsprachige Trennmustermannschaft", "Javier Bezos", "Claudio Beccari"]) assert.ok(html.split(who).length >= 3, who + "：表格与 MIT 许可全文里都署名");
assert.match(html, /CFDICT：CC BY-SA（来源页未写版本号）/); assert.match(html, /HanDeDict：CC BY-SA 3\.0/); assert.match(html, /核心词表 CC BY-SA（来源页未写版本号）/);
assert.doesNotMatch(html, /见来源项目/, "不再有「见来源项目」这种没核对的写法");
// T07 协议与证书更新（2026-11-12）：代码 GPL-3.0-or-later；借物页开头四项齐全（版权声明、「第 3 版或任一更新版本」、不提供担保、全文入口）
{
  const own = html.slice(html.indexOf('class="credits-own"'), html.indexOf('class="credits-table"'));
  assert.match(own, /© 2026 BeyondPassenger/); assert.match(own, /第 3 版，或由你选择的任一更新版本/); assert.match(own, /不提供任何担保/); assert.match(own, /LICENSES\/GPL-3\.0\.txt/);
  assert.doesNotMatch(html, /<td>MIT License<\/td><\/tr>\s*<tr><th scope="row">词库 · 英语/, "本工具一行不再写 MIT");
  assert.doesNotMatch(html, /Copyright \(c\) 2026 BeyondPassenger/, "MIT 全文里不再有本工具的版权行");
  assert.doesNotMatch(html, /GFDL/, "维基词典只按 CC BY-SA 4.0 使用（用户 11-12 定）");
  assert.match(html, /仅用于筛选，未随包分发其内容/); assert.doesNotMatch(html, /工具不可商用/);
  // 省流三行：借物页与 README 第 07 节是同一段文字
  const plain = t => t.replace(/<[^>]+>/g, "").replace(/\*\*/g, "").replace(/\s+/g, " ").trim();
  const lis = [...html.matchAll(/<li><b>(可以|不可以|注意)<\/b>([\s\S]*?)<\/li>/g)].map(m => plain(m[1] + m[2]));
  assert.equal(lis.length, 3);
  const readme = plain(fs.readFileSync(new URL("../README.md", import.meta.url), "utf8"));
  for (const li of lis) assert.ok(readme.includes(li), "README 第 07 节缺这一行：" + li.slice(0, 12));
  // 许可全文随包：六份独立文件都在；借物页里直接写的 MIT、OFL 与文件同文；展开才读的四份与 licenses.js 一致
  const { ALL, LAZY, render } = await import("./build-licenses.mjs");
  const dir = new URL("../app/LICENSES/", import.meta.url);
  for (const k of ALL) assert.ok(fs.statSync(new URL(k + ".txt", dir)).size > 1000, "缺许可全文：" + k);
  assert.match(fs.readFileSync(new URL("GPL-3.0.txt", dir), "utf8"), /GNU GENERAL PUBLIC LICENSE\s+Version 3, 29 June 2007/);
  assert.equal(fs.readFileSync(new URL("../LICENSE", import.meta.url), "utf8"), fs.readFileSync(new URL("GPL-3.0.txt", dir), "utf8"), "仓库的 LICENSE 就是 GPL 第 3 版全文");
  assert.equal(fs.readFileSync(new URL("../app/assets/licenses.js", import.meta.url), "utf8"), render(), "licenses.js 与 app/LICENSES 一致（重跑 npm run licenses）");
  for (const k of LAZY) assert.ok(html.includes('data-license="' + k + '"'), "借物页缺全文入口：" + k);
  const unesc = t => t.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, "&");
  const inline = [...html.matchAll(/<details>\s*<summary>[^<]+<\/summary>\s*<pre lang="en">([\s\S]*?)<\/pre>/g)].map(m => unesc(m[1]).replace(/\n+$/, "") + "\n");
  assert.deepEqual(inline, ["MIT", "OFL-1.1"].map(k => fs.readFileSync(new URL(k + ".txt", dir), "utf8")), "借物页里的 MIT、OFL 全文与 LICENSES 下的文件同文");
  assert.equal(JSON.parse(fs.readFileSync(new URL("../package.json", import.meta.url), "utf8")).license, "GPL-3.0-or-later AND CC-BY-SA-4.0");
}
// T19/T21a：这些符号已核对包内字形；防止重新引入依赖系统字体的箭头。
{
  const symbols = Array.from(html.matchAll(/<(?:span|button)[^>]*(?:class="(?:crop-arrow|custom-mark)"|id="crop(?:Minus|Plus)")[^>]*>([^<]+)</g), m => m[1]).join("");
  assert.ok(symbols.length >= 7);
  assert.match(symbols, /^[→＋−]+$/, "按钮只使用已核对的包内符号");
}
// T22：紧凑样式只用于超过八格，缩短单词后恢复正常样式。
{
  let tight = false;
  const e = load(["renderPager"], {
    state: { letters: [], view: "single", focus: 0 },
    el: { pagerLetters: { textContent: "", classList: { toggle(name, on) { if (name === "tight") tight = on; } }, appendChild() {} }, pager: {}, tip: {}, hint: {}, sheetTabs: {} },
    make: () => ({ appendChild() {}, setAttribute() {}, addEventListener() {} }),
    tipOn: () => false, cellState: () => "empty", finishNote: "",
    sheets: () => [[0, e.state.letters.length]], sheetOf: () => 0, CORE: { startText: (l) => l }, // T42：不超过 10 格只有一张
  });
  for (const [n, expected] of [[8, false], [9, true], [10, true], [4, false]]) {
    e.state.letters = Array(n).fill("L"); e.renderPager(); assert.equal(tight, expected);
  }
}
console.log("app regressions ok");

// T16：实际执行模块注册，验证每个跨模块引用都能落到真实接口，而不是只靠定点替身。
{
  const registry = { window: {}, document: { getElementById: () => ({}) } };
  vm.createContext(registry);
  for (const file of ["core.js", "lang/packs.js", "draft.js"]) vm.runInContext(fs.readFileSync(new URL("../app/assets/" + file, import.meta.url), "utf8"), registry);
  for (const module of appSources.slice(0, -1)) vm.runInContext(module.text, registry, { filename: module.file });
  const app = registry.window.Backronym;
  assert.ok(app.model.state && app.model.el, "作品状态与 DOM 引用只有一份");
  for (const [, module, name] of source.matchAll(/(?<![.\w])app\.(\w+)\.(\w+)/g)) {
    assert.ok(app[module] && Object.prototype.hasOwnProperty.call(app[module], name), `未连接的模块接口 ${module}.${name}`);
  }
  const loaded = appSources.map(s => s.file.split("/").pop()).sort();
  const present = fs.readdirSync(new URL("../app/assets/", import.meta.url)).filter(n => /^app(?:-[a-z]+)?\.js$/.test(n)).sort();
  assert.deepEqual(loaded, present, "HTML 与实际模块文件一致，不能漏载或重复加载");
}

// T27：卡上透明输入框视觉字号 < 16px 时按 16px 排再缩放（iOS 聚焦不自动放大）；≥ 16px 不缩放
{
  const f = load(["fitInput"], { MIN_INPUT_PX: 16 });
  const st = {}; f.fitInput({ style: st }, 12, 300, 30, 4, 2);
  assert.equal(st.fontSize, "16px"); assert.equal(st.transform, "scale(0.75)"); assert.equal(st.transformOrigin, "0 0");
  assert.equal(st.width, "400px"); assert.equal(st.height, "40px"); assert.equal(st.paddingTop, "5.333333333333333px"); assert.equal(st.letterSpacing, "2.6666666666666665px");
  const big = {}; f.fitInput({ style: big }, 20, 300, 30, null, 0);
  assert.equal(big.fontSize, "20px"); assert.equal(big.transform, ""); assert.equal(big.width, "300px"); assert.equal(big.paddingTop, undefined);
}
// T28：输入期间页面只许变高；离开所有输入框后才放开
{
  const timers = []; const app = { offsetHeight: 900, style: { minHeight: "" } };
  const h = load(["editingNow", "holdHeight"], { holdTimer: 0, el: { app }, document: { activeElement: { tagName: "INPUT", type: "text" } },
    setTimeout(fn) { timers.push(fn); return timers.length; }, clearTimeout() {} });
  h.holdHeight(true); assert.equal(app.style.minHeight, "900px");
  app.offsetHeight = 700; h.holdHeight(true); assert.equal(app.style.minHeight, "900px", "变矮时保持原高度");
  app.offsetHeight = 1000; h.holdHeight(true); assert.equal(app.style.minHeight, "1000px", "变高时跟上");
  h.holdHeight(false); timers.pop()(); assert.equal(app.style.minHeight, "1000px", "焦点还在输入框：不放开");
  h.document.activeElement = { tagName: "BUTTON" }; h.holdHeight(false); timers.pop()(); assert.equal(app.style.minHeight, "", "离开输入框后放开");
}
console.log("batch 7 input regressions ok");
