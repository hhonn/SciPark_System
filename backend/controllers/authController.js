import crypto from "crypto";
import bcrypt from "bcryptjs";

import User from "../models/userModel.js";
import OTP from "../models/otpModel.js";
import RevokedToken from "../models/revokedTokenModel.js";
import { sendMailSafely } from "../config/nodemailer.js";
import { MIN_PASSWORD_LENGTH, OTP_RESEND_SECONDS, emailVerificationRequired } from "../config/auth.js";
import { issueToken, clearTokenCookie, readToken, verifyToken } from "../utils/authToken.js";
import { verifyPassword, hashPassword } from "../utils/password.js";
import { logEvent } from "../utils/logger.js";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Usernames may not contain "@".
 *
 * Login accepts an email or a username in the same field. A username was free
 * text, so someone could register the username "VICTIM@MAIL.COM"; logging in
 * as victim@mail.com then matched the attacker's account (usernames were
 * compared case-insensitively, the duplicate check case-sensitively), and the
 * real owner was locked out of their own account. With "@" banned, a username
 * can never be mistaken for an address.
 */
const USERNAME_PATTERN = /^[a-zA-Z0-9_.-]{3,30}$/;

/** Wrong guesses allowed against one OTP before it is thrown away. */
const MAX_OTP_ATTEMPTS = 5;

/**
 * Credentials must be strings.
 *
 * The sanitiser strips `$ne` and friends, so an injection attempt arrives as an
 * empty object rather than a query operator — safe, but it then reached bcrypt
 * and threw, answering 500. A malformed credential is a client error.
 */
const isText = (value) => typeof value === "string";

const escapeRegex = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Exact, case-insensitive match on a username. */
const usernameMatcher = (username) => new RegExp(`^${escapeRegex(username)}$`, "i");

const publicUser = (user) => ({
  id: user._id,
  name: user.name,
  email: user.email,
  username: user.username,
  phone: user.phone,
  rank: user.rank,
  points: user.points,
  isAccountVerified: user.isAccountVerified,
  subscriptionExpiry: user.subscriptionExpiry,
  // Roles, so the UI knows whether to offer the staff scanner.
  isStaff: Boolean(user.isStaff),
  isAdmin: Boolean(user.isAdmin),
  // Whether booking is blocked until isAccountVerified (see config/auth.js).
  emailVerificationRequired: emailVerificationRequired(),
});

