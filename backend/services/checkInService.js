import mongoose from "mongoose";
import Booking from "../models/bookingModel.js";
import ParkingSpot from "../models/parkingSpotModel.js";
import { HttpError } from "../utils/httpError.js";

/**
 * Booking state changes at the check-in boundary.
 *
 * Every transition here is a conditional update on `status: "pending"`. The
 * old code read the booking, changed it in memory and saved it back, so a
 * check-in and the auto-cancel sweep running in the same instant could both
 * "win": the booking ended up cancelled while the spot was marked occupied,
 * or confirmed while the spot had been handed to someone else.
 */

/** GPS readings worse than this cannot place a phone in a particular lot. */
export const MAX_GPS_ACCURACY_METERS = 100;

const EARTH_RADIUS_METERS = 6371000;
const toRadians = (deg) => (deg * Math.PI) / 180;

/** Great-circle distance between two { latitude, longitude } points, in metres. */
export const distanceMeters = (a, b) => {
  const dLat = toRadians(b.latitude - a.latitude);
  const dLng = toRadians(b.longitude - a.longitude);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(a.latitude)) * Math.cos(toRadians(b.latitude)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_METERS * Math.asin(Math.sqrt(h));
};

/** Has this lot been given real coordinates (so GPS check-in can work)? */
export const zoneHasLocation = (zone) =>
  Number.isFinite(zone?.latitude) && Number.isFinite(zone?.longitude);

/**
 * Cancel a pending booking whose check-in window has closed.
 *
 * @returns the cancelled booking, or null if it was no longer pending (someone
 *          else — a check-in or another sweep — got there first).
 */
export const expirePendingBooking = async (bookingId, now = new Date()) => {
  const booking = await Booking.findOneAndUpdate(
    { _id: bookingId, status: "pending" },
    {
      $set: {
        status: "cancelled",
        cancelReason: "auto_cancelled_timeout",
        endTime: now,
        refundable: false,
        qrTokenHash: null,
      },
    },
    { new: true }
  );

  if (booking) {
    // Only release a spot this booking was actually holding.
    await ParkingSpot.updateOne({ _id: booking.spot, status: "reserved" }, { status: "available" });
  }
  return booking;
};

/**
 * Mark a pending booking as arrived and its spot as occupied, atomically.
 *
 * @param {object} args
 * @param {string} args.bookingId
 * @param {"staff_scan"|"gps"|"spot_qr"} args.method
 * @param {string} [args.staffId]   who scanned, for staff_scan
 * @param {object} [args.location]  { latitude, longitude, accuracy, distanceMeters }, for gps
 *                                  (and spot_qr when the phone sent a fix)
 * @throws {HttpError} 409 when the booking stopped being pending meanwhile
 */
export const confirmCheckIn = async ({ bookingId, method, staffId = null, location = null }) => {
  const session = await mongoose.startSession();
  let booking;

  try {
    await session.withTransaction(async () => {
      const now = new Date();
      booking = await Booking.findOneAndUpdate(
        { _id: bookingId, status: "pending", checkInDeadline: { $gt: now } },
        {
          $set: {
            status: "confirmed",
            isCheckedIn: true,
            actualStartTime: now,
            qrTokenHash: null, // one check-in per code
            checkInMethod: method,
            checkedInBy: staffId,
            checkInLocation: location,
          },
        },
        { new: true, session }
      );

      if (!booking) {
        throw new HttpError(409, "การจองนี้ไม่อยู่ในสถานะรอเช็คอินแล้ว", "not_pending");
      }

      // The spot is now physically in use, not merely held.
      await ParkingSpot.updateOne({ _id: booking.spot }, { status: "occupied" }, { session });
    });
  } finally {
    await session.endSession();
  }

  return booking;
};

export default {
  MAX_GPS_ACCURACY_METERS,
  distanceMeters,
  zoneHasLocation,
  expirePendingBooking,
  confirmCheckIn,
};
