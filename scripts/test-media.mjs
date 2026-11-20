// T45 配图持久化：替身后端（内存「文件系统」）+ 真实 core.js / draft.js / media.js + 真实草稿控制函数，不碰用户存储。
// 覆盖计划验收清单：写失败保住旧图与旧取景、默认图与独立图优先级、取景恢复、到期清理、无图旧稿、迟到回调与超时、
// 端侧读取失败 → 恢复可读后原图仍在、恢复副本读失败不删图、写入未完成不删图、有效稿共享图不误删；另测容器文件系统分片读写。
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { loadAppFunctions } from "./app-source.mjs";

let now = 2000000000000;
const env = { window: {}, Date: { now: () => now }, setTimeout, clearTimeout, Promise };
for (const f of ["core.js", "draft.js", "media.js"]) vm.runInNewContext(fs.readFileSync(new URL("../app/assets/" + f, import.meta.url), "utf8"), env);
const { CORE, DRAFT, MEDIA } = env.window;
const K = DRAFT.KEY, R = DRAFT.RESCUE, TTL = DRAFT.TTL;
const flush = async (n = 8) => { for (let i = 0; i < n; i++) await new Promise((r) => setImmediate(r)); };
const plain = (x) => JSON.parse(JSON.stringify(x)); // vm 里造的对象原型不同，比较前转成普通对象

// 内存后端：files = 名字 → base64；可设置写 / 读 / 列目录 / 删失败、写入挂起（迟到）、剩余空间
function memBackend() {
  const files = new Map(), b = { files, failPut: false, failGet: false, failList: false, failRemove: false, hangPut: null, space: null, puts: 0 };
  Object.assign(b, {
    kind: "mem",
    ready: async () => true,
    put: async (n, v) => { b.puts++; if (b.failPut) throw new Error("disk"); if (b.hangPut) await b.hangPut; files.set(n, v); },
    get: async (n) => { if (b.failGet) throw new Error("read"); return files.has(n) ? files.get(n) : null; },
    list: async () => { if (b.failList) throw new Error("list"); return [...files.keys()]; },
    remove: async (n) => { if (b.failRemove) throw new Error("rm"); files.delete(n); },
    free: async () => b.space,
  });
  return b;
}
const B64 = (seed, len = 64) => Buffer.from(String(seed).repeat(len)).toString("base64");

// ---------- 名字与草稿字段 ----------
{
  const a = MEDIA.nameFor(B64("a"), "png"), j = MEDIA.nameFor(B64("a"), "jpg");
  assert.ok(CORE.mediaName(a) && /\.png$/.test(a) && /\.jpg$/.test(j), "名字合法、按扩展名区分");
  assert.equal(MEDIA.nameFor(B64("a"), "png"), a, "同内容同名（同图不重复写）");
  assert.notEqual(MEDIA.nameFor(B64("b"), "png"), a, "不同内容不同名");
  for (const bad of ["../x.png", "a.png", "m1-xyz.png", "m1-0123456789abcdef.gif", 3, null]) assert.equal(CORE.mediaName(bad), null, "不合法名字：" + bad);
  // 无图旧稿：两个字段都为 null；有图稿：按单词对齐，取景越界的格当居中
  const old = CORE.migrateDraft({ v: 2, word: "life", t: now });
  assert.equal(old.media, null); assert.equal(old.crops, null);
  const d = CORE.migrateDraft({ v: 2, word: "life", t: now, media: { def: a, cells: [j, "bad", null] }, crops: [{ z: 2, x: 0.3, y: 0.6 }, { z: 9, x: 0, y: 0 }] });
  assert.deepEqual(plain(d.media), { def: a, cells: [j, null, null, null] });
  assert.deepEqual(plain(d.crops), [{ z: 2, x: 0.3, y: 0.6 }, null, null, null]);
  assert.deepEqual(plain(CORE.mediaNames({ media: { def: a, cells: [j, a, "x"] } })), [a, j], "引用去重、只认合法名");
  assert.equal(CORE.migrateDraft({ v: 2, word: "life", t: now, media: { def: "bad", cells: [] } }).media, null, "全是坏名字：当无图");
}

// ---------- 存图：空间、写失败、读回不一致、超时与迟到 ----------
{
  const b = memBackend(), st = MEDIA.create(b, 50), v = B64("x"), n = MEDIA.nameFor(v, "jpg");
  assert.equal(await MEDIA.create(null).save(n, v), "none", "没有后端");
  b.space = 10; assert.equal(await st.save(n, v), "space", "写前看容量：不够就不写"); assert.equal(b.puts, 0);
  b.space = null; b.failPut = true; assert.equal(await st.save(n, v), "write"); assert.equal(b.files.size, 0);
  b.failPut = false; const realGet = b.get; b.get = async () => "AAAA"; assert.equal(await st.save(n, v), "write", "读回不一致不算存好");
  b.get = realGet;
  assert.equal(await st.save(n, v), "ok"); const puts = b.puts;
  assert.equal(await st.save(n, v), "ok"); assert.equal(b.puts, puts, "同图本次已确认：不重复写");
  // 超时：写入迟迟不回 → "write"、未确认；迟到写成的文件没人引用，之后被清理掉
  const late = memBackend(), lst = MEDIA.create(late, 30); let release; late.hangPut = new Promise((r) => { release = r; });
  const w = B64("late"), wn = MEDIA.nameFor(w, "png");
  assert.equal(await lst.save(wn, w), "write", "超时按失败");
  assert.equal(lst.busy(), false, "超时后不再挂着「正在写」");
  release(); await flush(); assert.equal(late.files.has(wn), true, "迟到的写入落了盘");
  late.hangPut = null;
  assert.equal(await lst.sweep(async () => ({ ok: true, names: {} }), () => false), true);
  assert.equal(late.files.has(wn), false, "迟到写成、没被引用的文件被清理");
  // 配额异常识别为空间不够
  const q = memBackend(); q.put = async () => { const e = new Error("x"); e.name = "QuotaExceededError"; throw e; };
  assert.equal(await MEDIA.create(q, 50).save(n, v), "space");
}

