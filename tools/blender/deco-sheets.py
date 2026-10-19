# にしおさんぽGO：地図の小物（tools/blender/deco.py の結果）に色と季節をのせて、シートにまとめる
# - 題材82 × ポーズ6 × 向き4 × 色8通り ＝ 15744マス を、季節4つ（春・夏・秋・冬）ぶん。ちがう絵だけを数えて6万枚以上
#   nishio-go/deco/deco-<季節>.png：16×16 のマスが 96列に並ぶ（背景なし）。番号 i ＝ ((題材 × 6 ＋ ポーズ) × 4 ＋ 向き) × 8 ＋ 色
# - 季節で変わるもの：草や葉の色、足もとにちる花びら（春）・草（夏）・落ち葉（秋）・雪（冬。上の面に雪がつもる）
#   水の上の小物は、花びらや落ち葉が水に浮かび、夏は波、冬は白い波
# - まわりを黒っぽくふちどる（どの地面の上でも見えるように）
# 使い方：python tools/blender/deco.py（bpy）→ python3 tools/blender/deco-sheets.py（numpy・Pillow）
import hashlib
import json
import os
import random

import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
TMP = os.path.join(os.environ.get('TMPDIR', '/tmp'), 'nsg-deco')
OUT = os.path.join(HERE, '..', '..', 'nishio-go', 'deco')
N, COLS = 16, 96
OUTLINE = (42, 36, 32)

SUBJECTS = ['sagi', 'kotori', 'kamo', 'kamome', 'neko', 'inu', 'kaeru', 'choucho', 'kakashi', 'hazakake', 'warazuka', 'noufu', 'kodomo', 'tsuri',
            'jizo', 'hokora', 'tourou', 'douhyou', 'hana', 'ajisai', 'himawari', 'kosumosu', 'kinoko', 'iwa', 'bench', 'ueki', 'jitensha', 'jihanki',
            'chouchin', 'gomi', 'sanrinsha', 'kasa', 'fune', 'boto', 'bui', 'hasu', 'kani', 'sunashiro', 'picnic', 'tanuki', 'suimon', 'karasu',
            'chatsumi', 'suisha', 'daichouchin', 'akauma', 'norihibi', 'carnation', 'kame', 'koinobori', 'kadomatsu', 'suika', 'tsukimi', 'kaki',
            'tractor', 'combine', 'tako', 'nodate', 'unaginobori', 'yatai', 'sakura', 'momiji',
            'kiji', 'tsubame', 'usagi', 'hotaru', 'koi', 'hakuchou', 'yacht', 'tetrapod', 'monohoshi', 'fuusen', 'basutei', 'komainu', 'ema',
            'omikuji', 'hachibako', 'fukurou', 'risu', 'bonsai', 'jogger', 'sanpo']
WATER = {'kamo', 'fune', 'boto', 'bui', 'hasu', 'suisha', 'norihibi', 'koi', 'hakuchou', 'yacht'}   # 水の上に置く題材
SAND = {'kamome', 'kani', 'sunashiro', 'kasa', 'tsuri', 'kame', 'suika', 'tetrapod'}


def rgb(h):
    h = h.lstrip('#')
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))


def tones(c, k=0.72, up=1.18):
    r, g, b = rgb(c) if isinstance(c, str) else c
    return [(int(r * k * 0.95), int(g * k * 0.97), int(min(255, b * k * 1.08))), (r, g, b), tuple(min(255, int(v * up + 8)) for v in (r, g, b))]


