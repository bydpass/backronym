"""第三次重建 · 清出名额（用户 11-19 定）：把占了 5,000 名额、却注定进不了词包的词记进 cleared.tsv，rank.py 下次选词时跳过，名额顺延。

只清已有定论的三类（读 review/t19-batches/rebuild-20261119/build.mjs 输出的 pending.tsv）：
- 屏蔽器命中原形或此义释义
- 返工删除
- 已审未收：原因是「逐义审定或来源对应不足」，且这个词在 review/lexicon/<语言>/{codex,dsh}-*.tsv 里有审核记录（审过、没有义项准入，如 Idiot 标「不雅」）
没有审核记录的词不清：它们等义项段补中文、审过之后再定。处理现代四语与英语（拉丁的选词不走 rank.py 的名额）。
用法（仓库根目录）：
  python3 scripts/lexicon3/rank.py && node --max-old-space-size=8192 review/t19-batches/rebuild-20261119/build.mjs <空目录>   # 合并后 build 默认读新候选
  python3 scripts/lexicon3/clear.py <空目录>/pending.tsv      # 有新增就再跑一轮，直到报告「新增 0」
"""
import csv
import glob
import sys
from collections import defaultdict
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
TABLE = HERE / 'cleared.tsv'
LANGS = ('fr', 'de', 'es', 'it', 'en')   # 英语 11-19 起也走 rank.py 名额（定点修正），一并清
DIRECT = ('屏蔽器命中原形或此义释义', '返工删除')
UNREVIEWED = '逐义审定或来源对应不足'


def main(pending):
    reviewed = defaultdict(set)
    for f in glob.glob(str(ROOT / 'review/lexicon/*/codex-*.tsv')) + glob.glob(str(ROOT / 'review/lexicon/*/dsh-*.tsv')):
        lang = Path(f).parent.name
        for r in csv.DictReader(open(f, encoding='utf-8'), delimiter='\t'):
            if r.get('显示'):
                reviewed[lang].add(r['显示'])
    old = list(csv.DictReader(TABLE.open(encoding='utf-8'), delimiter='\t')) if TABLE.exists() else []
    have = {(r['lang'], r['lemma']) for r in old}
    new = []
    for r in csv.DictReader(open(pending, encoding='utf-8'), delimiter='\t'):
        lang, lemma, why = r['lang'], r['lemma'], r['reason'].split('：')[0]
        if lang not in LANGS or not r['rank'] or (lang, lemma) in have:
            continue
        if why in DIRECT:
            reason = r['reason']
        elif why == UNREVIEWED and lemma in reviewed[lang]:
            reason = '已审未收（审核文件里有记录，没有义项准入）'
        else:
            continue
        new.append(dict(lang=lang, lemma=lemma, reason=reason))
        have.add((lang, lemma))
    rows = sorted(old + new, key=lambda r: (r['lang'], r['lemma']))
    with TABLE.open('w', encoding='utf-8', newline='') as f:
        w = csv.DictWriter(f, fieldnames=['lang', 'lemma', 'reason'], delimiter='\t', lineterminator='\n')
        w.writeheader()
        w.writerows(rows)
    print(f'新增 {len(new)}，合计 {len(rows)}', ' '.join(f"{r['lang']}:{r['lemma']}" for r in new[:40]))


if __name__ == '__main__':
    main(sys.argv[1])
