import { Router } from "express";
import { pool } from "../db";
import {
  fetchLatestPhotoReviews,
  fetchUsefulPhotoReviews,
  fetchUsefulRankMap,
  fetchLatestRankMap,
} from "../lib/musinsa";
import { asyncHandler } from "../lib/asyncHandler";

export const workRouter = Router();

const ALLOWED_LIMITS = [10, 20, 30, 50];

workRouter.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const requestedLimit = Number(req.query.limit);
    const limit = ALLOWED_LIMITS.includes(requestedLimit) ? requestedLimit : 20;
    const sort = req.query.sort === "useful" ? "useful" : "new";

    const { rows: productRows } = await pool.query<{ goods_no: string }>(
      "SELECT goods_no FROM products WHERE id = $1",
      [id]
    );
    const product = productRows[0];
    if (!product) {
      res.status(404).json({ error: "상품을 찾을 수 없습니다." });
      return;
    }

    const [primary, otherRankMap, flaggedRows] = await Promise.all([
      sort === "new"
        ? fetchLatestPhotoReviews(product.goods_no, limit)
        : fetchUsefulPhotoReviews(product.goods_no, limit),
      sort === "new"
        ? fetchUsefulRankMap(product.goods_no, limit)
        : fetchLatestRankMap(product.goods_no, limit),
      pool.query<{ review_no: string }>(
        "SELECT review_no FROM review_flags WHERE product_id = $1",
        [id]
      ),
    ]);

    const flaggedSet = new Set(flaggedRows.rows.map((r) => Number(r.review_no)));

    const list = primary.map((r) => ({
      reviewNo: r.reviewNo,
      // 현재 정렬 기준(sort)의 순위는 목록 위치(r.rank)이고, 반대 기준의 순위는 매핑에서 조회한다.
      latestRank: sort === "new" ? r.rank : otherRankMap.get(r.reviewNo) ?? null,
      usefulRank: sort === "new" ? otherRankMap.get(r.reviewNo) ?? null : r.rank,
      sort,
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
