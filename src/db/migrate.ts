import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { pool } from "./index";

async function migrate() {
  const schemaPath = path.join(__dirname, "..", "..", "db", "schema.sql");
  const sql = fs.readFileSync(schemaPath, "utf-8");
  await pool.query(sql);
  console.log("마이그레이션 완료: db/schema.sql 적용됨");
  await pool.end();
}

migrate().catch((err) => {
  console.error("마이그레이션 실패:", err);
  process.exit(1);
});
