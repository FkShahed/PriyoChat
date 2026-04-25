const Call = require('../models/Call');

exports.getMyCalls = async (req, res) => {
  try {
    const calls = await Call.find({
      $or: [{ caller: req.user._id }, { receiver: req.user._id }]
    })
    .populate('caller', 'name avatar')
    .populate('receiver', 'name avatar')
    .sort({ createdAt: -1 })
    .limit(50);

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
