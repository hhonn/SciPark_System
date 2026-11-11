import mongoose from "mongoose";

const vehicleSchema = new mongoose.Schema(
  {
    licensePlate: {
      type: String,
      required: [true, "กรุณากรอกป้ายทะเบียน"],
      trim: true,
    },
    brand: {
      type: String,
      required: [true, "กรุณากรอกยี่ห้อรถ"],
      trim: true,
    },
    model: {
      type: String,
      required: [true, "กรุณากรอกรุ่นรถ"],
      trim: true,
    },
    color: {
      type: String,
      default: "",
      trim: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    isDefault: {
      type: Boolean,
      default: false,
    },
    // S3 object key of the car's photo (the bucket is private; see mediaService).
    photoKey: {
      type: String,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

// Compound index for unique license plate per user
vehicleSchema.index({ licensePlate: 1, userId: 1 }, { unique: true });

const Vehicle = mongoose.models.Vehicle || mongoose.model("Vehicle", vehicleSchema);

export default Vehicle;