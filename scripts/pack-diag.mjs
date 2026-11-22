// 生成只用于诊断的包（v00.03.03 P1 续）：把 app/ 原样复制一份，加进打开耗时的诊断脚本 scripts/diag/diag.js，并在 <head> 里样式表之前引用它。
// 诊断包不是发布包：app/ 与 dist/backronym.zip 都不动；产品的文件一个字节不改，只多一个 assets/diag.js、index.html 多一行引用。
//   node scripts/pack-diag.mjs              → dist/backronym-diag.zip（过体积、文件类型和首页检查）
//   node scripts/pack-diag.mjs --dir <目录>  → 只生成解开的目录（须不存在或为空），给本机回归和本地模拟器用
// 上传诊断包、生成预览码都要用户同意，这个脚本只在本机生成文件。
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {checkZip, zipRelease} from './check-zip.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const APP = path.resolve(here, '../app'), DIAG = path.resolve(here, 'diag/diag.js');
const HOOK = '<link rel="stylesheet" href="./assets/style.css" />'; // 诊断脚本插在样式表前面：排在样式表后面的脚本要等样式表读完才执行，那样量不到样式表，「读到页面开头」也会偏晚
export const DIAG_TAG = '<script src="./assets/diag.js"></script>';

// 把 app/ 复制到 out 并加进诊断脚本。不带点开头的文件、恢复副本和独立许可网页（与正式包的排除项相同）
export function buildDiag(out) {
  if (fs.existsSync(out) && fs.readdirSync(out).length) throw new Error('输出目录须不存在或为空：' + out);
  if (fs.existsSync(path.join(APP, 'assets/diag.js'))) throw new Error('app/assets/diag.js 已存在：诊断脚本不该进 app/');
  fs.mkdirSync(out, {recursive: true});
  fs.cpSync(APP, out, {recursive: true, filter: src => {
    const rel = path.relative(APP, src).split(path.sep);
    return rel[0] !== 'LICENSES' && !rel.some(p => p.startsWith('.') || p === '_recovery');
  }});
  const page = path.join(out, 'index.html'), html = fs.readFileSync(page, 'utf8');
  if (html.split(HOOK).length !== 2) throw new Error('index.html 里要有且只有一处 style.css 的引用，诊断脚本才有地方插');
  fs.writeFileSync(page, html.replace(HOOK, DIAG_TAG + '\n  ' + HOOK));
  fs.copyFileSync(DIAG, path.join(out, 'assets/diag.js'));
  return out;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const i = process.argv.indexOf('--dir');
  if (i > 0) {
    if (!process.argv[i + 1]) throw new Error('--dir 后面要写目录');
    console.log('诊断包目录已生成：' + buildDiag(path.resolve(process.argv[i + 1])));
  } else {
    const dist = path.resolve('dist');
    fs.mkdirSync(dist, {recursive: true});
    const temp = fs.mkdtempSync(path.join(dist, '.diag-'));
    try {
      const archive = path.join(temp, 'backronym-diag.zip');
      zipRelease(buildDiag(path.join(temp, 'app')), archive);
      execFileSync(process.execPath, ['.claude/skills/minitool-zip-builder/scripts/audit_artifact.mjs', archive], {stdio: 'inherit'});
      checkZip(archive);
      fs.renameSync(archive, path.join(dist, 'backronym-diag.zip'));
      console.log('诊断包检查通过，已生成 dist/backronym-diag.zip（' + fs.statSync(path.join(dist, 'backronym-diag.zip')).size + ' B）。它不是发布包；上传、生成预览码前要用户同意');
    } finally {
      fs.rmSync(temp, {recursive: true, force: true});
    }
  }
}
