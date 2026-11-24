> 按需读的细则，入口与规则见根目录 [CLAUDE.md](../../CLAUDE.md)。本文件只写现行做法；改动的来龙去脉看 git 历史。

# 常用命令

```bash
npm run dev        # 本地预览 http://localhost:5173（scripts/dev.py，禁缓存，改完刷新即生效）
npm test           # 全部自检脚本串行，清单见 package.json；每个都能单独跑：node scripts/test-core.mjs
npm run audit      # 只审计 app/ 的文件与体积（语法和运行行为另测），不打包
npm run pack       # test → 审计 app/ → 打 zip → 再审计 zip 体积
npm run pack:web   # 外链网页版 → dist/web/
npm run pack:site  # 门户 + 网页版 → dist/site/（网页版在 app/）
npm start          # 本地部署：先跑 pack:web，再用 scripts/serve.mjs 在 http://127.0.0.1:8080 提供 dist/web/；参数 -- --port <端口> --host <地址> --dir <目录> --no-build
npm run pack:diag  # 只用于诊断的包 → dist/backronym-diag.zip：app/ 原样加一个打开耗时的诊断脚本（scripts/diag/diag.js），不是发布包；上传、生成预览码前要用户同意
```

预览服务器在 `.claude/launch.json` 里叫 `app`（另有 `docs` :5174、`design` :5175）。

## 生成产物

```bash
npm run packs      # 正式词包：从已复审的编译包（scripts/t19/build-packs.mjs 的 DEFAULT_COMPILED）生成六语 app/assets/lang/<语种>/{words,inflections}.js 与 en/phrases.js；改完跑 npm run fonts
npm run fonts      # 字体子集（扫的文件里含界面文案表 i18n.js）。需 scripts/.cache/fonts/ 原始字体与 pyftsubset；本机用 PYFTSUBSET=$PWD/scripts/.cache/font-tools-venv/bin/pyftsubset npm run fonts
npm run licenses   # 从 LICENSES/*.txt 生成 app/LICENSES/*.html（只进网页版）与 app/assets/licenses.js；改了哪份全文就重跑，test-app 会比对
npm run presets    # 从人工审定的表生成入场预设词 app/assets/lang/presets.js（外语预设的英文取 review/en-gloss/，借不到的写在 review/en-gloss/presets.tsv）
npm run en-gloss   # 生成 review/en-gloss/<语言>.tsv。先用补充表 picks/<语言>.tsv 或 Kaikki 自动对齐，再按 repairs.tsv 的义项 ID 应用完整英文和卡面短写。待挑项写入 scripts/.cache/en-gloss/pending-<语言>.json。补充词典只许脚本里 DICTS 列的（现只有 FreeDict 意英，GPL 词典不得用）。改完须对着 review/en-gloss/same-card.tsv 过自检：同词同词性、中文不同而卡面英文相同的每一组都要有裁定。保留共译须写理由，已修记录留表且不得复现；完整英文和卡面短写均检查词典格式串。依赖本机缓存 v003/stage3 与 ecdict.csv；改完跑 npm run packs、npm run presets
npm run block      # 西文五语屏蔽词表 app/assets/lang/<语种>/block.js 与送审表 review/lexicon/block-review.tsv
```

门户更改文案后，用带 WOFF2 支持的 fontTools 运行 `python scripts/build-portal-fonts.py`。本机可用 `scripts/.cache/font-tools-venv/bin/python`。源字体放在 `scripts/.cache/fonts/`，额外的 Cinzel、Cormorant Garamond 斜体和 Noto Serif SC 可变字体的来源见脚本。此命令只重出门户字体，`npm run pack:site` 直接使用入库的子集。

词库重建（选词 → 构建 → 词包），依赖 `scripts/.cache/` 下的 `v003`、`lexique410`、`parlamint`，规格见 [docs/lexicon-spec.md](../lexicon-spec.md)：