// ---------- 清理：引用判定不了 / 正在写 / 共享图 / 列目录失败都不误删；删除前复核 ----------
{
  const b = memBackend(), st = MEDIA.create(b, 50);
  const [A, Bn, C] = ["a", "b", "c"].map((s) => { const v = B64(s); const n = MEDIA.nameFor(v, "jpg"); b.files.set(n, v); return n; });
  b.files.set("author-notes.txt", "keep"); // 不是我们起的名字：永不删
  assert.equal(await st.sweep(async () => ({ ok: false }), () => false), false); assert.equal(b.files.size, 4, "引用读不全：一张不删");
  b.failList = true; assert.equal(await st.sweep(async () => ({ ok: true, names: {} }), () => false), false); b.failList = false;
  assert.equal(b.files.size, 4, "列不全：不删");
  // 复核：第二次读引用时 B 被新写入的稿引用了 → 不删 B
  let calls = 0; const refs = async () => (++calls === 1 ? { ok: true, names: { [A]: true } } : { ok: true, names: { [A]: true, [Bn]: true } });
  assert.equal(await st.sweep(refs, () => false), true);
  assert.deepEqual([...b.files.keys()].sort(), [A, Bn, "author-notes.txt"].sort(), "C 无人引用被删；B 在复核时被引用而保住；外来文件不碰");
  // 第二次读引用失败 → 已列出的候选也不删
  b.files.set(C, B64("c")); calls = 0;
  assert.equal(await st.sweep(async () => (++calls === 1 ? { ok: true, names: {} } : { ok: false }), () => false), false);
  assert.equal(b.files.has(C), true, "复核读失败：不删");
  // 内存里还在用（keep）的不删
  assert.equal(await st.sweep(async () => ({ ok: true, names: { [A]: true, [Bn]: true } }), (x) => x === C), true); assert.equal(b.files.has(C), true);
  // 写入未完成不删：有图在写时整次清理不做
  let release; b.hangPut = new Promise((r) => { release = r; });
  const v = B64("d"), D = MEDIA.nameFor(v, "png"), saving = st.save(D, v); await flush();
  assert.equal(st.busy(), true);
  assert.equal(await st.sweep(async () => ({ ok: true, names: {} }), () => false), false, "正在写：不清理");
  assert.equal(b.files.size, 4);
  release(); assert.equal(await saving, "ok"); b.hangPut = null;
  // 删除失败：返回 false 等下次
  b.failRemove = true; assert.equal(await st.sweep(async () => ({ ok: true, names: {} }), () => false), false); b.failRemove = false;
}

// ---------- draft.js refs：两侧主稿 + 全部恢复副本，任一侧读失败就判定不了 ----------
function memory() { const m = new Map(); return { m, getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, v), removeItem: (k) => m.delete(k) }; }
const draftWith = (word, names, t = now) => JSON.stringify({ v: 2, word, t, media: { def: names[0] || null, cells: names.slice(1) } });
{
  const local = memory(), remote = memory();
  let failRemote = false, failRescue = false;
  const tools = {
    getStorage: async ({ key }) => { if (failRemote || (failRescue && key === R)) throw new Error("offline"); return { data: remote.getItem(key) }; },
    setStorage: async ({ key, data }) => remote.setItem(key, data), removeStorage: async ({ key }) => remote.removeItem(key),
  };
  const store = DRAFT.create(local, (n) => (tools[n] ? tools : null));
  const n1 = MEDIA.nameFor(B64(1), "jpg"), n2 = MEDIA.nameFor(B64(2), "png"), n3 = MEDIA.nameFor(B64(3), "jpg"), n4 = MEDIA.nameFor(B64(4), "jpg");
  local.setItem(K, draftWith("LIFE", [null, n1]));
  remote.setItem(K, draftWith("LOVE", [n2, null]));
  local.setItem(R, JSON.stringify([draftWith("OLD", [null, n3])]));
  remote.setItem(R, JSON.stringify([draftWith("DEAD", [null, n4], now - TTL), "{broken"]));
  const r = await store.refs();
  assert.equal(r.ok, true); assert.deepEqual(Object.keys(r.names).sort(), [n1, n2, n3].sort(), "两侧主稿 + 恢复副本都算引用；到期副本不算");
  failRemote = true; assert.equal((await store.refs()).ok, false, "端侧主稿读失败：判定不了");
  failRemote = false; failRescue = true; assert.equal((await store.refs()).ok, false, "恢复副本读失败：判定不了");
  failRescue = false;
  // 端侧只能写不能读（blind）：永远判定不了，不删
  const blind = DRAFT.create(memory(), (n) => (n === "setStorage" ? tools : null));
  assert.equal((await blind.refs()).ok, false);
  // 不能迁移的原文（v 不对）里的引用也保住
  local.setItem(K, JSON.stringify({ v: 3, t: now, media: { def: n4, cells: [] } }));
  assert.ok((await store.refs()).names[n4], "不能迁移的原文：引用照算");
}

