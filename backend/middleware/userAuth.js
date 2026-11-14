import User from "../models/userModel.js";
import RevokedToken from "../models/revokedTokenModel.js";
import { readToken, verifyToken } from "../utils/authToken.js";

const reject = (res, code, message) =>
  res.status(401).json({ success: false, code, message });

// Authenticate a request from the httpOnly cookie or an Authorization header.
// On success `req.userId` holds the caller's id and `req.user` their document.
//
// A valid signature is no longer enough on its own. The token must also:
//  - belong to a user that still exists,
//  - carry the user's current `tokenVersion` (a password change bumps it, so
//    every older token dies with the old password),
//  - not have been logged out (its `jti` is not in RevokedToken).
const userAuth = async (req, res, next) => {
  const token = readToken(req);
  if (!token) return reject(res, "token_missing", "Unauthorized - No token provided");

  let decoded;
  try {
    decoded = verifyToken(token);
  } catch (error) {
    // Distinguish expiry so the client can say "session expired".
    const expired = error.name === "TokenExpiredError";
    return reject(
      res,
      expired ? "token_expired" : "token_invalid",
      expired ? "เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่" : "Unauthorized - Invalid token"
    );
  }

  // Tokens minted before revocation existed have no jti and cannot be logged
  // out, so they are refused; the user simply signs in once more.
  if (!decoded?.id || !decoded.jti) {
    return reject(res, "token_invalid", "Unauthorized - Invalid token");
  }

  try {
    const [user, revoked] = await Promise.all([
      User.findById(decoded.id).select("tokenVersion isAdmin isStaff"),
      RevokedToken.exists({ jti: decoded.jti }),
    ]);

    if (!user || revoked || (decoded.v ?? 0) !== (user.tokenVersion || 0)) {
      return reject(res, "token_revoked", "เซสชันสิ้นสุดแล้ว กรุณาเข้าสู่ระบบใหม่");
    }

    req.userId = String(user._id);
    req.user = user;
    req.token = decoded;
    next();
  } catch (error) {
    console.error("Auth check error:", error);
    return res.status(500).json({ success: false, message: "เกิดข้อผิดพลาด" });
  }
};

// Operator-only guard. Must run after `userAuth`, which has already loaded
// `isAdmin` onto `req.user`.
export const requireAdmin = (req, res, next) => {
  if (!req.user?.isAdmin) {
    return res.status(403).json({ success: false, message: "ต้องเป็นผู้ดูแลระบบเท่านั้น" });
  }
  next();
};

// Parking staff (QR scanning). Admins count as staff. Runs after `userAuth`.
export const requireStaff = (req, res, next) => {
  if (!req.user?.isStaff && !req.user?.isAdmin) {
    return res.status(403).json({ success: false, message: "สำหรับเจ้าหน้าที่ลานจอดเท่านั้น" });
  }
  next();
};

export default userAuth;
export { userAuth as authenticateUser };
export { userAuth as protect };