```bash
python3 scripts/lexicon3/rank.py [fr de ...]   # 选词与排名 → review/lexicon-rebuild-3/candidates/
node --max-old-space-size=8192 review/t19-batches/rebuild-20261119/build.mjs <空目录>   # 正式构建，默认读 rank.py 的候选
python3 scripts/lexicon3/clear.py <输出目录>/pending.tsv   # 报「新增 0」才算收敛，否则回到 rank.py 再跑一轮
```

构建输出的 `lexicon/`、`compiled/`、`pack-ranks.json`、`pack-hyphenation.json`、`pending.tsv` 换进该批次目录，再 `npm run packs`、`npm run fonts`。

审核与旧管线（平时用不到）：

```bash
npm run lexicon:check    # 只检查审核文件（dsh-NNN.tsv / codex-NNN.tsv）的格式；可只查几门：npm run lexicon:check -- fr de
npm run lexicon:audit    # 核对普查与复审结果，写 review/lexicon/<语种>/audit.json；用法见 scripts/lexicon/audit-review.mjs 文件头
npm run lexicon:extract  # kaikki JSONL → scripts/.cache/v003/stage/<语种>.json；原始数据要按 scripts/.cache/v003/MANIFEST.md 重新下载
npm run dict             # 旧英语管线，不写正式词包：必须设 BACKRONYM_DICT_OUT=<目录>
npm run lexicon          # 旧西文管线，不写正式词包：必须设 BACKRONYM_LEXICON_OUT=<目录>
node scripts/t19/pack-ranks.mjs <编译目录> <新排名文件> <新断词文件>   # 调整准入范围时重取词频与断词快照，核对后换掉 scripts/t19/ 下的两个 JSON
```

## 浏览器回归

G8 门户回归沿用下方的 Playwright 和 Chromium 环境。运行 `node scripts/test-portal-browser.mjs` 测源码，或先跑 `npm run pack:site`，再运行 `node scripts/test-portal-browser.mjs dist/site` 测整站产物。它对样稿和门户各跑八种下滑节奏，检查七节、十个子页和结束页，另查无脚本内容、移动端和备案号的域名限制。所有浏览器资源均从本地夹具返回。

本地浏览整站可运行 `npm start -- --dir dist/site --no-build`。在 `/` 打开门户，点「快速开始」进入 `/app/`。正式站把同一产物挂在 `/backronym/` 下。

不在 `npm test` 里。用已安装的 Playwright 起本地临时端口和新的浏览器上下文，不碰预览页的存储。无头浏览器默认报英文环境，测中文界面的脚本都在启动后把上下文固定成 `zh-CN`。要指定模块与浏览器路径，例如本机：

```bash
PLAYWRIGHT_MODULE=/Applications/ChatGPT.app/Contents/Resources/cua_node/lib/node_modules/playwright CHROMIUM_PATH=$HOME/Library/Caches/ms-playwright/chromium_headless_shell-1234/chrome-headless-shell-mac-arm64/chrome-headless-shell node scripts/test-draft-browser.mjs
```

