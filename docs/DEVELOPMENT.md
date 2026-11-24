# 开发说明

> 给想改代码、想自己打包的人看。项目是什么、怎么用，见根目录的 [README.md](../README.md)。

无构建链、无框架、无 npm 依赖。需要 Node 22 或更新的版本；`npm run dev` 与 `npm test` 另需 Python 3。

## 命令

```bash
npm run dev        # 本地预览 http://localhost:5173（直接读 app/，改了刷新就能看到）
npm test           # 全部自检脚本串行，清单见 package.json；每个都能单独跑，如 node scripts/test-core.mjs
npm run audit      # 审计 app/ 的文件与体积（不检查 ES2017 语法或 CSP，这两项另测）
npm run pack       # test → 审计 → dist/backronym.zip（小红书版，含屏蔽器）
npm run pack:web   # dist/web/（外链网页版，同样含屏蔽器）
npm run pack:site  # 整个公开网站（门户 + 网页版），GitHub Pages 部署用
npm start          # 本地部署：生成 dist/web/ 并在 http://127.0.0.1:8080 提供服务（scripts/serve.mjs）
npm run packs      # 从 review/t19-batches 里的当前批次重新生成六语词包
npm run en-gloss   # 重新生成五门外语义项的英文释义表
npm run presets    # 重新生成预设词与释义
npm run licenses   # 从 LICENSES/*.txt 重新生成许可全文的两种载体（app/LICENSES/*.html 只进网页版；借物页展开时读的 licenses.js 两版都带）
npm run fonts      # 重新生成字体子集（需原始字体 + pyftsubset）
npm run dict       # 旧管线：重新生成英语词库（需 scripts/.cache/ecdict.csv）
```

`npm test` 覆盖三块：
- **核心与界面**：屏蔽器、`core.js` 纯函数、界面文案表、应用模块、草稿 18 小时存储、配图存储；
- **词库与语言**：语言接缝、六语词库规则与词条范围、词包、英文释义、预设词；
- **构建与服务**：网页版与网站构建保护、体积钩子、本地服务。

新克隆的副本可以直接跑 `npm test`。其中两项要读 `scripts/.cache/ecdict.csv`（ECDICT 的词表，约 63 MB，不进仓库），没有这个文件时会跳过并打印一句说明，不算失败。

改版式或绘制代码前后，在 `127.0.0.1:5173` 的控制台运行 `scripts/export-hash.js`（导出图的哈希）和 `scripts/check-dom-layout.js`（DOM 卡与版式数值的偏差）对照。

发布前的模拟器与真机检查项见 [RELEASE.md](../RELEASE.md)。

## 结构

```
app/                 离线 H5，小红书小工具与网页版共用的源码（小红书 zip 打包时排除 LICENSES/ 与隐藏文件）
  index.html
  assets/
    i18n.js          界面文案表（中文、英文），代码里只写编号
    lang/<语言>/      六个语言包（en fr de es it la）：words.js 词库（生成产物）、rules.js 字母规则、block.js 屏蔽词表
    lang/presets.js  预设词与释义（生成产物）
    lang/packs.js    语言包注册表与按需加载器
    lexicon-*.js     词库的查询与取词规则
    licenses.js      许可全文（生成产物，借物页展开时才读）
    block/core.js    屏蔽器公共部分（两版都有）
    core.js          纯函数：版式、候选、释义、草稿迁移；浏览器与 Node 测试共用
    draft.js         草稿读写、18h 到期校验与清理
    media.js         配图存储（容器文件系统 / IndexedDB）与清理
    theme.js         五个主题与深浅三档
    app-*.js         九个职责模块：model/title/media/view/editor/entry/layout/publish/draft
    app.js           事件绑定与启动（模块加载顺序及共享状态见 docs/agent/architecture.md）
    style.css
    fonts/           界面字体与各主题字体的子集
  LICENSES/          许可全文的独立网页（生成产物，只进外链网页版；小红书包只许一个 html，不带它）
scripts/             构建、测试、回归脚本
site/backronymsite/  公开网站：门户源码 portal/、国内版部署 deploy/cn/、门户设计素材
design/              设计记录；第六稿母版 folio-swiss.html，品牌图标与封面在 brand/
docs/                本文件、项目地图（file-map.html）、代理规则细则（agent/）
LICENSES/            各许可的全文
```

**排版只算一次。** `core.js` 的 `layoutCard` / `layoutGrid` 输出 1080 制坐标的版式框；编辑用的 DOM 卡和 Canvas 导出按同一份框摆放和绘制，所以编辑所见即导出所得。导出时按 1.5 倍画，单图是 1620×2160。

**草稿。** 同时写入端存储与 `localStorage`，读取时取未过期、可迁移且较新的一份；连续 18 小时未更新则清除当前作品、草稿及过期备份（关闭期间到期则在下次打开时清除），页面底部显示预计清除时间。

**配图。** 另存为独立文件（小红书 9.49+ 走容器文件系统，否则走 IndexedDB），草稿只记文件名与取景。先写图并读回核对，再写草稿；写入失败时沿用上一次的图与取景，并在状态行提示。草稿到期或不再被引用的图片会随清理删除。

**界面文字。** 界面上出现的字都在 `i18n.js`，代码里只写编号；`index.html` 留着的中文与表里逐字相同，由 `npm test` 把关。数据与草稿统一用中文释义标识义项，英文界面只切换显示文本。

## 容器约束

- JS / CSS 基线 Chrome / WebView 61（ES2017，无转译），新 API 先做能力检测。
- CSP 禁内联脚本；不联网，所有资源在包内。
- 发布包严格小于 10,000,000 B；6 MB 起提示、8 MB 起加强提示（本地提交 hook，十进制 MB，见 [size-hook.md](size-hook.md)）。`npm run audit` 用的是 skill 脚本的 MiB 阈值（> 10 MiB 报错、> 2 MiB 警告），比 hook 宽，以 hook 为准。字体与词库占大头，实际大小以 `npm run pack` 输出为准。
- 保存相册、发布笔记只在小红书容器里存在，普通浏览器跑通不算验收。

## 文档

| 文件 | 内容 |
|---|---|
| [`CLAUDE.md`](../CLAUDE.md) | 规则入口与文档索引；`AGENTS.md`、`GEMINI.md` 与它内容相同，各家代理读各自认的那份；细则在 `docs/agent/` |
| [`docs/agent/architecture.md`](agent/architecture.md) | 模块职责、加载顺序、草稿、版式、语言包等跨文件约定 |
| [`docs/agent/commands.md`](agent/commands.md) | 生成脚本、浏览器回归、公开快照的做法 |
| [`RELEASE.md`](../RELEASE.md) | 上架清单 |
| [`site/backronymsite/README.md`](../site/backronymsite/README.md) | 公开网站的目录与部署 |
| [`design/folio-swiss.html`](../design/folio-swiss.html) | 界面母版（满版 folio × 国际主义 × 左对齐） |
