import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import User from "../models/userModel.js";
import Booking from "../models/bookingModel.js";
import { getEffectiveTier } from "../config/pricing.js";
import { MIN_PASSWORD_LENGTH } from "../config/auth.js";
import { issueToken } from "../utils/authToken.js";
import { verifyPassword } from "../utils/password.js";

const ACTIVE_STATUSES = ["pending", "confirmed"];

// Spend and savings across a user's finished bookings.
//
// Two bugs lived here: `totalSpent` summed `cost` (overtime only) and quietly
// dropped every booking fee, and savings were re-derived from the current rank
// with percentages that matched neither the pricing config nor each other.
// Both now come from what was actually billed and stored on the booking.
const summariseSpend = (bookings, forfeited = []) => {
  let totalSpent = 0;
  let totalSavings = 0;

  // A cancelled booking still cost its non-refundable fee. Only completed
  // bookings were summed, so a user who lost three fees was told they had
  // spent nothing.
  for (const booking of forfeited) totalSpent += booking.bookingFee || 0;

  for (const booking of bookings) {
    const bookingFee = booking.bookingFee || 0;
    const overtime = booking.cost || 0;
    totalSpent += booking.totalCost || bookingFee + overtime;

    // The discount that was in force at check-out is recorded per booking, so
    // the saving is reconstructed from the price actually charged.
    const percent = (booking.discountPercent || 0) / 100;
    if (percent > 0 && percent < 1) {
      totalSavings += (overtime / (1 - percent)) * percent;
    }
  }

  return { totalSpent: Math.round(totalSpent), totalSavings: Math.round(totalSavings) };
};

// @desc   Get user profile
// @route  GET /api/user/profile
// @access Private
export const getProfile = async (req, res) => {
  try {
    const userId = req.userId;

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ success: false, message: "ไม่พบข้อมูลผู้ใช้" });
    }

    const [totalBookings, completedList, activeBookings, forfeited] = await Promise.all([
      Booking.countDocuments({ user: userId }),
      Booking.find({ user: userId, status: "completed" }).select(
        "bookingFee cost totalCost discountPercent"
      ),
      Booking.countDocuments({ user: userId, status: { $in: ACTIVE_STATUSES } }),
      Booking.find({ user: userId, status: "cancelled", paymentStatus: "paid" }).select("bookingFee"),
    ]);

    const { totalSpent, totalSavings } = summariseSpend(completedList, forfeited);
    const tier = getEffectiveTier(user);

    res.status(200).json({
      success: true,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        username: user.username,
        phone: user.phone,
        rank: tier.name,
        points: user.points,
        isAccountVerified: user.isAccountVerified,
        subscriptionExpiry: user.subscriptionExpiry,
        activeDiscount: user.activeDiscount || null,
        createdAt: user.createdAt,
      },
      stats: {
        totalBookings,
        completedBookings: completedList.length,
        totalSpent,
        totalSavings,
        // Previously `totalBookings - completedBookings`, which counted every
        // cancelled booking as still active.
        activeBookings,
      },
    });
  } catch (error) {
    console.error("Get profile error:", error);
    res.status(500).json({ success: false, message: "เกิดข้อผิดพลาด" });
  }
};

