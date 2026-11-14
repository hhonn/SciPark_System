import os from "os";
import mongoose from "mongoose";

// Run a scheduled job on only one instance at a time.
//
// Every app instance starts the same cron schedules. With two instances behind
// the load balancer the auto-cancel sweep, the check-in reminders and the
// subscription sweep all ran twice each minute: duplicate reminders, double
// the database work. The jobs are already safe to repeat; this just keeps the
// fleet from doing the work more than once per run.
//
// The lock is a document with a lease (`lockedUntil`). Taking it is a single
// conditional upsert: if another instance holds an unexpired lease the upsert
// collides on _id and we skip this run. Leases are not released early, so a
// job runs at most once per lease window even if it finishes quickly; if the
// holder dies the lease simply runs out.

const COLLECTION = "joblocks";
const owner = `${os.hostname()}:${process.pid}`;

// @param {string}   name    job name
// @param {number}   leaseMs how long the run owns the job (keep it below the schedule interval)
// @param {Function} fn      the job
// @returns {Promise<{ ran: boolean, result?: any }>}
export const runExclusive = async (name, leaseMs, fn) => {
  const now = new Date();
  try {
    await mongoose.connection.collection(COLLECTION).updateOne(
      { _id: name, lockedUntil: { $lte: now } },
      { $set: { lockedUntil: new Date(now.getTime() + leaseMs), owner, startedAt: now } },
      { upsert: true }
    );
  } catch (error) {
    if (error?.code === 11000) return { ran: false }; // someone else holds the lease
    throw error;
  }
  return { ran: true, result: await fn() };
};

export default { runExclusive };
