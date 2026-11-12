import mongoose from "mongoose";
import Booking from "../models/bookingModel.js";
import ParkingSpot from "../models/parkingSpotModel.js";
import ParkingZone from "../models/parkingZoneModel.js";
import { HttpError, sendError } from "../utils/httpError.js";
import { logEvent } from "../utils/logger.js";

/**
 * Lots and bays, for admins. Before this, a lot or a bay could only be made by
 * the seed script, and a bay under repair could not be taken out of booking.
 */

const MAX_SPOTS_PER_CALL = 200;

const shapeLot = (zone, counts = {}) => ({
  id: zone._id,
  zoneName: zone.zoneName,
  name: zone.name,
  building: zone.building,
  latitude: zone.latitude,
  longitude: zone.longitude,
  checkInRadiusMeters: zone.checkInRadiusMeters,
  gpsCheckIn: Number.isFinite(zone.latitude) && Number.isFinite(zone.longitude),
  spotStickers: Boolean(zone.spotStickers),
  spots: {
    total: counts.total || 0,
    available: counts.available || 0,
    reserved: counts.reserved || 0,
    occupied: counts.occupied || 0,
    closed: counts.closed || 0,
  },
});

/** Keep the zone's stored spot count in step with its bays. */
const syncTotal = async (zoneId) => {
  const total = await ParkingSpot.countDocuments({ zone: zoneId });
  await ParkingZone.updateOne({ _id: zoneId }, { totalSpots: total });
  return total;
};

/**
 * "A01-A20, B1, B2" -> ["A01", ..., "A20", "B1", "B2"].
 * A range keeps the zero padding of its first number ("A01-A20" gives A01..A20).
 *
 * @returns {string[]} unique bay numbers, upper-cased
 * @throws {HttpError} 400 for anything it cannot read, or too many bays
 */
export const parseSpotNumbers = (text) => {
  const out = [];
  for (const raw of String(text || "").split(/[\s,]+/).filter(Boolean)) {
    const token = raw.toUpperCase();
    const range = /^([A-Z]*)(\d+)-([A-Z]*)(\d+)$/.exec(token);
    if (range) {
      const [, prefix, fromText, prefix2, toText] = range;
      if (prefix2 && prefix2 !== prefix) throw new HttpError(400, `ช่วง ${raw} ต้องขึ้นต้นด้วยตัวอักษรเดียวกัน`);
      const from = Number(fromText);
      const to = Number(toText);
      if (to < from) throw new HttpError(400, `ช่วง ${raw} เลขท้ายต้องมากกว่าเลขต้น`);
      if (to - from + 1 > MAX_SPOTS_PER_CALL) throw new HttpError(400, `เพิ่มได้ครั้งละไม่เกิน ${MAX_SPOTS_PER_CALL} ช่อง`);
      for (let n = from; n <= to; n += 1) out.push(`${prefix}${String(n).padStart(fromText.length, "0")}`);
    } else if (/^[A-Z0-9-]{1,12}$/.test(token)) {
      out.push(token);
    } else {
      throw new HttpError(400, `อ่านเลขช่อง "${raw}" ไม่ได้ ใช้ตัวอักษรอังกฤษและตัวเลข เช่น A01-A20`);
    }
  }
  const unique = [...new Set(out)];
  if (unique.length === 0) throw new HttpError(400, "กรุณาใส่เลขช่อง เช่น A01-A20");
  if (unique.length > MAX_SPOTS_PER_CALL) throw new HttpError(400, `เพิ่มได้ครั้งละไม่เกิน ${MAX_SPOTS_PER_CALL} ช่อง`);
  return unique;
};

/*
    @desc   Every lot, with bay counts by status
    @route  GET /api/admin/lots
    @access Admin
*/
export const listLots = async (req, res) => {
  try {
    const [zones, counts] = await Promise.all([
      ParkingZone.find({}).sort({ zoneName: 1 }).lean(),
      ParkingSpot.aggregate([{ $group: { _id: { zone: "$zone", status: "$status" }, count: { $sum: 1 } } }]),
    ]);
    const byZone = new Map();
    for (const { _id, count } of counts) {
      const key = String(_id.zone);
      const entry = byZone.get(key) || { total: 0 };
      entry[_id.status] = (entry[_id.status] || 0) + count;
      entry.total += count;
      byZone.set(key, entry);
    }
    res.json({ success: true, lots: zones.map((z) => shapeLot(z, byZone.get(String(z._id)))) });
  } catch (error) {
    sendError(res, error, "โหลดรายการลานไม่สำเร็จ", "Admin list lots error");
  }
};

