// Feed service: pulls headlines / widgets from free public sources and caches them in memory.
// Only headline, image, short summary, source and link are kept (full articles are never copied).
const axios = require('axios');

const UA = 'Mozilla/5.0 (compatible; PriyoChatFeed/1.0)';
const http = axios.create({ timeout: 12000, headers: { 'User-Agent': UA }, maxRedirects: 5, validateStatus: (s) => s >= 200 && s < 300 });

// ── tiny in-memory cache ───────────────────────────────────────────────
const cache = new Map();
async function cached(key, ttlMs, loader) {
  const hit = cache.get(key);
  const now = Date.now();
  if (hit && now - hit.at < ttlMs) return hit.value;
  if (hit && hit.pending) return hit.pending; // de-duplicate concurrent loads
  const pending = loader()
    .then((value) => { cache.set(key, { at: Date.now(), value }); return value; })
    .catch((err) => { if (hit) { cache.set(key, { ...hit, pending: null }); return hit.value; } throw err; });
  cache.set(key, { ...(hit || { at: 0, value: null }), pending });
  return pending;
}

// ── RSS parsing (no extra dependency) ──────────────────────────────────
const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', '#39': "'", '#8217': '’', '#8216': '‘', '#8220': '“', '#8221': '”', '#8211': '–', '#8212': '—', '#8230': '…' };
const decode = (s) => String(s || '')
  .replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (m, e) => {
    if (ENT[e] !== undefined) return ENT[e];
    if (e[0] === '#') { const code = e[1] === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10); return Number.isFinite(code) ? String.fromCodePoint(code) : m; }
    return m;
  });
