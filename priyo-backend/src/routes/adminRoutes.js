const router = require('express').Router();
const { protect } = require('../middleware/auth');
const { requireAdmin } = require('../middleware/role');
const {
  getAllUsers, banUser, suspendUser, warnUser,
  getReports, resolveReport, getAnalytics, getAuditLogs,
} = require('../controllers/adminController');

// All admin routes protected
router.use(protect, requireAdmin);

router.get('/users', getAllUsers);
router.put('/users/:id/ban', banUser);
router.put('/users/:id/suspend', suspendUser);
router.put('/users/:id/warn', warnUser);

router.get('/reports', getReports);
router.post('/reports/:id/resolve', resolveReport);

router.get('/analytics', getAnalytics);
router.get('/audit-logs', getAuditLogs);

module.exports = router;
