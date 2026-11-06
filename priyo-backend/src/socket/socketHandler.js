const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Message = require('../models/Message');
const Conversation = require('../models/Conversation');
const Call = require('../models/Call');
const { sendPushNotification, sendExpoPushBatch } = require('../config/firebase');

// Map userId -> socketId for online tracking
const onlineUsers = new Map();
// Active pending calls in-memory: callId -> { callId, from, to, offer, callType, caller }
const activeCalls = new Map();

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

    // When this user comes online / reconnects socket, any messages sent to them
    // that were sitting in 'sent' status should now be updated to 'delivered'!
    (async () => {
      try {
        const userConversations = await Conversation.find({ participants: userId }).select('_id');
        const convoIds = userConversations.map(c => c._id);
        const undeliveredMsgs = await Message.find({
          conversation: { $in: convoIds },
          sender: { $ne: userId },
          status: 'sent',
        }).select('_id conversation');

        if (undeliveredMsgs.length > 0) {
          const ids = undeliveredMsgs.map(m => m._id);
          await Message.updateMany({ _id: { $in: ids } }, { status: 'delivered' });
          undeliveredMsgs.forEach(m => {
            io.to(m.conversation.toString()).emit('message_status_updated', {
              messageId: m._id,
              conversationId: m.conversation.toString(),
              status: 'delivered',
            });
          });
        }
      } catch (e) {
        console.warn('[socketHandler] Batch mark delivered error on connect:', e.message);
      }
    })();

    // ── Check if there are any active pending call offers for this user ──
    const now = Date.now();
    for (const [cId, activeCall] of activeCalls.entries()) {
      // If call is older than 45 seconds or caller has disconnected, discard it!
      const isExpired = (now - (activeCall.createdAt || 0)) > 45000;
      const callerOnline = onlineUsers.has(String(activeCall.from));

      if (isExpired || !callerOnline) {
        console.log(`[socketHandler] Pruning dead call ${cId} (expired: ${isExpired}, callerOnline: ${callerOnline})`);
        activeCalls.delete(cId);
        continue;
      }

      // Already answered (ongoing or just ended): never replay it as a new incoming call
      if (activeCall.answered) continue;

      if (activeCall.to === userId) {
        console.log(`[socketHandler] User ${userId} connected with VALID pending call ${cId}. Emitting incoming_call.`);
        socket.emit('incoming_call', activeCall);
        if (Array.isArray(activeCall.iceCandidates) && activeCall.iceCandidates.length > 0) {
          console.log(`[socketHandler] Forwarding ${activeCall.iceCandidates.length} buffered early ICE candidates to connected user ${userId}`);
          activeCall.iceCandidates.forEach((candObj) => {
            socket.emit('call_ice', candObj);
          });
        }
      }
    }

    // ─── Join conversation rooms ───────────────────────────────────
    const conversations = await Conversation.find({ participants: userId });
    conversations.forEach((c) => socket.join(c._id.toString()));

    // ─── Send Message ──────────────────────────────────────────────
    socket.on('send_message', async (data, callback) => {
      try {
        const { conversationId, text, images = [], isVoiceNote = false, voiceNoteUrl = '', voiceNoteDuration = 0, replyTo = null } = data;

        // Verify participant
        const conversation = await Conversation.findOne({
          _id: conversationId,
          participants: userId,
        }).populate('participants', 'name avatar fcmToken');

        if (!conversation) {
          return callback?.({ error: 'Conversation not found' });
        }

        // Check if any recipient is currently online
        const otherParticipants = conversation.participants.filter(
          (p) => p._id.toString() !== userId
        );
        const isRecipientOnline = otherParticipants.some(
          (p) => onlineUsers.has(p._id.toString())
        );

        const message = await Message.create({
          conversation: conversationId,
          sender: userId,
          text: text || '',
          images,
          isVoiceNote,
          voiceNoteUrl,
          voiceNoteDuration,
          status: isRecipientOnline ? 'delivered' : 'sent',
          replyTo,
        });

        await message.populate([
          { path: 'sender', select: 'name avatar' },
          { path: 'replyTo', select: 'text images sender isVoiceNote callData isDeleted', populate: { path: 'sender', select: 'name' } }
        ]);

        // Update conversation lastMessage
        await Conversation.findByIdAndUpdate(conversationId, { lastMessage: message._id });

        // Emit to conversation room AND individually to all participants' personal rooms
        // This ensures users receive the message instantly even if they haven't explicitly joined the conversation room yet!
        io.to(conversationId).emit('new_message', message);
        conversation.participants.forEach((p) => {
          const pId = p._id ? p._id.toString() : p.toString();
          if (pId !== userId) {
            io.to(pId).emit('new_message', message);
          }
        });

        // Send push to offline participants
        conversation.participants.forEach(async (participant) => {
          if (participant._id.toString() !== userId && !onlineUsers.has(participant._id.toString())) {
            const pushResult = await sendPushNotification(
              participant.fcmToken,
              socket.user.name,
              text || (images.length ? '📷 Photo' : '🎤 Voice note'),
              {
                type: 'message',
                conversationId,
                senderId: userId,
                senderName: socket.user.name,
                avatarUrl: socket.user.avatar || '',
                message: JSON.stringify(message),
              }
            );

            // If push notification was successfully delivered to Google FCM / Expo APNS servers,
            // this confirms the device has internet/data on and the push payload was dispatched.
            // Automatically promote message status from 'sent' to 'delivered' so the sender sees double-checks!
            if (pushResult && !pushResult.error) {
              try {
                const currentMsg = await Message.findById(message._id);
                if (currentMsg && currentMsg.status === 'sent') {
                  currentMsg.status = 'delivered';
                  await currentMsg.save();
                  io.to(conversationId).emit('message_status_updated', {
                    messageId: message._id,
                    conversationId,
                    status: 'delivered',
                  });
                }
              } catch (e) {
                console.warn('[socketHandler] Push-delivered status update error:', e.message);
              }
            }
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
            conversationId: msg.conversation.toString(),
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
        const seenAt = new Date();
        await Message.updateMany(
          { conversation: conversationId, sender: { $ne: userId }, status: { $ne: 'seen' } },
          { status: 'seen', seenAt }
        );
        io.to(conversationId).emit('messages_seen', {
          conversationId,
          seenBy: userId,
          seenAt: seenAt.toISOString(),
        });
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

    // Helper to sanitize Mongoose ObjectIds coming from stringified payloads
    const cleanId = (id) => {
      if (!id) return null;
      if (typeof id === 'object' && id !== null) {
        id = id._id || id.id || id.userId || id;
      }
      let str = String(id).trim();
      while ((str.startsWith('"') && str.endsWith('"')) || (str.startsWith("'") && str.endsWith("'"))) {
        str = str.slice(1, -1).trim();
      }
      return str.match(/^[0-9a-fA-F]{24}$/) ? str : null;
    };

    // ─── WebRTC Signaling ──────────────────────────────────────────
    socket.on('call_offer', async ({ to, offer, callType }, callback) => {
      const targetRoom = cleanId(to) || to;
      console.log(`📞 Call Offer from ${socket.user?.name} (${userId}) to ${targetRoom}`);
      
      // Generate callId synchronously so activeCalls is populated IMMEDIATELY
      // without losing any early ICE candidates to DB latency!
      const mongoose = require('mongoose');
      const callObjectId = new mongoose.Types.ObjectId();
      const callId = callObjectId.toString();

      const activePayload = {
        from: userId,
        callId,
        caller: { _id: userId, name: socket.user?.name, avatar: socket.user?.avatar },
        offer,
        callType,
        to: targetRoom,
        createdAt: Date.now(),
        iceCandidates: [],
      };

      // A new call between these two users supersedes any older one still cached (e.g. the app
      // was swiped away mid-call and its call_end never arrived). Otherwise the old, already
      // answered call gets replayed to the receiver on reconnect and the new call fails.
      // Only entries between this exact pair are touched: other users' calls are never affected.
      for (const [cId, c] of activeCalls.entries()) {
        const pair = [String(c.from), String(c.to)];
        if (pair.includes(String(userId)) && pair.includes(String(targetRoom))) {
          console.log(`[socketHandler] New call supersedes older call ${cId} between same users`);
          activeCalls.delete(cId);
        }
      }

      // 1. Immediately store in activeCalls map
      activeCalls.set(callId, activePayload);
      setTimeout(() => {
        if (activeCalls.has(callId)) {
          console.log(`[socketHandler] Call ${callId} timed out after 45s — removing from activeCalls`);
          activeCalls.delete(callId);
        }
        // Still "pending" after 45 s means nobody answered: record it as missed (answered calls are already "in-progress").
        Call.updateOne({ _id: callObjectId, status: 'pending' }, { status: 'missed', endedAt: new Date() }).catch(() => {});
      }, 45000);

      // 2. Return callId immediately to caller
      callback?.({ callId });

      // 3. Emit incoming_call to receiver synchronously
      io.to(targetRoom).emit('incoming_call', activePayload);

      // 4. Asynchronously persist Call record in MongoDB without blocking signaling
      Call.create({
        _id: callObjectId,
        caller: userId,
        receiver: targetRoom,
        type: callType,
        status: 'pending'
      }).then(() => {
        console.log(`[socketHandler] Call record created in DB: ${callId}`);
      }).catch((err) => {
        console.error('[socketHandler] Error creating call record:', err.message);
      });

      // ── Send Push Notification to wake up the device if app is backgrounded/killed ──
      try {
        const receiver = await User.findById(targetRoom).select('fcmToken');
        if (receiver && receiver.fcmToken) {
          const t = receiver.fcmToken;
          const title = callType === 'video' ? '📹 Incoming Video Call' : '📞 Incoming Call';
          const callerName = socket.user.name || 'PriyoChat User';
          const body = `${callerName} is calling you...`;
          // Short-lived signed token + URL so the phone's native "Decline" button can reject this
          // call over plain HTTPS without opening the app (see callController.declineFromPush).
          let declineToken = '';
          try {
            declineToken = jwt.sign(
              { purpose: 'decline_call', callId: String(callId), receiverId: String(targetRoom) },
              process.env.JWT_SECRET,
              { expiresIn: '3m' }
            );
          } catch (e) {}
          const declineUrl = `${process.env.PUBLIC_API_URL || 'https://138.2.92.182.nip.io'}/api/calls/decline-from-push`;

          const pushData = {
            type: 'call',
            declineToken,
            declineUrl,
            callId: callId ? String(callId) : '',
            callerName,
            caller: { _id: userId, name: callerName, avatar: socket.user.avatar },
            callType,
            callerId: userId,
            senderId: userId,
          };

          // Fast answer from the notification: ship the (small) SDP offer inside the push so the
          // phone does not have to wait for a socket connection just to fetch it. FCM data limit is
          // 4 KB in total, so only attach it when there is plenty of room (audio offers; video
          // offers are usually too big and keep using the normal socket fetch).
          try {
            if (offer && callId) {
              const withOffer = { ...pushData, offer };
              const approxBytes = Buffer.byteLength(JSON.stringify({ ...withOffer, title, body }), 'utf8');
              if (approxBytes <= 3300) {
                pushData.offer = offer;
              }
            }
          } catch (e) {}

          await sendPushNotification(t, title, body, pushData);
          console.log(`[socketHandler] Sent Call Push Notification with payload to ${targetRoom}`);
        }
      } catch (e) {
        console.error('[socketHandler] Error sending call push notification:', e.message);
      }
    });

    socket.on('get_call_offer', ({ callId }, callback) => {
      const validId = cleanId(callId);
      let callObj = validId ? activeCalls.get(validId) : null;
      if (!callObj) {
        // Fallback: search activeCalls for any call where receiver is this user
        for (const [cId, activeCall] of activeCalls.entries()) {
          if (activeCall.to === userId || activeCall.from === userId) {
            callObj = activeCall;
            break;
          }
        }
      }
      if (callObj && callObj.offer) {
        console.log(`[socketHandler] Serving cached call offer for call ${callObj.callId} to ${userId}`);
        callback?.({
          offer: callObj.offer,
          callId: callObj.callId,
          from: callObj.from,
          caller: callObj.caller,
          callType: callObj.callType,
          iceCandidates: callObj.iceCandidates || [],
        });
      } else {
        callback?.({ error: 'Call offer not found or expired' });
      }
    });

    socket.on('call_ringing', ({ to }) => {
      const targetRoom = cleanId(to) || to;
      io.to(targetRoom).emit('call_ringing', { from: userId });
    });

    socket.on('call_answer', async ({ to, answer, callId }) => {
      const targetRoom = cleanId(to) || to;
      console.log(`📞 Call Answer received from ${socket.user?.name} (${userId}) to ${targetRoom}, callId: ${callId}`);
      try {
        const validId = cleanId(callId);
        if (validId) {
          // Answered: it must never be replayed as a new incoming_call on reconnect
          const answeredCall = activeCalls.get(validId);
          if (answeredCall) answeredCall.answered = true;
          // Keep activeCalls entry for 60s so late-arriving ICE candidates or renegotiations succeed
          setTimeout(() => { activeCalls.delete(validId); }, 60000);
          await Call.findByIdAndUpdate(validId, { status: 'in-progress' });
        }
      } catch (err) {
        console.error('[socketHandler] call_answer error:', err.message);
      }
      io.to(targetRoom).emit('call_answered', { from: userId, answer, callId });
    });

    socket.on('call_ice', ({ to, candidate, callId }) => {
      const targetRoom = cleanId(to) || to;
      // Buffer into the RIGHT call: exact callId first; otherwise (early candidates sent before the
      // caller knows its callId) the NEWEST call between these two users — never an older one.
      let bufferCall = callId ? activeCalls.get(cleanId(callId)) : null;
      if (!bufferCall) {
        for (const activeCall of activeCalls.values()) {
          const pair = [String(activeCall.from), String(activeCall.to)];
          if (pair.includes(String(userId)) && pair.includes(String(targetRoom))) {
            if (!bufferCall || (activeCall.createdAt || 0) > (bufferCall.createdAt || 0)) bufferCall = activeCall;
          }
        }
      }
      if (bufferCall) {
        if (!bufferCall.iceCandidates) bufferCall.iceCandidates = [];
        bufferCall.iceCandidates.push({ from: userId, candidate, callId: bufferCall.callId });
      }
      io.to(targetRoom).emit('call_ice', { from: userId, candidate, callId });
    });

    // ICE restart relay: forwards a fresh offer/answer between the two peers of an ongoing call.
    // Pure relay — no DB writes, no ringing, no call records (unlike call_offer).
    socket.on('call_renegotiate', ({ to, offer, callId } = {}) => {
      const targetRoom = cleanId(to) || to;
      if (!targetRoom || !offer) return;
      io.to(targetRoom).emit('call_renegotiate', { from: userId, offer, callId });
    });

    socket.on('call_renegotiate_answer', ({ to, answer, callId } = {}) => {
      const targetRoom = cleanId(to) || to;
      if (!targetRoom || !answer) return;
      io.to(targetRoom).emit('call_renegotiate_answer', { from: userId, answer, callId });
    });

    socket.on('call_reject', async ({ to, callId, callType = 'audio', reason }) => {
      // If a specific client/tab is busy in a call, notify the caller that user is busy
      // but do NOT drop the call for other ringing tabs.
      if (reason === 'busy') {
        console.log(`[socketHandler] User ${userId} is busy — notifying caller ${to}`);
        io.to(to).emit('call_busy', { from: userId, message: 'User is busy on another call' });
        return;
      }

      try {
        const validId = cleanId(callId);
        if (validId) {
          activeCalls.delete(validId);
          await Call.findByIdAndUpdate(validId, { status: 'rejected', endedAt: new Date() });
        }
      } catch (err) {
        console.error('[socketHandler] call_reject error:', err.message);
      }
      io.to(to).emit('call_rejected', { from: userId, reason });

      // ── Create missed call message in conversation ──
      try {
        const convo = await Conversation.findOne({
          participants: { $all: [userId, to] }
        });
        if (convo) {
          const callMsg = await Message.create({
            conversation: convo._id,
            sender: to, // the caller gets the missed call record
            text: '',
            callData: { callType: callType || 'audio', duration: 0, status: 'rejected' },
          });
          await callMsg.populate('sender', 'name avatar');
          await Conversation.findByIdAndUpdate(convo._id, { lastMessage: callMsg._id });
          const payload = { ...callMsg.toObject(), conversationId: convo._id.toString() };
          io.to(userId).emit('new_message', payload);
          io.to(to).emit('new_message', payload);
        }
      } catch (e) {
        console.error('[socketHandler] reject call message error:', e.message);
      }
    });

    socket.on('call_end', async ({ to, callId, duration = 0, callType = 'audio' }) => {
      try {
        const validId = cleanId(callId);
        if (validId) {
          activeCalls.delete(validId);
          // A call that was never answered (still "pending") is a missed call, not a completed one
          const before = await Call.findById(validId).select('status duration');
          const neverAnswered = !!before && before.status === 'pending';
          // a second call_end (from the other phone) must not turn an already missed / rejected call into "completed"
          const alreadyFinal = !!before && (before.status === 'missed' || before.status === 'rejected');
          await Call.findByIdAndUpdate(validId, { 
            status: neverAnswered ? 'missed' : (alreadyFinal ? before.status : 'completed'), 
            endedAt: new Date(),
            // both phones send call_end; keep the longer duration so a later 0 never wipes the real talk time
            duration: Math.max(Number(before && before.duration) || 0, Number(duration) || 0)
          });
        }
        // Also cleanup any active call from this caller
        for (const [cId, activeCall] of activeCalls.entries()) {
          if (activeCall.from === userId) {
            activeCalls.delete(cId);
          }
        }
      } catch (err) {
        console.error('[socketHandler] call_end error:', err.message);
      }
      io.to(to).emit('call_ended', { from: userId });

      // If the call never connected (caller cancelled while ringing), silently tell the other
      // phone's native service to remove its incoming-call notification / ringtone.
      // Fire-and-forget: never blocks or alters the normal call_end flow.
      if (Number(duration) === 0) {
        (async () => {
          try {
            const other = await User.findById(cleanId(to) || to).select('fcmToken');
            if (other && other.fcmToken) {
              await sendPushNotification(other.fcmToken, '', '', {
                type: 'call_cancel',
                callId: callId ? String(callId) : '',
              });
            }
          } catch (e) {
            console.warn('[socketHandler] call_cancel push error:', e.message);
          }
        })();
      }

      // ── Create call message in conversation ──
      try {
        const convo = await Conversation.findOne({
          participants: { $all: [userId, to] }
        });
        if (convo) {
          const isZeroDuration = Number(duration) === 0;
          const callMsg = await Message.create({
            conversation: convo._id,
            sender: userId,
            text: '',
            callData: {
              callType: callType || 'audio',
              duration: Number(duration) || 0,
              status: isZeroDuration ? 'rejected' : 'completed',
            },
          });
          await callMsg.populate('sender', 'name avatar');
          await Conversation.findByIdAndUpdate(convo._id, { lastMessage: callMsg._id });
          const payload = { ...callMsg.toObject(), conversationId: convo._id.toString() };
          io.to(userId).emit('new_message', payload);
          io.to(to).emit('new_message', payload);
        }
      } catch (e) {
        console.error('[socketHandler] call message error:', e.message);
      }
    });

    // ─── Disconnect ────────────────────────────────────────────────
    socket.on('disconnect', async () => {
      // The same user can briefly have 2 sockets (reconnect, app relaunch, second browser tab).
      // When an OLD socket finally drops, the user is still online on the new one: do NOT mark
      // them offline and do NOT purge their just-started call (that silently broke new calls —
      // the receiver never got the caller's ICE candidates).
      const remaining = io.sockets.adapter.rooms.get(userId);
      if (remaining && remaining.size > 0) {
        const stillThere = [...remaining][0];
        if (onlineUsers.get(userId) === socket.id) onlineUsers.set(userId, stillThere);
        console.log(`🔌 Old socket closed for ${socket.user.name} (still online on another socket)`);
        return;
      }
      onlineUsers.delete(userId);
      // Purge any pending call originated from this disconnected user
      for (const [cId, activeCall] of activeCalls.entries()) {
        if (activeCall.from === userId) {
          activeCalls.delete(cId);
        }
      }
      await User.findByIdAndUpdate(userId, { isOnline: false, lastSeen: new Date() });
      io.emit('user_status', { userId, isOnline: false, lastSeen: new Date() });
      console.log(`🔌 User disconnected: ${socket.user.name}`);
    });
  });
};

/**
 * Decline an incoming call WITHOUT a socket connection (used by the native "Decline" button on the
 * incoming-call notification, which works even when the app is completely closed).
 * Mirrors the behaviour of the socket 'call_reject' handler: caller gets 'call_rejected' and a
 * rejected-call message is added to the conversation.
 */
const declineCallByReceiver = async (io, { callId, receiverId, callType = 'audio' }) => {
  const isObjId = (v) => typeof v === 'string' && /^[0-9a-fA-F]{24}$/.test(v);
  if (!isObjId(callId) || !isObjId(receiverId)) return { ok: false, reason: 'bad_ids' };

  // Find caller: in-memory active call first, DB record as fallback
  const active = activeCalls.get(callId);
  let callerId = active ? String(active.from) : null;
  let dbCall = null;
  try {
    dbCall = await Call.findById(callId);
  } catch (e) {}
  if (!callerId && dbCall) callerId = String(dbCall.caller);
  if (!callerId) return { ok: false, reason: 'call_not_found' };

  // Only the receiver of this call may decline it, and only while it is still pending
  if (active && String(active.to) !== String(receiverId)) return { ok: false, reason: 'not_receiver' };
  if (dbCall && String(dbCall.receiver) !== String(receiverId)) return { ok: false, reason: 'not_receiver' };
  if (dbCall && dbCall.status !== 'pending') return { ok: false, reason: 'not_pending' };

  activeCalls.delete(callId);
  try {
    await Call.findByIdAndUpdate(callId, { status: 'rejected', endedAt: new Date() });
  } catch (e) {
    console.error('[socketHandler] declineCallByReceiver update error:', e.message);
  }

  io.to(callerId).emit('call_rejected', { from: receiverId, reason: 'declined' });

  try {
    const convo = await Conversation.findOne({ participants: { $all: [receiverId, callerId] } });
    if (convo) {
      const callMsg = await Message.create({
        conversation: convo._id,
        sender: callerId,
        text: '',
        callData: { callType: callType || 'audio', duration: 0, status: 'rejected' },
      });
      await callMsg.populate('sender', 'name avatar');
      await Conversation.findByIdAndUpdate(convo._id, { lastMessage: callMsg._id });
      const payload = { ...callMsg.toObject(), conversationId: convo._id.toString() };
      io.to(receiverId).emit('new_message', payload);
      io.to(callerId).emit('new_message', payload);
    }
  } catch (e) {
    console.error('[socketHandler] declineCallByReceiver message error:', e.message);
  }
  return { ok: true };
};

module.exports = { setupSocket, onlineUsers, declineCallByReceiver };
