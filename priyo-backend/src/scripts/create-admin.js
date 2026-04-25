require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../models/User');

async function createAdmin() {
  try {
    const mongoUri = process.env.MONGO_URI;
    if (!mongoUri) {
      console.error('MONGO_URI not found in .env');
      process.exit(1);
    }

    await mongoose.connect(mongoUri);
    console.log('✅ Connected to MongoDB');

    const email = process.argv[2];
    const password = process.argv[3];

    if (!email || !password) {
      console.log('Usage: node create-admin.js <email> <password>');
      process.exit(1);
    }

    let user = await User.findOne({ email });
    if (user) {
      console.log(`Found existing user: ${email}. Updating to admin...`);
      user.role = 'admin';
      user.password = password; // Will be hashed by pre-save hook
      await user.save();
      console.log(`✅ User ${email} is now an admin!`);
    } else {
      console.log(`Creating new admin account: ${email}...`);
      await User.create({
        name: 'Super Admin',
        email,
        password,
        role: 'admin',
        profileSetup: true
      });
      console.log(`✅ New admin account created successfully: ${email}`);
    }
    process.exit(0);
  } catch (err) {
    console.error('❌ Error:', err.message);
    process.exit(1);
  }
}

createAdmin();
