const router = require('express').Router();
const { signup, login, adminLogin, googleAuth } = require('../controllers/authController');

router.post('/signup', signup);
router.post('/login', login);
router.post('/admin-login', adminLogin);
router.post('/google', googleAuth);

module.exports = router;
