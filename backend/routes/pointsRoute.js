import express from "express";
import { getPoints, redeem } from "../controllers/pointsController.js";
import { authenticateUser } from "../middleware/userAuth.js";

const router = express.Router();

router.use(authenticateUser);

router.get("/", getPoints);
router.post("/redeem", redeem);

export default router;
