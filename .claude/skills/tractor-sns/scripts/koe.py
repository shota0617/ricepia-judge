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
    links = re.findall(r'href="([^"]+)"', s[a:b])
    v0 = s.index('const VOICES = {')
    v = s[v0:s.index('\n};', v0)]
    voices = re.findall(r"^\s+(\w+): \['(.*?)', '(.*?)'\]", v, re.M)
    return links, voices


def site(u):                                         # note・アメブロ・X は アカウントまで
    p = urlparse(u)
    host = p.netloc.replace('www.', '')
    return host + ('/' + p.path.split('/')[1] if host in ('note.com', 'ameblo.jp', 'x.com') else '')


def norm(u):
    return u.split('#')[0].rstrip('/').replace('http://', 'https://').replace('://www.', '://')


def main():
    links, voices = load()
    cmd = sys.argv[1] if len(sys.argv) > 1 else 'list'
    if cmd == 'list':
        print(f'VOICES {len(voices)} 件')
        for k, text, src in voices:
            print(f'  {k:12s} {src}  … {text[:40]}')
        print(f'はじめの画面「農家の声」のリンク {len(links)} 件')
        for u in links:
            print('  ' + u)
    elif cmd == 'sites':
        c = Counter(site(u) for u in links)
        for name, n in c.most_common():
            print(f'{n:3d}  {name}')
    elif cmd == 'check':
        have = {norm(u) for u in links}
        sites = Counter(site(u) for u in links)
        for u in sys.argv[2:]:
            used = norm(u) in have
            print(f"{'使用ずみ' if used else 'まだ':4s}  {u}  （同じ人・サイト {sites.get(site(u), 0)} 件）")
    else:
        print(__doc__)


if __name__ == '__main__':
    main()
