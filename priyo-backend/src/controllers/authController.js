const jwt = require('jsonwebtoken');
const User = require('../models/User');

const generateToken = (id) =>
  jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN || '30d' });

// POST /api/auth/signup
const signup = async (req, res) => {
  try {
    const { name, email, password } = req.body;
    if (!name || !email || !password)
      return res.status(400).json({ message: 'All fields required' });

    const exists = await User.findOne({ email });
    if (exists) return res.status(409).json({ message: 'Email already in use' });

    const user = await User.create({ name, email, password });
    const token = generateToken(user._id);
    res.status(201).json({ user, token });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// POST /api/auth/login
const login = async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ message: 'All fields required' });

    const user = await User.findOne({ email }).select('+password');
    if (!user || !(await user.comparePassword(password)))
      return res.status(401).json({ message: 'Invalid email or password' });

    if (user.isBlocked) return res.status(403).json({ message: 'Account banned', reason: user.moderationReason });
    if (user.isSuspended) return res.status(403).json({ message: 'Account suspended', reason: user.moderationReason });

    const token = generateToken(user._id);
    const safeUser = user.toJSON();
    res.json({ user: safeUser, token });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// POST /api/auth/admin-login
const adminLogin = async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email, role: 'admin' }).select('+password');
    if (!user || !(await user.comparePassword(password)))
      return res.status(401).json({ message: 'Invalid admin credentials' });

    const token = generateToken(user._id);
    res.json({ user: user.toJSON(), token });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

const { OAuth2Client } = require('google-auth-library');
const axios = require('axios');

const verifyGoogleToken = async (idToken) => {
  const clientId = process.env.GOOGLE_WEB_CLIENT_ID || process.env.GOOGLE_CLIENT_ID;
  if (clientId) {
    try {
      const client = new OAuth2Client(clientId);
      const ticket = await client.verifyIdToken({
        idToken,
        audience: clientId,
      });
      return ticket.getPayload();
    } catch (verifyErr) {
      console.warn('[GoogleAuth] verifyIdToken with audience failed, falling back to tokeninfo:', verifyErr.message);
    }
  }

  // Fallback: Query Google tokeninfo endpoint directly
  const url = `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`;
  if (typeof fetch === 'function') {
    const res = await fetch(url);
    if (!res.ok) {
      const errorText = await res.text();
      throw new Error(`Google tokeninfo error: ${errorText}`);
    }
    return await res.json();
  }

  const res = await axios.get(url);
  return res.data;
};

// POST /api/auth/google
const googleAuth = async (req, res) => {
  try {
    const { idToken } = req.body;
    if (!idToken) {
      return res.status(400).json({ message: 'Google ID Token is required' });
    }

    const payload = await verifyGoogleToken(idToken);

    if (!payload || !payload.email) {
      return res.status(400).json({ message: 'Invalid Google token' });
    }

    const { email, name, picture, sub: googleId } = payload;
    const normalizedEmail = email.toLowerCase().trim();

    // Check if user exists by googleId OR email
    let user = await User.findOne({
      $or: [{ googleId }, { email: normalizedEmail }],
    });

    if (user) {
      if (user.isBlocked) {
        return res.status(403).json({ message: 'Account banned', reason: user.moderationReason });
      }
      if (user.isSuspended) {
        return res.status(403).json({ message: 'Account suspended', reason: user.moderationReason });
      }

      let modified = false;
      if (!user.googleId) {
        user.googleId = googleId;
        modified = true;
      }
      if (!user.avatar && picture) {
        user.avatar = picture;
        modified = true;
      }
      if (modified) {
        await user.save();
      }
    } else {
      user = await User.create({
        name: name || normalizedEmail.split('@')[0],
        email: normalizedEmail,
        googleId,
        avatar: picture || '',
        profileSetup: true,
      });
    }

    const token = generateToken(user._id);
    const safeUser = user.toJSON();
    return res.json({ user: safeUser, token });
  } catch (err) {
    console.error('[GoogleAuth] Error:', err.message);
    return res.status(500).json({ message: err.message || 'Google authentication failed' });
  }
};

module.exports = { signup, login, adminLogin, googleAuth };
