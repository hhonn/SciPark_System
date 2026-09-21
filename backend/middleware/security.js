import helmet from "helmet";
import rateLimit from "express-rate-limit";

/**
 * Express 5 safe request sanitising.
 *
 * `express-mongo-sanitize` and `xss-clean` both assign to `req.query`, which is
 * a getter-only property in Express 5 — that is why they were commented out.
 * These replacements mutate objects in place instead, so they work on Express 5.
 */

const MONGO_OPERATOR = /^\$/;
const DOTTED_KEY = /\./;

/** Strip `$op` / dotted keys that let a payload reach into a Mongo query. */
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

const ESCAPES = { "<": "&lt;", ">": "&gt;" };

/** Neutralise markup in user supplied strings so it can never render as HTML. */
const escapeStrings = (value, depth = 0) => {
  if (depth > 8 || value === null || typeof value !== "object") return value;

  if (Array.isArray(value)) {
    value.forEach((item, index) => {
      if (typeof item === "string") value[index] = item.replace(/[<>]/g, (c) => ESCAPES[c]);
      else escapeStrings(item, depth + 1);
    });
    return value;
  }

  for (const key of Object.keys(value)) {
    const current = value[key];
    if (typeof current === "string") {
      value[key] = current.replace(/[<>]/g, (c) => ESCAPES[c]);
    } else {
      escapeStrings(current, depth + 1);
    }
  }
  return value;
};

export const sanitizeRequest = (req, _res, next) => {
  // req.query is read-only on Express 5, but the object it returns is mutable.
  for (const target of [req.body, req.params, req.query]) {
    if (target && typeof target === "object") {
      stripOperators(target);
      escapeStrings(target);
    }
  }
  next();
};

/**
 * Helmet, configured for a server that also serves the built SPA.
 * The CSP allows Google Fonts and the `data:` URIs used by generated QR codes.
 */
export const securityHeaders = helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com", "data:"],
      imgSrc: ["'self'", "data:", "blob:"],
      connectSrc: ["'self'"],
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

const limiterOptions = (max, windowMs, message) => ({
  max,
  windowMs,
  message: { success: false, message },
  standardHeaders: true,
  legacyHeaders: false,
});

/** Broad protection for the whole API surface. */
export const apiLimiter = rateLimit(
  limiterOptions(300, 15 * 60 * 1000, "มีคำขอมากเกินไป กรุณาลองใหม่ในอีก 15 นาที")
);

/** Credential endpoints get a far tighter budget to blunt brute force. */
export const authLimiter = rateLimit({
  ...limiterOptions(10, 15 * 60 * 1000, "พยายามเข้าสู่ระบบบ่อยเกินไป กรุณารอ 15 นาทีแล้วลองใหม่"),
  skipSuccessfulRequests: true,
});

/** Booking creation is the most abusable write path. */
export const bookingLimiter = rateLimit(
  limiterOptions(20, 10 * 60 * 1000, "ทำรายการจองถี่เกินไป กรุณารอสักครู่")
);

export default { sanitizeRequest, securityHeaders, apiLimiter, authLimiter, bookingLimiter };
