import mongoose from "mongoose";
import ParkingZone from "../models/parkingZoneModel.js";
import ParkingSpot from "../models/parkingSpotModel.js";
import Booking from "../models/bookingModel.js";

const shapeSpot = (spot) => ({
  id: spot._id,
  spotNumber: spot.spotNumber,
  name: spot.name,
  floor: spot.floor,
  building: spot.building,
  status: spot.status,
  pricePerHour: spot.pricePerHour,
  facilities: spot.facilities || [],
});

/*
    @desc   Get all zones with live availability
    @route  GET /api/parking/zones
    @access Public
*/
export const getAllZones = async (req, res) => {
  try {
    // One aggregation instead of three countDocuments per zone: the old code
    // fired 1 + 3N queries on a page that every user hits first.
    const [zones, counts] = await Promise.all([
      ParkingZone.find({})
        .select("zoneName name description building totalSpots hourlyRate walkMinutes mapX mapY code")
        .lean(),
      ParkingSpot.aggregate([
        { $group: { _id: { zone: "$zone", status: "$status" }, count: { $sum: 1 } } },
      ]),
    ]);

    const byZone = new Map();
    for (const row of counts) {
      // A bay an admin closed is not part of what a driver can get.
      if (row._id.status === "closed") continue;
      const key = String(row._id.zone);
      const entry = byZone.get(key) || { total: 0, available: 0, occupied: 0, reserved: 0 };
      entry.total += row.count;
      if (row._id.status in entry) entry[row._id.status] += row.count;
      byZone.set(key, entry);
    }

    const zonesWithAvailability = zones.map((zone) => {
      const c = byZone.get(String(zone._id)) || { total: 0, available: 0, occupied: 0, reserved: 0 };
      const taken = c.occupied + c.reserved;

      return {
        id: zone._id,
        zoneName: zone.zoneName,
        name: zone.name,
        description: zone.description,
        building: zone.building,
        code: zone.code || zone.zoneName?.charAt(0) || "?",
        walkMinutes: zone.walkMinutes,
        mapX: zone.mapX,
        mapY: zone.mapY,
        totalSpots: c.total,
        availableSpots: c.available,
        occupiedSpots: c.occupied,
        reservedSpots: c.reserved,
        hourlyRate: zone.hourlyRate,
        isFull: c.total > 0 && c.available === 0,
        // A held spot is just as unusable as an occupied one, so it counts
        // toward occupancy.
        occupancyRate: c.total > 0 ? Math.round((taken / c.total) * 100) : 0,
      };
    });

    res.status(200).json({
      success: true,
      count: zonesWithAvailability.length,
      zones: zonesWithAvailability,
    });
  } catch (error) {
    console.error("Get all zones error:", error);
    res.status(500).json({ success: false, message: "เกิดข้อผิดพลาด" });
  }
};

/*
    @desc   Get a zone with its spots
    @route  GET /api/parking/zones/:id
    @access Public
*/
export const getZoneById = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ success: false, message: "รหัสโซนไม่ถูกต้อง" });
    }

    const zone = await ParkingZone.findById(id);
    if (!zone) {
      return res.status(404).json({ success: false, message: "ไม่พบโซนจอดรถ" });
    }

    const spots = await ParkingSpot.find({ zone: id }).sort({ spotNumber: 1 });

    const totalSpots = spots.filter((s) => s.status !== "closed").length;
    const availableSpots = spots.filter((s) => s.status === "available").length;
    const occupiedSpots = spots.filter((s) => s.status === "occupied").length;
    const reservedSpots = spots.filter((s) => s.status === "reserved").length;
    const taken = occupiedSpots + reservedSpots;

    res.status(200).json({
      success: true,
      zone: {
        id: zone._id,
        zoneName: zone.zoneName,
        name: zone.name,
        description: zone.description,
        building: zone.building,
        code: zone.code || zone.zoneName?.charAt(0) || "?",
        walkMinutes: zone.walkMinutes,
        totalSpots,
        availableSpots,
        occupiedSpots,
        reservedSpots,
        hourlyRate: zone.hourlyRate,
        isFull: totalSpots > 0 && availableSpots === 0,
        occupancyRate: totalSpots > 0 ? Math.round((taken / totalSpots) * 100) : 0,
      },
      spots: spots.map(shapeSpot),
    });
  } catch (error) {
    console.error("Get zone by ID error:", error);
    res.status(500).json({ success: false, message: "เกิดข้อผิดพลาด" });
  }
};

/*
    @desc   Get the spots of one zone
    @route  GET /api/parking/zones/:id/spots
    @access Public
*/
export const getSpotsByZone = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ success: false, message: "รหัสโซนไม่ถูกต้อง" });
    }

    const filter = { zone: id };
    if (req.query.status) filter.status = req.query.status;

    const spots = await ParkingSpot.find(filter).sort({ spotNumber: 1 });

    res.status(200).json({ success: true, count: spots.length, spots: spots.map(shapeSpot) });
  } catch (error) {
    console.error("Get spots by zone error:", error);
    res.status(500).json({ success: false, message: "เกิดข้อผิดพลาด" });
  }
};

