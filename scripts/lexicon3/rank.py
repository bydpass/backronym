"""第三次词库重建 · 第一段：选词与排名（2026-11-19 起）。

取代 review/lexicon-rebuild-20261118/select.py 里现代四语（fr、es、it、de）的排名；英语、拉丁、概念补漏、已审沿用
照旧调用旧脚本的函数。输出列与旧候选表相同（另加 tier、freq_source），所以 review/t19-batches/rebuild-20261119/build.mjs
可以直接读，只要把它的候选目录指过来。规则依据 docs/lexicon-spec.md：

- 词频带原形与词性（D3 方案 ③）：法语用 Lexique 4.10 各写法 10_FreqMot 之和；西意德用字幕次数（FrequencyWords）按
  ParlaMint 4.1 带标注语料里「原形 + UPOS」的占比拆分。实验见 review/lexicon-spec-exp-20261119/REPORT.md 第二至七部分。
- 百科权重 0.5、字幕 1（D1）；文学不进排名（D6）；「短语」词条不再触发整词否决（D2）；每语 5,000 名额（D4）。
- 更正表 fixes/<语言>.tsv（D5 与核对表，用户 11-19 定）：(写法, 原形) → 改记给的词头，原形写 * 表示整个写法，- 表示不收。
- 档位（规格规则三）：tiers.tsv 可把个别词降档；阈值见 TIERS。
- 清出名额（用户 11-19 定）：cleared.tsv 里的词（屏蔽器命中、已审未收、返工删除）不占 5,000 名额，名额顺延给后面的词。
  这张表由 clear.py 从 build.mjs 的待处理清单生成，反复「选词 → build → clear」直到不再新增。

只读：scripts/.cache/v003（词典抽取、字幕、百科）、scripts/.cache/lexique410、scripts/.cache/parlamint；
旧脚本目录里的审定表。写：review/lexicon-rebuild-3/candidates/。
用法（仓库根目录）：python3 scripts/lexicon3/rank.py [fr de ...]
"""
import csv
import importlib.util
import re
import sys
import tarfile
from collections import Counter, defaultdict
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
_spec = importlib.util.spec_from_file_location('old_select', ROOT / 'review/lexicon-rebuild-20261118/select.py')
S = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(S)

OUT = ROOT / 'review/lexicon-rebuild-3/candidates'
LEXIQUE = ROOT / 'scripts/.cache/lexique410/Lexique4.1/Lexique4.1.tsv'
PARLAMINT = ROOT / 'scripts/.cache/parlamint'
PART = {'es': 'ES', 'it': 'IT', 'de': 'AT', 'en': 'GB'}   # 4.1 版没有德国分库，德语用奥地利；英语只用来修同形词头
QUOTA = 5000
WIKI_WEIGHT, SUB_WEIGHT = 0.5, 1
MIN = 20                                       # 写法在 ParlaMint 里少于 20 次时不按占比拆
# 档位（用户 11-19 定）：前 1,500 名常用、1,501–5,000 名次常用、名额外其余；档内仍按词频。
# rank 列写「档位优先、档内词频」的位置（词包第 8 列、运行时字母组内顺序都用它），原始词频名次留在 score_rank
TIERS = ((1500, 'common'), (QUOTA, 'frequent'))
TIER_ORDER = {'common': 0, 'frequent': 1, 'other': 2}
FIELDS = S.FIELDS + ['tier', 'score_rank', 'freq_source']
UPOS = {'NOUN': 'noun', 'VERB': 'verb', 'AUX': 'verb', 'ADJ': 'adj', 'ADV': 'adv', 'PRON': 'pron'}
LEX_POS = {'NOM': 'noun', 'VER': 'verb', 'AUX': 'verb', 'ADJ': 'adj', 'ADV': 'adv',
           'PRO:per': 'pron', 'PRO:ind': 'pron', 'PRO:pos': 'pron'}
