import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ShareExportError } from '../src/errors.js';
import { DEFAULT_MAX_BYTES, DEFAULT_TIMEOUT_MS, fetchShareHtml } from '../src/fetch.js';
import { detectProvider, exportShare, parseShareHtml, toMarkdown } from '../src/index.js';
import { cleanAssistantMarkdown, extractMessages, inspectChatGptUrl } from '../src/providers/chatgpt/parser.js';

const root = path.dirname(fileURLToPath(import.meta.url));
const id = '6ae00cb5-a448-83e9-a9cf-0d69b0be5f32';
const northbeanHtml = readFileSync(path.join(root, 'fixtures/chatgpt/northbean-q3.html'), 'utf8');
const deletedHtml = readFileSync(path.join(root, 'fixtures/chatgpt/deleted.html'), 'utf8');
const expectedMarkdown = readFileSync(path.join(root, 'fixtures/chatgpt/northbean-q3.md'), 'utf8');
const shareUrl = `https://chatgpt.com/share/${id}`;

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('URL validation', () => {
  it('accepts ChatGPT share links and canonicalizes them', () => {
    expect(inspectChatGptUrl(shareUrl)?.shareId).toBe(id);
    expect(inspectChatGptUrl(`https://chat.openai.com/share/${id}`)?.shareId).toBe(id);
    expect(inspectChatGptUrl(`chatgpt.com/share/${id}`)?.shareId).toBe(id);
    expect(inspectChatGptUrl(`  https://chatgpt.com/share/${id}/?utm=x#top `)?.shareId).toBe(id);
    expect(inspectChatGptUrl(`https://CHATGPT.com/share/${id.toUpperCase()}`)?.shareId).toBe(id);
    expect(inspectChatGptUrl(`https://www.chatgpt.com/share/${id}`)?.shareId).toBe(id);
    expect(detectProvider(`https://chat.openai.com/share/${id}/`)).toBe('chatgpt');
  });

  it('rejects URLs that are not a public ChatGPT share', () => {
    const bad = [
      `https://evil.com/share/${id}`,
      `https://chatgpt.com.evil.com/share/${id}`,
      `https://evil.com/?u=https://chatgpt.com/share/${id}`,
      `https://chatgpt.com@evil.com/share/${id}`,
      `https://user:pass@chatgpt.com/share/${id}`,
      `https://chatgpt.com:8443/share/${id}`,
      `https://chatgpt.com/c/${id}`,
      `https://chatgpt.com/share/${id}/continue`,
      `https://chatgpt.com/share/../admin`,
      `https://chatgpt.com/share/${id}%2F..%2Fx`,
      'https://chatgpt.com/share/<script>',
      'https://chatgpt.com/share/--------',
      `ftp://chatgpt.com/share/${id}`,
      'file:///etc/passwd',
      `http://127.0.0.1/share/${id}`,
      '',
    ];
    for (const url of bad) {
      expect(detectProvider(url), url).toBeNull();
      expect(() => parseShareHtml('<html></html>', url), url).toThrow(ShareExportError);
      try {
        parseShareHtml('<html></html>', url);
      } catch (err) {
        expect((err as ShareExportError).code, url).toBe('INVALID_URL');
      }
    }
  });

  it('reports planned providers separately from invalid URLs', () => {
    expect(detectProvider('https://claude.ai/chat/abc')).toBeNull();
    expect(detectProvider('https://gemini.google.com/app/abc')).toBeNull();
    for (const url of ['https://claude.ai/chat/abc', 'https://www.claude.ai/share/abc', 'gemini.google.com/app/abc']) {
      try {
        parseShareHtml('<html></html>', url);
        expect.unreachable(url);
      } catch (err) {
        expect(err, url).toBeInstanceOf(ShareExportError);
        expect((err as ShareExportError).code, url).toBe('UNSUPPORTED_PROVIDER');
      }
    }
  });
});

