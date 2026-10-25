# にしおさんぽGO の音楽（BGM と効果音）を作る：python3 tools/make-sound.py
# ファミコン風のオリジナル曲。矩形波（メロディ・和音）と三角波（ベース）とノイズ（ドラム）だけで鳴らす。
# 出力：nishio-go/bgm/field.mp3（ふだん）・world.mp3（せかいちず）・checkin.mp3・levelup.mp3・eye.mp3（ffmpeg が必要）
#       バリエーション：field2（まちかど）・field3（おまつり）・morning（朝）・evening（夕方）・night（夜）・rain（雨）
#       アルバム「西尾の音」100曲（日本の音階と、篠笛・琴・三味線・太鼓に似せた音）：nishio-go/bgm/s/001.mp3〜100.mp3 と list.json（python3 tools/make-sound.py album）
#       python3 tools/make-sound.py field2 night … のように名前を渡すと、その曲だけ作る
import json, os, subprocess, wave
import numpy as np

SR = 44100
OUT = os.path.join(os.path.dirname(__file__), '..', 'nishio-go', 'bgm')
NAMES = {'C': 0, 'C#': 1, 'D': 2, 'D#': 3, 'E': 4, 'F': 5, 'F#': 6, 'G': 7, 'G#': 8, 'A': 9, 'A#': 10, 'B': 11}
CHORDS = {'C': ('C', 'E', 'G'), 'Am': ('A', 'C', 'E'), 'F': ('F', 'A', 'C'), 'G': ('G', 'B', 'D'),
          'Dm': ('D', 'F', 'A'), 'Em': ('E', 'G', 'B'), 'E': ('E', 'G#', 'B'), 'Bb': ('A#', 'D', 'F'), 'D': ('D', 'F#', 'A'),
          'A': ('A', 'C#', 'E'), 'Gm': ('G', 'A#', 'D'), 'Bm': ('B', 'D', 'F#'), 'Cm': ('C', 'D#', 'G'), 'Eb': ('D#', 'G', 'A#'), 'Ab': ('G#', 'C', 'D#')}
SHARPS = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
SCALES = {'C': [0, 2, 4, 5, 7, 9, 11], 'F': [5, 7, 9, 10, 0, 2, 4], 'G': [7, 9, 11, 0, 2, 4, 6], 'Am': [9, 11, 0, 2, 4, 5, 7],
          'Dm': [2, 4, 5, 7, 9, 10, 0], 'Dyo': [2, 4, 7, 9, 11], 'Eb': [3, 5, 7, 8, 10, 0, 2]}


def hz(n):
    """'C5' → 周波数"""
    return 440 * 2 ** ((NAMES[n[:-1]] + 12 * (int(n[-1]) + 1) - 69) / 12)


def env(n, attack=0.004, release=0.03):
    """音の始まりと終わりをなめらかに（プチッという音を消す）"""
    e = np.ones(n)
    a, r = min(n, int(SR * attack)), min(n, int(SR * release))
    if a: e[:a] = np.linspace(0, 1, a)
    if r: e[-r:] *= np.linspace(1, 0, r)
    return e


def square(f, n, duty=0.25):
    t = np.arange(n) / SR
    return np.where((t * f) % 1 < duty, 1.0, -1.0)


def tri(f, n):
    t = np.arange(n) / SR
    return 2 * np.abs(2 * ((t * f) % 1) - 1) - 1


class Song:
    def __init__(self, bpm, beats):
        self.spb = 60 / bpm                       # 1拍の秒数
        self.buf = np.zeros(int(round(SR * self.spb * beats)))

    def put(self, beat, wave_):
        # 曲はくり返し流すので、終わりからはみ出した分は頭に重ねる（つなぎ目で音がぷつっと切れないように）
        L, i = len(self.buf), int(round(SR * self.spb * beat)) % len(self.buf)
        for k in range(0, len(wave_), L):
            part = wave_[k:k + L]
            n = min(len(part), L - i)
            self.buf[i:i + n] += part[:n]
            self.buf[:len(part) - n] += part[n:]

    def line(self, notes, fn, vol, gate=0.9, start=0.0, **kw):
        """notes = [(音名 or None, 拍数), ...] を順に鳴らす"""
        b = start
        for name, d in notes:
            if name:
                n = int(SR * self.spb * d * gate)
                self.put(b, fn(hz(name), n, **kw) * env(n) * vol)
            b += d

    def noise(self, beat, length, vol, color=1):
        n = int(SR * length)
        w = np.random.default_rng(int(beat * 1000)).uniform(-1, 1, n)
        if color > 1: w = np.repeat(w[::color], color)[:n]   # 粗いノイズほど低い音（スネア寄り）
        self.put(beat, w * np.exp(-np.arange(n) / (SR * length / 4)) * vol)

    def kick(self, beat, vol=0.5):
        n = int(SR * 0.12)
        t = np.arange(n) / SR
        f = 150 * np.exp(-t * 30) + 45
        self.put(beat, np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 25) * vol)

    def mp3(self, name):
        x = self.buf / max(1.0, np.abs(self.buf).max() / 0.9)
        save(name, x)


def save(name, x, small=False):
    """small：アルバムの曲は通信量を減らすため 22kHz・48kbps にする"""
    wav = os.path.join(OUT, name + '.wav')
    with wave.open(wav, 'wb') as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR)
        w.writeframes((np.clip(x, -1, 1) * 32767).astype('<i2').tobytes())
    # ファミコンの音の出口のように、高すぎる音と低すぎる音を少し削って耳あたりをやわらかくする
    subprocess.run(['ffmpeg', '-loglevel', 'error', '-y', '-i', wav, '-af', 'highpass=f=40,lowpass=f=6500', '-ac', '1', *(['-ar', '22050', '-b:a', '48k'] if small else ['-b:a', '96k']),
                    os.path.join(OUT, name + '.mp3')], check=True)
    os.remove(wav)
    print(f'{name}.mp3: {len(x) / SR:.1f}s')