// ---------- 草稿控制函数（真实 app-draft.js 函数 + 替身） ----------
function ctl(over = {}) {
  const status = { textContent: "" }, saves = [];
  const e = loadAppFunctions(["draftMedia", "snapMedia", "emptyMedia", "heldAny", "releaseHeld", "liveImages", "syncMedia", "storeImage", "loadMedia", "mediaNote", "renderDraftStatus", "keepMedia", "sweepReady", "sweepMedia", "writesPending"], Object.assign({
    CORE, window: { MEDIA, DRAFT }, Date: { now: () => now }, Promise, Infinity,
    state: { letters: [], images: [], crops: [], image: null }, el: { draftStatus: status },
    prevMedia: { word: "", def: null, cells: [], crops: [] }, mediaMissing: "", mediaUnsure: false, mediaQueue: Promise.resolve(), mediaJobs: 0, sweeping: false,
    SAVED: "草稿已保存。", MEDIA_MSG: {
      write: "配图没能保存：草稿仍保留上一次的配图和取景；这次换的图只在本次打开期间有效，请及时导出。",
      space: "设备空间不够，配图没有保存；文字草稿已保存，请及时导出。",
      none: "这台设备不支持保存配图，重开后需要重新选图；文字草稿已保存，请及时导出。",
    },
    draftNotice: "草稿已保存。", draftSavedAt: 0, draftEpoch: 0, draftLoaded: true, draftWrite: 0, draftAcceptedWrite: 0, draftGuard: null, sideGuard: null,
    entryFrom: "", saveDraft() { saves.push(1); },
    encodeImage: (img) => ({ b64: img.b64, ext: img.ext || "jpg" }), decodeImage: async (b64, name) => ({ b64, bkName: name }),
    mediaReady: Promise.resolve(), mediaPartial: false, setTimeout, mediaHeld: { word: "", def: null, cells: [], crops: [] },
  }, over, { mediaStores: over.mediaStores || (over.mediaStore ? [over.mediaStore] : []) }));
  e.saves = saves; e.status = status;
  return e;
}
{
  const def = { bkName: MEDIA.nameFor(B64("default"), "jpg") };
  const cell = { bkName: MEDIA.nameFor(B64("cell"), "jpg") };
  const original = { z: 2, x: 0.3, y: 0.4 }, own = { z: 3, x: 0.6, y: 0.5 };
  const state = { letters: ["L"], images: [null], crops: [null], defaultCrops: [], imgIndex: 0 };
  const e = loadAppFunctions(["applyCrop", "copyCrop", "removeCellPhoto"], {
    state, draftEpoch: 0, checkDraftExpiry: () => false, leaveCropper() {}, changed() {},
    releaseHeld() {}, bumpImg() {}, renderImgPanel() {}, el: { imgPick: { focus() {} } }
  });
  function apply(kind, image, crop) {
    e.work = { i: 0, epoch: 0, kind, img: image, crop };
    e.applyCrop();
  }
  apply("def", def, original);
  apply("cell", cell, own);
  const saved = ctl({state}).draftMedia();
  const restored = CORE.migrateDraft({v: 2, word: "L", ...saved});
  assert.deepEqual(plain(restored.media.defaultCrops[0]), original, "默认图的取景能随草稿保留");
  assert.deepEqual(plain(restored.crops[0]), own);
  e.removeCellPhoto();
  assert.deepEqual(plain(state.crops[0]), original, "移除本格图恢复原取景");
  apply("cell", cell, own);
  const replacement = { z: 1.5, x: 0.5, y: 0.6 };
  apply("def", def, replacement);
  assert.deepEqual(plain(state.crops[0]), own, "更换默认图时独立图取景仍在");
  e.removeCellPhoto();
  assert.deepEqual(plain(state.crops[0]), replacement);
}
// D3 复审（2026-11-17）：默认图暂未读回、独立图读回了。只改文字保存时，默认图在那一格的取景不能被独立图的取景顶掉；
// 移除独立图后，草稿里那一格配的是默认图原来的取景
{
  const def = MEDIA.nameFor(B64("heldDefCrop"), "png"), cell = MEDIA.nameFor(B64("heldDefCell"), "jpg");
  const dc = { z: 2, x: 0.3, y: 0.4 }, oc = { z: 3, x: 0.6, y: 0.5 };
  const b = memBackend(); b.files.set(cell, B64("heldDefCell"));
  const st = MEDIA.create(b, 50), load = st.load;
  st.load = async (n, l) => (n === def ? { error: true } : load(n, l)); // 默认图这次读失败（判断不了在不在）
  const e = ctl({ mediaStores: [st] });
  const r = await e.loadMedia(CORE.migrateDraft({ v: 2, t: now, word: "LI", media: { def, cells: [cell, null], defaultCrops: [dc, null] }, crops: [oc, null] }));
  assert.equal(r.held.def, def);
  e.mediaHeld = r.held;
  Object.assign(e.state, { letters: ["L", "I"], images: [r.cells[0], null], image: null, crops: [oc, null], defaultCrops: [dc, null] });
  e.prevMedia = e.snapMedia(Object.assign({ word: "LI" }, e.draftMedia()));
  assert.deepEqual(plain(e.draftMedia().media.defaultCrops[0]), dc, "只改文字：默认图的取景照旧");
  e.state.images[0] = null; e.state.crops[0] = null; // 移除独立图（默认图没读回，界面上这格空着）
  assert.deepEqual(plain(e.draftMedia().crops[0]), dc, "移除独立图：草稿里这一格配默认图原来的取景");
}
const img = (seed, ext) => ({ b64: B64(seed), ext });
{
  // 默认图与独立图：草稿只引用确认过的；没确认的那一格沿用上次落盘的「文件名 + 取景」（配对）
  const e = ctl(), S = e.state;
  S.letters = ["L", "I", "F", "E"];
  const own = img("own"), def = img("def");
  own.bkName = MEDIA.nameFor(own.b64, "jpg"); def.bkName = MEDIA.nameFor(def.b64, "jpg");
  S.images = [own, null, null, null]; S.image = def; S.crops = [{ z: 2, x: 0.5, y: 0.5 }, { z: 1.5, x: 0.4, y: 0.5 }, null, null];
  let m = e.draftMedia();
  assert.deepEqual(plain(m.media), { def: def.bkName, cells: [own.bkName, null, null, null] }, "独立图记在格上，其余格用默认图");
  assert.deepEqual(plain(m.crops.map((c) => c && c.z)), [2, 1.5, null, null]);
  e.prevMedia = e.snapMedia({ word: "LIFE", media: m.media, crops: m.crops });
  // 第 1 格换了新图（还没确认）、取景也改了：草稿里第 1 格仍是旧图 + 旧取景；默认图换了没确认：默认图那几格也保留旧取景
  const fresh = img("fresh"), def2 = img("def2");
  S.images[0] = fresh; S.crops[0] = { z: 3, x: 0.1, y: 0.1 }; S.image = def2; S.crops[1] = { z: 2.5, x: 0.5, y: 0.5 };
  m = e.draftMedia();
  assert.equal(m.media.cells[0], own.bkName, "新图没确认：沿用旧图"); assert.equal(m.crops[0].z, 2, "旧图配旧取景，不套新取景");
  assert.equal(m.media.def, def.bkName); assert.equal(m.crops[1].z, 1.5, "默认图没确认：默认图那格也配旧取景");
  // 确认之后：新图 + 新取景一起进草稿
  fresh.bkName = MEDIA.nameFor(fresh.b64, "jpg"); def2.bkName = MEDIA.nameFor(def2.b64, "jpg");
  m = e.draftMedia(); assert.equal(m.media.cells[0], fresh.bkName); assert.equal(m.crops[0].z, 3); assert.equal(m.media.def, def2.bkName); assert.equal(m.crops[1].z, 2.5);
  // 单词改了、那一位字母变了：不拿别的字母的旧图兜底
  e.prevMedia = { word: "LIFE", def: null, cells: [own.bkName], crops: [{ z: 2, x: 0.5, y: 0.5 }] };
  S.letters = ["X", "I", "F", "E"]; S.image = null; S.images = [img("x"), null, null, null];
  assert.equal(e.draftMedia(), null, "字母变了的格没有可沿用的旧图：整份没有配图");
  // 没有任何配图：不写字段
  S.images = [null, null, null, null]; assert.equal(e.draftMedia(), null);
}
{
  // 存图队列：成功 → 记名、状态「草稿和配图已保存」、再存一次草稿；失败按原因写状态行；不支持 → 不再重试
  const b = memBackend(), e = ctl({ mediaStore: MEDIA.create(b, 50), mediaReady: Promise.resolve() }), S = e.state;
  S.letters = ["L"]; const a = img("a", "png"); S.images = [a];
  e.syncMedia(); assert.equal(a.bkBusy, true); assert.equal(e.mediaJobs, 1);
  e.syncMedia(); await e.mediaQueue; await flush();
  assert.equal(a.bkName, MEDIA.nameFor(a.b64, "png")); assert.ok(b.files.has(a.bkName)); assert.equal(e.saves.length, 1, "存好后再存一次草稿");
  assert.equal(b.puts, 1, "排队中重复触发不重复写"); assert.equal(e.mediaJobs, 0);
  assert.match(e.status.textContent, /^草稿和配图已保存。/);
  const f = img("f"); S.images = [f]; b.failPut = true; e.syncMedia(); await e.mediaQueue; await flush();
  assert.equal(f.bkFail, "write"); assert.match(e.status.textContent, /^配图没能保存：草稿仍保留上一次的配图和取景/); assert.equal(e.saves.length, 1, "没存成不写草稿");
  b.failPut = false; e.syncMedia(); await e.mediaQueue; assert.equal(f.bkName, undefined, "30 秒内不重试");
  now += 30001; e.syncMedia(); await e.mediaQueue; await flush(); assert.ok(f.bkName, "过 30 秒再试，成功");
  b.space = 1; const s2 = img("s2"); S.images = [s2]; e.syncMedia(); await e.mediaQueue; await flush();
  assert.match(e.status.textContent, /^设备空间不够，配图没有保存；文字草稿已保存/); b.space = null;
  // 状态行只有一条：文字草稿本身有警告时先说那条
  e.draftNotice = "未确认保存成功，请及时导出。"; e.renderDraftStatus(); assert.match(e.status.textContent, /^未确认保存成功/);
  e.draftNotice = "草稿已保存。";
  // 排队期间被换掉的图不存
  const gone = img("gone"); S.images = [gone]; e.syncMedia(); S.images = [null]; await e.mediaQueue;
  assert.equal(gone.bkName, undefined); assert.equal(b.files.has(MEDIA.nameFor(gone.b64, "jpg")), false);
  // 作品换了一轮（到期重载）：迟到的结果不改状态、不存草稿
  const late = img("late"); S.images = [late]; const saves = e.saves.length; e.syncMedia(); e.draftEpoch++; await e.mediaQueue; await flush();
  assert.equal(e.saves.length, saves, "换了一轮：不再存草稿");
  // 没有后端：状态行写明不支持，且不再重试
  const n = ctl({ mediaStore: null, mediaReady: Promise.resolve() }); n.state.letters = ["L"]; const x = img("x"); n.state.images = [x];
  n.syncMedia(); await n.mediaQueue; await flush();
  assert.equal(x.bkFail, "none"); assert.match(n.status.textContent, /^这台设备不支持保存配图，重开后需要重新选图/);
  now += 1e9; n.syncMedia(); assert.equal(x.bkBusy, false, "不支持就不再试");
}
{
  // 恢复：读回图（几格共用一个文件只读一次）、缺图那格留空并写明、读失败标记「不确定」（本次不清理）
  const b = memBackend(), st = MEDIA.create(b, 50);
  const a = B64("a"), an = MEDIA.nameFor(a, "jpg"), d = B64("d"), dn = MEDIA.nameFor(d, "png"), lost = MEDIA.nameFor(B64("lost"), "jpg");
  b.files.set(an, a); b.files.set(dn, d);
  let gets = 0; const realGet = b.get; b.get = async (k) => { gets++; return realGet(k); };
  const e = ctl({ mediaStore: st, mediaReady: Promise.resolve() });
  let r = await e.loadMedia({ media: { def: dn, cells: [an, null, an, lost] } });
  assert.equal(r.def.bkName, dn); assert.equal(r.cells[0].bkName, an); assert.equal(r.cells[0], r.cells[2], "共用一个文件：同一张图"); assert.equal(gets, 2, "只读一次");
  assert.equal(r.cells[3], null); assert.equal(r.lost, "有 1 张配图没能找回（第 4 格），缺图的格先用默认图，请重新选图。", "B7-S1：有默认图时照实说回落"); assert.equal(r.unsure, false, "确实不在：不算不确定");
  r = await e.loadMedia({ media: { def: lost, cells: [lost, null, lost] } });
  assert.equal(r.lost, "有 3 张配图没能找回（默认图、第 1、3 格），已留空，请重新选图。");
  b.failGet = true; r = await e.loadMedia({ media: { def: null, cells: [an] } });
  assert.equal(r.cells[0], null); assert.equal(r.unsure, true, "读失败：判断不了，本次不清理"); b.failGet = false;
  b.failList = true; r = await e.loadMedia({ media: { def: null, cells: [an] } }); assert.equal(r.unsure, true, "列不出目录：不确定"); b.failList = false;
  const none = plain(await e.loadMedia({ media: null })); delete none.held;
  assert.deepEqual(none, { def: null, cells: [], lost: "", unsure: false }, "无图旧稿：什么都不读");
  // 恢复缺图的说明在文字草稿没有新状态时显示
  e.mediaMissing = "有 1 张配图没能找回（第 4 格），已留空，请重新选图。"; e.draftNotice = ""; e.renderDraftStatus();
  assert.equal(e.status.textContent, e.mediaMissing);
}
{
  // 清理前提（sweepReady）：草稿读完、无写入在途、两道闸门都放行、没有图在存、恢复时没有读失败的图；内存里用着的、上次落盘的都保住
  const b = memBackend(), st = MEDIA.create(b, 50);
  const keep = MEDIA.nameFor(B64("k"), "jpg"), prev = MEDIA.nameFor(B64("p"), "jpg"), junk = MEDIA.nameFor(B64("j"), "jpg");
  for (const n of [keep, prev, junk]) b.files.set(n, "x");
  let refsCalls = 0;
  const e = ctl({ mediaStore: st, draftStore: { refs: async () => { refsCalls++; return { ok: true, names: {} }; } } });
  e.state.images = [{ bkName: keep }]; e.prevMedia = { word: "L", def: prev, cells: [], crops: [] };
  for (const [k, v] of [["mediaUnsure", true], ["draftLoaded", false], ["draftGuard", {}], ["sideGuard", {}], ["mediaJobs", 1], ["draftWrite", 1]]) {
    const old = e[k]; e[k] = v; await e.sweepMedia(); assert.equal(b.files.size, 3, "前提不满足不清理：" + k); e[k] = old;
  }
  assert.equal(refsCalls, 0);
  await e.sweepMedia();
  assert.deepEqual([...b.files.keys()].sort(), [keep, prev].sort(), "只删无人引用、内存不用的");
}

