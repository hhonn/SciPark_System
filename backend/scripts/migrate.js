/**
 * One-off data fixes for an existing database (`npm run migrate`).
 *
 *   npm run migrate              # dry run: reports what would change
 *   npm run migrate -- --apply   # writes the changes
 *
 * Safe to run more than once: each step only touches rows that still need it.
 *
 * 1. Un-escape text. The request sanitiser used to store "<" as "&lt;" and
 *    ">" as "&gt;", so a name typed "A<B" sits in the database as "A&lt;B"
 *    and the app shows the entity literally. Passwords are not touched here:
 *    they are hashes, and login repairs them (see utils/password.js).
 *
 * 2. Open the points ledger. Balances earned before the ledger existed get
 *    an "opening_balance" row, and their expiry clock starts today rather
 *    than being treated as a year stale.
 */
import mongoose from "mongoose";
import dotenv from "dotenv";
import User from "../models/userModel.js";
import Vehicle from "../models/vehicleModel.js";
import PaymentMethod from "../models/paymentMethodModel.js";
import PointTransaction from "../models/pointTransactionModel.js";

dotenv.config();

const apply = process.argv.includes("--apply");

/** Fields that hold free text a user typed. */
const TEXT_FIELDS = [
  { model: User, label: "users", fields: ["name", "username"] },
  { model: Vehicle, label: "vehicles", fields: ["licensePlate", "brand", "model", "color"] },
  { model: PaymentMethod, label: "payment methods", fields: ["cardHolderName", "bankName", "accountName", "accountNumber"] },
];

const ESCAPED = /&(lt|gt);/;
const unescape = (text) => text.replace(/&lt;/g, "<").replace(/&gt;/g, ">");

const unescapeText = async () => {
  for (const { model, label, fields } of TEXT_FIELDS) {
    const rows = await model.find({ $or: fields.map((f) => ({ [f]: ESCAPED })) }).lean();
    let changed = 0;

    for (const row of rows) {
      const update = {};
      for (const field of fields) {
        if (typeof row[field] === "string" && ESCAPED.test(row[field])) update[field] = unescape(row[field]);
      }
      if (Object.keys(update).length === 0) continue;
      changed += 1;
      if (apply) {
        try {
          await model.updateOne({ _id: row._id }, { $set: update });
        } catch (error) {
          // e.g. an un-escaped username now equal to another one.
          console.warn(`  ! ${label} ${row._id}: ${error.message}`);
        }
      }
    }

    console.log(`  ${label.padEnd(16)} ${changed} row(s) ${apply ? "restored" : "to restore"}`);
  }
};

const openPointsLedger = async () => {
  const holders = await User.find({ points: { $gt: 0 } }).select("points").lean();
  let opened = 0;

  for (const user of holders) {
    if (await PointTransaction.exists({ user: user._id })) continue;
    opened += 1;
    if (!apply) continue;
    await PointTransaction.create({
      user: user._id,
      delta: user.points,
      balanceAfter: user.points,
      reason: "opening_balance",
      note: "ยอดยกมาก่อนเริ่มบันทึกประวัติแต้ม",
    });
    await User.updateOne({ _id: user._id, pointsActivityAt: null }, { $set: { pointsActivityAt: new Date() } });
  }

  console.log(`  users with points ${opened} ledger(s) ${apply ? "opened" : "to open"}`);
};

const run = async () => {
  const uri = process.env.MONGO_URI || process.env.MONGODB_URI;
  if (!uri) {
    console.error("❌ MONGO_URI is not set.");
    process.exit(1);
  }
  await mongoose.connect(uri);

  try {
    console.log(apply ? "\n✅ APPLYING\n" : "\n🔍 DRY RUN — nothing will be changed. Re-run with --apply.\n");
    console.log("1. Text stored with &lt; / &gt;:");
    await unescapeText();
    console.log("\n2. Points ledger opening balances:");
    await openPointsLedger();
    console.log("");
  } catch (error) {
    console.error("❌", error.message);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
  }
};

run();
