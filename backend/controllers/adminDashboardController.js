import Booking from "../models/bookingModel.js";
import ParkingSpot from "../models/parkingSpotModel.js";
import ParkingZone from "../models/parkingZoneModel.js";
import { sendError } from "../utils/httpError.js";

// The operator's overview: how full each lot is now, what today looked like,
// money over the last week, when people book, and what needs a human.
//
// Everything is derived from bookings and spots; nothing extra is recorded.
// Days are Bangkok days (UTC+7, no daylight saving).

const TZ = "+07:00";
const TZ_MS = 7 * 3600 * 1000;
const DAY_MS = 24 * 3600 * 1000;
const DAYS = 7;
// A car checked in this long ago has almost certainly left without checking out.
export const LONG_PARK_HOURS = 12;

// Midnight (Bangkok) at the start of the day `now` falls in, as a UTC Date.
export const bangkokDayStart = (now = new Date()) =>
  new Date(Math.floor((now.getTime() + TZ_MS) / DAY_MS) * DAY_MS - TZ_MS);

// "YYYY-MM-DD" of a Bangkok day.
const bangkokDate = (date) => new Date(date.getTime() + TZ_MS).toISOString().slice(0, 10);

const SPOT_STATUSES = ["available", "reserved", "occupied", "closed"];

// @desc   Numbers for the admin dashboard
// @route  GET /api/admin/dashboard
// @access Admin
export const getDashboard = async (req, res) => {
  try {
    const now = new Date();
    const today = bangkokDayStart(now);
    const weekStart = new Date(today.getTime() - (DAYS - 1) * DAY_MS);
    const longParkedBefore = new Date(now.getTime() - LONG_PARK_HOURS * 3600 * 1000);

    const [zones, spotCounts, todayRows, feesByDay, overtimeByDay, hourly, longParked, unpaid] =
      await Promise.all([
        ParkingZone.find({}).select("zoneName name").sort({ zoneName: 1 }).lean(),
        ParkingSpot.aggregate([
          { $group: { _id: { zone: "$zone", status: "$status" }, count: { $sum: 1 } } },
        ]),
        // Bookings made today, by how they ended up.
        Booking.aggregate([
          { $match: { createdAt: { $gte: today } } },
          { $group: { _id: { status: "$status", cancelReason: "$cancelReason", checkedIn: { $gt: ["$actualStartTime", null] } }, count: { $sum: 1 } } },
        ]),
        // Booking fees are taken when the booking is made, and kept even if it
        // is cancelled. A fee paid with a points reward brought in nothing.
        Booking.aggregate([
          { $match: { createdAt: { $gte: weekStart }, feeWaiver: null } },
          {
            $group: {
              _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt", timezone: TZ } },
              amount: { $sum: "$bookingFee" },
            },
          },
        ]),
        // Overtime is charged at check-out; a declined charge is a debt, not income.
        Booking.aggregate([
          {
            $match: {
              status: "completed",
              actualEndTime: { $gte: weekStart },
              paymentStatus: { $in: ["paid", "settled"] },
            },
          },
          {
            $group: {
              _id: { $dateToString: { format: "%Y-%m-%d", date: "$actualEndTime", timezone: TZ } },
              amount: { $sum: "$cost" },
            },
          },
        ]),
        Booking.aggregate([
          { $match: { createdAt: { $gte: weekStart } } },
          { $group: { _id: { $hour: { date: "$createdAt", timezone: TZ } }, count: { $sum: 1 } } },
        ]),
        Booking.find({ status: "confirmed", actualStartTime: { $lte: longParkedBefore } })
          .populate("user", "name email")
          .populate("vehicle", "licensePlate")
          .sort({ actualStartTime: 1 })
          .limit(20)
          .lean(),
        Booking.aggregate([
          { $match: { paymentStatus: "failed" } },
          { $group: { _id: null, count: { $sum: 1 }, amount: { $sum: "$cost" } } },
        ]),
      ]);

    // ---- lots
    const blank = () => Object.fromEntries(SPOT_STATUSES.map((s) => [s, 0]));
    const byZone = new Map();
    for (const row of spotCounts) {
      const key = String(row._id.zone);
      const entry = byZone.get(key) || blank();
      if (row._id.status in entry) entry[row._id.status] += row.count;
      byZone.set(key, entry);
    }
    const totals = blank();
    const lots = zones.map((z) => {
      const c = byZone.get(String(z._id)) || blank();
      for (const s of SPOT_STATUSES) totals[s] += c[s];
      return { id: z._id, zoneName: z.zoneName, name: z.name, ...c, total: SPOT_STATUSES.reduce((n, s) => n + c[s], 0) };
    });
    totals.total = SPOT_STATUSES.reduce((n, s) => n + totals[s], 0);

    // ---- today
    const day = { bookings: 0, checkedIn: 0, waiting: 0, noShows: 0, cancelled: 0 };
    for (const { _id, count } of todayRows) {
      day.bookings += count;
      if (_id.checkedIn) day.checkedIn += count;
      else if (_id.status === "pending") day.waiting += count;
      else if (_id.cancelReason === "auto_cancelled_timeout") day.noShows += count;
      else if (_id.status === "cancelled") day.cancelled += count;
    }

    // ---- money, zero-filled so the chart always shows seven days
    const fees = new Map(feesByDay.map((r) => [r._id, r.amount]));
    const overtime = new Map(overtimeByDay.map((r) => [r._id, r.amount]));
    const revenue = Array.from({ length: DAYS }, (_, i) => {
      const date = bangkokDate(new Date(weekStart.getTime() + i * DAY_MS));
      const f = fees.get(date) || 0;
      const o = overtime.get(date) || 0;
      return { date, fees: f, overtime: o, total: f + o };
    });
    const todayRevenue = revenue[revenue.length - 1];

    const perHour = new Map(hourly.map((r) => [r._id, r.count]));

    res.json({
      success: true,
      generatedAt: now,
      lots,
      totals,
      today: { ...day, revenue: todayRevenue.total, fees: todayRevenue.fees, overtime: todayRevenue.overtime },
      revenue,
      weekRevenue: revenue.reduce((n, r) => n + r.total, 0),
      bookingsByHour: Array.from({ length: 24 }, (_, hour) => ({ hour, count: perHour.get(hour) || 0 })),
      attention: {
        longParkHours: LONG_PARK_HOURS,
        longParked: longParked.map((b) => ({
          bookingId: b._id,
          spotNumber: b.spotNumber,
          zoneName: b.zoneName,
          licensePlate: b.vehicle?.licensePlate || null,
          user: b.user ? { name: b.user.name, email: b.user.email } : null,
          since: b.actualStartTime,
        })),
        unpaid: { count: unpaid[0]?.count || 0, amount: unpaid[0]?.amount || 0 },
      },
    });
  } catch (error) {
    sendError(res, error, "โหลดแดชบอร์ดไม่สำเร็จ", "Admin dashboard error");
  }
};

export default { getDashboard };
