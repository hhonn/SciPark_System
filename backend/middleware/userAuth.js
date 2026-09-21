import jwt from "jsonwebtoken";
import User from "../models/userModel.js";

/**
 * Authenticate a request from the httpOnly cookie or an Authorization header.
 * On success `req.userId` holds the caller's id.
 */
const userAuth = (req, res, next) => {
  let token = req.cookies?.token;

  if (!token) {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith("Bearer ")) {
      token = authHeader.substring(7);
    }
  }

  if (!token) {
    return res.status(401).json({ success: false, message: "Unauthorized - No token provided" });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.userId = decoded.id;
    next();
  } catch (error) {
    // Distinguish expiry so the client can refresh instead of hard logging out.
    const expired = error.name === "TokenExpiredError";
    return res.status(401).json({
      success: false,
      code: expired ? "token_expired" : "token_invalid",
      message: expired ? "เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่" : "Unauthorized - Invalid token",
    });
  }
};

/**
 * Operator-only guard. Routes that mutate shared parking state (spot status,
 * zone data) were previously open to anyone who could reach the URL.
 */
export const requireAdmin = async (req, res, next) => {
  try {
    const user = await User.findById(req.userId).select("isAdmin");
    if (!user?.isAdmin) {
      return res.status(403).json({ success: false, message: "ต้องเป็นผู้ดูแลระบบเท่านั้น" });
    }
    next();
  } catch (error) {
    console.error("Admin check error:", error);
    return res.status(500).json({ success: false, message: "เกิดข้อผิดพลาด" });
  }
};

export default userAuth;
export { userAuth as authenticateUser };
export { userAuth as protect };
