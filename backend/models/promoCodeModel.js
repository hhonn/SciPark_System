import mongoose from "mongoose";

const promoCodeSchema = new mongoose.Schema({
  code: {
    type: String,
    required: true,
    unique: true,
    uppercase: true,
  },
  type: {
    type: String,
    enum: ["subscription", "points", "discount"],
    required: true,
  },
  // For subscription type
  tier: {
    type: String,
    enum: ["diamond", "predator"],
  },
  durationDays: {
    type: Number,
    default: 30,
  },
  // For points type
  points: {
    type: Number,
    default: 0,
  },
  // For discount type
  discountPercent: {
    type: Number,
    default: 0,
  },
  maxUses: {
    type: Number,
    default: null,
  },
  usedCount: {
    type: Number,
    default: 0,
  },
  usedBy: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
  }],
  isActive: {
    type: Boolean,
    default: true,
  },
  expiresAt: {
    type: Date,
    required: true,
  },
}, { timestamps: true });

// Indexes
// promoCodeSchema.index({ code: 1 }); // REMOVED - duplicate (already unique: true)
promoCodeSchema.index({ isActive: 1, expiresAt: 1 });

const PromoCode = mongoose.models.PromoCode || mongoose.model("PromoCode", promoCodeSchema);
export default PromoCode;