| 脚本 | 覆盖 |
|---|---|
| `test-draft-browser.mjs` | 草稿保存、恢复、到期；导出图尺寸与画不出时退回 1 倍 |
| `test-entry-browser.mjs` | 入场界面、纯键盘流程与读屏名、屏蔽词说明、改单词确认与保存、候选的词性缩写 |
| `test-input-browser.mjs` | 320～414 宽下输入框字号与镜像对齐、逐字输入不跳、组字与回车、切格切视图不留锁高 |
| `test-panels-browser.mjs` | 借物表与折叠、取景（按钮、方向键、拖动、双指）与导出一致、自选色与对比度提示 |
| `test-caption-browser.mjs` | 配文折行与写满、填表人上限、信息行字号、深浅三档选中样式。加 `SHOT_DIR=<目录>` 存截图 |
| `test-shell-browser.mjs` | 固定顶栏、图标与点按区、读屏名、触屏横滑 |
| `test-layout-browser.mjs` | 版式页（预设、十个开关、小样、320 宽、键盘的 Tab 圈与空格恢复预设）、卡跟着版式变、版式随草稿保存恢复与坏字段、草稿到期时版式页收起、配文引号、非默认版式导出、图版三档比例下取景框与卡面、导出取同一块、只有深色的「表格」主题、标题里墨色与自选白字按选区分开、自选色等于墨色也不跟主题变、「图在下」时候选栏跟着上移、改单词后默认图取景沿用 |
| `test-diag-browser.mjs` | 诊断包（`npm run pack:diag`）：只比 `app/` 多一个脚本和一行引用、过收包规则；诊断牌子与展开的面板、各时间点的先后、逐个文件的耗时、连开几次的记录、后加载的词包、320 宽 |
| `test-batch8-browser.mjs` | 主题对比度、分图高度、全屏顶栏让位、IndexedDB 缺席 |
| `test-backend-absence-browser.mjs` | 文件系统能力缺席时改字保存，能力恢复后配图引用不丢 |
| `test-lang-browser.mjs` | 语言栏、换语言确认、格首提示、冠词块与两性二选一、长词折行；页面里顺带跑 `check-dom-layout.js` |
| `test-t19-app-browser.mjs` | 用包内正式词包走主编辑器：候选、查词、词形、冠词、随机、草稿恢复 |
| `test-uilang-browser.mjs` | 界面语言（v00.04.00 批 1、2）：批 2 起候选栏、义项栏、入场页、预设也不许剩中文（只放行用户写的卡面释义）；英文界面打开法语草稿看英文释义、类别标注与中英界面来回的自动释义，英语的词只标词性；英文环境出英文、中文环境不变；英文界面各状态在 320、360 宽不横滚、不剩中文界面字；设置页「界面语言」三档与主题英文名；换语言后重新载入、草稿还在 |

`test-entry-browser` 与 `test-lang-browser` 只测界面行为，词包请求由旧词包应答（`scripts/legacy-packs.mjs` 按固定提交从 git 取到系统临时目录）。

两个控制台脚本，在预览页粘贴运行。用 `127.0.0.1:5173`，不要用 `localhost`（那是自己草稿所在的源）：

- `scripts/export-hash.js`：固定草稿下导出所有场景，输出每张图的 SHA-1，改版式或绘制代码前后对照。步骤见文件头。
- `scripts/check-dom-layout.js`：比对 DOM 卡每个框与版式数值的偏差，全部通过打印 `dom layout ok`。

## 设计系统预览的重做

设计系统里入场页、编辑面、顶部栏、语言栏、义项栏的预览是从运行中的产品截取的：

```bash
# 先开预览服务器（npm run dev），再设好 PLAYWRIGHT_MODULE、CHROMIUM_PATH
node scripts/design-system/capture.mjs <临时目录>/shots.json            # 把产品走到各状态，截取页面结构
python3 scripts/design-system/build-previews.py <临时目录> <设计系统本地副本的 project 目录>   # 生成各 preview.html
python3 scripts/design-system/audit-previews.py <project 目录>           # 逐张对照预览与 app/index.html 的同名块
node scripts/design-system/render.mjs <project 目录> <输出目录> EntryScreen …   # 本地渲染成图片检查
```

生成后按 [design.md](design.md) 的方法把改过的 `preview.html` 发布到设计系统。对照脚本报的「结构不同」里，运行时才填内容的容器（预设词、字母栏、缩略图等）属于正常。

## 图标与封面怎么重出

图标与封面（宣发 G1）的定稿页是 `design/brand/brand.html`，成品在同一目录。改了定稿页后重出：

```bash
# 设好 PLAYWRIGHT_MODULE、CHROMIUM_PATH（同浏览器回归）；scripts/.cache/fonts/ 里要有原字体，字体没载入会报错退出
node scripts/render-brand.mjs <临时目录>     # 写 icon-1024.png、icon-512.png、cover-1242x1656.png；临时目录里另出一张缩小与裁切的自查图
```

脚本会核对画板尺寸与文件大小上限（图标 5 MB、封面 10 MB）。改了图标的字号或位置，看自查图里圆形裁切的一列有没有伤到字。

README 顶部的七语简介长图另有一页源稿 `design/brand/slogan.html`，改了以后重出（同样要原字体）：

