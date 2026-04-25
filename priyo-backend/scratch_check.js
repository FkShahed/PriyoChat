
const mongoose = require('mongoose');
const User = require('./src/models/User');
require('dotenv').config();

async function check() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    const users = await User.find({ warnings: { $gt: 0 } });
    console.log('Warned Users:', JSON.stringify(users.map(u => ({
      name: u.name,
      warnings: u.warnings,
      isBlocked: u.isBlocked,
      isSuspended: u.isSuspended
    })), null, 2));
  } catch (err) {
    console.error(err);
  } finally {
    process.exit();
  }
}
check();
