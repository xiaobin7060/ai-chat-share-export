import { describe, expect, it } from 'vitest';
import {
  decodeTurboStream,
  decodeTurboStreamFromHtml,
  extractTurboStream,
} from '../src/providers/chatgpt/turbo-stream.js';

describe('turbo-stream', () => {
  const stream =
    '[{"_1":2,"_3":-5,"_4":12,"_6":7,"_8":9},"a",[10,-1,11],"b","shared",12,"date",["D",1700000000000],"p",["P",20],1,"x",{"_13":-7,"_14":-2},"u","n"]\n' +
    'P20:[{"_1":2}]\n';

  const decoded = decodeTurboStream(stream) as {
    a: unknown[];
    b: unknown;
    shared: { u: unknown; n: unknown };
    date: unknown;
    p: { a: unknown[] };
  };

  it('decodes arrays, holes, and null sentinels', () => {
    expect(decoded.a).toEqual([1, null, 'x']);
    expect(decoded.b).toBeNull();
    expect(decoded.shared.u).toBeNull();
    expect(Number.isNaN(decoded.shared.n)).toBe(true);
  });

  it('decodes Date as epoch milliseconds', () => {
    expect(decoded.date).toBe(1700000000000);
  });

  it('resolves a deferred promise row against earlier indexes', () => {
    expect(decoded.p.a).toEqual([1, null, 'x']);
  });

  it('reads enqueue literals and unicode escapes from HTML', () => {
    const escaped =
      '<script>window.__reactRouterContext.streamController.enqueue("[{\\"_1\\":2},\\"k\\",\\"v\\u003c/script\\u003e\\"]\\n");</script>';
    expect(decodeTurboStreamFromHtml(escaped)).toEqual({ k: 'v</script>' });
  });

  it('returns null when the page has no stream', () => {
    expect(decodeTurboStreamFromHtml('<html>no stream</html>')).toBeNull();
  });

  it('falls back for JS \\x escapes that JSON.parse rejects', () => {
    const html = 'streamController.enqueue("[\\"\\x41\\"]")';
    expect(extractTurboStream(html)).toBe('["A"]');
    expect(decodeTurboStreamFromHtml(html)).toBe('A');
  });

  it('rejects an empty stream', () => {
    expect(() => decodeTurboStream('\n')).toThrow(/empty/);
  });
});
