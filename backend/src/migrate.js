import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { query } from "./db.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const migrationsDir = path.join(__dirname, "..", "migrations");

/**
 * Apply versioned SQL files in backend/migrations/ (NNNN_*.sql), once each.
 * Complements initDb() CREATE IF NOT EXISTS for additive schema changes.
 */
export async function runMigrations() {
  await query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  if (!fs.existsSync(migrationsDir)) return { applied: [] };

  const files = fs
    .readdirSync(migrationsDir)
    .filter((f) => /^\d{4}_.+\.sql$/i.test(f))
    .sort();

  const applied = [];
  for (const file of files) {
    const id = file.replace(/\.sql$/i, "");
    const exists = await query("SELECT 1 AS ok FROM schema_migrations WHERE id = $1", [id]);
    if (exists.rows[0]) continue;
    const sql = fs.readFileSync(path.join(migrationsDir, file), "utf8");
    await query(sql);
    await query("INSERT INTO schema_migrations (id) VALUES ($1)", [id]);
    applied.push(id);
  }
  return { applied };
}
