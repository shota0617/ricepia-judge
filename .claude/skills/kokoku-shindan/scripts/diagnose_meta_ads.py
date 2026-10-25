#!/usr/bin/env python3
"""Meta広告マネージャのCSVを集計し、広告ごとに増額候補／維持／要改善／停止候補／データ不足を判定する。

使い方:
  python3 diagnose_meta_ads.py report.csv [--level campaign|adset|ad] [--target-cpa 3000]
                               [--margin 35] [--conv-col "購入"] [--json out.json]

判定ロジックは ricepia-judge の meta-ads.html と同じ。出力は Markdown（標準出力）。
"""
import argparse, csv, io, json, re, statistics, sys
from collections import defaultdict

COLS = {
    "campaign": [r"^キャンペーン名$", r"^campaign name$"],
    "adset": [r"^広告セット名$", r"^ad set name$"],
    "ad": [r"^広告名$", r"^ad name$"],
    "day": [r"^日$", r"^day$", r"^日付$", r"^date$"],
    "start": [r"^レポート開始日$", r"^reporting starts$"],
    "end": [r"^レポート終了日$", r"^reporting ends$"],
    "spend": [r"^消化金額", r"^amount spent", r"^費用"],
    "imp": [r"^インプレッション$", r"^impressions$"],
    "reach": [r"^リーチ$", r"^reach$"],
    "freq": [r"^フリークエンシー$", r"^frequency$"],
    "linkClicks": [r"^リンクのクリック$", r"^link clicks$"],
    "clicksAll": [r"^クリック[(（]すべて[)）]$", r"^clicks \(all\)$"],
    "results": [r"^結果$", r"^results$"],
    "value": [r"購入.*コンバージョン値", r"purchases? conversion value", r"website purchases conversion value"],
}
CONV_HINT = re.compile(r"^(結果|results|購入|purchases?|ウェブサイトでの購入|website purchases|登録|registrations?|リード|leads?|メッセージ|messaging|新しいメッセージのスレッド|カートに追加|adds? to cart|コンテンツビュー|content views?|ランディングページビュー|landing page views?|完了済み登録|completed registrations?)", re.I)
CONV_EXCLUDE = re.compile(r"(単価|cost per|コンバージョン値|conversion value|ROAS|率|rate)", re.I)
VERDICT_LABEL = {"up": "📈 増額候補", "keep": "➖ 維持", "fix": "🛠 要改善", "stop": "⛔ 停止候補", "wait": "⏳ データ不足"}
ORDER = {"stop": 0, "fix": 1, "up": 2, "keep": 3, "wait": 4}


def num(v):
    if v is None: return None
    s = re.sub(r"[,¥￥%\s]", "", str(v))
    if s in ("", "-", "—"): return None
    try: return float(s)
    except ValueError: return None


def div(a, b): return a / b if b and a is not None else None


def norm_date(s):
    if not s: return None
    m = re.match(r"(\d{4})[/\-.年](\d{1,2})[/\-.月](\d{1,2})", str(s))
    return f"{m[1]}-{int(m[2]):02d}-{int(m[3]):02d}" if m else None


def yen(v): return "—" if v is None else f"¥{round(v):,}"
def pct(v): return "—" if v is None else f"{v*100:.2f}%"
def roas(v): return "—" if v is None else f"{v*100:.0f}%"


def find_cols(headers):
    col = {}
    for key, pats in COLS.items():
        for i, h in enumerate(headers):
            if any(re.search(p, h.strip(), re.I) for p in pats):
                col[key] = i; break
    return col


def conv_candidates(headers, col):
    """成果列の候補。loadText と同じく、指標列を除いて名前で判定する。
    値が全行空欄や「—」でも候補に残す（成果0件の広告は「成果が無い」として CPA 判定したい）"""
    metric_cols = {col[k] for k in ("spend", "imp", "reach", "freq", "linkClicks", "clicksAll") if k in col}
    return [i for i, h in enumerate(headers)
            if i not in metric_cols and not CONV_EXCLUDE.search(h) and CONV_HINT.search(h.strip())]


def empty():
    return {"spend": 0, "imp": 0, "reach": 0, "freqSingle": None, "linkClicks": 0, "hasLink": False,
            "clicksAll": 0, "conv": 0, "value": 0, "hasValue": False, "rows": 0, "byDate": defaultdict(lambda: {"spend": 0, "imp": 0, "clicks": 0, "conv": 0})}


