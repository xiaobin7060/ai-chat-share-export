import type { ShareProvider } from '../../types.js';
import { canonicalChatGptUrl, inspectChatGptUrl, parseChatGptHtml } from './parser.js';

export const chatgptProvider: ShareProvider = {
  id: 'chatgpt',
  match(url: string): boolean {
    return inspectChatGptUrl(url) !== null;
  },
  normalizeUrl(url: string): string | null {
    const inspected = inspectChatGptUrl(url);
    if (!inspected?.shareId) return null;
    return canonicalChatGptUrl(inspected.shareId);
  },
  parseHtml(html: string, url: string) {
    return parseChatGptHtml(html, url);
  },
};
