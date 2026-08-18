import { Router } from "express";
import { pool } from "../db";
import { asyncHandler } from "../lib/asyncHandler";

export const changesRouter = Router();

changesRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const requestedDays = Number(req.query.days);
    const days = Number.isFinite(requestedDays) && requestedDays > 0 ? Math.min(requestedDays, 30) : 30;

    const { rows } = await pool.query(
      `SELECT rc.id, rc.product_id, p.name AS product_name, p.goods_no,
              rc.review_no, rc.change_type, rc.old_rank, rc.new_rank,
              rc.nickname, rc.grade, rc.detected_at
       FROM rank_changes rc
       JOIN products p ON p.id = rc.product_id
       WHERE rc.detected_at >= now() - ($1 || ' days')::interval
       ORDER BY rc.detected_at DESC
       LIMIT 500`,
      [days]
    );
    res.json(rows);
  })
);
