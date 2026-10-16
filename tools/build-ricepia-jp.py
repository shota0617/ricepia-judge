# ricepia.jp のトップページに部品を入れる
#   python3 tools/build-ricepia-jp.py [もとの index.html] [出力先]
#   （省略時は ricepia-jp/current.html → ricepia-jp/index.html）
# - お知らせ欄（ricepia-jp/game-section.html）を「動画で見る らいすぴあ」の欄のすぐ上に入れる
# - 「太郎」セクション（#taro）を、業務用米のご案内（ricepia-jp/gyomu-section.html）と入れ替える
#   あわせて、配達の説明（個人は配達なし・業務用は配達あり）とナビ・案内文を業務用米に合わせる
# すでに入っているときは、いったん取り除いてから入れ直す（何度実行しても1つだけになる）。
import os, re, sys

ROOT = os.path.join(os.path.dirname(__file__), '..', 'ricepia-jp')
src = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, 'current.html')
out = sys.argv[2] if len(sys.argv) > 2 else os.path.join(ROOT, 'index.html')
ANCHOR = '<!-- ▼ 動画コーナー（ここから） -->'
TARO_START = '<!-- ===== TARO FOR RESTAURANTS ===== -->'
TARO_END = '<!-- ===== RICE FAMILY TREE (お米の家系図) ===== -->'
# (もとの文, 新しい文)。新しい文が入っていれば何もしない
TEXTS = [
    ('配達・発送は行っておりません。', '個人のお客様への配達・発送は行っておりません（飲食店・事業者様の業務用米は配達いたします）。'),
    ('<a href="#taro">飲食店様向け</a>', '<a href="#taro">業務用米</a>'),
    ('飲食店様向けには業務用米「太郎」もございます。', '飲食店・事業者様向けには、太郎（高級米ブレンド）・あいちのかおり・つやっこなどの業務用米もございます。'),
    ('飲食店・給食・弁当事業所さま向けの業務用米。', '飲食店・給食・弁当事業所さま向けの業務用米（高級米ブレンド）。'),
    ('業務用サイト・LINE・電話・FAXで発注できます。', '業務用サイト・LINE・電話・FAXで発注でき、配達もいたします。'),
]


def read(name):
    return open(os.path.join(ROOT, name), encoding='utf-8').read().strip()


def once(html, mark):
    if html.count(mark) != 1:
        sys.exit(f'「{mark}」が {html.count(mark)} か所あります（1か所のはず）。ページの作りが変わったので、入れる場所を見直してください')


html = open(src, encoding='utf-8').read()

# 業務用米：前に入れたもの、なければもとの太郎セクションを入れ替える
gyomu = read('gyomu-section.html') + '\n\n'
if '<!-- gyomu:start' in html:
    html = re.sub(r'<!-- gyomu:start.*?<!-- gyomu:end -->\n*', lambda m: gyomu, html, count=1, flags=re.S)
else:
    once(html, TARO_START)
    once(html, TARO_END)
    a, b = html.index(TARO_START), html.index(TARO_END)
    if a > b:
        sys.exit('太郎セクションの終わりが始まりより前にあります。ページの作りが変わったので、入れる場所を見直してください')
    html = html[:a] + gyomu + html[b:]
for old, new in TEXTS:
    if old in html:
        html = html.replace(old, new)
    elif new not in html:
        print(f'注意：「{old}」が見つからないので、変えずにおきます')

# にしおさんぽGO のお知らせ欄
html = re.sub(r'<!-- nishio-go:start.*?<!-- nishio-go:end -->\n?', '', html, flags=re.S)
once(html, ANCHOR)
html = html.replace(ANCHOR, read('game-section.html') + '\n' + ANCHOR)

with open(out, 'w', encoding='utf-8', newline='') as f:
    f.write(html)
print(f'{out}: {len(html.encode())} bytes')
