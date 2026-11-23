#!/usr/bin/env node
// 本地部署：把外链网页版当静态站点跑起来。`npm start`
//
//   npm start                              # 先生成 dist/web/，再在 http://127.0.0.1:8080 提供服务
//   npm start -- --port 9000               # 换端口（也认环境变量 PORT）
//   npm start -- --host 0.0.0.0            # 让同一网络里的其他设备也能打开
//   npm start -- --dir <目录>              # 直接提供一个已经生成好的目录，不重新生成
//   npm start -- --no-build                # 用现有的 dist/web/，不重新生成
//
// 只用 Node 自带模块，不装依赖。只读：只回应 GET 与 HEAD，不列目录，不给以点开头的文件，不跟到目录外面的符号链接。
// 与 scripts/dev.py 的分别：dev.py 给开发用，根是 app/、每次都重新取文件；这里给使用者用，根是生成好的网页版，
// 文件带 ETag、每次确认（没改就回 304），文本类文件压缩后再发。
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import zlib from "node:zlib";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const TYPES = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8", ".txt": "text/plain; charset=utf-8", ".svg": "image/svg+xml",
  ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".gif": "image/gif",
  ".ico": "image/x-icon", ".woff2": "font/woff2", ".woff": "font/woff", ".ttf": "font/ttf",
};
const GZIP = new Set([".html", ".js", ".css", ".json", ".txt", ".svg"]); // 字体与图片本身已压过，不再压
const GZIP_MIN = 1024;

