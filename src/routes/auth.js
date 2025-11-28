import express from 'express';
import crypto from 'crypto';
import User from '../models/User.js';
import Store from '../models/Store.js';
import { hashPassword, comparePassword, signToken } from '../services/auth.js';
import { sendEmail } from '../utils/sendEmail.js';

const router = express.Router();

/* -----------------------------------------------------------
   🧾 REGISTER USER — owner + store creation
----------------------------------------------------------- */
router.post('/register', async (req, res) => {
  try {
    const { name, email, phone, password, storeName } = req.body;

    if (!email || !password || !storeName) {
      return res.status(400).json({ message: 'email, password, storeName required' });
    }

    const existing = await User.findOne({ email });
    if (existing) return res.status(400).json({ message: 'User already exists' });

    const passwordHash = await hashPassword(password);

    const user = await User.create({
      name,
      email,
      phone,
      passwordHash,
      role: 'owner',
      storeIds: []
    });

    const store = await Store.create({
      name: storeName,
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
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role
      },
      store: {
        id: store._id,
        name: store.name
      }
    });

  } catch (err) {
    console.error("Register Error:", err);
    res.status(500).json({ message: "Registration failed" });
  }
});

/* -----------------------------------------------------------
   🔐 LOGIN USER — FIXED
----------------------------------------------------------- */
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    const user = await User.findOne({ email }).select('+passwordHash');
    if (!user) return res.status(400).json({ message: 'Invalid credentials' });

    const valid = await comparePassword(password, user.passwordHash);
    if (!valid) return res.status(400).json({ message: 'Invalid credentials' });

    const storeId = user.storeIds[0]?.toString();

    const token = signToken({
      userId: user._id.toString(),
      role: user.role,
      email: user.email,
      storeId
    });

    res.json({
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        storeId
      }
    });

  } catch (err) {
    console.error("Login Error:", err);
    res.status(500).json({ message: "Login failed" });
  }
});

/* -----------------------------------------------------------
   📩 FORGOT PASSWORD
----------------------------------------------------------- */
router.post('/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;

    const user = await User.findOne({ email });
    if (!user) return res.status(400).json({ message: "No user with this email" });

    const resetToken = crypto.randomBytes(32).toString("hex");
    const resetHash = crypto.createHash("sha256").update(resetToken).digest("hex");

    user.resetPasswordToken = resetHash;
    user.resetPasswordExpires = Date.now() + 60 * 60 * 1000;
    await user.save();

    const resetURL = `${process.env.FRONTEND_URL}/reset-password/${resetToken}`;
    await sendEmail(email, "Password Reset", `Reset your password: ${resetURL}`);

    res.json({ message: "Reset email sent" });

  } catch (err) {
    console.error("Forgot Password Error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

/* -----------------------------------------------------------
   🔄 RESET PASSWORD
----------------------------------------------------------- */
router.post('/reset-password/:token', async (req, res) => {
  try {
    const hash = crypto.createHash("sha256").update(req.params.token).digest("hex");

    const user = await User.findOne({
      resetPasswordToken: hash,
      resetPasswordExpires: { $gt: Date.now() }
    });

    if (!user) return res.status(400).json({ message: "Invalid or expired token" });

    user.passwordHash = await hashPassword(req.body.password);
    user.resetPasswordToken = null;
    user.resetPasswordExpires = null;
    await user.save();

    res.json({ message: "Password reset successful" });

  } catch (err) {
    console.error("Reset Error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

/* -----------------------------------------------------------
   🔵 GOOGLE LOGIN
----------------------------------------------------------- */
router.post("/google", async (req, res) => {
  try {
    const { googleId, email, name } = req.body;

    if (!email) return res.status(400).json({ message: "Missing Google email" });

    let user = await User.findOne({ email });

    if (!user) {
      user = await User.create({
        name,
        email,
        googleId,
        passwordHash: "",
        role: "owner",
        storeIds: []
      });

      const store = await Store.create({
        name: `${name}'s store`,
        ownerId: user._id
      });

      user.storeIds.push(store._id);
      await user.save();
    }

    const token = signToken({
      userId: user._id.toString(),
      role: user.role,
      storeId: user.storeIds[0]?.toString()
    });

    res.json({ token, user });

  } catch (err) {
    console.error("Google Auth Error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

export default router;