/*
    @desc   Add a lot (bays are added separately)
    @route  POST /api/admin/lots
    @access Admin
    @body   { zoneName, name, building? }
*/
export const createLot = async (req, res) => {
  try {
    const zoneName = String(req.body?.zoneName || "").trim().toUpperCase();
    const name = String(req.body?.name || "").trim();
    const building = String(req.body?.building || "").trim();

    if (!/^[A-Z0-9-]{1,12}$/.test(zoneName)) {
      throw new HttpError(400, "รหัสลานใช้ตัวอักษรอังกฤษ ตัวเลข หรือ - ไม่เกิน 12 ตัว เช่น SCI-A");
    }
    if (!name || name.length > 80) throw new HttpError(400, "กรุณาตั้งชื่อลาน (ไม่เกิน 80 ตัวอักษร)");
    if (await ParkingZone.exists({ zoneName })) throw new HttpError(409, `มีลานรหัส ${zoneName} อยู่แล้ว`);

    const zone = await ParkingZone.create({
      zoneName,
      name,
      building: building.slice(0, 80),
      totalSpots: 0,
      code: zoneName.charAt(0),
    });
    logEvent("lot_created", { lot: zoneName, admin: req.userId });
    res.status(201).json({ success: true, message: `เพิ่มลาน ${zoneName} แล้ว ต่อไปเพิ่มช่องจอด`, lot: shapeLot(zone) });
  } catch (error) {
    sendError(res, error, "เพิ่มลานไม่สำเร็จ", "Admin create lot error");
  }
};

/*
    @desc   Bays of one lot, with who holds the busy ones
    @route  GET /api/admin/lots/:id/spots
    @access Admin
*/
export const listLotSpots = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) throw new HttpError(404, "ไม่พบลาน");
    const zone = await ParkingZone.findById(id).lean();
    if (!zone) throw new HttpError(404, "ไม่พบลาน");

    const [spots, live] = await Promise.all([
      ParkingSpot.find({ zone: id })
        .collation({ locale: "en", numericOrdering: true })
        .sort({ spotNumber: 1 })
        .lean(),
      Booking.find({ status: { $in: ["pending", "confirmed"] }, spot: { $ne: null } })
        .select("spot status vehicle")
        .populate("vehicle", "licensePlate")
        .lean(),
    ]);
    const holder = new Map(live.map((b) => [String(b.spot), b]));

    res.json({
      success: true,
      lot: shapeLot(zone),
      spots: spots.map((s) => {
        const b = holder.get(String(s._id));
        return {
          id: s._id,
          spotNumber: s.spotNumber,
          floor: s.floor,
          status: s.status,
          booking: b ? { status: b.status, licensePlate: b.vehicle?.licensePlate || null } : null,
        };
      }),
    });
  } catch (error) {
    sendError(res, error, "โหลดช่องจอดไม่สำเร็จ", "Admin list lot spots error");
  }
};

/*
    @desc   Add bays to a lot
    @route  POST /api/admin/lots/:id/spots
    @access Admin
    @body   { spots: "A01-A20, B1", floor? }
*/
export const addLotSpots = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) throw new HttpError(404, "ไม่พบลาน");
    const zone = await ParkingZone.findById(id);
    if (!zone) throw new HttpError(404, "ไม่พบลาน");

    const numbers = parseSpotNumbers(req.body?.spots);
    const floor = String(req.body?.floor || "").trim().slice(0, 30) || "ชั้น 1";

    const existing = new Set(
      (await ParkingSpot.find({ zone: id, spotNumber: { $in: numbers } }).select("spotNumber").lean()).map((s) => s.spotNumber)
    );
    const fresh = numbers.filter((n) => !existing.has(n));
    if (fresh.length) {
      await ParkingSpot.insertMany(
        fresh.map((n) => ({
          name: `ช่อง ${n}`,
          spotNumber: n,
          zone: zone._id,
          zoneName: zone.zoneName,
          building: zone.building,
          floor,
        })),
        { ordered: false }
      );
    }
    const total = await syncTotal(zone._id);

    logEvent("spots_added", { lot: zone.zoneName, added: fresh.length, admin: req.userId });
    res.status(201).json({
      success: true,
      message:
        `เพิ่ม ${fresh.length} ช่องในลาน ${zone.zoneName}` +
        (existing.size ? ` (ข้าม ${existing.size} ช่องที่มีอยู่แล้ว)` : "") +
        ` รวม ${total} ช่อง`,
      added: fresh,
      skipped: [...existing],
      total,
    });
  } catch (error) {
    sendError(res, error, "เพิ่มช่องจอดไม่สำเร็จ", "Admin add spots error");
  }
};

