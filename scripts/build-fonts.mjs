// 生成包内字体子集 app/assets/fonts/*.woff2。`npm run fonts`
// 前置：
//   1. 原始字体放 scripts/.cache/fonts/（官方源，SIL OFL 1.1）：
//      NotoSansSC-{Regular,Bold}.otf  ← github.com/notofonts/noto-cjk  Sans/SubsetOTF/SC/
//      NotoSans-{Regular,Bold}.ttf    ← github.com/notofonts/notofonts.github.io  fonts/NotoSans/unhinted/ttf/
//   2. 有 pyftsubset（pip install "fonttools[woff]"），或用 PYFTSUBSET=/path/to/pyftsubset 指定
// 中文完整字体每个字重 8MB+，只保留：GB2312 一级常用字 3755 + 词库里出现的字 + 界面文字。
// ponytail: 用户输入子集外的生僻字时，浏览器按字回退到系统字体，不会出方框；要全覆盖就换成 GB2312 全集或整套字体。
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const SRC = path.join(root, "scripts/.cache/fonts");
const OUT = path.join(root, "app/assets/fonts");
const PYFTSUBSET = process.env.PYFTSUBSET || "pyftsubset";

// GB2312 一级字：EUC-CN 第 16–55 区（0xB0A1–0xD7F9）
const gb = new TextDecoder("gb2312");
const chars = new Set();
const extraLatin = new Set(); // 释义里的希腊字母、上标数字等也必须有包内字形
for (let hi = 0xb0; hi <= 0xd7; hi++) {
  for (let lo = 0xa1; lo <= 0xfe; lo++) {
    const c = gb.decode(new Uint8Array([hi, lo]));
    if (/^[一-鿿]$/.test(c)) chars.add(c);
  }
}
const level1 = chars.size;
if (level1 < 3700) throw new Error("GB2312 解码异常（" + level1 + " 字），Node 需要 full-icu");
// 词库和界面里实际出现的字（含标点）
const appFiles = fs.readdirSync(path.join(root, "app/assets")).filter(name => /^app(?:-[a-z]+)?\.js$/.test(name)).map(name => "app/assets/" + name);
// v00.03.00 T03：各语言的词库 / 补充表在 app/assets/lang/<语种>/，逐个扫描；packs.js 是加载器（界面提示也算）
const langFiles = fs.readdirSync(path.join(root, "app/assets/lang"), { withFileTypes: true }).filter(d => d.isDirectory())
  .flatMap(d => ["words.js", "phrases.js"].map(n => "app/assets/lang/" + d.name + "/" + n)).filter(f => fs.existsSync(path.join(root, f)));
for (const f of langFiles.concat(["app/assets/lang/packs.js", "app/assets/lang/presets.js", "app/index.html", "app/assets/core.js", "app/assets/theme.js", "app/assets/style.css"].concat(appFiles))) {
  for (const c of fs.readFileSync(path.join(root, f), "utf8")) {
    const cp = c.codePointAt(0);
    if (cp > 0x2000) chars.add(c);
    if (cp > 0x7f && cp < 0x3000) extraLatin.add(cp);
  }
}
// 常用中文标点、全角符号
for (const c of "，。、；：？！“”‘’（）【】《》〈〉「」『』…—·～￥％＋－×÷＝") chars.add(c);

fs.mkdirSync(OUT, { recursive: true });
const textFile = path.join(SRC, "chars.txt");
fs.writeFileSync(textFile, [...chars].join(""));

// 西文规则允许 Latin Extended-A/B；包括 Ÿ、œ、拉丁语长短音。
const LATIN = "U+0000-024F,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+2000-206F,U+20AC,U+2122,U+2212," + [...extraLatin].sort((a, b) => a - b).map(cp => "U+" + cp.toString(16)).join(",");
const jobs = [
  ["NotoSansSC-Regular.otf", "NotoSansSC-Regular.woff2", `--text-file=${textFile}`],
  ["NotoSansSC-Bold.otf", "NotoSansSC-Bold.woff2", `--text-file=${textFile}`],
  ["NotoSans-Regular.ttf", "NotoSans-Regular.woff2", `--unicodes=${LATIN}`],
  ["NotoSans-Bold.ttf", "NotoSans-Bold.woff2", `--unicodes=${LATIN}`],
];
for (const [src, out, sel] of jobs) {
  execFileSync(PYFTSUBSET, [path.join(SRC, src), sel, "--flavor=woff2", "--layout-features=*",
    "--no-hinting", "--desubroutinize", `--output-file=${path.join(OUT, out)}`], { stdio: "inherit" });
  console.log(`${out}  ${(fs.statSync(path.join(OUT, out)).size / 1024).toFixed(0)} KiB`);
}

