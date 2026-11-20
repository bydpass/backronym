> 按需读的细则，入口与规则见根目录 [CLAUDE.md](../../CLAUDE.md)。本文件原是 CLAUDE.md 的「分工」一节（2026-11-11 拆出）。

# 分工

**v00.02.01 第 5 批起（11-04 用户定）**：Astra（GPT，经 `HANDOFF.md` 与 PLAN 交接）负责实现与自测，在 PLAN 追加「第 N 批交付（Astra）」；Opus 5.5 主会话负责审核——读 diff、复跑 `npm test` / audit / pack、三份浏览器回归（当前 Astra 环境可用隔离临时端口自测，Claude 独立复跑）、导出哈希与 `check-dom-layout.js`、变异验证，写「第 N 批审核」给「通过 / 退回」。T16 等不固定的任务「到谁谁做，完全看限额和进度」，实现方之外的一方审核。**提交（11-11 用户定，取代原「由用户决定」）**：实现方初次完工自行提交一次，审核方审完改完再提交一次，都不必等用户点头；推送仍需用户明确授权。提交后回填 ROADMAP 文件头。

**返工记录（11-10 用户定）**：返工说明与返工方案写在 `plans/<版本>/REPAIR.md`（当前 `plans/v00.03.01/REPAIR.md`），不写进 PLAN。分工：`AUDIT.MD` 记审核发现的问题，REPAIR 记每个问题的说明、方案、验证、状态（写法见该文件开头），PLAN 只写计划与各批现状，`HANDOFF.md` 只做交接通知。

**代称（11-04 用户指定）**：Claude（含本项目的主会话与子代理）用「她」（she / her）；ChatGPT（含 Astra）与 DeepSeek 用「他」（he / him / his）。文档、交接与提交信息里一律照此。

### 子代理（v00.02.00 起，主会话需要时仍可派）

定义在 `.claude/agents/`，交接只通过**当前版本**的 `plans/<版本>/PLAN.md`（当前为 `plans/v00.03.02/PLAN.md`；任务表 T01…，状态 待做 / 进行中 / 待验收 / 通过 / 退回）：

- `backronym-architect`（Opus 5.5 high）：探讨方案、写 PLAN、搭骨架（`TODO(Txx)` 占位）。
- `backronym-builder`（Sonnet 5.5 high）：按任务 ID 实现 TODO 并自测，改状态为「待验收」。
- `backronym-qa`（Opus 5.5 medium）：按 diff 验收、小范围优化，给「通过 / 退回」。
- 三者都不提交 git；提交由主会话按上面的提交规则做。
