import cron from "node-cron";
import mongoose from "mongoose";
import User from "../models/userModel.js";
import PointTransaction from "../models/pointTransactionModel.js";
import { POINTS, REWARDS } from "../config/pricing.js";
import { grantMembership } from "./membershipService.js";
import { createNotification } from "./notificationService.js";
import { HttpError } from "../utils/httpError.js";
import { runExclusive } from "../utils/jobLock.js";

const DAY_MS = 24 * 60 * 60 * 1000;

/** Record a ledger row for a change that has already been applied. */
const record = (userId, delta, balanceAfter, reason, extra, session) =>
  PointTransaction.create(
    [{ user: userId, delta, balanceAfter, reason, ...extra }],
    { session }
  );

/**
 * Add points (earned from a session, a promo code, ...).
 * @returns the new balance
 */
export const addPoints = async ({ userId, amount, reason, bookingId = null, note = "", session = null }) => {
  if (!Number.isFinite(amount) || amount <= 0) return null;

  const user = await User.findByIdAndUpdate(
    userId,
    { $inc: { points: amount }, $set: { pointsActivityAt: new Date() } },
    { new: true, session }
  ).select("points");
  if (!user) throw new HttpError(404, "ไม่พบผู้ใช้");

  await record(userId, amount, user.points, reason, { booking: bookingId, note }, session);
  return user.points;
};

/**
 * Spend points, atomically: the balance check and the deduction are one
 * conditional update, so two redemptions fired at once can never take the
 * balance below zero.
 *
 * @throws {HttpError} 409 when the balance is too low
 * @returns the new balance
 */
export const spendPoints = async ({ userId, amount, reason, rewardId = null, note = "", session = null }) => {
  const user = await User.findOneAndUpdate(
    { _id: userId, points: { $gte: amount } },
    { $inc: { points: -amount }, $set: { pointsActivityAt: new Date() } },
    { new: true, session }
  ).select("points");

  if (!user) {
    const current = await User.findById(userId).select("points").session(session);
    throw new HttpError(
      409,
      `แต้มไม่พอ ต้องใช้ ${amount} แต้ม (คุณมี ${current?.points ?? 0} แต้ม)`,
      "insufficient_points"
    );
  }

  await record(userId, -amount, user.points, reason, { rewardId, note }, session);
  return user.points;
};

/**
 * Exchange points for a reward from REWARDS.
 * Anything that refuses the reward does so before the points are taken.
 */
export const redeemReward = async ({ userId, rewardId }) => {
  const reward = REWARDS[rewardId];
  if (!reward) throw new HttpError(404, "ไม่พบรางวัลที่เลือก");

  const session = await mongoose.startSession();
  let result;

  try {
    await session.withTransaction(async () => {
      const spend = () =>
        spendPoints({ userId, amount: reward.cost, reason: "redeem_reward", rewardId, note: reward.name, session });

      if (reward.id === "free_booking") {
        const balance = await spend();
        const user = await User.findByIdAndUpdate(userId, { $inc: { freeBookingCredits: 1 } }, { new: true, session })
          .select("freeBookingCredits");
        result = {
          balance,
          message: `แลก "${reward.name}" สำเร็จ ใช้ได้ตอนจองครั้งถัดไป (มีสิทธิ์ ${user.freeBookingCredits} ครั้ง)`,
        };
      } else if (reward.id === "overtime_voucher") {
        const user = await User.findById(userId).session(session);
        const current = user?.activeDiscount;
        if (current?.percent && (!current.expiresAt || new Date(current.expiresAt) > new Date())) {
          throw new HttpError(409, "คุณมีคูปองส่วนลดที่ยังไม่ได้ใช้อยู่แล้ว ใช้คูปองเดิมก่อนจึงจะแลกใหม่ได้", "voucher_active");
        }
        const balance = await spend();
        const expiresAt = new Date(Date.now() + reward.validDays * DAY_MS);
        await User.updateOne(
          { _id: userId },
          { activeDiscount: { percent: reward.percent, code: "POINTS", expiresAt } },
          { session }
        );
        result = { balance, message: `แลก "${reward.name}" สำเร็จ ใช้ได้ถึงวันที่ ${expiresAt.toLocaleDateString("th-TH")}` };
      } else if (reward.id === "diamond_trial") {
        let balance;
        // grantMembership refuses (e.g. while Predator is running) before
        // calling beforeCreate, so a refusal never costs points.
        const { membership } = await grantMembership({
          userId,
          tierId: reward.tier,
          days: reward.days,
          paymentMethod: "points",
          session,
          beforeCreate: async () => { balance = await spend(); },
        });
        result = {
          balance,
          message: `แลก "${reward.name}" สำเร็จ เป็น ${membership.tier.name} ถึง ${membership.expiresAt.toLocaleDateString("th-TH")}`,
        };
      } else {
        throw new HttpError(400, "รางวัลนี้ยังไม่เปิดให้แลก");
      }
    });
  } finally {
    await session.endSession();
  }

  return result;
};

/**
 * Use one "free booking" credit inside a booking transaction.
 * @throws {HttpError} 409 when the user has none left
 */
export const consumeFreeBookingCredit = async (userId, session) => {
  const { modifiedCount } = await User.updateOne(
    { _id: userId, freeBookingCredits: { $gte: 1 } },
    { $inc: { freeBookingCredits: -1 } },
    { session }
  );
  if (modifiedCount !== 1) {
    throw new HttpError(409, "คุณไม่มีสิทธิ์จองฟรีเหลืออยู่", "no_free_booking_credit");
  }
};

/** Zero out points that have seen no activity for POINTS.inactivityExpiryDays. */
export const expireInactivePoints = async (now = new Date()) => {
  const cutoff = new Date(now.getTime() - POINTS.inactivityExpiryDays * DAY_MS);
  const stale = await User.find({ points: { $gt: 0 }, pointsActivityAt: { $ne: null, $lt: cutoff } }).select("points");

  let expired = 0;
  for (const user of stale) {
    // Conditional on the balance we read, so a point earned meanwhile is kept.
    const updated = await User.findOneAndUpdate(
      { _id: user._id, points: user.points, pointsActivityAt: { $lt: cutoff } },
      { $set: { points: 0, pointsActivityAt: now } },
      { new: true }
    );
    if (!updated) continue;
    await record(user._id, -user.points, 0, "expired", { note: `ไม่มีการใช้งาน ${POINTS.inactivityExpiryDays} วัน` });
    createNotification(
      user._id,
      "system_announcement",
      "แต้มสะสมหมดอายุ",
      `แต้ม ${user.points} แต้มหมดอายุ เนื่องจากไม่มีการสะสมหรือใช้แต้มเป็นเวลา ${POINTS.inactivityExpiryDays} วัน`,
      {}
    ).catch(() => {});
    expired += 1;
  }

  if (expired) console.log(`[Points] Expired points for ${expired} user(s).`);
  return { expired, checked: stale.length };
};

let task = null;

export const startPointsScheduler = () => {
  if (task) return task;
  // Daily at 03:30. Expiry is measured in months; once a day is plenty.
  task = cron.schedule("30 3 * * *", () => {
    runExclusive("points-expiry", 23 * 60 * 60 * 1000, expireInactivePoints)
      .catch((e) => console.error("[Points] Expiry sweep failed:", e.message));
  });
  return task;
};

export const stopPointsScheduler = () => {
  if (task) {
    task.stop();
    task = null;
  }
};

export default {
  addPoints,
  spendPoints,
  redeemReward,
  consumeFreeBookingCredit,
  expireInactivePoints,
  startPointsScheduler,
  stopPointsScheduler,
};
