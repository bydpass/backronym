// 在同一文件系统生成并检验候选包，全部成功后再替换正式包。
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {checkZip, zipRelease} from './check-zip.mjs';

const dist = path.resolve('dist');
fs.mkdirSync(dist, {recursive: true});
const temp = fs.mkdtempSync(path.join(dist, '.pack-'));
try {
  const archive = path.join(temp, 'backronym.zip');
  zipRelease(path.resolve('app'), archive);
  execFileSync(process.execPath, ['.claude/skills/minitool-zip-builder/scripts/audit_artifact.mjs', archive], {stdio: 'inherit'});
  checkZip(archive);
  fs.renameSync(archive, path.join(dist, 'backronym.zip'));
  console.log('发布包检查通过，已生成 dist/backronym.zip');
} finally {
  fs.rmSync(temp, {recursive: true, force: true});
}
