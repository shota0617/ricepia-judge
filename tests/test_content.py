import json
from pathlib import Path
import re
import sys
import unittest
from urllib.parse import urljoin, urlparse, unquote
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT/'scripts'))
from content import parse, normalized
from generate_llms_full import generate, markdown

class ContentTests(unittest.TestCase):
    def test_generated_text_current(self):
        self.assertEqual((ROOT/'llms-full.txt').read_text(), generate())

    def test_conversion_preserves_links_tables_lists_faq(self):
        doc = parse('<article><h1>A</h1><p><a href="/guide/">Guide &amp; more</a><br/>next</p><table><tr><th>A</th><th>B</th></tr><tr><td>1|2</td><td><strong>x</strong></td></tr></table><ol start="5"><li>one</li><li>two</li></ol><dl><dt>S</dt><dd>grade</dd></dl><details><summary>Q?</summary><p>Answer</p></details><script>private()</script></article>')
        result = markdown(doc, 'https://example.com/')
        for text in ['# A','[Guide & more](https://example.com/guide/)','| --- | --- |',r'1\|2','**x**','5. one','6. two','- **S**：grade','### Q?','Answer']:
            self.assertIn(text, result)
        self.assertNotIn('private()', result)

    def test_pages_metadata_links_faq(self):
        sitemap = ET.fromstring((ROOT/'sitemap.xml').read_text())
        ns = {'s': 'http://www.sitemaps.org/schemas/sitemap/0.9'}
        entries = {n.find('s:loc',ns).text: n.find('s:lastmod',ns).text for n in sitemap.findall('s:url',ns)}
        expected = set()
        for path in [ROOT/'index.html', *sorted((ROOT/'guide').glob('*.html'))]:
            with self.subTest(page=str(path.relative_to(ROOT))):
                doc = parse(path.read_text())
                canonical = doc.find_all('link',rel='canonical')[0].attrs['href']
                expected.add(canonical)
                self.assertIn(canonical, entries)
                self.assertIn(canonical, (ROOT/'llms.txt').read_text())
                graph = json.loads(doc.find_all('script',type='application/ld+json')[0].text())['@graph']
                dates = {n['dateModified'] for n in graph if 'dateModified' in n}
                self.assertEqual(dates,{entries[canonical]})
                self.assertEqual({n.attrs['datetime'] for n in doc.find_all('time')}, dates)
                visible = [(normalized(d.find_all('summary')[0].text()), normalized(d.find_all('p')[0].text())) for d in doc.find_all('details') if d.find_all('summary') and d.find_all('p')]
                faq = [n for n in graph if n.get('@type')=='FAQPage']
                structured = [(normalized(q['name']), normalized(q['acceptedAnswer']['text'])) for n in faq for q in n['mainEntity']]
                self.assertEqual(visible,structured)
                for link in doc.find_all('a'):
                    url = urlparse(urljoin(canonical,link.attrs.get('href','')))
                    if url.netloc == 'ricepia-judge.vercel.app':
                        target = ROOT/unquote(url.path).lstrip('/')
                        if url.path.endswith('/'):
                            target /= 'index.html'
                        self.assertTrue(target.is_file(),str(target))
                        if url.fragment:
                            self.assertTrue(parse(target.read_text()).find_all(id=url.fragment),url.geturl())
        self.assertEqual(set(entries),expected)

    def test_noindex_and_related_link(self):
        doc = parse((ROOT/'meta-ads.html').read_text())
        self.assertIn('noindex',doc.find_all('meta',name='robots')[0].attrs['content'])
        for file in ['sitemap.xml','llms.txt','llms-full.txt']:
            self.assertNotIn('meta-ads.html',(ROOT/file).read_text())
        graph=json.loads(parse((ROOT/'index.html').read_text()).find_all('script',type='application/ld+json')[0].text())['@graph']
        page=next(n for n in graph if n.get('@type')=='WebPage')
        self.assertTrue(all(isinstance(u,str) and u.startswith('https://') for u in page['relatedLink']))

    def test_operator_identity_matches_visible_contact(self):
        operators=[]
        for path in [ROOT/'index.html', *sorted((ROOT/'guide').glob('*.html'))]:
            doc=parse(path.read_text())
            graph=json.loads(doc.find_all('script',type='application/ld+json')[0].text())['@graph']
            operator=next(n for n in graph if n.get('@id')=='https://ricepia.jp/#business')
            operators.append(operator)
            visible=doc.find_all('footer')[0].text()
            for value in [operator['name'],operator['address']['postalCode'],operator['address']['streetAddress'],operator['foundingDate'],'0563-54-4001']:
                self.assertIn(value,visible)
            self.assertNotIn('founder',operator)
            self.assertIn('近藤翔太',visible)
        self.assertTrue(all(n==operators[0] for n in operators))

    def test_aichi_variety_group(self):
        doc=parse((ROOT/'index.html').read_text())
        group=next(n for n in doc.find_all('optgroup') if '愛知産' in n.attrs['label'])
        self.assertIn('愛知コシヒカリ',[n.text() for n in group.find_all('option')])

if __name__=='__main__':
    unittest.main()
