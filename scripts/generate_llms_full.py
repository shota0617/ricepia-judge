#!/usr/bin/env python3
"""Generate llms-full.txt from visible HTML; --check exits 1 on stale output."""
import argparse
from pathlib import Path
import re
from urllib.parse import urljoin
from content import Node, parse, normalized

ROOT = Path(__file__).resolve().parents[1]

def markdown(node, base):
    if isinstance(node, str):
        return re.sub(r'\s+', ' ', node)
    tag = node.tag
    if tag in {'script', 'style', 'nav', 'noscript'}:
        return ''
    body = ''.join(markdown(c, base) for c in node.children)
    if tag in {'h1', 'h2', 'h3', 'h4'}:
        return '\n\n' + '#' * int(tag[1]) + ' ' + body.strip() + '\n\n'
    if tag == 'a':
        href = node.attrs.get('href', '')
        return f'[{body.strip()}]({urljoin(base, href)})' if href else body
    if tag in {'strong', 'b'}:
        return '**' + body.strip() + '**'
    if tag in {'em', 'i'}:
        return '*' + body.strip() + '*'
    if tag == 'dt':
        return '\n- **' + body.strip() + '**：'
    if tag == 'dd':
        return body.strip() + '\n'
    if tag == 'br':
        return '\n'
    if tag == 'table':
        rows = []
        for row in node.find_all('tr'):
            cells = [normalized(markdown(c, base)).replace('|', r'\|') for c in row.children if isinstance(c, Node) and c.tag in {'th', 'td'}]
            if cells:
                rows.append(cells)
        if not rows:
            return ''
        width = max(map(len, rows))
        lines = ['| ' + ' | '.join(row + [''] * (width-len(row))) + ' |' for row in rows]
        lines.insert(1, '| ' + ' | '.join(['---'] * width) + ' |')
        return '\n\n' + '\n'.join(lines) + '\n\n'
    if tag in {'ol', 'ul'}:
        items = [c for c in node.children if isinstance(c, Node) and c.tag == 'li']
        return '\n\n' + '\n'.join((f'{i}. ' if tag == 'ol' else '- ') + markdown(c, base).strip() for i, c in enumerate(items, int(node.attrs.get('start', '1')))) + '\n\n'
    if tag == 'summary':
        return '\n\n### ' + body.strip() + '\n\n'
    if tag in {'p', 'div', 'section', 'article', 'footer', 'details'}:
        return '\n\n' + body.strip() + '\n\n'
    return body

def generate(root=ROOT):
    pages = [root/'index.html', root/'guide/index.html', *sorted(p for p in (root/'guide').glob('*.html') if p.name != 'index.html')]
    sections, dates = [], []
    for path in pages:
        doc = parse(path.read_text(encoding='utf-8'))
        canonical = doc.find_all('link', rel='canonical')[0].attrs['href']
        articles = doc.find_all('article', id='about') if path == root/'index.html' else doc.find_all('article')
        if len(articles) != 1:
            raise ValueError(f'{path}: expected exactly one content article')
        article = articles[0]
        dates += [n.attrs['datetime'] for n in article.find_all('time')]
        text = markdown(article, canonical).strip()
        if path == root/'index.html':
            text = '# 精米品質AI判定（トップページ）\n\n' + text
        else:
            # Guide footer lives outside the article; do not silently drop operator information.
            for footer in doc.find_all('footer'):
                if footer not in article.find_all('footer'):
                    text += markdown(footer, canonical)
        sections.append('URL: ' + canonical + '\n\n' + text.strip())
    header = '# らいすぴあ 精米品質AI判定 — 全文版（llms-full.txt）\n\n'
    header += '> 公開用HTMLの本文から生成。要約版: https://ricepia-judge.vercel.app/llms.txt\n\n'
    header += '最終更新: ' + max(dates) + '\n\n'
    output = header + '\n\n---\n\n'.join(sections) + '\n'
    output = '\n'.join(line.rstrip() for line in output.splitlines()) + '\n'
    return re.sub(r'\n[ \t]*\n(?:[ \t]*\n)+', '\n\n', output)

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check', action='store_true')
    args = parser.parse_args()
    target = ROOT/'llms-full.txt'
    content = generate()
    if args.check:
        if not target.exists() or target.read_text(encoding='utf-8') != content:
            parser.exit(1, 'llms-full.txt is stale; run python3 scripts/generate_llms_full.py\n')
        print('llms-full.txt: up to date')
    else:
        target.write_text(content, encoding='utf-8')
        print('Generated llms-full.txt')

if __name__ == '__main__':
    main()
