# コイン精米機に 貼る 紹介（mishin-pop.html）の QR と 画面の 絵を 作りなおす
#   MISHIN_OUT=<スクショの 場所> node tools/mishin/shots.js && MISHIN_OUT=<同じ 場所> python3 tools/mishin/make-pop.py
# segno（QR を 作る。pip install segno）と Pillow が 要る。QR の リンクは docs/mishin.md の「精米機に 貼る 紹介」
import io
import os
import re
import sys

import segno
from PIL import Image

URL = 'https://go.ricepia.jp/mishin.html?utm_source=qr&utm_medium=offline&utm_campaign=coin-seimai#coin'
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..')
POP = os.path.join(ROOT, 'mishin-pop.html')
SHOTS = os.environ.get('MISHIN_OUT')
# shots.js の 絵 → 紹介の 絵（上の 吹き出しと 袋。下の「音 あり」は 切る）
PICS = {'07-practice': 'practice', '04-pull': 'pull', '05b-open': 'open'}

buf = io.BytesIO()
segno.make(URL, error='m').save(buf, kind='svg', scale=1, border=4, xmldecl=False, svgns=True, nl=False, omitsize=True, dark='#1d1d1d', light='#ffffff')
svg = buf.getvalue().decode().replace('class="segno"', 'class="qr" role="img" aria-label="ミシン糸 一本どり の れんしゅうを ひらく QRコード"')
html = open(POP, encoding='utf-8').read()
html = re.sub(r'<svg [^>]*class="qr".*?</svg>', lambda m: svg, html, count=1, flags=re.S)
open(POP, 'w', encoding='utf-8').write(html)
print('wrote', POP)

if not SHOTS:
    sys.exit('MISHIN_OUT が ないので 絵は そのまま')
for src, dst in PICS.items():
    im = Image.open(os.path.join(SHOTS, src + '.png')).convert('RGB')
    w, h = im.size
    im = im.crop((0, 0, w, int(w * 1.75))).resize((480, 840), Image.LANCZOS)
    out = os.path.join(ROOT, 'mishin-pop', dst + '.webp')
    im.save(out, 'WEBP', quality=82)
    print('wrote', out, os.path.getsize(out))
