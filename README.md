# 藏头 - Backronym

小红书小工具。输入一个单词，逐个字母在一张和成品一样的卡上填词，导出 1080×1440 的图，保存到相册或直接发笔记。支持英、法、德、西、意、拉丁六门语言，可以同时选几门。

```
L  Living     活的，逼真的
I  Imagine    想像，设想
F  Fearless   大胆的，勇敢的
E  Eternal    永恒的，永远的    ← 首字母标朱红
```

**状态：v00.03.00 开发侧完工**（2026-11-12 正式打包，发布包约 5.6 MB）。词库、语言多选、四个主题都经独立审核；模拟器、小红书容器和真机还没有验收，尚未上架。

真机测试从 [TEST_SOP.md](plans/v00.02.01/TEST_SOP.md) 开始，逐项结果记入设备清单；走查见 [UX_WALKTHROUGH.md](plans/v00.02.01/UX_WALKTHROUGH.md)。

---

## 01　用法

1. 在入场页选语言（可多选，选中的语言一律平等），输入单词（字母或数字，最多 14 个字符）和填表人，也可选一个预设词，再点“开始填充”。超过 10 格时列阵分两张导出。
2. 每个字符一格。直接在卡上打一个以该字母开头的词（数字格以该数字或其读法的首字母开头都算对）；候选栏每次给 8 个灵感，可点「下一批」或「随机一个」。候选只来自该首字母。
3. 首字母固定标朱红；要改单词或填表人，从编辑页返回入场页，有内容将被清空时先确认。
4. 补释义（默认带出词库释义，可改）、配文、配图；标题留空时导出单词本身。
5. 点「完成」：先检查每格合法和屏蔽词，再逐张导出——单图每个字母一张，列阵全部格子一张。

四个主题（fandom、单色画、印象派、分离派），各有自己的颜色和字体，卡和导出图跟着主题走。fandom 只有浅色；其余三个有深浅三档（跟随系统 / 浅 / 深）。

候选词来自内置词库：六门语言共 5,535 条人工核过的义项，带中文释义；法、德、西、意、拉丁的名词带冠词，动词的常用变位也能查到。

## 02　产品边界

- 路线「4 + 1」：**在图上编辑**，编辑时看到的就是导出的那张图；**词库是灵感，不是答案**，先打自己的词。
- 单图与列阵都是产物，默认单图。
- 不做：账号、社区、信息流；AI 生成；背单词 / 教学。

## 03　开发

无构建链、无框架、无 npm 依赖。需要 Node 和 Python 3（本地预览服务器）。

```bash
npm run dev        # 本地预览 http://localhost:5173
npm test           # 屏蔽器 + core.js 纯函数 + 应用模块 + draft.js 18h存储 + media.js 配图存储 + 语言接缝 + 西文词库规则与词条范围 + 网页版构建保护
npm run audit      # 审计 app/ 的文件与体积（不检查 ES2017 语法或 CSP，这两项另测）
npm run pack       # test → 审计 → dist/backronym.zip（小红书版，含屏蔽器）
npm run pack:web   # dist/web/（外链网页版，同样含屏蔽器）
npm run packs      # 从 review/t19-batches 里的当前批次重新生成六语词包
npm run licenses   # 从 app/LICENSES/*.txt 重新生成借物页用的许可全文
npm run dict       # 旧管线：重新生成英语词库（需 scripts/.cache/ecdict.csv）
npm run fonts      # 重新生成字体子集（需原始字体 + pyftsubset）
```

`npm test` 里的 `test-t19-store` 要读 `scripts/.cache/ecdict.csv`（ECDICT 的词表，约 66 MB，不进仓库），新克隆的副本需先自行放好，否则这一项会失败；其余各项不需要它。

改版式或绘制代码前后，在 `127.0.0.1:5173` 的控制台运行 `scripts/export-hash.js`（52 张导出图的哈希）和 `scripts/check-dom-layout.js`（DOM 卡与版式数值的偏差）对照。

## 04　结构

```
app/                 原样打成 zip 的离线 H5
  index.html
  assets/
    lang/<语言>/      六个语言包（en fr de es it la）：words.js 词库（生成产物）、rules.js 字母规则、block.js 屏蔽词表
    lang/presets.js  预设词与释义（生成产物）
    licenses.js      许可全文（生成产物，借物页展开时才读）
    lang/packs.js    语言包注册表与按需加载器
    block/core.js    屏蔽器公共部分（两版都有）
    core.js          纯函数：版式、候选、释义、草稿迁移；浏览器与 Node 测试共用
    draft.js         草稿读写、18h 到期校验与清理
    media.js         配图存储（容器文件系统 / IndexedDB）与清理
    theme.js         四个主题与深浅三档
    app-*.js         八个职责模块：model/title/media/view/editor/entry/publish/draft
    app.js           事件绑定与启动（模块加载顺序及共享状态见 docs/agent/architecture.md）
    style.css
    fonts/           界面字体与四套主题字体的子集
  LICENSES/          许可全文（GPL-3.0、CC BY-SA 4.0 与 3.0、CC BY 4.0、MIT、OFL 1.1）
scripts/             构建、测试、回归脚本
design/              设计记录；第六稿母版 folio-swiss.html
docs/                项目地图（file-map.html）、代理规则细则
plans/v00.03.00/     当前计划（西文模式）与调研
plans/v00.02.01/     待执行的真机清单（上一版的任务表与交付记录已于 2026-11-12 删除，见 git 历史）
```

