// 两路草稿的18h生命周期：假时钟、内存存储，不访问用户数据。
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
let now = 2000000000000;
const env = { window: {}, Date: { now: () => now }, setTimeout, clearTimeout };
for (const file of ["core.js", "draft.js"]) vm.runInNewContext(fs.readFileSync(new URL("../app/assets/" + file, import.meta.url), "utf8"), env);
const D = env.window.DRAFT, K = D.KEY, R = D.RESCUE, [OLD, OLD_BAK] = D.LEGACY;
const raw = (word, t = now) => JSON.stringify({ v: 2, word, t });
const pack = (...xs) => JSON.stringify(xs); // 副本键内容：原文字符串的数组（T23 多份副本）
function memory() {
  const values = new Map();
  return { values, getItem: k => values.get(k) ?? null, setItem: (k, v) => values.set(k, v), removeItem: k => values.delete(k) };
}
const local = memory(), remote = memory();
const tools = {
  getStorage: async ({ key }) => ({ data: remote.getItem(key) }),
  setStorage: async ({ key, data }) => remote.setItem(key, data),
  removeStorage: async ({ key }) => remote.removeItem(key),
};
const store = D.create(local, name => tools[name] ? tools : null);
local.setItem(K, raw("LIFE"));
remote.setItem(K, JSON.stringify({ v: 2, t: now + 1 }));
assert.equal((await store.read()).entry.draft.word, "LIFE", "较新但损坏的一份不能淘汰完整稿");
remote.setItem(K, raw("TIE"));
assert.equal((await store.read()).entry.draft.word, "TIE");
remote.removeItem(K);
now += D.TTL - 1;
assert.equal((await store.read()).entry.draft.word, "LIFE");
now++;
assert.equal((await store.read()).entry, null, "18h边界拒绝恢复");
assert.equal((await store.read()).expired, true);
local.setItem(R, raw("backup", now - D.TTL));
remote.setItem(R, raw("backup", now - D.TTL));
local.setItem("theme", "dark"); remote.setItem("theme", "dark");
assert.equal(await store.purge(), true);
assert.equal(local.getItem(K), null); assert.equal(local.getItem(R), null); assert.equal(remote.getItem(R), null);
assert.equal(local.getItem("theme"), "dark"); assert.equal(remote.getItem("theme"), "dark");
for (const value of ['{"word":"OLD"}', '{"word":"OLD","t":0}', '{"word":"OLD","t":"bad"}', '{broken']) {
  local.setItem(K, value);
  assert.equal((await store.read()).entry, null, "无有效时间不提供宽限");
  await store.purge(); assert.equal(local.getItem(K), null);
}
// 每个副本独立检查，不删除另一个页面的新稿。
local.setItem(K, raw("STALE", now - D.TTL)); remote.setItem(K, raw("FRESH"));
assert.equal((await store.read()).entry.draft.word, "FRESH");
await store.purge(); assert.equal(local.getItem(K), null); assert.equal(JSON.parse(remote.getItem(K)).word, "FRESH");
let ticket = store.write({ v: 2, word: "NEW", extra: { kept: true } });
assert.equal(ticket.localOK, true); assert.equal(await ticket.remote, true);
assert.equal(JSON.parse(local.getItem(K)).extra.kept, true);
assert.equal(JSON.parse(remote.getItem(K)).t, now);
// 本地不可用时端存储可保存；两路失败时不能报告成功。
const denied = { getItem() { throw Error("denied"); }, setItem() { throw Error("denied"); }, removeItem() { throw Error("denied"); } };
const fallback = D.create(denied, () => tools);
ticket = fallback.write({ word: "REMOTE" }); assert.equal(ticket.localOK, false); assert.equal(await ticket.remote, true);
const fail = D.create(denied, () => ({ setStorage: () => Promise.reject(Error("offline")) }));
ticket = fail.write({ word: "FAIL" }); assert.equal(ticket.localOK, false); assert.notEqual(await ticket.remote, true);
// 删除失败可重试，失败期间过期原文仍不能恢复。
remote.setItem(K, raw("OLD", now - D.TTL));
const remove = tools.removeStorage;
tools.removeStorage = async () => { throw Error("offline"); };
assert.equal(await store.purge(), false); assert.equal((await store.read()).entry.draft.word, "NEW");
tools.removeStorage = remove; assert.equal(await store.purge(), true); assert.equal(remote.getItem(K), null);
// 写入挂起超过18h：迟到后自动检查期限，后续新稿必须排在清理之后。
let release;
const set = tools.setStorage;
tools.setStorage = ({key, data}) => new Promise(resolve => { release = () => { remote.setItem(key, data); resolve(); }; });
const late = store.write({ word: "LATE" });
await Promise.resolve(); await Promise.resolve();
now += D.TTL;
const purging = store.purge();
release(); tools.setStorage = set;
assert.notEqual(await late.remote, true);
assert.equal(await purging, true);
assert.equal(remote.getItem(K), null); assert.equal(local.getItem(K), null);
ticket = store.write({ v: 2, word: "AFTER" }); assert.equal(await ticket.remote, true);
assert.equal((await store.read()).entry.draft.word, "AFTER");
// 等端读取期间本地被另一页更新，恢复必须采用最新本地值。
let endRead;
const reread = D.create(local, name => name === "getStorage" ? { getStorage: () => new Promise(r => { endRead = r; }) } : null);
const reading = reread.read();
local.setItem(K, raw("LATEST", now + 1)); endRead({ data: null });
assert.equal((await reading).entry.draft.word, "LATEST");
local.setItem(K, raw("AFTER"));
// 超时读不阻塞本地有效稿；迟到读不改变选择结果。
const timeout = D.create(local, name => name === "getStorage" ? { getStorage: () => new Promise(() => {}) } : null);
const result = await timeout.read();
assert.equal(result.entry.draft.word, "AFTER"); assert.equal(result.error, true);
// 清理读到过期旧稿后、删除前到达的新写入不能被误删：端操作必须排队。
const slow = memory(); slow.setItem(K, raw("OLD", now - D.TTL));
let releaseGet;
const slowTools = {
  getStorage: ({ key }) => { const v = slow.getItem(key); return key === K ? new Promise(r => { releaseGet = () => r({ data: v }); }) : Promise.resolve({ data: v }); },
  setStorage: async ({ key, data }) => slow.setItem(key, data),
  removeStorage: async ({ key }) => slow.removeItem(key),
};
const queued = D.create(memory(), name => slowTools[name] ? slowTools : null);
const cleaning = queued.purge(), fresh = queued.write({ word: "FRESH" });
for (let i = 0; i < 5; i++) await Promise.resolve();
releaseGet();
assert.equal(await cleaning, true); assert.equal(await fresh.remote, true);
assert.equal(JSON.parse(slow.getItem(K)).word, "FRESH", "清理不能删掉排在它后面的新稿");

