import mongoose from "mongoose";

/**
 * One row per change to a user's points: the ledger behind `user.points`.
 *
 * Points used to be a bare counter that several code paths incremented, with
 * no record of why. A balance nobody can explain cannot be disputed, audited
 * or corrected; this can.
 */
const pointTransactionSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    /** Positive when earned, negative when spent or expired. */
    delta: {
      type: Number,
      required: true,
    },
    /** The balance right after this change. */
    balanceAfter: {
      type: Number,
      required: true,
    },
    reason: {
      type: String,
      enum: [
        "session",            // a completed, paid parking session
        "promo_code",         // a "points" promo code
        "redeem_reward",      // spent on a reward
        "expired",            // lapsed after a year of no activity
        "opening_balance",    // balance carried over from before the ledger
        "admin_adjust",
      ],
      required: true,
    },
    rewardId: { type: String, default: null },
    booking: { type: mongoose.Schema.Types.ObjectId, ref: "Booking", default: null },
    note: { type: String, default: "" },
  },
  { timestamps: true }
);

pointTransactionSchema.index({ user: 1, createdAt: -1 });

const PointTransaction =
  mongoose.models.PointTransaction || mongoose.model("PointTransaction", pointTransactionSchema);

export default PointTransaction;