// ---------- 端到端：真实 draft.js 存储 + media.js，18h 到期清理、共享图、端侧读失败恢复后原图仍在 ----------
{
  const local = memory(), remote = memory(); let failRemote = false;
  const tools = {
    getStorage: async ({ key }) => { if (failRemote) throw new Error("offline"); return { data: remote.getItem(key) }; },
    setStorage: async ({ key, data }) => remote.setItem(key, data), removeStorage: async ({ key }) => remote.removeItem(key),
  };
  const store = DRAFT.create(local, (n) => (tools[n] ? tools : null)), b = memBackend(), st = MEDIA.create(b, 50);
  const a = B64("a"), an = MEDIA.nameFor(a, "jpg"), s = B64("s"), sn = MEDIA.nameFor(s, "jpg");
  assert.equal(await st.save(an, a), "ok"); assert.equal(await st.save(sn, s), "ok");
  local.setItem(K, draftWith("LIFE", [null, an, sn])); remote.setItem(K, draftWith("LIFE", [null, an, sn]));
  local.setItem(R, JSON.stringify([draftWith("OLD", [null, sn], now - TTL + 1000)])); // 恢复副本也引用 sn，比主稿早到期
  // 端侧读失败：一张不删；恢复可读后原图都在
  failRemote = true; assert.equal(await st.sweep(store.refs, () => false), false); assert.equal(b.files.size, 2);
  failRemote = false; assert.equal(await st.sweep(store.refs, () => false), true); assert.equal(b.files.size, 2, "端侧恢复可读后：被引用的图都在");
  // 副本先到期：sn 仍被主稿引用（有效稿共享图不误删）
  now += 2000; await store.purge(); assert.equal(await st.sweep(store.refs, () => false), true);
  assert.deepEqual([...b.files.keys()].sort(), [an, sn].sort(), "共享图仍被有效主稿引用：不删");
  // 主稿 18h 到期：清掉草稿键后，配图跟着清
  now += TTL; assert.equal(await store.purge(), true); assert.equal(local.getItem(K), null);
  assert.equal(await st.sweep(store.refs, () => false), true); assert.equal(b.files.size, 0, "到期后配图一起清掉");
}

