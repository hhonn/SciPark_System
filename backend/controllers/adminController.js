import mongoose from "mongoose";
import Booking from "../models/bookingModel.js";
import ParkingSpot from "../models/parkingSpotModel.js";
import User from "../models/userModel.js";
import Vehicle from "../models/vehicleModel.js";
import { authorizeCharge, PaymentError } from "../services/paymentService.js";
import { calculateSessionCost, getEffectiveTier } from "../config/pricing.js";
import { createNotification } from "../services/notificationService.js";
import { addPoints } from "../services/pointsService.js";
import { HttpError, sendError } from "../utils/httpError.js";
import { logEvent } from "../utils/logger.js";

/**
 * Operator tools.
 *
 * Before these existed an admin could only flip a spot's status. A car whose
 * card failed at check-out stayed "parked" forever, an abandoned booking
 * held its bay until the driver came back, and nobody could see who was
 * where. Every action here records which admin took it.
 */

const ACTIVE = ["pending", "confirmed"];
const STATUS_FILTERS = {
  active: { $in: ACTIVE },
  pending: "pending",
  confirmed: "confirmed",
  completed: "completed",
  cancelled: "cancelled",
  unpaid: null, // handled separately: completed but the charge failed
};

const escapeRegex = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const page = (value) => Math.max(1, parseInt(value, 10) || 1);
const PAGE_SIZE = 20;

const note = (value) => String(value ?? "").trim().slice(0, 300);

const shapeBooking = (b) => ({
  id: b._id,
  status: b.status,
  paymentStatus: b.paymentStatus,
  user: b.user ? { id: b.user._id, name: b.user.name, email: b.user.email } : null,
  vehicle: b.vehicle ? { licensePlate: b.vehicle.licensePlate, brand: b.vehicle.brand, model: b.vehicle.model } : null,
  zoneName: b.zoneName,
  spotNumber: b.spotNumber,
  createdAt: b.createdAt,
  checkInDeadline: b.checkInDeadline,
  actualStartTime: b.actualStartTime,
  endTime: b.actualEndTime || b.endTime,
  checkInMethod: b.checkInMethod,
  bookingFee: b.bookingFee,
  cost: b.cost,
  totalCost: b.totalCost,
  cancelReason: b.cancelReason,
  adminNote: b.adminNote,
});

/*
    @desc   Bookings, filterable and searchable
    @route  GET /api/admin/bookings?status=active&q=<plate|email|name|spot>&page=1
    @access Admin
*/
export const listBookings = async (req, res) => {
  try {
    const status = String(req.query.status || "active");
    const q = String(req.query.q || "").trim();

    const filter = {};
    if (status === "unpaid") {
      filter.paymentStatus = "failed";
    } else if (STATUS_FILTERS[status] !== undefined) {
      filter.status = STATUS_FILTERS[status];
    }

    if (q) {
      const pattern = new RegExp(escapeRegex(q.replace(/\s+/g, "")), "i");
      const loose = new RegExp(escapeRegex(q), "i");
      const [users, vehicles] = await Promise.all([
        User.find({ $or: [{ email: loose }, { name: loose }] }).select("_id").limit(200),
        Vehicle.find({ licensePlate: pattern }).select("_id").limit(200),
      ]);
      filter.$or = [
        { user: { $in: users.map((u) => u._id) } },
        { vehicle: { $in: vehicles.map((v) => v._id) } },
        { spotNumber: loose },
      ];
    }

    const current = page(req.query.page);
    const [rows, total] = await Promise.all([
      Booking.find(filter)
        .populate("user", "name email")
        .populate("vehicle", "licensePlate brand model")
        .sort({ createdAt: -1 })
        .skip((current - 1) * PAGE_SIZE)
        .limit(PAGE_SIZE),
      Booking.countDocuments(filter),
    ]);

    res.json({
      success: true,
      bookings: rows.map(shapeBooking),
      pagination: { page: current, pages: Math.ceil(total / PAGE_SIZE) || 1, total },
    });
  } catch (error) {
    sendError(res, error, "โหลดรายการจองไม่สำเร็จ", "Admin list bookings error");
  }
};