// Register new user
const register = async (req, res) => {
  const { name, email, username, password, phone } = req.body;

  if (!name || !email || !password) {
    return res.status(400).json({ success: false, message: "กรุณากรอกข้อมูลให้ครบถ้วน" });
  }

  if (!isText(name) || !isText(email) || !isText(password)) {
    return res.status(400).json({ success: false, message: "รูปแบบข้อมูลไม่ถูกต้อง" });
  }

  const normalizedEmail = email.trim().toLowerCase();

  if (!EMAIL_PATTERN.test(normalizedEmail)) {
    return res.status(400).json({ success: false, message: "รูปแบบอีเมลไม่ถูกต้อง" });
  }

  const hasUsername = username !== undefined && username !== null && username !== "";
  if (hasUsername && (!isText(username) || !USERNAME_PATTERN.test(username.trim()))) {
    return res.status(400).json({
      success: false,
      message: "ชื่อผู้ใช้ต้องเป็นตัวอักษรภาษาอังกฤษ ตัวเลข หรือ _ . - ยาว 3-30 ตัว (ห้ามมี @)",
    });
  }

  // Registration used to accept any password while change-password demanded 8
  // characters, so accounts could be created weaker than they could be updated.
  if (password.length < MIN_PASSWORD_LENGTH) {
    return res.status(400).json({
      success: false,
      message: `รหัสผ่านต้องมีอย่างน้อย ${MIN_PASSWORD_LENGTH} ตัวอักษร`,
    });
  }

  if (phone && (!isText(phone) || !/^[0-9]{10}$/.test(phone))) {
    return res.status(400).json({
      success: false,
      message: "รูปแบบหมายเลขโทรศัพท์ไม่ถูกต้อง (10 หลัก)",
    });
  }

  try {
    // Without a chosen username the (lowercased) email doubles as one.
    const desiredUsername = hasUsername ? username.trim() : normalizedEmail;

    // Usernames are compared case-insensitively here, the same way login
    // compares them, so "Bob" cannot be registered next to "bob".
    const conditions = [
      { email: normalizedEmail },
      { username: usernameMatcher(desiredUsername) },
    ];
    if (phone) conditions.push({ phone });

    const existingUser = await User.findOne({ $or: conditions });

    if (existingUser) {
      // Say which field collided, otherwise "อีเมลนี้ถูกใช้งานแล้ว" is shown
      // even when the real clash was the username or phone number.
      let message = "อีเมลนี้ถูกใช้งานแล้ว";
      if (existingUser.email !== normalizedEmail) {
        message = usernameMatcher(desiredUsername).test(existingUser.username)
          ? "ชื่อผู้ใช้นี้ถูกใช้งานแล้ว"
          : "หมายเลขโทรศัพท์นี้ถูกใช้งานแล้ว";
      }
      return res.status(409).json({ success: false, message });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const user = await User.create({
      name,
      email: normalizedEmail,
      username: desiredUsername,
      password: hashedPassword,
      phone: phone || "",
      rank: "Iron",
      points: 0,
    });

    issueToken(res, user);

    sendMailSafely({
      to: user.email,
      subject: "ยินดีต้อนรับสู่ SciPark",
      text: `สวัสดี ${name},\n\nขอบคุณที่สมัครสมาชิก SciPark!\n\nคุณสามารถเริ่มจองที่จอดรถได้เลยตอนนี้\n\nทีมงาน SciPark`,
    });

    logEvent("user_registered");
    return res.status(201).json({
      success: true,
      message: "สมัครสมาชิกสำเร็จ",
      user: publicUser(user),
    });
  } catch (error) {
    // A racing duplicate slips past the findOne check and lands here.
    if (error.code === 11000) {
      return res.status(409).json({ success: false, message: "อีเมลหรือชื่อผู้ใช้นี้ถูกใช้งานแล้ว" });
    }
    console.error("Register error:", error);
    return res.status(500).json({ success: false, message: "เกิดข้อผิดพลาด" });
  }
};

/**
 * Find the account a login identifier names.
 *
 * Anything with an "@" is an email and is matched against emails only — never
 * against usernames — so an account cannot be shadowed by a lookalike
 * username. Older data may still hold usernames that differ only in case; an
 * exact match wins, and an ambiguous one matches nobody.
 */
const findLoginUser = async (identifier) => {
  if (identifier.includes("@")) {
    return User.findOne({ email: identifier.toLowerCase() }).select("+password");
  }

  const candidates = await User.find({ username: usernameMatcher(identifier) })
    .select("+password")
    .limit(5);

  return candidates.find((u) => u.username === identifier)
    || (candidates.length === 1 ? candidates[0] : null);
};

// Login user
const login = async (req, res) => {
  const { email, username, password } = req.body;

  if ((!email && !username) || !password) {
    return res.status(400).json({ success: false, message: "กรุณากรอกอีเมลและรหัสผ่าน" });
  }

  if (!isText(email || username) || !isText(password)) {
    return res.status(400).json({ success: false, message: "รูปแบบข้อมูลไม่ถูกต้อง" });
  }

  try {
    const identifier = String(email || username).trim();
    const user = await findLoginUser(identifier);

    // One message for both branches: revealing "no such user" lets an attacker
    // enumerate which addresses are registered.
    const invalid = { success: false, message: "อีเมลหรือรหัสผ่านไม่ถูกต้อง" };

    if (!user) {
      logEvent("login_failed");
      return res.status(401).json(invalid);
    }

    const check = await verifyPassword(password, user.password);
    if (!check.ok) {
      logEvent("login_failed");
      return res.status(401).json(invalid);
    }

    // Matched only through the pre-fix escaping (see utils/password.js):
    // store the hash of what the user really types from now on.
    if (check.needsRehash) {
      user.password = await hashPassword(password);
      await user.save();
    }

    issueToken(res, user);

    return res.status(200).json({
      success: true,
      message: "เข้าสู่ระบบสำเร็จ",
      user: publicUser(user),
    });
  } catch (error) {
    console.error("Login error:", error);
    return res.status(500).json({ success: false, message: "เกิดข้อผิดพลาด" });
  }
};

// Current session
const getMe = async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    if (!user) return res.status(404).json({ success: false, message: "ไม่พบข้อมูลผู้ใช้" });
    return res.status(200).json({ success: true, user: publicUser(user) });
  } catch (error) {
    console.error("Get me error:", error);
    return res.status(500).json({ success: false, message: "เกิดข้อผิดพลาด" });
  }
};

/**
 * Logout: revoke the token, not just the cookie.
 *
 * Clearing the cookie alone left the token itself valid for the rest of its
 * 7 days, so any copy of it kept working after the user had "logged out".
 * Runs without the auth middleware so an already-dead session can still log
 * out cleanly.
 */
const logout = async (req, res) => {
  const token = readToken(req);

  if (token) {
    try {
      const decoded = verifyToken(token);
      if (decoded.jti && decoded.exp) {
        await RevokedToken.updateOne(
          { jti: decoded.jti },
          { $setOnInsert: { jti: decoded.jti, expiresAt: new Date(decoded.exp * 1000) } },
          { upsert: true }
        );
      }
    } catch {
      // Expired or forged: there is nothing left to revoke.
    }
  }

  clearTokenCookie(res);
  return res.status(200).json({ success: true, message: "ออกจากระบบสำเร็จ" });
};

