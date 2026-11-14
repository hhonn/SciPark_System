import mongoose from "mongoose";
import { BOOKING_FEE } from "../config/pricing.js";

const bookingSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  vehicle: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Vehicle",
    default: null,
  },
  spot: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "ParkingSpot",
    required: true,
  },
  zone: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "ParkingZone",
    default: null,
  },
  // Denormalised so history still reads correctly if a zone is renamed/removed.
  zoneName: {
    type: String,
    default: "",
  },
  spotNumber: {
    type: String,
    default: "",
  },
  floor: {
    type: String,
    default: "ลานจอด",
  },
  startTime: {
    type: Date,
    required: true,
  },
  actualStartTime: {
    type: Date,
    default: null, // เวลา check-in จริง
  },
  endTime: {
    type: Date,
    default: null,
  },
  actualEndTime: {
    type: Date,
    default: null, // เวลา check-out จริง
  },
  bookingFee: {
    type: Number,
    default: BOOKING_FEE, // ค่าธรรมเนียมการจอง (ดู config/pricing.js)
  },
  // Set when the booking fee was waived, e.g. paid for with a points reward.
  feeWaiver: {
    type: String,
    enum: ["free_booking_credit", null],
    default: null,
  },
  cost: {
    type: Number,
    default: 0, // ค่าจอดเกินเวลาหลังหักส่วนลดแล้ว
  },
  totalCost: {
    type: Number,
    default: 0, // bookingFee + cost
  },
  discountPercent: {
    type: Number,
    default: 0, // ส่วนลดตามระดับสมาชิกที่ใช้จริงตอน check-out
  },
  pointsEarned: {
    type: Number,
    default: 0,
  },
  status: {
    type: String,
    enum: ["pending", "confirmed", "completed", "cancelled"],
    default: "pending",
  },
  paymentStatus: {
    type: String,
    enum: ["unpaid", "paid", "failed", "settled"],
    default: "unpaid",
  },
  paymentMethod: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "PaymentMethod",
    default: null,
  },
  isCheckedIn: {
    type: Boolean,
    default: false,
  },
  checkInDeadline: {
    type: Date,
    default: null, // ต้อง check-in ภายในเวลานี้
  },
  // Stamped when the "your check-in window is closing" notification goes out,
  // so the once-a-minute sweep sends it once rather than every minute.
  reminderSentAt: {
    type: Date,
    default: null,
  },
  // QR check-in credentials. Only the hash is stored: the plain token lives in
  // the QR image the user holds, so a leaked database cannot mint check-ins.
  qrTokenHash: {
    type: String,
    default: null,
    select: false,
  },
  qrIssuedAt: {
    type: Date,
    default: null,
  },
  // How arrival was proven. Self check-in used to need nothing but a token the
  // API had just handed the user, so a booking could be "checked in" from home.
  checkInMethod: {
    type: String,
    enum: ["staff_scan", "gps", "spot_qr", "ticket_scan", null],
    default: null,
  },
  // The staff member whose scan checked this booking in.
  checkedInBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    default: null,
  },
  // Where the phone said it was, for a GPS check-in (kept for disputes).
  checkInLocation: {
    type: new mongoose.Schema(
      {
        latitude: Number,
        longitude: Number,
        accuracy: Number,
        distanceMeters: Number,
      },
      { _id: false }
    ),
    default: null,
  },
  // Set when an admin cancels or force-checks-out a booking by hand.
  closedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    default: null,
  },
  adminNote: {
    type: String,
    default: "",
    maxlength: 300,
  },
  cancelReason: {
    type: String,
    enum: ["user_cancelled", "auto_cancelled_timeout", "admin_cancelled", null],
    default: null,
  },
  refundable: {
    type: Boolean,
    default: false, // ค่าจองไม่คืนตามนโยบาย
  },
}, { timestamps: true });

// Indexes for faster queries
bookingSchema.index({ user: 1, status: 1 });
bookingSchema.index({ spot: 1 });
bookingSchema.index({ startTime: -1 });
// Drives the auto-cancel sweep.
bookingSchema.index({ status: 1, checkInDeadline: 1 });
// A staff scan finds the booking from the QR token's hash alone.
bookingSchema.index({ qrTokenHash: 1 });

// Statuses that block a user from opening another booking.
bookingSchema.statics.ACTIVE_STATUSES = ["pending", "confirmed"];

const Booking = mongoose.models.Booking || mongoose.model("Booking", bookingSchema);
export default Booking;
