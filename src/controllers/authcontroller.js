// backend/controllers/authController.js
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const sendEmail = require('../utils/sendEmail');
// const sendSMS = require('../utils/sendSMS'); // Not needed since skipping OTP
const crypto = require('crypto');

// 🔑 Helper: generate JWT
const generateToken = (user) => {
  return jwt.sign(
    {
      userId: user._id.toString(),
      role: user.role || 'user',
      storeId: user.storeIds?.[0] || null
    },
    process.env.JWT_SECRET,
    { expiresIn: '1h' }
  );
};

// 📌 Register user
exports.registerUser = async (req, res) => {
  try {
    const { name, email, phone, password } = req.body;

    const existing = await User.findOne({ $or: [{ email }, { phone }] });
    if (existing) return res.status(400).json({ message: 'Email or phone already in use' });

    const user = new User({ name, email, phone, password });
    await user.save();

    const token = generateToken(user);
    res.status(201).json({ user, token });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// 📌 Login user
exports.loginUser = async (req, res) => {
  try {
    const { email, phone, password } = req.body;

    // ✅ FIX #1 — select passwordHash (NOT password)
    const user = await User.findOne(email ? { email } : { phone }).select('+passwordHash');
    if (!user) return res.status(400).json({ message: 'User not found' });

    // ✅ FIX #2 — compare with passwordHash (your model already uses this)
    const valid = await user.comparePassword(password);
    if (!valid) return res.status(400).json({ message: 'Invalid credentials' });

    const token = generateToken(user);
    res.json({ user, token });

  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// 📌 Logout user
exports.logoutUser = async (req, res) => {
  res.json({ message: 'Logged out successfully' });
};

// 📌 Forgot password (email)
exports.forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ message: 'Email required' });

    const user = await User.findOne({ email });
    if (!user) return res.status(400).json({ message: 'No user with this email' });

    const resetToken = user.generatePasswordReset();
    await user.save();

    const frontendUrl = (process.env.FRONTEND_URL || `${req.protocol}://${req.get('host')}`).replace(/\/$/, '');
    const resetURL = `${frontendUrl}/reset-password/${resetToken}`;

    await sendEmail(email, 'Password Reset', `Reset your password: ${resetURL}`);

    res.json({ message: 'Reset email sent' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// 📌 Reset password (via email link)
exports.resetPassword = async (req, res) => {
  try {
    const tokenHash = crypto.createHash('sha256').update(req.params.token).digest('hex');

    const user = await User.findOne({
      resetPasswordToken: tokenHash,
      resetPasswordExpires: { $gt: Date.now() },
    }).select('+passwordHash');

    if (!user) return res.status(400).json({ message: 'Invalid or expired token' });

    user.password = req.body.password;
    user.resetPasswordToken = null;
    user.resetPasswordExpires = null;
    await user.save();

    res.json({ message: 'Password reset successful' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// 📌 Google OAuth
exports.googleAuth = async (req, res) => {
  try {
    const { googleId, email, name } = req.body;

    if (!email) {
      return res.status(400).json({ message: 'Google profile missing email' });
    }

    let user = await User.findOne({ email });

    if (!user) {
      // New Google user (no phone, no password)
      user = new User({ name, email, googleId });
      await user.save();
    } else if (!user.googleId) {
      // Existing email/password account — link Google
      user.googleId = googleId;
      await user.save();
    }

    const token = generateToken(user);
    res.json({ user, token });
  } catch (err) {
    console.error('googleAuth error:', err);
    res.status(500).json({ message: err.message });
  }
};
