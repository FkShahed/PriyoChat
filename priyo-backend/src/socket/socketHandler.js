const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Message = require('../models/Message');
const Conversation = require('../models/Conversation');
const { sendPushNotification } = require('../config/firebase');

// Map userId -> socketId for online tracking
const onlineUsers = new Map();

const setupSocket = (io) => {
  // Auth middleware for socket
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth?.token;
      if (!token) return next(new Error('Authentication error'));
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const user = await User.findById(decoded.id).select('-password');
      if (!user) return next(new Error('User not found'));
      socket.user = user;
      next();
    } catch (err) {
      next(new Error('Invalid token'));
    }
  });

  io.on('connection', async (socket) => {
    const userId = socket.user._id.toString();
    console.log(`🔌 User connected: ${socket.user.name} (${userId})`);

    // Track online status
    onlineUsers.set(userId, socket.id);
    socket.join(userId); // personal room

    // Mark user as online
    await User.findByIdAndUpdate(userId, { isOnline: true });
    io.emit('user_status', { userId, isOnline: true });

    // ─── Join conversation rooms ───────────────────────────────────
    const conversations = await Conversation.find({ participants: userId });
    conversations.forEach((c) => socket.join(c._id.toString()));

    // ─── Send Message ──────────────────────────────────────────────
    socket.on('send_message', async (data, callback) => {
      try {
        const { conversationId, text, images = [], isVoiceNote = false, voiceNoteUrl = '', voiceNoteDuration = 0 } = data;

        // Verify participant
        const conversation = await Conversation.findOne({
          _id: conversationId,
          participants: userId,
        }).populate('participants', 'name avatar fcmToken');

        if (!conversation) {
          return callback?.({ error: 'Conversation not found' });
        }

        const message = await Message.create({
          conversation: conversationId,
          sender: userId,
          text: text || '',
          images,
          isVoiceNote,
          voiceNoteUrl,
          voiceNoteDuration,
          status: 'sent',
        });

        await message.populate('sender', 'name avatar');

        // Update conversation lastMessage
        await Conversation.findByIdAndUpdate(conversationId, { lastMessage: message._id });

        // Emit to all in conversation
        io.to(conversationId).emit('new_message', message);

        // Send push to offline participants
        conversation.participants.forEach(async (participant) => {
          if (participant._id.toString() !== userId && !onlineUsers.has(participant._id.toString())) {
            await sendPushNotification(
              participant.fcmToken,
              socket.user.name,
              text || (images.length ? '📷 Photo' : '🎤 Voice note'),
              { type: 'new_message', conversationId }
            );
          }
        });

        callback?.({ message });
      } catch (err) {
        callback?.({ error: err.message });
      }
    });

    // ─── Message Delivered ─────────────────────────────────────────
    socket.on('message_delivered', async ({ messageId }) => {
      try {
        const msg = await Message.findByIdAndUpdate(
          messageId,
          { status: 'delivered' },
          { new: true }
        );
        if (msg) {
          io.to(msg.conversation.toString()).emit('message_status_updated', {
            messageId,
            status: 'delivered',
          });
        }
      } catch (err) {
        console.error('message_delivered error:', err.message);
      }
    });

    // ─── Message Seen ──────────────────────────────────────────────
    socket.on('message_seen', async ({ conversationId }) => {
      try {
        await Message.updateMany(
          { conversation: conversationId, sender: { $ne: userId }, status: { $ne: 'seen' } },
          { status: 'seen' }
        );
        io.to(conversationId).emit('messages_seen', { conversationId, seenBy: userId });
      } catch (err) {
        console.error('message_seen error:', err.message);
      }
    });

    // ─── Typing indicators ─────────────────────────────────────────
    socket.on('typing_start', ({ conversationId }) => {
      socket.to(conversationId).emit('typing_start', { conversationId, userId });
    });

    socket.on('typing_stop', ({ conversationId }) => {
      socket.to(conversationId).emit('typing_stop', { conversationId, userId });
    });

    // ─── WebRTC Signaling ──────────────────────────────────────────
    socket.on('call_offer', ({ to, offer, callType }) => {
      const targetSocket = onlineUsers.get(to);
      if (targetSocket) {
        io.to(targetSocket).emit('incoming_call', {
          from: userId,
          caller: { name: socket.user.name, avatar: socket.user.avatar },
          offer,
          callType, // 'audio' | 'video'
        });
      }
    });

    socket.on('call_answer', ({ to, answer }) => {
      const targetSocket = onlineUsers.get(to);
      if (targetSocket) {
        io.to(targetSocket).emit('call_answered', { from: userId, answer });
      }
    });

    socket.on('call_ice', ({ to, candidate }) => {
      const targetSocket = onlineUsers.get(to);
      if (targetSocket) {
        io.to(targetSocket).emit('call_ice', { from: userId, candidate });
      }
    });

    socket.on('call_reject', ({ to }) => {
      const targetSocket = onlineUsers.get(to);
      if (targetSocket) {
        io.to(targetSocket).emit('call_rejected', { from: userId });
      }
    });

    socket.on('call_end', ({ to }) => {
      const targetSocket = onlineUsers.get(to);
      if (targetSocket) {
        io.to(targetSocket).emit('call_ended', { from: userId });
      }
    });

    // ─── Disconnect ────────────────────────────────────────────────
    socket.on('disconnect', async () => {
      onlineUsers.delete(userId);
      await User.findByIdAndUpdate(userId, { isOnline: false, lastSeen: new Date() });
      io.emit('user_status', { userId, isOnline: false, lastSeen: new Date() });
      console.log(`🔌 User disconnected: ${socket.user.name}`);
    });
  });
};

module.exports = { setupSocket, onlineUsers };
