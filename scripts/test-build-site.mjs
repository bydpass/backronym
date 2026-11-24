// G8 整站构建自检：在临时夹具验证结构、字形与拒绝覆盖；无需 Python、浏览器或网络。
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { brotliDecompressSync } from "node:zlib";
import { readPortalText } from "./portal-source.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const source = "site/backronymsite/portal";

function readCmap(font) {
  assert.equal(font.toString("ascii", 0, 4), "wOF2");
  // WOFF2：目录之后是 Brotli 表数据。cmap 没有字形变换，按目录偏移直接读取。
  let directory = 48, offset = 0, cmap;
  function uint128() {
    let value = 0, byte;
    do {
      byte = font[directory++];
      value = value * 128 + (byte & 127);
    } while (byte & 128);
    return value;
  }
  for (let i = 0; i < font.readUInt16BE(12); i++) {
    const flags = font[directory++];
    const tag = flags & 63, version = flags >> 6;
    let explicit;
    if (tag === 63) {
      explicit = font.toString("ascii", directory, directory + 4);
      directory += 4;
    }
    const size = uint128();
    const glyfOrLoca = tag === 10 || tag === 11;
    const transformed = glyfOrLoca ? version !== 3 : version !== 0;
    if (tag === 0 || explicit === "cmap") cmap = [offset, offset + size];
    offset += transformed ? uint128() : size;
  }
  assert.ok(cmap, "WOFF2 缺 cmap");
  return brotliDecompressSync(font.subarray(directory, directory + font.readUInt32BE(20))).subarray(...cmap);
}

function addGlyphs(cmap, glyphs) {
  const u16 = offset => cmap.readUInt16BE(offset);
  const u32 = offset => cmap.readUInt32BE(offset);
  const tables = new Set();
  for (let i = 0; i < u16(2); i++) {
    const record = 4 + i * 8;
    const platform = u16(record), encoding = u16(record + 2);
    if (platform === 0 || (platform === 3 && (encoding === 1 || encoding === 10))) tables.add(u32(record + 4));
  }
  for (const table of tables) {
    if (u16(table) === 4) {
      const count = u16(table + 6) / 2;
      const ends = table + 14, starts = ends + 2 * count + 2;
      const deltas = starts + 2 * count, ranges = deltas + 2 * count;
      for (let i = 0; i < count; i++) {
        const range = ranges + 2 * i, relative = u16(range), start = u16(starts + 2 * i);
        for (let cp = start; cp <= u16(ends + 2 * i) && cp !== 0xffff; cp++) {
          const mapped = relative ? u16(range + relative + 2 * (cp - start)) : cp;
          if (mapped && ((mapped + u16(deltas + 2 * i)) & 0xffff)) glyphs.add(cp);
        }
      }
    } else if (u16(table) === 12) {
      for (let i = 0; i < u32(table + 12); i++) {
        const group = table + 16 + i * 12;
        const first = u32(group), last = u32(group + 4), glyph = u32(group + 8);
        for (let cp = first; cp <= last; cp++) {
          if (glyph + cp - first) glyphs.add(cp);
        }
      }
    }
  }
}

function assertFontCoverage(dir) {
  const glyphs = new Set();
  const fonts = fs.readdirSync(path.join(dir, "fonts")).filter(name => name.endsWith(".woff2"));
  for (const font of fonts) addGlyphs(readCmap(fs.readFileSync(path.join(dir, "fonts", font))), glyphs);
  // 页面文本还在 JS 的浮词、逐字动效和产品演示中，不能只取 HTML 静态文本。
  const text = readPortalText(dir);
  const missing = [...new Set(text)].filter(char => /[\p{L}\p{M}\p{N}\p{P}\p{S}]/u.test(char) && !glyphs.has(char.codePointAt(0)));
  assert.deepEqual(missing, [], "门户字体遗漏可见字符：" + missing.join(" "));
}

const fixture = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "backronym-build-site-")));
const at = name => path.join(fixture, name);
const read = name => fs.readFileSync(at(name), "utf8");
function write(name, contents) {
  fs.mkdirSync(path.dirname(at(name)), { recursive: true });
  fs.writeFileSync(at(name), contents);
}
const run = (script, ...args) => spawnSync(process.execPath, [at("scripts/" + script), ...args], { cwd: fixture, encoding: "utf8" });
function success(result) { assert.equal(result.status, 0, result.stderr); }
function rejected(result) { assert.notEqual(result.status, 0); assert.match(result.stderr, /拒绝构建/); }
const web = "build-web.mjs", site = "build-site.mjs";

