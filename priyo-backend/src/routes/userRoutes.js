const router = require('express').Router();
const { protect } = require('../middleware/auth');
const upload = require('../middleware/upload');
const {
  searchUsers, getUserById, updateProfile, updateFcmToken, getMe, reportBug
} = require('../controllers/userController');
const { getAppUpdate } = require('../controllers/adminController');

// Public app-update endpoint (accessible before login)
router.get('/app-update', getAppUpdate);

router.use(protect);
router.post('/bug-report', reportBug);
router.get('/me', getMe);
router.get('/search', searchUsers);
router.get('/:id', getUserById);
router.put('/profile', upload.single('avatar'), updateProfile);
router.put('/fcm-token', updateFcmToken);

module.exports = router;
