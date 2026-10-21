# にしおさんぽGO：歩く地図の人（nishio-go/art/people.png）の目を、ポケモン（赤・緑）の歩く人の目の大きさにそろえる
# - ポケモンの 16×16 の人は、目が「黒・横1×縦2」。下向きは目が2つ、横向きは1つ、上向きは無し
# - Blender で焼いた絵は目が灰色の1点なので、焼いたあとに描きなおす（people.py の compose のあとに呼ぶ。何度かけても同じ）
# 使い方：python3 tools/blender/people-eyes.py [people.png]
import os
import sys

from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = sys.argv[1] if len(sys.argv) > 1 else os.path.join(HERE, '..', '..', 'nishio-go', 'art', 'people.png')
INK = (26, 26, 26, 255)   # 輪郭と同じ黒
# people.py の ORDER と同じ並び：西尾の人10種類×2コマ（下向き）、主人公の 下・上・横 ×2コマ
FACING = ['down'] * 20 + ['down'] * 2 + ['up'] * 2 + ['right'] * 2


def skin(c):
    return c[3] > 128 and c[0] > 200 and c[1] > 140 and c[0] - c[2] > 30


def dark(c):
    return c[3] > 128 and sum(c[:3]) < 330


def fix(px, f, facing):
    at = lambda x, y: px[f * 16 + x, y] if 0 <= x < 16 and 0 <= y < 16 else (0, 0, 0, 0)
    put = lambda x, y: px.__setitem__((f * 16 + x, y), INK)
    if any(at(x, y) == INK and at(x, y + 1) == INK and any(skin(at(x + dx, y)) and skin(at(x + dx, y + 1)) for dx in (-1, 1))
           for y in range(3, 9) for x in range(1, 15)):
        return 'done'   # もう描きなおしてある
    # 焼いた目：左が肌で、上か下が肌の暗い点（顔の中）
    eye = next(((x, y) for y in range(3, 9) for x in range(1, 15)
                if dark(at(x, y)) and skin(at(x - 1, y)) and (skin(at(x, y - 1)) or skin(at(x, y + 1)))), None)
    if not eye:
        return None
    x, y = eye
    top = y - 1 if skin(at(x, y - 1)) else y   # 前髪の下にくっつける（ポケモンの目の位置）
    put(x, top); put(x, top + 1)
    if facing == 'down':   # もう1つの目は、1マスあけて となりに（顔の外にはみ出さない側）
        for dx in (2, -2):
            if all(skin(at(x + dx, top + i)) for i in (0, 1)):
                put(x + dx, top); put(x + dx, top + 1)
                break
    return (x, top)


def main():
    im = Image.open(SRC).convert('RGBA')
    px = im.load()
    done = [fix(px, f, d) for f, d in enumerate(FACING) if d != 'up']
    im.save(SRC)
    print('eyes', sum(1 for e in done if e), '/', len(done))


if __name__ == '__main__':
    main()
