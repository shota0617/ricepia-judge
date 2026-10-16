# 一時的：スポットを増やす下調べ。Wikidata から、西尾市内にある位置情報つきの項目（神社・寺・史跡・文化財・公園など）を集める
import json, os, urllib.request, urllib.parse
os.makedirs('reference', exist_ok=True)
Q = '''
SELECT ?item ?itemLabel ?coord ?typeLabel ?article ?heritageLabel ?desc WHERE {
  ?item wdt:P131+ wd:Q389583 ;
        wdt:P625 ?coord .
  OPTIONAL { ?item wdt:P31 ?type . }
  OPTIONAL { ?item wdt:P1435 ?heritage . }
  OPTIONAL { ?item schema:description ?desc FILTER(LANG(?desc) = "ja") }
  OPTIONAL { ?article schema:about ?item ; schema:isPartOf <https://ja.wikipedia.org/> . }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "ja,en". }
}'''
url = 'https://query.wikidata.org/sparql?format=json&query=' + urllib.parse.quote(Q)
req = urllib.request.Request(url, headers={'User-Agent': 'nishio-go-research/1.0 (github.com/shota0617/ricepia-judge)', 'Accept': 'application/sparql-results+json'})
j = json.load(urllib.request.urlopen(req, timeout=120))
rows = {}
for b in j['results']['bindings']:
    q = b['item']['value'].rsplit('/', 1)[1]
    r = rows.setdefault(q, {'q': q, 'name': b.get('itemLabel', {}).get('value'), 'coord': b['coord']['value'], 'types': set(), 'heritage': set(), 'desc': b.get('desc', {}).get('value'), 'wiki': b.get('article', {}).get('value')})
    if 'typeLabel' in b: r['types'].add(b['typeLabel']['value'])
    if 'heritageLabel' in b: r['heritage'].add(b['heritageLabel']['value'])
out = [dict(r, types=sorted(r['types']), heritage=sorted(r['heritage'])) for r in rows.values()]
json.dump(out, open('reference/wikidata-nishio.json', 'w'), ensure_ascii=False, indent=0)
print(len(out), 'items')
