import helmet from "helmet";
import rateLimit, { ipKeyGenerator } from "express-rate-limit";
import { MongoRateLimitStore } from "../utils/mongoRateLimitStore.js";
import { mediaOrigins } from "../services/mediaService.js";

// Express 5 safe request sanitising.
//
// `express-mongo-sanitize` and `xss-clean` both assign to `req.query`, which is
// a getter-only property in Express 5. That is why they were commented out.
// These replacements mutate objects in place instead, so they work on Express 5.

const MONGO_OPERATOR = /^\$/;
const DOTTED_KEY = /\./;

// Strip `$op` / dotted keys that let a payload reach into a Mongo query.
const stripOperators = (value, depth = 0) => {
  if (depth > 8 || value === null || typeof value !== "object") return value;

  if (Array.isArray(value)) {
    value.forEach((item) => stripOperators(item, depth + 1));
    return value;
  }

  for (const key of Object.keys(value)) {
    if (MONGO_OPERATOR.test(key) || DOTTED_KEY.test(key)) {
      delete value[key];
      continue;
    }
    stripOperators(value[key], depth + 1);
  }
  return value;
};

// Input used to have `<` and `>` rewritten to `&lt;` / `&gt;` here as well.
// That is output encoding done at the wrong end: it corrupted data at rest
// (a name typed as "A<B" was stored as "A&lt;B" and React then displayed the
// entity literally), it silently changed passwords before hashing, and it
// protected nothing, because React escapes everything it renders and mail goes out
// as plain text. Values are now stored as typed. Old escaped rows are
// restored by `npm run migrate`; passwords are handled at login.

export const sanitizeRequest = (req, _res, next) => {
  // req.query is read-only on Express 5, but the object it returns is mutable.
  for (const target of [req.body, req.params, req.query]) {
    if (target && typeof target === "object") stripOperators(target);
  }
  next();
};

// Helmet, configured for a server that also serves the built SPA.
// The CSP allows Google Fonts and the `data:` URIs used by generated QR codes.
export const securityHeaders = helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com", "data:"],
      // Photos are shown from, and uploaded straight to, the private S3 bucket.
      imgSrc: ["'self'", "data:", "blob:", ...mediaOrigins()],
      connectSrc: ["'self'", ...mediaOrigins()],
      objectSrc: ["'none'"],
      frameAncestors: ["'none'"],
      baseUri: ["'self'"],
      formAction: ["'self'"],
      upgradeInsecureRequests: process.env.NODE_ENV === "production" ? [] : null,
    },
  },
  crossOriginEmbedderPolicy: false,
  crossOriginResourcePolicy: { policy: "same-site" },
  referrerPolicy: { policy: "strict-origin-when-cross-origin" },
});

// Counters live in MongoDB (one store per limiter), so every instance behind
// the load balancer enforces the same budget. RATE_LIMIT_STORE=memory keeps
// them in-process for a single-instance setup.
const sharedStore = process.env.RATE_LIMIT_STORE !== "memory";

const limiterOptions = (max, windowMs, message, name) => ({
  max,
  windowMs,
  message: { success: false, message },
  standardHeaders: true,
  legacyHeaders: false,
  ...(sharedStore && { store: new MongoRateLimitStore(name) }),
  // A database hiccup must not turn into a site-wide 500: fail open.
  passOnStoreError: true,
});

// Broad protection for the whole API surface.
export const apiLimiter = rateLimit(
  limiterOptions(300, 15 * 60 * 1000, "มีคำขอมากเกินไป กรุณาลองใหม่ในอีก 15 นาที", "api")
);

// Credential endpoints, per IP.
//
// This used to be the only login limit, at 10 failures per IP. A campus shares
// a handful of public addresses, so ten typos anywhere on the network locked
// every student out of logging in. The per-IP budget is now a coarse flood
// guard; per-account guessing is capped by `loginLimiter` below.
export const authLimiter = rateLimit({
  ...limiterOptions(100, 15 * 60 * 1000, "มีการพยายามเข้าสู่ระบบจากเครือข่ายนี้บ่อยเกินไป กรุณารอ 15 นาที", "auth"),
  skipSuccessfulRequests: true,
});

// Failed logins per (IP, account): the brute-force limit that matters.
export const loginLimiter = rateLimit({
  ...limiterOptions(10, 15 * 60 * 1000, "พยายามเข้าสู่ระบบบ่อยเกินไป กรุณารอ 15 นาทีแล้วลองใหม่", "login"),
  skipSuccessfulRequests: true,
  keyGenerator: (req) => {
    const identifier = String(req.body?.email || req.body?.username || "").trim().toLowerCase();
    // ipKeyGenerator groups IPv6 addresses by subnet, so rotating through one
    // /64 does not hand out fresh budgets.
    return `${ipKeyGenerator(req.ip)}|${identifier}`;
  },
});

// Key a limiter on (IP, the email in the body).
const ipAndEmailKey = (req) =>
  `${ipKeyGenerator(req.ip)}|${String(req.body?.email || "").trim().toLowerCase()}`;

// "Forgot password" requests, counted whether or not they succeed: the reply
// is always a success (so it reveals nothing), and each one sends an email.
export const resetRequestLimiter = rateLimit({
  ...limiterOptions(5, 60 * 60 * 1000, "ขอรหัสบ่อยเกินไป กรุณารอสักครู่แล้วลองใหม่", "reset-request"),
  keyGenerator: ipAndEmailKey,
});

// Wrong reset codes per (IP, account), on top of the per-code attempt cap.
export const resetAttemptLimiter = rateLimit({
  ...limiterOptions(10, 15 * 60 * 1000, "ลองรหัสผิดบ่อยเกินไป กรุณารอ 15 นาทีแล้วลองใหม่", "reset-attempt"),
  skipSuccessfulRequests: true,
  keyGenerator: ipAndEmailKey,
});

// Booking creation is the most abusable write path.
export const bookingLimiter = rateLimit(
  limiterOptions(20, 10 * 60 * 1000, "ทำรายการจองถี่เกินไป กรุณารอสักครู่", "booking")
);

export default { sanitizeRequest, securityHeaders, apiLimiter, authLimiter, loginLimiter, resetRequestLimiter, resetAttemptLimiter, bookingLimiter };