// @desc   Update user profile
// @route  PUT /api/user/profile
// @access Private
export const updateProfile = async (req, res) => {
  try {
    const { name, phone } = req.body;

    if (!name || !String(name).trim()) {
      return res.status(400).json({ success: false, message: "กรุณากรอกชื่อ-นามสกุล" });
    }

    // Registration treats the phone number as optional, so demanding one here
    // locked anyone who signed up without one out of editing their own name.
    const trimmedPhone = phone === undefined || phone === null ? undefined : String(phone).trim();

    if (trimmedPhone) {
      if (!/^[0-9]{10}$/.test(trimmedPhone)) {
        return res.status(400).json({
          success: false,
          message: "รูปแบบหมายเลขโทรศัพท์ไม่ถูกต้อง (10 หลัก)",
        });
      }

      // Register rejects a phone number that another account already holds;
      // updating one did not, so the same number could be spread across
      // accounts by editing instead of signing up.
      const taken = await User.findOne({ phone: trimmedPhone, _id: { $ne: req.userId } }).select("_id");
      if (taken) {
        return res.status(409).json({
          success: false,
          message: "หมายเลขโทรศัพท์นี้ถูกใช้งานแล้ว",
        });
      }
    }

    const update = { name: String(name).trim() };
    if (trimmedPhone !== undefined) update.phone = trimmedPhone;

    const user = await User.findByIdAndUpdate(
      req.userId,
      update,
      { new: true, runValidators: true }
    );

    if (!user) {
      return res.status(404).json({ success: false, message: "ไม่พบข้อมูลผู้ใช้" });
    }

    res.status(200).json({
      success: true,
      message: "อัปเดตข้อมูลสำเร็จ",
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        username: user.username,
        phone: user.phone,
        rank: user.rank,
        points: user.points,
        subscriptionExpiry: user.subscriptionExpiry,
      },
    });
  } catch (error) {
    console.error("Update profile error:", error);
    res.status(500).json({ success: false, message: "เกิดข้อผิดพลาด" });
  }
};

// @desc   Change password
// @route  PUT /api/user/change-password
// @access Private
export const changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (typeof currentPassword !== "string" || typeof newPassword !== "string" || !currentPassword || !newPassword) {
      return res.status(400).json({
        success: false,
        message: "กรุณากรอกรหัสผ่านเดิมและรหัสผ่านใหม่",
      });
    }

    if (String(newPassword).length < MIN_PASSWORD_LENGTH) {
      return res.status(400).json({
        success: false,
        message: `รหัสผ่านใหม่ต้องมีอย่างน้อย ${MIN_PASSWORD_LENGTH} ตัวอักษร`,
      });
    }

    if (currentPassword === newPassword) {
      return res.status(400).json({
        success: false,
        message: "รหัสผ่านใหม่ต้องไม่ซ้ำกับรหัสผ่านเดิม",
      });
    }

    // `password` is select:false on the schema.
    const user = await User.findById(req.userId).select("+password");
    if (!user) {
      return res.status(404).json({ success: false, message: "ไม่พบข้อมูลผู้ใช้" });
    }

    // verifyPassword also accepts passwords stored under the old escaping bug.
    const { ok: isPasswordValid } = await verifyPassword(currentPassword, user.password);
    if (!isPasswordValid) {
      return res.status(401).json({ success: false, message: "รหัสผ่านเดิมไม่ถูกต้อง" });
    }

    user.password = await bcrypt.hash(newPassword, 10);
    // Every token issued under the old password stops working, on every
    // device: whoever knew the old password may also be holding a session.
    user.tokenVersion = (user.tokenVersion || 0) + 1;
    await user.save();

    // ...except this one, which gets a fresh token at the new version.
    issueToken(res, user);

    res.status(200).json({ success: true, message: "เปลี่ยนรหัสผ่านสำเร็จ ออกจากระบบอุปกรณ์อื่นทั้งหมดแล้ว" });
  } catch (error) {
    console.error("Change password error:", error);
    res.status(500).json({ success: false, message: "เกิดข้อผิดพลาด" });
  }
};

