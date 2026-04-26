const User = require('../models/User');
const Message = require('../models/Message');
const Conversation = require('../models/Conversation');
const Report = require('../models/Report');
const BugReport = require('../models/BugReport');
const AppUpdate = require('../models/AppUpdate');
const AppConfig = require('../models/AppConfig');
const AuditLog = require('../models/AuditLog');
const { logAdminAction } = require('../middleware/role');
const { sendPushNotification, sendExpoPushBatch } = require('../config/firebase');

// GET /api/admin/users
const getAllUsers = async (req, res) => {
  try {
    const { search, page = 1, limit = 20 } = req.query;
    const query = { role: 'user' };
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
      ];
    }
    const users = await User.find(query)
      .select('-password -fcmToken')
      .sort('-createdAt')
      .skip((page - 1) * limit)
      .limit(Number(limit));
    const total = await User.countDocuments(query);
    res.json({ users, total, page: Number(page), totalPages: Math.ceil(total / limit) });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// PUT /api/admin/users/:id/ban
const banUser = async (req, res) => {
  try {
    const { ban = true, reason = '' } = req.body;
    const user = await User.findByIdAndUpdate(
      req.params.id,
      { isBlocked: ban, moderationReason: reason },
      { new: true }
    );
    if (!user) return res.status(404).json({ message: 'User not found' });

    // Notify user via socket
    const io = req.app.get('io');
    if (io) {
      io.to(user._id.toString()).emit('user_moderated', {
        type: ban ? 'ban' : 'unban',
        reason,
      });
    }

    await logAdminAction(
      req.user._id,
      ban ? 'BAN_USER' : 'UNBAN_USER',
      'User',
      user._id,
      { reason, targetName: user.name },
      req.ip
    );
    res.json({ message: ban ? 'User banned' : 'User unbanned', user });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// PUT /api/admin/users/:id/suspend
const suspendUser = async (req, res) => {
  try {
    const { suspend = true, reason = '' } = req.body;
    const user = await User.findByIdAndUpdate(
      req.params.id,
      { isSuspended: suspend, moderationReason: reason },
      { new: true }
    );
    if (!user) return res.status(404).json({ message: 'User not found' });

    // Notify user via socket
    const io = req.app.get('io');
    if (io) {
      io.to(user._id.toString()).emit('user_moderated', {
        type: suspend ? 'suspend' : 'unsuspend',
        reason,
      });
    }

    await logAdminAction(
      req.user._id,
      suspend ? 'SUSPEND_USER' : 'UNSUSPEND_USER',
      'User',
      user._id,
      { reason, targetName: user.name },
      req.ip
    );
    res.json({ message: suspend ? 'User suspended' : 'User unsuspended', user });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// PUT /api/admin/users/:id/warn
const warnUser = async (req, res) => {
  try {
    const { reason = '' } = req.body;
    const user = await User.findByIdAndUpdate(
      req.params.id,
      { $inc: { warnings: 1 }, moderationReason: reason },
      { new: true }
    );
    if (!user) return res.status(404).json({ message: 'User not found' });

    // Notify user via socket
    const io = req.app.get('io');
    if (io) {
      io.to(user._id.toString()).emit('user_moderated', {
        type: 'warn',
        reason,
        warnings: user.warnings,
      });
    }

    await logAdminAction(req.user._id, 'WARN_USER', 'User', user._id, { reason, targetName: user.name }, req.ip);
    res.json({ message: 'Warning issued', warnings: user.warnings });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// PUT /api/admin/users/:id/remove-warning
const removeWarning = async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: 'User not found' });

    let updatedWarnings = user.warnings;
    if (user.warnings > 0) {
      updatedWarnings = user.warnings - 1;
      await User.findByIdAndUpdate(req.params.id, { warnings: updatedWarnings });
    }

    // Notify user via socket
    const io = req.app.get('io');
    if (io) {
      const targetId = user._id.toString();
      console.log(`[Admin] Emitting remove_warning to ${targetId}, new count: ${updatedWarnings}`);
      io.to(targetId).emit('user_moderated', {
        type: 'remove_warning',
        warnings: updatedWarnings,
      });
    }

    await logAdminAction(req.user._id, 'REMOVE_WARNING', 'User', user._id, { targetName: user.name }, req.ip);
    res.json({ message: 'Warning removed', warnings: updatedWarnings });
  } catch (err) {
    console.error('[Admin] removeWarning error:', err.message);
    res.status(500).json({ message: err.message });
  }
};

// GET /api/admin/reports
const getReports = async (req, res) => {
  try {
    const { status = 'pending', page = 1, limit = 20 } = req.query;
    const query = status !== 'all' ? { status } : {};
    const reports = await Report.find(query)
      .populate('reportedBy', 'name avatar email')
      .populate('reportedUser', 'name avatar email')
      .populate('message', 'text images createdAt')
      .sort('-createdAt')
      .skip((page - 1) * limit)
      .limit(Number(limit));
    const total = await Report.countDocuments(query);
    res.json({ reports, total, page: Number(page), totalPages: Math.ceil(total / limit) });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// POST /api/admin/reports/:id/resolve
const resolveReport = async (req, res) => {
  try {
    const { action, resolution = '' } = req.body; // action: 'resolve' | 'dismiss'
    const report = await Report.findByIdAndUpdate(
      req.params.id,
      {
        status: action === 'dismiss' ? 'dismissed' : 'resolved',
        resolvedBy: req.user._id,
        resolution,
      },
      { new: true }
    );
    if (!report) return res.status(404).json({ message: 'Report not found' });
    await logAdminAction(req.user._id, 'RESOLVE_REPORT', 'Report', report._id, { action, resolution }, req.ip);
    res.json(report);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// GET /api/admin/analytics
const getAnalytics = async (req, res) => {
  try {
    const now = new Date();
    const last24h = new Date(now - 24 * 60 * 60 * 1000);
    const last7d = new Date(now - 7 * 24 * 60 * 60 * 1000);

    const [
      totalUsers,
      activeUsers24h,
      newUsers7d,
      totalMessages,
      messages24h,
      totalReports,
      pendingReports,
    ] = await Promise.all([
      User.countDocuments({ role: 'user' }),
      User.countDocuments({ lastSeen: { $gte: last24h } }),
      User.countDocuments({ createdAt: { $gte: last7d } }),
      Message.countDocuments({ isDeleted: false }),
      Message.countDocuments({ createdAt: { $gte: last24h }, isDeleted: false }),
      Report.countDocuments(),
      Report.countDocuments({ status: 'pending' }),
    ]);

    // Messages per day for last 7 days
    const dailyMessages = await Message.aggregate([
      { $match: { createdAt: { $gte: last7d }, isDeleted: false } },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
          count: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    res.json({
      totalUsers,
      activeUsers24h,
      newUsers7d,
      totalMessages,
      messages24h,
      totalReports,
      pendingReports,
      dailyMessages,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// GET /api/admin/audit-logs
const getAuditLogs = async (req, res) => {
  try {
    const { page = 1, limit = 30 } = req.query;
    const logs = await AuditLog.find()
      .populate('admin', 'name email avatar')
      .sort('-createdAt')
      .skip((page - 1) * limit)
      .limit(Number(limit));
    const total = await AuditLog.countDocuments();
    res.json({ logs, total, page: Number(page), totalPages: Math.ceil(total / limit) });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// GET /api/admin/bug-reports
const getBugReports = async (req, res) => {
  try {
    const { status, page = 1, limit = 20 } = req.query;
    const query = {};
    if (status) query.status = status;

    const reports = await BugReport.find(query)
      .populate('reportedBy', 'name email avatar')
      .sort('-createdAt')
      .skip((page - 1) * limit)
      .limit(Number(limit));
    const total = await BugReport.countDocuments(query);

    res.json({ reports, total, page: Number(page), totalPages: Math.ceil(total / limit) });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// GET /api/admin/app-update
const getAppUpdate = async (req, res) => {
  try {
    const update = await AppUpdate.findOne().sort('-updatedAt');
    if (!update) return res.status(404).json({ message: 'No app update data found' });
    res.json(update);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// PUT /api/admin/app-update
const setAppUpdate = async (req, res) => {
  try {
    const { version, apkUrl, releaseNotes = '' } = req.body;
    if (!version || !apkUrl) {
      return res.status(400).json({ message: 'Version and APK URL are required' });
    }

    // Always create a new record for history
    const update = await AppUpdate.create({
      version,
      apkUrl,
      releaseNotes,
      updatedBy: req.user._id,
    });

    await logAdminAction(req.user._id, 'UPDATE_APP_UPDATE', 'AppUpdate', update._id, { version, apkUrl }, req.ip);
    res.json(update);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// GET /api/admin/app-update/history
const getAppUpdateHistory = async (req, res) => {
  try {
    const history = await AppUpdate.find()
      .populate('updatedBy', 'name email')
      .sort('-createdAt');
    res.json(history);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// DELETE /api/admin/app-update/:id
const deleteAppUpdate = async (req, res) => {
  try {
    const update = await AppUpdate.findByIdAndDelete(req.params.id);
    if (!update) return res.status(404).json({ message: 'App update record not found' });
    
    await logAdminAction(req.user._id, 'DELETE_APP_UPDATE', 'AppUpdate', req.params.id, { version: update.version }, req.ip);
    res.json({ message: 'App update record deleted successfully' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// PUT /api/admin/bug-reports/:id/status
const updateBugReportStatus = async (req, res) => {
  try {
    const { status } = req.body;
    const report = await BugReport.findByIdAndUpdate(req.params.id, { status }, { new: true });
    if (!report) return res.status(404).json({ message: 'Bug report not found' });

    await logAdminAction(req.user._id, 'UPDATE_BUG_REPORT', 'BugReport', report._id, { status }, req.ip);
    res.json(report);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// POST /api/admin/broadcast
const broadcastNotification = async (req, res) => {
  try {
    const { title, body } = req.body;
    if (!title || !body) return res.status(400).json({ message: 'Title and body are required' });

    // Fetch all users who have an FCM/Expo token
    const users = await User.find({ fcmToken: { $exists: true, $ne: null } }).select('fcmToken');

    if (users.length === 0) {
      return res.json({ message: 'No users with push tokens found.', sent: 0 });
    }

    // Separate Expo tokens from raw FCM tokens
    const expoTokens = users.map(u => u.fcmToken).filter(t => t && (t.startsWith('ExponentPushToken') || t.startsWith('ExpoPushToken')));
    const fcmTokens = users.map(u => u.fcmToken).filter(t => t && !t.startsWith('ExponentPushToken') && !t.startsWith('ExpoPushToken'));

    let sent = 0;

    // Send Expo tokens in efficient batches
    if (expoTokens.length > 0) {
      const expoSent = await sendExpoPushBatch(expoTokens, title, body, { type: 'broadcast' });
      sent += expoSent;
    }

    // Send individual FCM tokens
    if (fcmTokens.length > 0) {
      const results = await Promise.allSettled(fcmTokens.map(t => sendPushNotification(t, title, body, { type: 'broadcast' })));
      sent += results.filter(r => r.status === 'fulfilled').length;
    }

    await logAdminAction(req.user._id, 'BROADCAST_NOTIFICATION', 'System', null, { title, body, sent, total: users.length }, req.ip);
    res.json({ message: `Broadcast sent to ${sent}/${users.length} users.`, sent, total: users.length });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// GET /api/admin/config
const getAppConfig = async (req, res) => {
  try {
    let config = await AppConfig.findOne({ configKey: 'global' });
    if (!config) {
      config = await AppConfig.create({ configKey: 'global', defaultRingtoneUrl: '' });
    }
    res.json(config);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// PUT /api/admin/config
const updateAppConfig = async (req, res) => {
  try {
    const { defaultRingtoneUrl, availableRingtones } = req.body;
    let config = await AppConfig.findOne({ configKey: 'global' });
    if (!config) {
      config = new AppConfig({ configKey: 'global' });
    }
    
    if (defaultRingtoneUrl !== undefined) config.defaultRingtoneUrl = defaultRingtoneUrl;
    if (availableRingtones !== undefined) config.availableRingtones = availableRingtones;
    
    config.updatedBy = req.user._id;
    await config.save();
    
    await logAdminAction(req.user._id, 'UPDATE_APP_CONFIG', 'System', null, { defaultRingtoneUrl, ringtoneCount: availableRingtones?.length }, req.ip);
    res.json(config);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

module.exports = {
  getAllUsers,
  banUser,
  suspendUser,
  warnUser,
  removeWarning,
  getReports,
  resolveReport,
  getAnalytics,
  getAuditLogs,
  getBugReports,
  updateBugReportStatus,
  broadcastNotification,
  getAppUpdate,
  setAppUpdate,
  getAppUpdateHistory,
  deleteAppUpdate,
  getAppConfig,
  updateAppConfig,
};
