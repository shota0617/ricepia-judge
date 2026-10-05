/* Content studio, copy doctor, review replies */
(function(){
"use strict";
const {$, esc} = RP;
const JUDGE_KEY = "ricepia_last_judge"; // written by index.html after each quality judgment

/* ================= CONTENT STUDIO ================= */
let chan, goal, tone, image = null;
RP.mod.studio = {
  lastText: "", lastMeta: null,
  init(){
    chan = RP.chips($("#chanPicker"), RP.CHANNELS.map(c => ({value:c.value, label:c.label, hint:c.spec})), {value:"instagram"});
    goal = RP.chips($("#stGoal"), RP.GOALS, {value:"購入促進"});
    tone = RP.chips($("#stTone"), RP.TONES, {value:"brand"});
    const sel = $("#stProduct"); sel.dataset.products = "any"; RP.productOptions(sel, {any:true});
    $("#occasionList").innerHTML = Object.values(RP.SEASON).flat().map(s => `<option value="${esc(s)}">`).join("");
    $("#stImage").addEventListener("change", e => this.onImage(e));
  },
  show(p){
    if(!$("#stOccasion").value) $("#stOccasion").value = RP.monthSeason(new Date().getMonth()+1)[0] || "";
    if(p.channel) chan.set(p.channel);
    if(p.product) $("#stProduct").value = p.product;
    if(p.notes) $("#stNotes").value = p.notes;
    if(p.occasion) $("#stOccasion").value = p.occasion;
    this.renderBridge();
  },
  renderBridge(){
    let j = null; try{ j = JSON.parse(localStorage.getItem(JUDGE_KEY)); }catch(e){}
    const el = $("#judgeBridge");
    if(!j || !j.grade){ el.hidden = true; return; }
    el.hidden = false;
    el.innerHTML = `<span>🍚 最新の品質判定：<b>グレード${esc(j.grade)}</b>${j.variety && j.variety !== "不明" ? "（" + esc(j.variety) + "）" : ""}・平均${esc(j.avg)}点 <span class="muted">${esc(j.date || "")}</span></span>
      <button class="btn-sm" id="useJudge">この判定結果で投稿を作る</button>`;
    $("#useJudge").onclick = () => {
      const match = (RP.brand().products || []).find(p => j.variety && (p.name.includes(j.variety) || j.variety.includes(p.name)));
      if(match) $("#stProduct").value = match.name;
      $("#stNotes").value = `本日精米したお米の品質判定結果を紹介する投稿にしてください。\n判定：グレード${j.grade}（12項目平均${j.avg}点）\n品種：${j.variety || "不明"}\nAIコメント：${j.comment || ""}\n品質のポイント：${(j.points || []).join("、")}\nおすすめ用途：${j.usage || ""}\n※「5代目が毎回品質をチェックしている」安心感を伝える。点数は誇張しない。`;
      RP.toast("判定結果を補足欄に入れました");
    };
  },
  onImage(e){
    const f = e.target.files[0]; e.target.value = "";
    if(!f || !f.type.startsWith("image/")) return;
    const img = new Image(), fr = new FileReader();
    fr.onload = () => {
      img.onload = () => {
        // downscale to keep requests small
        const max = 1280, sc = Math.min(1, max / Math.max(img.width, img.height));
        const c = document.createElement("canvas"); c.width = Math.round(img.width * sc); c.height = Math.round(img.height * sc);
        c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
        const url = c.toDataURL("image/jpeg", 0.85);
        image = {url, data: url.split(",")[1], mime:"image/jpeg"};
        const p = $("#stImagePrev"); p.hidden = false;
        p.innerHTML = `<img src="${url}" alt="添付写真"/><button title="写真を外す">×</button>`;
        p.querySelector("button").onclick = () => { image = null; p.hidden = true; p.innerHTML = ""; };
      };
      img.src = fr.result;
    };
    fr.readAsDataURL(f);
  },
  buildPrompt(){
    const c = RP.CHANNELS.find(x => x.value === chan.get());
    const n = +$("#stVariants").value;
    const t = tone.get() === "brand" ? "ブランド設定のトーンに従う" : tone.get();
    return [
      "# 依頼：販促コンテンツの作成",
      "チャネル：" + c.label,
      "チャネルの仕様：" + c.spec,
      "商品：" + ($("#stProduct").value || "特定の商品なし（お店全体の発信）"),
      "目的：" + goal.get(),
      "季節・イベント：" + ($("#stOccasion").value || "特になし"),
      "トーン：" + t,
      "補足・伝えたいこと：" + ($("#stNotes").value.trim() || "特になし"),
      "今日の日付：" + RP.today(),
      image ? "添付写真：投稿に使う写真です。写っているものを観察し、内容と矛盾しない文章にしてください。" : "",
      "",
      `# 出力形式`,
      `- ${n}案を作る。案ごとに切り口（例：産地の物語／食べ方提案／季節感／店主の想い）を変える。`,
      `- 各案は「## 案1：〔切り口〕」のような見出しで始め、その下にそのまま貼り付けられる完成原稿を書く。`,
      `- 各案の最後に「> ねらい：」で始まる1行の解説を付ける。`,
      `- 前置き・あいさつ・全体のまとめは不要。`
    ].filter(Boolean).join("\n");
  },
  async generate(){
    const btn = $("#stGo"), out = $("#stOut");
    const prompt = this.buildPrompt();
    const content = image ? [{type:"image", source:{type:"base64", media_type:image.mime, data:image.data}}, {type:"text", text:prompt}] : prompt;
    RP.busy(btn, true); $("#stActions").hidden = true; $("#stRefine").hidden = true;
    const t0 = Date.now();
    try{
      const r = await RP.ai.into(out, {feature:"content", messages:[{role:"user", content}], maxTokens: 12000});
      this.lastText = r.text;
      this.lastMeta = {channel: chan.get(), product: $("#stProduct").value, goal: goal.get()};
      $("#stMeta").textContent = RP.chanLabel(chan.get()) + "・" + ((Date.now() - t0) / 1000).toFixed(0) + "秒";
      $("#stActions").hidden = false; $("#stRefine").hidden = false;
    }catch(e){ RP.errorBox(out, e); }
    finally{ RP.busy(btn, false); }
  },
  async refine(){
    const ins = $("#stRefineInp").value.trim();
    if(!ins || !this.lastText) return;
    const out = $("#stOut"), btn = $("#stRefine button");
    RP.busy(btn, true, "修正中");
    try{
      const r = await RP.ai.into(out, {feature:"refine", maxTokens: 12000,
        prompt: `次の原稿を、修正指示に従って書き直してください。チャネルの仕様（${RP.CHANNELS.find(x => x.value === this.lastMeta.channel).spec}）は守り、見出し構成（## 案N、> ねらい）は維持してください。\n\n# 修正指示\n${ins}\n\n# 元の原稿\n${this.lastText}`});
      this.lastText = r.text; $("#stRefineInp").value = "";
    }catch(e){ RP.errorBox(out, e); }
    finally{ RP.busy(btn, false); }
  },
  copy(){ RP.copy(this.lastText.replace(/^>\s*ねらい：.*$/gm, "").trim()); },
  save(){
    if(!this.lastText) return;
    const m = this.lastMeta;
    RP.saveToLibrary({type:"content", channel:m.channel, title:(m.product || "お店全体") + "｜" + m.goal, text:this.lastText});
  },
  toDoctor(){
    const first = (this.lastText.split(/^##\s.*$/m)[1] || this.lastText).replace(/^>\s*ねらい：.*$/gm, "").trim();
    RP.go("doctor"); $("#drText").value = first; $("#drChannel").value = this.lastMeta.channel;
  },
  toCalendar(){
    const m = this.lastMeta;
    const lib = RP.saveToLibrary({type:"content", channel:m.channel, title:(m.product || "お店全体") + "｜" + m.goal, text:this.lastText});
    RP.mod.calendar.edit(null, {title:(m.product || "お店全体") + "｜" + m.goal, channel:m.channel, status:"draft", contentId:lib.id, note:this.lastText.slice(0, 400)});
  }
};

/* ================= COPY DOCTOR ================= */
RP.mod.doctor = {
  init(){ $("#drChannel").innerHTML = RP.CHANNELS.map(c => `<option value="${c.value}">${esc(c.label)}</option>`).join(""); },
  async run(){
    const text = $("#drText").value.trim();
    if(!text){ RP.toast("診断するコピーを入力してください", "err"); return; }
    const btn = $("#drGo"), out = $("#drOut");
    const c = RP.CHANNELS.find(x => x.value === $("#drChannel").value);
    RP.busy(btn, true);
    try{
      const j = await RP.ai.json({feature:"doctor", maxTokens: 8000, prompt:
`次の販促コピーを、米穀店のマーケティング責任者として厳しく診断してください。

# 使う場所
${c.label}（仕様：${c.spec}）

# コピー
${text}

# 出力
次のJSONだけを出力（コードブロック不要）：
{"total":0-100の整数,"verdict":"30字以内の総評",
 "scores":[{"name":"わかりやすさ","score":0-100,"comment":"40字以内"},{"name":"惹きつけ力","score":0,"comment":""},{"name":"具体性","score":0,"comment":""},{"name":"信頼感","score":0,"comment":""},{"name":"行動喚起","score":0,"comment":""},{"name":"チャネル適合","score":0,"comment":""}],
 "risks":[{"level":"high|mid|low","phrase":"該当表現（原文から引用）","law":"景品表示法／食品表示基準／米トレーサビリティ法／健康増進法・薬機法／その他","reason":"なぜ問題になりうるか","fix":"言い換え案"}],
 "good":["良い点（最大3つ）"],
 "improve":["改善ポイント（最大4つ、具体的に）"],
 "rewrites":["改善版コピー1","改善版コピー2","改善版コピー3"]}
問題がなければrisksは空配列。改善版はチャネル仕様を守った完成形にする。`}, btn);
      this.render(j, c);
    }catch(e){ RP.errorBox(out, e); }
    finally{ RP.busy(btn, false); }
  },
  render(j, c){
    const lv = {high:"要修正", mid:"注意", low:"確認推奨"};
    const out = $("#drOut"); out.classList.remove("placeholder");
    out.innerHTML = `
      <div class="score-big"><div class="num">${esc(j.total)}</div><div><div class="muted small">総合スコア / 100</div><div style="font-weight:700">${esc(j.verdict)}</div></div></div>
      ${(j.scores || []).map(s => `<div class="bar-row"><div class="bh"><span>${esc(s.name)}　<span class="muted small">${esc(s.comment)}</span></span><b>${esc(s.score)}</b></div><div class="bar-track"><div class="bar-fill" style="width:${Math.max(0, Math.min(100, +s.score || 0))}%"></div></div></div>`).join("")}
      <div class="sect">表示・法令リスク</div>
      ${(j.risks || []).length ? j.risks.map(r => `<div class="risk ${esc(r.level)}"><b>【${esc(lv[r.level] || r.level)}】「${esc(r.phrase)}」 <span class="muted small">${esc(r.law)}</span></b>${esc(r.reason)}<br/>→ ${esc(r.fix)}</div>`).join("") : `<div class="risk low"><b>大きなリスクは見つかりませんでした</b>最終確認は人の目で行ってください。</div>`}
      <div class="grid2" style="margin:0">
        <div><div class="sect">良い点</div><div class="ai-out"><ul>${(j.good || []).map(x => `<li>${esc(x)}</li>`).join("")}</ul></div></div>
        <div><div class="sect">改善ポイント</div><div class="ai-out"><ul>${(j.improve || []).map(x => `<li>${esc(x)}</li>`).join("")}</ul></div></div>
      </div>
      <div class="sect">改善版</div>
      ${(j.rewrites || []).map((r, i) => `<div class="alt"><span>${esc(r)}</span><button data-i="${i}" data-a="copy">コピー</button><button data-i="${i}" data-a="save">保存</button></div>`).join("")}`;
    out.onclick = e => {
      const b = e.target.closest("button[data-a]"); if(!b) return;
      const t = j.rewrites[+b.dataset.i];
      if(b.dataset.a === "copy") RP.copy(t);
      else RP.saveToLibrary({type:"doctor", channel:c.value, title:"改善版コピー（スコア" + j.total + "の原文から）", text:t});
    };
  }
};

/* ================= REVIEWS ================= */
RP.mod.reviews = {
  last: "",
  init(){
    $("#rvTabs").onclick = e => {
      const b = e.target.closest("button[data-rv]"); if(!b) return;
      RP.$$("#rvTabs button").forEach(x => x.classList.toggle("on", x === b));
      $("#rvReply").hidden = b.dataset.rv !== "reply"; $("#rvBulk").hidden = b.dataset.rv !== "bulk";
    };
  },
  async reply(){
    const text = $("#rvText").value.trim();
    if(!text){ RP.toast("口コミ本文を入力してください", "err"); return; }
    const btn = $("#rvGo"), out = $("#rvOut"), stars = +$("#rvStars").value;
    RP.busy(btn, true); $("#rvActions").hidden = true;
    try{
      const r = await RP.ai.into(out, {feature:"review", maxTokens: 4000, effort:"low", prompt:
`Googleマップ等に投稿された口コミへの、店主（5代目）としての返信文を1つ作ってください。

# 口コミ
評価：★${stars}
投稿者：${$("#rvName").value.trim() || "（不明）"}
本文：${text}

# 店側の事情・補足
${$("#rvNote").value.trim() || "特になし"}

# ルール
- 200〜350字。返信文のみを出力（前置き・見出し不要）。
- 具体的な言及（商品名・体験）に触れ、テンプレ感を出さない。
- ★3以下：まず不快な思いへのお詫び、事実関係は言い訳がましくせず、改善策と再来店のお願い。個人を責めない。
- ★4以上：感謝と、次に試してほしい商品や食べ方を1つだけ自然に提案。
- 個人情報や他のお客様の話は書かない。署名は「${RP.brand().name || ""} 5代目」。`});
      this.last = r.text; $("#rvActions").hidden = false;
      RP.saveToLibrary({type:"review", title:"口コミ返信（★" + stars + "）", text:"【口コミ】" + text + "\n\n【返信】" + r.text});
    }catch(e){ RP.errorBox(out, e); }
    finally{ RP.busy(btn, false); }
  },
  async analyze(){
    const text = $("#rvBulkText").value.trim();
    if(!text){ RP.toast("口コミを入力してください", "err"); return; }
    const btn = $("#rvBulkGo"), out = $("#rvBulkOut");
    RP.busy(btn, true);
    try{
      const j = await RP.ai.json({feature:"reviews", maxTokens: 8000, prompt:
`以下は当店への口コミ（空行区切り）です。マーケティングに活かすために分析してください。

${text}

次のJSONだけを出力：
{"count":口コミ件数,"summary":"全体傾向を80字で",
 "sentiment":{"positive":件数,"neutral":件数,"negative":件数},
 "themes":[{"theme":"テーマ名（例：味・鮮度、接客、価格、駐車場）","mentions":件数,"tone":"positive|negative|mixed","quote":"代表的な一言（原文から引用）"}],
 "strengths":["お客様が評価している強み（広告で使える言葉で）"],
 "issues":["改善すべき点"],
 "actions":[{"action":"具体的な打ち手","impact":"高|中|低","effort":"高|中|低"}],
 "copyIdeas":["口コミの言葉を活かしたキャッチコピー案（3つ）"]}`}, btn);
      const toneTag = {positive:"green", negative:"red", mixed:"orange"};
      const s = j.sentiment || {};
      out.classList.remove("placeholder");
      out.innerHTML = `
        <div class="hero"><div class="k">SUMMARY — ${esc(j.count)}件</div><div class="s" style="font-size:13px;color:#f5f2eb">${esc(j.summary)}</div></div>
        <div class="tiles" style="grid-template-columns:repeat(3,1fr)">
          <div class="tile"><div class="t-label">好意的</div><div class="t-val">${esc(s.positive || 0)}</div></div>
          <div class="tile"><div class="t-label">中立</div><div class="t-val">${esc(s.neutral || 0)}</div></div>
          <div class="tile"><div class="t-label">不満</div><div class="t-val">${esc(s.negative || 0)}</div></div>
        </div>
        <div class="sect">よく言及されるテーマ</div><div id="rvThemeChart"></div>
        ${(j.themes || []).map(t => `<div class="alt"><span><span class="tag ${toneTag[t.tone] || ""}">${esc(t.theme)}</span> 「${esc(t.quote)}」</span></div>`).join("")}
        <div class="grid2" style="margin:0">
          <div><div class="sect">強み（広告で使える言葉）</div><div class="ai-out"><ul>${(j.strengths || []).map(x => `<li>${esc(x)}</li>`).join("")}</ul></div></div>
          <div><div class="sect">改善点</div><div class="ai-out"><ul>${(j.issues || []).map(x => `<li>${esc(x)}</li>`).join("")}</ul></div></div>
        </div>
        <div class="sect">打ち手</div>
        <table class="tbl"><tr><th>打ち手</th><th>効果</th><th>手間</th></tr>${(j.actions || []).map(a => `<tr><td style="white-space:normal">${esc(a.action)}</td><td>${esc(a.impact)}</td><td>${esc(a.effort)}</td></tr>`).join("")}</table>
        <div class="sect">口コミ発のコピー案</div>
        ${(j.copyIdeas || []).map(x => `<div class="alt"><span>${esc(x)}</span></div>`).join("")}`;
      RP.chart.hbars($("#rvThemeChart"), (j.themes || []).map(t => ({label:t.theme, value:+t.mentions || 0})), {fmt: v => v + "件"});
    }catch(e){ RP.errorBox(out, e); }
    finally{ RP.busy(btn, false); }
  }
};
})();
