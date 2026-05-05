/** Wraps an HTTPS URL in an empty markdown link to suppress embeds. */
export function hideEmbedLink(url: string) {
  if (url.startsWith('https://')) {
    return `[\`](${url})`;
  }
  return url;
}
