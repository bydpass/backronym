# CLAUDE.md

本文件是 Claude 与 GPT（Astra）共用的规则入口。根目录的 `CLAUDE.md` 与 `AGENTS.md` 内容完全相同：Claude 读前者，GPT 读后者；改规则时两份一起改，保持一致。**本项目一律用中文回答**（说明、进度、报告、提交信息都用中文）。

本文件只放规则和索引；细则在 `docs/agent/`，按下面「按需读的文档」到用时才打开。

## 项目是什么

小红书小工具「藏头 - Backronym」：用户输入一个单词（最多 14 个字符，字母或数字），在一张和成品长得一样的卡上逐格编辑：每个字母打一个以该字母开头的词，词库给候选，再填中文释义、配文、配图，最后用 Canvas 导出梗图。v00.03.00 起支持英、法、德、西、意、拉丁六门语言。

- 形态：**离线 H5**，无构建链、无框架、无 npm 依赖。`app/` 排除独立许可网页和开发文件后打成 zip 交给小红书容器加载，不联网，所有资源必须在包内。
- 两个产物：小红书版 `dist/backronym.zip` 和外链网页版 `dist/web/`，两版都含屏蔽器。

## 工作规则

### 1. 读文件：按需、按进度

- 开工只读三样：本文件、`HANDOFF.md` 最上面一条、它指向的当前任务文件（现在是 [plans/v01.00.00/PLAN.md](plans/v01.00.00/PLAN.md)，转正的宣发八项，正式版相关的决断都记在这里；v00.04.00 本体见 [plans/v00.04.00/PLAN.md](plans/v00.04.00/PLAN.md)，分支仍是 `dev/v00.04.00`；v00.03.04 的 G-A2 返工已过外部复审，返工版真机待验，见 [plans/v00.03.04/PLAN.md](plans/v00.03.04/PLAN.md)）。
- 「按需读的文档」表里的文件，做到那件事时才打开。
- 其余不主动打开：`HANDOFF.md` 里更早的记录、`review/`、旧版本的 `plans/`、`design/` 里的旧稿。用户点名或当前任务明确指向时才读。

### 2. 不备份，以提交代替（2026-11-11 用户定）

- 不创建 `_recovery`、`.bak`、`.old` 或任何恢复副本，改文件前不备份。
- 改为频繁提交：**实现方初次完工提交一次，审核方审完改完再提交一次**。两边都自行提交，不必等用户点头。推送仍需用户明确授权。
- 提交后在 `HISTORY.md`「最近记录」最上面加一条（基线提交、本轮状态）。
- 两个远端：`legacy`（私有，完整历史，只在版本更新时推一次，平时不推；2026-11-12 用户定）与 `public`（公开，只放不带历史的快照分支 `public`）。带历史的分支不得推到 `public`。
- 命名（2026-11-19 用户定）：开发分支叫 `dev/vxx.xx.xx`（如 `dev/v00.03.02`），公开快照提交打 tag `vxx.xx.xx`，带历史的 `release-v*` tag 只推 `legacy`。分支与 tag 不得同名；`v00.03.00` 及更早的旧分支保持原名。
- 遗留的 `_recovery`：所属批次一验收就直接删除；存在超过 7 日的直接删除。不进废纸篓。
- 被 `.gitignore` 忽略的文件（`scripts/.cache/`、候选表、分片等）没有恢复途径，用户已知并接受。
- 例外（2026-11-20 用户定）：AOCI 工具自己在 `.aoci/` 下生成的 `.bak` 是工具产物，近期创建的豁免；存在超过 7 日的照上一条删除。

### 3. 不产出校验清单与复现证据（2026-11-11 用户定）

- 不再生成文件指纹 / 校验值清单、逐字节复现记录、多份重建副本这类证据文件。
- 汇报、交接、提交信息里也不提这类内容。验收写「跑了什么检查、结果如何」即可。
- 现有代码里靠它工作的功能（配图按内容命名、导出对照脚本、已有测试）保持不动。

### 4. 记录上限：每次开始下一步 / 下一批时裁剪

| 文件 | 上限 | 超出怎么办 |
|---|---|---|
| `HANDOFF.md` | 9 条记录，新的写在最上面 | 删掉最旧的 |
| `HISTORY.md` | 「最近记录」9 条，新的写在最上面 | 最旧的整条搬进 `docs/roadmap-archive.md`，不删 |
| `plans/<版本>/REPAIR.md` | 「已关闭」只留最近 3 轮 | 删掉更早的轮次 |
| `AUDIT.MD` | 同 REPAIR：历史摘要只留最近 3 轮 | 删掉更早的 |

