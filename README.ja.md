# ai-chat-share-export

公開されている AI チャットの共有リンクを Markdown または JSON に変換します。

[![npm version](https://img.shields.io/npm/v/ai-chat-share-export.svg)](https://www.npmjs.com/package/ai-chat-share-export)
[![CI](https://github.com/xiaobin7060/ai-chat-share-export/actions/workflows/ci.yml/badge.svg)](https://github.com/xiaobin7060/ai-chat-share-export/actions/workflows/ci.yml)
[![license](https://img.shields.io/npm/l/ai-chat-share-export.svg)](./LICENSE)

Node.js 18 以上。実行時の依存パッケージはありません。

## インストール

```bash
npm install ai-chat-share-export
```

## CLI

```bash
npx ai-chat-share-export https://chatgpt.com/share/<id>
npx ai-chat-share-export https://chatgpt.com/share/<id> -f json -o chat.json
npx ai-chat-share-export --html share.html
npx ai-chat-share-export --html share.html -f json -o chat.json
```

`-f` は `md`（既定）または `json` です。`-o` は標準出力の代わりにファイルへ書きます。`--html` は保存済みの HTML を解釈し、ネットワークにはアクセスしません。URL を省略したときは ChatGPT として扱います。`-h` でヘルプを表示します。失敗時はエラーコード（`INVALID_URL`、`NOT_FOUND`、`PARSE_FAILED`、`FETCH_FAILED`、`UNSUPPORTED_PROVIDER`）を表示して、0 以外で終了します。

`https://chat.openai.com/share/<id>` も受け付け、リクエスト先は `https://chatgpt.com/share/<id>` に揃えます。

## ライブラリ

```ts
import { exportShare, parseShareHtml, toMarkdown, toJSON, detectProvider } from 'ai-chat-share-export';
import { readFileSync } from 'node:fs';

const conversation = await exportShare('https://chatgpt.com/share/<id>');
console.log(toMarkdown(conversation));
console.log(toJSON(conversation));

const html = readFileSync('share.html', 'utf8');
const offline = parseShareHtml(html, 'https://chatgpt.com/share/<id>');
console.log(toMarkdown(offline, { userLabel: 'あなた:' }));

detectProvider('https://chatgpt.com/share/<id>'); // 'chatgpt'
```

CommonJS の `require('ai-chat-share-export')` でも同じ関数を使えます。

`exportShare(url, opts?)` の `timeoutMs` は既定 15000、`maxBytes` は既定 5 MiB です。返り値は次の形です。

```ts
{
  provider: 'chatgpt',
  title: 'Q3销售报告撰写',
  url: 'https://chatgpt.com/share/<id>',
  messages: [
    { role: 'user', content: '...' },
    { role: 'assistant', content: '...' }
  ]
}
```

アシスタントの Markdown（表、LaTeX、コードフェンス）はそのまま残します。`toMarkdown` はユーザー発言を引用にし、会話にタイトルがあるときは回答内の見出しを一段下げて、タイトルだけを H1 にします。`userLabel` の既定は `You:` です。`assistantLabel` を渡したときだけ回答にラベルを付けます。

## 出力例

保存した ChatGPT の共有ページ（短い Q3 売上レポート）の先頭です。

```markdown
# Q3销售报告撰写

> **You:** Write a short Q3 sales report for a fictional coffee chain called Northbean. Include: a one-paragraph summary, a markdown table of revenue by region (4 regions, with Q2, Q3 and growth %), the quarter-over-quarter growth formula in LaTeX, and a short Python snippet that computes growth. Keep it under 250 words.

## Northbean — Q3 2026 Sales Report

### Executive Summary

Northbean delivered strong sales performance in Q3 2026, generating **$5.4 million in revenue**, up **20%** from Q2's $4.5 million. Growth was driven by increased customer traffic, seasonal beverage promotions, and expanded digital ordering. The West region led in revenue, while the South achieved the highest percentage growth. All four regions recorded positive quarter-over-quarter performance, positioning Northbean for continued expansion in Q4.

### Revenue by Region

*All figures are fictional.*

| Region | Q2 Revenue | Q3 Revenue | Growth |
|---|---:|---:|---:|
| North | $1,200,000 | $1,380,000 | +15.0% |
```

## 対応プロバイダ

| プロバイダ | 共有 URL | 状態 |
| --- | --- | --- |
| ChatGPT | `https://chatgpt.com/share/<id>`、`https://chat.openai.com/share/<id>` | 対応済み |
| Claude | — | 予定 |
| Gemini | — | 予定 |

プロバイダは `match`、`normalizeUrl`、`parseHtml` を持つモジュールです。CLI を変えずにサイトを追加できます。

## 仕組み

ChatGPT の共有ページは React Router がサーバーで描画します。ローダーのデータは JSON の script タグではなく、[turbo-stream](https://github.com/jacob-ebey/turbo-stream) です。複数の `<script>` が `streamController.enqueue("...")` を呼び、その文字列を順に繋ぐとフラットな値テーブルになります。このパッケージはそのテーブルを復号し、`loaderData["routes/share.$shareId.($action)"].serverResponse` を読み、`linear_conversation`（無い場合は `current_node` から `mapping` を遡る）で、画面に出るユーザーとアシスタントの発言を復元します。隠されたシステム文、推論チャンネル、ツール呼び出しは捨てます。同じオブジェクトが `__NEXT_DATA__` に入っている古いページもフォールバックとして読みます。

取得にはグローバルな `fetch`、ブラウザの User-Agent、15 秒のタイムアウト、5 MiB の本文上限を使います。リクエスト先は正規化した `https://chatgpt.com/share/<id>` だけです。別オリジンへのリダイレクトは追いません。

## 制限

- 公開共有リンクだけに対応します。非公開のチャットやログイン後のページは対象外です。
- ChatGPT のマークアップが変わると、フィクスチャを更新するまで解析に失敗することがあります。
- 共有ページの画像は `*[Image]*` というプレースホルダになります。画像の参照先は公開 URL ではありません。
- 各プロバイダの利用規約の範囲で使ってください。

## Word / PDF / Excel が必要な場合

[TODOC](https://todoc.ai/ja/chatgpt-link-to-pdf) は、公開されている ChatGPT の共有リンクを、編集できる数式を含んだ Word、PDF、Excel に書き出します。ブラウザ拡張機能は [Chrome ウェブストア](https://chromewebstore.google.com/detail/hcibplpgjmjhokdilcjjegmddhngnpjc) にあります。
