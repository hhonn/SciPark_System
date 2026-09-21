import mongoose from "mongoose";
import Booking from "../models/bookingModel.js";
import ParkingSpot from "../models/parkingSpotModel.js";
import ParkingZone from "../models/parkingZoneModel.js";
import Vehicle from "../models/vehicleModel.js";
import User from "../models/userModel.js";
import { generateBookingQRCode, verifyScan } from "../services/qrCodeService.js";
import { authorizeCharge, PaymentError } from "../services/paymentService.js";
import {
  BOOKING_FEE,
  FREE_HOURS,
  OVERTIME_RATE,
  CHECKIN_GRACE_MINUTES,
  calculateSessionCost,
} from "../config/pricing.js";
import {
  notifyBookingCreated,
  notifyCheckInSuccess,
  notifyCheckOutSuccess,
  notifyBookingCancelled,
} from "../services/notificationService.js";

const ACTIVE_STATUSES = ["pending", "confirmed"];

/** Consume a one-shot discount voucher, if the user redeemed one. */
const takeVoucher = (user) => {
  const voucher = user?.activeDiscount;
  if (!voucher?.percent) return null;
  if (voucher.expiresAt && new Date(voucher.expiresAt).getTime() <= Date.now()) return null;
  return { percent: voucher.percent };
};

