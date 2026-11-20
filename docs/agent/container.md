> 按需读的细则，入口与规则见根目录 [CLAUDE.md](../../CLAUDE.md)。本文件原是 CLAUDE.md 的「小工具容器约束」一节（2026-11-11 拆出）。

# 小工具容器约束

改 `app/` 下任何东西前，按项目内 skill `.claude/skills/minitool-zip-builder/` 的 references 核对：

- JS 基线 Chrome/WebView 61（ES2017，无转译），新 Web API 要做能力检测；CSS 同样以 Chrome 61 为基线。
- 体积（2026-11-06 用户定，取代 10-21 的 6 MiB 建议线）：发布包**严格小于 10,000,000 B**（十进制）；6 MB 起提示、8 MB 起加强提示。提交钩子和正式打包共用 zip 排除项；正式包另过十进制上限和收包规则检查。通用审计的 2 MiB 建议线保留作提醒，实际包体以本次打包为准。字体和词库占大头，加东西仍要留意低端机加载。
- **浏览器跑通不算验收**：保存相册、`writeTempFile`、发布笔记只在容器里存在。交付时要提醒用户在创服平台模拟器 + Android 真机 + iOS 真机验证。上架清单见 `RELEASE.md`。
- **选图只有 `<input type="file">`**：容器没有选图接口。安卓 / 鸿蒙小红书容器里 `accept="image/*"` 打开文件管理器且选不了图（Mate 60 Pro、HarmonyOS 4.2.0、小红书 9.53.3 实测），只有 `image/*,video/*` 或不写 accept 能用，也到不了相册；所以那里改用前者、选到视频再拦（`app-media.js` 的 `pickAccept`）。iOS 的 `image/*` 直达相册，不要动。
