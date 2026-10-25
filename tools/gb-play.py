# ゲームボーイ・ファミコンのゲームを Claude に遊ばせて、にしおさんぽGO に持ちこめる「しくみ」を書き出す：
#   python3 tools/gb-play.py --rom <自分のカセットから吸い出した .gb / .gbc / .nes> [--episodes 6] [--steps 40] [--out gb-play-out]
# ・エミュレータは ゲームボーイが PyBoy（pip install pyboy）、ファミコンが nes-py（pip install nes-py）。どちらも anthropic pillow も要る。
#   画面を Claude に見せ、Claude がボタンを押す、をくり返す（ポケモン赤・緑、ドラゴンクエスト1〜3 など）
# ・ROM はリポジトリに入れない・配らない（.gitignore 済み）。自分で持っているカセットから吸い出したものだけを使う
# ・ファミコンは とちゅうの状態をファイルに残せない（nes-py にない）ので --resume できない。ドラゴンクエスト1・2 は
#   Claude が「ふっかつのじゅもん」をメモに書いておけば、次はタイトルから じゅもんを入れて続けられる
# ・持ちこむのは遊びの「しくみ」だけ。名前・絵・音・文章はまねしない（docs/play-improve.md）
# ・1回の会話（エピソード）は --steps 手まで。終わるたびに「ここまでのメモ」を残し、次のエピソードはメモと今の画面から続ける
#   （会話を短く切るので、画面の画像がたまり続けない）。とちゅうの状態は out/state.bin に保存し、--resume で続きから
# 出力：out/notes.jsonl（遊びながら書いたメモ）・out/shots/*.png・out/report.md（にしおさんぽGO への提案。最後に1回まとめる）
# 認証：ANTHROPIC_API_KEY（または ant auth login のプロフィール）
import argparse, base64, io, json, os, sys

import anthropic

MODEL = 'claude-opus-5-5'
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
BUTTONS = ['a', 'b', 'start', 'select', 'up', 'down', 'left', 'right']

TOOLS = [
    {
        'name': 'press',
        'description': 'ゲーム機のボタンを順に押す。押したあとの画面が返る。'
                       '歩くときは同じ方向を何回か並べる（1回で1マスくらい）。文字送りは a、メニューは start。',
        'strict': True,
        'input_schema': {
            'type': 'object',
            'properties': {
                'buttons': {'type': 'array', 'items': {'type': 'string', 'enum': BUTTONS}, 'minItems': 1, 'maxItems': 12,
                            'description': '押す順番'},
                'why': {'type': 'string', 'description': 'なぜそう押すか（ひとこと）'},
            },
            'required': ['buttons', 'why'],
            'additionalProperties': False,
        },
    },
    {
        'name': 'note',
        'description': '遊んでいて気づいたことを書きとめる。面白いと感じた瞬間、それを生んでいる「しくみ」、'
                       'にしおさんぽGO に持ちこめそうな案があったら、すぐ呼ぶ。',
        'strict': True,
        'input_schema': {
            'type': 'object',
            'properties': {
                'kind': {'type': 'string', 'enum': ['fun', 'mechanic', 'idea', 'progress']},
                'text': {'type': 'string'},
            },
            'required': ['kind', 'text'],
            'additionalProperties': False,
        },
    },
]


def read(path):
    with open(os.path.join(ROOT, path), encoding='utf-8') as f:
        return f.read()


SYSTEM = f"""あなたはゲームデザイナーです。ゲーム機（ゲームボーイ・ファミコン）のゲームを実際に遊び、その面白さを生んでいる「しくみ」を見つけます。
見つけたしくみは、西尾市のさんぽゲーム「にしおさんぽGO」に持ちこむ参考にします。にしおさんぽGO の面白さの核は次のとおりです。

<fun_core>
{read('docs/fun-core.md')}
</fun_core>

遊び方：
- press でボタンを押すと、押したあとの画面が返ります。画面をよく見て、次に押すボタンを決めてください。
- 先へ進むことより、遊びながら気づくことを大事にしてください。気づいたら note に書きます（fun：面白かった瞬間、mechanic：それを生むしくみ、idea：にしおさんぽGO での使い方、progress：いまどこまで進んだか）。
- 同じ所で迷い続けたら、別の方向やメニューを試してください。
- 持ちこむのは「しくみ」だけです。キャラクターや技の名前、絵、音楽、文章をまねする案は書かないでください。
- ふっかつのじゅもん（パスワード）が出たら、progress のメモに そのまま書き写してください（次の回は それを入れて続けます）。"""