// ---------- 容器文件系统后端：分片写（4 字符对齐）、分片读（3 字节对齐）、列目录、删除、空间 ----------
{
  const disk = new Map(), writes = [];
  const api = {
    getFileStorageInfo: async () => ({ usedBytes: 100, limitBytes: 1000000, writeChunkMaxBytes: 10, readChunkMaxBytes: 7 }),
    mkdir: async () => {},
    writeFile: async ({ filePath, data, encoding }) => { writes.push(data.length); assert.equal(encoding, "base64"); disk.set(filePath, Buffer.from(data, "base64")); },
    appendFile: async ({ filePath, data }) => { writes.push(data.length); disk.set(filePath, Buffer.concat([disk.get(filePath), Buffer.from(data, "base64")])); },
    readFile: async ({ filePath, position, length }) => {
      assert.equal(length % 3, 0, "读取按 3 字节对齐"); const buf = disk.get(filePath); if (!buf) throw new Error("ENOENT");
      const part = buf.subarray(position, position + length); return { data: part.toString("base64"), bytesRead: part.length, eof: position + part.length >= buf.length };
    },
    readDir: async ({ dirPath }) => ({ files: [...disk.keys()].filter((k) => k.startsWith(dirPath + "/")).map((k) => ({ name: k.slice(dirPath.length + 1) })), truncated: false }),
    unlink: async ({ filePath }) => { disk.delete(filePath); },
  };
  const fsb = MEDIA.fsBackend((n) => (api[n] ? api : null), "/usr/data/backronym-media"), st = MEDIA.create(fsb, 200);
  const v = Buffer.from("Hello, 藏头！这是一段比较长的测试数据，用来检查分片。").toString("base64"), n = MEDIA.nameFor(v, "png");
  assert.equal(await st.save(n, v), "ok", "分片写入后整份读回一致");
  assert.ok(writes.length > 2, "分了多片");
  assert.ok(writes.slice(0, -1).every((len) => len === 8), "除最后一片外每片 8 字符（≤ 10 且按 4 对齐）");
  assert.deepEqual(plain(await st.list()), [n]);
  assert.equal(await st.sweep(async () => ({ ok: true, names: {} }), () => false), true); assert.equal(disk.size, 0);
  api.readDir = async () => ({ files: [], truncated: true });
  assert.equal(await st.list(), null, "列表被截断：当列不全");
  api.getFileStorageInfo = async () => ({ usedBytes: 999990, limitBytes: 1000000, writeChunkMaxBytes: 10, readChunkMaxBytes: 7 });
  assert.equal(await st.save(MEDIA.nameFor("QUFB", "jpg"), "QUFB"), "space", "容器报的剩余空间不够：不写");
}
// ---------- B7-S2：容器文件系统读写边界——短读、不报字节数、1～2 字节短读、读取次数上限、极小写分片 ----------
{
  const mkApi = (info, shorten) => {
    const disk = new Map(), writes = [];
    const api = {
      getFileStorageInfo: async () => info,
      mkdir: async () => {},
      writeFile: async ({ filePath, data }) => { writes.push(data.length); disk.set(filePath, Buffer.from(data, "base64")); },
      appendFile: async ({ filePath, data }) => { writes.push(data.length); disk.set(filePath, Buffer.concat([disk.get(filePath), Buffer.from(data, "base64")])); },
      readFile: async ({ filePath, position, length }) => {
        const buf = disk.get(filePath); if (!buf) throw new Error("ENOENT");
        const part = buf.subarray(position, position + shorten(length, position)), eof = position + part.length >= buf.length;
        return { data: part.toString("base64"), bytesRead: part.length, eof };
      },
      readDir: async () => ({ files: [], truncated: false }), unlink: async () => {},
    };
    return { api, disk, writes, st: MEDIA.create(MEDIA.fsBackend(() => api, "/d"), 2000) };
  };
  const data = Buffer.from(Array.from({ length: 200 }, (_, i) => (i * 37) & 255)).toString("base64"), name = MEDIA.nameFor(data, "png");
  // 短读：每次只给 5 字节（不是 3 的倍数），各段带补位；必须从对齐处重读，整份仍一致
  const a = mkApi({ usedBytes: 0, limitBytes: 1e9, writeChunkMaxBytes: 1e6, readChunkMaxBytes: 30 }, () => 5);
  assert.equal(await a.st.save(name, data), "ok", "短读时整份读回仍一致");
  assert.deepEqual(plain(await MEDIA.create(MEDIA.fsBackend(() => a.api, "/d"), 2000).load(name)), { b64: data }, "恢复时短读也读回完整原图");
  // 不报 bytesRead：按 base64 长度推算，继续读完，不只拿第一段
  const b = mkApi({ usedBytes: 0, limitBytes: 1e9, writeChunkMaxBytes: 1e6, readChunkMaxBytes: 30 }, (len) => len);
  const realRead = b.api.readFile; b.api.readFile = async (q) => { const r = await realRead(q); delete r.bytesRead; return r; };
  assert.equal(await b.st.save(name, data), "ok", "没报字节数也读完整份");
  // 未到末尾却只给 1～2 字节：没法对齐，按读失败处理（保存不报成功、恢复报读失败而不是缺图）
  const c = mkApi({ usedBytes: 0, limitBytes: 1e9, writeChunkMaxBytes: 1e6, readChunkMaxBytes: 30 }, (len, pos) => (pos ? 2 : len));
  assert.equal(await c.st.save(name, data), "write", "1～2 字节短读：不算存好");
  assert.deepEqual(plain(await c.st.load(name)), { error: true }, "恢复：判定为读失败");
  // 读取次数上限：每次 3 字节，超过 10000 次（30000 字节）就放弃，不无限读
  const big = Buffer.alloc(30003, 7).toString("base64"), bn = MEDIA.nameFor(big, "jpg");
  const d = mkApi({ usedBytes: 0, limitBytes: 1e9, writeChunkMaxBytes: 1e6, readChunkMaxBytes: 1 }, (len) => len);
  assert.equal(await d.st.save(bn, big), "write", "超过读取次数上限：不算存好");
  const ok = Buffer.alloc(29997, 7).toString("base64");
  assert.equal(await d.st.save(MEDIA.nameFor(ok, "jpg"), ok), "ok", "上限以内（3 字节一片、9999 片）照常读完");
  // 极小写分片：容器报 1 字节上限，也至少按 4 字符写（base64 每段可独立解码）
  const e = mkApi({ usedBytes: 0, limitBytes: 1e9, writeChunkMaxBytes: 1, readChunkMaxBytes: 1e6 }, (len) => len);
  assert.equal(await e.st.save(name, data), "ok");
  assert.ok(e.writes.length > 1 && e.writes.every((len) => len === 4), "极小写上限：每片 4 字符");
}
// ---------- B7-S2：默认期限——create 不传 ms 时每次后端调用按 8000ms 计时 ----------
{
  const waits = [], env2 = { window: {}, Date, Promise, clearTimeout, setTimeout: (f, ms) => { waits.push(ms); return setTimeout(f, 0); } };
  for (const f of ["core.js", "media.js"]) vm.runInNewContext(fs.readFileSync(new URL("../app/assets/" + f, import.meta.url), "utf8"), env2);
  const b = memBackend(); b.put = () => new Promise(() => {}); // 写入永不返回
  const v = B64("deadline");
  assert.equal(await env2.window.MEDIA.create(b).save(env2.window.MEDIA.nameFor(v, "jpg"), v), "write", "写入不返回：到期按失败");
  assert.ok(waits.length >= 2 && waits.every((ms) => ms === 8000), "默认期限 8000ms：" + waits.join(","));
}
// ---------- B7-R3：同名删除与保存串行。删除挂起时保存同内容：等删除落定后真写入并读回，最终文件在、可读；后续保存不假成功 ----------
{
  const b = memBackend(), st = MEDIA.create(b, 40), v = B64("race"), n = MEDIA.nameFor(v, "jpg");
  assert.equal(await st.save(n, v), "ok");
  let releaseRm; const realRemove = b.remove; b.remove = (k) => new Promise((ok) => { releaseRm = () => { realRemove(k).then(ok); }; });
  const sweeping = st.sweep(async () => ({ ok: true, names: {} }), () => false); await flush();
  assert.ok(releaseRm, "删除已发出、挂起");
  const saving = st.save(n, v); await flush();
  releaseRm(); assert.equal(await saving, "ok"); await sweeping;
  assert.equal(b.files.get(n), v, "删除落定后保存真写入：文件在");
  assert.deepEqual(plain(await st.load(n)), { b64: v }, "可读");
  b.remove = realRemove;
  // 删除超时后迟到：落定前同名保存不报成功；落定后再存，文件在
  let late; b.remove = (k) => new Promise((ok) => { late = () => { realRemove(k).then(ok); }; });
  await st.sweep(async () => ({ ok: true, names: {} }), () => false); // 40ms 超时，删除仍在途
  assert.equal(await st.save(n, v), "write", "在途删除没落定：不报成功");
  late(); await flush();
  assert.equal(b.files.has(n), false, "迟到的删除落定");
  b.remove = realRemove; const puts = b.puts;
  assert.equal(await st.save(n, v), "ok"); assert.ok(b.puts > puts, "重新真写入，不是按旧记录假成功"); assert.equal(b.files.get(n), v);
  // 正在写的同名图：清扫看到「正在写」，不删
  let hold; b.hangPut = new Promise((r) => { hold = r; });
  const w2 = B64("w2"), n2 = MEDIA.nameFor(w2, "jpg"); b.files.set(n2, w2);
  const s2 = st.save(n2, w2); await flush();
  assert.equal(await st.sweep(async () => ({ ok: true, names: {} }), () => false), false, "有图在写：整次不清");
  hold(); assert.equal(await s2, "ok"); b.hangPut = null; assert.equal(b.files.get(n2), w2);
}

