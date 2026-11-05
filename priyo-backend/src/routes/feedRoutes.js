const router = require('express').Router();
const { protect } = require('../middleware/auth');
const { getArticles, getWidgets, getDaily, getAnother, getPlaceName, getMatchesFull, getMatchDetail, getSafetyFull, getWeatherFull, getHourlyWindow, VALID_CATEGORIES } = require('../services/feedService');

router.use(protect);

// GET /api/feed/articles?interests=tech,cricket&lang=bn|en|both
router.get('/articles', async (req, res) => {
  try {
    const interests = String(req.query.interests || '').split(',').map((s) => s.trim()).filter(Boolean).slice(0, 16);
    const lang = ['bn', 'en', 'both'].includes(req.query.lang) ? req.query.lang : 'both';
    const page = Math.min(20, Math.max(1, parseInt(req.query.page, 10) || 1));
    const limit = Math.min(30, Math.max(10, parseInt(req.query.limit, 10) || 24));
    const refresh = req.query.refresh === '1';
    const seed = Math.abs(parseInt(req.query.seed, 10)) || 0;
    const exclude = String(req.query.exclude || '').split(',').map((x) => x.trim()).filter((x) => /^[a-z0-9]{1,12}$/.test(x)).slice(0, 200);
    const custom = String(req.query.custom || '').split('|').map((s) => s.trim()).filter(Boolean).slice(0, 5);
    const result = await getArticles({ interests, custom, lang, page, limit, refresh, seed, exclude });
    res.json({ ...result, categories: VALID_CATEGORIES, updatedAt: new Date().toISOString() });
  } catch (err) {
    res.status(500).json({ message: 'Feed unavailable' });
  }
});

// GET /api/feed/widgets?lat=23.8&lng=90.4
router.get('/widgets', async (req, res) => {
  try {
    let lat = parseFloat(req.query.lat);
    let lng = parseFloat(req.query.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) { lat = 23.8103; lng = 90.4125; }
    res.json(await getWidgets({ lat, lng }));
  } catch (err) {
    res.status(500).json({ message: 'Widgets unavailable' });
  }
});

// GET /api/feed/place?lat=23.81&lng=90.36  -> { short: 'Mirpur, Dhaka', full: 'Avenue 5, Mirpur 6, Dhaka', ... }
router.get('/place', async (req, res) => {
  try {
    const lat = parseFloat(req.query.lat);
    const lng = parseFloat(req.query.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return res.status(400).json({ message: 'Invalid coordinates' });
    res.json(await getPlaceName(lat, lng));
  } catch (err) {
    res.status(502).json({ message: 'Place lookup unavailable' });
  }
});

// GET /api/feed/matches?days=7 -> live, recent results and upcoming fixtures (cricket + football)
router.get('/matches', async (req, res) => {
  try {
    const matches = await getMatchesFull(req.query.days);
    res.json({ matches, updatedAt: new Date().toISOString() });
  } catch (err) {
    res.status(502).json({ message: 'Matches unavailable' });
  }
});

// GET /api/feed/match?sport=soccer|cricket&league=<leagueKey>&id=<eventId> -> one match in detail (live data)
router.get('/match', async (req, res) => {
  try {
    res.json(await getMatchDetail(req.query.sport, req.query.league, req.query.id));
  } catch (err) {
    res.status(err.message === 'bad match reference' ? 400 : 502).json({ message: 'Match unavailable' });
  }
});

// GET /api/feed/safety?lat=..&lng=.. -> { events, quakes, river } (the full list for the Safety page)
router.get('/safety', async (req, res) => {
  try {
    let lat = parseFloat(req.query.lat);
    let lng = parseFloat(req.query.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) { lat = 23.8103; lng = 90.4125; }
    res.json(await getSafetyFull(lat, lng));
  } catch (err) {
    res.status(502).json({ message: 'Safety data unavailable' });
  }
});

// GET /api/feed/weather?lat=..&lng=.. -> { current, nowHour, hourly (today), daily (7 days) }
router.get('/weather', async (req, res) => {
  try {
    let lat = parseFloat(req.query.lat);
    let lng = parseFloat(req.query.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) { lat = 23.8103; lng = 90.4125; }
    const full = await getWeatherFull(lat, lng);
    // the hour-by-hour list is never cached: always the latest reading
    const win = await getHourlyWindow(lat, lng).catch(() => null);
    res.json(win ? { ...full, hourly: win.hours, nowIndex: win.nowIndex } : full);
  } catch (err) {
    res.status(502).json({ message: 'Weather unavailable' });
  }
});

// GET /api/feed/daily  -> ayah, dua, word, quote, recipe, fact, joke of the day
router.get('/daily', async (req, res) => {
  try {
    res.json(await getDaily());
  } catch (err) {
    res.status(500).json({ message: 'Daily unavailable' });
  }
});

// GET /api/feed/daily/another?kind=ayah|dua|word|quote|fact|joke&avoid=<what the app shows now>  -> a different item
router.get('/daily/another', async (req, res) => {
  try {
    const kind = String(req.query.kind || '');
    if (!['ayah', 'dua', 'word', 'quote', 'fact', 'joke'].includes(kind)) return res.status(400).json({ message: 'Unknown kind' });
    const item = await getAnother(kind, req.query.avoid);
    if (!item) return res.status(502).json({ message: 'No new item right now' });
    res.json({ item });
  } catch (err) {
    res.status(502).json({ message: 'Daily unavailable' });
  }
});

module.exports = router;