// ---------------------------------------------------------------------------
// One-time codes (email verification and password reset share these rules)
// ---------------------------------------------------------------------------

const OTP_TTL_MINUTES = 10;

/**
 * Issue a fresh 6-digit code of `type` for `user` and email it.
 *
 * @returns {{ sent: true } | { sent: false, retryAfter: number }}  a refusal
 *          means a code was sent less than OTP_RESEND_SECONDS ago.
 */
const issueOtp = async (user, type, subject, describe) => {
  const recent = await OTP.findOne({ userId: user._id, type }).sort({ createdAt: -1 });
  if (recent) {
    const age = (Date.now() - new Date(recent.createdAt).getTime()) / 1000;
    if (age < OTP_RESEND_SECONDS) return { sent: false, retryAfter: Math.ceil(OTP_RESEND_SECONDS - age) };
  }

  await OTP.deleteMany({ userId: user._id, type });

  // crypto.randomInt, not Math.random: the latter is not meant for secrets
  // and its output can be predicted from earlier values.
  const code = crypto.randomInt(100000, 1000000).toString();
  await OTP.create({ userId: user._id, otp: code, type }); // hashed by the model's pre-save hook

  await sendMailSafely({
    to: user.email,
    subject,
    text: `${describe(code)}\n\nรหัสนี้ใช้ได้ภายใน ${OTP_TTL_MINUTES} นาที หากคุณไม่ได้ขอรหัสนี้ ไม่ต้องดำเนินการใด ๆ`,
  });
  return { sent: true };
};

/**
 * Check a code. Wrong guesses are capped per code: the IP rate limit alone
 * let a 6-digit code be worked through from many addresses in its lifetime.
 *
 * @returns {"ok" | "invalid" | "locked"}  "ok" consumes the code.
 */
const consumeOtp = async (userId, type, code) => {
  const record = await OTP.findOne({ userId, type });
  if (!record) return "invalid";

  if (await bcrypt.compare(String(code), record.otp)) {
    await OTP.deleteOne({ _id: record._id });
    return "ok";
  }

  const attempts = (record.attempts || 0) + 1;
  if (attempts >= MAX_OTP_ATTEMPTS) {
    await OTP.deleteOne({ _id: record._id });
    return "locked";
  }
  await OTP.updateOne({ _id: record._id }, { $set: { attempts } });
  return "invalid";
};

const tooSoon = (res, retryAfter) =>
  res.status(429).json({
    success: false,
    code: "otp_cooldown",
    message: `เพิ่งส่งรหัสไปแล้ว กรุณารอ ${retryAfter} วินาทีก่อนขอใหม่`,
    retryAfter,
  });

const lockedReply = { success: false, code: "otp_locked", message: "กรอกรหัสผิดหลายครั้งเกินไป กรุณาขอรหัสใหม่" };

const isSixDigits = (value) => /^\d{6}$/.test(String(value ?? ""));

// Send OTP for verification
const sendVerifyOTP = async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    if (!user) return res.status(404).json({ success: false, message: "ไม่พบข้อมูลผู้ใช้" });

    if (user.isAccountVerified) {
      return res.status(400).json({ success: false, message: "บัญชีนี้ยืนยันแล้ว" });
    }

    const result = await issueOtp(
      user,
      "ACCOUNT_VERIFICATION",
      "รหัสยืนยันอีเมล SciPark",
      (code) => `รหัสยืนยันอีเมลของคุณคือ ${code}`
    );
    if (!result.sent) return tooSoon(res, result.retryAfter);

    return res.status(200).json({ success: true, message: `ส่งรหัสยืนยันไปที่ ${user.email} แล้ว` });
  } catch (error) {
    console.error("Send OTP error:", error);
    return res.status(500).json({ success: false, message: "ไม่สามารถส่งรหัส OTP ได้" });
  }
};