/*
    @desc   Create a new booking (charges the booking fee up front)
    @route  POST /api/bookings
    @access Private
*/
export const createBooking = async (req, res) => {
  const session = await mongoose.startSession();

  // `withTransaction` retries automatically on a TransientTransactionError,
  // which a replica-set failover or a concurrent catalog change can raise.
  // The previous hand-rolled commit surfaced those to the user as a flat
  // "booking failed" even though a retry would have succeeded.
  let spot;
  let vehicle;
  let charge;
  let newBooking;
  let qrCode;
  let checkInDeadline;

  try {
    const { spotId, zoneId, vehicleId, floor, paymentMethodId } = req.body;
    const userId = req.userId;

    await session.withTransaction(async () => {
      const user = await User.findById(userId).session(session);
      if (!user) throw new Error("ไม่พบข้อมูลผู้ใช้");

      const existingBooking = await Booking.findOne({
        user: userId,
        status: { $in: ACTIVE_STATUSES },
      }).session(session);

      if (existingBooking) {
        throw new Error("คุณมีการจองที่ใช้งานอยู่แล้ว กรุณาปิดการจองก่อนทำรายการใหม่");
      }

      // ---- Assign a spot -----------------------------------------------
      // The caller may pass an explicit spot, a zone, or a zone id in `spotId`
      // (older clients did that). Claiming uses a conditional update so two
      // simultaneous bookings can never be handed the same spot.
      spot = null;

      const claimSpot = async (filter) =>
        ParkingSpot.findOneAndUpdate(
          { ...filter, status: "available" },
          { status: "reserved" },
          { new: true, session }
        ).populate("zone");

      if (spotId && mongoose.isValidObjectId(spotId)) {
        spot = await claimSpot({ _id: spotId });

        if (!spot) {
          // Maybe it was a zone id after all.
          const zone = await ParkingZone.findById(spotId).session(session);
          if (zone) {
            const filter = { zone: zone._id };
            if (floor) filter.floor = floor;
            spot = await claimSpot(filter);
          }
        }
      }

      if (!spot && zoneId && mongoose.isValidObjectId(zoneId)) {
        const filter = { zone: zoneId };
        if (floor) filter.floor = floor;
        spot = await claimSpot(filter);
      }

      if (!spot) {
        const error = new Error("ที่จอดในโซนนี้เต็มแล้ว กรุณาเลือกโซนอื่น");
        error.statusCode = 409;
        throw error;
      }

      vehicle = null;
      if (vehicleId) {
        vehicle = await Vehicle.findOne({ _id: vehicleId, userId }).session(session);
        if (!vehicle) throw new Error("ไม่พบข้อมูลรถยนต์");
      }

      // ---- Charge the non-refundable booking fee -----------------------
      // Inside the transaction: a declined card aborts everything and the spot
      // returns to "available" instead of being silently held.
      charge = await authorizeCharge({
        userId,
        amount: BOOKING_FEE,
        paymentMethodId,
        session,
        description: `SciPark booking fee - ${spot.spotNumber}`,
      });

      checkInDeadline = new Date(Date.now() + CHECKIN_GRACE_MINUTES * 60 * 1000);

      newBooking = new Booking({
        user: userId,
        vehicle: vehicle?._id || null,
        spot: spot._id,
        zone: spot.zone?._id || null,
        zoneName: spot.zone?.zoneName || spot.zoneName || "",
        spotNumber: spot.spotNumber,
        floor: spot.floor,
        startTime: new Date(),
        status: "pending",
        bookingFee: BOOKING_FEE,
        paymentStatus: "paid",
        paymentMethod: charge.method?._id || null,
        cost: 0,
        isCheckedIn: false,
        checkInDeadline,
        refundable: false,
      });

      // Issue the QR credential before committing so its hash is persisted
      // with the booking. The old code generated a QR that was never stored,
      // so it vanished on the first page refresh and could never be verified.
      qrCode = await generateBookingQRCode(newBooking);
      newBooking.qrTokenHash = qrCode.tokenHash;
      newBooking.qrIssuedAt = new Date();

      await newBooking.save({ session });
    });

    const responseData = {
      bookingId: newBooking._id,
      spot: {
        id: spot._id,
        spotNumber: spot.spotNumber,
        name: spot.name,
        floor: spot.floor,
        building: spot.building,
        facilities: spot.facilities || [],
      },
      zone: {
        id: spot.zone?._id,
        name: spot.zone?.zoneName || "",
        description: spot.zone?.name || "",
        building: spot.zone?.building || "",
      },
      vehicle: vehicle
        ? { licensePlate: vehicle.licensePlate, brand: vehicle.brand, model: vehicle.model }
        : null,
      startTime: newBooking.startTime,
      status: newBooking.status,
      payment: {
        status: "paid",
        amount: BOOKING_FEE,
        transactionId: charge.transactionId,
        method: charge.method?.getDisplayName?.() || null,
      },
      pricing: {
        bookingFee: BOOKING_FEE,
        freeHours: FREE_HOURS,
        overtimeRate: OVERTIME_RATE,
      },
      checkInDeadline,
      graceMinutes: CHECKIN_GRACE_MINUTES,
      qrCode: {
        // The plain token is returned once, here: it lives in the QR image.
        qrCodeURL: qrCode.qrCodeDataURL,
        token: qrCode.token,
        expiresAt: qrCode.expiresAt,
      },
      warning: `ต้องสแกน QR Code เพื่อยืนยันการมาถึงภายใน ${CHECKIN_GRACE_MINUTES} นาที มิฉะนั้นระบบจะยกเลิกการจองอัตโนมัติ (ค่าจอง ${BOOKING_FEE} บาทไม่คืน)`,
    };

    notifyBookingCreated(userId, {
      bookingId: newBooking._id,
      spotName: spot.spotNumber || spot.name,
    }).catch((e) => console.error("Notification error:", e.message));

    res.status(201).json({ success: true, message: "สร้างการจองสำเร็จ", data: responseData });
  } catch (error) {
    // withTransaction has already aborted and rolled back by this point.
    if (error instanceof PaymentError) {
      console.warn("Booking payment declined:", error.code);
      return res.status(402).json({ success: false, code: error.code, message: error.message });
    }

    console.error("Create booking error:", error);
    res.status(error.statusCode || 400).json({
      success: false,
      message: error.message || "ไม่สามารถสร้างการจองได้",
    });
  } finally {
    await session.endSession();
  }
};

