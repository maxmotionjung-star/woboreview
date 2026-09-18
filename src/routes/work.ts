import { Router } from "express";
import { pool } from "../db";
import {
  fetchLatestPhotoReviews,
  fetchUsefulPhotoReviews,
  fetchUsefulRankMap,
  fetchLatestRankMap,
  fetchLowRatedReviews,
  fetchBrandGoodsList,
  type TopReview,
  type BrandGoodsItem,
} from "../lib/musinsa";
import { asyncHandler } from "../lib/asyncHandler";

export const workRouter = Router();

const ALLOWED_LIMITS = [10, 20, 30, 50];

// "전체 보기"의 대상 브랜드. 상품관리 등록 여부와 무관하게 매번 무신사에서 실시간 조회한다.
const ALL_VIEW_BRAND = "workonbodyoff";
const ALL_VIEW_GENDER = "M";

type WorkSort = "new" | "useful" | "rating_low";

function parseSort(value: unknown): WorkSort {
  if (value === "useful") return "useful";
  if (value === "rating_low") return "rating_low";
  return "new";
}

interface WorkListItem {
  goodsNo: string;
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

/** 단일 상품(goodsNo)의 사진후기 목록을 정렬 기준에 맞게 가져와 공통 형태로 정규화한다. */
async function fetchProductWorkList(goodsNo: string, sort: WorkSort, limit: number): Promise<WorkListItem[]> {
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
    goodsNo,
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

/** 최대 concurrency개씩만 동시 실행하며 items를 순회한다 (무신사에 순간 부하를 주지 않기 위함). */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * 최대 concurrency개씩만 동시 실행하며 items를 순회한다. 무신사가 짧은 시간에 몰리는 요청을
 * 429로 차단하는 것을 확인했기 때문에, 동시 실행 수를 낮게 유지하고 각 호출 사이에
 * 약간의 간격(staggerMs)을 둬 순간 부하를 추가로 완화한다.
 */
async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<R>,
  staggerMs = 0
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;
  async function worker() {
    while (cursor < items.length) {
      const current = cursor++;
      if (staggerMs > 0 && current > 0) await sleep(staggerMs);
      results[current] = await fn(items[current]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, () => worker()));
  return results;
}

// 브랜드 상품 목록(347개 등)은 자주 바뀌지 않으므로 캐시해 매 요청마다 다시 훑지 않는다.
const BRAND_LIST_CACHE_TTL_MS = 60 * 60 * 1000;
let brandGoodsCache: { items: BrandGoodsItem[]; expiresAt: number } | null = null;

async function getBrandGoodsListCached(): Promise<BrandGoodsItem[]> {
  const now = Date.now();
  if (brandGoodsCache && brandGoodsCache.expiresAt > now) {
    return brandGoodsCache.items;
  }
  const items = await fetchBrandGoodsList(ALL_VIEW_BRAND, ALL_VIEW_GENDER);
  brandGoodsCache = { items, expiresAt: now + BRAND_LIST_CACHE_TTL_MS };
  return items;
}

// 상품 수백 개 × 정렬별 리뷰 조회는 무신사 API를 순차적으로 오래 두드려야 해서 요청-응답 안에서
// 끝내기엔 너무 느리고(수 분 이상), 무신사가 순간적으로 429(레이트리밋)를 걸기도 한다. 그래서
// (정렬, 개수) 조합별로 결과를 캐시해두고, 캐시가 없으면 즉시 "준비 중" 응답을 보낸 뒤 백그라운드
// 에서 조용히 채워 넣는 stale-while-revalidate 방식을 쓴다 — 사용자를 수 분씩 기다리게 하지 않는다.
type MergedItem = WorkListItem & { productName: string; productThumbnailUrl: string | null };
const ALL_VIEW_CACHE_TTL_MS = 20 * 60 * 1000;

interface AllViewEntry {
  data: MergedItem[] | null;
  expiresAt: number;
  building: boolean;
}
const allViewCache = new Map<string, AllViewEntry>();

function ensureAllViewFresh(cacheKey: string, sort: WorkSort, limit: number): AllViewEntry {
  let entry = allViewCache.get(cacheKey);
  if (!entry) {
    entry = { data: null, expiresAt: 0, building: false };
    allViewCache.set(cacheKey, entry);
  }
  if (entry.building || entry.expiresAt > Date.now()) {
    return entry;
  }

  entry.building = true;
  (async () => {
    try {
      const brandGoods = await getBrandGoodsListCached();
      // 동시성을 낮게, 상품 사이에 간격을 둬 무신사에 순간 부하를 주지 않는다. 그래도 429를
      // 만나면 musinsa.ts의 회로 차단기가 남은 상품 조회를 곧바로 건너뛰게 해준다.
      const perProduct = await mapWithConcurrency(
        brandGoods,
        2,
        async (g) => {
          try {
            const items = await fetchProductWorkList(g.goodsNo, sort, limit);
            return items.map((item) => ({ ...item, productName: g.name, productThumbnailUrl: g.thumbnailUrl }));
          } catch {
            // 개별 상품 조회 실패(레이트리밋 포함)는 건너뛰고 나머지 상품으로 계속 진행한다.
            return [];
          }
        },
        400
      );
      const merged = perProduct.flat();

      if (sort === "new") {
        merged.sort((a, b) => new Date(b.postedAt ?? 0).getTime() - new Date(a.postedAt ?? 0).getTime());
      } else if (sort === "useful") {
        merged.sort((a, b) => (b.likeCount ?? 0) - (a.likeCount ?? 0));
      } else {
        merged.sort((a, b) => (Number(a.grade) || 0) - (Number(b.grade) || 0));
      }

      entry!.data = merged;
      entry!.expiresAt = Date.now() + ALL_VIEW_CACHE_TTL_MS;
    } catch (err) {
      console.error("WORK 전체 보기 갱신 실패:", err);
    } finally {
      entry!.building = false;
    }
  })();

  return entry;
}

/** "전체 보기": 무신사 워크온바디오프 브랜드에 실제 등록된 모든 상품을 실시간으로 조회해 하나로 합친다. */
workRouter.get(
  "/all",
  asyncHandler(async (req, res) => {
    const requestedLimit = Number(req.query.limit);
    const limit = ALLOWED_LIMITS.includes(requestedLimit) ? requestedLimit : 20;
    const sort = parseSort(req.query.sort);
    const cacheKey = `${sort}:${limit}`;

    const entry = ensureAllViewFresh(cacheKey, sort, limit);

    if (!entry.data) {
      // 아직 한 번도 채워진 적 없음 — 백그라운드에서 조회를 시작해둔 상태로 즉시 응답한다.
      res.json({ building: true, list: [] });
      return;
    }

    const { rows: flagRows } = await pool.query<{ goods_no: string; review_no: string }>(
      "SELECT goods_no, review_no FROM review_flags"
    );
    const flaggedSet = new Set(flagRows.map((r) => `${r.goods_no}:${r.review_no}`));

    const list = entry.data.map((item) => ({
      ...item,
      flagged: flaggedSet.has(`${item.goodsNo}:${item.reviewNo}`),
    }));

    res.json({ building: entry.building, list });
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
      fetchProductWorkList(product.goods_no, sort, limit),
      pool.query<{ review_no: string }>("SELECT review_no FROM review_flags WHERE goods_no = $1", [
        product.goods_no,
      ]),
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
  "/flags",
  asyncHandler(async (req, res) => {
    const goodsNo = typeof req.body?.goodsNo === "string" || typeof req.body?.goodsNo === "number"
      ? String(req.body.goodsNo)
      : "";
    const reviewNo = Number(req.body?.reviewNo);
    if (!goodsNo || !reviewNo) {
      res.status(400).json({ error: "goodsNo와 reviewNo가 필요합니다." });
      return;
    }
    await pool.query(
      "INSERT INTO review_flags (goods_no, review_no) VALUES ($1, $2) ON CONFLICT (goods_no, review_no) DO NOTHING",
      [goodsNo, reviewNo]
    );
    res.json({ ok: true });
  })
);

workRouter.delete(
  "/flags/:goodsNo/:reviewNo",
  asyncHandler(async (req, res) => {
    const { goodsNo, reviewNo } = req.params;
    await pool.query("DELETE FROM review_flags WHERE goods_no = $1 AND review_no = $2", [
      goodsNo,
      Number(reviewNo),
    ]);
    res.json({ ok: true });
  })
);