const verifyEmail = async (req, res) => {
  const { otp } = req.body || {};

  if (!isSixDigits(otp)) {
    return res.status(400).json({ success: false, message: "กรุณากรอกรหัส OTP 6 หลัก" });
  }

  try {
    const user = await User.findById(req.userId);
    if (!user) return res.status(404).json({ success: false, message: "ไม่พบข้อมูลผู้ใช้" });
    if (user.isAccountVerified) return res.status(200).json({ success: true, message: "บัญชีนี้ยืนยันแล้ว" });

    // Wrong/expired OTP is a client error. This used to answer HTTP 200 with
    // success:false, so clients that only checked the status code treated a
    // failed verification as a success.
    const outcome = await consumeOtp(user._id, "ACCOUNT_VERIFICATION", otp);
    if (outcome === "locked") return res.status(400).json(lockedReply);
    if (outcome !== "ok") {
      return res.status(400).json({ success: false, message: "รหัส OTP ไม่ถูกต้องหรือหมดอายุแล้ว" });
    }

    await User.findByIdAndUpdate(user._id, { isAccountVerified: true });
    return res.status(200).json({ success: true, message: "ยืนยันอีเมลสำเร็จ" });
  } catch (error) {
    console.error("Verify email error:", error);
    return res.status(500).json({ success: false, message: "เกิดข้อผิดพลาด" });
  }
};

/*
    @desc   Start a password reset: email a 6-digit code
    @route  POST /api/auth/forgot-password
    @access Public

    Always answers the same way, whether or not the address has an account,
    so the form cannot be used to find out who is registered.
*/
const GENERIC_RESET_REPLY = {
  success: true,
  message: "หากอีเมลนี้มีบัญชีอยู่ เราได้ส่งรหัสสำหรับตั้งรหัสผ่านใหม่ไปแล้ว กรุณาตรวจสอบอีเมล (รวมถึงโฟลเดอร์สแปม)",
};

const forgotPassword = async (req, res) => {
  const { email } = req.body || {};
  if (!isText(email) || !EMAIL_PATTERN.test(email.trim())) {
    return res.status(400).json({ success: false, message: "กรุณากรอกอีเมลให้ถูกต้อง" });
  }

  try {
    const user = await User.findOne({ email: email.trim().toLowerCase() });
    // The cooldown is not reported either: that too would reveal the account.
    if (user) {
      await issueOtp(
        user,
        "PASSWORD_RESET",
        "รหัสตั้งรหัสผ่านใหม่ SciPark",
        (code) => `รหัสสำหรับตั้งรหัสผ่านใหม่ของคุณคือ ${code}`
      );
    } else {
      // Spend about as long as the real path (which hashes a code), so the
      // response time does not give away which addresses are registered.
      await bcrypt.hash(crypto.randomBytes(8).toString("hex"), 10);
    }
    return res.status(200).json(GENERIC_RESET_REPLY);
  } catch (error) {
    console.error("Forgot password error:", error);
    return res.status(500).json({ success: false, message: "เกิดข้อผิดพลาด" });
  }
};

/*
    @desc   Finish a password reset with the emailed code
    @route  POST /api/auth/reset-password
    @access Public
*/
const resetPassword = async (req, res) => {
  const { email, otp, newPassword } = req.body || {};

  if (!isText(email) || !isSixDigits(otp) || !isText(newPassword)) {
    return res.status(400).json({ success: false, message: "กรุณากรอกอีเมล รหัส 6 หลัก และรหัสผ่านใหม่" });
  }
  if (newPassword.length < MIN_PASSWORD_LENGTH) {
    return res.status(400).json({ success: false, message: `รหัสผ่านต้องมีอย่างน้อย ${MIN_PASSWORD_LENGTH} ตัวอักษร` });
  }

  const rejected = { success: false, message: "รหัสไม่ถูกต้องหรือหมดอายุแล้ว" };

  try {
    const user = await User.findOne({ email: email.trim().toLowerCase() });
    if (!user) return res.status(400).json(rejected);

    const outcome = await consumeOtp(user._id, "PASSWORD_RESET", otp);
    if (outcome === "locked") return res.status(400).json(lockedReply);
    if (outcome !== "ok") return res.status(400).json(rejected);

    // The code arrived by email, so the address is proven too. Every session
    // under the old password ends.
    await User.updateOne(
      { _id: user._id },
      {
        $set: { password: await hashPassword(newPassword), isAccountVerified: true },
        $inc: { tokenVersion: 1 },
      }
    );

    sendMailSafely({
      to: user.email,
      subject: "รหัสผ่าน SciPark ถูกเปลี่ยนแล้ว",
      text: "รหัสผ่านบัญชี SciPark ของคุณเพิ่งถูกตั้งใหม่ และทุกอุปกรณ์ถูกออกจากระบบแล้ว หากคุณไม่ได้ทำรายการนี้ กรุณาติดต่อทีมงานทันที",
    });

    return res.status(200).json({ success: true, message: "ตั้งรหัสผ่านใหม่สำเร็จ กรุณาเข้าสู่ระบบด้วยรหัสผ่านใหม่" });
  } catch (error) {
    console.error("Reset password error:", error);
    return res.status(500).json({ success: false, message: "เกิดข้อผิดพลาด" });
  }
};

export { register, login, logout, getMe, sendVerifyOTP, verifyEmail, forgotPassword, resetPassword };
