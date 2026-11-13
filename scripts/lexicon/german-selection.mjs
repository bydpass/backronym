// 德语重新普查：保留历史审核边界，新词只由人工补词表放行。
// 不把字幕中的拼写命中率当作语义审核，也不因修复抽取器自动扩大成品。
import fs from 'node:fs';
import path from 'node:path';

const key = (lemma, display, pos) => [lemma, display, pos].join('\u0001');
export function loadGermanSelection(dir) {
  const baselineFile = path.join(dir, 'selection-baseline.tsv');
  const supplementFile = path.join(dir, 'supplement.tsv');
  const read = (file, header) => {
    const lines = fs.readFileSync(file, 'utf8').trimEnd().split('\n');
    if (lines.shift() !== header.join('\t')) throw new Error('德语审核表头错误：' + file);
    return lines.map((line, i) => {
      const row = line.split('\t');
      if (row.length !== header.length || row.some(x => !x.trim())) throw new Error(`德语审核表缺字段：${file}:${i + 2}`);
      return row;
    });
  };
  const baseline = new Set(), scores = new Map(), supplements = new Map();
  for (const [lemma, display, pos, score] of read(baselineFile, ['词', '显示', '词性', '得分'])) {
    const k = key(lemma, display, pos);
    if (baseline.has(k) || !Number.isFinite(Number(score))) throw new Error('德语基线重复或得分无效：' + display);
    baseline.add(k); scores.set(lemma, Number(score));
  }
  for (const [lemma, display, pos, zh, art, source, en] of read(supplementFile, ['词', '显示', '词性', '中文释义', '冠词', '来源', '英文依据'])) {
    const k = key(lemma, display, pos);
    if (supplements.has(k) || baseline.has(k)) throw new Error('补词不能覆盖已有审核条目：' + display);
    if (pos !== 'noun' || lemma !== display.toLowerCase() || !/^[A-ZÄÖÜ][a-zäöüß]+$/.test(display) || display.length > 28 ||
        !['der', 'die', 'das'].includes(art) || !/^[\p{Script=Han}，]+$/u.test(zh) || zh.split('，').length > 4 || zh.split('，').some(s => !s || s.length > 10))
      throw new Error('德语补词格式错误：' + display);
    supplements.set(k, { lemma, display, pos, zh: zh.split('，'), art, source, en });
  }
  return { baseline, scores, supplements, files: [baselineFile, supplementFile],
    includes: (lemma, display, pos) => baseline.has(key(lemma, display, pos)) || supplements.has(key(lemma, display, pos)),
    get: (lemma, display, pos) => supplements.get(key(lemma, display, pos)) };
}
