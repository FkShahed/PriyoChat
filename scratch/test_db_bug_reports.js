const mongoose = require('mongoose');
const BugReport = require('../priyo-backend/src/models/BugReport');
const User = require('../priyo-backend/src/models/User');

const MONGO_URI = "mongodb+srv://fazlulkarim:nJgYQeTjSW5G6e0E@cluster0.vywt2me.mongodb.net/PriyoChat?retryWrites=true&w=majority";

async function test() {
  try {
    await mongoose.connect(MONGO_URI);
    console.log("Connected to DB");
    
    const query = {};
    const reports = await BugReport.find(query)
      .populate('reportedBy', 'name email avatar')
      .sort('-createdAt')
      .skip(0)
      .limit(20);
      
    const total = await BugReport.countDocuments(query);
    console.log({ reports, total });
    process.exit(0);
  } catch (e) {
    console.error("DB Query Error:", e);
    process.exit(1);
  }
}
test();
