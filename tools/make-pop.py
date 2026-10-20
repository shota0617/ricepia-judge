# 店頭POP（nishio-go/pop.html）のQRコードを作り直す：PYTHONPATH=<segno の場所> python3 tools/make-pop.py
# QRのリンクは docs/marketing.md の「本店のレジ横のQR」（来た人は analytics.js の landing で from=pop-honten として数える）
# segno（QRコードを作るライブラリ。pip install segno）が要る。pop.html の <svg class="qr" …> を新しいQRに入れかえる
import io
import os
import re

import segno

URL = 'https://go.ricepia.jp/?from=pop-honten&spot=kondo-beikoku&utm_source=qr&utm_medium=offline&utm_campaign=honten'
POP = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'nishio-go', 'pop.html')

buf = io.BytesIO()
segno.make(URL, error='m').save(buf, kind='svg', scale=1, border=4, xmldecl=False, svgns=True, nl=False, omitsize=True, dark='#1d1d1d', light='#ffffff')
svg = buf.getvalue().decode().replace('class="segno"', 'class="qr" role="img" aria-label="にしおさんぽGO のQRコード"')
html = open(POP, encoding='utf-8').read()
html = re.sub(r'<svg [^>]*class="qr".*?</svg>', lambda m: svg, html, count=1, flags=re.S)
open(POP, 'w', encoding='utf-8').write(html)
print('wrote', POP)
