const express = require('express');
const router = express.Router();
const { getMyCalls, deleteCall, clearMyHistory, declineFromPush } = require('../controllers/callController');
const { protect } = require('../middleware/auth');

// Public (token-authorised) endpoint used by the notification "Decline" button; must be before protect
router.post('/decline-from-push', declineFromPush);

router.use(protect);

router.get('/', getMyCalls);
router.delete('/:id', deleteCall);
router.delete('/clear/all', clearMyHistory);

module.exports = router;
