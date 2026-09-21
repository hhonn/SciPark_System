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
}, { timestamps: true });

// Index already created by unique: true on zoneName field
// parkingZoneSchema.index({ zoneName: 1 }); // REMOVED - duplicate

const ParkingZone = mongoose.models.ParkingZone || mongoose.model("ParkingZone", parkingZoneSchema);
export default ParkingZone;