import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';

const UserSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },

  // login identifiers
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  phone: {
    type: String,
    unique: true,
    sparse: true, // allow multiple nulls
    trim: true,
  },

  // password hash (used for login)
  passwordHash: { type: String, required: false, select: false },

  // Google auth support
  googleId: { type: String, default: null },

  // role + store references (keep from your old schema)
  role: { type: String, enum: ['owner', 'staff'], default: 'owner' },
  storeIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Store' }],

  // password reset & OTP features
  resetPasswordToken: { type: String, default: null },
  resetPasswordExpires: { type: Date, default: null },
  phoneOTP: { type: String, default: null },
  phoneOTPExpires: { type: Date, default: null },
}, { timestamps: true });

/* ---------------- 🔒 Password Hashing ---------------- */
UserSchema.pre('save', async function (next) {
  // only hash if changed or new
  if (!this.isModified('passwordHash')) return next();
  if (!this.passwordHash) return next();

  try {
    const salt = await bcrypt.genSalt(10);
    this.passwordHash = await bcrypt.hash(this.passwordHash, salt);
    next();
  } catch (err) {
    next(err);
  }
});

/* ---------------- 🔑 Compare password ---------------- */
UserSchema.methods.comparePassword = async function (candidatePassword) {
  if (!this.passwordHash) return false;
  return await bcrypt.compare(candidatePassword, this.passwordHash);
};

/* ---------------- 🔁 Password Reset ---------------- */
UserSchema.methods.generatePasswordReset = function () {
  const token = crypto.randomBytes(32).toString('hex');
  this.resetPasswordToken = crypto.createHash('sha256').update(token).digest('hex');
  this.resetPasswordExpires = Date.now() + 60 * 60 * 1000; // 1 hour
  return token;
};

/* ---------------- 📱 OTP Handling ---------------- */
UserSchema.methods.generateOTP = function () {
  const otp = (Math.floor(100000 + Math.random() * 900000)).toString();
  this.phoneOTP = crypto.createHash('sha256').update(otp).digest('hex');
  this.phoneOTPExpires = Date.now() + 10 * 60 * 1000;
  return otp;
};

UserSchema.methods.verifyOTP = function (otp) {
  if (!this.phoneOTP || !this.phoneOTPExpires) return false;
  const hashed = crypto.createHash('sha256').update(otp).digest('hex');
  return (hashed === this.phoneOTP && Date.now() < this.phoneOTPExpires);
};

/* ---------------- 🧹 Clean output ---------------- */
UserSchema.methods.toJSON = function () {
  const obj = this.toObject();
  delete obj.passwordHash;
  delete obj.resetPasswordToken;
  delete obj.phoneOTP;
  return obj;
};

export default mongoose.model('User', UserSchema);
