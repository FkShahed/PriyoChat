const express = require('express');
const router = express.Router();
const { getMyCalls, deleteCall, clearMyHistory } = require('../controllers/callController');
const { protect } = require('../middleware/auth');

router.use(protect);

router.get('/', getMyCalls);
router.delete('/:id', deleteCall);
router.delete('/clear/all', clearMyHistory);

module.exports = router;