# 種類ごとの色（8通り）。鳥は [羽, 腹, くちばし, 足, 頭]
BIRDS = {
    'sagi': [('#f4f4f0', '#ffffff', '#e8c040', '#2a2a2a'), ('#8a96a4', '#d8dce0', '#e8c040', '#8a6a40'), ('#3a4450', '#c8ccd0', '#2a2a2a', '#e8c040'),
             ('#f0e6c8', '#fffaf0', '#e8b030', '#2a2a2a'), ('#f4f4f0', '#ffffff', '#2a2a2a', '#2a2a2a'), ('#6a7a8a', '#b8c0c8', '#d8a030', '#6a5a40'),
             ('#e8d8b0', '#fff8e8', '#e8a020', '#c89040'), ('#5a6a7a', '#a8b0b8', '#3a3a3a', '#a07a40')],
    'kotori': [('#8a6a4a', '#e8dcc8', '#3a3a3a', '#c89060'), ('#3a3a40', '#f4f4f0', '#2a2a2a', '#2a2a2a'), ('#2a8ac8', '#e87a30', '#2a2a2a', '#e04a3a'),
               ('#7a8088', '#a8a8b0', '#2a2a2a', '#5a5a5a'), ('#9ab83a', '#e8e0a0', '#3a3a3a', '#7a7a7a'), ('#506070', '#f0f0e8', '#2a2a2a', '#5a5a6a'),
               ('#5a4a40', '#c8c0b0', '#e8a030', '#e8a030'), ('#8a8a4a', '#c8c8a0', '#5a5a3a', '#c8a080')],
    'kamome': [('#f0f0f0', '#f8f8f8', '#e8c040', '#e8c040'), ('#9aa0a8', '#f4f4f4', '#e8c040', '#e8a0a0'), ('#d8dce0', '#ffffff', '#e04a3a', '#e04a3a'),
               ('#2a2a2a', '#4a4a4a', '#e8c040', '#2a2a2a'), ('#e8e8ec', '#ffffff', '#c03030', '#c03030'), ('#b8bcc0', '#f0f0f0', '#2a2a2a', '#2a2a2a'),
               ('#a89a88', '#e8e0d0', '#5a5a5a', '#5a5a5a'), ('#f4f4f8', '#ffffff', '#f0a020', '#f0a020')],
    'kiji': [('#3a6a4a', '#2a4a6a', '#e8c040', '#8a6a40'), ('#a08060', '#c8b090', '#7a6a50', '#8a6a40'), ('#8a4a2a', '#c87a4a', '#e8c040', '#8a6a40'),
             ('#4a5a3a', '#6a3a2a', '#e8c040', '#8a6a40'), ('#b09070', '#d8c0a0', '#8a7a60', '#8a6a40'), ('#2a5a5a', '#3a3a6a', '#e8c040', '#7a5a40'),
             ('#7a5a3a', '#a07a50', '#5a4a3a', '#8a6a40'), ('#5a7a4a', '#8a3a2a', '#e8d050', '#8a6a40')],
    'tsubame': [('#2a2a4a', '#f4f0e8', '#2a2a2a', '#2a2a2a'), ('#3a3a5a', '#e8d8c8', '#2a2a2a', '#2a2a2a'), ('#1a1a3a', '#f8f4f0', '#2a2a2a', '#2a2a2a'),
                ('#5a4a3a', '#e8dcc8', '#2a2a2a', '#2a2a2a'), ('#2a3a5a', '#f0e8e0', '#2a2a2a', '#2a2a2a'), ('#4a4a5a', '#d8d0c8', '#2a2a2a', '#2a2a2a'),
                ('#2a2a3a', '#e0c8b0', '#2a2a2a', '#2a2a2a'), ('#3a3a4a', '#f4f4f4', '#2a2a2a', '#2a2a2a')],
    'hakuchou': [('#f8f8f8', '#ffffff', '#e8c040', '#2a2a2a'), ('#f4f4f0', '#ffffff', '#2a2a2a', '#2a2a2a'), ('#d8d8d8', '#f0f0f0', '#e8a030', '#2a2a2a'),
                 ('#c8c8c8', '#e8e8e8', '#e8c040', '#2a2a2a'), ('#f0f0f4', '#ffffff', '#f0a020', '#2a2a2a'), ('#e8e8e8', '#f8f8f8', '#3a3a3a', '#2a2a2a'),
                 ('#b8b8c0', '#d8d8e0', '#e8c040', '#2a2a2a'), ('#ffffff', '#ffffff', '#e8a030', '#2a2a2a')],
    'fukurou': [('#8a6a4a', '#d8c8a8', '#e8c040', '#2a2a2a'), ('#a08a6a', '#e8dcc8', '#e8c040', '#2a2a2a'), ('#6a5a4a', '#c8b898', '#e8a030', '#2a2a2a'),
                ('#b8a888', '#f0e8d8', '#2a2a2a', '#2a2a2a'), ('#7a6a5a', '#b8a888', '#e8c040', '#2a2a2a'), ('#e8e8e0', '#ffffff', '#e8c040', '#2a2a2a'),
                ('#9a7a5a', '#d8c0a0', '#f0a020', '#2a2a2a'), ('#5a4a3a', '#a89878', '#e8c040', '#2a2a2a')],
    'karasu': [('#2a2a30', '#3a3a40', '#1a1a1a', '#2a2a2a'), ('#8a8a98', '#b8b8c8', '#e0a0a0', '#e06060'), ('#3a6a4a', '#7a3a2a', '#e8c040', '#8a6a40'),
               ('#a08060', '#c8b090', '#7a6a50', '#8a6a40'), ('#a08a78', '#d0b8a8', '#5a4a40', '#c08080'), ('#5a4a40', '#8a7a70', '#e8a030', '#e8a030'),
               ('#a07050', '#e8d8c0', '#2a2a2a', '#3a3a3a'), ('#4a4a58', '#8a8aa0', '#2a2a2a', '#c06060')],
}
DUCKS = [   # 羽・腹・頭・くちばし（かるがも・まがもの雄・雌・おしどり・こがも・ひどりがも・きんくろはじろ・あひる）
    ('#7a6a50', '#b8a888', '#5a4a38', '#3a3a3a'), ('#a8a8a0', '#e8e8e0', '#2a7a4a', '#e8c040'), ('#8a7050', '#c8b090', '#7a6040', '#e09040'),
    ('#c87a3a', '#f0e8d8', '#e8a050', '#e04a3a'), ('#8a8a88', '#e8e0c8', '#8a3a2a', '#2a2a2a'), ('#a8a8a8', '#f0f0f0', '#b06030', '#8a9aa8'),
    ('#2a2a30', '#f4f4f0', '#2a2a30', '#8a9aa8'), ('#f4f4f0', '#ffffff', '#f4f4f0', '#f0a020')]