def midi(n):
    return NAMES[n[:-1]] + 12 * (int(n[-1]) + 1)


def name(m):
    return f'{SHARPS[m % 12]}{m // 12 - 1}'


RHYTHMS = [[1, 1, 1, 1], [1.5, .5, 1, 1], [.5, .5, 1, 2], [1, .5, .5, 2], [2, 1, 1], [.5, .5, .5, .5, 1, 1], [1, 1, 2], [1.5, .5, 2],
           [.5, .5, 1, .5, .5, 1], [1, .5, .5, 1, 1], [3, 1], [.5, 1, .5, 2]]


def compose(chords, scale, seed, lo='C5', hi='A6', rhythms=None, busy=1.0):
    """コード進行（16小節）に合う旋律を作る。1〜4小節の旋律を13〜16小節でくり返し（AABA）、最後は主音で終わる。
    強い拍とのばす音はコードの音、弱い拍は音階の音。前の音から近い音を選ぶ"""
    rng = np.random.default_rng(seed)
    pool = rhythms or RHYTHMS
    lo_m, hi_m, tonic = midi(lo), midi(hi), scale[0]
    pcs = set(scale)
    cur = [(lo_m + hi_m) // 2]
    bar_r = {}

    def rhythm(b):
        if b not in bar_r:
            r = pool[int(rng.integers(len(pool)))]
            if busy < 1 and rng.random() > busy: r = [2, 2] if rng.random() < .5 else [4]
            bar_r[b] = r
        return bar_r[b]

    def bar_notes(b, c, last=False):
        if last:
            m = min((x for x in range(lo_m, hi_m + 1) if x % 12 == tonic), key=lambda x: abs(x - cur[0]))
            cur[0] = m
            return [(name(m), 3), (None, 1)]
        out, pos = [], 0.0
        ct = {NAMES[x] for x in CHORDS[c]}
        r = rhythm(b % 8 if b < 8 else b)
        for k, d in enumerate(r):
            if b in (3, 7, 11) and k == len(r) - 1 and d >= 1:   # 句の終わりは少し休む
                out.append((None, d)); pos += d; continue
            strong = pos in (0, 2) or d >= 1
            cand = [x for x in range(lo_m, hi_m + 1) if x % 12 in (ct if strong else pcs)]
            w = np.array([np.exp(-abs(x - cur[0]) / 2.5) * (0.3 if x == cur[0] else 1) for x in cand])
            m = int(rng.choice(cand, p=w / w.sum()))
            cur[0] = m
            out.append((name(m), d)); pos += d
        return out

    mel, first = [], []
    for b, c in enumerate(chords):
        if 12 <= b < 15 and chords[b] == chords[b - 12]:
            notes = first[b - 12]                                       # 終わりの句は、はじめの句をくり返す
        else:
            notes = bar_notes(b, c, last=(b == 15))
        if b < 4: first.append(notes)
        mel += notes
    assert abs(sum(d for _, d in mel) - 64) < 1e-9
    return mel


def bass_eighths(song, chords, octave=2):
    """ベース：コードの根音を8分音符で「低い・高い」と交互に"""
    for bar, c in enumerate(chords):
        root = CHORDS[c][0]
        for k in range(8):
            song.line([(f'{root}{octave + (k % 2)}', 0.5)], tri, 0.30, gate=0.85, start=bar * 4 + k * 0.5)


def arp_eighths(song, chords, octave=4, vol=0.07):
    """和音：コードの音を8分音符で上下に分散させる（小さめ）"""
    pat = [0, 1, 2, 1, 0, 1, 2, 1]
    for bar, c in enumerate(chords):
        for k, i in enumerate(pat):
            song.line([(f'{CHORDS[c][i]}{octave}', 0.5)], square, vol, gate=0.7, start=bar * 4 + k * 0.5, duty=0.5)


# ふだんの曲：ハ長調・120bpm・16小節（約32秒でくり返し）。明るく、歩きたくなる行進風
FIELD_CHORDS = ['C', 'Am', 'F', 'G', 'C', 'Am', 'Dm', 'G', 'F', 'G', 'Em', 'Am', 'F', 'G', 'C', 'C']
FIELD_MELODY = [
    ('E5', .5), ('G5', .5), ('C6', 1), ('B5', .5), ('G5', .5), ('E5', 1),
    ('A5', 1), ('C6', .5), ('A5', .5), ('E5', 1.5), (None, .5),
    ('F5', .5), ('A5', .5), ('C6', 1), ('D6', .5), ('C6', .5), ('A5', 1),
    ('G5', 1.5), ('A5', .5), ('B5', 1), ('D6', 1),
    ('E6', 1), ('D6', .5), ('C6', .5), ('G5', 1), ('E5', 1),
    ('A5', .5), ('B5', .5), ('C6', .5), ('E6', .5), ('D6', 1), ('C6', 1),
    ('D6', 1.5), ('F6', .5), ('E6', .5), ('D6', .5), ('C6', .5), ('A5', .5),
    ('B5', 1), ('G5', .5), ('A5', .5), ('B5', 1), (None, 1),
    ('A5', 1), ('C6', 1), ('F6', 1.5), ('E6', .5),
    ('D6', 1), ('B5', 1), ('G5', 1.5), (None, .5),
    ('G5', .5), ('B5', .5), ('E6', 1), ('D6', .5), ('B5', .5), ('G5', 1),
    ('A5', .5), ('C6', .5), ('E6', 1), ('D6', 1), ('C6', 1),
    ('F6', 1), ('E6', .5), ('D6', .5), ('C6', 1), ('A5', 1),
    ('B5', 1), ('D6', 1), ('G6', 1.5), ('F6', .5),
    ('E6', 1.5), ('D6', .5), ('C6', 1), ('G5', 1),
    ('C6', 2), (None, 1), ('G5', .5), ('B5', .5),
]

# せかいちずの曲：ハ長調・100bpm・16小節（約38秒でくり返し）。ゆったり雄大に
WORLD_CHORDS = ['F', 'G', 'Em', 'Am', 'Dm', 'G', 'C', 'C', 'F', 'G', 'Em', 'Am', 'Dm', 'E', 'Am', 'G']
WORLD_MELODY = [
    ('A5', 2), ('C6', 1), ('F6', 1),
    ('G6', 1.5), ('F6', .5), ('E6', 1), ('D6', 1),
    ('E6', 2), ('B5', 1), ('G5', 1),
    ('A5', 3), (None, 1),
    ('F5', 1), ('A5', 1), ('D6', 1.5), ('E6', .5),
    ('F6', 1), ('E6', 1), ('D6', 1), ('B5', 1),
    ('C6', 2), ('E6', 1), ('G6', 1),
    ('G6', 3), (None, 1),
    ('A6', 2), ('G6', 1), ('F6', 1),
    ('G6', 1), ('F6', .5), ('E6', .5), ('D6', 2),
    ('E6', 1.5), ('D6', .5), ('B5', 1), ('G5', 1),
    ('C6', 1), ('B5', 1), ('A5', 2),
    ('D6', 1), ('F6', 1), ('A6', 1.5), ('G6', .5),
    ('G#6', 2), ('B5', 1), ('E6', 1),
    ('C6', 1), ('A5', 1), ('E6', 1), ('A6', 1),
    ('G6', 2), ('D6', 1), ('B5', 1),
]


def field():
    assert sum(d for _, d in FIELD_MELODY) == 64
    s = Song(120, 64)
    s.line(FIELD_MELODY, square, 0.20, gate=0.88, duty=0.25)
    arp_eighths(s, FIELD_CHORDS)
    bass_eighths(s, FIELD_CHORDS)
    for b in range(64):                                   # ドラム：1・3拍目にキック、2・4拍目にスネア、8分でハイハット
        if b % 2 == 0: s.kick(b)
        else: s.noise(b, 0.12, 0.16, color=4)
        s.noise(b, 0.03, 0.05); s.noise(b + 0.5, 0.03, 0.04)
    s.mp3('field')


def world():
    assert sum(d for _, d in WORLD_MELODY) == 64
    s = Song(100, 64)
    s.line(WORLD_MELODY, square, 0.20, gate=0.95, duty=0.25)
    s.line([(m, d) for m, d in WORLD_MELODY], square, 0.06, gate=0.9, start=0.25, duty=0.125)   # 少し遅れた残響で広がりを
    for bar, c in enumerate(WORLD_CHORDS):               # 和音：4分音符で3音を重ねる
        for k in range(4):
            for i, nm in enumerate(CHORDS[c]):
                s.line([(f'{nm}{4}', 1)], square, 0.035, gate=0.8, start=bar * 4 + k, duty=0.5)
        root, fifth = CHORDS[c][0], CHORDS[c][2]           # ベース：2分音符で根音と5度
        s.line([(f'{root}2', 2), (f'{fifth}2', 2)], tri, 0.34, gate=0.92, start=bar * 4)
        s.kick(bar * 4, 0.45)
        if bar % 4 == 3:                                   # 4小節ごとに小さなロール
            for k in range(4): s.noise(bar * 4 + 3 + k * 0.25, 0.08, 0.06 + k * 0.02, color=4)
    s.mp3('world')


def jingles():
    def seq(parts, fn, vol, **kw):
        out = []
        for n, d in parts:
            k = int(SR * d)
            out.append(np.zeros(k) if n is None else fn(hz(n), k, **kw) * env(k) * vol)
        return np.concatenate(out)

    def mix(*ts):
        m = np.zeros(max(len(t) for t in ts))
        for t in ts: m[:len(t)] += t
        return np.clip(m, -0.95, 0.95)

    # チェックイン：上がっていく分散和音で「ゲット！」
    save('checkin', mix(seq([('G5', .06), ('C6', .06), ('E6', .06), ('G6', .06), (None, .03), ('E6', .07), ('G6', .30)], square, 0.22, duty=0.125),
                        seq([('C4', .24), (None, .03), ('C4', .37)], tri, 0.25)))
    # レベルアップ：短いファンファーレ
    save('levelup', mix(seq([('C5', .10), ('E5', .10), ('G5', .10), ('C6', .22), (None, .04), ('A5', .10), ('B5', .10), ('C6', .10), ('D6', .10), ('E6', .55)], square, 0.22),
                        seq([('E4', .10), ('G4', .10), ('C5', .10), ('E5', .22), (None, .04), ('F5', .10), ('G5', .10), ('A5', .10), ('B5', .10), ('C6', .55)], square, 0.12, duty=0.5),
                        seq([('C3', .52), (None, .04), ('F3', .20), ('G3', .20), ('C3', .55)], tri, 0.25)))
    # 呼びとめ：まちの人と目が合って「！」。はね上がる2音を2回と、下の短い合いの手
    save('eye', mix(seq([('E5', .05), ('B5', .09), (None, .03), ('E5', .05), ('B5', .09), (None, .03), ('A5', .06), ('E6', .22)], square, 0.2, duty=0.125),
                    seq([('E3', .08), (None, .09), ('E3', .08), (None, .12), ('A3', .28)], tri, 0.25)))


# ---------- BGM のバリエーション（時間・天気・ふだんの曲の入れかわり） ----------
def drums_march(s, bars, vol=1.0):
    for b in range(bars * 4):
        if b % 2 == 0: s.kick(b, 0.45 * vol)
        else: s.noise(b, 0.12, 0.15 * vol, color=4)
        s.noise(b, 0.03, 0.045 * vol); s.noise(b + 0.5, 0.03, 0.035 * vol)


def field2():
    """まちかど：ヘ長調・132bpm。はずむ8分のリズムで、商店街を歩くような軽い曲"""
    ch = ['F', 'C', 'Dm', 'Bb', 'F', 'C', 'Bb', 'C', 'Dm', 'Am', 'Bb', 'C', 'F', 'C', 'Bb', 'F']
    s = Song(132, 64)
    s.line(compose(ch, SCALES['F'], 21, 'C5', 'A6'), square, 0.19, gate=0.8, duty=0.125)
    for bar, c in enumerate(ch):                 # 裏打ちの和音（2・4拍目のうら）
        for k in (0.5, 1.5, 2.5, 3.5):
            for nm in CHORDS[c]:
                s.line([(f'{nm}4', .5)], square, 0.03, gate=0.5, start=bar * 4 + k, duty=0.5)
    bass_eighths(s, ch)
    drums_march(s, 16, 0.9)
    s.mp3('field2')


def field3():
    """おまつり：ヨナ抜き（日本の五音音階）・140bpm。太鼓と笛のような、西尾のお祭りの気分"""
    ch = ['D', 'G', 'D', 'A', 'D', 'G', 'Bm', 'A', 'G', 'D', 'G', 'A', 'D', 'G', 'D', 'D']
    s = Song(140, 64)
    mel = compose(ch, SCALES['Dyo'], 33, 'D5', 'B6', rhythms=[[1, .5, .5, 1, 1], [.5, .5, 1, .5, .5, 1], [1, 1, 1, 1], [1.5, .5, 1, 1], [.5, .5, .5, .5, 2]])
    s.line(mel, square, 0.18, gate=0.85, duty=0.125)                     # 笛
    s.line(mel, square, 0.05, gate=0.8, start=0.5, duty=0.25)            # こだま
    for bar, c in enumerate(ch):
        root = CHORDS[c][0]
        s.line([(f'{root}2', 1), (f'{root}3', 1), (f'{root}2', 1), (f'{root}3', 1)], tri, 0.3, gate=0.7, start=bar * 4)
    for b in range(64):                          # 太鼓：ドン・ドドン、かね（高いノイズ）
        s.kick(b, 0.55 if b % 2 == 0 else 0.35)
        if b % 4 == 3: s.kick(b + 0.5, 0.4)
        s.noise(b + 0.5, 0.05, 0.06)
        if b % 8 == 7: s.noise(b + 0.75, 0.04, 0.05)
    s.mp3('field3')


def morning():
    """朝：ト長調・108bpm。すんだ音で、のびのびと"""
    ch = ['G', 'D', 'Em', 'C', 'G', 'D', 'C', 'D', 'Em', 'Bm', 'C', 'D', 'G', 'D', 'C', 'G']
    s = Song(108, 64)
    s.line(compose(ch, SCALES['G'], 5, 'D5', 'B6', busy=0.8), square, 0.17, gate=0.92, duty=0.125)
    arp_eighths(s, ch, vol=0.06)
    for bar, c in enumerate(ch):
        s.line([(f'{CHORDS[c][0]}2', 2), (f'{CHORDS[c][2]}2', 2)], tri, 0.3, gate=0.9, start=bar * 4)
        s.kick(bar * 4, 0.35); s.noise(bar * 4 + 2, 0.08, 0.06, color=4)
    s.mp3('morning')


def evening():
    """夕方：イ短調〜ハ長調・90bpm。夕焼けのなつかしい曲"""
    ch = ['Am', 'F', 'C', 'G', 'Am', 'F', 'G', 'E', 'F', 'G', 'Em', 'Am', 'Am', 'F', 'G', 'C']
    s = Song(90, 64)
    mel = compose(ch, SCALES['Am'], 9, 'C5', 'G6', busy=0.7)
    s.line(mel, square, 0.17, gate=0.95, duty=0.25)
    s.line(mel, square, 0.05, gate=0.9, start=0.75, duty=0.125)
    for bar, c in enumerate(ch):
        for k in range(4):
            for nm in CHORDS[c]:
                s.line([(f'{nm}4', 1)], square, 0.025, gate=0.9, start=bar * 4 + k, duty=0.5)
        s.line([(f'{CHORDS[c][0]}2', 4)], tri, 0.32, gate=0.95, start=bar * 4)
    s.mp3('evening')


def night():
    """夜：ニ短調・76bpm。しずかな夜道。虫の声（高い短い音）"""
    ch = ['Dm', 'Bb', 'C', 'Am', 'Dm', 'Bb', 'Gm', 'A', 'Bb', 'C', 'Am', 'Dm', 'Dm', 'Bb', 'A', 'Dm']
    s = Song(76, 64)
    s.line(compose(ch, SCALES['Dm'], 13, 'A4', 'F6', busy=0.55), tri, 0.30, gate=0.95)
    arp_eighths(s, ch, octave=4, vol=0.04)
    for bar, c in enumerate(ch):
        s.line([(f'{CHORDS[c][0]}2', 4)], tri, 0.22, gate=0.95, start=bar * 4)
    rng = np.random.default_rng(76)
    for b in range(64):                          # 虫の声
        if rng.random() < 0.35:
            for k in range(3): s.line([('E7' if b % 2 else 'D#7', 0.05)], square, 0.02, gate=0.6, start=b + 0.25 + k * 0.08, duty=0.5)
    s.mp3('night')


def rain():
    """雨：変ホ長調・84bpm。しっとりした雨の日。雨つぶ（短いノイズ）"""
    ch = ['Eb', 'Cm', 'Ab', 'Bb', 'Eb', 'Cm', 'Ab', 'Bb', 'Cm', 'Gm', 'Ab', 'Bb', 'Eb', 'Cm', 'Bb', 'Eb']
    s = Song(84, 64)
    s.line(compose(ch, SCALES['Eb'], 17, 'A#4', 'G6', busy=0.65), square, 0.15, gate=0.9, duty=0.5)
    pat = [0, 2, 1, 2, 0, 2, 1, 2]
    for bar, c in enumerate(ch):
        for k, i in enumerate(pat):
            s.line([(f'{CHORDS[c][i]}5', .5)], tri, 0.10, gate=0.6, start=bar * 4 + k * 0.5)
        s.line([(f'{CHORDS[c][0]}2', 4)], tri, 0.26, gate=0.95, start=bar * 4)
    rng = np.random.default_rng(84)
    for k in range(64 * 6):                      # 雨つぶ
        s.noise(k / 6 + rng.uniform(0, 0.1), 0.015, rng.uniform(0.01, 0.035))
    s.mp3('rain')


# ---------- アルバム「西尾の音」100曲（nishio-go/bgm/s/001.mp3〜100.mp3 と list.json） ----------
# 明るく西尾らしい曲：ヨナ抜き（長調の5音）の旋律を、篠笛・三味線・琴に似せたファミコン風の音と矩形波で鳴らし、
# 長調の和音の進行（I・IV・V・vi など）のはずむベースとうら拍の和音、祭りの太鼓（大太鼓・締太鼓・鉦・拍子木）を合わせる。
# 夜は夜まつり、夕方は盆おどり、雨は雨あがり（運営者のことば「落ち着いた感じではなく、明るく西尾らしい bgm」）。旋律は compose_jp() が作る。
# 題名は、ゲームの名所・名物・祭り（spots.json などにあるもの）の名前に曲調の言葉をつけたもの。どれもオリジナルの曲で、
# その祭りや土地で実際に演奏される音楽ではない。昼60曲・朝10曲・夕方10曲・夜10曲・雨10曲。22kHz・48kbps のモノラル（1曲 200KB くらい）
JP_SCALE = {'yo': [0, 2, 4, 7, 9], 'minyo': [0, 3, 5, 7, 10], 'ritsu': [0, 2, 5, 7, 9], 'miyako': [0, 1, 5, 7, 8]}
JP_SCALE_J = {'yo': 'ヨナ抜き', 'minyo': '民謡音階', 'ritsu': '律音階', 'miyako': '都節'}
KEYJ = ['ハ', '変ニ', 'ニ', '変ホ', 'ホ', 'ヘ', '嬰ヘ', 'ト', '変イ', 'イ', '変ロ', 'ロ']


def fue(f, n):
    """篠笛：三角波に少しの倍音、あとからかかるビブラート、息の音"""
    t = np.arange(n) / SR
    vib = 1 + 0.006 * np.sin(2 * np.pi * 5.5 * t) * np.clip((t - 0.15) / 0.2, 0, 1)
    ph = np.cumsum(f * vib) / SR
    w = 2 * np.abs(2 * (ph % 1) - 1) - 1 + 0.25 * np.sin(4 * np.pi * ph)
    breath = np.random.default_rng(int(f * 7) % 9973).uniform(-1, 1, n) * 0.06 * np.exp(-t / 0.08)
    return w * 0.8 + breath


def koto(f, n):
    """琴：はじいた音（三角波と矩形波をまぜ、はじめに少し高く、すぐに減衰）"""
    t = np.arange(n) / SR
    ph = np.cumsum(f * (1 + 0.01 * np.exp(-t / 0.02))) / SR
    w = 0.7 * (2 * np.abs(2 * (ph % 1) - 1) - 1) + 0.3 * np.where(ph % 1 < 0.3, 1.0, -1.0)
    return w * np.exp(-t / 0.35)


def shamisen(f, n):
    """三味線：細い矩形波を強くはじいて、早く消える。ばちの当たる音"""
    t = np.arange(n) / SR
    w = np.where((t * f) % 1 < 0.2, 1.0, -1.0) * np.exp(-t / 0.13)
    click = np.random.default_rng(int(f) % 997).uniform(-1, 1, n) * np.exp(-t / 0.006) * 0.5
    return w + click


def shaku(f, n):
    """尺八：ゆっくり立ちあがる三角波に、ゆれと強い息の音"""
    t = np.arange(n) / SR
    ph = np.cumsum(f * (1 + 0.008 * np.sin(2 * np.pi * 4.2 * t))) / SR
    w = (2 * np.abs(2 * (ph % 1) - 1) - 1) * np.clip(t / 0.09, 0, 1)
    breath = np.random.default_rng(int(f * 3) % 9973).uniform(-1, 1, n)
    breath = np.convolve(breath, np.ones(6) / 6, 'same') * 0.18
    return w + breath


class JSong(Song):
    def taiko(self, beat, vol=0.5):
        """大太鼓：低く長い「ドン」"""
        n = int(SR * 0.35)
        t = np.arange(n) / SR
        f = 90 * np.exp(-t * 12) + 48
        self.put(beat, np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 9) * env(n, 0.001, 0.05) * vol)   # 終わりは 0 まで消してから切る（プチッという音を出さない）

    def shime(self, beat, vol=0.18):
        """締太鼓：高く短い「テン」"""
        n = int(SR * 0.08)
        t = np.arange(n) / SR
        f = 260 * np.exp(-t * 20) + 190
        self.put(beat, np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 45) * env(n, 0.001, 0.02) * vol)

    def kane(self, beat, vol=0.06):
        """鉦（チャンチキ）：金属の高い音（倍音の合わない正弦波を重ねる）"""
        n = int(SR * 0.22)
        t = np.arange(n) / SR
        w = sum(np.sin(2 * np.pi * 1800 * r * t) * a for r, a in ((1, 1), (2.76, .6), (5.4, .35)))
        self.put(beat, w * np.exp(-t * 22) * env(n, 0.001, 0.03) * vol)

    def hyoshigi(self, beat, vol=0.1):
        """拍子木：かたく短い「カッ」"""
        n = int(SR * 0.03)
        t = np.arange(n) / SR
        self.put(beat, np.sin(2 * np.pi * 2400 * t) * np.exp(-t * 160) * env(n, 0.0005, 0.01) * vol)

    def waves(self, beats, vol=0.05, seed=1):
        """三河湾の波：ゆっくり大きくなったり小さくなったりする、こもったノイズ"""
        n = len(self.buf)
        w = np.random.default_rng(seed).uniform(-1, 1, n)
        w = np.convolve(w, np.ones(40) / 40, 'same')
        t = np.arange(n) / SR
        self.buf += w * (0.5 + 0.5 * np.sin(2 * np.pi * t / (self.spb * 8))) * vol * 4


