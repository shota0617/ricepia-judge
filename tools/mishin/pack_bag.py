# Blender の 袋の 絵（bag_front.png・bag_back.png）を webp に して、mishin.html の BAGIMG に うめこむ
#   python3 tools/mishin/pack_bag.py
import base64, io, os, re
from PIL import Image
HERE = os.path.dirname(os.path.abspath(__file__))
HTML = os.path.join(HERE, '..', '..', 'mishin.html')
out = {}
for side in ('front', 'back'):
    im = Image.open(os.path.join(HERE, f'bag_{side}.png')).convert('RGBA')
    assert im.size == (900, 1500), f'bag_{side}.png が {im.size}。mishin.html の BAG は 900×1500（--fast の 絵では ない？）'
    buf = io.BytesIO(); im.save(buf, 'WEBP', quality=90, method=6, use_sharp_yuv=True)
    out[side] = 'data:image/webp;base64,' + base64.b64encode(buf.getvalue()).decode()
    print(side, len(buf.getvalue())//1024, 'KB')
s = open(HTML, encoding='utf-8').read()
line = "const BAGIMG = { front:'%s', back:'%s' };" % (out['front'], out['back'])
s, n = re.subn(r"const BAGIMG = \{[^\n]*\};", lambda m: line, s)
assert n == 1, 'BAGIMG の 行が ない'
open(HTML, 'w', encoding='utf-8').write(s)
print('packed')
