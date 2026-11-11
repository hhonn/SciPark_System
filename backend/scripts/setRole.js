/**
 * Grant or revoke the parking-staff role.
 *
 *   npm run set-role -- staff   someone@kmitl.ac.th   # may scan QR codes at the lot
 *   npm run set-role -- unstaff someone@kmitl.ac.th
 *   npm run set-role -- list                          # who has staff/admin rights
 *
 * The account must already exist (register it in the app first). Admins can
 * scan without the staff role.
 */
import mongoose from "mongoose";
import dotenv from "dotenv";
import User from "../models/userModel.js";

dotenv.config();

const [action, email] = process.argv.slice(2);

const usage = () => {
  console.log("Usage: npm run set-role -- <staff|unstaff|list> [email]");
  process.exit(1);
};

const run = async () => {
  if (!["staff", "unstaff", "list"].includes(action)) usage();
  if (action !== "list" && !email) usage();

  const uri = process.env.MONGO_URI || process.env.MONGODB_URI;
  if (!uri) {
    console.error("❌ MONGO_URI is not set.");
    process.exit(1);
  }
  await mongoose.connect(uri);

  try {
    if (action === "list") {
      const people = await User.find({ $or: [{ isStaff: true }, { isAdmin: true }] }).select("email isStaff isAdmin");
      if (people.length === 0) console.log("(no staff or admins)");
      for (const p of people) {
        console.log(`${p.email.padEnd(32)} ${[p.isAdmin && "admin", p.isStaff && "staff"].filter(Boolean).join(", ")}`);
      }
      return;
    }

    const user = await User.findOneAndUpdate(
      { email: email.trim().toLowerCase() },
      { isStaff: action === "staff" },
      { new: true }
    );
    if (!user) {
      console.error(`❌ No account with email ${email}. Register it in the app first.`);
      process.exitCode = 1;
      return;
    }
    console.log(action === "staff"
      ? `✅ ${user.email} is now parking staff (can scan QR codes). They must log in again to see the scanner.`
      : `✅ ${user.email} is no longer parking staff.`);
  } finally {
    await mongoose.disconnect();
  }
};

run().catch((error) => {
  console.error("❌", error.message);
  process.exit(1);
});
