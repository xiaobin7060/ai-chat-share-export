/**
 * turbo-stream (v2) decoder used by React Router v7 / Remix.
 *
 * ChatGPT share pages embed the loader payload as JS string literals passed to
 * `streamController.enqueue("...")`. The decoded stream is a flat value table:
 * numbers inside objects and arrays are indexes into that table, negative
 * numbers are sentinels, and a string-prefixed array is a typed value
 * (Date, Promise, Map, …). Deferred rows look like `P<id>:<payload>`.
 *
 * This decoder reads the data. It does not restore JS semantics: Date becomes
 * a millisecond timestamp, Map becomes a plain object, unknown types become
 * null, and cycles become null.
 */

const HOLE = -1;
const NAN = -2;
const NEGATIVE_INFINITY = -3;
const NEGATIVE_ZERO = -4;
const NULL_VALUE = -5;
const POSITIVE_INFINITY = -6;
const UNDEFINED = -7;

type Raw = unknown;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value);
}

function specialValue(index: number): unknown {
  switch (index) {
    case NAN:
      return Number.NaN;
    case NEGATIVE_INFINITY:
      return Number.NEGATIVE_INFINITY;
    case POSITIVE_INFINITY:
      return Number.POSITIVE_INFINITY;
    case NEGATIVE_ZERO:
      return 0;
    case HOLE:
    case NULL_VALUE:
    case UNDEFINED:
    default:
      return null;
  }
}

function scalarKey(value: unknown): string | null {
  if (typeof value === 'string') return value;
  if (typeof value === 'boolean') return value ? '1' : '';
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return null;
}

class TurboStreamDecoder {
  private values: Raw[] = [];
  private readonly hydrated = new Map<number, unknown>();
  private readonly inProgress = new Set<number>();
  private readonly promises = new Map<number, number>();

  decode(stream: string): unknown {
    const lines = stream.split('\n');
    let rootFound = false;

    for (const rawLine of lines) {
      const line = rawLine.endsWith('\r') ? rawLine.slice(0, -1) : rawLine;
      if (line === '') continue;

      if (!rootFound) {
        const parsed: unknown = JSON.parse(line);
        if (!Array.isArray(parsed) || !(0 in parsed)) {
          throw new Error('turbo-stream root line is not a JSON array');
        }
        this.values = parsed;
        rootFound = true;
        continue;
      }

      const deferred = /^([PE])(\d+):(.*)$/s.exec(line);
      if (!deferred) continue;
      let payload: unknown;
      try {
        payload = JSON.parse(deferred[3] ?? '');
      } catch {
        continue;
      }
      const id = Number(deferred[2]);
      if (isInteger(payload)) {
        this.promises.set(id, payload);
      } else if (Array.isArray(payload) && 0 in payload) {
        const start = this.values.length;
        for (const item of payload) this.values.push(item);
        this.promises.set(id, start);
      }
    }

    if (!rootFound) {
      throw new Error('turbo-stream is empty');
    }
    return this.hydrate(0);
  }

  private hydrate(index: number): unknown {
    if (!isInteger(index)) return null;
    if (index < 0) return specialValue(index);
    if (index >= this.values.length) return null;
    if (this.hydrated.has(index)) return this.hydrated.get(index);
    if (this.inProgress.has(index)) return null;

    const raw = this.values[index];
    this.inProgress.add(index);

    let result: unknown;
    if (Array.isArray(raw)) {
      result = this.hydrateArray(raw);
    } else if (isPlainObject(raw)) {
      // PHP json_decode(..., true) collapses {} to [].
      result = Object.keys(raw).length === 0 ? [] : this.hydrateObject(raw);
    } else {
      result = raw;
    }

    this.inProgress.delete(index);
    this.hydrated.set(index, result);
    return result;
  }

  private hydrateObject(raw: Record<string, unknown> | unknown[]): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    const entries: Array<[string, unknown]> = Array.isArray(raw)
      ? raw.map((value, key) => [String(key), value])
      : Object.entries(raw);

