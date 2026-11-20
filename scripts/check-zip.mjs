// 打包后按小红书容器的收包规则检查 zip（2026-11-14 真机预览时两次被拒后加）：
//   只收这十二种文件类型；整个包只许一个 html，就是根目录的 index.html。
// 所以小红书包不带 LICENSES/（独立的许可全文网页只进外链网页版）；全文在借物页里展开可读。
// 用法：node scripts/check-zip.mjs dist/backronym.zip
import {execFileSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

export const ZIP_LIMIT = 10_000_000;

export function zipRelease(source, archive) {
  const exclude = ['.*', '*/.*', '_recovery/*', '*/_recovery/*', 'LICENSES/*'];
  execFileSync('zip', ['-q', '-r', '-X', archive, '.', '-x', ...exclude], {cwd: source});
}

const OK = new Set(['jpg', 'css', 'gif', 'svg', 'png', 'js', 'jpeg', 'json', 'html', 'woff2', 'webp', 'woff']);
export function problems(names) {
  const files = names.filter(n => n && !n.endsWith('/')), out = [];
  for (const n of files) { const base = n.split('/').pop(), i = base.lastIndexOf('.'); if (i < 1 || !OK.has(base.slice(i + 1).toLowerCase())) out.push('容器不收的文件类型：' + n); }
  const htmls = files.filter(n => /\.html$/i.test(n));
  if (htmls.length !== 1 || htmls[0] !== 'index.html') out.push('只许根目录一个 index.html，现有：' + (htmls.join('、') || '无'));
  return out;
}
export function checkZip(file) {
  if (fs.statSync(file).size >= ZIP_LIMIT) throw new Error('发布包必须小于 ' + ZIP_LIMIT + ' B');
  const names = execFileSync('unzip', ['-Z1', file], {encoding: 'utf8', maxBuffer: 1 << 24});
  const bad = problems(names.split('\n'));
  if (bad.length) throw new Error(bad.join('\n'));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  checkZip(process.argv[2]);
  console.log('发布包通过体积、文件类型和首页检查');
}
