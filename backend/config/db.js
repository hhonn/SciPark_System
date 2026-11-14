import mongoose from "mongoose";

// Connect to MongoDB.
//
// Both spellings of the variable name are accepted, because the code and the
// env templates used to disagree about which one to read.
const connectDB = async () => {
  const uri = process.env.MONGO_URI || process.env.MONGODB_URI;

  if (!uri) {
    console.error("❌ MONGO_URI is not set. Copy backend/.env.example to backend/.env first.");
    process.exit(1);
  }

  try {
    const conn = await mongoose.connect(uri, {
      // Fail fast instead of buffering queries for 30s behind a dead connection.
      serverSelectionTimeoutMS: 10000,
    });
    console.log(`✅ MongoDB Connected: ${conn.connection.host}`);
  } catch (error) {
    console.error("❌ MongoDB connection error:", error.message);
    process.exit(1);
  }
};

// Surface connection drops rather than letting requests hang silently.
mongoose.connection.on("disconnected", () => console.warn("⚠️  MongoDB disconnected"));
mongoose.connection.on("reconnected", () => console.log("✅ MongoDB reconnected"));

export default connectDB;
