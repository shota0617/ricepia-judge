# にしおさんぽGO の音楽（BGM と効果音）を作る：python3 tools/make-sound.py
# ファミコン風のオリジナル曲。矩形波（メロディ・和音）と三角波（ベース）とノイズ（ドラム）だけで鳴らす。
# 出力：nishio-go/bgm/field.mp3（ふだん）・world.mp3（せかいちず）・checkin.mp3・levelup.mp3・eye.mp3（ffmpeg が必要）
#       バリエーション：field2（まちかど）・field3（おまつり）・morning（朝）・evening（夕方）・night（夜）・rain（雨）
#       アルバム100曲：nishio-go/bgm/s/001.mp3〜100.mp3 と list.json（python3 tools/make-sound.py album）
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


# ---------- 100曲のアルバム（nishio-go/bgm/s/001.mp3〜100.mp3 と list.json） ----------
# 曲ごとに 調（12の音のどれか・長調/短調）・テンポ・曲調（マーチ・はずむ・おまつり・きらきら・スイング・かけあし・ブギ・
# おだやか・バラード・子守歌・雨）・旋律の楽器（矩形波の太さ・三角波）・こだまの有無を変え、旋律は compose() で作る。
# 昼60曲・朝10曲・夕方10曲・夜10曲・雨10曲。通信量を減らすため 22kHz・48kbps のモノラル（1曲 200KB くらい）
for _r, _n in enumerate(SHARPS):                    # 12の音すべての長三和音・短三和音（'C#'・'F#m' など）
    CHORDS.setdefault(_n, (_n, SHARPS[(_r + 4) % 12], SHARPS[(_r + 7) % 12]))
    CHORDS.setdefault(_n + 'm', (_n, SHARPS[(_r + 3) % 12], SHARPS[(_r + 7) % 12]))
DEG = {'I': (0, ''), 'ii': (2, 'm'), 'iii': (4, 'm'), 'IV': (5, ''), 'V': (7, ''), 'vi': (9, 'm'), 'bVII': (10, ''),
       'i': (0, 'm'), 'iv': (5, 'm'), 'v': (7, 'm'), 'III': (3, ''), 'VI': (8, ''), 'VII': (10, '')}
PHRASE = {'major': [['I', 'V', 'vi', 'IV'], ['I', 'vi', 'IV', 'V'], ['I', 'IV', 'V', 'I'], ['I', 'iii', 'IV', 'V'], ['IV', 'V', 'iii', 'vi'],
                    ['I', 'V', 'IV', 'V'], ['vi', 'IV', 'I', 'V'], ['I', 'I', 'IV', 'V'], ['I', 'ii', 'V', 'I'], ['IV', 'I', 'bVII', 'V']],
          'minor': [['i', 'VI', 'III', 'VII'], ['i', 'iv', 'V', 'i'], ['i', 'VII', 'VI', 'V'], ['i', 'VI', 'iv', 'V'], ['VI', 'VII', 'i', 'i'],
                    ['i', 'III', 'VII', 'iv'], ['iv', 'v', 'VI', 'V'], ['i', 'i', 'iv', 'V']]}
CADENCE = {'major': [['IV', 'V', 'I', 'I'], ['ii', 'V', 'I', 'I'], ['vi', 'IV', 'V', 'I'], ['IV', 'ii', 'V', 'I']],
           'minor': [['iv', 'V', 'i', 'i'], ['VI', 'V', 'i', 'i'], ['VI', 'VII', 'i', 'i'], ['iv', 'VII', 'i', 'i']]}
