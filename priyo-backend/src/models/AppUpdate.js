const mongoose = require('mongoose');

const appUpdateSchema = new mongoose.Schema(
  {
    version: { type: String, required: true },
    apkUrl: { type: String, required: true },
    releaseNotes: { type: String, default: '' },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

module.exports = mongoose.model('AppUpdate', appUpdateSchema);