// @desc   Booking history (flat shape used by the profile screen)
// @route  GET /api/user/bookings
// @access Private
export const getBookingHistory = async (req, res) => {
  try {
    const userId = req.userId;
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 10));
    const { status } = req.query;

    const query = { user: userId };
    if (status && ["pending", "confirmed", "completed", "cancelled"].includes(status)) {
      query.status = status;
    }

    const [bookings, count] = await Promise.all([
      Booking.find(query)
        .populate({
          path: "spot",
          select: "spotNumber name floor building",
          populate: { path: "zone", select: "zoneName name building" },
        })
        .populate("vehicle", "licensePlate brand model")
        .sort({ createdAt: -1 })
        .limit(limit)
        .skip((page - 1) * limit),
      Booking.countDocuments(query),
    ]);

    const formattedBookings = bookings.map((booking) => ({
      id: booking._id,
      spotNumber: booking.spot?.spotNumber || booking.spotNumber || "N/A",
      spotName: booking.spot?.name || "N/A",
      zoneName: booking.spot?.zone?.zoneName || booking.zoneName || "N/A",
      floor: booking.floor || booking.spot?.floor || "N/A",
      building: booking.spot?.building || booking.spot?.zone?.building || "N/A",
      vehicle: booking.vehicle
        ? {
            licensePlate: booking.vehicle.licensePlate,
            brand: booking.vehicle.brand,
            model: booking.vehicle.model,
          }
        : null,
      startTime: booking.actualStartTime || booking.startTime,
      endTime: booking.actualEndTime || booking.endTime,
      bookingFee: booking.bookingFee,
      cost: booking.cost || 0,
      totalCost: booking.totalCost || booking.bookingFee || 0,
      pointsEarned: booking.pointsEarned || 0,
      status: booking.status,
      createdAt: booking.createdAt,
    }));

    res.status(200).json({
      success: true,
      bookings: formattedBookings,
      totalPages: Math.ceil(count / limit) || 1,
      currentPage: page,
      totalBookings: count,
    });
  } catch (error) {
    console.error("Get booking history error:", error);
    res.status(500).json({ success: false, message: "เกิดข้อผิดพลาด" });
  }
};

// @desc   Aggregate user statistics
// @route  GET /api/user/stats
// @access Private
export const getUserStats = async (req, res) => {
  try {
    const userId = req.userId;

    const user = await User.findById(userId).select("rank points subscriptionExpiry");
    if (!user) {
      return res.status(404).json({ success: false, message: "ไม่พบข้อมูลผู้ใช้" });
    }

    // `$match` does not cast strings to ObjectId the way a query does, so the
    // aggregation below matched nothing and "favourite zone" was always null.
    const userObjectId = new mongoose.Types.ObjectId(userId);

    const [totalBookings, activeBookings, completedList, bookingsByZone, forfeited] = await Promise.all([
      Booking.countDocuments({ user: userId }),
      // "active" is not in the status enum; this counter was permanently zero.
      Booking.countDocuments({ user: userId, status: { $in: ACTIVE_STATUSES } }),
      Booking.find({ user: userId, status: "completed" }).select(
        "bookingFee cost totalCost discountPercent"
      ),
      Booking.aggregate([
        { $match: { user: userObjectId, status: "completed" } },
        {
          $lookup: {
            from: "parkingspots",
            localField: "spot",
            foreignField: "_id",
            as: "spotInfo",
          },
        },
        { $unwind: "$spotInfo" },
        {
          $lookup: {
            from: "parkingzones",
            localField: "spotInfo.zone",
            foreignField: "_id",
            as: "zoneInfo",
          },
        },
        { $unwind: "$zoneInfo" },
        { $group: { _id: "$zoneInfo.zoneName", count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 1 },
      ]),
      Booking.find({ user: userId, status: "cancelled", paymentStatus: "paid" }).select("bookingFee"),
    ]);

    const { totalSpent, totalSavings } = summariseSpend(completedList, forfeited);
    const tier = getEffectiveTier(user);

    res.status(200).json({
      success: true,
      stats: {
        rank: tier.name,
        points: user.points,
        totalBookings,
        activeBookings,
        completedBookings: completedList.length,
        totalSpent,
        totalSavings,
        favoriteZone: bookingsByZone.length > 0 ? bookingsByZone[0]._id : null,
        subscriptionActive: tier.id !== "iron",
        subscriptionExpiry: user.subscriptionExpiry,
      },
    });
  } catch (error) {
    console.error("Get user stats error:", error);
    res.status(500).json({ success: false, message: "เกิดข้อผิดพลาด" });
  }
};
