import mongoose from "mongoose";

const parkingSpotSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
  },
  spotNumber: {
    type: String,
    required: true,
  },
  zone: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "ParkingZone",
    required: true,
  },
  zoneName: {
    type: String,
    default: "",
  },
  floor: {
    type: String,
    default: "ชั้น 1",
  },
  building: {
    type: String,
    default: "",
  },
  status: {
    type: String,
    // closed: taken out of booking by an admin (repairs, an event).
    enum: ["available", "occupied", "reserved", "closed"],
    default: "available",
  },
  pricePerHour: {
    type: Number,
    default: 20,
  },
  facilities: [{
    type: String,
  }],
  // Printed on the QR sticker at this bay. Scanning it is how a driver proves
  // they have arrived. Hidden from normal queries; see spotCodeService.
  checkInCode: {
    type: String,
    default: null,
    select: false,
  },
}, {
  timestamps: true,
});

// สร้าง Index เพื่อบังคับว่า "ในโซนเดียวกัน ห้ามมีเลขช่องจอดซ้ำกัน"
parkingSpotSchema.index({ zone: 1, spotNumber: 1 }, { unique: true });
parkingSpotSchema.index({ status: 1 });
parkingSpotSchema.index({ name: 1 });

const ParkingSpot = mongoose.models.ParkingSpot || mongoose.model("ParkingSpot", parkingSpotSchema);
export default ParkingSpot;