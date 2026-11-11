import express from "express";
import {
  register,
  login,
  logout,
  getMe,
  sendVerifyOTP,
  verifyEmail,
  forgotPassword,
  resetPassword,
} from "../controllers/authController.js";
import { authenticateUser } from "../middleware/userAuth.js";
import {
  authLimiter,
  loginLimiter,
  resetRequestLimiter,
  resetAttemptLimiter,
} from "../middleware/security.js";

const router = express.Router();

// Credential endpoints get the strict limiter to blunt brute force.
router.post("/register", authLimiter, register);
router.post("/login", authLimiter, loginLimiter, login);
router.post("/logout", logout);

router.get("/me", authenticateUser, getMe);
router.post("/send-verify-otp", authenticateUser, authLimiter, sendVerifyOTP);
router.post("/verify-account", authenticateUser, authLimiter, verifyEmail);

// Password reset by emailed code.
router.post("/forgot-password", authLimiter, resetRequestLimiter, forgotPassword);
router.post("/reset-password", authLimiter, resetAttemptLimiter, resetPassword);

export default router;
