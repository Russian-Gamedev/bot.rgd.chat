import { mock } from 'bun:test';

type FetchHandler = (
  url: string,
  init?: RequestInit,
) => Response | Promise<Response>;

const originalFetch = globalThis.fetch;

/** Replaces global fetch with a handler keyed by URL; call restoreFetch afterwards. */
export function installFetch(handler: FetchHandler) {
  const fetchMock = mock(
    async (input: string | URL | Request, init?: RequestInit) => {
      const url =
        typeof input === 'string'
          ? input
          : input instanceof URL
            ? input.toString()
            : input.url;
      return handler(url, init);
    },
  );
  globalThis.fetch = fetchMock as unknown as typeof fetch;
  return fetchMock;
}

export function restoreFetch(): void {
  globalThis.fetch = originalFetch;
}

export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

export function mediaResponse(contentType: string, status = 200): Response {
  return new Response(null, {
    status,
    headers: { 'content-type': contentType },
  });
}