WIKI_TAGS = {'VERB': 'verb', 'NOUN': 'noun', 'ADJ': 'adj', 'PRON': 'pron', 'ADV': 'adv', 'PART': 'adv'}
PLACEHOLDER = ('NULL', 'unknown', '_')         # ParlaMint 的占位原形，曾被当成词头 null


def setup(lang, known):
    """可收词头表与标记。与旧 select.modern() 相同，只改一处：「短语」词条不再触发整词否决（D2）。"""
    raw = S.json.loads((S.CACHE / 'stage' / (lang + '.json')).read_text())
    exact, lower, flags = defaultdict(set), defaultdict(set), defaultdict(set)
    loans, bad, names = S.LOANS[lang], S.blocked(lang), set(raw['names'])
    for m in raw['lemmas']:
        w, pos = S.norm(m['w']), m['pos']
        low = w.lower()
        gloss = [g['g'] for g in m['gl']]
        if pos == 'phrase':
            continue
        if (lang, w) in {('de', 'Johannes'), ('de', 'Willi'), ('it', 'sbrigati'), ('it', 'darla'), ('it', 'basato'), ('it', 'red')}:
            flags[low].add('同形词频不可分')
        elif not w.isalpha() or (w[:1].isupper() and not (lang == 'de' and pos == 'noun')):
            flags[low].add('专名或非单词')
        elif bad(w) or low in S.MILD[lang] or (m['gl'] and all('vulgar' in g.get('t', []) for g in m['gl'])):
            flags[low].add('粗口或屏蔽')
        elif low in loans or any(S.re.search(r'\b(?:anglicism|English borrowing)\b', g, S.re.I) for g in gloss):
            flags[low].add('英语借词')
        elif m['gl'] and all(set(g.get('t', ())) & {'obsolete', 'archaic', 'dated'} for g in m['gl']):
            flags[low].add('仅旧语义')
        elif not S.admits(lang, w, pos, known):
            flags[low].add('感叹词同形' if pos == 'intj' else '功能词或副词待核')
        elif not gloss or all(S.re.search(r'^(?:inflection of|compound of|past participle of|present participle of|makes pluperfect to verbs as part of the auxiliary)|^(?:syncopic form of|old (?:Italian )?form of)|\b(?:first|second|third)-person\b|\b(?:singular|plural) of\b', g, S.re.I) for g in gloss):
            flags[low].add('仅词形')
        else:
            exact[w].add(pos)
            lower[low].add(w)
    for w, rows in known.items():
        if w.isalpha() and not bad(w) and w.lower() not in S.MILD[lang] and w.lower() not in loans:
            exact[w].update(r['pos'] for r in rows)
            lower[w.lower()].add(w)
    return raw, exact, lower, flags, names


def load_fixes(lang, exact):
    fix = {}
    path = HERE / 'fixes' / (lang + '.tsv')
    if path.exists():
        for r in csv.DictReader(path.open(encoding='utf-8'), delimiter='\t'):
            tgt = r['改记给']
            if tgt != '-' and tgt not in exact:
                print(f'  [{lang}] 更正表的目标不是可收词头，按不收处理：{r["写法"]} → {tgt}')
                tgt = '-'
            fix[(r['写法'], r.get('议会原形') or r.get('Lexique原形'))] = tgt
    return fix


def make_heads(lower, exact):
    def heads(lemma, pos):
        # 同一小写对应多个词头（Juli / JuLi）时先取与原形同拼写的，再按字母序：集合遍历顺序每次运行都不同
        return sorted((h for h in lower.get(lemma.lower(), ()) if pos in exact[h]), key=lambda h: (h != lemma, h))
    return heads


