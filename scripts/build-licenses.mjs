// 许可全文（T07）：来源是仓库根目录的 LICENSES/*.txt，这里由它生成两样随包的东西：
//   app/LICENSES/*.html  六份独立文件（小红书只收 html / js / css / json / 图片 / 字体，不收 txt，所以包成网页；2026-11-14）
//   app/assets/licenses.js  借物页展开时才读的四份全文
// MIT 与 OFL 的全文（带各版权人的声明）另外直接写在借物页里，由 test-app.mjs 与 LICENSES/ 下的文件对同。
// 用法：node scripts/build-licenses.mjs；加 --check 只比对不写。
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
export const LAZY = ['GPL-3.0', 'CC-BY-SA-4.0', 'CC-BY-SA-3.0', 'CC-BY-4.0'];
export const ALL = [...LAZY, 'MIT', 'OFL-1.1'];
export const source = k => fs.readFileSync(path.join(root, 'LICENSES', k + '.txt'), 'utf8').replace(/\r\n/g, '\n');
const esc = t => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
// 容器 CSP 不许内联脚本，这里也不写内联样式：只有一个 <pre>
export const page = k => '<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1">\n<title>' + k + '</title>\n</head>\n<body>\n<pre>' + esc(source(k)) + '</pre>\n</body>\n</html>\n';
export function render() {
  const o = {};
  for (const k of LAZY) o[k] = source(k);
  return '/* 生成产物，勿手改：node scripts/build-licenses.mjs（来源 LICENSES/*.txt） */\nwindow.LICENSES = ' + JSON.stringify(o).replace(/\u2028|\u2029/g, ' ') + ';\n';
}
export const outputs = () => [['app/assets/licenses.js', render()], ...ALL.map(k => ['app/LICENSES/' + k + '.html', page(k)])];
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const check = process.argv.includes('--check');
  for (const [rel, text] of outputs()) {
    const out = path.join(root, rel);
    if (!check) { fs.mkdirSync(path.dirname(out), {recursive: true}); fs.writeFileSync(out, text); continue; }
    if (!fs.existsSync(out) || fs.readFileSync(out, 'utf8') !== text) { console.error(rel + ' 与 LICENSES/*.txt 不一致，重跑 npm run licenses'); process.exit(1); }
  }
  console.log(check ? '许可全文的生成产物与来源一致' : '写出 app/assets/licenses.js 与 app/LICENSES/ 下六份 html');
}
