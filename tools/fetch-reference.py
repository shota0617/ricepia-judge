# 西尾市のホームページ（と観光協会）の観光・イベント・特産のページを集めて、文字だけを reference/ に保存する（ゲームの改善の参考用・一時的）
import re, os, sys, time, html, urllib.request, urllib.parse
from html.parser import HTMLParser

OUT = 'reference'
SEEDS = ['https://www.city.nishio.aichi.jp/', 'https://www.city.nishio.aichi.jp/kanko/index.html', 'https://nishiokanko.com/']
HOSTS = {'www.city.nishio.aichi.jp', 'nishiokanko.com'}
WORDS = re.compile(r'観光|イベント|祭|まつり|特産|名産|名所|文化財|史跡|公園|佐久島|一色|吉良|幡豆|抹茶|うなぎ|城|寺|神社|体験|グルメ|おみやげ|モデルコース|花|海|ふるさと|魅力|シティプロモーション|キャラクター|歴史')
SKIP = re.compile(r'\.(pdf|jpg|jpeg|png|gif|zip|docx?|xlsx?)$|/(ikkrwebBrowse|search|english|cn|kr)/|#', re.I)
MAX = int(os.environ.get('MAX_PAGES', '70'))

class P(HTMLParser):
    def __init__(s): super().__init__(); s.links = []; s.text = []; s.skip = 0; s.a = None; s.title = ''; s.intitle = False
    def handle_starttag(s, t, a):
        a = dict(a)
        if t in ('script', 'style', 'noscript'): s.skip += 1
        if t == 'title': s.intitle = True
        if t == 'a' and a.get('href'): s.a = [a['href'], '']
        if t in ('p', 'div', 'li', 'br', 'h1', 'h2', 'h3', 'h4', 'tr', 'dt', 'dd'): s.text.append('\n')
        if t in ('h1', 'h2', 'h3', 'h4'): s.text.append('## ')
    def handle_endtag(s, t):
        if t in ('script', 'style', 'noscript'): s.skip -= 1
        if t == 'title': s.intitle = False
        if t == 'a' and s.a: s.links.append(tuple(s.a)); s.a = None
    def handle_data(s, d):
        if s.skip: return
        if s.intitle: s.title += d
        if s.a is not None: s.a[1] += d.strip()
        s.text.append(d)

def get(url):
    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0 (nishio-go reference fetch)'})
    with urllib.request.urlopen(req, timeout=20) as r:
        raw = r.read(); ct = r.headers.get('content-type', '')
    m = re.search(r'charset=([\w-]+)', ct) or re.search(rb'charset=["\']?([\w-]+)', raw[:2000])
    enc = (m.group(1).decode() if isinstance(m.group(1), bytes) else m.group(1)) if m else 'utf-8'
    return raw.decode(enc, 'replace')

os.makedirs(OUT, exist_ok=True)
queue, seen, saved, index = list(SEEDS), set(), 0, []
while queue and saved < MAX:
    url = queue.pop(0)
    if url in seen: continue
    seen.add(url)
    try: body = get(url)
    except Exception as e: print('NG', url, e); continue
    p = P(); p.feed(body)
    text = re.sub(r'[ \t　]+', ' ', html.unescape(''.join(p.text)))
    text = re.sub(r'\n\s*\n+', '\n', text).strip()
    saved += 1
    name = f'{saved:03d}.txt'
    with open(os.path.join(OUT, name), 'w', encoding='utf-8') as f:
        f.write(f'URL: {url}\nTITLE: {p.title.strip()}\n\n{text}\n')
    index.append(f'{name}\t{p.title.strip()}\t{url}')
    print('OK', name, url, p.title.strip()[:60])
    for href, label in p.links:
        u = urllib.parse.urljoin(url, href).split('#')[0]
        h = urllib.parse.urlparse(u)
        if h.hostname not in HOSTS or SKIP.search(u) or u in seen: continue
        if WORDS.search(label) or WORDS.search(urllib.parse.unquote(h.path)):
            queue.append(u)
    time.sleep(0.5)
with open(os.path.join(OUT, 'index.tsv'), 'w', encoding='utf-8') as f: f.write('\n'.join(index) + '\n')
