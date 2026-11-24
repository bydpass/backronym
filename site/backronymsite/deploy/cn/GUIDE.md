# 国内服务器维护指南（bydpass.cn）

给不熟悉服务器的人看。所有命令都在 **Mac 的终端** 里、**项目目录**（`~/kits/backronym`）下运行，除非写明「在服务器上」。

拿不准的时候，把要做的事和报错原文交给 Claude 去办，比自己摸索安全。

---

## 一、这台服务器的基本情况

| 项目 | 内容 |
|---|---|
| 类型 | 阿里云轻量应用服务器，华南 1（深圳），2 核 1 GiB，30 GB 硬盘 |
| 系统 | Ubuntu 24.04 |
| 公网 IP | 8.129.106.240 |
| **到期** | **2027-11-24**，到期前记得续费；停机会让备案失效的风险变高 |
| 网站程序 | Nginx |
| 登录方式 | 只能用密钥登录，密码登录已关闭 |
| 防火墙 | 阿里云控制台里只开了 22（登录）、80、443（网站）和 ping |
| 当前状态 | **备案期间关站**：用 IP 或域名都看不到内容 |

服务器上的目录：

```
/srv/bydpass/
  root/                    网站根路径 / 的占位页（备案号挂这里）
  backronym/releases/      每次发布的门户与网页版，留最近 5 个版本
  backronym/current        指向当前版本的「快捷方式」（软链接）
  acme/                    签证书时临时放验证文件
```

本机这边：

| 文件 | 作用 |
|---|---|
| `~/.ssh/id_ed25519` | **私钥**，相当于服务器钥匙。不发给任何人，不传到网上 |
| `~/.ssh/config` | 里面有别名 `bydpass-cn`，所以连服务器不用记 IP |
| `site/backronymsite/deploy/cn/` | 服务器的全部配置都在这里；服务器重装了也能照着恢复 |

---

## 二、连上服务器

```bash
ssh bydpass-cn
```

看到 `root@...:~#` 就是进去了。输入 `exit` 退出。

连不上时：
1. 先在阿里云控制台看服务器是不是「运行中」。
2. 换个网络（关掉代理或 VPN）再试。
3. 还不行，用控制台的「远程连接」或「命令助手」进去，不需要密钥。

---

## 三、日常操作

### 发布新版本

代码改好、提交以后：

```bash
site/backronymsite/deploy/cn/deploy.sh
```

它会用 `npm run pack:site` 生成 `dist/site/`，上传到新版本目录，切换当前版本并保留最近 5 个。网络慢时要几分钟，等它说「当前发布：……」。

发布后，`/backronym/` 打开门户，`/backronym/app/` 打开工具。可先在本机执行 `npm run pack:site`，再执行 `npm start -- --dir dist/site --no-build` 预览对应的 `/` 与 `/app/`。

发布名里带 `-dirty`，说明发布时有没提交的改动。能用，但以后不好对照，最好先提交再发。

### 发现新版本有问题：回滚

```bash
site/backronymsite/deploy/cn/deploy.sh --rollback
```

一秒切回上一个版本。之后修好再正常发布即可。

### 看服务器上有哪些版本

```bash
site/backronymsite/deploy/cn/deploy.sh --list
```

带 `*` 的是当前在用的那个。

### 改了 Nginx 配置

只改 `site/backronymsite/deploy/cn/nginx.conf` 或 `site/backronymsite/deploy/cn/bydpass-site.conf`，然后：

```bash
site/backronymsite/deploy/cn/deploy.sh --nginx
```

它会先检查配置；**检查不通过就不会生效**，网站照旧运行，只要把报错修好再跑一次。不要直接登上服务器改那边的文件，否则下次上传会被覆盖。

---

## 四、备案通过后开站（只做一次）

按顺序来。也可以把备案号发给 Claude，让 Claude 做。

1. **解析域名**：阿里云「云解析 DNS」→ `bydpass.cn` → 添加记录：
   - 记录类型 A，主机记录 `@`，记录值 `8.129.106.240`
   - 记录类型 A，主机记录 `www`，记录值 `8.129.106.240`
2. **打开网站**：删掉 `site/backronymsite/deploy/cn/nginx.conf` 里的 `return 444;` 那一行（上面有注释「备案期间整站不对外」），然后跑 `site/backronymsite/deploy/cn/deploy.sh --nginx`。浏览器打开 `http://bydpass.cn/` 应能看到占位页。
3. **签 HTTPS 证书**（在服务器上，`ssh bydpass-cn` 进去后）：

   ```bash
   curl https://get.acme.sh | sh -s email=你的邮箱
   ```

   ```bash
   ~/.acme.sh/acme.sh --set-default-ca --server letsencrypt
   ```

   ```bash
   ~/.acme.sh/acme.sh --issue -d bydpass.cn -d www.bydpass.cn -w /srv/bydpass/acme
   ```

   ```bash
   mkdir -p /etc/nginx/ssl/bydpass.cn && ~/.acme.sh/acme.sh --install-cert -d bydpass.cn --key-file /etc/nginx/ssl/bydpass.cn/key.pem --fullchain-file /etc/nginx/ssl/bydpass.cn/fullchain.pem --reloadcmd "systemctl reload nginx"
   ```

   之后证书每 60 天左右自动续期，不用管。（第一条命令从境外下载，服务器上可能很慢或失败，失败就交给 Claude 换国内镜像。）
