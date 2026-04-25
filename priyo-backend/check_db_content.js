
const mongoose = require('mongoose');
require('dotenv').config({ path: '/media/shahed/Personal/Skills/App Development/React_Native/PriyoChat/priyo-backend/.env' });

async function checkDB() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    const count = await mongoose.connection.db.collection('calls').countDocuments();
    console.log('Total calls in DB:', count);
    
    const users = await mongoose.connection.db.collection('users').find().toArray();
    console.log('Total users in DB:', users.length);
    if (users.length > 0) {
        console.log('Sample User ID:', users[0]._id);
    }

    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

checkDB();
