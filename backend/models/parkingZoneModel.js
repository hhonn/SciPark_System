import mongoose from "mongoose";

const parkingZoneSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
  },
  zoneName: {
    type: String,
    required: true,
    unique: true,
    trim: true,
  },
  description: {
    type: String,
    default: "",
  },
  building: {
    type: String,
    default: "",
  },
  totalSpots: {
    type: Number,
    required: true,
  },
  hourlyRate: {
    type: Number,
    default: 20,
  },
  // Minutes on foot from this lot to the faculty entrance. Walking distance is
  // one of the top three things a driver actually decides on, alongside price
  // and availability, so it belongs in the data rather than the copy.
  walkMinutes: {
    type: Number,
    default: 3,
  },
  // Position on the campus schematic (percentage of the map's width/height),
  // so the map and the data cannot drift apart.
  mapX: {
    type: Number,
    default: 50,
  },
  mapY: {
    type: Number,
    default: 50,
  },
  // Short label drawn on the map pin.
  code: {
    type: String,
    default: "",
  },
  bookingRate: {
    type: Number,
    default: 0,
  },
  // Real-world position of the lot, used for GPS self check-in. Unset means
  // self check-in is off for this lot and only a staff QR scan can check in.
  // An admin sets it by standing in the lot (see the staff screen).
  latitude: {
    type: Number,
    default: null,
    min: -90,
    max: 90,
  },
  longitude: {
    type: Number,
    default: null,
    min: -180,
    max: 180,
  },
  // How far from that point a phone may be and still count as "here".
  checkInRadiusMeters: {
    type: Number,
    default: 100,
    min: 20,
    max: 2000,
  },
}, { timestamps: true });

// Index already created by unique: true on zoneName field
// parkingZoneSchema.index({ zoneName: 1 }); // REMOVED - duplicate

const ParkingZone = mongoose.models.ParkingZone || mongoose.model("ParkingZone", parkingZoneSchema);
export default ParkingZone;