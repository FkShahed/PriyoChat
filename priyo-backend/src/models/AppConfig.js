const mongoose = require('mongoose');

const appConfigSchema = new mongoose.Schema(
  {
    // A single document to hold global configs
    configKey: { type: String, required: true, unique: true, default: 'global' },
    defaultRingtoneUrl: { type: String, default: '' },
    availableRingtones: [
      {
        name: { type: String, required: true },
        url: { type: String, required: true }
      }
    ],
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

module.exports = mongoose.model('AppConfig', appConfigSchema);
