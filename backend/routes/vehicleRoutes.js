import express from "express";
import { 
  addVehicle, 
  getUserAllVehicles, 
  updateVehicle, 
  deleteVehicle, 
  setDefaultVehicle 
} from "../controllers/vehicleController.js";
import userAuth from "../middleware/userAuth.js";

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

// Set vehicle as default
router.put("/:id/default", setDefaultVehicle);

export default router;