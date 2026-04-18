const User = require('../models/User');
const Message = require('../models/Message');
const Conversation = require('../models/Conversation');
const Report = require('../models/Report');
const AuditLog = require('../models/AuditLog');
const { logAdminAction } = require('../middleware/role');

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
      { isBlocked: ban },
      { new: true }
    );
    if (!user) return res.status(404).json({ message: 'User not found' });
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
      { isSuspended: suspend },
      { new: true }
    );
    if (!user) return res.status(404).json({ message: 'User not found' });
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
      { $inc: { warnings: 1 } },
      { new: true }
    );
    if (!user) return res.status(404).json({ message: 'User not found' });
    await logAdminAction(req.user._id, 'WARN_USER', 'User', user._id, { reason, targetName: user.name }, req.ip);
    res.json({ message: 'Warning issued', warnings: user.warnings });
  } catch (err) {
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

module.exports = {
  getAllUsers,
  banUser,
  suspendUser,
  warnUser,
  getReports,
  resolveReport,
  getAnalytics,
  getAuditLogs,
};