/*
    @desc   Get active booking for current user
    @route  GET /api/bookings/active
    @access Private
*/
export const getActiveBooking = async (req, res) => {
  try {
    const userId = req.userId;

    const booking = await Booking.findOne({
      user: userId,
      status: { $in: ACTIVE_STATUSES },
    })
      .populate({
        path: "spot",
        select: "spotNumber name floor building pricePerHour facilities",
        populate: { path: "zone", select: "zoneName name building" },
      })
      .populate("vehicle", "licensePlate brand model");

    if (!booking) {
      return res.status(404).json({ success: false, message: "ไม่พบการจองที่ใช้งานอยู่" });
    }

    const user = await User.findById(userId);
    const now = new Date();

    let timeRemainingToCheckIn = null;
    let live;

    if (booking.status === "pending") {
      const remainingMs = booking.checkInDeadline - now;
      timeRemainingToCheckIn = {
        minutes: Math.max(0, Math.floor(remainingMs / 60000)),
        seconds: Math.max(0, Math.floor((remainingMs % 60000) / 1000)),
        totalMs: Math.max(0, remainingMs),
        expired: remainingMs <= 0,
      };
      // Parking time only starts at check-in, so a pending booking bills zero.
      live = calculateSessionCost({
        startedAt: now,
        endedAt: now,
        user,
        bookingFee: booking.bookingFee,
      });
    } else {
      live = calculateSessionCost({
        startedAt: booking.actualStartTime || booking.startTime,
        endedAt: now,
        user,
        bookingFee: booking.bookingFee,
        voucher: takeVoucher(user),
      });
    }

    res.status(200).json({
      success: true,
      data: {
        bookingId: booking._id,
        spot: {
          spotNumber: booking.spot?.spotNumber || booking.spotNumber || "N/A",
          name: booking.spot?.name || "N/A",
          floor: booking.floor || booking.spot?.floor || "N/A",
          building: booking.spot?.building || "N/A",
          facilities: booking.spot?.facilities || [],
        },
        zone: {
          name: booking.spot?.zone?.zoneName || booking.zoneName || "N/A",
          description: booking.spot?.zone?.name || "",
          building: booking.spot?.zone?.building || "N/A",
        },
        vehicle: booking.vehicle
          ? {
              licensePlate: booking.vehicle.licensePlate,
              brand: booking.vehicle.brand,
              model: booking.vehicle.model,
            }
          : null,
        startTime: booking.startTime,
        actualStartTime: booking.actualStartTime,
        checkInDeadline: booking.checkInDeadline,
        graceMinutes: CHECKIN_GRACE_MINUTES,
        isCheckedIn: booking.isCheckedIn,
        timeRemainingToCheckIn,
        duration: { hours: live.hours, minutes: live.minutes },
        pricing: {
          bookingFee: booking.bookingFee,
          freeHours: FREE_HOURS,
          overtimeRate: OVERTIME_RATE,
          chargeableHours: live.chargeableHours,
          discount: live.discountPercent,
          tierName: live.tierName,
          estimatedOvertimeCost: live.overtimeCost,
          estimatedTotalCost: live.totalCost,
        },
        paymentStatus: booking.paymentStatus,
        status: booking.status,
      },
    });
  } catch (error) {
    console.error("Get active booking error:", error);
    res.status(500).json({ success: false, message: "เกิดข้อผิดพลาด", error: error.message });
  }
};

/*
    @desc   Re-issue the QR code for a pending booking
    @route  GET /api/bookings/:bookingId/qr
    @access Private
*/
export const getBookingQR = async (req, res) => {
  try {
    // Without this an id like "undefined" reached Mongoose, threw a CastError
    // and was reported as a 500 instead of "no such booking".
    if (!mongoose.isValidObjectId(req.params.bookingId)) {
      return res.status(404).json({ success: false, message: "ไม่พบการจอง" });
    }

    const booking = await Booking.findOne({ _id: req.params.bookingId, user: req.userId });

    if (!booking) {
      return res.status(404).json({ success: false, message: "ไม่พบการจอง" });
    }
    if (booking.status !== "pending") {
      return res.status(400).json({
        success: false,
        message: booking.status === "confirmed" ? "Check-in ไปแล้ว" : "การจองนี้สิ้นสุดแล้ว",
      });
    }

    // Rotate the credential on re-issue, so an old screenshot stops working.
    const qrCode = await generateBookingQRCode(booking);
    booking.qrTokenHash = qrCode.tokenHash;
    booking.qrIssuedAt = new Date();
    await booking.save();

    res.status(200).json({
      success: true,
      data: {
        qrCodeURL: qrCode.qrCodeDataURL,
        token: qrCode.token,
        expiresAt: qrCode.expiresAt,
      },
    });
  } catch (error) {
    console.error("Get booking QR error:", error);
    res.status(500).json({ success: false, message: "ไม่สามารถสร้าง QR code ได้" });
  }
};

