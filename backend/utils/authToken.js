import crypto from "crypto";
import jwt from "jsonwebtoken";

// Session tokens: one place that signs, reads, verifies and clears them, so the
// login, logout, password-change and auth-middleware paths cannot drift apart.

export const TOKEN_TTL_DAYS = 7;
const ALGORITHM = "HS256";
const COOKIE_NAME = "token";

// Fail loudly rather than signing or verifying with `undefined`.
export const jwtSecret = () => {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.length < 16) {
    throw new Error("JWT_SECRET is missing or too short — refusing to issue tokens");
  }
  return secret;
};

// Whether the session cookie gets the `Secure` flag.
//
// This used to be `NODE_ENV === "production"`. On a server reached over plain
// HTTP (an EC2 instance on http://<ip>:3000, say) the browser silently drops a
// Secure cookie, so every login "succeeded" and the next request was a 401.
// The flag now follows the request's actual protocol: `req.secure` is true for
// direct HTTPS, and for TLS terminated at Nginx/a load balancer when
// TRUST_PROXY is set. COOKIE_SECURE=true|false overrides it outright.
const isSecureRequest = (req) => {
  const override = process.env.COOKIE_SECURE;
  if (override === "true") return true;
  if (override === "false") return false;
  return Boolean(req?.secure);
};

const cookieOptions = (req) => ({
  httpOnly: true,
  secure: isSecureRequest(req),
  sameSite: "lax",
  path: "/",
});

// Sign a token for `user` and set it as an httpOnly cookie.
//
// The token is deliberately not returned in the response body any more: the
// SPA used to copy it into localStorage, where any injected script could read
// it, which defeated the point of an httpOnly cookie.
export const issueToken = (res, user) => {
  const token = jwt.sign(
    { id: String(user._id), v: user.tokenVersion || 0 },
    jwtSecret(),
    { expiresIn: `${TOKEN_TTL_DAYS}d`, algorithm: ALGORITHM, jwtid: crypto.randomUUID() }
  );

  // Express exposes the request on `res.req`.
  res.cookie(COOKIE_NAME, token, {
    ...cookieOptions(res.req),
    maxAge: TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000,
  });

  return token;
};

export const clearTokenCookie = (res) => res.clearCookie(COOKIE_NAME, cookieOptions(res.req));

// The cookie first, then an `Authorization: Bearer` header for API clients.
export const readToken = (req) => {
  const fromCookie = req.cookies?.[COOKIE_NAME];
  if (fromCookie) return fromCookie;

  const header = req.headers.authorization;
  if (header && header.startsWith("Bearer ")) return header.substring(7);
  return null;
};

// @throws the jsonwebtoken error (TokenExpiredError, JsonWebTokenError, ...)
export const verifyToken = (token) => jwt.verify(token, jwtSecret(), { algorithms: [ALGORITHM] });

export default { TOKEN_TTL_DAYS, jwtSecret, issueToken, clearTokenCookie, readToken, verifyToken };
