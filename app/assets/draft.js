/* 草稿存储与期限；不碰 DOM，测试使用内存存储与假时钟。ES2017。 */
(function (root) {
  "use strict";
  // 新版主键与恢复副本（T23）。旧版两个键只用于定向删除，从不读取。
  // 恢复副本存原始字节字符串的 JSON 数组，最多 RESCUE_MAX 份，每份按自身原文 t + 18h 到期（T23 多份副本）
  var KEY = "backronym-draft-v2", RESCUE = KEY + "-rescue", LEGACY = ["acronym-draft-v1", "acronym-draft-v1-bak"], TTL = 18 * 60 * 60 * 1000, RESCUE_MAX = 3;

  function deadline(d) {
    return d && typeof d.t === "number" && isFinite(d.t) && d.t > 0 ? d.t + TTL : 0;
  }

  function parse(raw) {
    try { return JSON.parse(raw); } catch (e) { return null; }
  }

  // 副本键内容 → 未到期的原文列表（同字节去重）。不是数组（损坏或别的格式）就当空，不崩
  function rescueList(raw) {
    var list = raw ? parse(raw) : null, out = [];
    if (!Array.isArray(list)) return out;
    list.forEach(function (r) {
      if (typeof r === "string" && out.indexOf(r) < 0 && deadline(parse(r)) > Date.now()) out.push(r);
    });
    return out;
  }

  // 把 raw 并进已有列表：已在里面 → 原样；满了 → null（保全失败，不挤掉任何未到期份）
  function mergeRescue(list, raw) {
    if (list.indexOf(raw) >= 0) return list;
    return list.length >= RESCUE_MAX ? null : list.concat([raw]);
  }

  // 读取超时只结束等待；端修改队列另有任务期限与迟到校正。
  function wait(p) {
    return new Promise(function (resolve) {
      var timer = setTimeout(function () { resolve(null); }, 1500);
      Promise.resolve(p).then(function (v) { clearTimeout(timer); resolve(v); }, function () { clearTimeout(timer); resolve(null); });
    });
  }

  function create(local, miniTool) {
    // rescueDueAt = 已知副本里最早的到期时间（0 = 没有）。前台定时器据此清理副本，不必等刷新或回前台（P2）
    var wanted = Object.create(null);
    var queue = Promise.resolve(), pendingPurge = null, rescueDueAt = 0, localDue = 0, remoteDue = 0;
    function noteDue(d) { if (d > Date.now() && (!rescueDueAt || d < rescueDueAt)) rescueDueAt = d; }
    function earliest(list) {
      return list.reduce(function (m, r) { var d = deadline(parse(r)); return !m || d < m ? d : m; }, 0);
    }
    // 正常串行；每次端调用有自己的期限，避免多步清理只是累计较慢也被中断。
    function enqueue(fn) {
      var p = queue.then(function () {
        var task = { active: true };
        function done(value) { task.active = false; return value; }
        try { return Promise.resolve(fn(task)).then(done, function () { return done(false); }); }
        catch (e) { return done(false); }
      });
      queue = p.then(function () {});
      return p;
    }

    // 修改前记录此键最后发出的目标值。迟到的旧写/旧删除完成时，按最新目标校正；不刷新 t。
    // 读超时的任务不能继续用旧快照写副本或删主稿。不同键各自保留目标，不能用主稿覆盖副本。
    function call(task, tool, method, args) {
      if (!task.active) throw new Error("expired storage task");
      var mutation = method !== "getStorage";
      if (mutation) wanted[args.key] = method === "removeStorage" ? null : args.data;
      var pending = tool[method](args);
      return new Promise(function (resolve, reject) {
        var timer = setTimeout(function () {
          task.active = false;
          reject(new Error("storage call timeout"));
        }, 1500);
        Promise.resolve(pending).then(function (value) { finish(value, null); }, function (error) { finish(null, error || new Error("storage call failed")); });
        function finish(value, error) {
          clearTimeout(timer);
          if (!task.active) {
            if (mutation) repairLate(args, method);
            reject(new Error("late storage result"));
          } else if (error) reject(error);
          else resolve(value);
        }
      });
    }

    function repairLate(args, method) {
      var sent = method === "removeStorage" ? null : args.data;
      var expired = sent && (args.key === KEY ? deadline(parse(sent)) <= Date.now() : args.key === RESCUE && prunedRescue(sent) !== null);
      if (wanted[args.key] !== sent || expired) repair(args.key);
    }

    function repair(key) {
      enqueue(async function (task) {
        var raw = wanted[key], set = miniTool("setStorage");
        if (key === KEY) {
          if (raw && deadline(parse(raw)) > Date.now()) {
            if (!set) return false;
            await call(task, set, "setStorage", { key: key, data: raw });
            if (deadline(parse(raw)) > Date.now()) return true;
          }
          // 已到期的目标只做重读清理，不能覆盖/删除别的页面后来写入的有效稿。
          return purgeRemote(task);
        }
        if (key === RESCUE && raw) {
          var list = rescueList(raw);
          if (list.length) {
            if (!set) return false;
            await call(task, set, "setStorage", { key: key, data: JSON.stringify(list) });
          }
        }
        return purgeRemote(task);
      });
    }

    // 取一个键在端存储与本地的原文。端存储在前：同时间仍取端存储。失败（抛错 / 超时）只记 error，不当作空。
    // failed 记是哪一侧失败（T23：只有一侧读失败时，那一侧覆盖前要先核实）；only = "remote" / "local" 只读那一侧
    // blind = 端侧有 setStorage、却没有 getStorage：写得进、永远读不了。记为端侧读失败（写入照样会用这一侧，不能当它是空的）
    async function fetchKey(key, only) {
      var raws = [], failed = { remote: false, local: false }, m = miniTool("getStorage"), blind = false;
      if (!m && only !== "local" && miniTool("setStorage")) { failed.remote = true; blind = true; }
      if (m && only !== "local") {
        var r;
        try { r = await wait(m.getStorage({ key: key })); } catch (e) { r = null; }
        if (r && typeof r.data === "string" && r.data) raws.push({ raw: r.data, side: "remote" });
        if (!r) failed.remote = true;
      }
      if (only !== "remote") try { var l = local.getItem(key); if (l) raws.push({ raw: l, side: "local" }); } catch (e) { failed.local = true; }
      return { raws: raws, error: failed.remote || failed.local, failed: failed, blind: blind };
    }

    // 取多个键（并行，各自带超时）：返回 [{ raw, key, side }]（先主键后副本，同键端存储在前；副本数组逐份展开）、error 和 failed（第一个键哪一侧失败）
    async function fetchKeys(keys, only) {
      var got = await Promise.all(keys.map(function (k) { return fetchKey(k, only); })), cands = [], error = false;
      got.forEach(function (g, i) {
        if (g.error) error = true;
        g.raws.forEach(function (x) {
          if (keys[i] === RESCUE) {
            var arr = parse(x.raw);
            if (Array.isArray(arr)) arr.forEach(function (r) { if (typeof r === "string") cands.push({ raw: r, key: RESCUE, side: x.side }); });
          } else cands.push({ raw: x.raw, key: keys[i], side: x.side });
        });
      });
      return { cands: cands, error: error, failed: got[0].failed, blind: got[0].blind };
    }

    // 主键与恢复副本（每一份）一起参与：先迁移验证、再比时间，取有效且最新；没有更新的有效稿时自动从副本恢复。
    // 不能套用的原文（draft 为 null）只在没有任何有效稿时才作为 entry 返回，交给 app 保全。
    // differ = 主键里存着未到期、但和 entry 字节不同原文的那几侧（T23 先保全：覆盖那一侧前要先把它存进副本）
    async function read() {
      var f = await fetchKeys([KEY, RESCUE]), best = null, expired = false, differ = { remote: false, local: false };
      f.cands.forEach(function (c) {
        var obj = parse(c.raw);
        if (deadline(obj) <= Date.now()) { expired = true; c.dead = true; return; }
        if (c.key === RESCUE) noteDue(deadline(obj));
        var draft = root.CORE.migrateDraft(obj);
        if (!best || (draft && (!best.draft || draft.t > best.draft.t))) best = { obj: obj, draft: draft, raw: c.raw, key: c.key };
      });
      f.cands.forEach(function (c) { if (best && c.key === KEY && !c.dead && c.raw !== best.raw) differ[c.side] = true; });
      return { entry: best, expired: expired, error: f.error, failed: f.failed, differ: differ, blind: f.blind }; // failed = 主键哪一侧读失败（副本不算）
    }

    // 覆盖主键之前重读主键：{ raw }（读到未过期原文，取最新的一份）/ { empty: true }（读的各侧都成功且为空或已过期）/ { failed: true }（读不到原文且有一侧失败）。
    // sides = { remote, local } 只重读其中为真的那一侧（T23：只核实此前读失败的一侧）；缺省两侧都读
    async function recheck(sides) {
      var only = sides && sides.remote && !sides.local ? "remote" : sides && sides.local && !sides.remote ? "local" : undefined;
      var f = await fetchKeys([KEY], only), best = null, bestT = -1, raws = [];
      f.cands.forEach(function (c) {
        var obj = parse(c.raw);
        if (deadline(obj) <= Date.now()) return;
        if (raws.indexOf(c.raw) < 0) raws.push(c.raw);
        if (!best || obj.t > bestT) { best = c.raw; bestT = obj.t; }
      });
      // raws = 读到的全部未到期原文（同字节去重）；bad = 读到了原文、但仍读失败的那几侧——没核实，调用方不能覆盖它们
      if (best) return { raw: best, raws: raws, bad: { remote: !!f.failed.remote, local: !!f.failed.local } };
      return f.error ? { failed: true } : { empty: true };
    }

    // 把读到的新版原文（原始字节，不重新序列化）并进恢复副本数组：两侧逐侧「读 → 合并 → 写 → 读回确认含这一份」，至少一侧确认才返回 true。
    // 读不到某一侧现有的副本就不写那一侧（盲写会冲掉里面别的原稿）；已满 RESCUE_MAX 份未到期 → 这一侧失败，不挤掉任何一份。
    // 每份的 t 就是原文的 t：到期不续期。原文此刻已过期则无须保全（它本来就该被清掉）
    async function preserve(raw) {
      if (deadline(parse(raw)) <= Date.now()) return true;
      var localOK = false;
      try {
        var next = mergeRescue(rescueList(local.getItem(RESCUE)), raw);
        if (next) { local.setItem(RESCUE, JSON.stringify(next)); localOK = rescueList(local.getItem(RESCUE)).indexOf(raw) >= 0; }
      } catch (e) { /* 端存储仍可成功 */ }
      var remote = await wait(enqueue(async function (task) {
        var set = miniTool("setStorage"), get = miniTool("getStorage");
        if (!set || !get) return false;
        var cur = await call(task, get, "getStorage", { key: RESCUE });
        if (!cur) return false;
        var next = mergeRescue(rescueList(cur.data), raw);
        if (!next) return false;
        await call(task, set, "setStorage", { key: RESCUE, data: JSON.stringify(next) });
        var r = await call(task, get, "getStorage", { key: RESCUE });
        return !!r && rescueList(r.data).indexOf(raw) >= 0;
      }));
      if (localOK || remote === true) { noteDue(deadline(parse(raw))); return true; }
      return false;
    }

    // 副本键清理：返回 null = 不用动；"" = 整个删掉；其余 = 剔除到期份后要写回的内容
    function prunedRescue(raw) {
      var list = rescueList(raw);
      if (!list.length) return "";
      var text = JSON.stringify(list);
      return text === raw ? null : text;
    }

    // 删除前重读，只删当时仍过期的草稿键；端API无跨页面CAS，不能保证严格并发隔离。
    // 旧版两个键不论内容一律删除（T23：只按这两个键删，别的键不碰）
    function purgeLocal() {
      var ok = true;
      [KEY, RESCUE].concat(LEGACY).forEach(function (key) {
        try {
          var raw = local.getItem(key);
          if (raw === null) return;
          if (key === RESCUE) {
            var p = prunedRescue(raw);
            if (p === "") local.removeItem(key); else if (p !== null) local.setItem(key, p);
            localDue = earliest(rescueList(raw));
          } else if (LEGACY.indexOf(key) >= 0 || deadline(parse(raw)) <= Date.now()) local.removeItem(key);
        } catch (e) { ok = false; }
      });
      return ok;
    }

    async function purgeRemote(task) {
      remoteDue = 0;
      var m = miniTool("getStorage"), remove = miniTool("removeStorage");
      if (!m) return !miniTool("setStorage");
      var ok = true, keys = [KEY, RESCUE].concat(LEGACY);
      for (var i = 0; i < keys.length; i++) {
        var key = keys[i], r = await call(task, m, "getStorage", { key: key });
        if (!r) return false;
        if (key === RESCUE && r.data) {
          var p = prunedRescue(r.data);
          remoteDue = earliest(rescueList(r.data));
          if (p === "") {
            if (!remove) return false;
            try { await call(task, remove, "removeStorage", { key: key }); } catch (e) { ok = false; }
          } else if (p !== null) {
            var set = miniTool("setStorage");
            if (!set) return false;
            try { await call(task, set, "setStorage", { key: key, data: p }); } catch (e) { ok = false; }
          }
        } else if (r.data && (LEGACY.indexOf(key) >= 0 || deadline(parse(r.data)) <= Date.now())) {
          if (!remove) return false;
          try { await call(task, remove, "removeStorage", { key: key }); } catch (e) { ok = false; } // 一个键删不掉，其余照删，整体返回失败等重试
        }
      }
      return ok;
    }

    function purge() {
      localDue = 0;
      var localOK = purgeLocal();
      if (!pendingPurge) {
        pendingPurge = enqueue(purgeRemote);
        pendingPurge.then(function () { pendingPurge = null; }, function () { pendingPurge = null; });
      }
      return wait(pendingPurge).then(function (remoteOK) {
        var ok = localOK && remoteOK === true;
        if (ok) rescueDueAt = !localDue ? remoteDue : !remoteDue ? localDue : Math.min(localDue, remoteDue); // 清干净了才按剩下的重算；失败时 cleanupFailed 会每分钟重试
        return ok;
      });
    }

    // T45：全部草稿（两侧主键 + 两侧恢复副本里的每一份，未到期的）引用的配图文件名。清理配图前调用：
    // 任一侧读失败、或端侧只能写不能读（blind），都返回 { ok: false }——引用判定不了，就一张也不删。不能迁移的原文也算它的引用
    async function refs() {
      var f = await fetchKeys([KEY, RESCUE]);
      if (f.error || f.blind) return { ok: false };
      var names = Object.create(null);
      f.cands.forEach(function (c) {
        var obj = parse(c.raw);
        if (deadline(obj) > Date.now()) root.CORE.mediaNames(obj).forEach(function (n) { names[n] = true; });
      });
      return { ok: true, names: names };
    }

    // skip = { remote, local }：为真的那一侧不写（T23：此前读失败、还没核实的一侧，里面可能有更新的稿，不能盖掉）
    function write(payload, skip) {
      skip = skip || {};
      var data = Object.assign({}, payload, { t: Date.now() }), raw = JSON.stringify(data), localOK = false;
      if (!skip.local) try { local.setItem(KEY, raw); localOK = true; } catch (e) { /* 端存储仍可成功 */ }
      var remote = skip.remote ? Promise.resolve(false) : enqueue(async function (task) {
        var m = miniTool("setStorage");
        if (!m) return false;
        if (deadline(data) <= Date.now()) { await purgeRemote(task); return false; }
        await call(task, m, "setStorage", { key: KEY, data: raw });
        if (deadline(data) <= Date.now()) { await purgeRemote(task); return false; }
        return true;
      });
      return { data: data, localOK: localOK, remote: wait(remote) };
    }

    return { read: read, write: write, purge: purge, recheck: recheck, preserve: preserve, refs: refs, rescueDue: function () { return rescueDueAt; } };
  }
  root.DRAFT = { KEY: KEY, RESCUE: RESCUE, RESCUE_MAX: RESCUE_MAX, LEGACY: LEGACY, TTL: TTL, deadline: deadline, create: create };
})(window);