const stripTags = (s) => decode(String(s || '').replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim();
const tag = (block, name) => { const m = block.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`, 'i')); return m ? m[1] : ''; };
const attr = (block, re) => { const m = block.match(re); return m ? m[1] : ''; };

function pickImage(block) {
  let img = attr(block, /<media:content[^>]*url=["']([^"']+)["']/i)
    || attr(block, /<media:thumbnail[^>]*url=["']([^"']+)["']/i)
    || attr(block, /<enclosure[^>]*type=["']image[^"']*["'][^>]*url=["']([^"']+)["']/i)
    || attr(block, /<enclosure[^>]*url=["']([^"']+\.(?:jpe?g|png|webp)[^"']*)["']/i);
  if (!img) {
    const html = decode(tag(block, 'content:encoded') || tag(block, 'description')).replace(/<!\[CDATA\[|\]\]>/g, '');
    img = attr(html, /<img[^>]*src=["']([^"']+)["']/i);
  }
  img = decode(img || '');
  return /^https?:\/\//i.test(img) ? img : null;
}

function parseRss(xml, base) {
  const items = [];
  const re = /<item[\s>][\s\S]*?<\/item>/gi;
  let m;
  while ((m = re.exec(xml)) && items.length < 40) {
    const b = m[0];
    const title = stripTags(tag(b, 'title'));
    let url = stripTags(tag(b, 'link')) || attr(b, /<link[^>]*href=["']([^"']+)["']/i);
    if (url && url.startsWith('/') && base) url = base.replace(/\/$/, '') + url;
    const summary = stripTags(tag(b, 'description') || tag(b, 'content:encoded')).slice(0, 220);
    const date = new Date(stripTags(tag(b, 'pubDate') || tag(b, 'dc:date')) || Date.now());
    if (!title || !/^https?:\/\//i.test(url)) continue;
    items.push({
      title,
      summary: summary && summary.toLowerCase() !== title.toLowerCase() ? summary : '',
      image: pickImage(b),
      url,
      publishedAt: isNaN(date) ? new Date().toISOString() : date.toISOString(),
    });
  }
  return items;
}

// ── sources ────────────────────────────────────────────────────────────
// category ids are the interests the app shows
const RSS = {
  prothomalo: { name: 'প্রথম আলো', url: 'https://www.prothomalo.com/stories.rss', lang: 'bn', base: 'https://www.prothomalo.com' },
  bbcbangla: { name: 'BBC বাংলা', url: 'https://feeds.bbci.co.uk/bengali/rss.xml', lang: 'bn' },
  dailystar: { name: 'The Daily Star', url: 'https://www.thedailystar.net/bangladesh/rss.xml', lang: 'en', base: 'https://www.thedailystar.net' },
  tbs: { name: 'The Business Standard', url: 'https://www.tbsnews.net/rss.xml', lang: 'en' },
  bbcworld: { name: 'BBC News', url: 'https://feeds.bbci.co.uk/news/world/rss.xml', lang: 'en' },
  guardian: { name: 'The Guardian', url: 'https://www.theguardian.com/world/rss', lang: 'en' },
  techcrunch: { name: 'TechCrunch', url: 'https://techcrunch.com/feed/', lang: 'en' },
  cricinfo: { name: 'ESPNcricinfo', url: 'https://www.espncricinfo.com/rss/content/story/feeds/0.xml', lang: 'en' },
  bbcsport: { name: 'BBC Sport', url: 'https://feeds.bbci.co.uk/sport/rss.xml', lang: 'en' },
  sciencedaily: { name: 'ScienceDaily', url: 'https://www.sciencedaily.com/rss/top/science.xml', lang: 'en' },
  bbcbiz: { name: 'BBC Business', url: 'https://feeds.bbci.co.uk/news/business/rss.xml', lang: 'en' },
  bbchealth: { name: 'BBC Health', url: 'https://feeds.bbci.co.uk/news/health/rss.xml', lang: 'en' },
  bbcent: { name: 'BBC Entertainment', url: 'https://feeds.bbci.co.uk/news/entertainment_and_arts/rss.xml', lang: 'en' },
};

const CATEGORY_SOURCES = {
  bangladesh: { en: ['dailystar', 'tbs'], bn: ['prothomalo'] },
  world: { en: ['bbcworld', 'guardian'], bn: ['bbcbangla'] },
  tech: { en: ['techcrunch', 'hn', 'devto'], bn: [] },
  cricket: { en: ['cricinfo'], bn: [] },
  sports: { en: ['bbcsport'], bn: [] },
  science: { en: ['sciencedaily'], bn: [] },
  space: { en: ['spaceflight'], bn: [] },
  business: { en: ['bbcbiz', 'tbs'], bn: [] },
  health: { en: ['bbchealth'], bn: [] },
  entertainment: { en: ['bbcent'], bn: [] },
};
const VALID_CATEGORIES = Object.keys(CATEGORY_SOURCES);

async function loadRss(id) {
  const s = RSS[id];
  return cached(`rss:${id}`, 15 * 60 * 1000, async () => {
    const { data } = await http.get(s.url, { responseType: 'text', transformResponse: (r) => r });
    return parseRss(data, s.base).map((i) => ({ ...i, source: s.name, lang: s.lang }));
  });
}

async function loadHN() {
  return cached('hn', 15 * 60 * 1000, async () => {
    const { data: ids } = await http.get('https://hacker-news.firebaseio.com/v0/topstories.json');
    const top = ids.slice(0, 30);
    const stories = await Promise.all(top.map((id) => http.get(`https://hacker-news.firebaseio.com/v0/item/${id}.json`).then((r) => r.data).catch(() => null)));
    return stories
      .filter((s) => s && s.title && s.url)
      .map((s) => ({ title: s.title, summary: `${s.score} points · ${s.descendants || 0} comments on Hacker News`, image: null, url: s.url, publishedAt: new Date(s.time * 1000).toISOString(), source: 'Hacker News', lang: 'en' }));
  });
}

async function loadDevTo() {
  return cached('devto', 20 * 60 * 1000, async () => {
    const { data } = await http.get('https://dev.to/api/articles?per_page=30&top=1');
    return data.map((a) => ({ title: a.title, summary: (a.description || '').slice(0, 200), image: a.cover_image || a.social_image || null, url: a.url, publishedAt: a.published_at, source: 'DEV Community', lang: 'en' }));
  });
}

async function loadSpaceflight() {
  return cached('spaceflight', 20 * 60 * 1000, async () => {
    const { data } = await http.get('https://api.spaceflightnewsapi.net/v4/articles/?limit=30');
    return (data.results || []).map((a) => ({ title: a.title, summary: (a.summary || '').slice(0, 220), image: a.image_url || null, url: a.url, publishedAt: a.published_at, source: a.news_site || 'Spaceflight News', lang: 'en' }));
  });
}

async function loadSource(id) {
  if (id === 'hn') return loadHN();
  if (id === 'devto') return loadDevTo();
  if (id === 'spaceflight') return loadSpaceflight();
  return loadRss(id);
}

const hashId = (s) => { let h = 5381; for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0; return (h >>> 0).toString(36); };

