/**
 * Lock down the seed accounts and promo codes on a live database.
 *
 *   npm run secure-seed                         # dry run: report only, writes nothing
 *   npm run secure-seed -- --apply              # do it
 *   npm run secure-seed -- --apply --fix-spots  # also release spots held with no booking
 *
 * The new admin password is printed once. To choose it yourself instead:
 *   NEW_ADMIN_PASSWORD='...' npm run secure-seed -- --apply
 *
 * Old sessions: this revokes them for servers running the current code
 * (tokenVersion). A server still on the old code ignores that — rotate
 * JWT_SECRET in .env and restart to end every session there.
 */
import mongoose from "mongoose";
import dotenv from "dotenv";
import { secureSeedData } from "../utils/seedAccounts.js";

dotenv.config();

const apply = process.argv.includes("--apply");
const fixSpots = process.argv.includes("--fix-spots");

const run = async () => {
  const uri = process.env.MONGO_URI || process.env.MONGODB_URI;
  if (!uri) {
    console.error("❌ MONGO_URI is not set.");
    process.exit(1);
  }

  await mongoose.connect(uri);

  try {
    const report = await secureSeedData({
      apply,
      fixSpots,
      newAdminPassword: process.env.NEW_ADMIN_PASSWORD || null,
    });

    console.log(apply ? "\n✅ APPLIED\n" : "\n🔍 DRY RUN — nothing was changed. Re-run with --apply.\n");

    console.log("Seed accounts still on the published password:");
    if (report.accounts.length === 0) console.log("  (none)");
    for (const a of report.accounts) {
      console.log(`  ${a.email.padEnd(22)} → ${a.action}${a.openBookings ? ` (cancels ${a.openBookings} open booking)` : ""}`);
    }

    if (report.adminPassword) {
      console.log(`\n🔑 New password for admin@scipark.app (shown once, store it now):\n   ${report.adminPassword}\n`);
    }

    console.log("\nSeed promo codes:");
    if (report.promoCodes.length === 0) console.log("  (none)");
    for (const p of report.promoCodes) {
      console.log(`  ${p.code.padEnd(12)} used ${p.usedCount}×  ${p.wasActive ? (apply ? "→ deactivated" : "→ will deactivate") : "(already inactive)"}`);
    }

    console.log("\nSpots reserved/occupied with no active booking:");
    if (report.strandedSpots.length === 0) console.log("  (none)");
    for (const s of report.strandedSpots) {
      console.log(`  ${s.zone || "?"} ${s.spotNumber} (${s.status})${apply && fixSpots ? " → released" : ""}`);
    }
    if (report.strandedSpots.length && !fixSpots) console.log("  add --fix-spots to release them");

    console.log("\nAccounts with admin rights (check every one is expected):");
    for (const a of report.admins) console.log(`  ${a.email}  created ${new Date(a.createdAt).toISOString().slice(0, 10)}`);
    console.log("");
  } catch (error) {
    console.error("❌", error.message);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
  }
};

run();