def french(exact, lower, flags, fix):
    """Lexique 4.10：同一 (原形, 词性) 各写法 10_FreqMot 之和（不用 12_FreqLemme）；oe 对不上时换 œ。"""
    heads, lem, sub = make_heads(lower, exact), Counter(), Counter()
    for r in csv.DictReader(LEXIQUE.open(encoding='utf-8'), delimiter='\t'):
        pos = LEX_POS.get(r['5_Cgram'])
        if not pos:
            continue
        f = float(r['10_FreqMot'] or 0)
        key = (S.norm(r['1_Mot']), S.norm(r['4_Lemme']))
        if key in fix:
            if fix[key] != '-':
                sub[fix[key]] += f
            continue
        lem[(S.norm(r['4_Lemme']), pos)] += f
    for (w, pos), f in lem.items():
        low = w.lower()
        if low not in lower and 'oe' in low:
            low = low.replace('oe', 'œ')
        hs = heads(w if low == w.lower() else low, pos)
        if hs and not flags[low] & {'粗口或屏蔽', '英语借词'}:
            sub[hs[0]] += f
    return sub


def parlamint_forms(lang):
    cache = PARLAMINT / (lang + '-forms.tsv')
    c = Counter()
    if cache.exists():
        for line in cache.open(encoding='utf-8'):
            f, l, u, n = line.rstrip('\n').split('\t')
            c[(f, l, u)] = int(n)
        return c
    with tarfile.open(PARLAMINT / f'ParlaMint-{PART[lang]}.ana.tgz', 'r:gz') as tar:
        for m in tar:
            if not m.isfile() or not m.name.endswith('.conllu'):
                continue
            for raw in tar.extractfile(m):
                line = raw.decode('utf-8', 'replace')
                if not line or line[0] in '#\n':
                    continue
                col = line.split('\t')
                if len(col) < 4 or not col[0].isdigit():   # 跳过多词合并行 1-2
                    continue
                c[(S.norm(col[1]).lower(), S.norm(col[2]), col[3])] += 1
    with cache.open('w', encoding='utf-8') as out:
        for (f, l, u), n in c.items():
            out.write(f'{f}\t{l}\t{u}\t{n}\n')
    return c


def split_subtitles(lang, raw, exact, lower, flags, names, fix):
    """字幕次数按 ParlaMint 占比拆分。各条对接规则的来由见实验报告第三至六部分。"""
    heads = make_heads(lower, exact)
    dist = defaultdict(Counter)
    for (f, l, u), n in parlamint_forms(lang).items():
        dist[f][(l, u)] += n

    def parents_of(low):
        return {w for key in raw['form2pos'].get(low, []) for lemma, _, p in [key.rpartition('|')]
                for w in lower.get(lemma.lower(), ()) if p in exact[w]}

    sub = Counter()
    for line in (S.CACHE / ('freq-' + lang) / (lang + '_50k.txt')).read_text().splitlines():
        t, n = line.rsplit(' ', 1)
        t, n = S.norm(t), int(n)
        low = t.lower()
        if flags[low] & {'粗口或屏蔽', '英语借词'}:
            continue
        if (low, '*') in fix:
            if fix[(low, '*')] != '-':
                sub[fix[(low, '*')]] += n
            continue
        d = dist.get(low)
        # 德语：议会里只以专名出现、又不在专名表的写法当作没有证据，走低频回退
        if lang == 'de' and low not in names and d and all(u == 'PROPN' for _, u in d):
            d = None
        if d and sum(d.values()) >= MIN:
            rest = Counter({k: v for k, v in d.items() if k[1] != 'PROPN'})   # 议员姓、地名：专名那份丢掉重分
            d = rest or d
            tot = sum(d.values())
            for (lemma, u), k in d.items():
                # 更正表原形列可写「原形/UPOS」只改那个词性的份额（复审 R3-11：ei 只把 Ei/NOUN 给 Ei，不带 PRON、NUM）；带词性的行优先
                key = next((x for x in ((low, f'{lemma}/{u}'), (low, lemma)) if x in fix), None)
                if key:
                    if fix[key] != '-':
                        sub[fix[key]] += n * k / tot
                    continue
                pos = UPOS.get(u)
                hs = heads(lemma, pos) if pos and lemma not in PLACEHOLDER else []
                if u in ('PRON', 'DET') and heads(t, 'pron'):          # UD 把 nosotros 的原形标成 yo
                    hs = heads(t, 'pron')
                elif pos and heads(t, pos):                             # UD 把 ragazza 标成 ragazzo
                    hs = heads(t, pos)
                elif u == 'DET' and heads(t, 'adj'):                    # 物主词标成 DET，词库按形容词收
                    hs = heads(t, 'adj')
                # 单字母词头不收；德语感叹词句首大写被标成同拼写名词（Nein、Ja）时那份不给
                if hs and (len(hs[0]) == 1 or (lang == 'de' and hs[0].lower() == low and '感叹词同形' in flags[low])):
                    hs = []
                if hs:
                    sub[hs[0]] += n * k / tot
            continue
        # 低频回退：写法本身是唯一可收词头就给它（esposo、mamá）；否则只是一个原形的变形时给那个原形
        direct = {t} if t in exact else set(lower[low])
        par = parents_of(low) - direct
        if len(direct) == 1 and len(next(iter(direct))) == 1:
            continue
        if len(direct) == 1 and not flags[low] & {'功能词或副词待核', '感叹词同形'}:
            sub[next(iter(direct))] += n
        elif not direct and len(par) == 1:
            sub[par.pop()] += n
    return sub


