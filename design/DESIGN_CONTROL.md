# Design control — 藏头 - Backronym 重设计（原名「藏头情况表」）

> 2026-11-11：`design/archive/` 已删除，下文指向它的路径是当时的记录，文件可从 git 历史取回。

Design schema: v3.1
Gate 1 status: released
Image role status: approved
Image role: reference
Image placement: not-placed
Image role approval evidence: 无附图；用户给出参考网址 https://ulysses.app/
Brief status: approved
Brief approval evidence: 2026-10-06 结构化问答 —「界面 + 海报一起改」「跟随系统自动切换」「校对插入符 ‸, 纸面与安静留白, Markdown 式标记」「保持小红书红」
Direction status: approved
Direction preview shown: yes — design/archive/round1-c-margin/directions.html
Proposed direction: A-proof（推荐）
Approved direction: C-margin
Direction approval evidence: 2026-10-06 结构化问答「选哪个方向进入高保真制作？」=「C-margin 留白」（推荐为 A-proof，用户选择 C）

Reference family: Ulysses 官网与编辑器（写作工具：纸面、校对记号、Markdown 标记、写作目标）
Reference decomposition: 暖白纸面↔深炭灰章节交替；单一几何人文无衬线（Interstate 700/400）；单一强调色只用于导航下划线和批注；手写插入符 ‸ 插入词；Markdown 标记高亮；写作目标环；设备框内真实文字
Target density: 每个状态 ≥4 个设计动作（见 design/archive/round1-c-margin/directions.html 各方向“设计动作”）
Interpretive copy status: 方向板中的说明文字为 interpretive draft；界面文案沿用现有已确认文案

## Palette / type cause
- 强调色：小红书红 = 校对红笔（用户确认）。拒绝：Ulysses 黄（他人品牌）
- 字体：Noto Sans / Noto Sans SC（用户上一轮指定）。拒绝：手写体批注（会新增字体，违反字体限定）
- 底色：暖纸 / 冷白 / 书页白（按方向）+ 深色模式；拒绝：现有纯黑 #111 作为唯一底色（用户要求跟随系统）

## Style-evidence selection
| Selected evidence | Source | Confidence | Task role | Why |
| --- | --- | --- | --- | --- |
| 纸张/墨/印章的触感材质系统 | 模子の衣柜 | high | 校样方向的纸面与红笔 | 本工具的动作就是“在字母后插入词”，校对稿是同源材质 |
| 一个精确的颜色事件 | Bonjour! 预告 | high | 红色只标记插入/首字母 | 红色语义固定，不做大面积 |

## Gate 2 — Master
Gate 2 status: released
Gate 2 approval evidence: 2026-10-06 结构化问答「这一版（C-margin 留白）是否确认为定稿？」=「确认定稿」
Master: 实际应用 app/（C-margin），已提交；生成图为书页版式（列阵 1 张 / 单图 N 张 1080×1440）
Self-check（不代替用户批准）: 浅色/深色手机宽度截图；打字机流程、全部候选弹层、Word 式标题默认色→海报墨色、审计与屏蔽器自检通过

---

# 第二轮：石黑白重设计（2026-10-19）

Design schema: v3.1
Gate 1 status: released
Image role status: approved（无附图）
Image role: reference
Image placement: not-placed
Brief status: approved
Brief approval evidence: 2026-10-19 用户：「界面不满意，使用 /victor-design-system 重新设计 —— 深浅色系为石黑白色。搞定它的深浅设计」；结构化问答：范围 =「界面+海报都换」，强调 =「一点朱红」，交付 =「只改项目源码」
Direction status: approved
Direction preview shown: design/archive/round2-stone-seal/directions-stone.html（S1-stele / S2-seal / S3-strata，各含浅、深、海报）
Proposed direction: S2-seal
Approved direction: S2-seal
Direction approval evidence: 2026-10-19 结构化问答「选哪个方向进入高保真？」=「S2-seal 印谱」
Supersedes: 第一轮 C-margin 与临时 Japandi 配色（ROADMAP.md 标准 1）

