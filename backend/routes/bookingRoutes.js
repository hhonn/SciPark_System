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
  scanSpot,
} from "../controllers/bookingController.js";
import { authenticateUser } from "../middleware/userAuth.js";
import { bookingLimiter } from "../middleware/security.js";

const router = express.Router();

router.use(authenticateUser);

router.post("/", bookingLimiter, createBooking);
router.get("/active", getActiveBooking);
router.get("/history", getBookingHistory);
// Read a bay's QR sticker. Changes nothing; the check-in is PUT .../checkin.
router.post("/spot-scan", scanSpot);
router.get("/:bookingId/qr", getBookingQR);
router.put("/:bookingId/checkin", checkIn);
router.put("/:bookingId/checkout", checkOut);
// Legacy alias for older clients; delegates to checkOut.
router.put("/:id/complete", completeBooking);
router.delete("/:id", cancelBooking);

export default router;