def encyclopedia(lang, exact, lower):
    wiki = Counter()
    for line in (S.MIX / (lang + '-wiki-tokens.tsv')).read_text().splitlines():
        _, lemma, upos = line.split('\t')
        pos = WIKI_TAGS.get(upos)
        distinct = {w for w in lower.get(lemma.lower(), set()) if pos in exact[w]}
        if lemma in distinct:
            wiki[lemma] += 1
        elif len(distinct) == 1:
            wiki[distinct.pop()] += 1
    return wiki


def modern(lang, known):
    raw, exact, lower, flags, names = setup(lang, known)
    fix = load_fixes(lang, exact)
    sub = french(exact, lower, flags, fix) if lang == 'fr' else split_subtitles(lang, raw, exact, lower, flags, names, fix)
    wiki = encyclopedia(lang, exact, lower)
    # 更正表里写法与原形相同、改记给为 - 的行：整个词头不收（法 sur 在百科里也被标成形容词）
    for w in {f for (f, l), t in fix.items() if t == '-' and f == l} | cleared(lang):
        wiki.pop(w, None)
        sub.pop(w, None)
    wr, sr = S.rank_counts(wiki, 3), S.rank_counts(sub, 1)
    score = lambda w: sum(k / (60 + idx[w]) for k, idx in ((WIKI_WEIGHT, wr), (SUB_WEIGHT, sr)) if w in idx)
    ranked = sorted(set(wr) | set(sr), key=lambda w: (-score(w), w))[:QUOTA]
    source = 'lexique410' if lang == 'fr' else 'parlamint41-' + PART[lang]
    return [dict(lemma=w, pos=','.join(sorted(exact[w])), source='mixed', subtitle_row='',
                 encyclopedia_rank=wr.get(w, ''), literature_rank='', subtitle_rank=sr.get(w, ''),
                 freq_source=source) for w in ranked]


