// A shared story travels through chat as a normal text message, so it works for every app version
// and needs no server change. New versions recognise the format and show it as a nice card.
//   📰 <title>
//   <source> · <category>
//   <url>
export const FEED_MARK = '📰';

export function buildShareText(article, categoryLabel) {
  const meta = categoryLabel ? `${article.source} · ${categoryLabel}` : article.source;
  return `${FEED_MARK} ${article.title}\n${meta}\n${article.url}`;
}

export function parseShareText(text) {
  if (!text || typeof text !== 'string' || !text.startsWith(`${FEED_MARK} `)) return null;
  const lines = text.split('\n');
  if (lines.length < 3) return null;
  const url = lines[lines.length - 1].trim();
  if (!/^https?:\/\/\S+$/i.test(url)) return null;
  return {
    title: lines[0].slice(FEED_MARK.length).trim(),
    meta: lines.slice(1, -1).join(' ').trim(),
    url,
  };
}