SCALE = {'major': [0, 2, 4, 5, 7, 9, 11], 'minor': [0, 2, 3, 5, 7, 8, 10], 'yo': [0, 2, 4, 7, 9], 'minpenta': [0, 3, 5, 7, 10]}
KEYJ = ['ハ', '変ニ', 'ニ', '変ホ', 'ホ', 'ヘ', '嬰ヘ', 'ト', '変イ', 'イ', '変ロ', 'ロ']
SWING = [[.75, .25, .75, .25, 1, 1], [1, .75, .25, 2], [.75, .25, 1, .75, .25, 1], [1, 1, .75, .25, 1]]
MATSURI = [[1, .5, .5, 1, 1], [.5, .5, 1, .5, .5, 1], [1, 1, 1, 1], [1.5, .5, 1, 1], [.5, .5, .5, .5, 2]]
QUICK = [[.5] * 8, [.5, .5, 1, .5, .5, 1], [.25, .25, .5, 1, 1, 1], [1, .5, .5, 1, 1], [.5, .5, .5, .5, 1, 1]]
# 曲調：テンポの幅・旋律の音の多さ（busy）・音の長さ（gate）・リズム・題名につける言葉
STYLE = {'march': (112, 128, 1.0, .88, None, 'マーチ'), 'bounce': (124, 140, 1.0, .8, None, 'ステップ'), 'matsuri': (132, 148, 1.0, .85, MATSURI, 'ばやし'),
         'sparkle': (104, 120, .9, .9, None, 'きらきら'), 'swing': (116, 132, 1.0, .85, SWING, 'スイング'), 'quick': (150, 168, 1.0, .8, QUICK, 'ダッシュ'),
         'boogie': (120, 136, 1.0, .82, None, 'ブギ'), 'calm': (96, 112, .8, .92, None, ''), 'ballad': (80, 96, .7, .95, None, ''),
         'lull': (66, 84, .55, .95, None, ''), 'rainy': (76, 92, .65, .9, None, '')}
PLACES = ['西尾城', '鶴城', '抹茶畑', '茶つみ', '佐久島', '一色の港', '吉良の浜', '幡豆の海', '三ヶ根山', '矢作川', '矢作古川', '岩瀬文庫', '寺津',
          '平坂', '米津', '福地', '室場', '三和', '中畑', '八ツ面山', '宮崎海岸', '東幡豆', '西幡豆', '上横須賀', '吉田', '田んぼ道', '商店街',
          '古い町なみ', '駅前', '用水路', '海辺の道', '菜の花', '梅の花', '菖蒲園', 'あじさい', '秋まつり', 'うなぎ', 'えびせん', 'いちご畑', '島の灯台']
MOOD_WORD = {'morning': 'の朝', 'evening': 'の夕やけ', 'night': 'の夜', 'rain': 'の雨'}


def drums_quick(s, bars):
    """かけあし：毎拍キック、2・4拍目にスネア、16分のハイハット"""
    for b in range(bars * 4):
        s.kick(b, 0.42)
        if b % 2: s.noise(b, 0.10, 0.14, color=4)
        for k in range(4): s.noise(b + k * 0.25, 0.02, 0.03 if k % 2 else 0.045)


