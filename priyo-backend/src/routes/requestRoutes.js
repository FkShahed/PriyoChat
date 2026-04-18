const router = require('express').Router();
const { protect } = require('../middleware/auth');
const {
  sendRequest, acceptRequest, rejectRequest, getPendingRequests, getSentRequests,
} = require('../controllers/requestController');

router.use(protect);
router.post('/send', sendRequest);
router.post('/accept/:id', acceptRequest);
router.post('/reject/:id', rejectRequest);
router.get('/', getPendingRequests);
router.get('/sent', getSentRequests);

module.exports = router;