/**
 * Personalised "Today for you" list. Mixes the user's interests round-robin so the
 * first cards already feel varied, newest first inside each interest.
 */
// small seeded random generator so every page of one refresh sees the same shuffled order
function seededRandom(seed) {
  let a = (seed >>> 0) || 1;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

async function getArticles({ interests, lang = 'both', page = 1, limit = 24, refresh = false, seed = 0, exclude = [] }) {
  const excluded = new Set(exclude);
  // Pull-to-refresh: mark source caches older than 45s as stale (the old value is kept as a fallback if a source is down)
  if (refresh) {
    const now = Date.now();
    for (const [k, v] of cache.entries()) {
      if (/^(rss:|hn$|devto$|spaceflight$)/.test(k) && v && now - v.at > 45 * 1000) cache.set(k, { ...v, at: 0 });
    }
  }
  const cats = (interests || []).filter((c) => VALID_CATEGORIES.includes(c));
  const use = cats.length ? cats : ['bangladesh', 'world', 'tech'];

  const perCat = await Promise.all(use.map(async (cat) => {
    const map = CATEGORY_SOURCES[cat];
    let ids = [];
    if (lang === 'bn') ids = map.bn.length ? map.bn : map.en;
    else if (lang === 'en') ids = map.en;
    else ids = [...map.bn, ...map.en];
    const lists = await Promise.all(ids.map((id) => loadSource(id).catch(() => [])));
    const seen = new Set();
    const items = lists.flat()
      .filter((a) => { const k = a.url; if (seen.has(k)) return false; seen.add(k); return true; })
      .map((a) => ({ ...a, category: cat }))
      .sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt));

    // Refresh variety: with a seed, nearby stories swap places so each refresh surfaces a different mix
    // while staying roughly newest-first.
    let ordered = items;
    if (seed) {
      const rnd = seededRandom(seed + cat.length * 7919);
      ordered = items
        .map((a, i) => ({ a, k: i + rnd() * 14 }))
        .sort((x, y) => x.k - y.k)
        .map((x) => x.a);
    }
    // Stories the reader has already been shown go to the back, so new ones come first
    if (excluded.size) {
      const fresh = ordered.filter((a) => !excluded.has(hashId(a.url)));
      const old = ordered.filter((a) => excluded.has(hashId(a.url)));
      ordered = [...fresh, ...old];
    }
    return ordered;
  }));

  // round robin across categories
  const out = [];
  const seenUrl = new Set();
  const maxLen = Math.max(0, ...perCat.map((l) => l.length));
  for (let i = 0; i < maxLen; i++) {
    for (const list of perCat) {
      const a = list[i];
      if (a && !seenUrl.has(a.url)) { seenUrl.add(a.url); out.push(a); }
    }
  }
  // prefer cards that have pictures near the top (hero + first cards look better)
  const topImgs = out.filter((a) => a.image).slice(0, 2);
  const ordered = [...topImgs, ...out.filter((a) => !topImgs.includes(a))];
  const all = ordered.map((a) => ({ id: hashId(a.url), ...a }));
  const start = (Math.max(1, page) - 1) * limit;
  const freshCount = excluded.size ? all.filter((a) => !excluded.has(a.id)).length : all.length;
  return { articles: all.slice(start, start + limit), page: Math.max(1, page), hasMore: start + limit < all.length, total: all.length, freshCount };
}

// ── widgets ────────────────────────────────────────────────────────────
const WMO = (code) => {
  if (code === 0) return { text: 'Clear sky', icon: 'sunny' };
  if (code <= 2) return { text: 'Partly cloudy', icon: 'partly-sunny' };
  if (code === 3) return { text: 'Overcast', icon: 'cloud' };
  if (code <= 48) return { text: 'Foggy', icon: 'cloudy' };
  if (code <= 57) return { text: 'Drizzle', icon: 'rainy' };
  if (code <= 67) return { text: 'Rain', icon: 'rainy' };
  if (code <= 77) return { text: 'Snow', icon: 'snow' };
  if (code <= 82) return { text: 'Showers', icon: 'rainy' };
  if (code <= 86) return { text: 'Snow showers', icon: 'snow' };
  return { text: 'Thunderstorm', icon: 'thunderstorm' };
};

