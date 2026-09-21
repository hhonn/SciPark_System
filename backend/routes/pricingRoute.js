import express from "express";
import { getPricing } from "../controllers/pricingController.js";

const router = express.Router();

// Public: quoted on the landing page and in the legal pages, neither of which
// requires a session.
router.get("/", getPricing);

export default router;
