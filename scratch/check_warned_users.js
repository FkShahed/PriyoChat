
const mongoose = require('mongoose');
const User = require('./priyo-backend/src/models/User');
require('dotenv').config({ path: './priyo-backend/.env' });

async function check() {
  await mongoose.connect(process.env.MONGODB_URI);
  const users = await User.find({ warnings: { $gt: 0 } });
  console.log('Warned Users:', JSON.stringify(users.map(u => ({
    name: u.name,
    warnings: u.warnings,
    isBlocked: u.isBlocked,
    isSuspended: u.isSuspended
  })), null, 2));
  process.exit();
}
check();
