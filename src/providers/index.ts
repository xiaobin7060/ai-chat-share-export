import { ShareExportError } from '../errors.js';
import type { ShareProvider } from '../types.js';
import { chatgptProvider } from './chatgpt/index.js';

export const providers: ShareProvider[] = [chatgptProvider];

const PLANNED_HOSTS = new Set(['claude.ai', 'www.claude.ai', 'gemini.google.com']);

export function providerForUrl(url: string): ShareProvider {
  for (const provider of providers) {
    if (provider.normalizeUrl(url)) return provider;
  }
  for (const provider of providers) {
    if (provider.match(url)) {
      throw new ShareExportError('INVALID_URL', 'Invalid share URL');
    }
  }
  if (isPlannedProviderUrl(url)) {
    throw new ShareExportError('UNSUPPORTED_PROVIDER', 'This provider is not supported yet');
  }
  throw new ShareExportError('INVALID_URL', 'Invalid share URL');
}

function isPlannedProviderUrl(input: string): boolean {
  const trimmed = input.trim();
  if (trimmed === '' || trimmed.length > 512) return false;
  let url = trimmed;
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(url)) url = `https://${url}`;
  const match = /^(https?):\/\/([^/?#]+)/i.exec(url);
  if (!match) return false;
  let host = (match[2] ?? '').toLowerCase();
  if (host.includes('@')) return false;
  const colon = host.lastIndexOf(':');
  if (colon !== -1) host = host.slice(0, colon);
  return PLANNED_HOSTS.has(host);
}
