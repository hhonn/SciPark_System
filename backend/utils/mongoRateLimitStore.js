import mongoose from "mongoose";

// express-rate-limit store backed by MongoDB.
//
// The default store keeps counters in the memory of one Node process. Behind a
// load balancer with several instances every instance counted separately, so
// "10 failed logins per 15 minutes" quietly became 10 × N, and the counts were
// wiped on every deploy. Keeping them in the database makes the app tier
// stateless: any instance can serve any request and see the same limits.
//
// Each counter is one document { _id: "<prefix>:<key>", hits, resetAt }. The
// increment is a single atomic pipeline update that starts a new window when
// the old one has passed, and a TTL index removes stale counters.

const COLLECTION = "ratelimits";
let indexReady = null;

const collection = () => mongoose.connection.collection(COLLECTION);

const ensureIndex = () => {
  indexReady ||= collection()
    .createIndex({ resetAt: 1 }, { expireAfterSeconds: 0 })
    .catch((error) => {
      indexReady = null; // retry on the next call
      console.error("Rate-limit TTL index:", error.message);
    });
  return indexReady;
};

export class MongoRateLimitStore {
  // @param {string} prefix  unique per limiter (express-rate-limit requires one store per limiter)
  constructor(prefix) {
    this.prefix = prefix;
    // Counters are shared across processes, not local to this one.
    this.localKeys = false;
    this.windowMs = 60_000;
  }

  init(options) {
    this.windowMs = options.windowMs;
    ensureIndex();
  }

  id(key) {
    return `${this.prefix}:${key}`;
  }

  async increment(key) {
    // Memoised; retried here because init() can run before the DB is up.
    ensureIndex();
    const now = new Date();
    const fresh = new Date(now.getTime() + this.windowMs);
    const active = { $gt: ["$resetAt", now] };

    const doc = await collection().findOneAndUpdate(
      { _id: this.id(key) },
      [
        {
          $set: {
            hits: { $cond: [active, { $add: ["$hits", 1] }, 1] },
            resetAt: { $cond: [active, "$resetAt", fresh] },
          },
        },
      ],
      { upsert: true, returnDocument: "after" }
    );

    return { totalHits: doc?.hits ?? 1, resetTime: doc?.resetAt ?? fresh };
  }

  async decrement(key) {
    await collection().updateOne(
      { _id: this.id(key), resetAt: { $gt: new Date() }, hits: { $gt: 0 } },
      { $inc: { hits: -1 } }
    );
  }

  async resetKey(key) {
    await collection().deleteOne({ _id: this.id(key) });
  }
}

export default MongoRateLimitStore;
