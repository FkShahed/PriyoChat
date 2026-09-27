const dns = require('dns');
dns.setServers(['8.8.8.8', '1.1.1.1']);

const mongoose = require('./node_modules/mongoose');

const MONGO_URI = "mongodb://FazlulKarim:765502@ac-lgh6g3m-shard-00-00.o5c9l.mongodb.net:27017,ac-lgh6g3m-shard-00-01.o5c9l.mongodb.net:27017,ac-lgh6g3m-shard-00-02.o5c9l.mongodb.net:27017/?ssl=true&replicaSet=atlas-13w1nd-shard-0&authSource=admin&retryWrites=true&w=majority";

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

  const version = "1.0.5";
  const apkUrl = "https://github.com/FkShahed/PriyoChat/releases/download/v1.0.5/PriyoChat-v1.0.5.apk";
  const releaseNotes = "Swipe gestures (archive/mute/delete), archive chat list, status update from chat screen, custom delete confirmation modal, unread badge fixes, and chat history clear from your side only. (STABLE5 Release)";

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
