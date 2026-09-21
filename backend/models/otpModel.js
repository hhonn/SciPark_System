import mongoose from "mongoose";
import bcrypt from "bcryptjs";

// OTP Schema
const otpSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  otp: {
    type: String,
    required: true,
  },
  createdAt: {
    type: Date,
    default: Date.now,
    expires: '10m', // OTP expires after 10 minutes
  },
  type: {
    type: String,
    enum: ['ACCOUNT_VERIFICATION', 'PASSWORD_RESET'],
    required: true,
  }
});

// Hash OTP before saving to database for security
otpSchema.pre("save", async function (next) {
  if (this.isModified("otp")) {
    this.otp = await bcrypt.hash(this.otp, 10);
  }
  next();
});

const OTP = mongoose.models.OTP || mongoose.model("OTP", otpSchema);

export default OTP;