async function getWeather(lat, lng) {
  const key = `wx:${lat.toFixed(1)},${lng.toFixed(1)}`;
  return cached(key, 30 * 60 * 1000, async () => {
    const { data } = await http.get('https://api.open-meteo.com/v1/forecast', {
      params: { latitude: lat, longitude: lng, current: 'temperature_2m,weather_code,is_day,apparent_temperature', daily: 'temperature_2m_max,temperature_2m_min', timezone: 'auto' },
    });
    const w = WMO(data.current.weather_code);
    return {
      temp: Math.round(data.current.temperature_2m),
      feels: Math.round(data.current.apparent_temperature),
      min: Math.round(data.daily.temperature_2m_min[0]),
      max: Math.round(data.daily.temperature_2m_max[0]),
      isDay: !!data.current.is_day,
      text: w.text,
      icon: w.icon,
    };
  });
}

async function getPrayer(lat, lng) {
  const key = `pray:${lat.toFixed(1)},${lng.toFixed(1)}:${new Date().toISOString().slice(0, 10)}`;
  return cached(key, 6 * 60 * 60 * 1000, async () => {
    const { data } = await http.get('https://api.aladhan.com/v1/timings', { params: { latitude: lat, longitude: lng, method: 1 } });
    const t = data.data.timings;
    return { Fajr: t.Fajr, Dhuhr: t.Dhuhr, Asr: t.Asr, Maghrib: t.Maghrib, Isha: t.Isha, hijri: data.data.date?.hijri ? `${data.data.date.hijri.day} ${data.data.date.hijri.month.en} ${data.data.date.hijri.year}` : '' };
  });
}

async function getRates() {
  return cached('fx', 60 * 60 * 1000, async () => {
    const { data } = await http.get('https://open.er-api.com/v6/latest/USD');
    const r = data.rates || {};
    return { usdBdt: r.BDT ? Number(r.BDT.toFixed(2)) : null, eurBdt: r.BDT && r.EUR ? Number((r.BDT / r.EUR).toFixed(2)) : null, gbpBdt: r.BDT && r.GBP ? Number((r.BDT / r.GBP).toFixed(2)) : null };
  });
}

async function getCrypto() {
  return cached('crypto', 10 * 60 * 1000, async () => {
    const { data } = await http.get('https://api.coingecko.com/api/v3/simple/price', { params: { ids: 'bitcoin,ethereum', vs_currencies: 'usd', include_24hr_change: true } });
    return { btc: { price: data.bitcoin?.usd, change: data.bitcoin?.usd_24h_change }, eth: { price: data.ethereum?.usd, change: data.ethereum?.usd_24h_change } };
  });
}

async function getSpacePic() {
  return cached(`apod:${new Date().toISOString().slice(0, 10)}`, 6 * 60 * 60 * 1000, async () => {
    const { data } = await http.get('https://api.nasa.gov/planetary/apod', { params: { api_key: process.env.NASA_API_KEY || 'DEMO_KEY' } });
    if (data.media_type !== 'image') return null;
    return { title: data.title, image: data.url, credit: data.copyright ? String(data.copyright).trim() : 'NASA', url: `https://apod.nasa.gov/apod/astropix.html` };
  });
}

async function getOnThisDay() {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return cached(`otd:${mm}-${dd}`, 12 * 60 * 60 * 1000, async () => {
    const { data } = await http.get(`https://api.wikimedia.org/feed/v1/wikipedia/en/onthisday/events/${mm}/${dd}`);
    const ev = (data.events || []).filter((e) => e.text && e.year);
    // pick a notable-looking one: with a linked page + thumbnail, deterministic per day
    const withPic = ev.filter((e) => e.pages?.[0]?.thumbnail?.source);
    const pool = withPic.length ? withPic : ev;
    if (!pool.length) return null;
    const e = pool[(d.getDate() * 7 + d.getMonth()) % Math.min(pool.length, 20)];
    const page = e.pages?.[0];
    return { year: e.year, text: e.text.slice(0, 220), image: page?.thumbnail?.source || null, url: page?.content_urls?.mobile?.page || page?.content_urls?.desktop?.page || null };
  });
}

async function getWidgets({ lat, lng }) {
  const [weather, prayer, rates, crypto, space, onThisDay] = await Promise.all([
    getWeather(lat, lng).catch(() => null),
    getPrayer(lat, lng).catch(() => null),
    getRates().catch(() => null),
    getCrypto().catch(() => null),
    getSpacePic().catch(() => null),
    getOnThisDay().catch(() => null),
  ]);
  return { weather, prayer, rates, crypto, space, onThisDay };
}

module.exports = { getArticles, getWidgets, VALID_CATEGORIES };
