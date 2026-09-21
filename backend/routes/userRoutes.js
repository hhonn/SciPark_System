import express from "express";
import {
  getProfile,
  updateProfile,
  changePassword,
  getBookingHistory,
  getUserStats,
} from "../controllers/userController.js";
import { authenticateUser } from "../middleware/userAuth.js";

const router = express.Router();

// All routes require authentication
router.use(authenticateUser);

// Profile routes
router.get("/profile", getProfile);
router.put("/profile", updateProfile);
router.put("/change-password", changePassword);

// Booking history
router.get("/bookings", getBookingHistory);

// User statistics
router.get("/stats", getUserStats);

export default router;
