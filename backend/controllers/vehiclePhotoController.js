import mongoose from "mongoose";
import Vehicle from "../models/vehicleModel.js";
import { createPhotoUpload, verifyPhotoUpload, photoUrl, deleteMedia } from "../services/mediaService.js";
import { HttpError, sendError } from "../utils/httpError.js";
import { logEvent } from "../utils/logger.js";

const ownVehicle = async (req) => {
  const { id } = req.params;
  if (!mongoose.isValidObjectId(id)) throw new HttpError(404, "ไม่พบยานพาหนะ");
  const vehicle = await Vehicle.findOne({ _id: id, userId: req.userId });
  if (!vehicle) throw new HttpError(404, "ไม่พบยานพาหนะ");
  return vehicle;
};

/*
    @desc   Get a one-time presigned POST to upload this car's photo to S3
    @route  POST /api/vehicles/:id/photo/upload   { contentType }
    @access Private
*/
export const requestPhotoUpload = async (req, res) => {
  try {
    const vehicle = await ownVehicle(req);
    const upload = await createPhotoUpload({
      userId: req.userId,
      vehicleId: String(vehicle._id),
      contentType: String(req.body?.contentType || ""),
    });
    res.json({ success: true, upload });
  } catch (error) {
    sendError(res, error, "สร้างลิงก์อัปโหลดไม่สำเร็จ", "Photo upload URL error");
  }
};

/*
    @desc   Attach an uploaded photo to the car (replaces the old one)
    @route  PUT /api/vehicles/:id/photo   { key }
    @access Private
*/
export const confirmPhoto = async (req, res) => {
  try {
    const vehicle = await ownVehicle(req);
    const key = req.body?.key;
    const file = await verifyPhotoUpload({ userId: req.userId, vehicleId: String(vehicle._id), key });

    const previous = vehicle.photoKey;
    vehicle.photoKey = key;
    await vehicle.save();
    if (previous && previous !== key) await deleteMedia(previous);

    logEvent("media_uploaded", { kind: "vehicle_photo", bytes: file.size });
    res.json({ success: true, message: "บันทึกรูปรถแล้ว", photoUrl: await photoUrl(key) });
  } catch (error) {
    sendError(res, error, "บันทึกรูปไม่สำเร็จ", "Photo confirm error");
  }
};

/*
    @desc   Remove the car's photo
    @route  DELETE /api/vehicles/:id/photo
    @access Private
*/
export const removePhoto = async (req, res) => {
  try {
    const vehicle = await ownVehicle(req);
    const previous = vehicle.photoKey;
    vehicle.photoKey = null;
    await vehicle.save();
    await deleteMedia(previous);
    res.json({ success: true, message: "ลบรูปรถแล้ว" });
  } catch (error) {
    sendError(res, error, "ลบรูปไม่สำเร็จ", "Photo delete error");
  }
};

export default { requestPhotoUpload, confirmPhoto, removePhoto };
