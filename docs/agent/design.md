> 按需读的细则，入口与规则见根目录 [CLAUDE.md](../../CLAUDE.md)。本文件原是 CLAUDE.md 的「设计记录」一节（2026-11-11 拆出）。

# 设计记录

**界面改动先在设计系统里敲定（2026-11-08 用户定）**：设计系统 Artifact「藏头 - Backronym」<https://claude.ai/artifact/RozXkcF9R3FjEiBqo2T8HG> 是界面的唯一敲定处。颜色、字号、间距、组件、文案、交互的任何改动，先改它（`tokens.json`、`README.md`、`components/<组件>/` 的说明与预览），用户确认后才改 `app/`。实现后核对：令牌与 `style.css` 变量、`CORE.PALETTE` 同值；它的 `components/bundle.css` 第二段与 `style.css`、`components/bundle.js` 第一段与 `core.js` 逐字一致。`bundle.css` / `bundle.js` 的同步段 2026-11-12 已随四个主题的颜色与字体重新同步（版本 43）；版本 45（同日）按正式打包时的产品核对总则：「已定、未实现」已清空，字体授权补了主题字体，并新增一条待确认提议（借物页写明源代码地址，见 FullPage 说明，产品未改）；版本 47（11-13）回写 T07：借物页加本项目许可段与省流、许可全文六项，`bundle.css` 重新同步；各组件说明同日按产品现状核对过，总则末尾有「已定、未实现」表。组件预览只有 CandidateBar、LanguageField 是新的，其余没有逐张重做。每批界面实现收尾时，回设计系统把对应的「未实现」划掉。更新方法见该 Artifact 类型的说明（只写 `project/` 下文件，索引最后发）。

`design/` 存放界面设计记录。v00.02.00 的方向是「满版 folio × 国际主义风格 × 左对齐」，以第六稿母版 `design/folio-swiss.html` 为准（见 `design/DESIGN_CONTROL.md`），其版式沿用，交互以 `design/v00.02.01-gate-a.html` 和当前 PLAN 为准；本版真机尚未执行。石白 / 墨 / 朱三色与深浅三档切换（`app/assets/theme.js`）沿用，深色档的卡和导出图也是深色。改视觉前读 `design/TASK_BRIEF.md` 里的固定文案与禁用项。**界面与设计标准**：参照 W3C **WCAG 2.2**（界面本身）与 **ATAG 2.0**（藏头是创作工具，还要帮作者做出看得清的图）；设计稿逐帧注明条款（2026-11-04 用户指定）。迭代总标准见 `ROADMAP.md`；**每次 commit 后更新 ROADMAP.md 文件头**（基线提交、本轮状态）和其「进度」里的提交状态。真机测试清单在 `plans/v00.02.01/DEVICE_TEST.md`。
