/* 藏头 - Backronym：配图存储（T45）。内容哈希命名、两种后端、写后回读核对、带复核的清理。不碰 DOM，测试用替身后端。ES2017。 */
(function (root) {
  "use strict";
  // 后端优先级（T45）：① 容器文件系统（小红书 9.49+，userDataPath 下的 backronym-media 目录，base64 分片读写）→ ② IndexedDB → ③ 都没有 = 配图不保存。
  // 每个后端提供 put / get / list / remove / free（剩余字节数，取不到为 null）。图片编码（PNG / JPEG）在 app-media.js，这里只管字符串。
  var DIR = "backronym-media", DB = "backronym-media", MS = 8000;

  // 两个独立的 32 位哈希 + 长度：同一台设备上几十张图，碰撞概率可以忽略。名字只用于去重和引用，内容一致性另靠写后回读逐字核对
  function hash(s) {
    var a = 0x811c9dc5, b = 0x9747b28c;
    for (var i = 0; i < s.length; i++) {
      var c = s.charCodeAt(i);
      a = Math.imul(a ^ c, 0x01000193);
      b = Math.imul(b ^ c, 0x5bd1e995); b ^= b >>> 15;
    }
    var hex = function (n) { return ("0000000" + (n >>> 0).toString(16)).slice(-8); };
    return hex(a) + hex(b);
  }
  function nameFor(b64, ext) { return "m" + b64.length.toString(36) + "-" + hash(b64) + "." + (ext === "png" ? "png" : "jpg"); }

  // 端能力或数据库迟迟不返回：超时按失败处理。迟到的结果不再理会（写进去的文件没被确认、也没被引用，之后由清理删掉）
  function within(p, ms) {
    return new Promise(function (resolve, reject) {
      var timer = setTimeout(function () { reject(new Error("media timeout")); }, ms);
      Promise.resolve(p).then(function (v) { clearTimeout(timer); resolve(v); }, function (e) { clearTimeout(timer); reject(e || new Error("media failed")); });
    });
  }
  function quota(e) { return !!e && (e.name === "QuotaExceededError" || /quota|space|空间/i.test(String(e.message || e.errMsg || ""))); }

  // ① 容器文件系统。mt(name) 取端能力对象（没有该能力为 null）；dir = userDataPath + "/backronym-media"。
  // 分片大小以 getFileStorageInfo 为准：写入按 4 字符对齐（base64 每段可独立解码），读取按 3 字节对齐（各段 base64 可直接拼接）
  function fsBackend(mt, dir) {
    var made = false;
    function info() { return Promise.resolve(mt("getFileStorageInfo").getFileStorageInfo({})); }
    function path(name) { return dir + "/" + name; }
    return {
      kind: "fs",
      ready: function () { return info().then(function (i) { if (!i) throw new Error("no file storage"); return true; }); },
      put: async function (name, b64) {
        // 目录建成功才记下；失败（含「已存在」报错）下一张图再试一次，写入失败会另行暴露（B7-R4）
        if (!made) { try { await mt("mkdir").mkdir({ dirPath: dir, recursive: true }); made = true; } catch (e) { /* 下次再试 */ } }
        var i = await info(), step = Math.max(4, Math.floor((Number(i && i.writeChunkMaxBytes) || b64.length || 4) / 4) * 4);
        for (var p = 0; p === 0 || p < b64.length; p += step) {
          var part = b64.slice(p, p + step);
          if (p === 0) await mt("writeFile").writeFile({ filePath: path(name), data: part, encoding: "base64" });
          else await mt("appendFile").appendFile({ filePath: path(name), data: part, encoding: "base64" });
        }
      },
      get: async function (name) {
        var i = await info(), step = Math.max(3, Math.floor((Number(i && i.readChunkMaxBytes) || 3145728) / 3) * 3), out = "", pos = 0;
        for (var n = 0; n < 10000; n++) {
          var r = await mt("readFile").readFile({ filePath: path(name), encoding: "base64", position: pos, length: step });
          if (!r || typeof r.data !== "string") throw new Error("read failed");
          var d = r.data.replace(/\s+/g, ""), got = Number(r.bytesRead);
          if (r.bytesRead == null || !isFinite(got) || got < 0) got = Math.floor(d.length / 4) * 3 - (/==$/.test(d) ? 2 : /=$/.test(d) ? 1 : 0); // 没报字节数：按 base64 长度推算
          if (r.eof || !got) return out + d;
          // 没读完却短读（字节数不是 3 的倍数）：这段 base64 末尾带补位，不能直接拼。只收对齐的整段，余下的从对齐处重读
          var whole = Math.floor(got / 3) * 3;
          if (!whole) throw new Error("short read");
          out += whole === got ? d : d.slice(0, whole / 3 * 4);
          pos += whole;
        }
        throw new Error("read too long");
      },
      list: async function () {
        var r = await mt("readDir").readDir({ dirPath: dir });
        if (!r || !Array.isArray(r.files) || r.truncated) throw new Error("list incomplete"); // 列不全就不能判定哪些没被引用
        return r.files.map(function (f) { var n = typeof f === "string" ? f : f && (f.name || f.fileName || f.filePath); return String(n || "").split("/").pop(); });
      },
      remove: function (name) { return mt("unlink").unlink({ filePath: path(name) }); },
      free: function () { return info().then(function (i) { var l = Number(i && i.limitBytes), u = Number(i && i.usedBytes); return isFinite(l) && isFinite(u) && l > 0 ? l - u : null; }); },
    };
  }

  // ② IndexedDB：库 backronym-media、表 files，键 = 文件名，值 = base64 字符串。estimate 可缺（老内核），缺了就不预判空间、靠写入失败识别
  function idbBackend(idb, estimate) {
    var dbp = null;
    function open() {
      if (!dbp) dbp = new Promise(function (ok, no) {
        var r = idb.open(DB, 1);
        r.onupgradeneeded = function () { r.result.createObjectStore("files"); };
        r.onsuccess = function () { ok(r.result); };
        r.onerror = function () { no(r.error || new Error("idb open failed")); };
        r.onblocked = function () { no(new Error("idb blocked")); };
      }).catch(function (e) { dbp = null; throw e; });
      return dbp;
    }
    // 事务失败（含连接已失效）：关掉这条连接，下次重新打开（B7-R4：一次瞬时错误不拖垮整个会话）
    function run(mode, fn) {
      var conn = open();
      return conn.then(function (db) {
        return new Promise(function (ok, no) {
          var tx = db.transaction("files", mode), req = fn(tx.objectStore("files")), val;
          req.onsuccess = function () { val = req.result; };
          tx.oncomplete = function () { ok(val); };
          tx.onerror = tx.onabort = function () { no(tx.error || req.error || new Error("idb failed")); };
        });
      }).catch(function (e) {
        if (dbp === conn) { dbp = null; conn.then(function (db) { try { db.close(); } catch (x) { /* 已关 */ } }, function () {}); }
        throw e;
      });
    }
    return {
      kind: "idb",
      ready: function () { return open().then(function () { return true; }); },
      put: function (name, b64) { return run("readwrite", function (s) { return s.put(b64, name); }); },
      get: function (name) { return run("readonly", function (s) { return s.get(name); }).then(function (v) { return typeof v === "string" ? v : null; }); },
      list: function () { return run("readonly", function (s) { return s.getAllKeys(); }).then(function (ks) { return (ks || []).map(String); }); },
      remove: function (name) { return run("readwrite", function (s) { return s.delete(name); }); },
      free: function () { return estimate ? Promise.resolve(estimate()).then(function (e) { return e && isFinite(e.quota) && isFinite(e.usage) ? e.quota - e.usage : null; }) : Promise.resolve(null); },
    };
  }

  // 存储外壳：backend 为 null = 这台设备不支持保存配图。ms = 每次后端调用的期限
  function create(backend, ms) {
    ms = ms || MS;
    var confirmed = Object.create(null); // 本次打开里写入并回读核对过的名字（同图不重复写）
    var writing = Object.create(null);   // 正在写（含排队等锁）的名字：清理不删
    // 已发出、还没真正落定的删除（超时了也留着，直到后端回话）。同名的写与删由两步排开（B7-R3）：
    // 删除前同步查「正在写」、同步登记在这里；保存先等这里的删除落定再写——删除不会在保存报成功之后才落定
    var removal = Object.create(null);
    // confirmedAt = 存好时的序号：清扫开始之后才存好的名字（保存已向调用方报了成功）这一轮一律不删
    var confirmedAt = Object.create(null), stamp = 0;
    function busy() { return Object.keys(writing).length > 0; }

    // 写一张图：先看空间，再写入，再整份读回逐字比对，一致才算存好。返回 "ok" / "space"（空间不够，没写）/ "write"（写失败或读回不一致）/ "none"（没有后端）。
    // 同名删除还没落定（超时后迟到）时不写、返回 "write"：否则它迟到完成会删掉这次报了成功的文件
    async function save(name, b64) {
      if (!backend) return "none";
      if (!root.CORE.mediaName(name)) return "write";
      writing[name] = (writing[name] || 0) + 1;
      try {
        return await put(name, b64);
      } finally {
        if (!--writing[name]) delete writing[name];
      }
    }
    async function put(name, b64) {
      if (removal[name]) { try { await within(removal[name], ms); } catch (e) { return "write"; } }
      if (confirmed[name]) { confirmedAt[name] = ++stamp; return "ok"; } // 去重快速返回也算「本轮存好」：报了成功，这一轮清扫就不能删它（B7-R3）
      try {
        var free = null;
        try { free = await within(backend.free(), ms); } catch (e) { free = null; }
        if (typeof free === "number" && isFinite(free) && free < b64.length * 0.75 + 262144) return "space"; // 解码后约 3/4 的字节，再留 256 KB 余量
        await within(backend.put(name, b64), ms);
        var back = await within(backend.get(name), ms);
        if (typeof back !== "string" || back.replace(/\s+/g, "") !== b64) return "write";
        confirmed[name] = true;
        confirmedAt[name] = ++stamp;
        return "ok";
      } catch (e) {
        return quota(e) ? "space" : "write";
      }
    }

    // 读一张图：{ b64 } / { missing: true }（列表里确实没有）/ { error: true }（读不到也判断不了有没有）。listed = 已列出的名字（可省）
    async function load(name, listed) {
      if (!backend || !root.CORE.mediaName(name)) return { missing: true };
      if (listed && listed.indexOf(name) < 0) return { missing: true };
      try {
        var b64 = await within(backend.get(name), ms);
        if (typeof b64 === "string" && b64) { confirmed[name] = true; return { b64: b64 }; }
        return listed ? { missing: true } : { error: true };
      } catch (e) { return { error: true }; }
    }
    async function list() {
      if (!backend) return null;
      try { return await within(backend.list(), ms); } catch (e) { return null; }
    }

    // 清理没被引用的配图。refs() = 读全部草稿（两侧主稿 + 全部恢复副本）里的引用：{ ok, names }；keep(name) = 内存里还在用的。
    // 任何一步读不全、还有图在写，都不删（返回 false，下次再判定）；删除前再读一遍引用复核
    async function sweep(refs, keep) {
      if (!backend) return true;
      if (busy()) return false;
      var since = stamp, listed = await list();
      if (!listed) return false;
      var r1 = await refs();
      if (!r1 || !r1.ok) return false;
      var cands = listed.filter(function (n) { return root.CORE.mediaName(n) && !r1.names[n] && !keep(n) && !writing[n]; });
      if (!cands.length) return true;
      var r2 = await refs();
      if (!r2 || !r2.ok || busy()) return false;
      var ok = true;
      for (var i = 0; i < cands.length; i++) if (!(await dropper(cands[i])())) ok = false;
      return ok;
      // 删之前再看一遍：正在写的（writing）、内存里刚用上的（keep）、复核时被引用的，都不删。
      // 先作废「已存好」记录再删；删除超时也把在途删除留在 removal 里，直到后端真正回话，期间同名保存不报成功
      function dropper(n) {
        return async function () {
          if (r2.names[n] || keep(n) || writing[n] || confirmedAt[n] > since) return true;
          delete confirmed[n];
          var p = Promise.resolve().then(function () { return backend.remove(n); });
          removal[n] = p;
          p.then(clear, clear);
          function clear() { if (removal[n] === p) delete removal[n]; }
          try { await within(p, ms); return true; } catch (e) { return false; }
        };
      }
    }

    return { kind: backend ? backend.kind : "none", save: save, load: load, list: list, sweep: sweep, busy: busy, has: function (n) { return !!confirmed[n] && !removal[n]; } };
  }

  root.MEDIA = { DIR: DIR, hash: hash, nameFor: nameFor, fsBackend: fsBackend, idbBackend: idbBackend, create: create, within: within };
})(window);
