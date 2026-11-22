#!/usr/bin/env node
// 公开快照的文件清单生成器。规则的文字说明在 docs/agent/commands.md「公开快照怎么重做」。
//
// 用法：
//   node scripts/public-manifest.mjs [提交] > 清单.txt      # 默认 HEAD
//   node scripts/public-manifest.mjs [提交] --diff          # 不出清单，改为对照本地 public 分支，列出多了/少了哪些文件
//
// 只读：只调用 git ls-tree，不改工作区、不碰任何分支。
// 清单给 `git --literal-pathspecs checkout <提交> --pathspec-from-file=<清单>` 用。
//
// 改规则只改下面两张表。任何一条「保留」规则在该提交里一个文件都没匹配到，脚本就报错退出：
// 目录改名或被清理时，宁可停下，也不要悄悄做出一份缺文件的快照。

import { execFileSync } from "node:child_process";

// 整体去掉的文件（内部记录，不公开）。以 / 结尾表示整个目录。
// AOCI 索引逐条描述仓库全部文件（含不公开的内部记录），路线图归档是 ROADMAP.md 搬出的旧记录（2026-11-19 定）。
const DROP_ROOT = [
  "ROADMAP.md", "HANDOFF.md", "AUDIT.MD", "HISTORY.md",
  "docs/roadmap-archive.md",
  "aoci.txt", "aoci.code.txt", "aoci.meta.txt", ".aoci/",
];

// plans/ 与 review/ 默认全部去掉，只留下面这些（都是 npm test 要读的）。
// 以 / 结尾表示整个目录，否则是单个文件。
const KEEP = [
  // plans/v00.03.00/ 已于 11-19 删除，原先保留的 T19_CORE.md 与 picker.js 不再有测试读取。
  "review/lexicon/README.md",
  "review/lexicon/block-review.tsv",
  "review/lexicon/de/selection-baseline.tsv",
  "review/lexicon/de/supplement.tsv",
  "review/presets-20261112b/",
  "review/presets-approved.txt",
  // 英文释义校验、词包重建与预设英文命题释义所用的表。
  ...["de", "en", "es", "fr", "it", "la"].flatMap(lang => [ // en：英语专业、历史文化词的英文（真机第一轮 D6）
    `review/en-gloss/${lang}.tsv`, `review/en-gloss/picks/${lang}.tsv`,
  ]),
  "review/en-gloss/presets.tsv",
  "review/en-gloss/repairs.tsv",
  "review/en-gloss/same-card.tsv",

  "review/t19-batches/t19-batch5-20261111/compiled/",
  // 交付 63 的 compiled/ 已在 406cf8e 整理 review/ 时删除，没有脚本再读它。
  "review/t19-batches/t19-batch61-20261112/lexicon/",

  "review/t19-batches/device-20261117/compiled/",
  "review/t19-batches/device-20261117/check.mjs",
  "review/t19-batches/device-20261117/test-editor.mjs",
  "review/t19-batches/device-20261117/proposals.json",
  "review/t19-batches/device-20261117/colors.json",
  "review/t19-batches/device-20261117/common.json",
  "review/t19-batches/device-20261117/proper.json",

  // 词库重建（2026-11-19 起）。pack-*.json 缺了会退回 scripts/t19/ 下的旧快照，分发包对不上。
  "review/t19-batches/rebuild-20261119/compiled/",
  "review/t19-batches/rebuild-20261119/pack-ranks.json",
  "review/t19-batches/rebuild-20261119/pack-hyphenation.json",
  "review/lexicon-rebuild-20261118/candidates/",
  "review/lexicon-rebuild-20261118/claude-fixes.tsv",
  "review/lexicon-rebuild-20261118/zh-aliases.json",
  // 第三次重建的候选表，test-lexicon-required 读（在空目录里跑 npm test 发现缺它）。
  "review/lexicon-rebuild-3/candidates/",
];

// public 分支上独有、清空时要留下的目录（旧管线词包，源提交里取不到）。只在 --diff 时用来排除。
const PUBLIC_ONLY = "scripts/fixtures/legacy-packs/";

function lsTree(ref) {
  // -z：路径原样输出，不给非 ASCII 文件名加引号转义
  const out = execFileSync("git", ["ls-tree", "-r", "--name-only", "-z", ref], {
    encoding: "utf8",
    maxBuffer: 256 * 1024 * 1024,
  });
  return out.split("\0").filter(Boolean);
}

const matches = (rule, path) => (rule.endsWith("/") ? path.startsWith(rule) : path === rule);

const args = process.argv.slice(2);
const diffMode = args.includes("--diff");
const ref = args.find((a) => !a.startsWith("--")) || "HEAD";

const hits = new Map(KEEP.map((rule) => [rule, 0]));
const manifest = lsTree(ref).filter((path) => {
  if (DROP_ROOT.some((rule) => matches(rule, path))) return false;
  if (!path.startsWith("plans/") && !path.startsWith("review/")) return true;
  const rule = KEEP.find((r) => matches(r, path));
  if (!rule) return false;
  hits.set(rule, hits.get(rule) + 1);
  return true;
});

const empty = KEEP.filter((rule) => hits.get(rule) === 0);
if (empty.length) {
  console.error(`错误：下列保留规则在 ${ref} 里没有匹配到任何文件（目录改名或已被删除？）：`);
  for (const rule of empty) console.error(`  ${rule}`);
  process.exit(1);
}

if (!diffMode) {
  process.stdout.write(manifest.join("\n") + "\n");
  console.error(`${ref}：清单共 ${manifest.length} 个文件`);
} else {
  const next = new Set(manifest);
  const prev = new Set(lsTree("refs/heads/public").filter((p) => !p.startsWith(PUBLIC_ONLY)));
  const added = manifest.filter((p) => !prev.has(p));
  const removed = [...prev].filter((p) => !next.has(p));
  console.log(`相对本地 public 分支：新增 ${added.length} 个，消失 ${removed.length} 个（内容变化不在此列）`);
  for (const p of added) console.log(`+ ${p}`);
  for (const p of removed) console.log(`- ${p}`);
}
