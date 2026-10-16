# にしおさんぽGO の音楽（BGM と効果音）を作る：python3 tools/make-sound.py
# ファミコン風のオリジナル曲。矩形波（メロディ・和音）と三角波（ベース）とノイズ（ドラム）だけで鳴らす。
# 出力：nishio-go/bgm/field.mp3（ふだん）・world.mp3（せかいちず）・checkin.mp3・levelup.mp3（ffmpeg が必要）
import os, subprocess, wave
import numpy as np

SR = 44100
OUT = os.path.join(os.path.dirname(__file__), '..', 'nishio-go', 'bgm')
NAMES = {'C': 0, 'C#': 1, 'D': 2, 'D#': 3, 'E': 4, 'F': 5, 'F#': 6, 'G': 7, 'G#': 8, 'A': 9, 'A#': 10, 'B': 11}
CHORDS = {'C': ('C', 'E', 'G'), 'Am': ('A', 'C', 'E'), 'F': ('F', 'A', 'C'), 'G': ('G', 'B', 'D'),
          'Dm': ('D', 'F', 'A'), 'Em': ('E', 'G', 'B'), 'E': ('E', 'G#', 'B')}


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


def save(name, x):
    wav = os.path.join(OUT, name + '.wav')
    with wave.open(wav, 'wb') as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR)
        w.writeframes((np.clip(x, -1, 1) * 32767).astype('<i2').tobytes())
    # ファミコンの音の出口のように、高すぎる音と低すぎる音を少し削って耳あたりをやわらかくする
    subprocess.run(['ffmpeg', '-loglevel', 'error', '-y', '-i', wav, '-af', 'highpass=f=40,lowpass=f=6500', '-ac', '1', '-b:a', '96k',
                    os.path.join(OUT, name + '.mp3')], check=True)
    os.remove(wav)
    print(f'{name}.mp3: {len(x) / SR:.1f}s')


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


if __name__ == '__main__':
    os.makedirs(OUT, exist_ok=True)
    field()
    world()
    jingles()
