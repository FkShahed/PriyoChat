const router = require('express').Router();
const { protect } = require('../middleware/auth');
const upload = require('../middleware/upload');
const { uploadFiles } = require('../controllers/mediaController');

router.post('/upload', protect, upload.array('files', 10), uploadFiles);

module.exports = router;
