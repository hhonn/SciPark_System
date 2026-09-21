import express from "express";
import { getTiers, subscribe, redeemCode } from "../controllers/privilegesController.js";
import { authenticateUser } from "../middleware/userAuth.js";

const router = express.Router();

// All routes require authentication
router.use(authenticateUser);

// GET /api/privileges - Get all tiers and current subscription
router.get("/", getTiers);

// POST /api/privileges/subscribe - Subscribe to tier
router.post("/subscribe", subscribe);

// POST /api/privileges/redeem - Redeem promo code
router.post("/redeem", redeemCode);

export default router;