COATS = {'neko': ['#e8a050', '#2a2a2a', '#f4f0e8', '#8a8a90', '#a07850', '#d8c0a0', '#5a4a40', '#c8a070'],
         'usagi': ['#a08060', '#8a6a4a', '#c8a880', '#b09070', '#7a6a50', '#d8c8a8', '#9a8a70', '#f0ece4'],
         'risu': ['#a06a3a', '#8a5a3a', '#b8804a', '#7a5a3a', '#c89060', '#6a4a2a', '#9a7050', '#a88a6a'],
         'inu': ['#d08040', '#f0ece0', '#2a2a2a', '#a07040', '#e8d0a0', '#6a5040', '#b0b0b0', '#c8a060']}
V8 = {   # 題材ごとの「色8通り」になる材質
    'kaeru': ('kawa', ['#5aa840', '#3a8a30', '#8a6a40', '#7a9a40', '#4a7a50', '#a0a040', '#6aa860', '#5a6a40']),
    'choucho': ('hane', ['#f2d040', '#f4f4f0', '#e8803a', '#3a6ad8', '#d84a4a', '#8a5ad0', '#e8a0c0', '#4a4a4a']),
    'kakashi': ('fuku', ['#3a4a8a', '#c04030', '#4a8a4a', '#e0a030', '#8a4a8a', '#3a7ab0', '#a05a30', '#5a5a5a']),
    'hazakake': ('wara', ['#d8b860', '#c8a850', '#e0c070', '#b89848', '#d0b060', '#c0a040', '#e8d080', '#a88838']),
    'warazuka': ('wara', ['#d8b860', '#c8a850', '#e0c070', '#b89848', '#d0b060', '#c0a040', '#e8d080', '#a88838']),
    'noufu': ('fuku', ['#3a4a8a', '#e8e0d0', '#4a8a4a', '#c04030', '#5a6a7a', '#8a6a4a', '#3a7ab0', '#e0a030']),
    'kodomo': ('fuku', ['#e04a3a', '#3a7ad0', '#f2c230', '#4aa84a', '#e88ab0', '#f4f4f0', '#8a5ad0', '#f08030']),
    'tsuri': ('fuku', ['#3a4a6a', '#c04030', '#4a7a4a', '#e0c070', '#5a5a5a', '#2a6aa0', '#a06a3a', '#e8e0d0']),
    'jizo': ('yodare', ['#d23a2e', '#e04a3a', '#c8302a', '#e86a5a', '#b02a2a', '#f08080', '#d85a2a', '#a83a3a']),
    'hokora': ('yane', ['#5a6070', '#4f8a7a', '#b03a2e', '#6a4a3a', '#3a3a40', '#8a8a80', '#a0602a', '#4a5a8a']),
    'tourou': ('ishi', ['#a8a8a0', '#9a968a', '#b8b4a8', '#8a8a84', '#a0a098', '#b0aa9a', '#90948c', '#c0bcb0']),
    'douhyou': ('kanban', ['#f4f4f0', '#2a5aa0', '#3a8a4a', '#a06a3a', '#e8c040', '#c04030', '#5a5a5a', '#e8e0c8']),
    'hana': ('hana', ['#ff8fb1', '#fff176', '#ffffff', '#e04a6a', '#c78ad8', '#ffb347', '#8fc8ff', '#f08080']),
    'ajisai': ('hana', ['#5a7ad8', '#8a5ad0', '#e88ab0', '#f0f0f4', '#8ab0e8', '#a060c0', '#d050a0', '#b8a8e8']),
    'himawari': ('hana', ['#f2c230', '#f0a020', '#e8d040', '#d88020', '#f4d860', '#c86a20', '#e8b830', '#b04a20']),
    'kosumosu': ('hana', ['#f08ab0', '#ffffff', '#d03a80', '#f4b0c8', '#f0a030', '#c070c0', '#e86a90', '#f8d0e0']),
    'kinoko': ('kasa', ['#d03a2e', '#8a5a3a', '#f0ece0', '#e08030', '#a07a50', '#c8a060', '#6a4a3a', '#e8c040']),
    'iwa': ('ishi', ['#9a968a', '#8a8a84', '#a8a090', '#7a7a74', '#b0a898', '#8a8070', '#9aa0a0', '#a8a8a0']),
    'bench': ('za', ['#a0703c', '#3a7a4a', '#2a5aa0', '#c04030', '#8a5a30', '#e8e0d0', '#5a5a5a', '#e0a030']),
    'ueki': ('hachi', ['#b86a3c', '#3a6aa0', '#f0ece0', '#2a2a2e', '#8a5a3a', '#4a8a5a', '#d8a040', '#a04a4a']),
    'jitensha': ('frame', ['#c04030', '#2a5aa0', '#f0f0f0', '#3a8a4a', '#2a2a2e', '#e0a030', '#e88ab0', '#8a8a90']),
    'jihanki': ('karada', ['#d03a30', '#2c6aa0', '#f0f0f0', '#3a8a4a', '#e08a20', '#2a2a2e', '#e8c040', '#9aa0a8']),
    'chouchin': ('chouchin', ['#e04a3a', '#f4f0e0', '#f2c230', '#f08030', '#e86a8a', '#d03030', '#f8e8a0', '#c04030']),
    'gomi': ('hako', ['#3a8a4a', '#2a5aa0', '#e0a030', '#c04030', '#8a8a90', '#4a4a4a', '#e8e0c8', '#5a3a8a']),
    'sanrinsha': ('frame', ['#e04a3a', '#2a7ad0', '#f2c230', '#4aa84a', '#e88ab0', '#8a5ad0', '#f08030', '#f0f0f0']),
    'kasa': ('kasa', ['#e8504a', '#2a7ad0', '#f2c230', '#4aa84a', '#f4f4f0', '#e88ab0', '#8a5ad0', '#f08030']),
    'fune': ('sentai', ['#f4f4f0', '#2a5aa0', '#c04030', '#3a8a5a', '#e8c040', '#5a8ac0', '#a0a8b0', '#2a3a5a']),
    'boto': ('sentai', ['#c04030', '#f4f4f0', '#2a5aa0', '#3a8a4a', '#e8a030', '#8a5a3a', '#e8e0c0', '#5a5a5a']),
    'bui': ('bui', ['#f08020', '#f2d040', '#e04a3a', '#f4f4f0', '#3a7ad0', '#4aa84a', '#e88ab0', '#ff6a3a']),
    'hasu': ('hana', ['#f4a0c0', '#f8f0f4', '#e870a0', '#f8c8d8', '#d84a80', '#fff0f0', '#f090b0', '#e8a8c8']),
    'kani': ('kara', ['#d84a3a', '#e08030', '#8a5a3a', '#a04a6a', '#7a8a6a', '#c86a4a', '#6a5a4a', '#e8a060']),
    'sunashiro': ('baketsu', ['#e04a3a', '#2a7ad0', '#f2c230', '#4aa84a', '#e88ab0', '#8a5ad0', '#f08030', '#40c0c0']),
    'picnic': ('sheet', ['#2a7ad0', '#e04a3a', '#4aa84a', '#f2c230', '#e88ab0', '#8a5ad0', '#f08030', '#40c0c0']),
    'tanuki': ('kasa', ['#c8a060', '#8a5a3a', '#3a3a40', '#d0b070', '#a07040', '#5a4a3a', '#e0c080', '#6a6a50']),
    'suimon': ('handle', ['#d03a30', '#2a5aa0', '#e8c040', '#3a8a4a', '#f08030', '#8a8a90', '#2a2a2e', '#f0f0f0']),
    'chatsumi': ('fuku', ['#2a3a6a', '#3a5a9a', '#e8e0d0', '#5a7a5a', '#8a3a3a', '#4a4a6a', '#6a8ab0', '#a08060']),
    'suisha': ('hane', ['#2a6ad0', '#f2c230', '#f0f0f0', '#f08030', '#3a9a5a', '#e04a3a', '#8a8a90', '#40a0d0']),
    'daichouchin': ('chouchin', ['#f4e8c8', '#f2c060', '#e86a3a', '#f8d8a0', '#e8a050', '#f0f0e0', '#d84a3a', '#f4b880']),
    'akauma': ('aka', ['#d23a2e', '#e04a3a', '#c02a2a', '#e8603a', '#b8302a', '#d84a40', '#a82a2a', '#e8503a']),
    'norihibi': ('ami', ['#3a8a4a', '#2a5aa0', '#2a2a2e', '#e08030', '#5a7a8a', '#4aa84a', '#8a5a3a', '#c04030']),
    'carnation': ('hana', ['#e03a4a', '#f08ab0', '#f4f4f0', '#f2c230', '#f08030', '#a050c0', '#e86a8a', '#c02a3a']),
    'kame': ('koura', ['#5a6a3a', '#6a5a3a', '#4a5a4a', '#7a6a4a', '#3a4a3a', '#8a7a50', '#5a5a40', '#6a7a5a']),
    'koinobori': ('koi', ['#2a2a30', '#e04a3a', '#2a6ad0', '#3aa05a', '#f08030', '#e88ab0', '#8a5ad0', '#f2c230']),
    'kadomatsu': ('take', ['#4a8a3a', '#5a9a40', '#3a7a34', '#6aa848', '#4a7a3a', '#5a8a48', '#3a8a40', '#6a9a3a']),
    'suika': ('suika', ['#2a6a2a', '#3a7a30', '#2a5a2a', '#4a8a3a', '#1f5a24', '#3a6a34', '#2f7a2a', '#4a7a40']),
    'tsukimi': ('dai', ['#a0703c', '#c04030', '#8a5a3a', '#2a2a2e', '#b8864a', '#d8b070', '#6a4a2a', '#a0602a']),
    'kaki': ('kaki', ['#e8641c', '#f08030', '#e05a20', '#f09040', '#d85a1a', '#f0a050', '#e87028', '#c8501a']),
    'tractor': ('karada', ['#d03a30', '#f08030', '#2a5aa0', '#3a8a4a', '#e8c040', '#f0f0f0', '#5a5a5a', '#40a0c0']),
    'combine': ('karada', ['#e0602a', '#d03a30', '#2a5aa0', '#3a8a4a', '#e8c040', '#f0f0f0', '#5a5a5a', '#f09040']),
    'tako': ('tako', ['#e04a3a', '#2a6ad0', '#f2c230', '#3aa05a', '#f4f4f0', '#8a5ad0', '#f08030', '#e88ab0']),
    'nodate': ('nodatekasa', ['#d0302a', '#e04a3a', '#b02a2a', '#8a3a7a', '#d85a3a', '#c03040', '#e86a4a', '#a03030']),
    'unaginobori': ('nobori', ['#d0302a', '#2a5aa0', '#f4f4f0', '#f2c230', '#3a8a4a', '#2a2a2e', '#f08030', '#8a3a7a']),
    'yatai': ('noren', ['#d0302a', '#2a5aa0', '#f4f4f0', '#f2c230', '#3a8a4a', '#8a3a7a', '#f08030', '#e88ab0']),
    'sakura': ('sakura', ['#f7b6cc', '#f4a0c0', '#fcd0e0', '#f090b0', '#f8c0d8', '#e88aa8', '#fde0ea', '#f6a8c0']),
    'hotaru': ('hikari', ['#e8f870', '#d0f060', '#f0f890', '#c8e850', '#f8f8a0', '#b8e040', '#e0f080', '#f0ff70']),
    'koi': ('koi', ['#e04a3a', '#f4f4f0', '#f2c230', '#f08030', '#2a2a30', '#e86a8a', '#d8b060', '#c03030']),
    'yacht': ('ho', ['#f4f4f0', '#e04a3a', '#2a6ad0', '#f2c230', '#3aa05a', '#f08030', '#8a5ad0', '#e88ab0']),
    'tetrapod': ('concrete', ['#a8a8a0', '#9a9a94', '#b8b8b0', '#8a8a84', '#a0a098', '#b0aa9a', '#90948c', '#c0bcb0']),
    'monohoshi': ('sentaku', ['#f4f4f0', '#5a8ad0', '#e88ab0', '#f2c230', '#4aa84a', '#e04a3a', '#8a5ad0', '#f08030']),
    'fuusen': ('fuusen', ['#e04a3a', '#2a7ad0', '#f2c230', '#4aa84a', '#e88ab0', '#8a5ad0', '#f08030', '#40c0c0']),
    'basutei': ('kanban', ['#2a6ad0', '#e04a3a', '#3a8a4a', '#f2c230', '#f4f4f0', '#f08030', '#5a5a5a', '#8a5ad0']),
    'komainu': ('ishi', ['#a8a8a0', '#9a968a', '#b8b4a8', '#8a8a84', '#a0a098', '#b0aa9a', '#90948c', '#c0bcb0']),
    'ema': ('ema', ['#d8b070', '#e04a3a', '#f4f4f0', '#3a8a4a', '#2a6ad0', '#f2c230', '#e88ab0', '#8a5ad0']),
    'omikuji': ('kami_w', ['#f8f8f4', '#fce8e8', '#fff8d8', '#e8f0f8', '#f0f8e8', '#f8e8f4', '#fff0e0', '#f0f0f0']),
    'hachibako': ('hakoH', ['#f4f0e0', '#d8b070', '#5a8ad0', '#3a8a4a', '#e04a3a', '#f2c230', '#a07040', '#8a8a90']),
    'bonsai': ('hachi', ['#8a5a3a', '#3a6aa0', '#2a2a2e', '#b86a3c', '#f0ece0', '#4a8a5a', '#a04a4a', '#6a6a70']),
    'jogger': ('fuku', ['#e04a3a', '#2a7ad0', '#f2c230', '#4aa84a', '#f4f4f0', '#8a5ad0', '#f08030', '#2a2a2e']),
    'sanpo': ('fuku', ['#3a5a9a', '#c04030', '#4a8a4a', '#e0a030', '#8a4a8a', '#5a5a5a', '#e8e0d0', '#3a7ab0']),
    'momiji': ('momiji', ['#d03a2a', '#e05a2a', '#c02a2a', '#e8802a', '#b8302a', '#e06a30', '#f09030', '#a82a2a']),
}
OFFSET = {'hana2': 'hana', 'hako2': 'hako', 'booru': None, 'sheet': None, 'karada2': 'karada', 'sakura2': 'sakura', 'momiji2': 'momiji',
          'koi2': 'koi', 'sentaku2': 'sentaku', 'fuusen2': 'fuusen', 'ema2': 'ema', 'fuku2': 'fuku'}   # 2つめの色（同じ表を1つずらして使う）