```bash
node scripts/render-slogan.mjs     # 写 design/brand/slogan-desktop.png（宽 1520）、slogan-mobile.png（宽 780）
```

README 里长图下方的预告片（宣发 G9）有两份：`site/backronymsite/portal/trailer.mp4` 是成片原样复制来的，随门户一起发布到 <https://bydpass.com/backronym/trailer.mp4>；`design/brand/trailer.gif` 是给 README 显示的无声动图，点它就打开那个地址。这样分开放是因为 GitHub 两头都不播：README 不认视频标签，仓库里的文件页对这个大小的视频只给下载。成片出自独立仓库 `RED/`（不公开），重出成片后两份一起换，再重新发布网站：

```bash
cp RED/v01.00.00RED/out/藏头-预告.mp4 site/backronymsite/portal/trailer.mp4
ffmpeg -y -i site/backronymsite/portal/trailer.mp4 -vf "fps=15,scale=360:-2:flags=lanczos,split[a][b];[a]palettegen=max_colors=128:stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=5:diff_mode=rectangle" -loop 0 design/brand/trailer.gif     # 360×640，约 2.8 MB
```

两份都要小于 5,000,000 B（提交钩子的单文件上限）。每秒 15 帧是成片 30 帧的一半，隔一帧取一帧；换成 12 帧会取得不匀，画面发顿。

## 首发笔记的教程图怎么重出

首发笔记（宣发 G5）的五张教程图，是把门户第 5 部分的 GIOCO 五步做成一份藏头、用工具自己导出的单图，成品在 `plans/v01.00.00/note/`。词、要点的义项与配文写在脚本开头的 `CELLS` 里，改文案只改那里：

```bash
# 设好 PLAYWRIGHT_MODULE、CHROMIUM_PATH（同浏览器回归）
node scripts/render-note-cards.mjs plans/v01.00.00/note     # 写 gioco-1-g.jpg … gioco-5-o.jpg，都是 1620×2160
```

脚本开着真的应用，植入只有词与配文的草稿，冠词与释义由应用到词库里查，再点「完成」取导出图；卡上的字与 `CELLS` 里的定稿对不上就报错退出。工具的配文不认手动换行，定稿里分两行的句子用空格连成一句，放不下时由工具折行。

## 公开快照怎么重做

公开仓库（远端 `public`）只放不带项目历史的快照：本地 `public` 分支每次更新加一个提交，推到远端的 `main`。远端只应有 `main` 和版本 tag。**推送要用户明确授权。**

三条规矩：

- 引用一律写全名（`refs/heads/…`、`refs/tags/…`）。本仓库同时有 `public` 分支和 `public` 远端，只写 `public` 会报歧义；分支与 tag 同名时 git 会取 tag。
- 每一步单独跑并看结果，不用 `&&`、`;` 串成一条：前一步出错时，后面的删除照样会执行。
- 取哪些文件以 `scripts/public-manifest.mjs` 里的 `DROP_ROOT` 与 `KEEP` 两张表为准。国内版服务器的操作指南 `site/backronymsite/deploy/cn/GUIDE.md` 是私人的，在 `DROP_ROOT` 里（2026-11-24 用户定）；名单只管以后的快照，已推出去的旧提交不受影响。任何一条保留规则匹配不到文件，脚本会报错退出，这时去查是目录改了名，还是测试不再读它。

取舍的大意：取来源提交的全部文件，去掉内部记录（`ROADMAP.md`、`HANDOFF.md`、`AUDIT.MD`、`HISTORY.md`、路线图归档、AOCI 索引）和整个 `plans/`；`review/` 只留 `npm test` 要读的那些。测试新读了 `review/` 或 `plans/` 下的文件时，先加进 `KEEP`。

步骤（`<来源>` 是要公开的提交，`<临时目录>` 是一个新的空路径，`<清单>` 是仓库外的一个文件）：

