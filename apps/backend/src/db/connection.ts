import mongoose from 'mongoose';

import { env } from '../config/env.js';

let isConnected = false;

/**
 * Connects to MongoDB using the validated MONGODB_URI. Idempotent — safe
 * to call multiple times (e.g. once per test file) without opening
 * duplicate connections.
 */
export async function connectDB(): Promise<typeof mongoose> {
  if (isConnected) {
    return mongoose;
  }

  mongoose.set('strictQuery', true);

  await mongoose.connect(env.MONGODB_URI);
  isConnected = true;

  mongoose.connection.on('error', (error: unknown) => {
    console.error('[db] connection error', error);
  });

  mongoose.connection.on('disconnected', () => {
    isConnected = false;
  });

  return mongoose;
}

export async function disconnectDB(): Promise<void> {
  if (!isConnected) {
    return;
  }
  await mongoose.disconnect();
  isConnected = false;
}
