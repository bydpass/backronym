import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const withoutHtmlComments = html => html.replace(/<!--[\s\S]*?-->/g, " ");
export const withoutCssComments = css => css.replace(
  /"(?:\\[\s\S]|[^"\\])*"|'(?:\\[\s\S]|[^'\\])*'|\/\*[\s\S]*?\*\//g,
  token => token.startsWith("/*") ? " " : token,
);

function withoutJsComments(script) {
  // 先匹配整段引号，保留浮词、SVG 文案以及字符串里的 // 和 /*。
  return script.replace(
    /"(?:\\[\s\S]|[^"\\])*"|'(?:\\[\s\S]|[^'\\])*'|\x60(?:\\[\s\S]|[^\x60\\])*\x60|\/\/[^\r\n]*|\/\*[\s\S]*?\*\//g,
    token => token.startsWith("/") ? " " : token,
  );
}

export function readPortalText(dir) {
  const read = file => readFileSync(path.join(dir, file), "utf8");
  const html = withoutHtmlComments(read("index.html")).replace(
    /(<style\b[^>]*>)([\s\S]*?)(<\/style\s*>)/gi,
    (_, start, css, end) => start + withoutCssComments(css) + end,
  );
  const js = withoutJsComments(read("portal.js"));
  const css = withoutCssComments(read("portal.css"));
  return [html, js, css].join("\n");
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.stdout.write(readPortalText(process.argv[2]));
}