4. **切到 HTTPS**：回到本机，改 `site/backronymsite/deploy/cn/nginx.conf`：
   - 80 那一段：取消 `return 301 https://...` 那行的注释，删掉它下面的 `include` 那行；
   - 文件末尾「HTTPS 之后」那一整段：去掉每行开头的 `# `。

   然后跑 `site/backronymsite/deploy/cn/deploy.sh --nginx`。
5. **挂备案号**：在 `site/backronymsite/deploy/cn/root/index.html` 底部加一行，链接到工信部：

   ```html
   <p class="dim"><a href="https://beian.miit.gov.cn/" target="_blank" rel="noopener">粤ICP备XXXXXXXX号-1</a></p>
   ```

   （号码以备案通知为准），然后 `site/backronymsite/deploy/cn/deploy.sh`。
6. **验收**：手机和电脑分别打开 `https://bydpass.cn/` 和 `https://bydpass.cn/backronym/`。从门户点「快速开始」，确认进入 `/backronym/app/`，再输入一个单词、填一格。
7. **公安备案**：开站后 **30 日内** 到全国互联网安全管理服务平台（beian.mps.gov.cn）办理，拿到号后同样挂在页面底部。

---

## 五、每月花五分钟检查

```bash
ssh bydpass-cn 'df -h / | tail -1; free -m | sed -n 2p; ls /var/run/reboot-required 2>/dev/null && echo 需要重启 || echo 不需要重启; ~/.acme.sh/acme.sh --list 2>/dev/null'
```

看什么：
- **硬盘**：`Use%` 超过 80% 就该清理了（交给 Claude）。
- **内存**：最后一列 available 低于 100 左右要留意。
- **需要重启**：安全更新是自动装的，但有些要重启才生效。出现「需要重启」就跑：

  ```bash
  ssh bydpass-cn reboot
  ```

  等一两分钟网站自己恢复。
- **证书**（开站后）：`Renew` 那一列的日期应该在未来。

另外看一眼阿里云控制台：服务器到期时间、有没有安全告警。

---

## 六、出问题怎么办

**网站打不开**，按顺序排查：
1. 是不是还在备案期间（那时本来就打不开）？
2. 控制台里服务器是否「运行中」？
3. 看 Nginx 的报错：

   ```bash
   ssh bydpass-cn 'systemctl status nginx --no-pager | head -5; tail -20 /var/log/nginx/error.log'
   ```

4. 最近刚发布过？先 `site/backronymsite/deploy/cn/deploy.sh --rollback` 再查。

**改坏了配置**：`--nginx` 检查不过时不会生效，所以一般不会把网站弄挂。真弄乱了，用 git 把 `site/backronymsite/deploy/cn/` 恢复到上一次提交，再跑一次 `--nginx`。

**换了电脑或私钥丢了**：在新电脑上生成新密钥：

```bash
ssh-keygen -t ed25519 -C "bydpass-cn-server"
```

然后在阿里云控制台用「命令助手」把新公钥（`~/.ssh/id_ed25519.pub` 的内容）追加到服务器的 `/root/.ssh/authorized_keys`，再把 `~/.ssh/config` 里的 `bydpass-cn` 那段抄过去。私钥丢了不用慌，控制台始终是后门。

**服务器整个坏了要重装**：重装系统后照第二节连上、装 Nginx（`apt install -y nginx rsync`），然后 `site/backronymsite/deploy/cn/deploy.sh --nginx` 和 `site/backronymsite/deploy/cn/deploy.sh` 各跑一次就恢复了；证书按第四节第 3 步重签。

---

## 七、安全守则

- **不要打开密码登录**，不要把私钥发给任何人，包括「客服」。
- **阿里云账号就是服务器的总钥匙**（命令助手不需要密码就能操作服务器），务必开启两步验证，不要把账号密码给别人。
- **不要在服务器上放阿里云 AccessKey**，也不要往 `site/backronymsite/deploy/cn/` 里写任何密码。
- 控制台防火墙**只留 22、80、443**，不要为了「试试」打开别的端口。
- 服务器里那条名字以 `skp-` 开头的密钥是你在控制台建的，正常。
