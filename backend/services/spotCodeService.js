import crypto from "crypto";
import mongoose from "mongoose";
import ParkingSpot from "../models/parkingSpotModel.js";

// QR stickers fixed to each parking bay.
//
// Lots have no staff, so the driver proves arrival by scanning the sticker on
// the bay they booked. The sticker carries the bay's id and a random code;
// printing it needs the code back, so the code is stored as is (hidden from
// normal queries). If a photo of a sticker gets passed around, an admin
// rotates that bay's code and reprints it.

const CODE_BYTES = 16;

export const newSpotCode = () => crypto.randomBytes(CODE_BYTES).toString("base64url");

// Compare without leaking how much of the code was right through timing.
export const spotCodeMatches = (given, stored) => {
  if (!given || !stored) return false;
  const a = crypto.createHash("sha256").update(String(given)).digest();
  const b = crypto.createHash("sha256").update(String(stored)).digest();
  return crypto.timingSafeEqual(a, b);
};

// The bay a scanned sticker belongs to, or null when the id or code is wrong
// (or the code has been rotated since the sticker was printed).
export const findSpotByCode = async ({ spotId, code } = {}) => {
  if (!mongoose.isValidObjectId(spotId) || typeof code !== "string" || !code) return null;

  const spot = await ParkingSpot.findById(spotId)
    .select("+checkInCode")
    .populate("zone", "zoneName name building latitude longitude checkInRadiusMeters");

  if (!spot || !spotCodeMatches(code, spot.checkInCode)) return null;
  return spot;
};

// Give every bay matching `filter` a code if it has none yet.
export const ensureSpotCodes = async (filter = {}) => {
  const missing = await ParkingSpot.find({ ...filter, checkInCode: null }).select("_id");
  for (const { _id } of missing) {
    // Conditional, so two admins opening the print page at once do not
    // overwrite each other's freshly issued code.
    await ParkingSpot.updateOne({ _id, checkInCode: null }, { checkInCode: newSpotCode() });
  }
  return missing.length;
};

// Issue a new code for one bay. The old sticker stops working at once.
export const rotateSpotCode = (spotId) =>
  ParkingSpot.findByIdAndUpdate(spotId, { checkInCode: newSpotCode() }, { new: true }).select("+checkInCode");

export default { newSpotCode, spotCodeMatches, findSpotByCode, ensureSpotCodes, rotateSpotCode };