    for (const [key, valueIndex] of entries) {
      const ref = /^_(\d+)$/.exec(key);
      let realKey = key;
      if (ref) {
        const keyValue = this.values[Number(ref[1])];
        const asText = scalarKey(keyValue);
        if (asText !== null) realKey = asText;
      }
      result[realKey] = isInteger(valueIndex) ? this.hydrate(valueIndex) : valueIndex;
    }
    return result;
  }

  private hydrateArray(raw: unknown[]): unknown {
    if (raw.length === 0) return [];
    if (typeof raw[0] === 'string') return this.hydrateTyped(raw);
    return raw.map((item) => (item === HOLE ? null : this.hydrate(item as number)));
  }

  private hydrateTyped(raw: unknown[]): unknown {
    const type = raw[0];
    switch (type) {
      case 'D':
      case 'B':
      case 'U':
      case 'Y':
        return raw[1] ?? null;
      case 'R':
        return raw[1] !== undefined ? `/${String(raw[1])}/${raw[2] ?? ''}` : null;
      case 'E':
        return { message: raw[1] ?? '' };
      case 'M': {
        const map: Record<string, unknown> = {};
        for (let i = 1; i + 1 < raw.length; i += 2) {
          const key = this.hydrate(raw[i] as number);
          const keyText = scalarKey(key);
          map[keyText !== null ? keyText : String(i)] = this.hydrate(raw[i + 1] as number);
        }
        return map;
      }
      case 'S': {
        const set: unknown[] = [];
        for (let i = 1; i < raw.length; i++) set.push(this.hydrate(raw[i] as number));
        return set;
      }
      case 'N': {
        const inner = raw[1];
        if (Array.isArray(inner) || isPlainObject(inner)) return this.hydrateObject(inner);
        return inner !== undefined ? this.hydrate(inner as number) : [];
      }
      case 'P': {
        const id = raw[1];
        if (isInteger(id) && this.promises.has(id)) {
          return this.hydrate(this.promises.get(id) as number);
        }
        return null;
      }
      case 'Z':
        return raw[1] !== undefined ? this.hydrate(raw[1] as number) : null;
      default:
        return null;
    }
  }
}

/** Concatenate every `streamController.enqueue("...")` argument, in order. */
export function extractTurboStream(html: string): string | null {
  const needle = 'streamController.enqueue(';
  let from = 0;
  let stream = '';

  while (from < html.length) {
    const start = html.indexOf(needle, from);
    if (start < 0) break;
    let i = start + needle.length;
    while (i < html.length && /\s/.test(html[i] ?? '')) i++;
    if (html[i] !== '"') {
      from = Math.max(i, start + needle.length);
      continue;
    }
    const end = scanJsStringEnd(html, i);
    if (end < 0) {
      from = i + 1;
      continue;
    }
    const literal = html.slice(i, end);
    const chunk = decodeJsString(literal);
    if (chunk !== null) stream += chunk;
    from = end;
  }

  return stream === '' ? null : stream;
}

export function decodeTurboStream(stream: string): unknown {
  return new TurboStreamDecoder().decode(stream);
}

/** Root value, or null when the page has no turbo-stream payload. */
export function decodeTurboStreamFromHtml(html: string): unknown {
  const stream = extractTurboStream(html);
  if (stream === null) return null;
  return decodeTurboStream(stream);
}

function scanJsStringEnd(html: string, openQuote: number): number {
  let i = openQuote + 1;
  while (i < html.length) {
    const ch = html[i];
    if (ch === '\\') {
      i += 2;
      continue;
    }
    if (ch === '"') return i + 1;
    i++;
  }
  return -1;
}

function decodeJsString(literal: string): string | null {
  try {
    const parsed: unknown = JSON.parse(literal);
    if (typeof parsed === 'string') return parsed;
  } catch {
    // JS-only escapes (\xHH, \', line continuation) are handled below.
  }
  return decodeJsStringLiteral(literal);
}

function decodeJsStringLiteral(literal: string): string | null {
  if (literal.length < 2 || literal[0] !== '"' || literal[literal.length - 1] !== '"') {
    return null;
  }
  let inner = literal.slice(1, -1);
  inner = inner.replace(/\\(x[0-9a-fA-F]{2}|'|\r?\n)/g, (_match, seq: string) => {
    if (seq === "'") return "'";
    if (seq[0] === 'x') return `\\u00${seq.slice(1)}`;
    return '';
  });
  try {
    const parsed: unknown = JSON.parse(`"${inner}"`);
    return typeof parsed === 'string' ? parsed : null;
  } catch {
    return null;
  }
}
