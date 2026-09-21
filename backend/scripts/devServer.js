/**
 * Run the real server against a throwaway in-memory database (`npm run dev:local`).
 *
 * Lets anyone clone the repo and see the whole app working without a MongoDB
 * Atlas account or a .env file. Data disappears when the process stops.
 */
import { MongoMemoryReplSet } from 'mongodb-memory-server-core';

const start = async () => {
  console.log('⏳ Starting in-memory MongoDB (replica set, for transactions)...');
  const mongo = await MongoMemoryReplSet.create({
    replSet: { count: 1, storageEngine: 'wiredTiger' },
  });

  process.env.MONGO_URI = mongo.getUri();
  process.env.JWT_SECRET ||= 'local_dev_secret_key_not_for_production_use';
  process.env.NODE_ENV ||= 'development';

  console.log('✅ In-memory MongoDB ready');

  // Seed so there is something to look at.
  await import('./seedInline.js');

  await import('../index.js');

  const shutdown = async () => {
    await mongo.stop();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
};

start().catch((error) => {
  console.error('Failed to start local server:', error);
  process.exit(1);
});
