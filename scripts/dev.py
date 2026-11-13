# 本地预览服务器：和 `python3 -m http.server -d app` 一样，但让浏览器每次都重新取文件。
# 自带的 http.server 不发 Cache-Control，浏览器会按 Last-Modified 自行缓存，改了代码刷新还是旧版。
import functools
import http.server
import sys


class NoCache(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()


port = int(sys.argv[1]) if len(sys.argv) > 1 else 5173
http.server.test(HandlerClass=functools.partial(NoCache, directory="app"), port=port)
