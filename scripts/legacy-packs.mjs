// 旧管线词包（scripts/build-dict.mjs 与 scripts/build-lexicon.mjs 的成品）。
// T19 新范围词库接入后，app/assets/lang/<语种>/words.js 改由 scripts/t19/build-packs.mjs 生成，旧成品不再随包。
// 检验旧管线与核心查词函数的测试仍需要这份大数据：按固定提交从 git 取出，放到系统临时目录，不在仓库里留副本。
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
export const LEGACY_COMMIT = '56a5e18'; // 旧词包最后在库的提交
const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const FILES = ['en/words.js', 'en/phrases.js', 'fr/words.js', 'de/words.js', 'es/words.js', 'it/words.js', 'la/words.js'];
// 不带提交历史的副本（如公开快照）取不到固定提交：把这七个文件放在 scripts/fixtures/legacy-packs/ 下即可，齐了就直接用。
const LOCAL = path.join(root, 'scripts', 'fixtures', 'legacy-packs');
export function legacyDir() {
  if (FILES.every(f => fs.existsSync(path.join(LOCAL, f)))) return LOCAL;
  const dir = path.join(os.tmpdir(), 'backronym-legacy-packs-' + LEGACY_COMMIT);
  for (const f of FILES) {
    const out = path.join(dir, f);
    if (fs.existsSync(out) && fs.statSync(out).size > 0) continue;
    fs.mkdirSync(path.dirname(out), {recursive: true});
    const text = execFileSync('git', ['show', `${LEGACY_COMMIT}:app/assets/lang/${f}`], {cwd: root, maxBuffer: 64 * 1024 * 1024});
    const tmp = out + '.' + process.pid;
    fs.writeFileSync(tmp, text); fs.renameSync(tmp, out);
  }
  return dir;
}
