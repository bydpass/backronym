// G8：一份静态产物供国内站和 GitHub Pages 使用。默认输出 dist/site/。
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { checkBuildOutput } from "./build-output.mjs";
import { withoutCssComments, withoutHtmlComments } from "./portal-source.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const web = path.join(root, "app");
const site = path.join(root, "site");
const source = path.join(site, "backronymsite/portal");
const defaultOut = path.join(root, "dist/site");
const marker = ".backronym-site-build";
const markerText = "由 scripts/build-site.mjs 生成；再次构建会整体替换本目录。\n";
const canonicalPortal = "https://bydpass.com/backronym/";
const navigation = new Set([
  "https://github.com/bydpass/backronym",
  "https://www.xiaohongshu.com/user/profile/668f26660000000003033541",
  "https://beian.miit.gov.cn/",
]);

function decodeHtmlAttribute(value) {
  const names = { amp: "&", quot: '"', apos: "'", colon: ":", sol: "/", Tab: "\t", NewLine: "\n" };
  return value.replace(/&(?:#(x[\da-f]+|\d+);?|([a-z]+);)/gi, (entity, number, name) => {
    if (!number) return Object.hasOwn(names, name) ? names[name] : entity;
    const code = /^x/i.test(number) ? parseInt(number.slice(1), 16) : Number(number);
    return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : "\ufffd";
  });
}

function verifyPortal(dir) {
  function asset(ref) {
    // 页面和样式都在同一目录；静态资源须能随网站挂到任意子路径。
    const file = path.resolve(dir, ref);
    if (/^(?:[\/\\]|[a-z][\w+.-]*:)/i.test(ref) || !file.startsWith(dir + path.sep) ||
        !fs.statSync(file, { throwIfNoEntry: false })?.isFile()) {
      throw new Error("门户资源必须是包内相对路径：" + ref);
    }
  }
  function verifyCss(css) {
    const source = withoutCssComments(css);
    for (const [, double, single, bare, importDouble, importSingle] of source.matchAll(
      /\burl\(\s*(?:"([^"]*)"|'([^']*)'|([^)\s]*))\s*\)|@import\s*(?:"([^"]*)"|'([^']*)')/gi,
    )) {
      const ref = (double ?? single ?? bare ?? importDouble ?? importSingle).trim();
      if (ref) asset(ref);
    }
  }
  const html = withoutHtmlComments(fs.readFileSync(path.join(dir, "index.html"), "utf8"));
  const shareImages = new Set(["og:image", "twitter:image"]);
  for (const [tag, element] of html.matchAll(/<([a-z][\w:-]*)(?:"[^"]*"|'[^']*'|[^"'<>])*>/gi)) {
    const attrs = new Map();
    for (const [, name, double, single, bare] of tag.matchAll(/\s+([a-z][\w:-]*)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/gi)) {
      const key = name.toLowerCase();
      if (!attrs.has(key)) attrs.set(key, decodeHtmlAttribute(double ?? single ?? bare ?? ""));
    }
    const kind = element.toLowerCase();
    if (attrs.has("style")) verifyCss(attrs.get("style"));
    if (/^(?:link|script|img|iframe|source|video|audio|embed|object)$/i.test(kind)) {
      for (const [name, ref] of attrs) {
        if (name === "srcset") {
          for (const candidate of ref.split(",")) asset(candidate.trim().split(/\s+/)[0]);
        } else if (["src", "href", "poster", "data"].includes(name)) asset(ref);
      }
    }
    const key = attrs.get("property") ?? attrs.get("name");
    if (kind === "meta" && (key === "og:image" || key === "twitter:image")) {
      if (!shareImages.delete(key)) throw new Error("门户重复声明分享图片：" + key);
      const image = attrs.get("content");
      // 分享平台读取元数据；浏览器渲染仍使用同一张包内卡片。
      if (!image?.startsWith(canonicalPortal)) throw new Error("分享图片必须使用正式门户的 HTTPS 地址：" + image);
      asset(image.slice(canonicalPortal.length));
    }
  }
  if (shareImages.size) throw new Error("门户缺少分享图片元数据：" + [...shareImages].join("、"));
  for (const [, css] of html.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style\s*>/gi)) verifyCss(css);
  verifyCss(fs.readFileSync(path.join(dir, "portal.css"), "utf8"));
  const script = fs.readFileSync(path.join(dir, "portal.js"), "utf8");
  for (const [, url] of script.matchAll(/["']((?:https?:)?\/\/[^"'\s<>]+)["']/gi)) {
    if (!navigation.has(url)) throw new Error("门户脚本含外站地址：" + url);
  }
}

function build(out) {
  const check = () => checkBuildOutput({ out, root, sources: [web, site], marker, markerText });
  check();
  const version = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8")).version;
  if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error("package.json 版本号必须是三段数字");
  const label = "v" + version.split(".").map(n => n.padStart(2, "0")).join(".");

  const parent = path.dirname(out);
  fs.mkdirSync(parent, { recursive: true });
  const scratch = fs.mkdtempSync(path.join(parent, ".backronym-site-"));
  const staged = path.join(scratch, "site");
  const previous = path.join(scratch, "previous");
  let keepPrevious = false;
  try {
    fs.cpSync(source, staged, {
      recursive: true,
      filter: file => {
        const name = path.basename(file);
        if (name.startsWith(".") || name === "_recovery") return false;
        if (fs.lstatSync(file).isSymbolicLink()) throw new Error("门户资源不能是符号链接：" + file);
        return true;
      },
    });
    const index = path.join(staged, "index.html");
    const html = fs.readFileSync(index, "utf8");
    const versionMeta = '<meta name="backronym-version" content="">';
    if (!html.includes(versionMeta) || !html.includes("</head>")) throw new Error("门户首页缺版本位置或 </head>");
    fs.writeFileSync(index, html.replace(versionMeta, '<meta name="backronym-version" content="' + label + '">')
      .replace("</head>", '  <link rel="icon" type="image/png" href="./icon-512.png">\n  <link rel="apple-touch-icon" href="./icon-512.png">\n</head>'));
    fs.copyFileSync(path.join(root, "design/brand/icon-512.png"), path.join(staged, "icon-512.png"));
    verifyPortal(staged);
    execFileSync(process.execPath, [path.join(root, "scripts/build-web.mjs"), "--out", path.join(staged, "app")]);
    fs.writeFileSync(path.join(staged, marker), markerText);

    // 全部检查通过后才替换旧产物。改名失败时把旧目录放回原位。
    check();
    if (fs.existsSync(out)) fs.renameSync(out, previous);
    try {
      fs.renameSync(staged, out);
    } catch (error) {
      if (fs.existsSync(previous)) {
        keepPrevious = true;
        if (!fs.existsSync(out)) {
          fs.renameSync(previous, out);
          keepPrevious = false;
        } else {
          console.error("原产物仍在 " + previous);
        }
      }
      throw error;
    }
    console.log("整站 → " + path.relative(root, out) + "（门户 + app/，" + label + "）");
  } finally {
    if (!keepPrevious) fs.rmSync(scratch, { recursive: true, force: true });
  }
}

try {
  const [flag, custom, ...rest] = process.argv.slice(2);
  if (flag !== undefined && (flag !== "--out" || !custom || rest.length)) throw new Error("用法：node scripts/build-site.mjs [--out <目录>]");
  build(custom ? path.resolve(custom) : defaultOut);
} catch (error) {
  console.error("拒绝构建：" + error.message);
  process.exitCode = 1;
}
