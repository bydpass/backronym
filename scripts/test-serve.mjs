// 本地部署服务器（scripts/serve.mjs）自检。全部在系统临时目录里的夹具站点上跑，用随机空闲端口，不碰 dist。
// 覆盖：页面与资源能取到、类型对；文本压缩而字体与小文件不压；ETag 与 304；HEAD；非读取方法被拒；目录补斜杠；
// 取不到的东西（不存在、隐藏文件、各种写法的 ..、指到根目录外的符号链接、反斜杠、坏编码）；文件改了之后压缩结果跟着换；
// 命令行：参数不对或目录里没有页面时不启动，正常时打印地址并能访问。
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import zlib from "node:zlib";
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { createHandler } from "./serve.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const SERVE = path.join(here, "serve.mjs");
const F = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "backronym-serve-")));
const site = path.join(F, "site");
const w = (p, s) => { fs.mkdirSync(path.dirname(path.join(F, p)), { recursive: true }); fs.writeFileSync(path.join(F, p), s); };
const INDEX = "<!doctype html><title>夹具</title>\n";
const BIG = "// 词包夹具\n" + "var W = 1;\n".repeat(400);
const FONT = Buffer.alloc(4096, 7);
w("site/index.html", INDEX);
w("site/assets/app.js", BIG);
w("site/assets/small.js", "var s = 1;\n");
w("site/assets/font.woff2", FONT);
w("site/sub/index.html", "<p>子目录</p>\n");
w("site/.backronym-web-build", "构建标记\n");
w("site/assets/.secret", "隐藏文件\n");
w("secret.txt", "根目录外面的文件\n");
w("empty/readme.txt", "这里没有页面\n");
fs.symlinkSync(path.join(F, "secret.txt"), path.join(site, "leak.txt"));
fs.symlinkSync(path.join(site, "assets/app.js"), path.join(site, "assets/alias.js"));

let server, child;
// 直接用 http.request：地址原样发出（fetch 会先把 .. 化简掉），回应也不自动解压
function raw(port, method, url, headers = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: "127.0.0.1", port, method, path: url, headers }, (res) => {
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks) }));
    });
    req.on("error", reject);
    req.end();
  });
}