// ---------- 四个主题的字体（2026-11-12）----------
// 原始文件同样放 scripts/.cache/fonts/（官方仓库，全部 SIL OFL 1.1；许可文件 OFL-*.txt、LICENSE-noto-cjk-serif.txt 一并放着）：
//   LibreBaskerville[wght].ttf、GowunBatang-{Regular,Bold}.ttf、CormorantGaramond[wght].ttf、Federo-Regular.ttf ← github.com/google/fonts  ofl/<名字>/
//   NotoSerifSC-{Regular,Bold}.otf ← github.com/notofonts/noto-cjk  Serif/SubsetOTF/SC/
//   LXGWWenKai-{Regular,Medium}.ttf ← github.com/lxgw/LxgwWenKai  fonts/TTF/
// 三处要注意：
//   ① 容器基线 Chrome 61 不支持可变字体：带 [wght] 的先用 fontTools 拆成固定的 400 / 700 两个字重再裁；
//   ② Libre Baskerville 与 Federo 声明了保留字体名（Reserved Font Name），裁剪后的版本不能沿用原名：改内部名称（rename），借物页照常写明出处；
//      霞鹜文楷也有保留名，但作者另许可了「仅为网页字体投递而裁剪或转格式」的情形，名称保留；
//   ③ 霞鹜文楷没有 Bold，用 Medium 当粗的一档。
// 缺原始文件时跳过主题字体（只重出 Noto），不报错：换一台没有下载这些文件的机器也能跑。
const PY = path.join(path.dirname(PYFTSUBSET), "python");
const themeJobs = [
  // [原始文件, 可变字体的字重（没有为 null）, 输出, 选字, 改成的内部名称（没有为 null）]
  ["LibreBaskerville[wght].ttf", 400, "ThemeFandom-Regular.woff2", `--unicodes=${LATIN}`, "BK Fandom Serif"],
  ["LibreBaskerville[wght].ttf", 700, "ThemeFandom-Bold.woff2", `--unicodes=${LATIN}`, "BK Fandom Serif"],
  ["GowunBatang-Regular.ttf", null, "GowunBatang-Regular.woff2", `--unicodes=${LATIN}`, null],
  ["GowunBatang-Bold.ttf", null, "GowunBatang-Bold.woff2", `--unicodes=${LATIN}`, null],
  ["CormorantGaramond[wght].ttf", 400, "CormorantGaramond-Regular.woff2", `--unicodes=${LATIN}`, null],
  ["CormorantGaramond[wght].ttf", 700, "CormorantGaramond-Bold.woff2", `--unicodes=${LATIN}`, null],
  ["Federo-Regular.ttf", null, "ThemeSecession-Regular.woff2", `--unicodes=${LATIN}`, "BK Secession Display"],
  ["NotoSerifSC-Regular.otf", null, "NotoSerifSC-Regular.woff2", `--text-file=${textFile}`, null],
  ["NotoSerifSC-Bold.otf", null, "NotoSerifSC-Bold.woff2", `--text-file=${textFile}`, null],
  ["LXGWWenKai-Regular.ttf", null, "LXGWWenKai-Regular.woff2", `--text-file=${textFile}`, null],
  ["LXGWWenKai-Medium.ttf", null, "LXGWWenKai-Medium.woff2", `--text-file=${textFile}`, null],
];
const RENAME = "import sys\nfrom fontTools.ttLib import TTFont\nf=TTFont(sys.argv[1]);fam=sys.argv[2];sub=sys.argv[3]\nfor r in f['name'].names:\n    if r.nameID in (1,16): r.string=fam\n    elif r.nameID in (4,3): r.string=fam+' '+sub\n    elif r.nameID==6: r.string=fam.replace(' ','')+'-'+sub\n    elif r.nameID in (2,17): r.string=sub\nf.save(sys.argv[1])";
if (themeJobs.every(j => fs.existsSync(path.join(SRC, j[0])))) {
  const tmp = fs.mkdtempSync(path.join(SRC, "tmp-"));
  let total = 0;
  for (const [src, wght, out, sel, rename] of themeJobs) {
    let input = path.join(SRC, src);
    if (wght) { const inst = path.join(tmp, out.replace(".woff2", ".ttf")); execFileSync(PY, ["-m", "fontTools", "varLib.instancer", input, "wght=" + wght, "-o", inst], { stdio: ["ignore", "ignore", "inherit"] }); input = inst; }
    if (rename) { const copy = path.join(tmp, "r-" + out.replace(".woff2", path.extname(input))); fs.copyFileSync(input, copy); execFileSync(PY, ["-c", RENAME, copy, rename, /Bold/.test(out) ? "Bold" : "Regular"]); input = copy; }
    execFileSync(PYFTSUBSET, [input, sel, "--flavor=woff2", "--layout-features=*", "--no-hinting", "--desubroutinize", `--output-file=${path.join(OUT, out)}`], { stdio: "inherit" });
    const size = fs.statSync(path.join(OUT, out)).size; total += size;
    console.log(`${out}  ${(size / 1024).toFixed(0)} KiB`);
  }
  fs.rmSync(tmp, { recursive: true });
  console.log(`主题字体合计 ${(total / 1024 / 1024).toFixed(2)} MB`);
} else console.log("主题字体的原始文件不全（见本文件说明），这次只重出 Noto");
console.log(`中文子集 ${chars.size} 字（一级字 ${level1}）`);
