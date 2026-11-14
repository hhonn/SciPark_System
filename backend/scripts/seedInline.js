// Seeds the current MONGO_URI in-process (used by scripts/devServer.js).
// The standalone `npm run seed` script connects and disconnects on its own;
// this variant leaves the connection open for the server that follows it.
import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import ParkingZone from "../models/parkingZoneModel.js";
import ParkingSpot from "../models/parkingSpotModel.js";
import User from "../models/userModel.js";
import Vehicle from "../models/vehicleModel.js";

await mongoose.connect(process.env.MONGO_URI);

const zones = await ParkingZone.insertMany([
  { zoneName: "CHULA", name: "หน้าตึกจุฬาภรณวลัยลักษณ์ 1", building: "ตึกจุฬาภรณวลัยลักษณ์ 1", description: "ใกล้ทางเข้าหลัก", totalSpots: 30, hourlyRate: 10, code: "C", walkMinutes: 2, mapX: 30, mapY: 26 },
  { zoneName: "PRAJOM", name: "ใต้ตึกพระจอมเกล้า", building: "ตึกพระจอมเกล้า", description: "ป้องกันแดดฝน", totalSpots: 25, hourlyRate: 10, code: "P", walkMinutes: 4, mapX: 72, mapY: 32 },
  { zoneName: "BEHIND", name: "หลังคณะวิทยาศาสตร์", building: "คณะวิทยาศาสตร์", description: "มีต้นไม้ร่มรื่น", totalSpots: 35, hourlyRate: 10, code: "B", walkMinutes: 6, mapX: 78, mapY: 70 },
  { zoneName: "DEAN", name: "หน้าตึกคณบดีคณะวิทยาศาสตร์", building: "ตึกคณบดี", description: "ที่จอดกว้าง", totalSpots: 20, hourlyRate: 10, code: "D", walkMinutes: 3, mapX: 22, mapY: 64 },
  { zoneName: "FRONT", name: "หน้าคณะวิทยาศาสตร์", building: "คณะวิทยาศาสตร์", description: "ใกล้ประตูหลัก", totalSpots: 30, hourlyRate: 10, code: "F", walkMinutes: 1, mapX: 50, mapY: 84 },
]);

const rows = ["A", "B", "C", "D", "E"];
const spots = [];

for (const zone of zones) {
  const perRow = Math.ceil(zone.totalSpots / rows.length);
  let index = 0;
  for (let r = 0; r < rows.length && index < zone.totalSpots; r += 1) {
    for (let c = 0; c < perRow && index < zone.totalSpots; c += 1) {
      const spotNumber = `${rows[r]}${String(c + 1).padStart(2, "0")}`;
      spots.push({
        spotNumber,
        name: `ช่อง ${spotNumber}`,
        zone: zone._id,
        zoneName: zone.zoneName,
        floor: "ลานจอด",
        building: zone.building,
        status: Math.random() < 0.18 ? "occupied" : "available",
        pricePerHour: 10,
        facilities: ["CCTV", "ไฟส่องสว่าง"],
      });
      index += 1;
    }
  }
}

await ParkingSpot.insertMany(spots);

const seededUsers = await User.insertMany([
  { name: "ทดสอบ ไอรอน", email: "iron@test.com", username: "ironuser", password: await bcrypt.hash("password123", 10), phone: "0812345678", rank: "Iron", points: 50, isAccountVerified: true },
  { name: "ทดสอบ ไดมอนด์", email: "diamond@test.com", username: "diamonduser", password: await bcrypt.hash("password123", 10), phone: "0823456789", rank: "Diamond", points: 500, isAccountVerified: true, subscriptionExpiry: new Date(Date.now() + 30 * 86400000) },
]);

// Booking requires a car on file.
await Vehicle.insertMany(
  seededUsers.map((user, n) => ({ licensePlate: `ทดสอบ${1001 + n}`, brand: "Toyota", model: "Yaris", userId: user._id, isDefault: true }))
);

console.log(`🌱 Seeded ${zones.length} zones, ${spots.length} spots, 2 test users`);
console.log("   login: iron@test.com / password123");
