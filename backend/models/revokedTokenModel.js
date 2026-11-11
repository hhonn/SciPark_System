import mongoose from "mongoose";

/**
 * Tokens that were logged out before they expired.
 *
 * A JWT stays valid until its `exp` no matter what the server does, so logout
 * used to only clear the cookie: anyone holding a copy of the token (a stolen
 * header, a shared computer) kept full access for up to 7 days. Each token now
 * carries a `jti`, and logging out records it here until it would have expired
 * anyway — the TTL index then removes the row by itself.
 */
const revokedTokenSchema = new mongoose.Schema({
  jti: {
    type: String,
    required: true,
    unique: true,
  },
  expiresAt: {
    type: Date,
    required: true,
  },
});

revokedTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

const RevokedToken =
  mongoose.models.RevokedToken || mongoose.model("RevokedToken", revokedTokenSchema);

export default RevokedToken;