```bash
node scripts/public-manifest.mjs <来源> > <清单>           # 1 生成文件清单（只读）；加 --diff 改为对照本地 public 分支列出增减
git worktree add <临时目录> refs/heads/public               # 2 把 public 分支检出到临时目录
# 以下在 <临时目录> 里执行，直到第 6 步
git switch public                                           # 2b 切到 public 分支本身；上一步得到的是游离状态，不切的话提交不会落在分支上（会提示名字有歧义，可忽略）
git rm -rq -- . ':!scripts/fixtures/legacy-packs'           # 3 清空旧文件，留下旧词包夹具
git --literal-pathspecs checkout <来源> --pathspec-from-file=<清单>   # 4 按清单取出新文件
npm test                                                    # 5 验证：再跑 npm run audit、node scripts/build-web.mjs --out <别处>
git commit -m "快照更新：…（来源 <来源短哈希>）"            # 6 提交。提交前扫一遍个人信息与密钥
# 回到主仓库
git merge-base --is-ancestor refs/heads/dev/<版本> refs/heads/public   # 7 必须失败（退出码 1）：说明快照与开发分支没有共同历史
git push public refs/heads/public:refs/heads/main           # 8 推送
git worktree remove <临时目录>                              # 9 收尾
```

发版本时在第 6 步后给快照提交打 tag `vxx.xx.xx`，另推 `git push public refs/tags/vxx.xx.xx`。

第 8 步推送后，公开仓库的 `.github/workflows/pages.yml` 会自动把网页版部署到 <https://bydpass.com/backronym/>（2026-11-22 起；域名配在个人站仓库 `bydpass/bydpass.github.io` 上，旧 github.io 地址 301 跳过来）。查结果：`gh run list -R bydpass/backronym -L 1`；失败时线上停在上一版，不会变空。

### 示例：2026-11-20 的一次更新

来源是开发分支 `dev/v00.03.02` 上的 `db23cb2b`，临时目录用 `/tmp/pubwt`，清单放 `/tmp/manifest.txt`。照抄时只换这三样。

```bash
node scripts/public-manifest.mjs db23cb2b > /tmp/manifest.txt     # 打印「清单共 1210 个文件」
node scripts/public-manifest.mjs db23cb2b --diff                  # 可选：这次比上一版少 174 个、多 6 个
git worktree add /tmp/pubwt refs/heads/public
cd /tmp/pubwt
git switch public
git rm -rq -- . ':!scripts/fixtures/legacy-packs'                 # 之后 git ls-files 只剩 7 个夹具
git --literal-pathspecs checkout db23cb2b --pathspec-from-file=/tmp/manifest.txt   # 取出 1210 个，合计 1217
npm test                                                          # 退出码 0，其中两项打印「跳过」
npm run audit                                                     # PASS，带一条体积提示属正常
node scripts/build-web.mjs --out /tmp/pubweb
git grep -lIE '<自己的邮箱或用户名>|/Users/[a-z]+'                # 应无输出
git add -A .
git commit -m "快照更新：词包缩小到 7.59 MB、词库返工与文档整理（来源 db23cb2b）"   # 得到 43823dc3
cd <主仓库>
git merge-base --is-ancestor refs/heads/dev/v00.03.02 refs/heads/public   # 退出码 1，通过
git ls-remote public                                              # 远端 main 应是新快照的父提交，这样是普通快进
git push public refs/heads/public:refs/heads/main                 # c02b2619..43823dc3  public -> main
git worktree remove /tmp/pubwt
```

这次没有打 tag（v00.03.02 还没出包）。扫密钥样式时词包曾误报：词形门控的 base64 数据里碰巧有 `AKIA` 开头的串，不是密钥（v00.03.04 起词包不带门控，这条误报随之消失）。

`scripts/fixtures/legacy-packs/` 的七个文件只存在于 `public` 分支：快照没有提交历史，`scripts/legacy-packs.mjs` 取不到固定提交时改读这里，所以第 3 步要留下它。

关于来源缓存：`scripts/.cache/` 不进 git，放词库与字体的原始来源，只有重新生成时才需要。`npm test` 里读它的两处（`test-lexicon-scope` 的英语源重建对照、`test-t19-store` 的「从 ECDICT 推英语词形」）在缺 `scripts/.cache/ecdict.csv` 时会跳过并打印一句说明，所以干净检出的目录里 `npm test` 直接能过。
