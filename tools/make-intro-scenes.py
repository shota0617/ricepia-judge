# にしおさんぽGO：はじめの 画面・あそびかた・おはなしに 出す「西尾の 景色」の ドット絵（80×36）を 図形だけで 描く。
#   python3 tools/make-intro-scenes.py   → nishio-go/art/intro/*.png
# 運営者の声「ディフォルメして出す。ゲームの初めに随所に登場するように」「写真をそのまま使わない」（2026-10-29）：
# 写真は 使わず（写真を ちぢめた・色を へらした 絵も 使わない）、西尾の 名物・景色を 丸・四角・三角だけで ディフォルメして 描く
import os
from PIL import Image, ImageDraw

W, H = 80, 36
OUT = os.path.join(os.path.dirname(__file__), '..', 'nishio-go', 'art', 'intro')


def canvas(top, bottom):   # 空の グラデーション（上→下）
    im = Image.new('RGB', (W, H))
    d = ImageDraw.Draw(im)
    for y in range(H):
        t = y / (H - 1)
        d.line([(0, y), (W, y)], fill=tuple(round(a + (b - a) * t) for a, b in zip(top, bottom)))
    return im, d


def cloud(d, x, y, s=1):
    for dx, dy, r in ((0, 0, 3), (4, -1, 4), (9, 0, 3), (4, 1, 3)):
        d.ellipse([x + dx * s - r * s, y + dy * s - r * s, x + dx * s + r * s, y + dy * s + r * s], fill=(255, 255, 255))


def hills(d, y0, col, peaks):
    for px, h, w in peaks:
        d.polygon([(px - w, y0), (px, y0 - h), (px + w, y0)], fill=col)


def castle(d, cx, base, s=1, wall=(246, 244, 236), roof=(70, 78, 92)):   # 西尾城の やぐら（石垣・白壁・黒い 屋根 3段）
    d.polygon([(cx - 14 * s, base), (cx + 14 * s, base), (cx + 11 * s, base - 5 * s), (cx - 11 * s, base - 5 * s)], fill=(150, 140, 122))   # 石垣
    for i in range(3):
        y = base - 5 * s - i * 6 * s
        ww = (10 - i * 2.5) * s
        d.rectangle([cx - ww, y - 4 * s, cx + ww, y], fill=wall)
        d.polygon([(cx - ww - 3 * s, y - 4 * s), (cx + ww + 3 * s, y - 4 * s), (cx + ww - 1 * s, y - 7 * s), (cx - ww + 1 * s, y - 7 * s)], fill=roof)
    d.rectangle([cx - 1, base - 25 * s, cx + 1, base - 23 * s], fill=(214, 178, 72))   # しゃちほこ（金）


def save(name, im, colors=24):
    os.makedirs(OUT, exist_ok=True)
    im.quantize(colors=colors, dither=Image.Dither.NONE).convert('RGB').save(os.path.join(OUT, name + '.png'), optimize=True)


def s_castle():   # 西尾城と 青空・まわりの 木
    im, d = canvas((120, 190, 240), (200, 232, 250))
    cloud(d, 10, 7); cloud(d, 58, 5)
    for x, r in ((6, 8), (16, 7), (64, 8), (74, 7)):
        d.ellipse([x - r, 30 - r, x + r, 30 + r], fill=(70, 140, 70))
    castle(d, 40, 33)
    d.rectangle([0, 33, W, H], fill=(96, 160, 80))
    return im


def s_island():   # 海と 小さな 島へ のびる 道
    im, d = canvas((110, 185, 235), (190, 228, 248))
    cloud(d, 50, 6)
    d.rectangle([0, 20, W, H], fill=(52, 136, 196))
    for y in range(22, H, 4):
        for x in range((y * 7) % 9, W, 11):
            d.line([(x, y), (x + 3, y)], fill=(130, 196, 230))
    d.ellipse([46, 12, 76, 24], fill=(56, 120, 60)); d.ellipse([52, 9, 68, 20], fill=(76, 146, 70))
    d.polygon([(30, H), (40, H), (54, 20), (52, 20)], fill=(232, 224, 200))   # 島へ のびる 道
    return im


def s_matcha():   # 抹茶と おかし（お盆の 上）
    im, d = canvas((246, 232, 206), (226, 204, 168))
    d.rectangle([0, 26, W, H], fill=(176, 120, 72))
    d.ellipse([16, 8, 50, 32], fill=(40, 46, 60))   # ちゃわん
    d.ellipse([19, 9, 47, 19], fill=(136, 190, 70)); d.ellipse([24, 11, 38, 15], fill=(170, 214, 100))   # 抹茶の あわ
    d.ellipse([56, 20, 74, 30], fill=(250, 250, 246)); d.ellipse([59, 14, 71, 25], fill=(240, 150, 170)); d.ellipse([62, 16, 66, 19], fill=(250, 196, 210))   # おかし
    return im


