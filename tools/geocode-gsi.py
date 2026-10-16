# 一時的：観光協会のページの住所を、国土地理院の住所検索で座標にする（スポットを増やす下調べ）
import json, os, time, urllib.request, urllib.parse
ADDR = {
  '安泰寺': '愛知県西尾市西幡豆町講伏14', '福泉寺': '愛知県西尾市吉良町上横須賀八王子31', '源空院': '愛知県西尾市西浅井町札木30',
  '常福寺': '愛知県西尾市刈宿町出口50', '浄名寺': '愛知県西尾市徳永町東側39', '旧糟谷邸': '愛知県西尾市吉良町荻原大道通18-1',
  '見影山穴弘法': '愛知県西尾市西幡豆町西見影', '無の里休憩所': '愛知県西尾市平原町前山22-2', '中畑八幡社': '愛知県西尾市中畑町宮前33',
  '上永良神明社': '愛知県西尾市上永良町宮東11', '勝山寺': '愛知県西尾市瓦町21', '西林寺': '愛知県西尾市吉良町瀬戸宮西13',
  '高倉神社': '愛知県西尾市平口町奥川50', 'とうてい山古墳': '愛知県西尾市東幡豆町山崎', '天竹神社': '愛知県西尾市天竹町池田53',
  '長圓寺': '愛知県西尾市貝吹町入101', '紅樹院': '愛知県西尾市上町浜屋敷83', 'いきものふれあいの里': '愛知県西尾市家武町小草3',
  '三ヶ根観音': '愛知県西尾市東幡豆町大境17', '旧近衛邸': '愛知県西尾市錦城町231-1', '尚古荘': '愛知県西尾市錦城町176-1',
  '熱池八幡社': '愛知県西尾市熱池町神田103', '鳥羽神明社': '愛知県西尾市鳥羽町西迫89', '養寿寺': '愛知県西尾市下矢田町郷2',
  '妙善寺': '愛知県西尾市東幡豆町森66', '抹茶ミュージアム和く和く': '愛知県西尾市上町横町屋敷15', '八ツ面山': '愛知県西尾市八ツ面町',
  '円融寺': '愛知県西尾市吉良町宮迫四反田92',
}
out = {}
for k, a in ADDR.items():
    url = 'https://msearch.gsi.go.jp/address-search/AddressSearch?q=' + urllib.parse.quote(a)
    try:
        j = json.load(urllib.request.urlopen(urllib.request.Request(url, headers={'User-Agent': 'nishio-go-research'}), timeout=30))
        out[k] = [{'title': f['properties']['title'], 'lng': f['geometry']['coordinates'][0], 'lat': f['geometry']['coordinates'][1]} for f in j[:3]]
    except Exception as e:
        out[k] = str(e)
    print(k, out[k] if isinstance(out[k], str) else out[k][:1])
    time.sleep(0.5)
os.makedirs('reference', exist_ok=True)
json.dump(out, open('reference/geocode-gsi.json', 'w'), ensure_ascii=False, indent=1)