// ---------- T23：键名、旧稿删除、恢复副本 ----------
assert.equal(K, "backronym-draft-v2"); assert.equal(R, "backronym-draft-v2-rescue");
assert.deepEqual([...D.LEGACY], ["acronym-draft-v1", "acronym-draft-v1-bak"]);
const kinds = () => [local, remote];
const reset = () => { for (const m of kinds()) m.values.clear(); };

// 旧主稿、旧备份与有效新版草稿并存，一侧删除失败后重试：只清旧的两个键，新稿与无关键不动，重试后仍能恢复新稿
{
  reset();
  for (const m of kinds()) {
    m.setItem(OLD, raw("OLDLIFE")); m.setItem(OLD_BAK, raw("OLDBAK")); m.setItem(K, raw("NEWLIFE")); m.setItem("theme-control", "dark");
    m.setItem("acronym-draft-v1-other", "keep"); // 名字相近的无关键：不是这两个键就不碰
  }
  const read0 = await store.read();
  assert.equal(read0.entry.draft.word, "NEWLIFE", "读取只认新键，旧键内容永远读不到");
  const removeEnd = tools.removeStorage;
  tools.removeStorage = async () => { throw Error("offline"); };
  assert.equal(await store.purge(), false, "端存储删不掉 → 报失败等重试");
  assert.equal(local.getItem(OLD), null, "本地一侧照删"); assert.equal(local.getItem(OLD_BAK), null);
  assert.notEqual(remote.getItem(OLD), null, "端存储那一侧还在"); assert.notEqual(remote.getItem(OLD_BAK), null);
  assert.equal((await store.read()).entry.draft.word, "NEWLIFE", "删除失败期间新稿仍可恢复");
  tools.removeStorage = removeEnd;
  assert.equal(await store.purge(), true, "重试成功");
  for (const m of kinds()) {
    assert.equal(m.getItem(OLD), null); assert.equal(m.getItem(OLD_BAK), null);
    assert.equal(JSON.parse(m.getItem(K)).word, "NEWLIFE", "新稿不动");
    assert.equal(m.getItem("theme-control"), "dark", "主题偏好不动");
    assert.equal(m.getItem("acronym-draft-v1-other"), "keep", "只按这两个键删");
  }
  assert.equal((await store.read()).entry.draft.word, "NEWLIFE");
  // 本地一侧删除失败：端存储照删，整体报失败，重试成功
  reset();
  for (const m of kinds()) { m.setItem(OLD, raw("OLDLIFE")); m.setItem(OLD_BAK, raw("OLDBAK")); m.setItem(K, raw("NEWLIFE")); }
  let denyLocal = true;
  const flaky = D.create({ getItem: k => local.getItem(k), setItem: (k, v) => local.setItem(k, v), removeItem: k => { if (denyLocal) throw Error("denied"); local.removeItem(k); } }, name => tools[name] ? tools : null);
  assert.equal(await flaky.purge(), false);
  assert.equal(remote.getItem(OLD), null); assert.equal(remote.getItem(OLD_BAK), null);
  assert.notEqual(local.getItem(OLD), null);
  denyLocal = false;
  assert.equal(await flaky.purge(), true); assert.equal(local.getItem(OLD), null); assert.equal(local.getItem(OLD_BAK), null);
  assert.equal(JSON.parse(local.getItem(K)).word, "NEWLIFE");
  // 旧键里的空单词、损坏、未过期内容一律删
  reset();
  local.setItem(OLD, raw("")); local.setItem(OLD_BAK, "{broken"); remote.setItem(OLD, raw("FRESH"));
  assert.equal(await store.purge(), true);
  for (const m of kinds()) { assert.equal(m.getItem(OLD), null); assert.equal(m.getItem(OLD_BAK), null); }
  // 只有旧键时读不到任何稿
  local.setItem(OLD, raw("LIFE")); remote.setItem(OLD, raw("LIFE"));
  const onlyOld = await store.read();
  assert.equal(onlyOld.entry, null, "旧键从不读取"); assert.equal(onlyOld.error, false);
}

