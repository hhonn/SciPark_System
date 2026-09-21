import mongoose from "mongoose";

const subscriptionSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  tier: {
    type: String,
    enum: ["diamond", "predator"],
    required: true,
  },
  tierName: {
    type: String,
    enum: ["Diamond", "Predator"],
    required: true,
  },
  price: {
    type: Number,
    required: true,
  },
  paymentMethod: {
    type: String,
    default: "credit",
  },
  promoCode: {
    type: String,
    default: null,
  },
  status: {
    type: String,
    enum: ["active", "cancelled", "expired"],
    default: "active",
  },
  startedAt: {
    type: Date,
    required: true,
  },
  expiresAt: {
    type: Date,
    required: true,
  },
}, { timestamps: true });

// Indexes
subscriptionSchema.index({ user: 1, status: 1 });
subscriptionSchema.index({ expiresAt: 1 });

const Subscription = mongoose.models.Subscription || mongoose.model("Subscription", subscriptionSchema);
export default Subscription;
