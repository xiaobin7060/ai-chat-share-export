# ai-chat-share-export

Convert a public AI chat share link to Markdown or JSON.

[![npm version](https://img.shields.io/npm/v/ai-chat-share-export.svg)](https://www.npmjs.com/package/ai-chat-share-export)
[![CI](https://github.com/xiaobin7060/ai-chat-share-export/actions/workflows/ci.yml/badge.svg)](https://github.com/xiaobin7060/ai-chat-share-export/actions/workflows/ci.yml)
[![license](https://img.shields.io/npm/l/ai-chat-share-export.svg)](./LICENSE)

Node.js 18 or newer. No runtime dependencies.

## Install

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

`-f` is `md` (default) or `json`. `-o` writes a file instead of stdout. `--html` parses a saved page and does not fetch anything; without a URL it assumes ChatGPT. `-h` prints help. On failure the process prints an error code (`INVALID_URL`, `NOT_FOUND`, `PARSE_FAILED`, `FETCH_FAILED`, `UNSUPPORTED_PROVIDER`) and exits non-zero.

`https://chat.openai.com/share/<id>` is accepted and requested as `https://chatgpt.com/share/<id>`.

## Library

```ts
import { exportShare, parseShareHtml, toMarkdown, toJSON, detectProvider } from 'ai-chat-share-export';
import { readFileSync } from 'node:fs';

const conversation = await exportShare('https://chatgpt.com/share/<id>');
console.log(toMarkdown(conversation));
console.log(toJSON(conversation));

const html = readFileSync('share.html', 'utf8');
const offline = parseShareHtml(html, 'https://chatgpt.com/share/<id>');
console.log(toMarkdown(offline, { userLabel: 'You:' }));

detectProvider('https://chatgpt.com/share/<id>'); // 'chatgpt'
```

CommonJS `require('ai-chat-share-export')` exposes the same functions.

`exportShare(url, opts?)` takes `timeoutMs` (default `15000`) and `maxBytes` (default 5 MiB). A conversation looks like:

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

Assistant Markdown is kept (tables, LaTeX, fenced code). `toMarkdown` quotes user turns and, when the conversation has a title, shifts headings in answers down so the title stays the only H1. `userLabel` defaults to `You:`. Set `assistantLabel` to prefix answers; otherwise they are unlabeled.

## Output example

From a saved ChatGPT share of a short Q3 sales report:

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

## Supported providers

| Provider | Share URL | Status |
| --- | --- | --- |
| ChatGPT | `https://chatgpt.com/share/<id>`, `https://chat.openai.com/share/<id>` | Supported |
| Claude | — | Planned |
| Gemini | — | Planned |

Each provider is a separate module (`match`, `normalizeUrl`, `parseHtml`) so another site can be added without changing the CLI.

## How it works

A ChatGPT share page is server-rendered by React Router. The loader payload is not a JSON script tag. It is a [turbo-stream](https://github.com/jacob-ebey/turbo-stream): one or more `<script>` blocks call `streamController.enqueue("...")`, and those strings concatenate into a flat value table. This package decodes that table, reads `loaderData["routes/share.$shareId.($action)"].serverResponse`, and walks `linear_conversation` (or the `mapping` tree from `current_node`) to rebuild the visible user and assistant turns. Hidden system text, reasoning channels, and tool calls are skipped. Older pages that still embed the same object in `__NEXT_DATA__` are accepted as a fallback.

Fetching uses the global `fetch`, a browser User-Agent, a 15 second timeout, and a 5 MiB body limit. Only the canonical `https://chatgpt.com/share/<id>` URL is requested. Redirects that leave that origin are refused.

## Limitations

- Only public share links are supported. Private chats and logged-in pages are out of scope.
- A ChatGPT markup change can break parsing until the fixtures are updated.
- Images on a share become the placeholder `*[Image]*`. The media pointers are not publicly fetchable.
- Use the tool within each provider's terms of service.

## Need Word / PDF / Excel?

[TODOC](https://todoc.ai/chatgpt-link-to-pdf) takes a public ChatGPT share link and exports it to Word, PDF, or Excel, including formulas you can still edit. A browser extension is on the [Chrome Web Store](https://chromewebstore.google.com/detail/hcibplpgjmjhokdilcjjegmddhngnpjc).