def add_row(a, r, col, conv_idx, date_idx):
    g = lambda k: num(r[col[k]]) if k in col and col[k] < len(r) else None
    sp, im, re_, lc, ca = g("spend") or 0, g("imp") or 0, g("reach") or 0, g("linkClicks"), g("clicksAll") or 0
    a["spend"] += sp; a["imp"] += im; a["reach"] += re_; a["clicksAll"] += ca; a["rows"] += 1
    if lc is not None: a["linkClicks"] += lc; a["hasLink"] = True
    f = g("freq")
    if f is not None: a["freqSingle"] = f
    cv = num(r[conv_idx]) if conv_idx is not None and conv_idx < len(r) else None
    if cv: a["conv"] += cv
    val = g("value")
    if val is not None: a["value"] += val; a["hasValue"] = True
    d = norm_date(r[date_idx]) if date_idx is not None and date_idx < len(r) else None
    if d:
        b = a["byDate"][d]; b["spend"] += sp; b["imp"] += im; b["clicks"] += (lc if lc is not None else ca); b["conv"] += cv or 0


def metrics(a):
    clicks = a["linkClicks"] if a["hasLink"] else a["clicksAll"]
    freq, approx = None, False
    if a["rows"] == 1 and a["freqSingle"] is not None: freq = a["freqSingle"]
    elif a["reach"] > 0: freq = a["imp"] / a["reach"]; approx = a["rows"] > 1
    return {"spend": a["spend"], "imp": a["imp"], "reach": a["reach"] or None, "freq": freq, "freqApprox": approx, "clicks": clicks,
            "ctr": div(clicks, a["imp"]), "cpc": div(a["spend"], clicks), "cpm": a["spend"] / a["imp"] * 1000 if a["imp"] else None,
            "conv": a["conv"], "cvr": div(a["conv"], clicks), "cpa": div(a["spend"], a["conv"]),
            "value": a["value"] if a["hasValue"] else None, "roas": div(a["value"], a["spend"]) if a["hasValue"] else None}


def trend(a, split):
    if not split: return None
    p, q = {"spend": 0, "imp": 0, "clicks": 0, "conv": 0}, {"spend": 0, "imp": 0, "clicks": 0, "conv": 0}
    for d, b in a["byDate"].items():
        t = p if d < split else q
        for k in t: t[k] += b[k]
    if p["imp"] < 500 or q["imp"] < 500: return None
    ctr1, ctr2 = div(p["clicks"], p["imp"]), div(q["clicks"], q["imp"])
    cpa1, cpa2 = div(p["spend"], p["conv"]), div(q["spend"], q["conv"])
    return {"ctrChange": ctr2 / ctr1 - 1 if ctr1 and ctr2 is not None else None,
            "cpaChange": cpa2 / cpa1 - 1 if cpa1 and cpa2 else None,
            "cpm1": p["spend"] / p["imp"] * 1000, "cpm2": q["spend"] / q["imp"] * 1000}


def issues_for(it, med_cpm, med_ctr):
    out = []
    f = it["freq"]
    if f is not None:
        tag = "（参考値）" if it["freqApprox"] else ""
        if f >= 3.5: out.append(("bad", f"フリークエンシー{f:.1f}{tag}：同じ人に出すぎ。広告の飽き・反応低下の原因"))
        elif f >= 2.5: out.append(("warn", f"フリークエンシー{f:.1f}{tag}：やや高め。新しいクリエイティブを準備"))
    if it["imp"] >= 1000 and it["ctr"] is not None:
        if it["ctr"] < 0.005: out.append(("bad", f"CTR {pct(it['ctr'])}：低い。最初の1秒・画像・一言目の見直し"))
        elif med_ctr and it["ctr"] < med_ctr * 0.6: out.append(("warn", f"CTR {pct(it['ctr'])}：他より低い（中央値 {pct(med_ctr)}）"))
        elif it["ctr"] >= 0.015: out.append(("good", f"CTR {pct(it['ctr'])}：良好。訴求が刺さっている"))
    if med_cpm and it["imp"] >= 1000 and it["cpm"] and it["cpm"] > med_cpm * 1.5:
        out.append(("warn", f"CPM {yen(it['cpm'])}：中央値の{it['cpm']/med_cpm:.1f}倍。ターゲットが狭い/配置が割高"))
    if it["clicks"] >= 50 and it["cvr"] is not None and it["cvr"] < 0.01 and it["ctr"] is not None and it["ctr"] >= 0.008:
        out.append(("bad", f"クリック後の成果率 {pct(it['cvr'])}：広告は見られているが成果につながらない。LP・価格・導線を確認"))
    t = it.get("trend")
    if t:
        if t["ctrChange"] is not None and t["ctrChange"] <= -0.25: out.append(("bad", f"後半のCTRが前半より{round(-t['ctrChange']*100)}%低下：クリエイティブ疲れの兆候"))
        if t["cpaChange"] is not None and t["cpaChange"] >= 0.3: out.append(("bad", f"後半のCPAが前半より{round(t['cpaChange']*100)}%悪化"))
        if t["cpaChange"] is not None and t["cpaChange"] <= -0.2: out.append(("good", f"後半のCPAが{round(-t['cpaChange']*100)}%改善"))
    return out