def s_teafield():   # 茶畑の うね と 山
    im, d = canvas((130, 196, 240), (214, 238, 250))
    hills(d, 18, (110, 150, 120), ((14, 9, 18), (46, 11, 22), (74, 8, 16)))
    d.rectangle([0, 18, W, H], fill=(84, 150, 66))
    for i, y in enumerate(range(19, H, 4)):
        d.ellipse([-4, y, W + 4, y + 4], fill=(60, 124, 52) if i % 2 else (104, 172, 78))
    return im


def s_lantern():   # 大きな ちょうちんの まつり（夜）
    im, d = canvas((20, 24, 60), (60, 40, 70))
    for x, y in ((8, 4), (30, 2), (62, 6), (74, 3)):
        d.point((x, y), fill=(255, 240, 180))
    d.rectangle([0, 30, W, H], fill=(70, 50, 40))
    d.rectangle([6, 3, 74, 6], fill=(200, 50, 40))   # 赤い やぐら
    for x in (12, 68):
        d.rectangle([x - 1, 6, x + 1, 30], fill=(170, 40, 30))
    for cx, w in ((28, 11), (52, 11)):
        d.ellipse([cx - w, 7, cx + w, 31], fill=(244, 196, 90))
        for y in range(10, 30, 4):
            d.line([(cx - w + 2, y), (cx + w - 2, y)], fill=(214, 140, 60))
        d.rectangle([cx - 4, 7, cx + 4, 9], fill=(40, 30, 30)); d.rectangle([cx - 4, 29, cx + 4, 31], fill=(40, 30, 30))
        d.rectangle([cx - 2, 15, cx + 2, 23], fill=(200, 60, 40))   # 絵の かわりの 赤い もよう
    return im


def s_sunflower():   # ひまわり畑
    im, d = canvas((90, 170, 240), (190, 226, 250))
    cloud(d, 14, 6); hills(d, 20, (90, 140, 110), ((60, 9, 24),))
    d.rectangle([0, 20, W, H], fill=(70, 140, 60))
    for x in range(4, W, 9):
        for y, r in ((22, 3), (30, 4)):
            xx = x + (4 if y == 30 else 0)
            d.ellipse([xx - r, y - r, xx + r, y + r], fill=(250, 210, 40)); d.ellipse([xx - 1, y - 1, xx + 1, y + 1], fill=(120, 80, 30))
    return im


def s_paddy():   # 田んぼと 山なみ・白い 雲
    im, d = canvas((100, 180, 240), (200, 232, 250))
    cloud(d, 8, 8); cloud(d, 46, 5, 1)
    hills(d, 19, (70, 120, 90), ((10, 7, 16), (36, 10, 20), (66, 8, 18)))
    d.rectangle([0, 19, W, H], fill=(120, 190, 80))
    for y in range(21, H, 3):
        for x in range((y * 3) % 4, W, 4):
            d.point((x, y), fill=(80, 150, 60))
    d.line([(0, 28), (W, 26)], fill=(200, 180, 130))   # あぜ道
    return im


def s_train():   # 川を わたる 赤い 電車
    im, d = canvas((120, 190, 240), (210, 236, 250))
    hills(d, 22, (90, 140, 100), ((20, 6, 22), (64, 7, 22)))
    d.rectangle([0, 22, W, H], fill=(70, 150, 200))
    d.rectangle([0, 17, W, 19], fill=(110, 110, 120))   # 橋げた
    for x in range(6, W, 14):
        d.rectangle([x, 19, x + 2, 26], fill=(130, 130, 140))
    d.rectangle([10, 10, 66, 17], fill=(200, 40, 40)); d.rectangle([10, 15, 66, 16], fill=(250, 250, 250))
    for x in range(13, 64, 7):
        d.rectangle([x, 11, x + 4, 13], fill=(200, 230, 250))
    return im


def s_beach():   # 白い 砂浜と 青い 海・やしの 木
    im, d = canvas((70, 160, 240), (180, 224, 250))
    cloud(d, 50, 6)
    d.rectangle([0, 18, W, 25], fill=(40, 130, 200))
    d.polygon([(0, 25), (W, 22), (W, H), (0, H)], fill=(240, 226, 186))
    d.line([(12, H), (16, 14)], fill=(130, 90, 50), width=2)
    for dx, dy in ((-6, 2), (6, 2), (-4, -2), (5, -2)):
        d.line([(16, 14), (16 + dx, 14 + dy)], fill=(60, 140, 60), width=2)
    return im


def s_unagi():   # うなぎの かば焼き（ごはんの 上）
    im, d = canvas((244, 226, 196), (220, 196, 160))
    d.rectangle([14, 10, 66, 32], fill=(40, 30, 30)); d.rectangle([16, 12, 64, 30], fill=(190, 40, 40))   # おじゅう
    d.rectangle([18, 14, 62, 28], fill=(250, 250, 246))   # ごはん
    for y in (15, 21):
        d.rounded_rectangle([19, y, 61, y + 5], radius=2, fill=(150, 80, 30))
        for x in range(22, 60, 6):
            d.line([(x, y + 1), (x + 2, y + 4)], fill=(110, 56, 20))
    d.ellipse([56, 24, 62, 28], fill=(110, 170, 70))   # さんしょうの 葉
    return im


