# thinking-viz

GitHub Copilot のキャンバス拡張です。消費トークンを円換算し、このチャットの合計・買えるもの・予算の残りを表示します。

## インストール

ユーザー領域に置く場合:

```bash
mkdir -p ~/.copilot/extensions/thinking-viz
cp extension.mjs renderer.mjs catalog.mjs ~/.copilot/extensions/thinking-viz/
```

Copilot を再読み込みすると、キャンバス `thinking-viz`（表示名: トークン料金）が使えます。

## 注意

- 円は概算です。Copilot の請求書そのものではありません。
- 予算は `~/.copilot/extensions/thinking-viz/artifacts/budget.json` に保存されます（このリポジトリには含めません）。
