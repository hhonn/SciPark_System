import bcrypt from "bcryptjs";

// Password checks that survive an old sanitiser bug.
//
// Until it was removed, the request sanitiser rewrote `<` to `&lt;` and `>` to
// `&gt;` before the password was hashed. Anyone who registered with either
// character therefore has the hash of the *escaped* text on file. Now that
// passwords arrive as typed, those users would be locked out. So a failed
// match is retried against the escaped form, and on success the caller
// re-hashes the real password so the fallback is needed only once.

const legacyEscape = (text) => text.replace(/[<>]/g, (c) => (c === "<" ? "&lt;" : "&gt;"));

// @returns {{ ok: boolean, needsRehash: boolean }}
export const verifyPassword = async (plain, hash) => {
  if (typeof plain !== "string" || !hash) return { ok: false, needsRehash: false };
  if (await bcrypt.compare(plain, hash)) return { ok: true, needsRehash: false };
  if (/[<>]/.test(plain) && (await bcrypt.compare(legacyEscape(plain), hash))) {
    return { ok: true, needsRehash: true };
  }
  return { ok: false, needsRehash: false };
};

export const hashPassword = (plain) => bcrypt.hash(plain, 10);

export default { verifyPassword, hashPassword };
