import { ShareExportError } from '../../errors.js';
import type { Conversation, Message } from '../../types.js';
import { decodeTurboStreamFromHtml } from './turbo-stream.js';

const HOSTS = new Set(['chatgpt.com', 'www.chatgpt.com', 'chat.openai.com']);

export interface ChatGptUrl {
  host: string;
  /** null when the host matches but the path is not a share id. */
  shareId: string | null;
}

/**
 * Accept only http(s) chatgpt.com / www.chatgpt.com / chat.openai.com URLs.
 * Userinfo, an explicit port, and extra path segments are rejected.
 * Query strings and hashes are ignored. The id is lowercased.
 */
export function inspectChatGptUrl(input: string): ChatGptUrl | null {
  const trimmed = input.trim();
  if (trimmed === '' || trimmed.length > 512) return null;

  let url = trimmed;
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(url)) {
    url = `https://${url}`;
  }

  const match = /^(https?):\/\/([^/?#]*)([^?#]*)/i.exec(url);
  if (!match) return null;
  const scheme = (match[1] ?? '').toLowerCase();
  if (scheme !== 'http' && scheme !== 'https') return null;

  const authority = match[2] ?? '';
  if (authority === '' || authority.includes('@') || authority.includes('[')) return null;
  if (authority.includes(':')) return null;

  const host = authority.toLowerCase();
  if (!HOSTS.has(host)) return null;

  const path = match[3] === '' || match[3] === undefined ? '/' : match[3];
  const idMatch = /^\/share\/([0-9a-fA-F-]{8,64})\/?$/.exec(path);
  if (!idMatch?.[1]) return { host, shareId: null };
  const shareId = idMatch[1].toLowerCase();
  if (!/[0-9a-f]{8}/.test(shareId)) return { host, shareId: null };
  return { host, shareId };
}

export function canonicalChatGptUrl(shareId: string): string {
  return `https://chatgpt.com/share/${shareId}`;
}

export function parseChatGptHtml(html: string, url: string): Conversation {
  const serverResponse = locateServerResponse(html);
  if (!serverResponse) {
    throw new ShareExportError('PARSE_FAILED', 'Conversation data not found in page');
  }
  if (serverResponse.type === 'error') {
    const err = serverResponse.error;
    throw new ShareExportError(
      'NOT_FOUND',
      typeof err === 'string' && err !== '' ? err : 'Conversation unavailable',
    );
  }

  const data = asRecord(serverResponse.data);
  if (!data) {
    throw new ShareExportError('PARSE_FAILED', 'Conversation payload missing');
  }

  const messages = extractMessages(data);
  if (messages.length === 0) {
    throw new ShareExportError('PARSE_FAILED', 'No visible messages in conversation');
  }

  const titleRaw = data.title;
  const title = typeof titleRaw === 'string' ? titleRaw.trim() : '';
  return { provider: 'chatgpt', title, url, messages };
}

export function locateServerResponse(html: string): Record<string, unknown> | null {
  let root: unknown = null;
  try {
    root = decodeTurboStreamFromHtml(html);
  } catch {
    root = null;
  }

  const rootRecord = asRecord(root);
  if (rootRecord) {
    const loaderData = asRecord(rootRecord.loaderData);
    if (loaderData) {
      for (const routeData of Object.values(loaderData)) {
        const route = asRecord(routeData);
        const serverResponse = asRecord(route?.serverResponse);
        if (serverResponse) return serverResponse;
      }
    }
    const found = deepFind(rootRecord, 0);
    if (found) return found;
  }

  const next = /<script[^>]*id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/.exec(html);
  if (next?.[1]) {
    try {
      const parsed: unknown = JSON.parse(next[1]);
      const pageProps = asRecord(asRecord(asRecord(parsed)?.props)?.pageProps);
      const serverResponse = asRecord(pageProps?.serverResponse);
      if (serverResponse) return serverResponse;
    } catch {
      // Ignore a malformed legacy payload and report parse failure upstream.
    }
  }
  return null;
}

function deepFind(node: unknown, depth: number): Record<string, unknown> | null {
  if (depth > 12) return null;
  if (Array.isArray(node)) {
    for (const child of node) {
      const found = deepFind(child, depth + 1);
      if (found) return found;
    }
    return null;
  }
  const record = asRecord(node);
  if (!record) return null;
  const serverResponse = asRecord(record.serverResponse);
  if (serverResponse && 'type' in serverResponse) return serverResponse;
  if (asRecord(record.mapping) && Object.prototype.hasOwnProperty.call(record, 'title')) {
    return { type: 'data', data: record };
  }
  for (const child of Object.values(record)) {
    const found = deepFind(child, depth + 1);
    if (found) return found;
  }
  return null;
}

export function extractMessages(data: Record<string, unknown>): Message[] {
  let nodes: unknown[] = [];
  if (Array.isArray(data.linear_conversation) && data.linear_conversation.length > 0) {
    nodes = data.linear_conversation;
  } else if (asRecord(data.mapping)) {
    nodes = linearizeMapping(asRecord(data.mapping) as Record<string, unknown>, data.current_node);
  }

  const messages: Message[] = [];
  for (const node of nodes) {
    const message = asRecord(asRecord(node)?.message);
    if (!message) continue;

    const roleRaw = asRecord(message.author)?.role;
    if (roleRaw !== 'user' && roleRaw !== 'assistant') continue;
    const role = roleRaw;

    const metadata = asRecord(message.metadata) ?? {};
    if (!phpEmpty(metadata.is_visually_hidden_from_conversation)) continue;

    const channel = message.channel;
    if (role === 'assistant' && typeof channel === 'string' && channel !== '' && channel !== 'final') {
      continue;
    }
    const recipient = message.recipient ?? 'all';
    if (typeof recipient === 'string' && recipient !== '' && recipient !== 'all') continue;

    const content = asRecord(message.content) ?? {};
    const contentType = content.content_type;
    if (contentType !== 'text' && contentType !== 'multimodal_text') continue;

    let text = partsToText(content.parts);
    if (role === 'assistant') text = cleanAssistantMarkdown(text, metadata);
    else text = normalizeNewlines(text).trim();
    if (text === '') continue;

    const last = messages[messages.length - 1];
    if (last && last.role === role) {
      last.content += `\n\n${text}`;
      continue;
    }
    messages.push({ role, content: text });
  }
  return messages;
}

function linearizeMapping(mapping: Record<string, unknown>, currentNode: unknown): unknown[] {
  let current: unknown = currentNode;
  if (typeof current !== 'string' || !mappingHas(mapping, current)) {
    let leaf: string | undefined;
    for (const [id, node] of Object.entries(mapping)) {
      const record = asRecord(node);
      if (record && phpEmpty(record.children)) leaf = id;
    }
    current = leaf;
  }

  const chain: unknown[] = [];
  const seen = new Set<string>();
  let id: unknown = current;
  while (typeof id === 'string' && mappingHas(mapping, id) && !seen.has(id)) {
    seen.add(id);
    const node = mapping[id];
    chain.push(node);
    id = asRecord(node)?.parent;
  }
  return chain.reverse();
}

function partsToText(parts: unknown): string {
  if (typeof parts === 'string') return parts;
  if (!Array.isArray(parts)) return '';
  const out: string[] = [];
  for (const part of parts) {
    if (typeof part === 'string') {
      if (part !== '') out.push(part);
      continue;
    }
    const record = asRecord(part);
    if (!record) continue;
    if (record.content_type === 'image_asset_pointer') {
      out.push('*[Image]*');
    } else if (typeof record.text === 'string') {
      out.push(record.text);
    }
  }
  return out.join('\n\n');
}

/** Keep assistant Markdown. Strip ChatGPT-only code wrappers and citation markers. */
export function cleanAssistantMarkdown(text: string, metadata: Record<string, unknown> = {}): string {
  let cleaned = normalizeNewlines(text);
  cleaned = cleaned.replace(
    /<CodeBlock\b([^>]*)>\n?([\s\S]*?)\n?<\/CodeBlock>/g,
    (_full, attrs: string, code: string) => {
      const lang = /\blanguage\s*=\s*["']([A-Za-z0-9_+#.-]*)["']/.exec(attrs)?.[1] ?? '';
      let fence = '```';
      while (code.includes(fence)) fence += '`';
      return `${fence}${lang}\n${code}\n${fence}`;
    },
  );

  cleaned = cleaned.replace(/\uE200[^\uE201]*\uE201/gu, '');
  cleaned = cleaned.replace(/[\uE200-\uE2FF]/gu, '');
  cleaned = cleaned.replace(/【\d+(?::\d+)?†[^】]*】/gu, '');

  if (Array.isArray(metadata.content_references)) {
    for (const ref of metadata.content_references) {
      const record = asRecord(ref);
      if (!record) continue;
      const matched = record.matched_text;
      if (typeof matched !== 'string' || matched === '' || matched.trim() === '') continue;
      const alt = typeof record.alt === 'string' ? record.alt : '';
      cleaned = cleaned.split(matched).join(alt);
    }
  }
  return cleaned.trim();
}

function normalizeNewlines(text: string): string {
  return text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
}

function mappingHas(mapping: Record<string, unknown>, id: string): boolean {
  return Object.prototype.hasOwnProperty.call(mapping, id) && mapping[id] != null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return null;
}

/** PHP empty(): null, false, 0, "", "0", [], and {}. */
function phpEmpty(value: unknown): boolean {
  if (value == null || value === false || value === 0 || value === '' || value === '0') return true;
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === 'object') return Object.keys(value).length === 0;
  return false;
}
