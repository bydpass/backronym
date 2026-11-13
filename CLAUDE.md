# CLAUDE.md

本文件是 Claude 与 GPT（Astra）共用的规则入口。根目录的 `CLAUDE.md` 与 `AGENTS.md` 内容完全相同：Claude 读前者，GPT 读后者；改规则时两份一起改，保持一致。**本项目一律用中文回答**（说明、进度、报告、提交信息都用中文）。

本文件只放规则和索引；细则在 `docs/agent/`，按下面「按需读的文档」到用时才打开。

## 项目是什么

小红书小工具「藏头 - Backronym」：用户输入一个单词（最多 14 个字符，字母或数字），在一张和成品长得一样的卡上逐格编辑：每个字母打一个以该字母开头的词，词库给候选，再填中文释义、配文、配图，最后用 Canvas 导出梗图。v00.03.00 起支持英、法、德、西、意、拉丁六门语言。

- 形态：**离线 H5**，无构建链、无框架、无 npm 依赖。`app/` 原样打成 zip 交给小红书容器加载，不联网，所有资源必须在包内。
- 两个产物：小红书版 `dist/backronym.zip` 和外链网页版 `dist/web/`，两版都含屏蔽器。

## 工作规则

### 1. 读文件：按需、按进度

- 开工只读三样：本文件、`HANDOFF.md` 最上面一条、它指向的当前任务文件（现在是 [plans/v00.03.00/T19.md](plans/v00.03.00/T19.md)）。
- 「按需读的文档」表里的文件，做到那件事时才打开。
- 其余不主动打开：`HANDOFF.md` 里更早的记录、`review/`、旧版本的 `plans/`、`design/` 里的旧稿。用户点名或当前任务明确指向时才读。

### 2. 不备份，以提交代替（2026-11-11 用户定）

- 不创建 `_recovery`、`.bak`、`.old` 或任何恢复副本，改文件前不备份。
- 改为频繁提交：**实现方初次完工提交一次，审核方审完改完再提交一次**。两边都自行提交，不必等用户点头。推送仍需用户明确授权。
- 提交后更新 `ROADMAP.md` 文件头（基线提交、本轮状态）。
- 两个远端：`legacy`（私有，完整历史，日常推这里）与 `public`（公开，只放不带历史的快照分支 `public`）。带历史的分支不得推到 `public`。
- 遗留的 `_recovery`：所属批次一验收就直接删除；存在超过 7 日的直接删除。不进废纸篓。
- 被 `.gitignore` 忽略的文件（`scripts/.cache/`、候选表、分片等）没有恢复途径，用户已知并接受。

### 3. 不产出校验清单与复现证据（2026-11-11 用户定）

- 不再生成文件指纹 / 校验值清单、逐字节复现记录、多份重建副本这类证据文件。
- 汇报、交接、提交信息里也不提这类内容。验收写「跑了什么检查、结果如何」即可。
- 现有代码里靠它工作的功能（配图按内容命名、导出对照脚本、已有测试）保持不动。

### 4. 记录上限：每次开始下一步 / 下一批时裁剪

| 文件 | 上限 | 超出怎么办 |
|---|---|---|
| `HANDOFF.md` | 9 条记录，新的写在最上面 | 删掉最旧的 |
| `plans/<版本>/REPAIR.md` | 「已关闭」只留最近 3 轮 | 删掉更早的轮次 |
| `AUDIT.MD` | 同 REPAIR：历史摘要只留最近 3 轮 | 删掉更早的 |

未关闭的条目（待做、已返工待复审）不受上限影响，不删。

### 5. 分工与代称

- 实现方与审核方须是不同的一方；实现方自测通过只能写「待复审」。当前谁实现谁审核，看 `HANDOFF.md` 最上面一条。
- 四份记录各管一件事：`AUDIT.MD` 记审核发现的问题，`REPAIR.md` 记返工说明与状态，`PLAN.md` / `T19.md` 记计划与当前任务，`HANDOFF.md` 只做交接通知。
- 代称：Claude（含主会话与子代理）用「她」；ChatGPT（含 Astra）与 DeepSeek 用「他」。

