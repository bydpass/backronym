// 许可全文（T07）：app/LICENSES/*.txt 是随包的独立文件；借物页展开时读的是这里生成的 app/assets/licenses.js。
// MIT 与 OFL 的全文（带各版权人的声明）直接写在借物页里，不进 licenses.js；LICENSES/ 下那两份是同一段文字的副本，由 test-app.mjs 对同。
// 用法：node scripts/build-licenses.mjs；加 --check 只比对不写。
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
export const LAZY = ['GPL-3.0', 'CC-BY-SA-4.0', 'CC-BY-SA-3.0', 'CC-BY-4.0'];
export const ALL = [...LAZY, 'MIT', 'OFL-1.1'];
export function render() {
  const o = {};
  for (const k of LAZY) o[k] = fs.readFileSync(path.join(root, 'app/LICENSES', k + '.txt'), 'utf8').replace(/\r\n/g, '\n');
  return '/* 生成产物，勿手改：node scripts/build-licenses.mjs（来源 app/LICENSES/*.txt） */\nwindow.LICENSES = ' + JSON.stringify(o).replace(/\u2028|\u2029/g, ' ') + ';\n';
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const out = path.join(root, 'app/assets/licenses.js'), text = render();
  if (process.argv.includes('--check')) { if (fs.readFileSync(out, 'utf8') !== text) { console.error('licenses.js 与 app/LICENSES 不一致，重跑 npm run licenses'); process.exit(1); } console.log('licenses.js 与来源一致'); }
  else { fs.writeFileSync(out, text); console.log('写出 app/assets/licenses.js，' + text.length + ' 字符'); }
}
