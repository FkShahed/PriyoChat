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
  return /^https?:\/\//i.test(img) ? fixImage(img) : null;
}

// Make picture links better before they reach the app: https only, bigger versions of tiny thumbnails
function fixImage(u) {
  let x = String(u || '').trim();
  if (!x) return null;
  x = x.replace(/^http:\/\//i, 'https://');
  x = x.replace(/(\/ace\/(?:standard|ws)\/)(\d{2,3})(\/)/i, (m, a, n, c) => (parseInt(n, 10) < 800 ? a + '800' + c : m)); // BBC: 240px -> 800px
  x = x.replace(/-(\d{2,4})x(\d{2,4})(\.(?:jpe?g|png|webp))(\?.*)?$/i, (m, w, h, ext, q) => (parseInt(w, 10) < 700 ? ext + (q || '') : m)); // WordPress: ...-300x220.jpg -> ...jpg
  return x;
}

// Feeds that carry no picture (ScienceDaily, TechCrunch, Hacker News links): read the page's og:image for the newest few
async function addMissingImages(items, max = 10) {
  const need = items.filter((i) => !i.image).slice(0, max);
  await Promise.all(need.map(async (i) => {
    try {
      const { data } = await axios.get(i.url, {
        timeout: 6000, maxRedirects: 4, responseType: 'text', transformResponse: (r) => r, maxContentLength: 600 * 1024,
        headers: { 'User-Agent': 'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 Chrome/120 Mobile Safari/537.36' },
        validateStatus: (s) => s >= 200 && s < 300,
      });
      const head = String(data).slice(0, 80000);
      const m = head.match(/<meta[^>]+(?:property|name)=["'](?:og:image|twitter:image)["'][^>]*content=["']([^"']+)["']/i)
        || head.match(/<meta[^>]+content=["']([^"']+)["'][^>]*(?:property|name)=["'](?:og:image|twitter:image)["']/i);
      if (m) {
        let u = decode(m[1]);
        if (u.startsWith('//')) u = 'https:' + u;
        else if (u.startsWith('/')) { try { u = new URL(u, i.url).href; } catch (e) { u = ''; } }
        if (/^https?:\/\//i.test(u)) i.image = fixImage(u);
      }
    } catch (e) { /* no picture for this one */ }
  }));
  return items;
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
  // medical science
  sdmed: { name: 'ScienceDaily Medicine', url: 'https://www.sciencedaily.com/rss/health_medicine.xml', lang: 'en' },
  stat: { name: 'STAT News', url: 'https://www.statnews.com/feed/', lang: 'en' },
  guardianhealth: { name: 'The Guardian Health', url: 'https://www.theguardian.com/society/health/rss', lang: 'en' },
  // women & beauty
  bazaar: { name: "Harper's Bazaar", url: 'https://www.harpersbazaar.com/rss/all.xml/', lang: 'en' },
  elle: { name: 'ELLE', url: 'https://www.elle.com/rss/all.xml/', lang: 'en' },
  guardianwomen: { name: 'The Guardian Women', url: 'https://www.theguardian.com/lifeandstyle/women/rss', lang: 'en' },
  guardianfashion: { name: 'The Guardian Fashion', url: 'https://www.theguardian.com/fashion/rss', lang: 'en' },
  // engineering, chips, electronics, AI
  ieee: { name: 'IEEE Spectrum', url: 'https://spectrum.ieee.org/feeds/feed.rss', lang: 'en' },
  inteng: { name: 'Interesting Engineering', url: 'https://interestingengineering.com/feed', lang: 'en' },
  sdeng: { name: 'ScienceDaily Engineering', url: 'https://www.sciencedaily.com/rss/matter_energy/engineering.xml', lang: 'en' },
  semieng: { name: 'Semiconductor Engineering', url: 'https://semiengineering.com/feed/', lang: 'en' },
  eetimes: { name: 'EE Times', url: 'https://www.eetimes.com/feed/', lang: 'en' },
  sdelec: { name: 'ScienceDaily Electronics', url: 'https://www.sciencedaily.com/rss/matter_energy/electronics.xml', lang: 'en' },
  sdnano: { name: 'ScienceDaily Nanotech', url: 'https://www.sciencedaily.com/rss/matter_energy/nanotechnology.xml', lang: 'en' },
  hackaday: { name: 'Hackaday', url: 'https://hackaday.com/blog/feed/', lang: 'en' },
  mitreview: { name: 'MIT Technology Review', url: 'https://www.technologyreview.com/feed/', lang: 'en' },
  guardianai: { name: 'The Guardian AI', url: 'https://www.theguardian.com/technology/artificialintelligenceai/rss', lang: 'en' },
  sdrobot: { name: 'ScienceDaily Robotics', url: 'https://www.sciencedaily.com/rss/computers_math/robotics.xml', lang: 'en' },
  // more medical
  medxpress: { name: 'Medical Xpress', url: 'https://medicalxpress.com/rss-feed/', lang: 'en' },
  sdheart: { name: 'ScienceDaily Heart Disease', url: 'https://www.sciencedaily.com/rss/health_medicine/heart_disease.xml', lang: 'en' },
  sdcancer: { name: 'ScienceDaily Cancer', url: 'https://www.sciencedaily.com/rss/health_medicine/cancer.xml', lang: 'en' },
  sdmental: { name: 'ScienceDaily Mental Health', url: 'https://www.sciencedaily.com/rss/mind_brain/mental_health.xml', lang: 'en' },
  sdnutri: { name: 'ScienceDaily Nutrition', url: 'https://www.sciencedaily.com/rss/health_medicine/nutrition.xml', lang: 'en' },
  healthline: { name: 'Healthline', url: 'https://www.healthline.com/rss/health-news', lang: 'en' },
  sdpreg: { name: 'ScienceDaily Pregnancy & Childbirth', url: 'https://www.sciencedaily.com/rss/health_medicine/pregnancy_and_childbirth.xml', lang: 'en' },
  // more women & beauty
  allure: { name: 'Allure', url: 'https://www.allure.com/feed/rss', lang: 'en' },
  sdskin: { name: 'ScienceDaily Skin Care', url: 'https://www.sciencedaily.com/rss/health_medicine/skin_care.xml', lang: 'en' },
  vogue: { name: 'Vogue', url: 'https://www.vogue.com/feed/rss', lang: 'en' },
  womenshealth: { name: "Women's Health", url: 'https://www.womenshealthmag.com/rss/all.xml/', lang: 'en' },
  // space picture of the day
  nasaiotd: { name: 'NASA', url: 'https://www.nasa.gov/feeds/iotd-feed/', lang: 'en' },
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
  medical: { en: ['sdmed', 'stat', 'guardianhealth'], bn: [] },
  beauty: { en: ['bazaar', 'elle', 'guardianwomen', 'guardianfashion'], bn: [] },
  // engineering and chips
  engineering: { en: ['ieee', 'inteng', 'sdeng'], bn: [] },
  semiconductor: { en: ['semieng', 'eetimes', 'sdnano'], bn: [] },
  electronics: { en: ['hackaday', 'sdelec', 'eetimes'], bn: [] },
  ai: { en: ['mitreview', 'guardianai', 'sdrobot'], bn: [] },
  // medical, in more detail
  medresearch: { en: ['medxpress', 'sdmed'], bn: [] },
  cardiology: { en: ['sdheart', 'medxpress'], bn: [] },
  cancer: { en: ['sdcancer', 'medxpress'], bn: [] },
  mentalhealth: { en: ['sdmental', 'healthline'], bn: [] },
  nutrition: { en: ['sdnutri', 'healthline'], bn: [] },
  // women and beauty, in more detail
  skincare: { en: ['allure', 'sdskin'], bn: [] },
  fashion: { en: ['vogue', 'guardianfashion', 'bazaar'], bn: [] },
  womenhealth: { en: ['womenshealth', 'sdpreg', 'guardianwomen'], bn: [] },
  pregnancy: { en: ['sdpreg', 'healthline'], bn: [] },
};
const VALID_CATEGORIES = Object.keys(CATEGORY_SOURCES);

async function loadRss(id) {
  const s = RSS[id];
  return cached(`rss:${id}`, 15 * 60 * 1000, async () => {
    const { data } = await http.get(s.url, { responseType: 'text', transformResponse: (r) => r });
    const list = parseRss(data, s.base).map((i) => ({ ...i, source: s.name, lang: s.lang }));
    return addMissingImages(list, 10); // feeds without pictures get the page's own picture (cached with the feed)
  });
}

// A topic the reader typed in themselves: Bing News search as RSS (direct links, pictures, source names; English and Bangla)
const cleanTerm = (t) => String(t || '').replace(/[\u0000-\u001f<>]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 40);
const hasBangla = (t) => /[ঀ-৿]/.test(t);
async function loadCustom(term) {
  const bn = hasBangla(term);
  return cached(`custom:${term.toLowerCase()}`, 15 * 60 * 1000, async () => {
    const { data } = await http.get('https://www.bing.com/news/search', {
      params: { q: term, format: 'rss', setmkt: bn ? 'bn-BD' : 'en-US' },
      responseType: 'text', transformResponse: (r) => r,
    });
    const out = [];
    const re = /<item>[\s\S]*?<\/item>/gi;
    let m;
    while ((m = re.exec(data)) && out.length < 30) {
      const b = m[0];
      const title = stripTags(tag(b, 'title'));
      let link = stripTags(tag(b, 'link'));
      const real = link.match(/[?&]url=([^&]+)/i); // Bing wraps the real address in its click link
      if (real) { try { link = decodeURIComponent(real[1]); } catch (e) { /* keep Bing link */ } }
      if (!title || !/^https?:\/\//i.test(link)) continue;
      let image = stripTags(tag(b, 'News:Image'));
      if (image) image = fixImage(image) + (/[?&]w=/.test(image) ? '' : '&w=600&h=400&c=7');
      const date = new Date(stripTags(tag(b, 'pubDate')) || Date.now());
      const summary = stripTags(tag(b, 'description')).slice(0, 220);
      out.push({
        title,
        summary: summary && summary.toLowerCase() !== title.toLowerCase() ? summary : '',
        image: image || null,
        url: link,
        publishedAt: isNaN(date) ? new Date().toISOString() : date.toISOString(),
        source: stripTags(tag(b, 'News:Source')) || 'News',
        lang: bn ? 'bn' : 'en',
      });
    }
    if (cache.size > 800) { for (const k of cache.keys()) { if (k.startsWith('custom:')) { cache.delete(k); break; } } }
    return addMissingImages(out, 8);
  });
}

async function loadHN() {
  return cached('hn', 15 * 60 * 1000, async () => {
    const { data: ids } = await http.get('https://hacker-news.firebaseio.com/v0/topstories.json');
    const top = ids.slice(0, 30);
    const stories = await Promise.all(top.map((id) => http.get(`https://hacker-news.firebaseio.com/v0/item/${id}.json`).then((r) => r.data).catch(() => null)));
    const list = stories
      .filter((s) => s && s.title && s.url)
      .map((s) => ({ title: s.title, summary: `${s.score} points · ${s.descendants || 0} comments on Hacker News`, image: null, url: s.url, publishedAt: new Date(s.time * 1000).toISOString(), source: 'Hacker News', lang: 'en' }));
    return addMissingImages(list, 12);
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

async function getArticles({ interests, custom = [], lang = 'both', page = 1, limit = 24, refresh = false, seed = 0, exclude = [] }) {
  const excluded = new Set(exclude);
  // Pull-to-refresh: mark source caches older than 45s as stale (the old value is kept as a fallback if a source is down)
  if (refresh) {
    const now = Date.now();
    for (const [k, v] of cache.entries()) {
      if (/^(rss:|custom:|hn$|devto$|spaceflight$)/.test(k) && v && now - v.at > 45 * 1000) cache.set(k, { ...v, at: 0 });
    }
  }
  const cats = (interests || []).filter((c) => VALID_CATEGORIES.includes(c));
  // topics the reader typed in themselves (at most 5), shown as "my:<term>"
  const terms = [...new Set((custom || []).map(cleanTerm).filter((t) => t.length >= 2))].slice(0, 5);
  const use = [...cats, ...terms.map((t) => 'my:' + t)];
  if (!use.length) use.push('bangladesh', 'world', 'tech');

  const perCat = await Promise.all(use.map(async (cat) => {
    let lists;
    if (cat.startsWith('my:')) {
      lists = [await loadCustom(cat.slice(3)).catch(() => [])];
    } else {
      const map = CATEGORY_SOURCES[cat];
      let ids = [];
      if (lang === 'bn') ids = map.bn.length ? map.bn : map.en;
      else if (lang === 'en') ids = map.en;
      else ids = [...map.bn, ...map.en];
      lists = await Promise.all(ids.map((id) => loadSource(id).catch(() => [])));
    }
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

// 24 hourly readings of one day from an Open-Meteo response (dayIndex 0 = today at the place)
function hourlyOf(data, dayIndex) {
  const h = data.hourly;
  if (!h || !h.time) return [];
  const start = dayIndex * 24;
  return h.time.slice(start, start + 24).map((t, i) => {
    const j = start + i;
    const wm = WMO(h.weather_code[j]);
    const night = !h.is_day[j];
    let icon = wm.icon;
    if (night && icon === 'sunny') icon = 'moon';
    else if (night && icon === 'partly-sunny') icon = 'cloudy-night';
    return { date: String(t).slice(0, 10), h: parseInt(String(t).slice(11, 13), 10), temp: Math.round(h.temperature_2m[j]), icon, text: wm.text, isDay: !night, rain: h.precipitation_probability[j] || 0 };
  });
}

// Previous 24 h + now + next 24 h (49 readings) with the index of "now" inside the list
async function getHourlyWindow(lat, lng) {
  const key = `hrwin:${lat.toFixed(1)},${lng.toFixed(1)}`;
  return cached(key, 0, async () => {
    const { data } = await http.get('https://api.open-meteo.com/v1/forecast', {
      params: { latitude: lat, longitude: lng, timezone: 'auto', past_days: 1, forecast_days: 3, current: 'temperature_2m', hourly: 'temperature_2m,weather_code,is_day,precipitation_probability' },
    });
    const h = data.hourly;
    const nowKey = String(data.current.time || '').slice(0, 13); // "YYYY-MM-DDTHH"
    const idx = h.time.findIndex((t) => String(t).slice(0, 13) === nowKey);
    if (idx < 0) return null;
    const start = Math.max(0, idx - 24);
    const end = Math.min(h.time.length, idx + 25);
    const hours = h.time.slice(start, end).map((t, i) => {
      const j = start + i;
      const wm = WMO(h.weather_code[j]);
      const night = !h.is_day[j];
      let icon = wm.icon;
      if (night && icon === 'sunny') icon = 'moon';
      else if (night && icon === 'partly-sunny') icon = 'cloudy-night';
      return { date: String(t).slice(0, 10), h: parseInt(String(t).slice(11, 13), 10), temp: Math.round(h.temperature_2m[j]), icon, text: wm.text, isDay: !night, rain: h.precipitation_probability[j] || 0 };
    });
    return { hours, nowIndex: idx - start };
  });
}

async function getWeather(lat, lng) {
  const key = `wx:${lat.toFixed(1)},${lng.toFixed(1)}`;
  return cached(key, 5 * 60 * 1000, async () => {
    const { data } = await http.get('https://api.open-meteo.com/v1/forecast', {
      params: { latitude: lat, longitude: lng, current: 'temperature_2m,weather_code,is_day,apparent_temperature', daily: 'temperature_2m_max,temperature_2m_min,weather_code,precipitation_probability_max', hourly: 'temperature_2m,weather_code,is_day,precipitation_probability', timezone: 'auto', forecast_days: 6 },
    });
    const w = WMO(data.current.weather_code);
    const win = await getHourlyWindow(lat, lng).catch(() => null);
    const hourly = win ? win.hours : hourlyOf(data, 0);
    const nowHour = parseInt(String(data.current.time || '').slice(11, 13), 10);
    // today + the next 4 days for the forecast strip (index 0 is today)
    const forecast = data.daily.time.slice(0, 5).map((date, i) => ({
      date,
      today: i === 0,
      icon: WMO(data.daily.weather_code[i]).icon,
      text: WMO(data.daily.weather_code[i]).text,
      max: Math.round(data.daily.temperature_2m_max[i]),
      min: Math.round(data.daily.temperature_2m_min[i]),
      rain: Math.round(data.daily.precipitation_probability_max[i] || 0),
    }));
    return {
      temp: Math.round(data.current.temperature_2m),
      feels: Math.round(data.current.apparent_temperature),
      min: Math.round(data.daily.temperature_2m_min[0]),
      max: Math.round(data.daily.temperature_2m_max[0]),
      isDay: !!data.current.is_day,
      text: w.text,
      icon: w.icon,
      forecast,
      hourly,
      nowIndex: win ? win.nowIndex : null,
      nowHour: Number.isFinite(nowHour) ? nowHour : null,
    };
  });
}

async function getWeatherFull(lat, lng) {
  const key = `wxfull:${lat.toFixed(1)},${lng.toFixed(1)}`;
  return cached(key, 5 * 60 * 1000, async () => {
    const { data } = await http.get('https://api.open-meteo.com/v1/forecast', {
      params: {
        latitude: lat, longitude: lng, timezone: 'auto', forecast_days: 7,
        current: 'temperature_2m,apparent_temperature,weather_code,is_day,relative_humidity_2m,wind_speed_10m',
        hourly: 'temperature_2m,weather_code,is_day,precipitation_probability',
        daily: 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,precipitation_sum,sunrise,sunset,uv_index_max,wind_speed_10m_max',
      },
    });
    const c = data.current;
    const w = WMO(c.weather_code);
    const d = data.daily;
    const daily = d.time.map((date, i) => {
      const wm = WMO(d.weather_code[i]);
      return {
        date, icon: wm.icon, text: wm.text,
        max: Math.round(d.temperature_2m_max[i]), min: Math.round(d.temperature_2m_min[i]),
        rain: d.precipitation_probability_max[i] || 0, rainMm: Math.round((d.precipitation_sum[i] || 0) * 10) / 10,
        sunrise: String(d.sunrise[i]).slice(11, 16), sunset: String(d.sunset[i]).slice(11, 16),
        uv: Math.round((d.uv_index_max[i] || 0) * 10) / 10, wind: Math.round(d.wind_speed_10m_max[i] || 0),
      };
    });
    const nowHour = parseInt(String(c.time || '').slice(11, 13), 10);
    const win = await getHourlyWindow(lat, lng).catch(() => null);
    return {
      current: { temp: Math.round(c.temperature_2m), feels: Math.round(c.apparent_temperature), text: w.text, icon: w.icon, isDay: !!c.is_day, humidity: Math.round(c.relative_humidity_2m), wind: Math.round(c.wind_speed_10m) },
      nowHour: Number.isFinite(nowHour) ? nowHour : null,
      hourly: win ? win.hours : hourlyOf(data, 0),
      nowIndex: win ? win.nowIndex : null,
      daily,
    };
  });
}

async function getPrayer(lat, lng) {
  const key = `pray:${lat.toFixed(1)},${lng.toFixed(1)}:${todayKey()}`;
  return cached(key, 6 * 60 * 60 * 1000, async () => {
    const { data } = await http.get('https://api.aladhan.com/v1/timings', { params: { latitude: lat, longitude: lng, method: 1 } });
    const t = data.data.timings;
    return { Fajr: t.Fajr, Dhuhr: t.Dhuhr, Asr: t.Asr, Maghrib: t.Maghrib, Isha: t.Isha, hijri: data.data.date?.hijri ? `${data.data.date.hijri.day} ${data.data.date.hijri.month.en} ${data.data.date.hijri.year}` : '' };
  });
}

// ── prayer times for the next N days (Aladhan, method 1 like the Feed card), day 0 = today in Dhaka ──
const cleanTime = (t) => String(t || '').split(' ')[0]; // "05:12 (+06)" -> "05:12"

async function getPrayerWeek(lat, lng, days = 7) {
  const n = Math.min(10, Math.max(1, parseInt(days, 10) || 7));
  const key = `prayweek:${lat.toFixed(1)},${lng.toFixed(1)}:${todayKey()}:${n}`;
  return cached(key, 6 * 60 * 60 * 1000, async () => {
    const base = Date.now() + 6 * 3600 * 1000; // Dhaka wall clock
    const jobs = [];
    for (let i = 0; i < n; i++) {
      const d = new Date(base + i * 86400000);
      const dd = String(d.getUTCDate()).padStart(2, '0');
      const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
      const yyyy = d.getUTCFullYear();
      const iso = `${yyyy}-${mm}-${dd}`;
      jobs.push(
        http.get(`https://api.aladhan.com/v1/timings/${dd}-${mm}-${yyyy}`, { params: { latitude: lat, longitude: lng, method: 1 }, timeout: 10000 })
          .then(({ data }) => {
            const t = data.data.timings;
            const h = data.data.date && data.data.date.hijri;
            return {
              date: iso,
              weekday: d.toLocaleDateString('en-US', { weekday: 'long', timeZone: 'UTC' }),
              Fajr: cleanTime(t.Fajr), Sunrise: cleanTime(t.Sunrise), Dhuhr: cleanTime(t.Dhuhr), Asr: cleanTime(t.Asr),
              Sunset: cleanTime(t.Sunset), Maghrib: cleanTime(t.Maghrib), Isha: cleanTime(t.Isha),
              hijri: h ? `${h.day} ${h.month.en} ${h.year}` : '',
            };
          })
          .catch(() => null)
      );
    }
    const list = (await Promise.all(jobs)).filter(Boolean);
    if (!list.length) throw new Error('prayer times unavailable');
    return list;
  });
}

// ── tafsir of one ayah (Quran.com API): Bengali "Tafseer ibn Kathir" (Tawheed Publication) and English Ibn Kathir (abridged) ──
// The text explains the verse, its background and the verses around it. Cached for a week per verse.
const PARA = String.fromCharCode(10) + String.fromCharCode(10); // a blank line between paragraphs
const tafsirText = (html) => String(html || '')
  .replace(/\(আরবি\)/g, '')
  .replace(/<\/p>|<br\s*\/?>|<\/h\d>|<\/div>|<\/li>|<\/b>/gi, PARA)
  .split(PARA).map((x) => stripTags(x)).filter(Boolean).join(PARA);

async function getTafsir(ref) {
  if (!/^\d{1,3}:\d{1,3}$/.test(String(ref || ''))) throw new Error('bad ref');
  return cached(`tafsir:${ref}`, 7 * 24 * 60 * 60 * 1000, async () => {
    const pull = (id) => http.get(`https://api.quran.com/api/v4/tafsirs/${id}/by_ayah/${ref}`, { timeout: 15000 })
      .then((r) => (r.data && r.data.tafsir) || null).catch(() => null);
    const [bn, en] = await Promise.all([pull(164), pull(169)]);
    const shape = (t, name, source) => (t && t.text ? { name, source, text: tafsirText(t.text) } : null);
    const out = {
      ref,
      bn: shape(bn, 'তাফসীর ইবনে কাছীর', 'Tawheed Publication'),
      en: shape(en, 'Tafsir Ibn Kathir (abridged)', 'Darussalam'),
    };
    if (!out.bn && !out.en) throw new Error('tafsir unavailable');
    return out;
  });
}

async function getRates() {
  return cached('fx', 60 * 60 * 1000, async () => {
    const { data } = await http.get('https://open.er-api.com/v6/latest/USD');
    const r = data.rates || {};
    // more currencies for the Markets tab: how many taka one unit of each costs (the old three fields stay as they were)
    const WANT = ['USD', 'EUR', 'GBP', 'INR', 'SAR', 'AED', 'KWD', 'QAR', 'MYR', 'SGD', 'JPY', 'CNY', 'CAD', 'AUD', 'CHF'];
    const list = r.BDT ? WANT.filter((c) => r[c]).map((c) => ({ code: c, bdt: Number((r.BDT / r[c]).toFixed(c === 'JPY' || c === 'INR' ? 3 : 2)) })) : [];
    return { usdBdt: r.BDT ? Number(r.BDT.toFixed(2)) : null, eurBdt: r.BDT && r.EUR ? Number((r.BDT / r.EUR).toFixed(2)) : null, gbpBdt: r.BDT && r.GBP ? Number((r.BDT / r.GBP).toFixed(2)) : null, list };
  });
}

async function getCrypto() {
  return cached('crypto', 5 * 60 * 1000, async () => {
    const { data } = await http.get('https://api.coingecko.com/api/v3/simple/price', { params: { ids: 'bitcoin,ethereum,binancecoin,solana,ripple,dogecoin,cardano,tron,toncoin,litecoin', vs_currencies: 'usd', include_24hr_change: true } });
    const COINS = [['BTC', 'bitcoin'], ['ETH', 'ethereum'], ['BNB', 'binancecoin'], ['SOL', 'solana'], ['XRP', 'ripple'], ['DOGE', 'dogecoin'], ['ADA', 'cardano'], ['TRX', 'tron'], ['TON', 'toncoin'], ['LTC', 'litecoin']];
    const list = COINS.filter(([, id]) => data[id]?.usd != null).map(([sym, id]) => ({ sym, price: data[id].usd, change: data[id].usd_24h_change }));
    return { btc: { price: data.bitcoin?.usd, change: data.bitcoin?.usd_24h_change }, eth: { price: data.ethereum?.usd, change: data.ethereum?.usd_24h_change }, list };
  });
}

// NASA "Image of the Day" (reliable RSS; the APOD API is often rate-limited)
async function getSpacePic() {
  return cached('space-iotd', 6 * 60 * 60 * 1000, async () => {
    const items = await loadRss('nasaiotd');
    const it = items.find((i) => i.image) || null;
    if (!it) return null;
    return { title: it.title, caption: it.summary || '', image: it.image, credit: 'NASA', url: it.url, publishedAt: it.publishedAt };
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
    // prefer real photos over flag/logo SVG renders
    const isPhoto = (e) => { const t = e.pages?.[0]?.thumbnail?.source; return !!t && !/.svg/i.test(t); };
    const withPic = ev.filter(isPhoto);
    const pool = withPic.length ? withPic : ev;
    if (!pool.length) return null;
    const e = pool[(d.getDate() * 7 + d.getMonth()) % Math.min(pool.length, 20)];
    const page = e.pages?.[0];
    return { year: e.year, text: e.text.slice(0, 220), image: page?.thumbnail?.source || null, url: page?.content_urls?.mobile?.page || page?.content_urls?.desktop?.page || null };
  });
}

// ── new info widgets ───────────────────────────────────────────────────
// One request serves both the air-quality card and the dust card
async function getAirQuality(lat, lng) {
  const key = `airq:${lat.toFixed(1)},${lng.toFixed(1)}`;
  return cached(key, 20 * 60 * 1000, async () => {
    const { data } = await http.get('https://air-quality-api.open-meteo.com/v1/air-quality', {
      params: { latitude: lat, longitude: lng, current: 'us_aqi,pm2_5,pm10,dust,ozone' }, timeout: 9000,
    });
    return data.current;
  });
}

async function getAqi(lat, lng) {
  const key = `aqi:${lat.toFixed(1)},${lng.toFixed(1)}`;
  return cached(key, 20 * 60 * 1000, async () => {
    const cur = await getAirQuality(lat, lng);
    const aqi = Math.round(cur.us_aqi);
    const pm25 = Math.round(cur.pm2_5 * 10) / 10;
    let level, color, advice;
    if (aqi <= 50) { level = 'Good'; color = '#16A34A'; advice = 'Clean air'; }
    else if (aqi <= 100) { level = 'Moderate'; color = '#CA8A04'; advice = 'Okay for most'; }
    else if (aqi <= 150) { level = 'Unhealthy'; color = '#EA580C'; advice = 'Limit time outside'; }
    else if (aqi <= 200) { level = 'Bad'; color = '#DC2626'; advice = 'Wear a mask'; }
    else if (aqi <= 300) { level = 'Severe'; color = '#9333EA'; advice = 'Stay indoors'; }
    else { level = 'Hazardous'; color = '#7F1D1D'; advice = 'Avoid going out'; }
    return { aqi, pm25, level, color, advice };
  });
}

async function getQuakes(lat, lng) {
  const key = `quake:${lat.toFixed(0)},${lng.toFixed(0)}`;
  return cached(key, 10 * 60 * 1000, async () => {
    const start = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString().slice(0, 10);
    const { data } = await http.get('https://earthquake.usgs.gov/fdsnws/event/1/query', {
      params: { format: 'geojson', minmagnitude: 3.5, latitude: lat, longitude: lng, maxradiuskm: 1500, orderby: 'time', limit: 3, starttime: start },
    });
    const toRad = (x) => (x * Math.PI) / 180;
    return (data.features || []).map((f) => {
      const [lo, la] = f.geometry.coordinates;
      const dLat = toRad(la - lat), dLon = toRad(lo - lng);
      const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat)) * Math.cos(toRad(la)) * Math.sin(dLon / 2) ** 2;
      const km = Math.round(6371 * 2 * Math.asin(Math.sqrt(h)));
      return { mag: f.properties.mag, place: f.properties.place, time: new Date(f.properties.time).toISOString(), km, url: f.properties.url };
    });
  });
}

async function getQuakesFull(lat, lng) {
  const key = `quakes-full:${lat.toFixed(0)},${lng.toFixed(0)}`;
  return cached(key, 10 * 60 * 1000, async () => {
    const start = new Date(Date.now() - 14 * 24 * 3600 * 1000).toISOString().slice(0, 10);
    const { data } = await http.get('https://earthquake.usgs.gov/fdsnws/event/1/query', {
      params: { format: 'geojson', minmagnitude: 3.0, latitude: lat, longitude: lng, maxradiuskm: 1500, orderby: 'time', limit: 25, starttime: start },
    });
    const toRad = (x) => (x * Math.PI) / 180;
    return (data.features || []).map((f) => {
      const [lo, la, depth] = f.geometry.coordinates;
      const dLat = toRad(la - lat), dLon = toRad(lo - lng);
      const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat)) * Math.cos(toRad(la)) * Math.sin(dLon / 2) ** 2;
      const km = Math.round(6371 * 2 * Math.asin(Math.sqrt(h)));
      return { mag: f.properties.mag, place: f.properties.place, time: new Date(f.properties.time).toISOString(), km, depth: Math.round(depth || 0), url: f.properties.url };
    });
  });
}

// Simple weather warnings from the 2-day forecast
async function getWeatherAlerts(lat, lng) {
  const key = `wxalert:${lat.toFixed(1)},${lng.toFixed(1)}`;
  return cached(key, 15 * 60 * 1000, async () => {
    const { data } = await http.get('https://api.open-meteo.com/v1/forecast', {
      params: { latitude: lat, longitude: lng, daily: 'precipitation_probability_max,precipitation_sum,wind_speed_10m_max,uv_index_max,temperature_2m_max,temperature_2m_min', timezone: 'auto', forecast_days: 2 },
    });
    const d = data.daily;
    const alerts = [];
    const days = ['Today', 'Tomorrow'];
    for (let i = 0; i < 2; i++) {
      const when = days[i];
      if (d.precipitation_sum[i] >= 30 || d.precipitation_probability_max[i] >= 85) alerts.push({ level: 'warn', icon: 'rainy', title: `Heavy rain likely · ${when}`, text: `Up to ${Math.round(d.precipitation_sum[i])} mm expected. Carry an umbrella and watch for waterlogging.` });
      else if (d.precipitation_probability_max[i] >= 65) alerts.push({ level: 'info', icon: 'rainy', title: `Rain expected · ${when}`, text: `${d.precipitation_probability_max[i]}% chance of rain.` });
      if (d.wind_speed_10m_max[i] >= 45) alerts.push({ level: 'warn', icon: 'flag', title: `Strong winds · ${when}`, text: `Gusts up to ${Math.round(d.wind_speed_10m_max[i])} km/h. Secure loose items.` });
      if (d.temperature_2m_max[i] >= 37) alerts.push({ level: 'warn', icon: 'sunny', title: `Heat warning · ${when}`, text: `Up to ${Math.round(d.temperature_2m_max[i])}°C. Drink plenty of water and avoid midday sun.` });
      if (d.temperature_2m_min[i] <= 10) alerts.push({ level: 'info', icon: 'snow', title: `Cold weather · ${when}`, text: `Down to ${Math.round(d.temperature_2m_min[i])}°C. Keep warm.` });
      if (d.uv_index_max[i] >= 8) alerts.push({ level: 'info', icon: 'sunny', title: `Very high UV · ${when}`, text: 'Use sunscreen and cover up around noon.' });
    }
    return alerts.slice(0, 3);
  });
}

// Today's cricket + big football matches (TheSportsDB public test key)
const BIG_LEAGUES = /premier league|la liga|bundesliga|serie a|ligue 1|champions league|europa league|world cup|euro|copa|afc|saff|bpl|bangladesh|fifa|uefa/i;
async function getMatchesFallback() {
  const day = todayKey(); // Dhaka calendar day
  return cached(`matches-fb:${day}`, 20 * 60 * 1000, async () => {
    const pull = async (sport) => {
      try {
        const { data } = await http.get('https://www.thesportsdb.com/api/v1/json/123/eventsday.php', { params: { d: day, s: sport } });
        return data.events || [];
      } catch { return []; }
    };
    const [cricket, soccer] = await Promise.all([pull('Cricket'), pull('Soccer')]);
    const shape = (e, sport) => {
      const st = String(e.strStatus || '');
      const state = /^(FT|AET|PEN|Match Finished|Finished)/i.test(st) ? 'final' : (!st || /^(NS|Not Started|TBD)$/i.test(st)) ? 'upcoming' : 'live';
      return {
        sport, league: e.strLeague, state, status: st, time: e.strTimestamp ? e.strTimestamp + 'Z' : null,
        home: e.strHomeTeam, away: e.strAwayTeam,
        homeScore: e.intHomeScore != null ? String(e.intHomeScore) : '', awayScore: e.intAwayScore != null ? String(e.intAwayScore) : '',
        homeWinner: false, awayWinner: false,
        homeLogo: e.strHomeTeamBadge || '', awayLogo: e.strAwayTeamBadge || '',
      };
    };
    const c = cricket.filter((e) => e.strHomeTeam && e.strAwayTeam).map((e) => shape(e, 'cricket')).slice(0, 4);
    const f = soccer.filter((e) => e.strHomeTeam && e.strAwayTeam && BIG_LEAGUES.test(e.strLeague || '')).map((e) => shape(e, 'football')).slice(0, 4);
    return [...c, ...f];
  });
}

// Live scores, final results and today's fixtures for cricket + football (ESPN's public scoreboard feed, no key).
// Cached for only 60 s so a live score is never more than about a minute old.
const ESPN_HEADER = (sport) => `https://site.web.api.espn.com/apis/personalized/v2/scoreboard/header?sport=${sport}&region=in&lang=en`;
const CRICKET_MAJOR = /international|odi|t20|test|world cup|icc|bpl|bangladesh|ipl|asia cup|champions trophy|tour of|big bash|series|premier league/i;
const MATCH_ORDER = { live: 0, final: 1, upcoming: 2 };

function shapeEspnEvent(sport, league, e, leagueKey) {
  const type = (e.fullStatus && e.fullStatus.type) || {};
  if (/postpone|cancel|abandon|suspend|delay|walkover/i.test(`${type.name || ''} ${type.description || ''}`)) return null;
  const comps = e.competitors || [];
  if (comps.length < 2) return null;
  const home = comps.find((c) => c.homeAway === 'home') || comps[0];
  const away = comps.find((c) => c.homeAway === 'away') || comps[1];
  const state = type.state === 'in' ? 'live' : type.state === 'post' ? 'final' : 'upcoming';
  let status = type.shortDetail || type.detail || '';
  if (sport === 'cricket') {
    status = state === 'live' ? (e.summary && !/^(in|live)$/i.test(e.summary) ? `Live · ${e.summary}` : 'Live') : state === 'final' ? 'Final' : '';
  }
  return {
    id: e.id, sport, league, leagueKey: leagueKey || '', state, status, time: e.date,
    home: home.displayName || home.name || '', away: away.displayName || away.name || '',
    homeScore: home.score != null ? String(home.score) : '', awayScore: away.score != null ? String(away.score) : '',
    homeWinner: !!home.winner, awayWinner: !!away.winner,
    homeLogo: home.logo || '', awayLogo: away.logo || '',
  };
}

async function pullEspn(sport, ymd) {
  const { data } = await http.get(ESPN_HEADER(sport) + (ymd ? '&dates=' + ymd : ''), { timeout: 12000 });
  const leagues = (data && data.sports && data.sports[0] && data.sports[0].leagues) || [];
  const rows = [];
  for (const l of leagues) for (const e of (l.events || [])) { const r = shapeEspnEvent(sport, l.name || '', e, sport === 'cricket' ? String(l.id || '') : String(l.slug || '')); if (r) rows.push(r); }
  return rows;
}

// ── one match in detail (ESPN "summary"): score, timeline, stats, line-ups / scorecard, commentary ──
const num = (v) => { const n = parseFloat(v); return Number.isFinite(n) ? n : 0; };

function shapeMatchDetail(sport, d) {
  const h = (d.header && d.header.competitions && d.header.competitions[0]) || {};
  const type = (h.status && h.status.type) || {};
  const state = type.state === 'in' ? 'live' : type.state === 'post' ? 'final' : 'upcoming';
  const comps = h.competitors || [];
  const teams = comps.map((c) => {
    const t = c.team || {};
    return {
      id: String(t.id || c.id || ''), name: t.displayName || t.name || '', short: t.abbreviation || '',
      logo: t.logo || (t.logos && t.logos[0] && t.logos[0].href) || '',
      color: t.color ? '#' + String(t.color).replace('#', '') : '',
      score: c.score != null ? String(c.score) : '', winner: c.winner === true || c.winner === 'true', homeAway: c.homeAway || '',
      form: c.form || '',
    };
  });
  teams.sort((a, b) => (a.homeAway === 'home' ? -1 : b.homeAway === 'home' ? 1 : 0));
  const venue = (d.gameInfo && d.gameInfo.venue) || {};
  const out = {
    sport, id: String(d.header && d.header.id || ''), state,
    league: (d.header && d.header.league && d.header.league.name) || '',
    status: type.detail || type.shortDetail || '', summary: h.status && h.status.summary || '',
    clock: h.status && h.status.displayClock || '', period: h.status && h.status.period || 0,
    date: h.date || '', teams,
    venue: venue.fullName || '', city: (venue.address && (venue.address.city || '')) || '', attendance: d.gameInfo && d.gameInfo.attendance || 0,
  };
  if (sport === 'cricket') {
    out.innings = comps.map((c) => ({
      team: (c.team && c.team.displayName) || '',
      lines: (c.linescores || []).filter((l) => l.runs != null && (l.runs > 0 || l.overs > 0 || l.wickets > 0)).map((l) => ({
        n: l.period, runs: l.runs, wickets: l.wickets, overs: l.overs, batting: !!l.isBatting && l.isCurrent === 1, text: l.description || '',
      })),
    }));
    const notes = d.notes || [];
    const pick = (t) => (notes.find((n) => n.type === t) || {}).text || '';
    out.info = { toss: pick('toss'), hours: pick('hoursofplay'), days: pick('matchdays'), points: pick('points'), closes: notes.filter((n) => n.type === 'closeofplay').map((n) => n.text).slice(-6) };
    out.cards = (d.matchcards || []).filter((m) => m.headline === 'Batting' || m.headline === 'Bowling').map((m) => ({
      kind: m.headline, team: m.teamName, innings: m.inningsNumber, total: m.total || '', runs: m.runs || '', extras: m.extras || '',
      rows: (m.playerDetails || []).slice(0, 14).map((p) => (m.headline === 'Batting'
        ? { name: p.playerName, how: p.dismissal || '', r: p.runs, b: p.ballsFaced, f: p.fours, s: p.sixes }
        : { name: p.playerName, o: p.overs, m: p.maidens, r: p.conceded, w: p.wickets, e: p.economyRate })),
    }));
  } else {
    // timeline (goals, cards, substitutions), newest last
    const KEEP = /goal|penalty|card|substitution|own-goal|var/i;
    out.events = (d.keyEvents || []).filter((k) => k.type && KEEP.test(k.type.type || k.type.text || '')).slice(-40).map((k) => ({
      min: (k.clock && k.clock.displayValue) || '', kind: k.type.type || '', text: k.shortText || k.text || '',
      teamId: String((k.team && k.team.id) || ''), goal: !!k.scoringPlay,
      who: (k.participants && k.participants[0] && k.participants[0].athlete && k.participants[0].athlete.displayName) || '',
    }));
    const bt = (d.boxscore && d.boxscore.teams) || [];
    const val = (t, name) => { const s = ((t && t.statistics) || []).find((x) => x.name === name); return s ? num(s.displayValue) : null; };
    const homeId = teams[0] && teams[0].id;
    const tHome = bt.find((t) => String(t.team && t.team.id) === homeId) || bt[0];
    const tAway = bt.find((t) => t !== tHome) || bt[1];
    const LIST = [['possessionPct', 'Possession', '%'], ['totalShots', 'Shots', ''], ['shotsOnTarget', 'On target', ''], ['wonCorners', 'Corners', ''], ['foulsCommitted', 'Fouls', ''], ['offsides', 'Offsides', ''], ['yellowCards', 'Yellow cards', ''], ['redCards', 'Red cards', ''], ['saves', 'Saves', '']];
    out.stats = LIST.map(([key, label, unit]) => ({ label, unit, home: val(tHome, key), away: val(tAway, key) })).filter((s) => s.home != null && s.away != null && (s.home + s.away > 0 || s.label === 'Possession'));
    out.lineups = (d.rosters || []).map((r) => ({
      teamId: String((r.team && r.team.id) || ''), team: (r.team && r.team.displayName) || '', homeAway: r.homeAway || '', formation: r.formation || '',
      starters: (r.roster || []).filter((p) => p.starter).map((p) => ({ n: p.jersey || '', name: (p.athlete && (p.athlete.shortName || p.athlete.displayName)) || '', pos: (p.position && p.position.abbreviation) || '' })),
      subs: (r.roster || []).filter((p) => !p.starter).slice(0, 9).map((p) => ({ n: p.jersey || '', name: (p.athlete && (p.athlete.shortName || p.athlete.displayName)) || '', pos: (p.position && p.position.abbreviation) || '' })),
    }));
    out.commentary = (d.commentary || []).slice(-30).reverse().map((c) => ({ min: (c.time && c.time.displayValue) || '', text: c.text || '' })).filter((c) => c.text);
  }
  return out;
}

// ── cricket: the recent balls of the innings in progress (ESPN play-by-play; newest page is the last one) ──
function ballLabel(it) {
  const d = String((it.playType && it.playType.description) || '').toLowerCase();
  const r = num(it.scoreValue);
  if (/out|wicket/.test(d)) return { kind: 'wicket', label: 'W' };
  if (/six/.test(d)) return { kind: 'six', label: '6' };
  if (/four/.test(d)) return { kind: 'four', label: '4' };
  if (/wide/.test(d)) return { kind: 'extra', label: r > 1 ? r + 'wd' : 'wd' };
  if (/no.?ball/.test(d)) return { kind: 'extra', label: r > 1 ? r + 'nb' : 'nb' };
  if (/leg.?bye/.test(d)) return { kind: 'extra', label: r > 1 ? r + 'lb' : 'lb' };
  if (/bye/.test(d)) return { kind: 'extra', label: r > 1 ? r + 'b' : 'b' };
  if (/no run|dot/.test(d) || r === 0) return { kind: 'dot', label: '•' };
  return { kind: 'run', label: String(r) };
}

async function getCricketBalls(leagueKey, id) {
  const base = `https://site.web.api.espn.com/apis/site/v2/sports/cricket/${leagueKey}/playbyplay?event=${id}`;
  const first = (await http.get(base + '&page=1', { timeout: 10000 })).data.commentary || {};
  const count = first.count || 0;
  if (!count) return null;
  const pages = first.pageCount || 1;
  let items = first.items || [];
  if (pages > 1) {
    const last = (await http.get(base + '&page=' + pages, { timeout: 10000 })).data.commentary || {};
    items = last.items || [];
    if (items.length < 20 && pages > 2) {
      const prev = (await http.get(base + '&page=' + (pages - 1), { timeout: 10000 })).data.commentary || {};
      items = [...(prev.items || []), ...items];
    }
  }
  if (!items.length) return null;
  const lastItem = items[items.length - 1];
  const inn = lastItem.innings && lastItem.innings.number;
  const mine = items.filter((x) => !inn || (x.innings && x.innings.number === inn));
  const shape = (x) => {
    const { kind, label } = ballLabel(x);
    return { o: String(x.over && x.over.overs != null ? x.over.overs : ''), over: x.over && x.over.number || 0, kind, label, runs: num(x.scoreValue), text: x.shortText || '' };
  };
  const balls = mine.map(shape);
  // commentary: the latest deliveries with their text, newest first (a wicket also gets the dismissal line)
  const comm = mine.slice(-25).reverse().map((x) => {
    const b = shape(x);
    const det = x.dismissal && x.dismissal.text ? x.dismissal.text : (x.text || '');
    return { o: b.o, kind: b.kind, label: b.label, text: b.text, detail: det };
  });
  // group the last three overs
  const overs = [];
  for (const b of balls) {
    let g = overs[overs.length - 1];
    if (!g || g.over !== b.over) { g = { over: b.over, balls: [], runs: 0, wickets: 0 }; overs.push(g); }
    g.balls.push(b);
    g.runs += b.runs;
    if (b.kind === 'wicket') g.wickets += 1;
  }
  const li = lastItem;
  const bats = (x) => (x && x.athlete && x.athlete.displayName ? { name: x.athlete.shortName || x.athlete.displayName, runs: num(x.runs != null ? x.runs : x.totalRuns), faced: num(x.faced), fours: num(x.fours), sixes: num(x.sixes) } : null);
  return {
    balls: balls.slice(-12),
    comm,
    overs: overs.slice(-3),
    batters: [bats(li.batsman), bats(li.otherBatsman)].filter(Boolean),
    bowler: li.bowler && li.bowler.athlete && li.bowler.athlete.displayName ? { name: li.bowler.athlete.shortName || li.bowler.athlete.displayName, overs: li.bowler.overs, maidens: li.bowler.maidens, runs: li.bowler.conceded, wickets: li.bowler.wickets } : null,
    runRate: li.innings && li.innings.runRate || 0,
    target: li.innings && li.innings.target || 0,
    lastText: li.shortText || '',
  };
}

async function getMatchDetail(sport, leagueKey, id) {
  const sp = sport === 'cricket' ? 'cricket' : 'soccer';
  if (!/^[\w.\-]{1,24}$/.test(String(leagueKey || '')) || !/^\d{3,12}$/.test(String(id || ''))) throw new Error('bad match reference');
  const url = `https://site.web.api.espn.com/apis/site/v2/sports/${sp}/${leagueKey}/summary?event=${id}`;
  // short cache: a live match is never more than ~15 s old, finished or future matches change slowly
  const key = `match:${sp}:${leagueKey}:${id}`;
  const first = await cached(key, 15 * 1000, async () => {
    const { data } = await http.get(url, { timeout: 12000 });
    const out = shapeMatchDetail(sp, data);
    if (sp === 'cricket' && (out.state === 'live' || out.state === 'final')) {
      try { out.live = await getCricketBalls(leagueKey, id); } catch (e) { out.live = null; }
    }
    return out;
  });
  return first;
}

function pickMatches(rows, majorRe, { finalMaxAgeMs, allowOthers, limit }) {
  const now = Date.now();
  const dhakaDay = (ms) => new Date(ms + 6 * 3600 * 1000).toISOString().slice(0, 10);
  const today = dhakaDay(now);
  let list = rows.filter((r) => {
    const t = Date.parse(r.time);
    if (r.state === 'live') return true;
    if (r.state === 'final') return Number.isFinite(t) && now - t < finalMaxAgeMs;
    return Number.isFinite(t) && t > now - 3600 * 1000 && dhakaDay(t) === today; // today's upcoming
  });
  const major = list.filter((r) => majorRe.test(r.league));
  list = major.length ? major : (allowOthers ? list : []);
  list.sort((x, y) => (MATCH_ORDER[x.state] - MATCH_ORDER[y.state]) || (x.state === 'final' ? Date.parse(y.time) - Date.parse(x.time) : Date.parse(x.time) - Date.parse(y.time)));
  return list.slice(0, limit);
}

async function getMatches() {
  return cached('matches-live', 60 * 1000, async () => {
    try {
      const [cricket, soccer] = await Promise.all([pullEspn('cricket').catch(() => []), pullEspn('soccer').catch(() => [])]);
      const c = pickMatches(cricket, CRICKET_MAJOR, { finalMaxAgeMs: 4 * 24 * 3600 * 1000, allowOthers: true, limit: 3 });
      const f = pickMatches(soccer, BIG_LEAGUES, { finalMaxAgeMs: 30 * 3600 * 1000, allowOthers: false, limit: 3 });
      const all = [...c, ...f].sort((x, y) => MATCH_ORDER[x.state] - MATCH_ORDER[y.state]);
      if (all.length) return all;
    } catch (e) { /* fall through to the schedule-only source */ }
    return getMatchesFallback();
  });
}

// ── sun, moon, UV, dust ────────────────────────────────────────────────
const MOON_PHASES = [
  { name: 'New Moon', emoji: '🌑' }, { name: 'Waxing Crescent', emoji: '🌒' }, { name: 'First Quarter', emoji: '🌓' }, { name: 'Waxing Gibbous', emoji: '🌔' },
  { name: 'Full Moon', emoji: '🌕' }, { name: 'Waning Gibbous', emoji: '🌖' }, { name: 'Last Quarter', emoji: '🌗' }, { name: 'Waning Crescent', emoji: '🌘' },
];
const SYNODIC = 29.530588853; // days
const NEW_MOON_EPOCH = Date.UTC(2000, 0, 6, 18, 14); // a known new moon

function moonInfo(now = Date.now()) {
  const days = (now - NEW_MOON_EPOCH) / 86400000;
  const age = ((days % SYNODIC) + SYNODIC) % SYNODIC;
  const p = age / SYNODIC;
  const illum = Math.round(((1 - Math.cos(2 * Math.PI * p)) / 2) * 100);
  const ph = MOON_PHASES[Math.floor(p * 8 + 0.5) % 8];
  const daysToFull = ((SYNODIC / 2 - age) + SYNODIC) % SYNODIC;
  const daysToNew = (SYNODIC - age) % SYNODIC;
  return { name: ph.name, emoji: ph.emoji, illumination: illum, ageDays: Math.round(age * 10) / 10, nextFullInDays: Math.round(daysToFull), nextNewInDays: Math.round(daysToNew) };
}

async function getSunMoon(lat, lng) {
  const key = `sun:${lat.toFixed(1)},${lng.toFixed(1)}:${todayKey()}`;
  return cached(key, 3 * 60 * 60 * 1000, async () => {
    const { data } = await http.get('https://api.open-meteo.com/v1/forecast', { params: { latitude: lat, longitude: lng, daily: 'sunrise,sunset,daylight_duration', timezone: 'auto', forecast_days: 1 } });
    const sr = data.daily.sunrise[0].slice(11, 16);
    const ss = data.daily.sunset[0].slice(11, 16);
    const dur = Math.round(data.daily.daylight_duration[0] / 60);
    return { sunrise: sr, sunset: ss, daylight: `${Math.floor(dur / 60)}h ${dur % 60}m`, moon: moonInfo() };
  });
}

async function getUvDust(lat, lng) {
  const key = `uv:${lat.toFixed(1)},${lng.toFixed(1)}`;
  return cached(key, 20 * 60 * 1000, async () => {
    const [fx, aq] = await Promise.all([
      http.get('https://api.open-meteo.com/v1/forecast', { params: { latitude: lat, longitude: lng, current: 'uv_index', daily: 'uv_index_max', timezone: 'auto', forecast_days: 1 } }),
      getAirQuality(lat, lng).then((cur) => ({ data: { current: cur } })).catch(() => ({ data: null })),
    ]);
    const uvNow = Math.round(fx.data.current.uv_index * 10) / 10;
    const uvMax = Math.round(fx.data.daily.uv_index_max[0] * 10) / 10;
    const lvl = (v) => (v < 3 ? ['Low', '#16A34A', 'No protection needed'] : v < 6 ? ['Moderate', '#CA8A04', 'Sunscreen helps'] : v < 8 ? ['High', '#EA580C', 'Use sunscreen, seek shade'] : v < 11 ? ['Very high', '#DC2626', 'Avoid midday sun'] : ['Extreme', '#9333EA', 'Stay out of the sun']);
    const [uvLevel, uvColor, uvAdvice] = lvl(uvMax);
    const c = aq.data?.current || {};
    const pm10 = c.pm10 != null ? Math.round(c.pm10) : null;
    const dust = c.dust != null ? Math.round(c.dust) : null;
    const dustLevel = dust == null ? null : dust < 20 ? 'Low' : dust < 50 ? 'Moderate' : 'High';
    const pmLevel = pm10 == null ? null : pm10 < 50 ? 'Good' : pm10 < 100 ? 'Moderate' : 'Poor';
    return { uvNow, uvMax, uvLevel, uvColor, uvAdvice, pm10, pmLevel, dust, dustLevel, ozone: c.ozone != null ? Math.round(c.ozone) : null };
  });
}

// ── disasters near the user (GDACS) + modelled river flow ──────────────
const GDACS_TYPES = { TC: 'Tropical cyclone', FL: 'Flood', EQ: 'Earthquake', DR: 'Drought', VO: 'Volcano', WF: 'Wildfire', TS: 'Tsunami' };
const LEVEL_RANK = { Red: 3, Orange: 2, Green: 1 };

async function getDisasters(lat, lng, opts = {}) {
  const limit = opts.limit || 5;
  const maxAgeDays = opts.maxAgeDays || 21;
  const key = `gdacs:${lat.toFixed(0)},${lng.toFixed(0)}:${limit}:${maxAgeDays}`;
  return cached(key, 30 * 60 * 1000, async () => {
    const { data } = await http.get('https://www.gdacs.org/xml/rss.xml', { responseType: 'text', transformResponse: (r) => r });
    const toRad = (x) => (x * Math.PI) / 180;
    const items = [...String(data).matchAll(/<item>[\s\S]*?<\/item>/g)].map((x) => x[0]);
    const events = [];
    for (const item of items) {
      const b = item;
      const type = stripTags(tag(b, 'gdacs:eventtype'));
      const level = stripTags(tag(b, 'gdacs:alertlevel')) || 'Green';
      const la = parseFloat(stripTags(tag(b, 'geo:lat')));
      const lo = parseFloat(stripTags(tag(b, 'geo:long')));
      if (!GDACS_TYPES[type] || !Number.isFinite(la) || !Number.isFinite(lo)) continue;
      const dLat = toRad(la - lat), dLon = toRad(lo - lng);
      const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat)) * Math.cos(toRad(la)) * Math.sin(dLon / 2) ** 2;
      const km = Math.round(6371 * 2 * Math.asin(Math.sqrt(h)));
      const country = stripTags(tag(item, 'gdacs:country'));
      // Only Bangladesh and its neighbours (plus a cyclone that is close to the Bay of Bengal region)
      const isBd = /bangladesh/i.test(country);
      const isNeighbour = /india|myanmar|burma|nepal|bhutan|sri lanka/i.test(country);
      const keep = isBd || isNeighbour || (type === 'TC' && km <= 1500);
      const evTime = new Date(stripTags(tag(b, 'gdacs:datemodified')) || stripTags(tag(b, 'pubDate')) || Date.now()).getTime();
      if (Date.now() - evTime > maxAgeDays * 24 * 3600 * 1000) continue; // older than 3 weeks is not "recent"
      if (!keep) continue;
      events.push({
        type, kind: GDACS_TYPES[type], level, km,
        title: stripTags(tag(b, 'title')),
        country: stripTags(tag(b, 'gdacs:country')),
        url: stripTags(tag(b, 'link')).replace(/^http:/, 'https:'),
        when: new Date(stripTags(tag(b, 'gdacs:datemodified')) || stripTags(tag(b, 'pubDate')) || Date.now()).toISOString(),
      });
    }
    const bdFirst = (e) => (/bangladesh/i.test(e.country) ? 1 : 0);
    events.sort((x, y) => (bdFirst(y) - bdFirst(x)) || (new Date(y.when) - new Date(x.when)) || (LEVEL_RANK[y.level] - LEVEL_RANK[x.level]));
    return events.slice(0, limit);
  });
}

async function getRiver(lat, lng) {
  const key = `river:${lat.toFixed(1)},${lng.toFixed(1)}`;
  return cached(key, 3 * 60 * 60 * 1000, async () => {
    const { data } = await http.get('https://flood-api.open-meteo.com/v1/flood', { params: { latitude: lat, longitude: lng, daily: 'river_discharge', forecast_days: 7 } });
    const v = (data.daily?.river_discharge || []).map((x) => Number(x)).filter((x) => Number.isFinite(x));
    if (v.length < 3) return null;
    const first = v[0] || 0.0001;
    const peak = Math.max(...v);
    const last = v[v.length - 1];
    const change = Math.round(((peak - first) / first) * 100);
    const endChange = Math.round(((last - first) / first) * 100);
    let trend, color;
    if (change >= 60) { trend = 'Rising fast'; color = '#DC2626'; }
    else if (change >= 20) { trend = 'Rising'; color = '#EA580C'; }
    else if (endChange <= -20) { trend = 'Falling'; color = '#0EA5E9'; }
    else { trend = 'Steady'; color = '#16A34A'; }
    return { now: Math.round(first * 10) / 10, series: v.map((x) => Math.round(x * 10) / 10), peak: Math.round(peak * 10) / 10, change, trend, color };
  });
}

async function getSafety(lat, lng) {
  const [events, river] = await Promise.all([getDisasters(lat, lng).catch(() => []), getRiver(lat, lng).catch(() => null)]);
  return { events, river };
}

// The dedicated Safety page: many more disasters (30 days), a longer earthquake list and the river flow
async function getSafetyFull(lat, lng) {
  const key = `safety-full:${lat.toFixed(1)},${lng.toFixed(1)}`;
  return cached(key, 10 * 60 * 1000, async () => {
    const [events, quakes, river] = await Promise.all([
      getDisasters(lat, lng, { limit: 40, maxAgeDays: 30 }).catch(() => []),
      getQuakesFull(lat, lng).catch(() => []),
      getRiver(lat, lng).catch(() => null),
    ]);
    return { events, quakes, river };
  });
}

// ── public holidays (Bangladesh) ───────────────────────────────────────
async function getHolidays() {
  const now = new Date(Date.now() + 6 * 3600 * 1000); // Dhaka
  const today = now.toISOString().slice(0, 10);
  const year = now.getUTCFullYear();
  return cached(`holidays:${today}`, 12 * 60 * 60 * 1000, async () => {
    const pull = (y) => http.get(`https://date.nager.at/api/v3/PublicHolidays/${y}/BD`).then((r) => r.data).catch(() => []);
    // Nager.Date has only a few gazetted days. Google's public Bangladesh holiday calendar is much fuller (Eid and Puja
    // days, Shab-e-Barat, Ashura, Buddha Purnima...), so it is the main source; Nager fills later years Google doesn't cover yet.
    const googleIcs = () => http.get('https://calendar.google.com/calendar/ical/en.bd%23holiday%40group.v.calendar.google.com/public/basic.ics', { timeout: 15000, responseType: 'text', transformResponse: (x) => x })
      .then((r) => {
        const out = [];
        for (const block of String(r.data).split('BEGIN:VEVENT').slice(1)) {
          const d = (block.match(/DTSTART(?:;VALUE=DATE)?:(\d{4})(\d{2})(\d{2})/) || []);
          const s = ((block.match(/SUMMARY:(.*)/) || [])[1] || '').trim();
          if (!d[1] || !s) continue;
          out.push({ date: `${d[1]}-${d[2]}-${d[3]}`, name: s, kind: /Public holiday/i.test(block) ? 'public' : 'observance' });
        }
        return out;
      })
      .catch(() => []);
    const SKIP = /valentine|mother'?s day|father'?s day|halloween|ash wednesday|working day|new year'?s eve|boxing day|maundy|holy saturday|easter monday|bank holiday|akhari chahar|ashari purnima|madhu purnima|prabarana|fateha/i;
    const [a, b, g] = await Promise.all([pull(year), pull(year + 1), googleIcs()]);
    const t0 = Date.parse(today + 'T00:00:00Z');
    const map = new Map();
    const add = (h) => {
      if (!h.date || h.date < today) return;
      const key = h.date + '|' + h.name.toLowerCase().replace(/[^a-z]/g, '').slice(0, 8);
      if (!map.has(key)) map.set(key, h);
    };
    g.filter((h) => !SKIP.test(h.name)).forEach(add);
    // Nager adds only the days Google does not already list on the same date
    const gDates = new Set(g.filter((h) => !SKIP.test(h.name)).map((h) => h.date));
    [...a, ...b].filter((h) => !gDates.has(h.date)).forEach((h) => add({ date: h.date, name: h.name, localName: h.localName, kind: 'public' }));
    // Google's calendar stops at the end of this year; for next year the moon-sighting days are added as expected dates
    // (marked approx: the real date is announced a few days before and can move by a day)
    if (!g.some((h) => h.date.startsWith(String(year + 1))) && year + 1 === 2027) {
      [['2027-03-10', 'Eid ul-Fitr'], ['2027-05-17', 'Eid al-Adha'], ['2027-05-20', 'Buddha Purnima/Vesak'], ['2027-06-15', 'Ashura'], ['2027-08-14', 'Eid e-Milad-un Nabi'], ['2027-08-25', 'Janmashtami']]
        .forEach(([date, name]) => add({ date, name, kind: 'public', approx: true }));
    }
    return [...map.values()]
      .sort((x, y) => (x.date < y.date ? -1 : x.date > y.date ? 1 : (x.kind === 'public' ? -1 : 1)))
      .slice(0, 14) // the Holidays tab lists what is coming up next; the app shows only what it needs
      .map((h) => {
        const d = new Date(h.date + 'T00:00:00Z');
        return { date: h.date, name: h.name, localName: h.localName, kind: h.kind, approx: !!h.approx, inDays: Math.round((Date.parse(h.date + 'T00:00:00Z') - t0) / 86400000), weekday: d.toLocaleDateString('en-US', { weekday: 'long', timeZone: 'UTC' }) };
      });
  });
}

// ── place name for a coordinate (OpenStreetMap Nominatim; max 1 request/second, so cached + queued) ──
let nominatimQueue = Promise.resolve();
const pause = (ms) => new Promise((r) => setTimeout(r, ms));

async function getPlaceName(lat, lng) {
  const key = `place:${lat.toFixed(3)},${lng.toFixed(3)}`; // ~110 m
  return cached(key, 7 * 24 * 60 * 60 * 1000, () => {
    const job = nominatimQueue.then(async () => {
      const { data } = await http.get('https://nominatim.openstreetmap.org/reverse', {
        params: { format: 'jsonv2', lat, lon: lng, zoom: 16, addressdetails: 1, 'accept-language': 'en' },
        headers: { 'User-Agent': 'PriyoChat/1.0 (place name for weather widget)' },
        timeout: 10000,
      });
      await pause(1100); // be polite: at most one lookup per second
      const a = data?.address || {};
      const area = a.quarter || a.neighbourhood || a.suburb || a.borough || a.city_district || a.residential || a.village || a.hamlet || '';
      const city = a.city || a.town || a.municipality || a.county || a.state_district || a.state || '';
      const road = a.road || '';
      const uniq = (arr) => arr.filter((x, i) => x && arr.indexOf(x) === i);
      const short = uniq([area || road, city]).join(', ');
      const full = uniq([road, area, city]).join(', ');
      return { short: short || city || 'Your location', full: full || short || 'Your location', area, city, road, country: a.country || '' };
    });
    nominatimQueue = job.catch(() => {});
    return job;
  });
}

// ── the dedicated Matches page: live now, recent results, today's fixtures and the coming days ──
const ymdOf = (ms) => new Date(ms + 6 * 3600 * 1000).toISOString().slice(0, 10).replace(/-/g, ''); // Dhaka calendar day

async function getMatchesFull(days = 7) {
  const n = Math.min(10, Math.max(1, parseInt(days, 10) || 7));
  return cached(`matches-full:${n}`, 20 * 1000, async () => {
    const now = Date.now();
    const todayYmd = ymdOf(now);
    const dates = [];
    for (let i = -1; i < n; i++) dates.push(ymdOf(now + i * 86400000)); // yesterday .. n days ahead
    const jobs = [];
    for (const sport of ['cricket', 'soccer']) {
      for (const ymd of dates) {
        const ttl = ymd === todayYmd ? 20 * 1000 : 15 * 60 * 1000; // today is live, other days barely change
        jobs.push(cached(`espn:${sport}:${ymd}`, ttl, () => pullEspn(sport, ymd)).catch(() => []));
      }
    }
    const lists = await Promise.all(jobs);
    const seen = new Set();
    const rows = [];
    let minorCricket = 0;
    for (const r of lists.flat()) {
      const key = r.id || `${r.league}|${r.home}|${r.away}|${r.time}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const t = Date.parse(r.time);
      if (!Number.isFinite(t)) continue;
      const major = r.sport === 'cricket' ? CRICKET_MAJOR.test(r.league) : BIG_LEAGUES.test(r.league);
      if (r.state === 'final' && now - t > 48 * 3600 * 1000 && !(r.sport === 'cricket' && now - t < 4 * 24 * 3600 * 1000)) continue; // results from the last 2 days
      if (r.state === 'upcoming' && t < now - 3600 * 1000) continue; // stale fixtures
      // football: big competitions only; cricket: major series, plus anything live / today / done recently
      if (r.sport !== 'cricket' && !major) continue;
      if (r.sport === 'cricket' && !major && ++minorCricket > 40) continue; // keep domestic cricket from flooding the list
      rows.push({ ...r, major, day: ymdOf(t) });
    }
    rows.sort((a, b) => (MATCH_ORDER[a.state] - MATCH_ORDER[b.state]) || (a.state === 'final' ? Date.parse(b.time) - Date.parse(a.time) : Date.parse(a.time) - Date.parse(b.time)));
    return rows.slice(0, 150);
  });
}

async function getWidgets({ lat, lng }) {
  const [weather0, prayer, rates, crypto, space, onThisDay, aqi, quakes, alerts, matches, sunmoon, uv, safety, holidays] = await Promise.all([
    getWeather(lat, lng).catch(() => null),
    getPrayer(lat, lng).catch(() => null),
    getRates().catch(() => null),
    getCrypto().catch(() => null),
    getSpacePic().catch(() => null),
    getOnThisDay().catch(() => null),
    getAqi(lat, lng).catch(() => null),
    getQuakes(lat, lng).catch(() => null),
    getWeatherAlerts(lat, lng).catch(() => null),
    getMatches().catch(() => null),
    getSunMoon(lat, lng).catch(() => null),
    getUvDust(lat, lng).catch(() => null),
    getSafety(lat, lng).catch(() => null),
    getHolidays().catch(() => null),
  ]);
  // hour-by-hour weather is deliberately NOT cached: always the latest reading
  let weather = weather0;
  if (weather0) {
    const win = await getHourlyWindow(lat, lng).catch(() => null);
    if (win) weather = { ...weather0, hourly: win.hours, nowIndex: win.nowIndex };
  }
  return { weather, prayer, rates, crypto, space, onThisDay, aqi, quakes, alerts, matches, sunmoon, uv, safety, holidays };
}

// ── daily extras ───────────────────────────────────────────────────────
const dayIndex = () => Math.floor((Date.now() + 6 * 3600 * 1000) / 86400000); // Dhaka day number
const todayKey = () => new Date(Date.now() + 6 * 3600 * 1000).toISOString().slice(0, 10);

const DUA_INFO = require('./duaInfo'); // who / when / why for each dua below
const AYAH_INFO = require('./ayahInfo'); // context / why / how to apply for each ayah of the day
// Quranic duas: only the references are curated; the text always comes from the Quran API
const DUA_REFS = ['2:201', '3:8', '7:23', '14:40', '17:24', '18:10', '20:114', '21:87', '23:118', '25:74', '59:10', '66:8', '2:127', '3:147', '3:193', '71:28', '28:24', '14:41', '2:250', '60:5'];

// Ayah of the day: a curated list of well-known comforting / guiding verses (text still comes from the Quran API)
const AYAH_REFS = ['2:152', '2:153', '2:186', '2:286', '3:139', '3:159', '3:173', '3:200', '4:28', '5:2', '9:51', '11:88', '13:28', '14:7', '16:90', '16:128', '17:9', '20:46', '21:107', '29:69', '39:53', '41:34', '49:13', '55:13', '57:4', '64:11', '65:2', '65:3', '93:3', '93:5', '94:5', '94:6', '103:2', '103:3', '112:1', '2:45', '8:46', '33:70'];

async function quranRef(ref) {
  const { data } = await http.get(`https://api.alquran.cloud/v1/ayah/${ref}/editions/quran-uthmani,bn.bengali,en.sahih`);
  const [ar, bn, en] = data.data;
  return {
    ref: `${ar.surah.number}:${ar.numberInSurah}`,
    surah: ar.surah.englishName,
    surahAr: ar.surah.name,
    surahNumber: ar.surah.number,
    revelation: ar.surah.revelationType || '',
    surahAyahs: ar.surah.numberOfAyahs || 0,
    meaning: ar.surah.englishNameTranslation || '',
    juz: ar.juz || 0,
    arabic: ar.text,
    bangla: bn.text,
    english: en.text,
  };
}

async function getAyah() {
  return cached(`ayah:${todayKey()}`, 12 * 60 * 60 * 1000, async () => {
    const ref = AYAH_REFS[(dayIndex() * 7) % AYAH_REFS.length]; // well-known, uplifting ayat, one per day
    const q = await quranRef(ref);
    return { ...q, translator: 'বাংলা অনুবাদ: মুহিউদ্দীন খান · English: Sahih International', info: AYAH_INFO[q.ref] || null };
  });
}

async function getDua() {
  return cached(`dua:${todayKey()}`, 12 * 60 * 60 * 1000, async () => {
    const ref = DUA_REFS[dayIndex() % DUA_REFS.length];
    const q = await quranRef(ref);
    return { ...q, translator: 'বাংলা অনুবাদ: মুহিউদ্দীন খান · English: Sahih International', info: DUA_INFO[q.ref] || null };
  });
}

async function getWord() {
  return cached(`word:${todayKey()}`, 6 * 60 * 60 * 1000, async () => {
    const { data } = await http.get('https://www.merriam-webster.com/wotd/feed/rss2', { responseType: 'text', transformResponse: (r) => r });
    const item = data.match(/<item>[\s\S]*?<\/item>/i)?.[0] || '';
    const word = stripTags(tag(item, 'title'));
    const url = stripTags(tag(item, 'link'));
    const desc = decode(tag(item, 'description').replace(/<!\[CDATA\[|\]\]>/g, ''));
    const head = desc.match(/<strong>([^<]+)<\/strong>\s*&?#?\w*;?\s*\u2022?\s*\\([^\\]+)\\[^<]*<em>([^<]+)<\/em>/i);
    const paras = [...desc.matchAll(/<p>([\s\S]*?)<\/p>/gi)].map((x) => stripTags(x[1])).filter(Boolean);
    // the definition is the paragraph that starts with the word in italics, e.g. <p><em>Fulsome</em> describes ...</p>
    const defMatch = desc.match(/<p>\s*<em>[^<]+<\/em>[\s\S]*?<\/p>/i);
    const definition = defMatch ? stripTags(defMatch[0]) : '';
    const example = (paras.find((p) => p.startsWith('//')) || '').replace(/^\/\/\s*/, '');
    const pron = desc.match(/\\([^\\]{2,40})\\/)?.[1] || '';
    const pos = desc.match(/<em>(noun|verb|adjective|adverb|preposition|conjunction|interjection|pronoun)[^<]*<\/em>/i)?.[1] || (head ? head[3] : '');
    if (!word) return null;
    return { word, pron, pos, definition, example, url };
  });
}

async function getQuote() {
  return cached(`quote:${todayKey()}`, 12 * 60 * 60 * 1000, async () => {
    const { data } = await http.get('https://zenquotes.io/api/today');
    const q = data?.[0];
    if (!q?.q) return null;
    return { text: q.q, author: q.a, credit: 'Inspirational quotes provided by ZenQuotes.io', url: 'https://zenquotes.io/' };
  });
}

async function getRecipe() {
  return cached(`recipe:${todayKey()}`, 12 * 60 * 60 * 1000, async () => {
    const { data } = await http.get('https://www.themealdb.com/api/json/v1/1/random.php');
    const x = data.meals?.[0];
    if (!x) return null;
    const ingredients = [];
    for (let i = 1; i <= 20; i++) {
      const ing = (x[`strIngredient${i}`] || '').trim();
      if (ing) ingredients.push({ name: ing, measure: (x[`strMeasure${i}`] || '').trim() });
    }
    return {
      id: x.idMeal, title: x.strMeal, category: x.strCategory, area: x.strArea, image: x.strMealThumb,
      instructions: (x.strInstructions || '').replace(/\r/g, '').trim().slice(0, 3000),
      ingredients, video: x.strYoutube || null, url: x.strSource || `https://www.themealdb.com/meal/${x.idMeal}`,
    };
  });
}

async function getFact() {
  return cached(`fact:${todayKey()}`, 12 * 60 * 60 * 1000, async () => {
    const { data } = await http.get('https://uselessfacts.jsph.pl/api/v2/facts/today?language=en');
    if (!data?.text) return null;
    return { text: String(data.text).trim(), source: data.source || '' };
  });
}

async function getJoke() {
  return cached(`joke:${todayKey()}`, 6 * 60 * 60 * 1000, async () => {
    const { data } = await http.get('https://v2.jokeapi.dev/joke/Any', { params: { 'safe-mode': '', blacklistFlags: 'nsfw,religious,political,racist,sexist,explicit', type: 'single' } });
    if (!data?.joke || data.error) return null;
    return { text: String(data.joke).trim(), category: data.category || '' };
  });
}

// Artwork of the day: Cleveland Museum of Art Open Access (CC0, no key)
async function getArt() {
  return cached(`art:${todayKey()}`, 12 * 60 * 60 * 1000, async () => {
    const skip = (dayIndex() * 53) % 3800;
    const { data } = await http.get('https://openaccess-api.clevelandart.org/api/artworks/', { params: { has_image: 1, cc0: 1, type: 'Painting', limit: 1, skip } });
    const a = data?.data?.[0];
    const img = a?.images?.web?.url;
    if (!a || !img) return null;
    return {
      title: a.title, date: a.creation_date || '', artist: a.creators?.[0]?.description || 'Unknown artist',
      technique: a.technique || '', culture: a.culture?.[0] || '', image: img, url: a.url,
      credit: 'The Cleveland Museum of Art · CC0',
    };
  });
}

// "Show me another one": a fresh item for a Daily card (never repeats the one the app already shows)
const pickOther = (list, avoid) => {
  const pool = list.filter((x) => x !== avoid);
  return pool[Math.floor(Math.random() * pool.length)];
};

async function getAnother(kind, avoid) {
  const avoidStr = String(avoid || '').slice(0, 300);
  if (kind === 'ayah' || kind === 'dua') {
    const ref = pickOther(kind === 'ayah' ? AYAH_REFS : DUA_REFS, avoidStr);
    const q = await cached(`quranref:${ref}`, 24 * 60 * 60 * 1000, () => quranRef(ref));
    return { ...q, translator: 'বাংলা অনুবাদ: মুহিউদ্দীন খান · English: Sahih International', info: (kind === 'dua' ? DUA_INFO : AYAH_INFO)[q.ref] || null };
  }
  if (kind === 'quote') {
    for (let i = 0; i < 3; i++) {
      const { data } = await http.get('https://zenquotes.io/api/random');
      const q = data?.[0];
      if (q?.q && q.q !== avoidStr && !/too many requests/i.test(q.q)) {
        return { text: q.q, author: q.a, credit: 'Inspirational quotes provided by ZenQuotes.io', url: 'https://zenquotes.io/' };
      }
    }
    return null;
  }
  if (kind === 'fact') {
    for (let i = 0; i < 3; i++) {
      const { data } = await http.get('https://uselessfacts.jsph.pl/api/v2/facts/random?language=en');
      const text = String(data?.text || '').trim();
      if (text && text !== avoidStr) return { text, source: data.source || '' };
    }
    return null;
  }
  if (kind === 'joke') {
    for (let i = 0; i < 3; i++) {
      const { data } = await http.get('https://v2.jokeapi.dev/joke/Any', { params: { 'safe-mode': '', blacklistFlags: 'nsfw,religious,political,racist,sexist,explicit', type: 'single' } });
      const text = String(data?.joke || '').trim();
      if (text && !data.error && text !== avoidStr) return { text, category: data.category || '' };
    }
    return null;
  }
  if (kind === 'word') {
    // a random English word, with its meaning from the free Dictionary API (no key)
    for (let i = 0; i < 6; i++) {
      try {
        const { data: words } = await http.get('https://random-word-api.herokuapp.com/word', { params: { number: 1, length: 8 + (i % 3) } });
        const w = String(words?.[0] || '').toLowerCase();
        if (!w || w === avoidStr.toLowerCase()) continue;
        const { data } = await http.get(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(w)}`);
        const e = data?.[0];
        const m = e?.meanings?.[0];
        const d = m?.definitions?.[0];
        if (!e || !d?.definition) continue;
        return {
          word: e.word || w,
          pron: (e.phonetic || e.phonetics?.find((p) => p.text)?.text || '').replace(/^\/|\/$/g, ''),
          pos: m.partOfSpeech || '',
          definition: d.definition,
          example: d.example || '',
          url: `https://www.merriam-webster.com/dictionary/${encodeURIComponent(e.word || w)}`,
        };
      } catch (err) { /* try another word */ }
    }
    return null;
  }
  return null;
}

async function getDaily() {
  const [ayah, dua, word, quote, recipe, fact, joke, art] = await Promise.all([
    getAyah().catch(() => null), getDua().catch(() => null), getWord().catch(() => null), getQuote().catch(() => null),
    getRecipe().catch(() => null), getFact().catch(() => null), getJoke().catch(() => null), getArt().catch(() => null),
  ]);
  return { ayah, dua, word, quote, recipe, fact, joke, art };
}

// Pre-load the widgets for the main cities every 25 minutes (and the daily cards), so the first open is fast
const WARM_PLACES = [[23.8103, 90.4125], [22.3569, 91.7832], [24.8949, 91.8687], [24.3745, 88.6042], [22.8456, 89.5403], [22.701, 90.3535], [25.7439, 89.2752], [24.7471, 90.4203]];
function startFeedWarmup() {
  const run = async () => {
    try { await getDaily(); } catch (e) { /* ignore */ }
    for (const [lat, lng] of WARM_PLACES) {
      try { await getWidgets({ lat, lng }); } catch (e) { /* ignore */ }
    }
  };
  setTimeout(run, 8000).unref();
  setInterval(run, 25 * 60 * 1000).unref();
}

module.exports = {
  startFeedWarmup, getArticles, getWidgets, getDaily, getAnother, getPlaceName, getMatchesFull, getMatchDetail, getSafetyFull, getWeatherFull, getHourlyWindow, getHolidays, getPrayerWeek, getTafsir, VALID_CATEGORIES };
