const FriendRequest = require('../models/FriendRequest');
const Conversation = require('../models/Conversation');
const Notification = require('../models/Notification');
const User = require('../models/User');
const { sendPushNotification } = require('../config/firebase');

// POST /api/requests/send
const sendRequest = async (req, res) => {
  try {
    const { to } = req.body;
    if (!to) return res.status(400).json({ message: 'Recipient required' });
    if (to === req.user._id.toString())
      return res.status(400).json({ message: 'Cannot send request to yourself' });

    const target = await User.findById(to);
    if (!target) return res.status(404).json({ message: 'User not found' });

    // Check if blocked
    if (target.blockedUsers.includes(req.user._id))
      return res.status(403).json({ message: 'Cannot send request' });

    // Check if already friends (conversation exists)
    const existingConvo = await Conversation.findOne({
      participants: { $all: [req.user._id, to] },
    });
    if (existingConvo) return res.status(409).json({ message: 'Already connected' });

    const existing = await FriendRequest.findOne({
      $or: [
        { from: req.user._id, to },
        { from: to, to: req.user._id },
      ],
    });
    if (existing) return res.status(409).json({ message: 'Request already exists' });

    const request = await FriendRequest.create({ from: req.user._id, to });
    await request.populate('from', 'name avatar');

    // Create notification + push
    await Notification.create({
      user: to,
      type: 'friend_request',
      title: 'New friend request',
      body: `${req.user.name} sent you a friend request`,
      data: { requestId: request._id, from: req.user._id },
    });
    await sendPushNotification(target.fcmToken, 'New Friend Request', `${req.user.name} wants to connect`, { type: 'friend_request' });

    // Emit via socket if connected (handled in socket layer)
    req.app.get('io')?.to(to).emit('friend_request', { request });

    res.status(201).json(request);
  } catch (err) {
    if (err.code === 11000) return res.status(409).json({ message: 'Request already sent' });
    res.status(500).json({ message: err.message });
  }
};

// POST /api/requests/accept/:id
const acceptRequest = async (req, res) => {
  try {
    const request = await FriendRequest.findById(req.params.id).populate('from', 'name avatar fcmToken');
    if (!request) return res.status(404).json({ message: 'Request not found' });
    if (request.to.toString() !== req.user._id.toString())
      return res.status(403).json({ message: 'Not authorized' });
    if (request.status !== 'pending')
      return res.status(400).json({ message: 'Request already processed' });

    request.status = 'accepted';
    await request.save();

    // Create conversation
    const conversation = await Conversation.create({
      participants: [request.from._id, request.to],
    });

    // Notify sender
    await Notification.create({
      user: request.from._id,
      type: 'request_accepted',
      title: 'Friend request accepted',
      body: `${req.user.name} accepted your friend request`,
      data: { conversationId: conversation._id },
    });
    await sendPushNotification(request.from.fcmToken, 'Request Accepted', `${req.user.name} accepted your request`);

    req.app.get('io')?.to(request.from._id.toString()).emit('request_accepted', { conversation });

    res.json({ message: 'Request accepted', conversation });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// POST /api/requests/reject/:id
const rejectRequest = async (req, res) => {
  try {
    const request = await FriendRequest.findById(req.params.id);
    if (!request || request.to.toString() !== req.user._id.toString())
      return res.status(404).json({ message: 'Request not found' });
    request.status = 'rejected';
    await request.save();
    res.json({ message: 'Request rejected' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// GET /api/requests
const getPendingRequests = async (req, res) => {
  try {
    const requests = await FriendRequest.find({ to: req.user._id, status: 'pending' })
      .populate('from', 'name avatar status isOnline')
      .sort('-createdAt');
    res.json(requests);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// GET /api/requests/sent
const getSentRequests = async (req, res) => {
  try {
    const requests = await FriendRequest.find({ from: req.user._id, status: 'pending' })
      .populate('to', 'name avatar status')
      .sort('-createdAt');
    res.json(requests);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

module.exports = { sendRequest, acceptRequest, rejectRequest, getPendingRequests, getSentRequests };