未关闭的条目（待做、已返工待复审）不受上限影响，不删。

### 5. 分工与代称

- 实现方与审核方须是不同的一方；实现方自测通过只能写「待复审」。当前谁实现谁审核，看 `HANDOFF.md` 最上面一条。
- 四份记录各管一件事：`AUDIT.MD` 记审核发现的问题，`REPAIR.md` 记返工说明与状态，`PLAN.md` / `T19.md` 记计划与当前任务，`HANDOFF.md` 只做交接通知。
- 代称：Claude（含主会话与子代理）用「她」；ChatGPT（含 Astra）与 DeepSeek 用「他」。

### 6. 改代码前的硬约束

- **容器基线**：JS 与 CSS 都以 Chrome/WebView 61（ES2017，无转译）为准，新 Web API 要做能力检测。
- **体积**：发布包严格小于 10,000,000 B；6 MB 起提示、8 MB 起加强提示，由本地提交钩子与正式打包检查，以实际发布包大小为准。
- **生成产物勿手改**：`app/assets/lang/*/words.js`、`phrases.js`、`block.js`（西文五语）、`app/assets/licenses.js` 与 `app/LICENSES/*.html`（许可全文，来源是仓库根目录 `LICENSES/*.txt`；小红书不收 `.txt`）、字体子集。改规则去对应的 `scripts/` 生成脚本。
- **界面改动先在设计系统里敲定**，用户确认后才改 `app/`（见 `docs/agent/design.md`）。
- **浏览器跑通不算验收**：保存相册、发布笔记只在容器里存在，交付时提醒用户做模拟器和真机验证。
- 代码里的 `ponytail:` 注释标的是有意简化及其上限，改动前先读。

### 7. 暂缓事项

- `review/` 已于 2026-11-12 清理（用户定）：中间批次只留报告，自检读的编译包、当前词库源（device-20261117）与上游交付 63、概念清单与审定表保留。各类文件谁在用见 [docs/file-map.html](docs/file-map.html)；被删的内容在 git 历史里。
- `core.js` 未用导出、`style.css` 未用变量，正式版发布后再清。

### 8. 每次工作都关注 AOCI 索引（2026-11-19 用户定）

- 每次工作都要顾到 AOCI 索引，检索与更新两头都算：开工先靠它建立或恢复对仓库的认知，找对象、查关系时先检索索引；改了受管理的对象，收尾时更新对应条目。
- 具体怎么调用、什么情况可以不调，按下文「AOCI 仓库认知」。

### 9. 进度写 HISTORY.md，README 只做介绍与入门（2026-11-20 用户定）

- 项目进度写入 `HISTORY.md`：每次提交后的近况、版本状态、包体这类随开发变化的内容，新的写在最上面。`ROADMAP.md` 只留版本路线、各版本要点与验收标准。
- `README.md` 只放项目介绍与入门，以人工修订为主、代理辅助。代理不主动往里写进度、状态或实测数字；发现 README 有错，报给用户，不自行改写。
- `README.md` 进公开快照：只链快照里有的文件，不链 `plans/`、`review/`、`HISTORY.md`。`HISTORY.md` 是内部记录，不进公开快照。
- 空目录不留：发现就删（2026-11-20 用户定）；不进仓库的缓存目录内部不管。

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
| 当前版本计划与任务 | 转正（宣发八项、门户与部署方案）[plans/v01.00.00/PLAN.md](plans/v01.00.00/PLAN.md)；v00.04.00 本体 [plans/v00.04.00/PLAN.md](plans/v00.04.00/PLAN.md)；上一版未收尾的事（G-A2 返工版真机待验）在 [plans/v00.03.04/PLAN.md](plans/v00.03.04/PLAN.md) |
| 返工说明与状态 | [plans/v00.04.00/REPAIR.md](plans/v00.04.00/REPAIR.md)（更早的在各版本自己的 `plans/<版本>/REPAIR.md`） |
| 审核发现的未解决问题 | [AUDIT.MD](AUDIT.MD) |
| 词库第三次重建：数据结构、必需字段、选词规则（草案） | [docs/lexicon-spec.md](docs/lexicon-spec.md) |
| 词库审核文件的格式与流程 | [review/lexicon/README.md](review/lexicon/README.md) |
| 草稿 18h 到期的设计依据 | [docs/draft-expiry-assessment.md](docs/draft-expiry-assessment.md) |
| 体积 hook 怎么装、怎么判 | [docs/size-hook.md](docs/size-hook.md) |
| 版本路线与发布标准 | [ROADMAP.md](ROADMAP.md) |
| 项目进度（每次提交后的近况） | [HISTORY.md](HISTORY.md) |