def compose_jp(scale, seed, lo, hi, rhythms, bars=16, ornament=0.0, tonic=None, chords=None):
    """日本の音階の旋律（16小節）。4小節の句を A・A'・B・A に並べる。動きはとなりの音へ（ときどき跳ぶ）。
    句の終わりは「核音」（主音・4度・5度）でのばし、最後は主音で終わる。ornament：前打音（となりの上の音を短く）をつける割合。
    tonic：主音（MIDI の音の高さ。音域の下限 lo とは別。省くと lo を主音にする）
    chords：16小節ぶんの和音の音（主音からの半音の数の集合）。あれば、小節の頭と句の終わりの音を和音の音にする（明るい伴奏に合う旋律）"""
    rng = np.random.default_rng(seed)
    lo_m, hi_m = midi(lo), midi(hi)
    t0 = lo_m if tonic is None else tonic
    pitches = [m for m in range(lo_m, hi_m + 1) if (m - t0) % 12 in scale]
    tonic_ix = [k for k, m in enumerate(pitches) if (m - t0) % 12 == 0]
    nucl_ix = [k for k, m in enumerate(pitches) if (m - t0) % 12 in (0, 5, 7)]
    cur = [len(pitches) // 2]

    def step():
        r = rng.random()
        d = 1 if r < .55 else 2 if r < .8 else 0 if r < .88 else 3
        k = cur[0] + d * (1 if rng.random() < .5 else -1)
        if k < 0 or k >= len(pitches): k = cur[0] - (k - cur[0])
        cur[0] = max(0, min(len(pitches) - 1, k))
        return pitches[cur[0]]

    def land(cands):
        k = min(cands, key=lambda x: abs(x - cur[0]))
        cur[0] = k
        return pitches[k]

    def chord_ix(bar):
        if not chords:
            return None
        ix = [k for k, m in enumerate(pitches) if (m - t0) % 12 in chords[bar]]
        return ix or None

    def phrase(p0, final=False):
        """4小節（小節ごとの音の並びのリスト）。4小節目の終わりは核音（最後の句は主音）でのばす。p0：はじめの小節の番号"""
        bars_ = []
        for b in range(4):
            r = rhythms[int(rng.integers(len(rhythms)))]
            ci = chord_ix(p0 + b)
            out = []
            for k, d in enumerate(r):
                last = b == 3 and k == len(r) - 1
                if last:
                    m = land(tonic_ix if final else (ci or nucl_ix))
                elif ci and (k == 0 or d >= 1.5):   # 小節の頭と長い音は和音の音
                    m = land(ci) if rng.random() < .85 else step()
                else:
                    m = step()
                out.append((name(m), d))
            bars_.append(out)
        return bars_

    a = phrase(0)
    cur[0] = len(pitches) // 2
    a2 = a[:2] + phrase(4)[2:]                         # A'：はじめの2小節は A と同じ、あとの2小節を変える
    b = phrase(8)
    cur[0] = len(pitches) // 2
    fixed = [x for bar in a + a2 + b + phrase(12, final=True) for x in bar]
    assert abs(sum(d for _, d in fixed) - 64) < 1e-9
    if ornament:                                       # 前打音：のばす音の前に、となりの上の音を短く
        orn = []
        for nm, d in fixed:
            if d >= 1 and rng.random() < ornament:
                m = midi(nm); up = min([p for p in pitches if p > m] or [m])
                orn += [(name(up), 0.125), (nm, d - 0.125)]
            else:
                orn.append((nm, d))
        fixed = orn
    return fixed


JR = {   # 曲調のリズム（1小節＝4拍）
    'even': [[1, 1, 1, 1], [1, 1, 2], [2, 1, 1], [.5, .5, 1, 2], [1, .5, .5, 2], [2, 2]],
    'lively': [[1, .5, .5, 1, 1], [.5, .5, 1, .5, .5, 1], [1, 1, 1, 1], [1.5, .5, 1, 1], [.5, .5, .5, .5, 2], [.5, .5, 1, 2]],
    'ondo': [[1.5, .5, 1.5, .5], [1, 1, 1.5, .5], [1.5, .5, 2], [1, 1, 2], [.5, .5, 1, 2]],
    'slow': [[2, 2], [3, 1], [4], [2, 1, 1], [1, 1, 2]],
    'quick': [[.5] * 8, [.5, .5, 1, .5, .5, 1], [.25, .25, .5, 1, 1, 1], [.5, .5, .5, .5, 1, 1], [1, .5, .5, 1, 1]],
}
# 曲調：テンポの幅・旋律の楽器・リズム・前打音・題名の言葉。どれも明るい曲（ヨナ抜きの長調の旋律に、長調の和音の伴奏）
JSTYLE = {
    'hayashi': ((136, 152), fue, 'lively', .25, 'ばやし'),          # 祭りのはやし（大太鼓・締太鼓・鉦）
    'ondo': ((118, 130), shamisen, 'ondo', 0, 'おどり'),             # 音頭（ドン・ドドン、拍子木、手拍子）
    'chatsumi': ((122, 136), fue, 'even', .15, 'さんぽ'),            # 茶摘みの道をあるく行進
    'umi': ((116, 128), fue, 'lively', .2, 'の風'),                  # 三河湾の海風（波の音と、はずむリズム）
    'hayabiki': ((152, 168), shamisen, 'quick', 0, 'かけあし'),      # 早弾き
    'asa': ((118, 130), fue, 'even', .1, 'の朝'),                    # 朝（鳥の声）
    'bon': ((114, 126), shamisen, 'ondo', 0, 'のぼんおどり'),        # 夕方の盆おどり
    'yomatsuri': ((126, 140), fue, 'lively', .2, 'の夜まつり'),      # 夜まつり（一色大提灯・鳥羽の火祭り のような夏の夜の祭り）
    'ameagari': ((114, 126), koto, 'even', 0, 'の雨あがり'),         # 雨あがり（琴の分散音と、小さな雨つぶ）
}
# 和音の進行（主音からの半音の数と、長三和音 M・短三和音 m）。4小節ずつ。最後の句は主音の和音で終わる
CH = {'I': (0, 'M'), 'ii': (2, 'm'), 'iii': (4, 'm'), 'IV': (5, 'M'), 'V': (7, 'M'), 'vi': (9, 'm')}
PROG_A = [['I', 'IV', 'V', 'I'], ['I', 'vi', 'IV', 'V'], ['I', 'V', 'vi', 'IV'], ['IV', 'V', 'iii', 'vi'], ['I', 'IV', 'I', 'V']]
PROG_END = [['IV', 'V', 'I', 'I'], ['vi', 'IV', 'V', 'I'], ['ii', 'V', 'I', 'I'], ['IV', 'V', 'iii', 'I']]
# 題名につかう西尾の名所・名物・祭り（ゲームの spots.json・名物の説明にあるもの）。曲調に合うものだけを組みあわせる
MOTIF = {
    'umi': ['三河湾', '佐久島', '一色の港', '宮崎海岸', '大浦海岸', 'トンボロ干潟', '幡豆', 'カモメ', 'あさり', '吉良温泉', '寺津', '平坂'],
    'matsuri': ['一色大提灯', '鳥羽の火祭り', 'てんてこ祭', 'おまんと祭', '祇園', '天狗', '中畑', '西尾城', '吉良吉田', '米津'],
    'cha': ['抹茶', '茶畑', '茶摘み', '天竹の綿', '室場', '三和', '福地', '八ツ面山'],
    'machi': ['西尾城', '岩瀬文庫', '旧近衛邸', '尚古荘', '西尾駅', '東条城', '華蔵寺', '実相寺', '久麻久神社', 'うなぎ', 'えびせん'],
    'shizen': ['八ツ面山', '雲母', '矢作川', '黄金堤', '三ヶ根', '平原の滝', 'あじさい', '茶畑', 'トンボロ干潟', '佐久島'],
}
JMOTIF = {'hayashi': ['matsuri', 'machi'], 'ondo': ['matsuri', 'machi', 'umi'], 'chatsumi': ['cha', 'shizen', 'machi'],
          'umi': ['umi'], 'hayabiki': ['matsuri', 'machi', 'umi'], 'asa': ['cha', 'shizen', 'machi'], 'bon': ['matsuri', 'machi', 'umi'],
          'yomatsuri': ['matsuri', 'machi'], 'ameagari': ['shizen', 'machi', 'cha']}
JMOOD = {'day': ['hayashi'] * 14 + ['ondo'] * 12 + ['chatsumi'] * 12 + ['umi'] * 10 + ['hayabiki'] * 12,
         'morning': ['asa'] * 6 + ['chatsumi'] * 4, 'evening': ['bon'] * 6 + ['ondo'] * 4, 'night': ['yomatsuri'] * 7 + ['hayashi'] * 3,
         'rain': ['ameagari'] * 10}


def triad(root, q):
    return {root % 12, (root + (4 if q == 'M' else 3)) % 12, (root + 7) % 12}


def album_song(i, mood, style, motif):
    """「西尾の音」の i 曲目（1〜100）を作って mp3 にし、一覧の1行を返す。明るい曲：
    ヨナ抜き（長調の5音）の旋律を、長調の和音の進行（I・IV・V・vi など）に合わせ、はずむベース（根音と5度）と、うら拍の和音、
    曲調ごとの太鼓（大太鼓・締太鼓・鉦・拍子木・手拍子）で鳴らす。旋律は篠笛・三味線・琴に、ファミコン風の矩形波を重ねてきらきらさせる"""
    rng = np.random.default_rng(7000 + i)
    (t_lo, t_hi), inst, rk, orn, word = JSTYLE[style]
    bpm = int(rng.integers(t_lo, t_hi + 1))
    root = int(rng.integers(12))
    base = 72 + root - (12 if root > 5 else 0)        # 旋律の主音（ここから上へ）
    pa = PROG_A[int(rng.integers(len(PROG_A)))]
    pb = PROG_A[int(rng.integers(len(PROG_A)))]
    pe = PROG_END[int(rng.integers(len(PROG_END)))]
    prog = pa + pa + pb + pe                          # A・A'・B・A の句に、和音の進行を合わせる
    chords = [triad(*CH[c]) for c in prog]
    lo, hi = (name(base - 5), name(base + 12)) if inst is koto else (name(base), name(base + 16))
    s = JSong(bpm, 64)
    mel = compose_jp(JP_SCALE['yo'], 9000 + i, lo, hi, JR[rk], ornament=orn, tonic=base, chords=chords)
    vol = {fue: 0.24, koto: 0.30, shamisen: 0.22}[inst]
    s.line(mel, inst, vol, gate=0.95 if inst is fue else 1.0)
    s.line(mel, square, 0.045, gate=0.7, duty=0.25)   # 同じ旋律を矩形波で重ねる（明るく、きらきら）
    if inst is shamisen:                              # 三味線の曲は、笛が少しおくれて同じ旋律をなぞる（ヘテロフォニー）
        s.line(mel, fue, 0.07, gate=0.9, start=0.5)
    for bar, c in enumerate(prog):                    # 伴奏：はずむベースと、うら拍の和音
        t0 = bar * 4
        r0, q = CH[c]
        rt = base - 24 + r0 - (12 if r0 > 6 else 0)
        s.line([(name(rt), 1), (name(rt + 7), .5), (name(rt), .5), (name(rt + 12), 1), (name(rt + 7), 1)], tri, 0.26, gate=0.8, start=t0)
        notes = sorted(base - 12 + pc for pc in triad(r0, q))   # 主音の1オクターブ下から
        for k in (0.5, 1.5, 2.5, 3.5):
            for n_ in notes:
                s.line([(name(n_), .5)], square, 0.022, gate=0.4, start=t0 + k, duty=0.125)
        if style in ('chatsumi', 'asa', 'ameagari', 'umi'):   # 琴の分散和音
            arp = notes + [notes[0] + 12, notes[1] + 12, notes[2] + 12, notes[0] + 24, notes[2] + 12]
            for k, n_ in enumerate(arp[:8]):
                s.line([(name(n_), .5)], koto, 0.07, start=t0 + k * .5)
    for b in range(64):                               # 太鼓（曲調ごと）
        bar_end = b % 16 == 15
        if style in ('hayashi', 'yomatsuri'):         # 祭りのはやし：大太鼓・締太鼓・鉦（チャンチキ）
            if b % 2 == 0: s.taiko(b, 0.5)
            if b % 4 == 3: s.taiko(b + .5, 0.35)
            for k in (0, .5, .75): s.shime(b + k, 0.13)
            if b % 2 == 1: s.kane(b, 0.05); s.kane(b + .5, 0.04)
            s.noise(b + .5, 0.03, 0.025)
        elif style == 'hayabiki':
            s.taiko(b, 0.45)
            for k in (0, .25, .5, .75): s.shime(b + k, 0.09 if k else 0.14)
            if b % 2 == 1: s.kane(b + .5, 0.04)
        elif style in ('ondo', 'bon'):                # 音頭：ドン・ドドン、拍子木、手拍子
            if b % 2 == 0: s.taiko(b, 0.5)
            else: s.taiko(b, 0.3); s.taiko(b + .5, 0.36)
            if b % 2 == 1: s.hyoshigi(b, 0.07); s.noise(b, 0.05, 0.05, color=3)
        else:                                         # 行進：大太鼓は1・3拍、締太鼓は2・4拍、うら拍に小さなシャカ
            if b % 2 == 0: s.taiko(b, 0.42)
            else: s.shime(b, 0.16)
            s.noise(b + .5, 0.025, 0.02)
        if bar_end and style != 'ameagari':           # 4小節ごとのおかず（締太鼓の連打）
            for k in (0.5, 0.625, 0.75, 0.875): s.shime(b + k, 0.1)
    if style == 'asa':                                # 朝の鳥の声
        for b in range(0, 64, 8):
            for k in range(3): s.line([('E7' if k % 2 else 'G7', 0.06)], square, 0.025, gate=.6, start=b + 3 + k * .1, duty=.5)
    elif style == 'umi':
        s.waves(64, 0.03, seed=i)
    elif style == 'ameagari':                         # 雨あがり：はじめの4小節だけ小さな雨つぶ
        for k in range(16 * 4): s.noise(k / 4 + rng.uniform(0, 0.1), 0.012, rng.uniform(0.008, 0.02))
    f = f'{i:03d}'
    save(os.path.join('s', f), s.buf / max(1.0, np.abs(s.buf).max() / 0.9), small=True)
    return {'f': f, 't': motif + word, 'm': mood, 'style': style, 'bpm': bpm,
            'key': KEYJ[root] + '長調のヨナ抜き'}


def album_plan():
    """100曲の 時間帯・曲調・題名の名所 を決める（いつも同じ並び。題名は重ならない）"""
    rng = np.random.default_rng(2026)
    plan, used = [], set()
    n = 0
    for mood, styles in JMOOD.items():
        for style in styles:
            pool = sorted({m for g in JMOTIF[style] for m in MOTIF[g]})
            while True:
                m = pool[int(rng.integers(len(pool)))]
                t = m + JSTYLE[style][4]
                if '祭' in m and 'まつり' in t:   # 「てんてこ祭の夜まつり」のように祭が重なる題名にしない
                    continue
                if t not in used: used.add(t); break
            n += 1
            plan.append((n, mood, style, m))
    return plan


def album():
    """100曲を作り、一覧 list.json（ファイル名・題名・時間帯・曲調・テンポ・調と音階）を書く"""
    os.makedirs(os.path.join(OUT, 's'), exist_ok=True)
    rows = [album_song(*p) for p in album_plan()]
    with open(os.path.join(OUT, 'list.json'), 'w') as fp:
        json.dump(rows, fp, ensure_ascii=False, indent=0)
    print('list.json:', len(rows), '曲')


def album_one(i):
    """1曲だけ作る（ためし聞き用）：python3 tools/make-sound.py album1 7"""
    p = album_plan()[i - 1]
    print(album_song(*p))

SONGS = {'field': field, 'world': world, 'jingles': jingles, 'field2': field2, 'field3': field3,
         'morning': morning, 'evening': evening, 'night': night, 'rain': rain, 'album': album}

if __name__ == '__main__':
    import sys
    os.makedirs(OUT, exist_ok=True)
    args = sys.argv[1:]
    if args[:1] == ['album1']:
        for a in args[1:]: album_one(int(a))
    else:
        for k in (args or SONGS):
            SONGS[k]()
