/**
 * Account rules — SINGLE SOURCE OF TRUTH.
 *
 * `MIN_PASSWORD_LENGTH` was declared separately in authController.js and
 * userController.js. They happened to agree at 8, but nothing kept them in
 * step: raising it in one place would have let a user register with a password
 * they could not then set again when changing it.
 */

/** Minimum password length, enforced at registration and on change. */
export const MIN_PASSWORD_LENGTH = 8;

export default { MIN_PASSWORD_LENGTH };