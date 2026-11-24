# site/backronymsite/：藏头的网站工作都在这里

藏头的公开网站由三样东西组成：项目门户、外链网页版、个人站。网页版的源码是仓库根目录的 `app/`（它同时是小红书小工具的源码，不能搬）；其余和藏头网站有关的都在本目录。

| 路径 | 是什么 |
|---|---|
| `portal/` | 项目门户的正式源码与本地资源 |
| `deploy/cn/` | 国内版服务器的全部配置与发布脚本 |
| `deploy/cn/root/` | 国内版域名根路径放的页面 |
| `design/portal/` | 门户的设计素材：通过的样稿 `buergil-demo.html`、设计说明 `DESIGN.md`、样例卡原图 `cards/`、滚动模拟测试 `test/` |
| `../bydpass.github.io/` | 个人站的克隆，在上一层 `site/` 下。它是**独立的仓库**（远端 `bydpass/bydpass.github.io`），本仓库忽略它；在里面改完要单独提交、推送 |

国际版的部署在仓库根的 `.github/workflows/pages.yml`（GitHub 规定工作流只能放那里）。