/*
    @desc   Check in (verifies the QR credential)
    @route  PUT /api/bookings/:bookingId/checkin
    @access Private
*/
export const checkIn = async (req, res) => {
  try {
    const { bookingId } = req.params;
    const { qrPayload, token } = req.body || {};

    if (!mongoose.isValidObjectId(bookingId)) {
      return res.status(404).json({ success: false, message: "ไม่พบการจอง" });
    }

    const booking = await Booking.findById(bookingId)
      .select("+qrTokenHash")
      .populate("spot", "spotNumber name floor building")
      .populate("zone", "zoneName");

    if (!booking) {
      return res.status(404).json({ success: false, message: "ไม่พบการจอง" });
    }
    if (booking.user.toString() !== req.userId) {
      return res.status(403).json({ success: false, message: "คุณไม่มีสิทธิ์เข้าถึงการจองนี้" });
    }
    if (booking.status !== "pending") {
      return res.status(400).json({
        success: false,
        message:
          booking.status === "confirmed"
            ? "คุณได้ทำการ check-in แล้ว"
            : `การจองนี้อยู่ในสถานะ ${booking.status}`,
      });
    }

    const now = new Date();

    // Deadline passed: cancel here instead of waiting for the sweeper, so the
    // user gets a truthful answer immediately.
    if (now > booking.checkInDeadline) {
      booking.status = "cancelled";
      booking.cancelReason = "auto_cancelled_timeout";
      booking.endTime = now;
      booking.qrTokenHash = null;
      await booking.save();
      await ParkingSpot.findByIdAndUpdate(booking.spot._id, { status: "available" });

      notifyBookingCancelled(
        booking.user,
        { bookingId: booking._id, spotName: booking.spot?.spotNumber },
        "หมดเวลา Check-in"
      ).catch(() => {});

      return res.status(400).json({
        success: false,
        code: "checkin_expired",
        message: `หมดเวลา check-in แล้ว การจองถูกยกเลิกอัตโนมัติ (ค่าจอง ${booking.bookingFee} บาทไม่คืน)`,
        bookingFee: booking.bookingFee,
        refundable: false,
      });
    }

    // Verify the scanned credential against the hash stored at booking time.
    const scan = verifyScan(booking, booking.qrTokenHash, qrPayload ?? token);
    if (!scan.valid) {
      return res.status(400).json({ success: false, code: "invalid_qr", message: scan.reason });
    }

    booking.status = "confirmed";
    booking.isCheckedIn = true;
    booking.actualStartTime = now;
    booking.qrTokenHash = null; // one check-in per code
    await booking.save();

    // The spot is now physically in use, not merely held.
    await ParkingSpot.findByIdAndUpdate(booking.spot._id, { status: "occupied" });

    notifyCheckInSuccess(booking.user, {
      bookingId: booking._id,
      spotName: booking.spot?.spotNumber || booking.spot?.name || "N/A",
    }).catch(() => {});

    res.status(200).json({
      success: true,
      message: "Check-in สำเร็จ ยินดีต้อนรับสู่ที่จอดรถ",
      data: {
        bookingId: booking._id,
        checkedInAt: booking.actualStartTime,
        spot: booking.spot,
        zone: booking.zone,
        pricing: {
          bookingFee: booking.bookingFee,
          freeHours: FREE_HOURS,
          overtimeRate: OVERTIME_RATE,
          note: `${FREE_HOURS} ชม.แรกฟรี หลังจากนั้น ${OVERTIME_RATE} บาท/ชม.`,
        },
      },
    });
  } catch (error) {
    console.error("Check-in error:", error);
    res.status(500).json({ success: false, message: "เกิดข้อผิดพลาดในการ check-in" });
  }
};