/*
    @desc   Cancel a pending or checked-in booking and free its spot
    @route  POST /api/admin/bookings/:id/cancel   { note }
    @access Admin
*/
export const adminCancelBooking = async (req, res) => {
  const session = await mongoose.startSession();
  let booking;

  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) throw new HttpError(404, "ไม่พบการจอง");
    const reason = note(req.body?.note);

    await session.withTransaction(async () => {
      // Conditional, so it cannot race a check-out or the auto-cancel sweep.
      booking = await Booking.findOneAndUpdate(
        { _id: id, status: { $in: ACTIVE } },
        {
          $set: {
            status: "cancelled",
            cancelReason: "admin_cancelled",
            endTime: new Date(),
            qrTokenHash: null,
            closedBy: req.userId,
            adminNote: reason,
          },
        },
        { new: true, session }
      );
      if (!booking) throw new HttpError(409, "การจองนี้ไม่ได้อยู่ในสถานะที่ยกเลิกได้แล้ว");

      await ParkingSpot.updateOne({ _id: booking.spot }, { status: "available" }, { session });
    });

    createNotification(
      booking.user,
      "booking_cancelled",
      "❌ การจองถูกยกเลิกโดยเจ้าหน้าที่",
      `การจองช่อง ${booking.spotNumber} ถูกยกเลิกโดยผู้ดูแลระบบ${reason ? `: ${reason}` : ""}`,
      { bookingId: booking._id }
    ).catch(() => {});

    logEvent("booking_cancelled", { reason: "admin" });
    res.json({ success: true, message: `ยกเลิกการจองช่อง ${booking.spotNumber} แล้ว และคืนช่องจอด` });
  } catch (error) {
    sendError(res, error, "ยกเลิกไม่สำเร็จ", "Admin cancel error");
  } finally {
    await session.endSession();
  }
};

/*
    @desc   Check a parked car out on the driver's behalf
    @route  POST /api/admin/bookings/:id/force-checkout   { note }
    @access Admin

    Bills exactly as a normal check-out would. If the charge is declined the
    booking still closes and the bay is freed — the amount is recorded as
    owed (paymentStatus "failed", listed under the "unpaid" filter) instead of
    keeping the car "parked" and the bay blocked indefinitely.
*/
export const forceCheckout = async (req, res) => {
  const session = await mongoose.startSession();
  let booking;
  let bill;
  let settled = true;

  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) throw new HttpError(404, "ไม่พบการจอง");
    const reason = note(req.body?.note);

    await session.withTransaction(async () => {
      settled = true;
      booking = await Booking.findOne({ _id: id, status: "confirmed" }).session(session);
      if (!booking) throw new HttpError(409, "เช็คเอาต์แทนได้เฉพาะการจองที่เช็คอินอยู่");

      const user = await User.findById(booking.user).session(session);
      const now = new Date();
      bill = calculateSessionCost({
        startedAt: booking.actualStartTime || booking.startTime,
        endedAt: now,
        user,
        bookingFee: booking.bookingFee,
      });

      if (bill.overtimeCost > 0) {
        try {
          await authorizeCharge({
            userId: booking.user,
            amount: bill.overtimeCost,
            preferredMethodId: booking.paymentMethod,
            session,
            description: `SciPark overtime (admin) - ${booking.spotNumber}`,
          });
        } catch (error) {
          if (!(error instanceof PaymentError)) throw error;
          settled = false;
        }
      }

      Object.assign(booking, {
        status: "completed",
        actualEndTime: now,
        endTime: now,
        cost: bill.overtimeCost,
        totalCost: bill.totalCost,
        discountPercent: bill.discountPercent,
        pointsEarned: settled ? bill.pointsEarned : 0,
        paymentStatus: settled ? "settled" : "failed",
        closedBy: req.userId,
        adminNote: reason,
      });
      await booking.save({ session });

      await ParkingSpot.updateOne({ _id: booking.spot }, { status: "available" }, { session });
      if (settled) {
        await addPoints({ userId: booking.user, amount: bill.pointsEarned, reason: "session", bookingId: booking._id, session });
      }
    });

    createNotification(
      booking.user,
      "checkout_success",
      "🚗 เจ้าหน้าที่เช็คเอาต์ให้แล้ว",
      settled
        ? `ช่อง ${booking.spotNumber} ถูกเช็คเอาต์โดยเจ้าหน้าที่ ค่าใช้จ่ายรวม ${bill.totalCost} บาท`
        : `ช่อง ${booking.spotNumber} ถูกเช็คเอาต์โดยเจ้าหน้าที่ มียอดค้างชำระ ${bill.overtimeCost} บาท`,
      { bookingId: booking._id, total: bill.totalCost, outstanding: settled ? 0 : bill.overtimeCost }
    ).catch(() => {});

    logEvent("checkout", { forced: true, settled, overtimeCost: bill.overtimeCost, totalCost: bill.totalCost });
    res.json({
      success: true,
      message: settled
        ? `เช็คเอาต์ช่อง ${booking.spotNumber} แล้ว เก็บค่าจอดเกินเวลา ${bill.overtimeCost} บาท`
        : `เช็คเอาต์ช่อง ${booking.spotNumber} แล้ว แต่ตัดเงินไม่สำเร็จ บันทึกยอดค้าง ${bill.overtimeCost} บาท`,
      data: { settled, overtimeCost: bill.overtimeCost, totalCost: bill.totalCost },
    });
  } catch (error) {
    sendError(res, error, "เช็คเอาต์ไม่สำเร็จ", "Admin force checkout error");
  } finally {
    await session.endSession();
  }
};