## Palette / type cause
- 场：石白（石灰岩，中性偏冷）/ 石黑（玄武岩）。用户指定。拒绝：上一版和纸暖灰（偏纸，不是石）
- 朱红：印泥朱 —— 印章是刻在石上、蘸朱泥按出来的；只标“当前格 / 首字母”。拒绝：小红书红（与石材无关）
- 字体：Noto Sans / Noto Sans SC（项目限定）。拒绝：碑刻衬线/书法体（新增字体，超体积）

## Gate 2 — Master（第二轮）
Gate 2 status: released
Gate 2 approval evidence: 2026-10-19 结构化问答「这一版能确认为定稿吗？」→ 用户：「确认定稿，S2 印谱就按这一版。」
Master: app/（S2-seal 已实现）：style.css 石色 token + 石纹 + 方印页签；app.js renderTabs 印 + 边款、drawSeal 盖印（仅有配图的格）、PAGE 石白；theme.js 三档切换（跟随系统 → 与系统相反 → 与系统相同）
Self-check（不代替用户批准）: 360px 浅/深截图；10 字母两行五方、无横向溢出；单图与列阵海报在深色界面下仍为石白且印不压单词；npm test、容器审计 PASS
Open risks: 石纹 SVG 噪点与深色模式在容器内的表现需真机确认；海报未加石纹（Canvas 噪点成本高，ponytail）

## Gate 3 — Delivery（第二轮）
Decision: 交付 = 项目源码（Gate 1 结构化问答「只改项目源码」，不做 Figma）
Editable format: app/ 的 HTML / CSS / Canvas 源码
Interactive HTML: app/index.html（`npm run dev`）
Motion inventory: 无新增动效
Remaining: 容器内真机确认深色、石纹与印章渲染（RELEASE.md 第 3 步）

---

# 第三轮：v00.02.00 编辑界面（T01，2026-10-19）

Design schema: v3.1
Gate 1 status: released
Image role status: approved（无附图）
Image role: reference
Image placement: not-placed
Brief status: approved
Brief approval evidence: 2026-10-19 用户「先做设计确认」；结构化问答「本轮设计范围确认吗？」=「确认」，「列阵视图里能直接编辑吗？」=「只预览，点格跳单图」
Scope: 小红书小工具内「在图上编辑」的编辑面（手机竖屏 360–414px）。状态：①默认编辑（单图）②打关键词 + 候选 + 软键盘 ③校验失败（Lovely 里没有 I）④空格占位 ⑤列阵预览（点格跳单图）⑥点选高亮位置（Initial）⑦保存 / 发布反馈；关键状态补深色
Fixed: S2-seal 视觉定稿（石白 / 玄武黑、字母 = 方印、朱红只标关键字母）；生成图版式 B（整词居中，只高亮关键字母）；D4 = (a) 光标直接在图上；默认标题文案；字体只用 Noto；界面中文
Refusals: 账号 / 社区 / AI / 背单词；新增字体
Deliverable: 三方向对比板 HTML → 选定后改项目源码（不做 Figma，沿用第二轮选择）
Direction status: approved
Direction preview shown: design/archive/round3-folio/edit-surface.html（E1-desk / E2-album / E3-folio，各 7 状态 + 深色）
Proposed direction: E1-desk
Approved direction: E1-desk
Direction approval evidence: 2026-10-19 结构化问答「编辑界面选哪个方向进入实现？」=「E1-desk 案头」
Interpretive copy status: pending —— 示例配文（如「她看人从不绕弯」）为示意文案，不进产品

## Gate 2 — Master（第三轮）
Gate 2 status: pending
Master: 按 E1-desk 在 app/ 实现（PLAN T08 起的界面任务）；实现完成后在预览中逐状态对照 design/archive/round3-folio/edit-surface.html，再请用户确认定稿

### 第三轮修订（2026-10-19，用户看完三方向后）
Approved direction（修订）: **E3-folio 满版**（取代上面的 E1-desk 选择）
Direction approval evidence: 用户：「设计的大路线是 满版 folio，以及：1. 占位标题 “总之这里有N种情况” 应为输入框内的placeholder 2. 插图右下角的方块理应去除 3. 整体风格改为International Typographic 最终设计稿先给我看」
追加决定（结构化问答）：
- 对齐：「横向对比看」——高保真稿同时给左对齐与整词居中两套，由用户再选
- 标题留空导出：「不带标题」——占位字只在编辑时显示，导出图不出现标题行
Style change: S2-seal「印谱」语汇（石纹、方印页签、白文印）退场，改为国际主义（瑞士）风格：网格、无衬线（仍只用 Noto Sans）、平面直角无阴影、粗短黑线、数字页码；保留石白 / 墨黑 / 朱红三色（朱红只标关键字母）
High-fidelity master: design/folio-swiss.html（用户明确指定单一方向，不再做三方向对比）
Gate 2 status: pending

