# 本地提交体积检查

用户授权：2026-11-06，拦截大体积文件并检查包体大小。不运行功能测试，不自动暂存、提交或覆盖 dist。

## 规则

- 新增或修改的暂存文件必须小于 5,000,000 字节（5 MB）。这是本仓库的默认单文件保护线。
- 将暂存区的 `app/` 在临时目录按现有 `pack` 的 ZIP 参数压缩；发布包必须严格小于 10,000,000 字节。
- 6 MB 起提示；8 MB 起加强提示，未到 10 MB 不阻止提交。
- 包内符号链接和子模块拒绝打包，避免引用外部内容导致漏算；未合并的索引拒绝检查。
- 十进制 MB 比现有平台审计的 MiB 更严格。本检查不代表功能、平台兼容性或真机验收。
- 只检查 Git 暂存内容，忽略未暂存修改和旧 `dist/backronym.zip`。发布前仍需重新执行 `npm run pack`。

## 使用与恢复

```sh
rtk node scripts/install-size-hook.mjs
rtk node scripts/check-staged-size.mjs
rtk node scripts/test-size-hook.mjs
```

依赖现有 Node.js、Git 和系统 `zip`。安装器在 Git 私有目录生成 `backronym-size-hooks/`，仅设置本仓库的 `core.hooksPath`；已有 pre-commit / pre-merge-commit 先执行，成功后才检查体积，其他已有 hooks 用符号链接保留。全局 hook 文件不修改。重复安装不覆盖已有内容。

旧有效路径记在 `backronym.previousHooksPath`。本次旧路径是 `~/.codex/git-hooks`，来自全局配置。恢复本次安装前行为：

```sh
rtk git config --local --unset core.hooksPath
rtk git config --local --unset backronym.previousHooksPath
```

恢复后私有 hook 目录保留，便于检查；手动再次安装前需先检查该目录，安装器不会覆盖它。如果其他仓库原先有本地路径配置，应按保存的值恢复本地配置，而非直接 unset。

本地 hook 可被 `--no-verify` 跳过，不是服务端强制规则。切换到没有检查脚本的旧分支时，需先恢复旧 hook 路径；不要把缺失脚本视作检查通过。
