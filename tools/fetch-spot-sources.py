# 一時的：スポットを増やす下調べ。西尾市観光協会のスポットのページと、OpenStreetMap の名前つきの場所を集めて reference/ に保存する
import re, os, json, time, html, urllib.request, urllib.parse
from html.parser import HTMLParser
OUT = 'reference'; os.makedirs(OUT, exist_ok=True)
UA = {'User-Agent': 'Mozilla/5.0 (nishio-go spot research)'}
def get(url, data=None):
    req = urllib.request.Request(url, data=data, headers=UA)
    with urllib.request.urlopen(req, timeout=60) as r: return r.read().decode('utf-8', 'replace')
class P(HTMLParser):
    def __init__(s): super().__init__(); s.links=[]; s.text=[]; s.skip=0; s.a=None; s.title=''; s.intitle=False
    def handle_starttag(s,t,a):
        a=dict(a)
        if t in('script','style','noscript','nav','footer','header'): s.skip+=1
        if t=='title': s.intitle=True
        if t=='a' and a.get('href'): s.a=[a['href'],'']
        if t in('p','div','li','br','h1','h2','h3','h4','tr','dt','dd','th','td'): s.text.append('\n')
    def handle_endtag(s,t):
        if t in('script','style','noscript','nav','footer','header'): s.skip=max(0,s.skip-1)
        if t=='title': s.intitle=False
        if t=='a' and s.a: s.links.append(tuple(s.a)); s.a=None
    def handle_data(s,d):
        if s.intitle: s.title+=d
        if s.a is not None: s.a[1]+=d.strip()
        if not s.skip: s.text.append(d)
def parse(url):
    p=P(); p.feed(get(url)); t=re.sub(r'[ \t　]+',' ',html.unescape(''.join(p.text))); t=re.sub(r'\n\s*\n+','\n',t).strip()
    return p, t
# 観光協会：観光・レジャーのカテゴリ → 各スポットのページ
cats, shops = set(), {}
p,_ = parse('https://nishiokanko.com/category1')
for h,l in p.links:
    u=urllib.parse.urljoin('https://nishiokanko.com/',h).split('#')[0]
    if 'nishiokanko.com' in u and ('category' in u or '/list/' in u) and u.rstrip('/')!='https://nishiokanko.com/category1': cats.add(u)
print('categories', len(cats))
for c in sorted(cats):
    for page in range(1,6):
        url = c if page==1 else c.rstrip('/')+f'/page/{page}/'
        try: p,_ = parse(url)
        except Exception as e: break
        n=0
        for h,l in p.links:
            u=urllib.parse.urljoin(url,h).split('#')[0].split('?')[0]
            if re.search(r'nishiokanko\.com/list/shop/[^/]+/?$',u):
                shops.setdefault(u,set()).add(c); n+=1
        if n==0: break
        time.sleep(0.3)
print('spot pages', len(shops))
spots=[]
for u,cs in sorted(shops.items()):
    try: p,t = parse(u)
    except Exception as e: print('NG',u,e); continue
    title=p.title.split('–')[0].strip()
    i=t.find(title, t.find('西尾観光 >')) if '西尾観光 >' in t else 0
    body=t[i:i+1500]
    spots.append({'url':u,'title':title,'cats':sorted(cs),'body':body})
    time.sleep(0.3)
json.dump(spots, open(f'{OUT}/nishiokanko-spots.json','w'), ensure_ascii=False, indent=1)
# OpenStreetMap：西尾市の名前つきの場所（広め）
q='''[out:json][timeout:180];
area["name"="西尾市"]["admin_level"="7"]->.a;
(
  nwr["name"]["amenity"~"^(place_of_worship|library|townhall|community_centre|marketplace|public_bath)$"](area.a);
  nwr["name"]["historic"](area.a);
  nwr["name"]["tourism"](area.a);
  nwr["name"]["leisure"~"^(park|garden|nature_reserve|beach_resort|marina|picnic_table|playground|sports_centre|stadium|swimming_pool)$"](area.a);
  nwr["name"]["natural"~"^(beach|peak|hill|cape|island|islet|wetland|tree|spring|cliff)$"](area.a);
  nwr["name"]["waterway"="waterfall"](area.a);
  nwr["name"]["man_made"~"^(lighthouse|tower|pier|breakwater)$"](area.a);
  nwr["name"]["railway"="station"](area.a);
  nwr["name"]["shop"~"^(tea|confectionery|seafood|farm|rice)$"](area.a);
  nwr["name"]["craft"](area.a);
  nwr["name"]["landuse"="cemetery"]["religion"](area.a);
);
out center tags;'''
for url in ['https://overpass-api.de/api/interpreter','https://overpass.private.coffee/api/interpreter','https://maps.mail.ru/osm/tools/overpass/api/interpreter','https://overpass.kumi.systems/api/interpreter']:
    try:
        j=json.loads(get(url, ('data='+urllib.parse.quote(q)).encode()))
        els=[{'id':e['type'][0]+str(e['id']),'lat':e.get('lat',e.get('center',{}).get('lat')),'lng':e.get('lon',e.get('center',{}).get('lon')),'tags':e.get('tags',{})} for e in j.get('elements',[])]
        json.dump(els, open(f'{OUT}/osm-named.json','w'), ensure_ascii=False)
        print('osm', len(els), url); break
    except Exception as e: print('overpass NG', url, e)