def diagnose(it, ctx):
    iss = issues_for(it, ctx["medCpm"], ctx["medCtr"])
    bad = [i for i in iss if i[0] == "bad"]
    v, why = "keep", ""
    cpa, bench = it["cpa"], ctx["benchCpa"]
    if ctx["convIdx"] is None:
        v = "wait" if it["imp"] < 1000 else ("fix" if bad else "keep"); why = "成果の列がないため反応指標のみで判定"
    elif ctx["useRoas"]:
        be, r, bl = ctx["roasBench"], it["roas"], ctx["roasBenchLabel"]
        fix_below = 1 if ctx["isBreakeven"] else 0.7
        red = "（赤字）" if ctx["isBreakeven"] else ""
        if it["conv"] == 0 and bench and it["spend"] >= bench * 2: v, why = "stop", f"成果0件で{yen(it['spend'])}消化"
        elif it["conv"] < 3 and it["spend"] < (bench or float("inf")) * 1.5: v, why = "wait", f"成果{it['conv']:.0f}件・判断には少ない"
        elif r is not None and r >= be * 1.3 and it["conv"] >= 3: v, why = "up", f"ROAS {roas(r)}が{bl}{roas(be)}を大きく上回る"
        elif r is not None and r < be * 0.4: v, why = "stop", f"ROAS {roas(r)}が{bl}{roas(be)}を大きく下回る{red}"
        elif r is not None and r < be * fix_below: v, why = "fix", f"ROAS {roas(r)}が{bl}{roas(be)}を下回る{red}"
        else: v, why = "keep", f"ROAS {roas(r)}：{bl}{roas(be)}" + ("以上で黒字" if ctx["isBreakeven"] else "並み以上")
    elif bench:
        if it["conv"] == 0 and it["spend"] >= bench * 2: v, why = "stop", f"成果0件で{yen(it['spend'])}消化（基準CPAの{it['spend']/bench:.1f}倍）"
        elif it["conv"] == 0 or (it["conv"] < 3 and it["spend"] < bench * 1.5):
            v, why = "wait", (f"成果0件・消化{yen(it['spend'])}はまだ判断前" if it["conv"] == 0 else f"成果{it['conv']:.0f}件・判断には少ない")
        elif cpa <= bench * 0.8 and it["conv"] >= 3: v, why = "up", f"CPA {yen(cpa)}が基準{yen(bench)}より{round((1-cpa/bench)*100)}%安い"
        elif cpa > bench * 2: v, why = "stop", f"CPA {yen(cpa)}が基準の{cpa/bench:.1f}倍"
        elif cpa > bench * 1.3: v, why = "fix", f"CPA {yen(cpa)}が基準{yen(bench)}より{round((cpa/bench-1)*100)}%高い"
        else: v, why = "keep", f"CPA {yen(cpa)}：基準{yen(bench)}の範囲内"
    else:
        v, why = ("keep" if it["conv"] > 0 else "wait"), "基準CPAが未設定で全体にも成果がないため判定保留"
    if v == "up" and bad: v, why = "keep", why + "。ただし悪化の兆候があるため増額は様子見"
    if v == "keep" and len(bad) >= 2: v, why = "fix", why + "。複数の悪化サインあり"
    it["verdict"], it["why"], it["issues"] = v, why, iss


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("csv"); ap.add_argument("--level", default=None, choices=["campaign", "adset", "ad"])
    ap.add_argument("--target-cpa", type=float, default=0); ap.add_argument("--margin", type=float, default=0, help="粗利率%%")
    ap.add_argument("--conv-col", default=None, help="成果列の名前（部分一致）"); ap.add_argument("--json", default=None)
    args = ap.parse_args()
    raw = open(args.csv, "rb").read()
    text = None
    # Excelで保存し直したCSVは Shift_JIS（cp932）のことがある。文字化けした見出しで集計してゼロを出さないよう、厳密に判定する
    for enc in (("utf-16",) if raw.startswith((b"\xff\xfe", b"\xfe\xff")) else ("utf-8-sig", "cp932")):
        try:
            text = raw.decode(enc); break
        except UnicodeDecodeError:
            continue
    if text is None:
        sys.exit("CSVの文字コードを判定できません（UTF-8 / Shift_JIS / UTF-16 に対応）")
    rows = [r for r in csv.reader(io.StringIO(text)) if any(c.strip() for c in r)]
    if len(rows) < 2:
        sys.exit("データ行がありません")
    headers, rows = [h.strip() for h in rows[0]], rows[1:]
    col = find_cols(headers)
    if "spend" not in col or "imp" not in col:
        sys.exit("「消化金額」と「インプレッション」の列が見つかりません。広告マネージャからエクスポートしたCSVか確認してください（見つかった列: " + " / ".join(headers[:12]) + "）")
    # 合計行（名前列が空で金額だけ入っている行）を除外。meta-ads.html の loadText と同じ
    name_cols = [col[k] for k in ("campaign", "adset", "ad") if k in col]
    rows = [r for r in rows if not name_cols or any((r[i] if i < len(r) else "").strip() for i in name_cols)]
    date_idx = col.get("day")
    # 「日」列が無くても、各行の開始日＝終了日で日付が複数あれば日別データとみなす（meta-ads.html の loadText と同じ）
    if date_idx is None and "start" in col and "end" in col:
        g = lambda r, k: norm_date(r[col[k]]) if col[k] < len(r) else None
        if rows and all(g(r, "start") and g(r, "start") == g(r, "end") for r in rows) and len({g(r, "start") for r in rows}) > 1:
            date_idx = col["start"]
    level = args.level or ("ad" if "ad" in col else "adset" if "adset" in col else "campaign" if "campaign" in col else None)
    cands = conv_candidates(headers, col)
    conv_idx = None
    if args.conv_col:
        # 明示指定は全列から探す（検出ヒントに当たらない成果列も使えるように）。見つからなければ別の列で代用せずに終了
        hits = [i for i, h in enumerate(headers) if h == args.conv_col] or [i for i, h in enumerate(headers) if args.conv_col in h]
        if not hits:
            sys.exit(f"成果列 '{args.conv_col}' が見つかりません。列名: {', '.join(headers)}")
        conv_idx = hits[0]
    elif cands:
        # meta-ads.html の setupSettings と同じ優先順位：合計が正の「購入」→ 合計が正の「結果」→ 合計が最大の列
        sums = {i: sum((num(r[i]) or 0) for r in rows if i < len(r)) for i in cands}
        # 列番号0も有効なので or で繋がず None を明示的に確かめる
        conv_idx = next((i for i in cands if re.fullmatch(r"(購入|purchases?|ウェブサイトでの購入|website purchases)", headers[i], re.I) and sums[i] > 0), None)
        if conv_idx is None:
            conv_idx = next((i for i in cands if re.fullmatch(r"(結果|results)", headers[i], re.I) and sums[i] > 0), None)
        if conv_idx is None:
            conv_idx = max(cands, key=lambda i: sums[i])

    dates = sorted({norm_date(r[date_idx]) for r in rows if date_idx is not None and date_idx < len(r)} - {None}) if date_idx is not None else []
    if not dates and "start" in col:
        s = sorted({norm_date(r[col["start"]]) for r in rows} - {None}); e = sorted({norm_date(r[col["end"]]) for r in rows} - {None}) if "end" in col else []
        if s: dates = [s[0], (e[-1] if e else s[-1])]
    split = dates[len(dates) // 2] if date_idx is not None and len(dates) >= 6 else None

    tot = empty()
    for r in rows: add_row(tot, r, col, conv_idx, date_idx)
    total = metrics(tot); total["trend"] = trend(tot, split)

    groups = {}
    if level:
        keys = {"campaign": ["campaign"], "adset": ["campaign", "adset"], "ad": ["campaign", "adset", "ad"]}[level]
        for r in rows:
            parts = [(r[col[k]] if col[k] < len(r) else "").strip() for k in keys if k in col]
            key = " › ".join(parts)
            if key not in groups: groups[key] = {"name": parts[-1] or "(名前なし)", "parent": " › ".join(parts[:-1]), "agg": empty()}
            add_row(groups[key]["agg"], r, col, conv_idx, date_idx)
    items = []
    for g in groups.values():
        m = metrics(g["agg"]); m["trend"] = trend(g["agg"], split); m.update(name=g["name"], parent=g["parent"]); items.append(m)

    has_value = total["value"] is not None and total["value"] > 0
    breakeven = 100 / args.margin if args.margin > 0 else None
    roas_bench = breakeven or (total["roas"] if has_value else None)
    use_roas = bool(has_value and roas_bench and (breakeven is not None or not args.target_cpa > 0))
    bench_cpa = args.target_cpa if args.target_cpa > 0 else total["cpa"]
    big = [i for i in items if i["imp"] >= 1000]
    med_cpm = statistics.median([i["cpm"] for i in big if i["cpm"] is not None]) if big else None
    med_ctr = statistics.median([i["ctr"] for i in big if i["ctr"] is not None]) if big else None
    ctx = {"benchCpa": bench_cpa, "useRoas": use_roas, "roasBench": roas_bench, "roasBenchLabel": "損益分岐" if breakeven else "全体平均",
           "isBreakeven": breakeven is not None, "medCpm": med_cpm, "medCtr": med_ctr, "convIdx": conv_idx}
    for it in items: diagnose(it, ctx)
    total["issues"] = issues_for(total, None, None)

    # ---- Markdown 出力
    L = []
    L.append(f"# Meta広告 診断結果\n")
    L.append(f"- 期間: {dates[0]+' 〜 '+dates[-1] if dates else '不明'}" + (f"（日別データ。{split} 以降を後半として比較）" if split else ""))
    L.append(f"- 成果の定義: {headers[conv_idx] if conv_idx is not None else 'なし（成果列なし）'}")
    L.append(f"- 判定の指標: " + (f"ROAS（基準：{ctx['roasBenchLabel']} {roas(roas_bench)}）" if use_roas else f"CPA（基準：{'目標CPA' if args.target_cpa>0 else '全体平均CPA'} {yen(bench_cpa)}）"))
    if breakeven: L.append(f"- 損益分岐ROAS: {roas(breakeven)}（粗利率 {args.margin:.0f}%）")
    t = total
    reach_s = f"{t['reach']:,.0f}" if t["reach"] else "—"
    freq_s = (f"{t['freq']:.2f}" + ("(参考値)" if t["freqApprox"] else "")) if t["freq"] is not None else "—"
    L.append(f"\n## アカウント全体\n消化 {yen(t['spend'])} / 表示 {t['imp']:,.0f} / リーチ {reach_s} / 頻度 {freq_s} / クリック {t['clicks']:,.0f} / CTR {pct(t['ctr'])} / CPC {yen(t['cpc'])} / CPM {yen(t['cpm'])}")
    if conv_idx is not None: L.append(f"成果 {t['conv']:,.0f} / 成果率 {pct(t['cvr'])} / CPA {yen(t['cpa'])}" + (f" / 売上 {yen(t['value'])} / ROAS {roas(t['roas'])}" if has_value else ""))
    if t["trend"]:
        tr = t["trend"]; f = lambda v: "—" if v is None else f"{v*100:+.0f}%"
        L.append(f"前半→後半: CTR {f(tr['ctrChange'])} / CPA {f(tr['cpaChange'])} / CPM {yen(tr['cpm1'])}→{yen(tr['cpm2'])}")
    for s, m in t["issues"]: L.append(f"- [{s}] {m}")
    cnt = defaultdict(int); sp = defaultdict(float)
    for i in items: cnt[i["verdict"]] += 1; sp[i["verdict"]] += i["spend"]
    L.append("\n## 判定の内訳\n" + " / ".join(f"{VERDICT_LABEL[v]} {cnt[v]}件（{yen(sp[v])}）" for v in ORDER if cnt[v]))
    level_label = {"campaign": "キャンペーン", "adset": "広告セット", "ad": "広告"}.get(level, "全体")
    L.append(f"\n## {level_label}別（判定順・消化額順）\n")
    L.append("| 判定 | 名前 | 上位 | 消化 | 表示 | 頻度 | CTR | CPM | 成果 | 成果率 | CPA | ROAS | 理由 | 気になる点 |\n|---|---|---|---|---|---|---|---|---|---|---|---|---|---|")
    for i in sorted(items, key=lambda x: (ORDER[x["verdict"]], -x["spend"])):
        L.append(f"| {VERDICT_LABEL[i['verdict']]} | {i['name']} | {i['parent']} | {yen(i['spend'])} | {i['imp']:,.0f} | {('%.1f' % i['freq']) if i['freq'] is not None else '—'} | {pct(i['ctr'])} | {yen(i['cpm'])} | {i['conv']:,.0f} | {pct(i['cvr'])} | {yen(i['cpa'])} | {roas(i['roas'])} | {i['why']} | {' ／ '.join(m for _, m in i['issues'])} |")
    print("\n".join(L))
    if args.json:
        json.dump({"dates": dates, "split": split, "conv_col": headers[conv_idx] if conv_idx is not None else None, "ctx": ctx, "total": total, "items": items}, open(args.json, "w"), ensure_ascii=False, indent=1, default=str)


if __name__ == "__main__":
    main()
