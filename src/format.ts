import type { Conversation, MarkdownOptions } from './types.js';

/**
 * Render a conversation the same way the ChatGPT share exporter does:
 * the title is the only H1, user turns are quoted, and assistant Markdown
 * is kept. Assistant headings are shifted down one level when the title is
 * present and an answer already contains an H1.
 */
export function toMarkdown(conversation: Conversation, opts: MarkdownOptions = {}): string {
  const userLabel = opts.userLabel ?? 'You:';
  const assistantLabel = opts.assistantLabel;
  const title = conversation.title.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim();

  const hasH1 = title !== '' && conversation.messages.some(
    (message) => message.role === 'assistant' && hasHeadingLevel(message.content, 1),
  );

  const blocks: string[] = [];
  if (title !== '') {
    blocks.push(`# ${title.replace(/\n/g, ' ')}`);
  }

  conversation.messages.forEach((message, index) => {
    if (message.role === 'user') {
      if (index > 0) blocks.push('---');
      const lines = message.content.split('\n');
      lines[0] = `**${userLabel}** ${lines[0] ?? ''}`;
      blocks.push(lines.map((line) => (line === '' ? '>' : `> ${line}`)).join('\n'));
      return;
    }

    let content = message.content;
    if (hasH1) content = demoteHeadings(content);
    if (assistantLabel) content = `**${assistantLabel}**\n\n${content}`;
    blocks.push(content);
  });

  return `${blocks.join('\n\n')}\n`;
}

export function toJSON(conversation: Conversation): string {
  return JSON.stringify(conversation, null, 2);
}

function mapOutsideFences(markdown: string, fn: (line: string) => string): string {
  const lines = markdown.split('\n');
  let fence: string | null = null;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? '';
    const marker = /^\s{0,3}(`{3,}|~{3,})/.exec(line);
    if (marker?.[1]) {
      const token = marker[1];
      if (fence === null) {
        fence = token;
      } else if (token[0] === fence[0] && token.length >= fence.length) {
        fence = null;
      }
      continue;
    }
    if (fence === null) lines[i] = fn(line);
  }
  return lines.join('\n');
}

function hasHeadingLevel(markdown: string, level: number): boolean {
  const prefix = '#'.repeat(level);
  const pattern = new RegExp(`^${prefix}\\s`);
  let found = false;
  mapOutsideFences(markdown, (line) => {
    if (pattern.test(line)) found = true;
    return line;
  });
  return found;
}

function demoteHeadings(markdown: string): string {
  return mapOutsideFences(markdown, (line) => (/^(#{1,5})\s/.test(line) ? `#${line}` : line));
}
