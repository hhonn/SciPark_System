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
    enum: ["available", "occupied", "reserved"],
    default: "available",
  },
  pricePerHour: {
    type: Number,
    default: 20,
  },
  facilities: [{
    type: String,
  }],
}, {
  timestamps: true,
});

// สร้าง Index เพื่อบังคับว่า "ในโซนเดียวกัน ห้ามมีเลขช่องจอดซ้ำกัน"
parkingSpotSchema.index({ zone: 1, spotNumber: 1 }, { unique: true });
parkingSpotSchema.index({ status: 1 });
parkingSpotSchema.index({ name: 1 });

const ParkingSpot = mongoose.models.ParkingSpot || mongoose.model("ParkingSpot", parkingSpotSchema);
export default ParkingSpot;