// 副本：preserve 存原始字节、逐侧读回；任一侧确认即放行；两侧都失败返回 false
{
  reset();
  const original = '{"v":2,"word":"LIFE","t":' + now + ',"future":{"x":[1,2]},  "spacing":"keep"}'; // 故意带多余空格和未知字段：必须原样
  assert.equal(await store.preserve(original), true);
  assert.equal(local.getItem(R), pack(original), "本地存原始字节"); assert.equal(remote.getItem(R), pack(original), "端存储存原始字节");
  assert.equal(local.getItem(K), null, "preserve 不碰主键");
  // 仅本地可用 / 仅端存储可用
  reset();
  const noEnd = D.create(local, () => null);
  assert.equal(await noEnd.preserve(original), true); assert.equal(local.getItem(R), pack(original));
  reset();
  const onlyEnd = D.create(denied, () => tools);
  assert.equal(await onlyEnd.preserve(original), true); assert.equal(remote.getItem(R), pack(original));
  // 两侧都写不进
  reset();
  const bothFail = D.create(denied, () => ({ setStorage: () => Promise.reject(Error("offline")), getStorage: async () => ({ data: null }) }));
  assert.equal(await bothFail.preserve(original), false, "副本写失败 → 不放行");
  // 写了但读回不一致（端存储吞掉写入）只算失败；本地一侧确认则仍放行
  reset();
  const dropping = D.create(denied, () => ({ setStorage: async () => {}, getStorage: async () => ({ data: null }) }));
  assert.equal(await dropping.preserve(original), false, "读回不一致不算保全");
  const dropEndLocalOK = D.create(local, () => ({ setStorage: async () => {}, getStorage: async () => ({ data: null }) }));
  assert.equal(await dropEndLocalOK.preserve(original), true, "本地一侧确认一致即放行");
  // 原文已过期：无须保全（本来就该清掉），也不写副本
  reset();
  assert.equal(await store.preserve(raw("GONE", now - D.TTL)), true); assert.equal(local.getItem(R), null); assert.equal(remote.getItem(R), null);
}

// 读取：主键与副本（两侧）一起参与，取有效且最新；没有更新的有效稿时从副本恢复
{
  reset();
  local.setItem(R, pack(raw("RESCUED", now - 1000)));
  assert.equal((await store.read()).entry.draft.word, "RESCUED", "主键没有稿时自动取副本");
  assert.equal((await store.read()).entry.key, R);
  remote.setItem(K, raw("NEWER", now));
  assert.equal((await store.read()).entry.draft.word, "NEWER", "有较新有效稿取新稿");
  remote.setItem(K, raw("OLDER", now - 5000));
  assert.equal((await store.read()).entry.draft.word, "RESCUED", "主键比副本旧则取副本");
  remote.setItem(K, '{"v":2,"t":' + now + '}'); // 较新但结构坏
  assert.equal((await store.read()).entry.draft.word, "RESCUED", "较新但不能套用的主键不淘汰有效副本");
  reset();
  remote.setItem(R, pack(raw("ENDRESCUE", now - 10))); local.setItem(R, pack(raw("LOCALRESCUE", now - 20)));
  assert.equal((await store.read()).entry.draft.word, "ENDRESCUE", "副本两侧也比时间");
  // 同时间：主键优先
  reset();
  local.setItem(K, raw("MAIN", now)); local.setItem(R, pack(raw("COPY", now)));
  assert.equal((await store.read()).entry.draft.word, "MAIN");
}

