> 按需读的细则，入口与规则见根目录 [CLAUDE.md](../../CLAUDE.md)。本文件原是 CLAUDE.md 的「常用命令」一节（2026-11-11 拆出）。

# 常用命令

```bash
npm run dev        # 本地预览 http://localhost:5173（scripts/dev.py，发 no-store，改完刷新即生效）
npm test           # 全部自检脚本（清单见 package.json）串行（v00.03.00 起加 scripts/test-lexicon-scope.mjs：六门语言词条范围与数据结构、英语成品与源重建逐字节一致）（v00.03.00 第 2 批起加 scripts/test-lexicon.mjs：西文冠词规则、各语言规则对象、生成词库结构）（第 1 批起加 scripts/test-lang.mjs：屏蔽器按语言注册、语言规则注册表、草稿 lang、语言包加载契约）（第七批 T45 起加 scripts/test-media.mjs：配图存储与清理）（第七批 B4-R1 起加 scripts/test-build-web.mjs：网页版构建的输出目录保护，隔离夹具里跑）：scripts/test-blocklist.mjs（屏蔽器）+ scripts/test-core.mjs（core.js 纯函数）+ scripts/test-app.mjs（应用模块草稿读写、组字回车、emoji 绘制；用替身，不碰真实存储）+ scripts/test-draft.mjs（18h双存储/失败回归）
npm run audit      # 只审计 app/ 的文件与体积（语法和运行行为另测），不打包
npm run pack       # test → 审计 app/ → 打 zip → 再审计 zip 体积
npm run pack:web   # 外链网页版 → dist/web/
npm run packs      # T19（2026-11-11）起的正式词包：从已复审的新范围词库（scripts/t19/build-packs.mjs 里的 DEFAULT_COMPILED）生成六语 app/assets/lang/<语种>/words.js 与 en/phrases.js；改完跑 npm run fonts
npm run dict       # 旧管线（英语，ECDICT）。不再写入正式词包：必须设 BACKRONYM_DICT_OUT=<目录> 做隔离核对
npm run block      # v00.03.00 T23：西文五语屏蔽词表 app/assets/lang/<语种>/block.js + 送审表 review/lexicon/block-review.tsv（读候选表与审核文件）
npm run lexicon:extract  # v00.03.00 第 2 批：kaikki JSONL → scripts/.cache/v003/stage/<语种>.json（原始数据已于 11-11 删除，要重跑先按 scripts/.cache/v003/MANIFEST.md 重新下载，约 4.5 GB）
npm run lexicon    # 旧管线（西文五语）。不再写入正式词包：必须设 BACKRONYM_LEXICON_OUT=<目录> 做隔离核对；可只跑几门：npm run lexicon -- fr de
npm run lexicon:check    # 只检查审核文件（dsh-NNN.tsv / codex-NNN.tsv）的格式，不生成词库；可只查几门：npm run lexicon:check -- fr de
npm run lexicon:audit    # 主会话按规则独立核对普查与复审结果，写 review/lexicon/<语种>/audit.json；--samples 出抽样表，--after-build 核对 words.js 实际写入值（用法见 scripts/lexicon/audit-review.mjs 文件头）
npm run licenses   # 许可全文（T07）：从 app/LICENSES/*.txt 生成借物页展开时读的 app/assets/licenses.js；改了哪份全文就重跑，test-app 会比对
npm run fonts      # 重新生成字体子集（需 scripts/.cache/fonts/ 原始字体 + pyftsubset；本机用 PYFTSUBSET=$PWD/scripts/.cache/font-tools-venv/bin/pyftsubset npm run fonts）
node scripts/test-core.mjs   # 全部自检脚本（清单见 package.json）都能单独跑（只改了 core.js 时只跑这个即可）
```

可选的浏览器草稿回归 `scripts/test-draft-browser.mjs` 不在 `npm test` 里：用已安装的 Playwright 起本地临时端口、新上下文，不碰预览页存储。需要指定模块与浏览器路径（见文件头），例如本机：

```bash
PLAYWRIGHT_MODULE=/Applications/ChatGPT.app/Contents/Resources/cua_node/lib/node_modules/playwright CHROMIUM_PATH=$HOME/Library/Caches/ms-playwright/chromium_headless_shell-1234/chrome-headless-shell-mac-arm64/chrome-headless-shell node scripts/test-draft-browser.mjs
```

第六批补充：词框错首字母时设置 `aria-invalid`，可见错误通过 `aria-describedby` 关联 `role="status"` 提示；纠正、切格、组字和收栏时同步更新，真实读屏待设备清单验证。

