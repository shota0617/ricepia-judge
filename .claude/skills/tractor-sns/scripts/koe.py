#!/usr/bin/env python3
"""tractor.html に入っている「農家の声」を一覧にする・同じ話をまた使っていないか確かめる。

  python3 koe.py list            # VOICES のキーと出どころ、はじめの画面のリンク
  python3 koe.py check <URL>...  # その URL（とサイト）を もう使っているか
  python3 koe.py sites           # サイトごとの数（同じブログばかりにならないように）
"""
import re, sys, os
from collections import Counter
from urllib.parse import urlparse

HERE = os.path.dirname(os.path.abspath(__file__))
HTML = os.path.normpath(os.path.join(HERE, '../../../../tractor.html'))


def load():
    s = open(HTML, encoding='utf-8').read()
    a = s.index('<summary><b>農家の声</b>')
    b = s.index('</details>', a)
    links = re.findall(r'<a href="([^"]+)"[^>]*>(.*?)</a>', s[a:b])   # (URL, リンクの文字)
    v0 = s.index('const VOICES = {')
    v = s[v0:s.index('\n};', v0)]
    voices = re.findall(r"^\s+(\w+): \['(.*?)', '(.*?)'\]", v, re.M)
    return links, voices


X_HOSTS = ('x.com', 'twitter.com', 'mobile.twitter.com')


def site(u, label=''):                                # 人・サイト。note・アメブロ・X は アカウントまで
    p = urlparse(u)
    host = p.netloc.replace('www.', '')
    first = p.path.split('/')[1] if len(p.path.split('/')) > 1 else ''
    if host in X_HOSTS:                               # はじめの画面の X のリンクは x.com/i/status/… なので、アカウントはリンクの文字（@…）から
        m = re.search(r'@(\w+)', label)
        who = first if first and first != 'i' else (m.group(1) if m else '?')
        return 'x.com/' + who.lower()
    return host + ('/' + first if host in ('note.com', 'ameblo.jp') else '')


BLOGS = ('ameblo.jp', 'note.com', 'exblog.jp', 'hatenablog.com', 'hatenablog.jp', 'hatenadiary.jp', 'livedoor.blog', 'blog.goo.ne.jp', 'fc2.com', 'seesaa.net')
TRACK = ('frm', 'fbclid', 'gclid', 'hl', 'ref', 'ref_src', 'from', 's', 't', 'igshid', 'si')


def norm(u):                                          # 同じ投稿・記事かを比べる形。X は 投稿の番号で比べる
    p = urlparse(u)
    host = p.netloc.lower().replace('www.', '')
    if host in X_HOSTS:
        m = re.search(r'/status(?:es)?/(\d+)', p.path)
        if m:
            return 'x:' + m.group(1)
    if host.endswith(BLOGS):                          # ブログは 記事の場所（パス）だけで決まる。?frm= などの 飾りは すてる
        q = ''
    else:                                             # ほかは 中身を決める ?v= などを のこし、追跡用の ものだけ すてる
        q = '&'.join(sorted(kv for kv in p.query.split('&') if kv and not (kv.split('=')[0].startswith('utm_') or kv.split('=')[0] in TRACK)))
    return host + p.path.rstrip('/') + ('?' + q if q else '')


def main():
    links, voices = load()
    cmd = sys.argv[1] if len(sys.argv) > 1 else 'list'
    if cmd == 'list':
        print(f'VOICES {len(voices)} 件')
        for k, text, src in voices:
            print(f'  {k:12s} {src}  … {text[:40]}')
        print(f'はじめの画面「農家の声」のリンク {len(links)} 件')
        for u, label in links:
            print(f'  {u}  {re.sub(r"<[^>]+>", "", label)}')
    elif cmd == 'sites':
        c = Counter(site(u, label) for u, label in links)
        for name, n in c.most_common():
            print(f'{n:3d}  {name}')
    elif cmd == 'check':
        have = {norm(u) for u, _ in links}
        sites = Counter(site(u, label) for u, label in links)
        for u in sys.argv[2:]:
            used = norm(u) in have
            print(f"{'使用ずみ' if used else 'まだ':4s}  {u}  （同じ人・サイト {sites.get(site(u), 0)} 件）")
    else:
        print(__doc__)


if __name__ == '__main__':
    main()
