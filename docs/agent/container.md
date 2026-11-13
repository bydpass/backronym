> 按需读的细则，入口与规则见根目录 [CLAUDE.md](../../CLAUDE.md)。本文件原是 CLAUDE.md 的「小工具容器约束」一节（2026-11-11 拆出）。

# 小工具容器约束

改 `app/` 下任何东西前，按项目内 skill `.claude/skills/minitool-zip-builder/` 的 references 核对：

- JS 基线 Chrome/WebView 61（ES2017，无转译），新 Web API 要做能力检测；CSS 同样以 Chrome 61 为基线。
- 体积（2026-11-06 用户定，取代 10-21 的 6 MiB 建议线）：发布包**严格小于 10,000,000 B**（十进制）；6 MB 起提示、8 MB 起加强提示。由本地提交 hook 检查暂存内容（`docs/size-hook.md`）。`npm run audit` 是 skill 脚本的 MiB 阈值（> 10 MiB 报错、> 2 MiB 警告，属预期），比 hook 宽，以 hook 为准；平台建议仍 ≤ 2MB。当前工作区打包 6,374,744 B（11-11 实测，T19 词库重整进行中，已过 6 MB 提示线；以 `npm run pack` 输出为准），字体和词库占大头，加东西仍要留意低端机加载。
- **浏览器跑通不算验收**：保存相册、`writeTempFile`、发布笔记只在容器里存在。交付时要提醒用户在创服平台模拟器 + Android 真机 + iOS 真机验证。上架清单见 `RELEASE.md`。
