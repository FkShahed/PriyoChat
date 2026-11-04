const router = require('express').Router();
const { protect } = require('../middleware/auth');
const { getArticles, getWidgets, VALID_CATEGORIES } = require('../services/feedService');

router.use(protect);

// GET /api/feed/articles?interests=tech,cricket&lang=bn|en|both
router.get('/articles', async (req, res) => {
  try {
    const interests = String(req.query.interests || '').split(',').map((s) => s.trim()).filter(Boolean).slice(0, 10);
    const lang = ['bn', 'en', 'both'].includes(req.query.lang) ? req.query.lang : 'both';
    const page = Math.min(20, Math.max(1, parseInt(req.query.page, 10) || 1));
    const limit = Math.min(30, Math.max(10, parseInt(req.query.limit, 10) || 24));
    const refresh = req.query.refresh === '1';
    const seed = Math.abs(parseInt(req.query.seed, 10)) || 0;
    const exclude = String(req.query.exclude || '').split(',').map((x) => x.trim()).filter((x) => /^[a-z0-9]{1,12}$/.test(x)).slice(0, 200);
    const result = await getArticles({ interests, lang, page, limit, refresh, seed, exclude });
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

module.exports = router;
