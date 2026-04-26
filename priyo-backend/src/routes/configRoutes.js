const router = require('express').Router();
const AppConfig = require('../models/AppConfig');

// GET /api/config
router.get('/', async (req, res) => {
  try {
    let config = await AppConfig.findOne({ configKey: 'global' });
    if (!config) {
      config = { defaultRingtoneUrl: '', availableRingtones: [] };
    }
    res.json({ 
      defaultRingtoneUrl: config.defaultRingtoneUrl,
      availableRingtones: config.availableRingtones || []
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