// 副本到期：按原文里的 t，不续期；过期副本被清；另有较新有效稿时仍可恢复
{
  reset();
  const t0 = now;
  const orig = raw("ORIG", t0);
  assert.equal(await store.preserve(orig), true);
  now += D.TTL - 1;
  assert.equal((await store.read()).entry.draft.word, "ORIG", "到期前一毫秒仍可取回");
  assert.equal(JSON.parse(JSON.parse(local.getItem(R))[0]).t, t0, "副本时间戳是原稿的");
  // 重新 preserve（恢复失败后再保全、重开）不续期：t 仍是原文的
  assert.equal(await store.preserve(orig), true); assert.equal(remote.getItem(R), pack(orig), "重复保全同一份不新增");
  // 用户继续编辑，主键写入新稿（t 更新）
  const tk = store.write({ v: 2, word: "EDITED" }); assert.equal(await tk.remote, true);
  now++; // 原稿恰好到期
  const after = await store.read();
  assert.equal(after.entry.draft.word, "EDITED", "较新有效稿仍可恢复"); assert.equal(after.expired, true);
  assert.equal(await store.purge(), true);
  assert.equal(local.getItem(R), null, "过期副本（本地）被清"); assert.equal(remote.getItem(R), null, "过期副本（端存储）被清");
  assert.equal(JSON.parse(local.getItem(K)).word, "EDITED", "新稿不被清");
  // 副本的清理失败后可重试，期间过期副本读不到
  reset();
  local.setItem(R, pack(raw("OLDCOPY", now - D.TTL))); remote.setItem(R, pack(raw("OLDCOPY", now - D.TTL)));
  const rm = tools.removeStorage; tools.removeStorage = async () => { throw Error("offline"); };
  assert.equal(await store.purge(), false); assert.equal((await store.read()).entry, null, "过期副本不可恢复");
  tools.removeStorage = rm; assert.equal(await store.purge(), true); assert.equal(remote.getItem(R), null);
}

// 多份副本（T23）：并进数组、同字节去重、最多 RESCUE_MAX 份、满了不挤、到期份被剔、坏内容当空
{
  reset();
  assert.equal(D.RESCUE_MAX, 3);
  let A = raw("AAA", now - 30), B = raw("BBB", now - 20), C = raw("CCC", now - 10), E = raw("EEE", now - 5);
  assert.equal(await store.preserve(A), true); assert.equal(await store.preserve(B), true);
  assert.equal(local.getItem(R), pack(A, B), "第二份不冲掉第一份（本地）"); assert.equal(remote.getItem(R), pack(A, B), "端存储同样两份");
  assert.equal(await store.preserve(A), true); assert.equal(local.getItem(R), pack(A, B), "同字节去重");
  assert.equal(await store.preserve(C), true); assert.equal(remote.getItem(R), pack(A, B, C));
  assert.equal(await store.preserve(E), false, "满 3 份未到期：保全失败");
  assert.equal(local.getItem(R), pack(A, B, C), "满了不挤掉任何一份（本地）"); assert.equal(remote.getItem(R), pack(A, B, C), "端存储也不挤");
  const words = async () => (await store.read()).entry.draft.word;
  assert.equal(await words(), "CCC", "副本数组每份都是候选，取最新");
  // A 到期：合并时剔除，腾出位置；purge 只剔到期份，其余原样
  now += D.TTL - 30;
  assert.equal(await store.preserve(E), true, "到期份被剔后有空位");
  assert.equal(local.getItem(R), pack(B, C, E)); assert.equal(remote.getItem(R), pack(B, C, E));
  now += 15; // B 到期
  assert.equal(await store.purge(), true);
  assert.equal(local.getItem(R), pack(C, E), "清理逐份剔除到期项（本地）"); assert.equal(remote.getItem(R), pack(C, E), "端存储同样");
  now += 100; // 全部到期
  assert.equal(await store.purge(), true);
  assert.equal(local.getItem(R), null, "数组空了删键"); assert.equal(remote.getItem(R), null);
  // 坏内容（不是数组 / 数组里不是字符串）：读取时安全忽略，保全时当空覆盖
  reset();
  local.setItem(R, '{"v":2,"word":"NOTARRAY","t":' + now + '}'); remote.setItem(R, "[1, null, {}]");
  assert.equal((await store.read()).entry, null, "坏副本不当候选、不崩");
  assert.equal(await store.preserve(A = raw("AAA", now)), true); assert.equal(local.getItem(R), pack(A)); assert.equal(remote.getItem(R), pack(A));
  // 读不到端侧现有副本：不盲写那一侧（会冲掉里面的原稿），本地确认即放行
  reset();
  remote.setItem(R, pack(B = raw("BBB", now)));
  const blind = D.create(local, name => ({ getStorage: { getStorage: async ({ key }) => key === R ? null : { data: remote.getItem(key) } }, setStorage: tools })[name] || null);
  assert.equal(await blind.preserve(A), true); assert.equal(remote.getItem(R), pack(B), "端侧副本读不到就不写它"); assert.equal(local.getItem(R), pack(A));
}