FIXED = {
    'kuchi': '#e8c040', 'ashi': '#2a2a2a', 'me': '#1a1a1a', 'mimi': '#8a6a50', 'hana': '#e8a0a0', 'bou': '#8a6a40', 'take': '#a08050', 'kao': '#f4e8d0',
    'mugiwara': '#e0c070', 'boushi': '#3a5a9a', 'zubon': '#3a3a4a', 'hada': '#f4c9a0', 'dougu': '#8a6a40', 'baketsu': '#5a8ac0', 'ishi': '#a8a8a0',
    'kasa': '#8a8a80', 'dai': '#9a968a', 'kabe': '#a0703c', 'yane': '#5a6070', 'torii': '#d8402e', 'nobori': '#e04a3a', 'akari': '#ffe9a0',
    'kanban': '#f4f4f0', 'kuki': '#3a8a3a', 'tane': '#6a4a2a', 'jiku': '#f0ece0', 'kirikabu': '#a0703c', 'za': '#a0703c', 'kuro': '#2a2a2e',
    'kaban': '#8a5a3a', 'kotori_k': '#8a6a4a', 'hachi': '#b86a3c', 'frame': '#c04030', 'kago': '#c8c8c0', 'mado': '#cfe0f0', 'gomi': '#5a7a5a',
    'chouchin': '#e04a3a', 'hako': '#3a8a4a', 'ami': '#4a8a5a', 'booru': '#f2c230', 'box': '#f0f0f0', 'sentai': '#f4f4f0', 'kanpan': '#a0703c',
    'hata': '#e04a3a', 'bui': '#f08020', 'tsubomi': '#f4a0c0', 'kara': '#d84a3a', 'suna2': '#e0c890', 'sheet': '#2a7ad0', 'nomimono': '#e8e0d0',
    'tanuki': '#8a6a4a', 'tokkuri': '#7a5a3a', 'concrete': '#a8a8a0', 'handle': '#d03a30', 'ita': '#8a6a40', 'mizu_d': '#6aa8e0', 'hane2': '#8ac8e8',
    'cha': '#2f7a34', 'waku': '#8a8a90', 'mizu_s': '#cfe9f7', 'happi': '#2a3a6a', 'hachimaki': '#f4f4f0', 'aka': '#d23a2e', 'kin': '#f2c230',
    'koura': '#5a6a3a', 'koi': '#2a2a30', 'koi2': '#e04a3a', 'koi3': '#2a6ad0', 'fukinagashi': '#f2c230', 'matsu': '#2a6a3a', 'suika': '#2a6a2a',
    'suikaA': '#e04a4a', 'dango': '#f8f4ec', 'susuki': '#c8b080', 'susukiH': '#e8dcc0', 'kaki': '#e8641c', 'karada': '#d03a30', 'karada2': '#a8401c',
    'reaper': '#e8c048', 'rotary': '#8a8a90', 'tsuchi': '#7a5a3a', 'tako': '#e04a3a', 'ito': '#f4f4f0', 'takoO': '#f2c230', 'nodatekasa': '#d0302a',
    'akaMousen': '#c8302a', 'kimono': '#6a4a8a', 'chawan': '#3a3a3a', 'yane_y': '#d0302a', 'noren': '#2a5aa0', 'shina': '#f2c230',
    'fuku': '#3a5a9a', 'kawa': '#6a7a4a', 'miki': '#6b4a2e', 'atama': '#5a4a38',
    'o_kiji': '#7a5a3a', 'denkisen': '#3a3a3a', 'hikari': '#e8f870', 'ho': '#f4f4f0', 'kamome_t': '#f0f0f0', 'sao': '#c8c8c8', 'sentaku': '#f4f4f0',
    'sentaku2': '#5a8ad0', 'fuusen': '#e04a3a', 'fuusen2': '#2a7ad0', 'nawa': '#d8c8a0', 'yane_e': '#5a4a3a', 'ema': '#d8b070', 'ema2': '#e04a3a',
    'kami_w': '#f8f8f4', 'hakoH': '#f4f0e0', 'futaH': '#8a8a90', 'hachi_y': '#f2c230', 'eda': '#6b4a2e', 'me_f': '#e8c040', 'donguri': '#8a5a2a',
    'tana': '#a0703c', 'fuku2': '#2a7ad0', 'himo': '#c04030',
    'sakura': '#f7b6cc', 'sakura2': '#fde0ea', 'momiji': '#d03a2a', 'momiji2': '#f09030', 'wara': '#d8b860', 'kami': '#2a2018', 'kasa_c': '#d8b860',
}
PLANTS = {'ha', 'kusa', 'koke', 'kuki'}
GREEN = [['#5aa84a', '#4f9a3e'], ['#3a8a3a', '#2f7f2e'], ['#8a8a3a', '#a06a2a'], ['#5a6a4a', '#4a5a40']]   # 春夏秋冬の草と葉
ACCENT = {   # 季節の点（足もと）
    'land': [['#f7b6cc', '#fde0ea'], ['#56b552', '#2f7f2e'], ['#c8641e', '#c99a1e', '#a0402a'], ['#ffffff', '#eef4f8']],
    'water': [['#f7b6cc', '#fde0ea'], ['#8ac0f0', '#cfe9f7'], ['#c8641e', '#c99a1e'], ['#ffffff', '#cfe0ee']],
    'sand': [['#f7b6cc', '#fde0ea'], ['#f6eee0', '#9a948a'], ['#4a6a3a', '#a08a6a'], ['#ffffff', '#eef4f8']],
}