class GameBoy:
    name, machine = 'ゲームボーイ', 'gb'

    def __init__(self, rom):
        from pyboy import PyBoy
        self.pb = PyBoy(rom, window='null', sound_emulated=False)

    def image(self):
        return self.pb.screen.image.convert('RGB').resize((320, 288))   # 160×144 を2倍に（文字が読めるように）

    def press(self, buttons):
        for b in buttons:
            self.pb.button(b, 6)   # 6フレーム押して
            self.pb.tick(18, True)   # 少し待つ（歩く・文字が出るのを待つ）
        self.pb.tick(30, True)

    def boot(self):
        self.pb.tick(240, True)   # タイトルが出るまで待つ

    def save(self, path):
        with open(path, 'wb') as f:
            self.pb.save_state(f)

    def load(self, path):
        with open(path, 'rb') as f:
            self.pb.load_state(f)

    def stop(self):
        self.pb.stop(save=False)


class Famicom:
    name, machine = 'ファミコン', 'nes'
    BITS = {'a': 1, 'b': 2, 'select': 4, 'start': 8, 'up': 16, 'down': 32, 'left': 64, 'right': 128}   # nes-py のコントローラの並び

    def __init__(self, rom):
        from nes_py import NESEnv
        self.env = NESEnv(rom)
        self.env.reset()

    def frames(self, n, action=0):
        for _ in range(n):
            self.env.step(action)

    def image(self):
        from PIL import Image
        return Image.fromarray(self.env.screen).resize((512, 480), Image.NEAREST)   # 256×240 を2倍に

    def press(self, buttons):
        for b in buttons:
            self.frames(8, self.BITS[b])   # ファミコンのRPGは、1マス歩くのに16フレームくらい
            self.frames(16)
        self.frames(30)

    def boot(self):
        self.frames(300)

    def save(self, path):
        pass   # nes-py は状態をファイルに書けない（ふっかつのじゅもん をメモに残す）

    def load(self, path):
        raise SystemExit('ファミコンは --resume できません（ドラゴンクエスト1・2 は、メモの ふっかつのじゅもん をタイトルで入れて続けます）')

    def stop(self):
        self.env.close()


def open_game(rom):
    return Famicom(rom) if rom.lower().endswith('.nes') else GameBoy(rom)


def screen_png(game):
    buf = io.BytesIO()
    game.image().save(buf, 'PNG')
    return buf.getvalue()


def image_block(png):
    return {'type': 'image', 'source': {'type': 'base64', 'media_type': 'image/png', 'data': base64.standard_b64encode(png).decode()}}


def ask(client, messages, max_tokens=16000):
    r = client.beta.messages.create(
        model=MODEL, max_tokens=max_tokens, system=SYSTEM, tools=TOOLS, messages=messages,
        output_config={'effort': 'medium'},
        betas=['server-side-fallback-2026-07-01'], fallbacks='default',   # 安全の判定で断られたら、すすめられたモデルでやり直す
    )
    if r.stop_reason == 'refusal':
        raise SystemExit(f'Claude に断られました（{r.stop_details.category if r.stop_details else "理由なし"}）。ここで止めます')
    return r


