# 一時的：西尾の名物（抹茶・うなぎ・えびせんべいなど）の下調べ。市の資料（PDF）と観光協会のページを reference/ に保存する
import re, os, io, json, html, urllib.request, urllib.parse
from html.parser import HTMLParser
from pypdf import PdfReader
OUT = 'reference'; os.makedirs(OUT, exist_ok=True)
UA = {'User-Agent': 'Mozilla/5.0 (nishio-go research)'}
def raw(url):
    with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=60) as r: return r.read()
class P(HTMLParser):
    def __init__(s): super().__init__(); s.links=[]; s.text=[]; s.skip=0; s.a=None; s.title=''; s.intitle=False
    def handle_starttag(s,t,a):
        a=dict(a)
        if t in('script','style','noscript'): s.skip+=1
        if t=='title': s.intitle=True
        if t=='a' and a.get('href'): s.a=[a['href'],'']
        if t in('p','div','li','br','h1','h2','h3','h4','tr','dt','dd','th','td'): s.text.append('\n')
    def handle_endtag(s,t):
        if t in('script','style','noscript'): s.skip=max(0,s.skip-1)
        if t=='title': s.intitle=False
        if t=='a' and s.a: s.links.append(tuple(s.a)); s.a=None
    def handle_data(s,d):
        if s.intitle: s.title+=d
        if s.a is not None: s.a[1]+=d.strip()
        if not s.skip: s.text.append(d)
def page(url):
    p=P(); p.feed(raw(url).decode('utf-8','replace')); t=re.sub(r'[ \t　]+',' ',html.unescape(''.join(p.text))); t=re.sub(r'\n\s*\n+','\n',t).strip()
    return p, t
out = {'pdf': {}, 'pages': {}, 'errors': {}}
CITY = 'https://www.city.nishio.aichi.jp/_res/projects/default_project/_page_/001/'
for u in [CITY+'009/135/06.pdf', CITY+'003/552/20190422-103854.pdf', CITY+'003/552/20190422-103553.pdf', CITY+'003/133/20190902-101726.pdf', CITY+'004/488/20200128-083828.pdf']:
    try:
        r = PdfReader(io.BytesIO(raw(u)))
        out['pdf'][u] = '\n'.join((pg.extract_text() or '') for pg in r.pages)[:60000]
    except Exception as e: out['errors'][u] = repr(e)
# 観光協会：名物・グルメ・おみやげらしいリンクをたどる（1段）
KEY = re.compile('特産|名物|グルメ|おみやげ|お土産|土産|抹茶|うなぎ|鰻|えびせん|食べる|ショッピング|買う')
seen = set()
for start in ['https://nishiokanko.com/', 'https://nishiokanko.com/category2', 'https://nishiokanko.com/category3']:
    try: p, t = page(start)
    except Exception as e: out['errors'][start] = repr(e); continue
    out['pages'][start] = t[:20000]
    for h, l in p.links:
        u = urllib.parse.urljoin(start, h).split('#')[0]
        if 'nishiokanko.com' in u and u not in seen and (KEY.search(l) or KEY.search(urllib.parse.unquote(u))) and len(seen) < 60:
            seen.add(u)
            try: _, tt = page(u); out['pages'][u] = (l + '\n' + tt)[:15000]
            except Exception as e: out['errors'][u] = repr(e)
json.dump(out, open(f'{OUT}/meibutsu.json', 'w'), ensure_ascii=False, indent=1)
print('pdf', len(out['pdf']), 'pages', len(out['pages']), 'errors', len(out['errors']))
