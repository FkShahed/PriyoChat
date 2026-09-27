require('dotenv').config();
const dns = require('dns');
try { dns.setServers(['8.8.8.8', '1.1.1.1']); } catch (e) {}

const mongoose = require('./node_modules/mongoose');

const MONGO_URI = process.env.MONGO_URI || "mongodb+srv://FazlulKarim:765502@cluster0.o5c9l.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0";

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
  console.log('Connecting to MongoDB using public DNS...');
  await mongoose.connect(MONGO_URI);
  console.log('Connected to MongoDB successfully!');

  const version = "1.0.6";
  const apkUrl = "https://github.com/FkShahed/PriyoChat/releases/download/v1.0.6/PriyoChat-v1.0.6.apk";
  const releaseNotes = "WebRTC Background Push Call Sync, FCM 4KB payload optimization, Express Trust Proxy, Mongoose ObjectId sanitization, custom delete modal, and unread badge fixes. (STABLE6 Release)";

  const update = await AppUpdate.create({
    version,
    apkUrl,
    releaseNotes,
  });

  console.log('Created AppUpdate record in database:');
  console.log(JSON.stringify(update, null, 2));

  // Query latest
  const latest = await AppUpdate.findOne().sort('-updatedAt');
  console.log('Verified latest AppUpdate:', latest.version, latest.apkUrl);

  await mongoose.disconnect();
  console.log('Disconnected cleanly.');
}

updateApk().catch(err => {
  console.error('Error updating AppUpdate:', err);
  process.exit(1);
});
