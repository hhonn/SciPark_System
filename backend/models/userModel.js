import mongoose from "mongoose";

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    username: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    password: {
      type: String,
      required: true,
      // Never ship the hash to a client by accident.
      select: false,
    },
    phone: {
      type: String,
      default: "",
    },
    rank: {
      type: String,
      enum: ["Iron", "Diamond", "Predator"],
      default: "Iron",
    },
    points: {
      type: Number,
      default: 0,
      min: 0,
    },
    // Last time points were earned or spent; points lapse after a year without.
    pointsActivityAt: {
      type: Date,
      default: null,
    },
    // "Free booking" rewards bought with points and not yet used.
    freeBookingCredits: {
      type: Number,
      default: 0,
      min: 0,
    },
    subscriptionExpiry: {
      type: Date,
      default: null,
    },
    // One-shot discount granted by a promo code, spent at the next check-out.
    activeDiscount: {
      type: new mongoose.Schema(
        {
          percent: { type: Number, min: 0, max: 100, required: true },
          code: { type: String, default: "" },
          expiresAt: { type: Date, default: null },
        },
        { _id: false }
      ),
      default: null,
    },
    isAccountVerified: {
      type: Boolean,
      default: false,
    },
    // Gates the operator-only endpoints (spot status overrides, etc.).
    isAdmin: {
      type: Boolean,
      default: false,
    },
    // Parking staff: may scan a driver's QR to check them in. Admins can too.
    isStaff: {
      type: Boolean,
      default: false,
    },
    // Embedded in every JWT. Bumping it (password change) invalidates every
    // token issued before, on every device.
    tokenVersion: {
      type: Number,
      default: 0,
    },
    // Written at the start of each booking transaction purely so that two
    // concurrent bookings by the same user collide and are serialised.
    bookingLockAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

// email + username already get unique indexes from `unique: true`.

const User = mongoose.models.User || mongoose.model("User", userSchema);

export default User;
