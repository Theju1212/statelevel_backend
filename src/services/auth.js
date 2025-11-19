import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { config } from '../config.js';
import User from '../models/User.js';

export async function hashPassword(password) {
  return await bcrypt.hash(password, 10);
}

export async function comparePassword(password, hash) {
  return await bcrypt.compare(password, hash);
}

export function signToken(payload) {
  return jwt.sign(payload, config.jwtSecret, { expiresIn: '12h' });
}

export function verifyToken(token) {
  try {
    return jwt.verify(token, config.jwtSecret);
  } catch (e) {
    return null;
  }
}

export async function getUserById(id) {
  return await User.findById(id);
}
