// B4-R1 回归：网页版构建的输出目录保护。全部在系统临时目录里的隔离夹具项目上跑，不碰真实源码、作者文件或 dist。
// 覆盖：--out 指向源码 app/、项目根、源码内部、项目根的上级、相对路径别名、符号链接（指向源码 / 经链接别名到源码 / 指向项目根）、
// 含作者文件的自定义目录、非空的陌生目录 —— 都拒绝且夹具里每个文件字节不变；新目录 / 空目录 / 上次构建的目录 / 默认 dist/web（含旧产物）可重复构建且带屏蔽器。
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";

const here = path.dirname(fileURLToPath(import.meta.url));
const F = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "backronym-build-web-")));
try {
  const w = (p, s) => { fs.mkdirSync(path.dirname(path.join(F, p)), { recursive: true }); fs.writeFileSync(path.join(F, p), s); };
  fs.mkdirSync(path.join(F, "scripts"));
  fs.copyFileSync(path.join(here, "build-web.mjs"), path.join(F, "scripts/build-web.mjs"));
  w("app/index.html", '<html>\n  <script src="./assets/block/core.js"></script>\n  <script src="./assets/lang/en/block.js"></script>\n</html>\n');
  w("app/assets/block/core.js", "window.BLOCK = {};\n");
  w("app/assets/lang/en/block.js", "window.BLOCK.add = 1;\n");
  w("app/assets/app.js", "// 源码哨兵\n");
  for (const k of ["GPL-3.0", "CC-BY-SA-4.0", "CC-BY-SA-3.0", "CC-BY-4.0", "MIT", "OFL-1.1"]) w("app/LICENSES/" + k + ".txt", "license text fixture\n"); // T07：两版都要带许可全文
  w("app/assets/lang/en/_recovery/fixture/words.js", "private recovery fixture");
  w("app/_recovery/fixture/index.html", "private recovery fixture");
  w("author.txt", "作者的稿子，不能丢\n");
  w("notes/draft.md", "作者笔记\n");
  w("mine/author.txt", "自定义目录里的作者文件\n");
  w("mine2/assets/keep.txt", "看起来像产物、其实是作者的目录\n");

  // 夹具里除输出目录外每个文件的字节指纹（符号链接记链接目标，不跟进去）
  const snap = () => {
    const out = {};
    const walk = (d) => {
      for (const n of fs.readdirSync(d)) {
        const p = path.join(d, n), rel = path.relative(F, p), st = fs.lstatSync(p);
        if (st.isSymbolicLink()) out[rel] = "link:" + fs.readlinkSync(p);
        else if (st.isDirectory()) walk(p);
        else out[rel] = crypto.createHash("sha1").update(fs.readFileSync(p)).digest("hex");
      }
    };
    walk(F); return JSON.stringify(out);
  };
  const run = (args, cwd = F) => spawnSync(process.execPath, [path.join(F, "scripts/build-web.mjs"), ...args], { cwd, encoding: "utf8" });
  fs.symlinkSync(path.join(F, "app"), path.join(F, "app-link"));
  fs.symlinkSync(F, path.join(F, "root-link"));

  const before = snap();
  for (const [args, why, cwd] of [
    [["--out", "app"], "源码 app/ 本身"],
    [["--out", F], "项目根"],
    [["--out", path.join(F, "app/assets/web")], "源码内部"],
    [["--out", path.dirname(F)], "项目根的上级"],
    [["--out", "../app"], "相对路径别名", path.join(F, "scripts")],
    [["--out", path.join(F, "app-link")], "指向源码的符号链接"],
    [["--out", path.join(F, "root-link/app")], "经符号链接别名到源码"],
    [["--out", path.join(F, "root-link")], "指向项目根的符号链接"],
    [["--out", path.join(F, "mine")], "含作者文件的自定义目录"],
    [["--out", path.join(F, "mine2")], "只含 assets 的陌生自定义目录"],
    [["--out", path.join(F, "notes")], "非空陌生目录"],
    [["--out"], "缺目录参数"],
  ]) {
    const r = run(args, cwd);
    assert.notEqual(r.status, 0, why + "：应拒绝");
    assert.match(r.stderr, /拒绝构建/, why + "：说明原因（" + r.stderr.trim() + "）");
    assert.equal(snap(), before, why + "：夹具里每个文件字节不变");
  }

  // 能正常构建：新目录、空目录、上次构建的目录（带标记）、默认 dist/web（无、旧产物）
  const ok = (args, dir, why) => {
    const r = run(args);
    assert.equal(r.status, 0, why + "：" + r.stderr);
    assert.ok(fs.existsSync(path.join(dir, "assets/block/core.js")) && fs.existsSync(path.join(dir, "assets/lang/en/block.js")), why + "：带屏蔽器（公共部分 + 英语词表）");
    assert.ok(!fs.existsSync(path.join(dir, "_recovery")), "顶层恢复副本不打包");
    assert.ok(!fs.existsSync(path.join(dir, "assets/lang/en/_recovery")), "嵌套恢复副本不打包");
    assert.ok(fs.existsSync(path.join(dir, ".backronym-web-build")), why + "：写了构建标记");
  };
  ok(["--out", path.join(F, "new")], path.join(F, "new"), "新目录");
  ok(["--out", path.join(F, "new")], path.join(F, "new"), "上次构建的目录可重建");
  fs.mkdirSync(path.join(F, "empty"));
  ok(["--out", path.join(F, "empty")], path.join(F, "empty"), "空目录");
  ok([], path.join(F, "dist/web"), "默认 dist/web");
  ok([], path.join(F, "dist/web"), "默认 dist/web 重建");
  fs.rmSync(path.join(F, "dist/web/.backronym-web-build"));
  ok([], path.join(F, "dist/web"), "默认 dist/web 的旧产物（无标记、只含 index.html / assets）");
  // B4-R1 复审：无标记的 dist/web 里只要有一个 app/ 里没有的文件（顶层、assets 里、更深一层），或有符号链接，就拒绝且整棵树（含 dist）字节不变
  for (const [rel, why] of [["author.txt", "顶层陌生文件"], ["assets/author.txt", "assets 里的作者文件"], ["assets/fonts/old/notes.md", "更深嵌套的未知文件"]]) {
    fs.rmSync(path.join(F, "dist/web"), { recursive: true, force: true });
    run([]); fs.rmSync(path.join(F, "dist/web/.backronym-web-build")); // 造一个无标记的旧产物
    w(path.join("dist/web", rel), "作者放进来的：" + why + "\n");
    const mid = snap(), r = run([]);
    assert.notEqual(r.status, 0, why + "：拒绝"); assert.match(r.stderr, /无法确认是构建产物/, why + "：说明原因");
    assert.equal(snap(), mid, why + "：整棵树（含 dist）字节不变");
  }
  fs.rmSync(path.join(F, "dist/web"), { recursive: true, force: true });
  run([]); fs.rmSync(path.join(F, "dist/web/.backronym-web-build"));
  fs.symlinkSync(path.join(F, "notes"), path.join(F, "dist/web/assets/linked"));
  { const mid = snap(), r = run([]); assert.notEqual(r.status, 0, "旧产物里有符号链接：拒绝"); assert.equal(snap(), mid, "符号链接情形：整棵树不变"); }
  fs.rmSync(path.join(F, "dist/web"), { recursive: true, force: true });
  const final = snap();
  for (const k of Object.keys(JSON.parse(before))) assert.equal(JSON.parse(final)[k], JSON.parse(before)[k], "全程源码与作者文件字节不变：" + k);
  console.log("build-web ok: refuses app/, root, inside src, ancestors, relative + symlink aliases, foreign dirs; builds new / empty / own / default dist/web with blocker; unmarked old dist/web only if every file maps to app/ (nested foreign files + symlinks refused)");
} finally {
  fs.rmSync(F, { recursive: true, force: true });
}
