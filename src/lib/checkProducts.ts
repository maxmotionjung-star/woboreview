import { pool } from "../db";
import { fetchTop10PhotoReviews, type TopReview } from "./musinsa";
import { diffTop10, type RankChangeEvent } from "./diff";
import { notifyRankChanges } from "./telegram";

interface ProductRow {
  id: number;
  goods_no: string;
  name: string | null;
  url: string;
}

async function getActiveProducts(): Promise<ProductRow[]> {
  const { rows } = await pool.query<ProductRow>(
    "SELECT id, goods_no, name, url FROM products WHERE active = true ORDER BY id"
  );
  return rows;
}

async function getProductById(productId: number): Promise<ProductRow | null> {
  const { rows } = await pool.query<ProductRow>(
    "SELECT id, goods_no, name, url FROM products WHERE id = $1",
    [productId]
  );
  return rows[0] ?? null;
}

async function getLatestSnapshot(productId: number): Promise<TopReview[]> {
  const { rows } = await pool.query<{
    review_no: string;
    rank: number;
    nickname: string;
    grade: string | null;
    content: string | null;
    image_url: string | null;
    image_urls: string[] | null;
    like_count: number | null;
    review_posted_at: Date | null;
  }>(
    `SELECT review_no, rank, nickname, grade, content, image_url, image_urls, like_count, review_posted_at
     FROM review_snapshots
     WHERE product_id = $1
       AND captured_at = (SELECT MAX(captured_at) FROM review_snapshots WHERE product_id = $1)
     ORDER BY rank`,
    [productId]
  );

  return rows.map((r) => ({
    reviewNo: Number(r.review_no),
    rank: r.rank,
    nickname: r.nickname,
    grade: r.grade,
    content: r.content ?? "",
    imageUrl: r.image_url,
    imageUrls: r.image_urls ?? (r.image_url ? [r.image_url] : []),
    likeCount: r.like_count ?? 0,
    reviewUrl: `https://www.musinsa.com/review/${r.review_no}`,
    postedAt: r.review_posted_at ? r.review_posted_at.toISOString() : null,
    productThumbnailUrl: null,
  }));
}

async function saveSnapshot(productId: number, reviews: TopReview[], capturedAt: Date): Promise<void> {
  if (reviews.length === 0) return;

  const values: unknown[] = [];
  const placeholders = reviews.map((r, i) => {
    const base = i * 11;
    values.push(
      productId,
      r.reviewNo,
      r.rank,
      r.nickname,
      r.grade,
      r.content,
      r.imageUrl,
      r.imageUrls,
      r.likeCount,
      r.postedAt,
      capturedAt
    );
    return `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6}, $${base + 7}, $${base + 8}, $${base + 9}, $${base + 10}, $${base + 11})`;
  });

  await pool.query(
    `INSERT INTO review_snapshots
       (product_id, review_no, rank, nickname, grade, content, image_url, image_urls, like_count, review_posted_at, captured_at)
     VALUES ${placeholders.join(", ")}`,
    values
  );

  // diff 계산에는 최신 스냅샷만 있으면 되지만, 대시보드의 "최근 7일 기준" 순위 등락 표시를 위해
  // 최근 7일치 스냅샷은 남겨두고 그보다 오래된 것만 정리한다.
  await pool.query(
    "DELETE FROM review_snapshots WHERE product_id = $1 AND captured_at < now() - interval '7 days'",
    [productId]
  );
}

async function saveRankChanges(
  productId: number,
  events: RankChangeEvent[],
  detectedAt: Date
): Promise<void> {
  if (events.length === 0) return;

  const values: unknown[] = [];
  const placeholders = events.map((e, i) => {
    const base = i * 11;
    values.push(
      productId,
      e.reviewNo,
      e.changeType,
      e.oldRank,
      e.newRank,
      e.nickname,
      e.grade,
      e.imageUrl,
      e.imageUrls,
      e.likeCount,
      detectedAt
    );
    return `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6}, $${base + 7}, $${base + 8}, $${base + 9}, $${base + 10}, $${base + 11})`;
  });

  await pool.query(
    `INSERT INTO rank_changes
       (product_id, review_no, change_type, old_rank, new_rank, nickname, grade, image_url, image_urls, like_count, detected_at)
     VALUES ${placeholders.join(", ")}`,
    values
  );
}

async function checkProduct(product: ProductRow): Promise<RankChangeEvent[]> {
  const current = await fetchTop10PhotoReviews(product.goods_no);
  const previous = await getLatestSnapshot(product.id);
  const capturedAt = new Date();

  const thumbnailUrl = current[0]?.productThumbnailUrl;
  if (thumbnailUrl) {
    await pool.query("UPDATE products SET thumbnail_url = $1 WHERE id = $2", [
      thumbnailUrl,
      product.id,
    ]);
  }

  let events: RankChangeEvent[] = [];

  // 최초 체크(이전 스냅샷 없음)는 비교 기준이 없으므로 알림을 보내지 않고 기준선만 저장한다.
  if (previous.length > 0) {
    events = diffTop10(previous, current);
    if (events.length > 0) {
      await saveRankChanges(product.id, events, capturedAt);
      const label = product.name ?? `상품 ${product.goods_no}`;
      await notifyRankChanges(label, events);
    }
  }

  await saveSnapshot(product.id, current, capturedAt);
  return events;
}

async function cleanupOldChanges(): Promise<void> {
  await pool.query("DELETE FROM rank_changes WHERE detected_at < now() - interval '30 days'");
}

/** Cron Job / 수동 트리거에서 사용하는 전체 상품 체크 진입점 */
export async function checkAllProducts(): Promise<void> {
  const products = await getActiveProducts();
  for (const product of products) {
    try {
      await checkProduct(product);
    } catch (err) {
      console.error(`상품 체크 실패 (goodsNo=${product.goods_no}):`, err);
    }
  }
  await cleanupOldChanges();
}

/** 대시보드의 "지금 체크" 버튼 등에서 특정 상품 하나만 즉시 체크할 때 사용 */
export async function checkSingleProduct(productId: number): Promise<RankChangeEvent[]> {
  const product = await getProductById(productId);
  if (!product) {
    throw new Error(`상품을 찾을 수 없습니다: id=${productId}`);
  }
  return checkProduct(product);
}
