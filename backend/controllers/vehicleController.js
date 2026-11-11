import mongoose from "mongoose";
import Vehicle from "../models/vehicleModel.js";
import Booking from "../models/bookingModel.js";
import User from "../models/userModel.js";
import { getEffectiveTier } from "../config/pricing.js";
import { mediaEnabled, photoUrl, deleteMedia } from "../services/mediaService.js";

const ACTIVE_STATUSES = ["pending", "confirmed"];

/**
 * Plates are stored without whitespace, so every lookup has to normalise too.
 * Checking the raw input against normalised rows let "กข 1234" and "กข  1234"
 * both pass the duplicate check and then collide on the unique index, which
 * surfaced to the user as a 500 rather than "this plate is already registered".
 */
const normalisePlate = (value) => String(value ?? "").trim().replace(/\s+/g, "");

/** A duplicate that still slips past the pre-check lands on the unique index. */
const isDuplicateKey = (error) => error?.code === 11000;

/*
    @desc    Add a new vehicle for the logged-in user
    @route   POST /api/vehicles
*/
export const addVehicle = async (req, res) => {
  try {
    const { licensePlate, brand, model, color } = req.body;

    // ดึง userId จาก middleware
    const userId = req.userId;
    if (!userId) {
      return res
        .status(401)
        .json({ success: false, message: "Unauthorized" });
    }

    // ตรวจสอบข้อมูลเกี่ยวกับรถว่าส่งมาครบไหม
    if (!licensePlate || !brand || !model) {
      return res.status(400).json({ success: false, message: "กรุณากรอกข้อมูลให้ครบถ้วน" });
    }

    const plate = normalisePlate(licensePlate);
    if (!plate) {
      return res.status(400).json({ success: false, message: "กรุณากรอกป้ายทะเบียน" });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ success: false, message: "ไม่พบผู้ใช้" });
    }

    // ตรวจสอบคนนี้มีรถที่มีป้ายทะเบียนนี้อยู่แล้วหรือไม่ ถ้ามีแล้วจะไม่สามารถลงทะเบียนซ้ำได้
    const existingVehicle = await Vehicle.findOne({ licensePlate: plate, userId: user._id });
    if (existingVehicle) {
      return res.status(409).json({ success: false, message: "ป้ายทะเบียนนี้ถูกลงทะเบียนแล้ว" });
    }

    // Every tier advertises how many vehicles it supports (config/pricing.js)
    // and the Privileges screen sells that number, but nothing enforced it.
    const tier = getEffectiveTier(user);
    const vehicleCount = await Vehicle.countDocuments({ userId: user._id });

    if (vehicleCount >= tier.maxVehicles) {
      return res.status(403).json({
        success: false,
        code: "vehicle_limit_reached",
        message: `แพ็กเกจ ${tier.name} รองรับ ${tier.maxVehicles} ยานพาหนะ กรุณาลบคันเดิมหรืออัปเกรดสมาชิก`,
        limit: tier.maxVehicles,
        tier: tier.id,
      });
    }

    // Check if this is the first vehicle - make it default
    const isDefault = vehicleCount === 0;

    // เพิ่มข้อมูลรถคันใหม่
    const newVehicle = new Vehicle({
      licensePlate: plate,
      brand,
      model,
      color: color || '',
      userId: user._id,
      isDefault: isDefault
    });

    await newVehicle.save();

    res.status(201).json({
      success: true,
      message: "เพิ่มยานพาหนะสำเร็จ",
      data: {
        id: newVehicle._id,
        licensePlate: newVehicle.licensePlate,
        brand: newVehicle.brand,
        model: newVehicle.model,
        color: newVehicle.color,
        isDefault: newVehicle.isDefault
      }
    });

  } catch (error) {
    if (isDuplicateKey(error)) {
      return res.status(409).json({ success: false, message: "ป้ายทะเบียนนี้ถูกลงทะเบียนแล้ว" });
    }
    console.error("Add vehicle error:", error);
    res.status(500).json({ success: false, message: "เกิดข้อผิดพลาด" });
  }
};

/*
    @desc    Get all vehicles for the logged-in user
    @route   GET /api/vehicles
*/
export const getUserAllVehicles = async (req, res) => {
  try {
    // ดึง userId จาก middleware
    const userId = req.userId;
    if (!userId) {
      return res
        .status(401)
        .json({ success: false, message: "Unauthorized" });
    }

    // ค้นหาผู้ใช้จากฐานข้อมูล
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ success: false, message: "ไม่พบผู้ใช้" });
    }

    // ค้นหารถทุกคันของผู้ใช้
    const vehicles = await Vehicle.find({ userId: user._id })
      .select("licensePlate brand model color isDefault createdAt photoKey")
      .sort({ isDefault: -1, createdAt: -1 });

    const tier = getEffectiveTier(user);

    res.status(200).json({
      success: true,
      count: vehicles.length,
      // So the client can say "3 of 3 used" instead of discovering the cap
      // only when the next add is refused.
      limit: tier.maxVehicles,
      // Whether this server can store photos (S3 configured).
      photoUploads: mediaEnabled(),
      data: await Promise.all(vehicles.map(async (v) => ({
        id: v._id,
        licensePlate: v.licensePlate,
        brand: v.brand,
        model: v.model,
        color: v.color || '',
        isDefault: v.isDefault || false,
        createdAt: v.createdAt,
        photoUrl: await photoUrl(v.photoKey),
      })))
    });

  } catch (error) {
    console.error("Get vehicles error:", error);
    res.status(500).json({ success: false, message: "เกิดข้อผิดพลาด" });
  }
};

