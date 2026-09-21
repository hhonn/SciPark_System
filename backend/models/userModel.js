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
  },
  {
    timestamps: true,
  }
);

// email + username already get unique indexes from `unique: true`.

const User = mongoose.models.User || mongoose.model("User", userSchema);

export default User;