// rescueDue（Astra 复审 P2）：已知副本里最早的到期时间，供前台定时器清理；清理成功后按剩下的重算
{
  reset();
  const t0 = now, s2 = D.create(local, name => tools[name] ? tools : null);
  assert.equal(s2.rescueDue(), 0, "没有副本");
  const A = raw("AAA", t0 - 100), B = raw("BBB", t0 - 50);
  assert.equal(await s2.preserve(B), true); assert.equal(s2.rescueDue(), t0 - 50 + D.TTL);
  assert.equal(await s2.preserve(A), true); assert.equal(s2.rescueDue(), t0 - 100 + D.TTL, "取最早的一份");
  const s3 = D.create(local, name => tools[name] ? tools : null);
  await s3.read(); assert.equal(s3.rescueDue(), t0 - 100 + D.TTL, "重开后读取时也记下");
  now = t0 - 100 + D.TTL; // A 恰好到期
  assert.equal(await s3.purge(), true); assert.equal(s3.rescueDue(), t0 - 50 + D.TTL, "清掉 A 后改为 B 的期限");
  assert.equal(local.getItem(R), pack(B)); assert.equal(remote.getItem(R), pack(B));
  now = t0 - 50 + D.TTL; // B 也到期
  assert.equal(await s3.purge(), true); assert.equal(s3.rescueDue(), 0, "全清后为 0"); assert.equal(local.getItem(R), null);
  now = t0;
}

// read() 的 differ：主键某一侧存着未到期、与选中稿不同的原文（T23 先保全）
{
  reset();
  local.setItem(K, raw("LIVE", now)); remote.setItem(K, raw("LOVE", now - 1000));
  let r = await store.read();
  assert.equal(r.entry.draft.word, "LIVE"); assert.deepEqual({ ...r.differ }, { remote: true, local: false }, "端上较旧的 LOVE 要先保全");
  remote.setItem(K, raw("LIVE", now));
  assert.deepEqual({ ...(await store.read()).differ }, { remote: false, local: false }, "两侧同字节：不用保全");
  remote.setItem(K, raw("GONE", now - D.TTL));
  assert.deepEqual({ ...(await store.read()).differ }, { remote: false, local: false }, "已到期的不算");
  remote.removeItem(K); local.setItem(R, pack(raw("COPY", now + 5)));
  r = await store.read();
  assert.equal(r.entry.draft.word, "COPY"); assert.deepEqual({ ...r.differ }, { remote: false, local: true }, "选中副本时，主键里的 LIVE 也要先保全");
  // recheck 返回这一侧全部未到期原文
  reset();
  local.setItem(K, raw("LOCALONE", now - 5)); remote.setItem(K, raw("ENDONE", now - 1));
  assert.deepEqual([...(await store.recheck()).raws].sort(), [raw("ENDONE", now - 1), raw("LOCALONE", now - 5)].sort());
  assert.deepEqual([...(await store.recheck({ remote: true })).raws], [raw("ENDONE", now - 1)], "只重读端侧");
}

// recheck：覆盖主键前重读
{
  reset();
  assert.deepEqual({ ...await store.recheck() }, { empty: true }, "两侧都读成功且为空");
  local.setItem(K, raw("OLDTHING", now - D.TTL)); remote.setItem(K, raw("OLDTHING", now - D.TTL));
  assert.deepEqual({ ...await store.recheck() }, { empty: true }, "已过期等同于空");
  local.setItem(K, raw("LOCALNEW", now - 5)); remote.setItem(K, raw("ENDNEW", now - 1));
  assert.equal((await store.recheck()).raw, raw("ENDNEW", now - 1), "读到原文取最新的一份");
  reset();
  const brokenEnd = D.create(local, name => name === "getStorage" ? { getStorage: () => Promise.reject(Error("boom")) } : null);
  assert.deepEqual({ ...await brokenEnd.recheck() }, { failed: true }, "一侧读失败又没拿到原文 → 失败，不能当空");
  local.setItem(K, raw("LOCALONLY", now));
  assert.equal((await brokenEnd.recheck()).raw, raw("LOCALONLY", now), "另一侧读到原文即走保全");
  assert.deepEqual({ ...(await brokenEnd.recheck()).bad }, { remote: true, local: false }, "仍读失败的一侧要报出来，不能被另一侧的成功盖住");
  reset();
  const hung = D.create(denied, name => name === "getStorage" ? { getStorage: () => new Promise(() => {}) } : null);
  assert.deepEqual({ ...await hung.recheck() }, { failed: true }, "两侧都读不到 → 失败");
}