def s_hydrangea():   # 雨の 日の あじさい（葉の 茂みに 小花が あつまった 手まり・石の 小道・かたつむり）
    im, d = canvas((188, 206, 222), (226, 232, 238))
    for x, y in ((6, 3), (19, 7), (33, 2), (47, 6), (61, 3), (74, 8), (12, 11), (54, 12)):
        d.line([(x, y), (x - 1, y + 2)], fill=(232, 240, 248))   # こぬか雨
    d.ellipse([-10, 10, 30, 30], fill=(132, 166, 136)); d.ellipse([22, 8, 62, 30], fill=(124, 160, 130)); d.ellipse([54, 11, 92, 31], fill=(132, 166, 136))   # 奥の 木
    d.rectangle([0, 26, W, H], fill=(92, 140, 84))   # 草地
    def bush(x0, x1, y0):
        d.ellipse([x0, y0, x1, H + 8], fill=(56, 112, 64))
        for lx in range(x0 + 3, x1 - 2, 5):   # 葉（ひし形・上が 明るい）
            ly = y0 + 6 + (lx * 3) % 5
            d.polygon([(lx, ly - 2), (lx + 2, ly), (lx, ly + 2), (lx - 2, ly)], fill=(84, 146, 82))
            d.point((lx, ly - 1), fill=(126, 186, 110))
    def ball(cx, cy, r, base, hi, lo):
        d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=lo)
        d.ellipse([cx - r, cy - r, cx + r - 1, cy + r - 2], fill=base)
        for fy in range(cy - r + 2, cy + r, 3):   # 小花（十字）を ならべる
            for fx in range(cx - r + 2 + (fy % 2), cx + r - 1, 3):
                if (fx - cx) ** 2 + (fy - cy) ** 2 <= (r - 1) ** 2:
                    c = hi if fx + fy < cx + cy else base
                    d.point((fx, fy - 1), fill=c); d.point((fx - 1, fy), fill=c); d.point((fx + 1, fy), fill=c); d.point((fx, fy + 1), fill=c)
                    d.point((fx, fy), fill=lo)
        d.point((cx - r // 2, cy - r // 2), fill=(255, 255, 255))   # 雨の しずくの 光
    bush(-6, 34, 18); bush(46, 86, 17)
    for x0, y0, w in ((37, 27, 6), (35, 30, 8), (33, 33, 10)):   # 飛び石の 小道
        d.ellipse([x0, y0, x0 + w, y0 + 2], fill=(204, 198, 184)); d.line([(x0 + 1, y0 + 2), (x0 + w - 1, y0 + 2)], fill=(160, 154, 140))
    BLUE = ((112, 150, 226), (176, 204, 246), (78, 108, 186))
    PURP = ((162, 124, 210), (210, 182, 238), (118, 86, 166))
    PINK = ((232, 144, 182), (248, 196, 218), (190, 100, 140))
    for cx, cy, r, c in ((6, 22, 6, BLUE), (18, 19, 7, PURP), (29, 25, 5, BLUE), (52, 24, 5, PINK), (63, 19, 7, BLUE), (75, 22, 6, PURP)):
        ball(cx, cy, r, *c)
    d.ellipse([22, 29, 26, 33], fill=(214, 176, 112)); d.point((24, 31), fill=(160, 120, 70))   # かたつむりの から
    d.line([(20, 33), (27, 33)], fill=(226, 214, 190)); d.point((20, 32), fill=(226, 214, 190)); d.point((19, 31), fill=(120, 110, 100))   # からだと つの
    return im


def s_autumn():   # 紅葉と 西尾城
    im, d = canvas((110, 180, 240), (220, 236, 250))
    castle(d, 40, 34, 1, roof=(60, 64, 80))
    for x, y, r in ((4, 6, 10), (16, 2, 9), (66, 3, 10), (78, 8, 10), (2, 24, 8), (78, 26, 8)):
        d.ellipse([x - r, y - r, x + r, y + r], fill=(214, 60, 40))
        d.ellipse([x - r + 3, y - r + 2, x + r - 4, y + r - 5], fill=(240, 110, 50))
    return im


SCENES = [('castle', s_castle), ('island', s_island), ('matcha', s_matcha), ('teafield', s_teafield), ('lantern', s_lantern), ('sunflower', s_sunflower),
          ('paddy', s_paddy), ('train', s_train), ('beach', s_beach), ('unagi', s_unagi), ('hydrangea', s_hydrangea), ('autumn', s_autumn)]

if __name__ == '__main__':
    for f in os.listdir(OUT) if os.path.isdir(OUT) else []:
        if f.endswith('.png'):
            os.remove(os.path.join(OUT, f))   # 前の 絵（写真から 作った もの）は のこさない
    for name, fn in SCENES:
        save(name, fn(), 32 if name == 'hydrangea' else 24)   # あじさいは 花の 色が 多いので 32色
    print(len(SCENES), 'scenes →', os.path.normpath(OUT))
