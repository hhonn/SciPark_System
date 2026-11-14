// One-shot auto-cancel sweep (`npm run auto-cancel`).
// The server already runs this every minute; this entry point exists for
// manual testing and for hosts that prefer an external cron.
import mongoose from "mongoose";
import dotenv from "dotenv";
import { autoCancelExpiredBookings } from "../services/autoCancelService.js";

dotenv.config();

const run = async () => {
  if (!process.env.MONGO_URI) {
    console.error("❌ MONGO_URI is not set.");
    process.exit(1);
  }

  await mongoose.connect(process.env.MONGO_URI);
  console.log("✅ MongoDB Connected");

  try {
    const result = await autoCancelExpiredBookings();
    console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    console.error("❌ Auto-cancel failed:", error.message);
    process.exitCode = 1;
  } finally {
    await mongoose.connection.close();
  }
};

run();
