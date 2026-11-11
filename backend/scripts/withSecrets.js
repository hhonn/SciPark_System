/**
 * Run a maintenance script with the production secrets loaded.
 *
 *   node scripts/withSecrets.js scripts/migrate.js --apply
 *   node scripts/withSecrets.js scripts/secureSeed.js
 *   node scripts/withSecrets.js scripts/setRole.js staff someone@kmitl.ac.th
 *
 * On an app instance (reached through SSM Session Manager — no SSH, no open
 * port) the scripts need MONGO_URI, which only exists after the database
 * secret is read. This loads it exactly the way server.js does, then runs the
 * script with the remaining arguments.
 */
import "dotenv/config";
import path from "path";
import { pathToFileURL } from "url";
import { loadSecrets } from "../config/secrets.js";

const [script, ...args] = process.argv.slice(2);
if (!script) {
  console.error("Usage: node scripts/withSecrets.js <script.js> [args...]");
  process.exit(1);
}

await loadSecrets();
// The script reads its own arguments from process.argv.
process.argv = [process.argv[0], path.resolve(script), ...args];
await import(pathToFileURL(path.resolve(script)).href);
