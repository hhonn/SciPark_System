import express from "express";
import {
  listBookings,
  adminCancelBooking,
  forceCheckout,
  listUsers,
  setStaff,
} from "../controllers/adminController.js";
import { authenticateUser, requireAdmin } from "../middleware/userAuth.js";

const router = express.Router();

router.use(authenticateUser, requireAdmin);

router.get("/bookings", listBookings);
router.post("/bookings/:id/cancel", adminCancelBooking);
router.post("/bookings/:id/force-checkout", forceCheckout);
router.get("/users", listUsers);
router.put("/users/:id/staff", setStaff);

export default router;