def album_song(i, mood, style, place):
    """アルバムの i 曲目（1〜100）を作って mp3 にし、一覧の1行を返す"""
    rng = np.random.default_rng(1000 + i)
    pick = lambda xs: xs[int(rng.integers(len(xs)))]
    lo_t, hi_t, busy, gate, rhythms, word = STYLE[style]
    bpm = int(rng.integers(lo_t, hi_t + 1))
    minor_p = {'evening': .6, 'night': .8, 'rain': .5}.get(mood, .25 if style in ('march', 'quick', 'sparkle', 'swing') else 0)
    mode = 'minor' if style != 'matsuri' and rng.random() < minor_p else 'major'
    root = int(rng.integers(12))
    # コード進行：4小節の句を4つ（はじめ・つぎ・まんなか・終わり）。終わりの句は主和音で終わる（はじめの句をくり返すことも）
    a, b, c = pick(PHRASE[mode]), pick(PHRASE[mode]), pick(PHRASE[mode])
    tonic = 'I' if mode == 'major' else 'i'
    end = a[:3] + [tonic] if rng.random() < .5 and a[2] in ('V', 'IV', 'ii', 'iv', 'VI') else pick(CADENCE[mode])
    roman = a + (a if rng.random() < .4 else b) + c + end
    ch = [SHARPS[(root + DEG[r][0]) % 12] + DEG[r][1] for r in roman]
    scale = 'yo' if style == 'matsuri' else 'minpenta' if mode == 'minor' and rng.random() < .3 else mode
    sc = [(x + root) % 12 for x in SCALE[scale]]
    lo_m = 72 + root - (12 if root > 6 else 0)          # 旋律の音域：主音から上へ 1オクターブ半くらい
    lo, hi = (name(lo_m - 5), name(lo_m + 10)) if style == 'lull' else (name(lo_m), name(lo_m + 16))
    s = Song(bpm, 64)
    mel = compose(ch, sc, 5000 + i, lo, hi, rhythms=rhythms, busy=busy)
    duty = pick([.25, .5]) if style in ('ballad', 'rainy') else pick([.125, .25, .5])
    if style == 'lull' or (style in ('ballad', 'rainy') and rng.random() < .3):
        s.line(mel, tri, 0.30, gate=gate)                # 三角波のやわらかい旋律
    else:
        s.line(mel, square, 0.18, gate=gate, duty=duty)
    if style in ('matsuri', 'ballad', 'calm') or rng.random() < .3:   # こだま
        s.line(mel, square, 0.05, gate=0.8, start=pick([.5, .75]), duty=.25 if duty == .125 else .125)
    for bar, cc in enumerate(ch):                        # 和音とベース
        r3, t0 = CHORDS[cc], bar * 4
        rt, third, fifth = r3
        if style == 'bounce':                            # 裏打ちの和音
            for k in (0.5, 1.5, 2.5, 3.5):
                for nm in r3: s.line([(f'{nm}4', .5)], square, 0.03, gate=0.5, start=t0 + k, duty=0.5)
        elif style == 'matsuri':
            s.line([(f'{rt}2', 1), (f'{rt}3', 1), (f'{rt}2', 1), (f'{rt}3', 1)], tri, 0.3, gate=0.7, start=t0)
        elif style == 'sparkle':                         # 16分の分散和音
            for k, j in enumerate([0, 1, 2, 1] * 4): s.line([(f'{r3[j]}5', .25)], tri, 0.08, gate=0.7, start=t0 + k * .25)
            s.line([(f'{rt}2', 2), (f'{fifth}2', 2)], tri, 0.3, gate=0.9, start=t0)
        elif style == 'swing':                           # 歩くベースと 2・4拍目の和音
            s.line([(f'{rt}2', 1), (f'{third}2', 1), (f'{fifth}2', 1), (f'{third}2', 1)], tri, 0.32, gate=0.8, start=t0)
            for k in (1, 3):
                for nm in r3: s.line([(f'{nm}4', .5)], square, 0.035, gate=0.5, start=t0 + k, duty=0.5)
        elif style == 'quick':
            for k in range(8): s.line([(f'{rt}{2 + k % 2}', .5)], tri, 0.3, gate=0.7, start=t0 + k * .5)
            for nm in r3: s.line([(f'{nm}4', 2)], square, 0.02, gate=0.9, start=t0, duty=0.5)
        elif style == 'boogie':                          # ブギのベース（根音・3度・5度・6度・短7度）
            m0, m3 = midi(f'{rt}2'), 3 if cc.endswith('m') else 4
            for k, d in enumerate([0, m3, 7, 9, 10, 9, 7, m3]): s.line([(name(m0 + d), .5)], tri, 0.3, gate=0.8, start=t0 + k * .5)
        elif style == 'calm':
            s.line([(f'{rt}2', 2), (f'{fifth}2', 2)], tri, 0.3, gate=0.9, start=t0)
        elif style == 'ballad':
            for k in range(4):
                for nm in r3: s.line([(f'{nm}4', 1)], square, 0.025, gate=0.9, start=t0 + k, duty=0.5)
            s.line([(f'{rt}2', 4)], tri, 0.32, gate=0.95, start=t0)
        elif style == 'lull':
            s.line([(f'{rt}2', 4)], tri, 0.22, gate=0.95, start=t0)
        elif style == 'rainy':
            for k, j in enumerate([0, 2, 1, 2, 0, 2, 1, 2]): s.line([(f'{r3[j]}5', .5)], tri, 0.10, gate=0.6, start=t0 + k * .5)
            s.line([(f'{rt}2', 4)], tri, 0.26, gate=0.95, start=t0)
    if style in ('march', 'calm', 'lull'):
        arp_eighths(s, ch, vol={'march': 0.06, 'calm': 0.05, 'lull': 0.04}[style])
    if style in ('march', 'bounce'):
        bass_eighths(s, ch)
    if style in ('march', 'bounce', 'swing', 'boogie'):  # ドラム
        drums_march(s, 16, 0.6 if style == 'swing' else 0.9)
    elif style == 'quick':
        drums_quick(s, 16)
    elif style == 'matsuri':                             # 太鼓とかね
        for b_ in range(64):
            s.kick(b_, 0.55 if b_ % 2 == 0 else 0.35)
            if b_ % 4 == 3: s.kick(b_ + 0.5, 0.4)
            s.noise(b_ + 0.5, 0.05, 0.06)
    elif style in ('sparkle', 'calm'):
        for bar in range(16): s.kick(bar * 4, 0.35); s.noise(bar * 4 + 2, 0.08, 0.06, color=4)
    elif style == 'ballad':
        for bar in range(16): s.kick(bar * 4, 0.3)
    if style == 'lull':                                  # 虫の声
        for b_ in range(64):
            if rng.random() < 0.3:
                for k in range(3): s.line([('E7' if b_ % 2 else 'D#7', 0.05)], square, 0.02, gate=0.6, start=b_ + 0.25 + k * 0.08, duty=0.5)
    if style == 'rainy':                                 # 雨つぶ
        for k in range(64 * 6): s.noise(k / 6 + rng.uniform(0, 0.1), 0.015, rng.uniform(0.01, 0.035))
    f = f'{i:03d}'
    save(os.path.join('s', f), s.buf / max(1.0, np.abs(s.buf).max() / 0.9), small=True)
    return {'f': f, 't': place + (MOOD_WORD.get(mood) or word), 'm': mood, 'style': style, 'bpm': bpm,
            'key': KEYJ[root] + ('短調' if mode == 'minor' else '長調')}