def palette(subj, c, s):
    pal = dict(FIXED)
    if subj in BIRDS:
        h, b, k, a = BIRDS[subj][c]
        pal.update(hane=h, hara=b, kuchi=k, ashi=a, atama=h)
    if subj == 'kamo':
        h, b, a, k = DUCKS[c]
        pal.update(hane=h, hara=b, atama=a, kuchi=k)
    if subj in COATS:
        ke = COATS[subj][c]
        pal.update(ke=ke, ashi=ke, hara='#%02x%02x%02x' % tuple(min(255, int(v * 0.6 + 100)) for v in rgb(ke)), hana='#e8a0a0' if subj == 'neko' else '#2a2a2a', mimi=ke)
    if subj in V8:
        m, cols = V8[subj]
        pal[m] = cols[c]
        for m2, base in OFFSET.items():
            if base == m:
                pal[m2] = cols[(c + 3) % 8]
    # 2つめに目立つ色（題材の中でとなりの色）
    pal.setdefault('hana2', pal.get('hana'))
    if subj in ('sanrinsha', 'picnic'):
        pal['booru'] = V8['kasa'][1][(c + 2) % 8]
    if subj in ('gomi',):
        pal['hako2'] = V8['gomi'][1][(c + 3) % 8]
    if subj == 'tanuki':
        pal['hara'] = '#e8d8b0'
    if subj == 'sanpo':   # つれている犬
        ke = COATS['inu'][(c + 3) % 8]
        pal.update(ke=ke, ashi=ke, mimi=ke, hana='#2a2a2a', hara='#%02x%02x%02x' % tuple(min(255, int(v * 0.6 + 100)) for v in rgb(ke)))
    if subj == 'fukurou':
        pal['me_f'] = '#e8c040'
    if subj == 'koinobori':
        cols = V8['koinobori'][1]
        pal['koi2'], pal['koi3'] = cols[(c + 2) % 8], cols[(c + 5) % 8]
    if subj == 'chatsumi':
        pal['kasa'] = '#d8b860'
    for p in PLANTS:
        pal[p] = GREEN[s][(c + s) % 2]
    if subj == 'hasu':
        pal['ha'] = ['#5aa84a', '#3a8a3a', '#7a8a3a', '#6a7a4a'][s]
    return pal


