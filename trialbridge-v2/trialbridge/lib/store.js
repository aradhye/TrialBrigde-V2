// Tiny JSON-file store (atomic writes). Swap for Supabase/Postgres in production.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const FILE = process.env.TB_DATA_FILE || path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "data", "store.json");
export const readDb = () => { try { return JSON.parse(fs.readFileSync(FILE, "utf8")); } catch { return {}; } };
export function writeDb(db) {
  fs.mkdirSync(path.dirname(FILE), { recursive: true });
  const tmp = FILE + ".tmp"; fs.writeFileSync(tmp, JSON.stringify(db)); fs.renameSync(tmp, FILE);
}
