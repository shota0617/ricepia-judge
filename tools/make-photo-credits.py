# にしおさんぽGO：名所のドット絵の参考にした写真の作者・ライセンスの一覧を、遊ぶ人が見られるページにする
#   python3 tools/make-photo-credits.py
# もと：docs/landmark-photos.md（docs/ は公開しない設定なので、そのままでは遊ぶ人から見えない）
# 出力：nishio-go/photo-credits.html（クレジット欄からリンク）。docs/landmark-photos.md を直したら、これも作りなおす
# CC BY・CC BY-SA の写真は、作者とライセンスを見られる所に出すのが使う条件
import html, os, re

ROOT = os.path.join(os.path.dirname(__file__), '..')
SRC = os.path.join(ROOT, 'docs', 'landmark-photos.md')
OUT = os.path.join(ROOT, 'nishio-go', 'photo-credits.html')

LICENSE_URL = {
    'CC BY-SA 4.0': 'https://creativecommons.org/licenses/by-sa/4.0/deed.ja',
    'CC BY-SA 3.0': 'https://creativecommons.org/licenses/by-sa/3.0/deed.ja',
    'CC BY 4.0': 'https://creativecommons.org/licenses/by/4.0/deed.ja',
    'CC BY 3.0': 'https://creativecommons.org/licenses/by/3.0/deed.ja',
    'CC BY 2.0': 'https://creativecommons.org/licenses/by/2.0/deed.ja',
    'CC0': 'https://creativecommons.org/publicdomain/zero/1.0/deed.ja',
}
# 「- [ファイル名](URL) — 作者（ライセンス）」と「- 名所：[ファイル名](URL) — 作者（ライセンス）」の2つの形
ITEM = re.compile(r'^- (?:(.+?)：)?\[(.+?)\]\((https://commons\.wikimedia\.org/wiki/File:.+?)\) — (.+)（([^（）]+)）\s*$')

e = html.escape
sections, cur, n, bad = [], None, 0, []
for line in open(SRC, encoding='utf-8'):
    line = line.rstrip('\n')
    if line.startswith('## '):
        cur = [line[3:].strip(), []]
        sections.append(cur)
        continue
    m = ITEM.match(line)
    if m:
        place, title, url, author, lic = m.groups()
        lu = LICENSE_URL.get(lic)
        lic_html = f'<a href="{e(lu)}" target="_blank" rel="noopener">{e(lic)}</a>' if lu else e(lic)
        li = (f'{e(place)}：' if place else '') + f'<a href="{e(url)}" target="_blank" rel="noopener">{e(title)}</a> — {e(author)}（{lic_html}）'
        if cur is None:
            cur = ['', []]
            sections.append(cur)
        cur[1].append(li)
        n += 1
    elif line.startswith('- '):
        bad.append(line)
if bad:
    raise SystemExit('読めない行があります：\n' + '\n'.join(bad[:10]))

body = '\n'.join(
    (f'  <h2>{e(h)}</h2>\n' if h else '') + '  <ul>\n' + '\n'.join(f'    <li>{li}</li>' for li in items) + '\n  </ul>'
    for h, items in sections if items)

page = f'''<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1.0"/>
<title>名所のドット絵の参考にした写真｜にしおさんぽGO</title>
<meta name="description" content="お散歩ゲーム「にしおさんぽGO」（運営：近藤米穀店 らいすぴあ）の、名所のドット絵の参考にした写真の作者とライセンスの一覧です。"/>
<meta name="theme-color" content="#2f5d3a"/>
<!-- このページは tools/make-photo-credits.py が docs/landmark-photos.md から作ります。直接は直さない -->
<style>
  :root {{ --green: #2f5d3a; --ink: #1f2a22; --sub: #5d6b60; --bg: #f6f4ec; }}
  * {{ box-sizing: border-box; }}
  body {{ margin: 0; background: var(--bg); color: var(--ink); font-family: system-ui, -apple-system, "Hiragino Sans", "Noto Sans JP", sans-serif; line-height: 1.8; }}
  header {{ background: var(--green); color: #fff; padding: 14px 16px; }}
  header a {{ color: #fff; }}
  main {{ max-width: 760px; margin: 0 auto; padding: 16px 16px 48px; }}
  h1 {{ font-size: 22px; margin: 8px 0 4px; }}
  h2 {{ font-size: 16px; margin: 24px 0 6px; padding-left: 10px; border-left: 4px solid var(--green); }}
  p, li {{ font-size: 14px; }}
  ul {{ padding-left: 1.2em; margin: 0; }}
  .date {{ color: var(--sub); font-size: 13px; margin: 0 0 16px; }}
  a {{ color: #1d5fb8; overflow-wrap: anywhere; }}
</style>
</head>
<body>
<header><a href="../nishio-go.html">← にしおさんぽGO にもどる</a></header>
<main>
  <h1>名所のドット絵の参考にした写真</h1>
  <p class="date">対象：お散歩ゲーム「にしおさんぽGO」／運営：近藤米穀店 らいすぴあ／写真 {n} 枚</p>
  <p>名所のドット絵は、<a href="https://commons.wikimedia.org/" target="_blank" rel="noopener">Wikimedia Commons</a> にある自由に使える写真（CC0・パブリックドメイン・CC BY・CC BY-SA）の外観を参考に、ドット絵として描きなおしたものです。写真そのものはゲームに入れていません。参考にした写真と、作者・ライセンスは次のとおりです（写真の名前を押すと、Wikimedia Commons のページが開きます）。</p>
  <p>当店（近藤米穀店・らいすぴあ）の2店舗の絵は、お店の写真をもとにしています。</p>
{body}
</main>
</body>
</html>
'''
open(OUT, 'w', encoding='utf-8').write(page)
print(f'{os.path.relpath(OUT, ROOT)}: 写真 {n} 枚・{len([s for s in sections if s[1]])} か所')