## Gate 2 — Master（第三轮修订）
Gate 2 status: released
Gate 2 approval evidence: 2026-10-19 结构化问答「选哪种对齐来定稿？」→ 用户：「左对齐，按这一版定稿。」
Master: design/folio-swiss.html 第 1 节（导出图，左对齐列）与第 2 节（左对齐全部状态）。第 3 节（整词居中）未选，保留作记录
Locked: 满版 folio；国际主义风格（网格页边距 80 / 内容宽 920、界面左边距对齐卡网格、顶部信息栏页码 + 单词索引、粗短墨条 140×10、无配图超大关键字母、平直候选栏、数字页码）；卡内文字左对齐；标题为占位、留空不导出；配图上无印；石白 / 墨 / 朱三色，朱只标关键字母；字体只用 Noto Sans
Supersedes: 第二轮 S2-seal 印谱语汇（方印页签、石纹、白文印）与 PLAN D6「对齐 = B 整词居中」
Open: 卡顶「L I F E」索引与卡下字母切换栏是否重复（设计稿已标注，用户未要求改动，按稿实现）
Gate 3: 交付 = 改项目源码（不做 Figma）；实现后逐状态对照本稿验收

## T05 补稿（2026-10-19）
Status: pending（等用户逐条审）
Source: 用户「我出推荐稿，你一次审」；母版文件 design/folio-swiss.html 第 4 节，覆盖 PLAN 待定汇总 2 的 ①–⑪
Decided alongside: 发布笔记标题留空时用单词本身（用户「用单词本身」）

## T05 补稿修订（2026-10-20，用户审补稿后）
用户原话：「1. 整体 —— 填表人转移至原单词的位置（右上角），原右上角输入的单词则改为显示至标题输入框内（作为placeholder与默认标题备选） 2. 深色模式下卡面与导出图也必须改深色 3. 左对齐，左对齐，左对齐」
结构化问答：单词入口 =「就在标题框里」；默认标题备选 =「留空时导出单词」；左对齐范围 =「只删居中方案」
落实：
- 卡顶信息栏：左页码，右「填表人」（可编辑，占位「填表人（选填）」，留空不导出）；去掉卡顶单词索引与卡底填表人行
- 标题框 = 单词入口：首次进入在标题框输入单词；之后标题留空时灰色显示单词作占位，导出时标题位用单词（墨色）；自定义标题照常输入。改单词：聚焦标题框时键盘上方「单词 LIFE · 修改单词」（主会话补的入口，待审）
- 深色：卡面与导出图（单图、列阵）随深色切换；取代「生成图固定浅色」
- 删除母版中所有居中方案（原第 1 节居中卡、第 3 节）
Supersedes: D17「标题留空不导出」→ 留空导出单词
T05 status: approved
T05 approval evidence: 2026-10-20 用户：「第六稿定稿，改单词入口按你的方案。」
Locked master（第六稿）: design/folio-swiss.html 全部三节——第 1 节导出图（浅 / 深、单图 / 列阵）、第 2 节编辑状态、第 3 节补稿 ①–⑪（含改单词入口：聚焦标题框时键盘上方「单词 LIFE · 修改单词」→ 单词模式「单词」标签 → 完成）

# 第四轮：v00.02.01 闸口 A（2026-11-04）