/*
    @desc   Check out, settle overtime, release the spot
    @route  PUT /api/bookings/:bookingId/checkout
    @access Private
*/
export const checkOut = async (req, res) => {
  const session = await mongoose.startSession();

  let booking;
  let user;
  let bill;
  let overtimeCharge = null;

  try {
    const bookingId = req.params.bookingId || req.params.id;
    const { paymentMethodId } = req.body || {};
    const userId = req.userId;

    if (!mongoose.isValidObjectId(bookingId)) {
      const err = new Error("ไม่พบการจอง");
      err.statusCode = 404;
      throw err;
    }

    await session.withTransaction(async () => {
      booking = await Booking.findById(bookingId).populate("spot").session(session);
      if (!booking) throw new Error("ไม่พบการจอง");

      if (booking.user.toString() !== userId) {
        const err = new Error("คุณไม่มีสิทธิ์เข้าถึงการจองนี้");
        err.statusCode = 403;
        throw err;
      }
      if (booking.status !== "confirmed") {
        throw new Error(
          booking.status === "pending"
            ? "กรุณา check-in ก่อน check-out"
            : `การจองนี้อยู่ในสถานะ ${booking.status}`
        );
      }

      user = await User.findById(userId).session(session);
      const now = new Date();
      const voucher = takeVoucher(user);

      bill = calculateSessionCost({
        startedAt: booking.actualStartTime || booking.startTime,
        endedAt: now,
        user,
        bookingFee: booking.bookingFee,
        voucher,
      });

      // Settle only the overtime here: the booking fee was captured at booking
      // time. A decline aborts the transaction and the car stays checked in.
      if (bill.overtimeCost > 0) {
        overtimeCharge = await authorizeCharge({
          userId,
          amount: bill.overtimeCost,
          paymentMethodId: paymentMethodId || booking.paymentMethod,
          session,
          description: `SciPark overtime - ${booking.spotNumber || booking.spot?.spotNumber}`,
        });
      }

      booking.actualEndTime = now;
      booking.endTime = now;
      booking.cost = bill.overtimeCost;
      booking.totalCost = bill.totalCost;
      booking.discountPercent = bill.discountPercent;
      booking.pointsEarned = bill.pointsEarned;
      booking.status = "completed";
      booking.paymentStatus = "settled";
      await booking.save({ session });

      await ParkingSpot.findByIdAndUpdate(booking.spot._id, { status: "available" }, { session });

      // Points are awarded here. Previously check-out skipped them while the
      // legacy complete endpoint granted them, so the reward depended on which
      // button the user happened to press.
      user.points = (user.points || 0) + bill.pointsEarned;
      if (voucher) user.activeDiscount = null; // single use
      await user.save({ session });

    });

    notifyCheckOutSuccess(
      user._id,
      { bookingId: booking._id },
      {
        duration: `${bill.hours} ชม. ${bill.minutes} นาที`,
        bookingFee: booking.bookingFee,
        overtimeFee: bill.overtimeCost,
        total: bill.totalCost,
      }
    ).catch(() => {});

    res.status(200).json({
      success: true,
      message: "Check-out สำเร็จ ขอบคุณที่ใช้บริการ",
      data: {
        bookingId: booking._id,
        duration: { hours: bill.hours, minutes: bill.minutes },
        pricing: {
          bookingFee: booking.bookingFee,
          durationHours: bill.durationHours.toFixed(2),
          freeHours: bill.freeHours,
          overtimeHours: bill.overtimeHours,
          chargeableHours: bill.chargeableHours,
          grossOvertime: bill.grossOvertime,
          membershipDiscount: `${bill.discountPercent}%`,
          discountAmount: bill.discountAmount,
          voucherDiscount: bill.voucherDiscount,
          finalCost: bill.overtimeCost,
          totalCost: bill.totalCost,
        },
        payment: {
          transactionId: overtimeCharge?.transactionId || null,
          method: overtimeCharge?.method?.getDisplayName?.() || null,
        },
        pointsEarned: bill.pointsEarned,
        totalPoints: user.points,
        checkedIn: booking.actualStartTime,
        checkedOut: booking.actualEndTime,
      },
    });
  } catch (error) {
    if (error instanceof PaymentError) {
      return res.status(402).json({
        success: false,
        code: error.code,
        // Test Case 11: the session stays open until the money is settled.
        message: `${error.message} — กรุณาชำระเงินให้เรียบร้อยเพื่อออกจากช่องจอด`,
      });
    }

    console.error("Check-out error:", error);
    res.status(error.statusCode || 400).json({
      success: false,
      message: error.message || "เกิดข้อผิดพลาดในการ check-out",
    });
  } finally {
    await session.endSession();
  }
};

/*
    @desc   Legacy alias so older clients keep working
    @route  PUT /api/bookings/:id/complete
    @access Private
*/
export const completeBooking = (req, res) => checkOut(req, res);

