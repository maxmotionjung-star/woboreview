import { Router } from "express";
import { pool } from "../db";
import { asyncHandler } from "../lib/asyncHandler";

export const summaryRouter = Router();

summaryRouter.get(
  "/",
  asyncHandler(async (_req, res) => {
    const [productCountResult, changeCountsResult, lastCheckedResult] = await Promise.all([
      pool.query<{ count: string }>("SELECT count(*) FROM products WHERE active = true"),
      pool.query<{ last_24h: string; last_7d: string }>(
        `SELECT
           count(*) FILTER (WHERE detected_at >= now() - interval '1 day') AS last_24h,
           count(*) FILTER (WHERE detected_at >= now() - interval '7 days') AS last_7d
         FROM rank_changes`
      ),
      pool.query<{ max: Date | null }>("SELECT max(captured_at) FROM review_snapshots"),
    ]);

    res.json({
      productCount: Number(productCountResult.rows[0].count),
      changesLast24h: Number(changeCountsResult.rows[0].last_24h),
      changesLast7d: Number(changeCountsResult.rows[0].last_7d),
      lastCheckedAt: lastCheckedResult.rows[0].max,
    });
  })
);
