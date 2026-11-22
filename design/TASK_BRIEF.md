# Task brief — 藏头 - Backronym 界面与海报重设计（原名「藏头情况表」）

> **现行核对（2026-11-20）**：这是 2026-10-06 第一轮重设计的任务单，下面的原文不改。逐条对照现状：
>
> | 原文 | 现状 |
> |---|---|
> | 借鉴校对插入符 ‸、纸面、Markdown 式标记 | 已退场。第三轮（10-19）起改为满版 folio × 国际主义，见 `DESIGN_CONTROL.md` |
> | 强调色保持小红书红 | 已退场。现在强调色跟主题走，四个主题各有一个 |
> | 明暗跟随系统自动切换 | 现在是三档：跟随系统 / 浅 / 深；fandom 只有浅色 |
> | 字体只用 Noto Sans / Noto Sans SC | 只对界面文字成立。卡上的字体跟主题走（11-12 起） |
> | 关键字母词首或词内、由用户点选 | 已被 v00.02.01 的固定首字母取代 |
> | v00.02.00、状态流 | 当时的版本；现行状态流以当前 PLAN 为准 |
> | 配文不加引号 | 仍是现行。v00.03.03 的方案稿提议改成开关，待用户确认 |
> | 标题留空时导出用单词本身；单图卡的元素顺序；不编造功能与数据；不新增手写字体 | 仍然有效 |

## Authority and scope
- Controller / user instruction: 「重新设计界面，参考 https://ulysses.app/」（/victor-design-system）
- 用户确认（2026-10-06，结构化问答）：范围 = 界面 + 海报一起改；明暗 = 跟随系统自动切换；借鉴 = 校对插入符 ‸、纸面与安静留白、Markdown 式标记；强调色 = 保持小红书红（校对红笔）
- Deliverable surface: 移动端 H5 小工具（小红书容器 + 外链网页版），状态流（v00.02.00）：编辑卡（标题框 / 单词 / 释义 / 配文 / 图版都在卡上改）、候选栏与义项栏、配图面板与取景面板、完成面板（导出 / 保存 / 发布）、借物页；生成图：列阵视图 1 张 + 单图视图 N 张（1080×1440）
- Editable source: 本项目 HTML/CSS/Canvas 源码即可编辑交付物（未要求 Figma）
- Interaction policy: user approval

## Image role preflight
- Image role status: approved（无新附图；ulysses.app 为网页参考）
- Image role: reference
- Image placement: not-placed

## Reader and truth
- Reader action: 在手机上输入单词 → 给每个字母选词/改释义/配图 → 完成并发布梗图笔记
- Required facts/copy: 标题留空时导出用单词本身（不再有默认标题句）；单图卡顺序 标题-配图-元素-[释义]-配文；关键字母（词首或词内，由用户点选）朱红高亮；配文不加引号；字体只用 Noto Sans / Noto Sans SC；v00.02.00；借物页内容
- Refusals: 不用 Ulysses 的黄色、蝴蝶标志、Interstate 字体；不新增手写字体（字体限定 Noto）；不编造功能/数据
- Unknowns: 小红书容器内深色模式是否随系统（prefers-color-scheme）需真机确认

## Asset decision
- Content-essential: 用户上传配图（运行期）
- Identity assets: 无（不使用 Ulysses 品牌资产）
- Generated assets: 无

## Form questions
- Visual mother relation: 校对插入符 ‸ —— 在字母之后“插入”单词，正是本工具的动作
- Title-removal test: 去掉标题后，字母 + 插入符 + 插入词的关系仍只属于“藏头/首字母拆词”
