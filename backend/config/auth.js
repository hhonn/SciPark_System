// Account rules. This file is the only place they are defined.
//
// `MIN_PASSWORD_LENGTH` was declared separately in authController.js and
// userController.js. They happened to agree at 8, but nothing kept them in
// step: raising it in one place would have let a user register with a password
// they could not then set again when changing it.

// Minimum password length, enforced at registration and on change.
export const MIN_PASSWORD_LENGTH = 8;

// Must a user verify their email before booking?
//
// REQUIRE_EMAIL_VERIFICATION=true|false decides explicitly. Unset, it follows
// whether mail can actually be sent: demanding a code nobody can receive
// would lock every user out of booking.
export const emailVerificationRequired = () => {
  const flag = process.env.REQUIRE_EMAIL_VERIFICATION;
  if (flag === "true") return true;
  if (flag === "false") return false;
  if (process.env.MAIL_TRANSPORT === "ses") return true;
  return Boolean(
    (process.env.EMAIL_USER || process.env.SMTP_USER) &&
    (process.env.EMAIL_PASS || process.env.SMTP_PASSWORD || process.env.SMTP_PASS)
  );
};

// Minimum wait between two codes sent to the same account.
export const OTP_RESEND_SECONDS = 60;

export default { MIN_PASSWORD_LENGTH, emailVerificationRequired, OTP_RESEND_SECONDS };