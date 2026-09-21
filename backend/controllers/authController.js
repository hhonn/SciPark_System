import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

import User from "../models/userModel.js";
import OTP from "../models/otpModel.js";
import { sendMailSafely } from "../config/nodemailer.js";
import { MIN_PASSWORD_LENGTH } from "../config/auth.js";

const TOKEN_TTL_DAYS = 7;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Credentials must be strings.
 *
 * The sanitiser strips `$ne` and friends, so an injection attempt arrives as an
 * empty object rather than a query operator — safe, but it then reached bcrypt
 * and threw, answering 500. A malformed credential is a client error.
 */
const isText = (value) => typeof value === "string";

/** Fail fast at boot rather than signing tokens with `undefined`. */
const jwtSecret = () => {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.length < 16) {
    throw new Error("JWT_SECRET is missing or too short — refusing to issue tokens");
  }
  return secret;
};

const issueToken = (res, userId) => {
  const token = jwt.sign({ id: userId }, jwtSecret(), { expiresIn: `${TOKEN_TTL_DAYS}d` });

  res.cookie("token", token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000,
  });

  return token;
};

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

  if (!EMAIL_PATTERN.test(email)) {
    return res.status(400).json({ success: false, message: "รูปแบบอีเมลไม่ถูกต้อง" });
  }

  // Registration used to accept any password while change-password demanded 8
  // characters, so accounts could be created weaker than they could be updated.
  if (String(password).length < MIN_PASSWORD_LENGTH) {
    return res.status(400).json({
      success: false,
      message: `รหัสผ่านต้องมีอย่างน้อย ${MIN_PASSWORD_LENGTH} ตัวอักษร`,
    });
  }

  if (phone && !/^[0-9]{10}$/.test(phone)) {
    return res.status(400).json({
      success: false,
      message: "รูปแบบหมายเลขโทรศัพท์ไม่ถูกต้อง (10 หลัก)",
    });
  }

  try {
    const desiredUsername = username || email;

    const conditions = [{ email: email.toLowerCase() }, { username: desiredUsername }];
    if (phone) conditions.push({ phone });

    const existingUser = await User.findOne({ $or: conditions });

    if (existingUser) {
      // Say which field collided, otherwise "อีเมลนี้ถูกใช้งานแล้ว" is shown
      // even when the real clash was the username or phone number.
      let message = "อีเมลนี้ถูกใช้งานแล้ว";
      if (existingUser.email !== email.toLowerCase()) {
        message = existingUser.username === desiredUsername
          ? "ชื่อผู้ใช้นี้ถูกใช้งานแล้ว"
          : "หมายเลขโทรศัพท์นี้ถูกใช้งานแล้ว";
      }
      return res.status(409).json({ success: false, message });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const user = await User.create({
      name,
      email: email.toLowerCase(),
      username: desiredUsername,
      password: hashedPassword,
      phone: phone || "",
      rank: "Iron",
      points: 0,
    });

    const token = issueToken(res, user._id);

    sendMailSafely({
      to: user.email,
      subject: "ยินดีต้อนรับสู่ SciPark",
      text: `สวัสดี ${name},\n\nขอบคุณที่สมัครสมาชิก SciPark!\n\nคุณสามารถเริ่มจองที่จอดรถได้เลยตอนนี้\n\nทีมงาน SciPark`,
    });

    return res.status(201).json({
      success: true,
      message: "สมัครสมาชิกสำเร็จ",
      token,
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

// Login user
const login = async (req, res) => {
  const { email, username, password } = req.body;

  if ((!email && !username) || !password) {
    return res.status(400).json({ success: false, message: "กรุณากรอกอีเมลและรหัสผ่าน" });
  }

  if (!isText(email ?? username) || !isText(password)) {
    return res.status(400).json({ success: false, message: "รูปแบบข้อมูลไม่ถูกต้อง" });
  }

  try {
    const identifier = String(email || username).trim();
    const lowered = identifier.toLowerCase();

    // Emails are stored lowercased, usernames as typed. Matching the username
    // case-sensitively meant an account created as "SmokeTester" could not log
    // in as "smoketester", while its own email address worked either way.
    const usernamePattern = new RegExp(
      `^${identifier.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`,
      "i"
    );

    // `password` is `select: false` on the schema, so it must be asked for.
    const user = await User.findOne({
      $or: [{ email: lowered }, { username: usernamePattern }],
    }).select("+password");

    // One message for both branches: revealing "no such user" lets an attacker
    // enumerate which addresses are registered.
    const invalid = { success: false, message: "อีเมลหรือรหัสผ่านไม่ถูกต้อง" };

    if (!user) return res.status(401).json(invalid);

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(401).json(invalid);

    const token = issueToken(res, user._id);

    return res.status(200).json({
      success: true,
      message: "เข้าสู่ระบบสำเร็จ",
      token,
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

// Logout user
const logout = async (req, res) => {
  res.clearCookie("token", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
  });

  return res.status(200).json({ success: true, message: "ออกจากระบบสำเร็จ" });
};

// Send OTP for verification
const sendVerifyOTP = async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    if (!user) return res.status(404).json({ success: false, message: "ไม่พบข้อมูลผู้ใช้" });

    if (user.isAccountVerified) {
      return res.status(400).json({ success: false, message: "บัญชีนี้ยืนยันแล้ว" });
    }

    await OTP.deleteMany({ userId: user._id, type: "ACCOUNT_VERIFICATION" });

    const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
    await OTP.create({
      userId: user._id,
      otp: otpCode, // hashed by the model's pre-save hook
      type: "ACCOUNT_VERIFICATION",
    });

    // The OTP went to `user.username`, which is not an address for accounts
    // that chose a username — the mail simply never arrived.
    await sendMailSafely({
      to: user.email,
      subject: "รหัสยืนยัน SciPark",
      text: `รหัสยืนยันของคุณคือ ${otpCode} (ใช้ได้ภายใน 10 นาที)`,
    });

    return res.status(200).json({ success: true, message: "ส่งรหัส OTP ไปที่อีเมลแล้ว" });
  } catch (error) {
    console.error("Send OTP error:", error);
    return res.status(500).json({ success: false, message: "ไม่สามารถส่งรหัส OTP ได้" });
  }
};

const verifyEmail = async (req, res) => {
  const { otp } = req.body;

  if (!otp) {
    return res.status(400).json({ success: false, message: "กรุณากรอกรหัส OTP" });
  }

  try {
    const user = await User.findById(req.userId);
    if (!user) return res.status(404).json({ success: false, message: "ไม่พบข้อมูลผู้ใช้" });

    const otpRecord = await OTP.findOne({
      userId: user._id,
      type: "ACCOUNT_VERIFICATION",
    });

    // Wrong/expired OTP is a client error. This used to answer HTTP 200 with
    // success:false, so clients that only checked the status code treated a
    // failed verification as a success.
    const rejected = { success: false, message: "รหัส OTP ไม่ถูกต้องหรือหมดอายุแล้ว" };

    if (!otpRecord) return res.status(400).json(rejected);

    const isMatch = await bcrypt.compare(String(otp), otpRecord.otp);
    if (!isMatch) return res.status(400).json(rejected);

    await User.findByIdAndUpdate(user._id, { isAccountVerified: true });
    await OTP.deleteOne({ _id: otpRecord._id });

    return res.status(200).json({ success: true, message: "ยืนยันบัญชีสำเร็จ" });
  } catch (error) {
    console.error("Verify email error:", error);
    return res.status(500).json({ success: false, message: "เกิดข้อผิดพลาด" });
  }
};

export { register, login, logout, getMe, sendVerifyOTP, verifyEmail };
