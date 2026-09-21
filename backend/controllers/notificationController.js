import mongoose from "mongoose";
import Notification from "../models/notificationModel.js";

/**
 * Clamp a pagination parameter.
 *
 * `parseInt("abc")` is NaN, and a NaN `limit` is silently ignored by Mongoose:
 * `?limit=abc` returned the user's entire notification history in one response
 * and reported `limit: null, pages: null` back to the client.
 */
const clamp = (value, fallback, max) => {
  const parsed = parseInt(value, 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(1, parsed));
};

// ดึงการแจ้งเตือนทั้งหมดของ user
export const getNotifications = async (req, res) => {
  try {
    const userId = req.userId;
    const { unreadOnly = false } = req.query;

    const limit = clamp(req.query.limit, 20, 100);
    const page = clamp(req.query.page, 1, Number.MAX_SAFE_INTEGER);

    const query = { user: userId };
    if (unreadOnly === "true") {
      query.isRead = false;
    }

    const skip = (page - 1) * limit;

    const notifications = await Notification.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    const total = await Notification.countDocuments(query);
    const unreadCount = await Notification.countDocuments({
      user: userId,
      isRead: false
    });

    res.status(200).json({
      success: true,
      data: {
        notifications,
        unreadCount,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit) || 1,
        },
      },
    });
  } catch (error) {
    console.error("Get notifications error:", error);
    res.status(500).json({
      success: false,
      message: "เกิดข้อผิดพลาดในการดึงการแจ้งเตือน",
    });
  }
};

// ดึงจำนวนการแจ้งเตือนที่ยังไม่อ่าน
export const getUnreadCount = async (req, res) => {
  try {
    const userId = req.userId;

    const unreadCount = await Notification.countDocuments({
      user: userId,
      isRead: false,
    });

    res.status(200).json({
      success: true,
      data: { unreadCount },
    });
  } catch (error) {
    console.error("Get unread count error:", error);
    res.status(500).json({
      success: false,
      message: "เกิดข้อผิดพลาด",
    });
  }
};

// อ่านการแจ้งเตือน (mark as read)
export const markAsRead = async (req, res) => {
  try {
    const userId = req.userId;
    const { notificationId } = req.params;

    // An id that is not an ObjectId threw a CastError out of Mongoose and was
    // answered as a 500; "no such notification" is a 404.
    if (!mongoose.isValidObjectId(notificationId)) {
      return res.status(404).json({ success: false, message: "ไม่พบการแจ้งเตือน" });
    }

    const notification = await Notification.findOneAndUpdate(
      { _id: notificationId, user: userId },
      { isRead: true, readAt: new Date() },
      { new: true }
    );

    if (!notification) {
      return res.status(404).json({
        success: false,
        message: "ไม่พบการแจ้งเตือน",
      });
    }

    res.status(200).json({
      success: true,
      data: notification,
    });
  } catch (error) {
    console.error("Mark as read error:", error);
    res.status(500).json({
      success: false,
      message: "เกิดข้อผิดพลาด",
    });
  }
};

// อ่านทั้งหมด (mark all as read)
export const markAllAsRead = async (req, res) => {
  try {
    const userId = req.userId;

    const result = await Notification.updateMany(
      { user: userId, isRead: false },
      { isRead: true, readAt: new Date() }
    );

    res.status(200).json({
      success: true,
      message: `อ่านแล้ว ${result.modifiedCount} รายการ`,
      data: { modifiedCount: result.modifiedCount },
    });
  } catch (error) {
    console.error("Mark all as read error:", error);
    res.status(500).json({
      success: false,
      message: "เกิดข้อผิดพลาด",
    });
  }
};

// ลบการแจ้งเตือน
export const deleteNotification = async (req, res) => {
  try {
    const userId = req.userId;
    const { notificationId } = req.params;

    if (!mongoose.isValidObjectId(notificationId)) {
      return res.status(404).json({ success: false, message: "ไม่พบการแจ้งเตือน" });
    }

    const notification = await Notification.findOneAndDelete({
      _id: notificationId,
      user: userId,
    });

    if (!notification) {
      return res.status(404).json({
        success: false,
        message: "ไม่พบการแจ้งเตือน",
      });
    }

    res.status(200).json({
      success: true,
      message: "ลบการแจ้งเตือนแล้ว",
    });
  } catch (error) {
    console.error("Delete notification error:", error);
    res.status(500).json({
      success: false,
      message: "เกิดข้อผิดพลาด",
    });
  }
};

// ลบทั้งหมด
export const deleteAllNotifications = async (req, res) => {
  try {
    const userId = req.userId;

    const result = await Notification.deleteMany({ user: userId });

    res.status(200).json({
      success: true,
      message: `ลบแล้ว ${result.deletedCount} รายการ`,
      data: { deletedCount: result.deletedCount },
    });
  } catch (error) {
    console.error("Delete all notifications error:", error);
    res.status(500).json({
      success: false,
      message: "เกิดข้อผิดพลาด",
    });
  }
};
