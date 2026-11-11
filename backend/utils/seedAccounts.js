import crypto from "crypto";
import bcrypt from "bcryptjs";
import User from "../models/userModel.js";
import Booking from "../models/bookingModel.js";
import ParkingSpot from "../models/parkingSpotModel.js";
import PromoCode from "../models/promoCodeModel.js";

/**
 * The accounts and promo codes `npm run seed` creates.
 *
 * Their passwords and codes are printed in the public README, so on a live
 * server they are a published admin login and free memberships for anyone.
 * This module finds them and shuts them down.
 */
export const SEED_ACCOUNTS = [
  { email: "iron@test.com", defaults: ["password123"] },
  { email: "diamond@test.com", defaults: ["password123"] },
  { email: "predator@test.com", defaults: ["password123"] },
  { email: "admin@scipark.app", defaults: ["admin12345"], admin: true },
];

export const SEED_PROMO_CODES = ["SCIPARK2026", "WELCOME100", "PREDATOR30", "DISCOUNT50", "FREEPARKING"];

const ACTIVE_STATUSES = ["pending", "confirmed"];
const MIN_ADMIN_PASSWORD = 12;

/** A password nobody knows: the account still exists but cannot be signed into. */
const unusableHash = () => bcrypt.hash(crypto.randomBytes(32).toString("hex"), 10);

/** Readable but strong: 20 characters from a 56-symbol alphabet (~116 bits). */
export const generatePassword = (length = 20) => {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  return Array.from({ length }, () => alphabet[crypto.randomInt(alphabet.length)]).join("");
};

/** Seed accounts whose password is still the one published in the README. */
export const findAccountsOnDefaultPasswords = async () => {
  const found = [];
  for (const entry of SEED_ACCOUNTS) {
    const user = await User.findOne({ email: entry.email }).select("+password");
    if (!user?.password) continue;
    for (const candidate of entry.defaults) {
      if (await bcrypt.compare(candidate, user.password)) {
        found.push({ entry, user });
        break;
      }
    }
  }
  return found;
};

/**
 * Lock down a live database.
 *
 * Dry run unless `apply` is true: it reports what it would do and writes
 * nothing, so it can be run first just to look.
 *
 * - Seed accounts still on their published password: the admin gets a new
 *   password (given, or generated and returned once); test users get an
 *   unusable one, lose any admin flag and have their open bookings cancelled.
 *   Every session they had is revoked via tokenVersion.
 * - Seed promo codes are deactivated.
 * - Spots marked reserved/occupied with no booking behind them are reported,
 *   and released only when `fixSpots` is also true — an operator may have set
 *   some of them by hand on purpose.
 */
export const secureSeedData = async ({ apply = false, fixSpots = false, newAdminPassword = null } = {}) => {
  if (newAdminPassword && newAdminPassword.length < MIN_ADMIN_PASSWORD) {
    throw new Error(`NEW_ADMIN_PASSWORD must be at least ${MIN_ADMIN_PASSWORD} characters`);
  }

  const report = { apply, accounts: [], adminPassword: null, promoCodes: [], strandedSpots: [], admins: [] };

  for (const { entry, user } of await findAccountsOnDefaultPasswords()) {
    const openBookings = await Booking.find({ user: user._id, status: { $in: ACTIVE_STATUSES } });
    report.accounts.push({
      email: entry.email,
      action: entry.admin ? "rotate admin password" : "disable test account",
      openBookings: openBookings.length,
    });

    if (!apply) continue;

    if (entry.admin) {
      const password = newAdminPassword || generatePassword();
      user.password = await bcrypt.hash(password, 10);
      if (!newAdminPassword) report.adminPassword = password;
    } else {
      user.password = await unusableHash();
      user.isAdmin = false;
    }
    user.tokenVersion = (user.tokenVersion || 0) + 1;
    await user.save();

    for (const booking of openBookings) {
      booking.status = "cancelled";
      booking.cancelReason = "admin_cancelled";
      booking.endTime = new Date();
      booking.qrTokenHash = null;
      await booking.save();
      await ParkingSpot.findByIdAndUpdate(booking.spot, { status: "available" });
    }
  }

  const codes = await PromoCode.find({ code: { $in: SEED_PROMO_CODES } });
  for (const code of codes) {
    report.promoCodes.push({ code: code.code, wasActive: code.isActive, usedCount: code.usedCount });
    if (apply && code.isActive) {
      code.isActive = false;
      await code.save();
    }
  }

  // Spots held with nothing behind them (worth a look after an admin login
  // was public: spot status was the one thing that login could change).
  const held = await ParkingSpot.find({ status: { $in: ["reserved", "occupied"] } }).select("spotNumber zoneName status");
  for (const spot of held) {
    const booking = await Booking.exists({ spot: spot._id, status: { $in: ACTIVE_STATUSES } });
    if (booking) continue;
    report.strandedSpots.push({ id: String(spot._id), spotNumber: spot.spotNumber, zone: spot.zoneName, status: spot.status });
    if (apply && fixSpots) await ParkingSpot.findByIdAndUpdate(spot._id, { status: "available" });
  }

  report.admins = (await User.find({ isAdmin: true }).select("email createdAt")).map((u) => ({
    email: u.email,
    createdAt: u.createdAt,
  }));

  return report;
};

/** Startup check: shout if the published logins still work on this database. */
export const warnAboutDefaultAccounts = async () => {
  const found = await findAccountsOnDefaultPasswords();
  if (found.length === 0) return;
  console.error("🚨".repeat(10));
  console.error("🚨 These accounts still use the passwords published in the README:");
  for (const { entry } of found) console.error(`🚨   ${entry.email}${entry.admin ? "  (ADMIN)" : ""}`);
  console.error("🚨 Run `npm run secure-seed` (dry run) then `npm run secure-seed -- --apply`.");
  console.error("🚨".repeat(10));
};

export default { SEED_ACCOUNTS, SEED_PROMO_CODES, findAccountsOnDefaultPasswords, secureSeedData, warnAboutDefaultAccounts, generatePassword };