**排版只算一次。** `core.js` 的 `layoutCard` / `layoutGrid` 输出 1080×1440 坐标的版式框；编辑用的 DOM 卡和 Canvas 导出按同一份框摆放和绘制，所以编辑所见即导出所得。

**草稿。** 存在端存储与 localStorage 两处，读取时取未过期、能迁移且较新的一份；连续18小时未更新保存则清除当前作品、草稿及过期备份。关闭期间到期，下次打开时清除；底部显示预计清除时间。配图（第七批 T45）另存为文件（小红书 9.49+ 用容器文件系统，否则 IndexedDB），草稿只记文件名与取景；先写图片并读回核对再写草稿，没存成时沿用上一次的图与取景并在状态行说明；草稿到期或不再被任何草稿引用的图随清理删除。

## 05　容器约束

- JS / CSS 基线 Chrome / WebView 61（ES2017，无转译），新 API 先做能力检测。
- CSP 禁内联脚本；不联网，所有资源在包内。
- 发布包严格小于 10,000,000 B；6 MB 起提示、8 MB 起加强提示（本地提交 hook，十进制 MB，见 docs/size-hook.md）。`npm run audit` 用的是 skill 脚本的 MiB 阈值（> 10 MiB 报错、> 2 MiB 警告），比 hook 宽，以 hook 为准。当前工作区打包 6,374,744 B（11-11 实测，T19 词库重整进行中，已过 6 MB 提示线；以 `npm run pack` 输出为准），字体与词库占大头。

## 06　文档

| 文件 | 内容 |
|---|---|
| [`CLAUDE.md`](CLAUDE.md) | 规则入口与文档索引（Claude 与 GPT 共用）；细则在 `docs/agent/` |
| [`RELEASE.md`](RELEASE.md) | 上架清单 |
| [`ROADMAP.md`](ROADMAP.md) | 迭代标准 |
| [`design/folio-swiss.html`](design/folio-swiss.html) | 界面母版（满版 folio × 国际主义 × 左对齐） |

## 07　许可

© 2026 BeyondPassenger。源代码：<https://github.com/bydpass/backronym>

**省流**（与应用里「借物与版权」页是同一段文字）

- **可以**：用本工具做的图，署名即可商用（署名可写「版式：藏头 - Backronym，CC BY 4.0，creativecommons.org/licenses/by/4.0」）；代码可以改，可以商用。
- **不可以**：把改过的程序分发给别人，却不向对方提供源码；删掉署名或许可声明；把设计稿与文档拿去商用。
- **注意**：第三方资源各守原许可；一切以许可原文为准，这段中文说明不具法律效力；本工具不提供担保。

**各部分的许可**

| 部分 | 许可 | 全文 |
|---|---|---|
| 代码（`app/`、`scripts/`，含写在代码里的界面文案） | GPL-3.0-or-later（GNU 通用公共许可证第 3 版，或由你选择的任一更新版本） | [`LICENSE`](LICENSE) |
| 五门西文词库（`app/assets/lang/{fr,de,es,it,la}/words.js` 及其在 `review/` 下的来源数据） | CC BY-SA 4.0 | [`app/LICENSES/CC-BY-SA-4.0.txt`](app/LICENSES/CC-BY-SA-4.0.txt) |
| 英语词库 | 派生自 [ECDICT](https://github.com/skywind3000/ECDICT)，MIT，© 2025 Linwei | [`app/LICENSES/MIT.txt`](app/LICENSES/MIT.txt) |
| 设计稿与文档（`design/`、`docs/`） | CC BY-NC-SA 4.0 | <https://creativecommons.org/licenses/by-nc-sa/4.0/legalcode> |
| 用本工具做出的图 | 属于本工具的版式部分 CC BY 4.0；制作者自己写的文字、放的照片归制作者，直接取自词库的释义仍按词库的许可 | [`app/LICENSES/CC-BY-4.0.txt`](app/LICENSES/CC-BY-4.0.txt) |
| 字体 | SIL Open Font License 1.1，各版权人见全文开头 | [`app/LICENSES/OFL-1.1.txt`](app/LICENSES/OFL-1.1.txt) |

本程序不提供任何担保，详见 GPL 第 15、16 条。

第三方来源（维基词典、FrequencyWords、断词模式、屏蔽词表、图标等）逐个列在应用的「借物与版权」页，各守原许可；各语言词库的来源声明另附在对应 `words.js` 的文件头。