describe('northbean fixture', () => {
  const conversation = parseShareHtml(northbeanHtml, `https://chat.openai.com/share/${id}`);
  const markdown = toMarkdown(conversation);

  it('matches the PHP markdown byte for byte', () => {
    expect(markdown).toBe(expectedMarkdown);
  });

  it('keeps the title, four turns, and original assistant headings', () => {
    expect(conversation.provider).toBe('chatgpt');
    expect(conversation.title).toBe('Q3销售报告撰写');
    expect(conversation.url).toBe(shareUrl);
    expect(conversation.messages.map((message) => message.role)).toEqual([
      'user',
      'assistant',
      'user',
      'assistant',
    ]);
    expect(conversation.messages[1]?.content.startsWith('# Northbean — Q3 2026 Sales Report')).toBe(true);
  });

  it('preserves the table, formula, and fenced code in the document', () => {
    expect(markdown.startsWith('# Q3销售报告撰写\n')).toBe(true);
    expect(markdown).toContain(
      '> **You:** Write a short Q3 sales report for a fictional coffee chain called Northbean.',
    );
    expect(markdown).toContain('\n## Northbean — Q3 2026 Sales Report\n');
    expect(markdown).toContain('\n### Executive Summary\n');
    expect(markdown).toContain('| Region | Q2 Revenue | Q3 Revenue | Growth |');
    expect(markdown).toContain('|---|---:|---:|---:|');
    expect(markdown).toContain('| **Total** | **$4,500,000** | **$5,400,000** | **+20.0%** |');
    expect(markdown).toContain(
      '\\[\n\\text{Growth (\\%)}=\\frac{\\text{Q3 Revenue}-\\text{Q2 Revenue}}{\\text{Q2 Revenue}}\\times100\n\\]',
    );
    expect(markdown).toContain('```python\nq2 = 4_500_000\n');
    expect(markdown).toContain('# Output: QoQ Growth: 20.0%\n```');
    expect(markdown).not.toContain('<CodeBlock');
    expect(markdown).not.toContain('</CodeBlock>');
    expect(markdown).toContain('---\n\n> **You:** Add a second section');
    expect(markdown).toContain('| Iced Latte | 185,000 | $5.50 |');
    expect(markdown).not.toContain('Original custom instructions no longer available');
  });

  it('uses the caller-supplied user label', () => {
    const japanese = toMarkdown(conversation, { userLabel: 'あなた:' });
    expect(japanese).toContain('> **あなた:** Write a short');
    expect(japanese).toBe(markdown.replaceAll('**You:**', '**あなた:**'));
  });
});

describe('error pages', () => {
  it('treats a deleted share as not found', () => {
    try {
      parseShareHtml(deletedHtml, shareUrl);
      expect.unreachable();
    } catch (err) {
      expect(err).toBeInstanceOf(ShareExportError);
      const error = err as ShareExportError;
      expect(error.code).toBe('NOT_FOUND');
      expect(error.message).toMatch(/deleted|不存在|已删除/i);
    }
  });

  it('fails when the page has no conversation payload', () => {
    try {
      parseShareHtml('<html><body>Just a moment...</body></html>', shareUrl);
      expect.unreachable();
    } catch (err) {
      expect(err).toBeInstanceOf(ShareExportError);
      expect((err as ShareExportError).code).toBe('PARSE_FAILED');
    }
  });

  it('reads a legacy __NEXT_DATA__ payload', () => {
    const html = `<script id="__NEXT_DATA__">{"props":{"pageProps":{"serverResponse":{"type":"data","data":{"title":"Old","linear_conversation":[{"message":{"author":{"role":"user"},"content":{"content_type":"text","parts":["Hi"]}}},{"message":{"author":{"role":"assistant"},"content":{"content_type":"text","parts":["Hello"]}}}]}}}}}</script>`;
    const conversation = parseShareHtml(html, shareUrl);
    expect(conversation.title).toBe('Old');
    expect(conversation.messages).toEqual([
      { role: 'user', content: 'Hi' },
      { role: 'assistant', content: 'Hello' },
    ]);
  });
});