/*
    @desc   Close a bay (repairs, an event) or open it again
    @route  PUT /api/admin/spots/:id/closed
    @access Admin
    @body   { closed: boolean }

    Both directions are conditional updates, so a bay cannot be closed in the
    instant someone books it, nor "opened" out from under a booking.
*/
export const setSpotClosed = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) throw new HttpError(404, "ไม่พบช่องจอด");
    if (typeof req.body?.closed !== "boolean") throw new HttpError(400, "ต้องระบุ closed เป็น true หรือ false");
    const { closed } = req.body;

    const spot = await ParkingSpot.findOneAndUpdate(
      { _id: id, status: closed ? "available" : "closed" },
      { status: closed ? "closed" : "available" },
      { new: true }
    );

    if (!spot) {
      const current = await ParkingSpot.findById(id).select("status spotNumber").lean();
      if (!current) throw new HttpError(404, "ไม่พบช่องจอด");
      if (current.status === (closed ? "closed" : "available")) {
        return res.json({ success: true, message: `ช่อง ${current.spotNumber} ${closed ? "ปิด" : "เปิด"}อยู่แล้ว`, spot: { id, status: current.status } });
      }
      throw new HttpError(
        409,
        `ช่อง ${current.spotNumber} ${current.status === "occupied" ? "มีรถจอดอยู่" : "ถูกจองอยู่"} ปิดได้หลังรถออกหรือการจองถูกยกเลิก`,
        "spot_in_use"
      );
    }

    logEvent("spot_closed", { spot: spot.spotNumber, closed, admin: req.userId });
    res.json({
      success: true,
      message: closed ? `ปิดช่อง ${spot.spotNumber} แล้ว จะไม่ถูกจองจนกว่าจะเปิดใหม่` : `เปิดช่อง ${spot.spotNumber} ให้จองได้แล้ว`,
      spot: { id: spot._id, status: spot.status },
    });
  } catch (error) {
    sendError(res, error, "เปลี่ยนสถานะช่องไม่สำเร็จ", "Admin close spot error");
  }
};

/*
    @desc   Change a lot's settings
    @route  PUT /api/admin/lots/:id
    @access Admin
    @body   { spotStickers?: boolean, name?: string, building?: string }
*/
export const updateLot = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) throw new HttpError(404, "ไม่พบลาน");
    const update = {};
    if (req.body?.spotStickers !== undefined) {
      if (typeof req.body.spotStickers !== "boolean") throw new HttpError(400, "spotStickers ต้องเป็น true หรือ false");
      update.spotStickers = req.body.spotStickers;
    }
    if (req.body?.name !== undefined) {
      const name = String(req.body.name).trim();
      if (!name || name.length > 80) throw new HttpError(400, "ชื่อลานต้องมี 1-80 ตัวอักษร");
      update.name = name;
    }
    if (req.body?.building !== undefined) update.building = String(req.body.building).trim().slice(0, 80);
    if (!Object.keys(update).length) throw new HttpError(400, "ไม่มีอะไรให้แก้");

    const zone = await ParkingZone.findByIdAndUpdate(id, update, { new: true });
    if (!zone) throw new HttpError(404, "ไม่พบลาน");

    const message =
      update.spotStickers === true
        ? `ลาน ${zone.zoneName}: ผู้ใช้จะเห็นปุ่มสแกน QR ที่ช่องจอด`
        : update.spotStickers === false
          ? `ลาน ${zone.zoneName}: ซ่อนปุ่มสแกน QR ที่ช่องจอดแล้ว`
          : `บันทึกลาน ${zone.zoneName} แล้ว`;
    res.json({ success: true, message, lot: shapeLot(zone) });
  } catch (error) {
    sendError(res, error, "บันทึกลานไม่สำเร็จ", "Admin update lot error");
  }
};

export default { updateLot, listLots, createLot, listLotSpots, addLotSpots, setSpotClosed, parseSpotNumbers };