// 端存储空键的返回（QA 第 2 批）：js-api.md 示例为 { data: null }；它和 {}、{ data: "" } 都算「空」，不是读取失败。
// 返回 undefined / null 或抛错才算失败（新用户首存会被闸门拦，真机必核）
{
  reset();
  for (const [ret, name] of [[{ data: null }, "{ data: null }"], [{}, "{}"], [{ data: "" }, "{ data: \"\" }"]]) {
    const s = D.create(local, n => n === "getStorage" ? { getStorage: async () => ret } : null);
    const r = await s.read();
    assert.equal(r.error, false, name + " 不算读取失败");
    assert.equal(r.entry, null, name + " 没有原文");
    assert.deepEqual({ ...await s.recheck() }, { empty: true }, name + " 重读确认为空");
  }
  for (const [ret, name] of [[undefined, "undefined"], [null, "null"]]) {
    const s = D.create(local, n => n === "getStorage" ? { getStorage: async () => ret } : null);
    assert.equal((await s.read()).error, true, name + " 算读取失败");
    assert.deepEqual({ ...await s.recheck() }, { failed: true }, name + " 重读失败");
  }
}
// T23 补充返工：只有一侧主键读失败时，read 报出是哪一侧；recheck 只重读指定的一侧；write 不写被跳过的一侧
{
  const flakyRemote = fail => D.create(local, name => name === "getStorage" ? { getStorage: async ({ key }) => { if (fail()) throw Error("boom"); return { data: remote.getItem(key) }; } }
    : name === "setStorage" ? { setStorage: tools.setStorage } : null);
  reset();
  const LIFE = raw("LIFE", now - 5000), LOVE = raw("LOVE", now - 1000);
  local.setItem(K, LIFE); remote.setItem(K, LOVE);
  let down = true;
  const s = flakyRemote(() => down);
  const r = await s.read();
  assert.equal(r.entry.draft.word, "LIFE", "读不到端上，取本地的 LIFE");
  assert.deepEqual({ ...r.failed }, { remote: true, local: false }, "failed 记下是端侧");
  assert.equal(r.error, true);
  // 副本键读失败不算主键那一侧失败
  const rescueDown = D.create(local, name => name === "getStorage" ? { getStorage: async ({ key }) => { if (key === R) throw Error("boom"); return { data: remote.getItem(key) }; } } : null);
  const rr = await rescueDown.read();
  assert.equal(rr.error, true); assert.deepEqual({ ...rr.failed }, { remote: false, local: false }, "failed 只看主键");
  // 本地一侧读失败
  const localDown = D.create({ getItem() { throw Error("denied"); }, setItem() {}, removeItem() {} }, name => tools[name] ? tools : null);
  assert.deepEqual({ ...(await localDown.read()).failed }, { remote: false, local: true });
  // recheck 只读指定的一侧：本地有 LIFE 也不看；端侧失败 → failed；端侧读到 → raw；端侧为空 → empty
  assert.deepEqual({ ...await s.recheck({ remote: true }) }, { failed: true }, "只重读端侧：仍失败");
  down = false;
  assert.equal((await s.recheck({ remote: true })).raw, LOVE, "端侧恢复可读：读到 LOVE");
  remote.removeItem(K);
  assert.deepEqual({ ...await s.recheck({ remote: true }) }, { empty: true }, "端侧为空：本地有 LIFE 也不影响（没读本地）");
  assert.equal((await s.recheck()).raw, LIFE, "不指定则两侧都读");
  remote.setItem(K, LOVE); local.removeItem(K);
  assert.deepEqual({ ...await s.recheck({ local: true }) }, { empty: true }, "只重读本地：端上有 LOVE 也不看");
  // write 不写被跳过的一侧
  reset();
  local.setItem(K, LIFE); remote.setItem(K, LOVE);
  let t = s.write({ v: 2, word: "LIVE" }, { remote: true });
  assert.equal(t.localOK, true); assert.equal(await t.remote, false, "跳过端侧：不算写成功");
  assert.equal(JSON.parse(local.getItem(K)).word, "LIVE", "本地照写"); assert.equal(remote.getItem(K), LOVE, "端上 LOVE 原样");
  t = s.write({ v: 2, word: "LIVEN" }, { local: true });
  assert.equal(t.localOK, false); assert.equal(await t.remote, true);
  assert.equal(JSON.parse(local.getItem(K)).word, "LIVE", "跳过本地：本地不动"); assert.equal(JSON.parse(remote.getItem(K)).word, "LIVEN");
  t = s.write({ v: 2, word: "LIVER" });
  assert.equal(t.localOK, true); assert.equal(await t.remote, true); assert.equal(JSON.parse(remote.getItem(K)).word, "LIVER", "不带 skip 两侧都写");
}
console.log("draft expiry ok");

