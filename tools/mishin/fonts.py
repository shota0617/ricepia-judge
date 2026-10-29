# mishin.html の Google Fonts を、ゲームで 使う 字だけに しぼる（text= の 指定）。字を 書き足したら 回す
#   python3 tools/mishin/fonts.py            # mishin.html を 書きかえる
#   python3 tools/mishin/fonts.py --check    # もれが あれば 1 で おわる（check.js からも 見る）
# しぼらないと 49 ファイル・約 620KB（＋CSS 117KB）。しぼると 4 ファイル・約 230KB（23 周目の 版で 測った）
# 筆の 字（Yuji Syuku）は 袋の 銘柄（BRANDS）と 店の 名前「らいすぴあ」だけ。ほかは 丸ゴシック（本文）と Dela Gothic One（見出し）
import re, sys, json, urllib.parse
P = 'mishin.html'
s = open(P, encoding='utf-8').read()
A, B = '<!-- fonts:start -->', '<!-- fonts:end -->'

def wanted(src):
    body = re.sub(r'data:image/[a-z]+;base64,[A-Za-z0-9+/=]+', '', src)
    if A in body: body = body[:body.index(A)] + body[body.index(B):]
    main = ''.join(sorted(set(c for c in body if ord(c) >= 0x20)))
    brands = json.loads(re.search(r'const BRANDS = (\[[^\]]*\]);', src).group(1).replace("'", '"'))
    brush = ''.join(sorted(set(''.join(brands) + 'らいすぴあ')))  # 銘柄と、のれん・店の はんこの「らいすぴあ」
    return main, brush

def block(main, brush):
    q = lambda t: urllib.parse.quote(t, safe='')
    urls = ['https://fonts.googleapis.com/css2?family=Dela+Gothic+One&family=Zen+Maru+Gothic:wght@500;700&display=swap&text=' + q(main),
            'https://fonts.googleapis.com/css2?family=Yuji+Syuku&display=swap&text=' + q(brush)]
    # script で 入れると 字の 読み込みを 待たずに 画面が 出る（display=swap：はじめは 端末の 字）
    return (A + '\n<script>for(const h of ' + json.dumps(urls) + "){const l=document.createElement('link');l.rel='stylesheet';l.href=h;document.head.appendChild(l);}</script>\n" + B)

main, brush = wanted(s)
new = block(main, brush)
cur = s[s.index(A):s.index(B)+len(B)] if A in s else None
if '--check' in sys.argv:
    print('ok' if cur == new else 'フォントの 字が 古い：python3 tools/mishin/fonts.py を 回す'); sys.exit(0 if cur == new else 1)
if cur is None:
    old = re.search(r'<link href="https://fonts.googleapis.com/css2[^>]*>', s).group(0)
    s = s.replace(old, new)
else:
    s = s.replace(cur, new)
open(P, 'w', encoding='utf-8').write(s)
print('字の 数', len(main), '筆の 字', brush)
