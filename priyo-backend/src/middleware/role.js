const AuditLog = require('../models/AuditLog');

const requireAdmin = (req, res, next) => {
  if (req.user && req.user.role === 'admin') {
    return next();
  }
  return res.status(403).json({ message: 'Admin access required' });
};

const logAdminAction = async (adminId, action, targetType, targetId, details, ipAddress) => {
  try {
    await AuditLog.create({ admin: adminId, action, targetType, targetId, details, ipAddress });
  } catch (err) {
    console.warn('Failed to log admin action:', err.message);
  }
};

module.exports = { requireAdmin, logAdminAction };