def english(known):
    """英语定点修正（用户 11-19 定）：保留 ECDICT 名次（COCA 写法名次），只给「同时是别的词变形」的词头（ECDICT exchange 有 0:原形）
    乘上该写法在 ParlaMint-GB 里归它自己（非专名）的占比，按 1/名次 当次数重排。found（find 的过去式）、given、used 因此降出名额。
    议会语体会压低日常义（left 只有 7% 是「左」），en-keep.tsv 里逐词审过的词不乘占比、保留原名次。整体换成字幕计数的做法已试过、不采用（规格第 10 节）。"""
    # 用户 11-19 定：这三个词实为副词（ECDICT 把 somewhat 首义标成 n.「某物」），只在新管线追加进英语副词白名单，旧 select.py 不改
    if 'somewhat' not in S.ADVERBS['en'].split():
        S.ADVERBS['en'] += ' somewhat apart regardless'
    skip = cleared('en')
    rows = [r for r in S.english(known, None) if r['lemma'] not in skip]
    # ECDICT 词性标注不全时直接补：regardless 只标 a.（白名单够不着），racist 的形容词义只在 [法] 行（复审 R3-4）
    extra = {'regardless': 'adv', 'racist': 'adj'}
    for r in rows:
        p = extra.get(r['lemma'])
        if p and p not in r['pos'].split(','):
            r['pos'] = ','.join(sorted(r['pos'].split(',') + [p]))
    parent = {}
    with (S.CACHE.parent / 'ecdict.csv').open() as src:
        for row in csv.DictReader(src):
            m = re.search(r'(?:^|/)0:([a-z]+)(?:/|$)', row['exchange'])
            w = S.norm(row['word']).lower()
            if m and m[1] != w:
                parent.setdefault(w, m[1])
    lemmas = {r['lemma'] for r in rows}
    dist = defaultdict(Counter)
    for (f, l, u), n in parlamint_forms('en').items():
        if u != 'PROPN':
            dist[f][l.lower()] += n
    keep = {r['lemma'] for r in csv.DictReader((HERE / 'en-keep.tsv').open(encoding='utf-8'), delimiter='\t')}
    assert keep <= lemmas, keep - lemmas
    def share(w):
        d = dist.get(w.lower())
        if w in keep or parent.get(w.lower()) not in lemmas or not d or sum(d.values()) < MIN:
            return 1
        return d[w.lower()] / sum(d.values())
    for i, r in enumerate(rows, 1):
        r['_score'] = share(r['lemma']) / i
    rows = sorted(rows, key=lambda r: -r['_score'])[:QUOTA]   # sorted 稳定：同分保留 ECDICT 顺序
    for r in rows:
        del r['_score']
        r['freq_source'] = 'ecdict+parlamint41-GB'
    return rows


def cleared(lang):
    path = HERE / 'cleared.tsv'
    if not path.exists():
        return set()
    return {r['lemma'] for r in csv.DictReader(path.open(encoding='utf-8'), delimiter='\t') if r['lang'] == lang}


def fix_reviewed(lang):
    """复审 R3-8：claude-fixes.tsv 逐义审过的词（第二批，162a1c9），旧管线候选表里有、新名额排不进时照 Q4 沿用，
    词性取旧候选表那一行（义项由 build.mjs 照旧从 core/legacy 审核表配上）。不在旧候选表里的修订行（es nasa、it prego）
    本来就没有词可修，不沿用。"""
    with (S.HERE / 'claude-fixes.tsv').open(encoding='utf-8') as src:
        words = {r['display'] for r in csv.DictReader(src, delimiter='\t') if r['lang'] == lang}
    path = S.HERE / 'candidates' / (lang + '.tsv')
    if not path.exists():
        return {}
    with path.open(encoding='utf-8') as src:
        # 合并回归（11-19）：单字母词头新管线一律不排名（防借 i、u 的频次），旧管线审定收过的字母名（德 B、F、I、U，意 u）一并沿用
        return {r['lemma']: r['pos'] for r in csv.DictReader(src, delimiter='\t')
                if r['lemma'] in words or (len(r['lemma']) == 1 and r.get('rank'))}


def tier_overrides():
    path = HERE / 'tiers.tsv'
    if not path.exists():
        return {}
    return {(r['lang'], r['lemma']): r['tier'] for r in csv.DictReader(path.open(encoding='utf-8'), delimiter='\t')}


