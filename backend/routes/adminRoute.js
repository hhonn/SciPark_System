import express from "express";
import {
  listBookings,
  adminCancelBooking,
  forceCheckout,
  listUsers,
  setStaff,
  listSpotCodes,
  rotateSpotCheckInCode,
} from "../controllers/adminController.js";
import { getDashboard } from "../controllers/adminDashboardController.js";
import { listLots, createLot, listLotSpots, addLotSpots, setSpotClosed } from "../controllers/adminLotsController.js";
import { authenticateUser, requireAdmin } from "../middleware/userAuth.js";

const router = express.Router();

router.use(authenticateUser, requireAdmin);

router.get("/dashboard", getDashboard);
router.get("/bookings", listBookings);
router.post("/bookings/:id/cancel", adminCancelBooking);
router.post("/bookings/:id/force-checkout", forceCheckout);
router.get("/users", listUsers);
router.put("/users/:id/staff", setStaff);
// QR stickers on the bays: drivers scan them to check in.
router.get("/spot-codes", listSpotCodes);
router.post("/spots/:id/rotate-code", rotateSpotCheckInCode);
// Lots and bays.
router.get("/lots", listLots);
router.post("/lots", createLot);
router.get("/lots/:id/spots", listLotSpots);
router.post("/lots/:id/spots", addLotSpots);
router.put("/spots/:id/closed", setSpotClosed);

export default router;