// B7-R3：清扫逐个删到一半时，下一个候选被保存——(a) 读回还在进行：看到「正在写」不删；(b) 保存已完整结束并报成功：本轮不删
for (const mode of ["readback", "done"]) {
  const b = memBackend(), st = MEDIA.create(b, 200);
  const v1 = B64("one" + mode), v2 = B64("two" + mode); b.files.set(MEDIA.nameFor(v1, "jpg"), v1); b.files.set(MEDIA.nameFor(v2, "jpg"), v2);
  const [first, second] = [...b.files.keys()], secondV = b.files.get(second);
  let release; const realRemove = b.remove; b.remove = (k) => (k === first ? new Promise((ok) => { release = () => realRemove(k).then(ok); }) : realRemove(k));
  let hold; const realGet = b.get; if (mode === "readback") b.get = (k) => (k === second ? new Promise((ok) => { hold = () => ok(realGet(k)); }) : realGet(k));
  const sweeping = st.sweep(async () => ({ ok: true, names: {} }), () => false); await flush();
  const saving = st.save(second, secondV); await flush();
  if (mode === "done") assert.equal(await saving, "ok", "保存先完整结束");
  release(); await sweeping; if (hold) hold();
  assert.equal(await saving, "ok"); assert.equal(b.files.has(first), false);
  assert.equal(b.files.get(second), secondV, mode + "：保存报了成功，文件就在");
}

// B7-R3（复审）：清扫在列目录 / 读引用时挂起，期间同名再次保存——已确认（快速返回）与未确认（真写入）两种都报成功，这一轮都不能删
for (const known of [true, false]) {
  for (const hang of ["list", "refs"]) {
    const b = memBackend(), st = MEDIA.create(b, 200), v = B64("again" + known + hang), n = MEDIA.nameFor(v, "jpg");
    if (known) assert.equal(await st.save(n, v), "ok"); else b.files.set(n, v); // 未确认：文件在、本次没存过
    let go; const gate = new Promise((r) => { go = r; });
    const realList = b.list; if (hang === "list") b.list = async () => { await gate; return realList(); };
    const refs = hang === "refs" ? async () => { await gate; return { ok: true, names: {} }; } : async () => ({ ok: true, names: {} });
    const sweeping = st.sweep(refs, () => false); await flush();
    assert.equal(await st.save(n, v), "ok", "清扫进行中再保存：成功");
    go(); await sweeping;
    assert.equal(b.files.get(n), v, (known ? "已确认" : "未确认") + " / 挂起在 " + hang + "：报了成功的这一轮不删");
    assert.deepEqual(plain(await st.load(n)), { b64: v }, "之后可读");
  }
}

// ---------- B7-R4：mkdir 失败下一张再试；主后端写失败退到下一个后端 ----------
{
  let mk = 0; const disk = new Map();
  const api = {
    getFileStorageInfo: async () => ({ usedBytes: 0, limitBytes: 1e9, writeChunkMaxBytes: 1e6, readChunkMaxBytes: 1e6 }),
    mkdir: async () => { mk++; if (mk === 1) throw new Error("busy"); },
    writeFile: async ({ filePath, data }) => { if (mk < 2) throw new Error("no dir"); disk.set(filePath, Buffer.from(data, "base64")); },
    appendFile: async () => {}, unlink: async () => {}, readDir: async () => ({ files: [] }),
    readFile: async ({ filePath, position, length }) => { const b = disk.get(filePath); const part = b.subarray(position, position + length); return { data: part.toString("base64"), bytesRead: part.length, eof: position + part.length >= b.length }; },
  };
  const st = MEDIA.create(MEDIA.fsBackend((n) => api, "/d"), 200), v = B64("mk"), n = MEDIA.nameFor(v, "jpg");
  assert.equal(await st.save(n, v), "write", "目录建失败：这张没存成");
  assert.equal(await st.save(n, v), "ok", "下一次再建目录、存成"); assert.equal(mk, 2);
  // 降级：主后端写失败、第二个后端存成 → 图算存好，读图时在第二个后端找到
  const main = memBackend(), alt = memBackend(); main.failPut = true;
  const e = ctl({ mediaStores: [MEDIA.create(main, 50), MEDIA.create(alt, 50)] }); e.mediaStore = e.mediaStores[0];
  e.state.letters = ["L"]; const a = img("deg"); e.state.images = [a];
  e.syncMedia(); await e.mediaQueue; await flush();
  assert.ok(a.bkName && alt.files.has(a.bkName) && !main.files.has(a.bkName), "主后端失败：退到第二个后端存好");
  const r = await e.loadMedia({ media: { def: null, cells: [a.bkName] } });
  assert.ok(r.cells[0], "读图各后端都找");
  // 都失败：报主后端的原因
  alt.failPut = true; main.space = 1; const c = img("both"); e.state.images = [c]; e.syncMedia(); await e.mediaQueue; await flush();
  assert.equal(c.bkFail, "space");
}

