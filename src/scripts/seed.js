// server/src/scripts/seed.js
import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

import bcrypt from 'bcryptjs';
import User from '../models/User.js';
import Store from '../models/Store.js';
import Item from '../models/Item.js';
import { signToken } from '../services/auth.js';

const MONGO = process.env.MONGO_URI || 'mongodb://localhost:27017/ai-mart-inventory';

async function run() {
  await mongoose.connect(MONGO, {});
  console.log('Connected to', MONGO);

  await User.deleteMany({});
  await Store.deleteMany({});
  await Item.deleteMany({});

  const password = await bcrypt.hash('password', 10);
  const user = await User.create({
    name: 'Demo Owner',
    email: 'demo@local',
    passwordHash: password,
    role: 'owner',
    storeIds: []
  });

  const store = await Store.create({
    name: 'Demo Store',
    ownerId: user._id,
    currency: 'INR',
    settings: { autoRefill: false }
  });

  user.storeIds = [store._id];
  await user.save();

  const items = [
    { name: 'Maggi 2-min', sku: 'MAGGI-123', rack: 'R1', totalStock: 50, rackStock: 4, threshold: 10, displayCapacity: 20, storeId: store._id },
    { name: 'Sunflower Oil 1L', sku: 'OIL-1L', rack: 'R2', totalStock: 30, rackStock: 12, threshold: 10, displayCapacity: 15, storeId: store._id },
    { name: 'Rice 5kg', sku: 'RICE-5', rack: 'R3', totalStock: 20, rackStock: 2, threshold: 5, displayCapacity: 10, storeId: store._id },
  ];
  await Item.insertMany(items);

  const token = signToken({ userId: user._id, storeId: store._id, role: user.role });
  console.log('SEED COMPLETE');
  console.log('Use this token in the frontend localStorage as AM_TOKEN:\n\n', token, '\n');

  await mongoose.disconnect();
  process.exit(0);
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