// 请求处理函数。dir 是站点根目录。导出给 scripts/test-serve.mjs 用。
export function createHandler(dir) {
  const root = fs.realpathSync(dir);
  // ponytail: 压缩结果按文件放在内存里（整个网页版的文本压完约 3 MB）；第一次请求大词包时同步压缩会卡一下，个人部署够用。
  // 访问量大就在前面放 Nginx 一类的服务器，直接托管 dist/web/。
  const zipped = new Map();
  // 文件在核对与读取之间被删、没有读取权限这类意外：回 500，服务继续跑，不因一个请求退出
  return function handle(req, res) {
    try { respond(req, res); } catch (e) {
      if (res.headersSent) return res.destroy();
      res.writeHead(500, { "Content-Type": "text/plain; charset=utf-8", "X-Content-Type-Options": "nosniff" });
      res.end(req.method === "HEAD" ? undefined : "读取文件时出错\n");
    }
  };
  function respond(req, res) {
    const head = req.method === "HEAD";
    const plain = (code, text, extra) => {
      res.writeHead(code, { "Content-Type": "text/plain; charset=utf-8", "X-Content-Type-Options": "nosniff", ...extra });
      res.end(head ? undefined : text + "\n");
    };
    if (req.method !== "GET" && !head) return plain(405, "只支持 GET 与 HEAD", { Allow: "GET, HEAD" });
    let rel;
    try { rel = decodeURIComponent(req.url.split(/[?#]/)[0]); } catch { return plain(400, "地址写法不对"); }
    const parts = rel.split("/").filter(Boolean);
    // 以点开头的一段全部不给：既挡住 ..（跳出根目录），也不外露构建标记这类隐藏文件
    if (rel.includes("\0") || rel.includes("\\") || parts.some((p) => p.startsWith("."))) return plain(404, "没有这个文件");
    let file = path.join(root, ...parts);
    let st = fs.statSync(file, { throwIfNoEntry: false });
    if (st && st.isDirectory()) {
      // 目录地址补上末尾的斜杠：页面里的资源都是 ./assets/… 相对路径，少了斜杠会找错位置
      if (!rel.endsWith("/")) return plain(301, "见 Location", { Location: "/" + parts.map(encodeURIComponent).join("/") + "/" });
      file = path.join(file, "index.html");
      st = fs.statSync(file, { throwIfNoEntry: false });
    }
    if (!st || !st.isFile()) return plain(404, "没有这个文件");
    const real = fs.realpathSync(file);
    const inside = path.relative(root, real);
    if (inside.startsWith("..") || path.isAbsolute(inside)) return plain(404, "没有这个文件"); // 符号链接指到根目录外面

    const ext = path.extname(real).toLowerCase();
    const gz = GZIP.has(ext) && st.size >= GZIP_MIN && /\bgzip\b/.test(String(req.headers["accept-encoding"] || ""));
    const stamp = st.size.toString(36) + "-" + Math.floor(st.mtimeMs).toString(36);
    const etag = '"' + stamp + (gz ? "-gz" : "") + '"';
    const headers = {
      "Content-Type": TYPES[ext] || "application/octet-stream",
      "X-Content-Type-Options": "nosniff",
      // 文件名不带版本指纹，所以每次都向服务器确认；没改就回 304，不重传
      "Cache-Control": "no-cache",
      ETag: etag,
    };
    if (GZIP.has(ext)) headers.Vary = "Accept-Encoding";
    if (req.headers["if-none-match"] === etag) { res.writeHead(304, headers); return res.end(); }
    if (gz) {
      let hit = zipped.get(real);
      if (!hit || hit.stamp !== stamp) { hit = { stamp, body: zlib.gzipSync(fs.readFileSync(real)) }; zipped.set(real, hit); }
      res.writeHead(200, { ...headers, "Content-Encoding": "gzip", "Content-Length": hit.body.length });
      return res.end(head ? undefined : hit.body);
    }
    res.writeHead(200, { ...headers, "Content-Length": st.size });
    if (head) return res.end();
    fs.createReadStream(real).on("error", () => res.destroy()).pipe(res);
  }
}

function fail(msg) { console.error(msg); process.exit(1); }

function main() {
  const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
  const argv = process.argv.slice(2);
  const opt = { port: process.env.PORT || "8080", host: "127.0.0.1", dir: "", build: true };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--no-build") opt.build = false;
    else if (a === "--port" || a === "--host" || a === "--dir") {
      if (argv[i + 1] === undefined) fail(a + " 后面要给一个值");
      opt[a.slice(2)] = argv[++i];
    } else fail("不认识的参数 " + a + "。可用：--port <端口> --host <地址> --dir <目录> --no-build");
  }
  const port = Number(opt.port);
  if (opt.port === "" || !Number.isInteger(port) || port < 0 || port > 65535) fail("端口要是 0 到 65535 的整数，收到的是「" + opt.port + "」");
  const dir = opt.dir ? path.resolve(opt.dir) : path.join(root, "dist/web");
  if (!opt.dir && opt.build) {
    // 每次启动都重新生成：拉了新代码之后再启动，跑的就是新版本
    const built = spawnSync(process.execPath, [path.join(root, "scripts/build-web.mjs")], { stdio: "inherit" });
    if (built.status !== 0) fail("网页版没生成出来，服务没有启动。");
  }
  if (!fs.statSync(path.join(dir, "index.html"), { throwIfNoEntry: false })?.isFile()) {
    fail(dir + " 里没有 index.html。" + (opt.dir ? "请指向生成好的网页版目录。" : "先跑 npm run pack:web，或去掉 --no-build。"));
  }
  const server = http.createServer(createHandler(dir));
  server.on("error", (e) => {
    if (e.code === "EADDRINUSE") fail("端口 " + port + " 已被占用，换一个：npm start -- --port " + (port + 1));
    if (e.code === "EACCES") fail("没有权限使用端口 " + port + "，换一个 1024 以上的端口。");
    if (e.code === "EADDRNOTAVAIL" || e.code === "ENOTFOUND") fail("这台机器上没有地址 " + opt.host + "。");
    fail("服务没有启动：" + e.message);
  });
  server.listen(port, opt.host, () => {
    const p = server.address().port;
    const at = (h) => "http://" + (h.includes(":") ? "[" + h + "]" : h) + ":" + p + "/";
    const open = opt.host === "0.0.0.0" || opt.host === "::";
    console.log("藏头 - Backronym 网页版已启动（" + (path.relative(process.cwd(), dir) || ".") + "）");
    console.log("  本机打开  " + at(open ? "127.0.0.1" : opt.host));
    if (open) {
      for (const list of Object.values(os.networkInterfaces())) {
        for (const n of list || []) if (n.family === "IPv4" && !n.internal) console.log("  其他设备  " + at(n.address));
      }
      console.log("  其他设备用的是不加密的 http 地址；要长期对外提供，请在前面加一层 HTTPS。");
    }
    console.log("  草稿存在浏览器里、按地址分开：换一个地址或端口打开，看不到之前的草稿。");
    console.log("  按 Ctrl+C 停止。");
  });
}

if (process.argv[1] && fs.realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) main();
