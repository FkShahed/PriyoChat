const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
require('dotenv').config({ path: './priyo-backend/.env' });
const User = require('./priyo-backend/src/models/User');

async function test() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    
    // Find an admin user to generate token
    const adminUser = await User.findOne({ role: 'admin' });
    if (!adminUser) throw new Error('Admin not found');
    const token = jwt.sign({ id: adminUser._id }, process.env.JWT_SECRET, { expiresIn: '1h' });
    
    // Find a warned user
    const warnedUser = await User.findOne({ warnings: { $gt: 0 } });
    if (!warnedUser) {
      console.log('No warned users found');
      process.exit(0);
    }
    console.log(`Testing remove-warning on user ${warnedUser.name} (${warnedUser._id})`);
    
    const axios = require('axios');
    const response = await axios.put(`http://localhost:4444/api/admin/users/${warnedUser._id}/remove-warning`, {}, {
      headers: { Authorization: `Bearer ${token}` }
    });
    
    console.log('Response:', response.data);
  } catch (err) {
    console.error('Error:', err.response ? err.response.data : err.message);
  } finally {
    process.exit();
  }
}
test();