// T10/T11：可控端调用与假时钟，不等待真实超时，不接触设备存储。
async function drain() { for (let i = 0; i < 100; i++) await Promise.resolve(); }
function timing() {
  let time = 2100000000000, id = 0;
  const timers = new Map(), disk = memory(), calls = [];
  const clock = {
    Date: { now: () => time },
    setTimeout(fn, ms) { timers.set(++id, { at: time + ms, fn }); return id; },
    clearTimeout(i) { timers.delete(i); },
  };
  let hook = () => null;
  const api = {};
  for (const method of ['getStorage', 'setStorage', 'removeStorage']) api[method] = args => {
    calls.push({ method, ...args });
    const effect = () => {
      if (method === 'getStorage') return { data: disk.getItem(args.key) };
      if (method === 'setStorage') disk.setItem(args.key, args.data); else disk.removeItem(args.key);
    };
    return hook(method, args, effect) || Promise.resolve(effect());
  };
  const ctx = { window: {}, ...clock };
  for (const f of ['core.js', 'draft.js']) vm.runInNewContext(fs.readFileSync(new URL('../app/assets/' + f, import.meta.url), 'utf8'), ctx);
  const draft = ctx.window.DRAFT, storage = draft.create(denied, () => api);
  return { clock, timers, disk, calls, draft, storage, setHook(fn) { hook = fn; },
    async tick(ms) {
      const end = time + ms; await drain();
      for (;;) {
        const next = [...timers].filter(([, t]) => t.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
        if (!next) break;
        time = next[1].at; timers.delete(next[0]); next[1].fn(); await drain();
      }
      time = end; await drain();
    },
    word() { return JSON.parse(disk.getItem(K))?.word; },
  };
}
function hold(h, match) {
  const releases = [];
  h.setHook((method, args, effect) => match(method, args) ? new Promise(resolve => releases.push(() => resolve(effect()))) : null);
  return releases;
}
async function saved(h, word) {
  const ticket = h.storage.write({ v: 2, word, unknown: { retained: true } }); await drain();
  assert.equal(await ticket.remote, true); return ticket;
}
// 永不返回的 A 不再挡住 B；本地不可用也能在新实例恢复 B。
{
  const h = timing(); hold(h, (m, a) => m === 'setStorage' && JSON.parse(a.data).word === 'AAA');
  const a = h.storage.write({ v: 2, word: 'AAA' }); await h.tick(1500);
  assert.notEqual(await a.remote, true);
  await saved(h, 'BBB'); assert.equal(h.word(), 'BBB');
  const reopened = h.draft.create(denied, () => ({ getStorage: async ({ key }) => ({ data: h.disk.getItem(key) }) }));
  assert.equal((await reopened.read()).entry.draft.word, 'BBB');
}
// A/C 超时，B/D 成功；两个旧请求倒序落盘，最终仍是 D，且补写不续期。
{
  const h = timing(), late = hold(h, (m, a) => m === 'setStorage' && /AAA|CCC/.test(a.data));
  h.storage.write({ v: 2, word: 'AAA' }); await h.tick(1500); await saved(h, 'BBB');
  h.storage.write({ v: 2, word: 'CCC' }); await h.tick(1500); const d = await saved(h, 'DDD');
  await h.tick(500); late[1](); await drain(); late[0](); await drain();
  assert.equal(h.word(), 'DDD'); assert.equal(JSON.parse(h.disk.getItem(K)).t, d.data.t);
  assert.equal(JSON.parse(h.disk.getItem(K)).unknown.retained, true);
  assert.equal((await h.storage.read()).entry.draft.word, 'DDD');
}
// 同一份仍有效的超时写迟到，无新目标时不无休止补写。
{
  const h = timing(), late = hold(h, m => m === 'setStorage');
  h.storage.write({ v: 2, word: 'AAA' }); await h.tick(1500); late[0](); await drain();
  assert.equal(h.calls.filter(c => c.method === 'setStorage').length, 1);
}
// 已到期的迟到稿会被清理；它不能删除随后保存的新稿。
for (const newer of [false, true]) {
  const h = timing(), late = hold(h, (m, a) => m === 'setStorage' && JSON.parse(a.data).word === 'AAA');
  h.storage.write({ v: 2, word: 'AAA' }); await h.tick(h.draft.TTL);
  if (newer) await saved(h, 'BBB');
  late[0](); await drain();
  assert.equal(h.disk.getItem(K) === null, !newer);
  if (newer) assert.equal(h.word(), 'BBB');
}
// 清理读超时：迟到的过期快照不能继续删掉已经落盘的 B。
{
  const h = timing(); h.disk.setItem(K, raw('OLD', h.clock.Date.now() - h.draft.TTL));
  let release, first = true;
  h.setHook((m, a, effect) => {
    if (m !== 'getStorage' || a.key !== K || !first) return null;
    first = false; const snapshot = effect(); return new Promise(r => { release = () => r(snapshot); });
  });
  const clean = h.storage.purge(); await h.tick(1500); assert.equal(await clean, false);
  await saved(h, 'BBB'); release(); await drain(); assert.equal(h.word(), 'BBB');
  assert.equal(h.calls.filter(c => c.method === 'removeStorage' && c.key === K).length, 0);
}
// 删除已发出后超时：旧删除迟到，补回新主稿；清理可重试，不被 pendingPurge 卡死。
{
  const h = timing(); h.disk.setItem(K, raw('OLD', h.clock.Date.now() - h.draft.TTL));
  const late = hold(h, (m, a) => m === 'removeStorage' && a.key === K);
  const clean = h.storage.purge(); await h.tick(1500); assert.equal(await clean, false);
  assert.deepEqual(h.calls.map(c => [c.method, c.key]), [['getStorage', K], ['removeStorage', K]], '删除超时后原任务不能继续读取副本或旧键');
  const b = await saved(h, 'BBB'); late[0](); await drain();
  assert.equal(h.word(), 'BBB'); assert.equal(JSON.parse(h.disk.getItem(K)).t, b.data.t);
  const retry = h.storage.purge(); await drain(); assert.equal(await retry, false, '本地不可用如实报失败，端队列仍可执行');
}
// 副本写迟到不能冲掉后面已确认的副本；保留未知字段/原文字节和原期限。
{
  const h = timing(), a = raw('AAA', h.clock.Date.now()), b = raw('BBB', h.clock.Date.now() + 1);
  const late = hold(h, (m, x) => m === 'setStorage' && x.key === R && x.data === pack(a));
  const first = h.storage.preserve(a); await h.tick(1500); assert.equal(await first, false);
  const second = h.storage.preserve(b); await drain(); assert.equal(await second, true);
  late[0](); await drain(); assert.equal(h.disk.getItem(R), pack(b));
  assert.equal((await h.storage.read()).entry.draft.word, 'BBB');
}
// 副本读取超时不能用迟到快照继续写；已超时的副本删除也不能抹掉后来的保全。
for (const method of ['getStorage', 'removeStorage']) {
  const h = timing(); h.disk.setItem(R, pack(raw('OLD', h.clock.Date.now() - h.draft.TTL)));
  const late = hold(h, (m, a) => m === method && a.key === R);
  const initial = method === 'getStorage' ? h.storage.preserve(raw('AAA', h.clock.Date.now())) : h.storage.purge();
  await h.tick(1500); assert.equal(await initial, false); h.setHook(() => null);
  const b = raw('BBB', h.clock.Date.now()), pending = h.storage.preserve(b); await drain(); assert.equal(await pending, true);
  late[0](); await drain(); assert.equal(h.disk.getItem(R), pack(b));
}
console.log('draft timeout ordering ok');

// T11：真实存储引擎 + 真实调度函数，计数空页面 5 分钟的端读取。
const { loadAppFunctions } = await import('./app-source.mjs');
{
  const h = timing(), local = memory();
  let reads = 0, failReads = false;
  const api = {
    getStorage: async ({ key }) => { reads++; if (failReads) throw Error('offline'); return { data: h.disk.getItem(key) }; },
    setStorage: async ({ key, data }) => h.disk.setItem(key, data),
    removeStorage: async ({ key }) => h.disk.removeItem(key),
  };
  const store = h.draft.create(local, () => api);
  const e = loadAppFunctions(['scheduleExpiry', 'cleanExpiredDrafts'], {
    ...h.clock, window: { DRAFT: h.draft }, expiryTimer: 0, draftEpoch: 0, draftSavedAt: 0,
    cleanupFailed: false, draftGuard: null, sideGuard: null, draftStore: store,
    draftNotice: '', noticeTag: null, READ_FAIL_NOTICE: '', renderDraftStatus() {},
    pendingWarning: () => '', tagNotice() {}, checkDraftExpiry: () => false, sweepMedia() {},
  });
  await store.read(); await e.cleanExpiredDrafts(); e.scheduleExpiry();
  const initialReads = reads; await h.tick(300000);
  assert.equal(reads, initialReads, '空页面清理成功后五分钟不再读端存储'); assert.equal(e.expiryTimer, 0);
  // 回前台/焦点绑定仍会调用清理，能发现别处新增副本并恢复计时。
  h.disk.setItem(R, pack(raw('COPY', h.clock.Date.now() - h.draft.TTL + 90000)));
  await e.cleanExpiredDrafts(); assert.notEqual(e.expiryTimer, 0);
  await h.tick(90000); assert.equal(h.disk.getItem(R), null, '副本按自己的期限清理'); assert.equal(e.expiryTimer, 0);
  // 空稿清理失败仍每分钟重试，恢复成功后停。
  failReads = true; await e.cleanExpiredDrafts(); const failedReads = reads;
  await h.tick(60000); assert.ok(reads > failedReads); assert.equal(e.cleanupFailed, true);
  failReads = false; await h.tick(60000); assert.equal(e.cleanupFailed, false); assert.equal(e.expiryTimer, 0);
  // 读不到/无法套用的原稿尚未核实，不能按空稿停下；有主稿继续精确到期检查。
  for (const field of ['draftGuard', 'sideGuard']) {
    e[field] = {}; e.scheduleExpiry(); assert.notEqual(e.expiryTimer, 0, field + ' 保留复核'); e[field] = null;
  }
  let checks = 0; e.draftSavedAt = h.clock.Date.now(); e.checkDraftExpiry = () => { checks++; return false; };
  e.scheduleExpiry(); await h.tick(60000); assert.equal(checks, 1);
  e.draftSavedAt = 0; e.scheduleExpiry(); assert.equal(e.expiryTimer, 0);
}
console.log('draft idle polling ok');
// 多步清理总耗时 > 1500ms，但每次 API 都在期限内：应最终完成，不能饿死后续键。
{
  const h = timing();
  h.disk.setItem(OLD, 'legacy'); h.disk.setItem(OLD_BAK, 'legacy');
  h.setHook((m, a, effect) => new Promise(resolve => h.clock.setTimeout(() => resolve(effect()), 400)));
  const clean = h.storage.purge(); await h.tick(3000);
  assert.equal(await clean, false, '调用者等待超时不能报成功');
  assert.equal(h.disk.getItem(OLD), null); assert.equal(h.disk.getItem(OLD_BAK), null, '后台任务逐调用正常完成清理');
  h.setHook(() => null); await saved(h, 'AFTER'); assert.equal(h.word(), 'AFTER');
}
console.log('draft multi-call timeout ok');
