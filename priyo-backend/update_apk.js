require('dotenv').config();
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

const AppUpdate = mongoose.models.AppUpdate || mongoose.model('AppUpdate', appUpdateSchema);

async function updateApk() {
  await mongoose.connect(process.env.MONGO_URI);
  console.log('Connected to MongoDB successfully!');

  const version = "1.0.9";
  const apkUrl = "https://138.2.92.182.nip.io/apk/PriyoChat-v1.0.8.apk";
  const releaseNotes = "Version 1.0.9 (STABLE). Oracle Cloud VPS migration, silent mode ringer respect, call speaker & echo cancellation fixes, ghost call cleanup.";

  const update = await AppUpdate.create({
    version,
    apkUrl,
    releaseNotes,
  });

  console.log('Published AppUpdate to database:');
  console.log(JSON.stringify(update, null, 2));

  const latest = await AppUpdate.findOne().sort('-updatedAt');
  console.log('Verified latest AppUpdate in system:', latest.version, latest.apkUrl);

  await mongoose.disconnect();
}

updateApk().catch(err => {
  console.error('Error updating AppUpdate:', err);
  process.exit(1);
});
