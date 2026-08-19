import { Router } from "express";
import { pool } from "../db";
import { fetchLatestPhotoReviews, fetchUsefulRankMap } from "../lib/musinsa";
import { asyncHandler } from "../lib/asyncHandler";

export const workRouter = Router();

const ALLOWED_LIMITS = [10, 20, 30, 50];

workRouter.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const requestedLimit = Number(req.query.limit);
    const limit = ALLOWED_LIMITS.includes(requestedLimit) ? requestedLimit : 20;

    const { rows: productRows } = await pool.query<{ goods_no: string }>(
      "SELECT goods_no FROM products WHERE id = $1",
      [id]
    );
    const product = productRows[0];
    if (!product) {
      res.status(404).json({ error: "상품을 찾을 수 없습니다." });
      return;
    }

    const [latest, usefulRankMap, flaggedRows] = await Promise.all([
      fetchLatestPhotoReviews(product.goods_no, limit),
      fetchUsefulRankMap(product.goods_no, limit),
      pool.query<{ review_no: string }>(
        "SELECT review_no FROM review_flags WHERE product_id = $1",
        [id]
      ),
    ]);

    const flaggedSet = new Set(flaggedRows.rows.map((r) => Number(r.review_no)));

    const list = latest.map((r) => ({
      reviewNo: r.reviewNo,
      latestRank: r.rank,
      usefulRank: usefulRankMap.get(r.reviewNo) ?? null,
      nickname: r.nickname,
      grade: r.grade,
      content: r.content,
      imageUrl: r.imageUrl,
      imageUrls: r.imageUrls,
      likeCount: r.likeCount,
      reviewUrl: r.reviewUrl,
      postedAt: r.postedAt,
      flagged: flaggedSet.has(r.reviewNo),
    }));

    res.json(list);
  })
);

workRouter.post(
  "/:id/flags",
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const reviewNo = Number(req.body?.reviewNo);
    if (!reviewNo) {
      res.status(400).json({ error: "reviewNo가 필요합니다." });
      return;
    }
    await pool.query(
      "INSERT INTO review_flags (product_id, review_no) VALUES ($1, $2) ON CONFLICT DO NOTHING",
      [id, reviewNo]
    );
    res.json({ ok: true });
  })
);

workRouter.delete(
  "/:id/flags/:reviewNo",
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const reviewNo = Number(req.params.reviewNo);
    await pool.query(
      "DELETE FROM review_flags WHERE product_id = $1 AND review_no = $2",
      [id, reviewNo]
    );
    res.json({ ok: true });
  })
);
