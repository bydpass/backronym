# design/ 设计记录

界面改动的唯一敲定处是设计系统 Artifact「藏头 - Backronym」，本目录只存设计记录，不在这里定稿新界面。

## 现行文件

| 文件 | 用途 |
|---|---|
| `DESIGN_CONTROL.md` | 各轮设计的关口、用户原话与批准记录（第一至第四轮，按时间追加）。是流水记录，前面几轮的结论有的已被后面取代，以最后一次为准 |
| `folio-swiss.html` | 界面母版，第六稿：满版 folio × 国际主义 × 左对齐。版式取自这里；稿里的石白 / 墨 / 朱配色已退场，现行颜色跟四个主题走 |
| `v00.02.01-gate-a.html` | v00.02.01 闸口 A 定稿：入场界面、取景、借物紧凑表、自选色等；现行交互以它和当前 PLAN 为准 |
| `TASK_BRIEF.md` | 第一轮视觉重设计的任务单：固定文案与禁用项。多数条目已被后来的决定取代，文件头的「现行核对」逐条写了现状 |

规则与现行设计的摘要在 [docs/agent/design.md](../docs/agent/design.md)；项目近况记在根目录的 `HISTORY.md`，不记在本目录。

## 旧稿

第一至第三轮的方向板与 v00.02.01 真机反馈比对图原先放在 `archive/`，已于 2026-11-11 删除（用户定）。要看可从 git 历史取回；`DESIGN_CONTROL.md` 里指向 `design/archive/` 的路径是当时的记录，不再可打开。

预览：`.claude/launch.json` 的 `design`（:5175）以仓库根目录为根，路径形如 `http://localhost:5175/design/folio-swiss.html`。
