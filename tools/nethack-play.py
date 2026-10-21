# NetHack（1987年からの 無料・オープンソースのRPG）を、Claude が1手ずつ遊ぶための道具（にしおさんぽGO に持ちこめる しくみ探し）
#   pip install "numpy<2" nle        （Python 3.12 まで。nle は NetHack Learning Environment）
#   python3 tools/nethack-play.py <記録フォルダ> '<キー>'
# ・キーは NetHack のキー（h j k l で歩く、H J K L で走る、s で しらべる、, で拾う、\n で Enter、\x1b で Esc）
# ・種を固定して、これまでのキー（<記録フォルダ>/keys.txt）を毎回 頭から再生してから、新しいキーを押す。画面（24行×80字）をそのまま出す
#   （同じ種なら同じダンジョン・同じ結果になるので、1回ずつ別に動かしても続きから遊べる）
# ・遊んだ記録とメモは docs/play-improve.md の「NetHack を遊ぶ」に
import codecs, os, sys
import nle.nethack as nh

if len(sys.argv) < 2:
    sys.exit("使いかた：python3 tools/nethack-play.py <記録フォルダ> '<キー>'")
D = sys.argv[1]
os.makedirs(D, exist_ok=True)
LOG = os.path.join(D, 'keys.txt')
keys = open(LOG, encoding='utf-8').read() if os.path.exists(LOG) else ''
add = codecs.decode(sys.argv[2], 'unicode_escape') if len(sys.argv) > 2 else ''
g = nh.Nethack(observation_keys=('tty_chars', 'blstats'), playername='Claude-val-hum-neu-fem', ttyrec=None, fix_moon_phase=True)   # ワルキューレ（はじめての人向き）
g.set_initial_seeds(20261021, 1021, False)
g.reset()
obs, done = None, False
for k in keys + add:
    obs, done = g.step(ord(k))
    if done:
        break
if add and not done:
    with open(LOG, 'w', encoding='utf-8') as f:
        f.write(keys + add)
if obs is None:
    obs, _ = g.step(27)   # まだ何も押していないときは Esc で画面を出す
print('\n'.join(bytes(r).decode('latin1').rstrip() for r in obs[0]))
print('おしまい' if done else f'（ここまでのキー：{len(keys + add)}）')
