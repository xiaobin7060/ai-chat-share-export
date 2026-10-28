import { ShareExportError } from './errors.js';
import type { ExportOptions } from './types.js';

export const CHATGPT_USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';

export const DEFAULT_TIMEOUT_MS = 15_000;
export const DEFAULT_MAX_BYTES = 5 * 1024 * 1024;

const MAX_REDIRECTS = 5;
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

export interface FetchOptions extends ExportOptions {
  fetchImpl?: typeof fetch;
}

const CANONICAL = /^https:\/\/chatgpt\.com\/share\/([0-9a-f-]{8,64})$/;

/**
 * GET a canonical ChatGPT share URL.
 * Same-origin redirects are followed. Cross-origin redirects are refused.
 */
export async function fetchShareHtml(url: string, opts: FetchOptions = {}): Promise<string> {
  const id = CANONICAL.exec(url);
  if (!id || !/[0-9a-f]{8}/.test(id[1] ?? '')) {
    throw new ShareExportError('INVALID_URL', 'Invalid share id');
  }

  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxBytes = opts.maxBytes ?? DEFAULT_MAX_BYTES;
  const doFetch = opts.fetchImpl ?? globalThis.fetch;
  const startOrigin = new URL(url).origin;
  const controller = new AbortController();
  const timer = setTimeout(() => {
    const reason = new Error('The operation was aborted due to timeout');
    reason.name = 'TimeoutError';
    controller.abort(reason);
  }, timeoutMs);

  try {
    let current = url;
    for (let redirects = 0; ; redirects++) {
      let response: Response;
      try {
        response = await doFetch(current, {
          method: 'GET',
          redirect: 'manual',
          signal: controller.signal,
          headers: {
            'User-Agent': CHATGPT_USER_AGENT,
            Accept: 'text/html,application/xhtml+xml',
            'Accept-Language': 'en-US,en;q=0.9',
          },
        });
      } catch (err) {
        if (isTimeout(err)) throw new ShareExportError('FETCH_FAILED', 'Fetch timed out');
        const message = err instanceof Error ? err.message : String(err);
        throw new ShareExportError('FETCH_FAILED', `Fetch failed: ${message}`);
      }

      if (REDIRECT_STATUSES.has(response.status)) {
        if (redirects >= MAX_REDIRECTS) {
          await cancel(response);
          throw new ShareExportError('FETCH_FAILED', 'Too many redirects');
        }
        const location = response.headers.get('location');
        await cancel(response);
        if (!location) throw new ShareExportError('FETCH_FAILED', 'Redirect missing Location');
        const next = new URL(location, current);
        if (next.username || next.password || next.port) {
          throw new ShareExportError('FETCH_FAILED', 'Refusing redirect with userinfo or a port');
        }
        if (next.protocol !== 'https:' || next.origin !== startOrigin) {
          throw new ShareExportError('FETCH_FAILED', 'Refusing cross-origin redirect');
        }
        current = next.href;
        continue;
      }

      if (response.status === 404 || response.status === 410) {
        await cancel(response);
        throw new ShareExportError('NOT_FOUND', `Share not found (HTTP ${response.status})`);
      }
      if (response.status !== 200) {
        await cancel(response);
        throw new ShareExportError('FETCH_FAILED', `Unexpected HTTP status ${response.status}`);
      }
      return await readLimited(response, maxBytes);
    }
  } finally {
    clearTimeout(timer);
  }
}

function isTimeout(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const name = (err as { name?: string }).name;
  return name === 'TimeoutError' || name === 'AbortError';
}

async function cancel(response: Response): Promise<void> {
  await response.body?.cancel().catch(() => undefined);
}

async function readLimited(response: Response, maxBytes: number): Promise<string> {
  const declared = response.headers.get('content-length');
  if (declared !== null && /^\d+$/.test(declared) && Number(declared) > maxBytes) {
    await cancel(response);
    throw new ShareExportError('PARSE_FAILED', 'Share page is too large');
  }
  if (!response.body) {
    const text = await response.text();
    if (Buffer.byteLength(text) > maxBytes) {
      throw new ShareExportError('PARSE_FAILED', 'Share page is too large');
    }
    return text;
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value || value.byteLength === 0) continue;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel().catch(() => undefined);
        throw new ShareExportError('PARSE_FAILED', 'Share page is too large');
      }
      chunks.push(value);
    }
  } catch (err) {
    if (err instanceof ShareExportError) throw err;
    const message = err instanceof Error ? err.message : String(err);
    throw new ShareExportError('FETCH_FAILED', `Fetch failed: ${message}`);
  }

  const body = Buffer.concat(chunks.map((chunk) => Buffer.from(chunk.buffer, chunk.byteOffset, chunk.byteLength)));
  return body.toString('utf8');
}