MISSING = set()


def compose(mat, band, names, subj, c, s, seed):
    pal = palette(subj, c, s)
    img = np.zeros((N, N, 4), np.uint8)
    obj = mat != 255
    for y, x in zip(*np.where(obj)):
        n = names[mat[y, x]]
        col = pal.get(n)
        if col is None:   # 色を決めていない材質（作りなおしのときに気づけるよう、名前を出す）
            MISSING.add((subj, n))
            col = '#ff00ff'
        img[y, x, :3] = tones(col)[band[y, x]]
        img[y, x, 3] = 255
    if s == 3:   # 冬：上の面（上にとなりがない、明るい面）に雪
        top = obj & ~np.vstack([np.zeros((1, N), bool), obj[:-1]])
        img[top & (band >= 1)] = (246, 250, 252, 255)
    edge = np.zeros_like(obj)
    edge[1:] |= obj[:-1]
    edge[:-1] |= obj[1:]
    edge[:, 1:] |= obj[:, :-1]
    edge[:, :-1] |= obj[:, 1:]
    out = edge & ~obj
    img[out] = (*OUTLINE, 255)
    # 季節の点：小物の足もと（下のほう）の、あいている所に3〜5つ
    env = 'water' if subj in WATER else 'sand' if subj in SAND else 'land'
    rnd = random.Random(seed)
    ys = np.where(obj.any(axis=1))[0]
    y0 = int(ys[-1]) if len(ys) else N - 3
    cand = [(y, x) for y in range(max(0, y0 - 3), min(N, y0 + 3)) for x in range(N) if img[y, x, 3] == 0]
    rnd.shuffle(cand)
    for (y, x) in cand[:3 + rnd.randrange(3)]:
        img[y, x] = (*rgb(rnd.choice(ACCENT[env][s])), 255)
    return img


