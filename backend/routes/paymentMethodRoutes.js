import express from "express";
import {
  getPaymentMethods,
  addPaymentMethod,
  updatePaymentMethod,
  deletePaymentMethod,
  setDefaultPaymentMethod,
} from "../controllers/paymentMethodController.js";
import { authenticateUser } from "../middleware/userAuth.js";

const router = express.Router();

// All routes require authentication
router.use(authenticateUser);

// Get all payment methods
router.get("/", getPaymentMethods);

// Add new payment method
router.post("/", addPaymentMethod);

// Update payment method
router.put("/:id", updatePaymentMethod);

// Delete payment method (soft delete)
router.delete("/:id", deletePaymentMethod);

// Set as default payment method
router.put("/:id/default", setDefaultPaymentMethod);

export default router;
