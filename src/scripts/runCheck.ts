import "dotenv/config";
import { pool } from "../db";
import { checkAllProducts } from "../lib/checkProducts";

async function main() {
  console.log(`[${new Date().toISOString()}] 무신사 리뷰 TOP10 체크 시작`);
  await checkAllProducts();
  console.log(`[${new Date().toISOString()}] 체크 완료`);
  await pool.end();
}

main().catch(async (err) => {
  console.error("체크 실행 중 오류:", err);
  await pool.end();
  process.exit(1);
});
