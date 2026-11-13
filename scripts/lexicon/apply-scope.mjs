// 已有成品的局部迁移；不重新抽取、不合并 T18、不改 candidates/shard/dsh/codex。
// 默认只生成清单；--write 才写成品，每个成品先在直接父目录留经哈希核验的恢复副本。
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { scopeWords, excludedPos, SCOPE_VERSION } from './scope.mjs';
import { loadReview, keyOf } from './review.mjs';
const root = fileURLToPath(new URL('../../', import.meta.url));
const write = process.argv.includes('--write');
const batch = new Date().toISOString().replace(/[:.]/g, '-') + '-scope-' + crypto.randomUUID().slice(0, 8);
const out = path.join(root, 'review/lexicon', batch);
fs.mkdirSync(out);
const sha = x => crypto.createHash('sha256').update(x).digest('hex');
const report = { version: SCOPE_VERSION, created_at: new Date().toISOString(), applied: write,
  basis: '当前成品按现有词性迁移；另列冻结源表按 T18 修订后词性的下次审核范围。两者不是 T19 合并。', languages: {} };
const changes = ['语言\t拼写\t处理\t原释义\t保留释义'];
const future = ['语言\t源文件\t词\t显示\t原词性\t复审后词性\t排除理由'];
const prepared = [];
for (const lang of ['en', 'fr', 'de', 'es', 'it', 'la']) {
  const file = path.join(root, 'app/assets/lang', lang, 'words.js');
  const original = fs.readFileSync(file, 'utf8');
  const parts = {}, window = { LANGPACK: { put: (code, part, value) => { if (code !== lang) throw Error(code); parts[part] = value; } } };
  vm.runInNewContext(original, { window }, { timeout: 10000 });
  const before = lang === 'en' ? window.WORDS : parts.words;
  const after = scopeWords(before, lang);
  const rows = Object.values(before).flat(), remaining = Object.values(after).flat();
  // SCOPE-R2：英语成品必须由 npm run dict 从 ECDICT 源生成。成品里的释义已跨词性去重（below 的副词义被同译文的介词行压掉），
  // 按成品删功能词义无法保住同形实义。这里只核对：从源生成的成品再迁移应当一条不变。
  if (lang === 'en' && JSON.stringify(after) !== JSON.stringify(before)) throw Error('英语成品里还有功能词义：请用 npm run dict 从源重建，不要迁移成品');
  const kept = new Map(remaining.map(r => [r[0], r]));
  let changedGroups = 0;
  for (const row of rows) {
    const next = kept.get(row[0]);
    if (!next || next[1] !== row[1]) {
      changedGroups++;
      changes.push([lang, row[0], next ? '删除功能词义，保留实义' : '排除独立候选', row[1], next?.[1] || ''].join('\t'));
    }
  }
  const prefix = lang === 'en' ? 'window.WORDS=' : `window.LANGPACK.put("${lang}","words",`;
  const suffix = lang === 'en' ? ';' : ');';
  const replacePart = (text, pre, data, end) => {
    const lines = text.split('\n'), at = lines.findIndex(line => line.startsWith(pre));
    if (at < 0 || !lines[at].endsWith(end)) throw Error('不支持的生成格式：' + file);
    lines[at] = pre + JSON.stringify(data) + end;
    return lines.join('\n');
  };
  let output = replacePart(original, prefix, after, suffix);
  if (parts.forms) output = replacePart(output, `window.LANGPACK.put("${lang}","forms",`,
    Object.fromEntries(Object.entries(parts.forms).filter(([target]) => kept.has(target))), ');');
  report.languages[lang] = { before: rows.length, after: remaining.length,
    removed: rows.length - remaining.length, changed_sense_rows: changedGroups,
    input_sha256: sha(original), output_sha256: sha(output) };
  if (lang !== 'en') {
    const dir = path.join(root, 'review/lexicon', lang), review = loadReview(lang, null);
    let total = 0, excluded = 0;
    for (const name of fs.readdirSync(dir).filter(n => /^shard-\d{3}\.tsv$/.test(n)).sort()) {
      for (const line of fs.readFileSync(path.join(dir, name), 'utf8').trimEnd().split('\n').slice(1)) {
        const [w, d, p] = line.split('\t');
        const pos = review.apply.get(keyOf(w, d, p))?.['词性'] || p;
        total++;
        if (excludedPos(pos)) { excluded++; future.push([lang, name, w, d, p, pos, '不作独立命名候选的功能词'].join('\t')); }
      }
    }
    Object.assign(report.languages[lang], { frozen_source_rows: total, future_excluded: excluded, future_in_scope: total - excluded });
  }
  prepared.push({ file, original, output });
}
if (write) {
  // 所有恢复副本先完成并核验，再开始修改。
  for (const { file, original } of prepared) {
    if (fs.readFileSync(file, 'utf8') !== original) throw Error('文件已被其他任务修改：' + file);
    const dir = path.join(path.dirname(file), '_recovery', batch);
    fs.mkdirSync(dir, { recursive: true });
    const backup = path.join(dir, path.basename(file));
    fs.copyFileSync(file, backup, fs.constants.COPYFILE_EXCL);
    const stat = fs.statSync(file); fs.chmodSync(backup, stat.mode); fs.utimesSync(backup, stat.atime, stat.mtime);
    if (sha(fs.readFileSync(backup)) !== sha(original)) throw Error('备份校验失败');
    fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify({ created_at: new Date().toISOString(), original: file, sha256: sha(original) }, null, 2));
  }
  for (const { file, output } of prepared) fs.writeFileSync(file, output);
}
fs.writeFileSync(path.join(out, 'summary.json'), JSON.stringify(report, null, 2) + '\n');
fs.writeFileSync(path.join(out, 'product-changes.tsv'), changes.join('\n') + '\n');
fs.writeFileSync(path.join(out, 'future-exclusions.tsv'), future.join('\n') + '\n');
console.log(JSON.stringify({ out, ...report }, null, 2));
