"""rank.py 字幕份额拆分的合成测试（复审 R3-20-T）。不读任何缓存：议会词形表与字幕词频都换成下面的小样本。

由 scripts/test-lexicon3-split.mjs 用 python3 -I -B 调起，随 npm test 跑。
场景照 arrivi：字幕 1,000 次；议会里 75% 是 arrivare 的变位，25% 是名词 arrivo 的复数；词典另把复数 arrivi 收成了名词词头。
"""
import sys
import tempfile
from collections import defaultdict
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))   # -I 不把脚本目录放进搜索路径
import rank  # noqa: E402

EXACT = {'arrivare': {'verb'}, 'arrivo': {'noun'}, 'arrivi': {'noun'}}
LOWER = {w: {w} for w in EXACT}
FORMS = {('arrivi', 'arrivare', 'VERB'): 75, ('arrivi', 'arrivo', 'NOUN'): 25}


def split(fix):
    with tempfile.TemporaryDirectory() as tmp:
        d = Path(tmp) / 'freq-it'
        d.mkdir()
        (d / 'it_50k.txt').write_text('arrivi 1000\n', encoding='utf-8')
        rank.S.CACHE, rank.parlamint_forms = Path(tmp), lambda lang: FORMS
        sub = rank.split_subtitles('it', {'form2pos': {}}, EXACT, LOWER, defaultdict(set), set(), fix)
    return {w: round(n) for w, n in sub.items() if n}


def check(name, fix, want):
    got = split(fix)
    assert got == want, f'{name}：期望 {want}，实际 {got}'


check('没有更正行：名词那份落在误收的复数词头上', {}, {'arrivare': 750, 'arrivi': 250})
check('原形/NOUN：只并名词份额，动词那份留给动词', {('arrivi', 'arrivo/NOUN'): 'arrivo'}, {'arrivare': 750, 'arrivo': 250})
check('*：整个写法改记，动词那份也被带走', {('arrivi', '*'): 'arrivo'}, {'arrivo': 1000})
check('不带词性的原形行：只改该原形那一份', {('arrivi', 'arrivo'): 'arrivo'}, {'arrivare': 750, 'arrivo': 250})
check('带词性的行优先于不带词性的行', {('arrivi', 'arrivo/NOUN'): 'arrivo', ('arrivi', 'arrivo'): '-'}, {'arrivare': 750, 'arrivo': 250})
check('改记给 - ：那一份不收', {('arrivi', 'arrivo/NOUN'): '-'}, {'arrivare': 750})
print('rank.py 份额拆分通过：原形/词性行只并该份额、* 整词改记、带词性的行优先')