try {
  fs.mkdirSync(at("scripts"));
  for (const script of [site, web, "build-output.mjs", "portal-source.mjs"]) {
    fs.copyFileSync(path.join(root, "scripts", script), at("scripts/" + script));
  }
  fs.cpSync(path.join(root, source), at(source), { recursive: true });
  write("package.json", '{"version":"2.3.4"}');
  write("app/index.html", '<html>\n<head>\n</head>\n<script src="./assets/block/core.js"></script>\n<script src="./assets/lang/en/block.js"></script>\n</html>\n');
  for (const file of ["assets/block/core.js", "assets/lang/en/block.js"]) write("app/" + file, "// blocker fixture");
  for (const license of ["GPL-3.0", "CC-BY-SA-4.0", "CC-BY-SA-3.0", "CC-BY-4.0", "MIT", "OFL-1.1"]) {
    write("app/LICENSES/" + license + ".html", "<p>许可测试文字</p>");
  }
  write("design/brand/icon-512.png", "fixture icon");
  write("foreign/author.txt", "作者文件");
  write(source + "/_recovery/private.txt", "恢复副本");
  fs.symlinkSync(at("site"), at("site-link"));
  fs.symlinkSync(at("missing"), at("dangling"));

  success(run(web));
  const appBefore = read("app/index.html"), webBefore = read("dist/web/index.html");
  for (const target of [".", "..", "app", "app/assets", "site", source, "site-link/backronymsite/portal", "dangling", "foreign", "dist/web"]) {
    rejected(run(site, "--out", target));
  }
  assert.equal(read("foreign/author.txt"), "作者文件");
  assert.equal(read("app/index.html"), appBefore);
  assert.equal(read("dist/web/index.html"), webBefore);

  success(run(site));
  const page = read("dist/site/index.html");
  const shareImage = "https://bydpass.com/backronym/cards/fanwork-grid.jpg";
  assert.match(page, /name="backronym-version" content="v02\.03\.04"/);
  assert.match(page, /rel="icon"[^>]+\.\/icon-512\.png/);
  assert.match(page, /<a href="\.\/app\/"/);
  assert.ok(page.includes('<meta property="og:image" content="' + shareImage + '">'));
  assert.ok(page.includes('<meta name="twitter:image" content="' + shareImage + '">'));
  assert.ok(fs.existsSync(at("dist/site/cards/fanwork-grid.jpg")));
  assert.equal(read("dist/site/icon-512.png"), "fixture icon");
  for (const file of ["LICENSES/GPL-3.0.html", "LICENSES/OFL-1.1.html", "assets/block/core.js", "assets/lang/en/block.js"]) {
    assert.equal(read("dist/site/app/" + file), read("app/" + file));
  }
  assert.ok(fs.existsSync(at("dist/site/fonts/OFL-1.1.txt")));
  assert.ok(!fs.existsSync(at("dist/site/_recovery")));
  assertFontCoverage(at("dist/site"));
  rejected(run(web, "--out", "dist/site"));
  assert.equal(read("dist/site/index.html"), page);

  function rejectsChange(file, edit, message) {
    const original = read(source + "/" + file);
    write(source + "/" + file, edit(original));
    const invalid = run(site);
    rejected(invalid);
    assert.match(invalid.stderr, message);
    assert.equal(read("dist/site/index.html"), page, "新构建失败，保留上一次发布");
    write(source + "/" + file, original);
  }
  rejectsChange("portal.css", css => css + '\n@import "https://outside.example/portal.css";', /包内相对路径/);
  rejectsChange("index.html", html => html.replace("</head>", '<style>.net{background:url("https://outside.example/a.png")}</style></head>'), /包内相对路径/);
  rejectsChange("index.html", html => html.replace("<body>", '<body style="background:url(https&#58;//outside.example/a.png)">'), /包内相对路径/);
  rejectsChange("index.html", html => html.replace("<body>", "<body style=background:url(//outside.example/a.png)>"), /包内相对路径/);
  rejectsChange("index.html", html => html.replace(shareImage, "./cards/fanwork-grid.jpg"), /分享图片.+HTTPS/);
  rejectsChange("index.html", html => html.replace(shareImage, "https://bydpass.com/backronym/cards/missing.jpg"), /包内相对路径/);
  success(run(site));
  assert.equal(read("dist/site/index.html"), page);

  const html = read(source + "/index.html");
  write(source + "/index.html", html.replace("<body>", '<body style="background:url(./cards/fanwork-grid.jpg)"><!--𰻝-->'));
  write(source + "/portal.css", read(source + "/portal.css") + "\n/*𰻝*/");
  const js = read(source + "/portal.js");
  write(source + "/portal.js", js + '\n//𰻝\nvar offlineExample = "藏头//快速开始"; /*𰻝*/');
  assert.ok(readPortalText(at(source)).includes('"藏头//快速开始"'));
  assert.ok(!readPortalText(at(source)).includes("𰻝"));
  success(run(site));
  assertFontCoverage(at("dist/site"));
  assert.equal(read("dist/web/index.html"), webBefore);
  assert.equal(read("app/index.html"), appBefore);
  console.log("整站构建通过：两层结构、版本、图标、许可、屏蔽器、字体、外站资源与输出目录保护");
} finally {
  fs.rmSync(fixture, { recursive: true, force: true });
}