/*
    @desc   Cancel a booking
    @route  DELETE /api/bookings/:id
    @access Private
*/
export const cancelBooking = async (req, res) => {
  const session = await mongoose.startSession();
  let booking;

  try {
    const { id } = req.params;
    const userId = req.userId;

    if (!mongoose.isValidObjectId(id)) {
      const err = new Error("ไม่พบการจองที่สามารถยกเลิกได้");
      err.statusCode = 404;
      throw err;
    }

    await session.withTransaction(async () => {
      booking = await Booking.findOne({
        _id: id,
        user: userId,
        status: { $in: ACTIVE_STATUSES },
      })
        .populate("spot")
        .session(session);

      if (!booking) throw new Error("ไม่พบการจองที่สามารถยกเลิกได้");

      // A checked-in car is physically parked; it has to check out, not cancel.
      if (booking.status === "confirmed") {
        const err = new Error("คุณ check-in แล้ว กรุณาใช้ check-out เพื่อจบการจอด");
        err.statusCode = 409;
        throw err;
      }

      booking.status = "cancelled";
      booking.cancelReason = "user_cancelled";
      booking.endTime = new Date();
      booking.refundable = false;
      booking.qrTokenHash = null;
      await booking.save({ session });

      if (booking.spot) {
        await ParkingSpot.findByIdAndUpdate(booking.spot._id, { status: "available" }, { session });
      }

    });

    notifyBookingCancelled(
      userId,
      { bookingId: booking._id, spotName: booking.spot?.spotNumber || "N/A" },
      "คุณยกเลิกการจองเอง"
    ).catch(() => {});

    res.status(200).json({
      success: true,
      message: `ยกเลิกการจองสำเร็จ (ค่าธรรมเนียมการจอง ${booking.bookingFee} บาทไม่คืน)`,
      data: {
        bookingId: booking._id,
        bookingFee: booking.bookingFee,
        refundable: false,
        note: `ค่าธรรมเนียมการจอง ${booking.bookingFee} บาทไม่สามารถคืนได้`,
      },
    });
  } catch (error) {
    console.error("Cancel booking error:", error);
    res.status(error.statusCode || 400).json({
      success: false,
      message: error.message || "ไม่สามารถยกเลิกการจองได้",
    });
  } finally {
    await session.endSession();
  }
};

/*
    @desc   Get booking history
    @route  GET /api/bookings/history
    @access Private
*/
export const getBookingHistory = async (req, res) => {
  try {
    const userId = req.userId;
    // Clamp pagination: an unbounded `limit` let one request pull the entire
    // collection into memory.
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

    const formatted = bookings.map((booking) => {
      // Duration must measure the parking session, not the time since the
      // booking was placed: those differ by the whole check-in window.
      const start = booking.actualStartTime || booking.startTime;
      const end = booking.actualEndTime || booking.endTime;
      const durationMs = booking.actualStartTime && end ? end - start : 0;
      const durationHours = durationMs / (1000 * 60 * 60);

      return {
        id: booking._id,
        spot: {
          spotNumber: booking.spot?.spotNumber || booking.spotNumber || "N/A",
          name: booking.spot?.name || "N/A",
          floor: booking.floor || booking.spot?.floor || "N/A",
          building: booking.spot?.building || "N/A",
        },
        zone: {
          name: booking.spot?.zone?.zoneName || booking.zoneName || "N/A",
          building: booking.spot?.zone?.building || "N/A",
        },
        vehicle: booking.vehicle
          ? {
              licensePlate: booking.vehicle.licensePlate,
              brand: booking.vehicle.brand,
              model: booking.vehicle.model,
            }
          : null,
        startTime: booking.startTime,
        actualStartTime: booking.actualStartTime,
        endTime: booking.actualEndTime || booking.endTime,
        duration: {
          hours: Math.floor(durationHours),
          minutes: Math.floor((durationHours % 1) * 60),
        },
        bookingFee: booking.bookingFee,
        cost: booking.cost || 0,
        totalCost: booking.totalCost || booking.bookingFee || 0,
        pointsEarned: booking.pointsEarned || 0,
        cancelReason: booking.cancelReason,
        status: booking.status,
      };
    });

    res.status(200).json({
      success: true,
      bookings: formatted,
      pagination: {
        totalPages: Math.ceil(count / limit) || 1,
        currentPage: page,
        totalBookings: count,
      },
    });
  } catch (error) {
    console.error("Get booking history error:", error);
    res.status(500).json({ success: false, message: "เกิดข้อผิดพลาด", error: error.message });
  }
};
