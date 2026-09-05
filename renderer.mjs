export function renderHtml() {
    return `<!doctype html>
<html lang="ja">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>トークン料金</title>
  <style>
    * { box-sizing: border-box; }
    html, body { margin: 0; height: 100%; }
    body {
      background: var(--background-color-default, #ffffff);
      color: var(--text-color-default, #1f2328);
      font-family: var(--font-sans, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif);
      font-size: 15px;
      line-height: 22px;
    }
    .app {
      height: 100%;
      display: flex;
      flex-direction: column;
      padding: 20px;
      gap: 16px;
    }
    h1 {
      margin: 0;
      font-size: 20px;
      font-weight: var(--font-weight-semibold, 600);
    }
    .label {
      font-size: 12px;
      color: var(--text-color-muted, #656d76);
    }
    .yen {
      font-size: 36px;
      font-weight: 700;
      letter-spacing: -0.04em;
      font-variant-numeric: tabular-nums;
      line-height: 1.1;
    }
    .yen.live { color: var(--true-color-blue, #0969da); }
    .yen small {
      font-size: 13px;
      font-weight: 500;
      color: var(--text-color-muted, #656d76);
      margin-left: 8px;
    }
    .tokens {
      font-size: 12px;
      color: var(--text-color-muted, #656d76);
      margin-top: 4px;
    }
    .card {
      border: 1px dashed var(--border-color-default, #d0d7de);
      border-radius: 16px;
      padding: 14px;
    }
    .total { margin-top: auto; }
    .buy {
      margin-top: 10px;
      font-size: 16px;
      font-weight: var(--font-weight-semibold, 600);
    }
    .extras { margin-top: 6px; font-size: 12px; color: var(--text-color-muted, #656d76); }
    .extras div { margin-top: 2px; }
    .note { margin-top: 8px; font-size: 11px; color: var(--text-color-muted, #656d76); }
    .pulse { animation: pulse 0.35s ease; }
    @keyframes pulse {
      from { transform: scale(1.04); }
      to { transform: none; }
    }
    .row {
      display: flex;
      gap: 8px;
      margin-top: 8px;
    }
    input, button {
      font: inherit;
      color: var(--text-color-default, #1f2328);
      background: var(--background-color-default, #fff);
      border: 1px solid var(--border-color-default, #d0d7de);
      border-radius: 10px;
      padding: 8px 10px;
    }
    input { flex: 1; min-width: 0; }
    button {
      font-weight: var(--font-weight-semibold, 600);
      cursor: pointer;
    }
    button:focus, input:focus {
      outline: 2px solid var(--color-focus-outline, #0969da);
      outline-offset: 1px;
    }
    .bar {
      margin-top: 10px;
      height: 8px;
      border-radius: 99px;
      background: var(--border-color-default, #d0d7de);
      overflow: hidden;
    }
    .bar > span {
      display: block;
      height: 100%;
      width: 0;
      background: var(--true-color-blue, #0969da);
    }
    .bar.over > span { background: var(--true-color-red, #cf222e); width: 100%; }
    .remain { margin-top: 8px; font-size: 16px; font-weight: var(--font-weight-semibold, 600); }
    .remain.over { color: var(--true-color-red, #cf222e); }
    .warn {
      margin-top: 10px;
      padding: 8px 10px;
      border-radius: 10px;
      border: 1px solid var(--true-color-red, #cf222e);
      color: var(--true-color-red, #cf222e);
      font-size: 13px;
    }
    .warn div { margin-top: 2px; }
    .warn div:first-child { margin-top: 0; }
  </style>
</head>
<body>
  <div class="app">
    <h1>トークン料金</h1>
    <div class="card">
      <div class="label">予算</div>
      <div class="row">
        <input id="budgetInput" type="number" min="0" step="1000" placeholder="例: 30000" />
        <button type="button" id="budgetSave">保存</button>
      </div>
      <div class="remain" id="remain">まだ予算がありません</div>
      <div class="bar" id="bar"><span id="barFill"></span></div>
      <div class="tokens" id="budgetMeta"></div>
      <div class="warn" id="warn" hidden></div>
    </div>
    <div class="card">
      <div class="label">いま（この質問）</div>
      <div class="yen live" id="liveYen">¥0</div>
      <div class="tokens" id="liveTokens"></div>
      <div class="buy" id="liveBuy"></div>
      <div class="extras" id="liveExtras"></div>
    </div>
    <div class="card total">
      <div class="label">このチャットの合計</div>
      <div class="yen" id="totalYen">¥0</div>
      <div class="row">
        <input id="testTotal" type="number" min="0" step="1000" placeholder="テスト用に合計（円）を入力" />
      </div>
      <div class="tokens" id="totalTokens"></div>
      <div class="buy" id="buy"></div>
      <div class="extras" id="extras"></div>
      <div class="note">概算です。トークン単価と為替から円換算しています。合計はこのチャット作業場に保存します。</div>
    </div>
  </div>
  <script>
    function esc(s) {
      return String(s ?? "").replace(/[&<>"']/g, (c) => ({
        "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
      }[c]));
    }
    function tokens(u) {
      if (!u) return "";
      let s = "入力 " + esc(u.inputTokens) + " / 出力 " + esc(u.outputTokens);
      if (u.cacheReadTokens) s += " / キャッシュ " + esc(u.cacheReadTokens);
      if (u.model) s += " · " + esc(u.model);
      return s;
    }
    const OVER_WARNINGS = [
      [0, "大丈夫、きっとまだ擦り傷だ"],
      [2000, "自販機の飲み物を1本あきらめる頃だ"],
      [3000, "缶チューハイを我慢した方がいい"],
      [4000, "缶ビール代が消えたと思え"],
      [5000, "大丈夫か、今月の電気代はちゃんと払えるのか？"],
      [6000, "ガソリンが数リットル消えた"],
      [7000, "タバコ1カートン分が飛んだ"],
      [8000, "ランチを外で食べる余裕はない"],
      [9000, "コンビニ飯も危険水域だ"],
      [10000, "外食は絶対禁止だ"],
      [20000, "通信費の支払いが怪しい"],
      [30000, "スマホが止まりかける"],
      [40000, "定期代が危ない"],
      [50000, "カードの引き落としが死ぬ"],
      [60000, "光熱費がまとめて飛ぶ"],
      [70000, "引っ越し費用が消えた"],
      [80000, "もうやめるんだ、家賃が払えなくなるぞ！"],
      [90000, "保証人に連絡がいっている"],
      [100000, "家を失う前にチャットをやめろ"],
    ];
    function overWarning(overYen) {
      if (!(overYen > 0)) return "";
      let msg = OVER_WARNINGS[0][1];
      for (const [th, text] of OVER_WARNINGS) {
        if (overYen >= th) msg = text;
      }
      return msg;
    }
    function extras(purchase) {
      return (purchase?.extras || []).map((e) => {
        const n = e.count >= 10 ? Math.round(e.count) : e.count.toFixed(2);
        return "<div>" + e.emoji + " " + esc(e.name) + " なら " + n + esc(e.unit) + "</div>";
      }).join("");
    }
    let lastLive = "";
    let lastTotal = "";
    function bump(el, key, prev) {
      if (key && key !== prev) {
        el.classList.remove("pulse");
        void el.offsetWidth;
        el.classList.add("pulse");
        return key;
      }
      return prev;
    }
    function render(state) {
      const live = state.live || {};
      const total = state.total || {};
      const budget = state.budget || {};
      const input = document.getElementById("budgetInput");
      if (budget.set && document.activeElement !== input) input.value = String(Math.round(budget.yen));
      const remain = document.getElementById("remain");
      const bar = document.getElementById("bar");
      const fill = document.getElementById("barFill");
      if (!budget.set) {
        remain.className = "remain";
        remain.textContent = "まだ予算がありません";
        bar.className = "bar";
        fill.style.width = "0%";
        document.getElementById("budgetMeta").textContent = "";
        document.getElementById("warn").hidden = true;
      } else {
        remain.className = "remain" + (budget.over ? " over" : "");
        remain.textContent = budget.over
          ? "予算オーバー ¥" + (budget.overLabel || "0")
          : "残り ¥" + (budget.remainingLabel || "0");
        bar.className = "bar" + (budget.over ? " over" : "");
        fill.style.width = Math.round((budget.usedRatio || 0) * 100) + "%";
        document.getElementById("budgetMeta").textContent =
          "予算 ¥" + (budget.yenLabel || "0") + " から、このチャットで ¥" + (total.jpyLabel || "0") + " 減りました";
        const warn = document.getElementById("warn");
        if (budget.over) {
          warn.hidden = false;
          warn.textContent = overWarning(Number(budget.overYen || 0));
        } else {
          warn.hidden = true;
        }
      }
      const liveEl = document.getElementById("liveYen");
      liveEl.innerHTML = "¥" + esc(live.jpyLabel || "0") + "<small>" + esc(live.usdLabel || "") + "</small>";
      lastLive = bump(liveEl, String(live.jpyLabel || ""), lastLive);
      document.getElementById("liveTokens").textContent = tokens(live);
      document.getElementById("liveBuy").textContent = live.purchase?.headline || "";
      document.getElementById("liveExtras").innerHTML = extras(live.purchase);
      const totalEl = document.getElementById("totalYen");
      totalEl.innerHTML = "¥" + esc(total.jpyLabel || "0") + "<small>" + esc(total.usdLabel || "") + "</small>";
      lastTotal = bump(totalEl, String(total.jpyLabel || ""), lastTotal);
      document.getElementById("totalTokens").textContent = tokens(total);
      document.getElementById("buy").textContent = total.purchase?.headline || "";
      document.getElementById("extras").innerHTML = extras(total.purchase);
    }
    document.getElementById("testTotal").addEventListener("input", async (ev) => {
      const v = ev.target.value;
      await fetch("/test-total", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ yen: v === "" ? null : Number(v) }),
      });
    });
    document.getElementById("budgetSave").onclick = async () => {
      const yen = Number(document.getElementById("budgetInput").value);
      await fetch("/budget", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ yen }),
      });
    };
    const src = new EventSource("/events");
    src.onmessage = (ev) => { try { render(JSON.parse(ev.data)); } catch {} };
    fetch("/state").then((r) => r.json()).then(render).catch(() => {});
  </script>
</body>
</html>`;
}
