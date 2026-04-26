const router = require('express').Router();
const { protect } = require('../middleware/auth');
const { requireAdmin } = require('../middleware/role');
const {
  getAllUsers, banUser, suspendUser, warnUser, removeWarning,
  getReports, resolveReport, getAnalytics, getAuditLogs,
  getBugReports, updateBugReportStatus,
  getAppUpdate, setAppUpdate, getAppUpdateHistory, deleteAppUpdate,
  broadcastNotification
} = require('../controllers/adminController');

// All admin routes protected
router.use(protect, requireAdmin);

router.get('/users', getAllUsers);
router.put('/users/:id/ban', banUser);
router.put('/users/:id/suspend', suspendUser);
router.put('/users/:id/warn', warnUser);
router.put('/users/:id/remove-warning', removeWarning);

router.get('/reports', getReports);
router.post('/reports/:id/resolve', resolveReport);

router.get('/bug-reports', getBugReports);
router.put('/bug-reports/:id/status', updateBugReportStatus);

router.get('/analytics', getAnalytics);
router.get('/audit-logs', getAuditLogs);
router.get('/app-update', getAppUpdate);
router.get('/app-update/history', getAppUpdateHistory);
router.put('/app-update', setAppUpdate);
router.delete('/app-update/:id', deleteAppUpdate);

router.post('/broadcast', broadcastNotification);

module.exports = router;
