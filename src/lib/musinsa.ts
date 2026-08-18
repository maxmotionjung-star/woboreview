export interface TopReview {
  reviewNo: number;
  rank: number;
  nickname: string;
  grade: string | null;
  content: string;
  imageUrl: string | null;
  likeCount: number;
  reviewUrl: string;
  postedAt: string | null;
}

const IMAGE_CDN_BASE = "https://image.msscdn.net";

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
    }>;
  };
}

/**
 * "사진후기만 체크 + 유용한순 정렬" 기준 TOP10 리뷰를 가져온다.
 * 무신사 비공식 내부 API(goods.musinsa.com)를 사용하므로 실제 브라우저와
 * 유사한 헤더를 보내고, 실패 시 예외를 던져 상위 호출부에서 해당 사이클을 스킵하게 한다.
 */
export async function fetchTop10PhotoReviews(goodsNo: string): Promise<TopReview[]> {
  const url =
    `https://goods.musinsa.com/api2/review/v1/view/list` +
    `?page=0&pageSize=10&goodsNo=${encodeURIComponent(goodsNo)}` +
    `&sort=up_cnt_desc&myFilter=false&hasPhoto=true&isExperience=false`;

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

  return list.map((item, idx) => ({
    reviewNo: item.no,
    rank: idx + 1,
    nickname: item.userProfileInfo?.userNickName ?? "익명",
    grade: item.grade ?? null,
    content: item.content ?? "",
    imageUrl: item.images?.[0]?.imageUrl ? `${IMAGE_CDN_BASE}${item.images[0].imageUrl}` : null,
    likeCount: item.likeCount ?? 0,
    reviewUrl: `https://www.musinsa.com/review/${item.no}`,
    postedAt: item.createDate ?? null,
  }));
}
