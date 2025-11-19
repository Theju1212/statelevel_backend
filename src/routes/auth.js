import express from 'express';
import crypto from 'crypto';
import User from '../models/User.js';
import Store from '../models/Store.js';
import { hashPassword, comparePassword, signToken } from '../services/auth.js';
import { sendEmail } from '../utils/sendEmail.js'; // <-- make sure you add this util later

const router = express.Router();

/* ------------------------------------------------------------------
 🧾 REGISTER USER — creates account + default store
------------------------------------------------------------------ */
router.post('/register', async (req, res) => {
  try {
    const { name, email, password, storeName } = req.body;
    if (!email || !password || !storeName) {
      return res.status(400).json({ error: 'email, password, storeName required' });
    }

    const existing = await User.findOne({ email });
    if (existing) return res.status(400).json({ error: 'user exists' });

    const pwHash = await hashPassword(password);
    const user = await User.create({
      name,
      email,
      passwordHash: pwHash,
      role: 'owner',
      storeIds: []
    });

    const store = await Store.create({
      name: storeName || `${name}'s store`,
      ownerId: user._id
    });

    user.storeIds.push(store._id);
    await user.save();

    const token = signToken({
      userId: user._id.toString(),
      role: user.role,
      email: user.email,
      storeId: store._id.toString()
    });

    res.json({
      token,
      user: { id: user._id, email: user.email, name: user.name },
      store: { id: store._id, name: store.name }
    });
  } catch (err) {
    console.error('Register error:', err);
    res.status(500).json({ error: 'Registration failed' });
  }
});

/* ------------------------------------------------------------------
 🔐 LOGIN USER
------------------------------------------------------------------ */
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password)
      return res.status(400).json({ error: 'email and password required' });

    const user = await User.findOne({ email }).select('+passwordHash');
    if (!user) return res.status(400).json({ error: 'invalid credentials' });

    const ok = await comparePassword(password, user.passwordHash);
    if (!ok) return res.status(400).json({ error: 'invalid credentials' });

    if (!user.storeIds?.length) {
      return res.status(400).json({ error: 'No store linked to user' });
    }

    const token = signToken({
      userId: user._id.toString(),
      role: user.role,
      email: user.email,
      storeId: user.storeIds[0].toString()
    });

    res.json({
      token,
      user: { id: user._id, email: user.email, name: user.name },
      storeId: user.storeIds[0].toString()
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Login failed' });
  }
});

/* ------------------------------------------------------------------
 📩 FORGOT PASSWORD (email-based)
------------------------------------------------------------------ */
router.post('/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ message: 'Email required' });

    const user = await User.findOne({ email });
    if (!user) return res.status(400).json({ message: 'No user with this email' });

    // generate reset token
    const resetToken = crypto.randomBytes(32).toString('hex');
    const resetTokenHash = crypto.createHash('sha256').update(resetToken).digest('hex');

    user.resetPasswordToken = resetTokenHash;
    user.resetPasswordExpires = Date.now() + 60 * 60 * 1000; // 1 hour
    await user.save();

    const resetURL = `${process.env.FRONTEND_URL || 'http://localhost:5173'}/reset-password/${resetToken}`;
    await sendEmail(user.email, 'Password Reset', `Reset your password: ${resetURL}`);

    res.json({ message: 'Reset email sent' });
  } catch (err) {
    console.error('Forgot password error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

/* ------------------------------------------------------------------
 🔄 RESET PASSWORD
------------------------------------------------------------------ */
router.post('/reset-password/:token', async (req, res) => {
  try {
    const tokenHash = crypto.createHash('sha256').update(req.params.token).digest('hex');
    const user = await User.findOne({
      resetPasswordToken: tokenHash,
      resetPasswordExpires: { $gt: Date.now() }
    });

    if (!user) return res.status(400).json({ message: 'Invalid or expired token' });

    user.passwordHash = await hashPassword(req.body.password);
    user.resetPasswordToken = null;
    user.resetPasswordExpires = null;
    await user.save();

    res.json({ message: 'Password reset successful' });
  } catch (err) {
    console.error('Reset password error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

/* ------------------------------------------------------------------
 🔵 GOOGLE AUTH (optional placeholder)
------------------------------------------------------------------ */
router.post('/google', async (req, res) => {
  try {
    const { googleId, email, name } = req.body;
    if (!email) return res.status(400).json({ message: 'Missing Google email' });

    let user = await User.findOne({ email });
    if (!user) {
      user = await User.create({ name, email, passwordHash: '', role: 'owner', storeIds: [] });
      const store = await Store.create({ name: `${name}'s store`, ownerId: user._id });
      user.storeIds.push(store._id);
      await user.save();
    }

    const token = signToken({
      userId: user._id.toString(),
      role: user.role,
      storeId: user.storeIds[0]?.toString() || ''
    });

    res.json({ token, user });
  } catch (err) {
    console.error('Google auth error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

export default router;