同样用法的 `scripts/test-entry-browser.mjs`（v00.02.01 第 4 批）覆盖入场界面与编辑面：首次进入与纯键盘流程、读屏名、屏蔽词就地说明、改单词清空确认与 `keepSame`、慢读取期间点预设 / 进入无效、义项栏隐藏配文（T02）、只改文字不重画照片；第七批批次 2 起还覆盖 T49 精简后的提示行 / 候选标签，以及 T30 改词页保存（五态、返回三选一、Esc / 点外面 / 焦点归还、清空确认联动、回车、写入失败重试、保存中点返回、迟到确认）。

同样用法的 `scripts/test-input-browser.mjs`（第七批批次 1）覆盖输入稳定：320 / 360 / 375 / 414 宽下可聚焦输入框计算字号 ≥ 16px 且缩放后与镜像对齐、DOM 卡与版式一致、滚到底逐字输入不跳、组字开始收候选不跳与组字中回车不提交、切格 / 切视图 / 进出入场页不留锁高、入场页预览与错误行占位、模拟 visualViewport 下只做必要避让。

同样用法的 `scripts/test-panels-browser.mjs`（第 5 批）覆盖面板：借物表语义与折叠键盘操作、320 / 360 / 375 宽十字母单行且点按区 ≥ 24px、取景按钮 / 方向键 / 拖动 / 双指与导出取景一致、自选色立即应用与 3 秒对比度提示（批次 1 起贴在标题下方）、取景标题「调整取景 · nL」与去掉「居中」（批次 2）。

同样用法的 `scripts/test-shell-browser.mjs`（第七批批次 2）覆盖外壳：固定顶栏（320 / 360 / 375 / 414 宽滚到底仍贴顶可点、全屏页关闭同理、无横向滚动）、22px 图标与 44×44 点按区、深浅读屏名随档位、获焦元素不被顶栏盖住、界面文字 +1.5px、触屏横滑区（字母栏 / 提示行，按钮上起手、有选区、放大时不切）。

同样用法的 `scripts/test-batch8-browser.mjs`（批次 8）覆盖当前主题对比度、分图高度、全屏顶栏让位、IndexedDB 缺席；`scripts/test-backend-absence-browser.mjs`（批次 8）覆盖文件系统能力缺席时改文字保存、能力恢复后引用与原图均保留。

同样用法的 `scripts/test-lang-browser.mjs`（v00.03.00 界面重构 · 结构）覆盖语言栏（折叠、六个单选、选中才加载、状态与重试、没就绪不能开始）、换语言确认（保留 / 清空、标题占位字）、西文格首提示、候选两行与冠词、刷新后按草稿语言恢复。；第二步「卡面版式」起还覆盖卡上的冠词块、两性名词二选一与「完成」拦下、长词折行与格内上限说明，并在页面里跑 `check-dom-layout.js`。

预览服务器在 `.claude/launch.json` 里叫 `app`（另有 `docs` :5174、`design` :5175）。

两个不打包的浏览器控制台脚本，在预览页（用 `127.0.0.1:5173`，不要用 `localhost`，那是自己的草稿所在的源）粘贴运行：

- `scripts/export-hash.js`：固定草稿下导出所有场景（浅 / 深、单图 / 列阵），输出每张图的 SHA-1，改版式或绘制代码前后对照用（文件头有步骤）。
- `scripts/check-dom-layout.js`：比对 DOM 卡每个框与版式数值（左端、宽、基线、字号）的偏差，全部通过打印 `dom layout ok`。

`scripts/test-t19-app-browser.mjs`（T19 接入）用包内真实新词包测主编辑器：候选、查词、词形、冠词、只供查询的词、无候选字母、随机、草稿恢复。`test-entry-browser` 与 `test-lang-browser` 测界面行为，词包请求由旧词包应答（`scripts/legacy-packs.mjs` 按固定提交从 git 取到系统临时目录，仓库里不留副本）。

## 设计系统预览的重做（2026-11-12）

设计系统里入场页、编辑面、顶部栏、语言栏、义项栏的预览是从运行中的产品截取的，脚本在 `scripts/design-system/`，不在 `npm test` 里：

```bash
# 先开预览服务器（npm run dev），再设好 PLAYWRIGHT_MODULE、CHROMIUM_PATH
node scripts/design-system/capture.mjs <临时目录>/shots.json            # 把产品走到各状态，截取页面结构
python3 scripts/design-system/build-previews.py <临时目录> <设计系统本地副本的 project 目录>   # 生成各 preview.html
python3 scripts/design-system/audit-previews.py <project 目录>           # 逐张对照预览与 app/index.html 的同名块，列出结构不同处
node scripts/design-system/render.mjs <project 目录> <输出目录> EntryScreen …   # 本地渲染成图片检查
```

生成后按 `docs/agent/design.md` 的方法把改过的 `preview.html` 发布到设计系统。对照脚本报的「结构不同」里，运行时才填内容的容器（预设词、字母栏、缩略图等）属于正常。
