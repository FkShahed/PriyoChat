const mongoose = require('mongoose');

const bugReportSchema = new mongoose.Schema(
  {
    reportedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
      maxLength: 100,
    },
    description: {
      type: String,
      required: true,
    },
    deviceInfo: {
      type: String,
      default: '',
    },
    status: {
      type: String,
      enum: ['open', 'in_progress', 'resolved', 'closed'],
      default: 'open',
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('BugReport', bugReportSchema);
