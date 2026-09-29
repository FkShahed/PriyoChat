const Conversation = require('../models/Conversation');
const Message = require('../models/Message');
const User = require('../models/User');
const Notification = require('../models/Notification');
const { sendPushNotification } = require('../config/firebase');

// GET /api/conversations - list my conversations
const getConversations = async (req, res) => {
  try {
    const conversations = await Conversation.find({
      participants: req.user._id,
      isActive: true,
    })
      .populate('participants', 'name avatar isOnline lastSeen status')
      .populate('lastMessage')
      .sort('-updatedAt');

    res.json(conversations);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// GET /api/conversations/:id/messages - paginated messages
const getMessages = async (req, res) => {
  try {
    const { page = 1, limit = 30 } = req.query;
    const conversation = await Conversation.findById(req.params.id);
    if (!conversation || !conversation.participants.includes(req.user._id))
      return res.status(403).json({ message: 'Not authorized' });

    const clearedAt = conversation.clearedAt && conversation.clearedAt.get(req.user._id.toString());
    const query = { conversation: req.params.id };
    if (clearedAt) {
      query.createdAt = { $gt: clearedAt };
    }

    const messages = await Message.find(query)
      .populate('sender', 'name avatar')
      .populate({ path: 'replyTo', select: 'text images sender isVoiceNote callData isDeleted', populate: { path: 'sender', select: 'name' } })
      .sort('-createdAt')
      .skip((page - 1) * limit)
      .limit(Number(limit));

    const total = await Message.countDocuments(query);

    res.json({
      messages: messages.reverse(),
      page: Number(page),
      totalPages: Math.ceil(total / limit),
      total,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// PUT /api/conversations/:id/theme
const updateTheme = async (req, res) => {
  try {
    const { theme } = req.body;
    const validThemes = ['ClassicBlue', 'DarkNeon', 'SoftPurple', 'MinimalWhite', 'OceanGlass'];
    if (!validThemes.includes(theme))
      return res.status(400).json({ message: 'Invalid theme' });

    const conversation = await Conversation.findOneAndUpdate(
      { _id: req.params.id, participants: req.user._id },
      { theme },
      { new: true }
    );
    if (!conversation) return res.status(404).json({ message: 'Conversation not found' });

    // Notify other participant about theme change
    req.app.get('io')?.to(req.params.id).emit('theme_changed', { conversationId: req.params.id, theme });

    res.json(conversation);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// DELETE /api/conversations/messages/:msgId
const deleteMessage = async (req, res) => {
  try {
    const message = await Message.findById(req.params.msgId);
    if (!message) return res.status(404).json({ message: 'Message not found' });
    if (message.sender.toString() !== req.user._id.toString())
      return res.status(403).json({ message: 'Can only delete your own messages' });

    message.isDeleted = true;
    message.deletedAt = new Date();
    message.text = '';
    message.images = [];
    await message.save();

    req.app.get('io')?.to(message.conversation.toString()).emit('message_deleted', {
      messageId: message._id,
      conversationId: message.conversation,
    });

    res.json({ message: 'Message deleted' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// POST /api/conversations/messages/:msgId/react
const reactToMessage = async (req, res) => {
  try {
    const { emoji } = req.body;
    const message = await Message.findById(req.params.msgId);
    if (!message) return res.status(404).json({ message: 'Message not found' });

    const existingIdx = message.reactions.findIndex(
      (r) => r.user.toString() === req.user._id.toString()
    );

    if (existingIdx > -1) {
      if (message.reactions[existingIdx].emoji === emoji) {
        message.reactions.splice(existingIdx, 1); // toggle off
      } else {
        message.reactions[existingIdx].emoji = emoji; // change reaction
      }
    } else {
      message.reactions.push({ user: req.user._id, emoji });
    }

    await message.save();
    req.app.get('io')?.to(message.conversation.toString()).emit('message_reacted', {
      messageId: message._id,
      conversationId: message.conversation,
      reactions: message.reactions,
    });

    res.json(message.reactions);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// GET /api/conversations/:id/search?q=
const searchMessages = async (req, res) => {
  try {
    const { q } = req.query;
    if (!q) return res.json([]);
    const conversation = await Conversation.findById(req.params.id);
    const clearedAt = conversation?.clearedAt && conversation.clearedAt.get(req.user._id.toString());
    const query = {
      conversation: req.params.id,
      text: { $regex: q, $options: 'i' },
      isDeleted: false,
    };
    if (clearedAt) {
      query.createdAt = { $gt: clearedAt };
    }

    const messages = await Message.find(query)
      .populate('sender', 'name avatar')
      .sort('-createdAt')
      .limit(20);
    res.json(messages);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// POST /api/conversations/messages/:msgId/report
const reportMessage = async (req, res) => {
  try {
    const { reason, details } = req.body;
    const message = await Message.findById(req.params.msgId);
    if (!message) return res.status(404).json({ message: 'Message not found' });

    const Report = require('../models/Report');
    const report = await Report.create({
      reportedBy: req.user._id,
      reportedUser: message.sender,
      message: message._id,
      reason,
      details,
    });
    res.status(201).json({ message: 'Report submitted', report });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// PUT /api/users/:id/block
const blockUser = async (req, res) => {
  try {
    const targetId = req.params.id;
    const user = await User.findById(req.user._id);
    const isBlocked = user.blockedUsers.includes(targetId);

    if (isBlocked) {
      user.blockedUsers = user.blockedUsers.filter((u) => u.toString() !== targetId);
    } else {
      user.blockedUsers.push(targetId);
    }
    await user.save();
    res.json({ blocked: !isBlocked });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// DELETE /api/conversations/:id/clear
const clearHistory = async (req, res) => {
  try {
    const conversation = await Conversation.findById(req.params.id);
    if (!conversation || !conversation.participants.includes(req.user._id)) {
      return res.status(403).json({ message: 'Not authorized' });
    }

    if (!conversation.clearedAt) {
      conversation.clearedAt = new Map();
    }
    conversation.clearedAt.set(req.user._id.toString(), new Date());
    await conversation.save();

    res.json({ message: 'History cleared' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

const deleteConversation = async (req, res) => {
  try {
    const conversation = await Conversation.findById(req.params.id);
    if (!conversation || !conversation.participants.includes(req.user._id)) {
      return res.status(403).json({ message: 'Not authorized' });
    }
    
    // Delete all messages associated with this conversation
    await Message.deleteMany({ conversation: conversation._id });
    
    // Delete the conversation
    await Conversation.findByIdAndDelete(conversation._id);
    
    res.json({ success: true, message: 'Conversation deleted' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

module.exports = {
  getConversations,
  getMessages,
  updateTheme,
  deleteMessage,
  reactToMessage,
  searchMessages,
  reportMessage,
  blockUser,
  clearHistory,
  deleteConversation,
};
