// Initial T19 candidate allocation. Exact Chinese gloss matching is a search aid, NEVER approval.
// Writes only a new output directory. Author edits and existing shards cannot be overwritten.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import readline from 'node:readline';
import { fileURLToPath } from 'node:url';
import { fingerprint } from '../lexicon/baseline.mjs';
import { loadReview, keyOf, reviewedDisplay } from '../lexicon/review.mjs';
import { POS } from '../lexicon/zh.mjs';
import { searchTerms, glossTerms } from './search.mjs';
import { LANGS, CATEGORIES, id, parseTsv, encode, partition } from './schema.mjs';
const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const CORE = 'plans/v00.03.00/T19_CORE.md';
const CATEGORY = { D: 'daily', C: 'creative', H: 'professional-humanities', N: 'professional-natural', K: 'historical-cultural', L: 'professional-natural' };
const POS_FROM = { n: 'noun', v: 'verb', adj: 'adj', adv: 'adv', num: 'num', int: 'intj', prep: 'prep', conj: 'conj', pron: 'pron', art: 'article', det: 'det', part: 'particle' };
const SPECIAL = ['白色', '黑色', '红色', '金色', '长叶', '狭叶', '大花', '小花', '山地', '水生'];
const read = relative => fs.readFileSync(path.join(ROOT, relative), 'utf8');
const atom = text => text.replace(/（[^）]*）|\([^)]*\)/g, '').trim();
export function conceptsFrom(text) {
  const concepts = [];
  for (const line of text.split('\n')) {
    const match = line.match(/^\| ([DCHNK]\d{2}) \| ([^|]+) \| ([^|]+) \|$/);
    if (!match) continue;
    const labels = match[3].trim().split('、'); assert.equal(labels.length, 10, match[1]);
    labels.forEach((label, i) => concepts.push({ id: match[1] + '-' + String(i + 1).padStart(2, '0'),
      theme: match[1], theme_label: match[2].trim(), label, search: atom(label), category: CATEGORY[match[1][0]], languages: LANGS }));
  }
  assert.equal(concepts.length, 240, 'core theme count changed; review specification');
  assert.ok(text.includes(SPECIAL.join('、')), 'Latin supplement changed; review specification');
  SPECIAL.forEach((label, i) => concepts.push({ id: 'L01-' + String(i + 1).padStart(2, '0'), theme: 'L01', theme_label: '拉丁命名专项',
    label, search: label, category: CATEGORY.L, languages: ['la'] }));
  assert.equal(new Set(concepts.map(c => c.id)).size, 250);
  return concepts;
}
function wordsFrom(text, lang) {
  const start = lang === 'en' ? 'window.WORDS=' : `window.LANGPACK.put("${lang}","words",`;
  const line = text.split('\n').find(line => line.startsWith(start));
  assert.ok(line, 'missing words payload: ' + lang);
  return JSON.parse(line.slice(start.length, lang === 'en' ? -1 : -2));
}
function csv(line) {
  const row = []; let value = '', quote = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') { if (quote && line[i + 1] === '"') { value += '"'; i++; } else quote = !quote; }
    else if (char === ',' && !quote) { row.push(value); value = ''; } else value += char;
  }
  assert.ok(!quote, 'multiline CSV unsupported'); row.push(value); return row;
}
export async function mapCore(output) {
  assert.ok(!fs.existsSync(output), 'output exists; do not overwrite author work');
  const sources = new Map();
  async function source(relative) {
    if (!sources.has(relative)) sources.set(relative, { path: relative, ...await fingerprint(path.join(ROOT, relative)) });
    return sources.get(relative);
  }
  const coreSource = await source(CORE), concepts = conceptsFrom(read(CORE));
  await source('plans/v00.03.00/T19_SELECTION.md');
  for (const file of ['scripts/t19/map-core.mjs', 'scripts/t19/schema.mjs', 'app/assets/lexicon-policy.js', 'scripts/t19/search.mjs', 'scripts/lexicon/review.mjs', 'scripts/lexicon/zh.mjs', 'scripts/lexicon/article.mjs', 'scripts/lexicon/baseline.mjs']) await source(file);
  const conceptByLabel = new Map();
  for (const concept of concepts) {
    concept.search_terms = searchTerms(concept.search);
    for (const term of concept.search_terms) {
      if (!conceptByLabel.has(term)) conceptByLabel.set(term, []);
      conceptByLabel.get(term).push(concept);
    }
  }
  const records = [], mappings = [], lookup = new Map();
  for (const lang of LANGS) {
    const wordPath = `app/assets/lang/${lang}/words.js`, wordSource = await source(wordPath);
    const words = wordsFrom(read(wordPath), lang);
    const legacy = new Map();
    if (lang !== 'en') {
      const reviewDir = `review/lexicon/${lang}`;
      // Freeze all review decisions used to resolve original keys before reading them.
      for (const file of fs.readdirSync(path.join(ROOT, reviewDir)).filter(f => /^(dsh|codex)-\d{3}\.tsv$/.test(f)).sort()) await source(reviewDir + '/' + file);
      const applied = loadReview(lang, null).apply;
      const candidatesPath = reviewDir + '/candidates.tsv', legacySource = await source(candidatesPath);
      parseTsv(read(candidatesPath)).rows.forEach((row, i) => {
        const key = [row['词'], row['显示'], row['词性']], ov = applied.get(keyOf(...key)) || {};
        let display = ov['显示'] || row['显示'];
        if (ov['标记'] != null && row['标记'].includes('字符待审')) display = reviewedDisplay(display) || display;
        const pos = ov['词性'] || row['词性'];
        const k = display + '\u0001' + pos;
        if (!legacy.has(k)) legacy.set(k, []);
        legacy.get(k).push({ path: candidatesPath, sha256: legacySource.sha256, line: i + 2, key,
          field_overrides: ov, kind: 'original-review-key', note: '旧词性/中文审核，非新范围准入；可能覆盖同形多个义项，需核对' });
      });
      for (const name of ['supplement.tsv', 'gender-senses.tsv']) {
        const relative = reviewDir + '/' + name;
        if (!fs.existsSync(path.join(ROOT, relative))) continue;
        const ref = await source(relative);
        parseTsv(read(relative)).rows.forEach((row, i) => {
          const k = row['显示'] + '\u0001noun';
          if (!legacy.has(k)) legacy.set(k, []);
          legacy.get(k).push({ path: relative, sha256: ref.sha256, line: i + 2, key: [row['词'], row['显示'], row['冠词']],
            kind: name === 'supplement.tsv' ? 'manual-supplement' : 'gender-sense-record', record: row });
        });
      }
    }
    const languageRecords = [];
    for (const [letter, rows] of Object.entries(words)) rows.forEach((row, rowIndex) => {
      const groups = row[1].split('|'), articles = String(row[2] || '').split('|'); let noun = 0;
      groups.forEach((group, groupIndex) => {
        const match = group.match(/^([a-z]+)\.(.*)$/); if (!match) return;
        const pos = POS_FROM[match[1]] || match[1];
        const article = pos === 'noun' ? articles[noun++] || '' : '';
        match[2].split('，').forEach((gloss, glossIndex) => {
          const terms = glossTerms(gloss, pos);
          const targets = [...new Set(terms.flatMap(term => conceptByLabel.get(term) || []))].filter(c => c.languages.includes(lang));
          if (!targets.length) return;
          const ordered = [...targets].sort((a, b) => CATEGORIES[b.category].weight - CATEGORIES[a.category].weight || a.id.localeCompare(b.id));
          const primary = ordered[0];
          // Initial IDs depend on source positions within this display, NOT sort/frequency or translation text.
          // Once reviewed, IDs in TSV are authoritative: corrections keep IDs; renames require explicit aliases.
          const entry_id = id('e', [lang, row[0], pos]);
          const sense_id = id('s', [entry_id, groupIndex, glossIndex]);
          const record = { entry_id, sense_id, language: lang, display: row[0], pos, zh: gloss, article, note: row[3] || '',
            category: primary.category, theme: primary.theme, concept_ids: ordered.map(c => c.id),
            legacy_refs: legacy.get(row[0] + '\u0001' + pos) || [],
            evidence: { method: 'Chinese-gloss-search-only', matched_search_terms: terms.filter(term => conceptByLabel.has(term)), sources: [wordSource],
              output_pointer: { letter, row: rowIndex, group: groupIndex, gloss: glossIndex },
              original_row: row, original_group: group, source_records: [],
              limitations: ['中文相同不证明同义、用法或类别适用', '逗号片段为待审线索，不宣称已分清词典义项'] },
            review: { state: 'pending', reviewer: '', evidence: '', reason: '需逐义核对来源、收录范围和概念对应' },
            adverb_relation: { state: pos === 'adv' ? 'unknown' : 'not-applicable', evidence: '' },
            latin_use: { state: lang === 'la' ? 'pending' : 'not-applicable', evidence: '' }, name_payload: null };
          languageRecords.push(record);
          for (const concept of targets) {
            const key = lang + '/' + concept.id;
            if (!lookup.has(key)) lookup.set(key, []); lookup.get(key).push(sense_id);
          }
        });
      });
    });
    const byDisplay = new Map();
    for (const record of languageRecords) {
      if (!byDisplay.has(record.display)) byDisplay.set(record.display, []);
      byDisplay.get(record.display).push(record);
    }
    if (lang === 'en') {
      const relative = 'scripts/.cache/ecdict.csv', ref = await source(relative);
      let line = 0;
      for await (const text of readline.createInterface({ input: fs.createReadStream(path.join(ROOT, relative)), crlfDelay: Infinity })) {
        line++; if (line === 1) continue;
        // Most rows cannot be candidates: inspect the first CSV field before full parsing.
        const rough = text.startsWith('"') ? csv(text)[0] : text.slice(0, text.indexOf(','));
        if (!byDisplay.has(rough)) continue;
        const cells = csv(text);
        for (const record of byDisplay.get(cells[0])) {
          if (!record.evidence.sources.some(s => s.path === relative)) record.evidence.sources.push(ref);
          record.evidence.source_records.push({ path: relative, line, word: cells[0], definition: cells[2], translation: cells[3], pos: cells[4] });
        }
      }
    } else {
      const relative = `scripts/.cache/v003/stage/${lang}.json`, ref = await source(relative);
      const stage = JSON.parse(read(relative));
      const sourceNames = new Set(stage.names || []);
      const lower = new Map();
      for (const [display, entries] of byDisplay) {
        const k = display.toLowerCase(); if (!lower.has(k)) lower.set(k, []); lower.get(k).push(...entries);
        for (const record of entries) for (const ref of record.legacy_refs) {
          if (ref.kind !== 'original-review-key') continue;
          const oldLemma = ref.key[0].toLowerCase();
          if (!lower.has(oldLemma)) lower.set(oldLemma, []); lower.get(oldLemma).push(record);
        }
      }
      stage.lemmas.forEach((row, i) => {
        const matching = new Set([row.w, ...(row.canon || [])].flatMap(spelling => lower.get(spelling.toLowerCase()) || []));
        for (const record of matching) {
          const originalPos = record.legacy_refs.some(ref => ref.kind === 'original-review-key' &&
            ref.key[0].toLowerCase() === row.w.toLowerCase() && ref.key[2] === row.pos);
          if (POS[row.pos] !== POS[record.pos] && !originalPos) continue;
          if (!record.evidence.sources.some(s => s.path === relative)) record.evidence.sources.push(ref);
          record.evidence.source_records.push({ path: relative, pointer: '/lemmas/' + i, record: row,
            note: row.w === record.display ? '同写法/词性来源候选，义项仍需核对' : '大小写或长音写法不同，仅来源线索' });
        }
      });
      for (const record of languageRecords) record.evidence.has_name_homograph = sourceNames.has(record.display.toLowerCase());
    }
    for (const record of languageRecords) {
      if (!record.evidence.source_records.length) record.review.reason += '；当前源证据链未连接，不能由成品反证词义';
      if (!record.legacy_refs.length && lang !== 'en') record.review.reason += '；未匹配旧审核身份，需补身份链';
    }
    records.push(...languageRecords);
    for (const concept of concepts) {
      const applicable = concept.languages.includes(lang), ids = lookup.get(lang + '/' + concept.id) || [];
      mappings.push({ language: lang, concept_id: concept.id, target: concept.label, category: concept.category,
        status: applicable ? '待核义' : '范围不适用', candidate_ids: ids,
        reason: !applicable ? 'L01为用户限定的拉丁命名专项，不是现代五语新增目标' : ids.length ? '已有中文释义或显式搜索词匹配；候选及类别尚未逐义批准' : '现有成品中文释义及已列搜索词未命中；未扫描全部原词典/同义表达，不能判为源缺口',
        scope_source: coreSource.path });
    }
    console.log(lang, languageRecords.length, 'candidate fragments;', mappings.filter(m => m.language === lang && m.candidate_ids.length).length, 'concepts with leads');
  }
  // Recheck every consumed source before any output write, preserving a reviewable input version.
  for (const ref of sources.values()) assert.deepEqual(await fingerprint(path.join(ROOT, ref.path)), { bytes: ref.bytes, sha256: ref.sha256 }, 'input changed: ' + ref.path);
  const shards = partition(records);
  fs.mkdirSync(output); // exclusive; do not merge into old author work
  const write = (relative, content) => {
    const absolute = path.join(output, relative); fs.mkdirSync(path.dirname(absolute), { recursive: true });
    fs.writeFileSync(absolute, content, { flag: 'wx' });
  };
  const writeJson = (relative, value) => write(relative, JSON.stringify(value, null, 2) + '\n');
  writeJson('concepts.json', concepts);
  writeJson('inputs.json', { createdAt: new Date().toISOString(), node: process.version, files: [...sources.values()] });
  const indexes = Object.fromEntries(LANGS.map(lang => [lang, { schema: 1, language: lang, state: 'draft-not-admitted', shards: [] }]));
  for (const shard of shards) {
    write('lexicon/' + shard.path, encode(shard.records));
    const lang = shard.records[0].language, category = shard.records[0].category;
    indexes[lang].shards.push({ path: shard.path.slice(lang.length + 1), category, ...CATEGORIES[category], rows: shard.records.length,
      sha256: (await fingerprint(path.join(output, 'lexicon', shard.path))).sha256,
      sources: [...new Set(shard.records.flatMap(r => r.evidence.sources.map(s => s.path)))].sort() });
  }
  for (const lang of LANGS) {
    writeJson(`lexicon/${lang}/index.json`, indexes[lang]);
    for (const theme of [...new Set(concepts.map(c => c.theme))]) {
      const rows = mappings.filter(m => m.language === lang && m.concept_id.startsWith(theme + '-'));
      const columns = ['language', 'concept_id', 'target', 'category', 'status', 'candidate_ids', 'reason', 'scope_source'];
      write(`mapping/${lang}/${theme}.tsv`, columns.join('\t') + '\n' + rows.map(r => columns.map(c => c === 'candidate_ids' ? JSON.stringify(r[c]) : r[c]).join('\t')).join('\n') + '\n');
    }
  }
  const summary = { concepts: concepts.length, cells: mappings.length, candidate_fragments: records.length, shards: shards.length,
    approved: 0, languages: Object.fromEntries(LANGS.map(lang => [lang, {
      with_leads: mappings.filter(m => m.language === lang && m.candidate_ids.length).length,
      no_exact_gloss_match: mappings.filter(m => m.language === lang && m.status === '待核义' && !m.candidate_ids.length).length,
      not_applicable: mappings.filter(m => m.language === lang && m.status === '范围不适用').length,
      candidate_fragments: records.filter(r => r.language === lang).length,
    }])) };
  writeJson('SUMMARY.json', summary); return summary;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    assert.equal(process.argv.length, 3, 'Usage: map-core.mjs <new-output-directory>');
    console.log(JSON.stringify(await mapCore(path.resolve(process.argv[2])), null, 2));
  } catch (error) { console.error(error.stack); process.exitCode = 1; }
}
