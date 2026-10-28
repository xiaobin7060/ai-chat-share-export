import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { main } from '../src/cli.js';

const root = path.dirname(fileURLToPath(import.meta.url));
const html = path.join(root, 'fixtures/chatgpt/northbean-q3.html');
const deleted = path.join(root, 'fixtures/chatgpt/deleted.html');
const expected = readFileSync(path.join(root, 'fixtures/chatgpt/northbean-q3.md'), 'utf8');

function capture() {
  let out = '';
  let err = '';
  return {
    io: {
      stdout: (text: string) => {
        out += text;
      },
      stderr: (text: string) => {
        err += text;
      },
    },
    text: () => ({ out, err }),
  };
}

describe('cli', () => {
  it('prints help', async () => {
    const cap = capture();
    const code = await main(['-h'], cap.io);
    expect(code).toBe(0);
    expect(cap.text().out).toContain('Usage:');
    expect(cap.text().out).toContain('--html');
  });

  it('renders the northbean fixture as Markdown', async () => {
    const cap = capture();
    const code = await main(['--html', html], cap.io);
    expect(code).toBe(0);
    expect(cap.text().out).toBe(expected);
    expect(cap.text().err).toBe('');
  });

  it('writes JSON to a file', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'share-export-'));
    const output = path.join(dir, 'chat.json');
    try {
      const cap = capture();
      const code = await main(['--html', html, '-f', 'json', '-o', output], cap.io);
      expect(code).toBe(0);
      expect(cap.text().out).toBe('');
      const parsed = JSON.parse(readFileSync(output, 'utf8')) as {
        provider: string;
        title: string;
        messages: unknown[];
      };
      expect(parsed.provider).toBe('chatgpt');
      expect(parsed.title).toBe('Q3销售报告撰写');
      expect(parsed.messages).toHaveLength(4);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('prints the error code for a deleted share and exits non-zero', async () => {
    const cap = capture();
    const code = await main(['--html', deleted], cap.io);
    expect(code).toBe(1);
    expect(cap.text().out).toBe('');
    expect(cap.text().err.startsWith('NOT_FOUND:')).toBe(true);
    expect(cap.text().err).toMatch(/deleted|不存在|已删除/i);
  });

  it('rejects a missing URL', async () => {
    const cap = capture();
    const code = await main([], cap.io);
    expect(code).toBe(1);
    expect(cap.text().err.startsWith('INVALID_URL:')).toBe(true);
  });
});