try {
  server = http.createServer(createHandler(site));
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const port = server.address().port;
  const get = (url, headers) => raw(port, "GET", url, headers);
  const GZ = { "accept-encoding": "gzip, deflate" };

  // 页面与资源
  let r = await get("/");
  assert.equal(r.status, 200);
  assert.equal(r.headers["content-type"], "text/html; charset=utf-8");
  assert.equal(r.body.toString(), INDEX);
  assert.equal(r.headers["cache-control"], "no-cache");
  assert.equal(r.headers["x-content-type-options"], "nosniff");
  assert.match(r.headers.etag, /^"[0-9a-z]+-[0-9a-z]+"$/);
  assert.equal((await get("/index.html?v=1#top")).status, 200, "地址后面带查询串也能取到");
  assert.equal((await get("/sub/")).body.toString(), "<p>子目录</p>\n");
  r = await get("/sub");
  assert.equal(r.status, 301);
  assert.equal(r.headers.location, "/sub/");
  assert.equal((await get("/assets/alias.js")).status, 200, "指向根目录里面的符号链接照常给");

  // 压缩：文本够大才压，字体不压，对方不收 gzip 就发原文
  const plain = await get("/assets/app.js");
  assert.equal(plain.headers["content-encoding"], undefined);
  assert.equal(plain.headers["content-type"], "text/javascript; charset=utf-8");
  assert.equal(plain.body.toString(), BIG);
  assert.equal(Number(plain.headers["content-length"]), Buffer.byteLength(BIG));
  assert.equal(plain.headers.vary, "Accept-Encoding");
  const zipped = await get("/assets/app.js", GZ);
  assert.equal(zipped.headers["content-encoding"], "gzip");
  assert.equal(Number(zipped.headers["content-length"]), zipped.body.length);
  assert.ok(zipped.body.length < Buffer.byteLength(BIG) / 4);
  assert.equal(zlib.gunzipSync(zipped.body).toString(), BIG);
  assert.notEqual(zipped.headers.etag, plain.headers.etag, "压缩与不压缩是两个版本，ETag 不同");
  assert.equal((await get("/assets/small.js", GZ)).headers["content-encoding"], undefined);
  r = await get("/assets/font.woff2", GZ);
  assert.equal(r.headers["content-encoding"], undefined);
  assert.equal(r.headers["content-type"], "font/woff2");
  assert.ok(r.body.equals(FONT));

  // 没改就回 304；HEAD 只回头
  r = await get("/assets/app.js", { ...GZ, "if-none-match": zipped.headers.etag });
  assert.equal(r.status, 304);
  assert.equal(r.body.length, 0);
  assert.equal((await get("/assets/app.js", { "if-none-match": zipped.headers.etag })).status, 200, "换了编码，旧 ETag 不算数");
  r = await raw(port, "HEAD", "/assets/font.woff2");
  assert.equal(r.status, 200);
  assert.equal(Number(r.headers["content-length"]), FONT.length);
  assert.equal(r.body.length, 0);
  r = await raw(port, "HEAD", "/assets/app.js", GZ);
  assert.equal(r.headers["content-encoding"], "gzip");
  assert.equal(r.body.length, 0);

  // 只读
  for (const m of ["POST", "PUT", "DELETE"]) {
    r = await raw(port, m, "/index.html");
    assert.equal(r.status, 405, m);
    assert.equal(r.headers.allow, "GET, HEAD");
  }
  assert.equal(fs.readFileSync(path.join(site, "index.html"), "utf8"), INDEX);

  // 取不到的东西
  for (const url of [
    "/nope.js", "/assets/", "/index.html/x",
    "/.backronym-web-build", "/assets/.secret",
    "/../secret.txt", "/%2e%2e/secret.txt", "/assets/..%2f..%2fsecret.txt", "/assets/%2e%2e/%2e%2e/secret.txt", "/..%5csecret.txt",
    "/leak.txt", "/assets%00/app.js",
  ]) {
    r = await get(url);
    assert.equal(r.status, 404, url);
    assert.ok(!r.body.toString().includes("外面"), url + " 不得带出根目录外的内容");
  }
  assert.equal((await get("/%E0%A4%A")).status, 400);
  assert.equal((await get("//example.com")).status, 404, "不会被当成跳转到别的网站");

  // 文件改了：ETag 与压缩结果都跟着换
  const BIG2 = BIG + "var W2 = 2;\n";
  fs.writeFileSync(path.join(site, "assets/app.js"), BIG2);
  r = await get("/assets/app.js", { ...GZ, "if-none-match": zipped.headers.etag });
  assert.equal(r.status, 200);
  assert.equal(zlib.gunzipSync(r.body).toString(), BIG2);

  // 命令行：不该启动的情况
  const cli = (...args) => spawnSync(process.execPath, [SERVE, ...args], { encoding: "utf8", env: { ...process.env, PORT: "" } });
  r = cli("--dir", path.join(F, "empty"));
  assert.equal(r.status, 1);
  assert.match(r.stderr, /没有 index\.html/);
  for (const args of [["--port", "abc", "--dir", site], ["--port", "70000", "--dir", site], ["--port"], ["--listen", "x"]]) {
    assert.equal(cli(...args).status, 1, args.join(" "));
  }
  r = cli("--dir", site, "--port", String(port));
  assert.equal(r.status, 1);
  assert.match(r.stderr, /已被占用/);

  // 命令行：正常启动，打印的地址能打开
  child = spawn(process.execPath, [SERVE, "--dir", site, "--port", "0"], { stdio: ["ignore", "pipe", "inherit"] });
  const cliPort = await new Promise((resolve, reject) => {
    let out = "";
    const timer = setTimeout(() => reject(new Error("服务 10 秒内没有打印地址：" + out)), 10000);
    child.stdout.on("data", (c) => {
      out += c;
      const m = /http:\/\/127\.0\.0\.1:(\d+)\//.exec(out);
      if (m) { clearTimeout(timer); resolve(Number(m[1])); }
    });
    child.on("exit", (code) => { clearTimeout(timer); reject(new Error("服务提前退出，退出码 " + code)); });
  });
  assert.equal((await raw(cliPort, "GET", "/")).body.toString(), INDEX);

  console.log("test-serve：全部通过");
} finally {
  if (child) child.kill();
  if (server) server.close();
  fs.rmSync(F, { recursive: true, force: true });
}
