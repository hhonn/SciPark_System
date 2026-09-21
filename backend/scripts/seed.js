import mongoose from "mongoose";
import dotenv from "dotenv";
import bcrypt from "bcryptjs";
import ParkingZone from "../models/parkingZoneModel.js";
import ParkingSpot from "../models/parkingSpotModel.js";
import PromoCode from "../models/promoCodeModel.js";
import Booking from "../models/bookingModel.js";
import User from "../models/userModel.js";
import Vehicle from "../models/vehicleModel.js";
import PaymentMethod from "../models/paymentMethodModel.js";
import Subscription from "../models/subscriptionModel.js";
import Notification from "../models/notificationModel.js";
import { TIERS } from "../config/pricing.js";

dotenv.config();

/** Promo codes are seeded relative to today, not a hard-coded 2024 date. */
const daysFromNow = (days) => new Date(Date.now() + days * 24 * 60 * 60 * 1000);

const connectDB = async () => {
  if (!process.env.MONGO_URI) {
    console.error("❌ MONGO_URI is not set. Create backend/.env from .env.example first.");
    process.exit(1);
  }
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log("✅ MongoDB Connected");
  } catch (error) {
    console.error("❌ MongoDB Connection Error:", error.message);
    process.exit(1);
  }
};

const seedDatabase = async () => {
  console.log("🌱 Starting database seeding...");

  await Promise.all([
    ParkingZone.deleteMany({}),
    ParkingSpot.deleteMany({}),
    PromoCode.deleteMany({}),
    User.deleteMany({}),
    // Bookings reference users and spots that are about to be deleted; leaving
    // them behind left the app showing "active" bookings for missing spots.
    Booking.deleteMany({}),
    // Everything else hanging off a user has to go with the users, for the
    // same reason. These four were left behind, so a reseeded database kept
    // vehicles, saved cards, live subscriptions and notifications belonging to
    // accounts that no longer existed.
    Vehicle.deleteMany({}),
    PaymentMethod.deleteMany({}),
    Subscription.deleteMany({}),
    Notification.deleteMany({}),
  ]);
  console.log("🗑️  Cleared existing data");

  const zones = [
    {
      zoneName: "CHULA",
      name: "หน้าตึกจุฬาภรณวลัยลักษณ์ 1",
      description: "ลานจอดรถหน้าตึกจุฬาภรณวลัยลักษณ์ 1 ใกล้ทางเข้าหลัก",
      building: "ตึกจุฬาภรณวลัยลักษณ์ 1",
      totalSpots: 30,
      hourlyRate: 10,
      code: "C",
      walkMinutes: 2,
      mapX: 30,
      mapY: 26,
    },
    {
      zoneName: "PRAJOM",
      name: "ใต้ตึกพระจอมเกล้า",
      description: "ลานจอดรถใต้ตึกพระจอมเกล้า ป้องกันแดดฝน",
      building: "ตึกพระจอมเกล้า",
      totalSpots: 25,
      hourlyRate: 10,
      code: "P",
      walkMinutes: 4,
      mapX: 72,
      mapY: 32,
    },
    {
      zoneName: "BEHIND",
      name: "หลังคณะวิทยาศาสตร์",
      description: "ลานจอดรถด้านหลังคณะวิทยาศาสตร์ มีต้นไม้ร่มรื่น",
      building: "คณะวิทยาศาสตร์",
      totalSpots: 35,
      hourlyRate: 10,
      code: "B",
      walkMinutes: 6,
      mapX: 78,
      mapY: 70,
    },
    {
      zoneName: "DEAN",
      name: "หน้าตึกคณบดีคณะวิทยาศาสตร์",
      description: "ลานจอดรถหน้าตึกคณบดี สะดวกสบาย มีที่จอดเยอะ",
      building: "ตึกคณบดีคณะวิทยาศาสตร์",
      totalSpots: 20,
      hourlyRate: 10,
      code: "D",
      walkMinutes: 3,
      mapX: 22,
      mapY: 64,
    },
    {
      zoneName: "FRONT",
      name: "หน้าคณะวิทยาศาสตร์",
      description: "ลานจอดรถหน้าคณะวิทยาศาสตร์ ใกล้ประตูหลัก",
      building: "คณะวิทยาศาสตร์",
      totalSpots: 30,
      hourlyRate: 10,
      code: "F",
      walkMinutes: 1,
      mapX: 50,
      mapY: 84,
    },
  ];

  const createdZones = await ParkingZone.insertMany(zones);
  console.log(`✅ Created ${createdZones.length} parking zones`);

  const spotFacilities = [
    ["CCTV", "ร่มเงา", "ใกล้ทางเข้า"],
    ["CCTV", "ไฟส่องสว่าง"],
    ["CCTV", "ร่มเงา"],
    ["CCTV", "ไฟส่องสว่าง", "ช่องจอดกว้าง"],
    ["CCTV"],
  ];

  const rowNames = ["A", "B", "C", "D", "E"];
  const allSpots = [];

  for (const zone of createdZones) {
    const spotsInZone = zone.totalSpots;
    const spotsPerRow = Math.ceil(spotsInZone / rowNames.length);

    let spotIndex = 0;
    for (let row = 0; row < rowNames.length && spotIndex < spotsInZone; row += 1) {
      for (let col = 0; col < spotsPerRow && spotIndex < spotsInZone; col += 1) {
        // Zero-padded and 1-based ("A01"), so numbers sort correctly as text
        // and read the way painted bay markings do.
        const spotNumber = `${rowNames[row]}${String(col + 1).padStart(2, "0")}`;

        allSpots.push({
          spotNumber,
          name: `ช่อง ${spotNumber}`,
          zone: zone._id,
          zoneName: zone.zoneName,
          floor: "ลานจอด",
          building: zone.building,
          // Seed a realistic mix, but never seed "reserved": that status means
          // "a live booking is holding this", and no booking exists yet.
          status: Math.random() < 0.18 ? "occupied" : "available",
          pricePerHour: zone.hourlyRate,
          facilities: spotFacilities[Math.floor(Math.random() * spotFacilities.length)],
        });

        spotIndex += 1;
      }
    }
  }

  const createdSpots = await ParkingSpot.insertMany(allSpots);
  console.log(`✅ Created ${createdSpots.length} parking spots`);

  const promoCodes = [
    {
      code: "SCIPARK2026",
      type: "subscription",
      tier: "diamond",
      durationDays: 30,
      maxUses: 100,
      expiresAt: daysFromNow(180),
      description: `รหัสส่วนลด ${TIERS.diamond.name} 1 เดือน สำหรับผู้ใช้ใหม่`,
    },
    {
      code: "WELCOME100",
      type: "points",
      points: 100,
      maxUses: 50,
      expiresAt: daysFromNow(180),
      description: "รับ 100 แต้มฟรี สำหรับสมาชิกใหม่",
    },
    {
      code: "PREDATOR30",
      type: "subscription",
      tier: "predator",
      durationDays: 30,
      maxUses: 20,
      expiresAt: daysFromNow(90),
      description: `รหัสส่วนลด ${TIERS.predator.name} 1 เดือน แบบจำกัด`,
    },
    {
      code: "DISCOUNT50",
      type: "discount",
      discountPercent: 50,
      maxUses: 200,
      expiresAt: daysFromNow(90),
      description: "ส่วนลด 50% ค่าจอดเกินเวลาครั้งถัดไป",
    },
    {
      code: "FREEPARKING",
      type: "points",
      points: 500,
      maxUses: 10,
      expiresAt: daysFromNow(60),
      description: "รับ 500 แต้มฟรี จำกัดเพียง 10 สิทธิ์",
    },
  ];

  const createdPromoCodes = await PromoCode.insertMany(promoCodes);
  console.log(`✅ Created ${createdPromoCodes.length} promo codes`);

  const testUsers = [
    {
      name: "ทดสอบ ไอรอน",
      email: "iron@test.com",
      username: "ironuser",
      password: "password123",
      phone: "0812345678",
      rank: "Iron",
      points: 50,
      isAccountVerified: true,
    },
    {
      name: "ทดสอบ ไดมอนด์",
      email: "diamond@test.com",
      username: "diamonduser",
      password: "password123",
      phone: "0823456789",
      rank: "Diamond",
      points: 500,
      isAccountVerified: true,
      subscriptionExpiry: daysFromNow(30),
    },
    {
      name: "ทดสอบ เพรดเดเตอร์",
      email: "predator@test.com",
      username: "predatoruser",
      password: "password123",
      phone: "0834567890",
      rank: "Predator",
      points: 1000,
      isAccountVerified: true,
      subscriptionExpiry: daysFromNow(30),
    },
    {
      name: "ผู้ดูแลระบบ",
      email: "admin@scipark.app",
      username: "admin",
      password: "admin12345",
      phone: "0800000000",
      rank: "Predator",
      points: 0,
      isAccountVerified: true,
      isAdmin: true,
      subscriptionExpiry: daysFromNow(365),
    },
  ];

  const hashedUsers = await Promise.all(
    testUsers.map(async (user) => ({
      ...user,
      password: await bcrypt.hash(user.password, 10),
    }))
  );

  const createdUsers = await User.insertMany(hashedUsers);
  console.log(`✅ Created ${createdUsers.length} test users`);

  const available = allSpots.filter((s) => s.status === "available").length;

  console.log("\n📊 Seeding Summary");
  console.log("━".repeat(50));
  console.log(`🏢 Parking Zones : ${createdZones.length}`);
  console.log(`🅿️  Parking Spots : ${createdSpots.length} (available ${available})`);
  console.log(`🎟️  Promo Codes   : ${createdPromoCodes.length}`);
  console.log(`👥 Test Users    : ${createdUsers.length}`);
  console.log("━".repeat(50));

  console.log("\n🔑 Test accounts (password shown as seeded)");
  testUsers.forEach((user) => {
    console.log(`  ${user.rank.padEnd(9)} ${user.email.padEnd(22)} ${user.password}`);
  });

  console.log("\n🎫 Promo codes");
  promoCodes.forEach((code) => console.log(`  ${code.code.padEnd(14)} ${code.description}`));

  console.log("\n✅ Database seeding completed successfully!");
};

const run = async () => {
  await connectDB();
  try {
    await seedDatabase();
  } catch (error) {
    console.error("❌ Seeding error:", error);
    process.exitCode = 1;
  } finally {
    await mongoose.connection.close();
    console.log("👋 Database connection closed");
  }
};

run();
