#!/usr/bin/env bash
# 国内版（bydpass.cn）发布脚本，在本机仓库根目录运行。
#
#   site/backronymsite/deploy/cn/deploy.sh            构建门户和网页版并发布（默认）
#   site/backronymsite/deploy/cn/deploy.sh --nginx    上传 Nginx 配置、建目录，检查通过才重载
#   site/backronymsite/deploy/cn/deploy.sh --rollback 切回上一个发布
#   site/backronymsite/deploy/cn/deploy.sh --list     列出服务器上的发布，标出当前那个
#
# 服务器地址读 ~/.ssh/config 里的别名 bydpass-cn；换机器改那里，或设 BYDPASS_CN_HOST。
# 每次发布放进 releases/<时间>-<提交>/，再把 current 软链原子地切过去；保留最近 5 个。

set -euo pipefail

HOST="${BYDPASS_CN_HOST:-bydpass-cn}"
BASE=/srv/bydpass
APP="$BASE/backronym"
KEEP=5
HERE="$(cd "$(dirname "$0")" && pwd)"
REPO="$(cd "$HERE/../../../.." && pwd)"

remote() { ssh "$HOST" "$@"; }

case "${1:-}" in
  --nginx)
    remote "mkdir -p $BASE/root $BASE/acme $APP/releases"
    scp -q "$HERE/nginx.conf" "$HOST:/etc/nginx/sites-available/bydpass"
    scp -q "$HERE/bydpass-site.conf" "$HOST:/etc/nginx/snippets/bydpass-site.conf"
    remote "ln -sfn /etc/nginx/sites-available/bydpass /etc/nginx/sites-enabled/bydpass \
      && rm -f /etc/nginx/sites-enabled/default \
      && nginx -t && systemctl reload nginx"
    echo "Nginx 配置已更新并重载。"
    ;;

  --rollback)
    remote "cd $APP/releases && cur=\$(basename \"\$(readlink $APP/current)\") \
      && prev=\$(ls -1 | sort | grep -B1 -x \"\$cur\" | head -1) \
      && [ -n \"\$prev\" ] && [ \"\$prev\" != \"\$cur\" ] || { echo '没有更早的发布可回滚'; exit 1; }; \
      ln -sfn releases/\$prev $APP/current.tmp && mv -T $APP/current.tmp $APP/current \
      && echo \"已从 \$cur 回滚到 \$prev\""
    ;;

  --list)
    remote "cur=\$(basename \"\$(readlink $APP/current 2>/dev/null)\"); \
      for d in \$(ls -1 $APP/releases | sort); do [ \"\$d\" = \"\$cur\" ] && echo \"* \$d\" || echo \"  \$d\"; done"
    ;;

  "")
    cd "$REPO"
    npm run pack:site
    NAME="$(date +%Y%m%d-%H%M%S)-$(git rev-parse --short HEAD)"
    if [ -n "$(git status --porcelain)" ]; then NAME="$NAME-dirty"; fi
    echo "发布 $NAME → $HOST"
    # 和当前发布相同的文件用硬链接，不重复占空间。
    rsync -a --delete --link-dest="$APP/current/" \
      --exclude='/.backronym-site-build' --exclude='/app/.backronym-web-build' \
      "dist/site/" "$HOST:$APP/releases/$NAME/"
    rsync -a --delete "$HERE/root/" "$HOST:$BASE/root/"
    remote "ln -sfn releases/$NAME $APP/current.tmp && mv -T $APP/current.tmp $APP/current \
      && cd $APP/releases && ls -1 | sort | head -n -$KEEP | xargs -r rm -rf \
      && echo \"当前发布：\$(readlink $APP/current)\""
    ;;

  *)
    sed -n '2,10p' "$0"; exit 1 ;;
esac
