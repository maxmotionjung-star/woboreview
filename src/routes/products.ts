import { Router } from "express";
import { pool } from "../db";
import { parseGoodsNo } from "../lib/musinsa";
import { asyncHandler } from "../lib/asyncHandler";

export const productsRouter = Router();

productsRouter.get(
  "/",
  asyncHandler(async (_req, res) => {
    const { rows } = await pool.query(
      "SELECT id, goods_no, name, url, active, created_at FROM products ORDER BY id"
    );
    res.json(rows);
  })
);

productsRouter.post(
  "/",
  asyncHandler(async (req, res) => {
    const { url, name } = req.body ?? {};
    if (typeof url !== "string" || !url.trim()) {
      res.status(400).json({ error: "url이 필요합니다." });
      return;
    }

    const goodsNo = parseGoodsNo(url);
    if (!goodsNo) {
      res.status(400).json({ error: "URL에서 상품코드를 찾을 수 없습니다. 무신사 상품 URL을 확인해주세요." });
      return;
    }

    try {
      const { rows } = await pool.query(
        `INSERT INTO products (goods_no, name, url)
         VALUES ($1, $2, $3)
         RETURNING id, goods_no, name, url, active, created_at`,
        [goodsNo, typeof name === "string" && name.trim() ? name.trim() : null, url.trim()]
      );
      res.status(201).json(rows[0]);
    } catch (err) {
      if (err instanceof Error && "code" in err && (err as { code?: string }).code === "23505") {
        res.status(409).json({ error: "이미 등록된 상품입니다." });
        return;
      }
      throw err;
    }
  })
);

productsRouter.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    await pool.query("DELETE FROM products WHERE id = $1", [id]);
    res.json({ ok: true });
  })
);

productsRouter.get(
  "/:id/top10",
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const { rows } = await pool.query(
      `SELECT review_no, rank, nickname, grade, content, image_url, like_count, captured_at,
              'https://www.musinsa.com/review/' || review_no AS review_url
       FROM review_snapshots
       WHERE product_id = $1
         AND captured_at = (SELECT MAX(captured_at) FROM review_snapshots WHERE product_id = $1)
       ORDER BY rank`,
      [id]
    );
    res.json(rows);
  })
);