/*
    @desc   Get all parking spots
    @route  GET /api/parking/spots
    @access Public
*/
export const getAllSpots = async (req, res) => {
  try {
    const { zoneId, status, floor, building } = req.query;

    const query = {};
    if (zoneId && mongoose.isValidObjectId(zoneId)) query.zone = zoneId;
    if (status) query.status = status;
    if (floor) query.floor = floor;
    if (building) query.building = building;

    const spots = await ParkingSpot.find(query)
      .populate("zone", "zoneName name building hourlyRate")
      .sort({ spotNumber: 1 });

    const formattedSpots = spots.map((spot) => ({
      ...shapeSpot(spot),
      // A spot whose zone was deleted used to crash this endpoint outright.
      zone: spot.zone
        ? {
            id: spot.zone._id,
            zoneName: spot.zone.zoneName,
            name: spot.zone.name,
            building: spot.zone.building,
          }
        : null,
    }));

    res.status(200).json({ success: true, count: formattedSpots.length, spots: formattedSpots });
  } catch (error) {
    console.error("Get all spots error:", error);
    res.status(500).json({ success: false, message: "เกิดข้อผิดพลาด" });
  }
};

/*
    @desc   Get one spot
    @route  GET /api/parking/spots/:id
    @access Public
*/
export const getSpotById = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ success: false, message: "รหัสช่องจอดไม่ถูกต้อง" });
    }

    const spot = await ParkingSpot.findById(id).populate(
      "zone",
      "zoneName name description building hourlyRate"
    );

    if (!spot) {
      return res.status(404).json({ success: false, message: "ไม่พบช่องจอดรถ" });
    }

    res.status(200).json({
      success: true,
      spot: {
        ...shapeSpot(spot),
        zone: spot.zone
          ? {
              id: spot.zone._id,
              zoneName: spot.zone.zoneName,
              name: spot.zone.name,
              description: spot.zone.description,
              building: spot.zone.building,
              hourlyRate: spot.zone.hourlyRate,
            }
          : null,
      },
    });
  } catch (error) {
    console.error("Get spot by ID error:", error);
    res.status(500).json({ success: false, message: "เกิดข้อผิดพลาด" });
  }
};

/*
    @desc   Update parking spot status
    @route  PUT /api/parking/spots/:id/status
    @access Private (Admin)
*/
export const updateSpotStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!mongoose.isValidObjectId(id)) {
      return res.status(404).json({ success: false, message: "ไม่พบช่องจอดรถ" });
    }

    // "unavailable" used to be accepted here but is not in the schema enum, so
    // the update always failed validation. The list now matches the model.
    const validStatuses = ParkingSpot.schema.path("status").enumValues;
    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: `สถานะไม่ถูกต้อง ต้องเป็น: ${validStatuses.join(", ")}`,
      });
    }

    // A spot held by a live booking must stay consistent with that booking.
    // Flipping it to "available" by hand let the next driver be assigned a
    // bay someone had already paid for (or was parked in).
    const holder = await Booking.findOne({ spot: id, status: { $in: ["pending", "confirmed"] } })
      .select("status spotNumber");
    if (holder) {
      return res.status(409).json({
        success: false,
        code: "spot_in_use",
        message: holder.status === "confirmed"
          ? "ช่องนี้มีรถเช็คอินอยู่ ต้องเช็คเอาต์หรือยกเลิกการจองก่อนเปลี่ยนสถานะ"
          : "ช่องนี้ถูกจองอยู่ ต้องยกเลิกการจองก่อนเปลี่ยนสถานะ",
      });
    }

    const spot = await ParkingSpot.findByIdAndUpdate(
      id,
      { status },
      { new: true, runValidators: true }
    );

    if (!spot) {
      return res.status(404).json({ success: false, message: "ไม่พบช่องจอดรถ" });
    }

    res.status(200).json({
      success: true,
      message: `อัปเดตสถานะเป็น ${status} สำเร็จ`,
      spot: shapeSpot(spot),
    });
  } catch (error) {
    console.error("Update spot status error:", error);
    res.status(500).json({ success: false, message: "เกิดข้อผิดพลาด" });
  }
};

/*
    @desc   Get parking statistics
    @route  GET /api/parking/stats
    @access Public
*/
export const getParkingStats = async (req, res) => {
  try {
    const [totalZones, statusCounts] = await Promise.all([
      ParkingZone.countDocuments(),
      ParkingSpot.aggregate([{ $group: { _id: "$status", count: { $sum: 1 } } }]),
    ]);

    const counts = { available: 0, occupied: 0, reserved: 0 };
    let totalSpots = 0;
    for (const row of statusCounts) {
      if (row._id === "closed") continue;
      totalSpots += row.count;
      if (row._id in counts) counts[row._id] += row.count;
    }

    const taken = counts.occupied + counts.reserved;

    res.status(200).json({
      success: true,
      stats: {
        totalZones,
        totalSpots,
        availableSpots: counts.available,
        occupiedSpots: counts.occupied,
        reservedSpots: counts.reserved,
        occupancyRate: totalSpots > 0 ? Math.round((taken / totalSpots) * 100) : 0,
      },
    });
  } catch (error) {
    console.error("Get parking stats error:", error);
    res.status(500).json({ success: false, message: "เกิดข้อผิดพลาด" });
  }
};
