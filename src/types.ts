export interface Message {
  role: 'user' | 'assistant';
  content: string;
}

export interface Conversation {
  provider: string;
  title: string;
  url: string;
  messages: Message[];
}

export interface ExportOptions {
  /** Whole-request timeout in milliseconds. Default: 15000. */
  timeoutMs?: number;
  /** Maximum decompressed response body in bytes. Default: 5 MiB. */
  maxBytes?: number;
}

export interface MarkdownOptions {
  /** Prefix on user messages. Default: "You:". */
  userLabel?: string;
  /** Prefix on assistant messages. Omit to leave answers unlabeled. */
  assistantLabel?: string;
}

export interface ShareProvider {
  id: string;
  /** True when the URL belongs to this provider, even if the path is not a share link. */
  match(url: string): boolean;
  /** Canonical https URL, or null when the URL is not a valid share link. */
  normalizeUrl(url: string): string | null;
  parseHtml(html: string, url: string): Conversation;
}
