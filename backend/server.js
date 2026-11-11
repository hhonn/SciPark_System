/**
 * Production entry point (`npm start`).
 *
 * Secrets have to be in process.env before any module reads them — and ES
 * module imports run before the importing file's code, so index.js cannot
 * load them itself (config/nodemailer.js, for one, reads the mail password the
 * moment it is imported). This file fetches them first, then starts the app.
 */
import "dotenv/config";
import { loadSecrets } from "./config/secrets.js";

try {
  const { loaded, source } = await loadSecrets();
  if (source !== "env") console.log(`🔐 Loaded ${loaded} setting(s) from ${source}`);
} catch (error) {
  console.error(`❌ Could not load secrets: ${error.message}`);
  process.exit(1);
}

await import("./index.js");