def main():
    os.makedirs(OUT, exist_ok=True)
    seen = set()
    total = len(SUBJECTS) * 6 * 4 * 8
    rows = (total + COLS - 1) // COLS
    for s in range(4):
        sheet = np.zeros((rows * N, COLS * N, 4), np.uint8)
        for si, subj in enumerate(SUBJECTS):
            for k in range(6):
                for d in range(4):
                    dat = np.load(os.path.join(TMP, f'{subj}-{k}-{d}.npz'))
                    mat, band, names = dat['mat'], dat['band'], [str(x) for x in dat['names']]
                    for c in range(8):
                        i = ((si * 6 + k) * 4 + d) * 8 + c
                        img = compose(mat, band, names, subj, c, s, f'{subj}-{k}-{d}-{c}-{s}')
                        seen.add(hashlib.md5(img.tobytes()).hexdigest())
                        sheet[(i // COLS) * N:(i // COLS + 1) * N, (i % COLS) * N:(i % COLS + 1) * N] = img
        im = Image.fromarray(sheet, 'RGBA')
        path = os.path.join(OUT, f'deco-{s}.png')
        im.save(path, optimize=True)
        print(f'deco-{s}.png', im.size, os.path.getsize(path))
    print('ちがう絵:', len(seen), '/', total * 4)
    if MISSING:
        print('色を決めていない材質:', sorted(MISSING))
    with open(os.path.join(OUT, 'deco.json'), 'w') as f:   # pixel.js が読む：題材の順番と、数
        json.dump({'subjects': SUBJECTS, 'poses': 6, 'dirs': 4, 'colors': 8, 'cols': COLS, 'unique': len(seen)}, f, ensure_ascii=False)


if __name__ == '__main__':
    main()
