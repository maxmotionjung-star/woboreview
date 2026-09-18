import { Router } from "express";
import { pool } from "../db";
import {
  fetchLatestPhotoReviews,
  fetchUsefulPhotoReviews,
  fetchUsefulRankMap,
  fetchLatestRankMap,
  fetchLowRatedReviews,
  type TopReview,
} from "../lib/musinsa";
import { asyncHandler } from "../lib/asyncHandler";

export const workRouter = Router();

const ALLOWED_LIMITS = [10, 20, 30, 50];

type WorkSort = "new" | "useful" | "rating_low";

function parseSort(value: unknown): WorkSort {
  if (value === "useful") return "useful";
  if (value === "rating_low") return "rating_low";
  return "new";
}

interface WorkListItem {
  productId: number;
  reviewNo: number;
  latestRank: number | null;
  usefulRank: number | null;
  sort: WorkSort;
  nickname: string;
  grade: string | null;
  content: string;
  imageUrl: string | null;
  imageUrls: string[];
  likeCount: number;
  reviewUrl: string;
  postedAt: string | null;
}

/** 단일 상품의 사진후기 목록을 정렬 기준에 맞게 가져와 공통 형태로 정규화한다. */
async function fetchProductWorkList(
  productId: number,
  goodsNo: string,
  sort: WorkSort,
  limit: number
): Promise<WorkListItem[]> {
  let primary: TopReview[];
  let otherRankMap: Map<number, number> | null = null;

  if (sort === "new") {
    [primary, otherRankMap] = await Promise.all([
      fetchLatestPhotoReviews(goodsNo, limit),
      fetchUsefulRankMap(goodsNo, limit),
    ]);
  } else if (sort === "useful") {
    [primary, otherRankMap] = await Promise.all([
      fetchUsefulPhotoReviews(goodsNo, limit),
      fetchLatestRankMap(goodsNo, limit),
    ]);
  } else {
    // 별점 낮은순: 사진 없는 후기도 함께 노출하며, 최신/유용순 대비 순위는 표시하지 않는다.
    primary = await fetchLowRatedReviews(goodsNo, limit);
  }

  return primary.map((r) => ({
    productId,
    reviewNo: r.reviewNo,
    latestRank: sort === "new" ? r.rank : sort === "useful" ? otherRankMap?.get(r.reviewNo) ?? null : null,
    usefulRank: sort === "useful" ? r.rank : sort === "new" ? otherRankMap?.get(r.reviewNo) ?? null : null,
    sort,
    nickname: r.nickname,
    grade: r.grade,
    content: r.content,
    imageUrl: r.imageUrl,
    imageUrls: r.imageUrls,
    likeCount: r.likeCount,
    reviewUrl: r.reviewUrl,
    postedAt: r.postedAt,
  }));
}

/** "전체 보기": 등록된 모든 상품의 사진후기를 각자 기준으로 가져온 뒤 하나로 합쳐 정렬한다. */
workRouter.get(
  "/all",
  asyncHandler(async (req, res) => {
    const requestedLimit = Number(req.query.limit);
    const limit = ALLOWED_LIMITS.includes(requestedLimit) ? requestedLimit : 20;
    const sort = parseSort(req.query.sort);

    const { rows: products } = await pool.query<{
      id: number;
      goods_no: string;
      name: string | null;
      thumbnail_url: string | null;
    }>("SELECT id, goods_no, name, thumbnail_url FROM products WHERE active = true ORDER BY sort_order, id");

    const perProduct = await Promise.all(
      products.map(async (p) => {
        const items = await fetchProductWorkList(p.id, p.goods_no, sort, limit);
        return items.map((item) => ({
          ...item,
          productName: p.name ?? `상품 ${p.goods_no}`,
          productThumbnailUrl: p.thumbnail_url,
        }));
      })
    );
    const merged = perProduct.flat();

    if (sort === "new") {
      merged.sort((a, b) => new Date(b.postedAt ?? 0).getTime() - new Date(a.postedAt ?? 0).getTime());
    } else if (sort === "useful") {
      merged.sort((a, b) => (b.likeCount ?? 0) - (a.likeCount ?? 0));
    } else {
      merged.sort((a, b) => (Number(a.grade) || 0) - (Number(b.grade) || 0));
    }

    const { rows: flagRows } = await pool.query<{ product_id: number; review_no: string }>(
      "SELECT product_id, review_no FROM review_flags"
    );
    const flaggedSet = new Set(flagRows.map((r) => `${r.product_id}:${r.review_no}`));

    const list = merged.map((item) => ({
      ...item,
      flagged: flaggedSet.has(`${item.productId}:${item.reviewNo}`),
    }));

    res.json(list);
  })
);

workRouter.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const requestedLimit = Number(req.query.limit);
    const limit = ALLOWED_LIMITS.includes(requestedLimit) ? requestedLimit : 20;
    const sort = parseSort(req.query.sort);

    const { rows: productRows } = await pool.query<{ goods_no: string }>(
      "SELECT goods_no FROM products WHERE id = $1",
      [id]
    );
    const product = productRows[0];
    if (!product) {
      res.status(404).json({ error: "상품을 찾을 수 없습니다." });
      return;
    }

    const [items, flaggedRows] = await Promise.all([
      fetchProductWorkList(id, product.goods_no, sort, limit),
      pool.query<{ review_no: string }>("SELECT review_no FROM review_flags WHERE product_id = $1", [id]),
    ]);
    const flaggedSet = new Set(flaggedRows.rows.map((r) => Number(r.review_no)));

    const list = items.map((item) => ({
      ...item,
      flagged: flaggedSet.has(item.reviewNo),
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
