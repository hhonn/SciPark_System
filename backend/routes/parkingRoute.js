import express from "express";
import {
  getAllZones,
  getZoneById,
  getAllSpots,
  getSpotById,
  getSpotsByZone,
  updateSpotStatus,
  getParkingStats,
} from "../controllers/parkingController.js";
import { authenticateUser, requireAdmin } from "../middleware/userAuth.js";

const router = express.Router();

// Public reads. Availability changes on every booking, so these are read
// straight from the database rather than cached: a stale free-spot count is
// worse than a slightly slower query.
router.get("/zones", getAllZones);
router.get("/zones/:id", getZoneById);
router.get("/zones/:id/spots", getSpotsByZone);
router.get("/spots", getAllSpots);
router.get("/spots/:id", getSpotById);
router.get("/stats", getParkingStats);

// Operator-only write. Was reachable by anyone before.
router.put("/spots/:id/status", authenticateUser, requireAdmin, updateSpotStatus);

export default router;