def run(langs):
    OUT.mkdir(parents=True, exist_ok=True)
    overrides = tier_overrides()
    phrase_rows, name_rows, removed, summary = [], [], [], []
    for lang in langs:
        known, old, phrases, names = S.prior(lang)
        for w in list(known):
            if w.lower() in S.LOANS.get(lang, set()):
                for m in known.pop(w):
                    removed.append(dict(lang=lang, lemma=w, pos=m['pos'], zh=m['zh'], source=m['sense_id'], reason='Q1 英语借义，移出候选'))
        phrase_rows.extend(phrases)
        name_rows.extend(names)
        rows = english(known) if lang == 'en' else S.latin(known) if lang == 'la' else modern(lang, known)
        core = {r['lemma'] for r in rows}
        assert len(core) == len(rows) and (lang == 'la' or len(rows) == QUOTA)
        for i, r in enumerate(rows, 1):
            r['score_rank'] = i
            r['tier'] = next(name for limit, name in TIERS if i <= limit) if i <= QUOTA else 'other'
            r['tier'] = overrides.get((lang, r['lemma']), r['tier'])
            r.setdefault('freq_source', 'ecdict' if lang == 'en' else 'dcc' if lang == 'la' else '')
        rows.sort(key=lambda r: (TIER_ORDER[r['tier']], r['score_rank']))
        for i, r in enumerate(rows, 1):
            r['rank'] = i
        # 以下与旧 select.run() 相同：概念补漏、英语同形待分、已审沿用；这些都不占名额，档位记 other
        for w, records in sorted(known.items()):
            supplemental = [r for r in records if r['concept_ids'] and (lang == 'la' or r['category'] in ('creative', 'professional-humanities', 'historical-cultural'))]
            if w not in core and supplemental and w.lower() not in S.LOANS.get(lang, set()):
                rows.append(dict(lemma=w, pos=','.join(sorted({m['pos'] for m in supplemental})), source='concept',
                                 reason='已审概念 ' + ','.join(sorted({cid for m in supplemental for cid in m['concept_ids']}))))
        if lang == 'en':
            with (S.HERE / 'english-selection.tsv').open() as src:
                for ruling in csv.DictReader(src, delimiter='\t'):
                    if ruling['decision'] == 'unranked' and ruling['lemma'] not in {r['lemma'] for r in rows}:
                        rows.append(dict(lemma=ruling['lemma'], pos=ruling['pos'], source='homograph', reason=ruling['reason']))
        listed = {r['lemma'] for r in rows}
        for w, records in sorted(known.items()):
            if w not in listed:
                rows.append(dict(lemma=w, pos=','.join(sorted({m['pos'] for m in records})),
                                 source='retained', reason='Q4 沿用既有逐义裁决，未占词频名额'))
        listed = {r['lemma'] for r in rows}
        for w, pos in sorted(fix_reviewed(lang).items()):
            if w not in listed:
                rows.append(dict(lemma=w, pos=pos, source='retained',
                                 reason='复审 R3-8：第二批逐义修订（claude-fixes.tsv）审过、旧管线已收，沿用不占名额'))
        for r in rows:
            w = r['lemma']
            r.setdefault('tier', 'other')
            r['category'] = known[w][0]['category'] if known.get(w) else 'pronouns' if r['pos'] == 'pron' else 'daily'
            r['t19'] = 'yes' if w in known else 'no'
            r['legacy'] = 'yes' if any((w, p) in old for p in r['pos'].split(',')) else 'no'
        S.table(OUT / (lang + '.tsv'), rows, FIELDS)
        summary.append((lang, Counter(r['tier'] for r in rows), Counter(r['source'] for r in rows)))
    if set(langs) == set(S.LANGS):   # 只跑部分语言时不覆盖全语种表
        S.table(OUT / 'phrases.tsv', phrase_rows, S.SPECIAL)
        S.table(OUT / 'names.tsv', name_rows, S.SPECIAL)
        S.table(OUT / 'excluded-t19.tsv', removed, S.SPECIAL)
    for lang, tiers, sources in summary:
        print(lang, dict(tiers), dict(sources))


if __name__ == '__main__':
    run([a for a in sys.argv[1:] if a in S.LANGS] or list(S.LANGS))