// ---------- B7-R2：后端切换（IndexedDB → 文件系统，及文件系统这次不可用）----------
{
  const idb = memBackend(), fsd = memBackend();
  // 会话 1：只有 IndexedDB，图存在那里
  const s1 = ctl({ mediaStores: [MEDIA.create(idb, 50)] }); s1.mediaStore = s1.mediaStores[0];
  s1.state.letters = ["L", "I"]; const a = img("sw"); s1.state.image = a; s1.syncMedia(); await s1.mediaQueue; await flush();
  const name = a.bkName; assert.ok(idb.files.has(name));
  // 会话 2：文件系统可用、成了主后端 → 从 IndexedDB 读回并迁进文件系统；清扫后 IndexedDB 旧副本清掉、文件系统的保住
  const fsSt = MEDIA.create(fsd, 50), idbSt = MEDIA.create(idb, 50);
  const s2 = ctl({ mediaStores: [fsSt, idbSt], draftStore: { refs: async () => ({ ok: true, names: { [name]: true } }) } }); s2.mediaStore = fsSt;
  const r = await s2.loadMedia({ media: { def: name, cells: [null, null] } });
  assert.ok(r.def, "切换后旧图读得回"); assert.equal(r.lost, ""); assert.equal(fsd.files.get(name), idb.files.get(name), "迁进主后端，内容一致");
  s2.state.image = r.def; s2.prevMedia = { word: "LI", def: name, cells: [null, null], crops: [] };
  await s2.sweepMedia();
  assert.equal(idb.files.has(name), false, "旧后端副本已迁走：清掉"); assert.equal(fsd.files.has(name), true, "主后端的保住");
  // 迁移没成功：旧后端副本仍被引用 → 保留
  const idb3 = memBackend(), fs3 = memBackend(); idb3.files.set(name, idb.files.get(name) || fsd.files.get(name)); fs3.failPut = true;
  const s3 = ctl({ mediaStores: [MEDIA.create(fs3, 50), MEDIA.create(idb3, 50)], draftStore: { refs: async () => ({ ok: true, names: { [name]: true } }) } }); s3.mediaStore = s3.mediaStores[0];
  assert.ok((await s3.loadMedia({ media: { def: name, cells: [] } })).def, "迁移失败也照常用");
  s3.prevMedia = { word: "", def: name, cells: [], crops: [] }; await s3.sweepMedia();
  assert.equal(idb3.files.has(name), true, "没迁走、仍被引用：旧副本保留");
  // 文件系统这次没初始化成功（mediaPartial）：图在文件系统里读不到 → 说「暂时读不出来」，标不确定、不清理
  const s4 = ctl({ mediaStores: [MEDIA.create(memBackend(), 50)], mediaPartial: true }); s4.mediaStore = s4.mediaStores[0];
  const r4 = await s4.loadMedia({ media: { def: null, cells: [name] } });
  assert.equal(r4.unsure, true); assert.equal(r4.lost, "有 1 张配图暂时读不出来（第 1 格），已留空，请及时导出或稍后重开再试。");
}

// ---------- B7-R2（复审）：暂时读不出来的图不当成用户移除——草稿照旧引用原文件名与取景，换字母 / 用户换图或移除才放开 ----------
{
  const name = MEDIA.nameFor(B64("held"), "jpg"), dn = MEDIA.nameFor(B64("heldDef"), "png");
  // 没有任何可用后端（IndexedDB 打不开）：判断不了在不在 → 记进 held、标不确定，文案说「暂时读不出来」
  const e = ctl({ mediaStores: [], mediaStore: null, mediaPartial: true });
  const r = await e.loadMedia({ word: "LIFE", media: { def: dn, cells: [name, null, null, null] }, crops: [{ z: 2, x: 0.4, y: 0.5 }, { z: 1.5, x: 0.5, y: 0.5 }, null, null] });
  assert.equal(r.unsure, true); assert.equal(r.held.def, dn); assert.equal(r.held.cells[0], name);
  assert.match(r.lost, /^有 2 张配图暂时读不出来（默认图、第 1 格），已留空，请及时导出或稍后重开再试。$/);
  // 只改文字：草稿照旧引用两张图与各格取景
  e.state.letters = ["L", "I", "F", "E"]; e.state.images = [null, null, null, null]; e.state.image = null; e.state.crops = [null, null, null, null];
  e.mediaHeld = r.held;
  let m = e.draftMedia();
  assert.deepEqual(plain(m.media), { def: dn, cells: [name, null, null, null] }, "暂未读回的图照旧引用");
  assert.deepEqual(plain(m.crops.map((c) => c && c.z)), [2, 1.5, null, null], "取景一起保留（默认图那格也保留）");
  // 第 1 格换字母：那格的旧图不再沿用（与 keepSame 清格一致），默认图照旧
  e.state.letters = ["X", "I", "F", "E"]; m = e.draftMedia();
  assert.equal(m.media.cells[0], null); assert.equal(m.media.def, dn);
  e.state.letters = ["L", "I", "F", "E"];
  // 用户给第 1 格换了新图（已存好）：新图优先；释放后即使再移除也不回到旧图
  const fresh = img("freshHeld"); fresh.bkName = MEDIA.nameFor(fresh.b64, "jpg");
  e.state.images[0] = fresh; e.state.crops[0] = { z: 1, x: 0.5, y: 0.5 }; e.releaseHeld(0);
  assert.equal(e.draftMedia().media.cells[0], fresh.bkName);
  e.state.images[0] = null; assert.equal(e.draftMedia().media.cells[0], null, "明确换过 / 移除：不回到暂未读回的旧图");
  // 移除默认图：同样放开
  e.releaseHeld(-1); assert.equal(e.draftMedia(), null, "默认图也移除后：草稿里没有配图");
  // 确实不在（列得出目录、各后端都没有、没有读失败）：不记 held，照「没能找回」处理
  const ok = memBackend(), e2 = ctl({ mediaStores: [MEDIA.create(ok, 50)] });
  const r2 = await e2.loadMedia({ word: "L", media: { def: null, cells: [name] }, crops: [null] });
  assert.equal(r2.unsure, false); assert.equal(r2.held.cells[0], undefined); assert.match(r2.lost, /没能找回/);
  // 清扫：暂未读回的名字也保住
  e.mediaHeld = { word: "L", def: null, cells: [name], crops: [] }; e.state.images = []; e.state.image = null;
  assert.equal(e.keepMedia(name), true);
}

