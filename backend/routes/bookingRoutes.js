import express from "express";
import {
  createBooking,
  getActiveBooking,
  getBookingQR,
  completeBooking,
  cancelBooking,
  getBookingHistory,
  checkIn,
  checkOut,
} from "../controllers/bookingController.js";
import { authenticateUser } from "../middleware/userAuth.js";
import { bookingLimiter } from "../middleware/security.js";

const router = express.Router();

router.use(authenticateUser);

router.post("/", bookingLimiter, createBooking);
router.get("/active", getActiveBooking);
router.get("/history", getBookingHistory);
router.get("/:bookingId/qr", getBookingQR);
router.put("/:bookingId/checkin", checkIn);
router.put("/:bookingId/checkout", checkOut);
// Legacy alias for older clients; delegates to checkOut.
router.put("/:id/complete", completeBooking);
router.delete("/:id", cancelBooking);

export default router;
