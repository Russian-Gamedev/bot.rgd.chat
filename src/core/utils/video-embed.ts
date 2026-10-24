const CRAWLER_USER_AGENT =
  'Mozilla/5.0 (compatible; Discordbot/2.0; +https://discordapp.com)';
const FETCH_TIMEOUT_MS = 3_000;
const FX_TWITTER_API_URL = 'https://api.fxtwitter.com/status';

export type EmbedMediaKind = 'video' | 'no-video' | 'unknown';

interface FxTwitterResponse {
  code?: number;
  tweet?: {
    media?: {
      all?: unknown[];
      videos?: unknown[];
    };
    quote?: {
      media?: {
        videos?: unknown[];
      };
    };
  };
}

/**
 * Resolves whether the fix-embed URL produces a video embed.
 * Returns `unknown` when the provider cannot be reached or cannot be classified;
 * callers should treat that as "do not fix" (fail-closed).
 */
export async function detectEmbedMediaKind(
  fixedUrl: string,
): Promise<EmbedMediaKind> {
  let url: URL;
  try {
    url = new URL(fixedUrl);
  } catch {
    return 'unknown';
  }

  switch (url.hostname) {
    case 'fxtwitter.com':
      return detectTwitter(url);
    case 'kkinstagram.com':
      return detectInstagram(url, fixedUrl);
    case 'd.tnktok.com':
      return detectTiktok(url, fixedUrl);
    default:
      return 'unknown';
  }
}

async function detectTwitter(url: URL): Promise<EmbedMediaKind> {
  const statusId = /\/status\/(\d+)/.exec(url.pathname)?.[1];
  if (!statusId) return 'no-video';

  const response = await fetch(`${FX_TWITTER_API_URL}/${statusId}`, {
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  }).catch(() => null);

  if (!response) return 'unknown';
  if (response.status === 404 || response.status === 410) return 'no-video';
  if (!response.ok) return 'unknown';

  const payload = (await response
    .json()
    .catch(() => null)) as FxTwitterResponse | null;
  if (payload?.code === 404) return 'no-video';
  if (payload?.code !== 200 || !payload.tweet) return 'unknown';

  const ownMedia = payload.tweet.media;
  const media = ownMedia?.all?.length ? ownMedia : payload.tweet.quote?.media;
  return (media?.videos?.length ?? 0) > 0 ? 'video' : 'no-video';
}

async function detectInstagram(
  url: URL,
  fixedUrl: string,
): Promise<EmbedMediaKind> {
  const mediaPath = /^\/(p|reel|reels|tv)\/[A-Za-z0-9_-]+/.exec(url.pathname);
  if (!mediaPath) return 'no-video';

  const pathKind: EmbedMediaKind = mediaPath[1] === 'p' ? 'unknown' : 'video';
  const probed = await probeMedia(fixedUrl);
  return probed === 'unknown' ? pathKind : probed;
}

async function detectTiktok(
  url: URL,
  fixedUrl: string,
): Promise<EmbedMediaKind> {
  const videoPath = /^\/@[^/]+\/(video|photo)\/\d+/.exec(url.pathname);
  if (!videoPath) return 'no-video';

  const pathKind: EmbedMediaKind =
    videoPath[1] === 'video' ? 'video' : 'no-video';
  const probed = await probeMedia(fixedUrl);
  return probed === 'unknown' ? pathKind : probed;
}

async function probeMedia(fixedUrl: string): Promise<EmbedMediaKind> {
  const response = await fetch(fixedUrl, {
    method: 'HEAD',
    redirect: 'follow',
    headers: { 'user-agent': CRAWLER_USER_AGENT },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  }).catch(() => null);

  if (!response) return 'unknown';
  if (response.status === 404 || response.status === 410) return 'no-video';
  if (!response.ok) return 'unknown';

  const contentType = (
    response.headers.get('content-type') ?? ''
  ).toLowerCase();
  if (contentType.startsWith('video/')) return 'video';
  if (contentType.startsWith('image/')) return 'no-video';
  return 'unknown';
}