def album_plan():
    """100曲の 時間帯・曲調・題名の場所 を決める（いつも同じ並び。題名は重ならない）"""
    rng = np.random.default_rng(100)
    plan, used = [], set()
    day_styles = ['march', 'bounce', 'matsuri', 'sparkle', 'swing', 'quick', 'boogie']
    mood_styles = {'morning': ['calm', 'sparkle', 'march'], 'evening': ['ballad', 'calm'], 'night': ['lull', 'ballad'], 'rain': ['rainy']}
    for n, mood in enumerate(['day'] * 60 + ['morning'] * 10 + ['evening'] * 10 + ['night'] * 10 + ['rain'] * 10):
        style = day_styles[n % 7] if mood == 'day' else mood_styles[mood][n % len(mood_styles[mood])]
        while True:
            p = PLACES[int(rng.integers(len(PLACES)))]
            t = p + (MOOD_WORD.get(mood) or STYLE[style][5])
            if t not in used: used.add(t); break
        plan.append((n + 1, mood, style, p))
    return plan


def album():
    """100曲を作り、一覧 list.json（ファイル名・題名・時間帯・曲調・テンポ・調）を書く"""
    os.makedirs(os.path.join(OUT, 's'), exist_ok=True)
    rows = [album_song(*p) for p in album_plan()]
    with open(os.path.join(OUT, 'list.json'), 'w') as fp:
        json.dump(rows, fp, ensure_ascii=False, indent=0)
    print('list.json:', len(rows), '曲')

SONGS = {'field': field, 'world': world, 'jingles': jingles, 'field2': field2, 'field3': field3,
         'morning': morning, 'evening': evening, 'night': night, 'rain': rain, 'album': album}

if __name__ == '__main__':
    import sys
    os.makedirs(OUT, exist_ok=True)
    for k in (sys.argv[1:] or SONGS):
        SONGS[k]()