/*
    @desc    Update a vehicle
    @route   PUT /api/vehicles/:id
*/
export const updateVehicle = async (req, res) => {
  try {
    const userId = req.userId;
    const { id } = req.params;
    const { licensePlate, brand, model, color } = req.body;

    if (!userId) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    // A malformed id used to reach Mongoose and throw a CastError, answering
    // 500 where the honest answer is "no such vehicle".
    if (!mongoose.isValidObjectId(id)) {
      return res.status(404).json({ success: false, message: "ไม่พบยานพาหนะ" });
    }

    const vehicle = await Vehicle.findOne({ _id: id, userId });
    if (!vehicle) {
      return res.status(404).json({ success: false, message: "ไม่พบยานพาหนะ" });
    }

    // Compare normalised against normalised: the stored value has no spaces.
    const plate = licensePlate === undefined ? null : normalisePlate(licensePlate);

    if (licensePlate !== undefined && !plate) {
      return res.status(400).json({ success: false, message: "กรุณากรอกป้ายทะเบียน" });
    }

    // Check if new license plate is already used by another vehicle
    if (plate && plate !== vehicle.licensePlate) {
      const existingVehicle = await Vehicle.findOne({
        licensePlate: plate,
        userId,
        _id: { $ne: vehicle._id }
      });
      if (existingVehicle) {
        return res.status(409).json({ success: false, message: "ป้ายทะเบียนนี้ถูกลงทะเบียนแล้ว" });
      }
    }

    // Update fields
    if (plate) vehicle.licensePlate = plate;
    if (brand) vehicle.brand = brand;
    if (model) vehicle.model = model;
    if (color !== undefined) vehicle.color = color;

    await vehicle.save();

    res.status(200).json({
      success: true,
      message: "อัปเดตยานพาหนะสำเร็จ",
      data: {
        id: vehicle._id,
        licensePlate: vehicle.licensePlate,
        brand: vehicle.brand,
        model: vehicle.model,
        color: vehicle.color,
        isDefault: vehicle.isDefault
      }
    });

  } catch (error) {
    if (isDuplicateKey(error)) {
      return res.status(409).json({ success: false, message: "ป้ายทะเบียนนี้ถูกลงทะเบียนแล้ว" });
    }
    console.error("Update vehicle error:", error);
    res.status(500).json({ success: false, message: "เกิดข้อผิดพลาด" });
  }
};

/*
    @desc    Delete a vehicle
    @route   DELETE /api/vehicles/:id
*/
export const deleteVehicle = async (req, res) => {
  try {
    const userId = req.userId;
    const { id } = req.params;

    if (!userId) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    if (!mongoose.isValidObjectId(id)) {
      return res.status(404).json({ success: false, message: "ไม่พบยานพาหนะ" });
    }

    const vehicle = await Vehicle.findOne({ _id: id, userId });
    if (!vehicle) {
      return res.status(404).json({ success: false, message: "ไม่พบยานพาหนะ" });
    }

    // The car is in a bay right now: deleting it strips the plate off a live
    // booking, leaving nothing to identify what is actually parked there.
    const inUse = await Booking.findOne({
      vehicle: vehicle._id,
      status: { $in: ACTIVE_STATUSES },
    });

    if (inUse) {
      return res.status(409).json({
        success: false,
        code: "vehicle_in_use",
        message: "ยานพาหนะนี้กำลังใช้งานอยู่ในการจอง กรุณา check-out หรือยกเลิกการจองก่อน",
      });
    }

    const wasDefault = vehicle.isDefault;
    await Vehicle.deleteOne({ _id: vehicle._id });
    await deleteMedia(vehicle.photoKey);

    // If deleted vehicle was default, set another vehicle as default
    if (wasDefault) {
      const anotherVehicle = await Vehicle.findOne({ userId }).sort({ createdAt: 1 });
      if (anotherVehicle) {
        anotherVehicle.isDefault = true;
        await anotherVehicle.save();
      }
    }

    res.status(200).json({
      success: true,
      message: "ลบยานพาหนะสำเร็จ"
    });

  } catch (error) {
    console.error("Delete vehicle error:", error);
    res.status(500).json({ success: false, message: "เกิดข้อผิดพลาด" });
  }
};

/*
    @desc    Set vehicle as default
    @route   PUT /api/vehicles/:id/default
*/
export const setDefaultVehicle = async (req, res) => {
  try {
    const userId = req.userId;
    const { id } = req.params;

    if (!userId) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    if (!mongoose.isValidObjectId(id)) {
      return res.status(404).json({ success: false, message: "ไม่พบยานพาหนะ" });
    }

    const vehicle = await Vehicle.findOne({ _id: id, userId });
    if (!vehicle) {
      return res.status(404).json({ success: false, message: "ไม่พบยานพาหนะ" });
    }

    // Remove default from all other vehicles
    await Vehicle.updateMany(
      { userId, _id: { $ne: vehicle._id } },
      { isDefault: false }
    );

    // Set this vehicle as default
    vehicle.isDefault = true;
    await vehicle.save();

    res.status(200).json({
      success: true,
      message: "ตั้งเป็นยานพาหนะหลักสำเร็จ",
      data: {
        id: vehicle._id,
        licensePlate: vehicle.licensePlate,
        isDefault: vehicle.isDefault
      }
    });

  } catch (error) {
    console.error("Set default vehicle error:", error);
    res.status(500).json({ success: false, message: "เกิดข้อผิดพลาด" });
  }
};
