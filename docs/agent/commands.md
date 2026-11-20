> 按需读的细则，入口与规则见根目录 [CLAUDE.md](../../CLAUDE.md)。本文件只写现行做法；改动的来龙去脉看 git 历史。

# 常用命令

```bash
npm run dev        # 本地预览 http://localhost:5173（scripts/dev.py，禁缓存，改完刷新即生效）
npm test           # 全部自检脚本串行，清单见 package.json；每个都能单独跑：node scripts/test-core.mjs
npm run audit      # 只审计 app/ 的文件与体积（语法和运行行为另测），不打包
npm run pack       # test → 审计 app/ → 打 zip → 再审计 zip 体积
npm run pack:web   # 外链网页版 → dist/web/
```

预览服务器在 `.claude/launch.json` 里叫 `app`（另有 `docs` :5174、`design` :5175）。

## 生成产物

```bash
npm run packs      # 正式词包：从已复审的编译包（scripts/t19/build-packs.mjs 的 DEFAULT_COMPILED）生成六语 app/assets/lang/<语种>/{words,inflections}.js 与 en/phrases.js；改完跑 npm run fonts
npm run fonts      # 字体子集。需 scripts/.cache/fonts/ 原始字体与 pyftsubset；本机用 PYFTSUBSET=$PWD/scripts/.cache/font-tools-venv/bin/pyftsubset npm run fonts
npm run licenses   # 从 LICENSES/*.txt 生成 app/LICENSES/*.html（只进网页版）与 app/assets/licenses.js；改了哪份全文就重跑，test-app 会比对
npm run presets    # 从人工审定的表生成入场预设词 app/assets/lang/presets.js
npm run block      # 西文五语屏蔽词表 app/assets/lang/<语种>/block.js 与送审表 review/lexicon/block-review.tsv
```

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

不在 `npm test` 里。用已安装的 Playwright 起本地临时端口和新的浏览器上下文，不碰预览页的存储。要指定模块与浏览器路径，例如本机：

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
| `test-batch8-browser.mjs` | 主题对比度、分图高度、全屏顶栏让位、IndexedDB 缺席 |
| `test-backend-absence-browser.mjs` | 文件系统能力缺席时改字保存，能力恢复后配图引用不丢 |
| `test-lang-browser.mjs` | 语言栏、换语言确认、格首提示、冠词块与两性二选一、长词折行；页面里顺带跑 `check-dom-layout.js` |
| `test-t19-app-browser.mjs` | 用包内正式词包走主编辑器：候选、查词、词形、冠词、随机、草稿恢复 |

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

## 公开快照怎么重做

公开仓库（远端 `public`）只放不带项目历史的快照：本地 `public` 分支每次更新加一个提交，推到远端的 `main`。远端只应有 `main` 和版本 tag。**推送要用户明确授权。**

三条规矩：

- 引用一律写全名（`refs/heads/…`、`refs/tags/…`）。本仓库同时有 `public` 分支和 `public` 远端，只写 `public` 会报歧义；分支与 tag 同名时 git 会取 tag。
- 每一步单独跑并看结果，不用 `&&`、`;` 串成一条：前一步出错时，后面的删除照样会执行。
- 取哪些文件以 `scripts/public-manifest.mjs` 里的 `DROP_ROOT` 与 `KEEP` 两张表为准。任何一条保留规则匹配不到文件，脚本会报错退出，这时去查是目录改了名，还是测试不再读它。

取舍的大意：取来源提交的全部文件，去掉内部记录（`ROADMAP.md`、`HANDOFF.md`、`AUDIT.MD`、`HISTORY.md`、路线图归档、AOCI 索引）和整个 `plans/`；`review/` 只留 `npm test` 要读的那些。测试新读了 `review/` 或 `plans/` 下的文件时，先加进 `KEEP`。

步骤（`<来源>` 是要公开的提交，`<临时目录>` 是一个新的空路径，`<清单>` 是仓库外的一个文件）：

```bash
node scripts/public-manifest.mjs <来源> > <清单>           # 1 生成文件清单（只读）；加 --diff 改为对照本地 public 分支列出增减
git worktree add <临时目录> refs/heads/public               # 2 把 public 分支检出到临时目录
# 以下 3～6 在 <临时目录> 里执行
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

`scripts/fixtures/legacy-packs/` 的七个文件只存在于 `public` 分支：快照没有提交历史，`scripts/legacy-packs.mjs` 取不到固定提交时改读这里，所以第 3 步要留下它。

关于来源缓存：`scripts/.cache/` 不进 git，放词库与字体的原始来源，只有重新生成时才需要。`npm test` 里读它的两处（`test-lexicon-scope` 的英语源重建对照、`test-t19-store` 的「从 ECDICT 推英语词形」）在缺 `scripts/.cache/ecdict.csv` 时会跳过并打印一句说明，所以干净检出的目录里 `npm test` 直接能过。
