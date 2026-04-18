const mongoose = require('mongoose');

const conversationSchema = new mongoose.Schema(
  {
    participants: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
      },
    ],
    theme: {
      type: String,
      enum: ['ClassicBlue', 'DarkNeon', 'SoftPurple', 'MinimalWhite', 'OceanGlass'],
      default: 'ClassicBlue',
    },
    lastMessage: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Message',
      default: null,
    },
    isActive: {
      type: Boolean,
      default: true, // becomes true after friend request accepted
    },
    unreadCount: {
      type: Map,
      of: Number,
      default: {},
    },
  },
  { timestamps: true }
);

// Ensure no duplicate conversations between same two users
conversationSchema.index({ participants: 1 });

module.exports = mongoose.model('Conversation', conversationSchema);
