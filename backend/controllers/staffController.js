import mongoose from "mongoose";
import Booking from "../models/bookingModel.js";
import ParkingZone from "../models/parkingZoneModel.js";
import { hashToken, parseScannedPayload, verifyScan } from "../services/qrCodeService.js";
import { confirmCheckIn, zoneHasLocation } from "../services/checkInService.js";
import { notifyCheckInSuccess } from "../services/notificationService.js";
import { expireAndNotify, expiredResponse } from "./bookingController.js";
import { sendError } from "../utils/httpError.js";
import { photoUrl } from "../services/mediaService.js";
import { logEvent } from "../utils/logger.js";

const invalidQr = (res, message = "QR Code ไม่ถูกต้องหรือถูกออกใหม่แล้ว") =>
  res.status(400).json({ success: false, code: "invalid_qr", message });

// @desc   Check a driver in by scanning their QR
// @route  POST /api/staff/scan
// @access Staff / Admin
//
// The scan is the proof of arrival: the staff member is physically at the lot
// and sees the car. The QR carries a random token; only its hash is stored,
// so the booking is looked up by that hash.
export const scanCheckIn = async (req, res) => {
  try {
    const { qrPayload } = req.body || {};
    const { token, bookingId } = parseScannedPayload(qrPayload);
    if (!token) return invalidQr(res, "อ่าน QR Code ไม่ได้ กรุณาสแกนใหม่");

    const booking = await Booking.findOne({ qrTokenHash: hashToken(token) })
      .select("+qrTokenHash")
      .populate("user", "name")
      .populate("vehicle", "licensePlate brand model color photoKey")
      .populate({ path: "spot", select: "spotNumber name", populate: { path: "zone", select: "zoneName name" } });

    // Unknown, already used, or replaced by a newer QR.
    if (!booking) return invalidQr(res);

    const scan = verifyScan(booking, booking.qrTokenHash, qrPayload);
    if (!scan.valid) return invalidQr(res, scan.reason);
    if (bookingId && !mongoose.isValidObjectId(bookingId)) return invalidQr(res);

    // A staff member checking their own car in from anywhere would undo the
    // whole point of a scan.
    if (String(booking.user?._id) === req.userId) {
      return res.status(403).json({
        success: false,
        code: "own_booking",
        message: "ไม่สามารถสแกนการจองของตัวเองได้ กรุณาให้เจ้าหน้าที่คนอื่นสแกน",
      });
    }

    if (booking.status !== "pending") {
      return res.status(409).json({
        success: false,
        code: "not_pending",
        message: booking.status === "confirmed" ? "การจองนี้เช็คอินไปแล้ว" : "การจองนี้สิ้นสุดแล้ว",
      });
    }

    if (new Date() > booking.checkInDeadline) {
      await expireAndNotify(booking);
      return expiredResponse(res, booking);
    }

    const confirmed = await confirmCheckIn({
      bookingId: booking._id,
      method: "staff_scan",
      staffId: req.userId,
    });

    notifyCheckInSuccess(booking.user._id, {
      bookingId: booking._id,
      spotName: booking.spot?.spotNumber || "N/A",
    }).catch(() => {});

    logEvent("checkin", { method: "staff_scan" });
    // Everything the staff member needs to match the QR to the car in front of them.
    res.status(200).json({
      success: true,
      message: "เช็คอินสำเร็จ",
      data: {
        bookingId: confirmed._id,
        checkedInAt: confirmed.actualStartTime,
        driverName: booking.user?.name || "",
        vehicle: booking.vehicle
          ? {
              licensePlate: booking.vehicle.licensePlate,
              brand: booking.vehicle.brand,
              model: booking.vehicle.model,
              color: booking.vehicle.color,
              // The photo the driver uploaded, to compare with the car itself.
              photoUrl: await photoUrl(booking.vehicle.photoKey),
            }
          : null,
        spotNumber: booking.spot?.spotNumber || booking.spotNumber,
        zoneName: booking.spot?.zone?.zoneName || booking.zoneName,
      },
    });
  } catch (error) {
    sendError(res, error, "เช็คอินไม่สำเร็จ", "Staff scan error");
  }
};

const shapeZoneLocation = (zone) => ({
  id: zone._id,
  zoneName: zone.zoneName,
  name: zone.name,
  latitude: zone.latitude,
  longitude: zone.longitude,
  checkInRadiusMeters: zone.checkInRadiusMeters,
  gpsCheckIn: zoneHasLocation(zone),
});

// @desc   Lots and their GPS check-in settings
// @route  GET /api/staff/zones
// @access Staff / Admin
export const listZoneLocations = async (req, res) => {
  try {
    const zones = await ParkingZone.find({}).sort({ zoneName: 1 });
    res.json({ success: true, zones: zones.map(shapeZoneLocation) });
  } catch (error) {
    sendError(res, error, "เกิดข้อผิดพลาด", "List zone locations error");
  }
};

// @desc   Set (or clear) a lot's GPS position
// @route  PUT /api/staff/zones/:id/location
// @access Admin
//
// Body { latitude, longitude, radiusMeters }, or { clear: true } to switch
// GPS self check-in off for the lot again.
export const setZoneLocation = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) {
      return res.status(404).json({ success: false, message: "ไม่พบโซนจอดรถ" });
    }

    const { clear, latitude, longitude, radiusMeters } = req.body || {};
    let update;

    if (clear === true) {
      update = { latitude: null, longitude: null };
    } else {
      const lat = Number(latitude);
      const lng = Number(longitude);
      const radius = radiusMeters === undefined ? undefined : Number(radiusMeters);

      if (!Number.isFinite(lat) || Math.abs(lat) > 90 || !Number.isFinite(lng) || Math.abs(lng) > 180) {
        return res.status(400).json({ success: false, message: "พิกัดไม่ถูกต้อง" });
      }
      if (radius !== undefined && (!Number.isFinite(radius) || radius < 20 || radius > 2000)) {
        return res.status(400).json({ success: false, message: "รัศมีต้องอยู่ระหว่าง 20-2000 เมตร" });
      }

      update = { latitude: lat, longitude: lng };
      if (radius !== undefined) update.checkInRadiusMeters = Math.round(radius);
    }

    const zone = await ParkingZone.findByIdAndUpdate(id, update, { new: true, runValidators: true });
    if (!zone) return res.status(404).json({ success: false, message: "ไม่พบโซนจอดรถ" });

    res.json({
      success: true,
      message: zoneHasLocation(zone)
        ? `ตั้งพิกัดลาน ${zone.zoneName} แล้ว เปิดเช็คอินด้วย GPS ในรัศมี ${zone.checkInRadiusMeters} ม.`
        : `ปิดการเช็คอินด้วย GPS ของลาน ${zone.zoneName} แล้ว`,
      zone: shapeZoneLocation(zone),
    });
  } catch (error) {
    sendError(res, error, "เกิดข้อผิดพลาด", "Set zone location error");
  }
};

export default { scanCheckIn, listZoneLocations, setZoneLocation };
