import { ShareExportError } from './errors.js';
import { fetchShareHtml } from './fetch.js';
import { toJSON, toMarkdown } from './format.js';
import { providers, providerForUrl } from './providers/index.js';
import type { Conversation, ExportOptions } from './types.js';

export { ShareExportError };
export type { ShareExportErrorCode } from './errors.js';
export type { Conversation, ExportOptions, MarkdownOptions, Message } from './types.js';
export { toJSON, toMarkdown };

/**
 * Provider id for a valid share URL (`chatgpt`), or null when this package
 * cannot export it. Claude and Gemini links are null until those providers exist.
 */
export function detectProvider(url: string): string | null {
  for (const provider of providers) {
    if (provider.normalizeUrl(url)) return provider.id;
  }
  return null;
}

/** Parse a saved share page. `url` selects the provider and is stored on the result. */
export function parseShareHtml(html: string, url: string): Conversation {
  const provider = providerForUrl(url);
  const normalized = provider.normalizeUrl(url);
  if (!normalized) throw new ShareExportError('INVALID_URL', 'Invalid share URL');
  return provider.parseHtml(html, normalized);
}

/**
 * Fetch a public share link and parse the conversation.
 * The request always goes to the canonical https URL for that provider.
 */
export async function exportShare(url: string, opts: ExportOptions = {}): Promise<Conversation> {
  const provider = providerForUrl(url);
  const normalized = provider.normalizeUrl(url);
  if (!normalized) throw new ShareExportError('INVALID_URL', 'Invalid share URL');
  const html = await fetchShareHtml(normalized, opts);
  return provider.parseHtml(html, normalized);
}
