const router = require('express').Router();
const { protect } = require('../middleware/auth');
const {
  getConversations, getMessages, updateTheme, deleteMessage,
  reactToMessage, searchMessages, reportMessage, blockUser,
} = require('../controllers/conversationController');

router.use(protect);
router.get('/', getConversations);
router.get('/:id/messages', getMessages);
router.get('/:id/search', searchMessages);
router.put('/:id/theme', updateTheme);
router.delete('/messages/:msgId', deleteMessage);
router.post('/messages/:msgId/react', reactToMessage);
router.post('/messages/:msgId/report', reportMessage);
router.put('/users/:id/block', blockUser);

module.exports = router;