<!-- aoci:begin -->
## AOCI 仓库认知

AOCI 为本仓库维护一个稳定、可版本化、可增量更新的仓库级认知层，供模型跨任务复用对系统的理解。

`aoci.txt` 是面向模型的结构化认知索引。它以每个受管理文件、数据库表或其他受管理对象一条独立 Entry 的方式，用符号标签与 F/R/A/S 语义表达对象的核心职责、重要关系、对外契约，以及理解或修改系统时必须知道的非显然约束和设计决策。

Header、目录段和全部 Entry 共同组成完整仓库索引，可以覆盖前端、后端、配置、数据库结构及其他受管理内容。受管理内容发生变化时，通常只需维护受影响的认知条目，不需要重新生成整个索引。

AOCI 提供系统架构、对象职责、重要关系、对外契约和关键约束的高密度视图。

### 工作原理

AOCI 采用“模型生成、模型读取”的认知闭环。

Header、Entry 和 Curation 语义的创作只按当前机器签发的 Plan 与实时 Guide 执行；由 Host 模型基于当前绑定证据独立完成。

Entry 的语义必须来自模型对真实证据的理解。不得仅依据路径、文件名、扩展名、AST、符号列表、依赖扫描、正则、固定模板或规则引擎推导、预填、拼接或改写索引语义。

对 Fresh Bootstrap，只按当前机器签发的 Plan 和实时 Guide 执行。当它们要求创作时，Host 模型创作 Root、Meta、Tag 和 F/R/A/S，提供 authoring-run 声明，并把它绑定到 Plan、Evidence 与完整 Candidate。不得要求 AOCI 填写 `origin=host_model`、制造 Receipt 或把程序生成的 Framework 当作语义。本文件不自行重建 Onboarding 流程。内部批次不是用户决策；只有遇到既有批准边界或真实的安全、漂移、CAS、Recovery 条件才停止。

### 最小使用入口

- `aoci_rules`：取得当前AOCI版本的会话运行合同。
- `aoci_overview`：建立或恢复本仓库的完整认知。
- `aoci_maintain`：受管理对象达到最终稳定状态后检查认知是否需要维护。
- `aoci_update_entry`：提交与当前证据和源码摘要绑定的完整语义更新批次。
- `aoci_report`：仅当当前布局和工具状态支持时，在证据不足、无法可靠生成语义时登记待办，不猜写。

其他MCP工具、CLI命令、参数和专项流程，以当前工具说明、Guide和 `--help` 返回内容为准，不在本文件中重复完整手册。

本区块只规定仓库接入、认知使用和收尾原则。`aoci_rules` 承载当前会话合同，Guide实时输出承载当前Plan的执行顺序与停点，工具Schema、Spec和Validator承载机器结构与判据；Prompt、Description、README和静态文档不能覆盖这些机器事实。

### 建立、生成和恢复认知

1. 每个新的 Agent Run 开始时，应先判断：

   - 本仓库是否已经存在可用的完整AOCI索引；
   - 当前上下文中是否已有与本仓库根、当前索引版本和当前AOCI服务相匹配，并且模型仍可可靠使用的完整仓库认知。

