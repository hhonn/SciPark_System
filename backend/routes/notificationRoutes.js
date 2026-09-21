import express from "express";
import {
  getNotifications,
  getUnreadCount,
  markAsRead,
  markAllAsRead,
  deleteNotification,
  deleteAllNotifications,
} from "../controllers/notificationController.js";
import { protect } from "../middleware/userAuth.js";

const router = express.Router();

// ทุก route ต้อง login
router.use(protect);

// GET /api/notifications - ดึงการแจ้งเตือนทั้งหมด
router.get("/", getNotifications);

// GET /api/notifications/unread-count - ดึงจำนวนที่ยังไม่อ่าน
router.get("/unread-count", getUnreadCount);

// PUT /api/notifications/:notificationId/read - อ่านแจ้งเตือน
router.put("/:notificationId/read", markAsRead);

// PUT /api/notifications/read-all - อ่านทั้งหมด
router.put("/read-all", markAllAsRead);

// DELETE /api/notifications/:notificationId - ลบแจ้งเตือน
router.delete("/:notificationId", deleteNotification);

// DELETE /api/notifications - ลบทั้งหมด
router.delete("/", deleteAllNotifications);

export default router;