### 6. 改代码前的硬约束

- **容器基线**：JS 与 CSS 都以 Chrome/WebView 61（ES2017，无转译）为准，新 Web API 要做能力检测。
- **体积**：发布包严格小于 10,000,000 B；6 MB 起提示、8 MB 起加强提示，由本地提交 hook 检查。当前工作区打包约 5,643,000 B（11-12 加入四套主题字体后，把 app/ 直接压成 zip 实测；其中主题字体 3.37 MB）。
- **生成产物勿手改**：`app/assets/lang/*/words.js`、`phrases.js`、`block.js`（西文五语）、字体子集。改规则去对应的 `scripts/` 生成脚本。
- **界面改动先在设计系统里敲定**，用户确认后才改 `app/`（见 `docs/agent/design.md`）。
- **浏览器跑通不算验收**：保存相册、发布笔记只在容器里存在，交付时提醒用户做模拟器和真机验证。
- 代码里的 `ponytail:` 注释标的是有意简化及其上限，改动前先读。

### 7. 暂缓事项

- `review/` 已于 2026-11-12 清理（用户定）：中间批次只留报告，自检读的编译包、当前词库源（交付63）、概念清单与审定表保留。各类文件谁在用见 [docs/file-map.html](docs/file-map.html)；被删的内容在 git 历史里。
- `core.js` 未用导出、`style.css` 未用变量，正式版发布后再清。

## 常用命令

```bash
npm run dev        # 本地预览 http://localhost:5173（预览服务器在 .claude/launch.json 里叫 app）
npm test           # 全部自检脚本串行（清单见 package.json），每个都能单独跑：node scripts/test-core.mjs
npm run audit      # 只审计 app/ 的文件与体积
npm run pack       # test → 审计 → 打 zip → 再审计 zip 体积
npm run pack:web   # 外链网页版 → dist/web/
```

词库、屏蔽词表、字体的生成命令，以及不在 `npm test` 里的浏览器回归脚本，见 `docs/agent/commands.md`。

## 按需读的文档

| 要做的事 | 读这个 |
|---|---|
| 跑生成脚本、浏览器回归、控制台对照脚本 | [docs/agent/commands.md](docs/agent/commands.md) |
| 改 `app/` 里的代码：模块职责、加载顺序、草稿、版式、语言包、输入法等跨文件约定 | [docs/agent/architecture.md](docs/agent/architecture.md) |
| 打包、端能力、容器限制、上架 | [docs/agent/container.md](docs/agent/container.md)、`.claude/skills/minitool-zip-builder/`、[RELEASE.md](RELEASE.md) |
| 交付、审核、派子代理 | [docs/agent/workflow.md](docs/agent/workflow.md) |
| 改界面、颜色、文案 | [docs/agent/design.md](docs/agent/design.md)、`design/TASK_BRIEF.md` |
| 词库重整当前任务 | [plans/v00.03.00/T19.md](plans/v00.03.00/T19.md) |
| 版本计划与已定决定 | [plans/v00.03.00/PLAN.md](plans/v00.03.00/PLAN.md) |
| 返工说明与状态 | [plans/v00.03.00/REPAIR.md](plans/v00.03.00/REPAIR.md) |
| 审核发现的未解决问题 | [AUDIT.MD](AUDIT.MD) |
| 词库审核文件的格式与流程 | [review/lexicon/README.md](review/lexicon/README.md) |
| 草稿 18h 到期的设计依据 | [docs/draft-expiry-assessment.md](docs/draft-expiry-assessment.md) |
| 体积 hook 怎么装、怎么判 | [docs/size-hook.md](docs/size-hook.md) |
| 迭代路线与发布标准 | [ROADMAP.md](ROADMAP.md) |
