const User = require('../models/User');
const cloudinary = require('../config/cloudinary');
const streamifier = require('streamifier');

// GET /api/users/search?q=
const searchUsers = async (req, res) => {
  try {
    const { q } = req.query;
    if (!q) {
      const suggestions = await User.find({ _id: { $ne: req.user._id }, isBlocked: false })
        .sort({ lastSeen: -1 })
        .select('name avatar status isOnline lastSeen')
        .limit(10);
      return res.json(suggestions);
    }
    const users = await User.find({
      $or: [
        { name: { $regex: q, $options: 'i' } },
        { email: { $regex: q, $options: 'i' } },
      ],
      _id: { $ne: req.user._id },
      isBlocked: false,
    })
      .select('name avatar status isOnline lastSeen')
      .limit(20);
    res.json(users);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// GET /api/users/:id
const getUserById = async (req, res) => {
  try {
    const user = await User.findById(req.params.id).select('-password -fcmToken');
    if (!user) return res.status(404).json({ message: 'User not found' });
    res.json(user);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// PUT /api/users/profile
const updateProfile = async (req, res) => {
  try {
    const { name, status } = req.body;
    const update = { profileSetup: true };
    if (name) update.name = name;
    if (status !== undefined) update.status = status;

    if (req.file) {
      // Upload avatar to Cloudinary via stream
      const uploadResult = await new Promise((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
          { folder: 'priyochat/avatars', transformation: [{ width: 400, height: 400, crop: 'fill' }] },
          (err, result) => (err ? reject(err) : resolve(result))
        );
        streamifier.createReadStream(req.file.buffer).pipe(stream);
      });
      // Delete old avatar if exists
      if (req.user.avatarPublicId) {
        await cloudinary.uploader.destroy(req.user.avatarPublicId).catch(() => {});
      }
      update.avatar = uploadResult.secure_url;
      update.avatarPublicId = uploadResult.public_id;
    }

    const user = await User.findByIdAndUpdate(req.user._id, update, { new: true });
    res.json(user);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// PUT /api/users/fcm-token
const updateFcmToken = async (req, res) => {
  try {
    const { fcmToken } = req.body;
    await User.findByIdAndUpdate(req.user._id, { fcmToken });
    res.json({ message: 'FCM token updated' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// GET /api/users/me
const getMe = async (req, res) => {
  res.json(req.user);
};

module.exports = { searchUsers, getUserById, updateProfile, updateFcmToken, getMe };
