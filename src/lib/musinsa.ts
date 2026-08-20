export interface TopReview {
  reviewNo: number;
  rank: number;
  nickname: string;
  grade: string | null;
  content: string;
  imageUrl: string | null;
  imageUrls: string[];
  likeCount: number;
  reviewUrl: string;
  postedAt: string | null;
  productThumbnailUrl: string | null;
}

const IMAGE_CDN_BASE = "https://image.msscdn.net";
const MAX_PAGE_SIZE = 20; // 무신사 API 제약: pageSize는 20 이하만 허용됨

/**
 * 상품 URL 또는 순수 상품코드 문자열에서 무신사 goodsNo를 추출한다.
 * 지원 형태: https://www.musinsa.com/products/5717317, .../products/5717317?...,
 *           app.musinsa.com/goods/5717317, 순수 숫자 문자열 "5717317"
 */
export function parseGoodsNo(input: string): string | null {
  const trimmed = input.trim();
  if (/^\d+$/.test(trimmed)) return trimmed;

  const match = trimmed.match(/\/(?:products|goods)\/(\d+)/);
  if (match) return match[1];

  return null;
}

interface MusinsaReviewListResponse {
  data?: {
    list?: Array<{
      no: number;
      content: string;
      grade: string | null;
      images?: Array<{ imageUrl: string }>;
      userProfileInfo?: { userNickName?: string };
      likeCount?: number;
      createDate?: string;
      goodsThumbnailImageUrl?: string;
    }>;
  };
}

type MusinsaSort = "up_cnt_desc" | "new" | "goods_est_asc";

async function fetchReviewPage(
  goodsNo: string,
  sort: MusinsaSort,
  page: number,
  pageSize: number,
  hasPhoto: boolean
): Promise<Omit<TopReview, "rank">[]> {
  const url =
    `https://goods.musinsa.com/api2/review/v1/view/list` +
    `?page=${page}&pageSize=${pageSize}&goodsNo=${encodeURIComponent(goodsNo)}` +
    `&sort=${sort}&myFilter=false&hasPhoto=${hasPhoto}&isExperience=false`;

  const res = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
      Accept: "application/json, text/plain, */*",
      Referer: `https://www.musinsa.com/products/${goodsNo}`,
    },
  });

  if (!res.ok) {
    throw new Error(`무신사 리뷰 API 응답 오류: ${res.status} ${res.statusText}`);
  }

  const body = (await res.json()) as MusinsaReviewListResponse;
  const list = body.data?.list ?? [];

  return list.map((item) => {
    const imageUrls = (item.images ?? []).map((im) => `${IMAGE_CDN_BASE}${im.imageUrl}`);
    return {
      reviewNo: item.no,
      nickname: item.userProfileInfo?.userNickName ?? "익명",
      grade: item.grade ?? null,
      content: item.content ?? "",
      imageUrl: imageUrls[0] ?? null,
      imageUrls,
      likeCount: item.likeCount ?? 0,
      reviewUrl: `https://www.musinsa.com/review/${item.no}`,
      postedAt: item.createDate ?? null,
      productThumbnailUrl: item.goodsThumbnailImageUrl ? `${IMAGE_CDN_BASE}${item.goodsThumbnailImageUrl}` : null,
    };
  });
}

/** pageSize 20 제한을 넘는 개수를 요청하면 여러 페이지로 나눠 이어붙인다. */
async function fetchReviewsUpTo(
  goodsNo: string,
  sort: MusinsaSort,
  limit: number,
  hasPhoto = true
): Promise<TopReview[]> {
  const results: Omit<TopReview, "rank">[] = [];
  let page = 0;
  while (results.length < limit) {
    const pageSize = Math.min(MAX_PAGE_SIZE, limit - results.length);
    const items = await fetchReviewPage(goodsNo, sort, page, pageSize, hasPhoto);
    results.push(...items);
    if (items.length < pageSize) break; // 더 이상 리뷰가 없음
    page += 1;
  }
  return results.map((r, idx) => ({ ...r, rank: idx + 1 }));
}

/**
 * "사진후기만 체크 + 유용한순 정렬" 기준 TOP10 리뷰를 가져온다.
 * 무신사 비공식 내부 API(goods.musinsa.com)를 사용하므로 실제 브라우저와
 * 유사한 헤더를 보내고, 실패 시 예외를 던져 상위 호출부에서 해당 사이클을 스킵하게 한다.
 */
export async function fetchTop10PhotoReviews(goodsNo: string): Promise<TopReview[]> {
  return fetchReviewsUpTo(goodsNo, "up_cnt_desc", 10);
}

/** "사진후기만 체크 + 최신순 정렬" 기준 리뷰 N개를 가져온다 (WORK 화면용). */
export async function fetchLatestPhotoReviews(goodsNo: string, limit: number): Promise<TopReview[]> {
  return fetchReviewsUpTo(goodsNo, "new", limit);
}

/** "사진후기만 체크 + 유용한순 정렬" 기준 리뷰 N개를 가져온다 (WORK 화면용). */
export async function fetchUsefulPhotoReviews(goodsNo: string, limit: number): Promise<TopReview[]> {
  return fetchReviewsUpTo(goodsNo, "up_cnt_desc", limit);
}

/** 사진후기 유용한순 기준 상위 N개에서 review_no -> 순위 매핑을 만든다 (WORK 화면용). */
export async function fetchUsefulRankMap(
  goodsNo: string,
  limit: number
): Promise<Map<number, number>> {
  const reviews = await fetchReviewsUpTo(goodsNo, "up_cnt_desc", limit);
  return new Map(reviews.map((r) => [r.reviewNo, r.rank]));
}

/** 사진후기 최신순 기준 상위 N개에서 review_no -> 순위 매핑을 만든다 (WORK 화면용). */
export async function fetchLatestRankMap(
  goodsNo: string,
  limit: number
): Promise<Map<number, number>> {
  const reviews = await fetchReviewsUpTo(goodsNo, "new", limit);
  return new Map(reviews.map((r) => [r.reviewNo, r.rank]));
}

/**
 * "낮은 평점순" 정렬 기준 리뷰 N개를 가져온다 (WORK 화면용).
 * 이 정렬에서는 사진이 없는 후기도 함께 노출해야 하므로 hasPhoto 필터를 걸지 않는다.
 */
export async function fetchLowRatedReviews(goodsNo: string, limit: number): Promise<TopReview[]> {
  return fetchReviewsUpTo(goodsNo, "goods_est_asc", limit, false);
}