2. 仓库已经存在可用的完整索引，但当前Run没有可靠完整认知时，先调用 `aoci_rules`，再调用 `aoci_overview`。

   完整认知仍可靠时直接复用。局部不确定本身不要求机械重读系统全貌。可靠认知建立后，默认以它作为仓库级系统上下文，只读取当前任务直接需要的源码、测试、配置与契约，只有某个缺失的具体事实可能改变回答或验证结论时才扩大证据范围；AOCI不能替代修改对象与验证行为所需的直接源码证据。

   本Run从已知Host上下文压缩恢复时（包括宿主注入的压缩摘要），必须把此前模型认知视为不可靠。压缩handoff不得保留或摘要正式Whole-Index，也不得保留或摘要任何Overview Header、Entry、Chunk、Challenge或Attestation正文；只能保留安全续接所需的receipt身份、未完成write或Recovery状态，以及立即重载指令。复制进handoff的Whole-Index语义或receipt不能证明恢复后模型的当前认知可靠。若当前上下文已无法可靠保留运行合同，先调用 `aoci_rules`。继续业务任务前，使用 `refresh_reasons=["context_compaction"]` 和新的 `refresh_event_id` 调用普通完整Whole-Index `aoci_overview`（不设置 `check_only` 或设为false）；不得使用 `check_only` 或认知probe。原样跟随每个 `next_cursor` 直到 `completed=true`，确认交付，并且只基于新交付正文提交一次Attestation。完成这次新的完整传输后，即使Attestation为partial或fail也消费该generation，并按既有合同继续source-bound任务，不再自动调用第二次Overview。若该请求返回 `delivery_mode=capacity_stop`，说明Whole-Index装不进本Host的上下文：不得重试或调小 `chunk_tokens`；该停止消费本generation，任务按source-bound继续，且不作无保留的完整系统认知声明。

   AOCI可以针对 `context_compaction`、项目 `cognition_refresh_threshold` 下的机器 `semantic_threshold` 或主要 `phase_transition` 提供checkpoint与认知状态事实。只需要这些紧凑事实时使用 `check_only=true`；这些事实只向Agent提供建议，不替模型决定是否需要系统全貌。

   Agent显式调用普通 `aoci_overview`（未设置 `check_only` 或为false）时，只要能形成一致的CognitionSet，AOCI必须完整交付请求scope。不得因为已有receipt、阈值未达到或没有待处理刷新原因而抑制正文；唯一例外是待处理压缩刷新的上述容量停止。正式认知Dirty或Stale时仍交付正文，但必须标记不可靠。存在未决恢复或无法形成一致snapshot时失败关闭，不返回混合正文。

   普通Overview返回 `continuation_required=true` 时，必须原样提交 `next_cursor` 并自动继续到 `completed=true`。不得询问用户、开始业务任务或给出阶段性系统结论。每块单独一次工具调用；不得在一个脚本里连取多块或合并其输出。缺块、重复、乱序、cursor失败、Index变化或`chunk_tokens`变化时停止本次认知链。Attestation完成前不得用Memory、源码、Spec、`aoci.txt`、历史会话、scope、search或Entry读取修补或补充Whole-Index认知。Challenge ordinal是正式Entry序列中的1-based位置；Header内容、注释、空行、Section/Overview/Chunk Marker、Receipt与Metadata均不计数，Chunk Receipt ordinal使用同一序列。Attestation必须原样回绑本次Challenge发布的当前`index_sha256`、`entry_sequence_sha256`与`entry_count`；旧Index、旧Entry序列、旧数量或旧Attestation均无效。完整链结束后只正式提交一次既有模型认知Attestation；同一响应只允许一次不改变语义答案的JSON Schema或字段格式修正。对象、Tag或F不匹配即失败且认知吸收不确定，不得语义重试或旁路补答。首次认知失败时还不得执行Root/Meta、Migration、全局布局或其他未重新绑定的系统级决策。上下文压缩刷新若传输完整、认知身份不变、治理对齐且没有Recovery或第三方冲突，即使Attestation为partial或fail也消耗该refresh generation，并继续原任务，不再自动重读Overview。`system_mastery_percent`只自评系统框架——架构、职责、强关系、稳定外部契约以及高熵安全和维护约束——不表示完整实现或运行实况知识；机器索引覆盖率必须分开。默认只向用户输出由本次真实覆盖率、Challenge、块数、Token和掌握度生成的规定成功或失败一句话。Host截断某一块时，用同一cursor重取一次并核对 `chunk_sha256`，服务端返回完全相同的字节。仍被截断才停止，提示用户把 `overview_delivery.chunk_tokens` 设置为更小的合法值后重新开始，不得自动修改。

   加法认知等级必须与严格证明字段分开解释。`delivery_verified`表示已加载Index且Host交付已确认，但完整认知验证仍未完成；应表达为“已加载且交付已验证”，不得描述为“没有认知”或“没有理解系统”。`cognition_verified`要求Attestation通过（Challenge至少80%的ordinal完全正确且对象身份至多失手一处），`cognition_governed`还要求治理对齐。通用完整读取失败句只用于真实交付故障。

   当Overview响应包含可选`cognition-state/v2`投影时，必须分别解释各维度。其Level止于`model_cognition_usable`；`strict_attestation_verified`、`governance_aligned`与`current_system_cognition_reliable`都是独立状态，绝不参与该Level。ordinal、对象身份、Tag或核心F不匹配可以导致严格Attestation失败，而模型认知仍然可用；不得仅凭这种不匹配就宣称模型没有理解系统。只有`current_system_cognition_reliable=true`允许无保留地声称当前完整系统认知可靠。投影缺失时继续使用上述Legacy解释。

   普通的只读审计、分析、检查、不修改代码或不提交、不push，不自动等于严格零写入，也不改变上述认知有效性判断。Codex Memory和历史Skill只能辅助恢复经验、用户偏好与调查方向，不能替代与当前仓库根、索引摘要、AOCI服务身份和认知范围匹配的当前认知收据；项目AGENTS和当前AOCI身份在AOCI状态上优先于历史Memory。

   只有用户明确禁止Ledger、元数据、`.aoci`运行资产及任何文件写入时，才按严格零写入处理。若必要的认知建立与该边界冲突，必须报告冲突并请求用户裁决或建议使用隔离副本，不得静默以Memory替代当前仓库认知。

