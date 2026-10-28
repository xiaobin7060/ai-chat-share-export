#!/usr/bin/env node
import { readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { ShareExportError } from './errors.js';
import { toJSON, toMarkdown } from './format.js';
import { exportShare, parseShareHtml } from './index.js';
import { parseChatGptHtml } from './providers/chatgpt/parser.js';
import type { Conversation } from './types.js';

interface Io {
  stdout(text: string): void;
  stderr(text: string): void;
}

const defaultIo: Io = {
  stdout: (text) => {
    process.stdout.write(text);
  },
  stderr: (text) => {
    process.stderr.write(text);
  },
};

interface CliArgs {
  help: boolean;
  format: 'md' | 'json';
  output?: string;
  html?: string;
  url?: string;
}

const HELP = `ai-chat-share-export — export a public AI chat share link to Markdown or JSON

Usage:
  ai-chat-share-export <url> [-f md|json] [-o file]
  ai-chat-share-export --html <file> [url] [-f md|json] [-o file]

Options:
  -f, --format <md|json>   Output format (default: md)
  -o, --output <file>      Write to a file instead of stdout
  --html <file>            Parse a saved share page instead of fetching
  -h, --help               Show this help

With --html and no URL, the page is parsed as a ChatGPT share.
`;

export async function main(argv: string[], io: Io = defaultIo): Promise<number> {
  try {
    const args = parseArgs(argv);
    if (args.help) {
      io.stdout(HELP);
      return 0;
    }
    if (!args.url && !args.html) {
      throw new ShareExportError('INVALID_URL', 'Missing share URL or --html file');
    }

    const conversation = await loadConversation(args);
    const text = args.format === 'json' ? `${toJSON(conversation)}\n` : toMarkdown(conversation);
    if (args.output) writeFileSync(args.output, text, 'utf8');
    else io.stdout(text);
    return 0;
  } catch (err) {
    if (err instanceof ShareExportError) {
      io.stderr(`${err.code}: ${err.message}\n`);
    } else {
      const message = err instanceof Error ? err.message : String(err);
      io.stderr(`PARSE_FAILED: ${message}\n`);
    }
    return 1;
  }
}

async function loadConversation(args: CliArgs): Promise<Conversation> {
  if (args.html) {
    const html = readFileSync(args.html, 'utf8');
    if (!args.url) return parseChatGptHtml(html, '');
    return parseShareHtml(html, args.url);
  }
  if (!args.url) throw new ShareExportError('INVALID_URL', 'Missing share URL or --html file');
  return exportShare(args.url);
}

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = { help: false, format: 'md' };
  const positionals: string[] = [];

  for (let i = 0; i < argv.length; i++) {
    const token = argv[i] ?? '';
    if (token === '-h' || token === '--help') {
      args.help = true;
      continue;
    }
    if (token === '-f' || token === '--format') {
      args.format = formatValue(argv[++i], token);
      continue;
    }
    if (token.startsWith('--format=') || token.startsWith('-f=')) {
      args.format = formatValue(token.slice(token.indexOf('=') + 1), token);
      continue;
    }
    if (token === '-o' || token === '--output') {
      const file = argv[++i];
      if (!file) throw new ShareExportError('INVALID_URL', 'Missing output file');
      args.output = file;
      continue;
    }
    if (token.startsWith('--output=') || token.startsWith('-o=')) {
      args.output = requiredValue(token.slice(token.indexOf('=') + 1), 'Missing output file');
      continue;
    }
    if (token === '--html') {
      const file = argv[++i];
      if (!file) throw new ShareExportError('PARSE_FAILED', 'Missing HTML file path');
      args.html = file;
      continue;
    }
    if (token.startsWith('--html=')) {
      args.html = requiredValue(token.slice('--html='.length), 'Missing HTML file path');
      continue;
    }
    if (token.startsWith('-')) {
      throw new ShareExportError('INVALID_URL', `Unknown option: ${token}`);
    }
    positionals.push(token);
  }

  if (positionals.length > 1) throw new ShareExportError('INVALID_URL', 'Too many arguments');
  args.url = positionals[0];
  return args;
}

function formatValue(value: string | undefined, flag: string): 'md' | 'json' {
  if (value === 'md' || value === 'json') return value;
  throw new ShareExportError('INVALID_URL', `Format must be md or json (got ${flag})`);
}

function requiredValue(value: string, message: string): string {
  if (value === '') throw new ShareExportError('INVALID_URL', message);
  return value;
}

function runningAsCli(): boolean {
  const entry = process.argv[1];
  if (!entry) return false;
  try {
    return realpathSync(fileURLToPath(import.meta.url)) === realpathSync(entry);
  } catch {
    return false;
  }
}

if (runningAsCli()) {
  main(process.argv.slice(2))
    .then((code) => {
      process.exitCode = code;
    })
    .catch((err: unknown) => {
      const message = err instanceof Error ? err.message : String(err);
      process.stderr.write(`PARSE_FAILED: ${message}\n`);
      process.exitCode = 1;
    });
}