def episode(client, game, ep, steps, memo, out, shot_no):
    """1回の会話。--steps 手まで遊び、最後に次のエピソードへのメモを返す"""
    intro = f'エピソード {ep}。' + (f'これまでのメモ：\n{memo}\n' if memo else 'はじめから遊びます。') + '\nいまの画面です。'
    messages = [{'role': 'user', 'content': [image_block(screen_png(game)), {'type': 'text', 'text': intro}]}]
    for _ in range(steps):
        r = ask(client, messages)
        messages.append({'role': 'assistant', 'content': r.content})
        uses = [b for b in r.content if b.type == 'tool_use']
        if r.stop_reason != 'tool_use' or not uses:   # ボタンを押さずに止まったら、続けるようにうながす
            messages.append({'role': 'user', 'content': 'press でボタンを押して、遊び続けてください。'})
            continue
        results = []
        for u in uses:
            if u.name == 'note':
                with open(os.path.join(out, 'notes.jsonl'), 'a', encoding='utf-8') as f:
                    f.write(json.dumps({'ep': ep, **u.input}, ensure_ascii=False) + '\n')
                print(f'  📝 {u.input["kind"]}: {u.input["text"]}')
                results.append({'type': 'tool_result', 'tool_use_id': u.id, 'content': '書きとめました'})
            else:
                game.press(u.input['buttons'])
                png = screen_png(game)
                shot_no += 1
                with open(os.path.join(out, 'shots', f'{shot_no:04d}.png'), 'wb') as f:
                    f.write(png)
                print(f'  🎮 {" ".join(u.input["buttons"])}（{u.input["why"]}）')
                results.append({'type': 'tool_result', 'tool_use_id': u.id, 'content': [image_block(png)]})
        messages.append({'role': 'user', 'content': results})
    # エピソードの終わり：次へ引きつぐメモ（いまどこにいて、何をしようとしていたか・ここまでの気づき）
    messages.append({'role': 'user', 'content': 'ここでひと区切りです。ボタンは押さずに、次のエピソードへ引きつぐメモを短く書いてください（いまどこにいて何をしようとしていたか・ここまでの気づき）。'})
    r = ask(client, messages, 4000)
    return '\n'.join(b.text for b in r.content if b.type == 'text'), shot_no


def report(client, out):
    """遊びながら書いたメモから、にしおさんぽGO への提案をまとめる"""
    path = os.path.join(out, 'notes.jsonl')
    notes = open(path, encoding='utf-8').read() if os.path.exists(path) else ''
    r = client.messages.create(
        model=MODEL, max_tokens=16000, system=SYSTEM, output_config={'effort': 'high'},
        messages=[{'role': 'user', 'content': f"""遊びながら書いたメモです。
<notes>
{notes}
</notes>
にしおさんぽGO に持ちこむと面白くなる「しくみ」を、効きそうな順に5つまで、Markdown で書いてください。
それぞれ「元のゲームでの体験」「しくみ（なぜ面白いか）」「にしおさんぽGO での形（面白さの核：人の話と環境で進む、に合うように）」「小さく試す方法」を書きます。
名前・絵・音・文章をまねする案は入れないでください。"""}],
    )
    text = '\n'.join(b.text for b in r.content if b.type == 'text')
    with open(os.path.join(out, 'report.md'), 'w', encoding='utf-8') as f:
        f.write(text)
    return text


def main():
    ap = argparse.ArgumentParser(description='ゲームボーイ・ファミコンのゲームを Claude に遊ばせて、にしおさんぽGO に持ちこめるしくみを書き出す')
    ap.add_argument('--rom', required=True, help='自分のカセットから吸い出した ROM（.gb / .gbc / .nes）')
    ap.add_argument('--episodes', type=int, default=6)
    ap.add_argument('--steps', type=int, default=40, help='1エピソードで Claude に考えさせる回数')
    ap.add_argument('--out', default='gb-play-out')
    ap.add_argument('--resume', action='store_true', help='out/state.bin と out/memo.txt から続ける')
    a = ap.parse_args()
    os.makedirs(os.path.join(a.out, 'shots'), exist_ok=True)
    game = open_game(a.rom)
    memo, shot_no = '', len(os.listdir(os.path.join(a.out, 'shots')))
    state, memo_f = os.path.join(a.out, 'state.bin'), os.path.join(a.out, 'memo.txt')
    if a.resume and os.path.exists(state):
        game.load(state)
        memo = open(memo_f, encoding='utf-8').read() if os.path.exists(memo_f) else ''
    else:
        game.boot()   # タイトルが出るまで待つ
    client = anthropic.Anthropic()
    try:
        for ep in range(1, a.episodes + 1):
            print(f'▶ エピソード {ep}/{a.episodes}')
            memo, shot_no = episode(client, game, ep, a.steps, memo, a.out, shot_no)
            print(f'  ⏸ {memo}')
            game.save(state)
            with open(memo_f, 'w', encoding='utf-8') as f:
                f.write(memo)
    finally:
        game.stop()
    print(report(client, a.out))


if __name__ == '__main__':
    sys.exit(main())