describe('message filtering', () => {
  it('walks the current mapping branch and drops tool and citation noise', () => {
    const messages = extractMessages({
      title: 'T',
      current_node: 'c',
      mapping: {
        root: { id: 'root', parent: null, children: ['a'], message: null },
        a: {
          id: 'a',
          parent: 'root',
          children: ['b'],
          message: {
            author: { role: 'user' },
            content: {
              content_type: 'multimodal_text',
              parts: [
                { content_type: 'image_asset_pointer', asset_pointer: 'sediment://x' },
                'What is this?',
              ],
            },
          },
        },
        b: {
          id: 'b',
          parent: 'a',
          children: ['b2'],
          message: {
            author: { role: 'assistant' },
            channel: 'analysis',
            content: { content_type: 'text', parts: ['internal reasoning'] },
          },
        },
        b2: {
          id: 'b2',
          parent: 'b',
          children: ['b3'],
          message: {
            author: { role: 'assistant' },
            recipient: 'python',
            content: { content_type: 'code', text: 'print(1)' },
          },
        },
        b3: {
          id: 'b3',
          parent: 'b2',
          children: ['c'],
          message: {
            author: { role: 'tool' },
            content: { content_type: 'execution_output', text: '1' },
          },
        },
        c: {
          id: 'c',
          parent: 'b3',
          children: [],
          message: {
            author: { role: 'assistant' },
            channel: 'final',
            content: {
              content_type: 'text',
              parts: ['It is a cat \uE200cite\uE202turn0search0\uE201.【3†source】'],
            },
          },
        },
        orphan: {
          id: 'orphan',
          parent: 'root',
          children: [],
          message: {
            author: { role: 'assistant' },
            content: { content_type: 'text', parts: ['other branch'] },
          },
        },
      },
    });
    expect(messages).toHaveLength(2);
    expect(messages[0]?.content).toBe('*[Image]*\n\nWhat is this?');
    expect(messages[1]?.content).toBe('It is a cat .');
  });

  it('lengthens the fence when the code already contains backticks', () => {
    expect(cleanAssistantMarkdown('<CodeBlock language="md">\n```js\nx\n```\n</CodeBlock>')).toBe(
      '````md\n```js\nx\n```\n````',
    );
  });

  it('merges adjacent messages from the same role', () => {
    const messages = extractMessages({
      title: 'T',
      linear_conversation: [
        { message: { author: { role: 'assistant' }, content: { content_type: 'text', parts: ['A'] } } },
        { message: { author: { role: 'assistant' }, content: { content_type: 'text', parts: ['B'] } } },
      ],
    });
    expect(messages).toEqual([{ role: 'assistant', content: 'A\n\nB' }]);
  });
});

describe('fetch', () => {
  it('uses a 15s timeout and a 5 MiB body cap by default', () => {
    expect(DEFAULT_TIMEOUT_MS).toBe(15_000);
    expect(DEFAULT_MAX_BYTES).toBe(5 * 1024 * 1024);
  });

  it('refuses to request anything except a canonical share URL', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    await expect(fetchShareHtml('../../etc')).rejects.toMatchObject({ code: 'INVALID_URL' });
    await expect(fetchShareHtml('https://evil.com/share/aaaaaaaa')).rejects.toMatchObject({ code: 'INVALID_URL' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('does not follow a cross-origin redirect', async () => {
    const fetchMock = vi.fn(async () => new Response('nope', {
      status: 302,
      headers: { location: 'https://evil.example/share' },
    }));
    vi.stubGlobal('fetch', fetchMock);
    await expect(fetchShareHtml(shareUrl)).rejects.toMatchObject({ code: 'FETCH_FAILED' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(init.redirect).toBe('manual');
    expect(new Headers(init.headers).get('user-agent')).toContain('Chrome/130');
  });

  it('follows a same-origin redirect and stops at 200', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      if (String(input) === shareUrl) {
        return new Response('', { status: 302, headers: { location: '/share/next' } });
      }
      return new Response('<html>ok</html>', { status: 200 });
    });
    vi.stubGlobal('fetch', fetchMock);
    await expect(fetchShareHtml(shareUrl)).resolves.toBe('<html>ok</html>');
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(String(fetchMock.mock.calls[1]?.[0])).toBe('https://chatgpt.com/share/next');
  });

  it('maps 404 and oversized bodies', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('missing', { status: 404 })));
    await expect(fetchShareHtml(shareUrl)).rejects.toMatchObject({ code: 'NOT_FOUND' });

    vi.stubGlobal('fetch', vi.fn(async () => new Response('x'.repeat(50), {
      status: 200,
      headers: { 'content-length': '50' },
    })));
    await expect(fetchShareHtml(shareUrl, { maxBytes: 10 })).rejects.toMatchObject({ code: 'PARSE_FAILED' });
  });

  it('exports only after fetching the canonical URL', async () => {
    const fetchMock = vi.fn(async () => new Response(deletedHtml, { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    await expect(exportShare(`https://chat.openai.com/share/${id}`)).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe(shareUrl);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