/*
    @desc   Users, searchable, with their roles
    @route  GET /api/admin/users?q=&page=
    @access Admin
*/
export const listUsers = async (req, res) => {
  try {
    const q = String(req.query.q || "").trim();
    const filter = q ? { $or: [{ email: new RegExp(escapeRegex(q), "i") }, { name: new RegExp(escapeRegex(q), "i") }] } : {};
    const current = page(req.query.page);

    const [rows, total] = await Promise.all([
      User.find(filter)
        .select("name email rank subscriptionExpiry isAccountVerified isStaff isAdmin createdAt")
        .sort({ createdAt: -1 })
        .skip((current - 1) * PAGE_SIZE)
        .limit(PAGE_SIZE),
      User.countDocuments(filter),
    ]);

    res.json({
      success: true,
      users: rows.map((u) => ({
        id: u._id,
        name: u.name,
        email: u.email,
        rank: getEffectiveTier(u).name,
        isAccountVerified: u.isAccountVerified,
        isStaff: Boolean(u.isStaff),
        isAdmin: Boolean(u.isAdmin),
        createdAt: u.createdAt,
      })),
      pagination: { page: current, pages: Math.ceil(total / PAGE_SIZE) || 1, total },
    });
  } catch (error) {
    sendError(res, error, "โหลดรายชื่อผู้ใช้ไม่สำเร็จ", "Admin list users error");
  }
};

/*
    @desc   Grant or revoke the parking-staff role
    @route  PUT /api/admin/users/:id/staff   { isStaff: boolean }
    @access Admin

    Admin rights themselves are deliberately not grantable here: that stays
    a server-side action, so one stolen admin session cannot mint more admins.
*/
export const setStaff = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) throw new HttpError(404, "ไม่พบผู้ใช้");
    if (typeof req.body?.isStaff !== "boolean") throw new HttpError(400, "ต้องระบุ isStaff เป็น true หรือ false");

    const user = await User.findByIdAndUpdate(id, { isStaff: req.body.isStaff }, { new: true }).select("email isStaff");
    if (!user) throw new HttpError(404, "ไม่พบผู้ใช้");

    res.json({
      success: true,
      message: user.isStaff ? `${user.email} เป็นเจ้าหน้าที่สแกนแล้ว` : `ถอนสิทธิ์เจ้าหน้าที่ของ ${user.email} แล้ว`,
      user: { id: user._id, isStaff: user.isStaff },
    });
  } catch (error) {
    sendError(res, error, "เปลี่ยนสิทธิ์ไม่สำเร็จ", "Admin set staff error");
  }
};

export default { listBookings, adminCancelBooking, forceCheckout, listUsers, setStaff };
