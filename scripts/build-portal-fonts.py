"""只重建 G8 门户字体。用带 WOFF2 支持的 fontTools 运行。"""

from pathlib import Path
import subprocess
import unicodedata

from fontTools import subset
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont


ROOT = Path(__file__).resolve().parents[1]
PORTAL = ROOT / "site/backronymsite/portal"
SOURCE = ROOT / "scripts/.cache/fonts"
OUTPUT = PORTAL / "fonts"

# 大部分源字体与 scripts/build-fonts.mjs 共用。额外三个源来自 Google Fonts
# 的 ofl/{cinzel,cormorantgaramond,notoserifsc}（提交 06bfe0d62a98）。
# 在打包之前离线重建，发布流程只复制已入库的 WOFF2。
JOBS = (
    ("Cinzel[wght].ttf", "Cinzel-Regular", 400),
    ("Cinzel[wght].ttf", "Cinzel-Medium", 500),
    ("CormorantGaramond[wght].ttf", "CormorantGaramond-Regular", 400),
    ("CormorantGaramond[wght].ttf", "CormorantGaramond-Medium", 500),
    ("CormorantGaramond-Italic[wght].ttf", "CormorantGaramond-Italic", 400),
    ("NotoSerifSC[wght].ttf", "NotoSerifSC-Regular", 400),
    ("NotoSerifSC[wght].ttf", "NotoSerifSC-Medium", 500),
    ("NotoSerifSC[wght].ttf", "NotoSerifSC-Black", 900),
    ("LibreBaskerville[wght].ttf", "ThemeFandom-Regular", 400),
    ("LibreBaskerville[wght].ttf", "ThemeFandom-Bold", 700),
    ("NotoSans-Regular.ttf", "NotoSans-Regular", None),
    ("NotoSans-Bold.ttf", "NotoSans-Bold", None),
    ("NotoSansSC-Regular.otf", "NotoSansSC-Regular", None),
    ("NotoSansSC-Bold.otf", "NotoSansSC-Bold", None),
    ("GowunBatang-Regular.ttf", "GowunBatang-Regular", None),
    ("GowunBatang-Bold.ttf", "GowunBatang-Bold", None),
)


def rename_fandom(font, weight):
    # Libre Baskerville 声明了保留字体名，裁剪版使用与工具主题一致的名称。
    family = "BK Fandom Serif"
    style = "Bold" if weight == 700 else "Regular"
    names = {
        1: family, 2: style, 3: f"{family} {style}", 4: f"{family} {style}",
        6: f"BKFandomSerif-{style}", 16: family, 17: style,
    }
    for record in font["name"].names:
        if record.nameID in names:
            record.string = names[record.nameID]


def main():
    # 与 npm 自检共用取字规则。去掉注释，保留脚本和样式生成的文字。
    text = subprocess.check_output(
        ["node", ROOT / "scripts/portal-source.mjs", PORTAL], encoding="utf-8"
    )
    chars = {ord(char) for char in text if not unicodedata.category(char).startswith("C")}
    chars.update(range(32, 127))  # 构建时写入版本号，发布时可能填备案号
    for source, _, _ in JOBS:
        if not (SOURCE / source).is_file():
            raise SystemExit(f"缺门户字体源文件：{SOURCE / source}")

    OUTPUT.mkdir(exist_ok=True)
    for source, name, weight in JOBS:
        with TTFont(SOURCE / source, recalcTimestamp=False) as font:
            options = subset.Options()
            options.hinting = False
            options.desubroutinize = True
            options.layout_features = ["*"]
            options.name_IDs = ["*"]
            cutter = subset.Subsetter(options=options)
            cutter.populate(unicodes=chars)
            cutter.subset(font)
            if weight is not None:
                instantiateVariableFont(font, {"wght": weight}, inplace=True)
            if name.startswith("ThemeFandom"):
                rename_fandom(font, weight)
            font.flavor = "woff2"
            font.save(OUTPUT / f"{name}.woff2")
            print(name)


if __name__ == "__main__":
    main()