// ---------- B7-R1：清扫先等后端就绪（到期 / 无图稿启动时后端还没初始化完，不能静默跳过）；接线：草稿键清理成功后清扫 ----------
{
  const b = memBackend(), orphan = MEDIA.nameFor(B64("orph"), "jpg"); b.files.set(orphan, "x");
  let ready; const e = ctl({ mediaStore: null, mediaStores: [], mediaReady: new Promise((r) => { ready = r; }), draftStore: { refs: async () => ({ ok: true, names: {} }) } });
  const sweeping = e.sweepMedia();
  const st = MEDIA.create(b, 50); e.mediaStores = [st]; e.mediaStore = st; ready(st);
  await sweeping; assert.equal(b.files.has(orphan), false, "后端就绪后照常清扫");
  // 真实 cleanExpiredDrafts → sweepMedia：purge 成功才清扫，失败不清
  b.files.set(orphan, "x");
  let purgeOK = false;
  const c = loadAppFunctions(["cleanExpiredDrafts", "sweepMedia", "sweepReady", "keepMedia", "liveImages", "writesPending", "pendingWarning", "unsavedNow", "tagNotice", "sideNotice"], {
    CORE, Promise, setTimeout, state: { images: [], image: null }, prevMedia: { word: "", def: null, cells: [], crops: [] }, mediaHeld: { word: "", def: null, cells: [], crops: [] },
    mediaStores: [st], mediaStore: st, mediaReady: Promise.resolve(st), mediaUnsure: false, mediaJobs: 0, sweeping: false,
    draftStore: { purge: async () => purgeOK, refs: async () => ({ ok: true, names: {} }) },
    draftEpoch: 0, draftLoaded: true, draftWrite: 0, draftAcceptedWrite: 0, draftGuard: null, sideGuard: null, draftNotice: "", noticeTag: null, READ_FAIL_NOTICE: "",
    draftSavedAt: 0, cleanupFailed: false, guardMsg: "", sideMsg: "", draftContent: "", draftPayload: () => ({}),
    renderDraftStatus() {}, scheduleExpiry() {},
  });
  await c.cleanExpiredDrafts(); await flush(); assert.equal(b.files.has(orphan), true, "草稿键没清干净：不清配图");
  purgeOK = true; await c.cleanExpiredDrafts(); await flush(); assert.equal(b.files.has(orphan), false, "草稿键清干净后清配图");
}

// ---------- initMedia：后端选择与降级 ----------
{
  const fsApi = Object.fromEntries(["writeFile", "appendFile", "readFile", "readDir", "unlink", "mkdir", "getFileStorageInfo"].map((k) => [k, async () => ({ usedBytes: 0, limitBytes: 1 })]));
  const pick = async ({ fs, fsReady = true, idb = true, idbReady = true, path = "/u" }) => {
    const MED = Object.assign({}, MEDIA, {
      fsBackend: () => ({ kind: "fs", ready: async () => { if (!fsReady) throw new Error("x"); return true; } }),
      idbBackend: () => ({ kind: "idb", ready: async () => { if (!idbReady) throw new Error("x"); return true; } }),
    });
    const e = loadAppFunctions(["initMedia"], {
      window: { MEDIA: MED, xhs: { launchOptions: { miniToolEnv: { userDataPath: path } } }, indexedDB: idb ? {} : undefined, navigator: {} },
      navigator: {}, miniTool: (n) => (fs && fsApi[n] ? fsApi : null), mediaStores: [], mediaStore: null, mediaPartial: false,
    });
    await e.initMedia();
    return { kinds: e.mediaStores.map((x) => x.kind), main: e.mediaStore && e.mediaStore.kind, partial: e.mediaPartial };
  };
  assert.deepEqual(plain(await pick({ fs: true })), { kinds: ["fs", "idb"], main: "fs", partial: false }, "文件系统为主，IndexedDB 备用");
  assert.deepEqual(plain(await pick({ fs: true, fsReady: false })), { kinds: ["idb"], main: "idb", partial: true }, "文件系统初始化失败：IndexedDB 顶上，记下 partial");
  assert.deepEqual(plain(await pick({ fs: true, path: "" })), { kinds: ["idb"], main: "idb", partial: true }, "拿不到 userDataPath 同上");
  assert.deepEqual(plain(await pick({ fs: false })), { kinds: ["idb"], main: "idb", partial: true }, "没有文件系统能力：只用 IndexedDB");
  assert.deepEqual(plain(await pick({ fs: true, idb: false })), { kinds: ["fs"], main: "fs", partial: true }, "IndexedDB缺席也保守保留来源未知的旧引用");
  assert.deepEqual(plain(await pick({ fs: false, idb: false })), { kinds: [], main: null, partial: true }, "都没有：不支持");
  assert.deepEqual(plain(await pick({ fs: false, idbReady: false })), { kinds: [], main: null, partial: true }, "B7-R2：IndexedDB 存在却打不开 = 暂不可用");
}

// ---------- B7-S2 / OVERALL-R1 完整链路：文件系统这次缺席（只剩 IndexedDB）→ 只改文字保存 → 文件系统恢复后清扫，原图仍在、读得回 ----------
{
  const fsd = memBackend(), idb = memBackend(), v = B64("overall"), dv = B64("overallDef");
  const cell = MEDIA.nameFor(v, "jpg"), def = MEDIA.nameFor(dv, "png");
  fsd.files.set(cell, v); fsd.files.set(def, dv);
  let saved = { word: "LIFE", media: { def, cells: [cell, null, null, null] }, crops: [{ z: 2, x: 0.4, y: 0.5 }, null, null, null] };
  const refs = async () => ({ ok: true, names: Object.fromEntries(CORE.mediaNames(saved).map((n) => [n, true])) });
  // 打开 1：文件系统接口缺失，initMedia 给出只有 IndexedDB + partial（见上一段）
  const s1 = ctl({ mediaStores: [MEDIA.create(idb, 50)], mediaPartial: true, draftStore: { refs } }); s1.mediaStore = s1.mediaStores[0];
  const r1 = await s1.loadMedia(saved);
  assert.equal(r1.unsure, true, "读不到的图标「不确定」，不当成丢失");
  s1.mediaUnsure = r1.unsure; s1.mediaHeld = r1.held;
  s1.state.letters = ["L", "I", "F", "E"]; s1.state.images = [null, null, null, null]; s1.state.image = null; s1.state.crops = [null, null, null, null];
  const m = s1.draftMedia(); // 只改文字：草稿重新落盘
  saved = Object.assign({}, saved, { media: plain(m.media), crops: plain(m.crops) });
  assert.deepEqual(saved.media, { def, cells: [cell, null, null, null] }, "纯文字保存仍引用两张原图");
  await s1.sweepMedia();
  // 打开 2：文件系统恢复。清扫按草稿引用判定，原图不能被当成孤儿删掉
  const fsSt = MEDIA.create(fsd, 50);
  const s2 = ctl({ mediaStores: [fsSt, MEDIA.create(idb, 50)], draftStore: { refs } }); s2.mediaStore = fsSt;
  await s2.sweepMedia();
  assert.ok(fsd.files.has(cell) && fsd.files.has(def), "能力恢复后清扫：原图保住");
  const r2 = await s2.loadMedia(saved);
  assert.equal(r2.lost, ""); assert.ok(r2.def && r2.cells[0], "原默认图与第 1 格配图都读得回");
}
console.log("media ok: names + fields, save (space / write / readback / timeout + late), sweep guards + recheck, draft refs, controller pairing + queue + status + restore, end-to-end expiry + shared + remote failure, fs chunks");