3. 仓库没有可用的完整索引，或当前只有最小骨架、Header不完整、Entries未完成、必要Curation尚未裁决时，如果需要建立正式完整AOCI索引，先取得 `aoci_rules`，然后进入当前AOCI Guide。由Guide依据仓库真实状态决定下一阶段并完成必要安全步骤。

   `aoci_maintain` 不替代索引建立流程。

   不在本文件中自行重建或硬编码完整索引生成状态机。

4. 在长程任务中，模型负责保留当前认知收据并正确使用刷新门禁：

   - Host报告上下文压缩或模型已知系统全貌丢失时，执行上述强制 `context_compaction` 重载规则；AOCI不能自行推断Host事件；
   - 进入真正的主要阶段时声明 `phase_transition`，不得把函数、测试运行或小步骤当作阶段；
   - 在有用的稳定检查点通过 `check_only=true` 取得机器语义计数；
   - 除已知压缩的强制重载外，由Agent判断当前任务是否需要再次显式获取指定scope或完整Overview；
   - 在维护和对齐完成前，保留AOCI报告的Dirty或Stale可靠性状态。

### 任务收尾与认知维护

5. 纯只读问答、分析、版本核验，或没有产生受AOCI管理对象变化的任务，不需要调用维护工具。当前AOCI版本是任意`aoci_overview` check_only或`aoci_maintain`响应里的`cognition_receipt.mcp_service_version`；二进制路径是项目`.mcp.json`里的`command`，CLI不必在PATH上。

6. 发生受AOCI管理对象变化时，待其达到本次任务的最终稳定状态后，只调用一次 `aoci_maintain`。不要在每次中间修改后逐文件维护。

7. 若维护结果返回真实语义候选，Host 模型必须基于每个候选绑定的对象和必要证据，独立创作完整标签与F/R/A/S更新。通过 `aoci_update_entry` 一次提交当前机器签发批次的完整候选集合，同时原样保留每项 `source_sha256`、`candidate_id` 与对应domain批次身份。`max_entries`只限制单次请求和原子事务，不限制logical plan、Whole-Index或Managed Scope。`remaining`非零时，在当前批次成功Apply后重新调用Maintain并从新preimage继续；绝不能为满足transport上限缩减Index覆盖或自行截取返回批次。

   没有足够证据且当前布局支持 `aoci_report` 时，使用它而不猜测、套用模板或为消除待办而生成缺乏证据的认知。

8. 必须遵守工具返回的结构化状态和安全边界：

   - `repair_required`：只修复明确命中的候选，再重新提交当前机器签发的完整批次；
   - `stopped`：结束当前写入尝试并检查 `failed_step`、错误、正式写入证据与Recovery。auto模式下，已证明零写入则记录closure并重新Plan；完整Intent和可证明postimage则Resume；策略要求Rollback且preimage可证明则精确恢复后重新Plan。只有证据不足、第三方正式字节冲突、需要审批或外部动作，或命中其他真实安全边界时，才停止整个用户任务；
   - 冲突、审批、人工裁决、权限和安全信号不得忽略；
   - 已经对齐后不得重复维护或重复写入；`refresh_ready_for_overview` 是checkpoint事实，由Agent决定是否为下一阶段请求普通完整Overview。

   维护完成后如果又修改了任何受管理对象，之前的维护结果失效，应在新的最终稳定状态重新完成收尾。

9. 用户只限制业务文件范围，但没有明确禁止仓库托管资产时，AOCI托管资产可以在收尾阶段为保持认知一致而更新，并应在审计和提交中与业务文件区分。

   用户明确禁止修改 `aoci.txt`、`.aoci`、元数据或任何额外文件时，以用户限制为准，不得写入，并如实报告剩余不一致。

### 专项流程

初始化、完整索引生成、Header生成、Entries生成、数据库结构索引、Curation、人工评审和故障恢复，只按当前AOCI Guide或工具在对应阶段返回的指令、命令和安全停点执行。

不预加载、不猜测，也不自行重建这些专项流程。平台调用方式、请求格式、批次上限、审批规则、索引格式细节和恢复步骤由对应Guide、工具说明、模型Prompt和CLI帮助按需提供。
<!-- aoci:end -->
