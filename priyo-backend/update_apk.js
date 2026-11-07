const path = require('path');
const fs = require('fs');
// Load from priyo-backend/.env regardless of where the script is invoked from
require('dotenv').config({ path: path.resolve(__dirname, '.env') });
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

  let version = '4.0.6';
  try {
    const appJsonPath = path.resolve(__dirname, '../app.json');
    if (fs.existsSync(appJsonPath)) {
      const appJson = JSON.parse(fs.readFileSync(appJsonPath, 'utf8'));
      if (appJson.expo?.version) version = appJson.expo.version;
    }
  } catch (e) {}

  const apkUrl = 'https://138.2.92.182.nip.io/apk/PriyoChat-latest.apk';
  const releaseNotes = `Version ${version} (STABLE). PriyoChat Cloud Engine release.`;

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

updateApk().catch((err) => {
  console.error('Error updating AppUpdate:', err);
  process.exit(1);
});
