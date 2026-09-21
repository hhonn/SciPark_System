import mongoose from "mongoose";

const notificationSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    type: {
      type: String,
      enum: [
        "booking_created",      // จองสำเร็จ
        "booking_reminder",     // เตือนก่อนหมดเวลา check-in
        "booking_cancelled",    // การจองถูกยกเลิก
        "checkin_success",      // Check-in สำเร็จ
        "checkout_success",     // Check-out สำเร็จ
        "payment_summary",      // สรุปค่าใช้จ่าย
        "promo_new",           // โปรโมชั่นใหม่
        "rank_upgrade",        // อัพเกรด Rank
        "system_announcement", // ประกาศจากระบบ
      ],
      required: true,
    },
    title: {
      type: String,
      required: true,
    },
    message: {
      type: String,
      required: true,
    },
    data: {
      // ข้อมูลเพิ่มเติม เช่น bookingId, amount, etc.
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    isRead: {
      type: Boolean,
      default: false,
    },
    readAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

// Index สำหรับ query ที่เร็วขึ้น
notificationSchema.index({ user: 1, createdAt: -1 });
notificationSchema.index({ user: 1, isRead: 1 });

const Notification = mongoose.model("Notification", notificationSchema);

export default Notification;
