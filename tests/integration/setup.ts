import { config } from "dotenv";

config({ path: ".env.local" });
config();

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is not set; integration tests need the real database.");
}
// Integration tests must never contact Telegram.
process.env.SIMULATION_DRY_RUN = "true";
