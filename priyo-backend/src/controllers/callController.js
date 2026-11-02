const Call = require('../models/Call');

// POST /api/calls/decline-from-push  (no login: authorised by the signed token sent in the call push)
exports.declineFromPush = async (req, res) => {
  try {
    const jwt = require('jsonwebtoken');
    const { declineCallByReceiver } = require('../socket/socketHandler');
    const { token, callType } = req.body || {};
    if (!token) return res.status(400).json({ success: false, message: 'token required' });

    let payload;
    try {
      payload = jwt.verify(token, process.env.JWT_SECRET);
    } catch (e) {
      return res.status(401).json({ success: false, message: 'invalid or expired token' });
    }
    if (payload.purpose !== 'decline_call') {
      return res.status(401).json({ success: false, message: 'wrong token purpose' });
    }

    const io = req.app.get('io');
    const result = await declineCallByReceiver(io, {
      callId: payload.callId,
      receiverId: payload.receiverId,
      callType: callType || 'audio',
    });
    res.json({ success: true, ...result });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.getMyCalls = async (req, res) => {
  try {
    const calls = await Call.find({
      $or: [{ caller: req.user._id }, { receiver: req.user._id }]
    })
    .populate('caller', 'name avatar')
    .populate('receiver', 'name avatar')
    .sort({ createdAt: -1 })
    .limit(50);

    console.log(`[callController] Found ${calls.length} calls for user ${req.user._id}`);
    res.json({
      success: true,
      data: calls
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.deleteCall = async (req, res) => {
  try {
    const call = await Call.findById(req.params.id);
    if (!call) return res.status(404).json({ success: false, message: 'Call not found' });
    
    // Check ownership
    if (call.caller.toString() !== req.user._id.toString() && 
        call.receiver.toString() !== req.user._id.toString()) {
      return res.status(403).json({ success: false, message: 'Not authorized' });
    }

    await call.deleteOne();
    res.json({ success: true, message: 'Call history deleted' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.clearMyHistory = async (req, res) => {
  try {
    await Call.deleteMany({
      $or: [{ caller: req.user._id }, { receiver: req.user._id }]
    });
    res.json({ success: true, message: 'Call history cleared' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
