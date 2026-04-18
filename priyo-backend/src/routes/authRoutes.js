const router = require('express').Router();
const { signup, login, adminLogin } = require('../controllers/authController');

router.post('/signup', signup);
router.post('/login', login);
router.post('/admin-login', adminLogin);

module.exports = router;