Gate status: released（2026-11-04）
Source: `plans/v00.02.01/PLAN.md` 第 0 批；用户「开始。另，关于UI与设计的标准可以参照 W3C的 WCAG 2.2 与 ATAG」
Draft: `design/v00.02.01-gate-a.html`（7 节：入场界面 6 帧、编辑界面配套 2 帧、取景、借物紧凑表、自选色、标准对照表、新草稿键名）
Standards: WCAG 2.2（界面本身）+ ATAG 2.0（创作工具：工具可用 + 帮作者做出看得清的图），每帧注明条款，条款编号核对自 W3C 原文
Fixed（沿用第六稿）: 满版 folio、国际主义、左对齐；石白 / 墨 / 朱；字体只用 Noto；编辑卡、候选栏、完成面板、深浅三档
Will supersede on approval:
- 第三轮 T05 补稿「改单词入口：聚焦标题框时键盘上方『单词 LIFE · 修改单词』→ 单词模式」→ 入场界面（Q3）
- 第三轮 T05「填表人在卡顶右上（可编辑）」→ 只在入场界面改，卡顶只显示（D3、Q4）
- TASK_BRIEF「关键字母（词首或词内，由用户点选）」→ 固定首字母（T17）
- 卡下字母栏的页码 → 去掉（卡顶已有），位置给「改单词 / 填表人」入口
Asks（A1–A6）: 6 个预设词；入场主按钮文案；改单词入口位置；改单词清空已填格先确认；新草稿键名 `backronym-draft-v2`；取景 / 借物 / 自选色改法
Gate approval evidence: 2026-11-04 用户：「A1: 6个从一个高频词库里挑选的词汇 —— 高频词源自描述文学艺术领域的命题的单词（如life、home、love、hate等等） A2: 入场主按钮文案：「开始填充」 A3 、A4、A5以你的定稿执行 A6: 5节改法：移除自选色对比度提醒阻拦 —— 用户选了颜色，就直接让ta用这个颜色，仅toast提醒 —— 这个颜色在导出图上容易看不清；4、3节保持定稿方案」
Locked:
- A1 预设词：从 60 个「文学艺术命题」高频词（ECDICT `frq` 排名 ≤ 3000、不被屏蔽、首字母规则下每个字母可选词 ≥ 67）中，每次打开入场界面随机抽 6 个不重复的词；容量按真机结果再调（Q5）
- A2 入场主按钮「开始填充」
- A3 改单词 / 填表人入口在卡下提示行右侧；字母栏去掉重复页码
- A4 改单词会清空已有内容的格时先确认（ATAG A.4.1.1）
- A5 新草稿键名 `backronym-draft-v2`
- A6 取景（第 3 节）、借物紧凑表（第 4 节）按稿；自选色（第 5 节）改为选色即用、对比度不足时只弹 toast「这个颜色在导出图上容易看不清」，不拦截
Supersedes: 上列「Will supersede on approval」四项自本日起生效

## 词形与中文查词（词库重建 Q14、Q16）

入场页义项行与编辑页候选栏沿用原有位置。查询可能命中尚未载入的词形时显示「词形索引加载中」，已有原形结果继续可用。加载失败显示「词形索引未能加载」；重新输入或再次进入会重试。返回结果按当前输入、语言与已保存的选择重新渲染。中文搜索按词包内已审定的释义和同义写法检索，保留首字母与可见范围规则。

## 图标与封面（宣发 G1，2026-11-22）

用户给的规格：图标 1:1、小于 5 MB，封面 3:4、小于 10 MB。Claude 出三个图标方向（甲「藏」字草字头染色、乙朱色 B 加墨条、丙「Back / ro / nym」三行行首染色）与两张封面（甲一份藏头、乙「藏头」大字），用户原话：「图标走丙方案，封面走第一张」。

Locked:
- 颜色与字体取默认主题 fandom：纸 `#ffffff`、墨 `#2a2a2a`、强调色 `#990000`，西文 Libre Baskerville、中文思源宋体，都用完整原字体出图。
- 图标：名字拆成 Back / ro / nym 三行，行首 B、r、n 染强调色，左对齐；字块整体居中并缩到内切圆以内，圆角方块与圆形裁切都不伤字。
- 封面：上名称、下简介（中文「给单词的每个字母赋予意义」，英文「Give every letter of a word a meaning」），中间一份四行的藏头 B-A-C-K；四个词都是词库里的词条，冠词与释义照词库：der Buchstabe 字母、l’Alphabet 字母表、la Carta 纸、Key 钥匙。
- 定稿页 `design/brand/brand.html`，成品 PNG 在同目录，由 `scripts/render-brand.mjs` 出图。

没核实：平台表单要的实际像素尺寸、图标裁切形状、封面上被标题或按钮盖住的区域。
