import express from "express";
import { 
  addVehicle, 
  getUserAllVehicles, 
  updateVehicle, 
  deleteVehicle, 
  setDefaultVehicle 
} from "../controllers/vehicleController.js";
import userAuth from "../middleware/userAuth.js";
import { requestPhotoUpload, confirmPhoto, removePhoto } from "../controllers/vehiclePhotoController.js";

const router = express.Router();

// All routes require authentication
router.use(userAuth);

// Get all vehicles
router.get("/", getUserAllVehicles);

// Add new vehicle
router.post("/", addVehicle);

// Update vehicle
router.put("/:id", updateVehicle);

// Delete vehicle
router.delete("/:id", deleteVehicle);

// Car photo, stored in S3 (see services/mediaService.js)
router.post("/:id/photo/upload", requestPhotoUpload);
router.put("/:id/photo", confirmPhoto);
router.delete("/:id/photo", removePhoto);

// Set vehicle as default
router.put("/:id/default", setDefaultVehicle);

export default router;