import express from "express";
import { scanCheckIn, listZoneLocations, setZoneLocation } from "../controllers/staffController.js";
import { authenticateUser, requireStaff, requireAdmin } from "../middleware/userAuth.js";

const router = express.Router();

router.use(authenticateUser, requireStaff);

router.post("/scan", scanCheckIn);
router.get("/zones", listZoneLocations);
// Moving a lot's check-in point changes who can self check-in: admins only.
router.put("/zones/:id/location", requireAdmin, setZoneLocation);

export default router;
